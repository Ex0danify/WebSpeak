import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { readStorage } from "@/shared/services/safeStorage";
import { combineTeamSpeakTarget, DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "@/shared/lib/teamspeakTarget";

function initialServerTarget(query: URLSearchParams) {
  const explicit = query.get("server") ?? query.get("target");
  if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
  const host = (query.get("tsHost") ?? location.hostname).trim();
  const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
  return splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
}

/** The join fields that outlive the join page. `ClientLayout` reads them to record the server visit when `connected` flips, and
 *  the room reads them for the invite link and avatar name while the join page is being replaced. */
export const useJoinFormStore = defineStore("joinForm", () => {
  const query = new URLSearchParams(location.search);
  const initialTarget = initialServerTarget(query);

  const nickname = ref(readStorage("webspeak:nickname") ?? "");
  const channel = ref(query.get("channel") ?? "");
  const serverHost = ref(initialTarget.address);
  const serverPort = ref(initialTarget.port);
  const rememberIdentity = ref(readStorage("webspeak:remember-identity") !== "0");
  /** From the gateway's public config; the room's invite link needs it after the join page is gone. */
  const accessMode = ref<"fixed" | "open">("fixed");
  const serverTarget = computed(() => combineTeamSpeakTarget(serverHost.value, serverPort.value));

  return { nickname, channel, serverHost, serverPort, rememberIdentity, accessMode, serverTarget };
});
