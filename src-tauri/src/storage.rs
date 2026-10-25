use regex::Regex;
use rusqlite::OpenFlags;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use std::{
    collections::{HashMap, HashSet},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::OnceLock,
};
use unicode_normalization::UnicodeNormalization;

const USER_SCHEMA_VERSION: i64 = 4;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const REVIEWED_SEARCH_PROFILE_VERSION: &str = "reviewed-latin-v1";
// Bump when the current synthetic library schema/projector/index changes.
// Development artifacts are rebuilt under a fresh identity, never migrated.
#[cfg(feature = "development-content")]
const FIXTURE_INDEX_BUILD_VERSION: &str = "fixture-store-v1";
#[cfg(feature = "development-content")]
const FIXTURE_SEARCH_PROFILE_VERSION: &str = "fixture-latin-v1";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

#[cfg(all(test, not(feature = "development-content")))]
mod production_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "aob-production-test-{nonce}-{}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn development_entry_point_cannot_open_a_fixture() {
        let root = TestDirectory::new();
        let profile = root.0.join("profile");
        let error = Repository::open(&profile).err().unwrap();
        assert_eq!(error.code, "CONTENT_UNAVAILABLE");
        assert!(!profile.exists());
    }

    #[test]
    fn absent_approved_content_keeps_personal_storage_available() {
        let root = TestDirectory::new();
        let profile = root.0.join("profile");
        let resources = root.0.join("missing-content");
        let store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        assert!(profile.join("user.sqlite").is_file());
        assert!(!resources.exists());
    }

    #[test]
    #[ignore = "requires AOB_TEST_REVIEWED_PACK_DIR; run explicitly with --ignored"]
    fn reviewed_pack_opens_in_production_profile_when_supplied() {
        let resources = std::env::var_os("AOB_TEST_REVIEWED_PACK_DIR")
            .expect("Set AOB_TEST_REVIEWED_PACK_DIR when running this ignored test.");
        let root = TestDirectory::new();
        let profile = root.0.join("profile");
        let store =
            Repository::open_packaged(&profile, &Path::new(&resources).canonicalize().unwrap())
                .unwrap();
        let editions = store.list_editions().unwrap();
        assert_eq!(editions.len(), 1);
        assert_eq!(editions[0].id, "test-edition");
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: "test-edition".into(),
                book_code: "TST".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        assert_eq!(chapter.verse_units.len(), 1);
        assert_eq!(chapter.verse_units[0].text_plain, "Synthetic source words.");
        assert!(profile.join("user.sqlite").is_file());
    }
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.to_owned(),
            message: message.to_owned(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        if matches!(&error, rusqlite::Error::SqliteFailure(inner, _) if matches!(inner.code, rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase))
        {
            return Self::new(
                "STORAGE_CORRUPT",
                "The personal database is unreadable. Its files were preserved; keep a copy before attempting recovery.",
            );
        }
        if matches!(&error, rusqlite::Error::SqliteFailure(inner, _) if inner.code == rusqlite::ErrorCode::DiskFull)
        {
            return Self::new(
                "STORAGE_FULL",
                "Storage is full. Free disk space, then retry; the draft has not been saved.",
            );
        }
        Self::new(
            "WRITE_FAILED",
            "Local storage could not complete the operation. Keep your draft and retry.",
        )
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Edition {
    pub id: String,
    pub title: String,
    pub abbreviation: String,
    pub language_tag: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language_name: Option<String>,
    pub versification_id: String,
    pub content_revision: String,
    pub canon_id: String,
    pub is_synthetic: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub technical_review_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rights_holder_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_completed_on: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_archive_sha256: Option<String>,
    pub attribution: String,
    pub license_notice: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BookSummary {
    pub edition_id: String,
    pub code: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub order: u32,
    pub chapters: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChapterKey {
    pub edition_id: String,
    pub book_code: String,
    pub chapter_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerseUnit {
    pub key: String,
    pub label: String,
    pub order: u32,
    pub text_plain: String,
    pub text_digest: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChapterContent {
    pub edition_id: String,
    pub book_code: String,
    pub chapter_label: String,
    pub blocks: Vec<Value>,
    pub verse_units: Vec<VerseUnit>,
    pub reference_lookup: HashMap<String, Vec<String>>,
}

#[cfg(feature = "development-content")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FixturePack {
    format_version: u32,
    edition: Edition,
    books: Vec<BookSummary>,
    chapters: Vec<ChapterContent>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchClause {
    pub tokens: Vec<String>,
    pub prefix: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParsedSearch {
    pub clauses: Vec<SearchClause>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchRequest {
    pub edition_id: String,
    pub query: ParsedSearch,
    pub book_code: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchResult {
    pub edition_id: String,
    pub book_code: String,
    pub book_name: String,
    pub chapter_label: String,
    pub verse_label: String,
    pub unit_key: String,
    pub text_plain: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchResults {
    pub items: Vec<SearchResult>,
    pub total: u32,
    pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerseAddress {
    pub book_code: String,
    pub chapter_label: String,
    pub verse_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerseAnchor {
    pub id: String,
    pub edition_id: String,
    pub versification_id: String,
    pub content_revision: String,
    pub start: VerseAddress,
    pub end: VerseAddress,
    pub unit_keys: Vec<String>,
    pub selected_text_digests: Vec<String>,
    pub display_reference_snapshot: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body_text: String,
    pub anchor: Option<VerseAnchor>,
    pub created_at: String,
    pub updated_at: String,
    pub revision: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bookmark {
    pub id: String,
    pub anchor: VerseAnchor,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Highlight {
    pub id: String,
    pub anchor: VerseAnchor,
    pub color_token: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadingPosition {
    pub edition_id: String,
    pub book_code: String,
    pub chapter_label: String,
    pub verse_label: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub ui_locale: String,
    pub theme: String,
    pub font_size_px: f64,
    pub line_height: f64,
    pub width: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersonalSnapshot {
    pub notes: Vec<Note>,
    pub bookmarks: Vec<Bookmark>,
    pub highlights: Vec<Highlight>,
    pub preferences: Vec<Preferences>,
    pub reading_positions: Vec<ReadingPosition>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            ui_locale: "en".into(),
            theme: "system".into(),
            font_size_px: 20.0,
            line_height: 1.65,
            width: "comfortable".into(),
        }
    }
}

fn input_error(message: &str) -> AppError {
    AppError::new("INPUT_INVALID", message)
}

fn json<T: Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|_| input_error("The record cannot be serialized."))
}

fn from_json<T: DeserializeOwned>(value: &str) -> Result<T, AppError> {
    serde_json::from_str(value).map_err(|_| {
        AppError::new(
            "STORAGE_INVALID",
            "Stored data is invalid. Preserve the database and use recovery; it was not reset.",
        )
    })
}

fn short_text(value: &str) -> bool {
    !value.is_empty() && value.chars().count() <= 256
}

fn uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                *byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
        && (b'1'..=b'8').contains(&bytes[14])
        && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
}

// Validated UTC components support consistent comparisons even with optional milliseconds.
fn timestamp(value: &str) -> Option<[u32; 7]> {
    let bytes = value.as_bytes();
    if !(20..=24).contains(&bytes.len()) || bytes.last() != Some(&b'Z') {
        return None;
    }
    if [4, 7, 10, 13, 16]
        .iter()
        .zip([b'-', b'-', b'T', b':', b':'])
        .any(|(index, delimiter)| bytes[*index] != delimiter)
    {
        return None;
    }
    if !bytes[..19]
        .iter()
        .enumerate()
        .all(|(index, byte)| [4, 7, 10, 13, 16].contains(&index) || byte.is_ascii_digit())
    {
        return None;
    }
    let number = |start, end| value.get(start..end)?.parse::<u32>().ok();
    let year = number(0, 4)?;
    let month = number(5, 7)?;
    let day = number(8, 10)?;
    let hour = number(11, 13)?;
    let minute = number(14, 16)?;
    let second = number(17, 19)?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if day == 0 || day > days || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let millis = if bytes.len() == 20 {
        0
    } else {
        if bytes[19] != b'.'
            || bytes.len() == 21
            || !bytes[20..bytes.len() - 1].iter().all(u8::is_ascii_digit)
        {
            return None;
        }
        let fraction = value.get(20..value.len() - 1)?;
        fraction.parse::<u32>().ok()? * 10_u32.pow(3 - fraction.len() as u32)
    };
    Some([year, month, day, hour, minute, second, millis])
}

fn validate_note(note: &Note) -> Result<(), AppError> {
    if !uuid(&note.id)
        || note.title.chars().count() > 256
        || note.body_text.len() > 1024 * 1024
        || note.revision >= MAX_SAFE_INTEGER
    {
        return Err(input_error(
            "The note is invalid or exceeds supported limits. Your draft was not saved.",
        ));
    }
    let created = timestamp(&note.created_at)
        .ok_or_else(|| input_error("The note creation time must be a valid UTC timestamp."))?;
    let updated = timestamp(&note.updated_at)
        .ok_or_else(|| input_error("The note update time must be a valid UTC timestamp."))?;
    if updated < created {
        return Err(input_error("A note update cannot precede its creation."));
    }
    if let Some(anchor) = &note.anchor {
        let valid_address = |address: &VerseAddress| {
            short_text(&address.book_code)
                && short_text(&address.chapter_label)
                && short_text(&address.verse_label)
        };
        let digests_valid = anchor.selected_text_digests.iter().all(|digest| {
            digest.len() == 64
                && digest
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        });
        if !uuid(&anchor.id)
            || !short_text(&anchor.edition_id)
            || !short_text(&anchor.versification_id)
            || !short_text(&anchor.content_revision)
            || !valid_address(&anchor.start)
            || !valid_address(&anchor.end)
            || anchor.start.book_code != anchor.end.book_code
            || anchor.start.chapter_label != anchor.end.chapter_label
            || anchor.unit_keys.is_empty()
            || anchor
                .unit_keys
                .iter()
                .any(|key| key.is_empty() || key.encode_utf16().count() > 4096)
            || anchor.unit_keys.iter().collect::<HashSet<_>>().len() != anchor.unit_keys.len()
            || anchor.selected_text_digests.len() != anchor.unit_keys.len()
            || !digests_valid
            || !short_text(&anchor.display_reference_snapshot)
            || timestamp(&anchor.created_at).is_none()
        {
            return Err(input_error(
                "The passage link is invalid. Preserve the draft and select the passage again.",
            ));
        }
        for (index, key) in anchor.unit_keys.iter().enumerate() {
            let tuple: Vec<String> = serde_json::from_str(key)
                .map_err(|_| input_error("A passage identity is not a structured reference."))?;
            if tuple.len() != 5
                || tuple[0] != anchor.edition_id
                || tuple[1] != anchor.versification_id
                || tuple[2] != anchor.start.book_code
                || tuple[3] != anchor.start.chapter_label
                || !short_text(&tuple[4])
                || (index == 0 && tuple[4] != anchor.start.verse_label)
                || (index == anchor.unit_keys.len() - 1 && tuple[4] != anchor.end.verse_label)
            {
                return Err(input_error(
                    "The passage identities do not match their stored reference.",
                ));
            }
        }
    }
    Ok(())
}

fn validate_bookmark(bookmark: &Bookmark) -> Result<(), AppError> {
    if !uuid(&bookmark.id) || bookmark.label.chars().count() > 256 {
        return Err(input_error("The bookmark or its label is invalid."));
    }
    let created = timestamp(&bookmark.created_at)
        .ok_or_else(|| input_error("The bookmark creation time is invalid."))?;
    let updated = timestamp(&bookmark.updated_at)
        .ok_or_else(|| input_error("The bookmark update time is invalid."))?;
    if updated < created {
        return Err(input_error(
            "A bookmark update cannot precede its creation.",
        ));
    }
    // Anchor structure follows the same strict contract as a linked note.
    validate_note(&Note {
        id: bookmark.id.clone(),
        title: String::new(),
        body_text: String::new(),
        anchor: Some(bookmark.anchor.clone()),
        created_at: bookmark.created_at.clone(),
        updated_at: bookmark.updated_at.clone(),
        revision: 0,
    })
}

fn validate_highlight(highlight: &Highlight) -> Result<(), AppError> {
    if !["yellow", "green", "blue", "rose"].contains(&highlight.color_token.as_str())
        || highlight.anchor.unit_keys.len() != 1
    {
        return Err(input_error(
            "A highlight needs one verse and a supported color.",
        ));
    }
    validate_bookmark(&Bookmark {
        id: highlight.id.clone(),
        anchor: highlight.anchor.clone(),
        label: String::new(),
        created_at: highlight.created_at.clone(),
        updated_at: highlight.updated_at.clone(),
    })
}

fn bookmark_identity(anchor: &VerseAnchor) -> Result<String, AppError> {
    json(&(
        &anchor.edition_id,
        &anchor.versification_id,
        &anchor.unit_keys,
    ))
}

fn validate_preferences(preferences: &Preferences) -> Result<(), AppError> {
    if !["en", "om"].contains(&preferences.ui_locale.as_str())
        || !["light", "dark", "system"].contains(&preferences.theme.as_str())
        || !preferences.font_size_px.is_finite()
        || !(16.0..=32.0).contains(&preferences.font_size_px)
        || ![1.4, 1.65, 1.9].contains(&preferences.line_height)
        || !["comfortable", "wide"].contains(&preferences.width.as_str())
    {
        return Err(input_error("Choose supported reading preferences."));
    }
    Ok(())
}

fn validate_reading_position(position: &ReadingPosition) -> Result<(), AppError> {
    if !short_text(&position.edition_id)
        || !short_text(&position.book_code)
        || !short_text(&position.chapter_label)
        || position
            .verse_label
            .as_ref()
            .is_some_and(|value| !short_text(value))
        || timestamp(&position.updated_at).is_none()
    {
        return Err(input_error("The reading position is invalid."));
    }
    Ok(())
}

fn validate_personal_snapshot(snapshot: &PersonalSnapshot) -> Result<(), AppError> {
    let invalid = || {
        AppError::new(
            "BACKUP_INVALID",
            "The backup contains invalid or duplicate personal records.",
        )
    };
    if snapshot.preferences.len() > 1 {
        return Err(invalid());
    }
    let mut note_ids = HashSet::new();
    let mut bookmark_ids = HashSet::new();
    let mut bookmark_ranges = HashSet::new();
    let mut highlight_ids = HashSet::new();
    let mut highlight_units = HashSet::new();
    let mut position_editions = HashSet::new();
    for note in &snapshot.notes {
        validate_note(note).map_err(|_| invalid())?;
        if note.revision == 0 || !note_ids.insert(&note.id) {
            return Err(invalid());
        }
    }
    for bookmark in &snapshot.bookmarks {
        validate_bookmark(bookmark).map_err(|_| invalid())?;
        if !bookmark_ids.insert(&bookmark.id)
            || !bookmark_ranges.insert(bookmark_identity(&bookmark.anchor)?)
        {
            return Err(invalid());
        }
    }
    for highlight in &snapshot.highlights {
        validate_highlight(highlight).map_err(|_| invalid())?;
        if !highlight_ids.insert(&highlight.id)
            || !highlight_units.insert(&highlight.anchor.unit_keys[0])
        {
            return Err(invalid());
        }
    }
    for preference in &snapshot.preferences {
        validate_preferences(preference).map_err(|_| invalid())?;
    }
    for position in &snapshot.reading_positions {
        validate_reading_position(position).map_err(|_| invalid())?;
        if !position_editions.insert(&position.edition_id) {
            return Err(invalid());
        }
    }
    let base_count = snapshot.notes.len()
        + snapshot.bookmarks.len()
        + snapshot.highlights.len()
        + snapshot.preferences.len()
        + snapshot.reading_positions.len();
    if base_count > 100_000 {
        return Err(invalid());
    }
    Ok(())
}

fn portable_backup(
    snapshot: &PersonalSnapshot,
    database_id: &str,
    created_at: &str,
) -> Result<Vec<u8>, AppError> {
    validate_personal_snapshot(snapshot)?;
    if !uuid(database_id) || timestamp(created_at).is_none() {
        return Err(AppError::new(
            "BACKUP_INVALID",
            "The backup metadata is invalid.",
        ));
    }
    let mut anchors = Vec::<VerseAnchor>::new();
    let mut anchor_ids = HashMap::<String, VerseAnchor>::new();
    let mut required_editions = Vec::<Value>::new();
    let mut edition_ids = HashSet::<String>::new();
    let mut linked = |mut value: Value, anchor: Option<&VerseAnchor>| -> Result<Value, AppError> {
        let fields = value
            .as_object_mut()
            .ok_or_else(|| AppError::new("BACKUP_INVALID", "A personal record is invalid."))?;
        fields.remove("anchor");
        let anchor_id = if let Some(anchor) = anchor {
            if let Some(previous) = anchor_ids.get(&anchor.id) {
                if previous != anchor {
                    return Err(AppError::new(
                        "BACKUP_INVALID",
                        "A passage identity has conflicting records.",
                    ));
                }
            } else {
                anchor_ids.insert(anchor.id.clone(), anchor.clone());
                anchors.push(anchor.clone());
            }
            let edition_key = json!([
                anchor.edition_id,
                anchor.versification_id,
                anchor.content_revision
            ])
            .to_string();
            if edition_ids.insert(edition_key) {
                required_editions.push(json!({"editionId": anchor.edition_id, "versificationId": anchor.versification_id, "contentRevision": anchor.content_revision}));
            }
            Value::String(anchor.id.clone())
        } else {
            Value::Null
        };
        fields.insert("anchorId".into(), anchor_id);
        Ok(value)
    };
    let notes = snapshot
        .notes
        .iter()
        .map(|item| linked(json!(item), item.anchor.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    let bookmarks = snapshot
        .bookmarks
        .iter()
        .map(|item| linked(json!(item), Some(&item.anchor)))
        .collect::<Result<Vec<_>, _>>()?;
    let highlights = snapshot
        .highlights
        .iter()
        .map(|item| linked(json!(item), Some(&item.anchor)))
        .collect::<Result<Vec<_>, _>>()?;
    let count = snapshot.notes.len()
        + anchors.len()
        + snapshot.bookmarks.len()
        + snapshot.highlights.len()
        + snapshot.preferences.len()
        + snapshot.reading_positions.len();
    if count > 100_000 {
        return Err(AppError::new(
            "BACKUP_INVALID",
            "The backup exceeds 100,000 records.",
        ));
    }
    let backup = json!({
        "format": "afaan-oromo-bible-user-backup", "formatVersion": 1,
        "appVersion": env!("CARGO_PKG_VERSION"), "createdAt": created_at,
        "sourceDatabaseId": database_id, "requiredEditions": required_editions,
        "data": {"notes": notes, "anchors": anchors, "bookmarks": bookmarks, "highlights": highlights, "preferences": snapshot.preferences, "readingPositions": snapshot.reading_positions},
    });
    let bytes = serde_json::to_vec(&backup)
        .map_err(|_| AppError::new("BACKUP_INVALID", "The backup cannot be serialized."))?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err(AppError::new(
            "BACKUP_INVALID",
            "The backup exceeds 50 MiB.",
        ));
    }
    Ok(bytes)
}

fn write_recovery_file(directory: &Path, bytes: &[u8]) -> Result<(String, PathBuf), AppError> {
    let recovery_dir = directory.join("recovery");
    std::fs::create_dir_all(&recovery_dir).map_err(|_| {
        AppError::new(
            "WRITE_FAILED",
            "The recovery directory could not be created.",
        )
    })?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = format!("pre-restore-{id}.json");
    let temporary = recovery_dir.join(format!(".{name}.tmp"));
    let final_path = recovery_dir.join(&name);
    let result = (|| -> Result<(), AppError> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| {
                AppError::new("WRITE_FAILED", "The recovery file could not be created.")
            })?;
        file.write_all(bytes).map_err(|_| {
            AppError::new("WRITE_FAILED", "The recovery file could not be written.")
        })?;
        file.sync_all().map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The recovery file could not be made durable.",
            )
        })?;
        drop(file);
        std::fs::rename(&temporary, &final_path).map_err(|_| {
            AppError::new("WRITE_FAILED", "The recovery file could not be completed.")
        })?;
        #[cfg(unix)]
        std::fs::File::open(&recovery_dir)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "The recovery directory could not be made durable.",
                )
            })?;
        let published = std::fs::read(&final_path).map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The recovery file could not be reopened for verification.",
            )
        })?;
        if published.as_slice() != bytes {
            return Err(AppError::new(
                "WRITE_FAILED",
                "The recovery file did not match the verified snapshot.",
            ));
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result?;
    Ok((name, final_path))
}

pub fn normalize_search_text(text: &str) -> String {
    let folded = text
        .nfc()
        .map(|character| match character {
            '\u{2019}' => '\'',
            'A'..='Z' | '\u{00c0}'..='\u{00d6}' | '\u{00d8}'..='\u{00de}' => {
                char::from_u32(character as u32 + 32).unwrap_or(character)
            }
            '\u{0178}' => '\u{00ff}',
            _ => character,
        })
        .collect::<String>()
        .nfc()
        .collect::<String>();
    word_regex()
        .find_iter(&folded)
        .map(|found| found.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

fn word_regex() -> &'static Regex {
    static WORD: OnceLock<Regex> = OnceLock::new();
    WORD.get_or_init(|| {
        Regex::new(r"[\p{L}\p{N}\p{M}]+(?:'[\p{L}\p{N}\p{M}]+)*")
            .expect("The constant token expression is valid")
    })
}

fn compile_search(query: &ParsedSearch) -> Result<String, AppError> {
    let mut count = 0;
    let mut characters = 0;
    if query.clauses.is_empty() || query.clauses.len() > 20 {
        return Err(AppError::new(
            "QUERY_INVALID",
            "Enter a bounded word or phrase search.",
        ));
    }
    let mut expressions = Vec::new();
    for clause in &query.clauses {
        if clause.tokens.is_empty()
            || (clause.prefix && (clause.tokens.len() != 1 || clause.tokens[0].chars().count() < 2))
        {
            return Err(AppError::new(
                "QUERY_INVALID",
                "Prefix searches require one token with at least two characters.",
            ));
        }
        for token in &clause.tokens {
            count += 1;
            characters += token.chars().count();
            let valid = word_regex()
                .find(token)
                .is_some_and(|found| found.start() == 0 && found.end() == token.len());
            if !valid || token.chars().count() > 256 || normalize_search_text(token) != *token {
                return Err(AppError::new(
                    "QUERY_INVALID",
                    "Use normalized word tokens, not raw search operators.",
                ));
            }
        }
        expressions.push(format!(
            "\"{}\"{}",
            clause.tokens.join(" ").replace('"', "\"\""),
            if clause.prefix { "*" } else { "" }
        ));
    }
    if count > 20 || characters + count - 1 > 256 {
        return Err(AppError::new(
            "QUERY_INVALID",
            "The search exceeds the supported query limit.",
        ));
    }
    Ok(expressions.join(" AND "))
}

fn validate_anchor_content(
    library: Option<&Connection>,
    anchor: &VerseAnchor,
    previous: Option<&VerseAnchor>,
) -> Result<(), AppError> {
    // An unchanged saved link retains provenance even if its edition later
    // disappears or changes. A new/reassigned link must resolve exactly now.
    if previous == Some(anchor) {
        return Ok(());
    }
    let library = library.ok_or_else(|| {
        content_error("The new passage link cannot be verified because its edition is unavailable.")
    })?;
    let edition_json: Option<String> = library
        .query_row(
            "SELECT json FROM edition WHERE id=?1",
            [&anchor.edition_id],
            |row| row.get(0),
        )
        .optional()?;
    let edition: Edition = match edition_json {
        Some(record) => from_json(&record)?,
        None => {
            return Err(AppError::new(
                "CONTENT_UNAVAILABLE",
                "The new passage link cannot be verified because its edition is unavailable.",
            ))
        }
    };
    if edition.versification_id != anchor.versification_id
        || edition.content_revision != anchor.content_revision
    {
        return Err(input_error(
            "The passage link uses different content. Select the current passage again.",
        ));
    }
    let chapter_json: Option<String> = library
        .query_row(
            "SELECT json FROM chapter WHERE edition_id=?1 AND book_code=?2 AND chapter_label=?3",
            params![
                anchor.edition_id,
                anchor.start.book_code,
                anchor.start.chapter_label
            ],
            |row| row.get(0),
        )
        .optional()?;
    let chapter: ChapterContent = match chapter_json {
        Some(record) => from_json(&record)?,
        None => {
            return Err(AppError::new(
                "CONTENT_UNAVAILABLE",
                "The new passage link cannot be verified because its chapter is unavailable.",
            ))
        }
    };
    let start = chapter
        .verse_units
        .iter()
        .position(|unit| unit.label == anchor.start.verse_label)
        .ok_or_else(|| input_error("The passage link starts at an unknown verse unit."))?;
    let end = chapter
        .verse_units
        .iter()
        .position(|unit| unit.label == anchor.end.verse_label)
        .ok_or_else(|| input_error("The passage link ends at an unknown verse unit."))?;
    if start > end {
        return Err(input_error("The passage link must follow source order."));
    }
    let selected = &chapter.verse_units[start..=end];
    if selected.len() != anchor.unit_keys.len()
        || selected
            .iter()
            .zip(&anchor.unit_keys)
            .any(|(unit, key)| &unit.key != key)
        || selected
            .iter()
            .zip(&anchor.selected_text_digests)
            .any(|(unit, digest)| &unit.text_digest != digest)
    {
        return Err(input_error(
            "The passage link must include the exact contiguous source units and text digests.",
        ));
    }
    Ok(())
}

fn snapshot_from(connection: &Connection) -> Result<PersonalSnapshot, AppError> {
    let read = |table: &str| -> Result<Vec<String>, AppError> {
        let query = match table {
            "note" => "SELECT json FROM note ORDER BY id",
            "bookmark" => "SELECT json FROM bookmark ORDER BY id",
            "highlight" => "SELECT json FROM highlight ORDER BY id",
            "preference" => "SELECT json FROM preference ORDER BY key",
            "reading_position" => "SELECT json FROM reading_position ORDER BY edition_id",
            _ => return Err(input_error("Unknown snapshot record type.")),
        };
        let mut statement = connection.prepare(query)?;
        let records = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(records)
    };
    let notes: Vec<Note> = read("note")?
        .iter()
        .map(|item| from_json(item))
        .collect::<Result<_, _>>()?;
    let bookmarks: Vec<Bookmark> = read("bookmark")?
        .iter()
        .map(|item| from_json(item))
        .collect::<Result<_, _>>()?;
    let highlights: Vec<Highlight> = read("highlight")?
        .iter()
        .map(|item| from_json(item))
        .collect::<Result<_, _>>()?;
    let preferences: Vec<Preferences> = read("preference")?
        .iter()
        .map(|item| from_json(item))
        .collect::<Result<_, _>>()?;
    let reading_positions: Vec<ReadingPosition> = read("reading_position")?
        .iter()
        .map(|item| from_json(item))
        .collect::<Result<_, _>>()?;
    let snapshot = PersonalSnapshot {
        notes,
        bookmarks,
        highlights,
        preferences,
        reading_positions,
    };
    validate_personal_snapshot(&snapshot)?;
    Ok(snapshot)
}

pub struct Repository {
    library: Option<Connection>,
    content_error: Option<AppError>,
    technical_review_only: bool,
    user: Connection,
    directory: PathBuf,
    _profile_lock: std::fs::File,
}

fn lock_profile(directory: &Path) -> Result<std::fs::File, AppError> {
    std::fs::create_dir_all(directory).map_err(|_| {
        AppError::new(
            "WRITE_FAILED",
            "The application data directory could not be created.",
        )
    })?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(directory.join("profile.lock"))
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The personal storage lock could not be opened.",
            )
        })?;
    file.try_lock().map_err(|error| match error {
        std::fs::TryLockError::WouldBlock => AppError::new(
            "STORAGE_IN_USE",
            "Personal data is open in another application window. Close it before continuing.",
        ),
        _ => AppError::new(
            "WRITE_FAILED",
            "The personal storage lock could not be acquired.",
        ),
    })?;
    Ok(file)
}

fn open_user(directory: &Path) -> Result<Connection, AppError> {
    std::fs::create_dir_all(directory).map_err(|_| {
        AppError::new(
            "WRITE_FAILED",
            "The application data directory could not be created.",
        )
    })?;
    let database_path = directory.join("user.sqlite");
    let existing = database_path.exists();
    if existing {
        let check = quick_check_user(&database_path)?;
        if check != "ok" {
            return Err(AppError::new(
                "STORAGE_CORRUPT",
                "The personal database failed its integrity check. Its files were preserved; keep a copy before attempting recovery.",
            ));
        }
    }
    let mut user = Connection::open(database_path)?;
    user.busy_timeout(Duration::from_secs(3))?;
    user.pragma_update(None, "foreign_keys", "ON")?;
    user.pragma_update(None, "journal_mode", "WAL")?;
    user.pragma_update(None, "synchronous", "FULL")?;
    let version: i64 = user.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version == 0 {
        let count: i64 = user.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |row| row.get(0),
        )?;
        if count != 0 {
            return Err(AppError::new(
                "SCHEMA_UNSUPPORTED",
                "This database has an unknown schema. It was preserved without a reset.",
            ));
        }
        let transaction = user.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch("
            CREATE TABLE user_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE note (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), updated_at TEXT NOT NULL, json TEXT NOT NULL);
            CREATE TABLE bookmark (id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL, json TEXT NOT NULL);
            CREATE TABLE highlight (id TEXT PRIMARY KEY, unit_key TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL, json TEXT NOT NULL);
            CREATE TABLE preference (key TEXT PRIMARY KEY, json TEXT NOT NULL);
            CREATE TABLE reading_position (edition_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, json TEXT NOT NULL);
            PRAGMA user_version = 4;")?;
        transaction.execute(
            "INSERT INTO user_metadata(key,value) VALUES('database_id',?1)",
            [uuid::Uuid::new_v4().to_string()],
        )?;
        transaction.commit()?;
    } else if version != USER_SCHEMA_VERSION {
        return Err(AppError::new(
            "SCHEMA_UNSUPPORTED",
            "This database schema is unsupported. It was preserved without a reset.",
        ));
    }
    Ok(user)
}

