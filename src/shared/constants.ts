/** Hard safety ceiling for independently connected browser sessions. */
export const MAX_ACTIVE_SESSIONS = 100;

export function canAcceptSession(activeSessionCount: number): boolean {
  return Number.isInteger(activeSessionCount) && activeSessionCount >= 0 && activeSessionCount < MAX_ACTIVE_SESSIONS;
}
