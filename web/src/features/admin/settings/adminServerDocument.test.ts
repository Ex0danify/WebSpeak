import { describe, expect, it } from "vitest";
import {
  applySavedSettings,
  buildSettingsDocument,
  changedFieldKeys,
  isPlausibleTarget,
  sameDocument,
} from "@/features/admin/settings/adminServerDocument";
import { createRelayNode, initialServerForm, serverFormFromSettings, type ServerForm } from "@/features/admin/settings/adminServerForm";

const confirmedForm = (changes: Partial<ServerForm> = {}): ServerForm => ({ ...initialServerForm(), ...changes });

describe("isPlausibleTarget", () => {
  it.each(["relay.example.com", "relay.example.com:9987", "10.0.0.1:1", "[2001:db8::1]:9988", "[::1]"])("takes %s", (value) => {
    expect(isPlausibleTarget(value)).toBe(true);
  });

  it.each(["", "  ", "a:b", "host:0", "host:70000", "2001:db8::1", "[2001:db8::1", "ho st", "host/path", `${"a".repeat(301)}`])(
    "refuses %j",
    (value) => {
      expect(isPlausibleTarget(value)).toBe(false);
    },
  );
});

describe("buildSettingsDocument", () => {
  it("is the form itself when every value is valid", () => {
    const form = confirmedForm({ siteName: "  Night Owls ", accessMode: "open", identityMintMaxLevel: 10 });
    const { document, issues } = buildSettingsDocument(form, confirmedForm());
    expect(issues).toEqual({});
    expect(document).toMatchObject({ siteName: "Night Owls", accessMode: "open", identityMintMaxLevel: 10, relayNodes: [] });
  });

  it.each(["", "https://example.org/privacy", "http://example.org:8080/p?x=1#top"])("takes %j as the privacy notice", (url) => {
    const { document, issues } = buildSettingsDocument(confirmedForm({ privacyNoticeUrl: ` ${url} ` }), confirmedForm());
    expect(issues).toEqual({});
    expect(document.privacyNoticeUrl).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "example.org/privacy",
    "ftp://example.org",
    "https://user:pw@example.org/",
    `https://example.org/${"x".repeat(300)}`,
  ])("holds back %j as the privacy notice and keeps the one the gateway has", (url) => {
    const confirmed = confirmedForm({ privacyNoticeUrl: "https://example.org/old" });
    const { document, issues } = buildSettingsDocument(confirmedForm({ privacyNoticeUrl: url }), confirmed);
    expect(issues).toEqual({ privacyNoticeUrl: { code: "privacyUrl" } });
    expect(document.privacyNoticeUrl).toBe("https://example.org/old");
  });

  it("takes a port that is not a number, outside the range or backwards for a mistake in the whole range", () => {
    for (const [start, end] of [
      ["", 40099],
      [40000, 70000],
      [1000, 2000],
      [50000, 45000],
    ] as const) {
      const form = confirmedForm({ webRtcUdpStart: start as number, webRtcUdpEnd: end });
      const { document, issues } = buildSettingsDocument(form, confirmedForm());
      expect([document.webRtcUdpStart, document.webRtcUdpEnd]).toEqual([40000, 40099]);
      expect(Object.keys(issues).length).toBeGreaterThan(0);
    }
  });

  it("checks each mint limit on its own", () => {
    const form = confirmedForm({ identityMintMaxLevel: 25, identityMintConcurrency: 1.5, identityMintQueueDepth: 0 });
    const { document, issues } = buildSettingsDocument(form, confirmedForm());
    expect(Object.keys(issues).sort()).toEqual(["identityMintConcurrency", "identityMintMaxLevel"]);
    expect(document).toMatchObject({ identityMintMaxLevel: 8, identityMintConcurrency: 2, identityMintQueueDepth: 0 });
  });

  it("holds back a retention that is out of bounds, so no value like 999999999999 reaches the gateway", () => {
    const form = confirmedForm({
      eventLogRetentionDays: 400,
      eventLogMaxRows: 99,
      connectionRetentionDays: 7,
      connectionMaxRows: 999_999_999_999,
      logRetentionDays: 0,
    });
    const { document, issues } = buildSettingsDocument(form, confirmedForm());
    expect(Object.keys(issues).sort()).toEqual(["connectionMaxRows", "eventLogMaxRows", "eventLogRetentionDays", "logRetentionDays"]);
    expect(document).toMatchObject({
      eventLogRetentionDays: 90,
      eventLogMaxRows: 5000,
      connectionRetentionDays: 7,
      connectionMaxRows: 10000,
      logRetentionDays: 30,
    });
  });

  it("sends an unchanged token as keep, and an empty replacement as no change", () => {
    const node = {
      ...createRelayNode(),
      id: "relay-a",
      name: "A",
      target: "a.example.com",
      hasToken: true,
      tokenAction: "replace" as const,
    };
    const confirmed = confirmedForm({ relayNodes: [{ ...node, tokenAction: "keep" }] });
    const { document } = buildSettingsDocument(confirmedForm({ relayNodes: [node] }), confirmed);
    expect(document.relayNodes).toEqual([{ id: "relay-a", name: "A", target: "a.example.com", enabled: false, tokenAction: "keep" }]);
    expect(sameDocument(document, buildSettingsDocument(confirmed, confirmed).document)).toBe(true);
  });

  it("leaves out a node that was added and not touched without a word", () => {
    const { document, issues } = buildSettingsDocument(confirmedForm({ relayNodes: [createRelayNode()] }), confirmedForm());
    expect(document.relayNodes).toEqual([]);
    expect(issues).toEqual({});
  });

  it("treats a language without text like one that is not there", () => {
    const a = buildSettingsDocument(confirmedForm({ welcomeTexts: { de: " " } }), confirmedForm()).document;
    const b = buildSettingsDocument(confirmedForm(), confirmedForm()).document;
    expect(sameDocument(a, b)).toBe(true);
  });
});

