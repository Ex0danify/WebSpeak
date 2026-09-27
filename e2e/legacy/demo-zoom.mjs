import { launch, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en", colorScheme: "light" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); localStorage.setItem("webspeak:theme", "light"); } catch {} });
const p = await ctx.newPage(); await p.goto(URL_BASE + "/demo", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
await p.screenshot({ path: SP + "shots/a0-demo-cards.png", clip: { x: 300, y: 370, width: 360, height: 160 } });
console.log(await p.evaluate(() => [...document.querySelectorAll("[class*=avatar], [data-slot=avatar]")].slice(0, 6).map((e) => { const cs = getComputedStyle(e); return `${Math.round(e.getBoundingClientRect().width)}px font=${cs.fontSize} "${e.textContent.trim()}"`; })));
// same for the real connected view avatar in the speaking card
await browser.close();
