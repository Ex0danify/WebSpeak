import type { LinkPreviewLimits } from "../../config/linkPreviewConfig.js";
import { readPageMeta, type PageMeta } from "./htmlMeta.js";
import { sniffImage, toDataUri, type ImageMime } from "./imageSniff.js";
import { PreviewCache } from "./previewCache.js";
import { DEFAULT_FETCH_POLICY, FetchError, safeGet, type FetchFailure, type FetchPolicy } from "./safeFetch.js";

export interface PreviewImage {
  mime: ImageMime;
  bytes: number;
  dataUri: string;
}

export type LinkPreview =
  | { kind: "image"; url: string; image: PreviewImage }
  /** An image above the inline limit: the card shows its size, the image comes on request. */
  | { kind: "image-pending"; url: string; bytes?: number }
  | { kind: "page"; url: string; siteName: string; title: string; description: string; image?: PreviewImage };

export type LinkPreviewFailure = FetchFailure | "invalid";

export class LinkPreviewError extends Error {
  constructor(
    readonly reason: LinkPreviewFailure,
    message: string,
  ) {
    super(message);
    this.name = "LinkPreviewError";
  }
}

export interface LinkPreviewOptions {
  getLimits(): LinkPreviewLimits;
  policy?: FetchPolicy;
  now?: () => number;
  /** How many fetches run at the same time. */
  concurrency?: number;
}

interface PageHead {
  pageUrl: URL;
  meta: PageMeta;
}

const MAX_URL_LENGTH = 2048;
const PAGE_HEAD_BYTES = 256 * 1024;
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const FAILURE_BYTES = 256;
const DEFAULT_CONCURRENCY = 4;
const SVG_TYPE = "image/svg+xml";
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/** The address a message points at, or null when it is not one the gateway fetches. */
export function parsePreviewUrl(value: string): URL | null {
  if (value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Fetches what a link points at for the chat: the page head of a page, the bytes of an image. Nothing is written to disk. */
export class LinkPreviewService {
  private readonly cache: PreviewCache<LinkPreview | LinkPreviewError>;
  private readonly pending = new Map<string, Promise<LinkPreview>>();
  private readonly waiting: Array<() => void> = [];
  private running = 0;
  private readonly policy: FetchPolicy;
  private readonly concurrency: number;

  constructor(private readonly options: LinkPreviewOptions) {
    this.cache = new PreviewCache(() => options.getLimits().cacheBytes, options.now);
    this.policy = options.policy ?? DEFAULT_FETCH_POLICY;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  }

  /** `full` is the user's click on an image that was above the inline limit. */
  async preview(address: string, full = false): Promise<LinkPreview> {
    const url = parsePreviewUrl(address);
    if (!url) throw new LinkPreviewError("invalid", "This is not an address that can be previewed");
    const key = `${full ? "full" : "inline"} ${url.href}`;
    const cached = this.cache.get(key);
    if (cached instanceof LinkPreviewError) throw cached;
    if (cached) return cached;
    const running = this.pending.get(key);
    if (running) return running;
    const job = this.load(url, full, key).finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }

  private async load(url: URL, full: boolean, key: string): Promise<LinkPreview> {
    try {
      const fetched = await this.slotted(() => this.fetchPreview(url, full));
      // The card's picture is fetched after the slot is given back, it takes a slot of its own.
      const preview = "meta" in fetched ? await this.withCardImage(fetched) : fetched;
      // A click-loaded image is the one thing that is not worth keeping, it would push the small entries out.
      if (!(preview.kind === "image" && preview.image.bytes > this.options.getLimits().imageBytes)) {
        this.cache.set(key, preview, previewBytes(preview), PREVIEW_TTL_MS);
      }
      return preview;
    } catch (error) {
      const failure =
        error instanceof LinkPreviewError
          ? error
          : error instanceof FetchError
            ? new LinkPreviewError(error.reason, error.message)
            : new LinkPreviewError("failed", "The preview failed");
      this.cache.set(key, failure, FAILURE_BYTES, FAILURE_TTL_MS);
      throw failure;
    }
  }

  private async slotted<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  private async fetchPreview(url: URL, full: boolean): Promise<LinkPreview | PageHead> {
    const limits = this.options.getLimits();
    const imageLimit = full ? limits.clickImageBytes : limits.imageBytes;
    try {
      const resource = await safeGet(
        {
          url,
          accept: "text/html,application/xhtml+xml,image/*;q=0.9",
          cutAtLimit: false,
          limitFor: (contentType) => {
            if (HTML_TYPES.has(contentType)) return PAGE_HEAD_BYTES;
            if (contentType === SVG_TYPE) return limits.svgBytes;
            return contentType.startsWith("image/") ? imageLimit : 0;
          },
        },
        this.policy,
      );
      if (HTML_TYPES.has(resource.contentType)) return { pageUrl: resource.url, meta: readPageMeta(resource.body.toString("utf-8")) };
      return { kind: "image", url: resource.url.href, image: toImage(resource.body) };
    } catch (error) {
      // Only a picture can be asked for with a click. An SVG keeps its small limit, so there is nothing to offer.
      if (error instanceof FetchError && error.reason === "too-large" && !full && error.contentType !== SVG_TYPE) {
        return { kind: "image-pending", url: url.href, bytes: error.announcedBytes };
      }
      throw error;
    }
  }

  private async withCardImage({ pageUrl, meta }: PageHead): Promise<LinkPreview> {
    const image = meta.image ? await this.cardImage(meta.image, pageUrl) : undefined;
    const host = pageUrl.hostname.replace(/^www\./, "");
    if (!meta.title && !meta.description && !image) throw new LinkPreviewError("unsupported", "The page has nothing to show");
    return {
      kind: "page",
      url: pageUrl.href,
      siteName: meta.siteName || host,
      title: meta.title || host,
      description: meta.description,
      ...(image ? { image } : {}),
    };
  }

  /** The picture of a card is a nice to have: whatever goes wrong with it, the card is shown without. */
  private async cardImage(reference: string, pageUrl: URL): Promise<PreviewImage | undefined> {
    let url: URL;
    try {
      url = new URL(reference, pageUrl);
    } catch {
      return undefined;
    }
    try {
      const preview = await this.preview(url.href);
      return preview.kind === "image" ? preview.image : undefined;
    } catch {
      return undefined;
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}

function toImage(body: Buffer): PreviewImage {
  const mime = sniffImage(body);
  if (!mime) throw new FetchError("unsupported", "This is not an image the gateway passes on");
  return { mime, bytes: body.length, dataUri: toDataUri(mime, body) };
}

function previewBytes(preview: LinkPreview): number {
  const text = preview.kind === "page" ? preview.title.length + preview.description.length + preview.siteName.length : 0;
  const image = preview.kind === "image" ? preview.image : preview.kind === "page" ? preview.image : undefined;
  return 512 + text * 2 + (image?.dataUri.length ?? 0);
}
