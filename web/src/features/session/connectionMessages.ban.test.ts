import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionFailureMessage } from "@/features/session/connectionMessages";
import { resolveText } from "@/shared/i18n/localizedText";
import { useFormat } from "@/shared/i18n/useFormat";

describe("connectionFailureMessage for a ban", () => {
  afterEach(() => vi.useRealTimers());

  it("says only that the person is banned when the time is not known", () => {
    expect(connectionFailureMessage("BANNED")).toEqual({ key: "err_BANNED" });
  });

  it("says a ban is permanent for 0 seconds", () => {
    expect(connectionFailureMessage("BANNED", undefined, 0)).toEqual({ key: "bannedPermanent" });
  });

  it("names the moment the ban ends, counted from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2030, 0, 1, 12, 0, 0));
    const until = useFormat().dateTime(Date.UTC(2030, 0, 1, 13, 0, 0));
    const message = connectionFailureMessage("BANNED", "detail", 3600);
    expect(message).toEqual({ key: "bannedUntil", params: { until } });
    expect(resolveText(message)).toContain(until);
  });

  it("ignores a time for any other failure", () => {
    expect(connectionFailureMessage("KICKED", undefined, 3600)).toEqual({ key: "err_KICKED" });
  });
});
