// Server side of the legacy TeamSpeak handshake for the own client's tests: Init1 with a small
// puzzle, initivexpand2 → clientek, then initserver and a short welcome. The server's Ed25519 key
// has no license chain from TeamSpeak's root, so the client has to take it through its test seam.
import { generateKeyPairSync, sign as edSign } from "node:crypto";
import { createEphemeralKey, legacySharedSecret } from "../../src/lib/teamspeak/crypto/edwards.js";
import { generateIdentity, importTsPublicKey, verifyTsSignature } from "../../src/lib/teamspeak/crypto/identity.js";
import {
  AlphaPacketKeys,
  alphaSecrets,
  deriveIvStruct,
  DUMMY_PACKET_KEY_256,
  LegacyPacketKeys,
  legacyFakeMac,
} from "../../src/lib/teamspeak/crypto/packetKeys.js";
import { solveRsaPuzzle } from "../../src/lib/teamspeak/crypto/rsaPuzzle.js";
import { createX25519Key, x25519SharedSecret } from "../../src/lib/teamspeak/crypto/x25519.js";
import { alphaProofData } from "../../src/lib/teamspeak/handshake/alphaExpand.js";
import { INIT1_LAYOUT, INIT_VERSION, Init1Step } from "../../src/lib/teamspeak/handshake/init1.js";
import { clientEkProofData } from "../../src/lib/teamspeak/handshake/legacyExpand.js";
import { FixedPacketKeys } from "../../src/lib/teamspeak/transport/packetProtection.js";
import { PacketHandler, type PacketHandlerOptions, type VoicePacket } from "../../src/lib/teamspeak/transport/packetHandler.js";
import type { DatagramChannel } from "../../src/lib/teamspeak/transport/udpChannel.js";
import type { CommandRow } from "../../src/lib/teamspeak/wire/commandRows.js";
import { buildCommand, parseCommand, type ParsedCommand } from "../../src/lib/teamspeak/wire/commandText.js";

const { VERSION_BYTES, COOKIE_BYTES, NUMBER_BYTES, PUZZLE_BYTES } = INIT1_LAYOUT;

export interface LoopbackServerOptions {
  transport?: PacketHandlerOptions;
  /** Default 64 squarings, enough to check the solution without slowing tests down. */
  puzzleLevel?: number;
  clientId?: number;
  /** Drives the TS6 alpha handshake instead of the legacy one. */
  alpha?: boolean;
  /** Signs something other than the license, the client must refuse it. */
  forgeProof?: boolean;
  /** Answers clientinit with this error instead of initserver. */
  refuseClientInit?: { id: number; msg: string };
  /** Sent instead of initivexpand2. */
  expandAnswer?: string;
  /** Sent right before initserver. */
  beforeInitServer?: string[];
  initServerFields?: Record<string, string | number>;
  /** Answers the first Init1 start with a restart request. */
  restartOnce?: boolean;
  /** Bytes of filler in a channel description, to make the welcome span several packets. */
  welcomePadding?: number;
  /** Sent after initserver instead of the default welcome. */
  welcome?: (clientId: number, nickname: string) => string[];
  /** Replies to a command after the handshake, sent in order. */
  answer?: (command: ParsedCommand, text: string) => string[];
}

export interface LoopbackServer {
  handler: PacketHandler;
  /** Pass to the client as `testSeams.deriveServerKey`. */
  deriveServerKey: () => Buffer;
  /** Command texts from the client after the handshake commands, in order. */
  received: string[];
  /** Voice and whisper packets from the client. */
  voice: VoicePacket[];
  /** Set once the session keys are in place. */
  ivStruct: Buffer | undefined;
  /** The client's clientinit fields. */
  clientInit: CommandRow | undefined;
  /** The puzzle solutions that matched. */
  solvedPuzzles: number;
  closed: boolean;
}

