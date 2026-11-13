<template>
  <Menu
    :open="Boolean(target)"
    :label="label"
    :close-label="t('close')"
    @update:open="(value) => !value && $emit('close')"
    @close-auto-focus="$emit('close-auto-focus', $event)"
  >
    <template #trigger><span class="fixed size-0" :style="menuStyle" aria-hidden="true"></span></template>
    <template v-if="target">
      <MenuLabel plain>{{ label }}</MenuLabel>
      <component :is="menuItemsFor(target)" v-bind="menuPayloadOf(target)" />
    </template>
  </Menu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Menu, MenuLabel } from "@/shared/ui/menu";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { ContextTarget } from "@/features/room/contextMenuApi.js";
import { menuItemsFor, menuLabelFor, menuPayloadOf } from "@/features/room/contextMenu/menuKinds.js";

// One menu for the whole room. The target's kind picks the items, the Menu around them is shared.
const props = defineProps<{
  target: ContextTarget | null;
  menuStyle: { left?: string; top?: string };
}>();

defineEmits<{
  (e: "close"): void;
  (e: "close-auto-focus", event: Event): void;
}>();

const { t } = useI18n();

const label = computed(() => (props.target ? menuLabelFor(props.target, t) : undefined));
</script>
