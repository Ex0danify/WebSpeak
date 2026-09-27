import { describe, expect, it } from "vitest";
import { localizeAudioNotice, localizeMessage, visibleErrorCode } from "./messages";

const NO_PERMISSION = "你没有执行此操作的权限";
const NEEDS_PASSWORD = "该服务器需要密码，请输入密码后重试";

describe("localizeMessage", () => {
  it("returns the gateway's Chinese text unchanged for zh", () => {
    expect(localizeMessage(NO_PERMISSION, "zh")).toBe(NO_PERMISSION);
    expect(localizeMessage("未知", "zh")).toBe("未知");
  });

  it.each([
    ["en", "You do not have permission to perform this action"],
    ["de", "Du hast keine Berechtigung für diese Aktion"],
    ["ru", "У вас нет права выполнять это действие"],
    ["ja", "この操作を実行する権限がありません"],
  ] as const)("translates a known message to %s", (language, expected) => {
    expect(localizeMessage(NO_PERMISSION, language)).toBe(expected);
  });

  it("uses the ru and ja tables for the password prompt", () => {
    expect(localizeMessage(NEEDS_PASSWORD, "ru")).toContain("пароль");
    expect(localizeMessage(NEEDS_PASSWORD, "ja")).toContain("パスワード");
  });

  it("passes an unknown message through in English and German", () => {
    expect(localizeMessage("something else", "en")).toBe("something else");
    expect(localizeMessage("something else", "de")).toBe("something else");
  });

  it("replaces an unknown message with a generic sentence in ru and ja", () => {
    expect(localizeMessage("something else", "ru")).toMatch(/^Не удалось выполнить операцию/);
    expect(localizeMessage("something else", "ja")).toMatch(/^操作に失敗しました/);
  });

  describe("error code messages", () => {
    it.each([
      ["en", "TeamSpeak connection failed (error code: SERVER_FULL). Check your input, network, and server status"],
      ["de", "TeamSpeak-Verbindung fehlgeschlagen (Fehlercode: SERVER_FULL). Prüfe Eingaben, Netzwerk und Serverstatus"],
      ["ru", "Подключение TeamSpeak не выполнена (код ошибки: SERVER_FULL). Проверьте ввод, сеть и состояние сервера"],
      ["ja", "TeamSpeak 接続に失敗しました（エラーコード: SERVER_FULL）。入力、ネットワーク、サーバーの状態を確認してください"],
    ] as const)("extracts the code for %s", (language, expected) => {
      expect(localizeMessage("TeamSpeak 连接失败（错误代码：SERVER_FULL）", language)).toBe(expected);
    });

    it("names an operation failure instead of a connection failure when the text starts with 操作失败", () => {
      expect(localizeMessage("操作失败（错误代码：MOVE_DENIED）", "en")).toBe(
        "Operation failed (error code: MOVE_DENIED). Check your input, network, and server status",
      );
    });

    it("appends the detail after the code, up to the first comma or full stop", () => {
      expect(localizeMessage("操作失败（错误代码：X1）：频道已满，稍后", "en")).toContain("(error code: X1): 频道已满.");
    });

    it("leaves the detail out when there is none", () => {
      expect(localizeMessage("连接失败（错误代码：X1）", "de")).not.toContain("): ");
    });

    it("ignores a code that is lowercase or longer than 64 characters", () => {
      expect(localizeMessage("连接失败（错误代码：abc）", "en")).toBe("连接失败（错误代码：abc）");
      const long = "A".repeat(65);
      expect(localizeMessage(`连接失败（错误代码：${long}）`, "en")).toBe(`连接失败（错误代码：${long}）`);
    });
  });

  describe("prefixed messages", () => {
    it.each([
      ["en", "Microphone access failed: 无权限"],
      ["de", "Mikrofonzugriff fehlgeschlagen: 无权限"],
      ["ru", "Не удалось получить доступ к микрофону: 无权限"],
      ["ja", "マイクへのアクセスに失敗しました: 无权限"],
    ] as const)("keeps the microphone detail after a translated prefix in %s", (language, expected) => {
      expect(localizeMessage("麦克风访问失败：无权限", language)).toBe(expected);
    });

    it.each([
      ["en", "Channel switch failed: x"],
      ["de", "Kanalwechsel fehlgeschlagen: x"],
      ["ru", "Не удалось переключить канал: x"],
      ["ja", "チャンネルの切り替えに失敗しました: x"],
    ] as const)("keeps the channel switch detail after a translated prefix in %s", (language, expected) => {
      expect(localizeMessage("切换失败：x", language)).toBe(expected);
    });

    it("translates the German-only mic send and audio link prefixes", () => {
      expect(localizeMessage("麦克风声音未能发送：编码器", "de")).toBe("Mikrofon-Audio konnte nicht gesendet werden: 编码器");
      expect(localizeMessage("音频链路异常：断开", "de")).toBe("Audioverbindung fehlerhaft：断开");
    });
  });

  it("does not mistake a message that merely contains a known one for an exact match", () => {
    expect(localizeMessage(`${NO_PERMISSION}。`, "en")).toBe(`${NO_PERMISSION}。`);
  });

  it("serves the English table for a known message that ru does not translate", () => {
    // "该频道已满" has no ru entry, so ru shows English rather than the generic sentence.
    expect(localizeMessage("该频道已满", "ru")).toBe("This channel is full");
    expect(localizeMessage("该频道已满", "ja")).toBe("This channel is full");
  });

  it("F9: shows Chinese to English users for a member volume error", () => {
    // German has an entry for this message, English has none.
    expect(localizeMessage("成员音量无效", "de")).toBe("Ungültige Mitgliedslautstärke");
    expect(localizeMessage("成员音量无效", "en")).toBe("成员音量无效");
  });

  it.fails("F9: translates every message German knows into English as well", () => {
    expect(localizeMessage("成员音量无效", "en")).not.toMatch(/[一-鿿]/);
  });
});

