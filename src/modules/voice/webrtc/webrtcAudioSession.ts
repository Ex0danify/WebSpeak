import { randomInt } from "node:crypto";
import {
  MediaStreamTrack,
  RtpHeader,
  RtpPacket,
  RTCPeerConnection,
} from "werift";
import type { Logger as LoggerType } from "../../../shared/logger.js";
import type { TSVoiceData } from "../../teamspeak/index.js";
import { OpusEncoder } from "../voiceOpus.js";
import {
  AUDIO_CLOCK_INTERVAL_MS,
  AUDIO_FRAME_SAMPLES,
  AUDIO_SAMPLE_RATE,
  MAX_MIXER_PACER_LAG_MS,
  WebRtcMixer,
} from "./webrtcMixer.js";
import { WEBRTC_UDP_PORT_RANGE, type WebRtcAudioOptions } from "../../../config/webrtcConfig.js";

const DEFAULT_WEBRTC_OPUS_PAYLOAD_TYPE = 111;
const SPEAKER_ACTIVITY_INTERVAL_MS = 100;

export interface WebRtcSessionDescription {
  type: "offer" | "answer";
  sdp: string;
  muted?: boolean;
  accompanimentActive?: boolean;
}

export interface WebRtcAudioSessionOptions {
  connectionId: string;
  publicHost?: string;
  udpPortRange?: [number, number];
  logger: LoggerType;
  microphoneMuted?: boolean;
  accompanimentActive?: boolean;
  onVoiceFrame: (data: Buffer, codec: 4 | 5) => void;
  onVoiceActivity: (clientIds: number[]) => void;
}

export interface WebRtcAudioStats {
  webrtcIngressRtpFrames: number;
  webrtcIngressRtpFirstAt: number | null;
  webrtcIngressRtpLastAt: number | null;
  webrtcIngressRtpMaxGapMs: number;
  webrtcEgressRtpFrames: number;
  webrtcEgressRtpFirstAt: number | null;
  webrtcEgressRtpLastAt: number | null;
  webrtcEgressRtpMaxGapMs: number;
  webrtcQueuePeakFrames: number;
  webrtcQueueDroppedFrames: number;
  webrtcQueueUnderrunTicks: number;
  webrtcPacerLateTicks: number;
  webrtcQueueCurrentFrames: number;
  webrtcIngressQuietFrames: number;
  webrtcIngressDecodeErrors: number;
  webrtcDownlinkDecodedFrames: number;
  webrtcDownlinkDecodeErrors: number;
  webrtcDownlinkShortFrames: number;
}

/**
 * One low-latency WebRTC audio session for one browser connection.
 *
 * TeamSpeak provides one Opus payload per speaker. WebRTC has one negotiated
 * audio track in this first transport, so this class mixes one 20 ms frame
 * from each active speaker and packetizes the result as RTP. Each speaker has
 * a very small bounded queue so bursts from the TeamSpeak adapter can be
 * smoothed without turning into an ever-growing playback delay.
 */
export class WebRtcAudioSession {
  readonly peer: RTCPeerConnection;
  private readonly logger: LoggerType;
  private readonly onVoiceFrame: (data: Buffer, codec: 4 | 5) => void;
  private readonly onVoiceActivity: (clientIds: number[]) => void;
  private readonly outgoingTrack: MediaStreamTrack;
  private readonly opusPayloadTypes = new Set<number>();
  private audioTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly activityTimer: ReturnType<typeof setInterval>;
  private readonly mixer: WebRtcMixer;
  private sequenceNumber = randomInt(0, 65_536);
  private timestamp = randomInt(0, 0x1_0000_0000) >>> 0;
  private readonly ssrc = randomInt(1, 0x1_0000_0000) >>> 0;
  private outgoingPayloadType = DEFAULT_WEBRTC_OPUS_PAYLOAD_TYPE;
  private closed = false;
  private nextAudioDeadline = 0;
  private lastIngressRtpAt: number | null = null;
  private lastEgressRtpAt: number | null = null;
  private microphoneMuted: boolean;
  private accompanimentActive: boolean;
  private readonly stats: WebRtcAudioStats = {
    webrtcIngressRtpFrames: 0,
    webrtcIngressRtpFirstAt: null,
    webrtcIngressRtpLastAt: null,
    webrtcIngressRtpMaxGapMs: 0,
    webrtcEgressRtpFrames: 0,
    webrtcEgressRtpFirstAt: null,
    webrtcEgressRtpLastAt: null,
    webrtcEgressRtpMaxGapMs: 0,
    webrtcQueuePeakFrames: 0,
    webrtcQueueDroppedFrames: 0,
    webrtcQueueUnderrunTicks: 0,
    webrtcPacerLateTicks: 0,
    webrtcQueueCurrentFrames: 0,
    webrtcIngressQuietFrames: 0,
    webrtcIngressDecodeErrors: 0,
    webrtcDownlinkDecodedFrames: 0,
    webrtcDownlinkDecodeErrors: 0,
    webrtcDownlinkShortFrames: 0,
  };

