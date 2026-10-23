import { expect } from "vitest";
import type { Gateway } from "./gateway.js";
import type { JoinTicketPayload } from "../../src/modules/join/joinTicket.js";
import { DEFAULT_SERVER_ID, serverInput, settingsInput } from "./adminService.js";

const JSON_HEADERS = { "content-type": "application/json" };

/** Joins the default server, unless the body already names a server, an address or an invite. */
function withServer(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  return "serverId" in body || "target" in body || "invite" in body ? body : { serverId: DEFAULT_SERVER_ID, ...body };
}

export async function post(gateway: Gateway, body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  const response = await gateway.request("/api/join-ticket", { method: "POST", headers, body: JSON.stringify(withServer(body)) });
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
}

/** Asks for a ticket, expects one, and returns what the gateway stored behind it. */
export async function issued(gateway: Gateway, body: unknown): Promise<JoinTicketPayload> {
  const { status, body: result } = await post(gateway, body);
  expect(status, JSON.stringify(result)).toBe(201);
  const payload = gateway.joinTickets.consume(result.ticket as string);
  expect(payload).not.toBeNull();
  return payload!;
}

/** Sets the access mode and the default server, which stands for the single target of earlier builds. */
export function configure(
  gateway: Gateway,
  {
    target,
    serverPassword,
    passwordAction,
    ...settings
  }: NonNullable<Parameters<typeof settingsInput>[0]> & NonNullable<Parameters<typeof serverInput>[0]>,
) {
  gateway.adminService.updateSettings(settingsInput(settings));
  gateway.adminService.updateServer(
    DEFAULT_SERVER_ID,
    serverInput({
      ...(target ? { target } : {}),
      ...(serverPassword === undefined ? {} : { serverPassword }),
      ...(passwordAction ? { passwordAction } : {}),
    }),
  );
}
