mod accounts;
mod crypto;
mod dictation;
mod error;
mod text;
mod transfer;
mod vault;

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use zeroize::Zeroizing;

use accounts::{Accounts, Prefs};
use dictation::{Dictation, Language};
use error::{Error, Result};
use vault::{
    Folder, ImportNote, NewNote, Note, NotePatch, NoteSummary, SearchHit, Session, SettingsPatch, UnlockReport, Vault,
    VaultSettings,
};

/// Event sent to the UI when the vault locks itself.
const LOCKED_EVENT: &str = "vault-locked";

/// The vault that is open right now, and its account directory.
struct Open {
    vault: Vault,
    session: Session,
}

struct AppState {
    accounts: Accounts,
    open: Mutex<Option<Open>>,
    last_activity: Mutex<Instant>,
    throttle: Mutex<Throttle>,
    dictation: Dictation,
}

/// Slows down password guessing: after 3 misses, each attempt waits
/// 1 s, 2 s, 4 s ... up to 60 s.
#[derive(Default)]
struct Throttle {
    failures: u32,
    next_allowed: Option<Instant>,
}

impl Throttle {
    fn check(&self) -> Result<()> {
        match self.next_allowed {
            Some(t) if t > Instant::now() => {
                Err(Error::Throttled { retry_after_ms: (t - Instant::now()).as_millis() as u64 + 1 })
            }
            _ => Ok(()),
        }
    }

    fn fail(&mut self) -> Option<u64> {
        self.failures += 1;
        if self.failures < 3 {
            return None;
        }
        let ms = (1000u64 << (self.failures - 3).min(6)).min(60_000);
        self.next_allowed = Some(Instant::now() + Duration::from_millis(ms));
        Some(ms)
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl AppState {
    fn touch(&self) {
        *lock(&self.last_activity) = Instant::now();
    }

    fn with_session<T>(&self, f: impl FnOnce(&mut Session, &Vault) -> Result<T>) -> Result<T> {
        let mut guard = lock(&self.open);
        let open = guard.as_mut().ok_or(Error::Locked)?;
        self.touch();
        f(&mut open.session, &open.vault)
    }

    /// Wrong passwords count toward the throttle; success resets it.
    fn throttled<T>(&self, attempt: impl FnOnce() -> Result<T>) -> Result<T> {
        lock(&self.throttle).check()?;
        match attempt() {
            Ok(v) => {
                lock(&self.throttle).reset();
                Ok(v)
            }
            Err(e @ (Error::WrongPassword | Error::WrongRecoveryKey)) => match lock(&self.throttle).fail() {
                Some(retry_after_ms) => Err(Error::Throttled { retry_after_ms }),
                None => Err(e),
            },
            Err(e) => Err(e),
        }
    }

    fn open_session(&self, vault: Vault, session: Session, username: &str) {
        self.accounts.remember(username);
        *lock(&self.open) = Some(Open { vault, session });
        self.touch();
    }

    /// Finds the vault for `username`, falling back to a legacy single vault
    /// (which is adopted by this account once the password proves it).
    fn sign_in(
        &self,
        username: &str,
        attempt: impl Fn(&Vault) -> Result<(Session, UnlockReport)>,
    ) -> Result<UnlockReport> {
        let username = accounts::clean_username(username).map_err(|_| Error::WrongPassword)?;
        let vault = self.accounts.vault_for(&username);
        let (vault, mut session, mut report) = if vault.exists() {
            let (s, r) = attempt(&vault)?;
            (vault, s, r)
        } else if let Some(legacy) = self.accounts.legacy() {
            let (s, r) = attempt(&legacy)?;
            let adopted = self.accounts.adopt_legacy(&username)?;
            (adopted, s, r)
        } else {
            // Same cost as a real attempt, so timing does not reveal which
            // usernames exist.
            let _ = crypto::derive_key(b"tadween", &[0u8; crypto::SALT_LEN], crypto::KdfParams::default());
            return Err(Error::WrongPassword);
        };
        if session.username().is_empty() {
            session.set_username(&vault, &username)?;
            report.username = username.clone();
        }
        let display = session.username().to_string();
        self.open_session(vault, session, &display);
        Ok(report)
    }
}

// ── Status and preferences ───────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    /// Number of accounts on this computer (a legacy vault counts as one).
    accounts: usize,
    unlocked: bool,
    username: Option<String>,
    display_name: Option<String>,
    prefs: Prefs,
}

#[tauri::command]
async fn status(state: State<'_, AppState>) -> Result<Status> {
    let open = lock(&state.open);
    Ok(Status {
        accounts: state.accounts.count(),
        unlocked: open.is_some(),
        username: open.as_ref().map(|o| o.session.username().to_string()),
        display_name: open.as_ref().map(|o| o.session.display_name().to_string()),
        prefs: state.accounts.read_prefs(),
    })
}

#[tauri::command]
async fn prefs_set(state: State<'_, AppState>, prefs: Prefs) -> Result<Prefs> {
    state.accounts.write_prefs(&prefs)?;
    Ok(prefs)
}

// ── Accounts and locking ─────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Created {
    recovery_key: String,
}

