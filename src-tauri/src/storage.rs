use regex::Regex;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, path::Path, sync::OnceLock, time::Duration};
use unicode_normalization::UnicodeNormalization;

const USER_SCHEMA_VERSION: i64 = 1;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
// Bump when the current synthetic library schema/projector/index changes.
// Development artifacts are rebuilt under a fresh identity, never migrated.
#[cfg(feature = "development-content")]
const FIXTURE_INDEX_BUILD_VERSION: &str = "fixture-store-v1";
#[cfg(feature = "development-content")]
const FIXTURE_SEARCH_PROFILE_VERSION: &str = "fixture-latin-v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self { code: code.to_owned(), message: message.to_owned() }
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
        if matches!(&error, rusqlite::Error::SqliteFailure(inner, _) if inner.code == rusqlite::ErrorCode::DiskFull) {
            return Self::new("STORAGE_FULL", "Storage is full. Free disk space, then retry; the draft has not been saved.");
        }
        Self::new("WRITE_FAILED", "Local storage could not complete the operation. Keep your draft and retry.")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Edition {
    pub id: String,
    pub title: String,
    pub abbreviation: String,
    pub language_tag: String,
    pub versification_id: String,
    pub content_revision: String,
    pub canon_id: String,
    pub is_synthetic: bool,
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
    pub theme: String,
    pub font_size_px: f64,
    pub line_height: f64,
    pub width: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self { theme: "system".into(), font_size_px: 20.0, line_height: 1.65, width: "comfortable".into() }
    }
}

fn input_error(message: &str) -> AppError {
    AppError::new("INPUT_INVALID", message)
}

fn json<T: Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|_| input_error("The record cannot be serialized."))
}

fn from_json<T: DeserializeOwned>(value: &str) -> Result<T, AppError> {
    serde_json::from_str(value).map_err(|_| AppError::new("STORAGE_INVALID", "Stored data is invalid. Preserve the database and use recovery; it was not reset."))
}

fn short_text(value: &str) -> bool {
    !value.is_empty() && value.chars().count() <= 256
}

fn uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36 && bytes.iter().enumerate().all(|(index, byte)| {
        if [8, 13, 18, 23].contains(&index) { *byte == b'-' } else { byte.is_ascii_hexdigit() }
    }) && (b'1'..=b'8').contains(&bytes[14]) && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
}

// Validated UTC components support consistent comparisons even with optional milliseconds.
fn timestamp(value: &str) -> Option<[u32; 7]> {
    let bytes = value.as_bytes();
    if !(20..=24).contains(&bytes.len()) || bytes.last() != Some(&b'Z') { return None; }
    if [4, 7, 10, 13, 16].iter().zip([b'-', b'-', b'T', b':', b':']).any(|(index, delimiter)| bytes[*index] != delimiter) { return None; }
    if !bytes[..19].iter().enumerate().all(|(index, byte)| [4, 7, 10, 13, 16].contains(&index) || byte.is_ascii_digit()) { return None; }
    let number = |start, end| value.get(start..end)?.parse::<u32>().ok();
    let year = number(0, 4)?;
    let month = number(5, 7)?;
    let day = number(8, 10)?;
    let hour = number(11, 13)?;
    let minute = number(14, 16)?;
    let second = number(17, 19)?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month { 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, 4 | 6 | 9 | 11 => 30, 2 if leap => 29, 2 => 28, _ => return None };
    if day == 0 || day > days || hour > 23 || minute > 59 || second > 59 { return None; }
    let millis = if bytes.len() == 20 { 0 } else {
        if bytes[19] != b'.' || bytes.len() == 21 || !bytes[20..bytes.len() - 1].iter().all(u8::is_ascii_digit) { return None; }
        let fraction = value.get(20..value.len() - 1)?;
        fraction.parse::<u32>().ok()? * 10_u32.pow(3 - fraction.len() as u32)
    };
    Some([year, month, day, hour, minute, second, millis])
}

