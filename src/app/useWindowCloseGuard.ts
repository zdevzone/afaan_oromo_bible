import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesktopWindow } from "../domain/ports";

interface CloseNotes {
  pauseForClose(): void;
  hasUnsavedChanges(): boolean;
  resumeAfterClose(): void;
  save(): Promise<boolean>;
  discard(): Promise<void>;
}

/** The platform prevents every close request until an explicit decision finishes. */
export function useWindowCloseGuard(
  window: DesktopWindow | undefined,
  notes: CloseNotes,
  settleWrites: () => Promise<void> = async () => {},
) {
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef({ notes, settleWrites });
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const attempt = useRef(0);

  useLayoutEffect(() => {
    latest.current = { notes, settleWrites };
  });

  async function finish(discard: boolean, id = attempt.current) {
    if (!window || !activeRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    let closed = false;
    try {
      if (discard) await latest.current.notes.discard();
      else if (!(await latest.current.notes.save())) {
        if (id !== attempt.current) return;
        setError("Your note could not be saved. The window is still open.");
        setOpen(true);
        return;
      }
      await latest.current.settleWrites();
      // Never let a stale completion destroy a replacement or unmounted editor.
      if (id !== attempt.current) return;
      await window.close();
      closed = true;
    } catch (cause) {
      if (id !== attempt.current) return;
      setError(
        `The window could not close. ${cause instanceof Error ? cause.message : "Please try again."}`,
      );
      setOpen(true);
    } finally {
      if (id === attempt.current && !closed) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const finishRef = useRef(finish);
  useLayoutEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!window) return;
    const unsubscribe = window.onCloseRequested(() => {
      if (activeRef.current) return;
      activeRef.current = true;
      const id = ++attempt.current;
      latest.current.notes.pauseForClose();
      setActive(true);
      setError("");
      if (latest.current.notes.hasUnsavedChanges()) setOpen(true);
      else void finishRef.current(false, id);
    });
    return () => {
      unsubscribe();
      ++attempt.current;
      if (activeRef.current) latest.current.notes.resumeAfterClose();
      activeRef.current = false;
      busyRef.current = false;
      window.resetCloseRequest();
    };
  }, [window]);

  function cancel() {
    if (!activeRef.current || busyRef.current) return;
    ++attempt.current;
    activeRef.current = false;
    setActive(false);
    setOpen(false);
    setError("");
    latest.current.notes.resumeAfterClose();
    window?.resetCloseRequest();
  }

  return {
    active,
    open,
    busy,
    error,
    cancel,
    saveAndClose: () => finish(false),
    discardAndClose: () => finish(true),
  };
}
