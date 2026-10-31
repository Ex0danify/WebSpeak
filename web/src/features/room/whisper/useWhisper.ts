import { computed, ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { notifyEvent } from "@/features/room/shell/roomNotify";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import type { ChannelMember } from "@/features/session";
import type { RoomSession } from "@/features/room/roomTypes";

export interface UseWhisperOptions {
  roster: Pick<RoomSession["roster"], "whisperTargetIds" | "members">;
  actions: Pick<RoomSession["actions"], "setWhisperTargets" | "setWhisperActive">;
}

/** Whisper target selection and the hold-to-talk button that activates whisper mode, built on
 *  top of useRoomSession()'s whisperTargetIds/whisperActive state and setters. Does not
 *  duplicate that state, only the UI actions layered over it. */
export function useWhisper(options: UseWhisperOptions) {
  const { whisperTargetIds, members } = options.roster;
  const { setWhisperTargets, setWhisperActive } = options.actions;
  const { t } = useI18n();

  function showToast(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  const whisperTargets = computed(() =>
    [...whisperTargetIds]
      .map((id) => members.find((member) => member.id === id))
      .filter((member): member is ChannelMember => Boolean(member)),
  );

  function showFailure(error: unknown): void {
    notifyEvent(t("failWhisper"), { error });
  }

  async function toggleWhisperTarget(member: ChannelMember): Promise<void> {
    if (member.isSelf) return;
    const targets = new Set(whisperTargetIds);
    if (targets.has(member.id)) targets.delete(member.id);
    else if (targets.size < 8) targets.add(member.id);
    try {
      await setWhisperTargets([...targets]);
      showToast(targets.has(member.id) ? t("setWhisperTarget") : t("removeWhisperTarget"));
    } catch (error: unknown) {
      showFailure(error);
    }
  }

  async function clearWhisperTargets(): Promise<void> {
    stopWhisperTalk();
    try {
      await setWhisperTargets([]);
    } catch (error: unknown) {
      showFailure(error);
    }
  }

  const whisperPttActive = ref(false);

  function onWhisperPttDown(event: PointerEvent): void {
    if (!whisperTargetIds.size) return;
    const target = event.currentTarget as HTMLElement | null;
    if (target?.setPointerCapture && !target.hasPointerCapture(event.pointerId)) target.setPointerCapture(event.pointerId);
    whisperPttActive.value = true;
    setWhisperActive(true).catch((error: unknown) => {
      // Not whispering after all, so the held button stops claiming it.
      whisperPttActive.value = false;
      showFailure(error);
    });
  }

  function onWhisperPttUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.releasePointerCapture && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    stopWhisperTalk();
  }

  function stopWhisperTalk(): void {
    if (!whisperPttActive.value) return;
    whisperPttActive.value = false;
    setWhisperActive(false).catch(showFailure);
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
