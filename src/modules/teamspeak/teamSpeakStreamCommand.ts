import type { Client as TS3FullClient } from "@echosixhiya/teamspeak-client";
import type { Logger } from "../../shared/logger.js";
import type { CommandPacer } from "./commandPacer.js";

const ACKNOWLEDGED_STREAM_COMMANDS = new Set(["stopstream", "removeclientfromstream"]);

/**
 * Send a protocol command whose answer arrives later as a notification (setupstream etc).
 * Only the trusted stream adapter builds these, never the browser. Stream cleanup is the exception:
 * it waits for the server's acknowledgement and is retried after a flood refusal, so a failed
 * cleanup shows up in the log instead of leaving a ghost stream or viewer behind.
 */
export async function sendStreamCommand(client: TS3FullClient, pacer: CommandPacer, logger: Logger, command: string): Promise<void> {
  if (!ACKNOWLEDGED_STREAM_COMMANDS.has(command.split(" ", 1)[0] ?? "")) {
    await client.sendCommandNoWait(command);
    return;
  }
  try {
    await pacer.run(() => client.execCommand(command, 5000));
  } catch (error: unknown) {
    logger.warn(
      { command: command.split(" ", 1)[0], err: error instanceof Error ? error.message : String(error) },
      "TeamSpeak stream cleanup command failed",
    );
    throw error;
  }
}
