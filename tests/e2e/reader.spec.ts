import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("finds a bridge, saves a linked note, restores it after reload, and keeps deletion durable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic test content — not Scripture", { exact: true }).first(),
  ).toBeVisible();

  const reference = page.getByRole("textbox", { name: "Open a Scripture reference" });
  await reference.fill("TSA 1:2");
  await reference.press("Enter");
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:2-3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add note", exact: true }).click();

  const editor = page.getByRole("region", { name: "Note editor" });
  await expect(editor.getByText("Sample Book A 1:2-3", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Note title", exact: true }).fill("Service preparation");
  await page
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill("My private observation remains linked to the whole synthetic bridge.");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chapter 2", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chapter 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^My notes/ }).click();
  await page
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Service preparation/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).toHaveValue(
    "Service preparation",
  );
  await expect(page.getByRole("textbox", { name: "Note text", exact: true })).toHaveValue(
    "My private observation remains linked to the whole synthetic bridge.",
  );
  await expect(editor.getByText("Sample Book A 1:2-3", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Open Sample Book A 1:2-3", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:2-3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Delete this note", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete this note?" });
  await confirmation.getByRole("button", { name: "Delete note", exact: true }).click();
  // The modal hides background roles while deletion is pending. Its close acknowledges commit.
  await expect(confirmation).toBeHidden();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Saved notes" }).getByRole("button", {
      name: /^Service preparation/,
    }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^My notes/ }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet place for your thoughts" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Service preparation/ })).toHaveCount(0);
});

test("searches a phrase, opens its exact result, and leaves the passage intact after invalid reference input", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Search Scripture", exact: true })
    .click();
  const search = page.getByRole("complementary", { name: "Scripture search", exact: true });
  await search.getByRole("textbox", { name: "Words or quoted phrase" }).fill('"careful reading"');
  await search.getByRole("button", { name: "Search Scripture", exact: true }).click();
  await search.getByRole("button", { name: /^Sample Book A 1:1/ }).click();
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const reference = page.getByRole("textbox", { name: "Open a Scripture reference" });
  await reference.fill("TSA 999:1");
  await reference.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("bookmarks an exact verse, deduplicates it, edits its label, and reopens it after restart", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  const bridge = page.getByRole("button", {
    name: "Select verse Sample Book A 1:2-3",
    exact: true,
  });
  await bridge.click();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Saved bookmarks" });
  await expect(panel.getByText("SAVED BOOKMARKS · 1")).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect(panel.getByText("SAVED BOOKMARKS · 1")).toBeVisible();
  await panel.getByRole("button", { name: "Edit label" }).click();
  await panel.getByRole("textbox", { name: "Bookmark label" }).fill("Return to the bridge");
  await panel.getByRole("button", { name: "Save label" }).click();
  await expect(panel.getByRole("button", { name: /Return to the bridge/ })).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: /^Bookmarks/ })
    .click();
  await panel.getByRole("button", { name: /Return to the bridge/ }).click();
  await expect(bridge).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "Remove" }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove this bookmark?" });
  await confirmation.getByRole("button", { name: "Remove bookmark" }).click();
  await expect(confirmation).toBeHidden();
  await expect(panel.getByText("No bookmarks yet")).toBeVisible();
});

