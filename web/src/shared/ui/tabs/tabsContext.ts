import { inject, provide, type InjectionKey } from "vue";

export type TabValue = string;

export interface TabsContext {
  variant: "underline" | "segmented" | "pills" | "bar";
}

const tabsKey: InjectionKey<TabsContext> = Symbol("ui-tabs");

export function provideTabs(context: TabsContext) {
  provide(tabsKey, context);
}

export function useTabs(): TabsContext {
  const context = inject(tabsKey, null);
  if (!context) throw new Error("[ui] TabList and Tab must be used inside Tabs");
  return context;
}
