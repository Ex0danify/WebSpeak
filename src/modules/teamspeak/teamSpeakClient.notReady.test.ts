import { describe, expect, it } from "vitest";
import { TSClient } from "./teamSpeakClient.js";
import type { Logger } from "../../shared/logger.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return logger;
  },
};

describe("a TeamSpeak client that is not connected", () => {
  const client = () => new TSClient({ target: { host: "127.0.0.1", port: 9987 }, nickname: "idle" }, logger);

  it("refuses a channel switch instead of pretending it happened", async () => {
    await expect(client().switchChannel(5n)).rejects.toThrow("TeamSpeak session is not ready");
  });

  it("refuses a move of another client", async () => {
    await expect(client().moveClient(7, 5n)).rejects.toThrow("TeamSpeak session is not ready");
  });
});
