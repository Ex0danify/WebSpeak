/** Every message key, derived from the default-language (`en`) object of each i18n module: a module's
 *  `index.ts` adds its keys with a `declare module` block, so no list exists to drift and no codegen runs. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MessageCatalog {}

export type MessageKey = Extract<keyof MessageCatalog, string>;
