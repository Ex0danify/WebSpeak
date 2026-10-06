export function buildTeamSpeakCommand(command: string, params: Record<string, string>): string {
  return [command, ...Object.entries(params).map(([key, value]) => `${key}=${escapeTeamSpeakValue(value)}`)].join(" ");
}

export function escapeTeamSpeakValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\s")
    .replace(/\//g, "\\/")
    .replace(/\|/g, "\\p")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}
