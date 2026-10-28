import { describe, expect, it } from "vitest";
import { describeClient } from "./clientInfo.js";

describe("describeClient", () => {
  it.each([
    [
      "Firefox on Linux",
      "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
      { browser: "Firefox", browserVersion: "140.0", os: "Linux", platform: "desktop", engine: "Gecko" },
    ],
    [
      "Chrome on Android",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      { browser: "Chrome", os: "Android", osVersion: "14", platform: "mobile", engine: "Blink" },
    ],
    [
      "Safari on iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      { browser: "Safari", os: "iOS", platform: "mobile", engine: "WebKit" },
    ],
  ])("reads %s", (_name, agent, expected) => {
    expect(describeClient(agent)).toMatchObject(expected);
  });

  it("has nothing for a missing user agent, and nulls for one it does not know", () => {
    expect(describeClient(null)).toBeNull();
    expect(describeClient("curl/8.5.0")).toMatchObject({ os: null, platform: null, engine: null });
  });
});