fn quick_check_user(path: &Path) -> Result<String, rusqlite::Error> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))
}

/// Explicit recovery only: preserve every SQLite file before starting a fresh profile.
pub fn archive_corrupt_user_database(directory: &Path) -> Result<PathBuf, AppError> {
    let _profile_lock = lock_profile(directory)?;
    let database = directory.join("user.sqlite");
    if !database.is_file() {
        return Err(AppError::new(
            "STORAGE_INVALID",
            "No personal database was found to recover.",
        ));
    }
    let check = quick_check_user(&database);
    match check {
        Ok(value) if value == "ok" => {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The personal database passes its integrity check; recovery was not started.",
            ))
        }
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(inner, _))
            if matches!(
                inner.code,
                rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
            ) => {}
        Err(error) => return Err(AppError::from(error)),
    }

    let recovery_root = directory.join("recovery");
    std::fs::create_dir_all(&recovery_root)
        .map_err(|_| AppError::new("WRITE_FAILED", "The recovery folder could not be created."))?;
    let archive = recovery_root.join(format!("corrupt-user-{}", uuid::Uuid::new_v4()));
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = std::fs::DirBuilder::new();
        builder.mode(0o700).create(&archive).map_err(|_| {
            AppError::new("WRITE_FAILED", "The recovery folder could not be created.")
        })?;
    }
    #[cfg(not(unix))]
    std::fs::create_dir(&archive)
        .map_err(|_| AppError::new("WRITE_FAILED", "The recovery folder could not be created."))?;
    let files = ["user.sqlite", "user.sqlite-wal", "user.sqlite-shm"];
    let mut existing = Vec::new();
    for name in files {
        let path = directory.join(name);
        match std::fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_file() => existing.push(path),
            Ok(_) => {
                return Err(AppError::new(
                    "STORAGE_INVALID",
                    "A personal database path is not a regular file; recovery was not started.",
                ))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                return Err(AppError::new(
                    "WRITE_FAILED",
                    "A personal database file could not be inspected.",
                ))
            }
        }
    }
    for source in &existing {
        let name = source
            .file_name()
            .ok_or_else(|| AppError::new("WRITE_FAILED", "The database filename is invalid."))?;
        let destination = archive.join(name);
        let original_size = std::fs::metadata(source)
            .map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "The corrupt database could not be inspected.",
                )
            })?
            .len();
        let copied_size = std::fs::copy(source, &destination).map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The corrupt database could not be copied for recovery.",
            )
        })?;
        if copied_size != original_size {
            return Err(AppError::new(
                "WRITE_FAILED",
                "The corrupt database changed during recovery; the originals were kept.",
            ));
        }
        std::fs::File::open(&destination)
            .and_then(|file| file.sync_all())
            .map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "The recovery copy could not be made durable.",
                )
            })?;
    }
    #[cfg(unix)]
    std::fs::File::open(&archive)
        .and_then(|folder| folder.sync_all())
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The recovery folder could not be made durable.",
            )
        })?;
    #[cfg(unix)]
    std::fs::File::open(&recovery_root)
        .and_then(|folder| folder.sync_all())
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The recovery directory entry could not be made durable.",
            )
        })?;
    #[cfg(unix)]
    std::fs::File::open(directory)
        .and_then(|folder| folder.sync_all())
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The app-data directory entry could not be made durable.",
            )
        })?;

    for source in existing.into_iter().rev() {
        std::fs::remove_file(source).map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The original database could not be archived. The recovery copy was kept.",
            )
        })?;
    }
    #[cfg(unix)]
    std::fs::File::open(directory)
        .and_then(|folder| folder.sync_all())
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "The database folder could not be made durable. The recovery copy was kept.",
            )
        })?;
    let fresh = open_user(directory)?;
    drop(fresh);
    Ok(archive)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApprovedContentManifest {
    format_version: u32,
    approval_status: String,
    approval_evidence_id: String,
    library_sha256: String,
    source_archive_sha256: String,
    edition_id: String,
    content_revision: String,
    search_profile_version: String,
}

