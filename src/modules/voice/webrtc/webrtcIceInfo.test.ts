import type { RTCPeerConnection } from "werift";
import { describe, expect, it } from "vitest";
import { readIceInfo } from "./webrtcIceInfo.js";

function peer(state: string, nominated?: unknown): RTCPeerConnection {
  return { connectionState: state, iceTransports: [{ connection: { nominated } }] } as unknown as RTCPeerConnection;
}

const pair = {
  rtt: 0.0384,
  remoteCandidate: { type: "srflx", transport: "UDP" },
  get localCandidate() {
    return { type: "host" };
  },
};

describe("readIceInfo", () => {
  it("reads the nominated pair", () => {
    expect(readIceInfo(peer("connected", pair), null, 410)).toEqual({
      state: "connected",
      localType: "host",
      remoteType: "srflx",
      protocol: "udp",
      rttMs: 38,
      connectMs: 410,
    });
  });

  it("has only the state while no pair was nominated, which is what a failed ICE looks like", () => {
    expect(readIceInfo(peer("failed"), null, null)).toEqual({
      state: "failed",
      localType: null,
      remoteType: null,
      protocol: null,
      rttMs: null,
      connectMs: null,
    });
  });

  it("keeps what an earlier look found when the pair is gone, and survives a pair without a local candidate", () => {
    const first = readIceInfo(peer("connected", pair), null, 410);
    expect(readIceInfo(peer("closed"), first, 410)).toMatchObject({ state: "closed", remoteType: "srflx", rttMs: 38 });
    const half = {
      rtt: undefined,
      remoteCandidate: { type: "prflx", transport: "udp" },
      get localCandidate(): never {
        throw new Error("localCandidate not exist");
      },
    };
    expect(readIceInfo(peer("connecting", half), null, null)).toMatchObject({ localType: null, remoteType: "prflx", rttMs: null });
  });
});
