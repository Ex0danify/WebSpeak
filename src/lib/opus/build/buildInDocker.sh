#!/bin/bash
# Reproducible build of the committed opusGlue.mjs + opus.wasm. Needs only Docker on the host; no local
# Emscripten. Downloads libopus, verifies its hash, builds inside the pinned image, writes the two artifacts
# next to this folder.
#
#   src/lib/opus/build/buildInDocker.sh
#
# A pre-placed build/opus-1.5.2.tar.gz with the right hash is reused instead of downloading.
set -euo pipefail

OPUS_VERSION=1.5.2
OPUS_SHA256=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
EMSDK_IMAGE=emscripten/emsdk:3.1.74
OPUS_URL="https://downloads.xiph.org/releases/opus/opus-${OPUS_VERSION}.tar.gz"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
libdir="$(cd "$here/.." && pwd)"
tarball="$here/opus-${OPUS_VERSION}.tar.gz"

if [[ ! -f "$tarball" ]] || ! echo "$OPUS_SHA256  $tarball" | sha256sum -c - >/dev/null 2>&1; then
  echo "Downloading libopus $OPUS_VERSION"
  curl -fsSL "$OPUS_URL" -o "$tarball"
fi
echo "$OPUS_SHA256  $tarball" | sha256sum -c -

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/out"
tar -xzf "$tarball" -C "$work"
cp "$here/wrapper.c" "$here/build.sh" "$work/"

docker run --rm -v "$work:/work" -w /work "$EMSDK_IMAGE" bash /work/build.sh
# The container writes as root; hand the tree back so the host trap can clean it up.
docker run --rm -v "$work:/work" "$EMSDK_IMAGE" chown -R "$(id -u):$(id -g)" /work

cp "$work/out/opusGlue.mjs" "$work/out/opus.wasm" "$libdir/"
echo "Wrote opusGlue.mjs + opus.wasm to $libdir"
sha256sum "$libdir/opus.wasm" "$libdir/opusGlue.mjs"
