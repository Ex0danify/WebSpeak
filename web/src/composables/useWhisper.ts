import { computed, ref } from "vue";
import { useI18n } from "../i18n/use-i18n.js";
import { toast as raiseToast } from "../lib/use-toast.js";
import type { ChannelMember } from "./useVoiceWebSocket.js";

export interface UseWhisperOptions {
  whisperTargetIds: Set<number>;
  members: ChannelMember[];
  setWhisperTargets: (clientIds: number[]) => void;
  setWhisperActive: (active: boolean) => void;
}

/** Whisper target selection and the hold-to-talk button that activates whisper mode, built on
 *  top of useVoiceWebSocket()'s whisperTargetIds/whisperActive state and setters. Does not
 *  duplicate that state, only the UI actions layered over it. */
export function useWhisper(options: UseWhisperOptions) {
  const { whisperTargetIds, members, setWhisperTargets, setWhisperActive } = options;
  const { t } = useI18n();

  function showToast(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  const whisperTargets = computed(() =>
    [...whisperTargetIds]
      .map((id) => members.find((member) => member.id === id))
      .filter((member): member is ChannelMember => Boolean(member)),
  );

  function toggleWhisperTarget(member: ChannelMember): void {
    if (member.isSelf) return;
    const targets = new Set(whisperTargetIds);
    if (targets.has(member.id)) targets.delete(member.id);
    else if (targets.size < 8) targets.add(member.id);
    setWhisperTargets([...targets]);
    showToast(targets.has(member.id) ? t("setWhisperTarget") : t("removeWhisperTarget"));
  }

  function clearWhisperTargets(): void {
    stopWhisperTalk();
    setWhisperTargets([]);
  }

  const whisperPttActive = ref(false);

  function onWhisperPttDown(event: PointerEvent): void {
    if (!whisperTargetIds.size) return;
    const target = event.currentTarget as HTMLElement | null;
    if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);
    whisperPttActive.value = true;
    setWhisperActive(true);
  }

  function onWhisperPttUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    stopWhisperTalk();
  }

  function stopWhisperTalk(): void {
    if (!whisperPttActive.value) return;
    whisperPttActive.value = false;
    setWhisperActive(false);
  }

  return {
    whisperPttActive,
    whisperTargets,
    toggleWhisperTarget,
    clearWhisperTargets,
    onWhisperPttDown,
    onWhisperPttUp,
    stopWhisperTalk,
  };
}
