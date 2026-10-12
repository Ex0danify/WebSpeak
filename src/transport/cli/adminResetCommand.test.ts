import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSpeakDatabase } from "../../infra/persistence/database.js";
import { hashAdminPassword, verifyAdminPassword } from "../../infra/security/adminPassword.js";
import { runAdminResetCommand } from "./adminResetCommand.js";

let dir = "";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "webspeak-reset-"));
  const database = new WebSpeakDatabase(join(dir, "webspeak.db"));
  database.initializeAdmin(await hashAdminPassword("the password nobody remembers", { username: "ops" }), {
    siteName: "",
    welcomeTexts: {},
    accessMode: "open",
    tsHost: "127.0.0.1",
    tsPort: 9987,
    tsPasswordEncrypted: null,
    webRtcEnabled: false,
    webRtcUdpStart: 40000,
    webRtcUdpEnd: 40099,
    relayConfigured: false,
    relayEnabled: false,
    relayName: "",
    relayHost: "",
    relayPort: 39087,
    relayTokenEncrypted: null,
  });
  database.close();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function run(args: string[], stdinText: string) {
  const out: string[] = [];
  const err: string[] = [];
  const stdin = new PassThrough();
  stdin.end(stdinText);
  const streams = {
    stdin,
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
  } as never;
  return runAdminResetCommand(args, dir, streams).then((code) => ({ code, out: out.join(""), err: err.join("") }));
}

async function credential() {
  const database = new WebSpeakDatabase(join(dir, "webspeak.db"));
  try {
    return database.getAdminCredential()!;
  } finally {
    database.close();
  }
}

describe("runAdminResetCommand", () => {
  it("reads the new password from piped stdin and resets the account", async () => {
    const result = await run([], "a fresh recovery password\nignored second line\n");
    expect(result.code).toBe(0);
    expect(result.out).toContain('Administrator "ops" reset');
    expect(result.out).not.toContain("a fresh recovery password");
    const stored = await credential();
    expect(await verifyAdminPassword("a fresh recovery password", stored)).toBe(true);
    expect(stored).toMatchObject({ username: "ops", mustChangePassword: true });
  });

  it("changes the username with --username", async () => {
    const result = await run(["--username", "root"], "a fresh recovery password\n");
    expect(result.code).toBe(0);
    expect((await credential()).username).toBe("root");
  });

  it("rejects a weak password with a message and leaves the account alone", async () => {
    const result = await run([], "short\n");
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/at least 12 characters/);
    expect(await verifyAdminPassword("the password nobody remembers", await credential())).toBe(true);
  });

  it("rejects empty input", async () => {
    expect((await run([], "")).code).toBe(1);
  });

  it("explains itself on unknown arguments and on --help", async () => {
    expect(await run(["--password", "x"], "")).toMatchObject({ code: 2, err: expect.stringContaining("Usage:") });
    expect(await run(["--help"], "")).toMatchObject({ code: 0, out: expect.stringContaining("Usage:") });
  });

  it("names the data directory when there is no database", async () => {
    rmSync(join(dir, "webspeak.db"));
    const result = await run([], "a fresh recovery password\n");
    expect(result.code).toBe(1);
    expect(result.err).toContain("WEBSPEAK_DATA_DIR");
  });
});
