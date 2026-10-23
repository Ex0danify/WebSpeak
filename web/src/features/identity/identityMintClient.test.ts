import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkIdentityStatus, IdentityMintError, mintIdentity, validateIdentity } from "@/features/identity/identityMintClient";

function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("mintIdentity", () => {
  it("relays position and minting, resolving with the identity across chunk boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'event: position\ndata: {"ahead":2}\n\n',
          'event: position\ndata: {"ahead":0}\n\n',
          'event: minting\ndata: {"level":8}\n\n',
          'event: identity\ndata: {"identity":"mat",',
          '"level":8}\n\n',
        ]),
      ),
    );
    const positions: number[] = [];
    const levels: number[] = [];
    const result = await mintIdentity({ level: 8, onPosition: (a) => positions.push(a), onMinting: (l) => levels.push(l) });
    expect(positions).toEqual([2, 0]);
    expect(levels).toEqual([8]);
    expect(result).toEqual({ identity: "mat", level: 8 });
  });

  it("throws the gateway code from a stream error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(['event: error\ndata: {"code":"MINT_FAILED"}\n\n'])),
    );
    await expect(mintIdentity()).rejects.toMatchObject({ code: "MINT_FAILED" });
  });

  it("throws the gateway code from a pre-stream rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, code: "LEVEL_TOO_HIGH" }, 400)),
    );
    await expect(mintIdentity({ level: 99 })).rejects.toBeInstanceOf(IdentityMintError);
    await expect(mintIdentity({ level: 99 })).rejects.toMatchObject({ code: "LEVEL_TOO_HIGH" });
  });

  it("sends a level only when one is given", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return sseResponse(['event: identity\ndata: {"identity":"m","level":4}\n\n']);
    });
    vi.stubGlobal("fetch", fetchMock);
    await mintIdentity();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({});
    await mintIdentity({ level: 4 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ level: 4 });
  });
});

describe("validateIdentity", () => {
  it("returns the reported security level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, level: 6 }, 200)),
    );
    expect(await validateIdentity("material")).toBe(6);
  });

  it("throws the gateway code when rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, code: "INVALID_IDENTITY" }, 400)),
    );
    await expect(validateIdentity("bad")).rejects.toMatchObject({ code: "INVALID_IDENTITY" });
  });
});

describe("checkIdentityStatus", () => {
  it("returns true only when the gateway reports the identity in use", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, inUse: true }, 200)),
    );
    expect(await checkIdentityStatus("material", "host:9987")).toBe(true);
  });

  it("sends the target only when one is given", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return jsonResponse({ ok: true, inUse: false }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    await checkIdentityStatus("material", "");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ identity: "material" });
    await checkIdentityStatus("material", "host:9987");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ identity: "material", target: "host:9987" });
  });

  it("asks about a configured server by id instead of an address", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return jsonResponse({ ok: true, inUse: false }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    await checkIdentityStatus("material", "host:9987", undefined, "server-a");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ identity: "material", serverId: "server-a" });
  });

  it("treats a failed request as not in use rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await checkIdentityStatus("material", "host:9987")).toBe(false);
  });
});
