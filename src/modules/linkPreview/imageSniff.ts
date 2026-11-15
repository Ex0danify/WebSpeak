export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

/**
 * The image type from the first bytes, never from the Content-Type the remote host claims. A page or a script
 * that calls itself an image is none of these.
 */
export function sniffRaster(bytes: Uint8Array): Exclude<ImageMime, "image/svg+xml"> | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
    return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// An SVG shown through <img> cannot run script or load anything, that is what keeps it safe. These checks are a
// second layer that turns obvious abuse into "not shown". Text is matched after lower-casing, so case tricks fail.
const SVG_FORBIDDEN: readonly RegExp[] = [
  /<!doctype/,
  /<!entity/,
  /<script/,
  /<foreignobject/,
  /<iframe/,
  /<embed/,
  /<object/,
  /<animate[^>]*attributename\s*=\s*["']?\s*(?:href|xlink:href)/,
  /\son[a-z]+\s*=/,
  /javascript:/,
  /@import/,
  /(?:xlink:)?href\s*=\s*["']?\s*(?!#)[^"'\s>]/,
  /url\(\s*["']?\s*(?!#)[^)"'\s]/,
];

const BYTE_ORDER_MARK = new RegExp("^\\ufeff");

const SVG_START = /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/;

/** True for an SVG that has nothing that could reach outside of itself. */
export function isPlainSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(BYTE_ORDER_MARK, "").trimStart().toLowerCase();
  if (!SVG_START.test(text)) return false;
  return !SVG_FORBIDDEN.some((pattern) => pattern.test(text));
}

/** The type of a downloaded image, or null when it is not one the gateway passes on. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  const raster = sniffRaster(bytes);
  if (raster) return raster;
  return isPlainSvg(bytes) ? "image/svg+xml" : null;
}

export const toDataUri = (mime: ImageMime, bytes: Uint8Array): string => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
