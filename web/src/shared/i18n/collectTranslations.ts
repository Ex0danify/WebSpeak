/** Turn the result of an eager `import.meta.glob("./*.ts")` over one i18n folder into its
 *  `{ code: messages }` map. A language file exports its messages under its own code (or as
 *  default), so a code that is not a valid identifier (`pt-BR`) still works. */
export function collectTranslations(files: Record<string, Record<string, unknown>>): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(files).map(([path, module]) => {
      const code = path.slice(path.lastIndexOf("/") + 1, -3);
      return [code, (module[code] ?? module.default) as Record<string, string>];
    }),
  );
}
