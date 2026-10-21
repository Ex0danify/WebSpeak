<script setup lang="ts">
import { ref, watch } from "vue";
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
// Each request remounts the dialog, so the field starts from the request's initial value.
watch(current, (request) => {
  value.value = request?.kind === "prompt" ? (request.options.initial ?? "") : "";
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

    <template #footer>
      <Button v-if="current.kind !== 'alert'" variant="ghost" @click="cancelActive">{{ current.options.cancelLabel }}</Button>
      <Button :variant="current.kind !== 'prompt' && current.options.variant === 'danger' ? 'danger' : 'primary'" @click="confirmActive">
        {{ current.options.confirmLabel }}
      </Button>
    </template>
  </Dialog>
</template>
