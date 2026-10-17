import { teamSpeakErrorIdName } from "./errorIds.js";

export class TeamSpeakError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TeamSpeakError";
  }
}

export interface TeamSpeakServerErrorFields {
  id: number;
  serverMessage: string;
  extraMessage?: string;
  failedPermissionId?: number;
  returnCode?: string;
}

/**
 * An `error id=… msg=…` answer with a non-zero id. The server text lives in `serverMessage`
 * because `message` is the composed text every Error has.
 */
export class TeamSpeakServerError extends TeamSpeakError {
  readonly id: number;
  readonly serverMessage: string;
  readonly extraMessage: string | undefined;
  readonly failedPermissionId: number | undefined;
  readonly returnCode: string | undefined;

  constructor(fields: TeamSpeakServerErrorFields) {
    const extra = fields.extraMessage ? `, ${fields.extraMessage}` : "";
    super(`TeamSpeak server error: ${fields.serverMessage}${extra} (id=${fields.id})`);
    this.name = "TeamSpeakServerError";
    this.id = fields.id;
    this.serverMessage = fields.serverMessage;
    this.extraMessage = fields.extraMessage;
    this.failedPermissionId = fields.failedPermissionId;
    this.returnCode = fields.returnCode;
  }

  /** The camelCase name from errorIds.ts, undefined for ids we do not name. */
  get idName(): string | undefined {
    return teamSpeakErrorIdName(this.id);
  }
}

export type TeamSpeakTransportErrorCode =
  "timeout" | "ackTimeout" | "socketError" | "handshakeFailed" | "cryptoInit" | "closedByServer" | "malformedData";

export class TeamSpeakTransportError extends TeamSpeakError {
  readonly code: TeamSpeakTransportErrorCode;

  constructor(code: TeamSpeakTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TeamSpeakTransportError";
    this.code = code;
  }
}

export class CommandTimeoutError extends TeamSpeakError {
  readonly command: string;
  readonly timeoutMs: number;

  constructor(command: string, timeoutMs: number) {
    super(`TeamSpeak command ${command} got no answer within ${timeoutMs} ms`);
    this.name = "CommandTimeoutError";
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

/** A failed connection setup. A refusal by the server keeps the TeamSpeakServerError as `cause`. */
export class HandshakeError extends TeamSpeakError {
  readonly step: string;

  constructor(step: string, message: string, options?: ErrorOptions) {
    super(`TeamSpeak handshake failed at ${step}: ${message}`, options);
    this.name = "HandshakeError";
    this.step = step;
  }
}
