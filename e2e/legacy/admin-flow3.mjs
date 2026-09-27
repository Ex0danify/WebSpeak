import { launch, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
const PW = "Smoke-Test-Pass-2026!";
await p.goto(URL_BASE + "/admin/login", { waitUntil: "networkidle" });
await p.locator("input[type=text]").first().fill("admin"); await p.locator("input[type=password]").first().fill(PW); await p.locator("button[type=submit]").click();
await p.waitForURL(/\/admin$/, { timeout: 8000 }).catch(() => {});
rec("12", "Login with the new password lands on the overview", /\/admin\/?$/.test(p.url()), p.url());
await p.waitForTimeout(1500); await p.screenshot({ path: SP + "shots/74-admin-overview.png" });
const overview = await p.locator("main, body").first().innerText();
rec("12", "Overview shows the TeamSpeak target/status", /9987|127\.0\.0\.1|TeamSpeak/i.test(overview), overview.replace(/\s+/g, " ").slice(0, 200));
// server settings page
await p.getByRole("link", { name: "Server" }).first().click(); await p.waitForTimeout(1500);
await p.screenshot({ path: SP + "shots/75-admin-server.png", fullPage: true });
const ctrl = await p.$$eval("input,select,textarea,button,[role=radio],[role=switch],[role=checkbox]", (els) => els.filter((e) => e.offsetParent).map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute("role") || e.type || ""}] ${(e.getAttribute("aria-label") || e.placeholder || e.value?.toString().slice(0, 16) || e.textContent || e.id).trim().replace(/\s+/g, " ").slice(0, 26)}`));
console.log("server page controls:", JSON.stringify(ctrl));
// change one harmless field (welcome text) and save
const ta = p.locator("textarea").first();
const orig = await ta.inputValue().catch(() => null);
if (orig !== null) await ta.fill(orig + " [smoke]");
const save = p.getByRole("button", { name: /^Save/ }).first();
rec("12", "Save button present and enabled after an edit", await save.isEnabled().catch(() => false));
await save.click(); await p.waitForTimeout(1500);
await p.screenshot({ path: SP + "shots/76-admin-saved.png" });
const cfg = await (await fetch(URL_BASE + "/api/public-config")).json();
rec("12", "Settings save persists (visible in public-config)", JSON.stringify(cfg).includes("[smoke]"), (cfg.welcomeText || "").slice(-30));
// restore
if (orig !== null) { await p.locator("textarea").first().fill(orig); await p.getByRole("button", { name: /^Save/ }).first().click(); await p.waitForTimeout(1200); }
// operations page
await p.getByRole("link", { name: "Operations" }).first().click(); await p.waitForTimeout(2500);
await p.screenshot({ path: SP + "shots/77-admin-operations.png", fullPage: true });
const ops = await p.locator("main, body").first().innerText();
rec("12", "Operations page renders sessions/diagnostics", /session|diagnos|invite|会话/i.test(ops), ops.replace(/\s+/g, " ").slice(0, 160));
// dark theme + mobile
await p.getByRole("button", { name: "Switch to dark theme" }).click(); await p.waitForTimeout(400);
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
await p.screenshot({ path: SP + "shots/78-admin-mobile-dark.png" });
rec("12", "Admin at 390px: no page-level horizontal overflow", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
console.log("errors", errs);
await browser.close();
