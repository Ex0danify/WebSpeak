import { describe, expect, it } from "vitest";
import { accompanimentAvailability, type AccompanimentAvailabilityInput } from "@/features/room/dock/accompanimentAvailability";

const live: AccompanimentAvailabilityInput = {
  supported: true,
  active: false,
  webrtcAvailable: true,
  webrtcActive: true,
  connection: "connected",
};

describe("accompanimentAvailability", () => {
  it("is ready while WebRTC is live", () => {
    expect(accompanimentAvailability(live)).toBe("ready");
  });

  it("is hidden where the browser cannot capture audio", () => {
    expect(accompanimentAvailability({ ...live, supported: false })).toBe("hidden");
    expect(accompanimentAvailability({ ...live, supported: false, webrtcAvailable: false })).toBe("hidden");
  });

  it("names the gateway when it has WebRTC off", () => {
    expect(accompanimentAvailability({ ...live, webrtcAvailable: false, webrtcActive: false })).toBe("gatewayOff");
  });

  it("reads a connected link without WebRTC as the PCM fallback", () => {
    expect(accompanimentAvailability({ ...live, webrtcActive: false })).toBe("fallback");
  });

  it("waits while the link is being set up or down", () => {
    expect(accompanimentAvailability({ ...live, connection: "connecting" })).toBe("waiting");
    expect(accompanimentAvailability({ ...live, connection: "disconnected", webrtcActive: false })).toBe("waiting");
  });

  it("always lets a running share be stopped", () => {
    expect(accompanimentAvailability({ ...live, active: true, webrtcActive: false, connection: "disconnected" })).toBe("ready");
  });
});
