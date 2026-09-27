import { launch, openSession, rec } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A", { viewport: { width: 390, height: 844 }, touch: true });
const B = await openSession(browser, "smoke-B"); const p = A.page; await p.waitForTimeout(1200);
const row = p.locator(".member-row", { hasText: "smoke-B" }).first();
await row.locator("button").last().tap(); await p.waitForTimeout(700);
const items = p.getByRole("menuitem");
const n = await items.count();
const hs = await items.evaluateAll((els) => els.map((e) => [e.textContent.trim().replace(/\s+/g, " ").slice(0, 18), Math.round(e.getBoundingClientRect().height)]));
const menu = p.getByRole("menu").first();
const geo = await menu.evaluate((m) => { const r = m.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), vh: innerHeight }; });
rec("5", "Sheet geometry: bottom-anchored, full width", geo.bottom >= geo.vh - 2 && geo.w >= 380, JSON.stringify(geo));
rec("5", "Sheet menuitems ≥44px", n >= 5 && hs.every(([, h]) => h >= 44), JSON.stringify(hs));
await p.getByRole("button", { name: "Close" }).last().tap(); await p.waitForTimeout(800);
rec("5", "Close button dismisses the sheet", (await p.getByRole("menu").count()) === 0, `menus left: ${await p.getByRole("menu").count()}`);
// open again, Escape
await row.locator("button").last().tap(); await p.waitForTimeout(600); await p.keyboard.press("Escape"); await p.waitForTimeout(500);
rec("5", "Escape dismisses the sheet", (await p.getByRole("menu").count()) === 0);
// backdrop tap
await row.locator("button").last().tap(); await p.waitForTimeout(600); await p.touchscreen.tap(195, 60); await p.waitForTimeout(600);
rec("5", "Backdrop tap dismisses the sheet", (await p.getByRole("menu").count()) === 0);
await browser.close();
