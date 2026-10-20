import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppServices } from '../../domain/ports'
import type { Note, VerseAnchor } from '../../domain/notes'

const fingerprint = (note: Note) => JSON.stringify([note.title, note.bodyText, note.anchor])
const message = (error: unknown) => error instanceof Error ? error.message : 'Your note could not be saved. Keep your draft and try again.'

/** The editor buffer and committed records stay separate until persistence acknowledges a save. */
export function useNoteWorkspace(services: AppServices) {
  const [notes, setNotes] = useState<Note[]>([])
  const [draft, setDraftState] = useState<Note | null>(null)
  const [status, setStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const draftRef = useRef<Note | null>(null)
  const committed = useRef(new Map<string, Note>())
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const deleting = useRef(false)
  const generations = useRef(new Map<string, number>())

  const updateDraft = useCallback((note: Note | null) => {
    draftRef.current = note
    setDraftState(note)
  }, [])

  useEffect(() => {
    let active = true
    services.userStore.listNotes().then(records => {
      if (!active) return
      committed.current = new Map(records.map(note => [note.id, note]))
      setNotes(records)
      setLoading(false)
    }).catch(cause => {
      if (!active) return
      setError(message(cause))
      setLoading(false)
    })
    return () => { active = false }
  }, [services])

  const save = useCallback((): Promise<boolean> => {
    const requested = draftRef.current
    if (!requested) return Promise.resolve(true)
    if (deleting.current) return Promise.resolve(false)
    const generation = generations.current.get(requested.id) ?? 0
    const operation = queue.current.then(async () => {
      // Discard/delete invalidates snapshots which have not reached the store yet.
      if ((generations.current.get(requested.id) ?? 0) !== generation) return true
      // Coalesce queued edits into the latest buffer rather than committing stale text.
      const snapshot = draftRef.current?.id === requested.id ? draftRef.current : requested
      const saved = committed.current.get(snapshot.id)
      if (saved && fingerprint(saved) === fingerprint(snapshot)) return true
      if (!saved && !snapshot.title.trim() && !snapshot.bodyText.trim()) return true
      setStatus('saving')
      try {
        const result = await services.userStore.saveNote({ ...snapshot, revision: saved?.revision ?? 0, updatedAt: new Date().toISOString() })
        committed.current.set(result.id, result)
        setNotes(records => [result, ...records.filter(note => note.id !== result.id)].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id)))
        if (draftRef.current?.id === result.id) {
          const current = draftRef.current
          updateDraft({ ...current, revision: result.revision, updatedAt: result.updatedAt })
          setStatus(fingerprint(current) === fingerprint(result) ? 'saved' : 'unsaved')
        }
        setError('')
        return true
      } catch (cause) {
        setError(message(cause))
        setStatus('error')
        return false
      }
    })
    queue.current = operation
    return operation
  }, [services, updateDraft])

  const flush = useCallback(async () => {
    const noteId = draftRef.current?.id
    // Continue until the latest buffer is durable, including edits made during a save.
    while (noteId && draftRef.current?.id === noteId) {
      if (deleting.current) return false
      if (!await save()) return false
      // Autosave may have added work while the explicit save was in flight.
      let tail: Promise<boolean>
      do {
        tail = queue.current
        if (!await tail) return false
      } while (tail !== queue.current)
      if (draftRef.current?.id !== noteId) return true
      const latest = draftRef.current
      const saved = committed.current.get(noteId)
      if (saved && fingerprint(latest) === fingerprint(saved)) return true
      if (!saved && !latest.title.trim() && !latest.bodyText.trim()) return true
    }
    return true
  }, [save])

  useEffect(() => {
    if (!draft || deleting.current) return
    const saved = committed.current.get(draft.id)
    if (saved && fingerprint(saved) === fingerprint(draft)) return
    if (!saved && !draft.title.trim() && !draft.bodyText.trim()) return
    const timer = setTimeout(() => { void save() }, 300)
    return () => clearTimeout(timer)
  }, [draft, save])

  const edit = (patch: Partial<Pick<Note, 'title' | 'bodyText' | 'anchor'>>) => {
    if (!draftRef.current) return
    updateDraft({ ...draftRef.current, ...patch })
    setStatus('unsaved')
  }

  const open = (note: Note) => {
    updateDraft(committed.current.get(note.id) ?? note)
    setStatus('saved')
    setError('')
  }

  const create = (anchor: VerseAnchor | null = null) => {
    const now = new Date().toISOString()
    updateDraft({ id: crypto.randomUUID(), title: '', bodyText: '', anchor, createdAt: now, updatedAt: now, revision: 0 })
    setStatus('idle')
    setError('')
  }

  const discard = async () => {
    const current = draftRef.current
    deleting.current = true
    if (current) generations.current.set(current.id, (generations.current.get(current.id) ?? 0) + 1)
    await queue.current
    updateDraft(current ? committed.current.get(current.id) ?? null : null)
    setStatus(current && committed.current.has(current.id) ? 'saved' : 'idle')
    setError('')
    deleting.current = false
  }

  const remove = async () => {
    const current = draftRef.current
    if (!current) return true
    deleting.current = true
    generations.current.set(current.id, (generations.current.get(current.id) ?? 0) + 1)
    await queue.current
    try {
      if (committed.current.has(current.id)) await services.userStore.deleteNote(current.id)
      committed.current.delete(current.id)
      setNotes(records => records.filter(note => note.id !== current.id))
      updateDraft(null)
      setStatus('idle')
      setError('')
      return true
    } catch (cause) {
      setError(message(cause))
      setStatus('error')
      return false
    } finally {
      deleting.current = false
    }
  }

  const currentSaved = draft && committed.current.get(draft.id)
  const dirty = !!draft && (currentSaved ? fingerprint(draft) !== fingerprint(currentSaved) : !!(draft.title || draft.bodyText))

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return { notes, draft, status, error, loading, dirty, edit, open, create, save: flush, discard, remove }
}
