import { LinkPreviewError, PREVIEW_ERROR_CODES, type LinkPreviewService } from "../../linkPreview/index.js";
import type { MessageCode } from "../../../shared/messageCodes.js";
import type { WebClientEntry } from "../voiceTypes.js";
import type { ClientCommand } from "./voiceProtocol.js";

/**
 * Answers `getLinkPreview` with a `linkPreview` frame, or a `linkPreviewError` frame that carries only a code. The text of
 * a failure lives in the browser, and it is shown under the link, not as a notice for the whole session.
 */
export async function handleLinkPreview(
  entry: WebClientEntry,
  command: ClientCommand,
  sendJson: (message: Record<string, unknown>) => void,
  service: LinkPreviewService | undefined,
): Promise<void> {
  const url = command.payload.url as string;
  const fail = (code: MessageCode) => sendJson({ type: "linkPreviewError", requestId: command.requestId, url, code });
  if (!service) {
    fail(PREVIEW_ERROR_CODES.failed);
    return;
  }
  if (!entry.linkPreviewBudget.allowRequest()) {
    fail("LINK_PREVIEW_RATE_LIMITED");
    return;
  }
  try {
    const preview = await service.preview(url, command.payload.full === true);
    const bytes = JSON.stringify(preview).length;
    if (!entry.linkPreviewBudget.spendBytes(bytes)) {
      fail("LINK_PREVIEW_RATE_LIMITED");
      return;
    }
    sendJson({ type: "linkPreview", requestId: command.requestId, url, preview });
  } catch (error) {
    fail(error instanceof LinkPreviewError ? PREVIEW_ERROR_CODES[error.reason] : PREVIEW_ERROR_CODES.failed);
  }
}
