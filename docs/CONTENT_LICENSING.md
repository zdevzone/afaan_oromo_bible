# Content licensing and attribution

Status: **distribution permissions for the initial edition are not yet confirmed for this project**. This document establishes the clearance process; it is not legal advice or a grant of rights. No edition is approved by its presence in the brief, online availability or suitability as a technical example.

## Release rule

Only ship a content artifact whose exact source revision, license/evidence, required notices and permitted distribution scope are recorded and approved. Keep app source licensing, proprietary component licensing, Scripture licensing and personal user data separate. No public production release is complete until at least one appropriate Afaan Oromo edition passes this gate.

Do not treat all Oromo editions as interchangeable. Confirm intended audience, language variety, publisher, edition year, canon/book list and numbering. Have fluent intended readers and church users review representative passages before selection. The product should not advertise an edition as dialect-neutral or universally accepted without evidence.

## Initial resource register

The following entries are **candidates/pointers from the supplied brief, not independently cleared resources**. Capture the exact current source notices and any publisher clarification before approving a pack; linked pages may change.

| Resource | Evidence pointer | Current disposition / action |
| --- | --- | --- |
| Biblica 2022 Open New Oromo Contemporary Version, Western, as identified in the brief | [eBible Oromo listing](https://ebible.org/find/show.php?id=gaz), [Biblica permissions](https://www.biblica.com/permissions/) | Candidate. The brief reports CC BY-SA 4.0 and USFM availability; verify exact title, notice, archive, revision, rights-holder authority, license conditions and audience/variety. Do not assume those facts have been rechecked here. |
| Bible Society of Ethiopia 1997 Afaan Oromo edition, as identified in the brief | [Bible.com edition listing](https://www.bible.com/versions/3202-macqul-macaafa-qulqulluu-afaan-oromoo) | Candidate requiring exact source and redistribution permission. A reading-page listing is not an offline distribution license. |
| KJV, future English candidate | [Source rights notice](https://ebible.org/eng-kjv/copyright.htm) | Post-V1. Verify exact source and territorial rights, including the UK caveat; do not label all KJV distribution unrestricted worldwide. |
| NIV, future English candidate | [Biblica permissions](https://www.biblica.com/permissions/) | Post-V1. No approval assumed. Assess offline bundling, searchable distribution, quotation limits, territory and any proposed AI use separately. |
| WEB, possible alternative for future evaluation | [Source notice](https://ebible.org/engwebp/copyright.htm) | Not a user-selected substitution. Verify the exact edition/source notice if evaluated later. |
| Licensed Shadcnblocks Pro | [Shadcnblocks license](https://www.shadcnblocks.com/license) and the terms attached to the actual purchase | User confirms ownership and finished-application use. Inventory the purchased source/license. Do not redistribute/resell a competing component library or publish restricted source without permission. |
| Synthetic development fixtures | Authored in this repository, visibly identified as test content | Allowed for engineering; never present as Bible text. Public production build must exclude them. |

Do not make market claims such as "first Oromo desktop Bible" without separate research. Existing modules or websites prove neither product compatibility nor distribution rights.

## Required record per resource

Maintain a machine-readable resource manifest alongside build metadata and a human-readable approval record. For each Bible, commentary, cross-reference dataset, font, icon set or UI resource record:

- Stable resource/edition ID; exact title, language/variety, author/publisher, edition/revision, year and supplied book list.
- Authoritative acquisition URL and date; original archive/file hashes; importer/version and normalized content digest. Record a license file hash or a retained dated copy of the applicable terms.
- Rights holder, license name/version/URL, exact copyright and attribution wording, and private evidence references for permission correspondence. Keep private correspondence outside the public repository.
- Confirmed scope for app bundling, downloadable packs, territory, commercial/noncommercial distribution, offline storage, search/index derivation, copying/export, adaptations and notice/source obligations. A field can say "not requested/not used" rather than presuming approval.
- Separate assessment for remote processing, embeddings, model-provider submission and AI quotations when those features are proposed. Do not assume a display permission covers every AI use or that a generic site policy necessarily overrides a granted open license.
- Approval owner/date, unresolved conditions, expiration/renewal if applicable, and distributable status. Changes in source revision trigger a check that the permission covers that revision.

Engineering validates manifest completeness; the product/content owner makes and records the rights decision, obtaining qualified advice where terms are unclear. Agents must not fabricate an approval, rights-holder reply or legal interpretation. Work that does not depend on clearance continues using permitted synthetic content.

## Open-license handling

If the selected source is verified under CC BY-SA 4.0, retain proper attribution, link/include the exact license, identify modifications as required, and assess share-alike obligations for transformed/distributed content. USFM-to-AST/SQLite conversion is a technical transformation whose legal treatment and notices must be assessed against the exact terms. Do not silently rewrite Scripture; preserve source wording regardless of what a license might permit.

Do not assume a content license automatically relicenses unrelated application code, or assume the opposite without assessing how the artifact is packaged. Keep the content pack identifiable and independently attributed. Never add restrictions that conflict with granted license rights. Consult the authoritative [CC BY-SA 4.0 deed](https://creativecommons.org/licenses/by-sa/4.0/) and [legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode), plus the exact publisher notice, when this candidate is evaluated.

A public-domain claim also needs the exact resource, territory and any edition-specific additions checked. A modern translation, editorial apparatus or commentary can have rights distinct from an older underlying work.

## Product presentation and user copying

The offline edition information view shows exact title/abbreviation, publisher/year, language/variety, content revision, included books, attribution, copyright, license and applicable restrictions/notices. Required notices must be accessible without internet; a URL alone is insufficient where terms require an included notice/license. Include appropriate content notices in packaged artifacts and release materials.

Copying a selected passage uses the exact approved Scripture projection plus its reference and edition label. Add required attribution/copyright notices according to the selected resource's terms. Before releasing copying/export, verify that selection sizes and any limits are compatible with the source permission. Do not invent a universal verse limit. If a candidate's terms cannot support the required V1 reading/copying/search experience, resolve permission or choose another suitable authorized edition.

Personal-data backup contains users' note text and reference metadata rather than bundled Scripture. Users may type quotations into their own notes; do not inspect or rewrite private prose to simulate a blanket rights guarantee. Publishing/sharing future sermon documents requires a separate copy/attribution design, not an assumption that personal backups grant redistribution rights.

## UI, fonts and dependencies

Use the purchased Shadcnblocks Pro resource as the primary design/component source, per [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md). Do not replace it merely to avoid an inventory step. The actual purchased terms govern handling of copied component source, repository visibility and contractor/agent access. A finished-app distribution and public distribution of the underlying component collection are different activities. Keep paid source out of a public repository unless expressly permitted; ship only allowed compiled application assets with required notices.

Track versions/licenses of bundled open-source dependencies, icons and fonts. Prefer locally bundled reading fonts with verified licensing and Oromo glyph coverage; no CDN dependency for core offline reading. Generate/check third-party notices from the lockfiles and include font licenses where required. Do not assume that a package's transitive assets share its top-level license.

Do not paste paid source into logs, screenshots of code, public issue bodies or examples. Agent access to a private workspace does not authorize publishing proprietary files. Credentials and registry tokens are never content metadata.

## Clearance checklist and release acceptance

- Exact first edition, intended audience/variety, canon and source revision are selected and documented; all linked evidence has been checked against that actual artifact.
- Every distributed content/font/UI resource has a complete license record; all unresolved permissions-dependent content is absent from the public build.
- Required notices, attribution, modification/conversion disclosures and source/license access obligations are satisfied in the app and package. Product copy names the edition accurately.
- Import integrity approval confirms the displayed text matches the authorized source. Legal clearance does not excuse content corruption.
- Copy/search/export behaviors are reviewed for the selected terms; future commentary, other translations and AI get their own clearance before activation.
- Release owner signs off on the final artifact/resource manifest. A newly found permission problem blocks affected distribution; it does not justify deleting unrelated user data.

See [SCRIPTURE_PIPELINE.md](SCRIPTURE_PIPELINE.md) for artifact provenance and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) for the public packaging gate.
