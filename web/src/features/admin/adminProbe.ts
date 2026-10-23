import type { MessageKey } from "@/shared/i18n/messageKeys";
import type { ProbeState } from "@/features/admin/adminServerForm.js";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Headline and detail line for a connection test result, shared by every place that runs one. */
export function createProbeText(t: Translate, connectionFailureText: (code?: string) => string) {
  function probeTitle(result: ProbeState): string {
    if (result.ok) return t("serverAnswered");
    const names: Record<string, MessageKey> = {
      INVALID_TARGET: "serverAddress",
      INVALID_NICKNAME: "invalidNicknameError",
      HOST_NOT_FOUND: "hostNotFoundError",
      UNREACHABLE: "networkUnreachableError",
      CONNECTION_REFUSED: "connectionRefusedError",
      CONNECTION_RESET: "connectionResetError",
      TIMEOUT: "networkTimeoutError",
      PASSWORD_REQUIRED: "serverPasswordRequiredError",
      INVALID_PASSWORD: "invalidServerPasswordError",
      PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError",
      SERVER_REJECTED: "serverRejectedError",
      NO_ANSWER: "noAnswerError",
      PING_UNAVAILABLE: "pingUnavailableError",
    };
    return t(names[result.code ?? result.errorCode ?? ""] ?? "connectionFailed");
  }

  function probeText(result: ProbeState): string {
    const ping = result.hostPing;
    const hostPing =
      !ping || ping.errorCode === "PING_UNAVAILABLE"
        ? null
        : ping.ok
          ? `${t("hostPing")} ${ping.latencyMs} ms · ${t("packetLossRate")} ${ping.packetLossPercent}%`
          : t("hostPingNoAnswer");
    if (result.ok)
      return [t("serverAnsweredHint"), result.latencyMs == null ? null : `${result.latencyMs} ms`, hostPing].filter(Boolean).join(" · ");
    const code = result.code ?? result.errorCode;
    return [code === "NO_ANSWER" ? t("noAnswerHint") : connectionFailureText(code), hostPing].filter(Boolean).join(" · ");
  }

  return { probeTitle, probeText };
}
