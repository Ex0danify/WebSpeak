import { createRequire } from "node:module";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { launch, writeTone, openSession, PROFILE_ROOT } from "./lib.mjs";
const SP = new URL(".", import.meta.url).pathname;
const req = createRequire("/home/ex0/Git/WebSpeak/package.json");
const ts = req("@echosixhiya/teamspeak-client");
writeTone(SP + "quiet.wav", { amp: 0 });
const browser = await launch(SP + "quiet.wav");
const A = await openSession(browser, "smoke-A"); const B = await openSession(browser, "smoke-B");
const info = {};
for (const [n, s] of [["smoke-A", A], ["smoke-B", B]]) {
  if (!s.identity) { info[n] = { error: "no identity in connected message" }; continue; }
  const id = ts.identityFromString(s.identity);
  info[n] = { uid: ts.getUidFromPublicKey(id.publicKeyBase64()), level: id.securityLevel };
}
console.log("IDENTITIES", JSON.stringify(info));
writeFileSync(SP + "identities.json", JSON.stringify(info, null, 2));
writeFileSync(SP + "joined", "1");
rmSync(SP + "go", { force: true });
for (let i = 0; i < 1800 && !existsSync(SP + "go"); i++) await A.page.waitForTimeout(1000);
console.log("GO received");
await browser.close();
