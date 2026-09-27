import { launch, openSession, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const whereIs = (s, nick) => s.of("channelList").at(-1)?.channels.find((c) => c.members.some((m) => m.nickname === nick))?.name;
// join with a target channel name
const A = await openSession(browser, "smoke-A", { join: false }); const p = A.page;
await p.fill("#nickname", "smoke-A"); await p.fill("#channel", "Babbeln"); await p.click(".join-form button[type=submit]");
await p.waitForSelector(".join-page", { state: "detached", timeout: 20000 }); await p.waitForTimeout(2500);
rec("1", "Join with target channel 'Babbeln' lands there (real server)", whereIs(A, "smoke-A") === "Babbeln", `in '${whereIs(A, "smoke-A")}'`);
const cur = async () => (await p.locator(".member-channel-group.current .member-channel-heading").first().textContent().catch(() => "?")).replace(/\d+$/, "").trim();
rec("2", "Current channel is highlighted after joining by channel name", (await cur()) === "Babbeln", `highlighted: '${await cur()}'`);
// a second user joins the default channel; A switches to Lobby by clicking it
const B = await openSession(browser, "smoke-B"); await p.waitForTimeout(1000);
const count = async (name) => p.locator(".member-channel-group", { has: p.locator(".member-channel-heading", { hasText: name }) }).locator(".member-channel-heading small").first().textContent();
console.log("counts Lobby/Babbeln before:", await count("Lobby"), await count("Babbeln"));
await p.locator(".member-channel-heading", { hasText: "====== Lobby" }).first().click(); await p.waitForTimeout(2500);
rec("2", "Clicking another channel switches on the real server", whereIs(A, "smoke-A") === "====== Lobby ======", `A in '${whereIs(A, "smoke-A")}', B in '${whereIs(B, "smoke-B")}'`);
rec("2", "Highlight follows the switch", (await cur()).startsWith("====== Lobby"), `highlighted: '${await cur()}'`);
rec("2", "Member count updates live (Lobby now 2, Babbeln 0)", (await count("Lobby")).trim() === "2" && (await count("Babbeln")).trim() === "0", `Lobby=${(await count("Lobby")).trim()} Babbeln=${(await count("Babbeln")).trim()}`);
await p.screenshot({ path: SP + "shots/b0-switched.png" });
console.log("errors", A.errors, B.errors);
await browser.close();
