import { focusInfo, join, memberRow, openMemberMenu, overflowScan, poll, toneWav } from "./helpers";
import { expect, test } from "./fixtures";

test.describe("join, room and session", () => {
  test("join reaches the room and the session records what the gateway sent", async ({ page, session }) => {
    await join(page, "helper-solo");
    await session.waitForMessage("connected");
    expect(session.of("channelList").length).toBeGreaterThan(0);
    expect(session.pageErrors).toEqual([]);
  });

  test("a second session sees the first, and the member menu of the other opens", async ({ page, session, openSession }) => {
    await join(page, "helper-a");
    const other = await openSession();
    await join(other.page, "helper-b");
    await expect(memberRow(page, "helper-b")).toBeVisible();

    const menu = await openMemberMenu(page, "helper-b");
    await expect(menu.getByText("Poke")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    expect(session.pageErrors).toEqual([]);
  });
});

test("waitForMessage takes only what came after a mark", async ({ page, session }) => {
  await join(page, "helper-mark");
  await session.waitForMessage("connected");
  const mark = session.mark();
  await expect(session.waitForMessage("connected", { after: mark, timeoutMs: 300 })).rejects.toThrow(/"connected" message/);
});

test("focusInfo names what has focus and overflowScan finds planted overflow", async ({ page }) => {
  await page.goto("/");
  const nickname = page.getByLabel("Your nickname");
  await nickname.focus();
  expect(await focusInfo(page)).toMatchObject({ tag: "input", outlineStyle: "solid" });
  await nickname.blur();
  expect(await focusInfo(page)).toBe("body");

  expect(await overflowScan(page)).toEqual({ clipped: [], pageScrolls: false });
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.textContent = "planted-overflow";
    wide.style.cssText = "position:absolute;left:0;top:0;width:10px;overflow:hidden;white-space:nowrap";
    const hidden = document.createElement("span");
    hidden.textContent = "planted-screen-reader-only";
    hidden.style.cssText = "position:absolute;left:0;top:20px;width:1px;height:1px;overflow:hidden;white-space:nowrap";
    const off = document.createElement("span");
    off.textContent = "planted-offscreen";
    off.style.cssText = "position:absolute;left:100000px;top:0";
    document.body.append(wide, hidden, off);
  });
  const scan = await overflowScan(page);
  expect(scan.clipped).toEqual(expect.arrayContaining(["planted-overflow", "OFFSCREEN:planted-offscreen"]));
  // Text for screen readers only is meant to be clipped, so it is not reported.
  expect(scan.clipped).not.toContain("planted-screen-reader-only");
  expect(scan.pageScrolls).toBe(true);
});

test("poll returns the first accepted value and names what it waited for", async () => {
  let reads = 0;
  expect(
    await poll(
      () => ++reads,
      (value) => value === 3,
    ),
  ).toBe(3);
  await expect(
    poll(
      () => 1,
      (value) => value === 2,
      { timeoutMs: 60, message: "two" },
    ),
  ).rejects.toThrow(/waiting for two; last value: 1/);
});

test("toneWav is a mono 48 kHz PCM WAV of the asked length", () => {
  const wav = toneWav({ frequencyHz: 1000, seconds: 1 });
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(48_000);
  expect(wav.readUInt32LE(40)).toBe(48_000 * 2);
  expect(Math.max(...new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + 44 + 4000)))).toBeGreaterThan(15000);
});
