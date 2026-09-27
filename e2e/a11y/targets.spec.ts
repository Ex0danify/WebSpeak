import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { useCannedApi } from "../fixtures/canned-api";
import { installVoiceFixture } from "../fixtures/scripted-gateway";
import { expectInRoom, openMemberMenu, openSettings, submitJoin } from "../helpers";
import { smallTargetRows } from "./small-targets";
import { smallTargets, TOUCH_TARGET } from "./targets";

// Touch targets at 390 px on the guest page and in the room (join form, the phone's four panels,
// the audio settings dialog and the member sheet). The admin console and the demo page are not
// scanned: the console is a desk tool and the demo a preview.

async function joined(page: Page, tab?: string) {
  await submitJoin(page, "Snapshot Tester");
  await expectInRoom(page, "Snapshot Tester");
  if (tab) await page.getByRole("tab", { name: tab }).click();
}

const states: Record<string, (page: Page) => Promise<void>> = {
  join: async (page) => {
    await page.goto("/", { waitUntil: "networkidle" });
  },
  channels: (page) => joined(page),
  voice: (page) => joined(page, "Voice"),
  chat: (page) => joined(page, "Chat"),
  more: (page) => joined(page, "More"),
  settings: async (page) => {
    await joined(page);
    await openSettings(page);
  },
  "member sheet": async (page) => {
    await joined(page);
    await openMemberMenu(page, "Alex Rivera");
  },
};

test("every touch target is 44 px or listed in small-targets.ts", async ({ page }, { project }) => {
  test.skip(project.name !== "mobile", "touch targets are measured on the phone viewport");
  await useCannedApi(page, { lang: "en", theme: "light" });
  await installVoiceFixture(page.context());
  const rows = new Map(smallTargetRows.map((row) => [row.target, row]));
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const [state, open] of Object.entries(states)) {
    await open(page);
    const groups = new Map<string, { count: number; min: number }>();
    for (const target of await smallTargets(page)) {
      const key = `${target.tag} ${target.label}`;
      const group = groups.get(key) ?? { count: 0, min: TOUCH_TARGET };
      group.count++;
      group.min = Math.min(group.min, target.width, target.height);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      seen.add(key);
      const row = rows.get(key);
      if (!row) problems.push(`${state}: ${key} is ${group.min} px and not listed`);
      else if (group.min < row.min) problems.push(`${state}: ${key} is ${group.min} px, listed at ${row.min}`);
      else if (group.count > (row.count ?? 1)) problems.push(`${state}: ${group.count} of ${key}, listed ${row.count ?? 1}`);
    }
  }
  for (const row of smallTargetRows) if (!seen.has(row.target)) problems.push(`${row.target} is now 44 px or more, or gone: delete its row`);
  expect(problems).toEqual([]);
});
