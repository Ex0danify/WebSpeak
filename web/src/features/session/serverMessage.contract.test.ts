// Contract between the gateway and the browser (Step R4.4): every control frame type that
// `src/server/voice-bridge.ts` puts on the socket must be a member of the `ServerMessage` union.
// Both sides are read as source text, so adding a sender without extending the union fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const gatewaySource = read("../../../../src/server/voice-bridge.ts");
const sessionTypesSource = read("./sessionTypes.ts");

/** `type: "x"` literals in the gateway that are not browser-bound frames (the SDP description kind). */
const NOT_A_FRAME = new Set(["offer"]);

function gatewayFrameTypes(): string[] {
  const types = new Set<string>();
  for (const match of gatewaySource.matchAll(/\btype:\s*"([A-Za-z]+)"/g)) {
    if (!NOT_A_FRAME.has(match[1])) types.add(match[1]);
  }
  return [...types].sort();
}

function unionTypes(): string[] {
  const start = sessionTypesSource.indexOf("export type ServerMessage =");
  const end = sessionTypesSource.indexOf("export type ServerMessageType");
  expect(start, "ServerMessage union not found").toBeGreaterThan(-1);
  expect(end, "ServerMessageType not found").toBeGreaterThan(start);
  const block = sessionTypesSource.slice(start, end);
  return [...block.matchAll(/\btype:\s*"([A-Za-z]+)"/g)].map((m) => m[1]).sort();
}

describe("ServerMessage contract with the gateway", () => {
  it("finds the senders (guards against the scan silently matching nothing)", () => {
    expect(gatewayFrameTypes().length).toBeGreaterThan(25);
  });

  it("includes every frame type the gateway sends", () => {
    const union = new Set(unionTypes());
    const missing = gatewayFrameTypes().filter((type) => !union.has(type));
    expect(missing, `gateway sends types missing from ServerMessage: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares no type the gateway never sends", () => {
    const sent = new Set(gatewayFrameTypes());
    const unsent = unionTypes().filter((type) => !sent.has(type));
    expect(unsent, `ServerMessage has types no sender produces: ${unsent.join(", ")}`).toEqual([]);
  });

  it("declares each type once", () => {
    const all = unionTypes();
    expect(new Set(all).size).toBe(all.length);
  });
});