test("attaches, changes and removes a saved note passage through validated references", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^My notes/ })
    .click();
  const notes = page.getByRole("complementary", { name: "Personal notes" });
  await notes.getByRole("button", { name: "New note" }).click();
  await notes.getByRole("textbox", { name: "Note title" }).fill("Reference review");
  await notes.getByRole("textbox", { name: "Note text" }).fill("Keep this private text.");
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");
  const reference = notes.getByRole("textbox", { name: "Passage reference" });
  await reference.fill("TSA 9:1");
  await notes.getByRole("button", { name: "Attach passage" }).click();
  await expect(notes.getByRole("alert")).toContainText("chapter is not available");
  await expect(notes.getByRole("button", { name: /^Open Sample Book A/ })).toHaveCount(0);
  await reference.fill("TSA 1:2");
  await notes.getByRole("button", { name: "Attach passage" }).click();
  await expect(notes.getByRole("button", { name: "Open Sample Book A 1:2-3" })).toBeVisible();
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^My notes/ })
    .click();
  await notes
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Reference review/ })
    .click();
  await expect(notes.getByRole("button", { name: "Open Sample Book A 1:2-3" })).toBeVisible();
  await notes.getByRole("textbox", { name: "Passage reference" }).fill("TSB 1:2");
  await notes.getByRole("button", { name: "Change link" }).click();
  await expect(notes.getByRole("button", { name: "Open Sample Book B 1:2" })).toBeVisible();
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^My notes/ })
    .click();
  await notes
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Reference review/ })
    .click();
  await expect(notes.getByRole("button", { name: "Open Sample Book B 1:2" })).toBeVisible();
  await notes.getByRole("button", { name: "Remove passage link" }).click();
  await expect(notes.getByRole("button", { name: /^Open Sample Book/ })).toHaveCount(0);
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^My notes/ })
    .click();
  await notes
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Reference review/ })
    .click();
  await expect(notes.getByRole("button", { name: /^Open Sample Book/ })).toHaveCount(0);
  await expect(notes.getByRole("textbox", { name: "Note text" })).toHaveValue(
    "Keep this private text.",
  );
});

test("colors a whole bridged verse and removes its persisted highlight", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" }).click();
  const scripture = page.locator(".scripture");
  await page.getByRole("button", { name: "Highlight yellow" }).click();
  await expect(scripture.locator('[data-highlight="yellow"]')).toHaveCount(1);
  const highlightedMarker = page.getByRole("button", {
    name: "Select verse Sample Book A 1:2-3. Highlighted yellow",
  });
  await expect(highlightedMarker).toHaveAttribute("data-has-highlight", "true");
  await expect(highlightedMarker.locator("svg")).toHaveCount(1);
  await page.getByRole("button", { name: "Highlight blue" }).click();
  await expect(scripture.locator('[data-highlight="blue"]')).toHaveCount(1);
  await page.reload();
  await expect(scripture.locator('[data-highlight="blue"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:2-3. Highlighted blue" }),
  ).toHaveAttribute("data-has-highlight", "true");
  await page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" }).click();
  await page.getByRole("button", { name: "Remove highlight" }).click();
  await expect(scripture.locator("[data-highlight]")).toHaveCount(0);
  await page.reload();
  await expect(scripture.locator("[data-highlight]")).toHaveCount(0);
});

