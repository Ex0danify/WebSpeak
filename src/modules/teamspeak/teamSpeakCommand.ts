import { buildCommand } from "../../lib/teamspeak/index.js";

/** For modules that may not import lib/teamspeak themselves. */
export function buildTeamSpeakCommand(command: string, params: Record<string, string>): string {
  return buildCommand(command, params);
}
