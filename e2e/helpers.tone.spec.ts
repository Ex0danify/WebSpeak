import { decodeOpus, powerAt } from "../test/helpers/audio";
import { join, poll, withAudioTone } from "./helpers";
import { expect, test } from "./fixtures";

// Launch options force a new worker, so they are set for the whole file.
test.use(withAudioTone({ frequencyHz: 1000 }));

test("the microphone plays the tone: PCM goes up, and Opus that decodes to 1000 Hz reaches TeamSpeak", async ({ page, session, gateway }) => {
  await join(page, "helper-tone");
  await session.waitForBinary(10, "sent");
  const packets = await poll(
    () => gateway.ts.created.flatMap((client) => client.sentVoice.map((voice) => voice.data)),
    (voice) => voice.length >= 25,
    { message: "25 voice packets at the fake server" },
  );
  const samples = decodeOpus(packets.slice(0, 25));
  // Chromium's own fake beep sits near 440 Hz, so strong 1000 Hz against 440 Hz shows the file is the source.
  expect(powerAt(samples, 1000)).toBeGreaterThan(powerAt(samples, 440) * 20);
  expect(session.pageErrors).toEqual([]);
});
