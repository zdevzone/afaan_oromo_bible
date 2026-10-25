import { useState } from "react";
import { Bookmark as BookmarkIcon, Pencil, Trash2 } from "lucide-react";
import type { Bookmark } from "../../domain/notes";
import type { Edition } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { UiCatalog } from "../../locales/en";

export function BookmarksPanel({
  bookmarks,
  edition,
  busy,
  error,
  onOpen,
  onSaveLabel,
  onDelete,
  strings,
}: {
  bookmarks: Bookmark[];
  edition: Edition | null;
  busy: boolean;
  error: string;
  onOpen: (bookmark: Bookmark) => void;
  onSaveLabel: (bookmark: Bookmark, label: string) => Promise<boolean>;
  onDelete: (bookmark: Bookmark) => void;
  strings: UiCatalog;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  return (
    <div className="panel-body notes-panel-body">
      <p className="muted small">{strings.bookmarkInstruction}</p>
      {error && (
        <div className="error-box" role="alert" aria-label={error}>
          {error}
        </div>
      )}
      {bookmarks.length === 0 ? (
        <div className="notes-empty">
          <div className="empty-icon">
            <BookmarkIcon size={26} aria-hidden="true" />
          </div>
          <h3>{strings.noBookmarks}</h3>
          <p>{strings.noBookmarksDetail}</p>
        </div>
      ) : (
        <section className="saved-notes" aria-label={strings.savedBookmarks}>
          <div className="sidebar-section-label">
            {strings.savedBookmarksSummary.replace("{count}", String(bookmarks.length))}
          </div>
          <ul>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="bookmark-item">
                <Button
                  variant="ghost"
                  className="bookmark-open"
                  disabled={busy}
                  onClick={() => onOpen(bookmark)}
                >
                  <span>{bookmark.label || bookmark.anchor.displayReferenceSnapshot}</span>
                  {bookmark.label && <small>{bookmark.anchor.displayReferenceSnapshot}</small>}
                  {(!edition ||
                    bookmark.anchor.editionId !== edition.id ||
                    bookmark.anchor.versificationId !== edition.versificationId) && (
                    <small>{strings.bookmarkEditionUnavailable}</small>
                  )}
                </Button>
                {editing === bookmark.id ? (
                  <form
                    className="bookmark-edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onSaveLabel(bookmark, label).then((saved) => {
                        if (saved) setEditing(null);
                      });
                    }}
                  >
                    <label htmlFor={`bookmark-label-${bookmark.id}`}>{strings.bookmarkLabel}</label>
                    <Input
                      id={`bookmark-label-${bookmark.id}`}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                    <div className="dialog-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        {strings.cancel}
                      </Button>
                      <Button type="submit" disabled={busy}>
                        {strings.saveLabel}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="bookmark-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setLabel(bookmark.label);
                        setEditing(bookmark.id);
                      }}
                    >
                      <Pencil size={14} aria-hidden="true" /> {strings.editLabel}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onDelete(bookmark)}
                    >
                      <Trash2 size={14} aria-hidden="true" /> {strings.remove}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
