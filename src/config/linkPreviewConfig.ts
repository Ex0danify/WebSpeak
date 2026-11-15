const KIB = 1024;
const MIB = 1024 * KIB;

/** Size limits of the link preview fetcher, admin-configurable and persisted. All values are bytes. */
export interface LinkPreviewLimits {
  /** An image up to this size is sent along with the preview. */
  imageBytes: number;
  /** A larger image up to this size is sent only when the user asks for it. */
  clickImageBytes: number;
  svgBytes: number;
  /** Everything the in-memory cache may hold. */
  cacheBytes: number;
}

export const DEFAULT_LINK_PREVIEW_LIMITS: LinkPreviewLimits = {
  imageBytes: MIB,
  clickImageBytes: 8 * MIB,
  svgBytes: 128 * KIB,
  cacheBytes: 32 * MIB,
};

export const LINK_PREVIEW_LIMIT_BOUNDS: Record<keyof LinkPreviewLimits, readonly [min: number, max: number]> = {
  imageBytes: [64 * KIB, 4 * MIB],
  clickImageBytes: [MIB, 32 * MIB],
  svgBytes: [16 * KIB, MIB],
  cacheBytes: [4 * MIB, 256 * MIB],
};
