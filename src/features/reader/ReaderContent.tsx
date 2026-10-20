import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { ChapterContent, InlineNode, VerseAddress } from '../../domain/scripture'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'

export function ReaderContent({ chapter, selectedKeys, onSelect, onNavigate, languageTag, bookName }: {
  chapter: ChapterContent
  selectedKeys: string[]
  onSelect(key: string, extend: boolean): void
  onNavigate(target: VerseAddress): void
  languageTag: string
  bookName: string
}) {
  const [callout, setCallout] = useState<Extract<InlineNode, { type: 'footnote' | 'crossReference' }> | null>(null)
  const renderInline = (node: InlineNode, index: number) => {
    if (node.type === 'text') return <span key={index}>{node.text}</span>
    if (node.type === 'verse') {
      const unit = chapter.verseUnits.find(candidate => candidate.key === node.unitKey)
      if (!unit) return null
      return <Button key={index} id={`verse-${unit.order}`} variant="ghost" className="verse-marker" aria-label={`Select verse ${bookName} ${chapter.chapterLabel}:${unit.label}`} aria-pressed={selectedKeys.includes(unit.key)} onClick={event => onSelect(unit.key, event.shiftKey)}>{unit.label}</Button>
    }
    return <button key={index} type="button" className="source-callout" aria-label={`${node.type === 'footnote' ? 'Footnote' : 'Cross-reference'} ${node.caller}`} onClick={() => setCallout(node)}>{node.caller}</button>
  }
  return <>
    <div className="scripture" lang={languageTag}>
      {chapter.blocks.map((block, index) => block.type === 'heading'
        ? <h3 className="source-heading" key={index}>{block.text}</h3>
        : <p className={block.type === 'poetry' ? 'poetry' : undefined} style={block.type === 'poetry' ? { paddingInlineStart: `${Math.min(block.level, 6) * 1.1}em` } : undefined} key={index}>{block.children.map(renderInline)}</p>)}
    </div>
    <Dialog open={callout !== null} onOpenChange={open => { if (!open) setCallout(null) }}>
      <DialogContent>
        <DialogTitle>{callout?.type === 'footnote' ? 'Source footnote' : 'Source cross-reference'}</DialogTitle>
        <DialogDescription>This note is supplied with the content source.</DialogDescription>
        <p className="source-note-text" lang={languageTag}>{callout?.text}</p>
        {callout?.type === 'crossReference' && (callout.target
          ? <Button onClick={() => { if (callout.target) onNavigate(callout.target); setCallout(null) }}><ExternalLink size={16} aria-hidden="true" />Open passage</Button>
          : <p className="muted">This reference is unavailable in the installed content.</p>)}
        <Button variant="outline" onClick={() => setCallout(null)}><X size={15} aria-hidden="true" />Close</Button>
      </DialogContent>
    </Dialog>
  </>
}
