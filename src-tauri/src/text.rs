//! Text helpers: password policy, search normalisation, previews and snippets.

/// The password rule shared with the UI (`src/lib/password.ts`):
/// at least 8 characters mixing 2 kinds (letters, digits, symbols…),
/// or a passphrase of 12+ characters.
pub fn password_is_strong(password: &str) -> bool {
    if COMMON_PASSWORDS.contains(&password.to_lowercase().as_str()) {
        return false;
    }
    let len = password.chars().count();
    if len < 8 {
        return false;
    }
    let first = password.chars().next();
    if password.chars().all(|c| Some(c) == first) {
        return false;
    }
    if len >= 12 {
        return true;
    }
    let classes = [
        password.chars().any(|c| c.is_lowercase()),
        password.chars().any(|c| c.is_uppercase()),
        password.chars().any(|c| c.is_numeric()),
        password.chars().any(|c| !c.is_alphanumeric()),
        // Arabic and other uncased scripts count as their own class.
        password.chars().any(|c| c.is_alphabetic() && !c.is_lowercase() && !c.is_uppercase()),
    ];
    classes.iter().filter(|x| **x).count() >= 2
}

/// Refused outright, whatever their length (mirrored in the UI).
const COMMON_PASSWORDS: &[&str] = &[
    "password",
    "password1",
    "password12",
    "password123",
    "motdepasse",
    "motdepasse1",
    "azertyuiop",
    "azerty123",
    "azerty1234",
    "qwertyuiop",
    "qwerty123",
    "qwerty1234",
    "12345678",
    "123456789",
    "1234567890",
    "0123456789",
    "iloveyou",
    "iloveyou1",
    "admin123",
    "admin1234",
    "admin12345",
    "letmein123",
    "tadween1",
    "tadween123",
    "abc12345",
    "abcd1234",
];

/// Folds text for matching: lower case, no Latin accents, no Arabic diacritics,
/// tatweel removed, and common Arabic letter variants unified.
pub fn normalize(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            // Arabic harakat, tanween, shadda, sukun, superscript alef, tatweel.
            '\u{064B}'..='\u{065F}' | '\u{0670}' | '\u{0640}' => {}
            'أ' | 'إ' | 'آ' | 'ٱ' => out.push('ا'),
            'ى' => out.push('ي'),
            'ة' => out.push('ه'),
            'ؤ' => out.push('و'),
            'ئ' => out.push('ي'),
            _ => {
                for lower in c.to_lowercase() {
                    out.push(fold_latin(lower));
                }
            }
        }
    }
    out
}

fn fold_latin(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        'œ' => 'o',
        'æ' => 'a',
        _ => c,
    }
}

/// First `max` characters of the text, on one line.
pub fn preview(text: &str, max: usize) -> String {
    let mut out = String::new();
    let mut count = 0;
    let mut last_space = true;
    for c in text.chars() {
        if count >= max {
            out.push('…');
            break;
        }
        if c.is_whitespace() {
            if !last_space {
                out.push(' ');
                count += 1;
            }
            last_space = true;
        } else {
            out.push(c);
            count += 1;
            last_space = false;
        }
    }
    out.trim_end().to_string()
}

pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Returns a short excerpt of `text` around the first match of `needle`
/// (already normalised), or `None` if it does not occur.
pub fn snippet(text: &str, needle: &str, radius: usize) -> Option<String> {
    // Map each normalised character back to its source character index.
    let source: Vec<char> = text.chars().collect();
    let mut folded = String::new();
    let mut origin: Vec<usize> = Vec::new();
    for (i, c) in source.iter().enumerate() {
        let n = normalize(&c.to_string());
        for fc in n.chars() {
            folded.push(fc);
            origin.push(i);
        }
    }
    let byte_pos = folded.find(needle)?;
    let char_pos = folded[..byte_pos].chars().count();
    let start_src = origin[char_pos];
    let end_src = origin
        .get(char_pos + needle.chars().count().saturating_sub(1))
        .copied()
        .unwrap_or(start_src);
    let from = start_src.saturating_sub(radius);
    let to = (end_src + 1 + radius).min(source.len());
    let mut s: String = source[from..to].iter().collect();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if from > 0 {
        s.insert(0, '…');
    }
    if to < source.len() {
        s.push('…');
    }
    Some(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_policy() {
        assert!(!password_is_strong("short1A"));
        assert!(!password_is_strong("aaaaaaaaaaaaaaaaaaaa"));
        assert!(!password_is_strong("lowercase"));
        assert!(password_is_strong("tadween26"));
        assert!(!password_is_strong("Password1"));
        assert!(password_is_strong("alllowercaseword"));
        assert!(password_is_strong("كلمةسر2026"));
        assert!(!password_is_strong("كلمةسرية"));
    }

    #[test]
    fn arabic_normalisation() {
        assert_eq!(normalize("أَحْمَد"), normalize("احمد"));
        assert_eq!(normalize("مدرسة"), normalize("مدرسه"));
        assert_eq!(normalize("تـــدويـن"), "تدوين");
    }

    #[test]
    fn latin_normalisation() {
        assert_eq!(normalize("Élève Café"), "eleve cafe");
    }

    #[test]
    fn snippet_finds_accented_and_arabic() {
        let s = snippet("Nous sommes allés au café hier soir", "cafe", 6).unwrap();
        assert!(s.contains("café"));
        let s = snippet("كتبتُ المُذكّرة اليوم", &normalize("المذكرة"), 3).unwrap();
        assert!(s.contains("المُذكّرة"));
        assert!(snippet("nothing here", "zzz", 3).is_none());
    }

    #[test]
    fn preview_collapses_whitespace() {
        assert_eq!(preview("a\n\n b   c", 10), "a b c");
        assert_eq!(preview("abcdef", 3), "abc…");
    }
}
