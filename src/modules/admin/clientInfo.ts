import Bowser from "bowser";
import type { ConnectionRecord } from "../../infra/persistence/database.js";

/** What a user agent says about the guest's browser. Parsed when read, so a newer parser also reads old rows. */
export interface ClientSummary {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  /** desktop, mobile, tablet or tv. */
  platform: string | null;
  engine: string | null;
}

export type ConnectionView = ConnectionRecord & { client: ClientSummary | null };

export function describeClient(userAgent: string | null): ClientSummary | null {
  if (!userAgent) return null;
  const { browser, os, platform, engine } = Bowser.parse(userAgent);
  return {
    browser: browser.name ?? null,
    browserVersion: browser.version ?? null,
    os: os.name ?? null,
    osVersion: os.version ?? null,
    platform: platform.type ?? null,
    engine: engine.name ?? null,
  };
}

export function withClient(record: ConnectionRecord): ConnectionView {
  return { ...record, client: describeClient(record.userAgent) };
}
