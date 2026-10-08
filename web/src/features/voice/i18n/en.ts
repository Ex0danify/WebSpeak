export const en = {
  // Browser support checks (useMicrophone.checkSupport)
  voiceNeedsHttps: "Voice requires a secure HTTPS connection",
  microphoneUnsupported: "This browser does not support microphone access",
  webAudioUnsupported: "This browser does not support Web Audio processing",
  audioDecodingUnsupported: "Audio decoding is unavailable. Use the latest Chrome or Edge",
  // Microphone failures, one sentence per reason (voiceErrors.microphoneFailureKey)
  micFailedPermission: "Microphone access failed: the browser has not granted microphone permission",
  micFailedBlocked: "Microphone access failed: the browser blocked microphone access",
  micFailedNotFound: "Microphone access failed: no usable microphone was found",
  micFailedUnavailable: "Microphone access failed: the selected microphone is not available",
  micFailedBusy: "Microphone access failed: the microphone may be in use by another program",
  micFailedAborted: "Microphone access failed: the microphone start was interrupted, try again",
  micFailedParameters: "Microphone access failed: the system rejected the microphone parameters",
  micFailedGeneric: "Microphone access failed: the microphone is unavailable, check the browser permissions and audio devices",
  micFailedCheckPermissions: "Microphone access failed: check the browser permissions",
  micSwitchFailed: "Microphone access failed: the microphone could not be switched",
  // Speaker selection failures (useAudioOutput)
  speakerSelectionUnsupported: "Output device selection is not supported by this browser. Using the default output device",
  speakerUnavailable: "The selected speaker is not available",
  speakerSwitchFailed: "The speaker could not be switched",
  // Audio notices (useAudioOutput.setAudioNotice)
  audioNoticeWebrtcFallback: "WebRTC realtime voice is unavailable (error code: {{code}}). Compatibility transport is active; latency and audio quality may be lower",
  audioNoticePlaybackBlocked: "The browser blocked automatic audio playback. Click the page or allow audio playback for this site",
  audioNoticeDeviceList: "Audio devices could not be listed. The browser default devices will be used",
  audioNoticeContextSuspended: "Browser audio processing is paused. Click the page once to resume microphone and speaker audio",
  audioNoticeEncoder: "Microphone audio could not be encoded (error code: {{code}}). Other members may not hear you",
  audioNoticeLink: "Audio link error (error code: {{code}}). Your microphone audio may not be reaching other members",
  audioNoticeLinkDetail: "Audio link error (error code: {{code}}): {{detail}}. Your microphone audio may not be reaching other members",
} satisfies Record<string, string>;
