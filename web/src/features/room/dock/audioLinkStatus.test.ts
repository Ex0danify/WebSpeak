import { describe, expect, it } from "vitest";
import { audioLinkStatus } from "@/features/room/dock/audioLinkStatus";

const up = { connected: true, connecting: false, reconnecting: false, reconnectFailed: false };

describe("audioLinkStatus", () => {
  it("is connected once the session is up and no audio notice is open", () => {
    expect(audioLinkStatus(up, [])).toBe("connected");
    expect(audioLinkStatus(up, [{ code: "WEBRTC_FALLBACK" }])).toBe("connected");
  });

  it("is connecting while the voice link is set up", () => {
    expect(audioLinkStatus(up, [{ code: "VOICE_CONNECTING" }])).toBe("connecting");
  });

  it("is connecting while the session connects or reconnects", () => {
    expect(audioLinkStatus({ ...up, connected: false, connecting: true }, [])).toBe("connecting");
    expect(audioLinkStatus({ ...up, reconnecting: true }, [])).toBe("connecting");
  });

  it("is disconnected when the voice link failed", () => {
    expect(audioLinkStatus(up, [{ code: "VOICE_FAILED" }])).toBe("disconnected");
  });

  it("is disconnected without a session, or when reconnecting gave up", () => {
    expect(audioLinkStatus({ ...up, connected: false }, [])).toBe("disconnected");
    expect(audioLinkStatus({ ...up, reconnectFailed: true }, [])).toBe("disconnected");
  });
});
