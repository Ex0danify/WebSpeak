// Contract between gateway and browser, every control frame type the gateway (any non-test `.ts` under `src/`) puts on the
// socket must be in the `ServerMessage` union. Both sides are read as source text, so a sender added without extending the
// union fails here wherever it lives.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const gatewayRoot = resolve(import.meta.dirname, "../../../../src");

function gatewayFiles(): string[] {
  return (readdirSync(gatewayRoot, { recursive: true }) as string[])
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

const gatewayPaths = gatewayFiles();
const gatewaySource = gatewayPaths.map((file) => readFileSync(resolve(gatewayRoot, file), "utf8")).join("\n");
const sessionTypesSource = read("./sessionTypes.ts");

/**
 * `type: "x"` literals in the gateway that are not browser-bound frames, like the SDP description kind, the browser-to-gateway
 * command names (`voice-protocol`, screen-share signals) and internal directory-sync events. Matched by name because the scan
 * covers all of `src/`.
 */
const NOT_A_FRAME = new Set([
  "offer",
  "switchChannel",
  "clientEnter",
  "clientLeave",
  "clientMoved",
  "clientUpdated",
  "screenShareStart",
  "screenShareStop",
  "screenShareJoin",
  "screenShareLeave",
]);

function gatewayFrameTypes(): string[] {
  const types = new Set<string>();
  for (const match of gatewaySource.matchAll(/\btype:\s*"([A-Za-z]+)"/g)) {
    if (!NOT_A_FRAME.has(match[1])) types.add(match[1]);
  }
  return [...types].sort();
}

type Members = Record<string, string>;

const sessionTypesFile = ts.createSourceFile("sessionTypes.ts", sessionTypesSource, ts.ScriptTarget.Latest, true);

const nameOf = (member: ts.TypeElement) => member.name?.getText(sessionTypesFile);

/** Optional property names mapped to their type text, for the members of a type literal or interface. */
function optionalMembers(members: ts.NodeArray<ts.TypeElement>): Members {
  const out: Members = {};
  for (const member of members) {
    if (ts.isPropertySignature(member) && member.type && member.questionToken) out[nameOf(member)!] = member.type.getText(sessionTypesFile);
  }
  return out;
}

/** Optional members of the `ServerMessage` branch with this `type` tag, or of its `inside` property when that is a type literal. */
function unionMember(tag: string, inside?: string): Members | undefined {
  const alias = sessionTypesFile.statements.find(
    (node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === "ServerMessage",
  );
  if (!alias || !ts.isUnionTypeNode(alias.type)) return undefined;
  for (const branch of alias.type.types) {
    if (!ts.isTypeLiteralNode(branch)) continue;
    const tagged = branch.members.some(
      (m) => ts.isPropertySignature(m) && nameOf(m) === "type" && m.type?.getText(sessionTypesFile) === `"${tag}"`,
    );
    if (!tagged) continue;
    if (!inside) return optionalMembers(branch.members);
    const nested = branch.members.find((m) => ts.isPropertySignature(m) && nameOf(m) === inside);
    return nested && ts.isPropertySignature(nested) && nested.type && ts.isTypeLiteralNode(nested.type)
      ? optionalMembers(nested.type.members)
      : undefined;
  }
  return undefined;
}

function interfaceMembers(name: string): Members | undefined {
  const node = sessionTypesFile.statements.find((n): n is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(n) && n.name.text === name);
  return node && optionalMembers(node.members);
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
  it("reads the gateway source files (fails loudly on an empty list)", () => {
    expect(gatewayPaths.length, `no gateway sources found under src/`).toBeGreaterThan(0);
  });

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

  // The optional `params` next to `code`/`message` is the only addition to these frames. Read from the syntax tree, so the
  // check does not depend on how the type is wrapped.
  it.each([
    ["error", () => unionMember("error", "error")],
    ["screenShareError", () => unionMember("screenShareError")],
    ["serverEvent payload", () => interfaceMembers("ServerEvent")],
  ])("accepts optional params on %s", (_name, find) => {
    const members = find();
    expect(members, "type not found in sessionTypes.ts").toBeDefined();
    expect(members?.params).toBe("MessageParams");
  });
});
