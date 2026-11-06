//! Accounts: each username has its own vault in `accounts/<hash>/`.
//!
//! The directory name is a hash of the normalised username and the name as
//! typed is kept inside the encrypted index. The one plaintext copy is the last
//! username in `prefs.json`, which pre-fills the login form. A vault from before
//! accounts existed (files at the root) is moved into the first account that
//! signs in with its password.
//!
//! ```text
//! <app data>/
//!   prefs.json            plaintext UI preferences (language, theme, login background, last username)
//!   accounts/<hash>/      one vault per account (see vault.rs)
//! ```

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};
use crate::vault::{self, Vault};

const PREFS_FILE: &str = "prefs.json";
const ACCOUNTS_DIR: &str = "accounts";
const MAX_USERNAME: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Pre-fills the login form. The user can forget it from the login screen.
    #[serde(default)]
    pub last_username: Option<String>,
    /// The drawing behind the cast on the login screen.
    #[serde(default = "default_login_backdrop")]
    pub login_backdrop: String,
}

fn default_language() -> String {
    "en".into()
}
fn default_theme() -> String {
    "system".into()
}
fn default_login_backdrop() -> String {
    "mark".into()
}

impl Default for Prefs {
    fn default() -> Self {
        Self { language: default_language(), theme: default_theme(), last_username: None, login_backdrop: default_login_backdrop() }
    }
}

pub struct Accounts {
    root: PathBuf,
}

/// Trimmed, lower-cased, inner whitespace collapsed: "  Yassine " == "yassine".
pub fn normalize_username(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Display form of a username, or an error when it is unusable.
pub fn clean_username(name: &str) -> Result<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let len = name.chars().count();
    if !(2..=MAX_USERNAME).contains(&len) || name.chars().any(char::is_control) {
        return Err(Error::Invalid("username"));
    }
    Ok(name)
}

impl Accounts {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn read_prefs(&self) -> Prefs {
        fs::read(self.root.join(PREFS_FILE))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn write_prefs(&self, prefs: &Prefs) -> Result<()> {
        if !matches!(prefs.language.as_str(), "en" | "fr" | "ar") {
            return Err(Error::Invalid("language"));
        }
        if !matches!(prefs.theme.as_str(), "day" | "light" | "dark" | "system") {
            return Err(Error::Invalid("theme"));
        }
        if !matches!(prefs.login_backdrop.as_str(), "mark" | "lines" | "sky" | "arches" | "dunes" | "zellige" | "medina" | "door") {
            return Err(Error::Invalid("login backdrop"));
        }
        vault::write_atomic(&self.root.join(PREFS_FILE), &serde_json::to_vec_pretty(prefs)?)
    }

    pub fn remember(&self, username: &str) {
        let mut prefs = self.read_prefs();
        prefs.last_username = Some(username.to_string());
        let _ = self.write_prefs(&prefs);
    }

    /// Stops pre-filling the login form with `username`, if it is the one kept.
    pub fn forget(&self, username: &str) {
        let mut prefs = self.read_prefs();
        let kept = prefs.last_username.as_deref().map(normalize_username);
        if kept.as_deref() == Some(normalize_username(username).as_str()) {
            prefs.last_username = None;
            let _ = self.write_prefs(&prefs);
        }
    }

    fn dir_for(&self, username: &str) -> PathBuf {
        let digest = Sha256::digest(normalize_username(username).as_bytes());
        let hex: String = digest.iter().take(16).map(|b| format!("{b:02x}")).collect();
        self.root.join(ACCOUNTS_DIR).join(hex)
    }

    pub fn vault_for(&self, username: &str) -> Vault {
        Vault::new(self.dir_for(username))
    }

    /// A vault created before accounts existed, at the root of the data folder.
    pub fn legacy(&self) -> Option<Vault> {
        let v = Vault::new(self.root.clone());
        v.exists().then_some(v)
    }

    pub fn count(&self) -> usize {
        let accounts = fs::read_dir(self.root.join(ACCOUNTS_DIR))
            .map(|it| it.flatten().filter(|e| e.path().join(vault::HEADER_FILE).is_file()).count())
            .unwrap_or(0);
        accounts + usize::from(self.legacy().is_some())
    }

    /// Moves the legacy root vault into `username`'s account directory.
    pub fn adopt_legacy(&self, username: &str) -> Result<Vault> {
        let target = self.dir_for(username);
        if target.join(vault::HEADER_FILE).exists() {
            return Err(Error::VaultExists);
        }
        fs::create_dir_all(&target)?;
        for name in [vault::NOTES_DIR, vault::ATTACHMENTS_DIR, vault::INDEX_FILE] {
            let from = self.root.join(name);
            if from.exists() {
                fs::rename(&from, target.join(name))?;
            }
        }
        // The header moves last: until then the legacy vault stays complete.
        fs::rename(self.root.join(vault::HEADER_FILE), target.join(vault::HEADER_FILE))?;
        Ok(Vault::new(target))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usernames_normalise_and_validate() {
        assert_eq!(normalize_username("  Yassine   Chelly "), "yassine chelly");
        assert_eq!(clean_username("  Yassine   Chelly ").unwrap(), "Yassine Chelly");
        assert!(clean_username("a").is_err());
        assert!(clean_username(&"x".repeat(41)).is_err());
        assert!(clean_username("ياسين").is_ok());
    }

    #[test]
    fn same_user_same_dir_regardless_of_case() {
        let a = Accounts::new(PathBuf::from("root"));
        assert_eq!(a.dir_for("Yassine"), a.dir_for(" yassine "));
        assert_ne!(a.dir_for("yassine"), a.dir_for("yasmine"));
    }

    #[test]
    fn forget_clears_only_the_matching_username() {
        let dir = tempfile::tempdir().unwrap();
        let a = Accounts::new(dir.path().to_path_buf());
        a.remember("Yassine");
        a.forget("someone else");
        assert_eq!(a.read_prefs().last_username.as_deref(), Some("Yassine"));
        a.forget(" yassine ");
        assert_eq!(a.read_prefs().last_username, None);
    }

    #[test]
    fn prefs_from_an_older_version_get_the_default_backdrop() {
        let prefs: Prefs = serde_json::from_str(r#"{"language":"ar","theme":"dark"}"#).unwrap();
        assert_eq!(prefs.login_backdrop, "mark");
        assert_eq!(prefs.language, "ar");
    }

    #[test]
    fn only_known_backdrops_are_saved() {
        let dir = tempfile::tempdir().unwrap();
        let a = Accounts::new(dir.path().to_path_buf());
        let mut prefs = Prefs { login_backdrop: "door".into(), ..Prefs::default() };
        a.write_prefs(&prefs).unwrap();
        assert_eq!(a.read_prefs().login_backdrop, "door");
        prefs.login_backdrop = "../../evil".into();
        assert!(a.write_prefs(&prefs).is_err());
    }

    #[test]
    fn legacy_vault_is_adopted() {
        let dir = tempfile::tempdir().unwrap();
        let a = Accounts::new(dir.path().to_path_buf());
        fs::write(dir.path().join(vault::HEADER_FILE), b"{}").unwrap();
        fs::create_dir_all(dir.path().join(vault::NOTES_DIR)).unwrap();
        fs::write(dir.path().join(vault::NOTES_DIR).join("n.tdw"), b"x").unwrap();
        assert_eq!(a.count(), 1);
        let v = a.adopt_legacy("Yassine").unwrap();
        assert!(v.exists());
        assert!(a.legacy().is_none());
        assert!(v.dir().join(vault::NOTES_DIR).join("n.tdw").exists());
        assert_eq!(a.count(), 1);
    }
}