#[tauri::command]
async fn vault_create(state: State<'_, AppState>, username: String, password: String) -> Result<Created> {
    let password = Zeroizing::new(password);
    let username = accounts::clean_username(&username)?;
    let vault = state.accounts.vault_for(&username);
    if vault.exists() {
        return Err(Error::VaultExists);
    }
    let (session, recovery_key) = vault.create(&username, &password)?;
    state.open_session(vault, session, &username);
    Ok(Created { recovery_key: recovery_key.to_string() })
}

#[tauri::command]
async fn vault_unlock(state: State<'_, AppState>, username: String, password: String) -> Result<UnlockReport> {
    let password = Zeroizing::new(password);
    state.throttled(|| state.sign_in(&username, |v| v.unlock(&password)))
}

#[tauri::command]
async fn vault_recover(
    state: State<'_, AppState>,
    username: String,
    recovery_key: String,
    new_password: String,
) -> Result<UnlockReport> {
    let recovery_key = Zeroizing::new(recovery_key);
    let new_password = Zeroizing::new(new_password);
    state.throttled(|| {
        state.sign_in(&username, |v| v.recover(&recovery_key, &new_password)).map_err(|e| match e {
            // An unknown username looks like a wrong key, not a wrong password.
            Error::WrongPassword => Error::WrongRecoveryKey,
            e => e,
        })
    })
}

impl AppState {
    /// Runs a password-checked operation on the open vault, under the throttle.
    fn checked<T>(&self, op: impl FnOnce(&Vault) -> Result<T>) -> Result<T> {
        let guard = lock(&self.open);
        let open = guard.as_ref().ok_or(Error::Locked)?;
        let result = self.throttled(|| op(&open.vault));
        if result.is_ok() {
            self.touch();
        }
        result
    }
}

#[tauri::command]
async fn vault_change_password(state: State<'_, AppState>, current: String, next: String) -> Result<()> {
    let (current, next) = (Zeroizing::new(current), Zeroizing::new(next));
    state.checked(|v| v.change_password(&current, &next))
}

#[tauri::command]
async fn vault_new_recovery_key(state: State<'_, AppState>, password: String) -> Result<Created> {
    let password = Zeroizing::new(password);
    let key = state.checked(|v| v.regenerate_recovery_key(&password))?;
    Ok(Created { recovery_key: key.to_string() })
}

/// Erases the open account and everything in it. The password is asked for
/// again, whoever is at the keyboard now: an unlocked screen is not consent.
#[tauri::command]
async fn account_delete(state: State<'_, AppState>, password: String) -> Result<()> {
    let password = Zeroizing::new(password);
    let mut open = lock(&state.open);
    let current = open.as_ref().ok_or(Error::Locked)?;
    state.throttled(|| current.vault.verify_password(&password))?;
    state.dictation.stop();
    let username = current.session.username().to_string();
    current.vault.destroy()?;
    *open = None;
    state.accounts.forget(&username);
    Ok(())
}

