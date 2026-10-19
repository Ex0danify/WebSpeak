import type { Logger } from "../../shared/logger.js";
import type { TeamSpeakBackend } from "./teamSpeakBackend.js";

const ACKNOWLEDGED_STREAM_COMMANDS = new Set(["stopstream", "removeclientfromstream"]);

/**
 * Send a protocol command whose answer arrives later as a notification (setupstream etc).
 * Only the trusted stream adapter builds these, never the browser. Stream cleanup is the exception:
 * it waits for the server's acknowledgement and is retried after a flood refusal, so a failed
 * cleanup shows up in the log instead of leaving a ghost stream or viewer behind.
 */
export async function sendStreamCommand(
  backend: Pick<TeamSpeakBackend, "command" | "send">,
  logger: Logger,
  command: string,
): Promise<void> {
  if (!ACKNOWLEDGED_STREAM_COMMANDS.has(command.split(" ", 1)[0] ?? "")) {
    await backend.send(command);
    return;
  }
  try {
    await backend.command(command, 5000, "background");
  } catch (error: unknown) {
    logger.warn(
      { command: command.split(" ", 1)[0], err: error instanceof Error ? error.message : String(error) },
      "TeamSpeak stream cleanup command failed",
    );
    throw error;
  }
}
