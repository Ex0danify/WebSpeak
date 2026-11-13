/** TeamSpeak codec byte for Opus music, the only stereo downlink. Voice (4) is mono. */
const CODEC_OPUS_MUSIC = 5;

/** Used when a packet is too short to read its duration. */
const FALLBACK_PACKET_US = 20_000;

/** Frame length per TOC config 0..31 (RFC 6716 §3.1), in microseconds. */
const FRAME_US_BY_CONFIG = [
  [10_000, 20_000, 40_000, 60_000], // SILK narrowband
  [10_000, 20_000, 40_000, 60_000], // SILK mediumband
  [10_000, 20_000, 40_000, 60_000], // SILK wideband
  [10_000, 20_000], // hybrid super-wideband
  [10_000, 20_000], // hybrid fullband
  [2_500, 5_000, 10_000, 20_000], // CELT narrowband
  [2_500, 5_000, 10_000, 20_000], // CELT wideband
  [2_500, 5_000, 10_000, 20_000], // CELT super-wideband
  [2_500, 5_000, 10_000, 20_000], // CELT fullband
].flat();

export function opusChannelsForCodec(codec: number): 1 | 2 {
  return codec === CODEC_OPUS_MUSIC ? 2 : 1;
}

/** Playing time of one Opus packet, read from its TOC byte. */
export function opusPacketDurationUs(packet: Uint8Array): number {
  if (packet.length === 0) return FALLBACK_PACKET_US;
  const toc = packet[0];
  const frameUs = FRAME_US_BY_CONFIG[toc >> 3] ?? FALLBACK_PACKET_US;
  const code = toc & 0x03;
  if (code === 0) return frameUs;
  if (code !== 3) return frameUs * 2;
  if (packet.length < 2) return FALLBACK_PACKET_US;
  return frameUs * (packet[1] & 0x3f);
}
