// Types for the generated Emscripten glue (opusGlue.mjs). Only the surface the codec uses.

export interface OpusWasmModule {
  ccall(name: string, returnType: "number", argTypes: "number"[], args: number[]): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  // Reassigned when the heap grows (ALLOW_MEMORY_GROWTH), so read fresh before each use.
  HEAP16: Int16Array;
  HEAPU8: Uint8Array;
}

export default function createOpusWasmModule(moduleArg?: Record<string, unknown>): Promise<OpusWasmModule>;
