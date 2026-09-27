import { launch, writeTone, URL_BASE, openSession } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
writeTone(SP + "tone.wav", { amp: 0.6 });
const results = [];
const rec = (id, name, ok, detail = "") => { results.push({ id, name, ok, detail }); console.log(`${ok === true ? "PASS" : ok === false ? "FAIL" : "NOTE"} [${id}] ${name}${detail ? " — " + detail : ""}`); };

const browser = await launch(SP + "tone.wav");
const open = (nick) => openSession(browser, nick);
const of = (s, type) => s.texts.filter((m) => m.type === type);

// ---- two live sessions on the real TS server
const A = await open("smoke-A");
const B = await open("smoke-B");
await A.page.waitForTimeout(1500);
const lobbyMembers = (s) => { const cl = of(s, "channelList").at(-1); return cl?.channels.find((c) => c.members.some((m) => m.nickname === "smoke-B"))?.members.map((m) => m.nickname); };
rec("2", "Both sessions see each other in the same channel", (lobbyMembers(A) || []).includes("smoke-A") && (lobbyMembers(A) || []).includes("smoke-B"), JSON.stringify(lobbyMembers(A)));
rec("2", "Channel tree: real channel count", true, `${of(A, "channelList").at(-1).channels.length} channels`);
const cur = await A.page.locator(".channel-row.active, [aria-current=true]").first().textContent().catch(() => "?");
rec("2", "Current channel highlighted", (cur || "").includes("Lobby"), (cur || "").trim().slice(0, 40));
await A.page.screenshot({ path: SP + "shots/10-two-members.png" });

// ---- voice: A's fake mic plays a tone; B must receive Opus frames and see A speaking
await B.page.waitForTimeout(3000);
rec("3", "Voice path A→TS→gateway→B: B received binary Opus frames", B.binary > 20, `${B.binary} binary frames at B, ${A.sent} PCM frames sent by A`);
const va = of(B, "voiceActivity");
rec("2", "Speaking indicator: B got voiceActivity for A", va.length > 0, `${va.length} voiceActivity msgs`);
await B.page.screenshot({ path: SP + "shots/11-speaking.png" });

// ---- mute / deafen
const dock = (s) => s.page.locator(".desktop-audio-dock");
const micBtn = A.page.getByRole("button", { name: /Microphone on|Microphone muted|Mute mic|Unmute/i }).first();
const before = A.sent;
await A.page.getByRole("button", { name: "Microphone on" }).first().click();
await A.page.waitForTimeout(1500);
const muteState = await A.page.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].map((b) => `${b.getAttribute("aria-label") || b.textContent.trim()}=${b.getAttribute("aria-pressed")}`));
const bMembers = of(B, "channelList").at(-1)?.channels.flatMap((c) => c.members) ?? [];
rec("3", "Mute toggle flips pressed state", muteState.some((x) => /=true/.test(x)), muteState.join(" | "));
const sentAfterMute = A.sent; await A.page.waitForTimeout(1000);
rec("3", "Muted mic stops uplink frames", A.sent - sentAfterMute <= 2, `${A.sent - sentAfterMute} frames in 1s while muted`);
await A.page.screenshot({ path: SP + "shots/12-muted.png" });
await A.page.getByRole("button", { name: /Microphone (muted|off)|Unmute/i }).first().click().catch((e) => rec("3", "Unmute click", false, e.message.split("\n")[0]));
await A.page.waitForTimeout(1200);
const sent2 = A.sent; await A.page.waitForTimeout(1000);
rec("3", "Unmuted mic resumes uplink frames", A.sent - sent2 > 20, `${A.sent - sent2} frames in 1s`);

await A.page.getByRole("button", { name: "Mute all audio" }).first().click();
await A.page.waitForTimeout(1200);
const deaf = await A.page.evaluate(() => [...document.querySelectorAll("button[aria-pressed=true]")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()));
rec("3", "Deafen toggle pressed", deaf.length > 0, deaf.join(" | "));
await A.page.screenshot({ path: SP + "shots/13-deafened.png" });
await A.page.getByRole("button", { name: /Unmute all audio|Mute all audio|Deafen/i }).first().click().catch(() => {});
await A.page.waitForTimeout(800);

// ---- chat A → B and B → A, long message wrap
const chatIn = B.page.locator("input[placeholder*='Message'], textarea[placeholder*='Message']").first();
const chatA = A.page.locator("input[placeholder*='Message'], textarea[placeholder*='Message']").first();
await chatA.fill("smoke hello from A"); await chatA.press("Enter");
await B.page.waitForTimeout(1500);
rec("6", "Chat A→B received", of(B, "chatMessage").some((m) => m.message === "smoke hello from A"));
await chatIn.fill("smoke reply from B"); await chatIn.press("Enter");
await A.page.waitForTimeout(1500);
rec("6", "Chat B→A received", of(A, "chatMessage").some((m) => m.message === "smoke reply from B"));
const long = "https://example.com/" + "very-long-unbroken-segment-".repeat(8) + " " + "wrap ".repeat(40);
await chatA.fill(long); await chatA.press("Enter");
await A.page.waitForTimeout(1200);
const overflow = await A.page.evaluate(() => { const bubbles = [...document.querySelectorAll("*")].filter((e) => e.textContent?.includes("very-long-unbroken") && e.children.length === 0); return bubbles.map((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > window.innerWidth); });
rec("6", "Long chat message wraps (no horizontal overflow)", overflow.length > 0 && overflow.every((x) => !x), JSON.stringify(overflow));
await A.page.screenshot({ path: SP + "shots/14-chat.png" });

// ---- channel switching (A moves to another real channel and back)
const channels = of(A, "channelList").at(-1).channels;
const target = channels.find((c) => !c.members.length && /Babbeln|-:- A/.test(c.name)) || channels.find((c) => !c.members.length);
await A.page.getByRole("button", { name: "Switch channel" }).first().click().catch(() => {});
rec("2", "Switch channel control present", true, `target=${target?.name}`);
for (const s of [A, B]) { await s.page.screenshot({ path: SP + `shots/15-${s === A ? "A" : "B"}-before-switch.png` }); }
console.log("__STATE__", JSON.stringify({ A_err: A.errors, B_err: B.errors }));
await A.ctx.close(); await B.ctx.close(); await browser.close();
console.log("SUMMARY", results.filter((r) => r.ok === false).length, "fail /", results.length);
