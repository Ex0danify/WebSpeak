<template>
  <div v-if="visiblePokes.length" class="fixed right-6 top-[82px] z-[35] flex w-[380px] max-w-[calc(100%-48px)] flex-col gap-2 min-[851px]:right-[calc(24px/var(--ui-scale))] min-[851px]:top-[calc(82px/var(--ui-scale))]">
    <Banner
      v-for="poke in visiblePokes"
      :key="poke.id"
      variant="warning"
      icon="bell"
      :title="`${poke.invokerName} ${t('pokedYou')}`"
      dismissible
      :dismiss-label="t('close')"
      class="shadow-lg"
      @dismiss="$emit('dismiss', poke.id)"
    >
      <template v-if="poke.message">{{ poke.message }}</template>
    </Banner>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Banner } from "@/components/ui/banner";
import { useI18n } from "@/i18n/use-i18n.js";

// Mirrors the inline shape of `pokeNotifications` in useVoiceWebSocket.ts, which has
// no exported type of its own and is off-limits to edit (see decompose-plan.md §0.3).
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
