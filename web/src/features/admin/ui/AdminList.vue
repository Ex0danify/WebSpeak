<template>
  <div :class="cn('grid content-start gap-3', props.class)">
    <div v-if="!items.length" class="grid min-h-32.5 place-items-center gap-2 text-center text-caption text-fg-muted">
      <Icon :name="emptyIcon" :size="22" class="text-accent" />
      <span>{{ emptyText }}</span>
    </div>
    <slot v-else name="list">
      <ul class="m-0 grid list-none gap-2.5 p-0" :aria-label="label">
        <template v-for="item in items" :key="keyOf(item)">
          <slot name="row" :item="item" />
        </template>
      </ul>
    </slot>
    <Pager
      v-if="pageCount > 1"
      v-model="page"
      :page-count="pageCount"
      :label="t('pagerLabel')"
      :previous-label="t('pagePrevious')"
      :next-label="t('pageNext')"
      :first-label="t('pageFirst')"
      :last-label="t('pageLast')"
      :page-label="(number) => t('pageNumber', { page: number })"
      :summary="t('listPage', { page, count: pageCount })"
    />
    <ListFooter v-if="moreTo || $slots.footer" :summary="t('listShowing', { shown: items.length, total })">
      <RouterLink v-if="moreTo" :to="moreTo" class="text-caption font-bold whitespace-nowrap text-accent no-underline">{{
        moreLabel
      }}</RouterLink>
      <slot name="footer" />
    </ListFooter>
  </div>
</template>

<script setup lang="ts" generic="T">
import { RouterLink } from "vue-router";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/icon";
import { ListFooter, Pager } from "@/shared/ui/list";
import { useI18n } from "@/shared/i18n/useI18n";
import type { AdminListProps } from "@/features/admin/ui/adminList";

// The body of every list of the console: the rows (`row` renders one `<li>`, `list` replaces the whole `<ul>` for a table), the
// empty state with its own icon, the pager when there is more than one page, and the line below with the way to the full view.
// `total` is what exists, `items` what is shown.
// The card and the view hand over all their props, the ones that are not the list's are dropped.
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<AdminListProps<T> & { label: string; class?: string }>(), { pageCount: 1 });
defineSlots<{ row(props: { item: T }): unknown; list?(): unknown; footer?(): unknown }>();

const page = defineModel<number>("page", { default: 1 });
const { t } = useI18n();
</script>
