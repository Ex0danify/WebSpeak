import type { ComputedRef, InjectionKey } from "vue";

/** What a Field tells the control inside it, so ids and ARIA wiring need no props. */
export interface FieldContext {
  id: ComputedRef<string>;
  describedBy: ComputedRef<string | undefined>;
  invalid: ComputedRef<boolean>;
}

export const fieldContextKey: InjectionKey<FieldContext> = Symbol("ui-field");