#[tauri::command]
async fn vault_lock(state: State<'_, AppState>) -> Result<()> {
    state.dictation.stop();
    *lock(&state.open) = None;
    Ok(())
}

#[tauri::command]
async fn activity(state: State<'_, AppState>) -> Result<()> {
    if lock(&state.open).is_some() {
        state.touch();
    }
    Ok(())
}

#[tauri::command]
async fn profile_set(state: State<'_, AppState>, display_name: String) -> Result<String> {
    state.with_session(|s, v| s.set_display_name(v, &display_name))
}

#[tauri::command]
async fn settings_get(state: State<'_, AppState>) -> Result<VaultSettings> {
    state.with_session(|s, _| Ok(s.settings()))
}

#[tauri::command]
async fn settings_set(state: State<'_, AppState>, settings: SettingsPatch) -> Result<VaultSettings> {
    state.with_session(|s, v| s.set_settings(v, settings))
}

// ── Notes and folders ────────────────────────────────────────────────────────

#[tauri::command]
async fn notes_list(state: State<'_, AppState>) -> Result<Vec<NoteSummary>> {
    state.with_session(|s, _| Ok(s.list()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Everything {
    notes: Vec<Note>,
    folders: Vec<Folder>,
}

/// Every note in full, for exports.
#[tauri::command]
async fn notes_export(state: State<'_, AppState>) -> Result<Everything> {
    state.with_session(|s, _| Ok(Everything { notes: s.all_notes(), folders: s.folders() }))
}

#[tauri::command]
async fn notes_import(state: State<'_, AppState>, notes: Vec<ImportNote>) -> Result<usize> {
    state.with_session(|s, v| s.import(v, notes))
}

#[tauri::command]
async fn note_get(state: State<'_, AppState>, id: String) -> Result<Note> {
    state.with_session(|s, _| s.get(&id))
}

#[tauri::command]
async fn note_create(state: State<'_, AppState>, note: NewNote) -> Result<Note> {
    state.with_session(|s, v| s.create(v, note))
}

#[tauri::command]
async fn note_update(state: State<'_, AppState>, id: String, patch: NotePatch) -> Result<NoteSummary> {
    state.with_session(|s, v| s.update(v, &id, patch))
}

#[tauri::command]
async fn note_duplicate(state: State<'_, AppState>, id: String) -> Result<Note> {
    state.with_session(|s, v| s.duplicate(v, &id))
}

#[tauri::command]
async fn note_trash(state: State<'_, AppState>, id: String) -> Result<NoteSummary> {
    state.with_session(|s, v| s.set_trashed(v, &id, true))
}

#[tauri::command]
async fn note_restore(state: State<'_, AppState>, id: String) -> Result<NoteSummary> {
    state.with_session(|s, v| s.set_trashed(v, &id, false))
}

#[tauri::command]
async fn note_delete(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_session(|s, v| s.delete(v, &id))
}

#[tauri::command]
async fn trash_empty(state: State<'_, AppState>) -> Result<usize> {
    state.with_session(|s, v| s.empty_trash(v))
}

#[tauri::command]
async fn search(state: State<'_, AppState>, query: String) -> Result<Vec<SearchHit>> {
    state.with_session(|s, _| Ok(s.search(&query, 50)))
}

#[tauri::command]
async fn folders_list(state: State<'_, AppState>) -> Result<Vec<Folder>> {
    state.with_session(|s, _| Ok(s.folders()))
}

#[tauri::command]
async fn folder_create(state: State<'_, AppState>, name: String) -> Result<Folder> {
    state.with_session(|s, v| s.create_folder(v, &name))
}

#[tauri::command]
async fn folder_rename(state: State<'_, AppState>, id: String, name: String) -> Result<Folder> {
    state.with_session(|s, v| s.rename_folder(v, &id, &name))
}

#[tauri::command]
async fn folder_pin(state: State<'_, AppState>, id: String, pinned: bool) -> Result<Folder> {
    state.with_session(|s, v| s.pin_folder(v, &id, pinned))
}

#[tauri::command]
async fn folder_delete(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_session(|s, v| s.delete_folder(v, &id))
}

// ── Files: images, PDFs, import, export ──────────────────────────────────────

fn file_name(path: &std::path::Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Stores a PDF chosen in the webview's own file picker. The bytes arrive as
/// the raw request body, so large files skip JSON encoding.
#[tauri::command]
async fn attachment_add(request: tauri::ipc::Request<'_>, state: State<'_, AppState>) -> Result<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Invalid("body"));
    };
    if !bytes.windows(4).take(1024).any(|w| w == b"%PDF") {
        return Err(Error::Invalid("not a pdf"));
    }
    let bytes = Zeroizing::new(bytes.clone());
    state.with_session(|s, v| s.add_attachment(v, &bytes))
}

/// Raw bytes of an attachment, delivered as an ArrayBuffer.
#[tauri::command]
async fn attachment_read(state: State<'_, AppState>, id: String) -> Result<Response> {
    let bytes = state.with_session(|s, v| s.read_attachment(v, &id))?;
    Ok(Response::new(bytes.to_vec()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportBundle {
    source: String,
    files: Vec<transfer::ImportFile>,
}

/// Lets the user pick a folder (`mode = "folder"`) or zip files (`"zip"`) and reads them.
#[tauri::command]
async fn import_pick(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    mode: String,
) -> Result<Option<ImportBundle>> {
    if lock(&state.open).is_none() {
        return Err(Error::Locked);
    }
    let dialog = app.dialog().file().set_parent(&window);
    let (source, raw) = if mode == "folder" {
        let Some(dir) = dialog.blocking_pick_folder() else { return Ok(None) };
        let dir = dir.into_path().map_err(|_| Error::Invalid("folder"))?;
        (file_name(&dir), transfer::read_folder(&dir)?)
    } else if mode == "files" {
        let filter = ["csv", "tsv", "xlsx", "xlsm", "xlsb", "xls", "ods", "md", "markdown", "txt", "html", "htm"];
        let Some(files) = dialog.add_filter("Spreadsheets and pages", &filter).blocking_pick_files() else { return Ok(None) };
        let mut raw = Vec::new();
        let mut names = Vec::new();
        for f in files {
            let Ok(path) = f.into_path() else { continue };
            let name = file_name(&path);
            raw.push(transfer::RawFile { bytes: std::fs::read(&path)?, path: name.clone() });
            names.push(name);
        }
        (names.join(", "), raw)
    } else {
        let Some(files) = dialog.add_filter("Zip", &["zip"]).blocking_pick_files() else { return Ok(None) };
        let mut raw = Vec::new();
        let mut names = Vec::new();
        for f in files {
            let Ok(path) = f.into_path() else { continue };
            names.push(file_name(&path));
            raw.extend(transfer::read_zip(&path)?);
        }
        (names.join(", "), raw)
    };
    let files = transfer::classify(raw, |bytes| state.with_session(|s, v| s.add_attachment(v, bytes)))?;
    Ok(Some(ImportBundle { source, files }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Exported {
    path: String,
    /// Attachments that could not be read and are not in the archive.
    missing: usize,
}

/// Asks where to save, then writes the archive. Returns None if cancelled.
#[tauri::command]
async fn export_save(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    file_name: String,
    entries: Vec<transfer::ExportEntry>,
) -> Result<Option<Exported>> {
    if lock(&state.open).is_none() {
        return Err(Error::Locked);
    }
    let Some(target) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&file_name)
        .add_filter("Zip", &["zip"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let target = target.into_path().map_err(|_| Error::Invalid("path"))?;
    let missing = transfer::write_zip(&target, &entries, |id| {
        state.with_session(|s, v| s.read_attachment(v, id).map(|b| b.to_vec()))
    })?;
    Ok(Some(Exported { path: target.to_string_lossy().into_owned(), missing }))
}

/// Only what a browser or a mail program should receive: a note could hold
/// any other scheme, and those can start programs.
fn is_web_link(url: &str) -> bool {
    let scheme = url.split(':').next().unwrap_or("").to_ascii_lowercase();
    url.contains(':') && matches!(scheme.as_str(), "http" | "https" | "mailto")
}

/// Opens a link from a note in the default browser, when the writer asks.
#[tauri::command]
async fn open_link(app: AppHandle, url: String) -> Result<()> {
    if !is_web_link(&url) {
        return Err(Error::Invalid("link"));
    }
    app.opener().open_url(url, None::<&str>).map_err(|_| Error::Invalid("link"))
}

// ── Dictation ────────────────────────────────────────────────────────────────

/// Opens the microphone and starts transcribing; results arrive as `dictation`
/// events. Loads the speech model on first use, off the main thread.
#[tauri::command]
async fn dictation_start(app: AppHandle, language: Language) -> Result<u64> {
    if lock(&app.state::<AppState>().open).is_none() {
        return Err(Error::Locked);
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || handle.state::<AppState>().dictation.start(handle.clone(), language))
        .await
        .map_err(|_| Error::SpeechModel)?
}

#[tauri::command]
async fn dictation_stop(state: State<'_, AppState>) -> Result<()> {
    state.dictation.stop();
    Ok(())
}

/// Loads the speech model ahead of time so the first dictation starts at once.
#[tauri::command]
async fn dictation_prepare(app: AppHandle, language: Language) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || app.state::<AppState>().dictation.engine(language).map(|_| ()))
        .await
        .map_err(|_| Error::SpeechModel)?
}

// ── Auto-lock ────────────────────────────────────────────────────────────────

fn spawn_auto_lock(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let state = app.state::<AppState>();
        // Speaking counts as activity, a forgotten open microphone does not.
        let idle = lock(&state.last_activity).elapsed().min(state.dictation.silence());
        let mut open = lock(&state.open);
        let limit = match open.as_ref() {
            Some(o) if o.session.settings().auto_lock_minutes > 0 => {
                Duration::from_secs(u64::from(o.session.settings().auto_lock_minutes) * 60)
            }
            _ => continue,
        };
        if idle >= limit {
            state.dictation.stop();
            *open = None;
            drop(open);
            let _ = app.emit(LOCKED_EVENT, "idle");
        }
    });
}

/// Opens at a comfortable size that always fits the screen's work area
/// (laptops with scaling often have less room than the configured size).
fn fit_to_screen(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size.to_logical::<f64>(scale);
    let width = (area.width * 0.86).clamp(880.0, 1180.0).min(area.width);
    let height = (area.height * 0.86).clamp(560.0, 760.0).min(area.height);
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
    let _ = window.center();
}

/// `%APPDATA%\com.tadween.app`, or `TADWEEN_DATA_DIR` when set (tests, portable use).
fn data_dir(app: &AppHandle) -> PathBuf {
    if let Some(dir) = std::env::var_os("TADWEEN_DATA_DIR") {
        return PathBuf::from(dir);
    }
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".tadween"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = data_dir(app.handle());
            std::fs::create_dir_all(&dir)?;
            app.manage(AppState {
                accounts: Accounts::new(dir),
                open: Mutex::new(None),
                last_activity: Mutex::new(Instant::now()),
                throttle: Mutex::new(Throttle::default()),
                dictation: Dictation::new(dictation::models_dir(app.path().resource_dir().ok())),
            });
            spawn_auto_lock(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                fit_to_screen(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            status,
            prefs_set,
            vault_create,
            vault_unlock,
            vault_recover,
            vault_change_password,
            vault_new_recovery_key,
            account_delete,
            vault_lock,
            activity,
            profile_set,
            settings_get,
            settings_set,
            notes_list,
            notes_export,
            notes_import,
            note_get,
            note_create,
            note_update,
            note_duplicate,
            note_trash,
            note_restore,
            note_delete,
            trash_empty,
            search,
            folders_list,
            folder_create,
            folder_rename,
            folder_pin,
            folder_delete,
            attachment_add,
            attachment_read,
            import_pick,
            export_save,
            open_link,
            dictation_start,
            dictation_stop,
            dictation_prepare,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tadween");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn throttle_backs_off_after_three_failures() {
        let mut t = Throttle::default();
        assert_eq!(t.fail(), None);
        assert_eq!(t.fail(), None);
        assert_eq!(t.fail(), Some(1000));
        assert!(matches!(t.check(), Err(Error::Throttled { .. })));
        assert_eq!(t.fail(), Some(2000));
        for _ in 0..10 {
            t.fail();
        }
        assert_eq!(t.fail(), Some(60_000));
        t.reset();
        assert!(t.check().is_ok());
    }

    #[test]
    fn only_web_and_mail_links_are_opened() {
        for ok in ["https://example.com", "HTTP://example.com", "mailto:a@b.c"] {
            assert!(is_web_link(ok), "{ok}");
        }
        for bad in ["file:///c:/windows/system32/calc.exe", "javascript:alert(1)", "ms-settings:", "C:\\x.exe", "example"] {
            assert!(!is_web_link(bad), "{bad}");
        }
    }

    fn state(dir: &std::path::Path) -> AppState {
        AppState {
            accounts: Accounts::new(dir.to_path_buf()),
            open: Mutex::new(None),
            last_activity: Mutex::new(Instant::now()),
            throttle: Mutex::new(Throttle::default()),
            dictation: Dictation::new(dir.join("speech")),
        }
    }

    #[test]
    fn unknown_user_and_wrong_password_look_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let st = state(dir.path());
        let v = st.accounts.vault_for("Yassine");
        v.create("Yassine", "tadween26").unwrap();
        assert!(matches!(st.sign_in("nobody", |v| v.unlock("tadween26")), Err(Error::WrongPassword)));
        assert!(matches!(st.sign_in("yassine", |v| v.unlock("nope-nope1")), Err(Error::WrongPassword)));
        let report = st.sign_in("  YASSINE ", |v| v.unlock("tadween26")).unwrap();
        assert_eq!(report.username, "Yassine");
        assert_eq!(st.accounts.read_prefs().last_username.as_deref(), Some("Yassine"));
    }

    #[test]
    fn deleting_an_account_needs_the_password_and_leaves_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let st = state(dir.path());
        for name in ["Yassine", "Sara"] {
            let (session, _) = st.accounts.vault_for(name).create(name, "tadween26").unwrap();
            st.open_session(st.accounts.vault_for(name), session, name);
        }
        assert_eq!(st.accounts.count(), 2);
        {
            let open = lock(&st.open);
            let current = open.as_ref().unwrap();
            assert!(matches!(current.vault.verify_password("wrong-pass1"), Err(Error::WrongPassword)));
            current.vault.destroy().unwrap();
        }
        st.accounts.forget("Sara");
        assert_eq!(st.accounts.count(), 1);
        assert!(st.accounts.vault_for("Yassine").exists());
        assert!(!st.accounts.vault_for("Sara").exists());
        assert_eq!(st.accounts.read_prefs().last_username, None);
    }

    #[test]
    fn legacy_vault_moves_into_the_first_account() {
        let dir = tempfile::tempdir().unwrap();
        let st = state(dir.path());
        let legacy = Vault::new(dir.path().to_path_buf());
        legacy.create("", "tadween26").unwrap();
        assert_eq!(st.accounts.count(), 1);
        // A wrong password must leave the legacy vault where it is.
        assert!(st.sign_in("Yassine", |v| v.unlock("wrong-pass1")).is_err());
        assert!(st.accounts.legacy().is_some());
        let report = st.sign_in("Yassine", |v| v.unlock("tadween26")).unwrap();
        assert_eq!(report.username, "Yassine");
        assert!(st.accounts.legacy().is_none());
        assert!(st.accounts.vault_for("yassine").exists());
    }
}
