// Fails when a shipped dependency has a high or critical advisory, so a vulnerable build is never released.
// Gateway is audited production-only (the runtime image ships no dev deps); web is audited in full (every dep
// compiles into the static bundle). Build-only advisories in the gateway tree are reported but do not block.
import { execSync } from "node:child_process";

const BLOCK = new Set(["high", "critical"]);

const targets = [
  { name: "gateway (shipped)", cwd: ".", omitDev: true },
  { name: "web (bundled)", cwd: "web", omitDev: false },
];

let blocked = false;

for (const target of targets) {
  const command = `npm audit --json${target.omitDev ? " --omit=dev" : ""}`;
  let output;
  try {
    output = execSync(command, { cwd: target.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the JSON report is still on stdout.
    output = error.stdout?.toString() ?? "";
  }

  let report;
  try {
    report = JSON.parse(output);
  } catch {
    console.error(`audit-deps: could not parse "npm audit" output for ${target.name}`);
    process.exit(2);
  }

  const vulnerabilities = Object.values(report.vulnerabilities ?? {});
  const counts = {};
  for (const vulnerability of vulnerabilities) counts[vulnerability.severity] = (counts[vulnerability.severity] ?? 0) + 1;
  const summary =
    Object.entries(counts)
      .map(([severity, count]) => `${count} ${severity}`)
      .join(", ") || "none";

  const blocking = vulnerabilities.filter((vulnerability) => BLOCK.has(vulnerability.severity));
  if (blocking.length > 0) {
    blocked = true;
    console.error(`✗ ${target.name}: ${summary} — blocking: ${blocking.map((vulnerability) => vulnerability.name).join(", ")}`);
  } else {
    console.log(`✓ ${target.name}: ${summary} (no high or critical)`);
  }
}

if (blocked) {
  console.error(
    '\naudit-deps: high or critical advisory in shipped dependencies. Run "npm audit" / "npm --prefix web audit", then fix or update.',
  );
  process.exit(1);
}
console.log("audit-deps: no high or critical advisories in shipped dependencies.");
