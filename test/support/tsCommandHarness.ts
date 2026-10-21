// A CommandTracker on a manual clock with a recording sink, for the own client's command tests.
import { CommandTracker, type CommandTrackerOptions, type ServerCommand } from "../../src/lib/teamspeak/command/commandTracker.js";
import { PacketType } from "../../src/lib/teamspeak/transport/packetTypes.js";
import { ManualClock } from "./tsLinkSimulator.js";

export function setupTracker(options: CommandTrackerOptions = {}) {
  const clock = new ManualClock();
  const sent: string[] = [];
  const notifications: ServerCommand[] = [];
  const tracker = new CommandTracker(
    { sendCommand: (payload) => sent.push(payload.toString()) },
    { notification: (command) => notifications.push(command) },
    { clock, ...options },
  );
  const receive = (text: string, low = false) =>
    tracker.receive({ type: low ? PacketType.commandLow : PacketType.command, flags: 0, payload: Buffer.from(text) });
  return { clock, sent, notifications, tracker, receive };
}

export const ok = (returnCode: number | string) => `error id=0 msg=ok return_code=${returnCode}`;
