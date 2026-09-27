import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { type Gateway, startGateway } from "../../test/helpers/gateway";
import { JoinRateLimiter } from "../../src/server/join-rate-limit";
import { Session, expectInRoom, poll, submitJoin } from "../helpers";
import { assertFreshBuild } from "../helpers/build-stamp";
import { type SeededIdentity, identities, storageStateFor } from "./identities";
import { type RealServer, WebQuery, realServerFromEnv } from "./server";

// Joins are paced below, so the gateway's own limit (30 a minute per peer) has nothing to add, and
// the browsers of a run all come from 127.0.0.1. Layer 3 tests the limiter; see e2e/fixtures.
JoinRateLimiter.prototype.allow = () => true;

const staticDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

/**
 * The server floods clients that join fast (G-SMOKE lesson 2). Global setup raises its limits, and
 * this is the second defence: joins to TeamSpeak start at least this far apart. It is a rate limit
 * the tests obey, not a wait for something to happen.
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
   * Joins through the form, at least `JOIN_PACE_MS` after the previous join of the run, and waits
   * for the room. With `channel` the form's target channel is filled in (a name); without it the
   * server's default channel is where the person lands.
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
   * A new browser context seeded with identity `index` (step 5.2). The nickname is unique: `label`
   * plus a counter. Closed after the test, before the gateway's sessions are checked for leaks.
   * `options.gateway` is another gateway to join through (`ownGateway`). `options.seeded: false`
   * gives a browser with no stored identity, the state of a first-time visitor (finding F1); its
   * `identity` is then only the number it would have had, not one the browser uses.
   */
  person: (index: number, label: string, options?: { gateway?: Gateway; seeded?: boolean }) => Promise<Person>;
  /**
   * A gateway of the test's own, for a test that ends it (the worker's cannot be started again on
   * its port). Stopped after the test, with the wait bounded because of finding F12.
   */
  ownGateway: () => Promise<Gateway>;
  /** A permanent channel of its own with a unique name. Returns its name and id; deleted after the test. */
  testChannel: (label: string) => Promise<{ name: string; id: string }>;
}

let counter = 0;

/** A real gateway aimed at the disposable server: the real TeamSpeak client, the server as the fixed target. */
async function startRealGateway(server: RealServer): Promise<Gateway> {
  assertFreshBuild();
  const gateway = await startGateway({ staticDir, realTeamSpeak: true });
  gateway.adminService.updateSettings({
    target: `${server.host}:${server.voicePort}`,
    accessMode: "fixed",
    siteName: "WebSpeak real-server test",
    welcomeText: "",
    webRtcEnabled: false,
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
      await gateway.close({ stopTimeoutMs: 2000 });
    },
    { scope: "worker" },
  ],
  baseURL: async ({ gateway }, use) => use(gateway.url),

  // One fixture owns the order of the cleanup: browsers first, then the gateway must list no
  // session (the identity leases are free again), then the server is put back as it was.
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
    // A session leaves that list when its teardown starts, but its identity lease is released only
    // after the TeamSpeak client has disconnected. The teardown's own log line comes after both, so
    // every join that started must have its "torn down" line before the next test may reuse an identity.
    const logged = (message: string) => gateway.logger.info.mock.calls.filter((call) => call[1] === message).length;
    await poll(
      () => [logged("WebClient connecting"), logged("Client session torn down")],
      ([started, ended]) => started === ended,
      { timeoutMs: 10_000, message: "every session of this test to finish its teardown (identity leases released)" },
    );
    // The gateway forgets a session before the TeamSpeak server has dropped its client, so the
    // server's own list is waited for too, or the next test would see a ghost.
    const dropStarted = Date.now();
    await poll(
      async () => (await query.call("clientlist")).filter((c) => nicknames.includes(c.client_nickname)).length,
      (count) => count === 0,
      { timeoutMs: 10_000, message: "the TeamSpeak server to drop the clients of this test" },
    );
    if (Date.now() - dropStarted > 1000) process.stderr.write(`note: the server took ${Date.now() - dropStarted} ms to drop the clients of "${testInfo.title}"\n`);
    // Whoever is still on the server (a client the test made by another way) goes back to the lobby.
    const [lobby] = (await query.call("channellist")).filter((c) => c.channel_name === "Lobby");
    for (const client of await query.call("clientlist")) {
      if (client.client_type === "0" && client.cid !== lobby.cid) await query.call("clientmove", { clid: client.clid, cid: lobby.cid });
    }
  },

  ownGateway: async ({ server }, use) => {
    const started: Gateway[] = [];
    await use(async () => {
      const gateway = await startRealGateway(server);
      started.push(gateway);
      return gateway;
    });
    for (const gateway of started) await gateway.close({ stopTimeoutMs: 2000 });
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
