const MINT_URL = "/api/identity";
const VALIDATE_URL = "/api/identity/validate";
const STATUS_URL = "/api/identity/status";

/** A gateway identity endpoint rejected the request; `code` is the server's error code. */
export class IdentityMintError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IdentityMintError";
  }
}

export interface MintOptions {
  /** Requested security level; omitted lets the gateway pick its default. */
  level?: number;
  signal?: AbortSignal;
  /** Live queue position while waiting for a worker slot. */
  onPosition?: (ahead: number) => void;
  /** Minting has started on a worker. */
  onMinting?: (level: number) => void;
}

export interface MintResult {
  identity: string;
  level: number;
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown };
    if (typeof body.code === "string") return body.code;
  } catch {
    // A non-JSON body leaves only the generic code.
  }
  return "MINT_FAILED";
}

/** Streams a mint from `POST /api/identity`, relaying queue position and minting start to the caller.
 *  Resolves with the identity material, or throws `IdentityMintError` with the gateway's code. */
export async function mintIdentity({ level, signal, onPosition, onMinting }: MintOptions = {}): Promise<MintResult> {
  const response = await fetch(MINT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(typeof level === "number" ? { level } : {}),
    cache: "no-store",
    signal,
  });
  // Rejections before the stream commits (origin, rate limit, level, busy) arrive as a JSON error.
  if (!response.ok || !response.body) throw new IdentityMintError(await errorCode(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: MintResult | undefined;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] ?? "null") as Record<string, unknown>;
      if (event === "position") onPosition?.(data.ahead as number);
      else if (event === "minting") onMinting?.(data.level as number);
      else if (event === "identity") result = { identity: data.identity as string, level: data.level as number };
      else if (event === "error") throw new IdentityMintError((data.code as string) ?? "MINT_FAILED");
    }
  }

  if (!result) throw new IdentityMintError("MINT_FAILED");
  return result;
}

/** Validates identity material via `POST /api/identity/validate`, returning its security level.
 *  Throws `IdentityMintError("INVALID_IDENTITY")` when the gateway rejects it. */
export async function validateIdentity(material: string, signal?: AbortSignal): Promise<number> {
  const response = await fetch(VALIDATE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ identity: material }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new IdentityMintError(await errorCode(response));
  const body = (await response.json()) as { level?: unknown };
  return typeof body.level === "number" ? body.level : 0;
}

/** Best-effort check of whether `material` is already live on the server in another page, via
 *  `POST /api/identity/status`. The server is a configured one by `serverId`, else a typed `target`.
 *  Returns false on any failure so the hint never blocks a connection. */
export async function checkIdentityStatus(material: string, target: string, signal?: AbortSignal, serverId = ""): Promise<boolean> {
  try {
    const response = await fetch(STATUS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(serverId ? { identity: material, serverId } : target ? { identity: material, target } : { identity: material }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { inUse?: unknown };
    return body.inUse === true;
  } catch {
    return false;
  }
}
