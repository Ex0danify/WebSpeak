import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { useCannedApi } from "../fixtures/canned-api";
import { installVoiceFixture } from "../fixtures/scripted-gateway";
import { discoveredLanguages, loadJoinRoomTranslations } from "../helpers/translations";
import { smallTargetRows } from "./small-targets";
import { smallTargets, TOUCH_TARGET } from "./targets";

// Touch targets at 390 px on the guest page and in the room (join form, the phone's four panels, the audio settings dialog, the
// member sheet). The admin console and the demo page are not scanned, one is a desk tool and the other a preview.

// small-targets.ts is keyed by English labels, so English is checked against it. Every other language is checked against
// English in the same run, since a longer label may wrap and make a target taller, but no state may gain a small target or
// shrink below its English size.

const translations = await loadJoinRoomTranslations();

type Measured = Map<string, Map<string, { count: number; min: number }>>;

async function measure(page: Page, lang: string): Promise<Measured> {
  const text = (key: string) => translations[lang]![key]!;
  await useCannedApi(page, { lang, theme: "light" });
  await installVoiceFixture(page.context());
  await page.addInitScript((code) => localStorage.setItem("webspeak:language", code), lang);

  async function joined(tab?: string) {
    await page.goto("/");
    await page.getByLabel(text("nickname")).fill("Snapshot Tester");
    await page.getByRole("button", { name: text("enterVoice") }).click();
    await page.getByRole("textbox", { name: text("searchMembers") }).waitFor();
    if (tab) await page.getByRole("tab", { name: text(tab) }).click();
  }

  const states: Record<string, () => Promise<void>> = {
    join: async () => {
      await page.goto("/", { waitUntil: "networkidle" });
    },
    channels: () => joined(),
    voice: () => joined("mobileVoice"),
    chat: () => joined("mobileChat"),
    more: () => joined("mobileMore"),
    settings: async () => {
      await joined("mobileMore");
      await page.getByRole("button", { name: text("audioSettings") }).click();
      await page.getByRole("dialog", { name: text("audioConfiguration") }).waitFor();
    },
    "member sheet": async () => {
      await joined();
      await page
        .getByRole("button", { name: text("moreMemberOptions") })
        .first()
        .click();
      await page.getByRole("dialog").last().waitFor();
    },
  };

  const result: Measured = new Map();
  for (const [state, open] of Object.entries(states)) {
    await open();
    const groups = new Map<string, { count: number; min: number }>();
    for (const target of await smallTargets(page)) {
      // Language-neutral key for the comparison with English: the tag only; English keeps its label.
      const key = lang === "en" ? `${target.tag} ${target.label}` : target.tag;
      const group = groups.get(key) ?? { count: 0, min: TOUCH_TARGET };
      group.count++;
      group.min = Math.min(group.min, target.width, target.height);
      groups.set(key, group);
    }
    result.set(state, groups);
  }
  return result;
}

/** English labels dropped, so a language can be compared with English by tag. */
function byTag(measured: Measured): Measured {
  const out: Measured = new Map();
  for (const [state, groups] of measured) {
    const merged = new Map<string, { count: number; min: number }>();
    for (const [key, group] of groups) {
      const tag = key.split(" ")[0]!;
      const have = merged.get(tag) ?? { count: 0, min: TOUCH_TARGET };
      merged.set(tag, { count: have.count + group.count, min: Math.min(have.min, group.min) });
    }
    out.set(state, merged);
  }
  return out;
}

for (const lang of discoveredLanguages()) {
  test(`${lang}: every touch target is 44 px${lang === "en" ? " or listed in small-targets.ts" : " or no smaller than in English"}`, async ({
    page,
  }, { project }) => {
    test.skip(project.name !== "mobile", "touch targets are measured on the phone viewport");
    const problems: string[] = [];

    if (lang === "en") {
      const rows = new Map(smallTargetRows.map((row) => [row.target, row]));
      const seen = new Set<string>();
      for (const [state, groups] of await measure(page, "en")) {
        for (const [key, group] of groups) {
          seen.add(key);
          const row = rows.get(key);
          if (!row) problems.push(`${state}: ${key} is ${group.min} px and not listed`);
          else if (group.min < row.min) problems.push(`${state}: ${key} is ${group.min} px, listed at ${row.min}`);
          else if (group.count > (row.count ?? 1)) problems.push(`${state}: ${group.count} of ${key}, listed ${row.count ?? 1}`);
        }
      }
      for (const row of smallTargetRows)
        if (!seen.has(row.target)) problems.push(`${row.target} is now 44 px or more, or gone: delete its row`);
    } else {
      const english = byTag(await measure(page, "en"));
      for (const [state, groups] of await measure(page, lang)) {
        const base = english.get(state)!;
        for (const [tag, group] of groups) {
          const was = base.get(tag);
          if (!was) problems.push(`${state}: ${group.count} small ${tag} in ${lang}, none in en`);
          else if (group.count > was.count) problems.push(`${state}: ${group.count} small ${tag} in ${lang}, ${was.count} in en`);
          else if (group.min < was.min) problems.push(`${state}: ${tag} is ${group.min} px in ${lang}, ${was.min} in en`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
}
