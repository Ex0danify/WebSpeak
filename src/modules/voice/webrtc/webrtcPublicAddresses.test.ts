import { describe, expect, it } from "vitest";
import { resolveWebRtcPublicAddresses } from "./webrtcPublicAddresses.js";

describe("resolveWebRtcPublicAddresses", () => {
  it("keeps an IPv4 literal and resolves a name to its IPv4 addresses", async () => {
    const never = async () => {
      throw new Error("must not look up");
    };
    expect(await resolveWebRtcPublicAddresses("203.0.113.7", never)).toEqual(["203.0.113.7"]);
    const found = async () => [{ address: "203.0.113.9" }, { address: "203.0.113.9" }, { address: "203.0.113.10" }];
    expect(await resolveWebRtcPublicAddresses("voice.example.org", found)).toEqual(["203.0.113.9", "203.0.113.10"]);
  });

  it("gives nothing for no host, an IPv6 literal, a failed lookup or a lookup that is too slow", async () => {
    const failing = async () => {
      throw new Error("ENOTFOUND");
    };
    const hanging = () => new Promise<never>(() => undefined);
    expect(await resolveWebRtcPublicAddresses(undefined, failing)).toEqual([]);
    expect(await resolveWebRtcPublicAddresses("::1", failing)).toEqual([]);
    expect(await resolveWebRtcPublicAddresses("voice.example.org", failing)).toEqual([]);
    expect(await resolveWebRtcPublicAddresses("voice.example.org", hanging, 20)).toEqual([]);
  });
});