test("exports, previews and restores a browser backup after explicit replacement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" }).click();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Highlight yellow" }).click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = page.getByRole("region", { name: "Note editor" });
  await editor.getByRole("textbox", { name: "Note title" }).fill("Backup round trip");
  await editor
    .getByRole("textbox", { name: "Note text" })
    .fill("Private linked note for recovery.");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved on this device");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chapter 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reading preferences" }).click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  await settings.getByRole("combobox", { name: "Interface language" }).click();
  await page.getByRole("option", { name: "Afaan Oromo (English fallback)" }).click();
  await expect(settings.getByText(/Interface controls remain in English/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await settings.getByRole("button", { name: "Increase text size" }).click();
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const exported = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(exported.data.notes).toHaveLength(1);
  expect(exported.data.bookmarks).toHaveLength(1);
  expect(exported.data.highlights).toHaveLength(1);
  expect(exported.data.preferences[0].fontSizePx).toBe(22);
  expect(exported.data.preferences[0].uiLocale).toBe("om");
  expect(exported.data.readingPositions[0].chapterLabel).toBe("2");
  expect(exported.data.anchors).toHaveLength(3);
  expect(
    new Set(exported.data.anchors.map((anchor: { unitKeys: string[] }) => anchor.unitKeys[0])).size,
  ).toBe(1);

  const alternate = structuredClone(exported);
  alternate.data.notes[0].bodyText = "This replacement must not be applied after cancel.";
  const cancelChooser = page.waitForEvent("filechooser");
  await settings.getByRole("button", { name: "Review backup to restore" }).click();
  await (
    await cancelChooser
  ).setFiles({
    name: "alternate-valid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(alternate)),
  });
  const cancelledPreview = page.getByRole("dialog", { name: "Replace personal data?" });
  await expect(
    cancelledPreview.getByText(/Imported: 1 notes, 1 bookmarks, 1 highlights/),
  ).toBeVisible();
  await cancelledPreview.getByRole("button", { name: "Cancel" }).click();
  await expect(cancelledPreview).toBeHidden();
  await settings.getByRole("button", { name: "Done" }).click();
  await expect(editor.getByRole("textbox", { name: "Note text" })).toHaveValue(
    "Private linked note for recovery.",
  );
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^Bookmarks/ })
    .click();
  const bookmarks = page.getByRole("complementary", { name: "Saved bookmarks" });
  await bookmarks.getByRole("button", { name: "Remove" }).click();
  await page
    .getByRole("dialog", { name: "Remove this bookmark?" })
    .getByRole("button", { name: "Remove bookmark" })
    .click();
  await expect(bookmarks.getByText("No bookmarks yet")).toBeVisible();
  await page.getByRole("button", { name: "Reading preferences" }).click();
  await settings.getByRole("button", { name: "Increase text size" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await settings.getByRole("button", { name: "Review backup to restore" }).click();
  await (await chooserPromise).setFiles(backupPath!);
  const confirmation = page.getByRole("dialog", { name: "Replace personal data?" });
  await expect(
    confirmation.getByText(/Imported: 1 notes, 1 bookmarks, 1 highlights/),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Replace all personal data" }).click();
  const completed = page.getByRole("dialog", { name: "Personal data restored" });
  await expect(completed).toBeVisible();
  await completed.getByRole("button", { name: "Reload reader" }).click();
  await expect(page.getByRole("heading", { name: "Chapter 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reading preferences" }).click();
  await expect(settings.getByText("22 px")).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Interface language" })).toContainText(
    "Afaan Oromo (English fallback)",
  );
  await settings.getByRole("button", { name: "Done" }).click();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^Bookmarks/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Saved bookmarks" }).getByText("SAVED BOOKMARKS · 1"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous chapter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(page.locator('.scripture [data-highlight="yellow"]')).toHaveCount(1);
  await page.getByRole("button", { name: /^My notes/ }).click();
  await expect(
    page.getByRole("region", { name: "Saved notes" }).getByRole("button", {
      name: /^Backup round trip/,
    }),
  ).toBeVisible();
});

test("rejects a malformed backup without changing saved personal data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "My notes" }).click();
  const notes = page.getByRole("complementary", { name: "Personal notes" });
  await notes.getByRole("button", { name: "Write a note" }).click();
  await notes.getByRole("textbox", { name: "Note title" }).fill("Keep this record");
  await notes.getByRole("textbox", { name: "Note text" }).fill("Must survive invalid restore.");
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");

  await page.getByRole("button", { name: "Reading preferences" }).click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  const chooser = page.waitForEvent("filechooser");
  await settings.getByRole("button", { name: "Review backup to restore" }).click();
  await (
    await chooser
  ).setFiles({
    name: "broken-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(settings.getByRole("alert")).toContainText("not valid JSON");
  await expect(page.getByRole("dialog", { name: "Replace personal data?" })).toHaveCount(0);

  await settings.getByRole("button", { name: "Done" }).click();
  await notes
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Keep this record/ })
    .click();
  await expect(notes.getByRole("textbox", { name: "Note text" })).toHaveValue(
    "Must survive invalid restore.",
  );
});
