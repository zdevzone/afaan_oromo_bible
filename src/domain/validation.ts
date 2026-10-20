import { AppError, verseUnitKey } from './scripture';
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
} from './scripture';

function invalid(): never {
  throw new AppError('CONTENT_INVALID', 'The content response is invalid. Reload or check the content pack.');
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
}

function text(value: unknown, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) invalid();
}

function strings(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) invalid();
  for (const item of value) text(item);
}

function integer(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
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
    'id', 'title', 'abbreviation', 'languageTag', 'versificationId', 'contentRevision',
    'canonId', 'attribution', 'licenseNotice',
  ]) text(value[field]);
  if (typeof value.isSynthetic !== 'boolean') invalid();
}

export function assertBook(value: unknown): asserts value is BookSummary {
  record(value);
  text(value.editionId);
  text(value.code);
  text(value.name);
  strings(value.aliases);
  strings(value.chapters);
  if (value.chapters.length === 0 || new Set(value.chapters).size !== value.chapters.length) invalid();
  integer(value.order);
}

function assertInline(value: unknown): asserts value is InlineNode {
  record(value);
  switch (value.type) {
    case 'text':
      text(value.text, true);
      return;
    case 'verse':
      text(value.unitKey);
      return;
    case 'footnote':
      text(value.id);
      text(value.caller, true);
      text(value.text, true);
      return;
    case 'crossReference':
      text(value.id);
      text(value.caller, true);
      text(value.text, true);
      if (value.target !== null) {
        record(value.target);
        text(value.target.bookCode);
        text(value.target.chapterLabel);
        text(value.target.verseLabel);
      }
      return;
    default:
      invalid();
  }
}

export function assertChapter(value: unknown): asserts value is ChapterContent {
  assertChapterKey(value);
  record(value);
  if (!Array.isArray(value.verseUnits) || !Array.isArray(value.blocks)) invalid();
  const keys = new Set<string>();
  const labels = new Set<string>();
  const projection = new Map<string, string>();
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
      keys.has(unit.key) || labels.has(unit.label) || unit.order <= previousOrder
    ) invalid();
    keys.add(unit.key);
    labels.add(unit.label);
    previousOrder = unit.order;
  }
  let activeUnit: string | null = null;
  const milestoneOrder: string[] = [];
  for (const block of value.blocks) {
    record(block);
    if (block.type === 'heading') {
      text(block.text, true);
      continue;
    }
    if (block.type !== 'paragraph' && block.type !== 'poetry') invalid();
    if (block.type === 'poetry') integer(block.level);
    if (!Array.isArray(block.children)) invalid();
    for (const node of block.children) {
      assertInline(node);
      if (node.type === 'verse') {
        if (!keys.has(node.unitKey) || projection.has(node.unitKey)) invalid();
        activeUnit = node.unitKey;
        milestoneOrder.push(node.unitKey);
        projection.set(node.unitKey, '');
      } else if (node.type === 'text' && activeUnit !== null) {
        projection.set(activeUnit, (projection.get(activeUnit) ?? '') + node.text);
      }
    }
  }
  if (milestoneOrder.length !== value.verseUnits.length) invalid();
  for (const [index, unit] of value.verseUnits.entries()) {
    if (projection.get(unit.key) !== unit.textPlain || milestoneOrder[index] !== unit.key) invalid();
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
  for (const field of ['editionId', 'bookCode', 'bookName', 'chapterLabel', 'verseLabel', 'unitKey']) {
    text(value[field]);
  }
  text(value.textPlain, true);
}

export function assertSearchResults(value: unknown): asserts value is SearchResults {
  record(value);
  if (!Array.isArray(value.items) || value.items.length > 50) invalid();
  for (const item of value.items) assertSearchResult(item);
  integer(value.total);
  if (value.total < value.items.length || typeof value.hasMore !== 'boolean') invalid();
}

export function assertFixturePack(value: unknown): asserts value is FixturePack {
  record(value);
  if (value.formatVersion !== 1) invalid();
  assertEdition(value.edition);
  if (!Array.isArray(value.books) || !Array.isArray(value.chapters) || value.books.length === 0) invalid();
  const books = new Map<string, BookSummary>();
  const orders = new Set<number>();
  for (const book of value.books) {
    assertBook(book);
    if (book.editionId !== value.edition.id || books.has(book.code) || orders.has(book.order)) invalid();
    books.set(book.code, book);
    orders.add(book.order);
  }
  const chapters = new Set<string>();
  for (const chapter of value.chapters) {
    assertChapter(chapter);
    const book = books.get(chapter.bookCode);
    const key = JSON.stringify([chapter.bookCode, chapter.chapterLabel]);
    if (
      chapter.editionId !== value.edition.id || !book ||
      !book.chapters.includes(chapter.chapterLabel) || chapters.has(key)
    ) invalid();
    chapters.add(key);
    for (const unit of chapter.verseUnits) {
      if (unit.key !== verseUnitKey(value.edition.id, value.edition.versificationId, {
        bookCode: chapter.bookCode, chapterLabel: chapter.chapterLabel, verseLabel: unit.label,
      })) invalid();
    }
  }
  for (const book of books.values()) {
    for (const label of book.chapters) {
      if (!chapters.has(JSON.stringify([book.code, label]))) invalid();
    }
  }
}
