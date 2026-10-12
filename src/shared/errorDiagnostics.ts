/** What a failure carries that is worth logging, gathered along its `cause` chain. */
export interface TeamSpeakErrorDiagnostics {
  name?: string;
  code?: string;
  id?: string;
  serverMessage?: string;
  message?: string;
  syscall?: string;
  address?: string;
  port?: number | string;
  cause?: string;
}

export function diagnosticText(error: unknown): string {
  const values: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) values.push(current.name, current.message);
    else values.push(String(current));
    if (typeof current === "object") {
      const candidate = current as { code?: unknown; id?: unknown; serverMessage?: unknown; cause?: unknown };
      for (const value of [candidate.code, candidate.id, candidate.serverMessage]) if (value !== undefined) values.push(String(value));
      current = candidate.cause;
    } else break;
  }
  return values.join(" ");
}

export function collectDiagnostics(error: unknown): TeamSpeakErrorDiagnostics {
  const result: TeamSpeakErrorDiagnostics = {};
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      result.name ??= current.name;
      result.message ??= current.message;
      const errorRecord = current as Error & Record<string, unknown>;
      if (typeof errorRecord.code === "string" || typeof errorRecord.code === "number") result.code ??= String(errorRecord.code);
      if (typeof errorRecord.id === "string" || typeof errorRecord.id === "number") result.id ??= String(errorRecord.id);
      if (typeof errorRecord.serverMessage === "string") result.serverMessage ??= errorRecord.serverMessage;
      if (typeof errorRecord.syscall === "string") result.syscall ??= errorRecord.syscall;
      if (typeof errorRecord.address === "string") result.address ??= errorRecord.address;
      if (typeof errorRecord.port === "string" || typeof errorRecord.port === "number") result.port ??= errorRecord.port;
      const cause = current.cause;
      if (cause && cause !== current) {
        current = cause;
        continue;
      }
      break;
    }
    if (typeof current !== "object") {
      result.cause ??= String(current);
      break;
    }
    const candidate = current as Record<string, unknown>;
    if (typeof candidate.name === "string") result.name ??= candidate.name;
    if (typeof candidate.code === "string" || typeof candidate.code === "number") result.code ??= String(candidate.code);
    if (typeof candidate.id === "string" || typeof candidate.id === "number") result.id ??= String(candidate.id);
    if (typeof candidate.serverMessage === "string") result.serverMessage ??= candidate.serverMessage;
    if (typeof candidate.message === "string") result.message ??= candidate.message;
    if (typeof candidate.syscall === "string") result.syscall ??= candidate.syscall;
    if (typeof candidate.address === "string") result.address ??= candidate.address;
    if (typeof candidate.port === "string" || typeof candidate.port === "number") result.port ??= candidate.port;
    const cause = candidate.cause;
    if (cause && cause !== current) {
      current = cause;
      continue;
    }
    break;
  }
  return result;
}
