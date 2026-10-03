import { en } from "./en.js";

export const ru: Record<string, string> = {
  ...en,
  screenShareVolume: "Громкость трансляции",
  screenShareNativeUnavailable: "Демонстрация экрана TeamSpeak пока недоступна для веб-просмотра",
  screenShareExit: "Выйти из просмотра",
  screenShareConnecting: "Подключение к трансляции экрана",
  screenShareViewers: "Текущие зрители",
  screenShareExitFullscreen: "Выйти из полноэкранного режима",
  screenShareSettingsHint: "Настройте качество перед началом трансляции",
  screenShareResolution: "Выходное разрешение",
  screenShareResolutionSource: "Исходное разрешение",
  screenShareResolution720p: "720p (до 1280 × 720)",
  screenShareResolution1080p: "1080p (до 1920 × 1080)",
  screenShareSettingsNote: "Настройки применятся при следующем запуске трансляции",
};
