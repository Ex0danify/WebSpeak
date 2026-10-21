#!/bin/bash
# Runs INSIDE the pinned emscripten/emsdk image (see buildInDocker.sh). Builds libopus plus wrapper.c into
# a WASM ES module and writes opusGlue.mjs + opus.wasm into the lib folder. Not run directly on the host.
set -euo pipefail

SRC=/work/opus-1.5.2
OUT=/work/out

cd "$SRC"
# Static float build, no docs/tests/extras, no runtime intrinsics detection (deterministic across hosts).
emconfigure ./configure \
  --disable-shared --enable-static \
  --disable-doc --disable-extra-programs \
  --disable-intrinsics CFLAGS="-O3" > /work/configure.log 2>&1
emmake make -j"$(nproc)" > /work/make.log 2>&1

cd /work
emcc -O3 wrapper.c "$SRC/.libs/libopus.a" \
  -I "$SRC/include" \
  -s MODULARIZE=1 -s EXPORT_ES6=1 \
  -s ENVIRONMENT=node,web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAP16","HEAPU8"]' \
  -s EXPORTED_FUNCTIONS='["_enc_create","_dec_create","_enc_encode","_dec_decode","_enc_reset","_dec_reset","_enc_destroy","_dec_destroy","_malloc","_free"]' \
  -o "$OUT/opus.mjs"

# The lib imports the glue as opusGlue.mjs; the embedded wasm reference stays "opus.wasm".
mv "$OUT/opus.mjs" "$OUT/opusGlue.mjs"
ls -la "$OUT"
