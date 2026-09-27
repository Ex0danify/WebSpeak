import { launch, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en" });
const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 150)));
await p.goto(URL_BASE + "/admin/login", { waitUntil: "networkidle" });
await p.screenshot({ path: SP + "shots/70-admin-login.png" });
console.log("inputs:", await p.$$eval("input,button,select", (els) => els.filter((e) => e.offsetParent).map((e) => `${e.tagName.toLowerCase()}#${e.id}[${e.type}] name=${e.name} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}`)));
await browser.close();
