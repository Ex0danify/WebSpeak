export const QUALITY_LEVELS = ["excellent", "good", "poor", "bad"] as const;
export type ConnectionQuality = (typeof QUALITY_LEVELS)[number];

/** Whatever a source can measure, a missing value does not count against the rating. */
export interface QualityInput {
  rttMs?: number | null;
  jitterMs?: number | null;
  lossPercent?: number | null;
}

// Upper bounds per level, anything above the last one is bad.
const LIMITS = {
  rttMs: [50, 100, 200],
  jitterMs: [10, 30, 60],
  lossPercent: [0.5, 2, 5],
} as const;

function rank(value: number | null | undefined, limits: readonly number[]): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const index = limits.findIndex((limit) => value < limit);
  return index === -1 ? limits.length : index;
}

/** The worst metric decides, since a single bad one ruins a call. Null while nothing was measured. */
export function rateConnection(input: QualityInput): ConnectionQuality | null {
  const ranks = [rank(input.rttMs, LIMITS.rttMs), rank(input.jitterMs, LIMITS.jitterMs), rank(input.lossPercent, LIMITS.lossPercent)];
  const measured = ranks.filter((value): value is number => value !== null);
  return measured.length ? QUALITY_LEVELS[Math.max(...measured)] : null;
}

/** Holds the shown level until a different one repeats, so a single odd sample does not flicker the badge. */
export function createQualityTracker(confirmations = 2) {
  let shown: ConnectionQuality | null = null;
  let candidate: ConnectionQuality | null = null;
  let streak = 0;
  return {
    next(rating: ConnectionQuality | null): ConnectionQuality | null {
      if (rating === null || shown === null) {
        shown = rating;
        candidate = null;
        streak = 0;
        return shown;
      }
      if (rating === shown) {
        candidate = null;
        streak = 0;
        return shown;
      }
      streak = rating === candidate ? streak + 1 : 1;
      candidate = rating;
      if (streak >= confirmations) {
        shown = rating;
        candidate = null;
        streak = 0;
      }
      return shown;
    },
    reset(): void {
      shown = candidate = null;
      streak = 0;
    },
  };
}
