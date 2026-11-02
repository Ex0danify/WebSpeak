<template>
  <section :class="[panel, mobileSection === 'chat' ? panelMobile : 'max-compact:hidden']">
    <Tabs v-model="activeTab" variant="pills" class="contents">
      <TabList :aria-label="t('chatTabs')" class="mt-4 max-compact:mt-0">
        <Tab value="channel"><Icon name="hash" :size="15" /> {{ currentChannelName }}</Tab>
        <Tab value="server"><Icon name="server" :size="15" /> {{ t("serverChat") }}</Tab>
        <Tab v-for="conversation in privateConversations" :key="conversation.id" :value="`private-${conversation.id}`"
          ><Icon name="message" :size="15" /> {{ conversation.name }}</Tab
        >
        <Tab value="events"><Icon name="bell" :size="15" /> {{ t("eventLog") }}</Tab>
      </TabList>
      <div
        class="flex items-end justify-between gap-5 pt-4 max-compact:flex-none max-compact:gap-2.5 max-compact:pt-3.25 max-compact:pb-2.25"
      >
        <div>
          <span class="text-ui font-bold tracking-kicker text-fg-muted">{{ chatTabLabel }}</span>
          <h2 class="mt-1.5 flex items-center gap-1.75 text-2xl font-bold tracking-brand text-fg max-compact:text-xl">
            <Icon
              :name="chatTab === 'server' ? 'server' : chatTab === 'events' ? 'bell' : chatTab === 'private' ? 'message' : 'hash'"
              :size="20"
              class="text-accent"
            />
            {{ chatTitle }}
          </h2>
        </div>
        <span class="text-ui text-fg-muted max-phone-lg:hidden">{{
          chatTab === "events" ? t("eventCount", { count: serverEvents.length }) : t("messageCount", { count: visibleChatMessages.length })
        }}</span>
      </div>
      <TabPanel :ref="bindListElement" :value="activeTab" class="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 max-compact:pt-2.5">
        <div :class="[columnClass, 'flex min-h-full flex-col gap-4.5 pb-3']">
          <div v-if="chatTab === 'events'">
            <article
              v-for="event in serverEvents"
              :key="event.id"
              class="flex items-baseline gap-3 border-b border-line px-2.5 py-2.25 text-xs leading-snug text-fg-muted"
            >
              <time class="flex-none text-2xs">{{ formatTime(event.timestamp) }}</time
              ><span>{{ eventText(event) }}</span>
            </article>
            <div v-if="!serverEvents.length" :class="emptyState">
              <div :class="emptyIcon"><Icon name="bell" :size="24" /></div>
              <strong class="text-md text-fg-muted">{{ t("noEvents") }}</strong
              ><span class="mt-1.25 text-ui">{{ t("noEventsLead") }}</span>
            </div>
          </div>
          <div v-else-if="!visibleChatMessages.length" :class="emptyState">
            <div :class="emptyIcon"><Icon name="message" :size="24" /></div>
            <strong class="text-md text-fg-muted">{{ chatTab === "private" ? t("privateChatStart") : t("chatStart") }}</strong
            ><span class="mt-1.25 text-ui">{{ chatTab === "private" ? t("privateChatStartLead") : t("chatStartLead") }}</span>
          </div>
          <template v-for="message in visibleChatMessages" :key="message.id">
            <article
              v-if="chatTab !== 'events'"
              :class="[
                'flex max-w-39/50 items-start gap-2.75 max-compact:max-w-15/16 max-compact:gap-2.25',
                message.isSelf && 'flex-row-reverse self-end',
              ]"
            >
              <Avatar
                :name="message.invokerName"
                :src="messageAvatar(message, members) || undefined"
                size="message"
                tint
                :self="message.isSelf"
                surface="surface-1"
              />
              <div class="min-w-0">
                <div :class="['mt-px mb-1.5 flex items-baseline gap-2', message.isSelf && 'justify-end']">
                  <strong class="text-sm text-fg max-compact:text-xs">{{ message.isSelf ? t("you") : message.invokerName }}</strong
                  ><time class="text-caption text-fg-muted">{{ formatTime(message.timestamp) }}</time>
                </div>
                <div
                  :class="[
                    'px-3.25 py-2.5 text-md leading-normal max-compact:px-3 max-compact:text-sm',
                    message.isSelf ? 'rounded-lg rounded-tr-sm bg-accent text-accent-fg' : 'rounded-lg rounded-tl-sm bg-surface-2 text-fg',
                  ]"
                >
                  {{ message.message }}
                </div>
                <div
                  v-if="message.status"
                  :class="[
                    'mt-1 text-caption',
                    message.status === 'failed' ? 'text-danger' : 'text-fg-muted',
                    message.isSelf && 'text-right',
                  ]"
                  :role="message.status === 'failed' ? 'alert' : undefined"
                >
                  {{ message.status === "failed" ? t("messageNotDelivered") : t("messageSending") }}
                </div>
              </div>
            </article>
          </template>
        </div>
        <Button v-if="!atBottom" variant="tinted" size="sm" class="sticky bottom-2 mx-auto mt-2 -mb-1 flex" @click="$emit('jump-to-latest')"
          ><Icon name="chevron-down" :size="15" /> {{ t("jumpToLatest") }}</Button
        >
      </TabPanel>
    </Tabs>
    <Banner v-if="privatePeerName" variant="warning" :class="`mt-3 ${columnClass}`">
      {{ t("privatePeerAway", { name: privatePeerName }) }}
    </Banner>
    <form
      v-if="chatTab !== 'events'"
      :class="[
        columnClass,
        'mt-3 flex min-h-12 flex-none items-center gap-1.75 rounded-lg bg-surface-2 py-1.5 pr-2 pl-3 max-compact:mb-1 max-compact:min-h-13.5 max-compact:border max-compact:border-line max-compact:py-1.75 max-compact:pl-3.25',
      ]"
      @submit.prevent="$emit('submit')"
    >
      <Input
        v-model="messageDraft"
        maxlength="500"
        :placeholder="chatPlaceholder"
        :disabled="Boolean(privatePeerName)"
        :aria-label="t('send')"
        class="flex-1"
        input-class="h-9 border-0 bg-transparent px-0 text-md max-compact:text-sm"
      />
      <Tooltip :text="t('send')"
        ><Button
          type="submit"
          icon-only
          class="size-8.5 shrink-0"
          :disabled="!messageDraft.trim() || Boolean(privatePeerName)"
          :aria-label="t('send')"
          ><Icon name="send" :size="18" /></Button
      ></Tooltip>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, type ComponentPublicInstance } from "vue";
