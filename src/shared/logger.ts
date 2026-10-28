import pino from "pino";
import { appendFile, closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync } from "node:fs";
import { Writable } from "node:stream";

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MAX_ROTATED_LOGS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_CHECK_MS = 60 * 60 * 1000;

export interface Logger {
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LogRetention {
  /** Log files keep their lines for about this many days, on top of the size limit. No effect without a log directory. */
  setLogRetentionDays(days: number): void;
}

export function createLogger(logDir?: string): Logger & LogRetention {
  const loggerOptions = {
    level: "debug",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ["password", "*.password", "serverPassword", "*.serverPassword", "token", "*.token", "identity", "*.identity"],
      censor: "[Redacted]",
    },
  };
  const file = logDir ? createFileLogger(loggerOptions, `${logDir}/webspeak.log`) : undefined;
  const baseLogger = file ? file.logger : pino(loggerOptions, pino.destination(1));

  function wrap(l: pino.Logger): Logger {
    function doLog(level: "debug" | "info" | "warn" | "error", objOrMsg: Record<string, unknown> | string, msg?: string): void {
      if (typeof objOrMsg === "string") {
        l[level](objOrMsg);
      } else {
        l[level](objOrMsg, msg);
      }
    }

    return {
      debug: (objOrMsg: Record<string, unknown> | string, msg?: string) => doLog("debug", objOrMsg, msg),
      info: (objOrMsg: Record<string, unknown> | string, msg?: string) => doLog("info", objOrMsg, msg),
      warn: (objOrMsg: Record<string, unknown> | string, msg?: string) => doLog("warn", objOrMsg, msg),
      error: (objOrMsg: Record<string, unknown> | string, msg?: string) => doLog("error", objOrMsg, msg),
      child: (bindings: Record<string, unknown>) => wrap(l.child(bindings)),
    };
  }

  return { ...wrap(baseLogger), setLogRetentionDays: (days) => file?.stream.setRetentionDays(days) };
}

function createFileLogger(
  options: { level: string; timestamp: typeof pino.stdTimeFunctions.isoTime },
  logPath: string,
): { logger: pino.Logger; stream: RotatingFileStream } {
  mkdirSync(logPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
  const stream = new RotatingFileStream(logPath);
  return {
    logger: pino(
      options,
      pino.multistream([
        { level: "info", stream: process.stdout },
        { level: "debug", stream },
      ]),
    ),
    stream,
  };
}

/** Writes the log file and rotates it by size, and by age once a retention is set. */
export class RotatingFileStream extends Writable {
  private bytes: number;
  /** When the oldest line in the file was written, null while it is empty. */
  private oldestAt: number | null;
  private writing = false;
  private retentionMs: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly filePath: string) {
    super();
    this.bytes = existsSync(filePath) ? statSync(filePath).size : 0;
    this.oldestAt = this.bytes > 0 ? readFirstLineTime(filePath) : null;
    if (this.bytes >= MAX_LOG_BYTES) this.rotate();
  }

  /**
   * A line should be gone about `days` after it was written. The file rotates once its oldest line is half that old and a
   * rotated file goes once its newest line is, so a line is never kept much longer than the limit.
   */
  setRetentionDays(days: number): void {
    this.retentionMs = days * DAY_MS;
    this.enforceRetention();
    this.timer ??= setInterval(() => this.enforceRetention(), RETENTION_CHECK_MS);
    this.timer.unref();
  }

  override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding);
    this.writing = true;
    const done = (error?: Error | null) => {
      this.writing = false;
      callback(error);
    };
    try {
      if (this.bytes + buffer.length > MAX_LOG_BYTES) this.rotate();
      this.oldestAt ??= Date.now();
      appendFile(this.filePath, buffer, (error) => {
        if (!error) this.bytes += buffer.length;
        done(error);
      });
    } catch (error: unknown) {
      done(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    callback(error);
  }

  private enforceRetention(now = Date.now()): void {
    if (this.retentionMs === null) return;
    const half = this.retentionMs / 2;
    // A write in flight goes to the file it opened, so the active file only moves while none is.
    if (!this.writing && this.oldestAt !== null && this.bytes > 0 && now - this.oldestAt >= half) this.rotate();
    for (let index = 1; index <= MAX_ROTATED_LOGS; index++) {
      const rotated = `${this.filePath}.${index}`;
      try {
        if (existsSync(rotated) && now - statSync(rotated).mtimeMs >= half) rmSync(rotated);
      } catch {
        /* a file that is gone or locked is tried again next time */
      }
    }
  }

  private rotate(): void {
    // The rotated file lives on as long as the newest line it holds, that is when it was last written to.
    for (let index = MAX_ROTATED_LOGS - 1; index >= 1; index--) {
      const source = `${this.filePath}.${index}`;
      const destination = `${this.filePath}.${index + 1}`;
      if (existsSync(source)) renameSync(source, destination);
    }
    if (existsSync(this.filePath)) renameSync(this.filePath, `${this.filePath}.1`);
    this.bytes = 0;
    this.oldestAt = null;
  }
}

/** When the first line of an existing log was written, from its `time`. A file that does not say is taken as written when it was last touched. */
function readFirstLineTime(filePath: string): number {
  const fallback = statSync(filePath).mtimeMs;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(filePath, "r");
    const head = Buffer.alloc(512);
    const read = readSync(descriptor, head, 0, head.length, 0);
    const match = /"time":"([^"]+)"/.exec(head.toString("utf8", 0, read));
    const time = match ? Date.parse(match[1]!) : Number.NaN;
    return Number.isNaN(time) ? fallback : time;
  } catch {
    return fallback;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
