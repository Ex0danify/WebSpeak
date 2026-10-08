# WebSpeak acceleration tunnel PoC

This is the first isolated test demo. It is not part of the WebSpeak production runtime and is not copied into the Docker image or the release package.

It verifies these core capabilities:

- a client on the Hong Kong side authenticates to a relay on the Shanghai side;
- each session names its TeamSpeak target address dynamically;
- UDP datagrams are forwarded in both directions with packet boundaries preserved;
- sessions are isolated from each other by random ID;
- a wrong key cannot establish a session;
- system routes are not modified, so this is not a VPN.

## Local smoke test

Run from the repository root:

```bash
npm run acceleration:poc
```

On success it prints `ACCELERATION_POC_OK` together with the packet count, loss rate and round-trip latency.

IPv6 loopback check:

```bash
npm run acceleration:ipv6-smoke
```

## Connecting to a Shanghai TeamSpeak through the tunnel

The command below makes the SDK connect to a local proxy port, and the PoC relay forwards the UDP traffic to the given TeamSpeak. It does not join any channel; it only verifies the TeamSpeak handshake and disconnect:

```bash
$env:WEBSPEAK_ACCEL_TS_TARGET="106.15.36.235#9987"
npm run acceleration:sdk-smoke
```

For a cross-machine check, start `relay-server.mjs` in Shanghai and point `WEBSPEAK_ACCEL_RELAY` at the Shanghai relay address. The project does not deploy or start that remote process automatically.

## Starting the relay manually

For experiments only; do not expose it directly to the public internet:

```bash
WEBSPEAK_ACCEL_TOKEN="change-this-to-a-long-random-token" \
WEBSPEAK_ACCEL_HOST="0.0.0.0" \
WEBSPEAK_ACCEL_PORT="39087" \
node scripts/acceleration-poc/relay-server.mjs
```

The demo's UDP frame protocol is experimental. It is not wired into the SDK yet, and it has had no production security audit to replace GOST. Before real integration, long TeamSpeak voice sessions, concurrent sessions, IPv6, reconnects and the target-address security policy still need verifying.
