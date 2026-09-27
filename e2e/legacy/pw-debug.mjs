import { launch, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const browser = await launch(SP + "quiet.wav");
for (const via of ["enter", "click"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"], locale: "en" });
  await ctx.addInitScript(() => { try { localStorage.setItem("webspeak:language", "en"); } catch {} });
  const tickets = []; let n = 0;
  await ctx.route("**/api/join-ticket", (r) => { tickets.push(JSON.parse(r.request().postData() || "{}").serverPassword); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ticket: "t" }) }); });
  await ctx.routeWebSocket(/\/ws\/voice/, (ws) => { n++; ws.onMessage(() => {}); if (n === 1) ws.send(JSON.stringify({ type: "error", error: { code: "SERVER_PASSWORD_REQUIRED", message: "x" } })); else { ws.send(JSON.stringify({ type: "connected", tsClientId: 1, members: [{ id: 1, nickname: "t", uid: "u" }], serverEventLog: [], whisperTargetIds: [], whisperActive: false })); ws.send(JSON.stringify({ type: "channelList", channels: [{ id: "1", parentID: "0", order: "0", name: "Lobby", members: [{ id: 1, nickname: "t", uid: "u" }] }] })); } });
  const p = await ctx.newPage(); const logs = []; p.on("console", (m) => logs.push(m.text().slice(0, 100)));
  await p.goto(URL_BASE + "/", { waitUntil: "networkidle" }); await p.fill("#nickname", "t"); await p.click(".join-form button[type=submit]"); await p.waitForTimeout(1200);
  const dlg = p.getByRole("dialog"); await dlg.locator("input[type=password]").fill("hunter2"); await p.waitForTimeout(200);
  const info = await dlg.evaluate((d) => { const f = d.querySelector("form"); const b = [...d.querySelectorAll("button")].find((x) => x.type === "submit"); return { formId: f?.id, btnForm: b?.getAttribute("form"), btnFormOwner: b?.form?.id, disabled: b?.disabled, activeTag: document.activeElement?.tagName, activeIsInput: document.activeElement === d.querySelector("input[type=password]") }; });
  console.log(via, "state before submit:", JSON.stringify(info));
  if (via === "enter") await p.keyboard.press("Enter"); else await dlg.getByRole("button").last().click();
  await p.waitForTimeout(1500);
  console.log(via, "→ tickets:", JSON.stringify(tickets), "dialog open:", await dlg.count(), "join page:", await p.locator(".join-page").count());
  await ctx.close();
}
await browser.close();