  constructor(options: WebRtcAudioSessionOptions) {
    this.logger = options.logger.child({ component: "webrtc-audio", connectionId: options.connectionId });
    this.onVoiceFrame = options.onVoiceFrame;
    this.onVoiceActivity = options.onVoiceActivity;
    this.microphoneMuted = options.microphoneMuted === true;
    this.accompanimentActive = options.accompanimentActive === true;
    this.outgoingTrack = new MediaStreamTrack({ kind: "audio" });

    const iceAdditionalHostAddresses = options.publicHost ? [options.publicHost] : undefined;
    const udpPortRange = options.udpPortRange ?? WEBRTC_UDP_PORT_RANGE;
    this.peer = new RTCPeerConnection({
      iceServers: [],
      iceUseIpv4: true,
      iceUseIpv6: false,
      iceUseTcp: false,
      icePortRange: [...udpPortRange] as [number, number],
      ...(iceAdditionalHostAddresses ? { iceAdditionalHostAddresses } : {}),
    });

    const audio = this.peer.addTransceiver("audio", { direction: "sendrecv" });
    audio.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        if (this.closed) return;
        const receivedAt = performance.now();
        if (this.lastIngressRtpAt !== null) this.stats.webrtcIngressRtpMaxGapMs = Math.max(this.stats.webrtcIngressRtpMaxGapMs, Math.round(receivedAt - this.lastIngressRtpAt));
        this.lastIngressRtpAt = receivedAt;
        this.stats.webrtcIngressRtpFirstAt ??= Date.now();
        this.stats.webrtcIngressRtpLastAt = Date.now();
        this.stats.webrtcIngressRtpFrames++;
        if (!this.opusPayloadTypes.has(rtp.header.payloadType)) return;
        const payload = Buffer.from(rtp.payload);
        // A muted microphone must stop the browser user's TeamSpeak voice
        // packets at the gateway. Browser-side track.enabled/gain changes
        // still produce RTP comfort-silence on some browsers, and forwarding
        // those packets makes TeamSpeak keep the user in the speaking state.
        // When accompaniment is active, keep forwarding the mixed track: the
        // browser has already removed only the microphone component.
        if (this.microphoneMuted && !this.accompanimentActive) return;
        // Forward every valid negotiated Opus payload unchanged. Do not
        // decode it for RMS analysis or pass it through a speech/silence gate:
        // quiet frames are still part of the codec timeline and dropping them
        // can cause downstream gaps, clicks, or decoder recovery artifacts.
        this.onVoiceFrame(payload, this.accompanimentActive ? 5 : 4);
      });
      void audio.sender.replaceTrack(this.outgoingTrack).catch((error: unknown) => {
        this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not attach WebRTC output track");
      });
    });
    void audio.sender.replaceTrack(this.outgoingTrack).catch((error: unknown) => {
      this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not prepare WebRTC output track");
    });

    let encoder: { encode(data: Buffer): Buffer };
    try {
      encoder = new OpusEncoder(AUDIO_SAMPLE_RATE, 1);
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Could not create WebRTC mixer encoder");
      this.outgoingTrack.stop();
      throw new Error("WebRTC Opus codec is unavailable");
    }
    this.mixer = new WebRtcMixer(encoder, this.stats, this.logger);

    this.nextAudioDeadline = performance.now();
    this.scheduleAudioTick();
    this.activityTimer = setInterval(() => this.flushSpeakerActivity(), SPEAKER_ACTIVITY_INTERVAL_MS);
    this.activityTimer.unref?.();
    this.peer.onconnectionstatechange = () => {
      this.logger.info({ state: this.peer.connectionState }, "WebRTC connection state changed");
    };
  }

  getStats(): WebRtcAudioStats {
    return { ...this.stats, webrtcQueueCurrentFrames: this.mixer.getQueueFrameCount() };
  }

  async createAnswer(offer: WebRtcSessionDescription): Promise<WebRtcSessionDescription> {
    if (this.closed) throw new Error("WebRTC session is closed");
    this.setOpusPayloadTypes(offer.sdp);
    await this.peer.setRemoteDescription(offer);
    const transceiver = this.peer.getTransceivers().find((candidate) => candidate.kind === "audio");
    if (transceiver) await transceiver.sender.replaceTrack(this.outgoingTrack);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    const description = this.peer.localDescription;
    if (!description) throw new Error("WebRTC answer was not created");
    if (description.type !== "answer" && description.type !== "offer") throw new Error("Unexpected WebRTC answer type");
    return { type: description.type, sdp: description.sdp };
  }

  pushTeamSpeakVoice(data: TSVoiceData): void {
    if (this.closed || (data.codec !== 4 && data.codec !== 5)) return;
    this.mixer.pushTeamSpeakVoice(data);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.audioTimer) clearTimeout(this.audioTimer);
    this.audioTimer = null;
    clearInterval(this.activityTimer);
    this.mixer.close();
    this.outgoingTrack.stop();
    await this.peer.close();
  }

  private scheduleAudioTick(): void {
    if (this.closed) return;
    const delay = Math.max(0, this.nextAudioDeadline - performance.now());
    this.audioTimer = setTimeout(() => this.flushAudio(), delay);
    this.audioTimer.unref?.();
  }

  private flushAudio(): void {
    if (this.closed) return;
    const now = performance.now();
    if (now > this.nextAudioDeadline + MAX_MIXER_PACER_LAG_MS) {
      this.stats.webrtcPacerLateTicks++;
      this.nextAudioDeadline = now;
      this.mixer.trimQueuesAfterLateTick();
    }
    this.nextAudioDeadline += AUDIO_CLOCK_INTERVAL_MS;
    this.audioTimer = null;
    const packet = this.mixer.mixNextFrame();
    if (packet) this.sendRtpAudio(packet);
    this.scheduleAudioTick();
  }

  private sendRtpAudio(encoded: Buffer): void {
    const packet = new RtpPacket(new RtpHeader({
      payloadType: this.outgoingPayloadType,
      sequenceNumber: this.sequenceNumber,
      timestamp: this.timestamp,
      ssrc: this.ssrc,
      marker: true,
    }), encoded);
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
    this.timestamp = (this.timestamp + AUDIO_FRAME_SAMPLES) >>> 0;
    this.outgoingTrack.writeRtp(packet);
    const sentAt = performance.now();
    if (this.lastEgressRtpAt !== null) this.stats.webrtcEgressRtpMaxGapMs = Math.max(this.stats.webrtcEgressRtpMaxGapMs, Math.round(sentAt - this.lastEgressRtpAt));
    this.lastEgressRtpAt = sentAt;
    this.stats.webrtcEgressRtpFirstAt ??= Date.now();
    this.stats.webrtcEgressRtpLastAt = Date.now();
    this.stats.webrtcEgressRtpFrames++;
  }

  private flushSpeakerActivity(): void {
    if (this.closed) return;
    const ids = this.mixer.takeActiveSpeakers();
    if (ids.length) this.onVoiceActivity(ids);
  }

  setMicrophoneMuted(muted: boolean): void {
    this.microphoneMuted = muted;
  }

  setAccompanimentActive(active: boolean): void {
    this.accompanimentActive = active;
  }

  setMemberVolume(clientId: number, volume: number): void {
    this.mixer.setMemberVolume(clientId, volume);
  }

  private setOpusPayloadTypes(sdp: string): void {
    this.opusPayloadTypes.clear();
    for (const match of sdp.matchAll(/^a=rtpmap:(\d+)\s+opus\/48000(?:\/\d+)?/gim)) {
      const payloadType = Number(match[1]);
      if (!Number.isInteger(payloadType) || payloadType < 0 || payloadType > 127) continue;
      this.opusPayloadTypes.add(payloadType);
      this.outgoingPayloadType = payloadType;
    }
    if (!this.opusPayloadTypes.size) this.opusPayloadTypes.add(DEFAULT_WEBRTC_OPUS_PAYLOAD_TYPE);
  }
}
