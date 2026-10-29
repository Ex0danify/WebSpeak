import "@fontsource-variable/inter/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@/shared/styles/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import App from "@/App.vue";
import { clientRoutes } from "@/views/clientRoutes";
import AdminView from "@/views/AdminView.vue";
import DemoView from "@/views/DemoView.vue";
import "@/shared/services/theme.js";
import { registerMessages } from "@/shared/i18n/useI18n.js";
import { translations as commonMessages } from "@/shared/i18n/common/index.js";
import { translations as roomMessages } from "@/features/room/i18n/index.js";
import { joinMessages } from "@/features/join";
import { adminConnectionMessages, adminMessages } from "@/features/admin";
import { demoMessages } from "@/features/demo";
import { sessionMessages } from "@/features/session";
import { screenShareMessages } from "@/features/screenShare";
import { voiceMessages } from "@/features/voice";
import { chatMessages } from "@/features/room";
import { identityMessages } from "@/features/identity";

for (const messages of [
  commonMessages,
  roomMessages,
  joinMessages,
  identityMessages,
  adminMessages,
  adminConnectionMessages,
  demoMessages,
  sessionMessages,
  screenShareMessages,
  voiceMessages,
  chatMessages,
])
  registerMessages(messages);

const BASELINE_WIDTH = 1920;
const BASELINE_HEIGHT = 1080;
const MAX_UI_SCALE = 1.5;

function applyUiScale(): void {
  // Keep 1080p as the reference. Only enlarge the UI when both viewport dimensions have more space, smaller windows keep the
  // responsive rules instead of shrinking text until it is hard to read.
  const scale = Math.min(MAX_UI_SCALE, Math.max(1, Math.min(window.innerWidth / BASELINE_WIDTH, window.innerHeight / BASELINE_HEIGHT)));
  document.documentElement.style.setProperty("--ui-scale", scale.toFixed(4));
}

applyUiScale();
window.addEventListener("resize", applyUiScale, { passive: true });

const routes: RouteRecordRaw[] = [
  ...clientRoutes,
  { path: "/demo", name: "demo", component: DemoView },
  { path: "/admin/:pathMatch(.*)*", name: "admin", component: AdminView },
];

// Dev-only component gallery, the branch is removed from production builds.
if (import.meta.env.DEV) {
  routes.push({ path: "/__ui", name: "ui-gallery", component: () => import("@/views/UiGallery.vue") });
}

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
