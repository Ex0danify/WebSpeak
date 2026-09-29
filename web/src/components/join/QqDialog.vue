<template>
  <Dialog v-model="open" size="sm" :title="t('qqGroup')" :close-label="t('close')">
    <img class="mx-auto block max-h-[min(55vh,520px)] w-full max-w-[360px] rounded-lg object-contain" src="/qq-group-qr.jpg" :alt="t('qqGroupQrAlt')" />
    <p class="mb-2 mt-4 text-[13px] text-fg-muted">{{ t('qqJoinDirect') }}</p>
    <Button as="a" variant="outline" class="mb-2 h-auto w-full justify-start whitespace-normal break-all py-2.5 text-left font-normal text-accent" :href="qqJoinUrl" :aria-label="t('joinQqGroup')" target="_blank" rel="noreferrer">{{ qqJoinUrl }}</Button>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/use-i18n.js";

const open = defineModel<boolean>({ default: false });

const { t } = useI18n();

const qqJoinUrl = "http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=yhumUMDD9PmyYFWdXWUb_x7hM5trFQY8&authKey=Pw3HBGT7GwMinTQnuFGfnpf0aRSzXOJKcAiujVP1%2BXMpjheAKrncTRivicBJxpjV&noverify=0&group_code=869500475";
</script>
