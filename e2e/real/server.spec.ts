import { expect, test } from "@playwright/test";
import { WebQuery, realServerFromEnv } from "./server";

// The disposable server itself: what the later specs stand on.
const server = realServerFromEnv();
const query = WebQuery.for(server);

test("the server is the pinned TeamSpeak 6 build on the suite's own ports", async () => {
  const [version] = await query.call("version", {}, null);
  expect(version.version).toContain("6.0.0");
  const [info] = await query.call("serverinfo");
  expect(info.virtualserver_port).toBe("9987");
  expect(server.voicePort).not.toBe(9987);
  expect(server.queryPort).not.toBe(10080);
});

test("global setup created the lobby and raised the flood limits", async () => {
  const channels = await query.call("channellist");
  expect(channels.map((c) => c.channel_name)).toContain("Lobby");
  const [info] = await query.call("serverinfo");
  expect(Number(info.virtualserver_antiflood_points_needed_ip_block)).toBeGreaterThan(250);
});

test("WebQuery refuses a request without this run's key", async () => {
  const response = await fetch(`http://127.0.0.1:${server.queryPort}/1/channellist`);
  expect(response.ok).toBe(false);
});
