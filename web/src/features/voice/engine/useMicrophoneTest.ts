import { storeToRefs } from "pinia";
import { useVoiceAudioStore } from "../stores/voiceAudioStore";
import { useSessionStore } from "@/features/session";

/** What the microphone test needs from the microphone itself (late-bound: the microphone owns the stream). */
export interface MicrophoneTestMic {
  prepareInputDevices(): Promise<void>;
  getMicStream(): MediaStream | null;
  stopMicrophone(): void;
}

/** The five-second record-and-play-back test of the audio settings. The recorder and its timer are
 *  closure state; only the flag and the recording URL are in the audio store. */
export function useMicrophoneTest(mic: MicrophoneTestMic) {
  const { state } = useSessionStore();
  const { microphoneTestActive, testAudioUrl } = storeToRefs(useVoiceAudioStore());

  let testRecorder: MediaRecorder | null = null;
  let testRecorderTimer: ReturnType<typeof setTimeout> | null = null;

  async function startMicrophoneTest(): Promise<void> {
    microphoneTestActive.value = true;
    if (testAudioUrl.value) {
      URL.revokeObjectURL(testAudioUrl.value);
      testAudioUrl.value = "";
    }
    try {
      await mic.prepareInputDevices();
      const micStream = mic.getMicStream();
      if (typeof MediaRecorder !== "undefined" && micStream) {
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(micStream);
        testRecorder = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (chunks.length) {
            testAudioUrl.value = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          }
          if (testRecorder === recorder) testRecorder = null;
        };
        recorder.start();
        testRecorderTimer = setTimeout(() => stopMicrophoneTest(), 5_000);
      }
    } catch (error) {
      microphoneTestActive.value = false;
      throw error;
    }
  }

  function stopMicrophoneTest(): void {
    microphoneTestActive.value = false;
    if (testRecorderTimer) clearTimeout(testRecorderTimer);
    testRecorderTimer = null;
    if (testRecorder && testRecorder.state !== "inactive") testRecorder.stop();
    if (!state.connected) mic.stopMicrophone();
  }

  return { startMicrophoneTest, stopMicrophoneTest };
}
