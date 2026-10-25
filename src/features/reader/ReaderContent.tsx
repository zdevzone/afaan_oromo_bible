import { useState, type ReactNode } from "react";
import { ExternalLink, Highlighter, X } from "lucide-react";
import type { ChapterContent, InlineNode, SourceReferenceTarget } from "../../domain/scripture";
import type { HighlightColor } from "../../domain/notes";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { en, type UiCatalog } from "../../locales/en";

export function ReaderContent({
  chapter,
  selectedKeys,
  highlightColors = {},
  onSelect,
  onNavigate,
  languageTag,
  bookName,
  strings = en,
}: {
  chapter: ChapterContent;
  selectedKeys: string[];
  highlightColors?: Record<string, HighlightColor>;
  onSelect: (key: string, extend: boolean) => void;
  onNavigate: (target: SourceReferenceTarget) => void;
  languageTag: string;
  bookName: string;
  strings?: UiCatalog;
}) {
  const [callout, setCallout] = useState<Extract<
    InlineNode,
    { kind: "footnote" | "reference" }
  > | null>(null);
  let activeUnitKey: string | null = null;
  const sourceAttribute = (node: InlineNode, name: string) =>
    "sourceAttributes" in node
      ? node.sourceAttributes?.find(([key]) => key === name)?.[1]
      : undefined;
  const referenceLabel = (node: Extract<InlineNode, { kind: "reference" }>) =>
    (node.target?.end ? strings.openStartOfRangeReference : strings.openSourceReference)
      .replace("{reference}", sourceAttribute(node, "loc") ?? "")
      .trim();
  const renderNoteInline = (node: InlineNode, index: number): ReactNode => {
    if (node.kind === "text") return <span key={index}>{node.text}</span>;
    if (node.kind === "optionalBreak") return <wbr key={index} />;
    if (node.kind === "verseStart" || node.kind === "verseEnd") return null;
    if (node.kind === "character")
      return (
        <span key={index} className={`source-character source-character-${node.style}`}>
          {(node.content ?? []).map(renderNoteInline)}
        </span>
      );
    if (node.kind === "reference" && node.target)
      return (
        <button
          key={index}
          type="button"
          className="source-reference"
          aria-label={referenceLabel(node)}
          onClick={() => {
            if (node.target) onNavigate(node.target);
            setCallout(null);
          }}
        >
          {(node.content ?? []).map(renderNoteInline)}
        </button>
      );
    return (
      <span key={index} className={node.kind === "reference" ? "source-reference" : undefined}>
        {(node.content ?? []).map(renderNoteInline)}
      </span>
    );
  };
  const renderInline = (node: InlineNode, index: number): ReactNode => {
    if (node.kind === "text") {
      const color = activeUnitKey ? highlightColors[activeUnitKey] : undefined;
      return (
        <span key={index} data-highlight={color} data-unit-key={activeUnitKey ?? undefined}>
          {node.text}
        </span>
      );
    }
    if (node.kind === "verseStart") {
      activeUnitKey = node.unitKey;
      const unit = chapter.verseUnits.find((candidate) => candidate.key === node.unitKey);
      if (!unit) return null;
      const highlight = highlightColors[unit.key];
      const reference = `${bookName} ${chapter.chapterLabel}:${unit.label}`;
      return (
        <Button
          key={index}
          id={`verse-${unit.order}`}
          variant="ghost"
          className="verse-marker"
          aria-label={`${strings.selectVerse.replace("{reference}", reference)}${
            highlight ? `. ${strings.highlightedVerse.replace("{color}", strings[highlight])}` : ""
          }`}
          aria-pressed={selectedKeys.includes(unit.key)}
          data-has-highlight={highlight ? "true" : undefined}
          onClick={(event) => onSelect(unit.key, event.shiftKey)}
        >
          {unit.label}
          {highlight && <Highlighter size={13} aria-hidden="true" />}
        </Button>
      );
    }
    if (node.kind === "verseEnd") {
      activeUnitKey = null;
      return null;
    }
    if (node.kind === "optionalBreak") return <wbr key={index} />;
    if (node.kind === "character")
      return (
        <span key={index} className={`source-character source-character-${node.style}`}>
          {(node.content ?? []).map(renderInline)}
        </span>
      );
    if (node.kind === "reference" && node.displayMode !== "callout")
      return node.target ? (
        <button
          key={index}
          type="button"
          className="source-reference"
          aria-label={referenceLabel(node)}
          onClick={() => node.target && onNavigate(node.target)}
        >
          {(node.content ?? []).map(renderInline)}
        </button>
      ) : (
        <span key={index} className="source-reference">
          {(node.content ?? []).map(renderInline)}
        </span>
      );
    const caller = sourceAttribute(node, "caller") ?? (node.kind === "footnote" ? "*" : "↗");
    return (
      <button
        key={index}
        type="button"
        className="source-callout"
        aria-label={(node.kind === "footnote"
          ? strings.footnoteCaller
          : strings.crossReferenceCaller
        ).replace("{caller}", caller)}
        onClick={() => setCallout(node)}
      >
        {caller}
      </button>
    );
  };
  const renderHeading = (content: InlineNode[] | undefined) => {
    const hasVerseMilestone = content?.some(
      (node) => node.kind === "verseStart" || node.kind === "verseEnd",
    );
    if (hasVerseMilestone) return content?.map(renderInline);
    const pendingUnitKey = activeUnitKey;
    activeUnitKey = null;
    const rendered = content?.map(renderInline);
    activeUnitKey = pendingUnitKey;
    return rendered;
  };
  return (
    <>
      <div className="scripture" lang={languageTag}>
        {chapter.blocks.map((block, index) =>
          block.role === "metadata" ? null : block.role === "heading" ? (
            <h2 className="source-heading" key={index}>
              {renderHeading(block.content)}
            </h2>
          ) : (
            <p
              className={
                block.role === "poetry"
                  ? "poetry"
                  : block.role === "list"
                    ? "source-list"
                    : undefined
              }
              style={
                block.role === "poetry"
                  ? {
                      paddingInlineStart: `${Math.min(Number(block.style.match(/\d+/u)?.[0] ?? 1), 6) * 1.1}em`,
                    }
                  : undefined
              }
              key={index}
            >
              {(block.content ?? []).map(renderInline)}
            </p>
          ),
        )}
      </div>
      <Dialog
        open={callout !== null}
        onOpenChange={(open) => {
          if (!open) setCallout(null);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog}>
          <DialogTitle>
            {callout?.kind === "footnote" ? strings.sourceFootnote : strings.sourceCrossReference}
          </DialogTitle>
          <DialogDescription>{strings.sourceNoteDescription}</DialogDescription>
          <p className="source-note-text" lang={languageTag}>
            {callout ? (callout.content ?? []).map(renderNoteInline) : null}
          </p>
          {callout?.kind === "reference" &&
            (callout.target ? (
              <Button
                onClick={() => {
                  if (callout.target) onNavigate(callout.target);
                  setCallout(null);
                }}
              >
                <ExternalLink size={16} aria-hidden="true" />
                {callout.target.end ? strings.openStartOfRange : strings.openPassage}
              </Button>
            ) : (
              <p className="muted">{strings.referenceUnavailable}</p>
            ))}
          <Button variant="outline" onClick={() => setCallout(null)}>
            <X size={15} aria-hidden="true" />
            {strings.close}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