fn validate_note(note: &Note) -> Result<(), AppError> {
    if !uuid(&note.id) || note.title.chars().count() > 256 || note.body_text.len() > 1024 * 1024 || note.revision >= MAX_SAFE_INTEGER {
        return Err(input_error("The note is invalid or exceeds supported limits. Your draft was not saved."));
    }
    let created = timestamp(&note.created_at).ok_or_else(|| input_error("The note creation time must be a valid UTC timestamp."))?;
    let updated = timestamp(&note.updated_at).ok_or_else(|| input_error("The note update time must be a valid UTC timestamp."))?;
    if updated < created { return Err(input_error("A note update cannot precede its creation.")); }
    if let Some(anchor) = &note.anchor {
        let valid_address = |address: &VerseAddress| short_text(&address.book_code) && short_text(&address.chapter_label) && short_text(&address.verse_label);
        let digests_valid = anchor.selected_text_digests.iter().all(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)));
        if !uuid(&anchor.id) || !short_text(&anchor.edition_id) || !short_text(&anchor.versification_id) || !short_text(&anchor.content_revision)
            || !valid_address(&anchor.start) || !valid_address(&anchor.end)
            || anchor.start.book_code != anchor.end.book_code || anchor.start.chapter_label != anchor.end.chapter_label
            || anchor.unit_keys.is_empty() || anchor.unit_keys.iter().any(|key| key.is_empty() || key.encode_utf16().count() > 4096)
            || anchor.unit_keys.iter().collect::<HashSet<_>>().len() != anchor.unit_keys.len()
            || anchor.selected_text_digests.len() != anchor.unit_keys.len() || !digests_valid
            || !short_text(&anchor.display_reference_snapshot) || timestamp(&anchor.created_at).is_none() {
            return Err(input_error("The passage link is invalid. Preserve the draft and select the passage again."));
        }
        for (index, key) in anchor.unit_keys.iter().enumerate() {
            let tuple: Vec<String> = serde_json::from_str(key).map_err(|_| input_error("A passage identity is not a structured reference."))?;
            if tuple.len() != 5 || tuple[0] != anchor.edition_id || tuple[1] != anchor.versification_id
                || tuple[2] != anchor.start.book_code || tuple[3] != anchor.start.chapter_label || !short_text(&tuple[4])
                || (index == 0 && tuple[4] != anchor.start.verse_label)
                || (index == anchor.unit_keys.len() - 1 && tuple[4] != anchor.end.verse_label) {
                return Err(input_error("The passage identities do not match their stored reference."));
            }
        }
    }
    Ok(())
}

fn validate_preferences(preferences: &Preferences) -> Result<(), AppError> {
    if !["light", "dark", "system"].contains(&preferences.theme.as_str())
        || !preferences.font_size_px.is_finite() || !(16.0..=32.0).contains(&preferences.font_size_px)
        || ![1.4, 1.65, 1.9].contains(&preferences.line_height)
        || !["comfortable", "wide"].contains(&preferences.width.as_str()) {
        return Err(input_error("Choose supported reading preferences."));
    }
    Ok(())
}

pub fn normalize_search_text(text: &str) -> String {
    let folded = text.nfc().map(|character| match character {
        '\u{2019}' => '\'',
        'A'..='Z' | '\u{00c0}'..='\u{00d6}' | '\u{00d8}'..='\u{00de}' => char::from_u32(character as u32 + 32).unwrap_or(character),
        '\u{0178}' => '\u{00ff}',
        _ => character,
    }).collect::<String>().nfc().collect::<String>();
    word_regex().find_iter(&folded).map(|found| found.as_str()).collect::<Vec<_>>().join(" ")
}

fn word_regex() -> &'static Regex {
    static WORD: OnceLock<Regex> = OnceLock::new();
    WORD.get_or_init(|| Regex::new(r"[\p{L}\p{N}\p{M}]+(?:'[\p{L}\p{N}\p{M}]+)*").expect("The constant token expression is valid"))
}

fn compile_search(query: &ParsedSearch) -> Result<String, AppError> {
    let mut count = 0;
    let mut characters = 0;
    if query.clauses.is_empty() || query.clauses.len() > 20 {
        return Err(AppError::new("QUERY_INVALID", "Enter a bounded word or phrase search."));
    }
    let mut expressions = Vec::new();
    for clause in &query.clauses {
        if clause.tokens.is_empty() || (clause.prefix && (clause.tokens.len() != 1 || clause.tokens[0].chars().count() < 2)) {
            return Err(AppError::new("QUERY_INVALID", "Prefix searches require one token with at least two characters."));
        }
        for token in &clause.tokens {
            count += 1;
            characters += token.chars().count();
            let valid = word_regex().find(token).is_some_and(|found| found.start() == 0 && found.end() == token.len());
            if !valid || token.chars().count() > 256 || normalize_search_text(token) != *token {
                return Err(AppError::new("QUERY_INVALID", "Use normalized word tokens, not raw search operators."));
            }
        }
        expressions.push(format!("\"{}\"{}", clause.tokens.join(" ").replace('"', "\"\""), if clause.prefix { "*" } else { "" }));
    }
    if count > 20 || characters + count - 1 > 256 { return Err(AppError::new("QUERY_INVALID", "The search exceeds the supported query limit.")); }
    Ok(expressions.join(" AND "))
}

