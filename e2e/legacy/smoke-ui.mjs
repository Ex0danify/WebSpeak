import { launch, writeTone, openSession, rec, focusDesc, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
writeTone(SP + "tone.wav", { amp: 0.6 });
const browser = await launch(SP + "tone.wav");
const A = await openSession(browser, "smoke-A");
const B = await openSession(browser, "smoke-B");
await A.page.waitForTimeout(1000);
const p = A.page;

// 5. menu volume slider — it is a menuitem on desktop; drive it by keyboard from the open menu
await p.locator(".member-row", { hasText: "smoke-B" }).first().click({ button: "right" });
await p.waitForTimeout(400);
const vol = p.getByRole("menu").getByRole("menuitem", { name: /volume/i }).first();
const readVol = () => p.getByRole("menu").first().evaluate((m) => m.textContent.match(/(\d+)%/)?.[1] ?? null);
const before = await readVol();
await vol.focus(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
const after = await readVol();
rec("5", "Menu volume item: arrow keys change value", before !== null && after !== null && before !== after, `${before}% → ${after}%`);
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
rec("5", "Esc closes the menu", (await p.getByRole("menu").count()) === 0);

// 4. settings dialog
const gear = p.getByRole("button", { name: "Audio settings" });
await gear.click(); await p.waitForTimeout(500);
const dlg = p.getByRole("dialog");
rec("4", "Settings dialog opens", (await dlg.count()) === 1);
// meter moves with real (tone) input
await p.waitForTimeout(1500);
const level = await dlg.evaluate((d) => [...d.querySelectorAll("*")].map((e) => e.textContent.trim()).filter((t) => /^\d+(\.\d+)?%$/.test(t)));
rec("3", "Input meter moves with mic input", level.some((t) => parseFloat(t) > 5), `values seen: ${JSON.stringify(level)}`);
// focus trap
const trapped = []; for (let i = 0; i < 14; i++) { await p.keyboard.press("Tab"); trapped.push((await focusDesc(p)).inDialog); }
rec("11", "Dialog traps focus (14 Tabs stay inside)", trapped.every(Boolean), trapped.filter((x) => !x).length + " escapes");
// change controls: threshold slider + notification volume
const sliders = dlg.getByRole("slider");
const names = await sliders.evaluateAll((els) => els.map((e) => e.id || e.getAttribute("aria-labelledby")));
const thr = sliders.nth(0), nv = sliders.nth(1);
await thr.focus(); for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowRight");
await nv.focus(); for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowLeft");
const set = { thr: await thr.getAttribute("aria-valuenow"), nv: await nv.getAttribute("aria-valuenow") };
const ls = () => p.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => /audio|vox|volume|threshold|mic|input|output|notif/i.test(k))));
const lsBefore = await ls();
rec("4", "Slider values set", true, JSON.stringify({ names, set }));
await p.screenshot({ path: SP + "shots/30-settings-changed.png" });
// Esc closes + focus returns
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
const f1 = await focusDesc(p);
rec("4", "Esc closes dialog and returns focus to the opener", (await dlg.count()) === 0 && f1.label === "Audio settings", JSON.stringify(f1).slice(0, 100));
// backdrop click closes
await gear.click(); await p.waitForTimeout(400);
await p.mouse.click(1420, 450); await p.waitForTimeout(400);
rec("4", "Backdrop click closes dialog", (await dlg.count()) === 0);
const f2 = await focusDesc(p);
rec("4", "Focus returns after backdrop close", f2.label === "Audio settings", f2.label);
// persistence across reload
const stored = await ls();
rec("4", "Settings written to localStorage", Object.keys(stored).length > 0, JSON.stringify(stored).slice(0, 220));
await p.reload({ waitUntil: "networkidle" });
await p.fill("#nickname", "smoke-A"); await p.click(".join-form button[type=submit]");
await p.waitForSelector(".join-page", { state: "detached" }); await p.waitForTimeout(1200);
await p.getByRole("button", { name: "Audio settings" }).click(); await p.waitForTimeout(500);
const s2 = p.getByRole("dialog").getByRole("slider");
const after2 = { thr: await s2.nth(0).getAttribute("aria-valuenow"), nv: await s2.nth(1).getAttribute("aria-valuenow") };
rec("4", "Slider values persist across reload + rejoin", after2.thr === set.thr && after2.nv === set.nv, `${JSON.stringify(set)} vs ${JSON.stringify(after2)}`);
await p.keyboard.press("Escape");

// 1. remembered fields
await p.getByRole("button", { name: "Exit" }).click(); await p.waitForTimeout(1500);
const remembered = await p.locator("#nickname").inputValue().catch(() => "");
rec("1", "Nickname remembered after leaving", remembered === "smoke-A", `'${remembered}'`);
// validation: empty nickname
await p.fill("#nickname", ""); await p.waitForTimeout(400);
const dis = await p.locator(".join-form button[type=submit]").isDisabled();
rec("1", "Empty nickname blocks joining (submit disabled)", dis && !!(await p.locator(".join-page").count()), `disabled=${dis}`);
await p.screenshot({ path: SP + "shots/31-validation.png" });
// join with a channel name that exists (Babbeln) — exercises the channel field
await p.fill("#nickname", "smoke-A"); await p.fill("#channel", "Babbeln"); await p.click(".join-form button[type=submit]");
await p.waitForSelector(".join-page", { state: "detached", timeout: 20000 }); await p.waitForTimeout(2000);
const inCh = A.of("channelList").at(-1).channels.find((c) => c.members.some((m) => m.nickname === "smoke-A"))?.name;
rec("1", "Join with a target channel name lands there", inCh === "Babbeln", `in '${inCh}'`);
console.log("errors", A.errors, B.errors);
await browser.close();
