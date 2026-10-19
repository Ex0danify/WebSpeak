import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureFile, hasFixture } from "../../../../test/support/tsCaptureFixtures.js";
import { parseCommand } from "../wire/commandText.js";
import { importTsPublicKey, verifyTsSignature } from "./identity.js";
import { ts3Uid, ts6Uid } from "./uid.js";

// Capture fixtures stay local, CI skips these tests.
const hasFixtures = hasFixture(FIXTURES.ts3Packets);

/** The uncompressed single-packet commands of a capture, as text. */
function plainCommands(file: string): string[] {
  const capture = JSON.parse(readFileSync(fixtureFile(file)!, "utf8")) as {
    packets: { type: number; flags: number; plain?: string }[];
  };
  return capture.packets
    .filter((packet) => packet.type === 2 && packet.plain !== undefined && (packet.flags & 0x50) === 0)
    .map((packet) => Buffer.from(packet.plain!, "hex").toString("utf8"));
}

function firstRow(commands: string[], name: string) {
  const text = commands.find((command) => command.startsWith(`${name} `));
  expect(text, name).toBeDefined();
  return parseCommand(text!).rows[0];
}

describe.skipIf(!hasFixtures)("identities against the captures", () => {
  it("verifies the TS3 server's initivexpand2 proof and the client's clientek proof", () => {
    const commands = plainCommands(FIXTURES.ts3Packets);
    const client = firstRow(commands, "clientinitiv");
    const expand = firstRow(commands, "initivexpand2");
    const clientek = firstRow(commands, "clientek");
    const serverKey = importTsPublicKey(expand.omega!)!;
    const clientKey = importTsPublicKey(client.omega!)!;
    expect(serverKey).toBeDefined();
    expect(clientKey).toBeDefined();
    const license = Buffer.from(expand.l!, "base64");
    expect(verifyTsSignature(serverKey, license, Buffer.from(expand.proof!, "base64"))).toBe(true);
    const signed = Buffer.concat([Buffer.from(clientek.ek!, "base64"), Buffer.from(expand.beta!, "base64")]);
    expect(signed).toHaveLength(86);
    expect(verifyTsSignature(clientKey, signed, Buffer.from(clientek.proof!, "base64"))).toBe(true);
    expect(verifyTsSignature(serverKey, signed, Buffer.from(clientek.proof!, "base64"))).toBe(false);
  });

  it("predicts the UID each server reported for the throwaway identity", () => {
    for (const [file, uid] of [
      [FIXTURES.ts3Packets, ts3Uid],
      [FIXTURES.ts6Packets, ts6Uid],
    ] as const) {
      const commands = plainCommands(file);
      const omega = firstRow(commands, "clientinitiv").omega!;
      // The client sent a chat message during the capture, the server echoes it with our UID.
      expect(uid(omega), file).toBe(firstRow(commands, "notifytextmessage").invokeruid);
    }
  });
});
