import { act, cleanup, renderHook } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createFixtureLibrary } from '../../adapters/browser/fixtureLibrary';
import { IndexedDbUserStore } from '../../adapters/browser/indexedDbUserStore';
import { createVerseAnchor, DEFAULT_PREFERENCES } from '../../domain/notes';
import type { Note } from '../../domain/notes';
import type { AppServices, UserStore } from '../../domain/ports';
import { useNoteWorkspace } from './useNoteWorkspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function record(bodyText: string): Note {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: '', bodyText, anchor: null, revision: 1, createdAt: now, updatedAt: now };
}

function userStore(overrides: Partial<UserStore> = {}): UserStore {
  return {
    listNotes: async () => [],
    saveNote: async (note) => ({ ...note, revision: note.revision + 1 }),
    deleteNote: async () => {},
    getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
    savePreferences: async () => {},
    getReadingPosition: async () => null,
    saveReadingPosition: async () => {},
    ...overrides,
  };
}

function services(store: UserStore): AppServices {
  return {
    userStore: store,
    library: createFixtureLibrary(),
    runtime: 'browser',
    platform: { copyText: async () => {} },
  };
}

function controlledStore(initial: Note[] = []) {
  const records = new Map(initial.map((note) => [note.id, note]));
  const writes: Array<{ note: Note; completion: ReturnType<typeof deferred<Note>> }> = [];
  const saveNote = vi.fn((note: Note) => {
    const completion = deferred<Note>();
    writes.push({ note: structuredClone(note), completion });
    return completion.promise;
  });
  const deleteNote = vi.fn(async (id: string) => { records.delete(id); });
  const store = userStore({ listNotes: async () => [...records.values()], saveNote, deleteNote });
  function commit(index: number) {
    const write = writes[index];
    if (!write) throw new Error(`Expected pending write ${index}.`);
    expect(write.note.revision).toBe(records.get(write.note.id)?.revision ?? 0);
    const saved = { ...write.note, revision: write.note.revision + 1 };
    records.set(saved.id, saved);
    write.completion.resolve(saved);
  }
  return { store, records, writes, saveNote, deleteNote, commit };
}

