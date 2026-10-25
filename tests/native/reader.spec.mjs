import assert from "node:assert/strict";

async function clickNavigationItem(label) {
  for (const item of await $$(".nav-item")) {
    if ((await item.getText()).includes(label)) {
      await item.click();
      return;
    }
  }
  throw new Error(`Navigation item not found: ${label}`);
}

async function pressAppShortcut(key) {
  const modifier = process.platform === "darwin" ? "\uE03D" : "\uE009";
  await browser.keys([modifier, key]);
}

describe("native Tauri reader", () => {
  it("persists annotations and preferences with a linked note across native processes", async () => {
    const workspace = await $("main.reader-workspace");
    await workspace.waitForDisplayed({ timeout: 30_000 });
    assert.match(await workspace.getText(), /Chapter 1/);

    if (process.env.AOB_NATIVE_UI_PHASE === "write") {
      await $("#verse-0").click();
      await browser.waitUntil(
        async () => (await $("#verse-0").getAttribute("aria-pressed")) === "true",
        { timeout: 5_000, timeoutMsg: "The native UI did not select the first verse" },
      );
      await $("section.selection-toolbar > button[aria-pressed]").click();
      await browser.waitUntil(
        async () =>
          (await $("section.selection-toolbar > button[aria-pressed]").getAttribute(
            "aria-pressed",
          )) === "true",
        { timeout: 5_000, timeoutMsg: "The native UI did not enable verse range selection" },
      );
      await $("#verse-3").click();
      await browser.waitUntil(
        async () => (await $$('.verse-marker[aria-pressed="true"]')).length === 4,
        { timeout: 5_000, timeoutMsg: "The native UI range did not select all four verses" },
      );
      await $('button[aria-label="Clear verse selection"]').click();
      await browser.waitUntil(
        async () => (await $$('.verse-marker[aria-pressed="true"]')).length === 0,
        { timeout: 5_000, timeoutMsg: "The native UI did not clear the verse range" },
      );
    }

    if (process.env.AOB_NATIVE_UI_PHASE === "reopen") {
      await clickNavigationItem("Bookmarks");
      const bookmark = await $(".bookmark-item");
      await bookmark.waitForDisplayed({ timeout: 15_000 });
      assert.match(await bookmark.getText(), /Sample Book A 1:1/);
      await $(".bookmark-open").click();
      const highlightedVerse = await $('button.verse-marker[data-has-highlight="true"]');
      await highlightedVerse.waitForDisplayed({ timeout: 15_000 });
      assert.match(await highlightedVerse.getAttribute("aria-label"), /Highlighted yellow/);

      await $('button[aria-label="Reading preferences"]').click();
      assert.equal(await $(".settings-content output").getText(), "22 px");
      await $("button=Done").click();

      await clickNavigationItem("My notes");
      await $(".note-list-item").waitForDisplayed({ timeout: 15_000 });
      const savedNotes = await $$(".note-list-item");
      let savedNote;
      for (const item of savedNotes) {
        if ((await item.getText()).includes("Native UI smoke note")) {
          savedNote = item;
          break;
        }
      }
      assert.ok(savedNote, "the note from the previous native process should still be listed");
      await savedNote.click();
      assert.match(await $("#note-title").getValue(), /Native UI smoke note/);
      assert.match(await $("#note-body").getValue(), /Saved from the native window test/);
      assert.match(await $(".note-anchor").getText(), /Sample Book A 1:1/);

      await $('button[aria-label="Remove passage link"]').click();
      await $("button=Save").click();
      await browser.waitUntil(
        async () =>
          (await $('[aria-label="Note editor"] [role="status"]').getText()).includes(
            "Saved on this device",
          ),
        { timeout: 30_000, timeoutMsg: "The native standalone-note save did not complete" },
      );
      assert.equal(await $$(".note-anchor").length, 0);
      return;
    }

    if (process.env.AOB_NATIVE_UI_PHASE === "edit-links") {
      await clickNavigationItem("My notes");
      const savedNotes = await $$(".note-list-item");
      let savedNote;
      for (const item of savedNotes) {
        if ((await item.getText()).includes("Native UI smoke note")) {
          savedNote = item;
          break;
        }
      }
      assert.ok(savedNote, "the detached note should remain saved after restart");
      await savedNote.click();
      assert.equal(await $$(".note-anchor").length, 0);
      await $("#note-passage-reference").setValue("Sample Book A 99:1");
      await $("button=Attach passage").click();
      await browser.waitUntil(
        async () => (await $("[role=alert]").getText()).includes("chapter is not available"),
        {
          timeout: 15_000,
          timeoutMsg: "The native UI did not reject an unavailable chapter",
        },
      );
      assert.equal(await $$(".note-anchor").length, 0);
      await $("#note-passage-reference").setValue("Sample Book A 1:2-3");
      await $("button=Attach passage").click();
      await browser.waitUntil(
        async () => (await $(".note-anchor").getText()).includes("Sample Book A 1:2-3"),
        {
          timeout: 15_000,
          timeoutMsg: "The native note did not attach to the replacement passage",
        },
      );
      await $("button=Save").click();
      await browser.waitUntil(
        async () =>
          (await $('[aria-label="Note editor"] [role="status"]').getText()).includes(
            "Saved on this device",
          ),
        { timeout: 30_000, timeoutMsg: "The native relinked-note save did not complete" },
      );
      return;
    }

    if (process.env.AOB_NATIVE_UI_PHASE === "verify-relinked") {
      await clickNavigationItem("My notes");
      const savedNotes = await $$(".note-list-item");
      let savedNote;
      for (const item of savedNotes) {
        if ((await item.getText()).includes("Native UI smoke note")) {
          savedNote = item;
          break;
        }
      }
      assert.ok(savedNote, "the relinked note should remain saved after restart");
      await savedNote.click();
      assert.match(await $("#note-title").getValue(), /Native UI smoke note/);
      assert.match(await $("#note-body").getValue(), /Saved from the native window test/);
      assert.match(await $(".note-anchor").getText(), /Sample Book A 1:2-3/);
      return;
    }

    assert.equal(process.env.AOB_NATIVE_UI_PHASE, "write");
    await $('button[aria-label="Reading preferences"]').click();
    await $("button=Done").waitForDisplayed({ timeout: 15_000 });
    await browser.execute(() => {
      const done = [...document.querySelectorAll('[role="dialog"] button')].find(
        (button) => button.textContent?.trim() === "Done",
      );
      done?.focus();
    });
    await pressAppShortcut("f");
    assert.equal(await $(".study-panel").isExisting(), false);
    await $("button=Done").click();
    await pressAppShortcut("f");
    await $("#scripture-query").waitForDisplayed({ timeout: 15_000 });

    await $("#scripture-query").setValue('"careful reading"');
    await $('.search-form button[type="submit"]').click();

    const result = await $(".search-result");
    await result.waitForDisplayed({ timeout: 15_000 });
    assert.match(await result.getText(), /Sample Book A 1:1/);
    await result.click();

    await $("button=Bookmark").click();
    await $('[aria-label="Highlight yellow"]').click();
    await $('button[aria-label="Reading preferences"]').click();
    await $('button[aria-label="Increase text size"]').click();
    assert.equal(await $(".settings-content output").getText(), "22 px");
    await $("button=Done").click();

    await $("button=Add note").click();
    await $("#note-title").setValue("😀".repeat(257));
    assert.equal(await $("#note-title").getAttribute("aria-invalid"), "true");
    assert.match(await $("#note-size-error").getText(), /256 Unicode code points/);
    await $("#note-title").setValue("Native UI smoke note");
    await $("#note-body").setValue("Saved from the native window test.");
    await $("button=Save").click();

    await browser.waitUntil(
      async () => {
        const status = await $('[aria-label="Note editor"] [role="status"]');
        return (await status.getText()).includes("Saved on this device");
      },
      { timeout: 30_000, timeoutMsg: "The native note save did not complete" },
    );
  });
});
