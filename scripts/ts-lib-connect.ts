/**
 * Dev check for the own TeamSpeak client: connects with the legacy handshake, prints the welcome,
 * stays for a while and leaves with reason "leaving". Not shipped, not part of CI.
 *
 *   npx tsx scripts/ts-lib-connect.ts <host> [port] [--nickname n] [--stay seconds] [--profile ts3|ts6]
 *                                     [--password pw] [--identity base64:offset] [--verbose]
 *
 * Mind the flood ban: about 10 joins in 3 minutes ban the address for a while.
 */
import { connectLegacy, generateIdentity, identityFromString, parseCommand, type VersionProfileName } from "../src/lib/teamspeak/index.js";
import { openUdpChannel } from "../src/lib/teamspeak/transport/udpChannel.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const positional = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith("--") && !all[i - 1]?.startsWith("--"));
const [host, portText = "9987"] = positional;
if (!host) throw new Error("usage: ts-lib-connect.ts <host> [port] [--stay seconds]");
const port = Number(portText);
const staySeconds = Number(option("stay") ?? "5");
const profile = (option("profile") ?? "ts3") as VersionProfileName;
const verbose = process.argv.includes("--verbose");
const identityText = option("identity");
const identity = identityText ? identityFromString(identityText) : generateIdentity(8);
const started = performance.now();
const elapsed = () => `${((performance.now() - started) / 1000).toFixed(1)}s`;
const log = (message: string) => console.log(`[${elapsed()}] ${message}`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let clientId = 0;
let leftCleanly = false;
let closedError: unknown;

const channel = await openUdpChannel({ host, port });
const connection = await connectLegacy(
  channel,
  {
    identity,
    nickname: option("nickname") ?? "WebSpeak lib check",
    serverPassword: option("password"),
    versionProfile: profile,
    transport: { logger: { debug: (fields, message) => verbose && console.error(`  debug ${message}`, fields) } },
  },
  {
    command: ({ payload }) => {
      const command = parseCommand(payload.toString("utf8"));
      const self = command.rows.find((row) => row.clid === String(clientId));
      if (command.name === "notifyclientleftview" && self) leftCleanly = self.reasonid === "8";
      const selfNote = self ? ` (self: ${["ctid", "reasonid", "reasonmsg"].map((key) => `${key}=${self[key] ?? ""}`).join(" ")})` : "";
      log(`<- ${command.name ?? "(answer)"} rows=${command.rows.length}${selfNote}`);
    },
    closed: (error) => {
      closedError = error ?? "closed";
      log(`connection closed${error ? `: ${error.code} ${error.message}` : ""}`);
    },
  },
);
clientId = connection.clientId;
const server = connection.initServer;
log(`connected as clid=${clientId} to "${server.virtualserver_name}" pv=${server.pv} profile=${profile} uid-offset=${identity.offset}`);

for (let left = staySeconds; left > 0 && !closedError; left -= 60) {
  await sleep(Math.min(left, 60) * 1000);
  const rtt = connection.handler.smoothedRttMs?.toFixed(1) ?? "?";
  log(`still connected: srtt=${rtt} ms pending=${connection.handler.pendingCommands}`);
}

if (!closedError) {
  connection.handler.sendCommand(Buffer.from("clientdisconnect reasonid=8 reasonmsg=leaving"));
  for (let waited = 0; waited < 3_000 && (connection.handler.pendingCommands > 0 || !leftCleanly) && !closedError; waited += 50)
    await sleep(50);
  log(`disconnect ${connection.handler.pendingCommands === 0 ? "acknowledged" : "not acknowledged"}, left view: ${leftCleanly}`);
  connection.handler.close();
}
process.exitCode = closedError && !leftCleanly ? 1 : 0;
