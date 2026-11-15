import { describe, expect, it } from "vitest";
import { formatFileSize, parseMytsFile } from "@/features/room/chat/mytsFile";

const payload = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    msg_type: "ts.file.myts",
    file_id: "abc",
    chat_user_id: "@x:chat-4.tmspk.net",
    file_name: "image_1.png",
    file_size: 25831,
    body: "image_1.png",
    v2: true,
    ...extra,
  });

describe("parseMytsFile", () => {
  it("reads the name and size and drops a caption that repeats the name", () => {
    expect(parseMytsFile(payload())).toEqual({ fileName: "image_1.png", fileSize: 25831, description: undefined });
  });

  it("keeps a caption that differs from the name", () => {
    expect(parseMytsFile(payload({ body: "look at this" }))?.description).toBe("look at this");
  });

  it.each([
    ["plain text", "hello"],
    ["other JSON", '{"a":1}'],
    ["broken JSON", '{"msg_type":"ts.file.myts"'],
    ["another type", payload({ msg_type: "ts.file.other" })],
    ["missing name", payload({ file_name: undefined })],
    ["empty name", payload({ file_name: "" })],
    ["text size", payload({ file_size: "10" })],
    ["negative size", payload({ file_size: -1 })],
    ["marker inside an array", `[${payload()}]`],
  ])("returns null for %s", (_label, text) => {
    expect(parseMytsFile(text)).toBeNull();
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [25831, "25.2 KB"],
    [5 * 1024 * 1024, "5 MB"],
  ])("formats %i bytes", (bytes, text) => {
    expect(formatFileSize(bytes).replace(",", ".")).toBe(text);
  });
});
