<template>
  <form class="mt-3 rounded-lg bg-surface-2 max-compact:mb-1 max-compact:border max-compact:border-line" @submit.prevent="submit">
    <div v-if="showToolbar" class="px-1.5 pt-1.5">
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
    <div class="flex items-end gap-1.75 py-1.5 pr-2 pl-3 max-compact:py-1.75 max-compact:pl-3.25">
      <Textarea
        ref="area"
        v-model="draft"
        rows="1"
        :maxlength="MAX_CHAT_SEND_LENGTH"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-label="label"
        class="flex-1"
        textarea-class="max-h-40 min-h-9 resize-none overflow-y-auto border-0 bg-transparent px-0 py-2 text-md max-compact:min-h-11 max-compact:text-sm"
        @keydown="onKeydown"
      />
      <Tooltip v-if="phone" :text="toolbarOpen ? t('formatHide') : t('formatShow')"
        ><Button
          variant="soft"
          icon-only
          class="size-8.5 shrink-0"
          :aria-label="toolbarOpen ? t('formatHide') : t('formatShow')"
          :aria-expanded="toolbarOpen"
          aria-controls="chat-format-toolbar"
          :disabled="disabled"
          @click="toolbarOpen = !toolbarOpen"
          ><Icon name="text-format" :size="18" /></Button
      ></Tooltip>
      <Tooltip :text="t('send')"
        ><Button type="submit" icon-only class="size-8.5 shrink-0" :disabled="!canSend" :aria-label="t('send')"
          ><Icon name="send" :size="18" /></Button
      ></Tooltip>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
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
import { Textarea } from "@/shared/ui/textarea";
import { Toolbar, ToolbarButton, ToolbarItem, ToolbarSeparator } from "@/shared/ui/toolbar";
import { Tooltip } from "@/shared/ui/tooltip";

// The message box with its formatting toolbar. The box grows with the text up to a height of its own and scrolls beyond
// that, so a long message never pushes the chat list off the screen. Enter sends, Shift+Enter starts a new line.
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

const area = ref<{ el: HTMLTextAreaElement | null; focus: () => void } | null>(null);
const canSend = computed(() => !props.disabled && draft.value.trim() !== "");

// On a phone the toolbar would take the room of the chat, so it opens on request.
const phone = useMediaQuery("(max-width: 740px)");
const toolbarOpen = ref(false);
const showToolbar = computed(() => !phone.value || toolbarOpen.value);

const aligns = ["left", "center", "right", "justify"] as const;
const alignLabels = {
  left: () => t("formatAlignLeft"),
  center: () => t("formatAlignCenter"),
  right: () => t("formatAlignRight"),
  justify: () => t("formatAlignJustify"),
};

function grow() {
  const el = area.value?.el;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
watch(draft, () => nextTick(grow));
onMounted(grow);

function submit() {
  if (canSend.value) emit("submit");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key === "b") wrap("**");
  else if (key === "i") wrap("*");
  else if (key === "k") link();
  else return;
  event.preventDefault();
}

// The textarea keeps its selection while a toolbar button or menu has the focus, so the edit reads it from there.
async function edit(change: (selection: Selection) => Selection) {
  const el = area.value?.el;
  if (!el || props.disabled) return;
  const next = change({ text: draft.value, start: el.selectionStart, end: el.selectionEnd });
  if (next.text.length > MAX_CHAT_SEND_LENGTH) return;
  draft.value = next.text;
  await nextTick();
  const restore = () => {
    el.focus();
    el.setSelectionRange(next.start, next.end);
  };
  restore();
  grow();
  // The phone's menu is a sheet that gives the focus back to its trigger in a timer once it has closed.
  if (phone.value) setTimeout(restore, 0);
}

const wrap = (marker: string): void => void edit((selection) => toggleWrap(selection, marker));
const link = (): void => void edit(makeLink);
const block = (head: string, tail: string): void => void edit((selection) => wrapBlock(selection, head, tail));
const standalone = (snippet: string, caret?: number): void => void edit((selection) => insertStandalone(selection, snippet, caret));
const linePrefix = (marker: (index: number) => string, strip: RegExp, has?: (line: string, marker: string) => boolean): void =>
  void edit((selection) => toggleLinePrefix(selection, marker, strip, has));

// A closing menu hands the focus to its trigger, an edit has already put it back in the box.
function giveFocusBack(event: Event) {
  event.preventDefault();
  area.value?.focus();
}

defineExpose({ focus: () => area.value?.focus() });
</script>
