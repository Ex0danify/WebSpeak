import type { MessageCode } from "../../shared/messageCodes.js";
import type { LinkPreviewFailure } from "./linkPreviewService.js";

/** The code the browser renders for each reason a preview failed. */
export const PREVIEW_ERROR_CODES: Record<LinkPreviewFailure, MessageCode> = {
  invalid: "LINK_PREVIEW_INVALID",
  blocked: "LINK_PREVIEW_BLOCKED",
  failed: "LINK_PREVIEW_FAILED",
  "too-large": "LINK_PREVIEW_TOO_LARGE",
  unsupported: "LINK_PREVIEW_UNSUPPORTED",
};
