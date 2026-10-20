# V1 scope and completion criteria

Status: adopted scope baseline. “V1” means the first public production release, **V1.0**, regardless of earlier development build numbers. “MVP” here is a finished reliable reader, not a disposable public prototype. Implementation phases are defined in [ROADMAP.md](ROADMAP.md).

## Required V1 features

All items below are release requirements. Phase 1 deliberately implements only the first thin slice; its successful prototype does not constitute V1 completion.

| ID    | Required capability                   | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1-01 | One authorized offline edition        | The exact edition, variety, canon, source revision and distribution permissions are recorded; every included chapter opens with the network disabled after installation. Required fonts/assets and attribution are local. No fixture text appears in production.                                                                                                                                                   |
| V1-02 | Faithful Scripture presentation       | Source verse labels, headings, paragraphs, poetry, footnotes and cross-references represented in the supplied edition survive import and render correctly. Omitted/bridged/subverse labels follow source semantics. No source text is silently rewritten or machine translated.                                                                                                                                    |
| V1-03 | Book/chapter and reference navigation | Book/chapter controls follow edition order; next/previous respects boundaries; valid aliases resolve; invalid or unavailable references produce actionable messages. Reopening restores the last persisted edition-aware position or explains unavailable content.                                                                                                                                                 |
| V1-04 | Verse selection and copy              | Contiguous whole verses within one chapter can be selected with pointer and keyboard. Copy output matches source text and includes an unambiguous reference, edition label and any notice required for that action. Clipboard failure is visible.                                                                                                                                                                  |
| V1-05 | Scripture search                      | Users can submit word or quoted phrase queries, restrict to a book, see references/context and open a result at the correct verse. The separate reference parser handles documented aliases. Unicode/apostrophe normalization is tested with fluent reviewers; display text is unchanged. Empty, malformed and no-result cases are clear.                                                                          |
| V1-06 | Bookmarks                             | Add/remove a bookmark on a verse anchor, list saved bookmarks and reopen its passage after restart. Duplicate creation has deterministic behavior. Missing edition/anchor states preserve the record and explain the problem.                                                                                                                                                                                      |
| V1-07 | Whole-verse highlights                | Apply/change/remove a semantic highlight color to selected verses. Highlights persist, remain legible in both themes and do not communicate meaning through color alone. Different word boundaries or translation revisions cannot silently relocate anchors.                                                                                                                                                      |
| V1-08 | Basic personal notes                  | Create/edit/delete a standalone plain-text note and a verse-linked note. Show saving/saved/failed states based on persistence acknowledgment. A failed save retains the draft for retry and warns before destructive navigation. Reopen saved text and anchor correctly after process restart. Delete requires explicit user intent.                                                                               |
| V1-09 | Reading controls and settings         | Font size, line spacing, bounded text width, interface locale, and light/dark/system theme persist. Text remains usable at 200% zoom; reading layout does not rely on hover. Settings are independent from Bible edition selection.                                                                                                                                                                                |
| V1-10 | Local persistence                     | Bookmarks, highlights, notes, settings and reading position use the user store, separate from immutable content. Content replacement cannot overwrite user records. The app reports inaccessible/corrupt databases and offers a safe recovery path rather than silently discarding records.                                                                                                                        |
| V1-11 | Portable backup and restore           | Export a versioned JSON containing all user records and anchor metadata, excluding Scripture. Validate a candidate backup without mutation, show a summary, explicitly confirm replacement and create a recoverable pre-restore snapshot. Replace records in one transaction; malformed/incompatible files leave current data intact. Restore on a clean installation produces equivalent records. No merge in V1. |
| V1-12 | Keyboard and accessibility            | Core read/navigate/search/copy/note/backup workflows are operable by keyboard. Dialog focus returns correctly, focus remains visible, labels/errors are announced and reading order is sensible. Review WCAG 2.2 AA checks with Windows and macOS screen readers. Record and resolve critical accessibility defects.                                                                                               |
| V1-13 | Content and application information   | Offline About/content screens identify app version, exact Bible edition, included books, source, attribution, license/permission notices, third-party notices and backup location behavior without implying rights that are unverified.                                                                                                                                                                            |
| V1-14 | Independent UI language               | Afaan Oromo and English interface catalogs cover all release flows, with fluent Oromo review and defined fallback. UI labels do not change Scripture wording. Edition metadata remains visible in its authoritative form.                                                                                                                                                                                          |
| V1-15 | Windows/macOS delivery                | Signed Windows installer and signed/notarized macOS package install, launch and read offline on the final tested support matrix. Installation-time WebView/runtime requirements and any internet requirement are disclosed separately from offline reading. Uninstall/reinstall behavior preserves or explicitly offers removal of user data.                                                                      |

