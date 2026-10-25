import { AppError, verseUnitKey } from "./scripture";
import type {
  BookSummary,
  ChapterContent,
  ChapterKey,
  Edition,
  FixturePack,
  InlineNode,
  ReferenceResolution,
  SearchResult,
  SearchResults,
} from "./scripture";

function invalid(): never {
  throw new AppError(
    "CONTENT_INVALID",
    "The content response is invalid. Reload or check the content pack.",
  );
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
}

function text(value: unknown, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) invalid();
}

function strings(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) invalid();
  for (const item of value) text(item);
}

function integer(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
}

function assertChapterKey(value: unknown): asserts value is ChapterKey {
  record(value);
  text(value.editionId);
  text(value.bookCode);
  text(value.chapterLabel);
}

export function assertEdition(value: unknown): asserts value is Edition {
  record(value);
  for (const field of [
    "id",
    "title",
    "abbreviation",
    "languageTag",
    "versificationId",
    "contentRevision",
    "canonId",
    "attribution",
    "licenseNotice",
  ])
    text(value[field]);
  for (const field of ["languageName", "sourceTitle", "rightsHolderName", "sourceCompletedOn"])
    if (value[field] !== undefined) text(value[field]);
  if (
    value.sourceArchiveSha256 !== undefined &&
    (typeof value.sourceArchiveSha256 !== "string" ||
      !/^[a-f0-9]{64}$/iu.test(value.sourceArchiveSha256))
  )
    invalid();
  if (typeof value.isSynthetic !== "boolean") invalid();
  if (value.technicalReviewOnly !== undefined && value.technicalReviewOnly !== true) invalid();
}

export function assertBook(value: unknown): asserts value is BookSummary {
  record(value);
  text(value.editionId);
  text(value.code);
  text(value.name);
  strings(value.aliases);
  strings(value.chapters);
  if (value.chapters.length === 0 || new Set(value.chapters).size !== value.chapters.length)
    invalid();
  integer(value.order);
}

const blockRoles: Record<string, Set<string>> = {
  metadata: new Set("h toc1 toc2 toc3 rem".split(" ")),
  heading: new Set("cl d lh mr ms ms1 mt1 mt2 mt3 qa qr r s1 s2 s3 sp".split(" ")),
  poetry: new Set("q1 q2 q3 qc qm1 qm2".split(" ")),
  list: new Set("lf li1 li2 li3".split(" ")),
  paragraph: new Set("b m mi nb p pc pi1 pm pmc pmo po pr".split(" ")),
};
const characterStyles = new Set("fq fqa fr ft it nd rq tl wj xt".split(" "));

function assertSourceMetadata(value: Record<string, unknown>): void {
  if (value.sourcePath !== undefined) {
    if (!Array.isArray(value.sourcePath)) invalid();
    for (const index of value.sourcePath) integer(index);
  }
  if (value.sourceAttributes !== undefined) {
    if (!Array.isArray(value.sourceAttributes)) invalid();
    const names = new Set<string>();
    for (const pair of value.sourceAttributes) {
      if (!Array.isArray(pair) || pair.length !== 2) invalid();
      text(pair[0]);
      text(pair[1], true);
      if (names.has(pair[0])) invalid();
      names.add(pair[0]);
    }
  }
}

function attribute(value: Record<string, unknown>, name: string): string | undefined {
  if (!Array.isArray(value.sourceAttributes)) return undefined;
  const pair = value.sourceAttributes.find(
    (item: unknown) => Array.isArray(item) && item[0] === name,
  );
  return Array.isArray(pair) && typeof pair[1] === "string" ? pair[1] : undefined;
}

