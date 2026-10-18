import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EnvError, loadEnvFile, parsePort, parseSwitch, readDataDir, readGatewayEnv, readMode, readRelayEnv } from "./env.js";

const GATEWAY = {
  WEBSPEAK_ADMIN_USERNAME: "admin",
  WEBSPEAK_ADMIN_PASSWORD: "",
  WEBSPEAK_HOST: "",
  WEBSPEAK_PORT: "3040",
  WEBSPEAK_DATA_DIR: "./data",
  WEBSPEAK_TRUST_PROXY: "0",
  WEBSPEAK_SCREEN_SHARE_ICE_SERVERS: "",
};

const RELAY = {
  WEBSPEAK_RELAY_TOKEN: "token",
  WEBSPEAK_RELAY_HOST: "0.0.0.0",
  WEBSPEAK_RELAY_PORT: "39087",
  WEBSPEAK_RELAY_ALLOW_PRIVATE: "0",
};

describe("parsePort", () => {
  it("accepts a port in range", () => {
    expect(parsePort(" 8080 ", "P")).toBe(8080);
    expect(parsePort("65535", "P")).toBe(65535);
  });

  it.each(["", "0", "65536", "-1", "80.5", "http", "1e3", "0x50"])("rejects %j and names the variable", (value) => {
    expect(() => parsePort(value, "WEBSPEAK_PORT")).toThrow(new EnvError("WEBSPEAK_PORT must be a port between 1 and 65535"));
  });
});

describe("parseSwitch", () => {
  it.each(["1", "true", "TRUE", "yes", "on", " On "])("reads %j as on", (value) => expect(parseSwitch(value, "S")).toBe(true));
  it.each(["0", "false", "no", "off", " OFF "])("reads %j as off", (value) => expect(parseSwitch(value, "S")).toBe(false));
  it.each(["", "ture", "2", "enabled"])("rejects %j instead of treating it as off", (value) => {
    expect(() => parseSwitch(value, "WEBSPEAK_TRUST_PROXY")).toThrow(new EnvError("WEBSPEAK_TRUST_PROXY must be 1 or 0"));
  });
});

