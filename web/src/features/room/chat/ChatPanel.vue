<template>
  <section :class="[panel, mobileSection === 'chat' ? panelMobile : 'max-compact:hidden']">
    <h2 class="sr-only">{{ chatTitle }}</h2>
    <Tabs v-model="activeTab" variant="pills" class="contents">
      <div :class="[columnClass, 'flex min-h-12 flex-none items-start gap-2 pt-2.5 max-compact:pt-0']">
        <TabList :aria-label="t('chatTabs')" class="min-w-0 flex-1 max-compact:flex-1">
          <Tab value="channel"
            ><Icon name="hash" :size="15" /><span class="truncate">{{ currentChannelName }}</span
            ><UnreadMark :unread="unreadTabs.has('channel')"
          /></Tab>
          <Tab value="server"
            ><Icon name="server" :size="15" /><span class="truncate">{{ t("serverChat") }}</span
            ><UnreadMark :unread="unreadTabs.has('server')"
          /></Tab>
          <Tab
            v-for="conversation in privateConversations"
            :key="conversation.id"
            :value="`private-${conversation.id}`"
            @keydown.delete.prevent="$emit('close-private-chat', conversation.id)"
            ><Icon name="message" :size="15" /><span class="truncate">{{ conversation.name }}</span
            ><UnreadMark :unread="unreadTabs.has(`private-${conversation.id}`)"
          /></Tab>
        </TabList>
        <Tooltip :text="t('muteChat')"
          ><Button
            variant="soft"
            size="sm"
            icon-only
            class="flex-none"
            :aria-label="t('muteChat')"
            :aria-pressed="muted"
            @click="$emit('toggle-mute')"
            ><Icon :name="muted ? 'bell-off' : 'bell'" :size="16" /></Button
        ></Tooltip>
        <Tooltip v-if="chatTab === 'private'" :text="t('closePrivateChat')"
          ><Button
            variant="soft"
            size="sm"
            icon-only
            class="flex-none"
            :aria-label="t('closePrivateChat')"
            @click="$emit('close-private-chat', privateConversationId)"
            ><Icon name="close" :size="16" /></Button
        ></Tooltip>
        <slot name="bar-end" />
      </div>
      <TabPanel :ref="bindListElement" :value="activeTab" class="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 max-compact:pt-2.5">
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          :aria-label="chatTitle"
          :class="[columnClass, 'flex min-h-full flex-col gap-3.5 pb-3']"
        >
          <div v-if="!timeline.length" :class="emptyState">
            <div :class="emptyIcon"><Icon name="message" :size="24" /></div>
            <strong class="text-md text-fg-muted">{{ chatTab === "private" ? t("privateChatStart") : t("chatStart") }}</strong
            ><span class="mt-1.25 text-ui">{{ chatTab === "private" ? t("privateChatStartLead") : t("chatStartLead") }}</span>
          </div>
          <template v-for="item in timeline" :key="item.kind === 'group' ? item.group.id : item.notice.id">
            <p
              v-if="item.kind === 'notice'"
              class="-mx-2 flex items-baseline gap-3 rounded-md bg-surface-2/60 px-2.5 py-1 text-xs leading-snug text-fg-muted"
            >
              <span class="min-w-0 flex-1"
                >{{ noticeParts(item.notice)[0] }}<strong class="font-semibold text-fg">{{ noticeParts(item.notice)[1] }}</strong
                >{{ noticeParts(item.notice)[2] }}</span
              ><time class="flex-none text-2xs">{{ formatTime(item.notice.timestamp) }}</time>
            </p>
            <article
              v-else
              :class="[
                'flex max-w-39/50 items-start gap-2.75 max-compact:max-w-15/16 max-compact:gap-2.25',
                item.group.isSelf && 'flex-row-reverse self-end',
              ]"
            >
              <Avatar
                :name="item.group.invokerName"
                :src="messageAvatar(item.group.messages[0]!, members) || undefined"
                size="message"
                tint
                :self="item.group.isSelf"
                surface="surface-1"
              />
              <div :class="['flex min-w-0 flex-col gap-1', item.group.isSelf && 'items-end']">
                <div class="mt-px mb-0.5 flex items-baseline gap-2">
                  <strong class="text-sm text-fg max-compact:text-xs">{{ item.group.isSelf ? t("you") : item.group.invokerName }}</strong
                  ><time class="text-caption text-fg-muted">{{ formatTime(item.group.messages[0]!.timestamp) }}</time>
                </div>
                <template v-for="(message, index) in item.group.messages" :key="message.id">
                  <div
                    :class="[
                      'px-3.25 py-2.5 text-md leading-normal max-compact:px-3 max-compact:text-sm',
                      item.group.isSelf ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg',
                      index === 0 ? (item.group.isSelf ? 'rounded-lg rounded-tr-sm' : 'rounded-lg rounded-tl-sm') : 'rounded-lg',
                    ]"
                  >
                    <time v-if="index > 0" class="sr-only">{{ formatTime(message.timestamp) }}</time>
                    <span>{{ message.message }}</span>
                  </div>
                  <div
                    v-if="message.status"
                    :class="['text-caption', message.status === 'failed' ? 'text-danger' : 'text-fg-muted']"
                    :role="message.status === 'failed' ? 'alert' : undefined"
                  >
                    {{ message.status === "failed" ? t("messageNotDelivered") : t("messageSending") }}
                  </div>
                </template>
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
import UnreadMark from "@/features/room/chat/UnreadMark.vue";
import { buildTimeline, splitAroundName, type Notice } from "@/features/room/chat/groupMessages";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { messageAvatar } from "@/features/session";
import type { ChatTab } from "@/features/room/roomTypes";
import type { ChannelMember, ChatMessage } from "@/features/session";

