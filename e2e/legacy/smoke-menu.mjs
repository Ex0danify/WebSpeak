import { launch, writeTone, openSession, rec, focusDesc, URL_BASE } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
writeTone(SP + "quiet.wav", { amp: 0 });
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A", { extraPerms: ["clipboard-read", "clipboard-write"] });
const B = await openSession(browser, "smoke-B");
await A.page.waitForTimeout(1500);
const row = A.page.locator(".member-row", { hasText: "smoke-B" }).first();

// 5. context menu (desktop: contextmenu event)
await row.click({ button: "right" });
await A.page.waitForTimeout(500);
const menu = A.page.getByRole("menu");
rec("5", "Context menu opens on right-click", (await menu.count()) === 1);
await A.page.screenshot({ path: SP + "shots/20-menu.png" });
const items = await menu.getByRole("menuitem").allTextContents().catch(() => []);
rec("5", "Menu items", items.length >= 5, JSON.stringify(items.map((t) => t.trim().slice(0, 30))));
// volume slider: keyboard reach + change
const slider = menu.getByRole("slider").first();
const v0 = await slider.getAttribute("aria-valuenow").catch(() => null);
await slider.focus().catch(() => {});
await A.page.keyboard.press("ArrowRight"); await A.page.keyboard.press("ArrowRight");
const v1 = await slider.getAttribute("aria-valuenow").catch(() => null);
rec("5", "Menu volume slider changes with arrow keys", v0 !== null && v1 !== null && v0 !== v1, `${v0} → ${v1}`);
// submenu "move to channel"
const sub = menu.getByRole("menuitem", { name: /move/i }).first();
await sub.hover(); await A.page.waitForTimeout(500);
await A.page.screenshot({ path: SP + "shots/21-submenu.png" });
const subItems = await A.page.getByRole("menu").last().getByRole("menuitem").allTextContents().catch(() => []);
rec("5", "'Move to channel' submenu lists channels", subItems.length >= 2, `${subItems.length} entries: ${JSON.stringify(subItems.slice(0, 4).map((s) => s.trim().slice(0, 24)))}`);
// actually move B to Babbeln on the real server
const babbeln = A.page.getByRole("menuitem", { name: /Babbeln/ }).first();
if (await babbeln.count()) {
  await babbeln.click(); await A.page.waitForTimeout(2000);
  const cl = A.of("channelList").at(-1);
  const where = cl.channels.find((c) => c.members.some((m) => m.nickname === "smoke-B"))?.name;
  const err = A.texts.filter((m) => /error|denied|failed|commandFailed/i.test(m.type) || m.errorCode).map((m) => JSON.stringify(m).slice(0, 160));
  rec("5", "Move member to channel on the real server", where === "Babbeln", `B is in '${where}'${err.length ? " ; errors: " + err.join(" / ") : ""}`);
  await A.page.screenshot({ path: SP + "shots/22-after-move.png" });
}

// 8. poke: A → B (B may be in another channel now; poke is server-wide)
const rowB = A.page.locator(".member-row", { hasText: "smoke-B" }).first();
await rowB.click({ button: "right" }); await A.page.waitForTimeout(400);
await A.page.getByRole("menuitem", { name: /poke/i }).first().click();
await B.page.waitForTimeout(2000);
const poked = B.of("pokeReceived");
rec("8", "Poke A→B delivered to B", poked.length > 0, JSON.stringify(poked[0] || {}).slice(0, 120));
await B.page.screenshot({ path: SP + "shots/23-poke-banner.png" });
rec("8", "Poke banner visible in B's UI", (await B.page.getByRole("alert").count()) + (await B.page.locator("[role=status]").count()) > 0);

// 8. toast: copy nickname
await rowB.click({ button: "right" }); await A.page.waitForTimeout(400);
await A.page.getByRole("menuitem", { name: /copy/i }).first().click();
await A.page.waitForTimeout(600);
const toast = await A.page.locator("[data-sonner-toast], [role=status], .toaster, li[data-state]").allTextContents();
rec("8", "Toast after 'copy nickname'", toast.some((t) => /cop/i.test(t)), JSON.stringify(toast.map((t) => t.trim().slice(0, 40))));
await A.page.screenshot({ path: SP + "shots/24-toast.png" });
await A.page.waitForTimeout(3200);
rec("8", "Toast auto-dismisses (~2.8 s)", (await A.page.locator("[role=status]").filter({ hasText: /cop/i }).count()) === 0);

// move B back to Lobby so the server is left as found
await rowB.click({ button: "right" }); await A.page.waitForTimeout(400);
await A.page.getByRole("menuitem", { name: /move/i }).first().hover(); await A.page.waitForTimeout(400);
await A.page.getByRole("menuitem", { name: /my channel|Lobby/i }).first().click().catch(() => {});
await A.page.waitForTimeout(1500);
console.log("B in:", A.of("channelList").at(-1).channels.find((c) => c.members.some((m) => m.nickname === "smoke-B"))?.name);
console.log("errors", A.errors, B.errors);
await browser.close();
