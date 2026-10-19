# opus.wasm provenance

`opusGlue.mjs` and `opus.wasm` are generated, committed build outputs. Rebuild them with
`src/lib/opus/build/buildInDocker.sh` (needs only Docker on the host).

| Input                  | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| libopus version        | 1.5.2                                                                                                     |
| libopus source         | https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz                                                |
| libopus tarball sha256 | `65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1`                                        |
| Emscripten image       | `emscripten/emsdk:3.1.74`                                                                                 |
| Wrapper                | `wrapper.c` (raw-packet encode/decode, no Ogg)                                                            |
| configure flags        | `--disable-shared --enable-static --disable-doc --disable-extra-programs --disable-intrinsics CFLAGS=-O3` |
| emcc flags             | `-O3 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=node,web -s ALLOW_MEMORY_GROWTH=1`                    |

| Output         | sha256                                                             |
| -------------- | ------------------------------------------------------------------ |
| `opus.wasm`    | `f70399f381f3a4f68e4a592a24dcb2f9a89ddf2dc46935427d661aa7c5c3ed09` |
| `opusGlue.mjs` | `a6ea53475b0fd38a0511320fc894fd2b3f78286b4bd95e16973f3646383b1385` |

libopus is BSD-3-Clause; its licence is in `opusLicense.txt`.
