<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

// A thin bar that shrinks from full to empty over `durationMs`, next to a faint seconds/minutes/hours label, and emits `done`
// when it runs out. `paused` freezes it in place, so it can follow a toast that pauses on hover. Purely visual: aria-hidden,
// and the owner acts on `done`.
const props = withDefaults(defineProps<{ durationMs: number; paused?: boolean; showLabel?: boolean }>(), {
  paused: false,
  showLabel: true,
});
const emit = defineEmits<{ done: [] }>();

const remaining = ref(props.durationMs);
let timer: ReturnType<typeof setInterval> | undefined;
let last = Date.now();

function stop(): void {
  clearInterval(timer);
  timer = undefined;
}

function start(): void {
  stop();
  remaining.value = props.durationMs;
  last = Date.now();
  if (props.durationMs <= 0) return;
  timer = setInterval(() => {
    const now = Date.now();
    // `last` advances even while paused, so resuming never jumps the bar.
    if (!props.paused) remaining.value = Math.max(0, remaining.value - (now - last));
    last = now;
    if (remaining.value <= 0) {
      stop();
      emit("done");
    }
  }, 100);
}

watch(() => props.durationMs, start, { immediate: true });
onBeforeUnmount(stop);

const pct = computed(() => (props.durationMs > 0 ? (remaining.value / props.durationMs) * 100 : 0));

// The largest whole unit that still reads naturally, rounded up so it counts "1s" rather than "0s" before closing.
const label = computed(() => {
  const seconds = Math.ceil(remaining.value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
});
</script>

<template>
  <div class="flex items-center gap-2" aria-hidden="true">
    <div class="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div class="h-full rounded-full bg-accent" :style="{ width: `${pct}%` }"></div>
    </div>
    <span v-if="showLabel" class="shrink-0 text-caption tabular-nums text-fg-muted/70">{{ label }}</span>
  </div>
</template>
