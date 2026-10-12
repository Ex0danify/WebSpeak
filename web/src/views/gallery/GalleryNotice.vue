<template>
  <GallerySection id="gallery-notice" title="Toast and Banner" note="toast: event · banner: state · useToast()">
    <div class="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        @click="raiseToast({ title: noticeSamples[lang].connected, description: noticeSamples[lang].connectedBody, variant: 'success' })"
        >{{ noticeSamples[lang].connected }}</Button
      >
      <Button
        variant="outline"
        @click="
          raiseToast({
            title: noticeSamples[lang].blocked,
            description: noticeSamples[lang].blockedBody,
            variant: 'danger',
            action: { label: noticeSamples[lang].retry, onClick: () => raiseToast(noticeSamples[lang].copied) },
          })
        "
        >{{ noticeSamples[lang].blocked }}</Button
      >
      <Button
        variant="outline"
        @click="raiseToast({ title: noticeSamples[lang].long, description: noticeSamples[lang].longBody, variant: 'warning' })"
        >{{ noticeSamples[lang].long }}</Button
      >
      <Button variant="outline" @click="raiseToast(noticeSamples[lang].copied)">{{ noticeSamples[lang].copied }}</Button>
      <Button variant="outline" @click="raiseToast({ title: noticeSamples[lang].sticky, variant: 'info', duration: 0 })">{{
        noticeSamples[lang].sticky
      }}</Button>
      <Button variant="ghost" @click="dismissToasts()">{{ noticeSamples[lang].dismiss }}</Button>
    </div>

    <div class="mt-6 flex flex-col gap-3">
      <Banner variant="warning" :title="noticeSamples[lang].reconnecting">
        {{ noticeSamples[lang].reconnectingBody }}
        <template #actions
          ><Button size="sm" variant="outline">{{ noticeSamples[lang].retryNow }}</Button></template
        >
      </Banner>
      <Banner variant="danger" :title="noticeSamples[lang].failed">
        {{ noticeSamples[lang].failedBody }}
        <template #actions
          ><Button size="sm" variant="outline">{{ noticeSamples[lang].retryNow }}</Button></template
        >
      </Banner>
      <Banner variant="warning" :title="noticeSamples[lang].degraded">{{ noticeSamples[lang].degradedBody }}</Banner>
      <Banner
        v-if="bannerVisible"
        variant="info"
        icon="bell"
        dismissible
        :dismiss-label="noticeSamples[lang].dismiss"
        @dismiss="bannerVisible = false"
      >
        <strong>{{ noticeSamples[lang].poke }}</strong> {{ noticeSamples[lang].pokeBody }}
      </Banner>
      <div v-else class="flex items-center gap-3 text-sm text-fg-muted">
        {{ noticeSamples[lang].hidden }}
        <Button size="sm" variant="secondary" @click="bannerVisible = true">{{ noticeSamples[lang].restore }}</Button>
      </div>
    </div>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Banner } from "@/shared/ui/banner";
import { useToast } from "@/shared/composables/useToast";
import GallerySection from "./GallerySection.vue";
import { type Lang, useGalleryLang } from "./galleryLang";

const lang = useGalleryLang();

type NoticeSample = {
  dismiss: string;
  connected: string;
  connectedBody: string;
  blocked: string;
  blockedBody: string;
  retry: string;
  copied: string;
  long: string;
  longBody: string;
  sticky: string;
  reconnecting: string;
  reconnectingBody: string;
  retryNow: string;
  failed: string;
  failedBody: string;
  degraded: string;
  degradedBody: string;
  poke: string;
  pokeBody: string;
  hidden: string;
  restore: string;
};
const noticeSamples: Record<Lang, NoticeSample> = {
  en: {
    dismiss: "Dismiss",
    connected: "Connected to Raid Night",
    connectedBody: "Voice is live at 41 ms.",
    blocked: "Microphone blocked",
    blockedBody: "Allow mic access in your browser.",
    retry: "Retry",
    copied: "Link copied",
    long: "Could not move Kestrel to the channel",
    longBody: "You do not have permission to move members out of a password-protected channel on this server.",
    sticky: "Stays until dismissed",
    reconnecting: "Reconnecting",
    reconnectingBody: "Connection to the server was lost. Trying again in 3 s.",
    retryNow: "Retry now",
    failed: "Could not reconnect",
    failedBody: "The server did not answer after 5 attempts.",
    degraded: "Audio quality reduced",
    degradedBody: "Noise suppression is off because this browser is too busy.",
    poke: "Kestrel poked you",
    pokeBody: "Raid starts in five.",
    hidden: "Banner dismissed",
    restore: "Show again",
  },
  de: {
    dismiss: "Schließen",
    connected: "Mit Raid-Nacht verbunden",
    connectedBody: "Die Sprachverbindung steht mit 41 ms.",
    blocked: "Mikrofon blockiert",
    blockedBody: "Erlauben Sie den Mikrofonzugriff in Ihrem Browser.",
    retry: "Erneut versuchen",
    copied: "Link kopiert",
    long: "Kestrel konnte nicht in den Kanal verschoben werden",
    longBody: "Sie haben auf diesem Server keine Berechtigung, Mitglieder aus einem passwortgeschützten Kanal zu verschieben.",
    sticky: "Bleibt bis zum Schließen",
    reconnecting: "Verbindung wird wiederhergestellt",
    reconnectingBody: "Die Verbindung zum Server wurde unterbrochen. Neuer Versuch in 3 s.",
    retryNow: "Jetzt erneut versuchen",
    failed: "Wiederverbindung fehlgeschlagen",
    failedBody: "Der Server hat nach 5 Versuchen nicht geantwortet.",
    degraded: "Audioqualität verringert",
    degradedBody: "Die Rauschunterdrückung ist aus, weil dieser Browser zu stark ausgelastet ist.",
    poke: "Kestrel hat Sie angestupst",
    pokeBody: "Der Raid beginnt in fünf Minuten.",
    hidden: "Hinweis geschlossen",
    restore: "Wieder anzeigen",
  },
  ru: {
    dismiss: "Закрыть",
    connected: "Подключено к каналу «Ночной рейд»",
    connectedBody: "Голосовая связь работает, задержка 41 мс.",
    blocked: "Микрофон заблокирован",
    blockedBody: "Разрешите доступ к микрофону в настройках браузера.",
    retry: "Повторить",
    copied: "Ссылка скопирована",
    long: "Не удалось переместить Кестрел в канал",
    longBody: "У вас нет прав перемещать участников из канала, защищённого паролем, на этом сервере.",
    sticky: "Остаётся, пока не закроете",
    reconnecting: "Переподключение",
    reconnectingBody: "Соединение с сервером потеряно. Повторная попытка через 3 с.",
    retryNow: "Повторить сейчас",
    failed: "Не удалось переподключиться",
    failedBody: "Сервер не ответил после 5 попыток.",
    degraded: "Качество звука снижено",
    degradedBody: "Шумоподавление отключено: браузер слишком загружен.",
    poke: "Кестрел толкнул вас",
    pokeBody: "Рейд начнётся через пять минут.",
    hidden: "Уведомление закрыто",
    restore: "Показать снова",
  },
};
const { toast: raiseToast, dismiss: dismissToasts } = useToast();
const bannerVisible = ref(true);
</script>
