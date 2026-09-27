import { launch, openSession, rec, focusDesc, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A"); const B = await openSession(browser, "smoke-B");
const p = A.page; await p.waitForTimeout(800);

// 5. volume item by aria-label
await p.locator(".member-row", { hasText: "smoke-B" }).first().click({ button: "right" }); await p.waitForTimeout(400);
const vol = p.getByRole("menu").getByRole("menuitem", { name: /volume/i }).first();
const rv = () => vol.getAttribute("aria-label");
const v0 = await rv(); await vol.focus();
for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowRight");
const v1 = await rv(); await p.keyboard.press("Home"); const v2 = await rv();
rec("5", "Menu volume: Right/Home keys change value", v0 !== v1 && v2 !== v1, `${v0} → ${v1} → (Home) ${v2}`);
await p.keyboard.press("Escape"); await p.waitForTimeout(300);

// 4. all localStorage keys the settings touched
console.log("localStorage keys:", await p.evaluate(() => Object.keys(localStorage).join(", ")));

// 9/10. theme + language on the connected view
const themeBtn = p.getByRole("button", { name: /Switch to (dark|light) theme/ });
await themeBtn.click(); await p.waitForTimeout(400);
const t1 = await p.evaluate(() => ({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, stored: localStorage.getItem("webspeak:theme") }));
rec("9", "Theme toggle switches to dark", t1.attr === "dark" || t1.stored === "dark", JSON.stringify(t1));
await p.screenshot({ path: SP + "shots/40-dark-connected.png" });
await p.getByRole("button", { name: /Switch to (dark|light) theme/ }).click(); await p.waitForTimeout(300);

// languages, live, with clipped-text scan
const scan = () => p.evaluate(() => {
  const bad = [];
  for (const e of document.querySelectorAll("button,a,span,p,h1,h2,h3,strong,small,label,div")) {
    if (!e.offsetParent || e.children.length) continue;
    const t = e.textContent.trim(); if (!t) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.overflowX !== "visible") bad.push(t.slice(0, 40));
    const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) bad.push("OFFSCREEN:" + t.slice(0, 30));
  }
  return [...new Set(bad)];
});
for (const [code, label] of [["zh", /中文|简体/], ["de", /Deutsch/], ["ru", /Русский/], ["ja", /日本語/], ["en", /English/]]) {
  await p.getByRole("button", { name: /Language|语言|Sprache|Язык|言語/ }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("menuitem", { name: label }).first().click().catch(async () => { await p.getByText(label).first().click(); });
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ lang: document.documentElement.lang, stored: localStorage.getItem("webspeak:language"), exit: [...document.querySelectorAll("button")].find((b) => b.offsetParent && /Exit|退出|Verlassen|Beenden|Выйти|Выход|退出/.test(b.textContent))?.textContent.trim() }));
  const clipped = await scan();
  rec("10", `Language ${code}: switches live (stored=${st.stored}, html lang=${st.lang})`, st.stored === code, `exit button: '${st.exit}'`);
  rec("10", `Language ${code}: no clipped/overflowing text on desktop`, clipped.length === 0, JSON.stringify(clipped.slice(0, 6)));
  if (code === "de" || code === "ru") await p.screenshot({ path: SP + `shots/41-lang-${code}.png` });
}

// 11. keyboard: tab order + focus ring on every stop
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(3000); await p.fill("#nickname", "smoke-A"); await p.click(".join-form button[type=submit]"); await p.waitForSelector(".join-page", { state: "detached", timeout: 15000 }).catch(async () => { console.log("JOIN STUCK:", await p.evaluate(() => [...document.querySelectorAll("[role=alert]")].map((e) => e.textContent.trim()))); throw new Error("join stuck"); }); await p.waitForTimeout(1200);
await p.evaluate(() => document.activeElement?.blur()); await p.mouse.move(700, 800);
const stops = [];
for (let i = 0; i < 45; i++) { await p.keyboard.press("Tab"); stops.push(await focusDesc(p)); }
const uniq = new Set(stops.map((s) => s.label + s.tag)).size;
const noRing = stops.filter((s) => s !== "body" && !(s.ow >= 2 && s.os !== "none") && !s.shadow);
const widths = [...new Set(stops.map((s) => s.ow))];
rec("11", "Tab reaches many distinct controls", uniq >= 15, `${uniq} distinct stops in 45 Tabs`);
rec("11", "Every focus stop shows a ring (outline ≥2px or shadow)", noRing.length === 0, `no ring: ${JSON.stringify(noRing.slice(0, 5).map((s) => s.label))}`);
rec("11", "Focus ring widths observed", null, `outline widths: ${JSON.stringify(widths)} (plan floor: 2px accent; legacy 3px rule still present until 6.2)`);
console.log("tab order:", stops.slice(0, 20).map((s) => s.label || s.tag).join(" → "));

// 9. flash of wrong theme on reload (dark stored)
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
await c2.addInitScript(() => { try { localStorage.setItem("webspeak:theme", "dark"); } catch {} const marks = []; window.__marks = marks;
  new PerformanceObserver((l) => l.getEntries().forEach((e) => marks.push(`${e.name}@${Math.round(e.startTime)}`))).observe({ type: "paint", buffered: true });
  new MutationObserver(() => { if (document.documentElement.dataset.theme && !marks.some((m) => m.startsWith("theme"))) marks.push(`theme=${document.documentElement.dataset.theme}@${Math.round(performance.now())}`); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); });
const p2 = await c2.newPage(); await p2.goto(URL_BASE + "/", { waitUntil: "networkidle" }); await p2.waitForTimeout(500);
const marks = await p2.evaluate(() => window.__marks);
const themeAt = parseInt((marks.find((m) => m.startsWith("theme")) || "@99999").split("@")[1]); const fpAt = parseInt((marks.find((m) => m.startsWith("first-paint")) || "@0").split("@")[1]);
rec("9", "No flash of wrong theme on reload (dark stored)", fpAt >= themeAt, `marks: ${marks.join(", ")}`);
await c2.close();
console.log("errors", A.errors, B.errors);
await browser.close();
