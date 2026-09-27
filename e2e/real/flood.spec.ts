import { expect, test } from "@playwright/test";
import { TSClient } from "../../src/server/ts-client";
import { realServerFromEnv, silentLogger } from "./server";

const server = realServerFromEnv();

// G-SMOKE lesson 2: the server banned 127.0.0.1 ("connection failed, you are banned", about ten
// minutes) after roughly ten joins in three minutes. Global setup raises the anti-flood limits;
// this shows that it worked for client connections, which the query allow-list does not cover.
test("thirty clients can join one after another in a minute without a flood ban", async () => {
  test.setTimeout(120_000);
  const started = Date.now();
  for (let n = 1; n <= 30; n++) {
    const client = new TSClient({ target: { host: server.host, port: server.voicePort }, nickname: `flood-${n}` }, silentLogger);
    await client.connect().catch((error: unknown) => {
      throw new Error(`join ${n} of 30 failed after ${Date.now() - started} ms: ${error instanceof Error ? error.message : String(error)}`);
    });
    await client.disconnect();
  }
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: "elapsed", description: `${elapsed} ms for 30 joins` });
  expect(elapsed).toBeLessThan(60_000);
});
