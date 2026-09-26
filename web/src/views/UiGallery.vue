<script setup lang="ts">
// Dev-only component gallery, registered at /__ui when import.meta.env.DEV.
// Every components/ui component adds its own section here with all variants.
import { onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, Radio } from "@/components/ui/radio";
import { Slider } from "@/components/ui/slider";
import { Chip, Count } from "@/components/ui/chip";
import { Tabs, TabList, Tab, TabPanel, Segmented, Segment } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Meter } from "@/components/ui/meter";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { Banner } from "@/components/ui/banner";
import { Toaster } from "@/components/ui/toast";
import { useToast } from "@/lib/use-toast";
import { Menu, MenuItem, MenuSlider, MenuSub, MenuSeparator, MenuLabel } from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon, iconNames } from "@/components/ui/icon";
import { applyTheme, getStoredTheme, saveTheme, type ThemeMode } from "@/services/theme";

type Lang = "en" | "zh" | "de" | "ru" | "ja";

const themes: ThemeMode[] = ["system", "light", "dark"];
const languages: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
  { value: "ja", label: "日本語" },
];

// Sample copy for checking wrapping and clipping. Long German and Russian
// strings are the worst case; components must tolerate 40% more than English.
const samples: Record<Lang, { short: string; long: string }> = {
  en: { short: "Join channel", long: "Join the selected channel" },
  zh: { short: "加入频道", long: "加入所选频道并开始语音" },
  de: { short: "Kanal beitreten", long: "Dem ausgewählten Sprachkanal beitreten" },
  ru: { short: "Войти в канал", long: "Присоединиться к выбранному каналу" },
  ja: { short: "チャンネルに参加", long: "選択したチャンネルに参加する" },
};

const fieldSamples: Record<Lang, { region: string; regions: string[]; nick: string; nickHint: string; server: string; error: string; search: string }> = {
  en: { region: "Audio region", regions: ["Automatic (nearest)", "Europe", "North America"], nick: "Nickname", nickHint: "Shown to everyone in the channel.", server: "Server address", error: "Could not reach this server.", search: "Find a channel" },
  zh: { region: "音频区域", regions: ["自动（就近）", "欧洲", "北美"], nick: "昵称", nickHint: "频道内所有人都能看到。", server: "服务器地址", error: "无法连接到该服务器。", search: "查找频道" },
  de: { region: "Bevorzugte Audioregion des Sprachservers", regions: ["Automatisch (nächstgelegene Region)", "Europa", "Nordamerika"], nick: "Benutzername", nickHint: "Für alle Teilnehmer im Kanal sichtbar, auch nach dem Verlassen.", server: "Serveradresse des Sprachservers", error: "Dieser Server ist derzeit nicht erreichbar.", search: "Kanal suchen" },
  ru: { region: "Регион обработки звука для голосового канала", regions: ["Автоматически (ближайший)", "Европа", "Северная Америка"], nick: "Псевдоним", nickHint: "Виден всем участникам канала.", server: "Адрес сервера голосовой связи", error: "Не удалось подключиться к этому серверу.", search: "Найти канал" },
  ja: { region: "音声リージョン", regions: ["自動（最も近い）", "ヨーロッパ", "北アメリカ"], nick: "ニックネーム", nickHint: "チャンネルの全員に表示されます。", server: "サーバーアドレス", error: "このサーバーに接続できませんでした。", search: "チャンネルを検索" },
};

