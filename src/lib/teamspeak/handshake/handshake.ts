import { randomBytes } from "node:crypto";
import type { Identity } from "../crypto/identity.js";
import type { RsaPuzzleOptions } from "../crypto/rsaPuzzle.js";
import { HandshakeError, TeamSpeakTransportError } from "../errors/teamSpeakErrors.js";
import {
  type CommandMessage,
  PacketHandler,
  type PacketHandlerOptions,
  systemClock,
  type VoicePacket,
} from "../transport/packetHandler.js";
import { PacketType } from "../transport/packetTypes.js";
import type { DatagramChannel } from "../transport/udpChannel.js";
import type { CommandRow } from "../wire/commandRows.js";
import { parseCommand } from "../wire/commandText.js";
import { parseU16 } from "../wire/commandValues.js";
import { serverErrorFromRow } from "../wire/serverErrorRow.js";
import { buildClientInit, buildClientInitIv, type ClientInitOptions } from "./clientInit.js";
import { answerInit1, INIT1_LAYOUT, init1Start, Init1Step } from "./init1.js";
import type { ExpandOptions, HandshakeFlavor } from "./handshakeFlavor.js";
import { ts3Handshake } from "./ts3Handshake.js";
import { ts6Handshake } from "./ts6Handshake.js";

const ALPHA_BYTES = 10;
const INIT1_RANDOM_BYTES = 4;

/** `auto` follows the version profile: a TS6 profile means the TS6 handshake, anything else TS3. */
export type HandshakeMode = "ts3" | "ts6" | "auto";

export interface HandshakeOptions extends ClientInitOptions {
  identity: Identity;
  /** Which handshake to drive. Default `ts3`. */
  handshake?: HandshakeMode;
  /** The whole handshake up to `initserver`. Default 20 s. */
  timeoutMs?: number;
  signal?: AbortSignal;
  transport?: PacketHandlerOptions;
  puzzle?: RsaPuzzleOptions;
  randomBytes?: (size: number) => Buffer;
  unixSeconds?: () => number;
  /** For tests that play the server. */
  testSeams?: Pick<ExpandOptions, "ephemeralSeed" | "deriveServerKey">;
}

// `auto` keys off the named `ts6` profile. An explicit `version` carries no such hint, so pick the
// handshake with `handshake` directly when overriding the version.
function resolveFlavor(options: HandshakeOptions): HandshakeFlavor {
  const mode = options.handshake === "auto" ? (options.versionProfile === "ts6" ? "ts6" : "ts3") : (options.handshake ?? "ts3");
  return mode === "ts6" ? ts6Handshake : ts3Handshake;
}

/** Where the connection's traffic goes once the handshake is through. */
export interface ConnectionEvents {
  /** Right on `initserver`, before any command that follows it. */
  established?(connection: HandshakeConnection): void;
  command(message: CommandMessage): void;
  voice?(packet: VoicePacket): void;
  closed(error: TeamSpeakTransportError | undefined): void;
}

export interface HandshakeConnection {
  handler: PacketHandler;
  clientId: number;
  /** The `initserver` row: server properties, our nickname and id. */
  initServer: CommandRow;
}

type Step = "init1" | "initivexpand2" | "clientinit";

/**
 * Init1 with the puzzle, the proof exchange of the chosen handshake (TS3: `initivexpand2` → `clientek`,
 * TS6: `initivxalpha` → `clientivxalpha`), then `clientinit`, resolved by `initserver`.
 * Everything the server sends after that goes to `events` in order, nothing is lost in between.
 * A refusal rejects with a HandshakeError that keeps the server error as cause; a dead server
 * with the transport error.
 */
