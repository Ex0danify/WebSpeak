import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// Playwright runs outside Vite, so the i18n modules' `import.meta.glob` is not available. A language is a
// file, so read each i18n folder the same way: every `<code>.ts` except the index and the tests.
const webSrc = fileURLToPath(new URL("../../web/src/", import.meta.url));

type Messages = Record<string, string>;

export async function loadFolder(folder: string): Promise<Record<string, Messages>> {
  const dir = `${webSrc}${folder}/`;
  const codes = readdirSync(dir)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts" && !file.endsWith(".test.ts"))
    .map((file) => file.slice(0, -3));
  const entries = await Promise.all(
    codes.map(async (code) => {
      const module = (await import(pathToFileURL(`${dir}${code}.ts`).href)) as Record<string, Messages>;
      return [code, module[code] ?? module.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** The merged `common` + `join` + `room` messages per language, what `t()` resolves for the join page. */
export async function loadJoinRoomTranslations(): Promise<Record<string, Messages>> {
  const [common, join, room] = await Promise.all([
    loadFolder("shared/i18n/common"),
    loadFolder("features/join/i18n"),
    loadFolder("features/room/i18n"),
  ]);
  return Object.fromEntries(Object.keys(room).map((language) => [language, { ...common[language], ...join[language], ...room[language] }]));
}

/** The codes every i18n folder has a file for, default first: what the app lists as languages. */
export function discoveredLanguages(): string[] {
  const folders = ["shared/i18n/common", "features/join/i18n", "features/room/i18n", "features/session/i18n"];
  const sets = folders.map((folder) =>
    readdirSync(`${webSrc}${folder}/`)
      .filter((file) => file.endsWith(".ts") && file !== "index.ts" && !file.endsWith(".test.ts"))
      .map((file) => file.slice(0, -3)),
  );
  return sets[0]!.filter((code) => sets.every((codes) => codes.includes(code))).sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
}
