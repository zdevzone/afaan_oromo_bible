# Product requirements — Afaan Oromo Bible

Status: adopted planning baseline, 2026-10-19. This specifies the intended first public release; it does not claim that features, rights, or platform support have already been verified. [MVP_SCOPE.md](MVP_SCOPE.md) owns release acceptance; [ROADMAP.md](ROADMAP.md) owns delivery order.

## Product goal

Provide a beautiful, dependable Afaan Oromo Scripture reader for Windows and macOS that works without internet, an account, a subscription, or AI. A person should be able to find a passage during a church service, read it comfortably, record a thought, and recover that note later.

V1 ships one established, authorized Afaan Oromo edition. The exact edition, intended readers, canon and variety remain **verification required**. The product must identify that edition honestly and must not present a particular variety as universally accepted. Do not claim to be the first or only Oromo desktop Bible without evidence.

## Intended users and needs

These are working audience hypotheses to validate during content selection and beta testing.

| User                              | Primary need                                         | V1 response                                                           |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Everyday reader                   | Read comfortably and resume later                    | Offline chapters, reading controls, last-position persistence         |
| Church attendee                   | Reach a reference quickly without distracting UI     | Book/chapter picker, reference entry, keyboard access                 |
| Personal Bible student            | Find related passages and retain observations        | Text search, highlights, bookmarks, plain notes                       |
| Teacher or preacher               | Collect passages and draft thoughts before a service | Copy with attribution, verse-linked and standalone notes, export      |
| Reader using assistive technology | Navigate and understand the same content             | Semantic reading structure, keyboard operation, screen-reader testing |

V1 supports preparation through reliable reading and notes. It does not include a sermon-management workspace or presentation system.

## Product principles

1. Scripture is the center of the interface. Navigation and study tools should support the text without turning the product into a dashboard.
2. A bundled, authorized edition and personal data remain available offline. Remote services cannot become prerequisites for reading or note access.
3. Preserve published text and structure. Search normalization is a separate derived representation; it never rewrites displayed Scripture.
4. Make data durability visible. Show saving, saved and failed states accurately, and provide usable backup and restore.
5. Prefer a small finished release to a broad collection of incomplete study tools.
6. Reuse licensed Shadcnblocks Pro resources first, then the underlying shadcn/ui ecosystem, with a consistent accessible design system. Availability of individual paid components must be verified.
7. Build one React application with browser and desktop adapters, and validate native persistence early.

## Adopted scope decisions

| Area          | Decision                                                                                                                          | Reason                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Platforms     | Windows and macOS desktop                                                                                                         | Stated product target; exact supported OS/architecture matrix is verified before beta |
| Development   | React + TypeScript + Vite+, Varlock, Tailwind CSS; Tauri 2 integrated in Phase 1                                                  | Fast browser feedback with early native-risk discovery                                |
| Reading       | One bundled edition, chapter-based loading and rendering                                                                          | Complete offline reader without premature content management                          |
| Storage       | Immutable Scripture SQLite and separate mutable user SQLite on desktop; fixture JSON and IndexedDB for browser development        | Protect content integrity and keep private records independent of content packages    |
| Native access | Narrow Rust commands using bundled `rusqlite` and FTS5                                                                            | Read-only content access and atomic user transactions without a general SQL bridge    |
| Notes         | Plain text, standalone or linked to edition-aware verse anchors                                                                   | Durable useful notes without a complex editor schema                                  |
| Backup        | Versioned portable JSON of user records; validated atomic replacement with explicit restore confirmation and pre-restore snapshot | Predictable recovery; no merge semantics in V1                                        |
| Languages     | Interface locale and edition are separate settings                                                                                | Future editions should not require changing menu language                             |
| Network       | No remote backend required for V1                                                                                                 | Offline independence and reduced operational burden                                   |
| Compatibility | No backward-compatibility obligations before public V1.0                                                                          | Refactor directly, remove obsolete code and reset development data as needed          |

These decisions supersede recommendations in the original brief where they differ, including its generic Vite recommendation, SQL-plugin option and richer note model. User instructions select Vite+ and Varlock. Details and dependency verification belong to [TECH_STACK.md](TECH_STACK.md).

## Required V1 outcomes

| Requirement                     | Outcome                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01: reliable offline reading  | An installed app can open every included chapter without network access and displays the approved edition's supplied content faithfully.              |
| P-02: efficient navigation      | A user can choose a book/chapter, move to an adjacent chapter, and resolve a supported reference without losing their place to a misleading fallback. |
| P-03: useful search             | Supported words, phrases and book filters work with Oromo-aware normalization and stable result references.                                           |
| P-04: passage actions           | A user can select whole verses, copy with reference/edition notice, bookmark, highlight and add a linked note.                                        |
| P-05: personal records          | Standalone and linked notes, annotations, preferences and reading position survive an acknowledged save and relaunch.                                 |
| P-06: recovery                  | A portable backup can restore personal records on a clean installation; invalid backups leave existing records untouched.                             |
| P-07: readable accessible UI    | Light/dark/system themes, reading controls, keyboard access and screen-reader workflows meet the agreed acceptance checks.                            |
| P-08: transparent content       | Edition, source, copyright, license/permission notice and included-book information are visible offline.                                              |
| P-09: distributable application | Windows/macOS installers and signing/notarization are validated on the final support matrix before public release.                                    |

