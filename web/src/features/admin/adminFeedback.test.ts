import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAdminFeedbackStore } from "@/features/admin/adminFeedback";
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
});
