import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoAutomatedViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test("reader and core panels pass automated accessibility checks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expectNoAutomatedViolations(page);

  await page.setViewportSize({ width: 700, height: 800 });
  await page.getByRole("button", { name: "Open library navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAutomatedViolations(page);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Search Scripture" })
    .click();
  const search = page.getByRole("complementary", { name: "Scripture search" });
  await expect(search).toBeVisible();
  await expectNoAutomatedViolations(page);
  await search.getByRole("textbox", { name: "Words or quoted phrase" }).fill('"careful reading"');
  await search.getByRole("button", { name: "Search Scripture" }).click();
  await expect(search.getByRole("button", { name: /^Sample Book A 1:1/ })).toBeVisible();
  await expectNoAutomatedViolations(page);

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "My notes" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quiet place for your thoughts" }),
  ).toBeVisible();
  await expectNoAutomatedViolations(page);
  await page
    .getByRole("complementary", { name: "Personal notes" })
    .getByRole("button", { name: "Write a note" })
    .click();
  await expect(page.getByRole("region", { name: "Note editor" })).toBeVisible();
  await expectNoAutomatedViolations(page);

  await page.getByRole("button", { name: "Reading preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAutomatedViolations(page);
});

test("dark reading reflows at 320 CSS pixels without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  const settingsTrigger = page.getByRole("button", { name: "Reading preferences" });
  await settingsTrigger.click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  await settings.getByRole("combobox", { name: "Appearance" }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoAutomatedViolations(page);
  await settings.getByRole("button", { name: "Increase text size" }).click();
  await settings.getByRole("button", { name: "Increase text size" }).click();
  await settings.getByRole("button", { name: "Close dialog" }).click();
  await expectNoAutomatedViolations(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Open library navigation" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" }),
  ).toBeVisible();
});

test("reader actions remain available at 200% and 400% reflow widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole("button", { name: "Open library navigation" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Open library navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Library" })).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
});

test("a long personal note remains editable at 320 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open library navigation" }).click();
  await page
    .getByRole("dialog", { name: "Library" })
    .getByRole("button", { name: /My notes/ })
    .click();
  const notes = page.getByRole("main", { name: "Personal notes" });
  await notes.getByRole("button", { name: "Write a note" }).click();
  const unbroken = "Qarree".repeat(80);
  const title = "Qarree".repeat(30);
  await notes.getByRole("textbox", { name: "Note title" }).fill(title);
  const body = notes.getByRole("textbox", { name: "Note text" });
  await body.fill(unbroken);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(
    page
      .getByRole("complementary", { name: "Personal notes" })
      .getByRole("textbox", { name: "Note text" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(body).toBeFocused();
  await expectNoAutomatedViolations(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notes.getByRole("status")).toHaveText("Saved on this device");
  const skip = page.getByRole("link", { name: "Skip to reading" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Open library navigation" }).click();
  await page
    .getByRole("dialog", { name: "Library" })
    .getByRole("button", { name: /My notes/ })
    .click();
  const savedNote = page.getByRole("main", { name: "Personal notes" });
  await savedNote
    .getByRole("region", { name: "Saved notes" })
    .getByRole("button", { name: new RegExp(`^${title}`) })
    .click();
  await expect(savedNote.getByRole("textbox", { name: "Note text" })).toHaveValue(unbroken);
});

test("reduced motion and forced colors retain a visible verse selection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  const verse = page.getByRole("button", { name: "Select verse Sample Book A 1:2-3" });
  await verse.click();
  await expect(verse).toHaveAttribute("aria-pressed", "true");
  const styles = await verse.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(styles.outlineStyle).toBe("solid");
  expect(styles.outlineWidth).toBe("2px");
  expect(
    Math.max(...styles.transitionDuration.split(",").map((value) => Number.parseFloat(value))),
  ).toBeLessThanOrEqual(0.001);
  await page.getByRole("button", { name: "Highlight yellow" }).click();
  const highlighted = page.getByRole("button", {
    name: "Select verse Sample Book A 1:2-3. Highlighted yellow",
  });
  await expect(highlighted.locator("svg")).toBeVisible();
  await expect(highlighted).toHaveCSS("border-bottom-style", "solid");
  await expect(highlighted).toHaveCSS("border-bottom-width", "2px");
  const selectedHighlight = await highlighted.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(selectedHighlight).toEqual({ outlineStyle: "solid", outlineWidth: "2px" });

  await page.getByRole("button", { name: "Reading preferences" }).click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  const appearance = settings.getByRole("combobox", { name: "Appearance" });
  const fieldStyle = await appearance.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderTopStyle,
      background: style.backgroundColor,
      color: style.color,
    };
  });
  expect(fieldStyle.borderStyle).toBe("solid");
  expect(fieldStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(fieldStyle.color).not.toBe("rgba(0, 0, 0, 0)");
  await expect(settings).toHaveCSS("border-top-style", "solid");
  await expectNoAutomatedViolations(page);
});

test("system theme follows OS changes and reading layout settings persist", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  const settingsButton = page.getByRole("button", { name: "Reading preferences" });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "Make room for reading" });
  await settings.getByRole("combobox", { name: "Appearance" }).click();
  await page.getByRole("option", { name: "Follow system", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await settings.getByRole("combobox", { name: "Line spacing" }).click();
  await page.getByRole("option", { name: "Relaxed", exact: true }).click();
  await settings.getByRole("combobox", { name: "Reading width" }).click();
  await page.getByRole("option", { name: "Wide", exact: true }).click();
  await expect(page.locator(".reading-column")).toHaveClass(/reading-width-wide/);
  await expect(page.locator(".scripture")).toHaveCSS("line-height", "38px");
  await settings.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.locator(".reading-column")).toHaveClass(/reading-width-wide/);
  await expect(page.locator(".scripture")).toHaveCSS("line-height", "38px");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await settingsButton.click();
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: "Appearance" }),
  ).toContainText("Follow system");
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: "Line spacing" }),
  ).toContainText("Relaxed");
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: "Reading width" }),
  ).toContainText("Wide");
});
