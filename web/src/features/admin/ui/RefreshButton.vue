<template>
  <Button variant="secondary" :aria-busy="busy ? 'true' : undefined" :class="busy ? 'pointer-events-none' : undefined">
    <Icon name="refresh" :size="17" :spin="busy" />{{ t("refresh") }}
  </Button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useI18n } from "@/shared/i18n/useI18n";

// The arrow turns once per second, and a refresh that answers faster must still show whole turns, or the icon only flashes. So it keeps
// turning until the turn it is in is done. A click goes to the parent, which listens with `@click`.
const props = defineProps<{ loading: boolean }>();

const TURN_MS = 1000;

const { t } = useI18n();
const busy = ref(false);
let startedAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.loading,
  (loading) => {
    clearTimeout(timer);
    if (loading) {
      if (!busy.value) startedAt = Date.now();
      busy.value = true;
      return;
    }
    if (!busy.value) return;
    const intoTurn = (Date.now() - startedAt) % TURN_MS;
    const rest = intoTurn === 0 ? 0 : TURN_MS - intoTurn;
    timer = setTimeout(() => (busy.value = false), rest);
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(timer));
</script>
