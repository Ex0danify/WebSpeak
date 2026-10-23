import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { type Gateway, startGateway } from "../../test/support/gateway";
import { JoinRateLimiter } from "../../src/modules/join/joinRateLimit";
import { Session, expectInRoom, poll, submitJoin } from "../helpers";
import { assertFreshBuild } from "../helpers/build-stamp";
import { type SeededIdentity, identities, storageStateFor } from "./identities";
import { type RealServer, WebQuery, realServerFromEnv } from "./server";

// Joins are paced below, so the gateway's own limit (30 a minute per peer, and all browsers come from 127.0.0.1)
// has nothing to add.
JoinRateLimiter.prototype.allow = () => true;

const staticDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

/**
 * The server floods clients that join fast. Global setup raises its limits and this is the second defence,
 * joins to TeamSpeak start at least this far apart. A rate limit the tests obey, not a wait for an event.
 */
export const JOIN_PACE_MS = 1500;

let lastJoinStartedAt = 0;

/** One browser of a test: its own context (so its own storage), a seeded identity and a nickname. */
export interface Person {
  readonly page: Page;
  readonly session: Session;
  readonly nickname: string;
  readonly identity: SeededIdentity;
  /** When the join to TeamSpeak was started, for tests of the pacing. */
  joinStartedAt: number | null;
  /**
   * Joins through the form at least `JOIN_PACE_MS` after the previous join of the run and waits for the room.
   * With `channel` (a name) the form's target channel is filled in, otherwise the default channel is where they land.
   */
  join(channel?: string): Promise<void>;
  /** The same paced start as `join`, without waiting for the room: for a join that is expected to be refused. */
  submit(channel?: string): Promise<void>;
}

interface WorkerFixtures {
  server: RealServer;
  query: WebQuery;
  /** The real gateway of the run: real TeamSpeak client, the disposable server as its fixed target. */
  gateway: Gateway;
}

interface TestFixtures {
  /**
   * A new browser context with identity `index` and a unique nickname. Closed after the test, before the gateway leak check.
   * `options.gateway` joins through another gateway, `options.seeded: false` is a first-time visitor (`identity` is then
   * unused).
   */
  person: (index: number, label: string, options?: { gateway?: Gateway; seeded?: boolean }) => Promise<Person>;
  /**
   * A gateway of the test's own, for a test that ends it (the worker's cannot be restarted on its port). Stopped after
   * the test. `webRtc: true` turns WebRTC audio on, by default voice travels as Opus over the WebSocket. `target`
   * overrides the TeamSpeak address, e.g. a UDP impairment proxy in front of the server.
   */
  ownGateway: (options?: { webRtc?: boolean; target?: string }) => Promise<Gateway>;
  /** A permanent channel of its own with a unique name. Returns its name and id; deleted after the test. */
  testChannel: (label: string) => Promise<{ name: string; id: string }>;
}

let counter = 0;

/** A real gateway aimed at the disposable server, with the real TeamSpeak client. */
async function startRealGateway(server: RealServer, options: { webRtc?: boolean; target?: string } = {}): Promise<Gateway> {
  assertFreshBuild();
  const gateway = await startGateway({ staticDir, realTeamSpeak: true });
  gateway.adminService.updateSettings({
    accessMode: "fixed",
    siteName: "WebSpeak real-server test",
    webRtcEnabled: options.webRtc === true,
  });
  gateway.adminService.updateServer("server-default", {
    name: "Real server",
    target: options.target ?? `${server.host}:${server.voicePort}`,
  });
  return gateway;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  server: [async ({}, use) => use(realServerFromEnv()), { scope: "worker" }],
  query: [async ({ server }, use) => use(WebQuery.for(server)), { scope: "worker" }],
  gateway: [
    async ({ server }, use) => {
      const gateway = await startRealGateway(server);
      await use(gateway);
      await gateway.close();
    },
    { scope: "worker" },
  ],
  baseURL: async ({ gateway }, use) => use(gateway.url),

  // One fixture owns the cleanup order. Browsers first, then the gateway must list no session (the identity leases are
  // free again), then the server goes back to how it was.
  person: async ({ browser, gateway, query }, use, testInfo) => {
    const { use: project } = testInfo.project;
    const contexts: { close(): Promise<void> }[] = [];
    const nicknames: string[] = [];
    await use(async (index, label, options = {}) => {
      const through = options.gateway ?? gateway;
      const context = await browser.newContext({
        baseURL: through.url,
        viewport: project.viewport,
        locale: project.locale,
        timezoneId: project.timezoneId,
        colorScheme: project.colorScheme,
        reducedMotion: project.reducedMotion,
        ...(options.seeded === false ? {} : { storageState: storageStateFor(index, through.url) as never }),
      });
      contexts.push(context);
      const page = await context.newPage();
      const nickname = `${label}-${++counter}`.slice(0, 30);
      nicknames.push(nickname);
      const person: Person = {
        page,
        session: Session.attach(page),
        nickname,
        identity: identities.get(index),
        joinStartedAt: null,
        async submit(channel) {
          // A timer can fire a millisecond early, so the clock decides, not the timer.
          for (let wait = lastJoinStartedAt + JOIN_PACE_MS - Date.now(); wait > 0; wait = lastJoinStartedAt + JOIN_PACE_MS - Date.now()) {
            await new Promise((resolve) => setTimeout(resolve, wait));
          }
          lastJoinStartedAt = person.joinStartedAt = Date.now();
          await submitJoin(page, nickname, channel);
        },
        async join(channel) {
          await person.submit(channel);
          await expectInRoom(page, nickname);
        },
      };
      return person;
    });
    for (const context of contexts) await context.close();
    const admin = await gateway.adminLogin();
    await poll(
      async () => ((await (await admin.get("sessions")).json()) as { sessions: unknown[] }).sessions.length,
      (count) => count === 0,
      { timeoutMs: 10_000, message: "the gateway to list no session after the browsers closed" },
    );
    // The gateway forgets a session before the TeamSpeak server has dropped its client, so the
    // server's own list is waited for too, or the next test would see a ghost.
    const dropStarted = Date.now();
    await poll(
      async () => (await query.call("clientlist")).filter((c) => nicknames.includes(c.client_nickname)).length,
      (count) => count === 0,
      { timeoutMs: 10_000, message: "the TeamSpeak server to drop the clients of this test" },
    );
    if (Date.now() - dropStarted > 1000)
      process.stderr.write(`note: the server took ${Date.now() - dropStarted} ms to drop the clients of "${testInfo.title}"\n`);
    // Whoever is still on the server (a client the test made by another way) goes back to the lobby.
    const [lobby] = (await query.call("channellist")).filter((c) => c.channel_name === "Lobby");
    for (const client of await query.call("clientlist")) {
      if (client.client_type === "0" && client.cid !== lobby.cid) await query.call("clientmove", { clid: client.clid, cid: lobby.cid });
    }
  },

  ownGateway: async ({ server }, use) => {
    const started: Gateway[] = [];
    await use(async (options) => {
      const gateway = await startRealGateway(server, options);
      started.push(gateway);
      return gateway;
    });
    for (const gateway of started) await gateway.close();
  },

  testChannel: async ({ query }, use) => {
    const made: string[] = [];
    await use(async (label) => {
      const name = `${label}-${++counter}`;
      const id = await query.createChannel(name);
      made.push(id);
      return { name, id };
    });
    for (const id of made) await query.call("channeldelete", { cid: id, force: 1 });
  },
});

export { expect };
