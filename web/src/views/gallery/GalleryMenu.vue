<template>
  <GallerySection id="gallery-menu" title="Menu" note="arrow keys · typeahead · submenu · danger · sheet at 740 px">
    <div class="flex flex-wrap items-center gap-4">
      <Menu :label="menuSamples[lang].label" :close-label="closeLabel[lang]">
        <template #trigger>
          <Button variant="outline"><Icon name="more" />{{ menuSamples[lang].trigger }}</Button>
        </template>
        <MenuSlider v-model="menuVolume" :label="menuSamples[lang].volume" :min="0" :max="400" :step="5" :value-text="`${menuVolume}%`" />
        <MenuSeparator />
        <MenuItem @select="menuPicked = 'move-here'"><Icon name="door" :size="15" />{{ menuSamples[lang].moveHere }}</MenuItem>
        <MenuSub>
          <template #icon><Icon name="hash" :size="15" /></template>
          <template #label>{{ menuSamples[lang].moveTo }}</template>
          <MenuItem v-for="channel in menuSamples[lang].channels" :key="channel" @select="menuPicked = channel">{{ channel }}</MenuItem>
        </MenuSub>
        <MenuItem @select="menuPicked = 'mute'"
          ><Icon name="mic-off" :size="15" />{{ menuSamples[lang].mute }}<template #shortcut>M</template></MenuItem
        >
        <MenuItem @select="menuPicked = 'profile'"><Icon name="users" :size="15" />{{ menuSamples[lang].profile }}</MenuItem>
        <MenuItem disabled><Icon name="bell" :size="15" />{{ menuSamples[lang].disabled }}</MenuItem>
        <MenuSeparator />
        <MenuLabel>{{ menuSamples[lang].kick }}</MenuLabel>
        <MenuItem tone="danger" @select="menuPicked = 'kick'"><Icon name="close" :size="15" />{{ menuSamples[lang].kick }}</MenuItem>
      </Menu>
      <!-- Options that are on or off together, ticked at the right. Its own menu, so the walk through the one above is unchanged. -->
      <Menu :label="menuSamples[lang].groups" :close-label="closeLabel[lang]">
        <template #trigger>
          <Button variant="outline"><Icon name="shield" />{{ menuSamples[lang].groups }}</Button>
        </template>
        <MenuCheckItem
          v-for="group in menuSamples[lang].groupNames"
          :key="group"
          :checked="menuGroups.has(group)"
          @select="toggleGroup(group)"
          >{{ group }}</MenuCheckItem
        >
      </Menu>
      <Button variant="outline" @click="menuDialog = true">{{ menuSamples[lang].inDialog }}</Button>
      <span class="text-fg-muted"
        >{{ menuSamples[lang].picked }}: <span class="font-mono text-fg">{{ menuPicked || menuSamples[lang].none }}</span></span
      >
    </div>

    <Dialog v-model="menuDialog" size="sm" :title="menuSamples[lang].inDialog" :close-label="closeLabel[lang]">
      <Menu :label="menuSamples[lang].label" :close-label="closeLabel[lang]">
        <template #trigger>
          <Button variant="outline"><Icon name="more" />{{ menuSamples[lang].trigger }}</Button>
        </template>
        <MenuItem @select="menuPicked = 'move-here'"><Icon name="door" :size="15" />{{ menuSamples[lang].moveHere }}</MenuItem>
        <MenuSub>
          <template #icon><Icon name="hash" :size="15" /></template>
          <template #label>{{ menuSamples[lang].moveTo }}</template>
          <MenuItem v-for="channel in menuSamples[lang].channels" :key="channel" @select="menuPicked = channel">{{ channel }}</MenuItem>
        </MenuSub>
      </Menu>
    </Dialog>
  </GallerySection>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Menu, MenuCheckItem, MenuItem, MenuSlider, MenuSub, MenuSeparator, MenuLabel } from "@/shared/ui/menu";
import { Icon } from "@/shared/ui/icon";
import GallerySection from "@/views/gallery/GallerySection.vue";
import { type Lang, useGalleryLang, closeLabel } from "@/views/gallery/galleryLang";

const lang = useGalleryLang();

const menuSamples: Record<
  Lang,
  {
    trigger: string;
    volume: string;
    label: string;
    moveHere: string;
    moveTo: string;
    mute: string;
    profile: string;
    disabled: string;
    kick: string;
    groups: string;
    groupNames: string[];
    channels: string[];
    last: string;
    inDialog: string;
    picked: string;
    none: string;
  }
> = {
  en: {
    trigger: "Member actions",
    volume: "Volume",
    label: "Actions for Kestrel",
    moveHere: "Move to my channel",
    moveTo: "Move to channel",
    mute: "Mute for me",
    profile: "View profile",
    disabled: "Send poke (no permission)",
    kick: "Kick from channel",
    groups: "Server groups",
    groupNames: ["Moderator", "Friend"],
    channels: ["Lobby", "Raid Night", "AFK"],
    last: "Last action",
    inDialog: "Menu inside a dialog",
    picked: "Last action",
    none: "none",
  },
  de: {
    trigger: "Aktionen für Mitglieder",
    volume: "Lautstärke",
    label: "Aktionen für Kestrel",
    moveHere: "In meinen Kanal verschieben",
    moveTo: "In einen anderen Kanal verschieben",
    mute: "Nur für mich stummschalten",
    profile: "Profil anzeigen",
    disabled: "Anstupsen senden (keine Berechtigung)",
    kick: "Aus dem Kanal werfen",
    groups: "Servergruppen",
    groupNames: ["Moderator", "Freund"],
    channels: ["Empfang", "Raid-Nacht", "Abwesend"],
    last: "Letzte Aktion",
    inDialog: "Menü in einem Dialog",
    picked: "Letzte Aktion",
    none: "keine",
  },
};
const menuPicked = ref("");
// The sample ticks the first group of either language, to show a ticked and an unticked item.
const menuGroups = ref(new Set<string>(["Moderator"]));
function toggleGroup(group: string): void {
  const next = new Set(menuGroups.value);
  if (!next.delete(group)) next.add(group);
  menuGroups.value = next;
}
const menuVolume = ref(100);
const menuDialog = ref(false);
</script>
