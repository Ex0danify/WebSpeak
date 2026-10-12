<template>
  <div
    class="relative rounded-lg border border-line bg-surface-1/92 p-7.5 shadow-sm backdrop-blur-md max-medium:p-7 max-compact:px-4.5 max-compact:py-5.5 max-phone:px-3.75 compact:max-h-[calc(100dvh-190px)] compact:overflow-y-auto"
  >
    <h2 class="mt-2.5 mb-1.75 text-3xl font-bold tracking-brand text-fg max-compact:text-xl">{{ t("welcomeBack") }}</h2>
    <p class="m-0 mb-1.75 text-sm leading-tight text-fg-muted max-compact:text-ui">{{ t("joinLead") }}</p>

    <Banner v-if="error" variant="danger" class="mb-2.5"
      ><span>{{ resolveText(error) }}</span
      ><code v-if="errorCode" class="mt-0.75 block max-w-full truncate font-mono text-2xs leading-snug opacity-78"
        >{{ t("errorCode") }}: {{ visibleErrorCode(errorCode) }}</code
      ></Banner
    >
    <Banner v-if="browserError" variant="warning" class="mb-2.5">{{ resolveText(browserError) }}</Banner>
    <Banner v-if="!serverConfigLoading && !initialized" variant="warning" class="mb-2.5"
      >{{ t("notConfigured") }} <a href="/admin">{{ t("configureNow") }}</a></Banner
    >
    <Banner v-if="!localPersistenceAvailable" variant="warning" class="mb-2.5">{{ t("localPersistenceUnavailable") }}</Banner>

    <form v-if="initialized" class="grid gap-1.5" @submit.prevent="$emit('connect')">
      <div v-if="accessMode === 'open'" class="flex gap-3">
        <Field id="server-address" class="min-w-0 flex-1" :label="t('serverAddress')"
          ><Input v-model="serverHost" autocomplete="url" :placeholder="t('serverAddressPlaceholder')"
            ><template #leading><Icon name="server" /></template></Input
        ></Field>
        <Field id="server-port" class="w-33 flex-none max-compact:w-28" :label="t('serverPort')"
          ><Input v-model="serverPort" inputmode="numeric" type="text" maxlength="5" :placeholder="t('serverPortPlaceholder')"
            ><template #leading><Icon name="hash" /></template></Input
        ></Field>
      </div>
      <div
        v-if="accelerationAvailable"
        class="mt-2 mb-0.5 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-0 px-2.75 py-2.5 text-accent"
      >
        <div class="min-w-0">
          <strong class="block text-caption font-extrabold">{{ t("relayAcceleration") }}</strong
          ><small class="mt-0.75 block text-2xs leading-normal text-fg-muted">{{ t("relayAccelerationHint") }}</small>
        </div>
        <Select v-model="accelerationRelayId" class="max-w-1/2 min-w-37.5" :aria-label="t('relayAcceleration')"
          ><option value="">{{ t("directConnection") }}</option>
          <option v-for="relay in accelerationRelays" :key="relay.id" :value="relay.id">{{ relay.name }}</option></Select
        >
      </div>
      <div v-if="accessMode === 'open' && (favoriteServers.length || recentServers.length)" class="mt-px mb-1.25 grid gap-2">
        <div v-if="favoriteServers.length" class="flex flex-wrap items-center gap-1.25">
          <span class="w-full text-2xs font-bold text-fg-muted">{{ t("favoriteServers") }}</span
          ><Button
            v-for="favorite in favoriteServers"
            :key="favorite.id"
            variant="tinted"
            size="sm"
            @click="$emit('select-local-server', favorite.address, favorite.nickname)"
            >{{ favorite.label }}</Button
          >
        </div>
        <div v-if="recentServers.length" class="flex flex-wrap items-center gap-1.25">
          <span class="w-full text-2xs font-bold text-fg-muted">{{ t("recentServers") }}</span
          ><Button
            v-for="recent in recentServers"
            :key="recent.id"
            variant="tinted"
            size="sm"
            @click="$emit('select-local-server', recent.address, recent.nickname)"
            >{{ recent.address }}</Button
          >
        </div>
      </div>
      <Button
        v-if="accessMode === 'open' && serverHost.trim()"
        variant="tinted"
        size="sm"
        class="justify-self-start"
        @click="$emit('toggle-favorite')"
        >{{ isFavorite ? t("removeFavorite") : t("saveFavorite") }}</Button
      >

      <Field v-if="accessMode === 'open'" id="server-password" class="mt-1.5">
        <template #label
          >{{ t("serverPassword") }} <span class="font-normal text-fg-muted">{{ t("optional") }}</span></template
        >
        <Input v-model="serverPassword" type="password" autocomplete="off" :placeholder="t('optionalPassword')"
          ><template #leading><Icon name="lock" /></template
        ></Input>
      </Field>

      <Field id="nickname" :label="t('nickname')" class="mt-1.5">
        <Input v-model="nickname" autocomplete="nickname" maxlength="30" :placeholder="t('nicknamePlaceholder')" autofocus
          ><template #leading><Icon name="users" /></template
        ></Input>
      </Field>

      <Field id="channel" class="mt-1.5">
        <template #label
          >{{ t("targetChannel") }} <span class="font-normal text-fg-muted">{{ t("optional") }}</span></template
        >
        <Input v-model="channel" :placeholder="t('emptyDefault')" @keyup.enter="$emit('connect')"
          ><template #leading><Icon name="hash" /></template
        ></Input>
      </Field>

      <details class="group mt-2 text-caption text-fg-muted">
        <summary
          class="w-fit cursor-pointer text-accent group-open:mb-2.5 max-compact:-my-3.75 max-compact:py-3.75 group-open:max-compact:mb-2.5"
        >
          {{ t("identityOptions") }}
        </summary>
        <Checkbox v-model="rememberIdentity" class="mt-2 flex"
          ><strong class="block text-caption font-bold">{{ t("rememberIdentity") }}</strong
          ><small class="mt-0.75 block text-2xs leading-snug text-fg-muted">{{ t("rememberIdentityHint") }}</small></Checkbox
        >
      </details>
      <p v-if="rememberIdentity" class="mt-2 mb-0 text-2xs leading-normal text-warning">{{ t("rememberIdentityConcurrentWarning") }}</p>

      <Button
        type="submit"
        size="lg"
        class="mt-2.5 w-full"
        :loading="connecting"
        :disabled="!canJoin || serverConfigLoading || !identityReady || connecting"
      >
        <span>{{ connecting ? t("connecting") : t("enterVoice") }}</span>
        <Icon v-if="!connecting" name="chevron-right" />
      </Button>
      <Button v-if="connecting" variant="soft" size="sm" class="justify-self-center" @click="$emit('disconnect')">{{ t("cancel") }}</Button>
    </form>
    <div class="mt-3 flex items-center justify-center gap-1.75 text-caption text-fg-muted">
      <Icon name="lock" :size="14" /> {{ t("connectionAuthorized") }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field } from "@/shared/ui/field";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { visibleErrorCode } from "@/features/session";