const switchSamples: Record<Lang, { noise: string; noiseHint: string; ptt: string; pttHint: string }> = {
  en: { noise: "Noise suppression", noiseHint: "Filters keyboard and fan noise from your mic.", ptt: "Push to talk", pttHint: "Hold Space to transmit." },
  zh: { noise: "降噪", noiseHint: "过滤麦克风中的键盘声和风扇声。", ptt: "按键说话", pttHint: "按住空格键发言。" },
  de: { noise: "Geräuschunterdrückung", noiseHint: "Filtert Tastatur- und Lüftergeräusche aus dem Mikrofonsignal heraus.", ptt: "Push-to-Talk", pttHint: "Zum Sprechen die Leertaste gedrückt halten." },
  ru: { noise: "Шумоподавление", noiseHint: "Убирает шум клавиатуры и вентилятора из сигнала микрофона.", ptt: "Нажми и говори", pttHint: "Удерживайте пробел, чтобы говорить." },
  ja: { noise: "ノイズ抑制", noiseHint: "キーボードやファンの音をマイクから除去します。", ptt: "プッシュトゥトーク", pttHint: "スペースキーを押している間だけ送信します。" },
};
const checkSamples: Record<Lang, { remember: string; all: string; modes: string; ptt: string; vox: string; always: string }> = {
  en: { remember: "Remember my nickname on this device", all: "Select all channels", modes: "Transmit mode", ptt: "Push to talk", vox: "Voice activity", always: "Always on" },
  zh: { remember: "在此设备上记住我的昵称", all: "选择全部频道", modes: "发言模式", ptt: "按键说话", vox: "语音激活", always: "始终开启" },
  de: { remember: "Meinen Benutzernamen auf diesem Gerät für den nächsten Besuch merken", all: "Alle Kanäle auswählen", modes: "Übertragungsmodus", ptt: "Push-to-Talk", vox: "Sprachaktivierung", always: "Immer aktiv" },
  ru: { remember: "Запомнить мой псевдоним на этом устройстве для следующего входа", all: "Выбрать все каналы", modes: "Режим передачи", ptt: "Нажми и говори", vox: "По голосу", always: "Всегда включён" },
  ja: { remember: "このデバイスでニックネームを記憶する", all: "すべてのチャンネルを選択", modes: "送信モード", ptt: "プッシュトゥトーク", vox: "音声検出", always: "常にオン" },
};
const sliderSamples: Record<Lang, { volume: string; threshold: string }> = {
  en: { volume: "Output volume", threshold: "Voice activity threshold" },
  zh: { volume: "输出音量", threshold: "语音激活阈值" },
  de: { volume: "Ausgabelautstärke für alle Teilnehmer im Kanal", threshold: "Schwellenwert der Sprachaktivierung" },
  ru: { volume: "Громкость воспроизведения для всех участников канала", threshold: "Порог активации по голосу" },
  ja: { volume: "出力音量", threshold: "音声検出のしきい値" },
};
const chipSamples: Record<Lang, { connected: string; unstable: string; muted: string; ptt: string; role: string; long: string; chat: string }> = {
  en: { connected: "Connected · 41 ms", unstable: "Unstable", muted: "Muted", ptt: "Push to talk", role: "Moderator", long: "Connection quality degraded for several minutes", chat: "Chat" },
  zh: { connected: "已连接 · 41 ms", unstable: "不稳定", muted: "已静音", ptt: "按键说话", role: "管理员", long: "连接质量已下降数分钟", chat: "聊天" },
  de: { connected: "Verbunden · 41 ms", unstable: "Instabil", muted: "Stummgeschaltet", ptt: "Push-to-Talk", role: "Moderator", long: "Verbindungsqualität seit mehreren Minuten beeinträchtigt", chat: "Chat" },
  ru: { connected: "Подключено · 41 мс", unstable: "Нестабильно", muted: "Микрофон выключен", ptt: "Нажми и говори", role: "Модератор", long: "Качество соединения снижено уже несколько минут", chat: "Чат" },
  ja: { connected: "接続済み · 41 ms", unstable: "不安定", muted: "ミュート中", ptt: "プッシュトゥトーク", role: "モデレーター", long: "接続品質が数分間低下しています", chat: "チャット" },
};
const tabSamples: Record<Lang, { label: string; voice: string; chat: string; settings: string; system: string; light: string; dark: string; members: string; files: string; log: string; panel: string }> = {
  en: { label: "Workspace sections", voice: "Voice", chat: "Chat", settings: "Settings", system: "System", light: "Light", dark: "Dark", members: "Members", files: "Files", log: "Log", panel: "Panel content for" },
  zh: { label: "工作区分区", voice: "语音", chat: "聊天", settings: "设置", system: "系统", light: "浅色", dark: "深色", members: "成员", files: "文件", log: "日志", panel: "面板内容：" },
  de: { label: "Arbeitsbereich-Abschnitte", voice: "Sprachkanal", chat: "Kanalunterhaltung", settings: "Einstellungen und Audiogeräte", system: "Systemeinstellung", light: "Hell", dark: "Dunkel", members: "Teilnehmer", files: "Dateien", log: "Protokoll", panel: "Inhalt des Bereichs" },
  ru: { label: "Разделы рабочей области", voice: "Голосовой канал", chat: "Чат канала", settings: "Настройки и аудиоустройства", system: "Как в системе", light: "Светлая", dark: "Тёмная", members: "Участники", files: "Файлы", log: "Журнал", panel: "Содержимое раздела" },
  ja: { label: "ワークスペースのセクション", voice: "ボイス", chat: "チャット", settings: "設定", system: "システム", light: "ライト", dark: "ダーク", members: "メンバー", files: "ファイル", log: "ログ", panel: "パネルの内容：" },
};
const cardSamples: Record<Lang, { title: string; body: string; long: string; edit: string; save: string; cancel: string; server: string; members: string }> = {
  en: { title: "Server status", body: "Nine members are online across four channels.", long: "Audio settings for this device", edit: "Edit", save: "Save", cancel: "Cancel", server: "Gateway", members: "Members" },
  zh: { title: "服务器状态", body: "四个频道中共有九位成员在线。", long: "此设备的音频设置", edit: "编辑", save: "保存", cancel: "取消", server: "网关", members: "成员" },
  de: { title: "Serverstatus und Verbindungsqualität", body: "Neun Teilnehmer sind in vier Kanälen gleichzeitig online.", long: "Audioeinstellungen und Geräteauswahl für dieses Gerät", edit: "Bearbeiten", save: "Speichern", cancel: "Abbrechen", server: "Gateway", members: "Teilnehmer" },
  ru: { title: "Состояние сервера и качество соединения", body: "Девять участников находятся в сети в четырёх каналах.", long: "Настройки звука и выбор устройств для этого компьютера", edit: "Изменить", save: "Сохранить", cancel: "Отмена", server: "Шлюз", members: "Участники" },
  ja: { title: "サーバーの状態", body: "4つのチャンネルに9人のメンバーがオンラインです。", long: "このデバイスの音声設定", edit: "編集", save: "保存", cancel: "キャンセル", server: "ゲートウェイ", members: "メンバー" },
};
const avatarSamples: Record<Lang, { name: string; long: string; speaking: string; title: string }> = {
  en: { name: "Kestrel", long: "Odin the Wanderer", speaking: "speaking", title: "Sizes" },
  zh: { name: "凯斯特", long: "流浪者奥丁", speaking: "正在说话", title: "尺寸" },
  de: { name: "Kestrel", long: "Odin der Wanderer aus dem Norden", speaking: "spricht gerade", title: "Größen" },
  ru: { name: "Кестрел", long: "Один Странник Северный", speaking: "говорит", title: "Размеры" },
  ja: { name: "ケストレル", long: "放浪者オーディン", speaking: "発言中", title: "サイズ" },
};
const meterSamples: Record<Lang, { input: string; live: string; threshold: string; start: string; stop: string; silence: string; loud: string }> = {
  en: { input: "Input level", live: "Live level", threshold: "Voice activation threshold", start: "Simulate input", stop: "Stop", silence: "Silence", loud: "Loud" },
  zh: { input: "输入音量", live: "实时音量", threshold: "语音激活阈值", start: "模拟输入", stop: "停止", silence: "静音", loud: "过大" },
  de: { input: "Eingangspegel des Mikrofons", live: "Aktueller Pegel", threshold: "Schwellenwert der Sprachaktivierung", start: "Eingang simulieren", stop: "Stoppen", silence: "Stille", loud: "Zu laut" },
  ru: { input: "Уровень входного сигнала микрофона", live: "Текущий уровень", threshold: "Порог голосовой активации", start: "Имитировать ввод", stop: "Остановить", silence: "Тишина", loud: "Громко" },
  ja: { input: "入力レベル", live: "現在のレベル", threshold: "音声検出のしきい値", start: "入力をシミュレート", stop: "停止", silence: "無音", loud: "大きい" },
};
const dialogSamples: Record<Lang, { open: string; small: string; medium: string; large: string; long: string; locked: string; title: string; longTitle: string; description: string; body: string; paragraph: string; password: string; cancel: string; join: string; close: string; lockedBody: string }> = {
  en: { open: "Open", small: "Small", medium: "Medium", large: "Large", long: "Long content", locked: "Not dismissible", title: "Channel password", longTitle: "Audio settings for this device", description: "This channel is protected.", body: "Enter the password to join.", paragraph: "Each browser user is an independent virtual client on the TeamSpeak server, so these settings only affect this tab.", password: "Password", cancel: "Cancel", join: "Join channel", close: "Close", lockedBody: "Esc, the backdrop and the X button do nothing here. Only the button below closes it." },
  zh: { open: "打开", small: "小", medium: "中", large: "大", long: "长内容", locked: "不可关闭", title: "频道密码", longTitle: "此设备的音频设置", description: "该频道受密码保护。", body: "请输入密码以加入。", paragraph: "每个浏览器用户都是 TeamSpeak 服务器上独立的虚拟客户端，因此这些设置只影响当前标签页。", password: "密码", cancel: "取消", join: "加入频道", close: "关闭", lockedBody: "按 Esc、点击背景或关闭按钮都无效，只有下方按钮可以关闭。" },
  de: { open: "Öffnen", small: "Klein", medium: "Mittel", large: "Groß", long: "Langer Inhalt", locked: "Nicht schließbar", title: "Passwort für den Sprachkanal", longTitle: "Audioeinstellungen für dieses Gerät und diesen Browser", description: "Dieser Kanal ist durch ein Passwort geschützt.", body: "Geben Sie das Passwort ein, um dem Kanal beizutreten.", paragraph: "Jeder Browser-Benutzer ist ein eigenständiger virtueller Client auf dem TeamSpeak-Server, daher wirken sich diese Einstellungen nur auf diesen Tab aus.", password: "Passwort", cancel: "Abbrechen", join: "Kanal beitreten", close: "Schließen", lockedBody: "Esc, der Hintergrund und das X haben hier keine Wirkung. Nur die Schaltfläche unten schließt den Dialog." },
  ru: { open: "Открыть", small: "Малый", medium: "Средний", large: "Большой", long: "Длинное содержимое", locked: "Нельзя закрыть", title: "Пароль голосового канала", longTitle: "Настройки звука для этого устройства", description: "Этот канал защищён паролем.", body: "Введите пароль, чтобы присоединиться к каналу.", paragraph: "Каждый пользователь браузера — отдельный виртуальный клиент на сервере TeamSpeak, поэтому эти настройки действуют только в этой вкладке.", password: "Пароль", cancel: "Отмена", join: "Войти в канал", close: "Закрыть", lockedBody: "Esc, фон и крестик здесь ничего не делают. Закрыть окно можно только кнопкой ниже." },
  ja: { open: "開く", small: "小", medium: "中", large: "大", long: "長い内容", locked: "閉じられない", title: "チャンネルのパスワード", longTitle: "このデバイスの音声設定", description: "このチャンネルはパスワードで保護されています。", body: "参加するにはパスワードを入力してください。", paragraph: "ブラウザの各ユーザーは TeamSpeak サーバー上の独立した仮想クライアントなので、この設定はこのタブにのみ適用されます。", password: "パスワード", cancel: "キャンセル", join: "チャンネルに参加", close: "閉じる", lockedBody: "Esc、背景、×ボタンでは閉じません。下のボタンだけで閉じられます。" },
};
const menuSamples: Record<Lang, { trigger: string; volume: string; label: string; moveHere: string; moveTo: string; mute: string; profile: string; disabled: string; kick: string; channels: string[]; last: string; inDialog: string; picked: string; none: string }> = {
  en: { trigger: "Member actions", volume: "Volume", label: "Actions for Kestrel", moveHere: "Move to my channel", moveTo: "Move to channel", mute: "Mute for me", profile: "View profile", disabled: "Send poke (no permission)", kick: "Kick from channel", channels: ["Lobby", "Raid Night", "AFK"], last: "Last action", inDialog: "Menu inside a dialog", picked: "Last action", none: "none" },
  zh: { trigger: "成员操作", volume: "音量", label: "凯斯特的操作", moveHere: "移动到我的频道", moveTo: "移动到频道", mute: "为我静音", profile: "查看资料", disabled: "发送戳一下（无权限）", kick: "踢出频道", channels: ["大厅", "团战之夜", "挂机"], last: "上次操作", inDialog: "对话框中的菜单", picked: "上次操作", none: "无" },
  de: { trigger: "Aktionen für Mitglieder", volume: "Lautstärke", label: "Aktionen für Kestrel", moveHere: "In meinen Kanal verschieben", moveTo: "In einen anderen Kanal verschieben", mute: "Nur für mich stummschalten", profile: "Profil anzeigen", disabled: "Anstupsen senden (keine Berechtigung)", kick: "Aus dem Kanal werfen", channels: ["Empfang", "Raid-Nacht", "Abwesend"], last: "Letzte Aktion", inDialog: "Menü in einem Dialog", picked: "Letzte Aktion", none: "keine" },
  ru: { trigger: "Действия с участником", volume: "Громкость", label: "Действия для Кестрел", moveHere: "Переместить в мой канал", moveTo: "Переместить в другой канал", mute: "Отключить звук для меня", profile: "Посмотреть профиль", disabled: "Отправить толчок (нет прав)", kick: "Выгнать из канала", channels: ["Лобби", "Ночной рейд", "Отошёл"], last: "Последнее действие", inDialog: "Меню внутри диалога", picked: "Последнее действие", none: "нет" },
  ja: { trigger: "メンバー操作", volume: "音量", label: "ケストレルの操作", moveHere: "自分のチャンネルに移動", moveTo: "チャンネルに移動", mute: "自分だけミュート", profile: "プロフィールを見る", disabled: "ポークを送る（権限なし）", kick: "チャンネルからキック", channels: ["ロビー", "レイドナイト", "離席中"], last: "最後の操作", inDialog: "ダイアログ内のメニュー", picked: "最後の操作", none: "なし" },
};
const popoverSamples: Record<Lang, { trigger: string; label: string; volume: string; done: string; hint: string; inDialog: string }> = {
  en: { trigger: "Output volume", label: "Output volume", volume: "Volume", done: "Done", hint: "Applies to everyone you hear in this tab.", inDialog: "Popover inside a dialog" },
  zh: { trigger: "输出音量", label: "输出音量", volume: "音量", done: "完成", hint: "适用于此标签页中你听到的所有人。", inDialog: "对话框中的弹出层" },
  de: { trigger: "Ausgabelautstärke", label: "Ausgabelautstärke für alle Teilnehmer", volume: "Lautstärke", done: "Fertig", hint: "Gilt für alle Teilnehmer, die Sie in diesem Tab hören.", inDialog: "Popover in einem Dialog" },
  ru: { trigger: "Громкость вывода", label: "Громкость вывода для всех участников", volume: "Громкость", done: "Готово", hint: "Действует на всех, кого вы слышите в этой вкладке.", inDialog: "Всплывающая панель в диалоге" },
  ja: { trigger: "出力音量", label: "出力音量", volume: "音量", done: "完了", hint: "このタブで聞こえるすべての人に適用されます。", inDialog: "ダイアログ内のポップオーバー" },
};
const tooltipSamples: Record<Lang, { mute: string; settings: string; long: string; inDialog: string; sides: Record<"top" | "right" | "bottom" | "left", string> }> = {
  en: { mute: "Mute microphone", settings: "Audio settings", long: "Applies to everyone you hear in this tab, not to other people connected to the server.", inDialog: "Tooltip inside a dialog", sides: { top: "Top", right: "Right", bottom: "Bottom", left: "Left" } },
  zh: { mute: "静音麦克风", settings: "音频设置", long: "适用于此标签页中你听到的所有人，不影响连接到服务器的其他人。", inDialog: "对话框中的提示", sides: { top: "上", right: "右", bottom: "下", left: "左" } },
  de: { mute: "Mikrofon stummschalten", settings: "Audioeinstellungen", long: "Gilt für alle Teilnehmer, die Sie in diesem Tab hören, nicht für andere mit dem Server verbundene Personen.", inDialog: "Tooltip in einem Dialog", sides: { top: "Oben", right: "Rechts", bottom: "Unten", left: "Links" } },
  ru: { mute: "Отключить микрофон", settings: "Настройки звука", long: "Действует на всех, кого вы слышите в этой вкладке, но не на других людей, подключённых к серверу.", inDialog: "Подсказка в диалоге", sides: { top: "Сверху", right: "Справа", bottom: "Снизу", left: "Слева" } },
  ja: { mute: "マイクをミュート", settings: "音声設定", long: "このタブで聞こえるすべての人に適用され、サーバーに接続している他の人には影響しません。", inDialog: "ダイアログ内のツールチップ", sides: { top: "上", right: "右", bottom: "下", left: "左" } },
};
type NoticeSample = { notifications: string; dismiss: string; connected: string; connectedBody: string; blocked: string; blockedBody: string; retry: string; copied: string; long: string; longBody: string; sticky: string; reconnecting: string; reconnectingBody: string; retryNow: string; failed: string; failedBody: string; degraded: string; degradedBody: string; poke: string; pokeBody: string; hidden: string; restore: string };
const noticeSamples: Record<Lang, NoticeSample> = {
  en: { notifications: "Notifications", dismiss: "Dismiss", connected: "Connected to Raid Night", connectedBody: "Voice is live at 41 ms.", blocked: "Microphone blocked", blockedBody: "Allow mic access in your browser.", retry: "Retry", copied: "Link copied", long: "Could not move Kestrel to the channel", longBody: "You do not have permission to move members out of a password-protected channel on this server.", sticky: "Stays until dismissed", reconnecting: "Reconnecting", reconnectingBody: "Connection to the server was lost. Trying again in 3 s.", retryNow: "Retry now", failed: "Could not reconnect", failedBody: "The server did not answer after 5 attempts.", degraded: "Audio quality reduced", degradedBody: "Noise suppression is off because this browser is too busy.", poke: "Kestrel poked you", pokeBody: "Raid starts in five.", hidden: "Banner dismissed", restore: "Show again" },
  zh: { notifications: "通知", dismiss: "关闭", connected: "已连接到团战之夜", connectedBody: "语音已就绪，延迟 41 毫秒。", blocked: "麦克风被阻止", blockedBody: "请在浏览器中允许使用麦克风。", retry: "重试", copied: "链接已复制", long: "无法将凯斯特移动到该频道", longBody: "你没有权限将成员移出此服务器上受密码保护的频道。", sticky: "需手动关闭", reconnecting: "正在重新连接", reconnectingBody: "与服务器的连接已断开，3 秒后重试。", retryNow: "立即重试", failed: "无法重新连接", failedBody: "服务器在 5 次尝试后仍未响应。", degraded: "音质已降低", degradedBody: "由于此浏览器负载过高，降噪已关闭。", poke: "凯斯特戳了你一下", pokeBody: "五分钟后开团。", hidden: "提示已关闭", restore: "再次显示" },
  de: { notifications: "Benachrichtigungen", dismiss: "Schließen", connected: "Mit Raid-Nacht verbunden", connectedBody: "Die Sprachverbindung steht mit 41 ms.", blocked: "Mikrofon blockiert", blockedBody: "Erlauben Sie den Mikrofonzugriff in Ihrem Browser.", retry: "Erneut versuchen", copied: "Link kopiert", long: "Kestrel konnte nicht in den Kanal verschoben werden", longBody: "Sie haben auf diesem Server keine Berechtigung, Mitglieder aus einem passwortgeschützten Kanal zu verschieben.", sticky: "Bleibt bis zum Schließen", reconnecting: "Verbindung wird wiederhergestellt", reconnectingBody: "Die Verbindung zum Server wurde unterbrochen. Neuer Versuch in 3 s.", retryNow: "Jetzt erneut versuchen", failed: "Wiederverbindung fehlgeschlagen", failedBody: "Der Server hat nach 5 Versuchen nicht geantwortet.", degraded: "Audioqualität verringert", degradedBody: "Die Rauschunterdrückung ist aus, weil dieser Browser zu stark ausgelastet ist.", poke: "Kestrel hat Sie angestupst", pokeBody: "Der Raid beginnt in fünf Minuten.", hidden: "Hinweis geschlossen", restore: "Wieder anzeigen" },
  ru: { notifications: "Уведомления", dismiss: "Закрыть", connected: "Подключено к каналу «Ночной рейд»", connectedBody: "Голосовая связь работает, задержка 41 мс.", blocked: "Микрофон заблокирован", blockedBody: "Разрешите доступ к микрофону в настройках браузера.", retry: "Повторить", copied: "Ссылка скопирована", long: "Не удалось переместить Кестрел в канал", longBody: "У вас нет прав перемещать участников из канала, защищённого паролем, на этом сервере.", sticky: "Остаётся, пока не закроете", reconnecting: "Переподключение", reconnectingBody: "Соединение с сервером потеряно. Повторная попытка через 3 с.", retryNow: "Повторить сейчас", failed: "Не удалось переподключиться", failedBody: "Сервер не ответил после 5 попыток.", degraded: "Качество звука снижено", degradedBody: "Шумоподавление отключено: браузер слишком загружен.", poke: "Кестрел толкнул вас", pokeBody: "Рейд начнётся через пять минут.", hidden: "Уведомление закрыто", restore: "Показать снова" },
  ja: { notifications: "通知", dismiss: "閉じる", connected: "レイドナイトに接続しました", connectedBody: "音声は 41 ms で接続されています。", blocked: "マイクがブロックされています", blockedBody: "ブラウザでマイクへのアクセスを許可してください。", retry: "再試行", copied: "リンクをコピーしました", long: "ケストレルをチャンネルに移動できませんでした", longBody: "このサーバーでは、パスワード保護されたチャンネルからメンバーを移動する権限がありません。", sticky: "閉じるまで表示", reconnecting: "再接続中", reconnectingBody: "サーバーとの接続が切れました。3 秒後に再試行します。", retryNow: "今すぐ再試行", failed: "再接続できませんでした", failedBody: "5 回試行しましたが、サーバーから応答がありません。", degraded: "音質が低下しています", degradedBody: "このブラウザの負荷が高いため、ノイズ抑制をオフにしました。", poke: "ケストレルがあなたをポークしました", pokeBody: "5 分後にレイド開始です。", hidden: "バナーを閉じました", restore: "もう一度表示" },
};
const smallSamples: Record<Lang, { channels: string; members: string; mute: string; leave: string; loading: string; loadingMembers: string; mic: string; toggle: string }> = {
  en: { channels: "Channels", members: "Members", mute: "Mute", leave: "Leave channel", loading: "Loading", loadingMembers: "Loading members", mic: "Microphone", toggle: "Push to talk" },
  zh: { channels: "频道", members: "成员", mute: "静音", leave: "离开频道", loading: "加载中", loadingMembers: "正在加载成员", mic: "麦克风", toggle: "按键说话" },
  de: { channels: "Kanäle", members: "Teilnehmer", mute: "Stummschalten", leave: "Kanal verlassen", loading: "Wird geladen", loadingMembers: "Teilnehmer werden geladen", mic: "Mikrofon", toggle: "Push-to-Talk" },
  ru: { channels: "Каналы", members: "Участники", mute: "Отключить звук", leave: "Покинуть канал", loading: "Загрузка", loadingMembers: "Загрузка участников", mic: "Микрофон", toggle: "Рация" },
  ja: { channels: "チャンネル", members: "メンバー", mute: "ミュート", leave: "チャンネルから退出", loading: "読み込み中", loadingMembers: "メンバーを読み込み中", mic: "マイク", toggle: "プッシュトゥトーク" },
};
const { toast: raiseToast, dismiss: dismissToasts } = useToast();
const bannerVisible = ref(true);
const tabValue = ref("voice");
const segTheme = ref("system");
const segView = ref("members");
const volume = ref(70);
const threshold = ref(-42);
const remember = ref(true);
const picked = ref<string[]>(["lobby"]);
const mode = ref("vox");
const noiseOn = ref(true);
const pttOn = ref(false);
const nickname = ref("Kestrel");
const region = ref("auto");
const notes = ref("");
const regionKeys = ["auto", "eu", "na"];
const server = ref("ts.example");
const query = ref("");
const theme = ref<ThemeMode>(getStoredTheme());
const lang = ref<Lang>("en");
const micMuted = ref(false);
const deafened = ref(true);
const saving = ref(false);

