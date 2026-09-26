// Icon names and sizes. Keep `iconNames` in step with the branches in
// Icon.vue: the `name` prop is typed from this list, so a typo in either the
// template or a call site fails `vue-tsc`.
export const iconNames = [
  "home", "activity", "server", "compass", "download", "settings",
  "mic", "mic-off", "music", "headset", "volume", "volume-off",
  "search", "bell", "clock", "help", "info", "alert", "check",
  "plus", "close", "more", "refresh", "chevron-down", "chevron-right",
  "arrow-right", "hash", "send", "smile", "paperclip", "share", "copy",
  "lock", "user", "users", "message", "door", "waveform", "shield",
  "sun", "moon", "monitor", "globe", "fullscreen", "fullscreen-exit",
  "github", "qq",
] as const;

export type IconName = (typeof iconNames)[number];

// 18 px is the default. Dense rows (member rows, menu items, chips, inline
// with 13 to 14 px text) use `sm`. A plain number still works for the few
// places that need an exact size, such as brand art.
export const iconSizes = { sm: 15, md: 18 } as const;

export type IconSize = keyof typeof iconSizes | number;