describe("localizeAudioNotice", () => {
  it("returns the gateway text for zh whatever the code is", () => {
    expect(localizeAudioNotice("PLAYBACK_BLOCKED", "原文", "zh")).toBe("原文");
  });

  it.each(["WEBRTC_FALLBACK", "PLAYBACK_BLOCKED", "DEVICE_LIST_UNAVAILABLE", "AUDIO_CONTEXT_SUSPENDED", "AUDIO_ENCODER_UNAVAILABLE"])(
    "has a text for %s in every non-zh language, none of them Chinese",
    (code) => {
      const texts = (["en", "de", "ru", "ja"] as const).map((language) => localizeAudioNotice(code, "原文", language));
      expect(new Set(texts).size).toBe(4);
      for (const text of texts) expect(text).not.toContain("原文");
    },
  );

  it("puts the normalized error code into the messages that show one", () => {
    expect(localizeAudioNotice("WEBRTC_FALLBACK", "", "en")).toContain("(error code: WEBRTC_FALLBACK)");
    expect(localizeAudioNotice("AUDIO_ENCODER_UNAVAILABLE", "", "de")).toContain("(Fehlercode: AUDIO_ENCODER_UNAVAILABLE)");
  });

  it("does not show a code for messages that have none", () => {
    expect(localizeAudioNotice("PLAYBACK_BLOCKED", "", "en")).not.toContain("error code");
  });

  it("falls back to translating the message text for an unknown code", () => {
    expect(localizeAudioNotice("SOMETHING_NEW", NO_PERMISSION, "en")).toBe("You do not have permission to perform this action");
    expect(localizeAudioNotice("", "raw text", "en")).toBe("raw text");
  });
});

describe("visibleErrorCode", () => {
  it.each([
    ["server_full", "SERVER_FULL"],
    ["  banned  ", "BANNED"],
    ["not allowed!", "NOT_ALLOWED"],
    ["a..b", "A_B"],
    ["--x--", "--X--"],
    ["__x__", "X"],
    ["ünï", "N"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(visibleErrorCode(input)).toBe(expected);
  });

  it.each(["", "   ", "***", "___"])("uses CONNECTION_FAILED when %j leaves nothing", (input) => {
    expect(visibleErrorCode(input)).toBe("CONNECTION_FAILED");
  });

  it("caps the length at 64", () => {
    expect(visibleErrorCode("a".repeat(100))).toHaveLength(64);
  });

  it("copes with a non-string", () => {
    expect(visibleErrorCode(undefined as unknown as string)).toBe("CONNECTION_FAILED");
    expect(visibleErrorCode(404 as unknown as string)).toBe("404");
  });
});
