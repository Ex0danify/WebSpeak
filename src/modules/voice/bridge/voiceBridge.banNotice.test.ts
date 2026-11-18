import { describe, expect, it } from "vitest";
import { useGateway } from "../../../../test/support/gateway.js";
import { joinVoice } from "../../../../test/support/voice.js";

const gateways = useGateway();

describe("how long a ban lasts, for the person it removes", () => {
  it("is sent with the failure of a ban, 0 for good", async () => {
    for (const seconds of [3600, 0]) {
      const gateway = await gateways.start();
      const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
      gateway.ts.kick(client, "spam", true, seconds);
      expect(await socket.waitForMessage("connectionFailed")).toMatchObject({ code: "BANNED", banSeconds: seconds });
    }
  });

  it("is left out when the server did not say, and for a kick", async () => {
    for (const ban of [true, false]) {
      const gateway = await gateways.start();
      const { socket, client } = await joinVoice(gateway, { nickname: "alice" });
      gateway.ts.kick(client, "spam", ban);
      expect(await socket.waitForMessage("connectionFailed")).not.toHaveProperty("banSeconds");
    }
  });
});