async function settle() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('note editor persistence', () => {
  it('serializes rapid edits and waits until the latest buffer is committed', async () => {
    const storage = controlledStore();
    const servicesForTest = services(storage.store);
    const hook = renderHook(() => useNoteWorkspace(servicesForTest));
    await settle();
    act(() => { hook.result.current.create(); hook.result.current.edit({ bodyText: 'First buffer' }); });
    let saved!: Promise<boolean>;
    act(() => { saved = hook.result.current.save(); });
    await settle();
    expect(storage.saveNote).toHaveBeenCalledTimes(1);

    act(() => { hook.result.current.edit({ bodyText: 'Second buffer' }); });
    await act(async () => { vi.advanceTimersByTime(300); });
    act(() => { hook.result.current.edit({ bodyText: 'Latest buffer' }); });
    // A queued autosave cannot enter the store while the first write is pending.
    expect(storage.saveNote).toHaveBeenCalledTimes(1);
    expect(hook.result.current.dirty).toBe(true);

    await act(async () => { storage.commit(0); });
    expect(hook.result.current.status).not.toBe('saved');
    for (let index = 1; index < storage.writes.length && index < 5; index += 1) {
      // At most one store write may be outstanding; either queuing or coalescing is valid.
      expect(storage.writes).toHaveLength(index + 1);
      await act(async () => { storage.commit(index); });
    }
    await act(async () => { expect(await saved).toBe(true); });

    expect(hook.result.current.draft?.bodyText).toBe('Latest buffer');
    expect(hook.result.current.draft?.revision).toBe(storage.writes.length);
    expect(hook.result.current.notes[0]?.bodyText).toBe('Latest buffer');
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.dirty).toBe(false);
  });

  it('does not let an older queued edit overwrite a reverted buffer after guarded navigation', async () => {
    const other = record('Another saved note');
    const storage = controlledStore([other]);
    const appServices = services(storage.store);
    const hook = renderHook(() => useNoteWorkspace(appServices));
    await settle();
    act(() => { hook.result.current.create(); hook.result.current.edit({ bodyText: 'Keep this buffer' }); });
    const noteId = hook.result.current.draft!.id;
    let navigation!: Promise<boolean>;
    act(() => {
      navigation = hook.result.current.save().then((success) => {
        if (success) hook.result.current.open(other);
        return success;
      });
    });
    await settle();
    act(() => { hook.result.current.edit({ bodyText: 'Intermediate queued buffer' }); });
    await act(async () => { vi.advanceTimersByTime(300); });
    act(() => { hook.result.current.edit({ bodyText: 'Keep this buffer' }); });
    await act(async () => { storage.commit(0); });
    // A correct implementation may coalesce the intermediate save or drain/revert it.
    for (let index = 1; index < storage.writes.length && index < 5; index += 1) {
      await act(async () => { storage.commit(index); });
    }
    await act(async () => { expect(await navigation).toBe(true); });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(storage.records.get(noteId)?.bodyText).toBe('Keep this buffer');
    expect(hook.result.current.draft?.id).toBe(other.id);
  });

  it('retains a failed draft and acknowledges a later successful retry', async () => {
    let attempts = 0;
    const saveNote = vi.fn(async (note: Note) => {
      if (attempts++ === 0) throw new Error('Synthetic disk-full failure');
      return { ...note, revision: note.revision + 1 };
    });
    const appServices = services(userStore({ saveNote }));
    const hook = renderHook(() => useNoteWorkspace(appServices));
    await settle();
    act(() => { hook.result.current.create(); hook.result.current.edit({ bodyText: 'Do not lose this draft.' }); });
    await act(async () => { expect(await hook.result.current.save()).toBe(false); });

    expect(hook.result.current.draft?.bodyText).toBe('Do not lose this draft.');
    expect(hook.result.current.notes).toEqual([]);
    expect(hook.result.current.dirty).toBe(true);
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.error).toContain('disk-full');

    await act(async () => { expect(await hook.result.current.save()).toBe(true); });
    expect(hook.result.current.notes[0]?.bodyText).toBe('Do not lose this draft.');
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.dirty).toBe(false);
  });

  it('deletes after an in-flight autosave and invalidates queued saves without resurrection', async () => {
    const storage = controlledStore();
    const appServices = services(storage.store);
    const hook = renderHook(() => useNoteWorkspace(appServices));
    await settle();
    act(() => { hook.result.current.create(); hook.result.current.edit({ bodyText: 'Delete this note' }); });
    const id = hook.result.current.draft!.id;
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(storage.saveNote).toHaveBeenCalledTimes(1);
    act(() => { hook.result.current.edit({ bodyText: 'Queued edit to the deleted note' }); });
    await act(async () => { vi.advanceTimersByTime(300); });
    let removed!: Promise<boolean>;
    act(() => { removed = hook.result.current.remove(); });
    expect(storage.deleteNote).not.toHaveBeenCalled();
    await act(async () => { storage.commit(0); expect(await removed).toBe(true); });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(storage.deleteNote).toHaveBeenCalledWith(id);
    expect(storage.saveNote).toHaveBeenCalledTimes(1);
    expect(storage.records.has(id)).toBe(false);
    expect(hook.result.current.notes).toEqual([]);
    expect(hook.result.current.draft).toBeNull();
  });

  it('reopens a linked note through a fresh IndexedDB adapter and editor instance', async () => {
    vi.useRealTimers();
    const factory = new IDBFactory();
    const databaseName = crypto.randomUUID();
    const firstStore = new IndexedDbUserStore({ indexedDb: factory, databaseName });
    const library = createFixtureLibrary();
    const [edition] = await library.listEditions();
    if (!edition) throw new Error('Expected the synthetic edition.');
    const chapter = await library.getChapter({ editionId: edition.id, bookCode: 'TSA', chapterLabel: '1' });
    const bridge = chapter.verseUnits.find((unit) => unit.label === '2-3');
    if (!bridge) throw new Error('Expected the synthetic bridged verse.');
    const anchor = createVerseAnchor(edition, chapter, [bridge.key], 'Sample Book A');
    const firstServices = services(firstStore);
    const first = renderHook(() => useNoteWorkspace(firstServices));
    try {
      await act(async () => { await firstStore.listNotes(); });
      act(() => { first.result.current.create(anchor); first.result.current.edit({ title: 'Preparation', bodyText: 'A personal thought, not Scripture.' }); });
      await act(async () => { expect(await first.result.current.save()).toBe(true); });
      first.unmount();
      await firstStore.close();
      const reopenedStore = new IndexedDbUserStore({ indexedDb: factory, databaseName });
      const reopenedServices = services(reopenedStore);
      const reopened = renderHook(() => useNoteWorkspace(reopenedServices));
      try {
        await act(async () => { await reopenedStore.listNotes(); });
        const savedNote = reopened.result.current.notes[0];
        expect(savedNote?.anchor).toEqual(anchor);
        if (!savedNote) throw new Error('Expected the committed note after reopening.');
        act(() => { reopened.result.current.open(savedNote); });
        expect(reopened.result.current.draft?.bodyText).toBe('A personal thought, not Scripture.');
        expect(reopened.result.current.draft?.anchor?.start.verseLabel).toBe('2-3');
        expect(reopened.result.current.status).toBe('saved');
      } finally {
        reopened.unmount();
        await reopenedStore.close();
      }
    } finally {
      first.unmount();
      await firstStore.close();
    }
  });
});
