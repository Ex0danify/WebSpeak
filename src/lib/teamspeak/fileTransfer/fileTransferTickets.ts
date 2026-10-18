import { FileTransferError, TeamSpeakServerError } from "../errors/teamSpeakErrors.js";
import type { CommandRow } from "../wire/commandRows.js";
import type { CommandValue } from "../wire/commandText.js";
import { parseU16, parseU32, parseU64 } from "../wire/commandValues.js";

/** What the file server expects: connect to `port`, send `key`, read `size` bytes. */
export interface DownloadTicket {
  serverTransferId: number;
  key: string;
  port: number;
  size: bigint;
}

export interface DownloadRequest {
  /** 0 for the server's own files, avatars among them. */
  channelId: bigint;
  /** Absolute, like `/avatar_<client_base64HashClientUID>`. */
  path: string;
}

export interface FileTransferTimers {
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface PendingDownload {
  readonly clientTransferId: number;
  /** The server's answer, also when it came before this call. */
  ticket(timeoutMs: number, signal?: AbortSignal): Promise<DownloadTicket>;
  /** Frees the id. Late notifications for it are not ours any more. */
  release(): void;
}

const MAX_PATH_LENGTH = 1024;
const TICKET_KEY = /^[\x21-\x7e]{1,64}$/;

export function ftInitDownload(clientTransferId: number, request: DownloadRequest): { name: string; params: [string, CommandValue][] } {
  const { channelId, path } = request;
  if (channelId < 0n || channelId > 0xffff_ffff_ffff_ffffn) throw new RangeError(`Invalid TeamSpeak channel id: ${channelId}`);
  if (!path.startsWith("/") || path.length > MAX_PATH_LENGTH) throw new RangeError("TeamSpeak file path must be absolute");
  return {
    name: "ftinitdownload",
    params: [
      ["clientftfid", clientTransferId],
      ["name", path],
      ["cid", channelId],
      ["cpw", ""],
      ["seekpos", 0],
      ["proto", 1],
    ],
  };
}

function parseTicket(row: CommandRow): DownloadTicket {
  const serverTransferId = parseU16(row.serverftfid);
  const port = parseU16(row.port);
  const size = parseU64(row.size);
  const key = row.ftkey;
  if (serverTransferId === undefined || !port || size === undefined || key === undefined || !TICKET_KEY.test(key)) {
    throw new FileTransferError("malformedTicket", "TeamSpeak sent an unusable download ticket");
  }
  return { serverTransferId, key, port, size };
}

interface Entry {
  result: DownloadTicket | Error | undefined;
  wake: (() => void) | undefined;
}

/**
 * Matches `notifystartdownload` and `notifystatusfiletransfer` to downloads by `clientftfid`.
 * They are plain notifications without a return code, and TS6 sends them before the answer to
 * `ftinitdownload`, so a download is registered before its command goes out.
 */
export class FileTransferTickets {
  readonly #timers: FileTransferTimers;
  readonly #pending = new Map<number, Entry>();
  #lastId = 0;
  #closedWith: Error | undefined;

  constructor(timers: FileTransferTimers) {
    this.#timers = timers;
  }

  open(): PendingDownload {
    if (this.#closedWith) throw this.#closedWith;
    const id = this.#nextId();
    const entry: Entry = { result: undefined, wake: undefined };
    this.#pending.set(id, entry);
    return {
      clientTransferId: id,
      ticket: (timeoutMs, signal) => this.#wait(entry, timeoutMs, signal),
      release: () => {
        if (this.#pending.get(id) === entry) this.#pending.delete(id);
      },
    };
  }

  /** True when the notification belonged to a pending download. */
  receive(name: string, row: CommandRow | undefined): boolean {
    if (name !== "notifystartdownload" && name !== "notifystatusfiletransfer") return false;
    const entry = this.#pending.get(parseU16(row?.clientftfid) ?? -1);
    if (!entry || entry.result) return false;
    if (name === "notifystartdownload") {
      try {
        entry.result = parseTicket(row!);
      } catch (error) {
        entry.result = error as FileTransferError;
      }
    } else {
      entry.result = new TeamSpeakServerError({ id: parseU32(row!.status) ?? 0, serverMessage: row!.msg ?? "" });
    }
    entry.wake?.();
    return true;
  }

  /** Fails every download still waiting for its ticket, and every later one. */
  close(error: Error): void {
    this.#closedWith ??= error;
    for (const entry of this.#pending.values()) {
      entry.result ??= error;
      entry.wake?.();
    }
  }

  #nextId(): number {
    for (;;) {
      this.#lastId = (this.#lastId % 0xffff) + 1;
      if (!this.#pending.has(this.#lastId)) return this.#lastId;
    }
  }

  #wait(entry: Entry, timeoutMs: number, signal: AbortSignal | undefined): Promise<DownloadTicket> {
    return new Promise((resolve, reject) => {
      const settle = () => {
        this.#timers.clearTimer(timer);
        signal?.removeEventListener("abort", onAbort);
        entry.wake = undefined;
        const result = entry.result!;
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const onAbort = () => {
        entry.result ??= signal!.reason instanceof Error ? signal!.reason : new Error("aborted");
        settle();
      };
      const timer = this.#timers.setTimer(() => {
        entry.result ??= new FileTransferError("timeout", `TeamSpeak sent no download ticket within ${timeoutMs} ms`);
        settle();
      }, timeoutMs);
      entry.wake = settle;
      if (entry.result) settle();
      else if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
