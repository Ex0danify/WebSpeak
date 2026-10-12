/**
 * WebRTC hot-path benchmark, counterpart of bench-voice-frames.ts. A werift peer plays the browser, negotiates
 * through the real gateway (webrtcOffer over the voice WebSocket) and then talks real UDP on loopback.
 *   - uplink:   sends N Opus RTP packets, the gateway forwards them to the fake TeamSpeak client
 *   - downlink: S fake members each speak one Opus frame per 20 ms, the mixer paces them into one RTP stream
 * The downlink is clock-bound, so read delivered vs expected packets, the largest and p99 gap, event-loop delay
 * and CPU (the peer runs in-process, so CPU includes it), not frames/s.
 *
 *   npx tsx scripts/bench-webrtc-frames.ts [--frames 5000] [--seconds 10] [--speakers 1] [--runs 1]
 *
 * Not run by npm test or CI. Needs free UDP ports 40000-40099 on loopback.
 */
import { createRequire } from "node:module";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket } from "werift";
import { sineFrames } from "../test/support/audio.js";
import { startGateway } from "../test/support/gateway.js";
import { joinVoice } from "../test/support/voice.js";

const require = createRequire(import.meta.url);
const { OpusEncoder } = require("@discordjs/opus") as {
  OpusEncoder: new (rate: number, channels: number) => { encode(pcm: Buffer): Buffer };
};

