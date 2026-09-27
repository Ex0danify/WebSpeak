import { launch, writeTone, openSession, rec, focusDesc, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
writeTone(SP + "quiet.wav", { amp: 0 });
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A"); const B = await openSession(browser, "smoke-B");
await A.page.waitForTimeout(1200);

// 5.21b: member volume sliders in the rows
const rowSliders = A.page.locator(".member-row .member-volume [role=slider]");
const n = await rowSliders.count();
rec("5.21b", "Every member row has a Slider (role=slider), no raw range input", n >= 2 && (await A.page.locator("input[type=range]").count()) === 0, `${n} sliders, ${await A.page.locator("input[type=range]").count()} raw range inputs`);
const rowB = A.page.locator(".member-row", { hasText: "smoke-B" }).first();
const sl = rowB.locator("[role=slider]");
await sl.focus();
const ring = await focusDesc(A.page);
rec("5.21b", "Row slider shows a focus ring on keyboard focus", ring.shadow || ring.ow >= 2, JSON.stringify({ shadow: ring.shadow, ow: ring.ow }));
const v0 = await sl.getAttribute("aria-valuenow");
await A.page.keyboard.press("ArrowRight"); await A.page.keyboard.press("ArrowRight"); await A.page.keyboard.press("ArrowRight");
const v1 = await sl.getAttribute("aria-valuenow");
const persisted = await A.page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => /vol/i.test(k))));
rec("5.21b", "Row slider changes by keyboard (0..400 range)", v0 !== v1 && Number(v1) > Number(v0), `${v0} → ${v1}; max=${await sl.getAttribute("aria-valuemax")}`);
const mv = await sl.getAttribute("aria-valuetext");
rec("5.21b", "Row slider has a spoken value and a name", /%$/.test(mv || "") && !!(await sl.getAttribute("aria-label")), `valuetext='${mv}' label='${await sl.getAttribute("aria-label")}'`);
await A.page.keyboard.press("Home"); const vh = await sl.getAttribute("aria-valuenow");
await A.page.keyboard.press("ArrowRight"); await A.page.keyboard.press("ArrowRight");
await A.page.screenshot({ path: SP + "shots/90-row-slider.png" });
await A.page.keyboard.press("Home"); await A.page.keyboard.press("End"); const vend = await sl.getAttribute("aria-valuenow");
rec("5.21b", "Home/End reach 0 and 400", vh === "0" && vend === "400", `Home=${vh} End=${vend}`);
await A.page.keyboard.press("Home"); for (let i = 0; i < 100; i++) await A.page.keyboard.press("ArrowRight"); // back to 100
const back = await sl.getAttribute("aria-valuenow");
console.log("row slider back at", back);

// 5.21c: screen share volume Slider in the player
await A.page.getByRole("button", { name: "Share screen" }).first().click(); await A.page.waitForTimeout(3500);
await B.page.getByRole("button", { name: "Watch screen" }).click(); await B.page.waitForTimeout(5000);
const player = B.page.locator(".screen-share-player-volume");
rec("5.21c", "Player has the volume Slider, and no raw range input on the page", (await player.locator("[role=slider]").count()) === 1 && (await B.page.locator("input[type=range]").count()) === 0);
const pv = player.locator("[role=slider]");
const s0 = await pv.getAttribute("aria-valuenow");
await pv.focus(); const pring = await focusDesc(B.page);
for (let i = 0; i < 20; i++) await B.page.keyboard.press("ArrowLeft");
const s1 = await pv.getAttribute("aria-valuenow");
const vol = await B.page.evaluate(() => document.querySelector("video")?.volume);
rec("5.21c", "Player slider changes the video volume", s0 !== s1 && Math.abs(vol - Number(s1) / 100) < 0.02, `${s0} → ${s1}, video.volume=${vol}`);
rec("5.21c", "Player slider has a name, a spoken value and a focus ring", !!(await pv.getAttribute("aria-label")) && /%$/.test((await pv.getAttribute("aria-valuetext")) || "") && (pring.shadow || pring.ow >= 2), JSON.stringify({ label: await pv.getAttribute("aria-label"), text: await pv.getAttribute("aria-valuetext"), shadow: pring.shadow }));
const box = await player.boundingBox(); const pillH = await player.evaluate((e) => e.getBoundingClientRect().height);
rec("5.21c", "Volume pill keeps its 38 px height", Math.abs(pillH - 38) <= 2, `${pillH}px, width ${box?.width}`);
await B.page.screenshot({ path: SP + "shots/91-player-slider.png" });
await B.page.keyboard.press("Escape"); await B.page.waitForTimeout(800);
await A.page.locator("[aria-label*='Stop' i], [title*='Stop' i]").first().click().catch(() => {}); await A.page.waitForTimeout(2000);
rec("7", "Stop sharing clears both sides", (await A.page.getByText("Live", { exact: true }).count()) === 0 && (await B.page.getByRole("button", { name: "Watch screen" }).count()) === 0);
console.log("errors", A.errors, B.errors);
await browser.close();
