<template>
  <GallerySection id="gallery-dialog" title="Dialog" note="reka-ui dialog · focus trap · Esc · backdrop">
    <div class="flex flex-wrap items-center gap-3">
      <Button variant="outline" @click="dialogSm = true">{{ dialogSamples[lang].small }}</Button>
      <Button variant="outline" @click="dialogMd = true">{{ dialogSamples[lang].medium }}</Button>
      <Button variant="outline" @click="dialogLg = true">{{ dialogSamples[lang].large }}</Button>
      <Button variant="outline" @click="dialogLong = true">{{ dialogSamples[lang].long }}</Button>
      <Button variant="outline" @click="dialogLocked = true">{{ dialogSamples[lang].locked }}</Button>
    </div>

    <Dialog
      v-model="dialogSm"
      size="sm"
      :title="dialogSamples[lang].title"
      :description="dialogSamples[lang].description"
      :close-label="closeLabel[lang]"
    >
      <Field :label="dialogSamples[lang].password" :hint="dialogSamples[lang].body">
        <Input v-model="dialogPassword" type="password" autocomplete="off" />
      </Field>
      <template #footer>
        <Button variant="ghost" @click="dialogSm = false">{{ dialogSamples[lang].cancel }}</Button>
        <Button @click="dialogSm = false">{{ dialogSamples[lang].join }}</Button>
      </template>
    </Dialog>

    <Dialog v-model="dialogMd" size="md" :title="dialogSamples[lang].longTitle" :close-label="closeLabel[lang]">
      <p class="m-0 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
      <template #footer>
        <Button @click="dialogMd = false">{{ closeLabel[lang] }}</Button>
      </template>
    </Dialog>

    <Dialog v-model="dialogLg" size="lg" :title="dialogSamples[lang].longTitle" :close-label="closeLabel[lang]">
      <div class="flex flex-col gap-4">
        <p class="m-0 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
        <div class="grid grid-cols-2 gap-4 max-compact:grid-cols-1">
          <Field :label="dialogSamples[lang].password"><Input v-model="dialogPassword" autocomplete="off" /></Field>
          <Field :label="dialogSamples[lang].region">
            <Select v-model="region">
              <option v-for="(item, index) in dialogSamples[lang].regions" :key="regionKeys[index]" :value="regionKeys[index]">
                {{ item }}
              </option>
            </Select>
          </Field>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="dialogLg = false">{{ dialogSamples[lang].cancel }}</Button>
        <Button @click="dialogLg = false">{{ dialogSamples[lang].join }}</Button>
      </template>
    </Dialog>

    <Dialog v-model="dialogLong" size="sm" :title="dialogSamples[lang].long" :close-label="closeLabel[lang]">
      <p v-for="index in 14" :key="index" class="m-0 mb-3 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
      <template #footer>
        <Button @click="dialogLong = false">{{ closeLabel[lang] }}</Button>
      </template>
    </Dialog>

    <Dialog v-model="dialogLocked" size="sm" :dismissible="false" :title="dialogSamples[lang].locked">
      <p class="m-0 text-fg-muted">{{ dialogSamples[lang].lockedBody }}</p>
      <template #footer>
        <Button @click="dialogLocked = false">{{ closeLabel[lang] }}</Button>
      </template>
    </Dialog>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Dialog } from "@/shared/ui/dialog";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang, closeLabel } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const dialogSamples: Record<
  Lang,
  {
    open: string;
    small: string;
    medium: string;
    large: string;
    long: string;
    locked: string;
    title: string;
    longTitle: string;
    description: string;
    body: string;
    paragraph: string;
    password: string;
    cancel: string;
    join: string;
    lockedBody: string;
    region: string;
    regions: string[];
  }
> = {
  en: {
    open: "Open",
    small: "Small",
    medium: "Medium",
    large: "Large",
    long: "Long content",
    locked: "Not dismissible",
    title: "Channel password",
    longTitle: "Audio settings for this device",
    description: "This channel is protected.",
    body: "Enter the password to join.",
    paragraph: "Each browser user is an independent virtual client on the TeamSpeak server, so these settings only affect this tab.",
    password: "Password",
    cancel: "Cancel",
    join: "Join channel",
    lockedBody: "Esc, the backdrop and the X button do nothing here. Only the button below closes it.",
    region: "Audio region",
    regions: ["Automatic (nearest)", "Europe", "North America"],
  },
  de: {
    open: "Öffnen",
    small: "Klein",
    medium: "Mittel",
    large: "Groß",
    long: "Langer Inhalt",
    locked: "Nicht schließbar",
    title: "Passwort für den Sprachkanal",
    longTitle: "Audioeinstellungen für dieses Gerät und diesen Browser",
    description: "Dieser Kanal ist durch ein Passwort geschützt.",
    body: "Geben Sie das Passwort ein, um dem Kanal beizutreten.",
    paragraph:
      "Jeder Browser-Benutzer ist ein eigenständiger virtueller Client auf dem TeamSpeak-Server, daher wirken sich diese Einstellungen nur auf diesen Tab aus.",
    password: "Passwort",
    cancel: "Abbrechen",
    join: "Kanal beitreten",
    lockedBody: "Esc, der Hintergrund und das X haben hier keine Wirkung. Nur die Schaltfläche unten schließt den Dialog.",
    region: "Bevorzugte Audioregion des Sprachservers",
    regions: ["Automatisch (nächstgelegene Region)", "Europa", "Nordamerika"],
  },
};
const region = ref("auto");
const regionKeys = ["auto", "eu", "na"];
const dialogSm = ref(false);
const dialogMd = ref(false);
const dialogLg = ref(false);
const dialogLong = ref(false);
const dialogLocked = ref(false);
const dialogPassword = ref("");
</script>
