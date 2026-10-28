import { randomInt } from "node:crypto";
import { MediaStreamTrack, RtpHeader, RtpPacket, RTCPeerConnection, useOPUS } from "werift";
import type { Logger as LoggerType } from "../../../shared/logger.js";
import type { TSVoiceData } from "../../teamspeak/index.js";
import { createOpusCodec, type OpusCodec } from "../voiceOpus.js";
import { AUDIO_CLOCK_INTERVAL_MS, AUDIO_FRAME_SAMPLES, AUDIO_SAMPLE_RATE, MAX_MIXER_PACER_LAG_MS, WebRtcMixer } from "./webrtcMixer.js";
import { WEBRTC_UDP_PORT_RANGE } from "../../../config/webrtcConfig.js";
import type { WebRtcIceInfo } from "../iceInfo.js";
import { readIceInfo } from "./webrtcIceInfo.js";

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
  /** IPv4 addresses advertised as extra host candidates, never a host name. */
  publicAddresses?: string[];
  udpPortRange?: [number, number];
  logger: LoggerType;
  microphoneMuted?: boolean;
  accompanimentActive?: boolean;
  onVoiceFrame: (data: Buffer, codec: 4 | 5) => void;
  onVoiceActivity: (clientIds: number[]) => void;
  /** Seam for the mixer's Opus encoder, production uses the native one. */
  createEncoder?: () => OpusCodec;
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
  webrtcIce: WebRtcIceInfo | null;
}

/**
 * One low-latency WebRTC audio session per browser connection. Mixes one 20 ms frame per active speaker
 * into the single negotiated track, with small bounded queues so bursts do not become growing delay.
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
  private readonly createdAt = performance.now();
  private connectMs: number | null = null;
  private ice: WebRtcIceInfo | null = null;
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
    webrtcIce: null,
  };

  constructor(options: WebRtcAudioSessionOptions) {
    this.logger = options.logger.child({ component: "webrtc-audio", connectionId: options.connectionId });
    this.onVoiceFrame = options.onVoiceFrame;
    this.onVoiceActivity = options.onVoiceActivity;
    this.microphoneMuted = options.microphoneMuted === true;
    this.accompanimentActive = options.accompanimentActive === true;
    this.outgoingTrack = new MediaStreamTrack({ kind: "audio" });

    const iceAdditionalHostAddresses = options.publicAddresses?.length ? options.publicAddresses : undefined;
    const udpPortRange = options.udpPortRange ?? WEBRTC_UDP_PORT_RANGE;
    this.peer = new RTCPeerConnection({
      iceServers: [],
      codecs: { audio: [useOPUS()] },
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
        if (this.lastIngressRtpAt !== null)
          this.stats.webrtcIngressRtpMaxGapMs = Math.max(
            this.stats.webrtcIngressRtpMaxGapMs,
            Math.round(receivedAt - this.lastIngressRtpAt),
          );
        this.lastIngressRtpAt = receivedAt;
        this.stats.webrtcIngressRtpFirstAt ??= Date.now();
        this.stats.webrtcIngressRtpLastAt = Date.now();
        this.stats.webrtcIngressRtpFrames++;
        if (!this.opusPayloadTypes.has(rtp.header.payloadType)) return;
        const payload = Buffer.from(rtp.payload);
        // A muted mic must stop here, some browsers still send comfort silence RTP that keeps the user
        // speaking in TS. With accompaniment on the browser already removed the mic part, so keep going.
        if (this.microphoneMuted && !this.accompanimentActive) return;
        // Forward valid Opus payloads unchanged. No RMS decode or speech gate, dropping quiet frames
        // causes gaps, clicks and decoder recovery artifacts.
        this.onVoiceFrame(payload, this.accompanimentActive ? 5 : 4);
      });
      void audio.sender.replaceTrack(this.outgoingTrack).catch((error: unknown) => {
        this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not attach WebRTC output track");
      });
    });
    void audio.sender.replaceTrack(this.outgoingTrack).catch((error: unknown) => {
      this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not prepare WebRTC output track");
    });

    let encoder: OpusCodec;
    try {
      encoder = options.createEncoder?.() ?? createOpusCodec(AUDIO_SAMPLE_RATE, 1);
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Could not create WebRTC mixer encoder");
      this.outgoingTrack.stop();
      // The caller never receives this instance, so nothing else can close the peer built above.
      void this.peer.close().catch(() => undefined);
      throw new Error("WebRTC Opus codec is unavailable", { cause: error });
    }
    this.mixer = new WebRtcMixer(encoder, this.stats, this.logger);

    this.nextAudioDeadline = performance.now();
    this.scheduleAudioTick();
    this.activityTimer = setInterval(() => this.flushSpeakerActivity(), SPEAKER_ACTIVITY_INTERVAL_MS);
    this.activityTimer.unref?.();
    this.peer.onconnectionstatechange = () => {
      this.logger.info({ state: this.peer.connectionState }, "WebRTC connection state changed");
      // Our own close ends in a "closed" state that would hide how the session really ended.
      if (this.closed) return;
      if (this.peer.connectionState === "connected") this.connectMs ??= Math.round(performance.now() - this.createdAt);
      this.captureIce();
    };
  }

  getStats(): WebRtcAudioStats {
    return { ...this.stats, webrtcQueueCurrentFrames: this.mixer.getQueueFrameCount(), webrtcIce: this.ice };
  }

  private captureIce(): void {
    this.ice = readIceInfo(this.peer, this.ice, this.connectMs);
  }

  async createAnswer(offer: WebRtcSessionDescription): Promise<WebRtcSessionDescription> {
    if (this.closed) throw new Error("WebRTC session is closed");
    await this.peer.setRemoteDescription(offer);
    const transceiver = this.peer.getTransceivers().find((candidate) => candidate.kind === "audio");
    if (!transceiver) throw new Error("WebRTC offer has no audio section");
    this.setOpusPayloadTypes(transceiver.codecs);
    await transceiver.sender.replaceTrack(this.outgoingTrack);
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
    // The pair is gone once the peer is closed, so the last look at it is taken now.
    this.captureIce();
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
    const packet = new RtpPacket(
      new RtpHeader({
        payloadType: this.outgoingPayloadType,
        sequenceNumber: this.sequenceNumber,
        timestamp: this.timestamp,
        ssrc: this.ssrc,
        marker: true,
      }),
      encoded,
    );
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
    this.timestamp = (this.timestamp + AUDIO_FRAME_SAMPLES) >>> 0;
    this.outgoingTrack.writeRtp(packet);
    const sentAt = performance.now();
    if (this.lastEgressRtpAt !== null)
      this.stats.webrtcEgressRtpMaxGapMs = Math.max(this.stats.webrtcEgressRtpMaxGapMs, Math.round(sentAt - this.lastEgressRtpAt));
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

  /** The payload types the browser chose for Opus. Guessing a default would label other audio as Opus. */
  private setOpusPayloadTypes(codecs: readonly { mimeType: string; clockRate: number; payloadType: number }[]): void {
    this.opusPayloadTypes.clear();
    for (const codec of codecs) {
      if (codec.mimeType.toLowerCase() !== "audio/opus" || codec.clockRate !== 48_000) continue;
      this.opusPayloadTypes.add(codec.payloadType);
      this.outgoingPayloadType = codec.payloadType;
    }
    if (!this.opusPayloadTypes.size) throw new Error("WebRTC offer did not negotiate Opus at 48 kHz");
  }
}
