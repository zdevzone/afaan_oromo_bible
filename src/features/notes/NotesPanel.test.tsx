import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Note } from "../../domain/notes";
import { en } from "../../locales/en";
import { NotesPanel } from "./NotesPanel";
import type { useNoteWorkspace } from "./useNoteWorkspace";

afterEach(cleanup);

describe("note editor size feedback", () => {
  it.each([
    {
      title: "😀".repeat(257),
      bodyText: "Within the body limit",
      field: "Note title",
      message: "Note titles can contain at most 256 Unicode code points.",
    },
    {
      title: "Within the title limit",
      bodyText: "é".repeat(524_289),
      field: "Note text",
      message: "Note text can contain at most 1 MiB of UTF-8 data.",
    },
  ])(
    "announces an invalid $field without truncating the draft",
    ({ title, bodyText, field, message }) => {
      const now = new Date().toISOString();
      const draft: Note = {
        id: crypto.randomUUID(),
        title,
        bodyText,
        anchor: null,
        createdAt: now,
        updatedAt: now,
        revision: 0,
      };
      const workspace = {
        notes: [],
        draft,
        status: "error" as const,
        error: "The note exceeds the supported size. Your draft was not saved.",
        loading: false,
        edit: vi.fn(),
        save: vi.fn(),
      } as unknown as ReturnType<typeof useNoteWorkspace>;

      render(
        <NotesPanel
          workspace={workspace}
          edition={null}
          onCreate={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onOpenPassage={vi.fn()}
          onAttachPassage={vi.fn()}
          onCopyDraft={vi.fn()}
          strings={en}
          uiLocale="en"
        />,
      );

      const input = screen.getByRole("textbox", { name: field });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("note-size-error");
      const alert = screen.getByText(message, { exact: true });
      expect(alert.getAttribute("role")).toBe("alert");
      expect((input as HTMLInputElement | HTMLTextAreaElement).value).toBe(
        field === "Note title" ? title : bodyText,
      );
    },
  );

  it("keeps a failed-clipboard copy selectable with its error reason", async () => {
    const now = new Date().toISOString();
    const draft: Note = {
      id: crypto.randomUUID(),
      title: "Private title",
      bodyText: "Recoverable body text",
      anchor: null,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    const workspace = {
      notes: [],
      draft,
      status: "error" as const,
      error: "Storage is unavailable.",
      loading: false,
      edit: vi.fn(),
      save: vi.fn(),
    } as unknown as ReturnType<typeof useNoteWorkspace>;
    const onCopyDraft = vi.fn(async () => {
      throw new Error("Clipboard permission denied.");
    });

    render(
      <NotesPanel
        workspace={workspace}
        edition={null}
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onOpenPassage={vi.fn()}
        onAttachPassage={vi.fn()}
        onCopyDraft={onCopyDraft}
        strings={en}
        uiLocale="en"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));

    const dialog = await screen.findByRole("dialog", { name: "Copy note draft manually" });
    expect(onCopyDraft).toHaveBeenCalledWith("Private title\n\nRecoverable body text");
    expect(screen.getByText(/Clipboard permission denied/u)).toBeTruthy();
    expect((dialog.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Private title\n\nRecoverable body text",
    );
  });
});
