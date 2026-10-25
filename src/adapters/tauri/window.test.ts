import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createTauriWindow } from "./window";

const native = vi.hoisted(() => ({
  closeRequested: undefined as undefined | ((event: { preventDefault(): void }) => void),
  quitRequested: undefined as undefined | (() => void),
  destroy: vi.fn(async () => {}),
  invoke: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: typeof native.closeRequested) => {
      native.closeRequested = handler;
      return () => {};
    },
    destroy: native.destroy,
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (_name: string, handler: typeof native.quitRequested) => {
    native.quitRequested = handler;
    return () => {};
  },
}));

beforeEach(() => {
  native.closeRequested = undefined;
  native.quitRequested = undefined;
  native.destroy.mockClear();
  native.invoke.mockClear();
});

describe("native close request routing", () => {
  it("sends application Quit through the guard and approves exit only after its decision", async () => {
    const port = await createTauriWindow();
    const decision = vi.fn();
    port.onCloseRequested(decision);

    native.quitRequested?.();
    expect(decision).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalled();
    await port.close();
    expect(native.invoke).toHaveBeenCalledWith("app_quit_after_decision");
    expect(native.destroy).not.toHaveBeenCalled();
  });

  it("keeps the first Quit route while another close request arrives", async () => {
    const port = await createTauriWindow();
    const decision = vi.fn();
    port.onCloseRequested(decision);
    native.quitRequested?.();
    const preventDefault = vi.fn();
    native.closeRequested?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(decision).toHaveBeenCalledOnce();
    await port.close();
    expect(native.invoke).toHaveBeenCalledWith("app_quit_after_decision");
    expect(native.destroy).not.toHaveBeenCalled();
  });

  it("allows a new close route after a cancelled decision", async () => {
    const port = await createTauriWindow();
    const decision = vi.fn();
    port.onCloseRequested(decision);
    native.quitRequested?.();
    port.resetCloseRequest();
    const preventDefault = vi.fn();
    native.closeRequested?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(decision).toHaveBeenCalledTimes(2);
    await port.close();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalled();
  });
});
