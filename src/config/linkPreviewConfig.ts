const KIB = 1024;

/** Size limits of the link preview fetcher in bytes, what the fetcher works with. */
export interface LinkPreviewLimits {
  /** An image up to this size is sent along with the preview. */
  imageBytes: number;
  /** A larger image up to this size is sent only when the user asks for it. */
  clickImageBytes: number;
  svgBytes: number;
  /** Everything the in-memory cache may hold. */
  cacheBytes: number;
}

/** The same limits in KiB, how the admin sets them and how they are stored. */
export interface LinkPreviewKib {
  imageKib: number;
  clickImageKib: number;
  svgKib: number;
  cacheKib: number;
}

export const DEFAULT_LINK_PREVIEW_KIB: LinkPreviewKib = {
  imageKib: 1024,
  clickImageKib: 8 * 1024,
  svgKib: 128,
  cacheKib: 32 * 1024,
};

export const LINK_PREVIEW_KIB_BOUNDS: Record<keyof LinkPreviewKib, readonly [min: number, max: number]> = {
  imageKib: [64, 4096],
  clickImageKib: [1024, 32 * 1024],
  svgKib: [16, 1024],
  cacheKib: [4096, 256 * 1024],
};

export const toLinkPreviewLimits = (kib: LinkPreviewKib): LinkPreviewLimits => ({
  imageBytes: kib.imageKib * KIB,
  clickImageBytes: kib.clickImageKib * KIB,
  svgBytes: kib.svgKib * KIB,
  cacheBytes: kib.cacheKib * KIB,
});

export const DEFAULT_LINK_PREVIEW_LIMITS: LinkPreviewLimits = toLinkPreviewLimits(DEFAULT_LINK_PREVIEW_KIB);
