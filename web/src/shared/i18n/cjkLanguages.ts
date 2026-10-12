/** Languages whose own text is CJK. Every other language is checked for stray CJK characters (keyParity.test.ts, language matrix). */
const CJK_LANGUAGES = new Set(["zh", "ja", "ko"]);

export const isCjkLanguage = (code: string): boolean => CJK_LANGUAGES.has(code.split("-")[0]!.toLowerCase());
