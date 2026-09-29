import type { Page } from "@playwright/test";
import { memberRow, poll, withAudioTone } from "../helpers";
import { AudioCounters, expectQuiet } from "./counters";
import { expect, test } from "./fixtures";
import { inboundAudio, installProbes, webRtcElement } from "./probes";

// The two transports of the downlink, side by side (voice-decompose Track V3). The other voice
// specs run on the worker's gateway, where WebRTC is off and Opus travels over the WebSocket. Here
// the gateway of the test has WebRTC on: one browser is left to negotiate it, the other has
// `RTCPeerConnection` removed and so falls back to the WebSocket, and both hear the same tone.
// Browser and gateway are on one machine, so the media goes over loopback UDP (ports 40000-40099).
test.use(withAudioTone({ frequencyHz: 1000 }));

const dock = (page: Page) => page.getByRole("toolbar", { name: "Audio controls" });

test("with WebRTC on, the downlink is a peer connection: packets arrive, the WebSocket carries no audio, and Mute all audio mutes the element", async ({ person, ownGateway }) => {
  const gateway = await ownGateway({ webRtc: true });
  const alice = await person(0, "rtc-alice", { gateway });
  const bob = await person(1, "rtc-bob", { gateway });
  await installProbes(bob.page);
  await alice.join();
  await bob.join();

  const inbound = await poll(() => inboundAudio(bob.page), (stats) => (stats?.packetsReceived ?? 0) >= 50, {
    timeoutMs: 20_000,
    message: "50 inbound WebRTC audio packets at Bob",
  });
  expect(inbound!.bytesReceived).toBeGreaterThan(0);
  expect(inbound!.packetsLost / Math.max(1, inbound!.packetsReceived + inbound!.packetsLost)).toBeLessThan(0.05);
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();

  // Nothing is sent twice: once WebRTC carries the audio, the WebSocket has none.
  await expectQuiet(() => bob.session.binaryReceived, "the WebSocket audio at Bob", 500);
  const counters = await AudioCounters.of(gateway);
  expect((await counters.read(bob.nickname)).egressDroppedFrames).toBe(0);

  // The native element plays it, and the speaker controls reach it.
  expect(await webRtcElement(bob.page)).toMatchObject({ volume: 1, paused: false, muted: false });
  await dock(bob.page).getByRole("button", { name: "Mute all audio" }).click();
  await poll(() => webRtcElement(bob.page), (element) => element?.volume === 0, { message: "the WebRTC element to be silent" });
  const whileMuted = (await inboundAudio(bob.page))!.packetsReceived;
  await poll(() => inboundAudio(bob.page), (stats) => (stats?.packetsReceived ?? 0) >= whileMuted + 25, { message: "packets to keep arriving while muted" });
  await dock(bob.page).getByRole("button", { name: "Restore audio" }).click();
  await poll(() => webRtcElement(bob.page), (element) => element?.volume === 1, { message: "the WebRTC element to be audible again" });
  expect(alice.session.pageErrors).toEqual([]);
  expect(bob.session.pageErrors).toEqual([]);
});

test("a browser without RTCPeerConnection falls back to the WebSocket even when the gateway offers WebRTC", async ({ person, ownGateway }) => {
  const gateway = await ownGateway({ webRtc: true });
  const alice = await person(0, "pcm-alice", { gateway });
  const bob = await person(1, "pcm-bob", { gateway });
  await installProbes(bob.page, { withoutWebRtc: true });
  await alice.join();
  await bob.join();

  // Alice keeps WebRTC, so the gateway bridges her voice to Bob's WebSocket, and Bob's uplink is PCM.
  await bob.session.waitForBinary(50, "received");
  await bob.session.waitForBinary(25, "sent");
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeVisible();
  expect(await webRtcElement(bob.page)).toBeNull();
  expect(await bob.page.evaluate(() => typeof RTCPeerConnection)).toBe("undefined");
  const counters = await AudioCounters.of(gateway);
  const down = await counters.until(bob.nickname, (audio) => audio.tsReceiveFrames >= 25 && audio.egressFrames >= 25);
  expect(down.egressDroppedFrames).toBe(0);
  expect(bob.session.pageErrors).toEqual([]);
});