const BATCH = 25;
const FRAME_MS = 20;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} needs a positive integer`);
  return value;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : 0);

interface Result {
  uplinkFps: number;
  uplinkDelivered: number;
  uplinkSent: number;
  downReceived: number;
  downExpected: number;
  downMaxGapMs: number;
  downP99GapMs: number;
  loopP99Ms: number;
  cpuPercent: number;
}

async function runOnce(frames: number, seconds: number, speakers: number): Promise<Result> {
  const gateway = await startGateway({ voiceBridgeOptions: { webRtc: () => ({ enabled: true, udpPortRange: [40000, 40099] }) } as never });
  const peer = new RTCPeerConnection({ iceServers: [], iceUseIpv4: true, iceUseIpv6: false, iceUseTcp: false });
  try {
    const members = Array.from({ length: speakers }, (_, i) => gateway.ts.addMember(`speaker${i}`));
    const alice = await joinVoice(gateway, { nickname: "alice" });

    // Browser side: one sendrecv audio transceiver, like useWebRtcTransport.
    const uplinkTrack = new MediaStreamTrack({ kind: "audio" });
    const transceiver = peer.addTransceiver(uplinkTrack, { direction: "sendrecv" });
    const arrivals: number[] = [];
    transceiver.onTrack.subscribe((track) => track.onReceiveRtp.subscribe(() => arrivals.push(performance.now())));
    await peer.setLocalDescription(await peer.createOffer());
    const offer = peer.localDescription!;
    const payloadType = Number(/^a=rtpmap:(\d+)\s+opus\/48000/im.exec(offer.sdp)?.[1] ?? 111);
    alice.socket.send({
      type: "webrtcOffer",
      payload: { sdp: { type: offer.type, sdp: offer.sdp }, muted: false, accompanimentActive: false },
    });
    const answer = await alice.socket.waitForMessage((m) => m.type === "webrtcAnswer" || m.type === "webrtcError", { timeoutMs: 15_000 });
    if (answer.type === "webrtcError") throw new Error(`gateway refused the offer: ${JSON.stringify(answer)}`);
    await peer.setRemoteDescription((answer.payload as { sdp: { type: "answer"; sdp: string } }).sdp);
    const connectDeadline = performance.now() + 15_000;
    while (peer.connectionState !== "connected") {
      if (performance.now() > connectDeadline) throw new Error(`peer stuck in ${peer.connectionState}`);
      await sleep(20);
    }

    const encoder = new OpusEncoder(48_000, 1);
    const opus = sineFrames(440, 50).map((pcm) => encoder.encode(pcm));

    // Uplink: Opus RTP in, sendVoice out. UDP may drop under a burst, so report delivered vs sent.
    let sequenceNumber = 0;
    let timestamp = 0;
    const sentVoice = alice.client.sentVoice;
    const upStart = performance.now();
    for (let sent = 0; sent < frames; sent += BATCH) {
      for (let i = 0; i < BATCH && sent + i < frames; i++) {
        uplinkTrack.writeRtp(
          new RtpPacket(
            new RtpHeader({ payloadType, sequenceNumber: sequenceNumber++ & 0xffff, timestamp, ssrc: 1234, marker: true }),
            opus[(sent + i) % opus.length]!,
          ),
        );
        timestamp = (timestamp + 960) >>> 0;
      }
      await sleep(1);
    }
    const quietDeadline = performance.now() + 2_000;
    let last = -1;
    while (performance.now() < quietDeadline) {
      await tick();
      if (sentVoice.length !== last) {
        last = sentVoice.length;
        await sleep(50);
      } else break;
    }
    const upMs = performance.now() - upStart;
    const uplinkDelivered = sentVoice.length;

    // Downlink: real-time cadence, one frame per member per 20 ms. Only the speaking window is counted,
    // after it the pacer keeps sending silence.
    arrivals.length = 0;
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    const cpuStart = process.cpuUsage();
    const downStart = performance.now();
    const totalTicks = Math.floor((seconds * 1000) / FRAME_MS);
    for (let n = 0; n < totalTicks; n++) {
      for (const member of members) member.speak(opus[n % opus.length]!, 4);
      const wait = downStart + (n + 1) * FRAME_MS - performance.now();
      if (wait > 0) await sleep(wait);
    }
    const downMs = performance.now() - downStart;
    const received = arrivals.length;
    loop.disable();
    const cpu = process.cpuUsage(cpuStart);
    const gaps = arrivals
      .slice(0, received)
      .slice(1)
      .map((time, i) => time - arrivals[i]!)
      .sort((a, b) => a - b);
    return {
      uplinkFps: (uplinkDelivered / upMs) * 1000,
      uplinkDelivered,
      uplinkSent: frames,
      downReceived: received,
      downExpected: totalTicks,
      downMaxGapMs: gaps.at(-1) ?? 0,
      downP99GapMs: pct(gaps, 0.99),
      loopP99Ms: loop.percentile(99) / 1e6,
      cpuPercent: ((cpu.user + cpu.system) / 1000 / downMs) * 100,
    };
  } finally {
    await peer.close().catch(() => undefined);
    await gateway.close();
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const frames = arg("frames", 5000);
const seconds = arg("seconds", 10);
const speakers = arg("speakers", 1);
const runs = arg("runs", 1);
const results: Result[] = [];
for (let run = 1; run <= runs; run++) {
  const r = await runOnce(frames, seconds, speakers);
  results.push(r);
  console.log(
    `run ${run}/${runs}  uplink ${r.uplinkDelivered}/${r.uplinkSent} delivered (${r.uplinkFps.toFixed(0)} frames/s)  ` +
      `downlink ${r.downReceived}/${r.downExpected} packets, gap max ${r.downMaxGapMs.toFixed(1)} ms p99 ${r.downP99GapMs.toFixed(1)} ms  ` +
      `${speakers} speaker(s)  loop p99 ${r.loopP99Ms.toFixed(1)} ms  cpu ${r.cpuPercent.toFixed(1)} %`,
  );
}
if (runs > 1) {
  console.log(
    `median of ${runs}  uplink ${median(results.map((r) => r.uplinkFps)).toFixed(0)} frames/s  downlink gap p99 ${median(results.map((r) => r.downP99GapMs)).toFixed(1)} ms  cpu ${median(results.map((r) => r.cpuPercent)).toFixed(1)} %`,
  );
}
process.exit(0);