fn content_error(message: &str) -> AppError {
    AppError::new("CONTENT_UNAVAILABLE", message)
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
    let mut source = std::fs::File::open(path)
        .map_err(|_| content_error("The packaged content database is missing."))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = source
            .read(&mut buffer)
            .map_err(|_| content_error("The packaged content database could not be verified."))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn open_approved_library(resource_directory: &Path) -> Result<Connection, AppError> {
    let manifest_path = resource_directory.join("approved-content.json");
    let manifest_bytes = std::fs::read(&manifest_path)
        .map_err(|_| content_error("No approved content manifest is packaged."))?;
    if manifest_bytes.len() > 16 * 1024 {
        return Err(content_error("The packaged content manifest is invalid."));
    }
    let manifest: ApprovedContentManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| content_error("The packaged content manifest is invalid."))?;
    let valid_hash =
        |value: &str| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit());
    if manifest.format_version != 1
        || manifest.approval_status != "approved"
        || !short_text(&manifest.approval_evidence_id)
        || !short_text(&manifest.edition_id)
        || !short_text(&manifest.content_revision)
        || manifest.search_profile_version != REVIEWED_SEARCH_PROFILE_VERSION
        || !valid_hash(&manifest.library_sha256)
        || !valid_hash(&manifest.source_archive_sha256)
    {
        return Err(content_error(
            "The packaged content has no valid approval record.",
        ));
    }
    let library_path = resource_directory.join("library.sqlite");
    if sha256_file(&library_path)? != manifest.library_sha256.to_ascii_lowercase() {
        return Err(content_error(
            "The packaged content checksum does not match its manifest.",
        ));
    }
    let library = Connection::open_with_flags(library_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| content_error("The packaged content database could not be opened."))?;
    library.pragma_update(None, "foreign_keys", "ON")?;
    library.pragma_update(None, "query_only", "ON")?;
    let stored: (i64, String, String, String, String, String) = library.query_row(
        "SELECT format_version,approval_status,search_profile_version,source_archive_sha256,chapter_tree_sha256,edition_id FROM content_manifest",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    ).map_err(|_| content_error("The packaged content manifest is incomplete."))?;
    if stored.0 != 1
        || stored.1 != "approved"
        || stored.2 != manifest.search_profile_version
        || stored.3 != manifest.source_archive_sha256.to_ascii_lowercase()
        || stored.4 != manifest.content_revision
        || stored.5 != manifest.edition_id
    {
        return Err(content_error(
            "The packaged content does not match its approval manifest.",
        ));
    }
    let edition_json: String = library
        .query_row(
            "SELECT json FROM edition WHERE id=?1",
            [&manifest.edition_id],
            |row| row.get(0),
        )
        .map_err(|_| content_error("The approved edition is missing from the packaged content."))?;
    let edition: Edition = from_json(&edition_json)
        .map_err(|_| content_error("The packaged edition metadata is invalid."))?;
    if edition.is_synthetic
        || edition.technical_review_only.is_some()
        || edition.content_revision != manifest.content_revision
        || edition.source_archive_sha256.as_deref() != Some(stored.3.as_str())
        || edition.source_title.is_none()
        || edition.rights_holder_name.is_none()
        || edition.attribution.trim().is_empty()
        || edition.license_notice.trim().is_empty()
    {
        return Err(content_error(
            "The packaged edition is not approved for public reading.",
        ));
    }
    let count: i64 = library
        .query_row("SELECT count(*) FROM edition", [], |row| row.get(0))
        .map_err(|_| content_error("The packaged edition table is invalid."))?;
    if count != 1 {
        return Err(content_error(
            "The packaged content must contain one approved edition.",
        ));
    }
    for table in [
        "book",
        "chapter",
        "verse_unit",
        "verse_search",
        "source_notice",
    ] {
        let query = format!("SELECT count(*) FROM {table}");
        let count: i64 = library
            .query_row(&query, [], |row| row.get(0))
            .map_err(|_| content_error("The packaged content structure is incomplete."))?;
        if count == 0 {
            return Err(content_error(
                "The packaged content structure is incomplete.",
            ));
        }
    }
    Ok(library)
}

