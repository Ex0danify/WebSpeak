// One table for both target parsers. The gateway (src/shared/teamSpeakTarget.ts)
// parses and validates; the web form (web/src/shared/lib/teamspeakTarget.ts) only
// splits and joins. For every input the gateway accepts, the two must describe the
// same server, so both test files run this table.
export const ACCEPTED_TARGETS: ReadonlyArray<readonly [input: string, expected: { host: string; port: number }]> = [
  ["example.com", { host: "example.com", port: 9987 }],
  ["example.com:9988", { host: "example.com", port: 9988 }],
  ["example.com#9988", { host: "example.com", port: 9988 }],
  ["  example.com:9988  ", { host: "example.com", port: 9988 }],
  ["EXAMPLE.Com", { host: "example.com", port: 9987 }],
  ["ts-1.my_host.example", { host: "ts-1.my_host.example", port: 9987 }],
  ["localhost", { host: "localhost", port: 9987 }],
  ["192.168.1.5", { host: "192.168.1.5", port: 9987 }],
  ["192.168.1.5:1", { host: "192.168.1.5", port: 1 }],
  ["192.168.1.5:65535", { host: "192.168.1.5", port: 65535 }],
  ["[::1]", { host: "::1", port: 9987 }],
  ["[::1]:9988", { host: "::1", port: 9988 }],
  ["[2001:DB8::1]:9988", { host: "2001:db8::1", port: 9988 }],
  ["[2001:db8::1]#9988", { host: "2001:db8::1", port: 9988 }],
  ["[::ffff:a00:1]:9987", { host: "::ffff:a00:1", port: 9987 }],
];

// Values of the separate port field, and whether the gateway accepts them.
export const PORT_FIELD_CASES: ReadonlyArray<readonly [value: string, valid: boolean]> = [
  ["1", true],
  ["9987", true],
  ["65535", true],
  [" 9987 ", true],
  ["0", false],
  ["65536", false],
  ["", false],
  ["abc", false],
  ["+9987", false],
  ["99.87", false],
  ["0x26e3", false],
  ["-1", false],
];
