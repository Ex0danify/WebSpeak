<template>
  <nav :aria-label="label" class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
    <div class="flex flex-wrap items-center justify-center gap-1">
      <Button variant="outline" size="sm" icon-only :aria-label="firstLabel" :disabled="page <= 1" @click="page = 1">
        <span aria-hidden="true">«</span>
      </Button>
      <Button variant="outline" size="sm" icon-only :aria-label="previousLabel" :disabled="page <= 1" @click="page -= 1">
        <Icon name="chevron-right" :size="16" class="rotate-180" />
      </Button>
      <template v-for="(item, index) in items" :key="item === 'gap' ? `gap-${index}` : item">
        <span v-if="item === 'gap'" aria-hidden="true" class="px-1 text-2xs text-fg-muted">…</span>
        <Button
          v-else
          :variant="item === page ? 'primary' : 'outline'"
          size="sm"
          icon-only
          :aria-label="pageLabel(item)"
          :aria-current="item === page ? 'page' : undefined"
          @click="page = item"
          >{{ item }}</Button
        >
      </template>
      <Button variant="outline" size="sm" icon-only :aria-label="nextLabel" :disabled="page >= pageCount" @click="page += 1">
        <Icon name="chevron-right" :size="16" />
      </Button>
      <Button variant="outline" size="sm" icon-only :aria-label="lastLabel" :disabled="page >= pageCount" @click="page = pageCount">
        <span aria-hidden="true">»</span>
      </Button>
    </div>
    <span aria-live="polite" class="w-full text-center text-2xs text-fg-muted">{{ summary }}</span>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

// Every number is a button, « and » go to the ends. The caller passes every text
// translated, the page is 1-based.
const props = defineProps<{
  pageCount: number;
  label: string;
  previousLabel: string;
  nextLabel: string;
  firstLabel: string;
  lastLabel: string;
  summary: string;
  pageLabel: (page: number) => string;
}>();

const page = defineModel<number>({ required: true });

// The first and the last page and the ones around the current one, a gap of one page shows that page.
const items = computed<Array<number | "gap">>(() => {
  const shown = new Set([1, props.pageCount, page.value - 1, page.value, page.value + 1].filter((n) => n >= 1 && n <= props.pageCount));
  const sorted = [...shown].sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((number, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && number - previous === 2) result.push(previous + 1);
    else if (previous !== undefined && number - previous > 2) result.push("gap");
    result.push(number);
  });
  return result;
});
</script>