impl Repository {
    #[cfg(feature = "development-content")]
    pub fn open_technical_review(
        directory: &Path,
        library_path: &Path,
        expected_sha256: &str,
    ) -> Result<Self, AppError> {
        if expected_sha256.len() != 64
            || !expected_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
            || sha256_file(library_path)? != expected_sha256.to_ascii_lowercase()
        {
            return Err(content_error(
                "The technical review database checksum differs.",
            ));
        }
        let library =
            Connection::open_with_flags(library_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|_| content_error("The technical review database could not be opened."))?;
        library.pragma_update(None, "foreign_keys", "ON")?;
        library.pragma_update(None, "query_only", "ON")?;
        let manifest: (i64, String, String, String, String) = library
            .query_row(
                "SELECT format_version,approval_status,search_profile_version,source_archive_sha256,edition_id FROM content_manifest",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .map_err(|_| content_error("The technical review manifest is invalid."))?;
        let expected_source_sha256 = std::env::var("AOB_TECHNICAL_REVIEW_TEST_SOURCE_SHA256")
            .unwrap_or_else(|_| {
                "ec543152e54faac1112e95ce74bc79ed2f20f26558edeef4b1b64fc96d608106".to_string()
            });
        if expected_source_sha256.len() != 64
            || !expected_source_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            || manifest.0 != 1
            || manifest.1 != "technical_only"
            || !manifest.2.starts_with("technical-")
            || manifest.3 != expected_source_sha256.to_ascii_lowercase()
            || manifest.4 != "oocs-2024"
        {
            return Err(content_error(
                "The local file is not the registered technical review pack.",
            ));
        }
        let edition_json: String = library
            .query_row(
                "SELECT json FROM edition WHERE id=?1",
                [&manifest.4],
                |row| row.get(0),
            )
            .map_err(|_| content_error("The technical review edition is missing."))?;
        let edition: Edition = from_json(&edition_json)?;
        if edition.is_synthetic
            || edition.source_archive_sha256.as_deref() != Some(manifest.3.as_str())
        {
            return Err(content_error(
                "The technical review edition does not match its source.",
            ));
        }
        let integrity: String =
            library.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        let foreign_key_errors: i64 =
            library.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })?;
        if integrity != "ok" || foreign_key_errors != 0 {
            return Err(content_error(
                "The technical review database failed integrity checks.",
            ));
        }
        let profile_lock = lock_profile(directory)?;
        let user = open_user(directory)?;
        Ok(Self {
            library: Some(library),
            content_error: None,
            technical_review_only: true,
            user,
            directory: directory.to_path_buf(),
            _profile_lock: profile_lock,
        })
    }

    pub fn open_packaged(directory: &Path, resource_directory: &Path) -> Result<Self, AppError> {
        let profile_lock = lock_profile(directory)?;
        let (library, content_error) = match open_approved_library(resource_directory) {
            Ok(library) => (Some(library), None),
            Err(error) => (None, Some(error)),
        };
        let user = open_user(directory)?;
        Ok(Self {
            library,
            content_error,
            technical_review_only: false,
            user,
            directory: directory.to_path_buf(),
            _profile_lock: profile_lock,
        })
    }

    fn library(&self) -> Result<&Connection, AppError> {
        self.library.as_ref().ok_or_else(|| {
            self.content_error
                .clone()
                .unwrap_or_else(|| content_error("No approved Bible edition is packaged."))
        })
    }

    pub fn open(directory: &Path) -> Result<Self, AppError> {
        #[cfg(feature = "development-content")]
        {
            let profile_lock = lock_profile(directory)?;
            std::fs::create_dir_all(directory).map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "The application data directory could not be created.",
                )
            })?;
            let library_path = prepare_fixture(directory)?;
            let library =
                Connection::open_with_flags(library_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            library.pragma_update(None, "foreign_keys", "ON")?;
            library.pragma_update(None, "query_only", "ON")?;
            let _: i64 = library.query_row(
                "SELECT count(*) FROM verse_search WHERE verse_search MATCH 'synthetic'",
                [],
                |row| row.get(0),
            )?;
            let user = open_user(directory)?;
            Ok(Self {
                library: Some(library),
                content_error: None,
                technical_review_only: false,
                user,
                directory: directory.to_path_buf(),
                _profile_lock: profile_lock,
            })
        }
        #[cfg(not(feature = "development-content"))]
        {
            let _ = directory;
            Err(AppError::new("CONTENT_UNAVAILABLE", "No approved Bible edition is packaged. Public builds require a verified content pack; development fixtures are disabled."))
        }
    }

    pub fn list_editions(&self) -> Result<Vec<Edition>, AppError> {
        let mut statement = self
            .library()?
            .prepare("SELECT json FROM edition ORDER BY id")?;
        let records = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        records
            .iter()
            .map(|record| {
                let mut edition: Edition = from_json(record)?;
                if self.technical_review_only {
                    edition.technical_review_only = Some(true);
                }
                Ok(edition)
            })
            .collect()
    }

    pub fn list_books(&self, edition_id: &str) -> Result<Vec<BookSummary>, AppError> {
        if !short_text(edition_id) {
            return Err(input_error("Choose a valid edition."));
        }
        let exists: bool = self.library()?.query_row(
            "SELECT EXISTS(SELECT 1 FROM edition WHERE id=?1)",
            [edition_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::new(
                "CONTENT_UNAVAILABLE",
                "The selected edition is not installed.",
            ));
        }
        let mut statement = self
            .library()?
            .prepare("SELECT json FROM book WHERE edition_id=?1 ORDER BY display_order")?;
        let records = statement
            .query_map([edition_id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        records.iter().map(|record| from_json(record)).collect()
    }

    pub fn get_chapter(&self, key: &ChapterKey) -> Result<ChapterContent, AppError> {
        if !short_text(&key.edition_id)
            || !short_text(&key.book_code)
            || !short_text(&key.chapter_label)
        {
            return Err(input_error("Choose a valid passage reference."));
        }
        let record: Option<String> = self.library()?.query_row("SELECT json FROM chapter WHERE edition_id=?1 AND book_code=?2 AND chapter_label=?3", params![key.edition_id, key.book_code, key.chapter_label], |row| row.get(0)).optional()?;
        match record {
            Some(value) => from_json(&value),
            None => Err(AppError::new(
                "CONTENT_UNAVAILABLE",
                "The passage is unavailable in the selected edition.",
            )),
        }
    }

    pub fn search(&self, request: &SearchRequest) -> Result<SearchResults, AppError> {
        if !short_text(&request.edition_id)
            || request
                .book_code
                .as_ref()
                .is_some_and(|value| !short_text(value))
        {
            return Err(input_error("Choose a valid search edition and filter."));
        }
        let books = self.list_books(&request.edition_id)?;
        if request
            .book_code
            .as_ref()
            .is_some_and(|code| !books.iter().any(|book| &book.code == code))
        {
            return Err(AppError::new(
                "CONTENT_UNAVAILABLE",
                "That search book is unavailable in this edition.",
            ));
        }
        let expression = compile_search(&request.query)?;
        let limit = request.limit.unwrap_or(50);
        let offset = request.offset.unwrap_or(0);
        if limit == 0 || limit > 50 || offset > MAX_SAFE_INTEGER {
            return Err(AppError::new(
                "QUERY_INVALID",
                "The search page is outside supported bounds.",
            ));
        }
        let filter = request.book_code.as_deref();
        // Keep FTS first: SQLite otherwise scans every verse and reruns MATCH
        // for each row when planning the count query on a full corpus.
        let total: u32 = self.library()?.query_row("SELECT count(*) FROM verse_search CROSS JOIN verse_unit v ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3)", params![expression, request.edition_id, filter], |row| row.get(0))?;
        let mut statement = self.library()?.prepare("SELECT v.edition_id, v.book_code, v.book_name, v.chapter_label, v.verse_label, v.unit_key, v.text_plain FROM verse_search JOIN verse_unit v ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3) ORDER BY v.book_order, v.chapter_order, v.unit_order LIMIT ?4 OFFSET ?5")?;
        let items = statement
            .query_map(
                params![expression, request.edition_id, filter, limit, offset],
                |row| {
                    Ok(SearchResult {
                        edition_id: row.get(0)?,
                        book_code: row.get(1)?,
                        book_name: row.get(2)?,
                        chapter_label: row.get(3)?,
                        verse_label: row.get(4)?,
                        unit_key: row.get(5)?,
                        text_plain: row.get(6)?,
                    })
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let has_more = offset.saturating_add(items.len() as u64) < u64::from(total);
        Ok(SearchResults {
            items,
            total,
            has_more,
        })
    }

    pub fn list_notes(&self) -> Result<Vec<Note>, AppError> {
        let mut statement = self
            .user
            .prepare("SELECT json FROM note ORDER BY updated_at DESC, id")?;
        let records = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut notes: Vec<Note> = records
            .iter()
            .map(|record| from_json(record))
            .collect::<Result<_, _>>()?;
        notes.sort_by(|left, right| {
            timestamp(&right.updated_at)
                .cmp(&timestamp(&left.updated_at))
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(notes)
    }

    pub fn save_note(&mut self, mut note: Note) -> Result<Note, AppError> {
        validate_note(&note)?;
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<String> = transaction
            .query_row("SELECT json FROM note WHERE id=?1", [&note.id], |row| {
                row.get(0)
            })
            .optional()?;
        let previous_note = previous
            .as_ref()
            .map(|record| from_json::<Note>(record))
            .transpose()?;
        if let Some(anchor) = &note.anchor {
            validate_anchor_content(
                self.library.as_ref(),
                anchor,
                previous_note.as_ref().and_then(|note| note.anchor.as_ref()),
            )?;
        }
        match previous_note {
            Some(record) => {
                let existing = record;
                if existing.revision != note.revision {
                    return Err(AppError::new("REVISION_CONFLICT", "A newer note is already saved. Keep your draft and reload before retrying."));
                }
                if existing.created_at != note.created_at {
                    return Err(input_error(
                        "An existing note's creation time cannot change.",
                    ));
                }
                if timestamp(&note.updated_at) < timestamp(&existing.updated_at) {
                    return Err(input_error(
                        "A note update cannot move its saved timestamp backward.",
                    ));
                }
            }
            None => {
                if note.revision != 0 {
                    return Err(AppError::new(
                        "REVISION_CONFLICT",
                        "The original note is unavailable. Keep the draft before retrying.",
                    ));
                }
                if note.title.trim().is_empty() && note.body_text.trim().is_empty() {
                    return Err(input_error("Enter a note title or text before saving."));
                }
            }
        }
        note.revision += 1;
        transaction.execute("INSERT INTO note(id,revision,updated_at,json) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,json=excluded.json", params![note.id, note.revision, note.updated_at, json(&note)?])?;
        transaction.commit()?;
        Ok(note)
    }

    pub fn delete_note(&mut self, id: &str) -> Result<(), AppError> {
        if !uuid(id) {
            return Err(input_error("Choose a valid note."));
        }
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("DELETE FROM note WHERE id=?1", [id])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn list_bookmarks(&self) -> Result<Vec<Bookmark>, AppError> {
        let mut statement = self
            .user
            .prepare("SELECT identity,json FROM bookmark ORDER BY updated_at DESC,id")?;
        let records = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut bookmarks = Vec::with_capacity(records.len());
        for (identity, record) in records {
            let bookmark: Bookmark = from_json(&record)?;
            validate_bookmark(&bookmark).map_err(|_| {
                AppError::new(
                    "STORAGE_INVALID",
                    "A stored bookmark is invalid. It was preserved.",
                )
            })?;
            if identity != bookmark_identity(&bookmark.anchor)? {
                return Err(AppError::new(
                    "STORAGE_INVALID",
                    "A stored bookmark identity is inconsistent. It was preserved.",
                ));
            }
            bookmarks.push(bookmark);
        }
        bookmarks.sort_by(|left, right| {
            timestamp(&right.updated_at)
                .cmp(&timestamp(&left.updated_at))
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(bookmarks)
    }

    pub fn save_bookmark(&mut self, bookmark: Bookmark) -> Result<Bookmark, AppError> {
        validate_bookmark(&bookmark)?;
        let identity = bookmark_identity(&bookmark.anchor)?;
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<Bookmark> = transaction
            .query_row(
                "SELECT json FROM bookmark WHERE id=?1",
                [&bookmark.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .as_deref()
            .map(from_json)
            .transpose()?;
        let matching: Option<Bookmark> = transaction
            .query_row(
                "SELECT json FROM bookmark WHERE identity=?1",
                [&identity],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .as_deref()
            .map(from_json)
            .transpose()?;
        if let Some(existing) = &previous {
            if bookmark_identity(&existing.anchor)? != identity
                || existing.created_at != bookmark.created_at
            {
                return Err(input_error(
                    "An existing bookmark cannot move or change its creation time.",
                ));
            }
        }
        if previous.is_some() && matching.as_ref().map(|record| &record.id) != Some(&bookmark.id) {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The bookmark identity is inconsistent.",
            ));
        }
        let saved = if let Some(existing) = &matching {
            if previous.is_none() {
                Bookmark {
                    updated_at: bookmark.updated_at.clone(),
                    ..existing.clone()
                }
            } else {
                bookmark
            }
        } else {
            bookmark
        };
        if let Some(existing) = &matching {
            if timestamp(&saved.updated_at) < timestamp(&existing.updated_at) {
                return Err(AppError::new(
                    "REVISION_CONFLICT",
                    "A newer bookmark is already saved.",
                ));
            }
        }
        validate_anchor_content(
            self.library.as_ref(),
            &saved.anchor,
            matching
                .as_ref()
                .or(previous.as_ref())
                .map(|record| &record.anchor),
        )?;
        transaction.execute(
            "INSERT INTO bookmark(id,identity,updated_at,json) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,json=excluded.json",
            params![saved.id, identity, saved.updated_at, json(&saved)?],
        )?;
        transaction.commit()?;
        Ok(saved)
    }

    pub fn delete_bookmark(&mut self, id: &str) -> Result<(), AppError> {
        if !uuid(id) {
            return Err(input_error("Choose a valid bookmark."));
        }
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("DELETE FROM bookmark WHERE id=?1", [id])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn list_highlights(&self) -> Result<Vec<Highlight>, AppError> {
        let mut statement = self
            .user
            .prepare("SELECT unit_key,json FROM highlight ORDER BY unit_key")?;
        let records = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut highlights = Vec::with_capacity(records.len());
        for (unit_key, record) in records {
            let highlight: Highlight = from_json(&record)?;
            validate_highlight(&highlight).map_err(|_| {
                AppError::new(
                    "STORAGE_INVALID",
                    "A saved highlight is invalid. It was preserved.",
                )
            })?;
            if highlight.anchor.unit_keys[0] != unit_key {
                return Err(AppError::new(
                    "STORAGE_INVALID",
                    "A saved highlight identity is inconsistent.",
                ));
            }
            highlights.push(highlight);
        }
        Ok(highlights)
    }

    pub fn save_highlights(
        &mut self,
        highlights: Vec<Highlight>,
    ) -> Result<Vec<Highlight>, AppError> {
        if highlights.is_empty() || highlights.len() > 200 {
            return Err(input_error("Select up to 200 verses to highlight."));
        }
        let mut keys = HashSet::new();
        let mut ids = HashSet::new();
        for highlight in &highlights {
            validate_highlight(highlight)?;
            if !keys.insert(&highlight.anchor.unit_keys[0]) || !ids.insert(&highlight.id) {
                return Err(input_error("Select each verse only once."));
            }
        }
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for highlight in &highlights {
            let key = &highlight.anchor.unit_keys[0];
            let previous_key: Option<String> = transaction
                .query_row(
                    "SELECT unit_key FROM highlight WHERE id=?1",
                    [&highlight.id],
                    |row| row.get(0),
                )
                .optional()?;
            if previous_key.as_ref().is_some_and(|stored| stored != key) {
                return Err(input_error(
                    "An existing highlight cannot move to another verse.",
                ));
            }
            let existing: Option<Highlight> = transaction
                .query_row(
                    "SELECT json FROM highlight WHERE unit_key=?1",
                    [key],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .as_deref()
                .map(from_json)
                .transpose()?;
            if let Some(previous) = &existing {
                if previous.id != highlight.id
                    || previous.created_at != highlight.created_at
                    || timestamp(&highlight.updated_at) < timestamp(&previous.updated_at)
                {
                    return Err(AppError::new(
                        "REVISION_CONFLICT",
                        "A newer highlight is already saved. Reload and retry.",
                    ));
                }
            }
            validate_anchor_content(
                self.library.as_ref(),
                &highlight.anchor,
                existing.as_ref().map(|item| &item.anchor),
            )?;
            transaction.execute(
                "INSERT INTO highlight(id,unit_key,updated_at,json) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,json=excluded.json",
                params![highlight.id, key, highlight.updated_at, json(highlight)?],
            )?;
        }
        transaction.commit()?;
        Ok(highlights)
    }

    pub fn delete_highlights(&mut self, ids: Vec<String>) -> Result<(), AppError> {
        if ids.is_empty()
            || ids.len() > 200
            || ids.iter().any(|id| !uuid(id))
            || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        {
            return Err(input_error("Choose valid highlights to remove."));
        }
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for id in ids {
            transaction.execute("DELETE FROM highlight WHERE id=?1", [id])?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn get_preferences(&self) -> Result<Preferences, AppError> {
        let record: Option<String> = self
            .user
            .query_row(
                "SELECT json FROM preference WHERE key='reader'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let preferences = match record {
            Some(value) => from_json(&value)?,
            None => Preferences::default(),
        };
        validate_preferences(&preferences)?;
        Ok(preferences)
    }

    pub fn save_preferences(&mut self, preferences: &Preferences) -> Result<(), AppError> {
        validate_preferences(preferences)?;
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("INSERT INTO preference(key,json) VALUES('reader',?1) ON CONFLICT(key) DO UPDATE SET json=excluded.json", [json(preferences)?])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn get_reading_position(&self) -> Result<Option<ReadingPosition>, AppError> {
        let mut statement = self.user.prepare("SELECT json FROM reading_position")?;
        let records = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let positions: Vec<ReadingPosition> = records
            .iter()
            .map(|record| from_json(record))
            .collect::<Result<_, _>>()?;
        Ok(positions.into_iter().max_by(|left, right| {
            timestamp(&left.updated_at)
                .cmp(&timestamp(&right.updated_at))
                .then_with(|| right.edition_id.cmp(&left.edition_id))
        }))
    }

    pub fn read_snapshot(&self) -> Result<PersonalSnapshot, AppError> {
        let transaction = self.user.unchecked_transaction()?;
        let snapshot = snapshot_from(&transaction)?;
        transaction.commit()?;
        Ok(snapshot)
    }

    pub fn database_id(&self) -> Result<String, AppError> {
        let id: String = self.user.query_row(
            "SELECT value FROM user_metadata WHERE key='database_id'",
            [],
            |row| row.get(0),
        )?;
        if !uuid(&id) {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The database identity is invalid.",
            ));
        }
        Ok(id)
    }

    pub fn export_backup(&self, created_at: &str) -> Result<Vec<u8>, AppError> {
        portable_backup(&self.read_snapshot()?, &self.database_id()?, created_at)
    }

    pub fn replace_snapshot(
        &mut self,
        snapshot: PersonalSnapshot,
        created_at: &str,
    ) -> Result<String, AppError> {
        validate_personal_snapshot(&snapshot)?;
        if timestamp(created_at).is_none() {
            return Err(AppError::new(
                "BACKUP_INVALID",
                "The restore timestamp is invalid.",
            ));
        }
        let database_id = self.database_id()?;
        // Check the imported payload's portable limits before touching the current records.
        portable_backup(&snapshot, &database_id, created_at)?;
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current = snapshot_from(&transaction)?;
        let recovery = portable_backup(&current, &database_id, created_at)?;
        let (recovery_name, recovery_path) = write_recovery_file(&self.directory, &recovery)?;
        transaction.execute_batch("DELETE FROM note; DELETE FROM bookmark; DELETE FROM highlight; DELETE FROM preference; DELETE FROM reading_position;")?;
        #[cfg(test)]
        if let Ok(marker) = std::env::var("AOB_RESTORE_INTERRUPTION_MARKER") {
            // Test-only pause after destructive SQL, before the transaction can commit.
            std::fs::write(marker, b"restore transaction open")
                .expect("interrupted-restore marker is writable");
            std::thread::sleep(Duration::from_secs(15));
        }
        for note in &snapshot.notes {
            transaction.execute(
                "INSERT INTO note(id,revision,updated_at,json) VALUES(?1,?2,?3,?4)",
                params![note.id, note.revision, note.updated_at, json(note)?],
            )?;
        }
        for bookmark in &snapshot.bookmarks {
            transaction.execute(
                "INSERT INTO bookmark(id,identity,updated_at,json) VALUES(?1,?2,?3,?4)",
                params![
                    bookmark.id,
                    bookmark_identity(&bookmark.anchor)?,
                    bookmark.updated_at,
                    json(bookmark)?
                ],
            )?;
        }
        for highlight in &snapshot.highlights {
            transaction.execute(
                "INSERT INTO highlight(id,unit_key,updated_at,json) VALUES(?1,?2,?3,?4)",
                params![
                    highlight.id,
                    highlight.anchor.unit_keys[0],
                    highlight.updated_at,
                    json(highlight)?
                ],
            )?;
        }
        for preference in &snapshot.preferences {
            transaction.execute(
                "INSERT INTO preference(key,json) VALUES('reader',?1)",
                [json(preference)?],
            )?;
        }
        for position in &snapshot.reading_positions {
            transaction.execute(
                "INSERT INTO reading_position(edition_id,updated_at,json) VALUES(?1,?2,?3)",
                params![position.edition_id, position.updated_at, json(position)?],
            )?;
        }
        transaction.execute("INSERT INTO user_metadata(key,value) VALUES('latest_recovery_file',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [recovery_name])?;
        transaction.commit()?;
        Ok(recovery_path.to_string_lossy().into_owned())
    }

    pub fn read_recovery_backup(&self) -> Result<Option<String>, AppError> {
        let name: Option<String> = self
            .user
            .query_row(
                "SELECT value FROM user_metadata WHERE key='latest_recovery_file'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let Some(name) = name else {
            return Ok(None);
        };
        if !name.starts_with("pre-restore-")
            || !name.ends_with(".json")
            || name.len() != 53
            || !name.as_bytes()[12..48]
                .iter()
                .all(|byte| byte.is_ascii_hexdigit() || *byte == b'-')
        {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The recovery file identity is invalid.",
            ));
        }
        let path = self.directory.join("recovery").join(name);
        let file = std::fs::File::open(&path)
            .map_err(|_| AppError::new("STORAGE_INVALID", "The recovery file is unavailable."))?;
        let metadata = file
            .metadata()
            .map_err(|_| AppError::new("STORAGE_INVALID", "The recovery file is unavailable."))?;
        if !metadata.is_file() {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The recovery file is not a regular file.",
            ));
        }
        if metadata.len() > 50 * 1024 * 1024 {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The recovery file exceeds the supported size.",
            ));
        }
        let mut bytes = Vec::new();
        file.take(50 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| {
                AppError::new("STORAGE_INVALID", "The recovery file could not be read.")
            })?;
        if bytes.len() > 50 * 1024 * 1024 {
            return Err(AppError::new(
                "STORAGE_INVALID",
                "The recovery file exceeds the supported size.",
            ));
        }
        let text = String::from_utf8(bytes).map_err(|_| {
            AppError::new(
                "STORAGE_INVALID",
                "The recovery file is not valid UTF-8 text.",
            )
        })?;
        Ok(Some(text))
    }

    pub fn save_reading_position(&mut self, position: &ReadingPosition) -> Result<(), AppError> {
        validate_reading_position(position)?;
        let transaction = self
            .user
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<String> = transaction
            .query_row(
                "SELECT json FROM reading_position WHERE edition_id=?1",
                [&position.edition_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(record) = previous {
            let existing: ReadingPosition = from_json(&record)?;
            if timestamp(&existing.updated_at) > timestamp(&position.updated_at) {
                return Ok(());
            }
        }
        transaction.execute("INSERT INTO reading_position(edition_id,updated_at,json) VALUES(?1,?2,?3) ON CONFLICT(edition_id) DO UPDATE SET updated_at=excluded.updated_at,json=excluded.json", params![position.edition_id, position.updated_at, json(position)?])?;
        transaction.commit()?;
        Ok(())
    }
}

#[cfg(feature = "development-content")]
fn prepare_fixture(directory: &Path) -> Result<std::path::PathBuf, AppError> {
    prepare_fixture_version(
        directory,
        FIXTURE_INDEX_BUILD_VERSION,
        FIXTURE_SEARCH_PROFILE_VERSION,
    )
}

#[cfg(feature = "development-content")]
fn prepare_fixture_version(
    directory: &Path,
    index_build_version: &str,
    search_profile_version: &str,
) -> Result<std::path::PathBuf, AppError> {
    const SOURCE: &str = include_str!("../../content/fixtures/sample.json");
    let source_hash = format!("{:x}", Sha256::digest(SOURCE.as_bytes()));
    let mut identity = Sha256::new();
    for component in [
        "afaan-oromo-bible-fixture",
        index_build_version,
        search_profile_version,
        &source_hash,
    ] {
        identity.update(component.as_bytes());
        identity.update([0]);
    }
    let artifact_key = format!("{:x}", identity.finalize());
    let content_directory = directory
        .join("content")
        .join(format!("fixture-{artifact_key}"));
    std::fs::create_dir_all(&content_directory).map_err(|_| {
        AppError::new(
            "WRITE_FAILED",
            "The development content directory could not be created.",
        )
    })?;
    let path = content_directory.join("library.sqlite");
    if path.exists() {
        let connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let stored: (String, String, String) = connection.query_row(
            "SELECT source_hash,index_build_version,search_profile_version FROM content_manifest",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        if stored
            != (
                source_hash,
                index_build_version.to_owned(),
                search_profile_version.to_owned(),
            )
        {
            return Err(AppError::new(
                "CONTENT_INVALID",
                "The development content identity does not match. The file was not modified.",
            ));
        }
        return Ok(path);
    }
    let fixture: FixturePack = serde_json::from_str(SOURCE).map_err(|_| {
        AppError::new(
            "CONTENT_INVALID",
            "The embedded development fixture is invalid.",
        )
    })?;
    if fixture.format_version != 1 || !fixture.edition.is_synthetic {
        return Err(AppError::new(
            "CONTENT_INVALID",
            "Only an explicitly synthetic development fixture may be seeded.",
        ));
    }
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary =
        content_directory.join(format!(".preparing-{}-{time}.sqlite", std::process::id()));
    let mut connection = Connection::open(&temporary)?;
    connection.execute_batch("PRAGMA foreign_keys=ON;
        CREATE TABLE content_manifest(source_hash TEXT NOT NULL,index_build_version TEXT NOT NULL,search_profile_version TEXT NOT NULL);
        CREATE TABLE edition(id TEXT PRIMARY KEY,json TEXT NOT NULL);
        CREATE TABLE book(edition_id TEXT NOT NULL,code TEXT NOT NULL,display_order INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(edition_id,code));
        CREATE TABLE chapter(edition_id TEXT NOT NULL,book_code TEXT NOT NULL,chapter_label TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(edition_id,book_code,chapter_label));
        CREATE TABLE verse_unit(unit_key TEXT UNIQUE NOT NULL,edition_id TEXT NOT NULL,book_code TEXT NOT NULL,book_name TEXT NOT NULL,chapter_label TEXT NOT NULL,verse_label TEXT NOT NULL,text_plain TEXT NOT NULL,book_order INTEGER NOT NULL,chapter_order INTEGER NOT NULL,unit_order INTEGER NOT NULL);
        CREATE VIRTUAL TABLE verse_search USING fts5(text,tokenize=\"ascii tokenchars ''''\");")?;
    let transaction = connection.transaction()?;
    transaction.execute("INSERT INTO content_manifest(source_hash,index_build_version,search_profile_version) VALUES(?1,?2,?3)", params![source_hash, index_build_version, search_profile_version])?;
    transaction.execute(
        "INSERT INTO edition(id,json) VALUES(?1,?2)",
        params![fixture.edition.id, json(&fixture.edition)?],
    )?;
    for book in &fixture.books {
        if book.edition_id != fixture.edition.id {
            return Err(AppError::new(
                "CONTENT_INVALID",
                "A fixture book has an invalid edition.",
            ));
        }
        transaction.execute(
            "INSERT INTO book(edition_id,code,display_order,json) VALUES(?1,?2,?3,?4)",
            params![book.edition_id, book.code, book.order, json(book)?],
        )?;
    }
    for chapter in &fixture.chapters {
        let book = fixture
            .books
            .iter()
            .find(|book| book.edition_id == chapter.edition_id && book.code == chapter.book_code)
            .ok_or_else(|| {
                AppError::new("CONTENT_INVALID", "A fixture chapter has an unknown book.")
            })?;
        let chapter_order = book
            .chapters
            .iter()
            .position(|label| label == &chapter.chapter_label)
            .ok_or_else(|| {
                AppError::new(
                    "CONTENT_INVALID",
                    "A fixture chapter is not listed in its book.",
                )
            })?;
        transaction.execute(
            "INSERT INTO chapter(edition_id,book_code,chapter_label,json) VALUES(?1,?2,?3,?4)",
            params![
                chapter.edition_id,
                chapter.book_code,
                chapter.chapter_label,
                json(chapter)?
            ],
        )?;
        for unit in &chapter.verse_units {
            if format!("{:x}", Sha256::digest(unit.text_plain.as_bytes())) != unit.text_digest {
                return Err(AppError::new(
                    "CONTENT_INVALID",
                    "A fixture verse-unit digest does not match its display text.",
                ));
            }
            transaction.execute("INSERT INTO verse_unit(unit_key,edition_id,book_code,book_name,chapter_label,verse_label,text_plain,book_order,chapter_order,unit_order) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)", params![unit.key, chapter.edition_id, chapter.book_code, book.name, chapter.chapter_label, unit.label, unit.text_plain, book.order, chapter_order, unit.order])?;
            transaction.execute(
                "INSERT INTO verse_search(rowid,text) VALUES(?1,?2)",
                params![
                    transaction.last_insert_rowid(),
                    normalize_search_text(&unit.text_plain)
                ],
            )?;
        }
    }
    transaction.commit()?;
    connection
        .close()
        .map_err(|(_, error)| AppError::from(error))?;
    std::fs::rename(&temporary, &path).map_err(|_| {
        AppError::new(
            "WRITE_FAILED",
            "The synthetic content database could not be published.",
        )
    })?;
    Ok(path)
}

#[cfg(all(test, feature = "development-content"))]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "oromo-bible-repository-{}-{nonce}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn mock_packaged_resources(root: &Path) -> PathBuf {
        let fixture = prepare_fixture(root).unwrap();
        let resources = root.join("test-only-packaged-content");
        std::fs::create_dir_all(&resources).unwrap();
        let database = resources.join("library.sqlite");
        std::fs::copy(fixture, &database).unwrap();
        {
            let connection = Connection::open(&database).unwrap();
            let edition_json: String = connection
                .query_row("SELECT json FROM edition", [], |row| row.get(0))
                .unwrap();
            let mut edition: Value = serde_json::from_str(&edition_json).unwrap();
            edition["isSynthetic"] = json!(false);
            edition["sourceTitle"] = json!("Invented test-only source");
            edition["rightsHolderName"] = json!("Test authors");
            edition["sourceArchiveSha256"] = json!("a".repeat(64));
            connection
                .execute("UPDATE edition SET json=?1", [edition.to_string()])
                .unwrap();
            connection.execute_batch("
                DROP TABLE content_manifest;
                CREATE TABLE content_manifest(format_version INTEGER,approval_status TEXT,search_profile_version TEXT,source_archive_sha256 TEXT,chapter_tree_sha256 TEXT,edition_id TEXT);
                INSERT INTO content_manifest VALUES(1,'approved','reviewed-latin-v1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','fixture-1','synthetic-development');
                CREATE TABLE source_notice(kind TEXT PRIMARY KEY,source_xml TEXT NOT NULL);
                INSERT INTO source_notice VALUES('copyright','<p>Invented test-only notice</p>');
            ").unwrap();
        }
        let manifest = json!({
            "formatVersion": 1, "approvalStatus": "approved", "approvalEvidenceId": "TEST-ONLY-NOT-A-RELEASE",
            "librarySha256": sha256_file(&database).unwrap(),
            "sourceArchiveSha256": "a".repeat(64), "editionId": "synthetic-development",
            "contentRevision": "fixture-1", "searchProfileVersion": "reviewed-latin-v1"
        });
        std::fs::write(
            resources.join("approved-content.json"),
            manifest.to_string(),
        )
        .unwrap();
        resources
    }

    #[test]
    fn packaged_content_gate_opens_verified_resource_and_keeps_user_db_separate() {
        let root = TestDirectory::new();
        let resources = mock_packaged_resources(&root.0);
        let profile = root.0.join("production-profile");
        let store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(store.list_editions().unwrap().len(), 1);
        assert_eq!(store.list_books("synthetic-development").unwrap().len(), 2);
        assert!(profile.join("user.sqlite").exists());
        assert!(!resources.join("user.sqlite").exists());
    }

    #[test]
    #[ignore = "requires AOB_TEST_REVIEWED_PACK_DIR; run explicitly with --ignored"]
    fn reviewed_builder_synthetic_pack_opens_when_supplied() {
        let resources = std::env::var_os("AOB_TEST_REVIEWED_PACK_DIR")
            .expect("Set AOB_TEST_REVIEWED_PACK_DIR when running this ignored test.");
        let root = TestDirectory::new();
        let profile = root.0.join("reviewed-builder-profile");
        let store = Repository::open_packaged(&profile, Path::new(&resources)).unwrap();
        let editions = store.list_editions().unwrap();
        assert_eq!(editions.len(), 1);
        assert_eq!(editions[0].id, "test-edition");
        let books = store.list_books("test-edition").unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].code, "TST");
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: "test-edition".into(),
                book_code: "TST".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        assert_eq!(chapter.verse_units.len(), 1);
        assert_eq!(chapter.verse_units[0].text_plain, "Synthetic source words.");
        let result = store
            .search(&SearchRequest {
                edition_id: "test-edition".into(),
                query: ParsedSearch {
                    clauses: vec![SearchClause {
                        tokens: vec!["synthetic".into()],
                        prefix: false,
                    }],
                },
                book_code: None,
                limit: Some(50),
                offset: Some(0),
            })
            .unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].unit_key, chapter.verse_units[0].key);
        assert!(profile.join("user.sqlite").is_file());
        assert!(!Path::new(&resources).join("user.sqlite").exists());
    }

    #[test]
    fn profile_lock_rejects_a_second_repository_and_recovery_until_close() {
        let root = TestDirectory::new();
        let profile = root.0.join("locked-profile");
        let unavailable_content = root.0.join("missing-content");
        let first = Repository::open_packaged(&profile, &unavailable_content).unwrap();
        let second = Repository::open_packaged(&profile, &unavailable_content)
            .err()
            .unwrap();
        assert_eq!(second.code, "STORAGE_IN_USE");
        let recovery = archive_corrupt_user_database(&profile).err().unwrap();
        assert_eq!(recovery.code, "STORAGE_IN_USE");
        drop(first);
        let reopened = Repository::open_packaged(&profile, &unavailable_content).unwrap();
        assert!(profile.join("user.sqlite").exists());
        drop(reopened);
    }

    #[test]
    #[ignore = "child process helper; invoked by the cross-process lock test"]
    fn profile_lock_child_helper() {
        let directory = std::env::var("AOB_PROFILE_LOCK_TEST_DIR")
            .expect("AOB_PROFILE_LOCK_TEST_DIR must be set by the parent test.");
        let directory = PathBuf::from(directory);
        let _lock = lock_profile(&directory).unwrap();
        std::fs::write(directory.join("lock-ready"), b"ready").unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !directory.join("lock-release").exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(directory.join("lock-release").exists());
    }

    #[test]
    fn another_process_cannot_archive_a_locked_corrupt_profile() {
        let root = TestDirectory::new();
        let profile = root.0.join("cross-process-corrupt-profile");
        std::fs::create_dir_all(&profile).unwrap();
        let original = b"synthetic corrupt SQLite bytes";
        std::fs::write(profile.join("user.sqlite"), original).unwrap();
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("--ignored")
            .arg("storage::tests::profile_lock_child_helper")
            .env("AOB_PROFILE_LOCK_TEST_DIR", &profile)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !profile.join("lock-ready").exists() && std::time::Instant::now() < deadline {
            if let Some(status) = child.try_wait().unwrap() {
                panic!("Profile lock helper exited before acquiring the lock: {status}");
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if !profile.join("lock-ready").exists() {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("Profile lock helper did not acquire the lock in time");
        }
        let open_error = Repository::open_packaged(&profile, &root.0.join("missing-content"))
            .err()
            .unwrap();
        let recovery_error = archive_corrupt_user_database(&profile).err().unwrap();
        std::fs::write(profile.join("lock-release"), b"release").unwrap();
        assert!(child.wait().unwrap().success());
        assert_eq!(open_error.code, "STORAGE_IN_USE");
        assert_eq!(recovery_error.code, "STORAGE_IN_USE");
        assert_eq!(
            std::fs::read(profile.join("user.sqlite")).unwrap(),
            original
        );
        let archive = archive_corrupt_user_database(&profile).unwrap();
        assert_eq!(
            std::fs::read(archive.join("user.sqlite")).unwrap(),
            original
        );
    }

    #[test]
    fn corrupt_user_database_is_reported_and_preserved() {
        let root = TestDirectory::new();
        let profile = root.0.join("corrupt-profile");
        std::fs::create_dir_all(&profile).unwrap();
        let path = profile.join("user.sqlite");
        let original = b"this is not a SQLite database";
        std::fs::write(&path, original).unwrap();
        let wal = b"invalid WAL to preserve";
        std::fs::write(profile.join("user.sqlite-wal"), wal).unwrap();
        let error = Repository::open_packaged(&profile, &root.0.join("missing-content"))
            .err()
            .unwrap();
        assert_eq!(error.code, "STORAGE_CORRUPT");
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(std::fs::read(profile.join("user.sqlite-wal")).unwrap(), wal);
    }

    #[test]
    fn explicit_corrupt_recovery_archives_bytes_and_creates_new_user_store() {
        let root = TestDirectory::new();
        let profile = root.0.join("corrupt-recovery-profile");
        std::fs::create_dir_all(&profile).unwrap();
        let original = b"this is not a SQLite database";
        std::fs::write(profile.join("user.sqlite"), original).unwrap();
        let wal = b"unreadable wal bytes";
        std::fs::write(profile.join("user.sqlite-wal"), wal).unwrap();
        let archive = archive_corrupt_user_database(&profile).unwrap();
        assert_eq!(
            std::fs::read(archive.join("user.sqlite")).unwrap(),
            original
        );
        assert_eq!(std::fs::read(archive.join("user.sqlite-wal")).unwrap(), wal);
        assert!(!profile.join("user.sqlite-wal").exists());
        let store = Repository::open_packaged(&profile, &root.0.join("missing-content")).unwrap();
        assert!(store.read_snapshot().unwrap().notes.is_empty());
        assert!(archive_corrupt_user_database(&profile).is_err());
        assert_eq!(
            std::fs::read(archive.join("user.sqlite")).unwrap(),
            original
        );
    }

    #[test]
    fn packaged_content_gate_rejects_unapproved_resources_but_keeps_personal_data_available() {
        let root = TestDirectory::new();
        let resources = mock_packaged_resources(&root.0);
        let profile = root.0.join("production-profile");
        let manifest_path = resources.join("approved-content.json");
        let original: Value =
            serde_json::from_slice(&std::fs::read(&manifest_path).unwrap()).unwrap();
        let mut unapproved = original.clone();
        unapproved["approvalStatus"] = json!("technical_only");
        std::fs::write(&manifest_path, unapproved.to_string()).unwrap();
        let mut store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        store.save_note(note()).unwrap();
        assert_eq!(store.read_snapshot().unwrap().notes.len(), 1);
        assert!(profile.join("user.sqlite").exists());
        drop(store);
        let mut unsupported_profile = original.clone();
        unsupported_profile["searchProfileVersion"] = json!("reviewed-unimplemented-v2");
        std::fs::write(&manifest_path, unsupported_profile.to_string()).unwrap();
        let store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        assert_eq!(store.read_snapshot().unwrap().notes.len(), 1);
        drop(store);
        std::fs::write(&manifest_path, original.to_string()).unwrap();
        let connection = Connection::open(resources.join("library.sqlite")).unwrap();
        connection
            .execute(
                "UPDATE content_manifest SET approval_status='technical_only'",
                [],
            )
            .unwrap();
        drop(connection);
        let mut updated = original;
        updated["librarySha256"] = json!(sha256_file(&resources.join("library.sqlite")).unwrap());
        std::fs::write(&manifest_path, updated.to_string()).unwrap();
        let store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        assert_eq!(store.read_snapshot().unwrap().notes.len(), 1);
    }

    #[test]
    fn packaged_content_gate_reports_missing_or_tampered_content_without_erasing_notes() {
        let root = TestDirectory::new();
        let profile = root.0.join("production-profile");
        let absent = root.0.join("no-packaged-content");
        let mut store = Repository::open_packaged(&profile, &absent).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        store.save_note(note()).unwrap();
        drop(store);
        let resources = mock_packaged_resources(&root.0);
        let database = resources.join("library.sqlite");
        std::fs::OpenOptions::new()
            .append(true)
            .open(&database)
            .unwrap()
            .write_all(b"tampered")
            .unwrap();
        let store = Repository::open_packaged(&profile, &resources).unwrap();
        assert_eq!(
            store.list_editions().err().unwrap().code,
            "CONTENT_UNAVAILABLE"
        );
        assert_eq!(store.read_snapshot().unwrap().notes.len(), 1);
    }

    #[test]
    fn restored_links_remain_editable_and_exportable_without_their_edition() {
        let root = TestDirectory::new();
        let fixture_profile = root.0.join("fixture-profile");
        let source = Repository::open(&fixture_profile).unwrap();
        let edition = source.list_editions().unwrap().remove(0);
        let chapter = source
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let unit = &chapter.verse_units[0];
        let address = VerseAddress {
            book_code: "TSA".into(),
            chapter_label: "1".into(),
            verse_label: unit.label.clone(),
        };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(),
            edition_id: edition.id,
            versification_id: edition.versification_id,
            content_revision: edition.content_revision,
            start: address.clone(),
            end: address,
            unit_keys: vec![unit.key.clone()],
            selected_text_digests: vec![unit.text_digest.clone()],
            display_reference_snapshot: "Sample Book A 1:1".into(),
            created_at: "2026-10-24T10:00:00.000Z".into(),
        };
        let mut linked = note();
        linked.revision = 1;
        linked.anchor = Some(anchor.clone());
        let bookmark = Bookmark {
            id: "c0b4bb0d-413d-49cf-b27d-56891876a7d2".into(),
            anchor: anchor.clone(),
            label: "Original label".into(),
            created_at: anchor.created_at.clone(),
            updated_at: anchor.created_at.clone(),
        };
        let restored = PersonalSnapshot {
            notes: vec![linked.clone()],
            bookmarks: vec![bookmark.clone()],
            highlights: vec![],
            preferences: vec![],
            reading_positions: vec![],
        };
        let profile = root.0.join("missing-edition-profile");
        let mut store =
            Repository::open_packaged(&profile, &root.0.join("absent-resources")).unwrap();
        assert_eq!(
            store.list_editions().unwrap_err().code,
            "CONTENT_UNAVAILABLE"
        );
        store
            .replace_snapshot(restored, "2026-10-24T10:01:00.000Z")
            .unwrap();
        linked.body_text = "Edited while content is unavailable".into();
        linked.updated_at = "2026-10-24T10:02:00.000Z".into();
        let saved_note = store.save_note(linked).unwrap();
        let saved_bookmark = store
            .save_bookmark(Bookmark {
                label: "Edited while offline".into(),
                updated_at: "2026-10-24T10:02:00.000Z".into(),
                ..bookmark
            })
            .unwrap();
        assert_eq!(saved_note.anchor, Some(anchor.clone()));
        assert_eq!(saved_bookmark.anchor, anchor.clone());
        let exported = store.export_backup("2026-10-24T10:03:00.000Z").unwrap();
        let backup: Value = serde_json::from_slice(&exported).unwrap();
        assert_eq!(
            backup["requiredEditions"][0]["editionId"],
            anchor.edition_id
        );
        assert_eq!(backup["data"]["anchors"][0]["id"], anchor.id);
        drop(store);
        let reopened =
            Repository::open_packaged(&profile, &root.0.join("absent-resources")).unwrap();
        assert_eq!(
            json(&reopened.list_notes().unwrap()).unwrap(),
            json(&vec![saved_note]).unwrap()
        );
        assert_eq!(
            json(&reopened.list_bookmarks().unwrap()).unwrap(),
            json(&vec![saved_bookmark]).unwrap()
        );
    }

    fn note() -> Note {
        Note {
            id: "1ba9139d-41dd-4f2a-bd11-09738a9e4970".into(),
            title: "Private development note".into(),
            body_text: "A local test draft, not Scripture.".into(),
            anchor: None,
            created_at: "2026-10-19T12:00:00.000Z".into(),
            updated_at: "2026-10-19T12:00:00.000Z".into(),
            revision: 0,
        }
    }

    fn search(tokens: &[&str], prefix: bool) -> SearchRequest {
        SearchRequest {
            edition_id: "synthetic-development".into(),
            query: ParsedSearch {
                clauses: vec![SearchClause {
                    tokens: tokens.iter().map(|token| token.to_string()).collect(),
                    prefix,
                }],
            },
            book_code: None,
            limit: Some(50),
            offset: Some(0),
        }
    }

    #[test]
    fn fixture_opens_read_only_and_preserves_bridges_and_source_text() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        let edition = &store.list_editions().unwrap()[0];
        assert!(edition.is_synthetic);
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let bridge = chapter
            .verse_units
            .iter()
            .find(|unit| unit.label == "2-3")
            .unwrap();
        assert!(bridge.text_plain.contains("WAaqaa ga’ee café"));
        assert_eq!(
            chapter.reference_lookup.get("2"),
            chapter.reference_lookup.get("3")
        );
        let error = store
            .library
            .as_ref()
            .unwrap()
            .execute("DELETE FROM edition", [])
            .unwrap_err();
        assert!(
            matches!(error, rusqlite::Error::SqliteFailure(inner, _) if inner.code == rusqlite::ErrorCode::ReadOnly)
        );
        assert_eq!(store.list_editions().unwrap().len(), 1);
    }

    #[test]
    fn changing_index_build_or_search_profile_creates_a_new_immutable_artifact() {
        let directory = TestDirectory::new();
        let original =
            prepare_fixture_version(&directory.0, "test-build-1", "test-profile-1").unwrap();
        let index_changed =
            prepare_fixture_version(&directory.0, "test-build-2", "test-profile-1").unwrap();
        let profile_changed =
            prepare_fixture_version(&directory.0, "test-build-1", "test-profile-2").unwrap();
        assert_ne!(original, index_changed);
        assert_ne!(original, profile_changed);
        assert!(original.exists() && index_changed.exists() && profile_changed.exists());
        assert_eq!(
            original,
            prepare_fixture_version(&directory.0, "test-build-1", "test-profile-1").unwrap()
        );
        let current =
            Connection::open_with_flags(index_changed, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let version: String = current
            .query_row(
                "SELECT index_build_version FROM content_manifest",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, "test-build-2");
    }

    #[test]
    fn native_fts_supports_phrases_prefixes_and_distinct_apostrophes() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        assert_eq!(
            store
                .search(&search(&["careful", "reading"], false))
                .unwrap()
                .total,
            3
        );
        assert_eq!(store.search(&search(&["read"], true)).unwrap().total, 3);
        let apostrophe = store.search(&search(&["ga'ee"], false)).unwrap();
        assert_eq!(apostrophe.total, 1);
        assert_eq!(apostrophe.items[0].verse_label, "2-3");
        let modifier_letter = store.search(&search(&["gaʼee"], false)).unwrap();
        assert_eq!(modifier_letter.total, 1);
        assert_eq!(modifier_letter.items[0].chapter_label, "2");
        assert_eq!(store.search(&search(&["café"], false)).unwrap().total, 1);
        assert_eq!(store.search(&search(&["cafe"], false)).unwrap().total, 1);
        let mut page = search(&["synthetic"], false);
        page.limit = Some(2);
        let first = store.search(&page).unwrap();
        assert_eq!(first.items.len(), 2);
        assert!(first.has_more);
        page.offset = Some(2);
        assert_ne!(
            first.items[0].unit_key,
            store.search(&page).unwrap().items[0].unit_key
        );
        assert_eq!(
            store
                .search(&search(&["reading\" OR synthetic"], false))
                .unwrap_err()
                .code,
            "QUERY_INVALID"
        );
        assert_eq!(
            store.search(&search(&["r"], true)).unwrap_err().code,
            "QUERY_INVALID"
        );
    }

    #[test]
    fn bounded_search_profile_matches_browser_vectors_without_modifying_display() {
        assert_eq!(
            normalize_search_text("  'WAaqaa' GA’EE CAFE\u{301}  "),
            "waaqaa ga'ee café"
        );
        assert_eq!(normalize_search_text("GAʼEE"), "gaʼee");
        assert_ne!(
            normalize_search_text("gaʼee"),
            normalize_search_text("ga’ee")
        );
        assert_eq!(normalize_search_text("a\u{0301} aa bba"), "á aa bba");
        assert_eq!(normalize_search_text("Σ"), "Σ"); // Not full Unicode case folding.
    }

    #[test]
    fn committed_notes_survive_reopen_and_stale_revisions_do_not_overwrite() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut saved = store.save_note(note()).unwrap();
        assert_eq!(saved.revision, 1);
        let stale = saved.clone();
        saved.body_text = "The newest local draft.".into();
        saved.updated_at = "2026-10-19T12:00:01.000Z".into();
        let committed = store.save_note(saved).unwrap();
        assert_eq!(committed.revision, 2);
        assert_eq!(
            store.save_note(stale).unwrap_err().code,
            "REVISION_CONFLICT"
        );
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        let persisted = reopened.list_notes().unwrap();
        assert_eq!(persisted.len(), 1);
        assert_eq!(persisted[0].body_text, "The newest local draft.");
        assert_eq!(persisted[0].revision, 2);
        let snapshot = reopened.read_snapshot().unwrap();
        assert_eq!(snapshot.notes.len(), 1);
        assert_eq!(snapshot.notes[0].revision, 2);
        assert!(snapshot.bookmarks.is_empty());
    }

    #[test]
    fn restore_replaces_records_atomically_after_a_durable_recovery_file() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let original = store.save_note(note()).unwrap();
        let database_id = store.database_id().unwrap();
        let before = store.read_snapshot().unwrap();
        let empty = PersonalSnapshot {
            notes: vec![],
            ..before.clone()
        };
        let recovery_path = store
            .replace_snapshot(empty, "2026-10-24T10:00:00.000Z")
            .unwrap();
        assert!(Path::new(&recovery_path).is_file());
        assert_eq!(
            std::fs::read(&recovery_path).unwrap(),
            store.read_recovery_backup().unwrap().unwrap().as_bytes()
        );
        let recovery_text = store.read_recovery_backup().unwrap().unwrap();
        let recovery: Value = serde_json::from_str(&recovery_text).unwrap();
        assert_eq!(recovery["sourceDatabaseId"], database_id);
        assert_eq!(recovery["data"]["notes"][0]["id"], original.id);
        assert_eq!(recovery["data"]["notes"][0]["anchorId"], Value::Null);
        assert!(store.read_snapshot().unwrap().notes.is_empty());

        store.user.execute_batch("CREATE TRIGGER fail_restore BEFORE INSERT ON note BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
        assert_eq!(
            store
                .replace_snapshot(before.clone(), "2026-10-24T10:00:01.000Z")
                .unwrap_err()
                .code,
            "WRITE_FAILED"
        );
        assert!(store.read_snapshot().unwrap().notes.is_empty());
        assert_eq!(
            store.read_recovery_backup().unwrap().unwrap(),
            recovery_text
        );
        store
            .user
            .execute_batch("DROP TRIGGER fail_restore;")
            .unwrap();
        store
            .replace_snapshot(before, "2026-10-24T10:00:02.000Z")
            .unwrap();
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        assert_eq!(reopened.database_id().unwrap(), database_id);
        assert_eq!(reopened.read_snapshot().unwrap().notes[0].id, original.id);
    }

    #[test]
    #[ignore = "child process helper; invoked by the interrupted-restore test"]
    fn interrupted_restore_child_helper() {
        let profile = std::env::var("AOB_RESTORE_INTERRUPTION_PROFILE")
            .expect("AOB_RESTORE_INTERRUPTION_PROFILE must be set by the parent test.");
        let mut store = Repository::open(Path::new(&profile)).unwrap();
        let current = store.read_snapshot().unwrap();
        let empty = PersonalSnapshot {
            notes: vec![],
            ..current
        };
        // The test-only marker inside replace_snapshot signals the parent to stop this process.
        let _ = store.replace_snapshot(empty, "2026-10-24T10:00:00.000Z");
        panic!("interrupted restore helper should have been killed before commit");
    }

    #[test]
    fn killed_process_rolls_back_restore_after_delete_before_commit() {
        let root = TestDirectory::new();
        let profile = root.0.join("interrupted-restore-profile");
        let mut store = Repository::open(&profile).unwrap();
        store.save_note(note()).unwrap();
        let before = json(&store.read_snapshot().unwrap()).unwrap();
        drop(store);

        let marker = root.0.join("restore-in-transaction");
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("--ignored")
            .arg("storage::tests::interrupted_restore_child_helper")
            .env("AOB_RESTORE_INTERRUPTION_PROFILE", &profile)
            .env("AOB_RESTORE_INTERRUPTION_MARKER", &marker)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !marker.exists() && std::time::Instant::now() < deadline {
            if let Some(status) = child.try_wait().unwrap() {
                panic!("Restore helper exited before opening its transaction: {status}");
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if !marker.exists() {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("Restore helper did not reach the open transaction");
        }
        child.kill().unwrap();
        child.wait().unwrap();

        let reopened = Repository::open(&profile).unwrap();
        assert_eq!(json(&reopened.read_snapshot().unwrap()).unwrap(), before);
        let integrity: String = reopened
            .user
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        assert!(reopened.read_recovery_backup().unwrap().is_none());
        let recovery_files = std::fs::read_dir(profile.join("recovery"))
            .unwrap()
            .collect::<std::io::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(recovery_files.len(), 1);
        let recovery: Value =
            serde_json::from_slice(&std::fs::read(recovery_files[0].path()).unwrap()).unwrap();
        assert_eq!(recovery["data"]["notes"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn restore_keeps_original_records_when_recovery_file_cannot_be_created() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let original = store.save_note(note()).unwrap();
        let current = store.read_snapshot().unwrap();
        let replacement = PersonalSnapshot {
            notes: vec![],
            ..current.clone()
        };
        std::fs::write(directory.0.join("recovery"), b"synthetic obstruction").unwrap();
        let error = store
            .replace_snapshot(replacement, "2026-10-24T10:00:00.000Z")
            .unwrap_err();
        assert_eq!(error.code, "WRITE_FAILED");
        assert_eq!(
            json(&store.read_snapshot().unwrap().notes).unwrap(),
            json(&vec![original]).unwrap()
        );
        assert_eq!(
            std::fs::read(directory.0.join("recovery")).unwrap(),
            b"synthetic obstruction"
        );
    }

    #[test]
    fn portable_backup_separates_shared_anchor_from_linked_records() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let unit = &chapter.verse_units[0];
        let address = VerseAddress {
            book_code: "TSA".into(),
            chapter_label: "1".into(),
            verse_label: unit.label.clone(),
        };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(),
            edition_id: edition.id.clone(),
            versification_id: edition.versification_id.clone(),
            content_revision: edition.content_revision.clone(),
            start: address.clone(),
            end: address,
            unit_keys: vec![unit.key.clone()],
            selected_text_digests: vec![unit.text_digest.clone()],
            display_reference_snapshot: "Sample Book A 1:1".into(),
            created_at: "2026-10-24T10:00:00.000Z".into(),
        };
        let mut linked_note = note();
        linked_note.revision = 1;
        linked_note.anchor = Some(anchor.clone());
        let bookmark = Bookmark {
            id: "c0b4bb0d-413d-49cf-b27d-56891876a7d2".into(),
            anchor: anchor.clone(),
            label: String::new(),
            created_at: anchor.created_at.clone(),
            updated_at: anchor.created_at.clone(),
        };
        let snapshot = PersonalSnapshot {
            notes: vec![linked_note],
            bookmarks: vec![bookmark],
            highlights: vec![],
            preferences: vec![],
            reading_positions: vec![],
        };
        let bytes = portable_backup(
            &snapshot,
            &store.database_id().unwrap(),
            "2026-10-24T10:00:01.000Z",
        )
        .unwrap();
        let backup: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(backup["data"]["anchors"].as_array().unwrap().len(), 1);
        assert_eq!(backup["data"]["notes"][0]["anchorId"], anchor.id);
        assert!(backup["data"]["notes"][0].get("anchor").is_none());
        assert_eq!(backup["data"]["bookmarks"][0]["anchorId"], anchor.id);
        assert_eq!(backup["requiredEditions"][0]["editionId"], edition.id);
        assert!(!String::from_utf8(bytes).unwrap().contains(&unit.text_plain));
    }

    #[test]
    fn full_personal_snapshot_survives_clean_profile_replacement_and_reopen() {
        let root = TestDirectory::new();
        let source_profile = root.0.join("full-source");
        let mut source = Repository::open(&source_profile).unwrap();
        let edition = source.list_editions().unwrap().remove(0);
        let chapter = source
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let unit = &chapter.verse_units[1];
        let address = VerseAddress {
            book_code: "TSA".into(),
            chapter_label: "1".into(),
            verse_label: unit.label.clone(),
        };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(),
            edition_id: edition.id.clone(),
            versification_id: edition.versification_id.clone(),
            content_revision: edition.content_revision.clone(),
            start: address.clone(),
            end: address,
            unit_keys: vec![unit.key.clone()],
            selected_text_digests: vec![unit.text_digest.clone()],
            display_reference_snapshot: "Sample Book A 1:2-3".into(),
            created_at: "2026-10-24T10:00:00.000Z".into(),
        };
        let mut linked = note();
        linked.revision = 1;
        linked.anchor = Some(anchor.clone());
        let mut standalone = note();
        standalone.id = "c0b4bb0d-413d-49cf-b27d-56891876a7d2".into();
        standalone.title = "Standalone private note".into();
        standalone.revision = 1;
        let snapshot = PersonalSnapshot {
            notes: vec![linked, standalone],
            bookmarks: vec![Bookmark {
                id: "416b23af-2dce-4f54-93b6-8b14bc8045b7".into(),
                anchor: anchor.clone(),
                label: "Return to bridge".into(),
                created_at: anchor.created_at.clone(),
                updated_at: anchor.created_at.clone(),
            }],
            highlights: vec![Highlight {
                id: "0f29fd12-969b-49e7-93a0-637521289c55".into(),
                anchor: anchor.clone(),
                color_token: "yellow".into(),
                created_at: anchor.created_at.clone(),
                updated_at: anchor.created_at.clone(),
            }],
            preferences: vec![Preferences {
                ui_locale: "om".into(),
                theme: "dark".into(),
                font_size_px: 22.0,
                line_height: 1.9,
                width: "wide".into(),
            }],
            reading_positions: vec![ReadingPosition {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
                verse_label: Some(unit.label.clone()),
                updated_at: "2026-10-24T10:00:01.000Z".into(),
            }],
        };
        source
            .replace_snapshot(snapshot.clone(), "2026-10-24T10:00:02.000Z")
            .unwrap();
        let exported: Value =
            serde_json::from_slice(&source.export_backup("2026-10-24T10:00:03.000Z").unwrap())
                .unwrap();
        assert_eq!(exported["data"]["notes"].as_array().unwrap().len(), 2);
        assert_eq!(exported["data"]["anchors"].as_array().unwrap().len(), 1);
        for table in ["bookmarks", "highlights", "preferences", "readingPositions"] {
            assert_eq!(exported["data"][table].as_array().unwrap().len(), 1);
        }
        assert_eq!(exported["requiredEditions"][0]["editionId"], edition.id);
        assert!(!exported.to_string().contains(&unit.text_plain));

        let target_profile = root.0.join("full-clean-target");
        let missing_content = root.0.join("missing-content");
        let mut target = Repository::open_packaged(&target_profile, &missing_content).unwrap();
        let recovery_path = target
            .replace_snapshot(snapshot.clone(), "2026-10-24T10:00:04.000Z")
            .unwrap();
        assert!(Path::new(&recovery_path).is_file());
        assert_eq!(
            json(&target.read_snapshot().unwrap()).unwrap(),
            json(&snapshot).unwrap()
        );
        drop(target);
        let reopened = Repository::open_packaged(&target_profile, &missing_content).unwrap();
        assert_eq!(
            json(&reopened.read_snapshot().unwrap()).unwrap(),
            json(&snapshot).unwrap()
        );
        assert_eq!(
            reopened.list_editions().unwrap_err().code,
            "CONTENT_UNAVAILABLE"
        );
    }

    #[test]
    fn bookmarks_deduplicate_and_survive_reopen_with_exact_anchor() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let unit = &chapter.verse_units[1];
        let address = VerseAddress {
            book_code: "TSA".into(),
            chapter_label: "1".into(),
            verse_label: unit.label.clone(),
        };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(),
            edition_id: edition.id,
            versification_id: edition.versification_id,
            content_revision: edition.content_revision,
            start: address.clone(),
            end: address,
            unit_keys: vec![unit.key.clone()],
            selected_text_digests: vec![unit.text_digest.clone()],
            display_reference_snapshot: "Sample Book A 1:2-3".into(),
            created_at: "2026-10-24T10:00:00.000Z".into(),
        };
        let first = Bookmark {
            id: "1ba9139d-41dd-4f2a-bd11-09738a9e4970".into(),
            anchor: anchor.clone(),
            label: "Return here".into(),
            created_at: "2026-10-24T10:00:00.000Z".into(),
            updated_at: "2026-10-24T10:00:00.000Z".into(),
        };
        let saved = store.save_bookmark(first.clone()).unwrap();
        let duplicate = store
            .save_bookmark(Bookmark {
                id: "c0b4bb0d-413d-49cf-b27d-56891876a7d2".into(),
                anchor: VerseAnchor {
                    id: "416b23af-2dce-4f54-93b6-8b14bc8045b7".into(),
                    ..anchor
                },
                label: String::new(),
                created_at: "2026-10-24T10:00:01.000Z".into(),
                updated_at: "2026-10-24T10:00:01.000Z".into(),
            })
            .unwrap();
        assert_eq!(duplicate.id, saved.id);
        assert_eq!(duplicate.label, "Return here");
        assert_eq!(store.list_bookmarks().unwrap().len(), 1);
        let edited = store
            .save_bookmark(Bookmark {
                label: "Edited label".into(),
                updated_at: "2026-10-24T10:00:02.000Z".into(),
                ..duplicate
            })
            .unwrap();
        assert_eq!(
            store.save_bookmark(first).unwrap_err().code,
            "REVISION_CONFLICT"
        );
        drop(store);
        let mut reopened = Repository::open(&directory.0).unwrap();
        assert_eq!(reopened.list_bookmarks().unwrap()[0].label, edited.label);
        reopened.delete_bookmark(&edited.id).unwrap();
        assert!(reopened.list_bookmarks().unwrap().is_empty());
    }

    #[test]
    fn highlight_batch_recolors_atomically_and_survives_reopen() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let now = "2026-10-24T10:00:00.000Z".to_string();
        let ids = [
            "1ba9139d-41dd-4f2a-bd11-09738a9e4970",
            "68f67ff0-4f3d-4990-92d2-02381f499c92",
        ];
        let records: Vec<Highlight> = chapter
            .verse_units
            .iter()
            .take(2)
            .enumerate()
            .map(|(index, unit)| {
                let address = VerseAddress {
                    book_code: "TSA".into(),
                    chapter_label: "1".into(),
                    verse_label: unit.label.clone(),
                };
                Highlight {
                    id: ids[index].into(),
                    anchor: VerseAnchor {
                        id: if index == 0 {
                            "c0b4bb0d-413d-49cf-b27d-56891876a7d2"
                        } else {
                            "416b23af-2dce-4f54-93b6-8b14bc8045b7"
                        }
                        .into(),
                        edition_id: edition.id.clone(),
                        versification_id: edition.versification_id.clone(),
                        content_revision: edition.content_revision.clone(),
                        start: address.clone(),
                        end: address,
                        unit_keys: vec![unit.key.clone()],
                        selected_text_digests: vec![unit.text_digest.clone()],
                        display_reference_snapshot: format!("Sample Book A 1:{}", unit.label),
                        created_at: now.clone(),
                    },
                    color_token: "yellow".into(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                }
            })
            .collect();
        store.save_highlights(records.clone()).unwrap();
        let mut recolored = records[0].clone();
        recolored.color_token = "blue".into();
        recolored.updated_at = "2026-10-24T10:00:01.000Z".into();
        store.save_highlights(vec![recolored.clone()]).unwrap();
        let mut moved = recolored.clone();
        moved.anchor = records[1].anchor.clone();
        assert_eq!(
            store.save_highlights(vec![moved]).unwrap_err().code,
            "INPUT_INVALID"
        );
        let mut attempted = recolored.clone();
        attempted.color_token = "rose".into();
        attempted.updated_at = "2026-10-24T10:00:02.000Z".into();
        let mut conflicting = records[1].clone();
        conflicting.id = "7c0c38bd-b91e-4a43-b615-e50140364ab9".into();
        assert_eq!(
            store
                .save_highlights(vec![attempted, conflicting])
                .unwrap_err()
                .code,
            "REVISION_CONFLICT"
        );
        drop(store);
        let mut reopened = Repository::open(&directory.0).unwrap();
        let saved = reopened.list_highlights().unwrap();
        assert_eq!(saved.len(), 2);
        assert_eq!(
            saved
                .iter()
                .find(|item| item.id == recolored.id)
                .unwrap()
                .color_token,
            "blue"
        );
        // Model a record retained from an older content revision, then require
        // the explicit replacement anchor to resolve against installed content.
        let mut stale = recolored.clone();
        stale.anchor.content_revision = "prior-source-revision".into();
        reopened
            .user
            .execute(
                "UPDATE highlight SET json=?1 WHERE id=?2",
                params![json(&stale).unwrap(), stale.id],
            )
            .unwrap();
        assert_eq!(reopened.list_highlights().unwrap()[0].anchor, stale.anchor);
        let mut invalid_reanchor = stale.clone();
        invalid_reanchor.anchor.id = "86edbc54-962d-481d-b7cf-5a3987aacbb7".into();
        invalid_reanchor.updated_at = "2026-10-24T10:00:02.000Z".into();
        assert_eq!(
            reopened
                .save_highlights(vec![invalid_reanchor])
                .unwrap_err()
                .code,
            "INPUT_INVALID"
        );
        assert_eq!(reopened.list_highlights().unwrap()[0].anchor, stale.anchor);
        let mut reanchored = recolored.clone();
        reanchored.updated_at = "2026-10-24T10:00:02.000Z".into();
        let saved_reanchor = reopened.save_highlights(vec![reanchored.clone()]).unwrap();
        assert_eq!(saved_reanchor[0].id, reanchored.id);
        assert_eq!(saved_reanchor[0].anchor, reanchored.anchor);
        assert_eq!(
            reopened.list_highlights().unwrap()[0].anchor,
            reanchored.anchor
        );
        reopened
            .delete_highlights(ids.iter().map(|id| (*id).into()).collect())
            .unwrap();
        assert!(reopened.list_highlights().unwrap().is_empty());
    }

    #[test]
    fn new_links_require_exact_units_but_unchanged_unavailable_links_survive() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        let chapter = store
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: "TSA".into(),
                chapter_label: "1".into(),
            })
            .unwrap();
        let selected = &chapter.verse_units[1];
        let address = VerseAddress {
            book_code: "TSA".into(),
            chapter_label: "1".into(),
            verse_label: selected.label.clone(),
        };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(),
            edition_id: edition.id,
            versification_id: edition.versification_id,
            content_revision: edition.content_revision,
            start: address.clone(),
            end: address,
            unit_keys: vec![selected.key.clone()],
            selected_text_digests: vec![selected.text_digest.clone()],
            display_reference_snapshot: "Test Passage A 1:2-3".into(),
            created_at: "2026-10-19T12:00:00Z".into(),
        };
        let mut linked = note();
        linked.anchor = Some(anchor.clone());
        let mut invalid = linked.clone();
        invalid.anchor.as_mut().unwrap().unit_keys[0] = "not-a-reference".into();
        assert_eq!(store.save_note(invalid).unwrap_err().code, "INPUT_INVALID");
        let saved = store.save_note(linked).unwrap();
        // Swap only the private test handle to model an absent edition while
        // retaining the same real user database and its committed personal data.
        store.library = Some(Connection::open_in_memory().unwrap());
        store
            .library
            .as_ref()
            .unwrap()
            .execute_batch("CREATE TABLE edition(id TEXT PRIMARY KEY,json TEXT NOT NULL);")
            .unwrap();
        let mut revised = saved;
        revised.body_text = "Still editable without its Scripture edition.".into();
        revised.updated_at = "2026-10-19T12:00:01Z".into();
        assert_eq!(
            store.save_note(revised).unwrap().anchor,
            Some(anchor.clone())
        );
        let mut reassigned = store.list_notes().unwrap().remove(0);
        reassigned.anchor.as_mut().unwrap().id = "59f893fb-02aa-425e-8a91-7505dcdf936f".into();
        assert_eq!(
            store.save_note(reassigned).unwrap_err().code,
            "CONTENT_UNAVAILABLE"
        );
        assert_eq!(store.list_notes().unwrap()[0].anchor, Some(anchor));
    }

    #[test]
    fn failed_note_transaction_preserves_previous_record_and_draft_revision() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut saved = store.save_note(note()).unwrap();
        store.user.execute_batch("CREATE TRIGGER injected_write_failure BEFORE UPDATE ON note BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        saved.body_text = "This draft must remain unsaved.".into();
        assert_eq!(
            store.save_note(saved.clone()).unwrap_err().code,
            "WRITE_FAILED"
        );
        let previous = &store.list_notes().unwrap()[0];
        assert_eq!(previous.revision, 1);
        assert_eq!(previous.body_text, note().body_text);
        assert_eq!(saved.revision, 1);
    }

    #[test]
    fn sqlite_full_preserves_committed_note_and_allows_draft_retry() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let saved = store.save_note(note()).unwrap();
        let pages: i64 = store
            .user
            .pragma_query_value(None, "page_count", |row| row.get(0))
            .unwrap();
        store
            .user
            .pragma_update(None, "max_page_count", pages)
            .unwrap();
        let mut draft = saved.clone();
        draft.body_text = "x".repeat(256 * 1024);
        let error = store.save_note(draft.clone()).unwrap_err();
        assert_eq!(error.code, "STORAGE_FULL");
        assert_eq!(
            json(&store.list_notes().unwrap()).unwrap(),
            json(&vec![saved]).unwrap()
        );
        assert_eq!(draft.revision, 1);

        store
            .user
            .pragma_update(None, "max_page_count", pages + 128)
            .unwrap();
        let retried = store.save_note(draft).unwrap();
        assert_eq!(retried.revision, 2);
        assert_eq!(
            json(&store.list_notes().unwrap()).unwrap(),
            json(&vec![retried]).unwrap()
        );
    }

    #[test]
    fn blank_new_notes_are_rejected_but_deliberately_emptied_existing_notes_remain() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut blank = note();
        blank.title.clear();
        blank.body_text.clear();
        assert_eq!(store.save_note(blank).unwrap_err().code, "INPUT_INVALID");
        let mut saved = store.save_note(note()).unwrap();
        saved.title.clear();
        saved.body_text.clear();
        let committed = store.save_note(saved).unwrap();
        assert_eq!(committed.revision, 2);
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        let notes = reopened.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, committed.id);
        assert!(notes[0].title.is_empty() && notes[0].body_text.is_empty());
    }

    #[test]
    fn invalid_notes_are_rejected_without_any_partial_record() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut invalid = note();
        invalid.id = "not-a-uuid".into();
        assert_eq!(store.save_note(invalid).unwrap_err().code, "INPUT_INVALID");
        let mut oversize = note();
        oversize.title = "a".repeat(257);
        assert_eq!(store.save_note(oversize).unwrap_err().code, "INPUT_INVALID");
        let mut bad_date = note();
        bad_date.updated_at = "2026-02-30T12:00:00Z".into();
        assert_eq!(store.save_note(bad_date).unwrap_err().code, "INPUT_INVALID");
        assert!(store.list_notes().unwrap().is_empty());
        assert!(timestamp("2024-02-29T12:00:00.12Z").is_some());
        assert!(timestamp("2025-02-29T12:00:00Z").is_none());
    }

    #[test]
    fn optional_fractional_timestamps_sort_chronologically_and_never_regress() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut first = note();
        first.created_at = "2026-10-19T12:00:00Z".into();
        first.updated_at = "2026-10-19T12:00:00Z".into();
        let saved = store.save_note(first).unwrap();
        let mut later = note();
        later.id = "ae49170f-1f19-47eb-a56e-7b304481da13".into();
        later.updated_at = "2026-10-19T12:00:00.100Z".into();
        store.save_note(later.clone()).unwrap();
        assert_eq!(store.list_notes().unwrap()[0].id, later.id);
        let mut invalid = saved;
        invalid.updated_at = "2026-10-19T11:59:59.999Z".into();
        assert_eq!(store.save_note(invalid).unwrap_err().code, "INPUT_INVALID");
    }

    #[test]
    fn preferences_and_position_persist_and_late_position_write_is_ignored() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        assert_eq!(store.get_preferences().unwrap().theme, "system");
        let preferences = Preferences {
            ui_locale: "om".into(),
            theme: "dark".into(),
            font_size_px: 24.0,
            line_height: 1.9,
            width: "wide".into(),
        };
        store.save_preferences(&preferences).unwrap();
        let position = ReadingPosition {
            edition_id: "synthetic-development".into(),
            book_code: "TSA".into(),
            chapter_label: "2".into(),
            verse_label: Some("1".into()),
            updated_at: "2026-10-19T12:00:01Z".into(),
        };
        store.save_reading_position(&position).unwrap();
        let stale = ReadingPosition {
            chapter_label: "1".into(),
            updated_at: "2026-10-19T12:00:00.999Z".into(),
            ..position
        };
        store.save_reading_position(&stale).unwrap();
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        assert_eq!(reopened.get_preferences().unwrap().width, "wide");
        assert_eq!(
            reopened
                .get_reading_position()
                .unwrap()
                .unwrap()
                .chapter_label,
            "2"
        );
    }

    #[test]
    fn unsupported_development_schema_is_never_reset_automatically() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        store.user.pragma_update(None, "user_version", 99).unwrap();
        drop(store);
        let error = Repository::open(&directory.0).err().unwrap();
        assert_eq!(error.code, "SCHEMA_UNSUPPORTED");
        let user = Connection::open(directory.0.join("user.sqlite")).unwrap();
        assert_eq!(
            user.pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
                .unwrap(),
            99
        );
    }

    #[test]
    fn local_generated_pack_uses_the_native_content_dtos_when_available() {
        let selected = std::env::var_os("AOB_TECHNICAL_PACK_PATH");
        let path = selected
            .as_ref()
            .map(|value| std::path::PathBuf::from(value.as_os_str()))
            .unwrap_or_else(|| {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("../content/generated/oocs-2024-technical-pack-v4/library.sqlite")
            });
        if selected.is_none() && !path.exists() {
            return;
        }
        let connection =
            Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let status: String = connection
            .query_row("SELECT approval_status FROM content_manifest", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(status, "technical_only");
        let profile: String = connection
            .query_row(
                "SELECT search_profile_version FROM content_manifest",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(profile, "technical-latin-v1");
        let edition: Edition = serde_json::from_str(
            &connection
                .query_row("SELECT json FROM edition", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
        )
        .unwrap();
        assert!(!edition.is_synthetic);
        if selected.is_some() {
            assert_eq!(
                edition.source_title.as_deref(),
                Some("Biblica® Open Oromo Contemporary Scriptures 2024")
            );
            assert_eq!(edition.rights_holder_name.as_deref(), Some("Biblica, Inc."));
            assert_eq!(
                edition.language_name.as_deref(),
                Some("Oromo, West Central")
            );
            assert_eq!(edition.source_completed_on.as_deref(), Some("2024-07-01"));
            assert_eq!(
                edition.source_archive_sha256.as_deref(),
                Some("ec543152e54faac1112e95ce74bc79ed2f20f26558edeef4b1b64fc96d608106")
            );
        }
        let mut books = connection
            .prepare("SELECT json FROM book ORDER BY display_order")
            .unwrap();
        let book_records = books.query_map([], |row| row.get::<_, String>(0)).unwrap();
        let parsed_books: Vec<BookSummary> = book_records
            .map(|record| serde_json::from_str::<BookSummary>(&record.unwrap()).unwrap())
            .collect();
        assert_eq!(parsed_books.len(), 66);
        let mut chapters = connection
            .prepare("SELECT json FROM chapter ORDER BY rowid")
            .unwrap();
        let chapter_records = chapters
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap();
        let mut count = 0;
        let mut units = 0;
        for record in chapter_records {
            let chapter: ChapterContent = serde_json::from_str(&record.unwrap()).unwrap();
            units += chapter.verse_units.len();
            count += 1;
        }
        assert_eq!((count, units), (1189, 31102));
        let mut search_rows = connection.prepare(
            "SELECT v.text_plain,s.text FROM verse_unit v JOIN verse_search s ON s.rowid=v.rowid ORDER BY v.rowid"
        ).unwrap();
        let mut indexed = 0;
        let mut first_token = None;
        for row in search_rows
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
        {
            let (source, projection) = row.unwrap();
            assert_eq!(normalize_search_text(&source), projection);
            if first_token.is_none() {
                first_token = projection.split_whitespace().next().map(str::to_owned);
            }
            indexed += 1;
        }
        assert_eq!(indexed, 31102);
        let first_token = first_token.unwrap();
        let query = format!("\"{first_token}\"");
        let hits: i64 = connection
            .query_row(
                "SELECT count(*) FROM verse_search WHERE verse_search MATCH ?1",
                [query],
                |row| row.get(0),
            )
            .unwrap();
        assert!(hits > 0);

        // Exercise the same repository methods used by the desktop IPC layer.
        let directory = TestDirectory::new();
        let mut repository = Repository::open(&directory.0).unwrap();
        repository.library =
            Some(Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap());
        repository
            .library
            .as_ref()
            .unwrap()
            .pragma_update(None, "query_only", "ON")
            .unwrap();
        assert_eq!(repository.list_editions().unwrap().len(), 1);
        let books = repository.list_books(&edition.id).unwrap();
        assert_eq!(books.len(), 66);
        let first_book = &books[0];
        let chapter = repository
            .get_chapter(&ChapterKey {
                edition_id: edition.id.clone(),
                book_code: first_book.code.clone(),
                chapter_label: first_book.chapters[0].clone(),
            })
            .unwrap();
        assert!(!chapter.verse_units.is_empty());
        let search = repository
            .search(&SearchRequest {
                edition_id: edition.id.clone(),
                query: ParsedSearch {
                    clauses: vec![SearchClause {
                        tokens: vec![first_token],
                        prefix: false,
                    }],
                },
                book_code: Some(first_book.code.clone()),
                limit: Some(5),
                offset: Some(0),
            })
            .unwrap();
        assert!(!search.items.is_empty());
        assert!(search
            .items
            .iter()
            .all(|item| item.book_code == first_book.code));

        let mut page_request = SearchRequest {
            edition_id: edition.id.clone(),
            query: ParsedSearch {
                clauses: vec![SearchClause {
                    tokens: vec!["isaan".into()],
                    prefix: false,
                }],
            },
            book_code: None,
            limit: Some(50),
            offset: Some(0),
        };
        let first_page = repository.search(&page_request).unwrap();
        assert_eq!(first_page.items.len(), 50);
        assert!(first_page.has_more);
        assert!(first_page.total > 100);
        page_request.offset = Some(50);
        let second_page = repository.search(&page_request).unwrap();
        assert_eq!(second_page.items.len(), 50);
        assert_eq!(second_page.total, first_page.total);
        assert!(second_page.has_more);
        let first_keys: std::collections::HashSet<_> =
            first_page.items.iter().map(|item| &item.unit_key).collect();
        assert!(second_page
            .items
            .iter()
            .all(|item| !first_keys.contains(&item.unit_key)));
        page_request.offset = Some(u64::from(first_page.total - 1));
        let last_page = repository.search(&page_request).unwrap();
        assert_eq!(last_page.items.len(), 1);
        assert!(!last_page.has_more);
    }

    #[test]
    fn registered_technical_pack_opens_only_for_isolated_review_when_available() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../content/generated/oocs-2024-technical-pack-v4/library.sqlite");
        if !path.is_file() {
            return;
        }
        let directory = TestDirectory::new();
        let profile = directory.0.join("technical-review");
        assert_eq!(
            Repository::open_technical_review(&profile, &path, &"0".repeat(64))
                .err()
                .unwrap()
                .code,
            "CONTENT_UNAVAILABLE"
        );
        assert!(!profile.exists());
        let digest = sha256_file(&path).unwrap();
        let store = Repository::open_technical_review(&profile, &path, &digest).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        assert_eq!(edition.technical_review_only, Some(true));
        assert_eq!(store.list_books(&edition.id).unwrap().len(), 66);
        assert!(store.user.is_autocommit());
        assert!(store
            .library()
            .unwrap()
            .execute("DELETE FROM book", [])
            .is_err());
        assert!(profile.join("user.sqlite").is_file());
    }
}
