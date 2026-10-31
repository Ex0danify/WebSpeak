import { afterEach, describe, expect, it } from "vitest";
import { useToast } from "@/shared/composables/useToast";
import { LocalizedError, text } from "@/shared/i18n/localizedText";
import { toastActionFailure, toastActionFailureReason, toastMuteSyncFailure } from "@/features/room/actionFailure";

afterEach(() => useToast().dismiss());

const last = () => useToast().toasts.value.at(-1);

describe("toastActionFailure", () => {
  it("names the action and gives the specific reason", () => {
    toastActionFailure("Poke failed", new LocalizedError(text("err_PERMISSION_DENIED"), "PERMISSION_DENIED"));
    expect(last()).toMatchObject({
      variant: "danger",
      title: "Poke failed",
      description: "You do not have permission to perform this action",
    });
  });

  it("leaves the generic gateway failure out, it adds nothing to the title", () => {
    toastActionFailure("Poke failed", new LocalizedError(text("err_OPERATION_FAILED"), "OPERATION_FAILED"));
    expect(last()?.title).toBe("Poke failed");
    expect(last()?.description).toBeUndefined();
  });

  it("uses the message of a plain error and nothing for other values", () => {
    toastActionFailure("Poke failed", new Error("socket gone"));
    expect(last()?.description).toBe("socket gone");
    toastActionFailure("Poke failed", "oops");
    expect(last()?.description).toBeUndefined();
  });

  it("appends the hint after the reason", () => {
    toastActionFailureReason("Poke failed", "No right", "Try later.");
    expect(last()?.description).toBe("No right Try later.");
  });

  it("stays longer than a confirmation", () => {
    toastActionFailure("Poke failed", new Error("x"));
    expect(last()?.duration).toBeGreaterThan(2800);
  });
});

describe("toastMuteSyncFailure", () => {
  it("says what others may see for a muted and an unmuted local state", () => {
    toastMuteSyncFailure(new Error("refused"), true);
    expect(last()).toMatchObject({
      title: "Mute status could not be synced",
      description: "refused Others may still see you as unmuted. Your microphone stays off.",
    });
    toastMuteSyncFailure(new Error("refused"), false);
    expect(last()?.description).toBe("refused Others may still see you as muted.");
  });
});
