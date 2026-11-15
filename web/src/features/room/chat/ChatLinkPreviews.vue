<template>
  <div v-if="shown.length" class="mt-1.5 space-y-2">
    <template v-for="entry in shown" :key="entry.url">
      <article
        v-if="entry.state.status === 'ready' && entry.state.preview.kind === 'page'"
        :aria-label="entry.state.preview.title"
        class="min-w-0 space-y-1 border-l-2 border-current/40 pl-2.5"
      >
        <p class="text-sm font-semibold break-words opacity-80">{{ entry.state.preview.siteName }}</p>
        <a
          :href="entry.state.preview.url"
          target="_blank"
          rel="noopener noreferrer"
          class="block font-semibold break-words underline-offset-2 hover:underline"
          >{{ entry.state.preview.title }}</a
        >
        <p v-if="entry.state.preview.description" class="line-clamp-4 text-sm break-words">{{ entry.state.preview.description }}</p>
        <img
          v-if="entry.state.preview.image"
          :src="entry.state.preview.image.dataUri"
          alt=""
          :class="pictureClass"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
      </article>
      <a
        v-else-if="entry.state.status === 'ready' && entry.state.preview.kind === 'image'"
        :href="entry.state.preview.url"
        target="_blank"
        rel="noopener noreferrer"
        class="block border-l-2 border-current/40 pl-2.5"
        ><img
          :src="entry.state.preview.image.dataUri"
          :alt="t('previewImageAlt', { host: hostOf(entry.url) })"
          :class="pictureClass"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
      /></a>
      <div
        v-else-if="entry.state.status === 'ready' && entry.state.preview.kind === 'image-pending'"
        class="border-l-2 border-current/40 pl-2.5"
      >
        <Button variant="soft" size="sm" @click="previews?.loadFull(entry.url)">{{ loadImageLabel(entry.state.preview.bytes) }}</Button>
      </div>
      <p v-else-if="entry.state.status === 'error'" class="border-l-2 border-current/40 pl-2.5 text-sm opacity-80">
        {{ resolveText(protocolErrorMessage(entry.state.code, "")) }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { previewLinks } from "@/features/room/chat/chatLinks";
import { parseChatMarkdown } from "@/features/room/chat/chatMarkdown";
import { formatFileSize } from "@/features/room/chat/mytsFile";
import { useLinkPreviews, type LinkPreviewState } from "@/features/room/chat/useLinkPreviews";
import { protocolErrorMessage } from "@/features/session";
import { resolveText } from "@/shared/i18n/localizedText";
import { useI18n } from "@/shared/i18n/useI18n.js";
import { Button } from "@/shared/ui/button";

// Under a message: what the gateway made of its links. The gateway has opened the pages, this only draws text and pictures it
// handed over. Nothing from a page is ever put into the DOM as HTML, the pictures are data URIs in <img>.
const props = defineProps<{ text: string }>();

const { t } = useI18n();
const previews = useLinkPreviews();

const links = computed(() => previewLinks(parseChatMarkdown(props.text)));
watchEffect(() => links.value.forEach((url) => previews?.ensure(url)));

// A page with nothing to preview or an address that is not one stays quiet. The reasons a reader can act on or wants to know are said.
const SAID_CODES = new Set(["LINK_PREVIEW_BLOCKED", "LINK_PREVIEW_TOO_LARGE", "LINK_PREVIEW_RATE_LIMITED"]);

const shown = computed(() =>
  links.value.flatMap((url) => {
    const state: LinkPreviewState | null = previews?.stateOf(url) ?? null;
    if (!state || state.status === "loading") return [];
    if (state.status === "error" && !SAID_CODES.has(state.code)) return [];
    return [{ url, state }];
  }),
);

const pictureClass = "mt-1 max-h-72 max-w-full rounded-md object-contain";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const loadImageLabel = (bytes: number | undefined) =>
  bytes === undefined ? t("previewLoadImageUnknownSize") : t("previewLoadImage", { size: formatFileSize(bytes) });
</script>
