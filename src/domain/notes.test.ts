import { describe, expect, it } from 'vite-plus/test';
import fixture from '../../content/fixtures/sample.json';
import { createFixtureLibrary } from '../adapters/browser/fixtureLibrary';
import { createVerseAnchor, isUtcTimestamp, validateAnchor, validateNote } from './notes';

describe('personal-record boundary validation', () => {
  it('rejects rolled-over calendar dates and accepts exact UTC timestamp variants', () => {
    expect(isUtcTimestamp('2026-02-30T13:00:00Z')).toBe(false);
    expect(isUtcTimestamp('2026-02-28T13:00:00Z')).toBe(true);
    expect(isUtcTimestamp('2026-02-28T13:00:00.1Z')).toBe(true);
    expect(isUtcTimestamp('2026-02-28T13:00:00+00:00')).toBe(false);
  });

  it('requires generic anchor tuples to match stored edition, scheme and endpoints', async () => {
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({ editionId: fixture.edition.id, bookCode: 'TSA', chapterLabel: '1' });
    const anchor = createVerseAnchor(fixture.edition, chapter, chapter.verseUnits.slice(0, 2).map((unit) => unit.key), 'Sample A');
    expect(() => validateAnchor(anchor)).not.toThrow();
    expect(() => validateAnchor({ ...anchor, start: anchor.end, end: anchor.start })).toThrow();
    expect(() => validateAnchor({ ...anchor, unitKeys: ['not-a-reference'], selectedTextDigests: anchor.selectedTextDigests.slice(0, 1) })).toThrow();
    expect(() => validateAnchor({ ...anchor, editionId: 'another-edition' })).toThrow();
    // No installed-library lookup occurs here: a valid unavailable record remains recoverable.
    expect(() => validateAnchor({ ...anchor, contentRevision: 'a-source-revision-not-installed' })).not.toThrow();
  });

  it('allows empty titles and valid existing blank records without discarding their identity', () => {
    const now = new Date().toISOString();
    const note = { id: crypto.randomUUID(), title: '', bodyText: 'A useful observation.', anchor: null, createdAt: now, updatedAt: now, revision: 0 };
    expect(() => validateNote(note)).not.toThrow();
    expect(() => validateNote({ ...note, bodyText: ' \n ', revision: 1 })).not.toThrow();
  });
});
