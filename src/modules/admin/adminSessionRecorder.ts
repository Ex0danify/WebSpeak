import type { Logger } from "../../shared/logger.js";
import type { WebSpeakDatabase } from "../../infra/persistence/database.js";
import type { SessionEnd, SessionRecorder, SessionStart } from "../voice/index.js";
import type { GatewayEvents } from "./adminGatewayEvents.js";

/** Keeps every session as a connection record and writes its start and end to the event log. */
export class SessionHistoryRecorder implements SessionRecorder {
  constructor(
    private readonly database: WebSpeakDatabase,
    private readonly gatewayEvents: GatewayEvents,
    private readonly logger: Logger,
  ) {}

  started(session: SessionStart): void {
    this.guard("started", () =>
      this.database.beginConnection({
        id: session.id,
        nickname: session.nickname,
        clientIp: session.clientIp,
        target: session.target,
        relayName: session.relay?.name ?? null,
        relayTarget: session.relay?.target ?? null,
        userAgent: session.userAgent ?? null,
      }),
    );
  }

  connected(sessionId: string): void {
    this.guard("connected", () => {
      this.database.markConnectionConnected(sessionId);
      const record = this.database.getConnection(sessionId);
      if (record) this.database.addAudit("SESSION_CONNECTED", describe(record));
    });
  }

  ended(sessionId: string, end: SessionEnd): void {
    this.guard("ended", () => {
      const connected = this.database.getConnection(sessionId)?.connectedAt != null;
      const record = this.database.finishConnection(sessionId, {
        // A session that never connected shows the generic failure when nothing traced it.
        reason: end.failureCode ?? (connected ? null : "CONNECTION_FAILED"),
        failureDetail: end.failureDetail ?? null,
        durationSeconds: end.durationSeconds,
        audio: end.audio,
      });
      if (!record) return;
      const details = { ...describe(record), endedBy: end.reason, ...(record.reason ? { code: record.reason } : {}) };
      if (record.status === "failed") {
        this.database.addAudit("SESSION_CONNECT_FAILED", { ...details, ...(record.failureDetail ? { detail: record.failureDetail } : {}) });
      } else {
        this.database.addAudit("SESSION_ENDED", { ...details, durationSeconds: record.durationSeconds });
      }
    });
  }

  capacityReached(maxSessions: number): void {
    this.gatewayEvents.capacityReached(maxSessions);
  }

  // A full or closed database must not break a voice session.
  private guard(step: string, action: () => void): void {
    try {
      action();
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error), step }, "Could not record the session");
    }
  }
}

function describe(record: { id: string; nickname: string; clientIp: string; target: string; relayName: string | null }) {
  return {
    id: record.id,
    nickname: record.nickname,
    clientIp: record.clientIp,
    target: record.target,
    ...(record.relayName ? { relayName: record.relayName } : {}),
  };
}
