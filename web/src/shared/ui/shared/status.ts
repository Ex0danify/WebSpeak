import { type IconName } from "@/shared/ui/icon";

// Shared by Toast and Banner. Every variant has its own glyph, so status is
// never carried by color alone.
export type StatusVariant = "info" | "success" | "warning" | "danger";

export const statusIconName: Record<StatusVariant, IconName> = {
  info: "info",
  success: "check",
  warning: "alert",
  danger: "alert",
};

export const statusTextClass: Record<StatusVariant, string> = {
  info: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
