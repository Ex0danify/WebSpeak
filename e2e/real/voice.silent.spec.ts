import { memberRow, withAudioTone } from "../helpers";
import { AudioCounters } from "./counters";
import { expect, test } from "./fixtures";

// The control of voice.spec.ts: the same two clients and the same steps, but the fake microphones
// play silence (amplitude 0), so the voice-activity gate must stay shut. Launch options are set for
// the whole file, so this cannot share a file with the tone.
test.use(withAudioTone({ amplitude: 0 }));

// A quiet window has to be long enough that a leaking gate would show: 1.5 s is about 75 frames.
const QUIET_WINDOW_MS = 1500;

test("a silent microphone sends nothing, and nobody is shown as speaking", async ({ person, gateway }) => {
  const alice = await person(0, "silent-alice");
  const bob = await person(1, "silent-bob");
  await alice.join();
  await bob.join();
  const counters = await AudioCounters.of(gateway);

  await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS)); // the observation window
  expect(alice.session.binarySent).toBe(0);
  expect(bob.session.binaryReceived).toBe(0);
  const up = await counters.read(alice.nickname);
  expect(up.ingressFrames).toBe(0);
  expect(up.tsSendFrames).toBe(0);
  const down = await counters.read(bob.nickname);
  expect(down.tsReceiveFrames).toBe(0);
  expect(down.egressFrames).toBe(0);
  await expect(memberRow(bob.page, alice.nickname).getByText("Online")).toBeVisible();
  await expect(memberRow(bob.page, alice.nickname).getByText("Speaking…")).toBeHidden();
});