Detailed behavior belongs to [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md), scenarios to [USER_STORIES.md](USER_STORIES.md), and the release checklist to [MVP_SCOPE.md](MVP_SCOPE.md).

## Nonfunctional quality goals

The following are **proposed acceptance targets**, not measured results or platform-support claims. Phase 1 records a baseline; Phase 3 either meets the targets or changes them explicitly with recorded evidence. Measure production builds against a full authorized V1 corpus, not only the small fixture.

| Goal                     | Proposed target                                                            | Measurement                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold usable reader       | p95 ≤3 seconds                                                             | Twenty fresh process launches after a completed installation, from process start to visible first chapter plus enabled navigation; report OS cache state separately |
| Chapter interaction      | p95 ≤150 ms                                                                | Fifty warm next/previous chapter actions, from command to rendered chapter; include long prose and poetry chapters                                                  |
| Indexed text search      | p95 ≤300 ms                                                                | Fifty fixed Oromo queries across the full corpus, from submitted query to first ≤50 results; report query set and match counts                                      |
| Note durability feedback | p95 ≤700 ms after idle begins                                              | Fifty edits with a 300 ms debounce included; time until the persistence transaction succeeds and UI says saved                                                      |
| Content integrity        | Zero unexplained lost/changed source text or unresolved structural records | Pipeline reports against exact source revision; all reviewed exceptions explicit                                                                                    |
| Reliability              | Zero known release-blocking data loss or corruption cases                  | Crash/restart, disk-write failure, corrupt-backup and restore tests                                                                                                 |

Benchmark on a recorded Windows 11 x64 machine with at least 8 GB RAM and SSD and an Apple M1 Mac with 8 GB RAM and SSD; record exact hardware, OS, WebView, app version and corpus hash. These machines are benchmark references; the support floor is a separate release decision. Report distributions, not a single best run. No target permits losing fidelity, accessibility or an honest save indicator.

## Success evaluation

Conduct a small formative test with at least five intended readers, including fluent Oromo reviewers and users who rely on keyboard navigation. This is usability feedback, not a statistically representative market claim. Each participant should complete passage navigation, phrase search, linked-note creation, restart/resume and backup/restore tasks without developer intervention. Record completion, errors and confusing wording. Resolve any inability to perform a required task before release.

Do not add behavioral telemetry by default. Use consented observations, local benchmark output, manually submitted logs with personal text removed, and voluntary feedback. Personal notes must never be uploaded implicitly.

## Explicit exclusions

V1 excludes multiple bundled translations, parallel reading, rich-text editing, sermon templates/organization, commentary packages, audio, cloud accounts, synchronization, AI, mobile applications and automatic content downloads. A simple, signed manual application-update path is sufficient; a self-updater is optional and must not delay the reader. See [ROADMAP.md](ROADMAP.md) for later sequencing.

## Decisions requiring verification

| Decision                                 | Evidence needed                                                                                                                                  | Deadline                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Initial edition and intended audience    | Exact source archive and permission terms, representative review by fluent readers and intended church users, explicit canon/variety description | Before full import and all public content builds         |
| Content distribution and attribution     | Rights covering the planned installers, offline storage, permitted copy/export and indexing behavior; exact notices                              | Before shipping any real edition                         |
| Shadcnblocks inventory                   | Purchased source, applicable license and usable component examples                                                                               | Before custom alternatives or public-source distribution |
| Interface wording                        | Fluent review of Afaan Oromo strings and reference aliases; complete English fallback                                                            | Before beta exit                                         |
| OS/architecture support                  | Target-machine validation, signing identities, installation/runtime requirements                                                                 | Before beta                                              |
| Distribution model and source visibility | Repository policy compatible with the paid-source license and content terms                                                                      | Before publishing repository or installers               |

No unresolved content permission is bypassed by calling a build a demo. Clearly labeled synthetic fixtures enable private development; public production builds must exclude them.

## Change control without bureaucracy

Update the document that owns the changed decision, affected contracts and acceptance checks together. A scope addition must identify user value, delivery cost and the required milestone; it does not silently become a V1 blocker. Until V1.0, remove obsolete implementations directly and recreate development databases rather than maintaining migrations or compatibility shims. After V1.0, user-data preservation and tested schema migrations become release requirements.
