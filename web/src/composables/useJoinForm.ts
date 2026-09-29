import { computed, onMounted, reactive, ref, type Ref } from "vue";
import { useI18n } from "../i18n/use-i18n.js";
import { serverKey } from "../lib/format.js";
import { readStorage, removeStorage, writeStorage } from "../lib/safe-storage.js";
import { toast as raiseToast } from "../lib/use-toast.js";
import {
  clearLocalData as clearStoredLocalData,
  listFavorites,
  listRecentServers,
  recordRecentServer,
  removeFavorite,
  saveFavorite,
  saveLocalPreferences,
  type FavoriteServer,
  type RecentServer,
} from "../services/local-persistence.js";
import { combineTeamSpeakTarget, DEFAULT_TEAM_SPEAK_PORT, isValidTeamSpeakPort, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import type { ThemeMode } from "../services/theme.js";
import type { VoiceState } from "./useVoiceWebSocket.js";

export interface UseJoinFormOptions {
  voiceState: VoiceState;
  identityMaterial: Ref<string>;
  /** Owned by the future channel-tree composable (Track 1.3); reset on connect/disconnect same as today. */
  selectedChannelId: Ref<string>;
  connect: (target: string, channel: string, nickname: string, serverPassword?: string, identity?: string, rememberIdentity?: boolean, inviteToken?: string, accelerated?: boolean, accelerationRelayId?: string) => void;
  disconnect: (preserveConnection?: boolean) => void;
  clearError: () => void;
  checkSupport: () => string | null;
  setThemeMode: (mode: ThemeMode) => void;
}

/** The pre-connect join screen: target/identity fields, the gateway's public config, favorites and
 *  recent servers, and connect/disconnect. Identity persistence (`identityReady`,
 *  `loadStoredIdentity`/`saveStoredIdentity`) stays in WebClient.vue because it writes directly into
 *  `identityMaterial`, which this composable only reads. */
export function useJoinForm(options: UseJoinFormOptions) {
  const { voiceState, identityMaterial, selectedChannelId, connect, disconnect, clearError, checkSupport, setThemeMode } = options;
  const { language, t } = useI18n();

  const query = new URLSearchParams(location.search);
  const inviteToken = query.get("invite") ?? "";

  function initialServerTarget() {
    const explicit = query.get("server") ?? query.get("target");
    if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
    const host = (query.get("tsHost") ?? location.hostname).trim();
    const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
    return splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
  }
  const initialTarget = initialServerTarget();

  const nickname = ref(readStorage("webspeak:nickname") ?? "");
  const channel = ref(query.get("channel") ?? "");
  const serverHost = ref(initialTarget.address);
  const serverPort = ref(initialTarget.port);
  const serverPassword = ref("");
  const accessMode = ref<"fixed" | "open">("fixed");
  const rememberIdentity = ref(readStorage("webspeak:remember-identity") !== "0");
  const favoriteServers = ref<FavoriteServer[]>([]);
  const recentServers = ref<RecentServer[]>([]);
  const initialized = ref(false);
  const siteName = ref("WebSpeak");
  const welcomeTextZh = ref("");
  const welcomeTextEn = ref("");
  const welcomeTextDe = ref("");
  const welcomeTextRu = ref("");
  const welcomeTextJa = ref("");
  const appVersion = ref("0.2.4");
  const visitorNumber = ref<number | null>(null);
  const visitorTotal = ref<number | null>(null);
  const accelerationRelays = ref<Array<{ id: string; name: string }>>([]);
  const accelerationRelayId = ref("");
  const accelerationAvailable = computed(() => accelerationRelays.value.length > 0);
  const browserError = ref("");
  const serverConfigLoading = ref(true);
  const serverPasswordDialog = reactive({ open: false, password: "", errorCode: "" });

  const localizedWelcomeText = computed(() => {
    const customText = {
      zh: welcomeTextZh.value,
      en: welcomeTextEn.value,
      de: welcomeTextDe.value,
      ru: welcomeTextRu.value,
      ja: welcomeTextJa.value,
    }[language.value];
    return customText || t("joinDescription");
  });

  function notify(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  function currentServerTarget(): string {
    return combineTeamSpeakTarget(serverHost.value, serverPort.value);
  }

  const canJoin = computed(() => Boolean(
    initialized.value
    && nickname.value.trim()
    && (accessMode.value === "fixed" || (serverHost.value.trim() && isValidTeamSpeakPort(serverPort.value))),
  ));
  const isFavorite = computed(() => favoriteServers.value.some((favorite) => favorite.id === serverKey(currentServerTarget())));

  function selectLocalServer(address: string, savedNickname?: string): void {
    const target = splitTeamSpeakTarget(address);
    serverHost.value = target.address;
    serverPort.value = target.port;
    if (savedNickname && !nickname.value.trim()) nickname.value = savedNickname;
  }

  async function toggleFavorite(): Promise<void> {
    const address = currentServerTarget();
    if (!address) return;
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    if (existing) {
      await removeFavorite(id);
      favoriteServers.value = favoriteServers.value.filter((favorite) => favorite.id !== id);
      notify(t("removedFavoriteToast"));
      return;
    }
    const favorite: FavoriteServer = { id, label: address, address, ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}), ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}), ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}) };
    await saveFavorite(favorite);
    favoriteServers.value = [...favoriteServers.value, favorite].sort((a, b) => a.label.localeCompare(b.label));
    notify(t("savedFavoriteToast"));
  }

  async function clearBrowserData(): Promise<void> {
    if (!window.confirm(t("clearLocalDataConfirm"))) return;
    await clearStoredLocalData();
    for (const key of ["webspeak:nickname", "webspeak:language", "webspeak:theme", "webspeak:input-device", "webspeak:output-device", "webspeak:remember-identity"]) removeStorage(key);
    setThemeMode("system");
    identityMaterial.value = "";
    rememberIdentity.value = false;
    favoriteServers.value = [];
    recentServers.value = [];
    notify(t("localDataCleared"));
  }

  async function loadPublicConfig() {
    try {
      const response = await fetch("/api/public-config", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const config = await response.json() as { version?: unknown; initialized?: unknown; siteName?: unknown; welcomeText?: unknown; welcomeTextEn?: unknown; welcomeTexts?: unknown; accessMode?: unknown; target?: unknown; visitorNumber?: unknown; visitorTotal?: unknown; accelerationAvailable?: unknown; accelerationRelays?: unknown };
      if (typeof config.version === "string" && config.version.trim()) appVersion.value = config.version.trim();
      visitorNumber.value = Number.isSafeInteger(config.visitorNumber) && Number(config.visitorNumber) > 0 ? Number(config.visitorNumber) : null;
      visitorTotal.value = Number.isSafeInteger(config.visitorTotal) && Number(config.visitorTotal) > 0 ? Number(config.visitorTotal) : null;
      initialized.value = config.initialized === true;
      if (typeof config.siteName === "string" && config.siteName.trim()) siteName.value = config.siteName.trim();
      if (typeof config.welcomeText === "string") welcomeTextZh.value = config.welcomeText;
      if (typeof config.welcomeTextEn === "string") welcomeTextEn.value = config.welcomeTextEn;
      if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
        const welcomeTexts = config.welcomeTexts as Record<string, unknown>;
        if (typeof welcomeTexts.zh === "string") welcomeTextZh.value = welcomeTexts.zh;
        if (typeof welcomeTexts.en === "string") welcomeTextEn.value = welcomeTexts.en;
        if (typeof welcomeTexts.de === "string") welcomeTextDe.value = welcomeTexts.de;
        if (typeof welcomeTexts.ru === "string") welcomeTextRu.value = welcomeTexts.ru;
        if (typeof welcomeTexts.ja === "string") welcomeTextJa.value = welcomeTexts.ja;
      }
      accessMode.value = config.accessMode === "open" ? "open" : "fixed";
      accelerationRelays.value = Array.isArray(config.accelerationRelays)
        ? config.accelerationRelays.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const relay = value as { id?: unknown; name?: unknown };
          return typeof relay.id === "string" && typeof relay.name === "string" && relay.id && relay.name
            ? [{ id: relay.id, name: relay.name }]
            : [];
        })
        : [];
      if (!accelerationAvailable.value || !accelerationRelays.value.some((relay) => relay.id === accelerationRelayId.value)) accelerationRelayId.value = "";
      const hasInviteTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
      if (!hasInviteTarget && typeof config.target === "string" && config.target.trim()) {
        const target = splitTeamSpeakTarget(config.target);
        serverHost.value = target.address;
        serverPort.value = target.port;
      }
    } catch {
      // Keep joining disabled until the gateway can confirm its initialized policy.
    } finally {
      serverConfigLoading.value = false;
    }
  }

  function doConnect() {
    if (!canJoin.value || voiceState.connecting) return;
    clearError();
    nickname.value = nickname.value.trim();
    writeStorage("webspeak:nickname", nickname.value);
    void saveLocalPreferences({ schemaVersion: 1, lastNickname: nickname.value });
    if (accessMode.value === "open") {
      serverHost.value = serverHost.value.trim();
      serverPort.value = serverPort.value.trim();
    }
    selectedChannelId.value = "";
    // Keep the password field available for a retry even when the target is
    // administrator-managed. The gateway still controls the target in fixed
    // mode and only accepts a non-empty retry password for that target.
    connect(currentServerTarget(), channel.value.trim(), nickname.value, serverPassword.value, rememberIdentity.value ? identityMaterial.value : "", rememberIdentity.value, inviteToken, Boolean(accelerationRelayId.value), accelerationRelayId.value);
  }

  function doDisconnect() {
    disconnect();
    selectedChannelId.value = "";
    notify(t("leftToast"));
  }

  function submitServerPassword() {
    if (!serverPasswordDialog.open || !serverPasswordDialog.password) return;
    serverPassword.value = serverPasswordDialog.password;
    serverPasswordDialog.open = false;
    serverPasswordDialog.password = "";
    serverPasswordDialog.errorCode = "";
    doConnect();
  }

  function cancelServerPassword() {
    serverPasswordDialog.open = false;
    serverPasswordDialog.password = "";
    serverPasswordDialog.errorCode = "";
    clearError();
  }

  function doShare() {
    const invite = new URL(location.href);
    invite.searchParams.delete("token");
    invite.searchParams.delete("target");
    invite.searchParams.delete("tsHost");
    invite.searchParams.delete("tsPort");
    invite.searchParams.delete("server");
    if (accessMode.value === "open" && serverHost.value.trim()) invite.searchParams.set("server", currentServerTarget());
    if (channel.value) invite.searchParams.set("channel", channel.value);
    navigator.clipboard?.writeText(invite.toString()).then(() => notify(t("copiedToast")), () => notify(t("copyFailedToast"), "danger"));
  }

  /** Records the current target as a recent server. Called from WebClient's own
   *  `watch(() => voiceState.connected, ...)`, which also drives performance monitoring
   *  (Track 1.9) and so stays there rather than moving into this composable. */
  function recordServerVisit(): void {
    const address = currentServerTarget();
    if (!address) return;
    const recent: RecentServer = {
      id: serverKey(address),
      address,
      ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
      ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}),
      lastConnectedAt: Date.now(),
      ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}),
    };
    void recordRecentServer(recent).then(() => listRecentServers().then((items) => { recentServers.value = items; }));
  }

  onMounted(() => {
    browserError.value = checkSupport() ?? "";
    void loadPublicConfig();
    void listFavorites().then((items) => { favoriteServers.value = items; });
    void listRecentServers().then((items) => { recentServers.value = items; });
  });

  return {
    nickname,
    channel,
    serverHost,
    serverPort,
    serverPassword,
    accessMode,
    rememberIdentity,
    favoriteServers,
    recentServers,
    initialized,
    siteName,
    welcomeTextZh,
    welcomeTextEn,
    welcomeTextDe,
    welcomeTextRu,
    welcomeTextJa,
    localizedWelcomeText,
    appVersion,
    visitorNumber,
    visitorTotal,
    accelerationRelays,
    accelerationRelayId,
    accelerationAvailable,
    browserError,
    serverConfigLoading,
    serverPasswordDialog,
    canJoin,
    isFavorite,
    currentServerTarget,
    selectLocalServer,
    toggleFavorite,
    loadPublicConfig,
    doConnect,
    doDisconnect,
    submitServerPassword,
    cancelServerPassword,
    doShare,
    clearBrowserData,
    recordServerVisit,
  };
}