More detailed edge cases live in [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md); representation and anchor invariants live in [DATA_MODEL.md](DATA_MODEL.md).

## Optional V1 enhancements

These may be added only after required flows and quality gates pass. Omitting them is not a release failure.

| Enhancement                              | Admission condition                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Recent-passage history                   | Clear demand and a simple bounded local history; last position already required                           |
| Canon-group/testament search filter      | Edition supplies explicit grouping metadata; no universal canon assumptions                               |
| Additional keyboard shortcuts            | Discoverable, remappable where collisions matter, no conflict with assistive technology                   |
| Polished note list filtering and sorting | Does not delay durable note storage, restore or basic findability                                         |
| Automatic application updater            | Signed update verification and recovery tested on both targets; manual signed installation remains usable |
| Additional reading fonts                 | Local licenses and Oromo character coverage verified; install size remains reasonable                     |

An optional enhancement must not introduce a backend, accounts, a second component library or speculative data architecture.

## Excluded from V1

- Multiple distributed Bible editions/dialects, dynamic content marketplace and synchronized parallel reading.
- Rich-text editors, word-level highlights, document attachments, print/PDF/word-processor export, sermon/service templates and commentary resources.
- Fuzzy/morphological/semantic search, inferred cross-edition mappings and machine-translated Scripture.
- AI study assistance, embedded models, model-provider credentials and any AI backend.
- Cloud sync, accounts, collaboration, telemetry by default, subscriptions and mobile releases.

Build stable edition-aware references and small storage ports now because they solve current correctness and development needs. Do not implement these excluded features behind placeholder frameworks.

## V1 release gates

| Gate                  | Required evidence                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope complete        | Every V1 row above has a linked test or recorded manual result; no unchecked mandatory feature disguised as a future task                                                          |
| Content cleared       | Permission register and exact notices approved; corpus source hash, importer revision, structural reports and reviewed samples recorded                                            |
| Data safe             | Save/restart, forced interruption, failed writes, backup/restore and invalid-restore checks pass; zero known data-loss defects                                                     |
| Offline proven        | Fresh-installed production builds operate with network blocked; content/assets bundled; reader has no remote requests required for function                                        |
| Accessible            | Keyboard, screen-reader and contrast/zoom checks pass across required flows; fluent Oromo wording review complete                                                                  |
| Performance evaluated | [PRD.md](PRD.md) benchmark methods run against the full corpus on the recorded reference machines; targets met or explicitly revised with evidence before release approval         |
| Platform proven       | Final Windows/macOS install/launch/reinstall tests, signing/notarization and prerequisite handling pass on the support matrix                                                      |
| Production clean      | No synthetic fixture, secrets, debug permissions, test accounts or paid component source exposed contrary to license; build is reproducible from the lockfile and pinned toolchain |
| User validation       | Intended readers complete the core scenarios in [USER_STORIES.md](USER_STORIES.md); blockers addressed and limitations documented                                                  |
| Handoff ready         | User backup instructions, release notes, third-party notices and support/reporting path available offline or bundled where needed                                                  |

No fixed universal verse count is a correctness gate. Validate against the chosen source's own canon and versification. Corpus validation distinguishes a source omission from an importer defect; approved deviations must be explicit.

## Compatibility boundary

Before public V1.0 there are no production users or compatibility obligations. Reset development databases after schema changes; remove obsolete APIs, components and files. Do not create historical migrations, compatibility shims or deprecated alternatives. Warn developers before an intentional reset, but do not treat disposable development data as a product migration requirement.

At the V1.0 release boundary, freeze the first supported user-data and backup schemas, test the baseline fixtures, and record their versions. Subsequent public releases must preserve user data and provide tested migrations. This transition is described in [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).
