import { expect, test } from "@playwright/test";

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
