/**
 * Voice hot-path benchmark.
 *
 * Opens one session on a real gateway with a fake TeamSpeak server, pushes N 1,920-byte PCM
 * frames up (browser -> gateway -> Opus -> TeamSpeak) and has the fake server push N Opus
 * packets down (TeamSpeak -> gateway -> browser). Prints frames/s and ms/frame per direction.
 *
 *   npx tsx scripts/bench-voice-frames.ts [--frames 20000] [--runs 1]
 *
 * Not run by `npm test`, not part of CI. With --runs > 1 it also prints the median.
 */
import { performance } from "node:perf_hooks";
import { FRAME_BYTES, sineFrames } from "../test/support/audio.js";
import { startGateway } from "../test/support/gateway.js";
import { joinVoice } from "../test/support/voice.js";

const BATCH = 50;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} needs a positive integer`);
  return value;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Result {
  uplinkFps: number;
  downlinkFps: number;
}

async function runOnce(frames: number): Promise<Result> {
  const gateway = await startGateway();
  try {
    const bob = gateway.ts.addMember("bob");
    const alice = await joinVoice(gateway, { nickname: "alice" });
    const pcm = sineFrames(440, 50).map((frame) => {
      if (frame.length !== FRAME_BYTES) throw new Error("bad frame");
      return frame;
    });

    // Uplink: wait for the fake client to have received every encoded frame.
    const sent = alice.client.sentVoice;
    const upStart = performance.now();
    for (let sentFrames = 0; sentFrames < frames; sentFrames += BATCH) {
      for (let i = 0; i < BATCH && sentFrames + i < frames; i++) alice.socket.sendRaw(pcm[(sentFrames + i) % pcm.length]!);
      while (sent.length < Math.min(sentFrames + BATCH, frames)) await tick();
    }
    const upMs = performance.now() - upStart;

    // Downlink: Opus packets from bob; batches stay below the egress byte guard so none are dropped.
    const packet = sent[0]!.data;
    const after = alice.socket.mark();
    const downStart = performance.now();
    for (let done = 0; done < frames; done += BATCH) {
      const target = Math.min(done + BATCH, frames);
      for (let i = done; i < target; i++) bob.speak(packet, 4);
      // frames.length, not waitForBinaryCount: that helper rescans every frame and would dominate the timing.
      const deadline = performance.now() + 30_000;
      while (alice.socket.frames.length - after < target) {
        if (performance.now() > deadline) throw new Error(`downlink stalled at ${alice.socket.frames.length - after}/${target} frames`);
        await tick();
      }
    }
    const downMs = performance.now() - downStart;
    return { uplinkFps: (frames / upMs) * 1000, downlinkFps: (frames / downMs) * 1000 };
  } finally {
    await gateway.close();
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const frames = arg("frames", 20_000);
const runs = arg("runs", 1);
const results: Result[] = [];
for (let run = 1; run <= runs; run++) {
  const result = await runOnce(frames);
  results.push(result);
  console.log(
    `run ${run}/${runs}  uplink ${result.uplinkFps.toFixed(0)} frames/s (${(1000 / result.uplinkFps).toFixed(4)} ms/frame)  downlink ${result.downlinkFps.toFixed(0)} frames/s (${(1000 / result.downlinkFps).toFixed(4)} ms/frame)`,
  );
}
if (runs > 1) {
  const up = median(results.map((r) => r.uplinkFps));
  const down = median(results.map((r) => r.downlinkFps));
  console.log(`median of ${runs}  uplink ${up.toFixed(0)} frames/s  downlink ${down.toFixed(0)} frames/s`);
}
process.exit(0);
