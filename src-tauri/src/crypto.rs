//! Cryptographic primitives.
//!
//! - Key derivation: Argon2id (password or recovery key -> 32-byte wrapping key).
//! - Encryption: XChaCha20-Poly1305 with a random 24-byte nonce per message.
//! - Every ciphertext is bound to a context string through the AEAD associated
//!   data, so an encrypted file cannot be swapped for another one unnoticed.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::error::{Error, Result};

pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const MAGIC: &[u8; 4] = b"TDW1";

pub type Key = Zeroizing<[u8; KEY_LEN]>;

/// Argon2id cost parameters, stored next to the salt so they can be raised later.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct KdfParams {
    /// Memory cost in KiB.
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
}

impl Default for KdfParams {
    /// 64 MiB, 3 passes, 1 lane: above the OWASP 2024 minimum for Argon2id.
    fn default() -> Self {
        Self { m_cost: 64 * 1024, t_cost: 3, p_cost: 1 }
    }
}

pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    OsRng.fill_bytes(&mut out);
    out
}

pub fn random_key() -> Key {
    Zeroizing::new(random_bytes::<KEY_LEN>())
}

pub fn derive_key(secret: &[u8], salt: &[u8], params: KdfParams) -> Result<Key> {
    let params = Params::new(params.m_cost, params.t_cost, params.p_cost, Some(KEY_LEN))
        .map_err(|_| Error::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(secret, salt, out.as_mut())
        .map_err(|_| Error::Crypto)?;
    Ok(out)
}

/// Encrypts `plaintext` under `key`. Output layout: MAGIC | nonce | ciphertext+tag.
pub fn seal(key: &Key, context: &str, plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    let nonce = random_bytes::<NONCE_LEN>();
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad: aad(context).as_bytes() })
        .map_err(|_| Error::Crypto)?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypts data produced by [`seal`]. Fails if the key, context or bytes are wrong.
pub fn open(key: &Key, context: &str, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if sealed.len() < MAGIC.len() + NONCE_LEN || &sealed[..MAGIC.len()] != MAGIC {
        return Err(Error::Corrupted);
    }
    let (nonce, ciphertext) = sealed[MAGIC.len()..].split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: ciphertext, aad: aad(context).as_bytes() })
        .map(Zeroizing::new)
        .map_err(|_| Error::Decrypt)
}

fn aad(context: &str) -> String {
    format!("tadween:v1:{context}")
}

/// Crockford base32 without I, L, O, U: unambiguous when written by hand.
const RECOVERY_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_GROUPS: usize = 6;
const RECOVERY_GROUP_LEN: usize = 4;

/// A 120-bit recovery key formatted as `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
pub fn generate_recovery_key() -> Zeroizing<String> {
    let mut raw = Zeroizing::new([0u8; RECOVERY_GROUPS * RECOVERY_GROUP_LEN]);
    OsRng.fill_bytes(raw.as_mut());
    let mut out = String::with_capacity(RECOVERY_GROUPS * (RECOVERY_GROUP_LEN + 1));
    for (i, byte) in raw.iter().enumerate() {
        if i > 0 && i % RECOVERY_GROUP_LEN == 0 {
            out.push('-');
        }
        out.push(RECOVERY_ALPHABET[(byte & 0x1f) as usize] as char);
    }
    Zeroizing::new(out)
}

/// Normalises what the user typed: case, separators, and look-alike letters.
pub fn normalize_recovery_key(input: &str) -> Option<Zeroizing<String>> {
    let mut out = Zeroizing::new(String::with_capacity(RECOVERY_GROUPS * RECOVERY_GROUP_LEN));
    for c in input.chars() {
        let c = match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            ' ' | '-' | '\t' | '\n' | '\r' => continue,
            c => c,
        };
        if !c.is_ascii() || !RECOVERY_ALPHABET.contains(&(c as u8)) {
            return None;
        }
        out.push(c);
    }
    (out.len() == RECOVERY_GROUPS * RECOVERY_GROUP_LEN).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fast() -> KdfParams {
        KdfParams { m_cost: 1024, t_cost: 1, p_cost: 1 }
    }

    #[test]
    fn seal_roundtrip_and_context_binding() {
        let key = random_key();
        let sealed = seal(&key, "note:a", b"hello").unwrap();
        assert_eq!(open(&key, "note:a", &sealed).unwrap().as_slice(), b"hello");
        assert!(matches!(open(&key, "note:b", &sealed), Err(Error::Decrypt)));
        assert!(matches!(open(&random_key(), "note:a", &sealed), Err(Error::Decrypt)));
    }

    #[test]
    fn tampering_is_detected() {
        let key = random_key();
        let mut sealed = seal(&key, "x", b"hello").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(open(&key, "x", &sealed).is_err());
    }

    #[test]
    fn kdf_is_deterministic_per_salt() {
        let salt = random_bytes::<SALT_LEN>();
        let a = derive_key(b"pw", &salt, fast()).unwrap();
        let b = derive_key(b"pw", &salt, fast()).unwrap();
        let c = derive_key(b"pw", &random_bytes::<SALT_LEN>(), fast()).unwrap();
        assert_eq!(*a, *b);
        assert_ne!(*a, *c);
    }

    #[test]
    fn recovery_key_format_and_normalisation() {
        let key = generate_recovery_key();
        assert_eq!(key.len(), 29);
        let typed = key.to_lowercase().replace('-', " ");
        assert_eq!(normalize_recovery_key(&typed).unwrap().as_str(), key.replace('-', ""));
        assert!(normalize_recovery_key("too-short").is_none());
    }
}
