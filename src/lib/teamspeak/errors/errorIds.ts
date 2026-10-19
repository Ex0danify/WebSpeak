/**
 * Server error ids we react to, named after the native client's error table. Every other id stays numeric.
 * 0x0410 is left out on purpose: TS3 calls it server_blacklisted, the TS6 notes call it server_time_difference_too_large.
 */
export const TeamSpeakErrorId = {
  ok: 0x0000,
  clientInvalidId: 0x0200,
  clientNicknameInUse: 0x0201,
  clientProtocolLimitReached: 0x0203,
  clientCouldNotValidateIdentity: 0x0207,
  clientInvalidPassword: 0x0208,
  clientTooManyClonesConnected: 0x0209,
  clientVersionOutdated: 0x020a,
  clientIsFlooding: 0x020c,
  channelInvalidPassword: 0x030d,
  serverIsShuttingDown: 0x0402,
  serverMaxClientsReached: 0x0403,
  serverInvalidPassword: 0x0404,
  parameterQuote: 0x0600,
  parameterInvalidCount: 0x0601,
  parameterInvalid: 0x0602,
  parameterNotFound: 0x0603,
  parameterConvert: 0x0604,
  parameterInvalidSize: 0x0605,
  parameterMissing: 0x0606,
  parameterChecksum: 0x0607,
  failedConnectionInitialisation: 0x0705,
  couldNotResolveHostname: 0x0706,
  connectionIpProtocolMissing: 0x070d,
  handshakeFailed: 0x070e,
  permissionsClientInsufficient: 0x0a08,
  accountingVirtualServerLimitReached: 0x0b00,
  accountingSlotLimitReached: 0x0b01,
  connectFailedBanned: 0x0d01,
  renameFailedBanned: 0x0d02,
  banFlooding: 0x0d03,
} as const;

export type TeamSpeakErrorIdName = keyof typeof TeamSpeakErrorId;

const namesById = new Map<number, TeamSpeakErrorIdName>(
  Object.entries(TeamSpeakErrorId).map(([name, id]) => [id, name as TeamSpeakErrorIdName]),
);

export function teamSpeakErrorIdName(id: number): TeamSpeakErrorIdName | undefined {
  return namesById.get(id);
}