const serverEd25519 = createEphemeralKey(Buffer.alloc(32, 0x5e));
const serverIdentity = generateIdentity(0);
// Alpha: a real Ed25519 key for the server proof and an X25519 key for the ECDH.
const serverProofKey = generateKeyPairSync("ed25519");
const serverProofPublic = Buffer.from((serverProofKey.publicKey.export({ format: "jwk" }) as { x: string }).x, "base64url");
const serverX25519 = createX25519Key(Buffer.alloc(32, 0x2e));
const ALPHA_TIME = 1_792_222_195n;
// Times count from 2013, an ephemeral block valid over the whole u32 range.
const LICENSE = Buffer.concat([Buffer.from([1, 0]), serverEd25519.publicKey, Buffer.from([32, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff])]);
const PUZZLE_N = Buffer.alloc(NUMBER_BYTES, 0xa7);
const PUZZLE_X = Buffer.alloc(NUMBER_BYTES, 0x35);

const readClientStep = (payload: Buffer) =>
  payload.length > VERSION_BYTES && payload.readUInt32BE(0) === INIT_VERSION
    ? { step: payload[VERSION_BYTES], body: payload.subarray(VERSION_BYTES + 1) }
    : undefined;

export function createLoopbackServer(channel: DatagramChannel, options: LoopbackServerOptions = {}): LoopbackServer {
  const level = options.puzzleLevel ?? 64;
  const clientId = options.clientId ?? 3;
  const cookie = Buffer.alloc(COOKIE_BYTES, 0xc0);
  const puzzle = Buffer.alloc(PUZZLE_BYTES, 0x11);
  PUZZLE_X.copy(puzzle, 0);
  PUZZLE_N.copy(puzzle, NUMBER_BYTES);
  puzzle.writeUInt32BE(level, 2 * NUMBER_BYTES);
  const solution = solveRsaPuzzle(PUZZLE_X, PUZZLE_N, level);
  const beta = Buffer.alloc(54, 0xbe);
  const betaAlpha = Buffer.alloc(32, 0xbe);
  let alpha: Buffer | undefined;
  let clientOmega = "";
  let nickname = "";
  let restart = options.restartOnce ?? false;

  const send = (text: string) => server.handler.sendCommand(Buffer.from(text));

  const onInit1 = (payload: Buffer) => {
    const step = readClientStep(payload);
    if (step?.step === Init1Step.start && restart) {
      restart = false;
      server.handler.sendInit1(Buffer.from([Init1Step.restart]));
    } else if (step?.step === Init1Step.start && step.body.length === 16) {
      const echo = Buffer.from(step.body.subarray(4, 8)).reverse();
      server.handler.sendInit1(Buffer.concat([Buffer.from([Init1Step.cookie]), cookie, echo]));
    } else if (step?.step === Init1Step.cookieEcho && step.body.subarray(0, COOKIE_BYTES).equals(cookie)) {
      server.handler.sendInit1(Buffer.concat([Buffer.from([Init1Step.puzzle]), puzzle]));
    } else if (step?.step === Init1Step.solution && step.body.subarray(0, PUZZLE_BYTES).equals(puzzle)) {
      if (!step.body.subarray(PUZZLE_BYTES, PUZZLE_BYTES + NUMBER_BYTES).equals(solution)) return;
      server.solvedPuzzles++;
      if (alpha) return;
      const initIv = parseCommand(step.body.subarray(PUZZLE_BYTES + NUMBER_BYTES).toString()).rows[0];
      alpha = Buffer.from(initIv.alpha, "base64");
      clientOmega = initIv.omega;
      if (options.expandAnswer) return send(options.expandAnswer);
      if (options.alpha) {
        // From the server's answer on, the dummy key is 256-bit, like on the client.
        server.handler.switchKeys({ keys: new FixedPacketKeys(DUMMY_PACKET_KEY_256) });
        const signed = options.forgeProof ? Buffer.from("not the proof") : alphaProofData(serverX25519.publicKey, ALPHA_TIME);
        send(
          buildCommand("initivxalpha", [
            ["l", LICENSE.toString("base64")],
            ["beta", betaAlpha.toString("base64")],
            ["omega", serverIdentity.publicKeyBase64],
            ["ot", 1],
            ["tvd", ""],
            ["time", ALPHA_TIME.toString()],
            ["epsilon", serverX25519.publicKey.toString("base64")],
            ["proof", edSign(null, signed, serverProofKey.privateKey).toString("base64")],
          ]),
        );
        return;
      }
      const proof = serverIdentity.sign(options.forgeProof ? Buffer.from("not the license") : LICENSE);
      send(
        buildCommand("initivexpand2", [
          ["l", LICENSE.toString("base64")],
          ["beta", beta.toString("base64")],
          ["omega", serverIdentity.publicKeyBase64],
          ["ot", 1],
          ["proof", proof.toString("base64")],
          ["tvd", ""],
          ["time", 1_792_222_195],
        ]),
      );
    }
  };

  const onClientEk = (row: CommandRow) => {
    const ek = Buffer.from(row.ek, "base64");
    const key = importTsPublicKey(clientOmega);
    if (!key || !verifyTsSignature(key, clientEkProofData(ek, beta), Buffer.from(row.proof, "base64"))) return server.handler.close();
    const ivStruct = deriveIvStruct(alpha!, beta, legacySharedSecret(ek, serverEd25519.privateKey));
    server.ivStruct = ivStruct;
    server.handler.switchKeys({ keys: new LegacyPacketKeys(ivStruct), fakeMac: legacyFakeMac(ivStruct) });
  };

  const onClientivxAlpha = (row: CommandRow) => {
    const clientEps = Buffer.from(row.epsilon, "base64");
    const key = importTsPublicKey(clientOmega);
    if (!key || !verifyTsSignature(key, alphaProofData(clientEps, ALPHA_TIME), Buffer.from(row.proof, "base64")))
      return server.handler.close();
    const { sharedIv, fakeMac } = alphaSecrets(x25519SharedSecret(serverX25519.privateKey, clientEps), alpha!, betaAlpha);
    server.ivStruct = sharedIv;
    server.handler.switchKeys({ keys: new AlphaPacketKeys(sharedIv), fakeMac });
  };

  const onClientInit = (row: CommandRow) => {
    server.clientInit = row;
    nickname = row.client_nickname;
    if (options.refuseClientInit) return send(buildCommand("error", options.refuseClientInit));
    for (const text of options.beforeInitServer ?? []) send(text);
    send(
      buildCommand("initserver", {
        virtualserver_name: "Loopback",
        aclid: clientId,
        acn: nickname,
        pv: 6,
        lt: 0,
        ...options.initServerFields,
      }),
    );
    if (options.welcome) {
      for (const text of options.welcome(clientId, nickname)) send(text);
      return;
    }
    const padding = "x".repeat(options.welcomePadding ?? 0);
    send(
      buildCommand(
        "channellist",
        { cid: 1, cpid: 0, channel_name: "Lobby", channel_topic: padding },
        { rows: [{ cid: 2, cpid: 0, channel_name: "Other" }] },
      ),
    );
    send("channellistfinished");
    send(buildCommand("notifycliententerview", { cfid: 0, ctid: 1, reasonid: 2, clid: clientId, client_nickname: nickname }));
  };

  const onCommand = (text: string) => {
    const command = parseCommand(text);
    const row = command.rows[0];
    if (command.name === "clientek") return onClientEk(row);
    if (command.name === "clientivxalpha") return onClientivxAlpha(row);
    if (command.name === "clientinit") return onClientInit(row);
    server.received.push(text);
    for (const reply of options.answer?.(command, text) ?? []) send(reply);
    if (command.name === "clientdisconnect") {
      send(buildCommand("notifyclientleftview", { cfid: 1, ctid: 0, reasonid: 8, reasonmsg: row.reasonmsg, clid: clientId }));
    }
  };

  const server: LoopbackServer = {
    handler: new PacketHandler(
      channel,
      {
        init1: onInit1,
        command: (message) => onCommand(message.payload.toString()),
        voice: (packet) => server.voice.push(packet),
        closed: () => {
          server.closed = true;
        },
      },
      { ...options.transport, role: "server" },
    ),
    deriveServerKey: () => (options.alpha ? serverProofPublic : serverEd25519.publicKey),
    received: [],
    voice: [],
    ivStruct: undefined,
    clientInit: undefined,
    solvedPuzzles: 0,
    closed: false,
  };
  server.handler.skipInitCommand();
  return server;
}
