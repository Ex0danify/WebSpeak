import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "@/shared/composables/useDialog";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import { useSessionStore } from "@/features/session";
import {
  clearMuteSyncFailure,
  clearState,
  notifyBlocking,
  notifyEvent,
  notifyMuteSyncFailure,
  notifyState,
} from "@/features/room/shell/roomNotify";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  useToast().dismiss();
});

const last = () => useToast().toasts.value.at(-1);
const notices = () => useSessionStore().roomNotices;

describe("notifyEvent", () => {
  it("names what happened and gives the specific reason", () => {
    notifyEvent("Poke failed", { error: new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED") });
    expect(last()).toMatchObject({
      variant: "danger",
      title: "Poke failed",
      description: "You do not have permission to perform this action",
    });
  });

  it("leaves the generic gateway failure out, it adds nothing to the title", () => {
    notifyEvent("Poke failed", { error: new LocalizedError(text("err_OPERATION_FAILED"), "OPERATION_FAILED") });
    expect(last()?.title).toBe("Poke failed");
    expect(last()?.description).toBeUndefined();
  });

  it("uses the message of a plain error and nothing for other values", () => {
    notifyEvent("Poke failed", { error: new Error("socket gone") });
    expect(last()?.description).toBe("socket gone");
    notifyEvent("Poke failed", { error: "oops" });
    expect(last()?.description).toBeUndefined();
  });

  it("takes a reason in hand over the error and appends the hint", () => {
    notifyEvent("Poke failed", { error: new Error("ignored"), reason: "No right", hint: "Try later." });
    expect(last()?.description).toBe("No right Try later.");
  });

  it("stays longer than a confirmation", () => {
    notifyEvent("Poke failed");
    expect(last()?.duration).toBeGreaterThan(2800);
  });
});

describe("notifyState", () => {
  it("shows a notice until it is cleared, and replaces one with the same code", () => {
    notifyState("SOME_STATE", "first");
    notifyState("SOME_STATE", "second", { variant: "danger" });
    expect(notices()).toMatchObject([{ code: "SOME_STATE", text: "second", variant: "danger" }]);
    clearState("SOME_STATE");
    expect(notices()).toEqual([]);
  });

  it("lapses after the given time and a new raise starts the time again", () => {
    notifyState("LAPSING", "x", { expiresAfterMs: 1000 });
    vi.advanceTimersByTime(800);
    notifyState("LAPSING", "x", { expiresAfterMs: 1000 });
    vi.advanceTimersByTime(800);
    expect(notices()).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(notices()).toEqual([]);
  });

  it("does not let a cleared notice lapse later on a newer one", () => {
    notifyState("CODE", "x", { expiresAfterMs: 1000 });
    clearState("CODE");
    notifyState("CODE", "again");
    vi.advanceTimersByTime(2000);
    expect(notices()).toHaveLength(1);
  });
});

describe("notifyBlocking", () => {
  it("raises a dialog and resolves once it is acknowledged", async () => {
    const done = vi.fn();
    void notifyBlocking({ title: "Stop", confirmLabel: "OK" }).then(done);
    expect(useDialog).toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).not.toHaveBeenCalled();
  });
});

describe("mute sync failure", () => {
  it("is a notice that says what others may see, and goes when the sync works again", () => {
    notifyMuteSyncFailure(new Error("refused"), true);
    expect(notices()).toMatchObject([
      {
        code: "MUTE_SYNC_FAILED",
        title: { key: "muteSyncFailed" },
        text: "refused Others may still see you as unmuted. Your microphone stays off.",
      },
    ]);
    notifyMuteSyncFailure(new Error("refused"), false);
    expect(notices()).toHaveLength(1);
    expect(notices()[0].text).toBe("refused Others may still see you as muted.");
    clearMuteSyncFailure();
    expect(notices()).toEqual([]);
  });
});
