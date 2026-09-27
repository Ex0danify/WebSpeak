import { chromium, rec, openSession, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${SP}quiet.wav`, "--auto-accept-this-tab-capture", "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing", "--auto-select-tab-capture-source-by-title=WebSpeak", "--autoplay-policy=no-user-gesture-required"] });
const A = await openSession(browser, "smoke-A"); const B = await openSession(browser, "smoke-B");
const p = A.page; await p.waitForTimeout(1000);
// settings dialog first (Share settings)
await p.getByRole("button", { name: "Share settings" }).click(); await p.waitForTimeout(500);
const dlg = p.getByRole("dialog");
rec("7", "Screen-share settings dialog opens", (await dlg.count()) === 1, JSON.stringify(await dlg.locator("button,select,input,[role=radio]").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || e.value || "").trim().slice(0, 16))).catch(() => [])));
await p.screenshot({ path: SP + "shots/80-share-settings.png" });
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
rec("7", "Share settings dialog closes on Esc", (await dlg.count()) === 0);
// start
const msgsBefore = A.texts.length;
await p.getByRole("button", { name: "Share screen" }).first().click(); await p.waitForTimeout(6000);
const shareMsgs = A.texts.slice(msgsBefore).filter((m) => /screenShare|webrtc|share/i.test(m.type)).map((m) => m.type + (m.code ? ":" + m.code : ""));
const bShare = B.texts.filter((m) => /screenShare/i.test(m.type)).map((m) => `${m.type}${m.streams ? "(" + m.streams.length + ")" : ""}`);
const btnState = await p.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter((t) => /share|stop|screen/i.test(t)));
console.log("A got:", shareMsgs, "| B got:", bShare, "| A buttons:", btnState, "| A errors:", A.errors);
await p.screenshot({ path: SP + "shots/81-share-A.png" }); await B.page.screenshot({ path: SP + "shots/82-share-B.png" });
const started = A.texts.some((m) => m.type === "screenShareStarted" || (m.type === "screenShareList" && m.streams?.length));
rec("7", "Screen share starts (server reports a stream)", started, `A msgs: ${shareMsgs.join(",")}`);
rec("7", "Viewer B is told about the stream", B.texts.some((m) => m.type === "screenShareList" && m.streams?.length) || B.texts.some((m) => /screenShareStarted|screenShareAvailable/.test(m.type)), `B msgs: ${bShare.join(",")}`);
const stop = p.getByRole("button", { name: /Stop/i }).first();
if (await stop.count()) { await stop.click(); await p.waitForTimeout(1500); rec("7", "Stop sharing", (await p.getByRole("button", { name: "Share screen" }).count()) > 0); }
await browser.close();
