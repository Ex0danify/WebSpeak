<template>
  <form class="mt-3 overflow-hidden rounded-lg border border-line-strong bg-surface-2 max-compact:mb-1" @submit.prevent="submit">
    <div v-if="showToolbar" class="border-b border-line px-1.5 py-1.5">
      <Toolbar id="chat-format-toolbar" :label="t('formatToolbar')">
        <ToolbarButton :label="t('formatBold')" shortcut="Ctrl+B" :disabled="disabled" @click="wrap('**')"
          ><Icon name="bold" :size="16"
        /></ToolbarButton>
        <ToolbarButton :label="t('formatItalic')" shortcut="Ctrl+I" :disabled="disabled" @click="wrap('*')"
          ><Icon name="italic" :size="16"
        /></ToolbarButton>
        <ToolbarButton :label="t('formatStrike')" :disabled="disabled" @click="wrap('~~')"
          ><Icon name="strikethrough" :size="16"
        /></ToolbarButton>
        <ToolbarButton :label="t('formatUnderline')" :disabled="disabled" @click="wrap('++')"
          ><Icon name="underline" :size="16"
        /></ToolbarButton>
        <ToolbarButton :label="t('formatLink')" shortcut="Ctrl+K" :disabled="disabled" @click="link"
          ><Icon name="link" :size="16"
        /></ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton :label="t('formatQuote')" :disabled="disabled" @click="linePrefix(() => '> ', QUOTE)"
          ><Icon name="quote" :size="16"
        /></ToolbarButton>
        <ToolbarButton :label="t('formatCode')" :disabled="disabled" @click="wrap('`')"><Icon name="code" :size="16" /></ToolbarButton>
        <ToolbarButton :label="t('formatList')" :disabled="disabled" @click="linePrefix(() => '- ', LIST_PREFIX, isBullet)"
          ><Icon name="list" :size="16"
        /></ToolbarButton>
        <ToolbarSeparator />
        <Menu :label="t('formatMore')" :close-label="t('close')" align="end" @close-auto-focus="giveFocusBack">
          <template #trigger>
            <ToolbarItem>
              <Button variant="soft" size="sm" :disabled="disabled">{{ t("formatMore") }}<Icon name="chevron-down" :size="14" /></Button>
            </ToolbarItem>
          </template>
          <MenuSub>
            <template #label>{{ t("formatHeading") }}</template>
            <MenuItem v-for="level in 6" :key="level" @select="linePrefix(headingMarker(level), HEADING_PREFIX)">{{
              t("formatHeadingLevel", { level })
            }}</MenuItem>
          </MenuSub>
          <MenuItem @select="wrap('||')">{{ t("formatSpoiler") }}</MenuItem>
          <MenuItem @select="block(':::details', ':::')">{{ t("formatDetails") }}</MenuItem>
          <MenuSub>
            <template #label>{{ t("formatAlign") }}</template>
            <MenuItem v-for="align in aligns" :key="align" @select="block(`:::${align}`, ':::')">{{ alignLabels[align]() }}</MenuItem>
          </MenuSub>
          <MenuSeparator />
          <MenuItem @select="wrap('==')">{{ t("formatHighlight") }}</MenuItem>
          <MenuItem @select="wrap('^')">{{ t("formatSuperscript") }}</MenuItem>
          <MenuItem @select="wrap('~')">{{ t("formatSubscript") }}</MenuItem>
          <MenuSeparator />
          <MenuItem @select="linePrefix((index) => `${index + 1}. `, LIST_PREFIX)">{{ t("formatNumberedList") }}</MenuItem>
          <MenuItem @select="linePrefix(() => '- [ ] ', LIST_PREFIX)">{{ t("formatTaskList") }}</MenuItem>
          <MenuItem @select="block('```', '```')">{{ t("formatCodeBlock") }}</MenuItem>
          <MenuItem @select="standalone(TABLE_TEMPLATE, 2)">{{ t("formatTable") }}</MenuItem>
          <MenuItem @select="standalone('---')">{{ t("formatRule") }}</MenuItem>
        </Menu>
      </Toolbar>
    </div>
    <!-- The ring is on the row, around the box and Send, and only while the box itself has the focus. -->
    <div
      data-focus-ring
      :class="[
        'flex items-stretch gap-1.5 rounded-b-lg bg-surface-1 pr-1.5',
        !showToolbar && 'rounded-t-lg',
        boxFocused && 'outline-2 -outline-offset-2 outline-accent/55',
      ]"
      @focusin="boxFocused = isBox($event.target)"
      @focusout="boxFocused = false"
    >
      <AsyncChatEditor
        ref="editor"
        v-model="draft"
        :label="label"
        :placeholder="placeholder"
        :disabled="disabled"
        :max-length="MAX_CHAT_SEND_LENGTH"
        class="flex-1 text-md max-compact:text-sm"
        @submit="submit"
        @shortcut="onShortcut"
      />
      <Tooltip v-if="phone" :text="toolbarOpen ? t('formatHide') : t('formatShow')"
        ><Button
          variant="soft"
          icon-only
          class="my-1.5 size-8.5 shrink-0 self-center"
          :aria-label="toolbarOpen ? t('formatHide') : t('formatShow')"
          :aria-expanded="toolbarOpen"
          aria-controls="chat-format-toolbar"
          :disabled="disabled"
          @click="toolbarOpen = !toolbarOpen"
          ><Icon name="text-format" :size="18" /></Button
      ></Tooltip>
      <Tooltip :text="t('send')"
        ><Button type="submit" icon-only class="my-1.5 size-8.5 shrink-0 self-center" :disabled="!canSend" :aria-label="t('send')"
          ><Icon name="send" :size="18" /></Button
      ></Tooltip>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type ChatEditor from "@/features/room/chat/editor/ChatEditor.vue";
