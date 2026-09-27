import { withAudioTone } from "../helpers";
import { AudioCounters } from "./counters";
import { expect, test } from "./fixtures";

// The 60 s soak of step 5.4: a steady tone for a minute, and the gateway's counters must show no
// dropped frame, no send error and no long gap. Opt-in (nightly, or by hand), because it takes a
// minute: WEBSPEAK_TEST_SOAK=1 WEBSPEAK_TEST_TS_LICENSE=accept npm run test:real -- voice.soak
test.use(withAudioTone({ frequencyHz: 1000 }));
test.skip(process.env.WEBSPEAK_TEST_SOAK !== "1", "the 60 s soak runs only with WEBSPEAK_TEST_SOAK=1");

const SOAK_MS = 60_000;
/** One frame is 20 ms, so a minute is 3000. A tenth of them may be missing: the start is not instant. */
const MIN_FRAMES = 2700;
/** The longest silence between two frames of a steady tone. Timers jitter, but half a second is a stall. */
const MAX_GAP_MS = 500;
/** Coarse: the gateway shares this process with the test, and nothing here forces a collection. */
const MAX_HEAP_GROWTH_BYTES = 96 * 1024 * 1024;

test("a minute of voice drops no frame and stalls nowhere, and the gateway's memory stays flat", async ({ person, gateway }) => {
  test.setTimeout(SOAK_MS + 60_000);
  const alice = await person(0, "soak-alice");
  const bob = await person(1, "soak-bob");
  await alice.join();
  await bob.join();
  const counters = await AudioCounters.of(gateway);
  await bob.session.waitForBinary(50, "received");
  const heapAtStart = process.memoryUsage().heapUsed;
  const startedAt = Date.now();

  // Not a sleep before an assertion: the minute is the thing under test, and the frames it made are counted.
  await counters.until(alice.nickname, (audio) => audio.ingressFrames >= MIN_FRAMES, { timeoutMs: SOAK_MS + 30_000 });
  await counters.until(bob.nickname, (audio) => audio.egressFrames >= MIN_FRAMES, { timeoutMs: SOAK_MS + 30_000 });
  expect(Date.now() - startedAt, "the frames came faster than real time").toBeGreaterThan(SOAK_MS * 0.8);

  for (const nickname of [alice.nickname, bob.nickname]) {
    const audio = await counters.read(nickname);
    expect(audio.ingressDroppedFrames, `${nickname}: ingress drops`).toBe(0);
    expect(audio.egressDroppedFrames, `${nickname}: egress drops`).toBe(0);
    expect(audio.tsSendErrors, `${nickname}: send errors`).toBe(0);
    expect(audio.ingressMaxGapMs, `${nickname}: longest ingress gap`).toBeLessThan(MAX_GAP_MS);
    expect(audio.egressMaxGapMs, `${nickname}: longest egress gap`).toBeLessThan(MAX_GAP_MS);
  }
  expect(process.memoryUsage().heapUsed - heapAtStart).toBeLessThan(MAX_HEAP_GROWTH_BYTES);
});
