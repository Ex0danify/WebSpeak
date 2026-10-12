import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { WebSpeakDatabase } from "../../infra/persistence/database.js";
import { AdminBootstrapError, resetAdminAccount } from "../../modules/admin/index.js";

export const ADMIN_RESET_COMMAND = "reset-admin-password";

const USAGE = `Usage: node dist/index.js ${ADMIN_RESET_COMMAND} [--username <name>]

Sets a new administrator password. It is asked for twice and never shown. Without a terminal (piped input) the first
line of stdin is the new password. The password must be changed again at the next login and all admin sessions end.

  --username <name>   also change the administrator username`;

interface ResetStreams {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}

/** Runs the reset command against the database in `dataDir` and returns the process exit code. */
export async function runAdminResetCommand(
  args: string[],
  dataDir: string,
  streams: ResetStreams = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    streams.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const options = parseArgs(args);
  if (!options) {
    streams.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const databasePath = `${dataDir}/webspeak.db`;
  if (!existsSync(databasePath)) {
    streams.stderr.write(`No WebSpeak database at ${databasePath}. Check WEBSPEAK_DATA_DIR, or start WebSpeak once first.\n`);
    return 1;
  }
  let database: WebSpeakDatabase | undefined;
  try {
    const password = streams.stdin.isTTY ? await promptTwice(streams) : await readFirstLine(streams.stdin);
    database = new WebSpeakDatabase(databasePath);
    const { username } = await resetAdminAccount(database, { password, username: options.username });
    streams.stdout.write(
      `Administrator "${username}" reset. Sign in with the new password, you will be asked to change it. All admin sessions have ended.\n`,
    );
    return 0;
  } catch (error: unknown) {
    const expected = error instanceof AdminBootstrapError || error instanceof PasswordMismatchError;
    streams.stderr.write(`${expected ? error.message : "Reset failed."}\n`);
    if (!expected) console.error(error);
    return 1;
  } finally {
    database?.close();
  }
}

class PasswordMismatchError extends Error {}

function parseArgs(args: string[]): { username?: string } | null {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--username" && args[1]) return { username: args[1] };
  return null;
}

async function promptTwice(streams: ResetStreams): Promise<string> {
  const first = await promptHidden("New administrator password: ", streams);
  const second = await promptHidden("Repeat the password: ", streams);
  if (first !== second) throw new PasswordMismatchError("The passwords do not match.");
  return first;
}

function promptHidden(question: string, streams: ResetStreams): Promise<string> {
  streams.stdout.write(question);
  const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
  const lines = createInterface({ input: streams.stdin, output: muted, terminal: true });
  return new Promise((resolve) => {
    lines.question("", (answer) => {
      lines.close();
      streams.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readFirstLine(stdin: NodeJS.ReadableStream): Promise<string> {
  let text = "";
  for await (const chunk of stdin) {
    text += String(chunk);
    if (text.includes("\n")) break;
  }
  return text.split(/\r?\n/, 1)[0] ?? "";
}
