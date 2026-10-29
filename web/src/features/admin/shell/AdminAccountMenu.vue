<template>
  <div class="desktop:hidden">
    <Menu align="end" :label="t('accountMenu')" :close-label="t('close')">
      <template #trigger>
        <Button variant="accentSoft" size="sm" icon-only :aria-label="t('accountMenu')"><Icon name="user" :size="17" /></Button>
      </template>
      <MenuItem @select="openGuestPage"><Icon name="share" :size="16" />{{ t("openGuest") }}</MenuItem>
      <MenuItem @select="logout()"><Icon name="door" :size="16" />{{ t("logout") }}</MenuItem>
    </Menu>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Menu, MenuItem } from "@/shared/ui/menu";
import { useAdminSessionStore } from "@/features/admin/core/adminSession";
import { useI18n } from "@/shared/i18n/useI18n";

// The sidebar has these two as buttons on a desktop. On a phone the page nav is at the bottom and they are here.
const { logout } = useAdminSessionStore();
const { t } = useI18n();

function openGuestPage() {
  window.open("/", "_blank", "noopener");
}
</script>
