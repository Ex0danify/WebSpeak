// FIXTURE-BASED (scripted /ws/voice): the real server has no protected channel and no server password.
import { launch, rec, focusDesc, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"], locale: "en" });
await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
const tickets = []; let wsCount = 0; const cmds = [];
const self = { id: 1, nickname: "pw-tester", uid: "u1" };
const channels = [{ id: "1", parentID: "0", order: "0", name: "Lobby", members: [self] }, { id: "2", parentID: "0", order: "1", name: "Secret Room", members: [] }];
await ctx.route("**/api/join-ticket", (r) => { tickets.push(JSON.parse(r.request().postData() || "{}")); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: "t" + tickets.length }) }); });
await ctx.routeWebSocket(/\/ws\/voice/, (ws) => {
  wsCount++; const n = wsCount;
  const send = (o) => ws.send(JSON.stringify(o));
  ws.onMessage((raw) => { if (typeof raw !== "string") return; const m = JSON.parse(raw); cmds.push(m);
    if (m.type === "switchChannel") {
      if (!m.payload?.password) send({ type: "error", requestId: m.requestId, error: { code: "CHANNEL_PASSWORD_REQUIRED", message: "needs password" } });
      else if (m.payload.password === "wrong") send({ type: "error", requestId: m.requestId, error: { code: "CHANNEL_PASSWORD_REQUIRED", message: "bad" } });
      else { send({ type: "commandCompleted", requestId: m.requestId }); send({ type: "channelSwitched", channelId: m.payload.channelId }); }
    } else if (m.requestId) send({ type: "commandCompleted", requestId: m.requestId });
    if (m.type === "screenShareList") send({ type: "screenShareList", streams: [] }); });
  if (n === 1) { send({ type: "connectionFailed", code: "PASSWORD_REQUIRED" }); ws.close({ code: 4003, reason: "PASSWORD_REQUIRED" }); return; }
  send({ type: "connected", tsClientId: 1, members: [self], serverEventLog: [], whisperTargetIds: [], whisperActive: false }); send({ type: "channelList", channels });
});
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
await p.goto(URL_BASE + "/", { waitUntil: "networkidle" });
await p.fill("#nickname", "pw-tester"); await p.click(".join-form button[type=submit]"); await p.waitForTimeout(1500);
const dlg = p.getByRole("dialog");
rec("1", "Server-password dialog opens on SERVER_PASSWORD_REQUIRED [fixture]", (await dlg.count()) === 1, (await dlg.textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 110));
await p.screenshot({ path: SP + "shots/90-server-pw.png" });
const submit = dlg.getByRole("button", { name: /retry|join|submit|ok|continue|connect/i }).last();
rec("1", "Submit disabled until a password is typed", !(await submit.isEnabled()));
rec("1", "Password field is focused when the dialog opens (autofocus)", (await focusDesc(p)).tag === "input", JSON.stringify((await focusDesc(p))).slice(0, 80));
await dlg.locator("input[type=password]").fill("hunter2"); await p.keyboard.press("Enter"); await p.waitForTimeout(2000);
rec("1", "Enter submits: a new join ticket carries the typed server password [fixture]", tickets.length === 2 && tickets[1].serverPassword === "hunter2", JSON.stringify(tickets.map((t) => t.serverPassword)));
rec("1", "Dialog closes and the room is shown after a successful retry", (await dlg.count()) === 0 && (await p.locator(".join-page").count()) === 0);
// channel password
await p.locator(".member-channel-heading", { hasText: "Secret Room" }).click(); await p.waitForTimeout(1200);
rec("1", "Channel-password dialog opens on CHANNEL_PASSWORD_REQUIRED [fixture]", (await dlg.count()) === 1, (await dlg.textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 110));
await p.screenshot({ path: SP + "shots/91-channel-pw.png" });
await dlg.locator("input[type=password]").fill("wrong"); await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
rec("1", "Wrong channel password keeps the dialog open with an error [fixture]", (await dlg.count()) === 1, (await dlg.textContent().catch(() => "")).replace(/\s+/g, " ").slice(-80));
await p.screenshot({ path: SP + "shots/92-channel-pw-wrong.png" });
await dlg.locator("input[type=password]").fill("right"); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
rec("1", "Right channel password closes the dialog and the command carried it [fixture]", (await dlg.count()) === 0 && cmds.some((m) => m.type === "switchChannel" && m.payload?.password === "right"), JSON.stringify(cmds.filter((m) => m.type === "switchChannel").map((m) => m.payload)));
// Esc/cancel
await p.locator(".member-channel-heading", { hasText: "Secret Room" }).click().catch(() => {}); await p.waitForTimeout(1000);
if (await dlg.count()) { await p.keyboard.press("Escape"); await p.waitForTimeout(400); rec("1", "Esc cancels the password dialog", (await dlg.count()) === 0); }
console.log("errors", errs);
await browser.close();