import { AsyncChatEditor } from "@/features/room/chat/editor/asyncChatEditor";
import {
  HEADING_PREFIX,
  LIST_PREFIX,
  QUOTE_PREFIX as QUOTE,
  TABLE_TEMPLATE,
  headingMarker,
  insertStandalone,
  isBullet,
  makeLink,
  toggleLinePrefix,
  toggleWrap,
  wrapBlock,
  type Selection,
} from "@/features/room/chat/composerFormat";
import { MAX_CHAT_SEND_LENGTH } from "@/features/session";
import { useMediaQuery } from "@/shared/composables/useMediaQuery";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu, MenuItem, MenuSeparator, MenuSub } from "@/shared/ui/menu";
import { Toolbar, ToolbarButton, ToolbarItem, ToolbarSeparator } from "@/shared/ui/toolbar";
import { Tooltip } from "@/shared/ui/tooltip";

// The message box with its formatting toolbar. The editor shows the formatting as it is typed, grows with the text up to a
// height of its own and scrolls beyond that, so a long message never pushes the chat list off the screen.
const props = defineProps<{
  /** The placeholder, or the reason writing is blocked. */
  placeholder: string;
  /** Accessible name of the box. */
  label: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ (e: "submit"): void }>();

const draft = defineModel<string>({ default: "" });
const { t } = useI18n();

// Empty until the editor has loaded, so what reaches for it checks first.
const editor = ref<InstanceType<typeof ChatEditor> | null>(null);
const canSend = computed(() => !props.disabled && draft.value.trim() !== "");

// On a phone the toolbar would take the room of the chat, so it opens on request.
const phone = useMediaQuery("(max-width: 740px)");
const toolbarOpen = ref(false);

// Whether the focus is in the text box, not on Send beside it.
const boxFocused = ref(false);
const isBox = (target: EventTarget | null) => target instanceof Element && target.closest("[contenteditable]") !== null;
const showToolbar = computed(() => !phone.value || toolbarOpen.value);

const aligns = ["left", "center", "right", "justify"] as const;
const alignLabels = {
  left: () => t("formatAlignLeft"),
  center: () => t("formatAlignCenter"),
  right: () => t("formatAlignRight"),
  justify: () => t("formatAlignJustify"),
};

function submit() {
  if (canSend.value) emit("submit");
}

function onShortcut(name: "bold" | "italic" | "link") {
  if (name === "bold") wrap("**");
  else if (name === "italic") wrap("*");
  else link();
}

// The editor keeps its selection while a toolbar button or menu has the focus, so the edit reads it from there.
function edit(change: (selection: Selection) => Selection) {
  if (!editor.value || props.disabled) return;
  const next = change(editor.value.getSelection());
  if (next.text.length > MAX_CHAT_SEND_LENGTH) return;
  editor.value.apply(next);
  // The phone's menu is a sheet that gives the focus back to its trigger in a timer once it has closed.
  if (phone.value) setTimeout(() => editor.value?.focus(), 0);
}

const wrap = (marker: string) => edit((selection) => toggleWrap(selection, marker));
const link = () => edit(makeLink);
const block = (head: string, tail: string) => edit((selection) => wrapBlock(selection, head, tail));
const standalone = (snippet: string, caret?: number) => edit((selection) => insertStandalone(selection, snippet, caret));
const linePrefix = (marker: (index: number) => string, strip: RegExp, has?: (line: string, marker: string) => boolean) =>
  edit((selection) => toggleLinePrefix(selection, marker, strip, has));

// A closing menu hands the focus to its trigger, an edit has already put it back in the box.
function giveFocusBack(event: Event) {
  event.preventDefault();
  editor.value?.focus();
}

defineExpose({ focus: () => editor.value?.focus() });
</script>
