import createOpusWasmModule, { type OpusWasmModule } from "./opusGlue.mjs";

// One WebAssembly instance shared by every codec. Instantiating compiles the 323 KB module once; the
// top-level await means importers get a ready module and the codec factory can stay synchronous.
const wasm: OpusWasmModule = await createOpusWasmModule();

export function opusModule(): OpusWasmModule {
  return wasm;
}
