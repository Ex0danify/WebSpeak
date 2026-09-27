import { launch, openSession, rec, URL_BASE } from "./lib.mjs";
import { execSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A"); const p = A.page;
const bannerText = () => p.evaluate(() => [...document.querySelectorAll("[role=alert],[role=status]")].filter((e) => e.offsetParent).map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 90)));
console.log("before:", await bannerText());
// kill the gateway (real connection loss for the browser)
const pid = execSync("pgrep -f 'node dist/index.js' | head -1").toString().trim();
process.kill(Number(pid), "SIGTERM");
await p.waitForTimeout(3500);
const during = await bannerText();
await p.screenshot({ path: SP + "shots/95-reconnecting.png" });
rec("8", "Real connection loss shows a reconnect banner", during.some((t) => /reconnect|connection|lost|retry/i.test(t)), JSON.stringify(during));
// bring the gateway back
const out = openSync(SP + "gateway2.out", "a");
spawn("node", ["dist/index.js"], { cwd: "/home/ex0/Git/WebSpeak", env: { ...process.env, WEBSPEAK_DATA_DIR: SP + "../data" }, stdio: ["ignore", out, out], detached: true }).unref();
await p.waitForTimeout(12000);
const after = await bannerText();
await p.screenshot({ path: SP + "shots/96-reconnected.png" });
const inRoom = (await p.locator(".join-page").count()) === 0;
const members = await p.locator(".member-row").count();
rec("8", "After the gateway returns, the client recovers by itself", inRoom && members > 0 && !after.some((t) => /reconnecting/i.test(t)), `banners: ${JSON.stringify(after)}; in room: ${inRoom}; member rows: ${members}`);
console.log("errors", A.errors);
await browser.close();
