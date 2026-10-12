import express from "express";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { resolveSafeOpenTarget } from "../../../infra/security/openTargetPolicy.js";
import type { JoinRateLimiter, ServerPasswordBackoff } from "../../../modules/join/index.js";
import { isRecord } from "../../../shared/typeGuards.js";
import { clientRateLimitKey } from "../../../shared/http/clientIp.js";
import { isSameOrigin } from "../../../shared/http/sameOrigin.js";
import { parseTeamSpeakTarget, teamSpeakTargetKey } from "../../../shared/teamSpeakTarget.js";
import type { WebServerOptions } from "../webServerOptions.js";
import { resolveAccelerationOptions } from "./accelerationOptions.js";

/** `POST /api/join-ticket`: validates the request, applies the access policy and issues a ticket. */
export function registerJoinRoutes(
  app: express.Express,
  options: WebServerOptions,
  joinRateLimiter: JoinRateLimiter,
  passwordBackoff: ServerPasswordBackoff,
): void {
  app.post("/api/join-ticket", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!request.is("application/json") || !isSameOrigin(request)) {
      response.status(403).json({ ok: false, code: "ORIGIN_REJECTED" });
      return;
    }
    if (!options.adminService.isInitialized()) {
      response.status(503).json({ ok: false, code: "NOT_INITIALIZED" });
      return;
    }
    if (!joinRateLimiter.allow(clientRateLimitKey(request))) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";
    const requestedChannel = typeof body.channel === "string" ? body.channel.trim().slice(0, 100) : "";
    const inviteToken = typeof body.invite === "string" ? body.invite.trim().slice(0, 128) : "";
    const requestedIdentity = typeof body.identity === "string" && body.identity.length <= 8192 ? body.identity : "";
    let identity: string | undefined;
    if (requestedIdentity) {
      try {
        identityFromString(requestedIdentity);
        identity = requestedIdentity;
      } catch {
        // A stale/corrupt local identity must not block a normal ephemeral join.
      }
    }
    if (!nickname) {
      response.status(400).json({ ok: false, code: "INVALID_NICKNAME" });
      return;
    }

    // Everything that can refuse the request comes before the invite is used up.
    const requestedRelayId = typeof body.accelerationRelayId === "string" ? body.accelerationRelayId.trim().slice(0, 110) : "";
    const accelerationRequested = body.accelerated === true || Boolean(requestedRelayId);
    const acceleration = resolveAccelerationOptions(options.voiceBridgeOptions.acceleration);
    if (accelerationRequested && acceleration.length === 0) {
      response.status(400).json({ ok: false, code: "ACCELERATION_UNAVAILABLE" });
      return;
    }
    if (requestedRelayId && !acceleration.some((relay) => relay.id === requestedRelayId)) {
      response.status(400).json({ ok: false, code: "ACCELERATION_UNAVAILABLE" });
      return;
    }

    const policy = options.adminService.getConnectionPolicy();
    const managedInvite = inviteToken ? options.adminService.consumeManagedInvite(inviteToken) : null;
    if (inviteToken && !managedInvite) {
      response.status(400).json({ ok: false, code: "INVITE_INVALID" });
      return;
    }
    let target = managedInvite?.target ?? policy.defaultTarget;
    let serverPassword = managedInvite?.serverPassword ?? policy.serverPassword;
    let passwordFromVisitor = false;
    const channel = requestedChannel || managedInvite?.channel || "";
    if (!managedInvite) {
      try {
        if (policy.accessMode === "open" && typeof body.target === "string" && body.target.trim()) {
          target = parseTeamSpeakTarget(body.target);
          const isDefault = teamSpeakTargetKey(target) === teamSpeakTargetKey(policy.defaultTarget);
          // Open mode must protect the gateway even when the user submits the admin's default target. That
          // target only prefills the form, it is no trust boundary and must not bypass SSRF protection.
          target = await resolveSafeOpenTarget(target);
          const typed = typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : "";
          if (!isDefault) serverPassword = typed;
          else if (typed.trim()) serverPassword = typed;
          passwordFromVisitor = typed.trim() !== "" && serverPassword === typed;
        } else if (policy.accessMode === "fixed" && typeof body.serverPassword === "string" && body.serverPassword.trim()) {
          // The fixed target stays admin-controlled, but a user may retry its server password when the
          // gateway asks for one. The target itself never comes from this request.
          serverPassword = body.serverPassword.slice(0, 512);
          passwordFromVisitor = true;
        }
      } catch {
        response.status(400).json({ ok: false, code: "TARGET_NOT_ALLOWED" });
        return;
      }
    }

    const targetKey = teamSpeakTargetKey(target);
    if (passwordFromVisitor) {
      const waitMs = passwordBackoff.retryAfterMs(targetKey);
      if (waitMs > 0) {
        response.setHeader("Retry-After", String(Math.ceil(waitMs / 1000)));
        response.status(429).json({ ok: false, code: "RATE_LIMITED" });
        return;
      }
    }
    const ticket = options.voiceBridgeOptions.joinTickets.create({
      target,
      serverPassword,
      nickname,
      ...(passwordFromVisitor
        ? {
            reportPasswordOutcome: (accepted: boolean) =>
              accepted ? passwordBackoff.recordSuccess(targetKey) : passwordBackoff.recordFailure(targetKey),
          }
        : {}),
      ...(channel ? { channel } : {}),
      ...(identity ? { identity, rememberIdentity: true } : body.rememberIdentity === true ? { rememberIdentity: true } : {}),
      ...(accelerationRequested ? { accelerated: true, ...(requestedRelayId ? { accelerationRelayId: requestedRelayId } : {}) } : {}),
    });
    response.status(201).json({ ok: true, ticket });
  });
}
