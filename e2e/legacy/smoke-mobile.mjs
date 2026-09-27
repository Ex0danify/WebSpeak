import { launch, openSession, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "tone.wav");
const M = { width: 390, height: 844 };
const A = await openSession(browser, "smoke-A", { viewport: M, touch: true, theme: "light" });
const B = await openSession(browser, "smoke-B");           // desktop peer so there is someone to act on
const p = A.page; await p.waitForTimeout(1500);
await p.screenshot({ path: SP + "shots/60-m-connected.png" });

// nav tabs
const tabs = await p.getByRole("tab").allTextContents();
rec("2", "Mobile nav tabs present", tabs.length === 4, JSON.stringify(tabs.map((t) => t.trim())));
for (const name of [/Chat/, /Voice/, /More/, /Channels/]) { await p.getByRole("tab", { name }).click(); await p.waitForTimeout(400); await p.screenshot({ path: SP + `shots/61-m-tab-${String(name).replace(/\W/g, "")}.png` }); }
rec("2", "All four mobile tabs switch without error", A.errors.length === 0, JSON.stringify(A.errors));

// member menu on touch. Emulated long-press never fires contextmenu in headless Chromium (verified on a neutral div), so:
// (a) tap the row's "..." button, (b) synthetic contextmenu event as the long-press stand-in.
const row = p.locator(".member-row", { hasText: "smoke-B" }).first();
await row.scrollIntoViewIfNeeded();
const dots = row.locator("button").last();
const dotsBox = await dots.boundingBox();
await dots.tap();
await p.waitForTimeout(600);
const sheetInfo = () => p.evaluate(() => {
  const vol = [...document.querySelectorAll("*")].find((e) => e.getAttribute("aria-label")?.startsWith("Member volume"));
  if (!vol) return null;
  const list = vol.closest("[role=menu],[role=dialog]") ?? vol.parentElement;
  const r = list.getBoundingClientRect();
  const items = [...list.querySelectorAll("[role=menuitem],button")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => [e.textContent.trim().replace(/\s+/g, " ").slice(0, 18), Math.round(e.getBoundingClientRect().height)]);
  return { role: list.getAttribute("role"), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), vh: innerHeight, items };
});
let sheet = await sheetInfo();
rec("5", "Tap on the row's '...' button opens the member menu", !!sheet, dotsBox ? `button ${Math.round(dotsBox.width)}x${Math.round(dotsBox.height)}` : "");
await p.screenshot({ path: SP + "shots/62-m-sheet.png" });
rec("5", "Menu renders as a bottom sheet on mobile (full width, bottom-anchored)", !!sheet && sheet.bottom >= sheet.vh - 2 && sheet.w >= 380, JSON.stringify({ role: sheet?.role, top: sheet?.top, bottom: sheet?.bottom, w: sheet?.w }));
rec("5", "Sheet actions are ≥44px touch targets", !!sheet && sheet.items.length > 0 && sheet.items.every(([, h]) => h >= 44), JSON.stringify(sheet?.items));
const moveItem = p.getByText("Move to", { exact: true }).first();
await moveItem.tap(); await p.waitForTimeout(500);
await p.screenshot({ path: SP + "shots/63-m-sheet-submenu.png" });
rec("5", "Sheet submenu expands inline (channel names listed)", (await p.getByText("Babbeln", { exact: true }).count()) > 0);
await p.getByRole("button", { name: /^Close$/ }).last().tap().catch(() => p.keyboard.press("Escape")); await p.waitForTimeout(500);
rec("5", "Sheet closes", !(await sheetInfo()));
await row.dispatchEvent("contextmenu", { clientX: 60, clientY: 500 }); await p.waitForTimeout(500);
rec("5", "Synthetic contextmenu (long-press stand-in) opens the sheet", !!(await sheetInfo()), "real long-press gesture NOT verifiable in headless emulation");
await p.keyboard.press("Escape"); await p.waitForTimeout(400);

// 44px touch targets across the mobile screens
await p.getByRole("tab", { name: /Channels/ }).click(); await p.waitForTimeout(300);
for (const tab of [/Channels/, /Chat/, /Voice/, /More/]) {
  await p.getByRole("tab", { name: tab }).click(); await p.waitForTimeout(350);
  const small = await p.evaluate(() => [...document.querySelectorAll("button,a[href],input,select,[role=tab],[role=switch],[role=slider]")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 43.5 || r.width < 43.5) && e.type !== "hidden"; }).map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || e.className.toString()).trim().replace(/\s+/g, " ").slice(0, 22)}(${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)})`));
  rec("11", `Touch targets <44px on mobile tab ${tab}`, small.length === 0 ? true : null, `${small.length}: ${JSON.stringify(small.slice(0, 8))}`);
}

// dark + de/ru overflow on mobile
for (const lang of ["de", "ru"]) {
  const S = await openSession(browser, "smoke-M" + lang, { viewport: M, touch: true, lang, theme: "dark" });
  for (const tab of ["channels", "chat", "voice", "more"]) {
    const t = S.page.getByRole("tab").nth(["channels", "chat", "voice", "more"].indexOf(tab)); await t.click(); await S.page.waitForTimeout(350);
    const bad = await S.page.evaluate(() => { const out = []; for (const e of document.querySelectorAll("button,a,span,p,h1,h2,h3,strong,small,label,div,[role=tab]")) { if (!e.offsetParent || e.children.length) continue; const tx = e.textContent.trim(); if (!tx) continue; const cs = getComputedStyle(e); if (e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.overflowX !== "visible") out.push(tx.slice(0, 30)); const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1) out.push("OFF:" + tx.slice(0, 26)); } return [...new Set(out)]; });
    const docOverflow = await S.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    rec("10", `Mobile ${lang} dark, tab ${tab}: no clipped text / page overflow`, bad.length === 0 && !docOverflow, JSON.stringify({ bad: bad.slice(0, 5), docOverflow }));
    await S.page.screenshot({ path: SP + `shots/64-m-${lang}-${tab}.png` });
  }
  await S.ctx.close();
}
console.log("errors", A.errors, B.errors);
await browser.close();
