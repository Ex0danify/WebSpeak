// Lists the failed tests from the JUnit reports in test-results/ on the run's summary page, so a red job can be read
// without opening its log. Usage: node scripts/ci-summary.mjs [reportDir]. Writes to $GITHUB_STEP_SUMMARY, else stdout.
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "test-results";
const MAX_LISTED = 40;
const MAX_MESSAGE = 400;

const decode = (text) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
// eslint-disable-next-line no-control-regex
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, "");
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attribute = (attributes, name) => {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match ? decode(match[1]) : "";
};

const failures = [];
let total = 0;
const reports = existsSync(dir) ? readdirSync(dir).filter((name) => /^junit-.*\.xml$/.test(name)) : [];
for (const report of reports) {
  const suite = report.replace(/^junit-|\.xml$/g, "");
  for (const [, attributes, , body = ""] of readFileSync(join(dir, report), "utf8").matchAll(
    /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g,
  )) {
    total++;
    const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    if (!failure) continue;
    const detail = stripAnsi(decode(failure[3] ?? "") || attribute(failure[2], "message"))
      .trim()
      .split("\n")
      .slice(0, 6)
      .join("\n")
      .slice(0, MAX_MESSAGE);
    failures.push({ suite, name: attribute(attributes, "name"), file: attribute(attributes, "file"), detail });
  }
}

if (failures.length) {
  const lines = [`### ${process.env.GITHUB_JOB ?? "tests"}: ${failures.length} of ${total} tests failed`, ""];
  for (const { suite, name, file, detail } of failures.slice(0, MAX_LISTED)) {
    lines.push(
      `<details><summary><b>${suite}</b> · ${escapeHtml(file ? `${file} · ${name}` : name)}</summary>`,
      "",
      "```",
      detail,
      "```",
      "",
      "</details>",
      "",
    );
  }
  if (failures.length > MAX_LISTED) lines.push(`…and ${failures.length - MAX_LISTED} more, see the job log.`, "");
  const output = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
  else console.log(output);
}
