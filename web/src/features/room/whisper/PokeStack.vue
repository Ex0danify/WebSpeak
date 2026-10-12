<template>
  <div
    v-if="visiblePokes.length"
    class="fixed top-[82px] right-6 z-35 flex w-[380px] max-w-[calc(100%-48px)] flex-col gap-2 desktop:top-[calc(82px/var(--ui-scale))] desktop:right-[calc(24px/var(--ui-scale))]"
  >
    <Banner
      v-for="poke in visiblePokes"
      :key="poke.id"
      variant="warning"
      icon="bell"
      :title="`${poke.invokerName} ${t('pokedYou')}`"
      dismissible
      :dismiss-label="t('close')"
      floating
      @dismiss="$emit('dismiss', poke.id)"
    >
      <template v-if="poke.message">{{ poke.message }}</template>
    </Banner>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Banner } from "@/shared/ui/banner";
import { useI18n } from "@/shared/i18n/useI18n.js";

// Mirrors the inline shape of `pokeNotifications` in useRoomSession.ts, which has
// no exported type of its own, so the shape is repeated here.
interface PokeNotification {
  id: string;
  invokerId: number;
  invokerUid: string;
  invokerName: string;
  message: string;
  timestamp: number;
}

const props = defineProps<{
  pokes: PokeNotification[];
}>();

defineEmits<{
  (e: "dismiss", id: string): void;
}>();

const { t } = useI18n();

const visiblePokes = computed(() => props.pokes.slice(-3));
</script>
