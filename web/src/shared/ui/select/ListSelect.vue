<script setup lang="ts" generic="T extends ListSelectItem">
import { computed, inject } from "vue";
import { SelectContent, SelectItem, SelectItemIndicator, SelectPortal, SelectRoot, SelectTrigger, SelectViewport } from "reka-ui";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { controlVariants } from "@/shared/ui/input";
import { fieldContextKey } from "@/shared/ui/field";
import { listSelectContentClass, listSelectItemClass } from "@/shared/ui/select/listSelect";

export interface ListSelectItem {
  value: string;
  label: string;
  disabled?: boolean;
}

// A styled dropdown on reka-ui's Select, for when option rows need more than native <option> can show
// (markup, icons, per-row emphasis). It keeps reka's keyboard nav, typeahead, Esc and focus return.
// Plug it into a <Field> like <Select>; slots `value` (the closed trigger) and `item` (a row) take the
// selected/looped item so the caller owns the look. The native <Select> stays the default for plain lists.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    items: T[];
    invalid?: boolean;
    id?: string;
    placeholder?: string;
    ariaLabel?: string;
    class?: string;
    contentClass?: string;
  }>(),
  { invalid: false },
);

const model = defineModel<string>();
const field = inject(fieldContextKey, null);

const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
const triggerId = computed(() => props.id ?? field?.id.value);
const describedBy = computed(() => field?.describedBy.value);
const selected = computed(() => props.items.find((item) => item.value === model.value));
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      :id="triggerId"
      :aria-label="ariaLabel"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="
        cn(
          controlVariants({ invalid: isInvalid }),
          'flex cursor-pointer items-center justify-between gap-2 pr-3 text-left disabled:cursor-not-allowed',
          props.class,
        )
      "
    >
      <span class="min-w-0 truncate">
        <slot name="value" :item="selected">{{ selected?.label ?? placeholder }}</slot>
      </span>
      <Icon name="chevron-down" class="shrink-0 text-fg-muted" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent position="popper" :side-offset="4" :class="cn(listSelectContentClass, props.contentClass)">
        <SelectViewport>
          <SelectItem
            v-for="item in items"
            :key="item.value"
            :value="item.value"
            :text-value="item.label"
            :disabled="item.disabled"
            :class="listSelectItemClass"
          >
            <span class="flex w-4 shrink-0 justify-center">
              <SelectItemIndicator><Icon name="check" :size="16" /></SelectItemIndicator>
            </span>
            <span class="min-w-0 flex-1 truncate">
              <slot name="item" :item="item" :selected="item.value === model">{{ item.label }}</slot>
            </span>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