const props = defineProps<{
  mobileSection: "channels" | "chat" | "voice" | "more";
  currentChannelName: string;
  privateConversations: Array<{ id: string; name: string; lastMessage: number }>;
  privateConversationId: string;
  chatTitle: string;
  chatPlaceholder: string;
  /** The name of the person the open private chat is with while they are away, "" otherwise. */
  privatePeerName: string;
  visibleChatMessages: ChatMessage[];
  /** Who came and went in the open channel, shown between its messages. */
  notices: Notice[];
  members: ChannelMember[];
  formatTime: (timestamp: number) => string;
  setListElement: (element: unknown) => void;
  /** Keys of the tabs with messages the reader has not seen. */
  unreadTabs: Set<string>;
  /** The open chat does not raise toasts for new messages. */
  muted: boolean;
  /** The list shows its newest message. */
  atBottom: boolean;
}>();

const emit = defineEmits<{
  (e: "open-private-chat", target: number | string): void;
  (e: "submit"): void;
  (e: "jump-to-latest"): void;
  (e: "close-private-chat", id: string): void;
  (e: "toggle-mute"): void;
}>();

const chatTab = defineModel<ChatTab>("chatTab", { default: "channel" });
const messageDraft = defineModel<string>("messageDraft", { default: "" });

const { t } = useI18n();

const timeline = computed(() => buildTimeline(props.visibleChatMessages, props.notices));
const noticeParts = (notice: Notice) => splitAroundName(notice.text, notice.name);

// One tab key per tab: the three fixed ones and `private-<id>` per conversation.
const activeTab = computed({
  get: () => (chatTab.value === "private" ? `private-${props.privateConversationId}` : chatTab.value),
  set: (key: string) => {
    if (key.startsWith("private-")) emit("open-private-chat", key.slice("private-".length));
    else chatTab.value = key as "channel" | "server";
  },
});

// The scroll container is the panel component's root element.
const bindListElement = (instance: Element | ComponentPublicInstance | null) =>
  props.setListElement(instance && "$el" in instance ? instance.$el : instance);

// The panel fills the height left by the voice section. Messages and composer share one centered column.
const panel = "flex min-h-0 flex-1 flex-col border-t border-line px-8 pb-4 max-wide:px-5.5 max-compact:px-3.5";
const panelMobile = "max-compact:mt-0 max-compact:border-t-0 max-compact:pb-0";
const columnClass = "mx-auto w-full max-w-190";
const emptyState = "my-auto flex min-h-36.25 flex-col items-center justify-center text-center text-fg-muted";
const emptyIcon = "mb-2.75 grid size-12 place-items-center rounded-lg bg-accent-soft text-accent";
</script>
