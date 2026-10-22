# UI/UX guidelines

Status: approved design direction and behavior constraints. Specific licensed blocks, fonts, final colors, and Oromo wording require the verification identified below. Feature behavior is owned by [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md).

V1 targets Windows, macOS, and Linux desktop using the same React UI and design system. Ubuntu 24.04 LTS x86_64 with GNOME is the proposed first qualified Linux environment; the authoritative distribution/session matrix and qualification evidence belong to [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md). Target inclusion is a requirement, not a claim that native accessibility or platform integration has passed.

## Reading comes first

The primary screen is an open Bible: book/chapter controls, a readable Scripture column, and unobtrusive study actions. Bookmarks, notes, and search support returning to a passage. Do not introduce dashboard cards, engagement scores, a marketing hero, or a large empty welcome screen into the reading flow.

The first usable screen opens the last readable passage, or the first book/chapter in the installed edition. The top bar identifies the Bible edition and current passage. A visible entry opens book/chapter navigation; search, study records, and settings remain reachable without covering the passage permanently. A development fixture must have a persistent “Synthetic test content — not Scripture” notice.

V1 has one approved Bible edition. Interface language is independently selectable; changing the interface language never swaps Scripture. Do not display unavailable editions as functioning choices.

## Shadcnblocks Pro is the primary UI resource

Our paid Shadcnblocks Pro library is an existing project resource. Use its suitable layouts, blocks, components, and interaction patterns before designing custom equivalents. Build application-specific reader compositions from those resources and their underlying shadcn/ui ecosystem. A finished distributed application may contain licensed components under the user's stated rights; do not package, publish, or resell the proprietary library as a standalone component product. Verify the actual purchased terms and source-publication permissions in [CONTENT_LICENSING.md](CONTENT_LICENSING.md).

Before implementing a UI area:

1. Inspect available official Shadcnblocks documentation/catalog and the project's licensed source. Record which material was actually accessible; catalog access alone is not access to licensed code.
2. Identify reusable navigation, panels, forms, menus, popovers, dialogs, selectors, empty states, and spacing/typography patterns. Verify the actual component APIs in source.
3. Adapt the smallest suitable component or block to the Scripture flow. Keep the reader column and controls recognizable across screens.
4. If no suitable component exists, record the gap and why a small composition or custom behavior is necessary. Scripture rendering and edition-aware reference selection are valid domain-specific compositions.
5. Verify keyboard behavior, focus, screen readers, visual states, theme support, and source licensing after adaptation.

Keep the concise inventory in this document as actual resources are selected. Do not invent Shadcnblocks block IDs or claim a paid block is present before inspecting it.

