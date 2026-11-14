<template>
  <template v-for="(node, index) in nodes" :key="index">
    <template v-if="node.kind === 'text'">{{ node.text }}</template>
    <br v-else-if="node.kind === 'break'" />
    <Spoiler v-else-if="node.tag === 'spoiler'" :label="t('spoilerReveal')"><ChatNodes :nodes="node.children" /></Spoiler>
    <Disclosure v-else-if="node.tag === 'details'" :title="node.summary || t('detailsTitle')" class="my-0.5">
      <div class="space-y-1.5"><ChatNodes :nodes="node.children" /></div>
    </Disclosure>
    <Checkbox
      v-else-if="node.tag === 'task'"
      :model-value="node.checked"
      disabled
      :aria-label="node.checked ? t('taskDone') : t('taskOpen')"
      class="mr-1.5 align-middle"
    />
    <sup v-else-if="node.tag === 'footnoteRef'" :aria-label="t('footnoteLabel', { number: node.number ?? 0 })">{{ node.number }}</sup>
    <a
      v-else-if="node.tag === 'a'"
      :href="node.href"
      :title="node.title"
      target="_blank"
      rel="noopener noreferrer"
      class="break-words underline underline-offset-2"
      ><ChatNodes :nodes="node.children"
    /></a>
    <div v-else-if="node.tag === 'table'" class="max-w-full overflow-x-auto">
      <table class="border-collapse text-sm">
        <ChatNodes :nodes="node.children" />
      </table>
    </div>
    <pre
      v-else-if="node.tag === 'pre'"
      class="max-w-full overflow-x-auto rounded-md bg-current/10 p-2 font-mono text-sm"
    ><ChatNodes :nodes="node.children" /></pre>
    <hr v-else-if="node.tag === 'hr'" class="my-1 border-current/30" />
    <ol v-else-if="node.tag === 'ol'" :start="node.start" class="list-decimal space-y-1 pl-5">
      <ChatNodes :nodes="node.children" />
    </ol>
    <div v-else-if="node.tag === 'alert'" :class="alertClass(node.alert)">
      <p class="flex items-center gap-1.5 font-semibold">
        <Icon :name="node.alert === 'warning' || node.alert === 'caution' ? 'alert' : 'info'" :size="14" />{{ alertTitle(node.alert) }}
      </p>
      <ChatNodes :nodes="node.children" />
    </div>
    <div v-else-if="node.tag === 'aligned'" :class="['space-y-1.5', alignClass[node.align ?? 'left']]">
      <ChatNodes :nodes="node.children" />
    </div>
    <div v-else-if="node.tag === 'footnote'" class="flex gap-1.5">
      <span class="shrink-0 font-semibold">{{ node.number }}</span>
      <div class="min-w-0 space-y-1"><ChatNodes :nodes="node.children" /></div>
    </div>
    <component
      :is="node.tag"
      v-else
      :class="[tagClass[node.tag], node.align && alignClass[node.align], node.tag === 'li' && node.checked !== undefined && 'list-none']"
      ><ChatNodes :nodes="node.children"
    /></component>
  </template>
</template>

<script setup lang="ts">
import type { ChatAlertKind, ChatAlign, ChatNode, ChatTag } from "@/features/room/chat/chatMarkdown";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Checkbox } from "@/shared/ui/checkbox";
import { Disclosure } from "@/shared/ui/disclosure";
import { Icon } from "@/shared/ui/icon";
import { Spoiler } from "@/shared/ui/spoiler";

// Draws a parsed message. Everything is an element or a text node built here, so message text never reaches the DOM as HTML.
defineProps<{ nodes: ChatNode[] }>();

const { t } = useI18n();

// Colors come from the bubble (`current`), so the same markup reads on the accent bubble of your own messages and the
// neutral one of others.
const cell = "border border-current/25 px-2 py-1";
const tagClass: Partial<Record<ChatTag, string>> = {
  p: "min-w-0",
  h1: "text-lg font-semibold",
  h2: "text-md font-semibold",
  h3: "text-md font-semibold",
  h4: "font-semibold",
  h5: "font-semibold",
  h6: "font-semibold",
  code: "rounded-xs bg-current/10 px-1 font-mono text-sm",
  u: "underline underline-offset-2",
  mark: "rounded-xs bg-warning-soft px-0.5 text-fg",
  blockquote: "space-y-1.5 border-l-2 border-current/40 pl-2.5",
  ul: "list-disc space-y-1 pl-5",
  li: "space-y-1",
  th: `${cell} text-left font-semibold`,
  td: cell,
  footnotes: "space-y-1 border-t border-current/25 pt-1.5 text-sm",
};
const alignClass: Record<ChatAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

const alertTitles: Record<ChatAlertKind, () => string> = {
  note: () => t("alertNote"),
  tip: () => t("alertTip"),
  important: () => t("alertImportant"),
  warning: () => t("alertWarning"),
  caution: () => t("alertCaution"),
};
const alertTitle = (kind: ChatAlertKind | undefined) => alertTitles[kind ?? "note"]();

const alertTone: Record<ChatAlertKind, string> = {
  note: "border-accent bg-accent-soft",
  tip: "border-success bg-success-soft",
  important: "border-accent bg-accent-soft",
  warning: "border-warning bg-warning-soft",
  caution: "border-danger bg-danger-soft",
};
const alertClass = (kind: ChatAlertKind | undefined) =>
  `space-y-1 rounded-md border-l-4 px-2.5 py-1.5 text-fg ${alertTone[kind ?? "note"]}`;
</script>