export function runHandshake(channel: DatagramChannel, options: HandshakeOptions, events: ConnectionEvents): Promise<HandshakeConnection> {
  return new Promise((resolve, reject) => {
    const clock = options.transport?.clock ?? systemClock;
    const random = options.randomBytes ?? randomBytes;
    const logger = options.transport?.logger;
    const flavor = resolveFlavor(options);
    const alpha = random(ALPHA_BYTES);
    const clientInitIv = Buffer.from(buildClientInitIv(alpha, options.identity, flavor.asksForTs6));
    let init1Random = random(INIT1_RANDOM_BYTES);
    let switchedKeys = false;
    let state: "handshake" | "connected" | "failed" = "handshake";
    let step: Step = "init1";
    let lastServerInit1: Buffer | undefined;
    let lastInit1: Buffer;

    const fail = (error: Error) => {
      if (state !== "handshake") return;
      state = "failed";
      cleanup();
      logger?.debug({ step }, "TeamSpeak handshake failed");
      handler.close();
      reject(error);
    };
    const onAbort = () => fail(options.signal?.reason instanceof Error ? options.signal.reason : new Error("aborted"));
    const timer = clock.setTimer(
      () => fail(new TeamSpeakTransportError("timeout", `TeamSpeak handshake did not finish in time (at ${step})`)),
      options.timeoutMs ?? 20_000,
    );
    const cleanup = () => {
      clock.clearTimer(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    const sendInit1 = (payload: Buffer) => {
      lastInit1 = payload;
      handler.sendInit1(payload);
    };
    const startInit1 = () => {
      const seconds = options.unixSeconds?.() ?? Date.now() / 1000;
      sendInit1(init1Start(seconds, init1Random));
    };

    const onInit1 = (payload: Buffer) => {
      if (state !== "handshake" || step !== "init1") return;
      // A duplicate of the last server step gets the same answer again, without solving the puzzle twice.
      if (lastServerInit1?.equals(payload)) return handler.sendInit1(lastInit1);
      const answer = answerInit1(payload, { random: init1Random, clientInitIv, puzzle: options.puzzle });
      if (answer.kind === "ignore") return handler.sendInit1(lastInit1);
      lastServerInit1 = Buffer.from(payload);
      if (answer.kind === "send") {
        sendInit1(answer.payload);
        if (flavor.solutionKeys && !switchedKeys && answer.payload[INIT1_LAYOUT.VERSION_BYTES] === Init1Step.solution) {
          switchedKeys = true;
          handler.switchKeys(flavor.solutionKeys());
        }
        return;
      }
      logger?.debug({ step }, "TeamSpeak server restarted Init1");
      init1Random = random(INIT1_RANDOM_BYTES);
      lastServerInit1 = undefined;
      startInit1();
    };

    const onExpand = (row: CommandRow) => {
      handler.stopInit1Resend();
      const { reply, keySwitch } = flavor.accept(row, { identity: options.identity, alpha, ...options.testSeams });
      // The reply still goes out under the dummy key, clientinit is the first command under the session key.
      handler.sendCommand(Buffer.from(reply));
      handler.switchKeys(keySwitch);
      step = "clientinit";
      handler.sendCommand(Buffer.from(buildClientInit(options.identity, options)));
    };

    const onInitServer = (row: CommandRow) => {
      const clientId = parseU16(row.aclid);
      if (clientId === undefined || clientId === 0) throw new HandshakeError("initserver", "initserver has no valid aclid");
      handler.clientId = clientId;
      handler.startKeepAlive();
      state = "connected";
      cleanup();
      logger?.debug({ step: "initserver", clientId }, "TeamSpeak handshake done");
      const connection = { handler, clientId, initServer: row };
      events.established?.(connection);
      resolve(connection);
    };

    const onHandshakeCommand = (message: CommandMessage) => {
      if (message.type !== PacketType.command) return;
      const command = parseCommand(message.payload.toString("utf8"));
      const row = command.rows[0];
      if (command.name === "error") {
        const refusal = serverErrorFromRow(row);
        if (refusal) throw new HandshakeError(step, `the server refused: ${refusal.serverMessage}`, { cause: refusal });
        return;
      }
      if (step === "init1" && command.name === flavor.expandCommand) return onExpand(row);
      if (step === "init1" && command.name?.startsWith("initiv"))
        throw new HandshakeError("initivexpand2", `unsupported handshake answer ${command.name}`);
      if (step === "clientinit" && command.name === "initserver") return onInitServer(row);
      logger?.debug({ step, command: command.name }, "TeamSpeak command ignored during the handshake");
    };

    const handler = new PacketHandler(
      channel,
      {
        init1: onInit1,
        command: (message) => {
          if (state === "connected") return events.command(message);
          if (state !== "handshake") return;
          try {
            onHandshakeCommand(message);
          } catch (error) {
            fail(error as Error);
          }
        },
        voice: (packet) => {
          if (state === "connected") events.voice?.(packet);
        },
        closed: (error) => {
          if (state === "connected") return events.closed(error);
          fail(error ?? new TeamSpeakTransportError("closedByServer", "TeamSpeak connection closed during the handshake"));
        },
      },
      options.transport,
    );

    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    handler.skipInitCommand();
    startInit1();
  });
}
