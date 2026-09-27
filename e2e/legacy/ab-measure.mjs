import { launch, openSession, focusDesc } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname; const label = process.argv[2];
const browser = await launch(SP + "quiet.wav");
const out = { label };
// mobile touch targets per tab
const M = await openSession(browser, "smoke-A" + label[0], { viewport: { width: 390, height: 844 }, touch: true });
out.touch = {};
const tabSel = M.page.locator(".mobile-nav button, [role=tab]");
const n = await tabSel.count();
for (let i = 0; i < n; i++) {
  await tabSel.nth(i).click(); await M.page.waitForTimeout(350);
  const name = (await tabSel.nth(i).textContent()).trim();
  out.touch[name] = await M.page.evaluate(() => [...document.querySelectorAll("button,a[href],input:not([type=hidden]),select,[role=tab],[role=switch],[role=slider]")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 43.5 || r.width < 43.5); }).map((e) => `${(e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || e.className.toString()).trim().replace(/\s+/g, " ").slice(0, 20)}(${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)})`));
}
// desktop focus ring sweep
const D = await openSession(browser, "smoke-B" + label[0]); await D.page.waitForTimeout(800);
await D.page.evaluate(() => document.activeElement?.blur());
const stops = []; for (let i = 0; i < 40; i++) { await D.page.keyboard.press("Tab"); stops.push(await focusDesc(D.page)); }
out.focus = { widths: [...new Set(stops.map((s) => s.ow))], noRing: stops.filter((s) => s !== "body" && !(s.ow >= 2 && s.os !== "none") && !s.shadow).map((s) => s.label) };
// join page: focus ring on nickname input + button, and their sizes
const J = await openSession(browser, "x", { join: false }); const jp = J.page;
await jp.locator("#nickname").focus(); out.joinInputFocus = await focusDesc(jp);
out.joinInputBox = await jp.locator("#nickname").evaluate((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
await browser.close();
console.log(JSON.stringify(out, null, 1));
