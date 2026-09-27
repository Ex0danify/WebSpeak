import { launch } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
for (const [label, opts] of [["mobile+touch", { isMobile: true, hasTouch: true }], ["touch only", { hasTouch: true }]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const p = await ctx.newPage();
  await p.setContent(`<div id=t style="width:300px;height:100px;background:#ccc" oncontextmenu="window.__cm=(window.__cm||0)+1;return false">press</div>`);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 100, y: 50 }] });
  await p.waitForTimeout(1200);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  console.log(label, "→ contextmenu events on a neutral div:", await p.evaluate(() => window.__cm || 0));
  await ctx.close();
}
await browser.close();
