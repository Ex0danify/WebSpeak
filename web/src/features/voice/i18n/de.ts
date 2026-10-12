export const de: Record<string, string> = {
  voiceNeedsHttps: "Für Sprachfunktionen ist eine sichere HTTPS-Verbindung erforderlich",
  microphoneUnsupported: "Dieser Browser unterstützt keinen Mikrofonzugriff",
  webAudioUnsupported: "Dieser Browser unterstützt keine Web-Audio-Verarbeitung",
  audioNoticeWebrtcFallback:
    "Echtzeitstimme über WebRTC ist nicht verfügbar (Fehlercode: {{code}}). Der Kompatibilitätstransport ist aktiv; Latenz und Audioqualität können schlechter sein",
  audioNoticePlaybackBlocked:
    "Der Browser hat die automatische Audiowiedergabe blockiert. Klicke auf die Seite oder erlaube die Audiowiedergabe für diese Website",
  audioNoticeDeviceList: "Audiogeräte konnten nicht aufgelistet werden. Die Standardgeräte des Browsers werden verwendet",
  audioNoticeContextSuspended:
    "Die Audioverarbeitung des Browsers ist pausiert. Klicke einmal auf die Seite, um Mikrofon und Lautsprecher fortzusetzen",
  audioNoticeEncoder:
    "Mikrofon-Audio konnte nicht kodiert werden (Fehlercode: {{code}}). Andere Mitglieder hören dich möglicherweise nicht",
  audioDecodingUnsupported: "Audiodekodierung ist nicht verfügbar. Verwende die neueste Version von Chrome oder Edge",
  micFailedPermission: "Mikrofonzugriff fehlgeschlagen: Der Browser hat die Mikrofonberechtigung nicht erteilt",
  micFailedBlocked: "Mikrofonzugriff fehlgeschlagen: Der Browser hat den Mikrofonzugriff blockiert",
  micFailedNotFound: "Mikrofonzugriff fehlgeschlagen: Es wurde kein verwendbares Mikrofon gefunden",
  micFailedUnavailable: "Mikrofonzugriff fehlgeschlagen: Das ausgewählte Mikrofon ist nicht verfügbar",
  micFailedBusy: "Mikrofonzugriff fehlgeschlagen: Das Mikrofon wird möglicherweise von einem anderen Programm verwendet",
  micFailedAborted: "Mikrofonzugriff fehlgeschlagen: Der Start des Mikrofons wurde unterbrochen, versuche es erneut",
  micFailedParameters: "Mikrofonzugriff fehlgeschlagen: Das System hat die Mikrofonparameter abgelehnt",
  micFailedGeneric: "Mikrofonzugriff fehlgeschlagen: Das Mikrofon ist nicht verfügbar, prüfe die Browserberechtigungen und die Audiogeräte",
  micFailedCheckPermissions: "Mikrofonzugriff fehlgeschlagen: Prüfe die Browserberechtigungen",
  micSwitchFailed: "Mikrofonzugriff fehlgeschlagen: Das Mikrofon konnte nicht gewechselt werden",
  speakerSelectionUnsupported:
    "Die Auswahl des Ausgabegeräts wird von diesem Browser nicht unterstützt. Das Standard-Ausgabegerät wird verwendet",
  speakerUnavailable: "Der ausgewählte Lautsprecher ist nicht verfügbar",
  speakerSwitchFailed: "Der Lautsprecher konnte nicht gewechselt werden",
  audioNoticeLink:
    "Fehler in der Audioverbindung (Fehlercode: {{code}}). Dein Mikrofon-Audio erreicht andere Mitglieder möglicherweise nicht",
  audioNoticeLinkDetail:
    "Fehler in der Audioverbindung (Fehlercode: {{code}}): {{detail}}. Dein Mikrofon-Audio erreicht andere Mitglieder möglicherweise nicht",
};
