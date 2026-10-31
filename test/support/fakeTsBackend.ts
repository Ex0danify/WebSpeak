import { EventEmitter } from "node:events";
import { buildCommand, type CommandRequest } from "../../src/lib/teamspeak/index.js";
import type { Logger } from "../../src/shared/logger.js";
import type {
  TeamSpeakBackend,
  TeamSpeakBackendEvents,
  TeamSpeakBackendFactory,
  TeamSpeakBackendOptions,
  TSClientAvatar,
} from "../../src/modules/teamspeak/teamSpeakBackend.js";

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};

/** A backend that records what TSClient asks of it, for the TSClient unit tests. */
export class FakeBackend extends EventEmitter<TeamSpeakBackendEvents> implements TeamSpeakBackend {
  readonly commands: string[] = [];
  readonly sent: string[] = [];
  protocol = null;
  id = 56;
  channel = 1n;
  talkAllowed = true;
  connects = 0;
  disconnects = 0;
  /** Replace to hold or fail connect(). */
  onConnect: () => Promise<void> = async () => undefined;
  /** Runs for every command, throw to refuse it. */
  onCommand: (text: string) => Promise<Record<string, string>[]> = async () => [];
  onAvatar: (clientId: number, expectedUid: string) => Promise<TSClientAvatar | null> = async () => null;

  constructor(readonly options: TeamSpeakBackendOptions) {
    super();
  }

  async connect(): Promise<void> {
    this.connects++;
    await this.onConnect();
  }

  async disconnect(): Promise<void> {
    this.disconnects++;
  }

  clientId(): number {
    return this.id;
  }

  channelId(): bigint {
    return this.channel;
  }

  canTalk(): boolean {
    return this.talkAllowed;
  }

  command(request: CommandRequest | string): Promise<Record<string, string>[]> {
    const text = typeof request === "string" ? request : buildCommand(request.name, request.params, request);
    this.commands.push(text);
    return this.onCommand(text);
  }

  async send(text: string): Promise<void> {
    this.sent.push(text);
  }

  sendVoice(): void {}

  sendWhisper(): void {}

  loadAvatar(clientId: number, expectedUid: string): Promise<TSClientAvatar | null> {
    return this.onAvatar(clientId, expectedUid);
  }

  async syncDirectory(): Promise<void> {}
}

/** A factory that keeps every backend it made, in order. */
export function fakeBackends(): { backends: FakeBackend[]; factory: (...args: Parameters<TeamSpeakBackendFactory>) => FakeBackend } {
  const backends: FakeBackend[] = [];
  return {
    backends,
    factory: (options) => {
      const backend = new FakeBackend(options);
      backends.push(backend);
      return backend;
    },
  };
}
