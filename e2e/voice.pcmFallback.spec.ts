import { decodeOpus, powerAt } from "../test/support/audio";
import { join, poll, withAudioTone } from "./helpers";
import { expect, test } from "./fixtures";

// Launch options force a new worker, so they are set for the whole file.
test.use(withAudioTone({ frequencyHz: 1000 }));

test("a browser without WebCodecs Opus sends PCM, and the gateway encodes it to the tone on TeamSpeak", async ({
  page,
  session,
  gateway,
}) => {
  // Firefox < 130 and Safari < 26 have no Opus AudioEncoder; the uplink must fall back to tagged PCM.
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioEncoder", { configurable: true, value: undefined });
  });

  await join(page, "pcm-fallback");
  await session.waitForBinary(10, "sent");

  const packets = await poll(
    () => gateway.ts.created.flatMap((client) => client.sentVoice.map((voice) => voice.data)),
    (voice) => voice.length >= 25,
    { message: "25 voice packets at the fake server" },
  );

  // Every uplink frame went up as PCM (tag 0), never browser-encoded Opus (tag 4).
  expect(session.sentBinaryTags.length).toBeGreaterThan(0);
  expect(session.sentBinaryTags.every((tag) => tag === 0)).toBe(true);

  // The gateway encoded that PCM to Opus: the packets still decode to the 1000 Hz tone, not Chromium's 440 Hz beep.
  const samples = decodeOpus(packets.slice(0, 25));
  expect(powerAt(samples, 1000)).toBeGreaterThan(powerAt(samples, 440) * 20);
  expect(session.pageErrors).toEqual([]);
});
