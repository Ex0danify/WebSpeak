import type { AudioLinkStatus } from "@/features/room/dock/audioLinkStatus";

/** What the dock offers for sharing audio: no row, a working switch, or a switch that is off for a reason. */
export type AccompanimentAvailability = "hidden" | "ready" | "waiting" | "gatewayOff" | "fallback";

export interface AccompanimentAvailabilityInput {
  /** The browser can capture display audio at all. */
  supported: boolean;
  active: boolean;
  /** The gateway offers WebRTC. */
  webrtcAvailable: boolean;
  webrtcActive: boolean;
  connection: AudioLinkStatus;
}

/** Sharing needs live WebRTC. A connected link without it means the gateway has it off or the connection fell back to PCM. */
export function accompanimentAvailability(input: AccompanimentAvailabilityInput): AccompanimentAvailability {
  if (!input.supported) return "hidden";
  // A running share can always be stopped.
  if (input.active) return "ready";
  if (!input.webrtcAvailable) return "gatewayOff";
  if (input.connection !== "connected") return "waiting";
  return input.webrtcActive ? "ready" : "fallback";
}
