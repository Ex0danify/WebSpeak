<template>
  <Dialog v-model="open" size="md" :title="member ? t('banDialogTitle', { nickname: member.nickname }) : ''" :close-label="t('close')">
    <form id="ban-form" class="grid gap-3" @submit.prevent="submit">
      <Field :label="t('moderationReasonPrompt')">
        <Input v-model="reason" :maxlength="MAX_MODERATION_REASON_LENGTH" autofocus />
      </Field>
      <Field :label="t('banDurationLabel')">
        <ListSelect v-model="preset" :items="presetItems" />
      </Field>
      <div v-if="preset === 'custom'" class="grid grid-cols-2 gap-2.5 max-narrow:grid-cols-1">
        <Field :label="t('banAmountLabel')" :error="seconds === null ? t('banAmountInvalid') : undefined">
          <Input v-model.number="amount" type="number" min="1" />
        </Field>
        <Field :label="t('banUnitLabel')">
          <ListSelect v-model="unit" :items="unitItems" />
        </Field>
      </div>
      <small class="text-2xs leading-snug text-fg-muted">{{ t("banNotice") }}</small>
    </form>
    <template #footer>
      <Button variant="ghost" @click="open = false">{{ t("cancel") }}</Button>
      <Button type="submit" form="ban-form" variant="danger" :disabled="seconds === null">{{ t("banConfirm") }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { ListSelect, type ListSelectItem } from "@/shared/ui/select";
import { useFormat } from "@/shared/i18n/useFormat";
import { useI18n } from "@/shared/i18n/useI18n";
import { MAX_MODERATION_REASON_LENGTH, type ChannelMember } from "@/features/session";
import { BAN_PRESETS, BAN_UNITS, PRESET_SECONDS, banSeconds, type BanPreset, type BanUnit } from "@/features/room/moderation/banDuration";

// Asks for the reason and how long, and hands both to `confirm`. The dialog does not send anything, the caller does, so a
// refusal is shown the way every other member action shows it.
defineProps<{ member: ChannelMember | null }>();
const emit = defineEmits<{ confirm: [seconds: number, reason: string] }>();
const open = defineModel<boolean>({ default: false });

const { t } = useI18n();
const format = useFormat();

const reason = ref("");
const preset = ref<string>("day");
const amount = ref<number>(1);
const unit = ref<string>("days");

// Every opening starts from the same defaults, not from what the last ban was.
watch(open, (isOpen) => {
  if (!isOpen) return;
  reason.value = "";
  preset.value = "day";
  amount.value = 1;
  unit.value = "days";
});

const presetLabel = (value: BanPreset): string => {
  if (value === "permanent") return t("banPermanent");
  if (value === "custom") return t("banCustom");
  return format.duration(PRESET_SECONDS[value], { style: "long" });
};
const unitLabels: Record<BanUnit, () => string> = {
  minutes: () => t("banUnitMinutes"),
  hours: () => t("banUnitHours"),
  days: () => t("banUnitDays"),
};

const presetItems = computed<ListSelectItem[]>(() => BAN_PRESETS.map((value) => ({ value, label: presetLabel(value) })));
const unitItems = computed<ListSelectItem[]>(() => BAN_UNITS.map((value) => ({ value, label: unitLabels[value]() })));

const seconds = computed(() => banSeconds({ preset: preset.value as BanPreset, amount: amount.value, unit: unit.value as BanUnit }));

function submit(): void {
  if (seconds.value === null) return;
  emit("confirm", seconds.value, reason.value.trim());
}
</script>
