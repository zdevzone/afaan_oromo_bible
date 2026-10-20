import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import fixture from '../../../content/fixtures/sample.json';
import manifest from '../../../content/fixtures/manifest.json';
import { createVerseAnchor } from '../../domain/notes';
import { assertFixturePack } from '../../domain/validation';
import { parseSearchQuery } from '../../services/search';
import { createFixtureLibrary } from './fixtureLibrary';

const editionId = fixture.edition.id;

describe('synthetic source integrity and reference behavior', () => {
  it('has a complete explicit synthetic manifest and source digests', () => {
    assertFixturePack(fixture);
    expect(fixture.edition.isSynthetic).toBe(true);
    expect(manifest.distributionApproved).toBe(false);
    expect(createHash('sha256').update(readFileSync(new URL('../../../content/fixtures/sample.json', import.meta.url))).digest('hex'))
      .toBe(manifest.normalizedContentSha256);
    for (const chapter of fixture.chapters) {
      for (const unit of chapter.verseUnits) {
        expect(createHash('sha256').update(unit.textPlain).digest('hex')).toBe(unit.textDigest);
      }
    }
    const changed = structuredClone(fixture);
    const unit = changed.chapters[0]?.verseUnits[0];
    if (!unit) throw new Error('Fixture needs a verse unit.');
    unit.textPlain = 'A changed projection that does not match the AST.';
    expect(() => assertFixturePack(changed)).toThrow();
  });

  it('resolves bridge members and subdivision groups without duplicating text', async () => {
    const library = createFixtureLibrary();
    const bridge = await library.resolveReference('Sample A 1:2', editionId);
    const otherMember = await library.resolveReference('TSA 1:3', editionId);
    expect(bridge.unitKeys).toEqual(otherMember.unitKeys);
    expect(bridge.unitKeys).toHaveLength(1);
    const explicitBridge = await library.resolveReference('TSA 1:2-3', editionId);
    expect(explicitBridge.unitKeys).toEqual(bridge.unitKeys);
    const subdivisions = await library.resolveReference('TSA 1:4', editionId);
    expect(subdivisions.unitKeys).toHaveLength(2);
    const range = await library.resolveReference('TSA 1:1-4', editionId);
    expect(range.unitKeys).toHaveLength(4);
    await expect(library.resolveReference('TSA 99:1', editionId)).rejects.toThrow();
    await expect(library.resolveReference('TSA 1:99', editionId)).rejects.toThrow();
    await expect(library.resolveReference('TSA 1:4-1', editionId)).rejects.toThrow();
  });

  it('does not expose mutable source objects or guess missing editions', async () => {
    const library = createFixtureLibrary();
    const editions = await library.listEditions();
    const edition = editions[0];
    if (!edition) throw new Error('Fixture needs an edition.');
    edition.title = 'Mutated outside the adapter';
    expect((await library.listEditions())[0]?.title).toBe(fixture.edition.title);
    await expect(library.listBooks('missing-edition')).rejects.toThrow();
  });

  it('constructs contiguous anchors from actual source units and rejects missing/gapped units', async () => {
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({ editionId, bookCode: 'TSA', chapterLabel: '1' });
    const first = chapter.verseUnits[0];
    const third = chapter.verseUnits[2];
    if (!first || !third) throw new Error('Fixture needs three verse units.');
    const anchor = createVerseAnchor(fixture.edition, chapter, [first.key], 'Sample Book A');
    expect(anchor.start.verseLabel).toBe('1');
    expect(anchor.selectedTextDigests).toEqual([first.textDigest]);
    expect(() => createVerseAnchor(fixture.edition, chapter, [first.key, third.key], 'Sample Book A')).toThrow();
    expect(() => createVerseAnchor(fixture.edition, chapter, ['missing'], 'Sample Book A')).toThrow();
  });
});

describe('fixture search adapter', () => {
  it('keeps canonical order, filters books and paginates beyond a first page', async () => {
    const library = createFixtureLibrary();
    const query = parseSearchQuery('care* "careful reading"');
    const first = await library.search({ editionId, query, limit: 1 });
    expect(first.total).toBe(3);
    expect(first.items[0]?.bookCode).toBe('TSA');
    expect(first.hasMore).toBe(true);
    const next = await library.search({ editionId, query, limit: 1, offset: 1 });
    expect(next.items[0]?.verseLabel).toBe('4a');
    const filtered = await library.search({ editionId, query, bookCode: 'TSB' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.bookCode).toBe('TSB');
    await expect(library.search({ editionId, query, limit: 51 })).rejects.toThrow();
  });

  it('excludes heading/footnote bodies and never matches a phrase across units', async () => {
    const library = createFixtureLibrary();
    expect((await library.search({ editionId, query: parseSearchQuery('commentary') })).total).toBe(0);
    expect((await library.search({ editionId, query: parseSearchQuery('"reading synthetic poetry"') })).total).toBe(0);
    const equivalent = await library.search({ editionId, query: parseSearchQuery("ga'ee CAFÉ") });
    expect(equivalent.items.map((item) => item.verseLabel)).toEqual(['2-3']);
    const distinct = await library.search({ editionId, query: parseSearchQuery('gaʼee') });
    expect(distinct.items.map((item) => item.chapterLabel)).toEqual(['2']);
  });
});
