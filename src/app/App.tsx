import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Copy, Feather, FileText, Leaf, List, LoaderCircle, Minus, Plus, Search, Settings2, ShieldCheck, X } from 'lucide-react'
import type { AppServices } from '../domain/ports'
import type { BookSummary, ChapterContent, ChapterKey, Edition, SearchResults } from '../domain/scripture'
import { createVerseAnchor, DEFAULT_PREFERENCES, type Preferences } from '../domain/notes'
import { parseSearchQuery } from '../services/search'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { SelectField } from '../components/ui/select'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { ReaderContent } from '../features/reader/ReaderContent'
import { useNoteWorkspace } from '../features/notes/useNoteWorkspace'
import { NotesPanel, noteTitle } from '../features/notes/NotesPanel'
import { SearchPanel } from '../features/reader/SearchPanel'
import { en } from '../locales/en'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something could not be completed. Please try again.'

export function App({ services }: { services: AppServices }) {
  const notes = useNoteWorkspace(services)
  const [edition, setEdition] = useState<Edition | null>(null)
  const [books, setBooks] = useState<BookSummary[]>([])
  const [chapter, setChapter] = useState<ChapterContent | null>(null)
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES })
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState('')
  const [bootAttempt, setBootAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [panel, setPanel] = useState<'search' | 'notes' | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [extendSelection, setExtendSelection] = useState(false)
  const [referenceInput, setReferenceInput] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [query, setQuery] = useState('')
  const [searchBook, setSearchBook] = useState('all')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [guardBusy, setGuardBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const requestId = useRef(0)
  const navigationIntent = useRef(0)
  const searchId = useRef(0)
  const positionQueue = useRef(Promise.resolve())
  const preferenceQueue = useRef(Promise.resolve())
  const referenceRef = useRef<HTMLInputElement>(null)
  const passageRef = useRef<HTMLElement>(null)
  const activeBook = books.find(book => book.code === chapter?.bookCode)
  const selectedUnits = chapter?.verseUnits.filter(unit => selectedKeys.includes(unit.key)) ?? []
  const selectedReference = chapter && activeBook && selectedUnits.length
    ? `${activeBook.name} ${chapter.chapterLabel}:${selectedUnits[0]!.label}${selectedUnits.length > 1 ? `–${selectedUnits[selectedUnits.length - 1]!.label}` : ''}` : ''

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setBootError('')
      try {
        const editions = await services.library.listEditions()
        const first = editions[0]
        if (!first) throw new Error('No content is installed. Add an approved content pack before reading.')
        const [bookList, preferenceResult, positionResult] = await Promise.all([
          services.library.listBooks(first.id),
          services.userStore.getPreferences().then(value => ({ value, error: '' }), cause => ({ value: { ...DEFAULT_PREFERENCES }, error: errorMessage(cause) })),
          services.userStore.getReadingPosition().then(value => ({ value, error: '' }), cause => ({ value: null, error: errorMessage(cause) })),
        ])
        const storedPosition = positionResult.value
        const firstBook = bookList[0]
        if (!firstBook?.chapters[0]) throw new Error('The content pack has no readable chapters.')
        const storedBook = storedPosition?.editionId === first.id ? bookList.find(book => book.code === storedPosition.bookCode && book.chapters.includes(storedPosition.chapterLabel)) : null
        const key = storedBook && storedPosition
          ? { editionId: first.id, bookCode: storedBook.code, chapterLabel: storedPosition.chapterLabel }
          : { editionId: first.id, bookCode: firstBook.code, chapterLabel: firstBook.chapters[0] }
        const content = await services.library.getChapter(key)
        if (!active) return
        setEdition(first)
        setBooks(bookList)
        setPreferences(preferenceResult.value)
        setNotice([preferenceResult.error ? `Reading preferences could not be loaded: ${preferenceResult.error}` : '', positionResult.error ? `Your reading position could not be loaded: ${positionResult.error}` : storedPosition && !storedBook ? 'Your previous reading position is unavailable in this content. The first chapter is open; your stored records have been preserved.' : ''].filter(Boolean).join(' '))
        setChapter(content)
        setLoading(false)
        if (storedBook && storedPosition?.verseLabel) {
          const unit = content.verseUnits.find(item => item.label === storedPosition.verseLabel)
          if (unit) requestAnimationFrame(() => document.getElementById(`verse-${unit.order}`)?.scrollIntoView({ block: 'center' }))
        }
      } catch (cause) {
        if (active) { setBootError(errorMessage(cause)); setLoading(false) }
      }
    }
    void load()
    return () => { active = false }
  }, [services, bootAttempt])

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', preferences.theme === 'dark' || (preferences.theme === 'system' && media.matches))
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preferences.theme])

  useEffect(() => { document.title = chapter && activeBook ? `${activeBook.name} ${chapter.chapterLabel} · ${en.appName}` : en.appName }, [chapter, activeBook])

  useEffect(() => {
    const viewport = passageRef.current
    if (!viewport || !chapter) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const remember = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const viewportTop = viewport.getBoundingClientRect().top
        const visible = chapter.verseUnits.find(unit => {
          const marker = document.getElementById(`verse-${unit.order}`)
          return marker && marker.getBoundingClientRect().bottom >= viewportTop
        })
        if (!visible) return
        positionQueue.current = positionQueue.current.catch(() => {}).then(() => services.userStore.saveReadingPosition({ editionId: chapter.editionId, bookCode: chapter.bookCode, chapterLabel: chapter.chapterLabel, verseLabel: visible.label, updatedAt: new Date().toISOString() }))
        void positionQueue.current.catch(cause => setNotice(`Reading position could not be saved: ${errorMessage(cause)}`))
      }, 250)
    }
    viewport.addEventListener('scroll', remember, { passive: true })
    return () => { clearTimeout(timer); viewport.removeEventListener('scroll', remember) }
  }, [chapter, services])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); referenceRef.current?.focus() }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); setPanel('search') }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  async function safely(action: () => void) {
    if (await notes.save()) action()
    else setPendingAction(() => action)
  }

  async function navigate(key: ChapterKey, unitKeys: string[], intent: number) {
    const currentRequest = ++requestId.current
    setLoading(true)
    setReferenceError('')
    try {
      const next = await services.library.getChapter(key)
      if (currentRequest !== requestId.current || intent !== navigationIntent.current) return
      setChapter(next)
      setSelectedKeys(unitKeys)
      setExtendSelection(false)
      setNavigationOpen(false)
      const book = books.find(candidate => candidate.code === key.bookCode)
      setAnnouncement(`Opened ${book?.name ?? key.bookCode} ${key.chapterLabel}.`)
      const unit = next.verseUnits.find(candidate => unitKeys.includes(candidate.key))
      positionQueue.current = positionQueue.current.catch(() => {}).then(() => services.userStore.saveReadingPosition({ ...key, verseLabel: unit?.label ?? next.verseUnits[0]?.label ?? null, updatedAt: new Date().toISOString() }))
      void positionQueue.current.catch(cause => setNotice(`Reading position could not be saved: ${errorMessage(cause)}`))
      requestAnimationFrame(() => {
        if (currentRequest !== requestId.current || intent !== navigationIntent.current) return
        if (unit) {
          const marker = document.getElementById(`verse-${unit.order}`)
          marker?.focus({ preventScroll: true })
          marker?.scrollIntoView({ block: 'center' })
        } else {
          passageRef.current?.focus({ preventScroll: true })
          passageRef.current?.scrollTo({ top: 0 })
        }
      })
    } catch (cause) {
      if (currentRequest === requestId.current && intent === navigationIntent.current) setNotice(errorMessage(cause))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  function goToChapter(key: ChapterKey, unitKeys: string[] = [], closeNarrowPanel = false) {
    const intent = ++navigationIntent.current
    void safely(() => {
      if (intent !== navigationIntent.current) return
      void navigate(key, unitKeys, intent)
      if (closeNarrowPanel && window.matchMedia('(max-width: 1099px)').matches) setPanel(null)
    })
  }

  async function openReference(event: FormEvent) {
    event.preventDefault()
    await goToReference(referenceInput, true)
  }

  async function goToReference(input: string, fieldError = false) {
    if (!edition) return
    const intent = ++navigationIntent.current
    try {
      const target = await services.library.resolveReference(input, edition.id)
      if (intent !== navigationIntent.current) return
      await safely(() => { if (intent === navigationIntent.current) void navigate(target.chapter, target.unitKeys, intent) })
      setReferenceError('')
    } catch (cause) {
      if (intent !== navigationIntent.current) return
      if (fieldError) setReferenceError(errorMessage(cause))
      else setNotice(errorMessage(cause))
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault()
    if (!edition) return
    const currentRequest = ++searchId.current
    setSearchError('')
    setSearching(true)
    try {
      const next = await services.library.search({ editionId: edition.id, query: parseSearchQuery(query), ...(searchBook !== 'all' ? { bookCode: searchBook } : {}), limit: 50, offset: 0 })
      if (currentRequest !== searchId.current) return
      setResults(next)
      setAnnouncement(`${next.total} search ${next.total === 1 ? 'result' : 'results'}.`)
    } catch (cause) {
      if (currentRequest === searchId.current) { setResults(null); setSearchError(errorMessage(cause)) }
    } finally { if (currentRequest === searchId.current) setSearching(false) }
  }

  function selectUnit(key: string, extend: boolean) {
    if (!chapter) return
    if ((extend || extendSelection) && selectedKeys.length) {
      const first = chapter.verseUnits.findIndex(unit => unit.key === selectedKeys[0])
      const last = chapter.verseUnits.findIndex(unit => unit.key === key)
      setSelectedKeys(chapter.verseUnits.slice(Math.min(first, last), Math.max(first, last) + 1).map(unit => unit.key))
    } else setSelectedKeys(selectedKeys.length === 1 && selectedKeys[0] === key ? [] : [key])
    setExtendSelection(false)
  }

  function adjacentChapter(direction: -1 | 1) {
    if (!chapter) return null
    const chapters = books.flatMap(book => book.chapters.map(chapterLabel => ({ editionId: book.editionId, bookCode: book.code, chapterLabel })))
    const index = chapters.findIndex(candidate => candidate.bookCode === chapter.bookCode && candidate.chapterLabel === chapter.chapterLabel)
    return chapters[index + direction] ?? null
  }

  async function copySelection() {
    if (!edition || !selectedUnits.length) return
    const text = `${selectedUnits.map(unit => `${unit.label} ${unit.textPlain}`).join('\n')}\n\n${selectedReference} · ${edition.abbreviation}\n${edition.attribution}`
    try { await services.platform.copyText(text); setAnnouncement('Selected verses copied.'); setNotice('Selected verses copied with their reference and edition attribution.') }
    catch (cause) { setNotice(`Copy failed. You can select and copy the passage text manually. ${errorMessage(cause)}`) }
  }

  function changePreferences(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    preferenceQueue.current = preferenceQueue.current.catch(() => {}).then(() => services.userStore.savePreferences(next))
    void preferenceQueue.current.catch(cause => setNotice(`Preferences apply for this session but could not be saved: ${errorMessage(cause)}`))
  }

  function newNote(linked: boolean) {
    if (!edition || !chapter || !activeBook) return
    void safely(() => {
      try {
        notes.create(linked ? createVerseAnchor(edition, chapter, selectedKeys, activeBook.name) : null)
        setPanel('notes')
      } catch (cause) { setNotice(errorMessage(cause)) }
    })
  }

  function renderLibrary() {
    return <>
      <div className="sidebar-section-label">LIBRARY</div>
      <nav className="main-navigation" aria-label="Workspace">
        <Button variant="ghost" className={panel === null ? 'nav-item active' : 'nav-item'} onClick={() => { void safely(() => { setPanel(null); setNavigationOpen(false) }) }}><BookOpen size={18} aria-hidden="true" />Read Bible</Button>
        <Button variant="ghost" className={panel === 'search' ? 'nav-item active' : 'nav-item'} onClick={() => { void safely(() => { setPanel('search'); setNavigationOpen(false) }) }}><Search size={18} aria-hidden="true" />Search Scripture</Button>
        <Button variant="ghost" className={panel === 'notes' ? 'nav-item active' : 'nav-item'} onClick={() => { setPanel('notes'); setNavigationOpen(false) }}><FileText size={18} aria-hidden="true" />My notes<span className="nav-count">{notes.notes.length}</span></Button>
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label">BOOKS & CHAPTERS</div>
      <nav className="book-navigation" aria-label="Book and chapter">
        {books.map(book => <div key={book.code} className="book-group">
          <Button variant="ghost" className={`book-name ${chapter?.bookCode === book.code ? 'current-book' : ''}`} onClick={() => { const label = book.chapters[0]; if (label) goToChapter({ editionId: book.editionId, bookCode: book.code, chapterLabel: label }) }}><BookOpen size={15} aria-hidden="true" />{book.name}</Button>
          {chapter?.bookCode === book.code && <div className="chapter-grid">{book.chapters.map(chapterLabel => <Button variant="ghost" className={chapter.chapterLabel === chapterLabel ? 'chapter-button selected' : 'chapter-button'} key={chapterLabel} aria-label={`${book.name}, chapter ${chapterLabel}`} aria-current={chapter.chapterLabel === chapterLabel ? 'page' : undefined} onClick={() => { goToChapter({ editionId: book.editionId, bookCode: book.code, chapterLabel }) }}>{chapterLabel}</Button>)}</div>}
        </div>)}
      </nav>
      <div className="sidebar-bottom"><div className="edition-mark"><Leaf size={18} aria-hidden="true" /><span>{edition?.abbreviation ?? 'Local library'}</span></div><p>{edition?.title ?? 'Loading your library…'}</p><div className="offline-label"><span className="status-dot" />Available offline</div></div>
    </>
  }

  const previous = adjacentChapter(-1)
  const next = adjacentChapter(1)

  return <div className="app-shell">
    <a href="#passage" className="skip-link">Skip to reading</a>
    <aside className="sidebar desktop-sidebar" aria-label="Library sidebar"><div className="brand"><div className="brand-icon"><BookOpen size={23} aria-hidden="true" /></div><div><strong>Afaan Oromo</strong><span>BIBLE READER</span></div></div>{renderLibrary()}</aside>
    <div className="main-shell">
      <header className="topbar">
        <Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setNavigationOpen(true)} aria-label="Open library navigation"><List size={21} /></Button>
        <form className="reference-form" onSubmit={event => { void openReference(event) }}>
          <BookOpen size={17} aria-hidden="true" /><Input ref={referenceRef} aria-label="Open a Scripture reference" aria-invalid={!!referenceError} aria-describedby={referenceError ? 'reference-error' : undefined} placeholder={books[0] ? `Go to a passage · ${books[0].code} ${books[0].chapters[0]}:1` : 'Go to a passage'} value={referenceInput} onChange={event => setReferenceInput(event.target.value)} /><Button variant="ghost" size="sm" type="submit">Go<ArrowRight size={14} aria-hidden="true" /></Button>
        </form>
        <div className="toolbar-actions"><span className="local-badge"><ShieldCheck size={14} aria-hidden="true" />Offline & private</span><Button variant="ghost" size="icon" aria-label="Reading preferences" data-dialog-focus-fallback onClick={() => setSettingsOpen(true)}><Settings2 size={19} /></Button></div>
      </header>
      {referenceError && <div role="alert" className="inline-alert" id="reference-error">{referenceError}</div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><Button variant="ghost" size="icon" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></Button></div>}
      <div className={`content-grid ${panel ? 'has-panel' : ''}`}>
        <main ref={passageRef} id="passage" tabIndex={-1} className="reader-workspace" aria-busy={loading}>
          {bootError ? <div className="empty-state"><BookOpen size={36} aria-hidden="true" /><h1>Content unavailable</h1><p role="alert">{bootError}</p><p className="muted">Your personal records have not been reset.</p><Button variant="outline" onClick={() => setBootAttempt(value => value + 1)}>Try opening content again</Button></div> : !chapter || !edition ? <div className="empty-state"><LoaderCircle className="spin" size={26} aria-hidden="true" /><p>Opening your reading space…</p></div> : <>
            <div className="reader-context"><span><BookOpen size={15} aria-hidden="true" />{edition.abbreviation}<span className="context-divider">/</span>{activeBook?.name}</span><span className="small muted">{chapter.verseUnits.length} source verse units</span></div>
            <article className={`reading-column reading-width-${preferences.width}`} style={{ '--reader-font-size': `${preferences.fontSizePx}px`, '--reader-line-height': preferences.lineHeight } as CSSProperties}>
              <div className="chapter-heading"><div className="eyebrow">{activeBook?.name}</div><h1>Chapter {chapter.chapterLabel}</h1><div className="heading-rule" /></div>
              {edition.isSynthetic && <aside className="fixture-banner"><span className="fixture-tag">DEVELOPMENT PREVIEW</span><strong>{en.fixtureNotice}</strong><p>{en.fixtureDetail}</p></aside>}
              <ReaderContent chapter={chapter} selectedKeys={selectedKeys} onSelect={selectUnit} languageTag={edition.languageTag} bookName={activeBook?.name ?? chapter.bookCode} onNavigate={target => { void goToReference(`${target.bookCode} ${target.chapterLabel}:${target.verseLabel}`) }} />
              <div className="chapter-end"><span /><Leaf size={17} aria-hidden="true" /><span /></div>
              <nav aria-label="Adjacent chapter" className="chapter-pagination"><Button variant="outline" disabled={!previous || loading} onClick={() => { if (previous) goToChapter(previous) }}><ChevronLeft size={16} aria-hidden="true" />Previous chapter</Button><span className="muted small">{activeBook?.name} {chapter.chapterLabel}</span><Button variant="outline" disabled={!next || loading} onClick={() => { if (next) goToChapter(next) }}>Next chapter<ChevronRight size={16} aria-hidden="true" /></Button></nav>
              <p className="attribution">{edition.attribution}</p>
            </article>
          </>}
        </main>
        {panel && <aside className="study-panel" aria-label={panel === 'notes' ? 'Personal notes' : 'Scripture search'}>
          <div className="panel-heading"><div><div className="eyebrow">YOUR READING SPACE</div><h2>{panel === 'notes' ? 'My notes' : 'Search Scripture'}</h2></div><Button variant="ghost" size="icon" aria-label="Close study panel" onClick={() => { void safely(() => setPanel(null)) }}><X size={19} /></Button></div>
          <Button className="mobile-back" variant="ghost" onClick={() => { void safely(() => setPanel(null)) }}><ArrowLeft size={15} aria-hidden="true" />Back to reading</Button>
          {panel === 'search'
            ? <SearchPanel editionLabel={edition?.abbreviation ?? 'your edition'} books={books} query={query} setQuery={setQuery} book={searchBook} setBook={setSearchBook} searching={searching} error={searchError} results={results} onSubmit={event => { void runSearch(event) }} onOpen={result => { goToChapter({ editionId: result.editionId, bookCode: result.bookCode, chapterLabel: result.chapterLabel }, [result.unitKey], true) }} />
            : <NotesPanel workspace={notes} onCreate={() => newNote(false)} onOpen={note => { void safely(() => notes.open(note)) }} onDelete={() => setDeleteOpen(true)} onOpenPassage={anchor => { if (anchor.editionId !== edition?.id) { setNotice('The edition linked to this note is not installed. The note has been preserved.'); return }; if (anchor.contentRevision !== edition.contentRevision || anchor.versificationId !== edition.versificationId) { setNotice('This note refers to a different content revision. Its original link is preserved; verify the passage before relinking.'); return }; goToChapter({ editionId: anchor.editionId, bookCode: anchor.start.bookCode, chapterLabel: anchor.start.chapterLabel }, anchor.unitKeys, true) }} />}
        </aside>}
      </div>
      {selectedUnits.length > 0 && <div className="selection-toolbar" aria-label="Selected verse actions"><div><strong>{selectedReference}</strong><span>{selectedUnits.length} {selectedUnits.length === 1 ? 'verse unit' : 'verse units'} selected</span></div><Button variant="ghost" aria-pressed={extendSelection} onClick={() => setExtendSelection(value => !value)}>{extendSelection ? 'Choose range end…' : 'Extend range'}</Button><Button variant="outline" onClick={() => { void copySelection() }}><Copy size={15} aria-hidden="true" />Copy</Button><Button onClick={() => newNote(true)}><Feather size={15} aria-hidden="true" />Add note</Button><Button variant="ghost" size="icon" aria-label="Clear verse selection" onClick={() => { setSelectedKeys([]); setExtendSelection(false) }}><X size={17} /></Button></div>}
      <footer className="statusbar"><span><span className="status-dot" />All reading works offline</span><span>Made for a thoughtful reading experience</span></footer>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}><DialogContent className="navigation-dialog"><DialogTitle>Library</DialogTitle><DialogDescription>Choose a workspace, book, or chapter.</DialogDescription>{renderLibrary()}</DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogTitle>Make room for reading</DialogTitle><DialogDescription>Choose a comfortable reading experience. Preferences are saved on this device.</DialogDescription><div className="settings-content"><SelectField label="Appearance" id="theme-setting" value={preferences.theme} onValueChange={value => changePreferences({ theme: value as Preferences['theme'] })} options={[{ value: 'system', label: 'Follow system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /><div className="field"><label>Scripture text size</label><div className="font-control"><Button variant="outline" size="icon" aria-label="Decrease text size" disabled={preferences.fontSizePx <= 16} onClick={() => changePreferences({ fontSizePx: Math.max(16, preferences.fontSizePx - 2) })}><Minus size={16} /></Button><output aria-live="polite">{preferences.fontSizePx} px</output><Button variant="outline" size="icon" aria-label="Increase text size" disabled={preferences.fontSizePx >= 32} onClick={() => changePreferences({ fontSizePx: Math.min(32, preferences.fontSizePx + 2) })}><Plus size={16} /></Button><span className="font-preview" aria-hidden="true" style={{ fontSize: preferences.fontSizePx }}>Aa</span></div></div><SelectField id="line-height-setting" label="Line spacing" value={String(preferences.lineHeight)} onValueChange={value => changePreferences({ lineHeight: Number(value) as Preferences['lineHeight'] })} options={[{ value: '1.4', label: 'Compact' }, { value: '1.65', label: 'Comfortable' }, { value: '1.9', label: 'Relaxed' }]} /><SelectField id="reading-width-setting" label="Reading width" value={preferences.width} onValueChange={value => changePreferences({ width: value as Preferences['width'] })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'wide', label: 'Wide' }]} /><div className="settings-edition"><div className="eyebrow">CONTENT INFORMATION</div><strong>{edition?.title}</strong><p>{edition?.attribution}</p><p>{edition?.licenseNotice}</p><p className="field-help">Interface: English development fallback. Afaan Oromo wording requires fluent review before release.</p></div></div><DialogClose asChild><Button variant="outline">Done</Button></DialogClose></DialogContent></Dialog>
    <Dialog open={deleteOpen} onOpenChange={open => { if (!deleteBusy) setDeleteOpen(open) }}><DialogContent showCloseButton={!deleteBusy}><DialogTitle>Delete this note?</DialogTitle><DialogDescription>“{notes.draft ? noteTitle(notes.draft) : 'This note'}” will be removed from this device. This action cannot be undone.</DialogDescription><div className="dialog-actions"><Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>Keep note</Button><Button variant="destructive" disabled={deleteBusy} onClick={() => { setDeleteBusy(true); void notes.remove().then(success => { if (success) setDeleteOpen(false) }).finally(() => setDeleteBusy(false)) }}>{deleteBusy ? 'Deleting…' : 'Delete note'}</Button></div></DialogContent></Dialog>
    <Dialog open={pendingAction !== null} onOpenChange={open => { if (!open && !guardBusy) setPendingAction(null) }}><DialogContent showCloseButton={!guardBusy}><DialogTitle>Your note has unsaved changes</DialogTitle><DialogDescription>The save did not complete. Keep the draft here, try again, or discard the unsaved changes before continuing.</DialogDescription><div className="dialog-actions"><Button variant="outline" disabled={guardBusy} onClick={() => setPendingAction(null)}>Stay here</Button><Button variant="ghost" disabled={guardBusy} onClick={() => { const action = pendingAction; setGuardBusy(true); void notes.discard().then(() => { setPendingAction(null); action?.() }).finally(() => setGuardBusy(false)) }}>Discard changes</Button><Button disabled={guardBusy} onClick={() => { setGuardBusy(true); void notes.save().then(success => { if (success) { const action = pendingAction; setPendingAction(null); action?.() } }).finally(() => setGuardBusy(false)) }}>Retry save</Button></div></DialogContent></Dialog>
  </div>
}
