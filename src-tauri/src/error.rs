use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, Error>;

/// Errors crossing into the UI. Messages never contain secrets or note content.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("No vault exists yet")]
    NoVault,
    #[error("A vault already exists")]
    VaultExists,
    #[error("The vault is locked")]
    Locked,
    #[error("Wrong password")]
    WrongPassword,
    #[error("Wrong recovery key")]
    WrongRecoveryKey,
    #[error("Too many attempts")]
    Throttled { retry_after_ms: u64 },
    #[error("Password is too weak")]
    WeakPassword,
    #[error("Not found")]
    NotFound,
    #[error("Invalid input: {0}")]
    Invalid(&'static str),
    #[error("Data could not be decrypted")]
    Decrypt,
    #[error("Data file is damaged")]
    Corrupted,
    #[error("Encryption failure")]
    Crypto,
    #[error("Storage error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error")]
    Json(#[from] serde_json::Error),
    #[error("No microphone is available")]
    Microphone,
    #[error("The speech model is missing or damaged")]
    SpeechModel,
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Error::NoVault => "no_vault",
            Error::VaultExists => "vault_exists",
            Error::Locked => "locked",
            Error::WrongPassword => "wrong_password",
            Error::WrongRecoveryKey => "wrong_recovery_key",
            Error::Throttled { .. } => "throttled",
            Error::WeakPassword => "weak_password",
            Error::NotFound => "not_found",
            Error::Invalid(_) => "invalid",
            Error::Decrypt => "decrypt",
            Error::Corrupted => "corrupted",
            Error::Crypto => "crypto",
            Error::Io(_) => "io",
            Error::Json(_) => "json",
            Error::Microphone => "microphone",
            Error::SpeechModel => "speech_model",
        }
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("Error", 3)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        let retry = match self {
            Error::Throttled { retry_after_ms } => Some(*retry_after_ms),
            _ => None,
        };
        s.serialize_field("retryAfterMs", &retry)?;
        s.end()
    }
}