const popoverDialog = ref(false);
const tooltipDialog = ref(false);
const tooltipSides = ["top", "right", "bottom", "left"] as const;
const menuPicked = ref("");
const menuVolume = ref(100);
const menuDialog = ref(false);
const dialogSm = ref(false);
const dialogMd = ref(false);
const dialogLg = ref(false);
const dialogLong = ref(false);
const dialogLocked = ref(false);
const dialogPassword = ref("");
const liveMeter = ref<InstanceType<typeof Meter> | null>(null);
const livePercent = ref(0);
const simulating = ref(false);
let frame = 0;
let lastReadout = 0;
// The bar is written straight to the element every frame; only the printed
// percentage is reactive, and it updates ten times a second at most.
function tick(now: number) {
  const level = 0.5 + 0.35 * Math.sin(now / 420) + 0.12 * Math.sin(now / 97);
  liveMeter.value?.setLevel(level);
  if (now - lastReadout > 100) {
    lastReadout = now;
    livePercent.value = Math.round(Math.min(1, Math.max(0, level)) * 100);
  }
  frame = requestAnimationFrame(tick);
}
function toggleSimulation() {
  simulating.value = !simulating.value;
  cancelAnimationFrame(frame);
  if (simulating.value) frame = requestAnimationFrame(tick);
  else {
    liveMeter.value?.setLevel(0);
    livePercent.value = 0;
  }
}
onBeforeUnmount(() => cancelAnimationFrame(frame));

