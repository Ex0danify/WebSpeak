<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/shared/ui/button";
import Dialog from "@/shared/ui/dialog/Dialog.vue";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { statusIconName, statusTextClass } from "@/shared/ui/shared/status";
import { useDialogQueue } from "@/shared/composables/useDialog";

// Renders the confirm/prompt/alert raised through useDialog(), mount it once near the app root. The X, Esc and the backdrop
// resolve the active request the same as its cancel button (an alert has only acknowledge, so they acknowledge it).
withDefaults(defineProps<{ closeLabel?: string }>(), { closeLabel: "Close" });

const { current, settle } = useDialogQueue();

const value = ref("");

// A timed alert counts down from its timeout to zero and then acknowledges itself. The bar tracks `remaining / total`, the
// label shows the time left. Other requests, and an alert with no timeout, leave both at zero and off.
const timeout = computed(() => (current.value?.kind === "alert" ? (current.value.options.timeoutMs ?? 0) : 0));
const remaining = ref(0);
let endTimer: ReturnType<typeof setTimeout> | undefined;
let tick: ReturnType<typeof setInterval> | undefined;

function stopCountdown(): void {
  clearTimeout(endTimer);
  clearInterval(tick);
  endTimer = undefined;
  tick = undefined;
}

// Each request remounts the dialog, so the field starts fresh and any previous countdown is cleared before a new one begins.
watch(current, (request) => {
  value.value = request?.kind === "prompt" ? (request.options.initial ?? "") : "";
  stopCountdown();
  if (request?.kind !== "alert" || !request.options.timeoutMs || request.options.timeoutMs <= 0) {
    remaining.value = 0;
    return;
  }
  const total = request.options.timeoutMs;
  const deadline = Date.now() + total;
  remaining.value = total;
  endTimer = setTimeout(() => settle(request.id, true), total);
  tick = setInterval(() => (remaining.value = Math.max(0, deadline - Date.now())), 100);
});
onBeforeUnmount(stopCountdown);

const timerPct = computed(() => (timeout.value > 0 ? (remaining.value / timeout.value) * 100 : 0));

// The largest whole unit that still reads naturally: seconds under a minute, then minutes, then hours. Rounded up so it
// counts "1s" rather than "0s" before closing.
const countdownText = computed(() => {
  const seconds = Math.ceil(remaining.value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
});

function confirmActive(): void {
  if (!current.value) return;
  settle(current.value.id, current.value.kind === "prompt" ? value.value : true);
}

function cancelActive(): void {
  if (!current.value) return;
  settle(current.value.id, current.value.kind === "prompt" ? null : current.value.kind === "alert" ? true : false);
}
</script>

<template>
  <Dialog
    v-if="current"
    :model-value="true"
    size="sm"
    :title="current.options.title"
    :close-label="closeLabel"
    @update:model-value="(open) => !open && cancelActive()"
  >
    <form v-if="current.kind === 'prompt'" @submit.prevent="confirmActive">
      <Field :label="current.options.label">
        <Input v-model="value" :placeholder="current.options.placeholder" :autocomplete="current.options.autocomplete" autofocus />
      </Field>
    </form>
    <div v-else-if="current.options.message" class="flex items-start gap-3">
      <Icon
        v-if="current.options.variant"
        :name="statusIconName[current.options.variant]"
        :size="20"
        :class="['mt-0.5 shrink-0', statusTextClass[current.options.variant]]"
      />
      <p class="m-0 text-fg-muted">{{ current.options.message }}</p>
    </div>

    <div v-if="timeout > 0" class="mt-4 flex items-center gap-2" aria-hidden="true">
      <div class="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div class="h-full rounded-full bg-accent" :style="{ width: `${timerPct}%` }"></div>
      </div>
      <span class="shrink-0 text-caption tabular-nums text-fg-muted/70">{{ countdownText }}</span>
    </div>

    <template #footer>
      <Button v-if="current.kind !== 'alert'" variant="ghost" @click="cancelActive">{{ current.options.cancelLabel }}</Button>
      <Button :variant="current.kind !== 'prompt' && current.options.variant === 'danger' ? 'danger' : 'primary'" @click="confirmActive">
        {{ current.options.confirmLabel }}
      </Button>
    </template>
  </Dialog>
</template>
