# User journeys and acceptance scenarios

Status: implementation scenarios for [MVP_SCOPE.md](MVP_SCOPE.md). Stories marked V1 are required; future stories are explicitly excluded from V1. Real-content tests require the exact authorized edition. Until then use conspicuously labeled synthetic fixtures without inventing biblical quotations.

## U-01 — Resume a quiet reading session · V1

**As an everyday reader, I want the app to reopen where I left off so I can continue reading without setup.**

Journey: launch → see the saved chapter → continue reading → adjust font size → close → reopen offline.

Acceptance:

- Given a confirmed saved reading position, reopening shows the same edition/book/chapter and restores the verse position when available.
- Font size, line spacing, text width and theme survive restart independently of the reading position.
- With network access blocked, the bundled edition and local notes still work.
- First launch opens a sensible initial chapter from the edition metadata and identifies the edition; it never assumes a universal canon.
- If saved content is unavailable, explain it and offer valid navigation. Preserve the anchor rather than silently relinking to a different edition.

## U-02 — Find a passage during a service · V1

**As a church attendee, I want quick reference navigation so I can follow a passage without distraction.**

Journey: focus reference input → enter a supported book alias and chapter/verse → open passage → next chapter.

Acceptance:

- Supported Oromo/English book aliases resolve to stable book codes for the current edition; the UI documents accepted reference syntax.
- A valid verse reference opens its containing chapter and visibly identifies the target without moving keyboard focus unexpectedly.
- Ambiguous aliases request a selection. Unavailable books/chapters/verses produce a clear error, preserving the current passage.
- First/last chapter boundaries are correct and do not wrap unexpectedly.
- The book/chapter picker and reference entry are operable entirely by keyboard, including dismissal and restored focus.

## U-03 — Search a word or phrase · V1

**As a Bible student, I want relevant passage results so I can find text I partly remember.**

Journey: open search → type words or a quoted phrase → optionally choose one book → read results → open a result.

Acceptance:

- Results show the edition-aware reference and a short contextual excerpt without modifying the stored source.
- Documented normalization treats supported case, Unicode and apostrophe variants consistently; fluent Oromo reviewers check that distinctions are not erased inappropriately.
- A phrase test requires the documented token order/adjacency semantics, shared by browser and desktop adapters. Punctuation-only and malformed queries give guidance instead of raw database errors.
- A no-result query offers editing/reset; it does not substitute fabricated verses or silently use another translation.
- Selecting a result opens and identifies the matching verse. Returning to search retains the query during the session.
- Search indexes only Scripture-derived fields defined by the pipeline. Notes remain private user data and are not accidentally included in Scripture results.

## U-04 — Copy a passage for study · V1

**As a teacher, I want accurate quotations with references so I can use passages in my preparation notes.**

Journey: select contiguous verses in a chapter → choose Copy → paste into another app.

Acceptance:

- Pointer and keyboard users can select, extend and clear the same whole-verse range.
- Copied text matches source wording and verse order, including source verse labels where applicable, and includes an unambiguous reference and edition label.
- Required notices and any edition-specific copying restrictions follow [CONTENT_LICENSING.md](CONTENT_LICENSING.md); the product does not invent a right to unrestricted export.
- A failed clipboard action is reported without claiming success. Source text remains unchanged.

## U-05 — Save a place and a highlighted passage · V1

**As a reader, I want visible markers so I can return to passages that matter to me.**

Journey: select a verse → bookmark → choose highlight color → restart → open bookmark → remove marker.

Acceptance:

- Bookmark/highlight changes are durable only when the user store acknowledges them; failure is visible and recoverable.
- Reopening a bookmark returns to its edition-aware anchor after restart.
- Highlight palette names and selected indicators support non-color identification, and passage contrast remains readable in both themes.
- Repeating an add action does not create surprising duplicate bookmarks or conflicting overlapping highlight records.
- Removing a bookmark leaves its associated note and independently stored highlight intact.

## U-06 — Record a thought beside a passage · V1

**As a Bible student, I want a short linked note so I can retain an observation without building a sermon document.**

Journey: select verse(s) → Add note → type title/body → see Saved → close → reopen note from passage or list.

Acceptance:

- A new note has a UUID, UTC timestamps and an explicit edition/versification-aware anchor; its plain text is not executable HTML.
- Saving status changes from editing/saving to saved only after a successful persistence transaction. Fast typing cannot overwrite newer text with an older asynchronous save.
- After an acknowledged save and process restart, title, body and anchor are unchanged.
- If saving fails, the draft remains in memory, the error is visible, and retry is available. Closing/discarding an unsaved draft requires explicit user intent.
- Selecting the linked reference opens the passage; source content updates do not silently remap the note.
- Deleting a note requires an explicit action and returns focus predictably; it does not delete bookmarks or highlights.

