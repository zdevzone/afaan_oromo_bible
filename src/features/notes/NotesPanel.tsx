import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Feather,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Note, Preferences, VerseAnchor } from "../../domain/notes";
import { getNoteSizeProblem } from "../../domain/notes";
import type { Edition } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { en, type UiCatalog } from "../../locales/en";
import { formatUiDate } from "../../locales/catalog";
import type { useNoteWorkspace } from "./useNoteWorkspace";

export const noteTitle = (note: Note, strings: UiCatalog = en) =>
  note.title.trim() ||
  Array.from(note.bodyText.trim().split("\n")[0] ?? "")
    .slice(0, 70)
    .join("") ||
  strings.untitledNote;

function NotePassageForm({
  noteId,
  linked,
  onAttachPassage,
  strings,
}: {
  noteId: string;
  linked: boolean;
  onAttachPassage: (noteId: string, input: string) => Promise<void>;
  strings: UiCatalog;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await onAttachPassage(noteId, input);
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : strings.passageLinkError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="note-passage-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="note-passage-reference">{strings.passageReference}</label>
      <div>
        <Input
          id="note-passage-reference"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setError("");
          }}
          placeholder={strings.passageReferenceExample}
          aria-invalid={!!error}
          aria-describedby={error ? "note-passage-error" : undefined}
        />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? strings.checking : linked ? strings.changeLink : strings.attachPassage}
        </Button>
      </div>
      {error && (
        <p id="note-passage-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function NotesPanel({
  workspace: notes,
  edition,
  onCreate,
  onOpen,
  onDelete,
  onOpenPassage,
  onAttachPassage,
  onCopyDraft,
  strings,
  uiLocale,
}: {
  workspace: ReturnType<typeof useNoteWorkspace>;
  edition: Edition | null;
  onCreate: () => void;
  onOpen: (note: Note) => void;
  onDelete: () => void;
  onOpenPassage: (anchor: VerseAnchor) => void;
  onAttachPassage: (noteId: string, input: string) => Promise<void>;
  onCopyDraft: (text: string) => Promise<void>;
  strings: UiCatalog;
  uiLocale: Preferences["uiLocale"];
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [manualCopy, setManualCopy] = useState<{ text: string; error: string } | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  useEffect(() => {
    if (notes.draft) titleRef.current?.focus();
  }, [notes.draft?.id]);
  const statusText = {
    idle: strings.newNoteStatus,
    unsaved: strings.unsavedChanges,
    saving: strings.saving,
    saved: strings.savedOnDevice,
    error: strings.couldNotSave,
  }[notes.status];
  const noteSizeProblem = notes.draft
    ? getNoteSizeProblem(notes.draft.title, notes.draft.bodyText)
    : null;
  async function copyDraft() {
    if (!notes.draft) return;
    const text = [notes.draft.title, notes.draft.bodyText].filter(Boolean).join("\n\n");
    try {
      await onCopyDraft(text);
      setManualCopy(null);
      setCopyNotice(strings.draftCopied);
    } catch (cause) {
      setCopyNotice("");
      setManualCopy({
        text,
        error: cause instanceof Error ? cause.message : strings.copyFailedNotice,
      });
    }
  }

  return (
    <div className="panel-body notes-panel-body">
      <div className="notes-toolbar">
        <p className="muted small">{strings.notesPrivacy}</p>
        <Button variant="outline" size="sm" disabled={notes.loading} onClick={onCreate}>
          <Plus size={15} aria-hidden="true" />
          {strings.newNote}
        </Button>
      </div>
      {notes.error && (
        <div className="error-box" role="alert">
          {notes.error}
        </div>
      )}
      {notes.draft ? (
        <section className="note-editor" aria-label={strings.noteEditor}>
          {notes.draft.anchor && (
            <div className="note-anchor">
              <BookOpen size={14} aria-hidden="true" />
              <button
                type="button"
                className="anchor-link"
                onClick={() => {
                  if (notes.draft?.anchor) onOpenPassage(notes.draft.anchor);
                }}
                aria-label={strings.openReferenceLabel.replace(
                  "{reference}",
                  notes.draft.anchor.displayReferenceSnapshot,
                )}
              >
                {notes.draft.anchor.displayReferenceSnapshot}
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.removePassageLink}
                onClick={() => notes.edit({ anchor: null })}
              >
                <X size={13} />
              </Button>
            </div>
          )}
          <NotePassageForm
            key={notes.draft.id}
            noteId={notes.draft.id}
            linked={notes.draft.anchor !== null}
            onAttachPassage={onAttachPassage}
            strings={strings}
          />
          <label htmlFor="note-title" className="sr-only">
            {strings.noteTitle}
          </label>
          <Input
            ref={titleRef}
            id="note-title"
            className="note-title-input"
            value={notes.draft.title}
            onChange={(event) => notes.edit({ title: event.target.value })}
            placeholder={strings.untitledNote}
            aria-invalid={noteSizeProblem === "title"}
            aria-describedby={noteSizeProblem === "title" ? "note-size-error" : undefined}
          />
          <label htmlFor="note-body" className="sr-only">
            {strings.noteText}
          </label>
          <Textarea
            id="note-body"
            className="note-body-input"
            value={notes.draft.bodyText}
            onChange={(event) => notes.edit({ bodyText: event.target.value })}
            placeholder={strings.noteBodyPlaceholder}
            rows={10}
            aria-invalid={noteSizeProblem === "body"}
            aria-describedby={noteSizeProblem === "body" ? "note-size-error" : undefined}
          />
          {noteSizeProblem && (
            <p id="note-size-error" role="alert">
              {noteSizeProblem === "title"
                ? strings.noteTitleLimitError
                : strings.noteBodyLimitError}
            </p>
          )}
          <div className="note-save-row">
            <span
              className={`save-status ${notes.status === "error" ? "text-error" : ""}`}
              role="status"
            >
              {notes.status === "saving" ? (
                <LoaderCircle size={13} className="spin" aria-hidden="true" />
              ) : notes.status === "saved" ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : null}
              {statusText}
            </span>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.deleteThisNote}
                onClick={onDelete}
              >
                <Trash2 size={16} />
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void notes.save();
                }}
                disabled={notes.status === "saving"}
              >
                <Check size={14} aria-hidden="true" />
                {strings.save}
              </Button>
              {notes.status === "error" && !!(notes.draft.title || notes.draft.bodyText) && (
                <Button variant="outline" size="sm" onClick={() => void copyDraft()}>
                  <Copy size={14} aria-hidden="true" />
                  {strings.copyDraft}
                </Button>
              )}
            </div>
          </div>
          {copyNotice && <p role="status">{copyNotice}</p>}
          <p className="field-help">{strings.autosaveHelp}</p>
        </section>
      ) : (
        <div className="notes-empty">
          <div className="empty-icon">
            <Feather size={26} aria-hidden="true" />
          </div>
          <h3>{strings.emptyNotes}</h3>
          <p>{strings.emptyNotesDetail}</p>
          <Button variant="outline" onClick={onCreate} disabled={notes.loading}>
            <Plus size={15} aria-hidden="true" />
            {strings.writeNote}
          </Button>
        </div>
      )}
      <Dialog
        open={manualCopy !== null}
        onOpenChange={(open) => {
          if (!open) setManualCopy(null);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog}>
          <DialogTitle>{strings.manualNoteCopyTitle}</DialogTitle>
          <DialogDescription>
            {strings.manualNoteCopyDescription.replace("{error}", manualCopy?.error ?? "")}
          </DialogDescription>
          <Textarea
            className="manual-copy-text"
            aria-label={strings.manualNoteCopyLabel}
            value={manualCopy?.text ?? ""}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button variant="outline" onClick={() => setManualCopy(null)}>
            {strings.close}
          </Button>
        </DialogContent>
      </Dialog>
      {notes.notes.length > 0 && (
        <section className="saved-notes" aria-label={strings.savedNotes}>
          <div className="sidebar-section-label">
            {strings.savedNotesSummary.replace("{count}", String(notes.notes.length))}
          </div>
          <ul>
            {notes.notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`note-list-item ${notes.draft?.id === note.id ? "is-active" : ""}`}
                  onClick={() => onOpen(note)}
                >
                  <strong>{noteTitle(note, strings)}</strong>
                  {note.anchor && (
                    <span className="note-reference">{note.anchor.displayReferenceSnapshot}</span>
                  )}
                  {note.anchor &&
                    (!edition ||
                      note.anchor.editionId !== edition.id ||
                      note.anchor.versificationId !== edition.versificationId) && (
                      <span className="note-unavailable">{strings.noteEditionUnavailable}</span>
                    )}
                  <span>{note.bodyText.slice(0, 100) || strings.noNoteText}</span>
                  <time dateTime={note.updatedAt}>
                    {formatUiDate(note.updatedAt, uiLocale, { month: "short", day: "numeric" })}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
