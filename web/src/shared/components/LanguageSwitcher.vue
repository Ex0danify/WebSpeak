<template>
  <div class="language-switcher inline-flex shrink-0">
    <Menu align="end" :label="menuLabel" :close-label="closeLabel">
      <template #trigger>
        <Button
          variant="outline"
          size="sm"
          :aria-label="menuLabel"
          class="group/lang min-w-[70px] flex-1 justify-start gap-1.5 border-line bg-accent-soft px-[9px] text-[11px] font-extrabold text-accent hover:bg-accent hover:text-accent-fg aria-expanded:bg-accent aria-expanded:text-accent-fg max-[520px]:min-w-[62px] max-[520px]:px-[7px]"
        >
          <span class="language-flag text-[15px] leading-none" aria-hidden="true">{{ currentLanguage.flag }}</span>
          <span class="tracking-[.02em]">{{ currentLanguage.code }}</span>
          <Icon name="chevron-down" :size="13" class="ml-auto transition-transform group-aria-expanded/lang:rotate-180 motion-reduce:transition-none" />
        </Button>
      </template>
      <MenuItem
        v-for="option in options"
        :key="option.value"
        :aria-current="modelValue === option.value ? 'true' : undefined"
        :class="modelValue === option.value ? 'bg-surface-0 text-accent [&_.ui-icon]:text-accent' : ''"
        @select="select(option.value)"
      >
        <span class="language-flag text-[17px] leading-none" aria-hidden="true">{{ option.flag }}</span>
        <span class="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <strong class="whitespace-nowrap text-xs">{{ option.label }}</strong>
          <small class="whitespace-nowrap text-[10px] font-bold text-fg-muted">{{ option.code }}</small>
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

const props = withDefaults(defineProps<{
  modelValue: Language;
  menuLabel?: string;
  /** Text of the Close button in the mobile sheet. */
  closeLabel?: string;
}>(), {
  menuLabel: "Language",
  closeLabel: "Close",
});

const emit = defineEmits<{
  "update:modelValue": [value: Language];
  change: [value: Language];
}>();

const options = LANGUAGES.map((language) => ({ value: language.code, code: language.code.toUpperCase(), label: language.endonym, flag: language.flag }));

const currentLanguage = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0]!);

function select(value: Language) {
  emit("update:modelValue", value);
  emit("change", value);
}
</script>

<style scoped>
.language-flag {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
}
</style>
