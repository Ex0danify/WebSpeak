import { launch, openSession } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A", { viewport: { width: 390, height: 844 }, touch: true });
const B = await openSession(browser, "smoke-B"); const p = A.page; await p.waitForTimeout(1200);
await p.locator(".member-row", { hasText: "smoke-B" }).first().locator("button").last().tap(); await p.waitForTimeout(700);
console.log(await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 380 && r.height > 20 && r.height < 400 && (e.getAttribute("role") || e.tagName === "BUTTON" || e.hasAttribute("data-state")); }).map((e) => `${e.tagName.toLowerCase()} role=${e.getAttribute("role")} state=${e.getAttribute("data-state")} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}@${Math.round(e.getBoundingClientRect().top)} "${e.textContent.trim().replace(/\s+/g, " ").slice(0, 22)}"`).join("\n")));
await browser.close();
