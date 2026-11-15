import type { ChatNode } from "@/features/room/chat/chatMarkdown";

/** Previews per message. More links than this stay plain links. */
export const MAX_PREVIEWS_PER_MESSAGE = 2;

const WEB_LINK = /^https?:\/\//i;

/** The web addresses of a parsed message, first ones first and each once. Links in a spoiler or a collapsed block count too. */
export function previewLinks(nodes: ChatNode[], max = MAX_PREVIEWS_PER_MESSAGE): string[] {
  const found: string[] = [];
  const visit = (list: ChatNode[]) => {
    for (const node of list) {
      if (found.length >= max) return;
      if (node.kind !== "element") continue;
      if (node.tag === "a" && node.href && WEB_LINK.test(node.href) && !found.includes(node.href)) found.push(node.href);
      visit(node.children);
    }
  };
  visit(nodes);
  return found;
}
