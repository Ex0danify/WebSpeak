import { describe, expect, it, vi } from "vitest";
import { isSpeaking, memberDisplayName, messageAvatar } from "./format";
import type { ChannelMember, ChatMessage } from "./sessionTypes";

function member(id: number, nickname: string, overrides: Partial<ChannelMember> = {}): ChannelMember {
  return { id, nickname, ...overrides };
}

describe("messageAvatar", () => {
  const members = [member(1, "Lucas", { avatar: "lucas.png" }), member(2, "Ana", { uid: "ana-uid", avatar: "ana.png" })];

  it("matches by sender id", () => {
    const message = { senderId: 1 } as ChatMessage;
    expect(messageAvatar(message, members)).toBe("lucas.png");
  });

  it("falls back to sender uid when there is no numeric id", () => {
    const message = { senderUid: "ana-uid" } as ChatMessage;
    expect(messageAvatar(message, members)).toBe("ana.png");
  });

  it("returns an empty string for an unknown sender", () => {
    const message = { senderId: 99 } as ChatMessage;
    expect(messageAvatar(message, members)).toBe("");
  });

  it("returns an empty string when the matched member has no avatar", () => {
    const message = { senderId: 3 } as ChatMessage;
    expect(messageAvatar(message, [member(3, "Sam")])).toBe("");
  });
});

describe("isSpeaking", () => {
  it("is true when the member's id is in the speaking set", () => {
    expect(isSpeaking(member(1, "Lucas"), new Set([1, 2]))).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isSpeaking(member(1, "Lucas"), new Set([2]))).toBe(false);
  });
});

describe("memberDisplayName", () => {
  const t = vi.fn((key: string) => (key === "selfSuffix" ? " (You)" : key));

  it("appends the self suffix for the local member", () => {
    expect(memberDisplayName(member(1, "Lucas", { isSelf: true }), t)).toBe("Lucas (You)");
  });

  it("shows the unnamed label for a nameless member", () => {
    expect(memberDisplayName(member(3, "", { unnamed: true }), t)).toBe("unnamedMember");
  });

  it("returns the plain nickname for other members", () => {
    expect(memberDisplayName(member(2, "Ana"), t)).toBe("Ana");
  });
});
