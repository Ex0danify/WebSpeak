import { describe, expect, it } from "vitest";
import { parsePingLatency } from "./networkProbe.js";

// Reply lines as printed by `ping` on each system. Non-ASCII text is written as escapes so the
// repository stays free of CJK characters. The non-English Windows lines follow the documented
// localized formats and are not captured from those systems.
const REPLY_LINES: Array<[string, string, number | null]> = [
  ["Linux", "64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.3 ms", 12.3],
  ["Linux, sequence 1", "64 bytes from 1.1.1.1: icmp_seq=1 ttl=64 time=0.045 ms", 0.045],
  ["macOS", "64 bytes from 1.1.1.1: icmp_seq=0 ttl=57 time=14.812 ms", 14.812],
  ["Windows, English", "Reply from 1.1.1.1: bytes=32 time=12ms TTL=57", 12],
  ["Windows, English, under 1 ms", "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128", 1],
  ["Windows, German", "Antwort von 1.1.1.1: Bytes=32 Zeit=12ms TTL=57", 12],
  ["Windows, French", "R\u00e9ponse de 1.1.1.1\u00a0: octets=32 temps=12 ms TTL=57", 12],
  [
    "Windows, Russian",
    "\u041e\u0442\u0432\u0435\u0442 \u043e\u0442 1.1.1.1: \u0447\u0438\u0441\u043b\u043e \u0431\u0430\u0439\u0442=32 \u0432\u0440\u0435\u043c\u044f=12\u043c\u0441 TTL=57",
    12,
  ],
  ["Windows, Chinese", "\u6765\u81ea 1.1.1.1 \u7684\u56de\u590d: \u5b57\u8282=32 \u65f6\u95f4=12ms TTL=57", 12],
  ["decimal comma", "Antwort von 1.1.1.1: Bytes=32 Zeit=12,5ms TTL=57", 12.5],
  ["timeout, no reply", "Request timed out.", null],
  ["unreachable", "Destination host unreachable.", null],
];

describe("parsePingLatency", () => {
  it.each(REPLY_LINES)("%s", (_system, line, expected) => {
    expect(parsePingLatency(line)).toBe(expected);
  });
});
