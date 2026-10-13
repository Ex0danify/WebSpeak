<template>
  <div
    class="min-h-dvh bg-surface-0 bg-[radial-gradient(circle_at_72%_12%,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_26rem)] px-7 pb-9.5 leading-[normal] text-fg max-demo:px-3.5 max-demo:pb-6"
  >
    <DemoHeader />

    <Banner v-if="reconnecting" variant="warning" icon="refresh" class="mx-auto mb-3.5 w-full max-w-345">
      {{ t("reconnecting") }}
      <template #actions
        ><Button size="sm" variant="outline" @click="reconnecting = false">{{ t("restore") }}</Button></template
      >
    </Banner>
    <main
      class="mx-auto grid min-h-180 w-full max-w-345 grid-cols-[240px_minmax(0,1fr)_235px] gap-4.5 max-demo-wide:grid-cols-[210px_minmax(0,1fr)] max-demo:block max-demo:min-h-0"
    >
      <DemoChannelPanel
        class="max-demo:mb-3"
        :channels="channels"
        :selected-channel-id="selectedChannelId"
        :selected-channel-name="selectedChannel.name"
        :speaking-id="speakingId"
        @select="selectChannel"
      />

      <section :class="[demoPanel, 'px-8 py-6.75 max-demo:px-3.5 max-demo:py-4.25']">
        <DemoVoiceSection v-model:speaking-id="speakingId" :channel="selectedChannel" />
        <DemoChatPanel
          v-model:active-tab="activeTab"
          v-model:draft="draft"
          :channel-name="selectedChannel.name"
          :tabs="tabs"
          :visible-messages="visibleMessages"
          @send="sendMessage"
          @toggle-mine="toggleMine"
        />
      </section>

      <DemoActionsPanel :speaking-id="speakingId" @toggle-speaking="toggleSpeaking" @poke="poke = !poke" @reconnect="reconnecting = true" />
    </main>
    <Banner
      v-if="poke"
      variant="warning"
      icon="bell"
      :title="`msicbot ${t('pokedYou')}`"
      dismissible
      :dismiss-label="t('close')"
      floating
      class="fixed top-20.5 right-6.25 z-10 w-[min(380px,calc(100%-32px))] desktop:top-[calc(82px/var(--ui-scale))] desktop:right-[calc(25px/var(--ui-scale))]"
      @dismiss="poke = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import {
  DemoActionsPanel,
  DemoChannelPanel,
  DemoChatPanel,
  DemoHeader,
  DemoVoiceSection,
  demoPanel,
  type DemoChannel,
  type DemoMessage,
  type DemoTab,
} from "@/features/demo";
import { useI18n } from "@/shared/i18n/useI18n";

const { t } = useI18n();
const selectedChannelId = ref("quiet");
const activeTab = ref<DemoTab>("channel");
const speakingId = ref("illusia");
const reconnecting = ref(false);
const poke = ref(false);
const draft = ref("");
const channels: DemoChannel[] = [
  { id: "spacer-voice", name: "[cspacer]Voice", members: [] },
  {
    id: "quiet",
    name: "Quiet Zone",
    members: [
      { id: "illusia", name: "illusia" },
      { id: "msicbot", name: "msicbot" },
    ],
  },
  { id: "lounge", name: "Lounge", members: [{ id: "alice", name: "Alice" }] },
  { id: "spacer-rule", name: "[*spacer]-", members: [] },
  { id: "music", name: "Music room", members: [] },
];
const messages = ref<DemoMessage[]>([
  {
    id: 1,
    author: "illusia",
    time: "10:24",
    text: "",
    enText: "Hello everyone, welcome to WebSpeak.",
    deText: "Hallo zusammen, willkommen bei WebSpeak.",
    mine: true,
  },
  {
    id: 2,
    author: "msicbot",
    time: "10:25",
    text: "",
    enText: "Voice and text channels are in sync.",
    deText: "Sprach- und Textkanäle sind synchron.",
    mine: false,
  },
]);
const tabs = computed(() => [
  { id: "channel" as const, label: t("channel") },
  { id: "server" as const, label: t("server") },
]);
const selectedChannel = computed(() => channels.find((channel) => channel.id === selectedChannelId.value) ?? channels[0]);
const visibleMessages = computed(() => (activeTab.value === "channel" ? messages.value : []));

function selectChannel(id: string) {
  selectedChannelId.value = id;
  activeTab.value = "channel";
}
function toggleSpeaking() {
  speakingId.value = speakingId.value ? "" : (selectedChannel.value.members[0]?.id ?? "");
}
function toggleMine(id: number) {
  const message = messages.value.find((m) => m.id === id);
  if (message) message.mine = !message.mine;
}
function sendMessage() {
  const text = draft.value.trim();
  if (!text) return;
  messages.value.push({ id: Date.now(), author: "illusia", time: "now", text, mine: true });
  draft.value = "";
}
</script>
