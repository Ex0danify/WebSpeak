// Raw-packet Opus wrapper exposed to WebAssembly. No Ogg layer: one opus_encode / opus_decode per call.
// Mirrors @discordjs/opus defaults (48 kHz, OPUS_APPLICATION_AUDIO, AUTO bitrate, complexity 9); the channel
// count is whatever the caller passes, so mono voice and stereo music share one build.
#include <stdlib.h>
#include <opus.h>

OpusEncoder *enc_create(int rate, int channels) {
  int err;
  OpusEncoder *e = opus_encoder_create(rate, channels, OPUS_APPLICATION_AUDIO, &err);
  return err == OPUS_OK ? e : NULL;
}
OpusDecoder *dec_create(int rate, int channels) {
  int err;
  OpusDecoder *d = opus_decoder_create(rate, channels, &err);
  return err == OPUS_OK ? d : NULL;
}

// pcm: interleaved int16 samples; frameSize is samples per channel. Returns packet bytes or a negative opus error.
int enc_encode(OpusEncoder *e, const short *pcm, int frameSize, unsigned char *out, int maxBytes) {
  return opus_encode(e, pcm, frameSize, out, maxBytes);
}
// Returns decoded samples per channel, or a negative opus error. len 0 asks libopus for packet-loss concealment.
int dec_decode(OpusDecoder *d, const unsigned char *data, int len, short *pcm, int frameSize) {
  return opus_decode(d, len > 0 ? data : NULL, len, pcm, frameSize, 0);
}

void enc_reset(OpusEncoder *e) { opus_encoder_ctl(e, OPUS_RESET_STATE); }
void dec_reset(OpusDecoder *d) { opus_decoder_ctl(d, OPUS_RESET_STATE); }
void enc_destroy(OpusEncoder *e) { opus_encoder_destroy(e); }
void dec_destroy(OpusDecoder *d) { opus_decoder_destroy(d); }
