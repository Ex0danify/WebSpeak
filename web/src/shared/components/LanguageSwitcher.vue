<template>
  <div class="inline-flex shrink-0">
    <Menu align="end" :label="menuLabel" :close-label="closeLabel">
      <template #trigger>
        <Button
          variant="accentSoft"
          size="sm"
          :aria-label="menuLabel"
          class="group/lang min-w-17.5 flex-1 justify-start gap-1.5 max-narrow:min-w-15.5"
        >
          <span class="font-emoji text-md leading-none" aria-hidden="true">{{ currentLanguage.flag }}</span>
          <span class="tracking-wide">{{ currentLanguage.code }}</span>
          <Icon
            name="chevron-down"
            :size="13"
            class="ml-auto transition-transform group-aria-expanded/lang:rotate-180 motion-reduce:transition-none"
          />
        </Button>
      </template>
      <MenuItem v-for="option in options" :key="option.value" :current="modelValue === option.value" @select="select(option.value)">
        <span class="font-emoji text-flag leading-none" aria-hidden="true">{{ option.flag }}</span>
        <span class="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <strong class="text-xs whitespace-nowrap">{{ option.label }}</strong>
          <small class="text-2xs font-bold whitespace-nowrap text-fg-muted">{{ option.code }}</small>
        </span>
        <Icon v-if="modelValue === option.value" name="check" :size="14" />
      </MenuItem>
    </Menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Menu, MenuItem } from "../ui/menu";
import { LANGUAGES, type Language } from "../i18n/languages";

const props = withDefaults(
  defineProps<{
    modelValue: Language;
    menuLabel?: string;
    /** Text of the Close button in the mobile sheet. */
    closeLabel?: string;
  }>(),
  {
    menuLabel: "Language",
    closeLabel: "Close",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: Language];
  change: [value: Language];
}>();

const options = LANGUAGES.map((language) => ({
  value: language.code,
  code: language.code.toUpperCase(),
  label: language.endonym,
  flag: language.flag,
}));

const currentLanguage = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0]!);

function select(value: Language) {
  emit("update:modelValue", value);
  emit("change", value);
}
</script>
