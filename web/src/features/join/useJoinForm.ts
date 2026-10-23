import { storeToRefs } from "pinia";
import { computed, onMounted, reactive, ref, type Ref } from "vue";
import { useI18n } from "@/shared/i18n/useI18n.js";
import type { LocalizedText, MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import { serverKey } from "@/shared/lib/format.js";
import { removeStorage, writeStorage } from "@/shared/services/safeStorage.js";
import { toast as raiseToast } from "@/shared/composables/useToast.js";
import { useDialog } from "@/shared/composables/useDialog.js";
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
import { useJoinFormStore } from "@/features/join/stores/joinFormStore";
import { useGatewayStatus } from "@/features/join/useGatewayStatus";

export interface UseJoinFormOptions {
  voiceState: VoiceState;
  identityMaterial: Ref<string>;
  selectedIdentityId: Ref<string | undefined>;
  connect: (
    target: string,
    channel: string,
    nickname: string,
    serverPassword?: string,
    identity?: string,
    rememberIdentity?: boolean,
    inviteToken?: string,
    accelerated?: boolean,
    accelerationRelayId?: string,
  ) => void;
  disconnect: (preserveConnection?: boolean) => void;
  clearError: () => void;
  checkSupport: () => LocalizedText | null;
  setThemeMode: (mode: ThemeMode) => void;
}

/** The pre-connect join screen, with target/identity fields, the gateway's public config, favorites, recent servers and
 *  connect/disconnect. Identity persistence lives in `useJoinIdentity` because it writes straight into `identityMaterial`,
 *  which this composable only reads. */
/**
 * The gateway's last answer, kept for the life of the page: the join page is mounted again after a room session, possibly
 * with the gateway gone.
 */
let lastKnownInitialized = false;

export function useJoinForm(options: UseJoinFormOptions) {
  const { voiceState, identityMaterial, selectedIdentityId, connect, disconnect, clearError, checkSupport, setThemeMode } = options;
  const { language, setSiteName, t } = useI18n();
  const { confirm } = useDialog();

  const query = new URLSearchParams(location.search);
  const inviteToken = query.get("invite") ?? "";

  const { nickname, channel, serverHost, serverPort, rememberIdentity, accessMode, serverTarget } = storeToRefs(useJoinFormStore());
  const serverPassword = ref("");
  const favoriteServers = ref<FavoriteServer[]>([]);
  const recentServers = ref<RecentServer[]>([]);
  const initialized = ref(lastKnownInitialized);
  const siteName = ref("WebSpeak");
  const welcomeTexts = ref<Record<string, string>>({});
  const appVersion = ref("0.2.4");
  const visitorNumber = ref<number | null>(null);
  const visitorTotal = ref<number | null>(null);
  const accelerationRelays = ref<Array<{ id: string; name: string }>>([]);
  const accelerationRelayId = ref("");
  const accelerationAvailable = computed(() => accelerationRelays.value.length > 0);
  const browserError = ref<MaybeLocalizedText>("");
  const serverConfigLoading = ref(true);
  /** The gateway could not be asked for its settings, as opposed to answering that it is not configured. */
  const serverConfigFailed = ref(false);
  const serverPasswordDialog = reactive({ open: false, password: "", errorCode: "" });

  // Reload the settings once the gateway answers again, so a page opened during an outage fills itself in.
  const gateway = useGatewayStatus({ onRecover: () => void loadPublicConfig() });
  const gatewayStatus = gateway.status;

  const localizedWelcomeText = computed(() => {
    return welcomeTexts.value[language.value] || t("joinDescription");
  });

  function notify(message: string, variant: "success" | "danger" = "success") {
    raiseToast({ title: message, variant, duration: 2800 });
  }

  function currentServerTarget(): string {
    return serverTarget.value;
  }

  const canJoin = computed(() =>
    Boolean(
      gatewayStatus.value !== "offline" &&
      initialized.value &&
      nickname.value.trim() &&
      (accessMode.value === "fixed" || (serverHost.value.trim() && isValidTeamSpeakPort(serverPort.value))),
    ),
  );
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
    const favorite: FavoriteServer = {
      id,
      label: address,
      address,
      ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
      ...(selectedIdentityId.value ? { identityId: selectedIdentityId.value } : {}),
      ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}),
    };
    await saveFavorite(favorite);
    favoriteServers.value = [...favoriteServers.value, favorite].sort((a, b) => a.label.localeCompare(b.label));
    notify(t("savedFavoriteToast"));
  }

  async function clearBrowserData(): Promise<void> {
    const ok = await confirm({
      title: t("clearLocalDataTitle"),
      message: t("clearLocalDataConfirm"),
      confirmLabel: t("clearLocalDataSubmit"),
      cancelLabel: t("clearLocalDataCancel"),
      variant: "danger",
    });
    if (!ok) return;
    await clearStoredLocalData();
    for (const key of [
      "webspeak:nickname",
      "webspeak:language",
      "webspeak:theme",
      "webspeak:input-device",
      "webspeak:output-device",
      "webspeak:remember-identity",
    ])
      removeStorage(key);
    setThemeMode("system");
    identityMaterial.value = "";
    rememberIdentity.value = false;
    favoriteServers.value = [];
    recentServers.value = [];
    notify(t("localDataCleared"));
  }

  async function loadPublicConfig() {
    serverConfigLoading.value = true;
    try {
      const response = await fetch("/api/public-config", { headers: { accept: "application/json" } });
      if (!response.ok) {
        serverConfigFailed.value = !lastKnownInitialized;
        return;
      }
      const config = (await response.json()) as {
        version?: unknown;
        initialized?: unknown;
        siteName?: unknown;
        welcomeTexts?: unknown;
        accessMode?: unknown;
        target?: unknown;
        visitorNumber?: unknown;
        visitorTotal?: unknown;
        accelerationAvailable?: unknown;
        accelerationRelays?: unknown;
      };
      if (typeof config.version === "string" && config.version.trim()) appVersion.value = config.version.trim();
      visitorNumber.value =
        Number.isSafeInteger(config.visitorNumber) && Number(config.visitorNumber) > 0 ? Number(config.visitorNumber) : null;
      visitorTotal.value =
        Number.isSafeInteger(config.visitorTotal) && Number(config.visitorTotal) > 0 ? Number(config.visitorTotal) : null;
      serverConfigFailed.value = false;
      initialized.value = config.initialized === true;
      lastKnownInitialized = initialized.value;
      if (typeof config.siteName === "string" && config.siteName.trim()) {
        siteName.value = config.siteName.trim();
        setSiteName(siteName.value);
      }
      if (config.welcomeTexts && typeof config.welcomeTexts === "object" && !Array.isArray(config.welcomeTexts)) {
        welcomeTexts.value = Object.fromEntries(
          Object.entries(config.welcomeTexts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        );
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
      if (!accelerationAvailable.value || !accelerationRelays.value.some((relay) => relay.id === accelerationRelayId.value))
        accelerationRelayId.value = "";
      const hasInviteTarget = query.has("server") || query.has("target") || query.has("tsHost") || query.has("tsPort");
      if (!hasInviteTarget && typeof config.target === "string" && config.target.trim()) {
        const target = splitTeamSpeakTarget(config.target);
        serverHost.value = target.address;
        serverPort.value = target.port;
      }
    } catch {
      // Joining stays disabled until the gateway has confirmed its initialized policy once. After
      // that the last answer holds, so the form survives the gateway going away under a live page.
      serverConfigFailed.value = !lastKnownInitialized;
      void gateway.check();
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
    // Keep the password field available for a retry even when the target is administrator-managed. In fixed mode the gateway
    // still controls the target and only accepts a non-empty retry password for it.
    connect(
      currentServerTarget(),
      channel.value.trim(),
      nickname.value,
      serverPassword.value,
      rememberIdentity.value ? identityMaterial.value : "",
      rememberIdentity.value,
      inviteToken,
      Boolean(accelerationRelayId.value),
      accelerationRelayId.value,
    );
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
    gateway.start();
    void loadPublicConfig();
    void listFavorites().then((items) => {
      favoriteServers.value = items;
    });
    void listRecentServers().then((items) => {
      recentServers.value = items;
    });
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
    welcomeTexts,
    localizedWelcomeText,
    appVersion,
    visitorNumber,
    visitorTotal,
    accelerationRelays,
    accelerationRelayId,
    accelerationAvailable,
    browserError,
    serverConfigLoading,
    serverConfigFailed,
    gatewayStatus,
    gatewayRetryIn: gateway.retryIn,
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
