<script setup lang="ts">
import { useId } from "vue";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Icon } from "../ui/icon";
import { Input } from "../ui/input";

// Asks for a password: the TeamSpeak server password on a retry, or the
// password of a protected channel. The owner keeps the state; this only renders
// it. `cancel` fires for the Cancel button, the X, Esc and a backdrop click, so
// the owner clears its state in one place. Closing after a submit is the
// owner's job too: set `open` to false.
defineProps<{
  open: boolean;
  title: string;
  /** Text under the title, also the accessible description. */
  lead: string;
  /** Label of the password field. */
  label: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Shown under the field, which is then marked invalid. */
  error?: string;
  /** Locks the field and shows a spinner on the submit button. */
  submitting?: boolean;
}>();

const emit = defineEmits<{ submit: []; cancel: [] }>();
const password = defineModel<string>("password", { default: "" });
const formId = `password-form-${useId()}`;
</script>

<template>
  <Dialog :model-value="open" size="sm" :title="title" :description="lead" :close-label="closeLabel" @update:model-value="(value) => { if (!value) emit('cancel'); }">
    <form :id="formId" @submit.prevent="emit('submit')">
      <Field :label="label" :error="error">
        <Input v-model="password" type="password" autocomplete="current-password" :placeholder="placeholder" :disabled="submitting" autofocus>
          <template #leading><Icon name="lock" /></template>
        </Input>
      </Field>
    </form>
    <template #footer>
      <Button variant="ghost" :disabled="submitting" @click="emit('cancel')">{{ cancelLabel }}</Button>
      <Button type="submit" :form="formId" :loading="submitting" :disabled="submitting || !password">
        <span>{{ submitLabel }}</span>
        <Icon v-if="!submitting" name="chevron-right" />
      </Button>
    </template>
  </Dialog>
</template>
