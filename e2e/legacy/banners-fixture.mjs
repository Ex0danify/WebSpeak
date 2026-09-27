// FIXTURE-BASED: a TS-side drop cannot be caused against the real server without blocking its traffic.
import { launch, rec, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"], locale: "en" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
const tickets = []; let sock = null; const me = { id: 1, nickname: "bn", uid: "u" };
await ctx.route("**/api/join-ticket", (r) => { tickets.push(Date.now()); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: "t" + tickets.length }) }); });
await ctx.routeWebSocket(/\/ws\/voice/, (ws) => { sock = ws; const send = (o) => ws.send(JSON.stringify(o));
  ws.onMessage((raw) => { if (typeof raw !== "string") return; const m = JSON.parse(raw); if (m.requestId) send({ type: "commandCompleted", requestId: m.requestId }); if (m.type === "screenShareList") send({ type: "screenShareList", streams: [] }); });
  send({ type: "connected", tsClientId: 1, members: [me], serverEventLog: [], whisperTargetIds: [], whisperActive: false });
  send({ type: "channelList", channels: [{ id: "1", parentID: "0", order: "0", name: "Lobby", members: [me] }] }); });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await p.goto(URL_BASE + "/", { waitUntil: "networkidle" }); await p.fill("#nickname", "bn"); await p.click(".join-form button[type=submit]"); await p.waitForSelector(".join-page", { state: "detached" }); await p.waitForTimeout(800);
const send = (o) => sock.send(JSON.stringify(o));
const alerts = () => p.evaluate(() => [...document.querySelectorAll("[role=alert],[role=status]")].filter((e) => e.offsetParent).map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 100)));

send({ type: "reconnecting", attempt: 2 }); await p.waitForTimeout(600);
let a = await alerts(); rec("8", "Reconnecting banner appears with the attempt number [fixture]", a.some((t) => /reconnect/i.test(t)), JSON.stringify(a));
await p.screenshot({ path: SP + "shots/97-banner-reconnecting.png" });
send({ type: "reconnected" }); await p.waitForTimeout(600);
a = await alerts(); rec("8", "Banner clears on 'reconnected' [fixture]", !a.some((t) => /reconnecting/i.test(t)), JSON.stringify(a));

send({ type: "reconnectFailed", code: "CONNECTION_FAILED" }); await p.waitForTimeout(600);
a = await alerts(); rec("8", "Failed-reconnect banner (danger) appears [fixture]", a.some((t) => /fail|could not|unable|retry/i.test(t)), JSON.stringify(a));
await p.screenshot({ path: SP + "shots/98-banner-failed.png" });
const before = tickets.length;
const retry = p.getByRole("button", { name: /retry|try again|reconnect/i }).first();
rec("8", "Retry button is present on the failed banner", (await retry.count()) > 0);
await retry.click().catch(() => {}); await p.waitForTimeout(1500);
rec("8", "Retry starts a new join attempt (new ticket requested) [fixture]", tickets.length > before, `tickets ${before} → ${tickets.length}`);

send({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "opus encoder unavailable" }); await p.waitForTimeout(600);
a = await alerts(); rec("8", "Degraded-audio notice appears [fixture]", a.some((t) => /audio|encoder|opus/i.test(t)), JSON.stringify(a));
await p.screenshot({ path: SP + "shots/99-banner-audio.png" });
const dismiss = p.getByRole("button", { name: /dismiss|close|hide/i }).first();
if (await dismiss.count()) { await dismiss.click(); await p.waitForTimeout(400); a = await alerts(); rec("8", "Audio notice can be dismissed [fixture]", !a.some((t) => /audio|encoder|opus/i.test(t)), JSON.stringify(a)); } else rec("8", "Audio notice dismiss control", null, "no dismiss button found (may be non-dismissible by design)");

// poke stack: two pokes, dismiss one
send({ type: "pokeReceived", invokerId: 2, invokerUid: "x", invokerName: "Alex", message: "first", timestamp: Date.now() });
send({ type: "pokeReceived", invokerId: 3, invokerUid: "y", invokerName: "Mira", message: "second", timestamp: Date.now() }); await p.waitForTimeout(700);
a = await alerts(); const pokes = a.filter((t) => /Alex|Mira|poke/i.test(t));
rec("8", "Two pokes render as a stack of banners [fixture]", pokes.length >= 2, JSON.stringify(pokes));
await p.screenshot({ path: SP + "shots/9a-banner-pokes.png" });
const geo = await p.evaluate(() => [...document.querySelectorAll("[role=alert],[role=status]")].filter((e) => /Alex|Mira/.test(e.textContent)).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }));
rec("8", "Poke banners do not overlap each other", geo.length >= 2 && geo.every((g, i) => i === 0 || g[0] >= geo[i - 1][1] - 1 || g[1] <= geo[i - 1][0] + 1), JSON.stringify(geo));
console.log("errors", errs);
await browser.close();