import { Avatar } from "@/shared/ui/avatar";
import { Banner } from "@/shared/ui/banner";
import { Button } from "@/shared/ui/button";
import { Tooltip } from "@/shared/ui/tooltip";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Tab, TabList, TabPanel, Tabs } from "@/shared/ui/tabs";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { messageAvatar } from "@/features/session";
import type { ChannelMember, ChatMessage, ServerEvent } from "@/features/session";

const props = defineProps<{
  mobileSection: "channels" | "chat" | "voice" | "more";
  currentChannelName: string;
  privateConversations: Array<{ id: string; name: string; lastMessage: number }>;
  privateConversationId: string;
  chatTabLabel: string;
  chatTitle: string;
  chatPlaceholder: string;
  /** The name of the person the open private chat is with while they are away, "" otherwise. */
  privatePeerName: string;
  serverEvents: ServerEvent[];
  visibleChatMessages: ChatMessage[];
  members: ChannelMember[];
  eventText: (event: ServerEvent) => string;
  formatTime: (timestamp: number) => string;
  setListElement: (element: unknown) => void;
  /** The list shows its newest message. */
  atBottom: boolean;
}>();

const emit = defineEmits<{
  (e: "open-private-chat", target: number | string): void;
  (e: "submit"): void;
  (e: "jump-to-latest"): void;
}>();

const chatTab = defineModel<"channel" | "server" | "private" | "events">("chatTab", { default: "channel" });
const messageDraft = defineModel<string>("messageDraft", { default: "" });

const { t } = useI18n();

// One tab key per tab: the three fixed ones and `private-<id>` per conversation.
const activeTab = computed({
  get: () => (chatTab.value === "private" ? `private-${props.privateConversationId}` : chatTab.value),
  set: (key: string) => {
    if (key.startsWith("private-")) emit("open-private-chat", key.slice("private-".length));
    else chatTab.value = key as "channel" | "server" | "events";
  },
});

// The scroll container is the panel component's root element.
const bindListElement = (instance: Element | ComponentPublicInstance | null) =>
  props.setListElement(instance && "$el" in instance ? instance.$el : instance);

// The panel fills the height left by the voice section. Messages and composer share one centered column.
const panel = "flex min-h-0 flex-1 flex-col border-t border-line px-8 pb-4 max-wide:px-5.5 max-compact:px-3.5";
const panelMobile = "max-compact:mt-0 max-compact:border-t-0 max-compact:pb-0";
const columnClass = "mx-auto w-full max-w-190";
const emptyState = "flex min-h-36.25 flex-col items-center justify-center text-center text-fg-muted";
const emptyIcon = "mb-2.75 grid size-12 place-items-center rounded-lg bg-accent-soft text-accent";
</script>
