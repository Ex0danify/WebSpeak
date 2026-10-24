import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveStatus, SAVED_VISIBLE_MS } from "@/features/admin/core/saveStatus";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createSaveStatus", () => {
  it("says saved for a moment and then nothing", () => {
    const status = createSaveStatus();
    status.saving();
    expect(status.state).toBe("saving");
    status.saved();
    expect(status.state).toBe("saved");
    vi.advanceTimersByTime(SAVED_VISIBLE_MS - 1);
    expect(status.state).toBe("saved");
    vi.advanceTimersByTime(1);
    expect(status.state).toBe("idle");
  });

  it("does not let an old timer end a newer save", () => {
    const status = createSaveStatus();
    status.saved();
    vi.advanceTimersByTime(SAVED_VISIBLE_MS - 100);
    status.saving();
    vi.advanceTimersByTime(1000);
    expect(status.state).toBe("saving");
  });

  it("keeps an error until a save goes through", () => {
    const status = createSaveStatus();
    status.failed("Refused");
    expect(status).toMatchObject({ state: "idle", error: "Refused" });
    vi.advanceTimersByTime(SAVED_VISIBLE_MS * 2);
    expect(status.error).toBe("Refused");
    status.saved();
    expect(status.error).toBe("");
  });

  it("resets to nothing", () => {
    const status = createSaveStatus();
    status.failed("Refused");
    status.saved();
    status.reset();
    vi.advanceTimersByTime(SAVED_VISIBLE_MS);
    expect(status).toMatchObject({ state: "idle", error: "" });
  });
});
