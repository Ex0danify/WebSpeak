/**
 * What the server's refusal of a banned identity says about the ban, from its `extra_msg`: `You are banned temporarily.
 * Reason: "..."` and `Try again in 00:59:58` for a timed ban, `Try again in 6d 23:59:59` from a day on. Returns the seconds
 * left, 0 for a ban for good, and undefined for a text it does not know, so a different wording costs the time on the banner
 * and nothing else.
 */
export function banSecondsFromNotice(extraMessage: string | undefined): number | undefined {
  if (!extraMessage) return undefined;
  const left = /Try again in (?:(\d+)d )?(\d+):(\d{2}):(\d{2})/i.exec(extraMessage);
  if (left) return Number(left[1] ?? 0) * 86400 + Number(left[2]) * 3600 + Number(left[3]) * 60 + Number(left[4]);
  return /\bpermanent/i.test(extraMessage) ? 0 : undefined;
}
