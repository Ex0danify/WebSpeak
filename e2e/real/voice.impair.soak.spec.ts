import { withAudioTone } from "../helpers";
import { createUdpImpairmentProxy } from "../../test/support/udpImpairmentProxy.js";
import { AudioCounters } from "./counters";
import { expect, test } from "./fixtures";
import { realServerFromEnv } from "./server";

// Voice over a lossy link to the server: a UDP proxy in front of the disposable container drops,
// duplicates, reorders and delays datagrams, and the connection must stay up and keep delivering.
// Opt-in and never against a shared server (see the plan's test-server note).
//   WEBSPEAK_TEST_SOAK=1 WEBSPEAK_TEST_TS_LICENSE=accept npm run test:real -- voice.impair.soak
// WEBSPEAK_TEST_SOAK_MS raises the default minute, e.g. 1800000 for the half-hour soak.
test.use(withAudioTone({ frequencyHz: 1000 }));
test.skip(process.env.WEBSPEAK_TEST_SOAK !== "1", "the impairment soak runs only with WEBSPEAK_TEST_SOAK=1");

const SOAK_MS = Number(process.env.WEBSPEAK_TEST_SOAK_MS ?? 60_000);
/** One frame is 20 ms. Loss is not resent for voice, so well under the theoretical count is fine. */
const MIN_FRAMES = Math.floor((SOAK_MS / 20) * 0.6);
const MAX_HEAP_GROWTH_BYTES = 96 * 1024 * 1024;

const IMPAIRMENT = { drop: 0.03, duplicate: 0.01, reorder: 0.05, reorderMs: 60, delayMs: 10 };

test("voice survives a lossy link and the gateway's memory stays flat", async ({ person, ownGateway }) => {
  test.setTimeout(SOAK_MS + 120_000);
  const server = realServerFromEnv();
  const proxy = await createUdpImpairmentProxy({ target: { host: server.host, port: server.voicePort }, impairment: IMPAIRMENT });
  try {
    const impaired = await ownGateway({ target: `${proxy.host}:${proxy.port}` });
    const alice = await person(0, "impair-alice", { gateway: impaired });
    const bob = await person(1, "impair-bob", { gateway: impaired });
    await alice.join();
    await bob.join();
    const counters = await AudioCounters.of(impaired);
    await bob.session.waitForBinary(50, "received");
    const heapAtStart = process.memoryUsage().heapUsed;
    const startedAt = Date.now();

    await counters.until(alice.nickname, (audio) => audio.ingressFrames >= MIN_FRAMES, { timeoutMs: SOAK_MS + 60_000 });
    await counters.until(bob.nickname, (audio) => audio.egressFrames >= MIN_FRAMES, { timeoutMs: SOAK_MS + 60_000 });
    expect(Date.now() - startedAt, "the frames came faster than real time").toBeGreaterThan(SOAK_MS * 0.6);

    // The impairment was real, not a no-op proxy, and the transport still never lost a send.
    expect(proxy.stats.dropped, "the proxy dropped datagrams").toBeGreaterThan(0);
    for (const nickname of [alice.nickname, bob.nickname]) {
      expect((await counters.read(nickname)).tsSendErrors, `${nickname}: send errors`).toBe(0);
    }
    expect(process.memoryUsage().heapUsed - heapAtStart).toBeLessThan(MAX_HEAP_GROWTH_BYTES);
  } finally {
    await proxy.close();
  }
});
