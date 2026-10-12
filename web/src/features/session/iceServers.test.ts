// ICE server normalization and the module-level shared config.
import { afterEach, describe, expect, it } from "vitest";
import { getScreenShareIceServers, normalizeScreenShareIceServers, setScreenShareIceServers } from "./iceServers";

const DEFAULTS = [{ urls: "stun:turn.teamspeak.com:3478" }, { urls: "stun:turn2.teamspeak.com:3478" }];

afterEach(() => setScreenShareIceServers(undefined));

describe("normalizeScreenShareIceServers", () => {
  it.each([undefined, null, "stun:x", {}, [], [null, 3, "x", []], [{ urls: "http://nope" }], [{ urls: [] }]])(
    "falls back to the defaults for %j",
    (raw) => {
      expect(normalizeScreenShareIceServers(raw)).toEqual(DEFAULTS);
    },
  );

  it("keeps a single url as a string and several as an array, trimmed and de-duplicated", () => {
    expect(
      normalizeScreenShareIceServers([{ urls: " STUN:a.example:3478 " }, { urls: ["turn:b.example", "turn:b.example", "ftp:x"] }]),
    ).toEqual([{ urls: "STUN:a.example:3478" }, { urls: "turn:b.example" }]);
  });

  it("carries username and credential only when they are strings", () => {
    expect(
      normalizeScreenShareIceServers([
        { urls: "turn:a", username: "u", credential: "c" },
        { urls: "turn:b", username: 1, credential: 2 },
      ]),
    ).toEqual([{ urls: "turn:a", username: "u", credential: "c" }, { urls: "turn:b" }]);
  });

  it("drops an exact duplicate (same urls and username) and caps the list at 8", () => {
    expect(
      normalizeScreenShareIceServers([
        { urls: "turn:a", username: "u" },
        { urls: "turn:a", username: "u" },
      ]),
    ).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => ({ urls: `stun:h${i}` }));
    expect(normalizeScreenShareIceServers(many)).toHaveLength(8);
  });
});

describe("shared screen-share ICE config", () => {
  it("starts on the defaults, is replaced by set, and is module-level", () => {
    expect(getScreenShareIceServers()).toEqual(DEFAULTS);
    setScreenShareIceServers([{ urls: "turn:mine" }]);
    expect(getScreenShareIceServers()).toEqual([{ urls: "turn:mine" }]);
  });
});
