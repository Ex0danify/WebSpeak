/**
 * Dev check for the own TeamSpeak client: connects, prints the session after the welcome, runs a
 * few commands through the scheduler, stays for a while and leaves with reason "leaving".
 * Not shipped, not part of CI.
 *
 *   npx tsx scripts/ts-lib-connect.ts <host> [port] [--nickname n] [--stay seconds] [--profile ts3|ts6]
 *                                     [--password pw] [--identity base64:offset] [--verbose]
 *
 * Mind the flood ban: about 10 joins in 3 minutes ban the address for a while.
 */
import {
  channelList,
  channelSubscribeAll,
  clientInfo,
  clientList,
  generateIdentity,
  identityFromString,
  type SessionView,
  TeamSpeakConnection,
  version,
  type VersionProfileName,
} from "../src/lib/teamspeak/index.js";

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

// Ids and counts only, the remote server has real people on it.
function printSession(session: SessionView) {
  const { self, server } = session;
  log(`server "${server.name}" ${server.version}, codec encryption mode ${server.codecEncryptionMode}`);
  log(`self clid=${self.clientId} in cid=${self.channelId}`);
  const tree = (parentId: bigint): string =>
    session
      .children(parentId)
      .map((channel) => {
        const below = tree(channel.id);
        return below ? `${channel.id}(${below})` : String(channel.id);
      })
      .join(" ");
  log(`channels (${session.channels().length}, display order): ${tree(0n)}`);
  const clients = session.clients().map((client) => `${client.id}@${client.channelId}`);
  log(`clients (${clients.length}): ${clients.join(" ")}`);
  log(`groups: ${session.serverGroups.size} server, ${session.channelGroups.size} channel`);
}

const connection = new TeamSpeakConnection({
  address: { host, port },
  identity,
  nickname: option("nickname") ?? "WebSpeak lib check",
  serverPassword: option("password"),
  versionProfile: profile,
  transport: { logger: { debug: (fields, message) => verbose && console.error(`  debug ${message}`, fields) } },
});
let leftCleanly = false;
connection.on("selfLeft", (event) => {
  leftCleanly = event.reasonId === 8;
  log(`<- own leave reasonid=${event.reasonId} reasonmsg=${event.reasonMessage}`);
});
connection.on("closed", (event) => log(`connection closed${event.error ? `: ${event.error.code} ${event.error.message}` : ""}`));
for (const type of ["clientEnter", "clientLeave", "clientMoved", "clientUpdated", "channelsSubscribed", "channelsUnsubscribed"] as const)
  connection.on(type, () => verbose && log(`<- ${type}`));
connection.on("notification", (event) => log(`<- ${event.command.name} rows=${event.command.rows.length} (not applied)`));

await connection.connect();
log(`connected and welcome complete, uid-offset=${identity.offset} profile=${profile} pv=${connection.session.server.properties.pv}`);
printSession(connection.session);

await connection.command(channelSubscribeAll()).catch((error: Error) => log(`channelsubscribeall refused: ${error.message}`));
const requests = { version: version(), clientinfo: clientInfo(connection.clientId), clientlist: clientList(), channellist: channelList() };
const answers = await Promise.allSettled(Object.values(requests).map((request) => connection.command(request, { timeoutMs: 5_000 })));
Object.keys(requests).forEach((name, i) => {
  const answer = answers[i];
  log(`-> ${name}: ${answer.status === "fulfilled" ? `${answer.value.length} row(s)` : `refused, ${(answer.reason as Error).message}`}`);
});
const listed = answers[3].status === "fulfilled" ? answers[3].value.length : undefined;
if (listed !== undefined)
  log(`channellist answer ${listed === connection.session.channels().length ? "matches" : "differs from"} the session`);

for (let left = staySeconds; left > 0 && connection.state === "connected"; left -= 60) {
  await sleep(Math.min(left, 60) * 1000);
  if (connection.state === "connected") log("still connected");
}
if (connection.state === "connected") {
  printSession(connection.session);
  await connection.disconnect();
}
log(`left view cleanly: ${leftCleanly}`);
process.exitCode = leftCleanly ? 0 : 1;
