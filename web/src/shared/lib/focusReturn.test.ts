import { afterEach, describe, expect, it } from "vitest";
import { setFocusReturn, takeFocusReturn } from "@/shared/lib/focusReturn";

afterEach(() => {
  setFocusReturn(null);
  document.body.innerHTML = "";
});

describe("focusReturn", () => {
  it("hands out the anchor once", () => {
    const button = document.body.appendChild(document.createElement("button"));
    setFocusReturn(button);
    expect(takeFocusReturn()).toBe(button);
    expect(takeFocusReturn()).toBeNull();
  });

  it("gives nothing for an anchor that left the page", () => {
    const button = document.body.appendChild(document.createElement("button"));
    setFocusReturn(button);
    button.remove();
    expect(takeFocusReturn()).toBeNull();
  });
});
