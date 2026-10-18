import { describe, expect, it } from "vitest";
import { resolveAddress, type ResolveAddressOptions, type SrvRecord } from "./addressResolver.js";
import type { TsdnsQuery } from "./tsdns.js";

const record = (name: string, port: number, priority = 0, weight = 0): SrvRecord => ({ name, port, priority, weight });

/** DNS and TSDNS from tables. A missing entry fails like NXDOMAIN or a refused connection. */
function fakes(srv: Record<string, SrvRecord[]>, tsdns: Record<string, string> = {}) {
  const asked: string[] = [];
  const srvLookup = {
    resolveSrv: async (name: string) => {
      asked.push(`srv ${name}`);
      const records = srv[name];
      if (!records) throw Object.assign(new Error("queryNotFound"), { code: "ENOTFOUND" });
      return records;
    },
  };
  const tsdnsQuery: TsdnsQuery = async (server, name) => {
    asked.push(`tsdns ${server.host}:${server.port} ${name}`);
    const answer = tsdns[`${server.host}:${server.port}`];
    if (answer === undefined) throw new Error("ECONNREFUSED");
    return answer;
  };
  const options: ResolveAddressOptions = { srvLookup, tsdnsQuery };
  return { asked, options };
}

const never = new Promise<never>(() => undefined);

describe("resolveAddress", () => {
  it("takes IP literals as they are, also bracketed", async () => {
    const { asked, options } = fakes({});
    expect(await resolveAddress("192.0.2.7", { ...options, port: 9988 })).toEqual([{ host: "192.0.2.7", port: 9988, source: "direct" }]);
    expect(await resolveAddress("[2001:db8::1]", options)).toEqual([{ host: "2001:db8::1", port: 9987, source: "direct" }]);
    expect(asked).toEqual([]);
  });

  it("does not look up names without a dot, and has no nickname lookup", async () => {
    const { asked, options } = fakes({});
    expect(await resolveAddress("tsserver", options)).toEqual([{ host: "tsserver", port: 9987, source: "plain" }]);
    expect(await resolveAddress("localhost", options)).toEqual([{ host: "localhost", port: 9987, source: "plain" }]);
    expect(asked).toEqual([]);
  });

  it("prefers the SRV record, ordered by priority and weight, over the given port", async () => {
    const { asked, options } = fakes({
      "_ts3._udp.ts.example.com": [
        record("b.example.net.", 9990, 10, 5),
        record("a.example.net.", 9989, 5, 0),
        record("c.example.net", 9991, 10, 50),
        record("", 1),
        record("zero.example.net", 0),
      ],
    });
    expect(await resolveAddress("TS.Example.com.", { ...options, port: 9988 })).toEqual([
      { host: "a.example.net", port: 9989, source: "srv" },
      { host: "c.example.net", port: 9991, source: "srv" },
      { host: "b.example.net", port: 9990, source: "srv" },
    ]);
    expect(asked).toEqual(["srv _ts3._udp.ts.example.com"]);
  });

  it("asks TSDNS found through SRV, the most specific domain first", async () => {
    const { asked, options } = fakes(
      {
        "_tsdns._tcp.a.b.example.com": [record("dead.example.com", 41144)],
        "_tsdns._tcp.b.example.com": [record("tsdns2.example.com.", 41145, 1), record("tsdns1.example.com", 41144, 0)],
        "_tsdns._tcp.example.com": [record("tsdns3.example.com", 41144)],
      },
      { "tsdns1.example.com:41144": "404", "tsdns2.example.com:41145": "198.51.100.4:9999\n", "tsdns3.example.com:41144": "203.0.113.9:1" },
    );
    expect(await resolveAddress("a.b.example.com", options)).toEqual([{ host: "198.51.100.4", port: 9999, source: "tsdnsSrv" }]);
    expect(asked).toContain("tsdns tsdns1.example.com:41144 a.b.example.com");
    expect(asked.indexOf("tsdns tsdns1.example.com:41144 a.b.example.com")).toBeLessThan(
      asked.indexOf("tsdns tsdns2.example.com:41145 a.b.example.com"),
    );
  });

  it("asks TSDNS on its port of the name and up to two parent domains", async () => {
    const { asked, options } = fakes({}, { "example.com:41144": "voice.example.com", "b.example.com:41144": "errors" });
    expect(await resolveAddress("a.b.example.com", { ...options, port: 9988 })).toEqual([
      { host: "voice.example.com", port: 9988, source: "tsdns" },
    ]);
    expect(asked.filter((line) => line.startsWith("tsdns"))).toEqual([
      "tsdns a.b.example.com:41144 a.b.example.com",
      "tsdns b.example.com:41144 a.b.example.com",
      "tsdns example.com:41144 a.b.example.com",
    ]);

    const deep = fakes({});
    await resolveAddress("x.a.b.example.com", deep.options);
    expect(deep.asked.filter((line) => line.startsWith("tsdns"))).toHaveLength(3);
  });

  it("falls back to the name itself, and skips TSDNS when asked to", async () => {
    const { asked, options } = fakes({}, { "ts.example.com:41144": "198.51.100.4:9999" });
    expect(await resolveAddress("ts.example.com", { ...options, tsdns: false })).toEqual([
      { host: "ts.example.com", port: 9987, source: "plain" },
    ]);
    expect(asked).toEqual(["srv _ts3._udp.ts.example.com"]);
    expect(await resolveAddress("ts.example.com", { ...options, tsdnsPort: 5000 })).toEqual([
      { host: "ts.example.com", port: 9987, source: "plain" },
    ]);
  });

  it("treats a step that hangs as no answer", async () => {
    const options: ResolveAddressOptions = {
      srvLookup: { resolveSrv: () => never },
      tsdnsQuery: () => never,
      stepTimeoutMs: 20,
    };
    const started = performance.now();
    expect(await resolveAddress("ts.example.com", options)).toEqual([{ host: "ts.example.com", port: 9987, source: "plain" }]);
    // SRV, then the TSDNS steps side by side: three timeouts in a row, not one per domain.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("rejects with the abort reason, before and during the lookup", async () => {
    const reason = new Error("stop");
    await expect(resolveAddress("ts.example.com", { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    const controller = new AbortController();
    const resolving = resolveAddress("ts.example.com", { srvLookup: { resolveSrv: () => never }, signal: controller.signal });
    controller.abort(reason);
    await expect(resolving).rejects.toBe(reason);
  });

  it("refuses an empty host or a bad port", async () => {
    await expect(resolveAddress("  ")).rejects.toThrow(TypeError);
    await expect(resolveAddress("ts.example.com", { port: 0 })).rejects.toThrow(RangeError);
    await expect(resolveAddress("ts.example.com", { port: 65536 })).rejects.toThrow(RangeError);
  });
});
