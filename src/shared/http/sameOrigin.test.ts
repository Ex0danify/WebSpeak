import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./sameOrigin.js";

const request = (headers: Record<string, string>) => ({ header: (name: string) => headers[name] });

describe("isSameOrigin", () => {
  it("matches the origin host against the host header", () => {
    expect(isSameOrigin(request({ origin: "https://a.test:3040", host: "a.test:3040" }))).toBe(true);
  });

  it("rejects a different host, a missing header and an unparsable origin", () => {
    expect(isSameOrigin(request({ origin: "https://evil.test", host: "a.test" }))).toBe(false);
    expect(isSameOrigin(request({ host: "a.test" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "not a url", host: "a.test" }))).toBe(false);
  });
});
