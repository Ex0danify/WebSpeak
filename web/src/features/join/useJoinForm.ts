import { storeToRefs } from "pinia";
import { computed, onMounted, reactive, ref, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { serverKey } from "@/shared/lib/format.js";
import { readStorage, removeStorage, writeStorage } from "@/shared/services/safeStorage.js";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import {
  clearLocalData as clearStoredLocalData,
  listFavorites,
  listRecentServers,
  removeFavorite,
  saveFavorite,
  saveLocalPreferences,
  type FavoriteServer,
  type RecentServer,
} from "@/shared/services/localPersistence.js";
import { isValidTeamSpeakPort, splitTeamSpeakTarget } from "@/shared/lib/teamspeakTarget.js";
import type { ThemeMode } from "@/shared/services/theme.js";
import type { VoiceState } from "@/features/session";
import { useJoinFormStore } from "./stores/joinFormStore";

export interface UseJoinFormOptions {
  voiceState: VoiceState;
  identityMaterial: Ref<string>;
  connect: (target: string, channel: string, nickname: string, serverPassword?: string, identity?: string, rememberIdentity?: boolean, inviteToken?: string, accelerated?: boolean, accelerationRelayId?: string) => void;
  disconnect: (preserveConnection?: boolean) => void;
  clearError: () => void;
  checkSupport: () => string | null;
  setThemeMode: (mode: ThemeMode) => void;
}

/** The pre-connect join screen: target/identity fields, the gateway's public config, favorites and
 *  recent servers, and connect/disconnect. Identity persistence lives in `useJoinIdentity`
 *  because it writes directly into `identityMaterial`, which this composable only reads. */
export function useJoinForm(options: UseJoinFormOptions) {
  const { voiceState, identityMaterial, connect, disconnect, clearError, checkSupport, setThemeMode } = options;
  const { language, t } = useI18n();

  const query = new URLSearchParams(location.search);
  const inviteToken = query.get("invite") ?? "";

  const { nickname, channel, serverHost, serverPort, rememberIdentity, accessMode, serverTarget } = storeToRefs(useJoinFormStore());
  const serverPassword = ref("");
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
    return serverTarget.value;
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
    // Keep the password field available for a retry even when the target is
    // administrator-managed. The gateway still controls the target in fixed
    // mode and only accepts a non-empty retry password for that target.
    connect(currentServerTarget(), channel.value.trim(), nickname.value, serverPassword.value, rememberIdentity.value ? identityMaterial.value : "", rememberIdentity.value, inviteToken, Boolean(accelerationRelayId.value), accelerationRelayId.value);
  }

  function doDisconnect() {
    disconnect();
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
    clearBrowserData,
  };
}