fn validate_anchor_content(library: &Connection, anchor: &VerseAnchor, previous: Option<&VerseAnchor>) -> Result<(), AppError> {
    // An unchanged saved link retains provenance even if its edition later
    // disappears or changes. A new/reassigned link must resolve exactly now.
    if previous == Some(anchor) { return Ok(()); }
    let edition_json: Option<String> = library.query_row("SELECT json FROM edition WHERE id=?1", [&anchor.edition_id], |row| row.get(0)).optional()?;
    let edition: Edition = match edition_json {
        Some(record) => from_json(&record)?,
        None => return Err(AppError::new("CONTENT_UNAVAILABLE", "The new passage link cannot be verified because its edition is unavailable.")),
    };
    if edition.versification_id != anchor.versification_id || edition.content_revision != anchor.content_revision {
        return Err(input_error("The passage link uses different content. Select the current passage again."));
    }
    let chapter_json: Option<String> = library.query_row("SELECT json FROM chapter WHERE edition_id=?1 AND book_code=?2 AND chapter_label=?3", params![anchor.edition_id, anchor.start.book_code, anchor.start.chapter_label], |row| row.get(0)).optional()?;
    let chapter: ChapterContent = match chapter_json {
        Some(record) => from_json(&record)?,
        None => return Err(AppError::new("CONTENT_UNAVAILABLE", "The new passage link cannot be verified because its chapter is unavailable.")),
    };
    let start = chapter.verse_units.iter().position(|unit| unit.label == anchor.start.verse_label)
        .ok_or_else(|| input_error("The passage link starts at an unknown verse unit."))?;
    let end = chapter.verse_units.iter().position(|unit| unit.label == anchor.end.verse_label)
        .ok_or_else(|| input_error("The passage link ends at an unknown verse unit."))?;
    if start > end { return Err(input_error("The passage link must follow source order.")); }
    let selected = &chapter.verse_units[start..=end];
    if selected.len() != anchor.unit_keys.len() || selected.iter().zip(&anchor.unit_keys).any(|(unit, key)| &unit.key != key)
        || selected.iter().zip(&anchor.selected_text_digests).any(|(unit, digest)| &unit.text_digest != digest) {
        return Err(input_error("The passage link must include the exact contiguous source units and text digests."));
    }
    Ok(())
}

pub struct Repository {
    library: Connection,
    user: Connection,
}

