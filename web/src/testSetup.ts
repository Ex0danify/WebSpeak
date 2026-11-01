import { registerMessages } from "@/shared/i18n/useI18n";
import { translations as commonMessages } from "@/shared/i18n/common";
import { translations as roomMessages } from "@/features/room/i18n";
import { translations as joinMessages } from "@/features/join/i18n";
import { adminConnectionMessages, adminMessages } from "@/features/admin";
import { demoMessages } from "@/features/demo";
import { sessionMessages } from "@/features/session";
import { screenShareMessages } from "@/features/screenShare";
import { translations as voiceMessages } from "@/features/voice/i18n";
import { translations as chatMessages } from "@/features/room/chat/i18n";
import { translations as profileMessages } from "@/features/room/profile/i18n";
import { translations as identityMessages } from "@/features/identity/i18n";

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
  profileMessages,
])
  registerMessages(messages);
