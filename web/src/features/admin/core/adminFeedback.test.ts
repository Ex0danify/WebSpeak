import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminFeedbackStore } from "@/features/admin/core/adminFeedback";
import { dismissToast, useToast } from "@/shared/composables/useToast";

beforeEach(() => {
  setActivePinia(createPinia());
  dismissToast();
});

describe("useAdminFeedbackStore", () => {
  it("shows a failure by the code the gateway answered with, until it is cleared", () => {
    const feedback = useAdminFeedbackStore();
    feedback.fail({ code: "RATE_LIMITED" });
    expect(feedback.errorMessage).toBe(feedback.errorText("RATE_LIMITED"));
    expect(feedback.errorMessage).not.toBe("");
    feedback.clearError();
    expect(feedback.errorMessage).toBe("");
  });

  it("shows a message of its own in the same banner", () => {
    const feedback = useAdminFeedbackStore();
    feedback.showError("Nope");
    expect(feedback.errorMessage).toBe("Nope");
  });

  it("says a success in a toast and leaves the banner alone", () => {
    const feedback = useAdminFeedbackStore();
    feedback.showError("Earlier");
    feedback.notify("Done");
    expect(useToast().toasts.value).toMatchObject([{ title: "Done", variant: "success" }]);
    expect(feedback.errorMessage).toBe("Earlier");
  });

  it("runs an action, shows its failure in the banner and runs the cleanup either way", async () => {
    const feedback = useAdminFeedbackStore();
    const cleanup = vi.fn();
    await feedback.attempt(async () => {}, cleanup);
    expect(feedback.errorMessage).toBe("");
    await feedback.attempt(async () => Promise.reject({ code: "RATE_LIMITED" }), cleanup);
    expect(feedback.errorMessage).toBe(feedback.errorText("RATE_LIMITED"));
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("hands out one status per name, and shows a failure in it and not in the banner", () => {
    const feedback = useAdminFeedbackStore();
    expect(feedback.statusOf("list")).toBe(feedback.statusOf("list"));
    expect(feedback.statusOf("list")).not.toBe(feedback.statusOf("other"));
    feedback.failStatus("list", { code: "RATE_LIMITED" });
    expect(feedback.statusOf("list").error).toBe(feedback.errorText("RATE_LIMITED"));
    expect(feedback.statusOf("other").error).toBe("");
    expect(feedback.errorMessage).toBe("");
  });
});
