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
    version: "3.6.2 [Build: 1695203293]",
    platform: "Linux",
    sign: "p4iF1jZ3ZOz9MEkKSZ2bvnFtm9WmUcQy9mAP//erFE4PF1sB6K1CSANrr+3X4B0aZR0u+K2pjnv8kiKsWKQCBQ==",
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
