import { launch, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, colorScheme: "light", locale: "en" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
const p = await ctx.newPage(); await p.goto(URL_BASE + "/", { waitUntil: "networkidle" });
const bg = () => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme }));
const a = await bg(); await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(400); const b = await bg(); await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(400); const c = await bg();
rec("9", "System mode (default) follows the OS live: light → dark → light", a.theme === "system" && a.bg !== b.bg && a.bg === c.bg, JSON.stringify({ light: a.bg, dark: b.bg, back: c.bg, attr: a.theme }));
// explicit light stays light under OS dark
await p.getByRole("button", { name: /Switch to (dark|light) theme/ }).click(); await p.waitForTimeout(300); const d = await bg();
await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(300); const e = await bg();
rec("9", "Explicit theme overrides the OS setting", d.theme !== "system" && d.bg === e.bg, JSON.stringify({ chosen: d, underOSdark: e }));
await browser.close();