function assertInline(value: unknown, depth: number): asserts value is InlineNode {
  if (depth > 64) invalid();
  record(value);
  assertSourceMetadata(value);
  switch (value.kind) {
    case "text":
      text(value.text, true);
      return;
    case "verseStart":
      text(value.unitKey);
      return;
    case "verseEnd":
    case "optionalBreak":
      return;
    case "character":
      if (!characterStyles.has(String(value.style))) invalid();
      if (value.sourceAttributes !== undefined && attribute(value, "style") !== value.style)
        invalid();
      break;
    case "footnote":
      if (value.sourceAttributes !== undefined && attribute(value, "style") !== "f") invalid();
      break;
    case "reference":
      if (
        value.displayMode !== undefined &&
        value.displayMode !== "inline" &&
        value.displayMode !== "callout"
      )
        invalid();
      if (value.target !== undefined && value.target !== null) {
        record(value.target);
        text(value.target.bookCode);
        text(value.target.chapterLabel);
        if (value.target.verseLabel !== undefined) text(value.target.verseLabel);
        if (value.target.end !== undefined) {
          record(value.target.end);
          text(value.target.end.bookCode);
          text(value.target.end.chapterLabel);
          if (value.target.end.verseLabel !== undefined) text(value.target.end.verseLabel);
          if (value.target.end.bookCode !== value.target.bookCode) invalid();
        }
      }
      break;
    default:
      invalid();
  }
  if (value.content !== undefined && !Array.isArray(value.content)) invalid();
  for (const child of value.content ?? []) assertInline(child, depth + 1);
}

export function assertChapter(value: unknown): asserts value is ChapterContent {
  assertChapterKey(value);
  record(value);
  const bookCode = value.bookCode;
  const chapterLabel = value.chapterLabel;
  if (!Array.isArray(value.verseUnits) || !Array.isArray(value.blocks)) invalid();
  const keys = new Set<string>();
  const labels = new Set<string>();
  const projection = new Map<string, string>();
  const lastBodyBlock = new Map<string, number>();
  let previousOrder = -1;
  for (const unit of value.verseUnits) {
    record(unit);
    text(unit.key);
    text(unit.label);
    text(unit.textPlain, true);
    text(unit.textDigest);
    integer(unit.order);
    if (
      !/^[a-f0-9]{64}$/u.test(unit.textDigest) ||
      keys.has(unit.key) ||
      labels.has(unit.label) ||
      unit.order <= previousOrder
    )
      invalid();
    keys.add(unit.key);
    labels.add(unit.label);
    previousOrder = unit.order;
  }
  let activeUnit: string | null = null;
  const milestoneOrder: string[] = [];
  const unitByKey = new Map(value.verseUnits.map((unit) => [unit.key, unit]));
  function projectNodes(
    nodes: InlineNode[],
    blockIndex: number,
    inFootnote = false,
    inNonBody = false,
  ): void {
    for (const node of nodes) {
      assertInline(node, 0);
      if (node.kind === "verseStart") {
        if (
          inFootnote ||
          activeUnit !== null ||
          !keys.has(node.unitKey) ||
          projection.has(node.unitKey)
        )
          invalid();
        const unit = unitByKey.get(node.unitKey);
        if (!unit) invalid();
        const expected = `${bookCode} ${chapterLabel}:${unit.label}`;
        const marker = attribute(node, "sid");
        if (marker !== undefined && marker !== expected) invalid();
        activeUnit = node.unitKey;
        milestoneOrder.push(node.unitKey);
        projection.set(node.unitKey, "");
      } else if (node.kind === "verseEnd") {
        if (inFootnote || activeUnit === null) invalid();
        const unit = unitByKey.get(activeUnit);
        if (!unit) invalid();
        const marker = attribute(node, "eid");
        if (marker !== undefined && marker !== `${bookCode} ${chapterLabel}:${unit.label}`)
          invalid();
        activeUnit = null;
      } else if (node.kind === "text" && activeUnit !== null && !inFootnote && !inNonBody) {
        const previous = projection.get(activeUnit) ?? "";
        const priorBlock = lastBodyBlock.get(activeUnit);
        const separator =
          node.text &&
          priorBlock !== undefined &&
          priorBlock !== blockIndex &&
          !previous.endsWith("\n") &&
          !node.text.startsWith("\n")
            ? "\n"
            : "";
        projection.set(activeUnit, previous + separator + node.text);
        if (node.text) lastBodyBlock.set(activeUnit, blockIndex);
      }
      if (node.kind === "character")
        projectNodes(node.content ?? [], blockIndex, inFootnote, inNonBody);
      if (node.kind === "footnote") projectNodes(node.content ?? [], blockIndex, true, inNonBody);
      if (node.kind === "reference")
        projectNodes(
          node.content ?? [],
          blockIndex,
          inFootnote || node.displayMode === "callout",
          inNonBody,
        );
    }
  }
  for (const [blockIndex, block] of value.blocks.entries()) {
    record(block);
    if (
      block.kind !== "block" ||
      typeof block.role !== "string" ||
      typeof block.style !== "string" ||
      !blockRoles[block.role]?.has(block.style)
    )
      invalid();
    assertSourceMetadata(block);
    if (block.sourceAttributes !== undefined && attribute(block, "style") !== block.style)
      invalid();
    if (block.content !== undefined && !Array.isArray(block.content)) invalid();
    const inNonBody =
      (block.role === "metadata" || block.role === "heading") &&
      !(block.content ?? []).some((node) => node.kind === "verseStart" || node.kind === "verseEnd");
    projectNodes(block.content ?? [], blockIndex, false, inNonBody);
  }
  if (activeUnit !== null || milestoneOrder.length !== value.verseUnits.length) invalid();
  for (const [index, unit] of value.verseUnits.entries()) {
    if (projection.get(unit.key) !== unit.textPlain || milestoneOrder[index] !== unit.key)
      invalid();
  }
  record(value.referenceLookup);
  for (const [label, mapped] of Object.entries(value.referenceLookup)) {
    text(label);
    strings(mapped);
    if (mapped.length === 0 || new Set(mapped).size !== mapped.length) invalid();
    let lastIndex = -1;
    for (const key of mapped) {
      const index = milestoneOrder.indexOf(key);
      if (index <= lastIndex) invalid();
      lastIndex = index;
    }
  }
  for (const unit of value.verseUnits) {
    const mapped = value.referenceLookup[unit.label];
    if (!Array.isArray(mapped) || mapped.length !== 1 || mapped[0] !== unit.key) invalid();
  }
}