describe("applySavedSettings", () => {
  const saved = (changes: Record<string, unknown> = {}) => serverFormFromSettings({ siteName: "Trimmed", ...changes });

  it("takes the gateway's value for what was sent and keeps what was typed since", () => {
    const form = confirmedForm({ siteName: " Trimmed ", identityMintMaxLevel: 12 });
    const sent = buildSettingsDocument(form, confirmedForm()).document;
    form.identityMintMaxLevel = 14;
    applySavedSettings(form, sent, saved({ identityMintMaxLevel: 12 }));
    expect(form.siteName).toBe("Trimmed");
    expect(form.identityMintMaxLevel).toBe(14);
  });

  it("takes the privacy notice as the gateway saved it, unless it was edited since", () => {
    const form = confirmedForm({ privacyNoticeUrl: " https://example.org/p " });
    const sent = buildSettingsDocument(form, confirmedForm()).document;
    applySavedSettings(form, sent, saved({ privacyNoticeUrl: "https://example.org/p" }));
    expect(form.privacyNoticeUrl).toBe("https://example.org/p");
    form.privacyNoticeUrl = "https://example.org/typed-since";
    applySavedSettings(form, sent, saved({ privacyNoticeUrl: "https://example.org/p" }));
    expect(form.privacyNoticeUrl).toBe("https://example.org/typed-since");
  });

  it("shows the range the gateway keeps while WebRTC is on", () => {
    const form = confirmedForm({ webRtcEnabled: true, webRtcUdpStart: 50000, webRtcUdpEnd: 45000 });
    const sent = buildSettingsDocument(form, confirmedForm()).document;
    applySavedSettings(form, sent, saved({ webRtcEnabled: true }));
    expect([form.webRtcUdpStart, form.webRtcUdpEnd]).toEqual([40000, 40099]);
  });

  it("replaces a node that was saved as sent, and keeps one that is being edited or is new", () => {
    const sentNode = { ...createRelayNode(), id: "relay-a", name: "A", target: "a.example.com", token: "a-token-of-16-chars" };
    const editedNode = { ...createRelayNode(), id: "relay-b", name: "B", target: "b.example.com" };
    const form = confirmedForm({ relayNodes: [sentNode, editedNode] });
    const sent = buildSettingsDocument(form, confirmedForm()).document;
    editedNode.name = "B2";
    const fresh = createRelayNode();
    form.relayNodes.push(fresh);
    const answer = saved({
      relayNodes: [
        { id: "relay-a", name: "A", target: "a.example.com:9987", enabled: false, hasToken: true },
        { id: "relay-b", name: "B", target: "b.example.com:9987", enabled: false, hasToken: false },
      ],
    });
    applySavedSettings(form, sent, answer);
    expect(form.relayNodes[0]).toMatchObject({ target: "a.example.com:9987", token: "", tokenAction: "keep", hasToken: true });
    expect(form.relayNodes[1]).toMatchObject({ name: "B2", target: "b.example.com" });
    expect(form.relayNodes[2]).toBe(fresh);
  });
});

describe("changedFieldKeys", () => {
  const documentOf = (form: ServerForm, confirmed: ServerForm = confirmedForm()) => buildSettingsDocument(form, confirmed).document;
  const before = documentOf(confirmedForm());

  it("names the fields and choices that differ", () => {
    const form = confirmedForm({ siteName: "Night Owls", identityMintQueueDepth: 5, accessMode: "open", webRtcEnabled: true });
    expect(changedFieldKeys(documentOf(form), before)).toEqual(["accessMode", "webRtcEnabled", "siteName", "identityMintQueueDepth"]);
    expect(changedFieldKeys(documentOf(confirmedForm({ privacyNoticeUrl: "https://example.org/p" })), before)).toEqual([
      "privacyNoticeUrl",
    ]);
  });

  it("names the welcome text only when its words change", () => {
    expect(changedFieldKeys(documentOf(confirmedForm({ welcomeTexts: { de: "Hallo" } })), before)).toEqual(["welcomeText"]);
    expect(changedFieldKeys(documentOf(confirmedForm({ welcomeTexts: { de: " " } })), before)).toEqual([]);
  });

  it("names the fields of a relay node that is new or edited, and its token when one was sent", () => {
    const node = { ...createRelayNode(), id: "relay-a", name: "A", target: "a.example.com", token: "a-token-of-16-chars" };
    expect(changedFieldKeys(documentOf(confirmedForm({ relayNodes: [node] })), before)).toEqual([
      "relay:relay-a:name",
      "relay:relay-a:target",
      "relay:relay-a:token",
    ]);
    const saved = confirmedForm({ relayNodes: [{ ...node, token: "", tokenAction: "keep", hasToken: true }] });
    const edited = confirmedForm({ relayNodes: [{ ...saved.relayNodes[0]!, target: "b.example.com" }] });
    expect(changedFieldKeys(documentOf(edited, saved), documentOf(saved))).toEqual(["relay:relay-a:target"]);
  });
});
