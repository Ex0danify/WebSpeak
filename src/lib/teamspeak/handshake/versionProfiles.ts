// Public client versions, each with the signature the server checks. Both were seen on the wire.

export interface VersionProfile {
  version: string;
  platform: string;
  sign: string;
  /** Empty fields after `client_key_offset`, in the order that client sends them. */
  emptyFields: readonly string[];
}

export const VERSION_PROFILES = {
  ts3: {
    version: "3.?.? [Build: 5680278000]",
    platform: "Windows",
    sign: "DX5NIYLvfJEUjuIbCidnoeozxIDRRkpq3I9vVMBmE9L2qnekOoBzSenkzsg2lC9CMv8K5hkEzhr2TYUYSwUXCg==",
    emptyFields: ["client_nickname_phonetic", "client_default_token"],
  },
  ts6: {
    version: "6.0.0-beta5 [Build: 1791901251]",
    platform: "Linux",
    sign: "dilpaDp3nKLifbgeL34SbXOlEX/B3MNft5XDQp5Q2qqkRCP+SFpNuW8shj3YGuNQ8U7yvHOMQBb0vcuJzS6WDA==",
    emptyFields: [
      "client_default_token",
      "client_myteamspeak_id",
      "client_integrations",
      "client_active_integrations_info",
      "client_user_tag",
    ],
  },
} as const satisfies Record<string, VersionProfile>;

export type VersionProfileName = keyof typeof VERSION_PROFILES;
