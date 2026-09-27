import { launch, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
for (const [stored, os] of [["dark", "light"], ["light", "dark"], ["system", "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: os });
  await ctx.addInitScript((stored) => {
    try { localStorage.setItem("webspeak:theme", stored); } catch {}
    const marks = (window.__marks = []);
    const t0 = performance.now();
    new PerformanceObserver((l) => l.getEntries().forEach((e) => marks.push(["paint:" + e.name, Math.round(e.startTime)]))).observe({ type: "paint", buffered: true });
    const seen = new Set();
    new MutationObserver(() => { const v = document.documentElement.getAttribute("data-theme"); if (v && !seen.has(v)) { seen.add(v); marks.push(["data-theme=" + v, Math.round(performance.now())]); } }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
    // sample the actual background of <html>/<body> on every animation frame until 600ms
    const bgs = (window.__bgs = []);
    const tick = () => { const b = document.body ? getComputedStyle(document.body).backgroundColor : "nobody"; const h = getComputedStyle(document.documentElement).backgroundColor; const last = bgs.at(-1); const cur = `${h}|${b}`; if (!last || last[1] !== cur) bgs.push([Math.round(performance.now()), cur]); if (performance.now() < 800) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, stored);
  const p = await ctx.newPage(); await p.goto(URL_BASE + "/", { waitUntil: "load" }); await p.waitForTimeout(900);
  const { marks, bgs } = await p.evaluate(() => ({ marks: window.__marks, bgs: window.__bgs }));
  const fp = marks.find((m) => m[0] === "paint:first-paint")?.[1] ?? 0;
  const th = marks.find((m) => m[0].startsWith("data-theme="))?.[1];
  console.log(`stored=${stored} os=${os}\n  marks: ${JSON.stringify(marks)}\n  bg timeline (t, html|body): ${JSON.stringify(bgs)}`);
  rec("9", `Theme '${stored}' (OS ${os}): data-theme set before first paint`, th !== undefined && th <= fp, `first-paint@${fp}ms, data-theme@${th}ms`);
  await ctx.close();
}
await browser.close();