impl Repository {
    pub fn open(directory: &Path) -> Result<Self, AppError> {
        #[cfg(feature = "development-content")]
        {
            std::fs::create_dir_all(directory).map_err(|_| AppError::new("WRITE_FAILED", "The application data directory could not be created."))?;
            let library_path = prepare_fixture(directory)?;
            let library = Connection::open_with_flags(library_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            library.pragma_update(None, "foreign_keys", "ON")?;
            library.pragma_update(None, "query_only", "ON")?;
            let _: i64 = library.query_row("SELECT count(*) FROM verse_search WHERE verse_search MATCH 'synthetic'", [], |row| row.get(0))?;
            let user_path = directory.join("user.sqlite");
            let user = Connection::open(user_path)?;
            user.busy_timeout(Duration::from_secs(3))?;
            user.pragma_update(None, "foreign_keys", "ON")?;
            user.pragma_update(None, "journal_mode", "WAL")?;
            user.pragma_update(None, "synchronous", "FULL")?;
            let version: i64 = user.pragma_query_value(None, "user_version", |row| row.get(0))?;
            if version == 0 {
                let count: i64 = user.query_row("SELECT count(*) FROM sqlite_master WHERE type='table'", [], |row| row.get(0))?;
                if count != 0 { return Err(AppError::new("SCHEMA_UNSUPPORTED", "This development database has an unknown schema. Use the explicit developer reset; it was not erased.")); }
                user.execute_batch("BEGIN IMMEDIATE;
                    CREATE TABLE note (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), updated_at TEXT NOT NULL, json TEXT NOT NULL);
                    CREATE TABLE preference (key TEXT PRIMARY KEY, json TEXT NOT NULL);
                    CREATE TABLE reading_position (edition_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, json TEXT NOT NULL);
                    PRAGMA user_version = 1;
                    COMMIT;")?;
            } else if version != USER_SCHEMA_VERSION {
                return Err(AppError::new("SCHEMA_UNSUPPORTED", "This database schema is unsupported. It was preserved without a reset."));
            }
            Ok(Self { library, user })
        }
        #[cfg(not(feature = "development-content"))]
        {
            let _ = directory;
            Err(AppError::new("CONTENT_UNAVAILABLE", "No approved Bible edition is packaged. Public builds require a verified content pack; development fixtures are disabled."))
        }
    }

    pub fn list_editions(&self) -> Result<Vec<Edition>, AppError> {
        let mut statement = self.library.prepare("SELECT json FROM edition ORDER BY id")?;
        let records = statement.query_map([], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        records.iter().map(|record| from_json(record)).collect()
    }

    pub fn list_books(&self, edition_id: &str) -> Result<Vec<BookSummary>, AppError> {
        if !short_text(edition_id) { return Err(input_error("Choose a valid edition.")); }
        let exists: bool = self.library.query_row("SELECT EXISTS(SELECT 1 FROM edition WHERE id=?1)", [edition_id], |row| row.get(0))?;
        if !exists { return Err(AppError::new("CONTENT_UNAVAILABLE", "The selected edition is not installed.")); }
        let mut statement = self.library.prepare("SELECT json FROM book WHERE edition_id=?1 ORDER BY display_order")?;
        let records = statement.query_map([edition_id], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        records.iter().map(|record| from_json(record)).collect()
    }

    pub fn get_chapter(&self, key: &ChapterKey) -> Result<ChapterContent, AppError> {
        if !short_text(&key.edition_id) || !short_text(&key.book_code) || !short_text(&key.chapter_label) { return Err(input_error("Choose a valid passage reference.")); }
        let record: Option<String> = self.library.query_row("SELECT json FROM chapter WHERE edition_id=?1 AND book_code=?2 AND chapter_label=?3", params![key.edition_id, key.book_code, key.chapter_label], |row| row.get(0)).optional()?;
        match record { Some(value) => from_json(&value), None => Err(AppError::new("CONTENT_UNAVAILABLE", "The passage is unavailable in the selected edition.")) }
    }

    pub fn search(&self, request: &SearchRequest) -> Result<SearchResults, AppError> {
        if !short_text(&request.edition_id) || request.book_code.as_ref().is_some_and(|value| !short_text(value)) { return Err(input_error("Choose a valid search edition and filter.")); }
        let books = self.list_books(&request.edition_id)?;
        if request.book_code.as_ref().is_some_and(|code| !books.iter().any(|book| &book.code == code)) {
            return Err(AppError::new("CONTENT_UNAVAILABLE", "That search book is unavailable in this edition."));
        }
        let expression = compile_search(&request.query)?;
        let limit = request.limit.unwrap_or(50);
        let offset = request.offset.unwrap_or(0);
        if limit == 0 || limit > 50 || offset > MAX_SAFE_INTEGER { return Err(AppError::new("QUERY_INVALID", "The search page is outside supported bounds.")); }
        let filter = request.book_code.as_deref();
        let total: u32 = self.library.query_row("SELECT count(*) FROM verse_search JOIN verse_unit v ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3)", params![expression, request.edition_id, filter], |row| row.get(0))?;
        let mut statement = self.library.prepare("SELECT v.edition_id, v.book_code, v.book_name, v.chapter_label, v.verse_label, v.unit_key, v.text_plain FROM verse_search JOIN verse_unit v ON v.rowid=verse_search.rowid WHERE verse_search MATCH ?1 AND v.edition_id=?2 AND (?3 IS NULL OR v.book_code=?3) ORDER BY v.book_order, v.chapter_order, v.unit_order LIMIT ?4 OFFSET ?5")?;
        let items = statement.query_map(params![expression, request.edition_id, filter, limit, offset], |row| Ok(SearchResult {
            edition_id: row.get(0)?, book_code: row.get(1)?, book_name: row.get(2)?, chapter_label: row.get(3)?, verse_label: row.get(4)?, unit_key: row.get(5)?, text_plain: row.get(6)?,
        }))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let has_more = offset.saturating_add(items.len() as u64) < u64::from(total);
        Ok(SearchResults { items, total, has_more })
    }

    pub fn list_notes(&self) -> Result<Vec<Note>, AppError> {
        let mut statement = self.user.prepare("SELECT json FROM note ORDER BY updated_at DESC, id")?;
        let records = statement.query_map([], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let mut notes: Vec<Note> = records.iter().map(|record| from_json(record)).collect::<Result<_, _>>()?;
        notes.sort_by(|left, right| timestamp(&right.updated_at).cmp(&timestamp(&left.updated_at)).then_with(|| left.id.cmp(&right.id)));
        Ok(notes)
    }

    pub fn save_note(&mut self, mut note: Note) -> Result<Note, AppError> {
        validate_note(&note)?;
        let transaction = self.user.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<String> = transaction.query_row("SELECT json FROM note WHERE id=?1", [&note.id], |row| row.get(0)).optional()?;
        let previous_note = previous.as_ref().map(|record| from_json::<Note>(record)).transpose()?;
        if let Some(anchor) = &note.anchor {
            validate_anchor_content(&self.library, anchor, previous_note.as_ref().and_then(|note| note.anchor.as_ref()))?;
        }
        match previous_note {
            Some(record) => {
                let existing = record;
                if existing.revision != note.revision { return Err(AppError::new("REVISION_CONFLICT", "A newer note is already saved. Keep your draft and reload before retrying.")); }
                if existing.created_at != note.created_at { return Err(input_error("An existing note's creation time cannot change.")); }
                if timestamp(&note.updated_at) < timestamp(&existing.updated_at) { return Err(input_error("A note update cannot move its saved timestamp backward.")); }
            }
            None => {
                if note.revision != 0 { return Err(AppError::new("REVISION_CONFLICT", "The original note is unavailable. Keep the draft before retrying.")); }
                if note.title.trim().is_empty() && note.body_text.trim().is_empty() { return Err(input_error("Enter a note title or text before saving.")); }
            }
        }
        note.revision += 1;
        transaction.execute("INSERT INTO note(id,revision,updated_at,json) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,json=excluded.json", params![note.id, note.revision, note.updated_at, json(&note)?])?;
        transaction.commit()?;
        Ok(note)
    }

    pub fn delete_note(&mut self, id: &str) -> Result<(), AppError> {
        if !uuid(id) { return Err(input_error("Choose a valid note.")); }
        let transaction = self.user.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("DELETE FROM note WHERE id=?1", [id])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn get_preferences(&self) -> Result<Preferences, AppError> {
        let record: Option<String> = self.user.query_row("SELECT json FROM preference WHERE key='reader'", [], |row| row.get(0)).optional()?;
        let preferences = match record { Some(value) => from_json(&value)?, None => Preferences::default() };
        validate_preferences(&preferences)?;
        Ok(preferences)
    }

    pub fn save_preferences(&mut self, preferences: &Preferences) -> Result<(), AppError> {
        validate_preferences(preferences)?;
        let transaction = self.user.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("INSERT INTO preference(key,json) VALUES('reader',?1) ON CONFLICT(key) DO UPDATE SET json=excluded.json", [json(preferences)?])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn get_reading_position(&self) -> Result<Option<ReadingPosition>, AppError> {
        let mut statement = self.user.prepare("SELECT json FROM reading_position")?;
        let records = statement.query_map([], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let positions: Vec<ReadingPosition> = records.iter().map(|record| from_json(record)).collect::<Result<_, _>>()?;
        Ok(positions.into_iter().max_by(|left, right| timestamp(&left.updated_at).cmp(&timestamp(&right.updated_at)).then_with(|| right.edition_id.cmp(&left.edition_id))))
    }

    pub fn save_reading_position(&mut self, position: &ReadingPosition) -> Result<(), AppError> {
        if !short_text(&position.edition_id) || !short_text(&position.book_code) || !short_text(&position.chapter_label)
            || position.verse_label.as_ref().is_some_and(|value| !short_text(value)) || timestamp(&position.updated_at).is_none() {
            return Err(input_error("The reading position is invalid."));
        }
        let transaction = self.user.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let previous: Option<String> = transaction.query_row("SELECT json FROM reading_position WHERE edition_id=?1", [&position.edition_id], |row| row.get(0)).optional()?;
        if let Some(record) = previous {
            let existing: ReadingPosition = from_json(&record)?;
            if timestamp(&existing.updated_at) > timestamp(&position.updated_at) { return Ok(()); }
        }
        transaction.execute("INSERT INTO reading_position(edition_id,updated_at,json) VALUES(?1,?2,?3) ON CONFLICT(edition_id) DO UPDATE SET updated_at=excluded.updated_at,json=excluded.json", params![position.edition_id, position.updated_at, json(position)?])?;
        transaction.commit()?;
        Ok(())
    }
}

#[cfg(feature = "development-content")]
fn prepare_fixture(directory: &Path) -> Result<std::path::PathBuf, AppError> {
    prepare_fixture_version(directory, FIXTURE_INDEX_BUILD_VERSION, FIXTURE_SEARCH_PROFILE_VERSION)
}

#[cfg(feature = "development-content")]
fn prepare_fixture_version(directory: &Path, index_build_version: &str, search_profile_version: &str) -> Result<std::path::PathBuf, AppError> {
    const SOURCE: &str = include_str!("../../content/fixtures/sample.json");
    let source_hash = format!("{:x}", Sha256::digest(SOURCE.as_bytes()));
    let mut identity = Sha256::new();
    for component in ["afaan-oromo-bible-fixture", index_build_version, search_profile_version, &source_hash] {
        identity.update(component.as_bytes());
        identity.update([0]);
    }
    let artifact_key = format!("{:x}", identity.finalize());
    let content_directory = directory.join("content").join(format!("fixture-{artifact_key}"));
    std::fs::create_dir_all(&content_directory).map_err(|_| AppError::new("WRITE_FAILED", "The development content directory could not be created."))?;
    let path = content_directory.join("library.sqlite");
    if path.exists() {
        let connection = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let stored: (String, String, String) = connection.query_row("SELECT source_hash,index_build_version,search_profile_version FROM content_manifest", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
        if stored != (source_hash, index_build_version.to_owned(), search_profile_version.to_owned()) { return Err(AppError::new("CONTENT_INVALID", "The development content identity does not match. The file was not modified.")); }
        return Ok(path);
    }
    let fixture: FixturePack = serde_json::from_str(SOURCE).map_err(|_| AppError::new("CONTENT_INVALID", "The embedded development fixture is invalid."))?;
    if fixture.format_version != 1 || !fixture.edition.is_synthetic { return Err(AppError::new("CONTENT_INVALID", "Only an explicitly synthetic development fixture may be seeded.")); }
    let time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temporary = content_directory.join(format!(".preparing-{}-{time}.sqlite", std::process::id()));
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
    transaction.execute("INSERT INTO edition(id,json) VALUES(?1,?2)", params![fixture.edition.id, json(&fixture.edition)?])?;
    for book in &fixture.books {
        if book.edition_id != fixture.edition.id { return Err(AppError::new("CONTENT_INVALID", "A fixture book has an invalid edition.")); }
        transaction.execute("INSERT INTO book(edition_id,code,display_order,json) VALUES(?1,?2,?3,?4)", params![book.edition_id, book.code, book.order, json(book)?])?;
    }
    for chapter in &fixture.chapters {
        let book = fixture.books.iter().find(|book| book.edition_id == chapter.edition_id && book.code == chapter.book_code).ok_or_else(|| AppError::new("CONTENT_INVALID", "A fixture chapter has an unknown book."))?;
        let chapter_order = book.chapters.iter().position(|label| label == &chapter.chapter_label).ok_or_else(|| AppError::new("CONTENT_INVALID", "A fixture chapter is not listed in its book."))?;
        transaction.execute("INSERT INTO chapter(edition_id,book_code,chapter_label,json) VALUES(?1,?2,?3,?4)", params![chapter.edition_id, chapter.book_code, chapter.chapter_label, json(chapter)?])?;
        for unit in &chapter.verse_units {
            if format!("{:x}", Sha256::digest(unit.text_plain.as_bytes())) != unit.text_digest { return Err(AppError::new("CONTENT_INVALID", "A fixture verse-unit digest does not match its display text.")); }
            transaction.execute("INSERT INTO verse_unit(unit_key,edition_id,book_code,book_name,chapter_label,verse_label,text_plain,book_order,chapter_order,unit_order) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)", params![unit.key, chapter.edition_id, chapter.book_code, book.name, chapter.chapter_label, unit.label, unit.text_plain, book.order, chapter_order, unit.order])?;
            transaction.execute("INSERT INTO verse_search(rowid,text) VALUES(?1,?2)", params![transaction.last_insert_rowid(), normalize_search_text(&unit.text_plain)])?;
        }
    }
    transaction.commit()?;
    connection.close().map_err(|(_, error)| AppError::from(error))?;
    std::fs::rename(&temporary, &path).map_err(|_| AppError::new("WRITE_FAILED", "The synthetic content database could not be published."))?;
    Ok(path)
}

#[cfg(all(test, feature = "development-content"))]
mod tests {
    use super::*;
    use std::{path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let path = std::env::temp_dir().join(format!("oromo-bible-repository-{}-{nonce}", std::process::id()));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
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
            query: ParsedSearch { clauses: vec![SearchClause { tokens: tokens.iter().map(|token| token.to_string()).collect(), prefix }] },
            book_code: None,
            limit: Some(50), offset: Some(0),
        }
    }

    #[test]
    fn fixture_opens_read_only_and_preserves_bridges_and_source_text() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        let edition = &store.list_editions().unwrap()[0];
        assert!(edition.is_synthetic);
        let chapter = store.get_chapter(&ChapterKey { edition_id: edition.id.clone(), book_code: "TSA".into(), chapter_label: "1".into() }).unwrap();
        let bridge = chapter.verse_units.iter().find(|unit| unit.label == "2-3").unwrap();
        assert!(bridge.text_plain.contains("WAaqaa ga’ee café"));
        assert_eq!(chapter.reference_lookup.get("2"), chapter.reference_lookup.get("3"));
        let error = store.library.execute("DELETE FROM edition", []).unwrap_err();
        assert!(matches!(error, rusqlite::Error::SqliteFailure(inner, _) if inner.code == rusqlite::ErrorCode::ReadOnly));
        assert_eq!(store.list_editions().unwrap().len(), 1);
    }

    #[test]
    fn changing_index_build_or_search_profile_creates_a_new_immutable_artifact() {
        let directory = TestDirectory::new();
        let original = prepare_fixture_version(&directory.0, "test-build-1", "test-profile-1").unwrap();
        let index_changed = prepare_fixture_version(&directory.0, "test-build-2", "test-profile-1").unwrap();
        let profile_changed = prepare_fixture_version(&directory.0, "test-build-1", "test-profile-2").unwrap();
        assert_ne!(original, index_changed);
        assert_ne!(original, profile_changed);
        assert!(original.exists() && index_changed.exists() && profile_changed.exists());
        assert_eq!(original, prepare_fixture_version(&directory.0, "test-build-1", "test-profile-1").unwrap());
        let current = Connection::open_with_flags(index_changed, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let version: String = current.query_row("SELECT index_build_version FROM content_manifest", [], |row| row.get(0)).unwrap();
        assert_eq!(version, "test-build-2");
    }

    #[test]
    fn native_fts_supports_phrases_prefixes_and_distinct_apostrophes() {
        let directory = TestDirectory::new();
        let store = Repository::open(&directory.0).unwrap();
        assert_eq!(store.search(&search(&["careful", "reading"], false)).unwrap().total, 3);
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
        assert_ne!(first.items[0].unit_key, store.search(&page).unwrap().items[0].unit_key);
        assert_eq!(store.search(&search(&["reading\" OR synthetic"], false)).unwrap_err().code, "QUERY_INVALID");
        assert_eq!(store.search(&search(&["r"], true)).unwrap_err().code, "QUERY_INVALID");
    }

    #[test]
    fn bounded_search_profile_matches_browser_vectors_without_modifying_display() {
        assert_eq!(normalize_search_text("  'WAaqaa' GA’EE CAFE\u{301}  "), "waaqaa ga'ee café");
        assert_eq!(normalize_search_text("GAʼEE"), "gaʼee");
        assert_ne!(normalize_search_text("gaʼee"), normalize_search_text("ga’ee"));
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
        assert_eq!(store.save_note(stale).unwrap_err().code, "REVISION_CONFLICT");
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        let persisted = reopened.list_notes().unwrap();
        assert_eq!(persisted.len(), 1);
        assert_eq!(persisted[0].body_text, "The newest local draft.");
        assert_eq!(persisted[0].revision, 2);
    }

    #[test]
    fn new_links_require_exact_units_but_unchanged_unavailable_links_survive() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let edition = store.list_editions().unwrap().remove(0);
        let chapter = store.get_chapter(&ChapterKey { edition_id: edition.id.clone(), book_code: "TSA".into(), chapter_label: "1".into() }).unwrap();
        let selected = &chapter.verse_units[1];
        let address = VerseAddress { book_code: "TSA".into(), chapter_label: "1".into(), verse_label: selected.label.clone() };
        let anchor = VerseAnchor {
            id: "68f67ff0-4f3d-4990-92d2-02381f499c92".into(), edition_id: edition.id,
            versification_id: edition.versification_id, content_revision: edition.content_revision,
            start: address.clone(), end: address, unit_keys: vec![selected.key.clone()],
            selected_text_digests: vec![selected.text_digest.clone()],
            display_reference_snapshot: "Test Passage A 1:2-3".into(), created_at: "2026-10-19T12:00:00Z".into(),
        };
        let mut linked = note();
        linked.anchor = Some(anchor.clone());
        let mut invalid = linked.clone();
        invalid.anchor.as_mut().unwrap().unit_keys[0] = "not-a-reference".into();
        assert_eq!(store.save_note(invalid).unwrap_err().code, "INPUT_INVALID");
        let saved = store.save_note(linked).unwrap();
        // Swap only the private test handle to model an absent edition while
        // retaining the same real user database and its committed personal data.
        store.library = Connection::open_in_memory().unwrap();
        store.library.execute_batch("CREATE TABLE edition(id TEXT PRIMARY KEY,json TEXT NOT NULL);").unwrap();
        let mut revised = saved;
        revised.body_text = "Still editable without its Scripture edition.".into();
        revised.updated_at = "2026-10-19T12:00:01Z".into();
        assert_eq!(store.save_note(revised).unwrap().anchor, Some(anchor.clone()));
        let mut reassigned = store.list_notes().unwrap().remove(0);
        reassigned.anchor.as_mut().unwrap().id = "59f893fb-02aa-425e-8a91-7505dcdf936f".into();
        assert_eq!(store.save_note(reassigned).unwrap_err().code, "CONTENT_UNAVAILABLE");
        assert_eq!(store.list_notes().unwrap()[0].anchor, Some(anchor));
    }

    #[test]
    fn failed_note_transaction_preserves_previous_record_and_draft_revision() {
        let directory = TestDirectory::new();
        let mut store = Repository::open(&directory.0).unwrap();
        let mut saved = store.save_note(note()).unwrap();
        store.user.execute_batch("CREATE TRIGGER injected_write_failure BEFORE UPDATE ON note BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
        saved.body_text = "This draft must remain unsaved.".into();
        assert_eq!(store.save_note(saved.clone()).unwrap_err().code, "WRITE_FAILED");
        let previous = &store.list_notes().unwrap()[0];
        assert_eq!(previous.revision, 1);
        assert_eq!(previous.body_text, note().body_text);
        assert_eq!(saved.revision, 1);
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
        let preferences = Preferences { theme: "dark".into(), font_size_px: 24.0, line_height: 1.9, width: "wide".into() };
        store.save_preferences(&preferences).unwrap();
        let position = ReadingPosition { edition_id: "synthetic-development".into(), book_code: "TSA".into(), chapter_label: "2".into(), verse_label: Some("1".into()), updated_at: "2026-10-19T12:00:01Z".into() };
        store.save_reading_position(&position).unwrap();
        let stale = ReadingPosition { chapter_label: "1".into(), updated_at: "2026-10-19T12:00:00.999Z".into(), ..position };
        store.save_reading_position(&stale).unwrap();
        drop(store);
        let reopened = Repository::open(&directory.0).unwrap();
        assert_eq!(reopened.get_preferences().unwrap().width, "wide");
        assert_eq!(reopened.get_reading_position().unwrap().unwrap().chapter_label, "2");
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
        assert_eq!(user.pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0)).unwrap(), 99);
    }
}
