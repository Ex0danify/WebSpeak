import { launch, openSession, rec } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A", { viewport: { width: 390, height: 844 }, touch: true });
const B = await openSession(browser, "smoke-B"); const p = A.page; await p.waitForTimeout(1200);
const row = p.locator(".member-row", { hasText: "smoke-B" }).first();
const open = () => p.getByRole("button", { name: "Poke", exact: true }).count();
await row.locator("button").last().tap(); await p.waitForTimeout(700);
rec("5", "Sheet open (Poke button present)", (await open()) === 1);
await p.getByRole("button", { name: "Close", exact: true }).tap(); await p.waitForTimeout(800);
rec("5", "Close button dismisses the sheet", (await open()) === 0);
await row.locator("button").last().tap(); await p.waitForTimeout(600); await p.keyboard.press("Escape"); await p.waitForTimeout(600);
rec("5", "Escape dismisses the sheet", (await open()) === 0);
await row.locator("button").last().tap(); await p.waitForTimeout(600); await p.touchscreen.tap(195, 60); await p.waitForTimeout(700);
rec("5", "Backdrop tap dismisses the sheet", (await open()) === 0);
// poke from the sheet reaches B
await row.locator("button").last().tap(); await p.waitForTimeout(600);
await p.getByRole("button", { name: "Poke", exact: true }).tap(); await p.waitForTimeout(1800);
rec("5", "Poke from the mobile sheet reaches the peer", B.of("pokeReceived").length > 0);
// volume slider inside the sheet works by touch/keyboard
await row.locator("button").last().tap().catch(() => {}); await p.waitForTimeout(600);
const thumb = p.getByRole("slider").first(); const before = await thumb.getAttribute("aria-valuenow").catch(() => null);
if (before !== null) { await thumb.focus(); for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowRight"); }
const after = await thumb.getAttribute("aria-valuenow").catch(() => null);
rec("5", "Sheet volume slider changes", before !== null && before !== after, `${before} → ${after}`);
await browser.close();
