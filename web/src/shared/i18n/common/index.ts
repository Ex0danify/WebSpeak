import { de } from "./de.js";
import { en } from "./en.js";
import { ja } from "./ja.js";
import { ru } from "./ru.js";
import { zh } from "./zh.js";

export type Language = "zh" | "en" | "de" | "ru" | "ja";

export const translations: Record<string, Record<string, string>> = { zh, en, de, ru, ja };
