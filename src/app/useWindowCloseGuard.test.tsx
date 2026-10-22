import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { DesktopWindow } from "../domain/ports";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeWindow() {
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const onCloseRequested = vi.fn((handler: () => void) => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      unsubscribe();
    };
  });
  const close = vi.fn(async () => {});
  const port: DesktopWindow = { onCloseRequested, close };
  return {
    port,
    close,
    onCloseRequested,
    unsubscribe,
    listeners,
    request: () => {
      for (const listener of listeners) listener();
    },
  };
}

function fakeNotes(dirty = true) {
  const events: string[] = [];
  const state = { dirty, paused: false };
  const pauseForClose = vi.fn(() => {
    events.push("pause");
    state.paused = true;
  });
  const hasUnsavedChanges = vi.fn(() => {
    events.push("inspect");
    return state.dirty;
  });
  const resumeAfterClose = vi.fn(() => {
    events.push("resume");
    state.paused = false;
  });
  const save = vi.fn(async () => true);
  const discard = vi.fn(async () => {});
  return { events, state, pauseForClose, hasUnsavedChanges, resumeAfterClose, save, discard };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("native window close decisions", () => {
  it("leaves the browser editor alone when there is no desktop window", async () => {
    const notes = fakeNotes();
    const settleWrites = vi.fn(async () => {});
    const hook = renderHook(() => useWindowCloseGuard(undefined, notes, settleWrites));

    await act(async () => {
      hook.result.current.cancel();
      await hook.result.current.saveAndClose();
      await hook.result.current.discardAndClose();
    });

    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.open).toBe(false);
    expect(notes.pauseForClose).not.toHaveBeenCalled();
    expect(notes.save).not.toHaveBeenCalled();
    expect(notes.discard).not.toHaveBeenCalled();
    expect(settleWrites).not.toHaveBeenCalled();
  });

  it("pauses before inspecting a draft, coalesces close requests, and resumes on cancel", () => {
    const window = fakeWindow();
    const notes = fakeNotes();
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes));

    act(() => {
      window.request();
      window.request();
      window.request();
    });

    expect(notes.events).toEqual(["pause", "inspect"]);
    expect(notes.state.paused).toBe(true);
    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.busy).toBe(false);
    expect(notes.save).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();

    act(() => hook.result.current.cancel());
    expect(notes.resumeAfterClose).toHaveBeenCalledTimes(1);
    expect(notes.state.paused).toBe(false);
    expect(hook.result.current.active).toBe(false);
    expect(hook.result.current.open).toBe(false);

    act(() => window.request());
    expect(notes.pauseForClose).toHaveBeenCalledTimes(2);
    expect(hook.result.current.open).toBe(true);
  });

  it("waits for clean-editor writes and settings before authorizing one close", async () => {
    const window = fakeWindow();
    const notes = fakeNotes(false);
    const save = deferred<boolean>();
    const writes = deferred<void>();
    notes.save.mockReturnValue(save.promise);
    const settleWrites = vi.fn(() => writes.promise);
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes, settleWrites));

    act(() => {
      window.request();
      window.request();
      void hook.result.current.saveAndClose();
      void hook.result.current.discardAndClose();
    });
    expect(notes.save).toHaveBeenCalledTimes(1);
    expect(notes.discard).not.toHaveBeenCalled();
    expect(hook.result.current.open).toBe(false);
    expect(hook.result.current.busy).toBe(true);
    expect(window.close).not.toHaveBeenCalled();
    expect(settleWrites).not.toHaveBeenCalled();

    await act(async () => save.resolve(true));
    expect(settleWrites).toHaveBeenCalledTimes(1);
    expect(window.close).not.toHaveBeenCalled();
    act(() => hook.result.current.cancel());
    expect(notes.resumeAfterClose).not.toHaveBeenCalled();

    await act(async () => writes.resolve());
    expect(window.close).toHaveBeenCalledTimes(1);
    // The app can still receive events until the native window actually disappears.
    await act(async () => {
      window.request();
      await hook.result.current.saveAndClose();
      await hook.result.current.discardAndClose();
    });
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(notes.save).toHaveBeenCalledTimes(1);
    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.busy).toBe(true);
  });

  it("keeps a failed save in the decision dialog and allows editing to resume", async () => {
    const window = fakeWindow();
    const notes = fakeNotes();
    notes.save.mockResolvedValue(false);
    const settleWrites = vi.fn(async () => {});
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes, settleWrites));
    act(() => window.request());

    await act(async () => hook.result.current.saveAndClose());

    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.error).toMatch(/could not be saved/u);
    expect(notes.state.dirty).toBe(true);
    expect(notes.state.paused).toBe(true);
    expect(notes.discard).not.toHaveBeenCalled();
    expect(settleWrites).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();

    act(() => hook.result.current.cancel());
    expect(notes.state.paused).toBe(false);
    expect(notes.state.dirty).toBe(true);
    expect(hook.result.current.error).toBe("");
  });

  it("opens a recovery decision if a clean-looking editor cannot flush", async () => {
    const window = fakeWindow();
    const notes = fakeNotes(false);
    notes.save.mockResolvedValue(false);
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes));

    await act(async () => window.request());

    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.error).not.toBe("");
    expect(notes.state.paused).toBe(true);
    expect(window.close).not.toHaveBeenCalled();
  });

  it("waits for discard and other writes without saving the discarded draft", async () => {
    const window = fakeWindow();
    const notes = fakeNotes();
    const discard = deferred<void>();
    const writes = deferred<void>();
    notes.discard.mockReturnValue(discard.promise);
    const settleWrites = vi.fn(() => writes.promise);
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes, settleWrites));
    act(() => window.request());
    let finished!: Promise<void>;

    act(() => {
      finished = hook.result.current.discardAndClose();
      void hook.result.current.discardAndClose();
      void hook.result.current.saveAndClose();
      window.request();
    });
    expect(notes.discard).toHaveBeenCalledTimes(1);
    expect(notes.save).not.toHaveBeenCalled();
    expect(settleWrites).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();

    await act(async () => discard.resolve());
    expect(settleWrites).toHaveBeenCalledTimes(1);
    expect(window.close).not.toHaveBeenCalled();
    await act(async () => {
      writes.resolve();
      await finished;
    });
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(notes.resumeAfterClose).not.toHaveBeenCalled();
  });

  it("retains the modal after native destruction fails and permits a deliberate retry", async () => {
    const window = fakeWindow();
    window.close.mockRejectedValueOnce(new Error("Synthetic native close rejection"));
    const notes = fakeNotes();
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes));
    act(() => window.request());

    await act(async () => hook.result.current.saveAndClose());

    expect(window.close).toHaveBeenCalledTimes(1);
    expect(hook.result.current.open).toBe(true);
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.error).toContain("Synthetic native close rejection");
    expect(notes.resumeAfterClose).not.toHaveBeenCalled();
    expect(notes.discard).not.toHaveBeenCalled();

    await act(async () => hook.result.current.saveAndClose());
    expect(window.close).toHaveBeenCalledTimes(2);
    expect(notes.pauseForClose).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe("");
  });

  it.each(["discard", "writes"] as const)(
    "does not destroy the window when %s fails",
    async (failure) => {
      const window = fakeWindow();
      const notes = fakeNotes();
      const settleWrites = vi.fn(async () => {});
      if (failure === "discard") notes.discard.mockRejectedValue(new Error("Discard failed"));
      else settleWrites.mockRejectedValue(new Error("Settings flush failed"));
      const hook = renderHook(() => useWindowCloseGuard(window.port, notes, settleWrites));
      act(() => window.request());

      await act(async () => hook.result.current.discardAndClose());

      expect(window.close).not.toHaveBeenCalled();
      expect(hook.result.current.open).toBe(true);
      expect(hook.result.current.busy).toBe(false);
      expect(hook.result.current.error).toContain(
        failure === "discard" ? "Discard failed" : "Settings flush failed",
      );
      expect(notes.resumeAfterClose).not.toHaveBeenCalled();
    },
  );

  it("does not destroy a window after its editor unmounts during a save", async () => {
    const window = fakeWindow();
    const notes = fakeNotes(false);
    const save = deferred<boolean>();
    notes.save.mockReturnValue(save.promise);
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes));
    act(() => window.request());
    hook.unmount();

    await act(async () => save.resolve(true));

    expect(window.close).not.toHaveBeenCalled();
    expect(window.listeners.size).toBe(0);
    expect(window.unsubscribe).toHaveBeenCalledTimes(1);
    expect(notes.resumeAfterClose).toHaveBeenCalledTimes(1);
  });

  it("invalidates an old window's delayed close when the platform port changes", async () => {
    const first = fakeWindow();
    const replacement = fakeWindow();
    const notes = fakeNotes(false);
    const firstSave = deferred<boolean>();
    notes.save.mockReturnValueOnce(firstSave.promise);
    const hook = renderHook(({ port }) => useWindowCloseGuard(port, notes), {
      initialProps: { port: first.port },
    });
    act(() => first.request());
    hook.rerender({ port: replacement.port });

    await act(async () => firstSave.resolve(true));
    expect(first.close).not.toHaveBeenCalled();
    expect(replacement.close).not.toHaveBeenCalled();
    expect(first.listeners.size).toBe(0);
    expect(replacement.listeners.size).toBe(1);

    await act(async () => replacement.request());
    expect(replacement.close).toHaveBeenCalledTimes(1);
  });

  it("keeps exactly one active subscription under StrictMode and cleans it up", () => {
    const window = fakeWindow();
    const notes = fakeNotes();
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes), {
      wrapper: StrictMode,
    });

    expect(window.onCloseRequested).toHaveBeenCalledTimes(2);
    expect(window.unsubscribe).toHaveBeenCalledTimes(1);
    expect(window.listeners.size).toBe(1);
    act(() => window.request());
    expect(notes.pauseForClose).toHaveBeenCalledTimes(1);
    expect(hook.result.current.open).toBe(true);

    hook.unmount();
    expect(window.unsubscribe).toHaveBeenCalledTimes(2);
    expect(window.listeners.size).toBe(0);
    expect(notes.resumeAfterClose).toHaveBeenCalledTimes(1);
    window.request();
    expect(window.close).not.toHaveBeenCalled();
  });

  it("rejects a completion from the StrictMode setup that has already been cleaned up", async () => {
    const window = fakeWindow();
    const notes = fakeNotes(false);
    const firstSave = deferred<boolean>();
    notes.save.mockReturnValueOnce(firstSave.promise);
    // Model a native close arriving during the first effect's subscription setup.
    window.onCloseRequested.mockImplementationOnce((handler) => {
      window.listeners.add(handler);
      handler();
      return () => {
        window.listeners.delete(handler);
        window.unsubscribe();
      };
    });
    const hook = renderHook(() => useWindowCloseGuard(window.port, notes), {
      wrapper: StrictMode,
    });
    expect(window.listeners.size).toBe(1);
    expect(notes.save).toHaveBeenCalledTimes(1);

    await act(async () => firstSave.resolve(true));

    expect(window.close).not.toHaveBeenCalled();
    expect(notes.resumeAfterClose).toHaveBeenCalledTimes(1);
    await act(async () => window.request());
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(notes.save).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(window.listeners.size).toBe(0);
  });
});
