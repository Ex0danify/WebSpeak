/**
 * Dev check for voice on the own TeamSpeak client: two connections join, A sends Opus silence frames
 * as channel voice and as each kind of whisper, plain and encrypted, B counts what arrives and how
 * it came over the wire. Not shipped, not part of CI.
 *
 *   npx tsx scripts/ts-lib-voice.ts <host> [port] [--password pw] [--frames 25] [--profile ts3|ts6]
 *
 * Two joins per run, mind the flood ban.
 */
import {
  clientMove,
  generateIdentity,
  TeamSpeakConnection,
  type VersionProfileName,
  type VoiceEncryption,
  type VoiceEvent,
  WhisperGroupTarget,
  WhisperGroupType,
  type WhisperTargets,
} from "../src/lib/teamspeak/index.js";
import { type DatagramChannel, openUdpChannel } from "../src/lib/teamspeak/transport/udpChannel.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const positional = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith("--") && !all[i - 1]?.startsWith("--"));
const [host, portText = "9987"] = positional;
if (!host) throw new Error("usage: ts-lib-voice.ts <host> [port]");
const port = Number(portText);
const frames = Number(option("frames") ?? "25");
const profile = (option("profile") ?? "ts3") as VersionProfileName;
const started = performance.now();
const log = (message: string) => console.log(`[${((performance.now() - started) / 1000).toFixed(1)}s] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// The usual Opus silence frame, 20 ms.
const SILENCE = Buffer.from([0xf8, 0xff, 0xfe]);

interface WireCount {
  plain: number;
  encrypted: number;
}

/** Counts voice datagrams by type and the unencrypted flag, before the client sees them. */
function tapped(counts: Map<string, WireCount>) {
  return async (address: { host: string; port: number }, signal?: AbortSignal): Promise<DatagramChannel> => {
    const channel = await openUdpChannel(address, signal);
    const count = (direction: string, typeAndFlags: number) => {
      const type = typeAndFlags & 0x0f;
      if (type > 1) return;
      const key = `${direction} ${type === 0 ? "voice" : "whisper"}`;
      const entry = counts.get(key) ?? { plain: 0, encrypted: 0 };
      if (typeAndFlags & 0x80) entry.plain++;
      else entry.encrypted++;
      counts.set(key, entry);
    };
    return {
      attach: (handlers) =>
        channel.attach({
          message: (datagram) => {
            if (datagram.length >= 11) count("in", datagram[10]);
            handlers.message(datagram);
          },
          error: handlers.error,
        }),
      send: (datagram) => {
        if (datagram.length >= 13) count("out", datagram[12]);
        channel.send(datagram);
      },
      close: () => channel.close(),
    };
  };
}

async function join(nickname: string, counts: Map<string, WireCount>) {
  // Options are read on every send, so the script can flip the encryption between cases.
  const options = {
    address: { host, port },
    identity: generateIdentity(8),
    nickname,
    serverPassword: option("password"),
    versionProfile: profile,
    socketFactory: tapped(counts),
    voiceEncryption: "never" as VoiceEncryption,
  };
  const connection = new TeamSpeakConnection(options);
  connection.on("notification", (event) => log(`  ${nickname} <- ${event.command.name} (not applied)`));
  await connection.connect();
  return { connection, options };
}

const countsA = new Map<string, WireCount>();
const countsB = new Map<string, WireCount>();
const a = await join("WebSpeak voice A", countsA);
await sleep(1_000);
const b = await join("WebSpeak voice B", countsB);
// A learns about B from its own enter view, which can come after B's connect resolved.
await sleep(1_000);
const { session } = a.connection;
// The default channel may need talk power a guest does not have.
if (session.channel(session.self.channelId)?.properties.channel_needed_talk_power !== "0") {
  const open = session
    .channels()
    .find(
      (candidate) =>
        candidate.properties.channel_needed_talk_power === "0" &&
        candidate.properties.channel_flag_password !== "1" &&
        candidate.properties.channel_maxclients !== "0",
    );
  if (open) {
    for (const side of [a, b])
      await side.connection
        .command(clientMove({ clientId: side.connection.clientId, channelId: open.id }))
        .catch((error: Error) => log(`move refused: ${error.message}`));
    await sleep(500);
  }
}
const selfB = b.connection.session.self;
const channel = session.channel(session.self.channelId);
log(
  `server mode ${session.server.codecEncryptionMode}, channel ${channel?.id} codec ${channel?.codec} unencrypted=${channel?.codecUnencrypted}`,
);
log(`A clid=${a.connection.clientId} cid=${session.self.channelId}, B clid=${selfB.clientId} cid=${selfB.channelId}`);
const clientB = session.client(selfB.clientId);
log(`B server groups ${clientB?.serverGroups.join(",")} channel group ${clientB?.channelGroupId}`);

const props = (props: Record<string, string>, keys: string[]) => keys.map((key) => `${key}=${props[key]}`).join(" ");
const clientKeys = [
  "client_input_muted",
  "client_output_muted",
  "client_input_hardware",
  "client_output_hardware",
  "client_talk_power",
  "client_is_talker",
];
log(`A ${props(session.self.client?.properties ?? {}, clientKeys)}`);
log(`B ${props(clientB?.properties ?? {}, clientKeys)}`);
log(`channel ${props(channel?.properties ?? {}, ["channel_needed_talk_power", "channel_flag_default", "channel_codec_is_unencrypted"])}`);
if (process.argv.includes("--unmute")) {
  for (const side of [a, b]) await side.connection.command("clientupdate client_input_muted=0 client_output_muted=0");
  await sleep(500);
  log(`after unmute A ${props(session.self.client?.properties ?? {}, clientKeys)}`);
}

await b.connection
  .command("clientupdate client_is_channel_commander=1")
  .then(() => log("B is channel commander now"))
  .catch((error: Error) => log(`B may not be channel commander: ${error.message}`));

const received: VoiceEvent[] = [];
b.connection.on("voice", (event) => received.push({ ...event, data: Buffer.from(event.data) }));

type Case = { name: string; send: () => void };
const whisper = (targets: WhisperTargets) => () => a.connection.sendWhisper(SILENCE, targets);
const cases: Case[] = [
  { name: "channel voice", send: () => a.connection.sendVoice(SILENCE) },
  { name: "whisper to B", send: whisper({ clientIds: [selfB.clientId] }) },
  { name: "whisper to B's channel", send: whisper({ channelIds: [selfB.channelId] }) },
  { name: "group all clients", send: whisper({ group: WhisperGroupType.allClients, target: WhisperGroupTarget.allChannels }) },
  {
    name: "group B's server group",
    send: whisper({
      group: WhisperGroupType.serverGroup,
      target: WhisperGroupTarget.allChannels,
      groupId: BigInt(clientB?.serverGroups[0] ?? 0),
    }),
  },
  {
    name: "group B's channel group, current channel",
    send: whisper({
      group: WhisperGroupType.channelGroup,
      target: WhisperGroupTarget.currentChannel,
      groupId: BigInt(clientB?.channelGroupId ?? 0),
    }),
  },
  { name: "group channel commanders", send: whisper({ group: WhisperGroupType.channelCommander, target: WhisperGroupTarget.allChannels }) },
];

const wire = (counts: Map<string, WireCount>) =>
  [...counts].map(([key, value]) => `${key} plain=${value.plain} enc=${value.encrypted}`).join(", ") || "nothing";

for (const encryption of ["never", "always"] as const) {
  a.options.voiceEncryption = encryption;
  for (const testCase of cases) {
    received.length = 0;
    countsA.clear();
    countsB.clear();
    for (let i = 0; i < frames; i++) {
      testCase.send();
      await sleep(20);
    }
    await sleep(500);
    const intact = received.filter((event) => event.data.equals(SILENCE)).length;
    const from = new Set(received.map((event) => event.clientId));
    const kinds = new Set(received.map((event) => (event.whisper ? "whisper" : "voice")));
    log(
      `${encryption.padEnd(6)} ${testCase.name.padEnd(42)} B got ${received.length}/${frames} (intact ${intact}, from ${[...from].join(",")}, as ${[...kinds].join(",")}) | A ${wire(countsA)} | B ${wire(countsB)}`,
    );
  }
}

await Promise.all([a.connection.disconnect(), b.connection.disconnect()]);
log("left");
