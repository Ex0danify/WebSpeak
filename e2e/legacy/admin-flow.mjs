import { launch, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
const fields = () => p.$$eval("input,select,textarea,button", (els) => els.filter((e) => e.offsetParent).map((e) => `${e.tagName.toLowerCase()}[${e.type || ""}] ${(e.getAttribute("aria-label") || e.placeholder || e.textContent || e.id).trim().replace(/\s+/g, " ").slice(0, 28)}`));
await p.goto(URL_BASE + "/admin/login", { waitUntil: "networkidle" });
// wrong password first
await p.locator("input[type=text]").first().fill("admin"); await p.locator("input[type=password]").first().fill("wrong-password");
await p.locator("button[type=submit]").click(); await p.waitForTimeout(1000);
const errText = await p.locator("[role=alert], .field-error, [data-error], [role=status]").allTextContents();
rec("12", "Wrong password is rejected with a message", p.url().includes("login") && errText.join("").trim().length > 0, JSON.stringify(errText.map((t) => t.trim().slice(0, 60))));
await p.screenshot({ path: SP + "shots/71-admin-wrong.png" });
await p.locator("input[type=password]").first().fill("admin"); await p.locator("button[type=submit]").click(); await p.waitForTimeout(1500);
console.log("after login url:", p.url()); console.log("fields:", JSON.stringify(await fields()));
await p.screenshot({ path: SP + "shots/72-admin-after-login.png" });
console.log("errors", errs);
await browser.close();