watch(theme, (value) => {
  saveTheme(value);
  applyTheme(value);
});
</script>

<template>
  <div class="min-h-screen bg-surface-0 font-sans text-sm text-fg" :lang="lang">
    <header class="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface-1 px-6 py-3">
      <h1 class="text-lg font-semibold">UI gallery</h1>
      <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">dev only</span>
      <div class="ml-auto flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2">
          <span class="text-fg-muted">Theme</span>
          <Select v-model="theme" class="w-32">
            <option v-for="value in themes" :key="value" :value="value">{{ value }}</option>
          </Select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-fg-muted">Language</span>
          <Select v-model="lang" class="w-40">
            <option v-for="option in languages" :key="option.value" :value="option.value">{{ option.label }}</option>
          </Select>
        </label>
      </div>
    </header>

    <main class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <section aria-labelledby="gallery-button" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-button" class="text-base font-semibold">Button</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">5 variants · 3 sizes · icon · pressed · loading · link</span>
        </div>
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <Button variant="primary">{{ samples[lang].short }}</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="outline">Settings</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="danger">Leave</Button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button><Icon name="plus" />New channel</Button>
            <Button variant="outline"><Icon name="settings" />Settings</Button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button variant="outline" icon-only size="sm" aria-label="Close"><Icon name="close" /></Button>
            <Button variant="outline" icon-only aria-label="Settings"><Icon name="settings" /></Button>
            <Button variant="ghost" icon-only size="lg" aria-label="More"><Icon name="more" /></Button>
            <Button variant="secondary" icon-only :pressed="micMuted" aria-label="Mute microphone" @click="micMuted = !micMuted">
              <Icon :name="micMuted ? 'mic-off' : 'mic'" />
            </Button>
            <Button variant="secondary" icon-only :pressed="deafened" aria-label="Deafen" @click="deafened = !deafened">
              <Icon :name="deafened ? 'volume-off' : 'headset'" />
            </Button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button :loading="saving" @click="saving = true">{{ saving ? "Saving" : "Click to load" }}</Button>
            <Button variant="outline" loading>Loading</Button>
            <Button variant="secondary" icon-only loading aria-label="Refreshing"><Icon name="refresh" /></Button>
            <Button v-if="saving" variant="ghost" size="sm" @click="saving = false">Reset</Button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <Button as="a" href="#gallery-button" variant="outline">Link button</Button>
            <Button as="a" href="#gallery-button" variant="ghost" disabled>Disabled link</Button>
          </div>
          <div class="flex max-w-xs flex-wrap items-center gap-3">
            <Button>{{ samples[lang].long }}</Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-field" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-field" class="text-base font-semibold">Field · Input · Select · Textarea</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">hint · error · leading icon · disabled</span>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <Field :label="fieldSamples[lang].nick" :hint="fieldSamples[lang].nickHint">
            <Input v-model="nickname" autocomplete="off" />
          </Field>
          <Field :label="fieldSamples[lang].server" :error="fieldSamples[lang].error">
            <Input v-model="server" />
          </Field>
          <Field :label="fieldSamples[lang].nick">
            <Input model-value="Locked" disabled />
          </Field>
          <Field :label="fieldSamples[lang].region" :hint="fieldSamples[lang].nickHint">
            <Select v-model="region">
              <option v-for="(name, i) in fieldSamples[lang].regions" :key="regionKeys[i]" :value="regionKeys[i]">{{ name }}</option>
            </Select>
          </Field>
          <Field :label="fieldSamples[lang].region" :error="fieldSamples[lang].error">
            <Select model-value="eu">
              <option value="eu">{{ fieldSamples[lang].regions[1] }}</option>
            </Select>
          </Field>
          <Field :label="fieldSamples[lang].region">
            <Select model-value="eu" disabled>
              <option value="eu">{{ fieldSamples[lang].regions[1] }}</option>
            </Select>
          </Field>
          <Field :label="fieldSamples[lang].nick" :hint="fieldSamples[lang].nickHint" class="sm:col-span-2">
            <Textarea v-model="notes" :rows="3" maxlength="500" />
          </Field>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium">Without Field</span>
            <Input v-model="query" :placeholder="fieldSamples[lang].search" aria-label="Search channels">
              <template #leading><Icon name="search" /></template>
            </Input>
          </div>
        </div>
        <p class="mt-4 font-mono text-xs text-fg-muted">nickname = {{ nickname }} · region = {{ region }} · server = {{ server }} · query = {{ query }}</p>
      </section>

      <section aria-labelledby="gallery-switch" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-switch" class="text-base font-semibold">Switch</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">on · off · disabled</span>
        </div>
        <div class="flex max-w-md flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <label for="sw-noise" class="min-w-0">
              <span class="block font-medium">{{ switchSamples[lang].noise }}</span>
              <span class="block text-xs leading-4 text-fg-muted">{{ switchSamples[lang].noiseHint }}</span>
            </label>
            <Switch id="sw-noise" v-model="noiseOn" />
          </div>
          <div class="flex items-center justify-between gap-3">
            <label for="sw-ptt" class="min-w-0">
              <span class="block font-medium">{{ switchSamples[lang].ptt }}</span>
              <span class="block text-xs leading-4 text-fg-muted">{{ switchSamples[lang].pttHint }}</span>
            </label>
            <Switch id="sw-ptt" v-model="pttOn" />
          </div>
          <div class="flex items-center gap-3">
            <Switch :model-value="true" disabled aria-label="Disabled on" />
            <Switch :model-value="false" disabled aria-label="Disabled off" />
            <span class="text-fg-muted">noise = {{ noiseOn }} · ptt = {{ pttOn }}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-check" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-check" class="text-base font-semibold">Checkbox · Radio</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">boolean · array · indeterminate · group</span>
        </div>
        <div class="grid gap-6 sm:grid-cols-2">
          <div class="flex max-w-sm flex-col gap-1">
            <Checkbox v-model="remember">{{ checkSamples[lang].remember }}</Checkbox>
            <Checkbox :model-value="false" disabled>Disabled</Checkbox>
            <Checkbox :model-value="true" disabled>Disabled checked</Checkbox>
            <Checkbox :model-value="picked.length === 3 ? true : false" :indeterminate="picked.length > 0 && picked.length < 3" @update:model-value="picked = $event ? ['lobby', 'raid', 'afk'] : []">
              {{ checkSamples[lang].all }}
            </Checkbox>
            <div class="ml-7 flex flex-col gap-1">
              <Checkbox v-model="picked" value="lobby">Lobby</Checkbox>
              <Checkbox v-model="picked" value="raid">Raid Night</Checkbox>
              <Checkbox v-model="picked" value="afk">AFK</Checkbox>
            </div>
          </div>
          <div class="flex max-w-sm flex-col gap-1">
            <span id="mode-label" class="mb-1 text-[13px] font-medium">{{ checkSamples[lang].modes }}</span>
            <RadioGroup v-model="mode" aria-labelledby="mode-label">
              <Radio value="ptt">{{ checkSamples[lang].ptt }}</Radio>
              <Radio value="vox">{{ checkSamples[lang].vox }}</Radio>
              <Radio value="always" disabled>{{ checkSamples[lang].always }}</Radio>
            </RadioGroup>
          </div>
        </div>
        <p class="mt-4 font-mono text-xs text-fg-muted">remember = {{ remember }} · picked = {{ picked.join(",") }} · mode = {{ mode }}</p>
      </section>

      <section aria-labelledby="gallery-slider" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-slider" class="text-base font-semibold">Slider</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">fill · negative range · disabled</span>
        </div>
        <div class="flex max-w-md flex-col gap-5">
          <div class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3">
              <label for="sl-vol" class="min-w-0 text-[13px] font-medium">{{ sliderSamples[lang].volume }}</label>
              <span class="font-mono text-[13px] text-fg-muted">{{ volume }}%</span>
            </div>
            <div class="flex items-center gap-2 text-fg-muted">
              <Icon name="volume" />
              <Slider id="sl-vol" v-model="volume" :value-text="`${volume}%`" />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3">
              <label for="sl-thr" class="min-w-0 text-[13px] font-medium">{{ sliderSamples[lang].threshold }}</label>
              <span class="font-mono text-[13px] text-fg-muted">{{ threshold }} dB</span>
            </div>
            <Slider id="sl-thr" v-model="threshold" :min="-60" :max="0" :step="2" :value-text="`${threshold} decibels`" />
          </div>
          <Slider :model-value="35" disabled aria-label="Disabled" />
        </div>
      </section>

      <section aria-labelledby="gallery-chip" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-chip" class="text-base font-semibold">Chip and Count</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">status · icon on warning and danger</span>
        </div>
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-center gap-2">
            <Chip variant="success" dot>{{ chipSamples[lang].connected }}</Chip>
            <Chip variant="warning">{{ chipSamples[lang].unstable }}</Chip>
            <Chip variant="danger"><template #icon><Icon name="mic-off" :size="13" /></template>{{ chipSamples[lang].muted }}</Chip>
            <Chip variant="accent">{{ chipSamples[lang].ptt }}</Chip>
            <Chip>{{ chipSamples[lang].role }}</Chip>
          </div>
          <div class="max-w-[16rem]">
            <Chip variant="warning">{{ chipSamples[lang].long }}</Chip>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-2">{{ chipSamples[lang].chat }} <Count>3</Count></span>
            <span class="inline-flex items-center gap-2">{{ chipSamples[lang].chat }} <Count variant="neutral">12</Count></span>
            <span class="inline-flex items-center gap-2">{{ chipSamples[lang].chat }} <Count variant="danger" aria-label="99+ unread">99+</Count></span>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-tabs" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-tabs" class="text-base font-semibold">Tabs and Segmented</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">arrow keys · Home and End · tablist or radiogroup</span>
        </div>
        <div class="flex flex-col gap-6">
          <Tabs v-model="tabValue" class="max-w-md">
            <TabList :aria-label="tabSamples[lang].label">
              <Tab value="voice">{{ tabSamples[lang].voice }}</Tab>
              <Tab value="chat">{{ tabSamples[lang].chat }} <Count>3</Count></Tab>
              <Tab value="settings">{{ tabSamples[lang].settings }}</Tab>
              <Tab value="off" disabled>Off</Tab>
            </TabList>
            <TabPanel value="voice" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].voice }}</TabPanel>
            <TabPanel value="chat" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].chat }}</TabPanel>
            <TabPanel value="settings" class="pt-3">{{ tabSamples[lang].panel }} {{ tabSamples[lang].settings }}</TabPanel>
          </Tabs>
          <div class="flex flex-wrap items-center gap-6">
            <Segmented v-model="segTheme" :aria-label="tabSamples[lang].settings">
              <Segment value="system">{{ tabSamples[lang].system }}</Segment>
              <Segment value="light">{{ tabSamples[lang].light }}</Segment>
              <Segment value="dark">{{ tabSamples[lang].dark }}</Segment>
            </Segmented>
            <Tabs v-model="segView" variant="segmented">
              <TabList :aria-label="tabSamples[lang].label">
                <Tab value="members">{{ tabSamples[lang].members }}</Tab>
                <Tab value="files">{{ tabSamples[lang].files }}</Tab>
                <Tab value="log">{{ tabSamples[lang].log }}</Tab>
              </TabList>
            </Tabs>
          </div>
          <div class="max-w-xs">
            <Segmented v-model="segTheme" fill :aria-label="tabSamples[lang].settings">
              <Segment value="system">{{ tabSamples[lang].system }}</Segment>
              <Segment value="light">{{ tabSamples[lang].light }}</Segment>
              <Segment value="dark">{{ tabSamples[lang].dark }}</Segment>
            </Segmented>
          </div>
        </div>
        <p class="mt-4 font-mono text-xs text-fg-muted">tab = {{ tabValue }} · theme = {{ segTheme }} · view = {{ segView }}</p>
      </section>

      <section aria-labelledby="gallery-card" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-card" class="text-base font-semibold">Card</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">1 px line border · no shadow · optional header</span>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Card>{{ cardSamples[lang].body }}</Card>
          <Card as="section" :title="cardSamples[lang].title">
            {{ cardSamples[lang].body }}
            <template #actions>
              <Chip variant="success" dot>{{ chipSamples[lang].connected }}</Chip>
            </template>
          </Card>
          <Card as="section" :title="cardSamples[lang].long">
            {{ cardSamples[lang].body }}
            <template #actions>
              <Button variant="outline" size="sm">{{ cardSamples[lang].edit }}</Button>
            </template>
            <template #footer>
              <Button variant="ghost" size="sm">{{ cardSamples[lang].cancel }}</Button>
              <Button size="sm">{{ cardSamples[lang].save }}</Button>
            </template>
          </Card>
          <Card :title="cardSamples[lang].members" flush>
            <ul class="m-0 list-none divide-y divide-line p-0">
              <li class="px-5 py-2.5">Kestrel</li>
              <li class="px-5 py-2.5">Ibis</li>
              <li class="px-5 py-2.5">Wren</li>
            </ul>
          </Card>
        </div>
      </section>

      <section aria-labelledby="gallery-avatar" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-avatar" class="text-base font-semibold">Avatar</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">initial fallback · speaking ring</span>
        </div>
        <div class="flex flex-col gap-6">
          <div class="flex flex-wrap items-center gap-4">
            <span class="text-fg-muted">{{ avatarSamples[lang].title }}</span>
            <Avatar :name="avatarSamples[lang].name" size="xs" />
            <Avatar :name="avatarSamples[lang].name" size="sm" />
            <Avatar :name="avatarSamples[lang].name" size="md" />
            <Avatar :name="avatarSamples[lang].name" size="lg" />
            <Avatar :name="avatarSamples[lang].name" size="xl" />
            <Avatar name="Logo" src="/网站图标.jpg" size="lg" />
            <Avatar name="Broken" src="/missing.png" size="lg" />
          </div>
          <div class="flex flex-wrap items-center gap-6 p-2">
            <Avatar :name="avatarSamples[lang].name" size="sm" speaking :speaking-label="avatarSamples[lang].speaking" :label="avatarSamples[lang].name" />
            <Avatar :name="avatarSamples[lang].name" size="md" speaking />
            <Avatar :name="avatarSamples[lang].name" size="lg" speaking />
            <Avatar :name="avatarSamples[lang].name" size="xl" speaking />
            <Avatar name="Logo" src="/网站图标.jpg" size="lg" speaking />
          </div>
          <div class="flex flex-col gap-1 rounded-lg border border-line bg-surface-0 p-2">
            <div class="flex items-center gap-2 rounded-md p-2">
              <Avatar :name="avatarSamples[lang].name" surface="surface-0" speaking />
              <span class="min-w-0 truncate">{{ avatarSamples[lang].name }}</span>
            </div>
            <div class="flex items-center gap-2 rounded-md p-2">
              <Avatar :name="avatarSamples[lang].long" surface="surface-0" />
              <span class="min-w-0 truncate">{{ avatarSamples[lang].long }}</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-meter" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-meter" class="text-base font-semibold">Meter</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">level · threshold tick · live</span>
        </div>
        <div class="flex max-w-xl flex-col gap-6">
          <div class="flex flex-col gap-3">
            <div v-for="level in [0, 0.35, 0.7, 0.85, 1]" :key="level" class="flex items-center gap-3">
              <Meter :model-value="level" :label="meterSamples[lang].input" class="flex-1" />
              <span class="w-10 shrink-0 text-right font-mono text-xs text-fg-muted">{{ Math.round(level * 100) }}%</span>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <Meter :model-value="0.55" size="sm" :label="meterSamples[lang].input" class="flex-1" />
              <span class="w-16 shrink-0 font-mono text-xs text-fg-muted">sm</span>
            </div>
            <div class="flex items-center gap-3">
              <Meter :model-value="0.55" size="md" :label="meterSamples[lang].input" class="flex-1" />
              <span class="w-16 shrink-0 font-mono text-xs text-fg-muted">md</span>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-fg-muted">{{ meterSamples[lang].threshold }}</span>
            <Meter :model-value="0.3" :threshold="0.45" :label="meterSamples[lang].threshold" />
            <Meter :model-value="0.8" :threshold="0.45" :label="meterSamples[lang].threshold" />
            <div class="flex justify-between text-xs text-fg-muted">
              <span>{{ meterSamples[lang].silence }}</span>
              <span>{{ meterSamples[lang].loud }}</span>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
              <span class="min-w-0 text-fg-muted">{{ meterSamples[lang].live }}</span>
              <span class="font-mono text-xs">{{ livePercent }}%</span>
            </div>
            <Meter ref="liveMeter" />
            <div>
              <Button variant="outline" size="sm" @click="toggleSimulation">
                {{ simulating ? meterSamples[lang].stop : meterSamples[lang].start }}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-dialog" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-dialog" class="text-base font-semibold">Dialog</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">reka-ui dialog · focus trap · Esc · backdrop</span>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="outline" @click="dialogSm = true">{{ dialogSamples[lang].small }}</Button>
          <Button variant="outline" @click="dialogMd = true">{{ dialogSamples[lang].medium }}</Button>
          <Button variant="outline" @click="dialogLg = true">{{ dialogSamples[lang].large }}</Button>
          <Button variant="outline" @click="dialogLong = true">{{ dialogSamples[lang].long }}</Button>
          <Button variant="outline" @click="dialogLocked = true">{{ dialogSamples[lang].locked }}</Button>
        </div>

        <Dialog v-model="dialogSm" size="sm" :title="dialogSamples[lang].title" :description="dialogSamples[lang].description" :close-label="dialogSamples[lang].close">
          <Field :label="dialogSamples[lang].password" :hint="dialogSamples[lang].body">
            <Input v-model="dialogPassword" type="password" autocomplete="off" />
          </Field>
          <template #footer>
            <Button variant="ghost" @click="dialogSm = false">{{ dialogSamples[lang].cancel }}</Button>
            <Button @click="dialogSm = false">{{ dialogSamples[lang].join }}</Button>
          </template>
        </Dialog>

        <Dialog v-model="dialogMd" size="md" :title="dialogSamples[lang].longTitle" :close-label="dialogSamples[lang].close">
          <p class="m-0 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
          <template #footer>
            <Button @click="dialogMd = false">{{ dialogSamples[lang].close }}</Button>
          </template>
        </Dialog>

        <Dialog v-model="dialogLg" size="lg" :title="dialogSamples[lang].longTitle" :close-label="dialogSamples[lang].close">
          <div class="flex flex-col gap-4">
            <p class="m-0 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
            <div class="grid grid-cols-2 gap-4 max-[740px]:grid-cols-1">
              <Field :label="dialogSamples[lang].password"><Input v-model="dialogPassword" autocomplete="off" /></Field>
              <Field :label="fieldSamples[lang].region">
                <Select v-model="region">
                  <option v-for="(item, index) in fieldSamples[lang].regions" :key="regionKeys[index]" :value="regionKeys[index]">{{ item }}</option>
                </Select>
              </Field>
            </div>
          </div>
          <template #footer>
            <Button variant="ghost" @click="dialogLg = false">{{ dialogSamples[lang].cancel }}</Button>
            <Button @click="dialogLg = false">{{ dialogSamples[lang].join }}</Button>
          </template>
        </Dialog>

        <Dialog v-model="dialogLong" size="sm" :title="dialogSamples[lang].long" :close-label="dialogSamples[lang].close">
          <p v-for="index in 14" :key="index" class="m-0 mb-3 text-fg-muted">{{ dialogSamples[lang].paragraph }}</p>
          <template #footer>
            <Button @click="dialogLong = false">{{ dialogSamples[lang].close }}</Button>
          </template>
        </Dialog>

        <Dialog v-model="dialogLocked" size="sm" :dismissible="false" :title="dialogSamples[lang].locked">
          <p class="m-0 text-fg-muted">{{ dialogSamples[lang].lockedBody }}</p>
          <template #footer>
            <Button @click="dialogLocked = false">{{ dialogSamples[lang].close }}</Button>
          </template>
        </Dialog>
      </section>

      <section aria-labelledby="gallery-menu" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-menu" class="text-base font-semibold">Menu</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">arrow keys · typeahead · submenu · danger · sheet at 740 px</span>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <Menu :label="menuSamples[lang].label" :close-label="dialogSamples[lang].close">
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
            <MenuItem @select="menuPicked = 'mute'"><Icon name="mic-off" :size="15" />{{ menuSamples[lang].mute }}<template #shortcut>M</template></MenuItem>
            <MenuItem @select="menuPicked = 'profile'"><Icon name="users" :size="15" />{{ menuSamples[lang].profile }}</MenuItem>
            <MenuItem disabled><Icon name="bell" :size="15" />{{ menuSamples[lang].disabled }}</MenuItem>
            <MenuSeparator />
            <MenuLabel>{{ menuSamples[lang].kick }}</MenuLabel>
            <MenuItem tone="danger" @select="menuPicked = 'kick'"><Icon name="close" :size="15" />{{ menuSamples[lang].kick }}</MenuItem>
          </Menu>
          <Button variant="outline" @click="menuDialog = true">{{ menuSamples[lang].inDialog }}</Button>
          <span class="text-fg-muted">{{ menuSamples[lang].picked }}: <span class="font-mono text-fg">{{ menuPicked || menuSamples[lang].none }}</span></span>
        </div>

        <Dialog v-model="menuDialog" size="sm" :title="menuSamples[lang].inDialog" :close-label="dialogSamples[lang].close">
          <Menu :label="menuSamples[lang].label" :close-label="dialogSamples[lang].close">
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
      </section>

      <section aria-labelledby="gallery-popover" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-popover" class="text-base font-semibold">Popover</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">anchored panel · non-modal · Esc</span>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <Popover :label="popoverSamples[lang].label">
            <template #trigger>
              <Button variant="outline"><Icon name="volume" />{{ popoverSamples[lang].trigger }}</Button>
            </template>
            <template #default="{ close }">
              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="min-w-0 font-semibold">{{ popoverSamples[lang].volume }}</span>
                  <span class="font-mono text-xs text-fg-muted">{{ volume }}%</span>
                </div>
                <Slider v-model="volume" :aria-label="popoverSamples[lang].volume" :value-text="`${volume}%`" />
                <p class="m-0 text-xs text-fg-muted">{{ popoverSamples[lang].hint }}</p>
                <Button size="sm" variant="secondary" class="self-end" @click="close">{{ popoverSamples[lang].done }}</Button>
              </div>
            </template>
          </Popover>
          <Button variant="outline" @click="popoverDialog = true">{{ popoverSamples[lang].inDialog }}</Button>
        </div>

        <Dialog v-model="popoverDialog" size="sm" :title="popoverSamples[lang].inDialog" :close-label="dialogSamples[lang].close">
          <Popover :label="popoverSamples[lang].label">
            <template #trigger>
              <Button variant="outline"><Icon name="volume" />{{ popoverSamples[lang].trigger }}</Button>
            </template>
            <Slider v-model="volume" :aria-label="popoverSamples[lang].volume" />
          </Popover>
        </Dialog>
      </section>

      <section aria-labelledby="gallery-tooltip" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-tooltip" class="text-base font-semibold">Tooltip</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">hover · focus · Esc · never interactive</span>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <Tooltip :text="tooltipSamples[lang].mute" shortcut="M">
            <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].mute"><Icon name="mic-off" /></Button>
          </Tooltip>
          <Tooltip :text="tooltipSamples[lang].settings">
            <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].settings"><Icon name="settings" /></Button>
          </Tooltip>
          <Tooltip :text="tooltipSamples[lang].long">
            <Button variant="outline">{{ tooltipSamples[lang].long.slice(0, 24) }}…</Button>
          </Tooltip>
          <Tooltip v-for="side in tooltipSides" :key="side" :text="tooltipSamples[lang].sides[side]" :side="side">
            <Button variant="secondary" size="sm">{{ tooltipSamples[lang].sides[side] }}</Button>
          </Tooltip>
          <Button variant="outline" @click="tooltipDialog = true">{{ tooltipSamples[lang].inDialog }}</Button>
        </div>

        <Dialog v-model="tooltipDialog" size="sm" :title="tooltipSamples[lang].inDialog" :close-label="dialogSamples[lang].close">
          <Tooltip :text="tooltipSamples[lang].mute" shortcut="M">
            <Button variant="outline" icon-only :aria-label="tooltipSamples[lang].mute"><Icon name="mic-off" /></Button>
          </Tooltip>
        </Dialog>
      </section>

      <section aria-labelledby="gallery-notice" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-notice" class="text-base font-semibold">Toast and Banner</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">toast: event · banner: state · useToast()</span>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="outline" @click="raiseToast({ title: noticeSamples[lang].connected, description: noticeSamples[lang].connectedBody, variant: 'success' })">{{ noticeSamples[lang].connected }}</Button>
          <Button variant="outline" @click="raiseToast({ title: noticeSamples[lang].blocked, description: noticeSamples[lang].blockedBody, variant: 'danger', action: { label: noticeSamples[lang].retry, onClick: () => raiseToast(noticeSamples[lang].copied) } })">{{ noticeSamples[lang].blocked }}</Button>
          <Button variant="outline" @click="raiseToast({ title: noticeSamples[lang].long, description: noticeSamples[lang].longBody, variant: 'warning' })">{{ noticeSamples[lang].long }}</Button>
          <Button variant="outline" @click="raiseToast(noticeSamples[lang].copied)">{{ noticeSamples[lang].copied }}</Button>
          <Button variant="outline" @click="raiseToast({ title: noticeSamples[lang].sticky, variant: 'info', duration: 0 })">{{ noticeSamples[lang].sticky }}</Button>
          <Button variant="ghost" @click="dismissToasts()">{{ noticeSamples[lang].dismiss }}</Button>
        </div>

        <div class="mt-6 flex flex-col gap-3">
          <Banner variant="warning" :title="noticeSamples[lang].reconnecting">
            {{ noticeSamples[lang].reconnectingBody }}
            <template #actions><Button size="sm" variant="outline">{{ noticeSamples[lang].retryNow }}</Button></template>
          </Banner>
          <Banner variant="danger" :title="noticeSamples[lang].failed">
            {{ noticeSamples[lang].failedBody }}
            <template #actions><Button size="sm" variant="outline">{{ noticeSamples[lang].retryNow }}</Button></template>
          </Banner>
          <Banner variant="warning" :title="noticeSamples[lang].degraded">{{ noticeSamples[lang].degradedBody }}</Banner>
          <Banner v-if="bannerVisible" variant="info" icon="bell" dismissible :dismiss-label="noticeSamples[lang].dismiss" @dismiss="bannerVisible = false">
            <strong>{{ noticeSamples[lang].poke }}</strong> {{ noticeSamples[lang].pokeBody }}
          </Banner>
          <div v-else class="flex items-center gap-3 text-sm text-fg-muted">
            {{ noticeSamples[lang].hidden }}
            <Button size="sm" variant="secondary" @click="bannerVisible = true">{{ noticeSamples[lang].restore }}</Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-small" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-small" class="text-base font-semibold">Separator · Kbd · Spinner · Skeleton</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">small parts</span>
        </div>

        <div class="flex flex-col gap-6">
          <div class="flex flex-wrap items-center gap-4">
            <span class="text-sm">{{ smallSamples[lang].channels }}</span>
            <Separator orientation="vertical" class="h-5 self-auto" />
            <span class="text-sm">{{ smallSamples[lang].members }}</span>
            <Separator orientation="vertical" class="h-5 self-auto" :decorative="false" />
            <span class="text-sm">{{ smallSamples[lang].mute }}</span>
          </div>
          <Separator />

          <div class="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <span class="inline-flex items-center gap-2">{{ smallSamples[lang].mute }} <Kbd>M</Kbd></span>
            <span class="inline-flex items-center gap-2">{{ smallSamples[lang].toggle }} <Kbd>Space</Kbd></span>
            <span class="inline-flex items-center gap-1">
              <Kbd>Ctrl</Kbd><span class="text-fg-muted" aria-hidden="true">+</span><Kbd>Shift</Kbd><span class="text-fg-muted" aria-hidden="true">+</span><Kbd>M</Kbd>
            </span>
            <Kbd>Esc</Kbd>
          </div>
          <Separator />

          <div class="flex flex-wrap items-center gap-6">
            <Spinner size="sm" />
            <Spinner />
            <Spinner size="lg" />
            <span class="inline-flex items-center gap-2 text-sm text-fg-muted"><Spinner class="text-accent" />{{ smallSamples[lang].loading }}…</span>
            <span class="inline-flex items-center gap-2 text-sm text-accent"><Spinner :label="smallSamples[lang].loadingMembers" />{{ smallSamples[lang].loadingMembers }}</span>
            <Button variant="secondary" loading>{{ smallSamples[lang].leave }}</Button>
          </div>
          <Separator />

          <div class="grid gap-6 sm:grid-cols-2" aria-busy="true">
            <ul class="m-0 flex list-none flex-col gap-3 p-0">
              <li v-for="n in 3" :key="n" class="flex items-center gap-3">
                <Skeleton shape="circle" class="size-8" />
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton shape="text" :class="n === 2 ? 'w-2/5' : 'w-3/5'" />
                  <Skeleton shape="text" class="h-3 w-1/4" />
                </div>
              </li>
            </ul>
            <div class="flex flex-col gap-3">
              <Skeleton class="h-24 w-full" />
              <Skeleton shape="text" />
              <Skeleton shape="text" class="w-4/5" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="gallery-icon" class="rounded-lg border border-line bg-surface-1 p-6">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="gallery-icon" class="text-base font-semibold">Icon</h2>
          <span class="font-mono text-[11px] uppercase tracking-widest text-fg-muted">md 18 px (default) · sm 15 px (dense rows)</span>
        </div>
        <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 p-0">
          <li v-for="name in iconNames" :key="name" class="flex items-center gap-3 rounded-md border border-line px-3 py-2">
            <Icon :name="name" />
            <Icon :name="name" size="sm" class="text-fg-muted" />
            <span class="min-w-0 truncate font-mono text-[11px] text-fg-muted">{{ name }}</span>
          </li>
        </ul>
      </section>
    </main>
    <Toaster :label="noticeSamples[lang].notifications" :dismiss-label="noticeSamples[lang].dismiss" />
  </div>
</template>
