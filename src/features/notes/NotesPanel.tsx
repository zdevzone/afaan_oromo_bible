import { useEffect, useRef } from 'react'
import { BookOpen, Check, CheckCircle2, Feather, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import type { Note, VerseAnchor } from '../../domain/notes'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { en } from '../../locales/en'
import type { useNoteWorkspace } from './useNoteWorkspace'

export const noteTitle = (note: Note) => note.title.trim() || note.bodyText.trim().split('\n')[0]?.slice(0, 70) || 'Untitled note'

export function NotesPanel({ workspace: notes, onCreate, onOpen, onDelete, onOpenPassage }: {
  workspace: ReturnType<typeof useNoteWorkspace>
  onCreate(): void
  onOpen(note: Note): void
  onDelete(): void
  onOpenPassage(anchor: VerseAnchor): void
}) {
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (notes.draft) titleRef.current?.focus() }, [notes.draft?.id])
  const statusText = { idle: 'New note', unsaved: 'Unsaved changes', saving: 'Saving…', saved: 'Saved on this device', error: 'Could not save' }[notes.status]

  return <div className="panel-body notes-panel-body">
    <div className="notes-toolbar"><p className="muted small">Private. Local. Yours.</p><Button variant="outline" size="sm" disabled={notes.loading} onClick={onCreate}><Plus size={15} aria-hidden="true" />New note</Button></div>
    {notes.error && <div className="error-box" role="alert">{notes.error}</div>}
    {notes.draft ? <section className="note-editor" aria-label="Note editor">
      {notes.draft.anchor && <div className="note-anchor"><BookOpen size={14} aria-hidden="true" /><button type="button" className="anchor-link" onClick={() => { if (notes.draft?.anchor) onOpenPassage(notes.draft.anchor) }} aria-label={`Open ${notes.draft.anchor.displayReferenceSnapshot}`}>{notes.draft.anchor.displayReferenceSnapshot}</button><Button variant="ghost" size="icon" aria-label="Remove passage link" onClick={() => notes.edit({ anchor: null })}><X size={13} /></Button></div>}
      <label htmlFor="note-title" className="sr-only">Note title</label><Input ref={titleRef} id="note-title" className="note-title-input" value={notes.draft.title} onChange={event => notes.edit({ title: event.target.value })} placeholder="Untitled note" />
      <label htmlFor="note-body" className="sr-only">Note text</label><Textarea id="note-body" className="note-body-input" value={notes.draft.bodyText} onChange={event => notes.edit({ bodyText: event.target.value })} placeholder="Write a thought to return to…" rows={10} />
      <div className="note-save-row"><span className={`save-status ${notes.status === 'error' ? 'text-error' : ''}`} role="status">{notes.status === 'saving' ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : notes.status === 'saved' ? <CheckCircle2 size={13} aria-hidden="true" /> : null}{statusText}</span><div><Button variant="ghost" size="icon" aria-label="Delete this note" onClick={onDelete}><Trash2 size={16} /></Button><Button size="sm" onClick={() => { void notes.save() }} disabled={notes.status === 'saving'}><Check size={14} aria-hidden="true" />Save</Button></div></div>
      <p className="field-help">Autosaves after you pause. “Saved” means stored on this device.</p>
    </section> : <div className="notes-empty"><div className="empty-icon"><Feather size={26} aria-hidden="true" /></div><h3>{en.emptyNotes}</h3><p>{en.emptyNotesDetail}</p><Button variant="outline" onClick={onCreate} disabled={notes.loading}><Plus size={15} aria-hidden="true" />Write a note</Button></div>}
    {notes.notes.length > 0 && <section className="saved-notes" aria-label="Saved notes"><div className="sidebar-section-label">SAVED NOTES · {notes.notes.length}</div><ul>{notes.notes.map(note => <li key={note.id}><button type="button" className={`note-list-item ${notes.draft?.id === note.id ? 'is-active' : ''}`} onClick={() => onOpen(note)}><strong>{noteTitle(note)}</strong>{note.anchor && <span className="note-reference">{note.anchor.displayReferenceSnapshot}</span>}<span>{note.bodyText.slice(0, 100) || 'No note text'}</span><time dateTime={note.updatedAt}>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt))}</time></button></li>)}</ul></section>}
  </div>
}