export function assertResolution(value: unknown): asserts value is ReferenceResolution {
  record(value);
  assertChapterKey(value.chapter);
  strings(value.unitKeys);
  if (new Set(value.unitKeys).size !== value.unitKeys.length) invalid();
}

function assertSearchResult(value: unknown): asserts value is SearchResult {
  record(value);
  for (const field of [
    "editionId",
    "bookCode",
    "bookName",
    "chapterLabel",
    "verseLabel",
    "unitKey",
  ]) {
    text(value[field]);
  }
  text(value.textPlain, true);
}

export function assertSearchResults(value: unknown): asserts value is SearchResults {
  record(value);
  if (!Array.isArray(value.items) || value.items.length > 50) invalid();
  for (const item of value.items) assertSearchResult(item);
  integer(value.total);
  if (value.total < value.items.length || typeof value.hasMore !== "boolean") invalid();
}

export function assertFixturePack(value: unknown): asserts value is FixturePack {
  record(value);
  if (value.formatVersion !== 1) invalid();
  assertEdition(value.edition);
  if (!Array.isArray(value.books) || !Array.isArray(value.chapters) || value.books.length === 0)
    invalid();
  const books = new Map<string, BookSummary>();
  const orders = new Set<number>();
  for (const book of value.books) {
    assertBook(book);
    if (book.editionId !== value.edition.id || books.has(book.code) || orders.has(book.order))
      invalid();
    books.set(book.code, book);
    orders.add(book.order);
  }
  const chapters = new Set<string>();
  for (const chapter of value.chapters) {
    assertChapter(chapter);
    const book = books.get(chapter.bookCode);
    const key = JSON.stringify([chapter.bookCode, chapter.chapterLabel]);
    if (
      chapter.editionId !== value.edition.id ||
      !book ||
      !book.chapters.includes(chapter.chapterLabel) ||
      chapters.has(key)
    )
      invalid();
    chapters.add(key);
    for (const unit of chapter.verseUnits) {
      if (
        unit.key !==
        verseUnitKey(value.edition.id, value.edition.versificationId, {
          bookCode: chapter.bookCode,
          chapterLabel: chapter.chapterLabel,
          verseLabel: unit.label,
        })
      )
        invalid();
    }
  }
  for (const book of books.values()) {
    for (const label of book.chapters) {
      if (!chapters.has(JSON.stringify([book.code, label]))) invalid();
    }
  }
}
