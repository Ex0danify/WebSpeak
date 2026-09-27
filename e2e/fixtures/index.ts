import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { Session } from "../helpers/session";
import { type Gateway, type GatewayOptions, startGateway } from "../../test/helpers/gateway";
import type { FakeRemoteMember } from "../../test/helpers/fake-ts-client";
import { JoinRateLimiter } from "../../src/server/join-rate-limit";
import { startGalleryServer } from "./gallery";

// The join-ticket limit is 30 a minute per peer, and every browser of a worker reaches its gateway
// from 127.0.0.1, so a worker that runs join-heavy specs at speed is refused with RATE_LIMITED and
// its tests time out waiting for the room, on a different test each run. The limiter is tested by
// itself in layer 3 (`server.join-ticket.test.ts`), and the server builds it inside `createWebServer`
// with no way to pass another, so the browser tests switch it off in their own process. This does
// not touch product code, and Vitest runs in another process.
JoinRateLimiter.prototype.allow = () => true;

const staticDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

interface WorkerFixtures {
  /**
   * The real gateway of this worker: the same wiring as `src/index.ts`, a temporary data
   * directory, sessions on a fake TeamSpeak server that the test can script through
   * `gateway.ts`, and the fresh web build. One per worker, so workers never share state.
   */
  gateway: Gateway;
  /**
   * Origin of a Vite dev server for the component gallery at `/__ui`, which the production build
   * does not contain. Started by the first test of a worker that asks for it.
   */
  galleryUrl: string;
}

/**
 * What a test puts on the fake TeamSpeak server besides the browsers. Everything is undone after the
 * test (members first), because the gateway of a worker is shared by its tests.
 */
export interface Script {
  /** A channel of its own, so a count or a list holds only what the test put there. Returns its id. */
  channel(name: string): bigint;
  /** A member that is not a browser: it can speak, chat, poke, move and leave (`FakeRemoteMember`). */
  member(nickname: string, channelId?: bigint): FakeRemoteMember;
  /** Lets every client move other members, as a server admin may, until the test ends. */
  allowMoves(): void;
}

// Ids for the channels of a test. One counter per worker, above the fake server's own (1 to 3).
let nextChannelId = 100n;

interface TestFixtures {
  /** The page of the test, with its socket frames recorded from the first navigation on. */
  session: Session;
  /**
   * Another browser context (another person) with the project's viewport, locale and theme,
   * recorded like `session`. Closed after the test.
   */
  openSession: () => Promise<Session>;
  script: Script;
  /**
   * A gateway of its own for a test that changes what every visitor sees (server settings, invites,
   * the administrator's password, the login rate limit), so the worker's shared gateway stays as
   * the other tests expect. Same wiring and fresh build; stopped after the test.
   */
  ownGateway: (options?: GatewayOptions) => Promise<Gateway>;
  /** Attaches what the gateway logged during a failed test. */
  gatewayLog: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  gateway: [
    async ({}, use) => {
      const options: GatewayOptions = { staticDir };
      const gateway = await startGateway(options);
      await use(gateway);
      await gateway.close();
    },
    { scope: "worker" },
  ],
  galleryUrl: [
    async ({}, use) => {
      const server = await startGalleryServer();
      await use(server.url);
      await server.close();
    },
    { scope: "worker", timeout: 60_000 },
  ],
  session: async ({ page }, use) => {
    await use(Session.attach(page));
  },
  script: async ({ gateway }, use) => {
    const undo: (() => void)[] = [];
    await use({
      channel(name) {
        const id = nextChannelId++;
        gateway.ts.channels.set(id, { id, name });
        undo.push(() => gateway.ts.channels.delete(id));
        return id;
      },
      member(nickname, channelId) {
        const member = gateway.ts.addMember(nickname, channelId);
        undo.push(() => member.leave());
        return member;
      },
      allowMoves() {
        const before = gateway.ts.guestsCanMove;
        gateway.ts.guestsCanMove = true;
        undo.push(() => (gateway.ts.guestsCanMove = before));
      },
    });
    for (const revert of undo.reverse()) revert();
  },
  ownGateway: async ({}, use) => {
    const started: Gateway[] = [];
    await use(async (options = {}) => {
      const gateway = await startGateway({ staticDir, ...options });
      started.push(gateway);
      return gateway;
    });
    for (const gateway of started) await gateway.close();
  },
  openSession: async ({ browser, baseURL }, use, testInfo) => {
    const { use: project } = testInfo.project;
    const contexts: { close(): Promise<void> }[] = [];
    await use(async () => {
      const context = await browser.newContext({
        baseURL,
        viewport: project.viewport,
        isMobile: project.isMobile,
        hasTouch: project.hasTouch,
        locale: project.locale,
        timezoneId: project.timezoneId,
        colorScheme: project.colorScheme,
        reducedMotion: project.reducedMotion,
      });
      contexts.push(context);
      return Session.attach(await context.newPage());
    });
    for (const context of contexts) await context.close();
  },
  baseURL: async ({ gateway }, use) => {
    await use(gateway.url);
  },
  gatewayLog: [
    async ({ gateway }, use, testInfo) => {
      const start = { debug: 0, info: 0, warn: 0, error: 0 };
      for (const level of Object.keys(start) as (keyof typeof start)[]) start[level] = gateway.logger[level].mock.calls.length;
      await use();
      if (testInfo.status === testInfo.expectedStatus) return;
      const lines = (Object.keys(start) as (keyof typeof start)[]).flatMap((level) =>
        gateway.logger[level].mock.calls.slice(start[level]).map((call) => JSON.stringify({ level, call })),
      );
      await testInfo.attach("gateway-log", { body: lines.join("\n") || "(nothing logged)", contentType: "text/plain" });
    },
    { auto: true },
  ],
});

export { expect };
