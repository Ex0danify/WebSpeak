import { fileURLToPath } from "node:url";
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { Session } from "../helpers/session";
import { type Gateway, type GatewayOptions, startGateway } from "../../test/support/gateway";
import type { FakeRemoteMember } from "../../test/support/fakeTsClient";
import { JoinRateLimiter } from "../../src/modules/join/joinRateLimit";
import { ServerPasswordBackoff } from "../../src/modules/join/serverPasswordBackoff";
import { startGalleryServer } from "./gallery";

// Every browser of a worker joins from 127.0.0.1, so join-heavy specs would hit the 30 a minute ticket limit and time
// out on a different test each run. createWebServer gives no way to swap the limiter, so this process switches it off.
JoinRateLimiter.prototype.allow = () => true;
// A wrong server password makes the gateway refuse the next typed one for 5 seconds, which would fail every test that
// retries with the right password at once. The wait itself is covered by serverPasswordBackoff.test.ts.
ServerPasswordBackoff.prototype.retryAfterMs = () => 0;

const staticDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

interface WorkerFixtures {
  /**
   * The real gateway of this worker, wired like `src/index.ts`, with a temp data dir and a fake TeamSpeak
   * server that tests script through `gateway.ts`. One per worker, so workers never share state.
   */
  gateway: Gateway;
  /**
   * Origin of a Vite dev server for the component gallery at `/__ui`, which the production build
   * does not contain. Started by the first test of a worker that asks for it.
   */
  galleryUrl: string;
}

/**
 * What a test puts on the fake TeamSpeak server besides the browsers. Undone after the test, members first,
 * because the gateway of a worker is shared by its tests.
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

/**
 * Stores the language before the first script of every page of `context`, so a test reads the same text
 * whatever the browser's locale. Only on the first visit, so a test that switches language keeps its choice after a reload.
 */
async function pinLanguage(context: BrowserContext, language: string | null): Promise<void> {
  if (language === null) return;
  await context.addInitScript((code) => {
    try {
      if (!localStorage.getItem("webspeak:language")) localStorage.setItem("webspeak:language", code);
    } catch {
      // storage unavailable
    }
  }, language);
}

interface TestFixtures {
  /**
   * The language every page of the test starts in (default `en`), stored before navigation. Set it
   * with `test.use({ language: "de" })`, or `null` for a test that checks detection from the browser.
   */
  language: string | null;
  /** The page of the test, with its socket frames recorded from the first navigation on. */
  session: Session;
  /**
   * Another browser context (another person) with the project's viewport, locale and theme,
   * recorded like `session`. Closed after the test.
   */
  openSession: () => Promise<Session>;
  script: Script;
  /**
   * A gateway of its own for a test that changes what every visitor sees (server settings, invites, admin
   * password, login rate limit), so the shared one stays as other tests expect. Stopped after the test.
   */
  ownGateway: (options?: GatewayOptions) => Promise<Gateway>;
  /** Attaches what the gateway logged during a failed test. */
  gatewayLog: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  language: ["en", { option: true }],
  context: async ({ context, language }, use) => {
    await pinLanguage(context, language);
    await use(context);
  },
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
  openSession: async ({ browser, baseURL, language }, use, testInfo) => {
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
      await pinLanguage(context, language);
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