describe("readGatewayEnv", () => {
  it("reads the values of .env.example", () => {
    expect(readGatewayEnv(GATEWAY)).toEqual({
      host: undefined,
      port: 3040,
      dataDir: "./data",
      trustProxy: false,
      screenShareIceServers: undefined,
      adminUsername: "admin",
      adminPassword: undefined,
      teamSpeakClient: "native",
    });
  });

  it("reads set values, keeping the admin password exactly as written", () => {
    expect(
      readGatewayEnv({
        ...GATEWAY,
        WEBSPEAK_HOST: " 127.0.0.1 ",
        WEBSPEAK_PORT: "4000",
        WEBSPEAK_TRUST_PROXY: "1",
        WEBSPEAK_SCREEN_SHARE_ICE_SERVERS: "stun:stun.example.org:3478",
        WEBSPEAK_ADMIN_PASSWORD: " pass phrase with spaces ",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 4000,
      trustProxy: true,
      screenShareIceServers: "stun:stun.example.org:3478",
      adminPassword: " pass phrase with spaces ",
    });
  });

  it("has no defaults: every unset variable is reported at once", () => {
    expect(() => readGatewayEnv({})).toThrow(EnvError);
    expect(() => readGatewayEnv({})).toThrow(
      /^WEBSPEAK_ADMIN_USERNAME, WEBSPEAK_ADMIN_PASSWORD, WEBSPEAK_HOST, WEBSPEAK_PORT, WEBSPEAK_DATA_DIR, WEBSPEAK_TRUST_PROXY, WEBSPEAK_SCREEN_SHARE_ICE_SERVERS are not set\. Copy \.env\.example to \.env/,
    );
  });

  it.each(Object.keys(GATEWAY))("refuses to start without %s", (name) => {
    const { [name]: _removed, ...rest } = GATEWAY as Record<string, string>;
    expect(() => readGatewayEnv(rest)).toThrow(new RegExp(`^${name} is not set\\.`));
  });

  it("accepts an empty value only where .env.example leaves it empty", () => {
    for (const name of ["WEBSPEAK_ADMIN_PASSWORD", "WEBSPEAK_HOST", "WEBSPEAK_SCREEN_SHARE_ICE_SERVERS"]) {
      expect(() => readGatewayEnv({ ...GATEWAY, [name]: "" })).not.toThrow();
    }
    for (const name of ["WEBSPEAK_PORT", "WEBSPEAK_DATA_DIR", "WEBSPEAK_TRUST_PROXY"]) {
      expect(() => readGatewayEnv({ ...GATEWAY, [name]: "" })).toThrow(EnvError);
    }
  });

  it("fails on a bad port or switch, naming the variable", () => {
    expect(() => readGatewayEnv({ ...GATEWAY, WEBSPEAK_PORT: "abc" })).toThrow("WEBSPEAK_PORT");
    expect(() => readGatewayEnv({ ...GATEWAY, WEBSPEAK_TRUST_PROXY: "maybe" })).toThrow("WEBSPEAK_TRUST_PROXY");
  });

  it("picks the TeamSpeak client from the optional WEBSPEAK_TS_CLIENT", () => {
    expect(readGatewayEnv({ ...GATEWAY, WEBSPEAK_TS_CLIENT: " SDK " }).teamSpeakClient).toBe("sdk");
    expect(readGatewayEnv({ ...GATEWAY, WEBSPEAK_TS_CLIENT: "" }).teamSpeakClient).toBe("native");
    expect(() => readGatewayEnv({ ...GATEWAY, WEBSPEAK_TS_CLIENT: "both" })).toThrow("WEBSPEAK_TS_CLIENT must be sdk or native");
  });
});

describe("readMode", () => {
  it("is required and is gateway or relay", () => {
    expect(readMode({ WEBSPEAK_MODE: "gateway" })).toBe("gateway");
    expect(readMode({ WEBSPEAK_MODE: " Relay " })).toBe("relay");
    expect(() => readMode({})).toThrow(/WEBSPEAK_MODE is not set/);
    expect(() => readMode({ WEBSPEAK_MODE: "" })).toThrow("WEBSPEAK_MODE must be gateway or relay");
    expect(() => readMode({ WEBSPEAK_MODE: "both" })).toThrow("WEBSPEAK_MODE must be gateway or relay");
  });
});

describe("readDataDir", () => {
  it("needs only the data directory", () => {
    expect(readDataDir({ WEBSPEAK_DATA_DIR: "/data" })).toBe("/data");
    expect(() => readDataDir({})).toThrow(/WEBSPEAK_DATA_DIR is not set/);
    expect(() => readDataDir({ WEBSPEAK_DATA_DIR: " " })).toThrow("must not be empty");
  });
});

describe("readRelayEnv", () => {
  it("reads the relay variables", () => {
    expect(readRelayEnv(RELAY)).toEqual({ token: "token", host: "0.0.0.0", port: 39087, allowPrivate: false });
    expect(readRelayEnv({ ...RELAY, WEBSPEAK_RELAY_ALLOW_PRIVATE: "true", WEBSPEAK_RELAY_PORT: "40000" })).toMatchObject({
      allowPrivate: true,
      port: 40000,
    });
  });

  it("needs all of them, and a token that is not empty", () => {
    expect(() => readRelayEnv({})).toThrow(
      /WEBSPEAK_RELAY_TOKEN, WEBSPEAK_RELAY_HOST, WEBSPEAK_RELAY_PORT, WEBSPEAK_RELAY_ALLOW_PRIVATE are not set/,
    );
    expect(() => readRelayEnv({ ...RELAY, WEBSPEAK_RELAY_TOKEN: "" })).toThrow("WEBSPEAK_RELAY_TOKEN must not be empty");
  });

  it("no longer reads the old WEBSPEAK_ACCELERATION_RELAY_* names", () => {
    expect(() => readRelayEnv({ WEBSPEAK_ACCELERATION_RELAY_TOKEN: "t" })).toThrow(/not set/);
  });
});

describe("loadEnvFile", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    delete process.env.WEBSPEAK_TEST_ENV_FILE_A;
    delete process.env.WEBSPEAK_TEST_ENV_FILE_B;
  });

  function envFile(text: string): string {
    const dir = mkdtempSync(join(tmpdir(), "webspeak-env-"));
    dirs.push(dir);
    const path = join(dir, ".env");
    writeFileSync(path, text);
    return path;
  }

  it("fills variables from the file but lets the real environment win", () => {
    process.env.WEBSPEAK_TEST_ENV_FILE_A = "from-environment";
    expect(loadEnvFile(envFile('WEBSPEAK_TEST_ENV_FILE_A=from-file\nWEBSPEAK_TEST_ENV_FILE_B="quoted value"\n'))).toBe(true);
    expect(process.env.WEBSPEAK_TEST_ENV_FILE_A).toBe("from-environment");
    expect(process.env.WEBSPEAK_TEST_ENV_FILE_B).toBe("quoted value");
  });

  it("reports a missing file instead of failing", () => {
    expect(loadEnvFile(join(tmpdir(), "webspeak-no-such-dir", ".env"))).toBe(false);
  });
});
