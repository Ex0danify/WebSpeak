import { defineAsyncComponent, h } from "vue";
import ChatEditorFallback from "@/features/room/chat/editor/ChatEditorFallback.vue";

// The editor is a large library that nothing before the chat needs, so it loads when a composer first shows. Defined once for
// the module, so after the first load every later composer draws it at once. The stand-in has the editor's height, so the
// composer does not jump when the editor arrives.
export const AsyncChatEditor = defineAsyncComponent({
  loader: () => import("@/features/room/chat/editor/ChatEditor.vue"),
  loadingComponent: () => h(ChatEditorFallback),
  errorComponent: () => h(ChatEditorFallback, { failed: true }),
  delay: 0,
});