Initial inventory, 2026-10-19: the [official catalog](https://www.shadcnblocks.com/) and [license page](https://www.shadcnblocks.com/license) were consulted. No purchased component source was available in `/workspace/library-files`. The catalog offers Radix and Base UI variants; use the Radix ecosystem consistently for the initial shell and verify each selected primitive against its explicit Radix documentation, such as [Button](https://ui.shadcn.com/docs/components/radix/button). Generic component URLs can redirect to another ecosystem. Paid block selection and source inspection remain pending; no paid block ID is assumed.

| Application need                     | Initial candidate from underlying shadcn/ui           | Verification / composition work                                                            |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| App navigation and collapsible panes | Button, Sheet, Separator, Tooltip                     | Inspect licensed navigation/panel patterns first; avoid dashboard framing                  |
| Reference picker                     | Popover or Dialog, Command-style search/list patterns | Verify components exist in the acquired source; implement edition-aware reference behavior |
| Settings                             | Dialog, Label, Select, Switch, Slider, Radio Group    | Accessible names and value announcements; no native browser-styled selectors               |
| Verse actions and study records      | Dropdown Menu, Popover, Tabs, Button                  | Verse focus and dismissal must preserve passage position                                   |
| Notes                                | Input, Textarea, Button, Alert Dialog                 | Plain-text editor; labels, save/failure state, deletion confirmation                       |
| Search                               | Input, Button, appropriate list patterns              | Semantic result list; avoid an unnecessary complex grid                                    |
| Restore and critical errors          | Alert Dialog, Alert, Progress where available         | Validation preview, destructive confirmation, retry/export actions                         |

This is an inspection checklist, not a claim that these components have been installed. Until licensed sources are accessible, the initial shell may use verified underlying shadcn/ui primitives and shared tokens. Do not use that allowance to replace the purchased library or bypass its inspection requirement. Do not add another component library without a concrete technical reason and an updated [TECH_STACK.md](TECH_STACK.md).

Use semantic HTML inputs through styled components; “avoid native browser-styled controls” does not prohibit accessible HTML semantics. Use the shared Select/Popover patterns where available. Highlights use a bounded palette; V1 needs neither a free-form color picker nor a date picker. Native OS file dialogs are appropriate for desktop backup destinations.

On the qualified Linux environment, test GNOME file dialogs and standard clipboard operations in Wayland and X11 sessions. Opening/cancelling a file dialog must retain the draft and return focus to a useful app control. Explicit Copy targets the standard clipboard; ordinary text selection retains the desktop's expected behavior. Handle compositor/session clipboard denial or unavailability through the shared error/recovery UI. Keep these operations behind the existing platform ports; do not create a Linux UI fork or add dependencies solely to vary presentation.

## Layout and responsiveness

Use one React tree with responsive compositions across Windows, macOS, Linux, and browser development. The same layout must work with text enlargement and a resized desktop window. Breakpoints below are initial design values, adjusted after actual content testing.

| Available width       | Reader layout                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Below 760 CSS px      | One main pane. Book navigation and study/search panels open as labeled sheets/dialogs or full-width views with an obvious return action.                 |
| 760–1099 CSS px       | Reader plus one optional side pane, approximately 18–21 rem. Opening search can replace the navigation pane.                                             |
| 1100 CSS px and above | Reader with optional book navigation and one study/search pane when the reader retains a useful width. Collapse side panes before compressing Scripture. |

Use `minmax(0, 1fr)` and overflow-aware containers so a long word, reference, or note cannot force horizontal page scrolling. At 320 CSS px reflow width or 400% zoom, offer one-pane access to all core functions. Never require dragging pane edges to reveal a command. A minimum desktop window size is a release decision, not permission to skip zoom/reflow testing.

The passage scrolls vertically. Side panes may scroll independently with clear boundaries; avoid nested scroll areas inside the passage. Opening a popover must not move the reader scroll unexpectedly. Search and note panels retain their state when temporarily closed. Navigation after an explicit search/reference action brings the target verse into view and announces the new passage; reopening a panel does not reset the passage.

The reader width defaults to approximately 65 characters, bounded around 38–48 rem depending on font. Provide comfortable and wide reading widths; use the available viewport on narrow screens. Keep chapter text left-aligned and ragged-right. Preserve poetry indentation and source paragraph breaks; never justify text or force every verse into dashboard rows.

## Design tokens and typography

Define semantic CSS variables once: background, surface, foreground, muted foreground, border, primary/action, selected, focus, destructive, and highlight colors. Theme components consume tokens rather than scattered hex values. Tailwind utilities implement these decisions; they are not separate design systems.

| Token group      | Initial design direction                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Light theme      | Warm near-white reading background, dark neutral text, restrained teal or blue action accent                                                   |
| Dark theme       | Deep neutral background, light neutral text, softened borders; avoid pure white glare                                                          |
| Spacing          | 4 px base scale; reader padding 16 px narrow / 24–40 px wide                                                                                   |
| Controls         | Aim for at least 40 × 40 CSS px interactive targets; meet WCAG 2.2 AA target-size exceptions/minimums where compact text actions are necessary |
| Reader text      | Default 20 px; user range 16–32 px, line-height choices 1.4 / 1.65 / 1.9 (default 1.65); no fixed-height clipping                              |
| Interface text   | Default 14–16 px; preserve OS/browser zoom, with explicit labels for essential controls                                                        |
| Shape and motion | Modest shared radius, subtle surfaces, short optional transitions; honor reduced-motion preferences                                            |

Proposed reader-font candidate: a locally bundled serif such as Noto Serif, after checking the exact font file's license, Oromo glyph coverage, weight/subsetting, punctuation, and distribution notices. A system serif fallback must remain usable while assets load. Use a local/system sans-serif stack for UI controls unless a verified bundled font improves readability. Never load fonts from a remote CDN for V1. Ship only verified files and include required notices.

Font controls change text presentation, never stored Scripture content. Verse numerals should be visually subordinate but readable at the selected size. Headings must be clearly distinct from Scripture without making claims about their authority; source-supplied editorial headings and notes remain identified as such. Do not add editorial headings to an edition without authorization.

## Themes and visual states

Offer Light, Dark, and System. On first launch use System; remember a user override. Resolve theme before the first usable render to avoid an unreadable flash. System changes update the application only while System is selected.

All components need default, hover, focus-visible, active, disabled, loading, empty, validation-error, and persistence-error states where relevant. Text contrast must meet 4.5:1, large text 3:1, and non-text controls/focus indicators the relevant 3:1 criterion. Measure final color pairs, including highlighted text and selection in both themes; the palette above is not a contrast test.

Highlights use a small named palette, paired with text labels and an accessible selected state. Never communicate selected verses, save failures, or validation results using color alone. Keep OS high-contrast/forced-color behavior legible; do not erase focus outlines globally.

For Linux qualification, test GNOME high-contrast settings, enlarged system text, and display scaling in the actual WebKitGTK application on Wayland and X11. Do not assume a GNOME setting necessarily activates the browser's `forced-colors` or color-scheme media query. Verify actual rendering, focus indicators, font fallback/Oromo glyphs, dialogs, and reflow; use the shared tokens and accessible controls to resolve issues. Record any unsupported automatic theme detection honestly while preserving explicit Light/Dark choices.

## Reading interactions

Preserve normal text selection, copy, and screen-reader reading order. Provide a focusable verse-selection action associated with each verse unit, named with its full reference. It selects the whole source verse unit; bridges/subverses keep their source labels. Explicit “Copy selected verses,” bookmark, highlight, and note actions operate on these selections. Do not turn every word into an interactive element or intercept ordinary copy when text is selected.

Selection controls may be visually quiet but must be discoverable on focus and pointer interaction. A selected verse has a visible outline/marker in addition to color. Shift selection may extend a contiguous range inside the current chapter; provide an accessible equivalent that does not require modifier keys. Moving chapters clears the action selection, not the user's stored annotations. Stored bookmarks/highlights are separate from temporary selection.

Footnotes and cross-references use reachable labeled controls. Popovers present source note text in reading order, expose dismissal, and return focus to their trigger. On narrow layouts, a dialog/sheet can replace a popover. A link to a missing reference explains that it is unavailable; it never silently navigates to a guessed verse.

When the edition provides an unusual verse label, display it faithfully and resolve it through reference metadata. Never build references by adding 1 to the displayed label or assume verse numbering aligns across editions.

## Keyboard and assistive technology

Use semantic `header`, navigation, `main`, headings, lists, and form labels. Provide “Skip to Scripture” and a meaningful document/window title. Mark Scripture with the edition's verified language tag and the application shell with the chosen UI language. Oromo text normally uses `om`; region-specific tags require source metadata rather than guesswork.

Every required action must work with Tab/Shift+Tab, Enter/Space, appropriate arrow-key behavior inside verified components, and Escape to close transient UI. Do not use positive tabindex or a custom global arrow-key handler that breaks text selection or screen-reader navigation. Trap focus among all available controls inside a modal dialog and make the background inert; restore focus on close. Preserve a logical reading order when visual panes move.

| Command                      | Proposed desktop shortcut              | Constraint                                                                               |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Open reference navigation    | Ctrl+K Windows/Linux / Command+K macOS | Show in command/help UI; verify OS/WebView and GNOME session shortcut collisions         |
| Search Scripture             | Ctrl+F Windows/Linux / Command+F macOS | Focus app search from non-editing reader context; do not steal editor find/text behavior |
| Close transient panel/dialog | Escape                                 | Respect component dismissal and unsaved-note handling                                    |
| Copy text                    | Standard OS copy                       | Preserve native selection behavior; explicit verse-copy action is separately focusable   |

Shortcut hints follow the actual platform. No shortcut is the only way to perform an action. Do not bind single-letter global shortcuts in V1. Browser development may retain browser-reserved shortcuts; core controls remain usable without shortcut parity.

Announce chapter navigation, search completion, and save/restore status through restrained live regions. Avoid announcing every scroll event, keystroke, or debounce. Search counts use a status message after results settle. Errors are persistent, descriptive, and programmatically associated with their control; toast messages alone are insufficient for failed saves.

Acceptance requires manual keyboard testing in all three desktop targets, Windows screen-reader testing with NVDA, macOS testing with VoiceOver, and Linux testing with Orca through AT-SPI in actual Tauri builds. On the qualified GNOME environment, exercise Wayland and X11: verify reading order, verse labels/selection, search announcements, editor saves, modal focus, and native file-dialog return focus. These native results remain pending until recorded; browser tests or a Linux compilation do not establish them. Automated accessibility checks supplement these checks. Include enlarged text, 200% and 400% zoom/reflow, reduced motion, light/dark/system, and high contrast, with Linux system-font/display scaling as described above. Track findings in the normal issue list; the release gate lives in [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## Content, status, and error wording

Use clear verbs: Open passage, Search Scripture, Save note, Export backup, Restore backup. Distinguish “No results” from “Search unavailable” and “No notes yet” from “Could not load notes.” Never show “Saved” until persistence succeeds. A failed note save retains the editor text and offers retry or copy/export recovery.

The offline core must not show network loading spinners or request sign-in. No backend account, telemetry opt-in funnel, AI panel, or cloud placeholder belongs in the V1 reading screen. Settings contains attribution, edition metadata, version, backup/restore, and accessibility/preferences in reachable labeled groups.

English and Afaan Oromo interface catalogs are separate from source Bible metadata. Use English fallbacks while fluent review is incomplete; do not invent confirmed Oromo terminology. Translation strings support interpolation and plural forms without concatenating sentence fragments. Lay out for longer labels; never truncate a critical action without another way to read it.

## Design acceptance gate

- A reader can open, navigate, select/copy, search, annotate, change preferences, and back up data with keyboard alone on Windows, macOS, and the qualified Linux environments.
- Native NVDA, VoiceOver, and Orca/AT-SPI evidence is recorded for the release matrix; GNOME Wayland/X11 clipboard, dialogs, focus, high contrast, and font/display scaling have actual results rather than assumed parity.
- The passage remains the visual focus at supported window sizes and zoom levels; all panels have a clear close/return path.
- Final tokens, highlight combinations, local fonts, screen-reader flows, and licensed component provenance have been checked.
- No production view presents synthetic content as Scripture, unavailable features as working controls, or failed persistence as success.
- License inventory, chosen component/source references, and justified custom compositions are recorded before V1 release.