## U-07 — Draft an unlinked personal note · V1

**As a preacher preparing offline, I want a simple standalone note so I can collect thoughts without mandatory passage or service metadata.**

Acceptance:

- Create a note without a verse anchor, service date, speaker or sermon template.
- Open it from the local note list, edit it, restart and read its saved text.
- Basic list labels make notes distinguishable; empty titles have a deterministic display fallback without rewriting the saved body.
- Link a note through the supported passage-note flow without converting plain text to an invented rich-text format.

Organization, full-text note search, templates and rich text are later work; basic note access and durability are required now.

## U-08 — Recover personal data on another installation · V1

**As a user, I want a portable backup so I can recover notes and annotations after changing computers.**

Journey: export backup → retain file outside application data → install app elsewhere → inspect backup → confirm replacement → reopen notes.

Acceptance:

- Export creates a consistent versioned JSON snapshot of notes, anchors, bookmarks, highlights, preferences and reading position. It excludes Bible text, credentials and transient UI state.
- The app explains that backups contain private plain text and that users choose how to store/share them; V1 does not promise encryption.
- Before any mutation, restore validates schema/version, record limits, IDs, reference structure and required fields, then shows record counts and the replacement consequence.
- Existing records are replaced only after explicit confirmation and creation of a recoverable pre-restore snapshot.
- The replacement is transactional. A malformed, incompatible or interrupted restore cannot leave half-restored records.
- A clean installation with the same edition resolves restored anchors. A missing edition leaves records intact with a visible unavailable-content state.
- A restore round-trip compares full records and references, not merely the number of notes.

## U-09 — Read using a keyboard and screen reader · V1

**As a reader using assistive technology, I want meaningful structure and predictable focus so I can perform the same study tasks.**

Acceptance:

- Reach chapter content, navigation, search, notes and settings without a pointer; no required action relies on hover or color.
- Headings, paragraphs, verse labels and poetry have a sensible reading order; interactive controls have names and states.
- Opening a dialog moves focus appropriately; Escape/cancel closes it and restores focus; background content cannot trap or steal focus.
- Search counts, save failures and validation errors are announced without reading every keystroke or re-announcing the whole chapter.
- Text remains usable at 200% zoom and in a narrow desktop window, with no loss of core controls.
- Record manual checks with NVDA on Windows and VoiceOver on macOS, plus automated checks and visible-focus/contrast review. Automated scans alone do not establish conformance.

## U-10 — Choose menu language independently · V1

**As a bilingual reader, I want the menu language to fit me while the Bible remains the edition I selected.**

Acceptance:

- Changing interface locale updates application labels without rewriting Scripture or changing edition identity.
- Afaan Oromo text receives fluent review; missing strings use a defined English fallback during development and are resolved in release-critical flows before V1.
- Search book aliases can be reviewed independently from menu labels and are not generated from guessed translations.
- Edition attribution and authoritative title remain accessible in any interface locale.

## U-11 — Understand source and rights · V1

**As a reader or church leader, I want to identify the included edition so I can assess its suitability and attribution.**

Acceptance:

- Offline content information shows exact title, publisher, year/revision when known, language/variety, included books, source and required notices.
- The UI distinguishes Scripture, editorial headings/notes supplied by the edition, and personal notes.
- It does not imply an unverified permission, universal dialect coverage, or endorsement by a publisher/church.

## Future journeys · excluded from V1

| ID    | Story                                                | Earliest milestone / prerequisite                                                                          |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| U-F01 | Compare two translations at the same passage         | 1.1; two authorized editions and tested explicit versification mappings                                    |
| U-F02 | Turn personal notes into a sermon or service outline | 1.2; user-validated study workflow, editor/export decisions and preservation of V1 notes                   |
| U-F03 | Open a commentary beside Scripture                   | 1.2; licensed resource, reference mapping and distinct presentation                                        |
| U-F04 | Ask a question and inspect every cited passage       | 1.3 optional AI pilot; approved sources, checked citations, Oromo evaluation, granular consent and budgets |
| U-F05 | Continue on another device automatically             | Later; demonstrated need, identity/conflict model, encryption and sustainable operations                   |

These journeys are direction, not implementation permission to add speculative frameworks to V1. Priority and exit gates are in [ROADMAP.md](ROADMAP.md).
