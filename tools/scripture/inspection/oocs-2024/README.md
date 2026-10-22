# Uploaded USX source inspection

Inspected 2026-10-21. The archive is a suitable candidate for a direct USX import. This report records source inspection, not an implemented importer or approved production content pack.

## Identity and provenance

| Field                         | Observed value                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Edition                       | Biblica® Open Oromo Contemporary Scriptures 2024                                             |
| Local title                   | Biblica® Katabbiiwwan Qulqulluu, Turjumaana Ammayyaa Banamaa™                                |
| Abbreviations                 | OOCS / KQTAB                                                                                 |
| Copyright                     | Copyright © 2024 by Biblica, Inc.                                                            |
| Language                      | West Central Oromo, `gaz`, Latin, left-to-right                                              |
| Completed                     | 2024-07-01                                                                                   |
| Bundle ID / metadata revision | `4d4cf8432222fef3` / `1`                                                                     |
| Format                        | USX 3.0; metadata 2.2.1                                                                      |
| ZIP                           | `text-4d4cf8432222fef3-299488.zip`                                                           |
| ZIP size / expanded size      | 1,950,509 / 8,727,156 bytes                                                                  |
| ZIP SHA-256                   | `ec543152e54faac1112e95ce74bc79ed2f20f26558edeef4b1b64fc96d608106`                           |
| Original download-page URL    | [Library.Bible content catalog](https://app.library.bible/content), user-reported 2026-10-21 |

The 2024 edition is distinct from the project's earlier 2022 candidate. The opaque filename suffix is not treated as a verified revision number. Source bytes were preserved; the final archive hash still matches.

## Results

The ZIP has 71 files: 66 USX books plus metadata, license, styles, language data and versification. All XML-like files parse from strict UTF-8, without DTD/entity declarations. No unsafe paths, encrypted entries, duplicate paths or symlinks were observed. No Bible files were extracted or placed in application assets.

The default publication declares all 66 available books in canonical display order. Checks passed for 1,189 matched chapter starts/ends, 31,102 matched verse-unit starts/ends, unique labels, milestone order and 17,955 continuation-paragraph `vid` values. The included books match their supplied versification coverage.

`MAT 2:5-6` is one source verse unit covering two numeric addresses. The corpus has 31,103 covered numeric labels. The versification file also lists 123 book-count entries and 257 mappings; its additional books are not missing files in this 66-book publication.

Formal USX schema validation, source-to-app text equivalence, publisher-rendering comparison, fluent Oromo review and production approval have not been performed. Parsing and address consistency alone do not prove final rendering integrity.

## License evidence

`metadata.xml/promotion/promoVersionInfo` explicitly applies CC BY-SA 4.0, with bilingual copyright/attribution and Biblica trademark conditions. The short `license.xml` separately marks access open and permits introductions, footnotes, cross-references and extended notes; it is not the full license notice.

Retain the exact supplied titles, copyright and license notices. The publisher's notice distinguishes unmodified redistribution from editorial/translated derivatives. CC BY-SA §2(a)(4) permits necessary technical format changes and says those alone do not create Adapted Material; lossless XML-to-SQLite conversion is not automatically an editorial adaptation. Trademarks and database packaging still need the applicable terms respected. No additional permission letter is presumed necessary for uses already licensed.

The user identified Library.Bible's content catalog as the original download source on 2026-10-21. The original download date is unknown. Digital Bible Library's official guidance documents [USX text bundles](https://care.library.bible/article/252-frequently-asked-questions), [Open access and resource-specific licensing](https://care.library.bible/article/158-content-license), and [ZIP downloads](https://care.library.bible/article/160-downloading-content-with-permission). The exact catalog entry/revision was not independently accessible during inspection; the archive has not independently been matched to that download. The supplied license notice is recorded separately from this provenance limitation. See the project [license record](../../../../docs/CONTENT_LICENSING.md#uploaded-oocs-2024-candidate).

## Required importer behavior

1. Parse this source directly as USX 3.0. Preserve mixed text and element tails in order, milestone identities and source locations. Never parse the XML with regular expressions or convert it to USFM merely to fit an existing plan.
2. Cover all 43 paragraph styles and 10 character styles explicitly, including headings, lists, superscriptions, poetry and the 342 nested character relationships. Preserve the 460 optional breaks rather than replacing text silently. Extend the fixture AST only for these demonstrated needs.
3. Preserve 478 footnotes. Two occur outside an active verse (EXO chapter 8 and PSA chapter 88); preserve chapter/source locations without inventing verse anchors. Preserve four `category="dup"` notes and 1,071 character nodes with `closed="false"`.
4. Preserve 2,114 reference locations, including cross-chapter and whole-chapter ranges. A single chapter-local user-note anchor cannot encode every Scripture cross-reference.
5. Use metadata publication order, localized book names and the supplied versification. Preserve the bridged label and explicit lookup of both covered addresses.
6. Keep display and copy text exact. Across source XML text nodes there are 36,842 U+02BC modifier-letter apostrophes, 1,510 U+2019 marks and no ASCII apostrophes. All text nodes are NFC. The fixture search profile deliberately distinguishes U+02BC; a production equivalence policy needs explicit Oromo review and browser/native tests.
7. Preserve license/copyright notices and archive/member hashes. Fail on unsupported Scripture structure; emit a coverage report before a content pack can be marked distributable. Do not overwrite user data or bypass the existing public-build gate.

## Next implementation slice

Evaluate a maintained XML parser against this observed profile; pin the actual selected dependency only after its API/license and text-preservation behavior pass the spike. Add synthetic fixtures for mixed text, continuation paragraphs, the bridge, chapter-level footnotes, nested styles, optional breaks and cross-chapter references. Then compare every source text run and address with normalized output before building the immutable SQLite/FTS5 artifact.

Detailed file hashes, per-book counts and complete tag/style inventories are in [inspection.json](inspection.json). The one-off ZIP/XML inspection and an independent audit confirmed versification coverage and the importer edge cases recorded here. The inspection was not a production parser or source-to-app equivalence check. The original archive is a separate local input; it is not included in this repository.
