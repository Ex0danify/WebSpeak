// Public API of the own TeamSpeak client. Only modules/teamspeak imports it.
export { TeamSpeakErrorId, teamSpeakErrorIdName, type TeamSpeakErrorIdName } from "./errors/errorIds.js";
export {
  CommandTimeoutError,
  HandshakeError,
  InvalidIdentityError,
  TeamSpeakError,
  TeamSpeakServerError,
  TeamSpeakTransportError,
  type TeamSpeakServerErrorFields,
  type TeamSpeakTransportErrorCode,
} from "./errors/teamSpeakErrors.js";
export { generateIdentity, Identity, identityFromString } from "./crypto/identity.js";
export { generateIdentityAsync, upgradeIdentity, type IdentitySearchOptions } from "./crypto/identityWorker.js";
export { ts3Uid, ts6Uid } from "./crypto/uid.js";
export { escapeCommandValue, unescapeCommandValue } from "./wire/commandEscape.js";
export { type CommandRow } from "./wire/commandRows.js";
export {
  buildCommand,
  parseCommand,
  type BuildCommandOptions,
  type CommandParams,
  type CommandValue,
  type ParseCommandOptions,
  type ParsedCommand,
} from "./wire/commandText.js";
export { parseBool, parseI32, parseList, parseU16, parseU32, parseU64, parseU8 } from "./wire/commandValues.js";
export { INIT_VERSION } from "./handshake/init1.js";
export { type ClientInitOptions } from "./handshake/clientInit.js";
export { type VersionProfileName } from "./handshake/versionProfiles.js";
export { connectLegacy, type ConnectionEvents, type LegacyConnection, type LegacyHandshakeOptions } from "./handshake/legacyHandshake.js";
export {
  CommandTracker,
  type CommandInput,
  type CommandOptions,
  type CommandRequest,
  type CommandSink,
  type CommandTrackerEvents,
  type CommandTrackerOptions,
  type ServerCommand,
} from "./command/commandTracker.js";
export {
  CommandScheduler,
  type CommandPriority,
  type CommandSchedulerOptions,
  type ScheduledCommandOptions,
} from "./command/commandScheduler.js";
export { FloodBudget, type FloodBudgetOptions } from "./command/floodBudget.js";
export {
  channelList,
  channelSubscribeAll,
  clientDisconnect,
  clientInfo,
  clientList,
  clientMove,
  clientPoke,
  clientUpdate,
  sendTextMessage,
  TextMessageTarget,
  version,
  type ClientMoveOptions,
  type ClientUpdateProperties,
  type TextMessageTargetMode,
} from "./command/clientCommands.js";