import { resolveText, type MaybeLocalizedText } from "@/shared/i18n/localizedText.js";
import { isLocalPersistenceAvailable } from "@/shared/services/localPersistence.js";
import type { FavoriteServer, RecentServer } from "@/shared/services/localPersistence.js";

defineProps<{
  accessMode: "fixed" | "open";
  favoriteServers: FavoriteServer[];
  recentServers: RecentServer[];
  isFavorite: boolean;
  accelerationAvailable: boolean;
  accelerationRelays: Array<{ id: string; name: string }>;
  initialized: boolean;
  serverConfigLoading: boolean;
  browserError: MaybeLocalizedText;
  error: MaybeLocalizedText;
  errorCode: string;
  identityReady: boolean;
  canJoin: boolean;
  connecting: boolean;
}>();

defineEmits<{
  (e: "select-local-server", address: string, nickname?: string): void;
  (e: "toggle-favorite"): void;
  (e: "connect"): void;
  (e: "disconnect"): void;
}>();

const serverHost = defineModel<string>("serverHost", { default: "" });
const serverPort = defineModel<string>("serverPort", { default: "" });
const serverPassword = defineModel<string>("serverPassword", { default: "" });
const accelerationRelayId = defineModel<string>("accelerationRelayId", { default: "" });
const nickname = defineModel<string>("nickname", { default: "" });
const channel = defineModel<string>("channel", { default: "" });
const rememberIdentity = defineModel<boolean>("rememberIdentity", { default: false });

const { t } = useI18n();

const localPersistenceAvailable = isLocalPersistenceAvailable();
</script>
