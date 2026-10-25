import { expect, test } from "@playwright/test";

test("reader shortcuts do not change the hidden panel behind an open dialog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reading preferences" }).click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("Control+f");
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Done" }).click();
  await expect(settings).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Scripture search" })).toHaveCount(0);

  await page.keyboard.press("Control+f");
  const search = page.getByRole("complementary", { name: "Scripture search" });
  await expect(search).toBeVisible();
  await expect(search.getByRole("textbox", { name: "Words or quoted phrase" })).toBeFocused();
});

test("keyboard opens and dismisses navigation, selects a verse, and reaches note editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();

  const menu = page.getByRole("button", { name: "Open library navigation" });
  await menu.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Library" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();

  const verse = page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" });
  await verse.focus();
  await page.keyboard.press("Space");
  await expect(verse).toHaveAttribute("aria-pressed", "true");
  const addNote = page.getByRole("button", { name: "Add note", exact: true });
  await addNote.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("region", { name: "Note editor" });
  await expect(editor).toBeVisible();
  const title = editor.getByRole("textbox", { name: "Note title" });
  await title.focus();
  await page.keyboard.type("Keyboard note");
  await expect(title).toHaveValue("Keyboard note");
  const body = editor.getByRole("textbox", { name: "Note text" });
  await body.focus();
  await page.keyboard.type("A linked observation entered with the keyboard.");
  const save = editor.getByRole("button", { name: "Save", exact: true });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(editor.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: /My notes/ }).focus();
  await page.keyboard.press("Enter");
  const savedNote = page
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: /^Keyboard note/ });
  await savedNote.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue("Keyboard note");
});
