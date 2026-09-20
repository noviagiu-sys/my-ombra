import { BEFUND_KORREKTUR, befundErlaeuterung, befundText } from "./verdictWording.js";

const DE = {
  appSubtitle: "Visuelle Reinigungskontrolle",
  demonstrator: "Browser-Demonstrator · nicht validiertes GMP-Produktivsystem",
  username: "Benutzername", password: "Passwort", login: "Anmelden", loggingIn: "Anmeldung läuft…",
  loginError: "Ungültige Anmeldedaten. Bitte prüfen.", requiredLogin: "Bitte Benutzername und Passwort eingeben.",
  showPassword: "Passwort anzeigen", hidePassword: "Passwort verbergen", demoAccess: "Demo-Zugänge", demoAccessWarning: "Nur für den Demonstrator. Keine geschützte Anmeldung: die Personentrennung muss organisatorisch getragen werden.",
  homeTitle: "Sichtbar sauber.", homeText: "Deterministische On-Device-Analyse", newInspection: "Neue Prüfung",
  reference: "Referenzvergleich", lightCheck: "Lichtprüfung", swab: "Swab-Hilfe", history: "Prüfprotokoll",
  settings: "Einstellungen", logout: "Abmelden", close: "Schliessen", back: "Zurück", home: "Start",
  selectEquipment: "Equipment wählen", searchEquipment: "Equipment suchen", scanner: "QR / Barcode scannen",
  manualCode: "Equipment-Code manuell eingeben", useCode: "Code prüfen", unknownCode: "Equipment-Code nicht erkannt.",
  cameraStart: "Kamera starten", cameraStop: "Kamera stoppen", takePhoto: "Aufnehmen", uploadPhotos: "Fotos auswählen",
  swabAttached: "Wischtest ist dem Prüfdatensatz beigefügt.",
  selectZone: "Prüfzone wählen", photos: "Fotos", photo: "Foto", maxPhotos: "Maximal 10 Fotos je Prüfung.",
  addPhoto: "Weitere Aufnahme", removePhoto: "Foto entfernen", analyze: "Analyse starten", analyzing: "Analysiere",
  markerMode: "Marker", markerOn: "Marker aktiv", resetZoom: "Zoom zurücksetzen", zoomIn: "Vergrössern", zoomOut: "Verkleinern",
  markerHint: "Tippe auf eine verdächtige Stelle. Maximal 5 Marker je Foto.", noPhotos: "Mindestens ein Foto ist erforderlich.",
  result: "Ergebnis", overall: "Gesamtergebnis", dry: "Trocken", clean: "Sauber", intact: "Intakt",
  checkpoints: "Prüfpunkte", checkpointsHint: "Jeder Prüfpunkt wird einzeln bewertet. Ein nicht bewertbarer Punkt ergibt kein PASS.",
  statusPass: "Bestanden", statusFail: "Nicht bestanden", statusNotAssessable: "Nicht bewertbar",
  nextActions: "Nächste Handlung", measurement: "Messwerte",
  notAssessableBanner: "Nicht bewertbar – die Aufnahme trägt für mindestens einen Pflicht-Prüfpunkt keine belastbare Aussage.",
  commentNotAssessable: "Ein nicht bewertbarer Prüfpunkt muss dokumentiert werden: Ersatzprüfung oder neue Aufnahme.",
  passed: "Freigegeben", failed: "Gesperrt", warning: "Warnung", criticalLight: "Kritische Beleuchtung: PASS ist technisch blockiert.",
  comment: "Kommentar", optional: "optional", required: "Pflicht", commentFail: "Bei einem FAIL muss die eingeleitete Massnahme dokumentiert werden.",
  releaseSign: "Freigeben & unterschreiben", failSign: "Gesperrt bestätigen & unterschreiben", override: "Override: Freigeben",
  overrideTitle: "KI-Ergebnis überstimmen", overrideWarning: "Du überstimmst ein FAIL. Begründe die Freigabe und bestätige die Verantwortung.",
  overrideConfirm: "Ich habe die Oberfläche visuell geprüft und verantworte die Freigabe.", continueSignature: "Weiter zur Signatur",
  signature: "Digitale Signatur", signaturePurpose: "Bedeutung", signatureHint: "Mindestens 20 Pixel Pfadlänge zeichnen.",
  reauth: "Passwort zur Bestätigung", clear: "Neu", signSave: "Bestätigen & speichern", invalidSignature: "Signatur und Passwort sind noch nicht gültig.",
  saved: "Prüfung wurde verschlüsselt gespeichert.", saveError: "Speicherung fehlgeschlagen", auditOk: "Audit-Kette geprüft", auditBroken: "Audit-Kette beschädigt – Speicherung gesperrt",
  filter: "Filtern", all: "Alle", noRecords: "Noch keine Prüfungen gespeichert.", exportPdf: "PDF erzeugen", exportJson: "Datenexport JSON",
  collectionPdf: "Sammelprotokoll PDF", trend: "Verschleiss-Trend", trendHint: "Equipment wählen, um den Verlauf der Intakt-Schwere zu sehen.",
  knownIssue: "Bekannte Auffälligkeit", createKnownIssue: "Kosmetischen Kratzer als Known Issue bewerten", knownIssueBlocked: "Dieser Befund ist nicht tolerierbar.",
  reason: "Begründung", issueType: "Art der Auffälligkeit", since: "Bekannt seit", validity: "Gültigkeit", months: "Monate",
  hairlineScratch: "Oberflächlicher Haarkratzer", minorWear: "Minimale kosmetische Abnutzung", qaSignature: "QA-Toleranzfreigabe",
  active: "Aktiv", closed: "Geschlossen", extend: "Verlängern", closeIssue: "Known Issue schliessen", issueActionReason: "Grund der Aktion",
  language: "Sprache", german: "Deutsch", english: "Englisch", offlineReady: "Offline bereit", offlinePending: "Offline-Cache wird vorbereitet",
  storage: "Lokaler Speicher", selfTest: "Analyse-Selbsttest", ready: "Bereit", notReady: "Nicht bereit",
  checking: "Integrität wird geprüft…",
  scannerNative: "Nativer Barcode-Scanner", scannerFallback: "Gebündelter QR-Fallback", manualFallback: "Manuelle Eingabe bleibt verfügbar.",
  printLabels: "QR-Etiketten drucken",
  stopScan: "Scanner schliessen", scanHint: "Code ruhig in den Rahmen halten.", cameraUnavailable: "Kamera nicht verfügbar. Bitte Foto oder Code manuell eingeben.",
  fusionNonPlanar: "Diese Zone ist nicht eben. Die Mehrwinkelauswertung entfaellt hier, weil die Entzerrung ueber das QR-Etikett eine gemeinsame Ebene voraussetzt. Die Einzelaufnahmen werden vollstaendig bewertet.",
  performedByLabel: "Geprueft durch",
  approvedByLabel: "Genehmigt durch",
  pendingQa: "Freigabe ausstehend",
  saveForQa: "Erfassen und an QA uebergeben",
  saveForQaHint: "Speichert die Pruefung ohne Ergebnis. Eine andere Person mit Rolle QA Manager gibt sie spaeter im Verlauf frei.",
  releaseNow: "Durch QA freigeben",
  blockNow: "Durch QA sperren",
  qaReason: "Begruendung der QA",
  qaReasonRequired: "Eine Sperrung erfordert eine Begruendung.",
  pendingQaHint: "Diese Pruefung wartet auf die Freigabe. Sie kann nur von einer anderen Person mit Rolle QA Manager erteilt werden.",
  profileStatus: "Aufnahmeprofil",
  profileNoClaim: "Keine gemessene Mindestaufloesung — dokumentiert, nicht freigegeben. Keine Genauigkeitsaussage.",
  profileScale: "Verkleinerung auf",
  kiAssignTitle: "Known-Issue-Zuordnung erforderlich",
  kiAssignPending: "Eine bekannte Auffälligkeit wurde automatisch erkannt und der Prüfpunkt auf bestanden gesetzt. Ohne ausdrückliche QA-Zuordnung ist diese Prüfung nicht speicherbar.",
  kiAssignReason: "Begründung der Zuordnung",
  kiAssignConfirm: "Zuordnung bestätigen",
  kiAssignQaOnly: "Nur ein QA Manager kann diese Zuordnung eintragen. Ohne sie wird das Speichern abgewiesen.",
  actionTitle: "Massnahme dokumentieren",
  actionHint: "Abwischen und Neuaufnahme sind keine Qualitätsabweichung. Nachreinigen und das Entfernen sichtbaren Rückstands setzen dauerhaft den QA-Vorbehalt.",
  actionKind: "Handlungsart",
  actionReason: "Begründung",
  actionAdd: "Massnahme festhalten",
  actionDeviation: "Qualitätsabweichung – Freigabe nur durch QA Manager",
  actionNoDeviation: "keine Qualitätsabweichung",
  action_WIPED_AND_DRIED: "Abgewischt und getrocknet",
  action_RECAPTURED: "Neu fotografiert",
  action_RECLEANED: "Nachgereinigt",
  action_RESIDUE_REMOVED: "Sichtbaren Rückstand entfernt",
  qaApproval: "QA-Genehmigung",
  qaApprovalHint: "Die Freigabe nach einer Qualitätsabweichung verlangt einen QA Manager, der die Prüfung nicht selbst durchgeführt hat. Bitte mit eigenen Zugangsdaten anmelden.",
  qaApprovalPerformedBy: "Geprüft von",
  qaApprovalUnknown: "Unbekannte Zugangsdaten. Benutzerkennung und Passwort pruefen.",
  /* ── P3 · geführter Aufnahmeablauf ────────────────────────────────────
     Die Anleitungstexte nennen KEINE Winkel und keine Abstände. Eine Zahl
     wie „20 bis 30 Grad" wäre ein erfundener Stellwert — sie stünde in
     der Anleitung, als wäre sie gemessen. Beschrieben wird, was der
     Prüfer tun soll; die tatsächlichen Bedingungen erfasst das
     Aufnahmeprofil. */
  sequenzTitel: "Geführte Aufnahme",
  sequenzStarten: "Geführte Aufnahme starten",
  sequenzZoneWechsel: "Die geführte Aufnahme gehört zu einer anderen Prüfzone. Bitte die Aufnahme für diese Zone neu beginnen.",
  sequenzAbbrechen: "Geführte Aufnahme verlassen",
  sequenzSchritt: "Schritt",
  sequenzVon: "von",
  sequenzOffen: "Diese Lichtposition fehlt noch.",
  sequenzFertig: "Alle drei Lichtpositionen sind aufgenommen.",
  sequenzHinweis: "Drei Aufnahmen derselben Prüffläche. Die vollständige Sequenz "
    + "ist die Voraussetzung dafür, dass der Feuchtepunkt algorithmisch beurteilt "
    + "werden darf — sie ist kein Nachweis, dass die Beurteilung zutrifft.",
  sequenzSchritt_NORMAL: "Normale Beleuchtung: Aufnahme wie gewohnt, Licht von vorn.",
  sequenzSchritt_STREIFLICHT_LINKS: "Streiflicht von links: Lichtquelle flach von "
    + "links halten, möglichst parallel zur Fläche.",
  sequenzSchritt_STREIFLICHT_RECHTS: "Streiflicht von rechts: Lichtquelle flach von "
    + "rechts halten, möglichst parallel zur Fläche.",
  licht_NORMAL: "Normale Beleuchtung",
  licht_STREIFLICHT_LINKS: "Streiflicht links",
  licht_STREIFLICHT_RECHTS: "Streiflicht rechts",
  licht_UNBEKANNT: "Lichtposition nicht erfasst",
  sequenzAnleitung: "Anleitungsfassung",
  screeningCandidates: "Kratzer-Screening: Verdachtsstellen",
  screeningNoDepth: "Hinweisliste, sortiert nach Auffaelligkeit. Keine Tiefenangabe, "
    + "keine Aussage ueber Harmlosigkeit oder Entstehungszeit \u2014 beides ist aus "
    + "einem normalen Foto nicht messbar. Die verbindliche Bewertung erfolgt durch "
    + "Sichtpruefung, bei Bedarf durch kalibrierte Messung.",
  screeningCount: "Kandidaten",
  screeningSuppressed: "wegen Richtung niedriger bewertet",
  screeningGrind: "Schliffrichtung",
  /* Zwei verschiedene Dinge, zwei Spalten. Bis rc.4.30 stand in "Rang"
     der Platz der GERICHTETEN Rangfolge, waehrend die Zeilen nach der
     ungerichteten sortiert waren — zwei Ordnungen in einer Spalte. */
  screeningPosition: "Position",
  screeningKandidat: "Kandidat",
  screeningRank: "Rang gerichtet",
  screeningRankHint: "Position ist der Platz in der aktuellen Sortierung und wird "
    + "bei jedem Wechsel neu vergeben. \u201eRang gerichtet\u201c ist der gespeicherte "
    + "Platz in der Rangfolge MIT Richtungsabwertung. Die Kandidaten-Kennung bleibt "
    + "immer dieselbe.",
  screeningWaehlen: "Im Bild zeigen",
  screeningMarkierung: "Verdachtsstelle im Bild",
  screeningMarkierungHinweis: "Kasten und Kennung stammen aus dem gespeicherten "
    + "Screening. Sie zeigen, WO gemessen wurde — keine Tiefe und keine Bewertung.",
  screeningOhneMasse: "Bildmasse des Screenings nicht gespeichert — die Kandidaten "
    + "sind in diesem Datensatz nicht im Bild verortbar.",
  screeningAusgewaehlt: "ausgewaehlt",
  screeningEntlangSchliff: "in Schliffrichtung",
  /* Tiefe gegen die Vorgabegrenze. Der Operator steht im Text:
     "< 1,0 µm" und "≤ 1,0 µm" sind nicht dasselbe, und der Unterschied
     entscheidet bei genau 1,000. */
  depthHeading: "Tiefe gegen Grenzwert",
  depthLimitLine: "Zulässige Kratz-/Riefentiefe < 1,0 µm.",
  depthNotMeasured: "Tiefe nicht gemessen",
  depthNotMeasuredHint: "Aus der Aufnahme folgt keine Tiefenangabe. Ein Pixel "
    + "deckt bei üblichem Prüfabstand rund 50 µm ab; die Grenze liegt bei "
    + "1,0 µm. Eine Aussage zur Tiefe braucht ein geeignetes Messmittel.",
  depthIncomplete: "Tiefenangabe unvollständig",
  depthIncompleteHint: "Es fehlen Pflichtangaben der Messung. Ohne Messwert, "
    + "Einheit, Messmittel, Messunsicherheit, Zeitpunkt und ausführende "
    + "Person gibt es keine Entscheidung.",
  depthWithin: "Unter der Tiefengrenze",
  depthWithinHint: "Betrifft ausschließlich das Tiefenkriterium. Keine "
    + "Freigabe des Befundes und kein Gesamturteil.",
  depthExceeded: "Tiefengrenze überschritten",
  depthBoundary: "Grenzfall — keine automatische Entscheidung",
  depthBoundaryHint: "Das Messunsicherheitsintervall überschneidet 1,0 µm. "
    + "Der wahre Wert kann auf beiden Seiten der Grenze liegen.",
  depthCheckRecommended: "Manuelle Tiefenkontrolle empfohlen",
  depthCheckRecommendedHint: "Der Hinweis stammt aus dem Bildkontrast. Er ist "
    + "ein Aufmerksamkeitswert, keine Tiefenangabe — und er kann die "
    + "Tiefengrenze weder einhalten noch verletzen.",
  depthValueLabel: "Messwert",
  depthUncertaintyLabel: "Messunsicherheit",
  depthMethodLabel: "Messmittel",
  depthMeasuredAtLabel: "Zeitpunkt",
  depthMeasuredByLabel: "Ausführende Person",
  depthIntervalLabel: "Intervall",
  depthRawLabel: "Eingabe im Original",
  missedHeading: "Manuell markierte Stellen",
  missedHint: "Stellen, die der Prüfer selbst markiert hat. Sie gelten als "
    + "vom Algorithmus NICHT erkannt — auch dann, wenn auf dieser Aufnahme "
    + "kein einziger Kandidat gefunden wurde. Eine Tiefenmessung hier wird "
    + "als übersehener Befund geführt.",
  missedBadge: "vom Algorithmus nicht erkannt",
  /* Schadensverdacht: der Weg OHNE Detektortreffer und OHNE Messung. */
  rohbefund: "Rohbefund",
  verdachtMelden: "Als Schadensverdacht melden",
  verdachtHeading: "Schadensverdacht",
  verdachtHint: "Eine gesehene Stelle, die der Detektor nicht gemeldet hat. "
    + "Sie braucht keinen Treffer und keine Tiefenangabe — nur die Angabe, "
    + "was zu sehen ist. Der Verdacht bleibt offen, bis er dokumentiert "
    + "beurteilt wurde; bis dahin ist keine Freigabe möglich.",
  verdachtBegruendung: "Was ist zu sehen?",
  verdachtSpeichern: "Verdacht melden",
  verdachtOffen: "offen — Beurteilung fehlt",
  verdachtGeklaert: "beurteilt",
  verdachtKlaerungHeading: "Schadensverdacht beurteilen",
  verdachtKlaerungErgebnis: "Ergebnis der Beurteilung",
  verdachtKlaerungBegruendung: "Begründung",
  verdachtKlaerungSpeichern: "Beurteilung festhalten",
  verdachtErgebnis_SCHADEN_BESTAETIGT: "Schaden bestätigt",
  verdachtErgebnis_KEIN_SCHADEN: "Kein Schaden",
  verdachtErgebnis_WEITERE_PRUEFUNG_NOETIG: "Weitere Prüfung nötig",
  verdachtSperre: "Freigabe gesperrt: gemeldeter Schadensverdacht ohne "
    + "dokumentierte Beurteilung.",
  kandidatenMehr: "Weitere Kandidaten laden",
  kandidatenAlle: "alle geladen",
  kandidatenVonGesamt: "von",
  depthUnitLabel: "Einheit",
  depthSourceLabel: "Herkunft der Angabe",
  depthSourceIndependent: "Unabhängige Messung",
  depthSourceModel: "Modellschätzung (entscheidet nicht)",
  depthEntryHeading: "Tiefenmessung eintragen",
  depthEntryBoundTo: "Gebunden an Kandidat",
  depthEntrySubmit: "Messung übernehmen",
  depthEntryIncomplete: "Erst vollständig: Messwert, Einheit, Messmittel, "
    + "Messunsicherheit, Zeitpunkt und ausführende Person.",
  /* Laenge und Breite sind dimensionslose Verhaeltnisse, keine Laengen.
     Sie standen bis rc.4.26 als "23,6 %" in der Tabelle — das liest sich
     wie ein Messwert. Dieselbe Regel wie bei der Richtungsstaerke: der
     Rohwert steht da, und die Bezugsgroesse steht daneben. */
  screeningLength: "Relative Länge",
  screeningWidth: "Relative Breite",
  screeningRelHint: "Bezogen auf die kurze Kante des analysierten Bildes. "
    + "Keine physikalische Länge oder Tiefe.",
  /* Fehlend ist nicht Null. Ein nicht gemessener Wert darf nicht als
     gemessene Null erscheinen — das waere eine Behauptung. */
  screeningNotAvailable: "nicht verfügbar",
  /* Drei unterscheidbare Zustaende. KEINER davon heisst "keine Kratzer":
     das Screening ist eine Aufmerksamkeitshilfe, kein Nachweis der
     Abwesenheit. */
  screeningRunning: "Berechnung läuft",
  screeningUnavailable: "Screening nicht verfügbar",
  screeningNotStored: "Screening-Daten nicht gespeichert",
  screeningNoCandidates: "Keine Kandidaten gefunden",
  screeningNoProof: "Das ist kein Nachweis, dass keine Kratzer vorhanden sind.",
  screeningNotRecomputed: "Für diese Prüfung wurde kein Screening gespeichert. "
    + "Eine nachträgliche Berechnung wäre kein Originalbefund und wird deshalb "
    + "nicht angezeigt.",
  screeningAngle: "Winkel zum Schliff",
  screeningEdge: "Kantenstaerke",
  screeningScore: "Relevanz",
  screeningScorePlain: "Relevanz ohne Richtungsabwertung",
  screeningStrength: "Richtungsstaerke",
  screeningBins: "Winkelfaecher",
  /* Bewusst KEINE Prozentangabe und keine Einordnung wie "schwach
     bestimmt": 0,141 ist ein Rohwert, keine Sicherheit von 14,1 Prozent.
     Auch eine sprachliche Einordnung wuerde eine Kalibrierung behaupten,
     die es nicht gibt. */
  screeningUncalibrated: "Zuverlaessigkeit nicht kalibriert",
  screeningSortBy: "Sortierung",
  screeningSortDirected: "mit Richtungsabwertung",
  screeningSortPlain: "ohne Richtungsabwertung",
  screeningConfig: "Konfiguration",
  releaseImpossible: "Eine Freigabe ist fuer diesen Datensatz nicht moeglich.",
  releaseImpossible_NOT_ASSESSABLE_REQUIRED:
    "Ein Pflichtpunkt konnte nicht bewertet werden; was niemand beurteilen "
    + "konnte, laesst sich auch nicht ueberstimmen. Moeglich ist nur die Sperrung.",
  releaseImpossible_OPEN_CHECKPOINT:
    "Ein Pflichtpunkt ist offen. Moeglich ist nur die Sperrung.",
  releaseImpossible_OPEN_MANUAL_FINDING:
    "Eine gemeldete Stelle ist noch nicht beurteilt. Ein Verdacht ist kein "
    + "Befund, den sich ueberstimmen liesse — beurteilen Sie ihn zuerst; "
    + "die Sperrung bleibt jederzeit moeglich.",
  releaseImpossible_CONFIRMED_DAMAGE:
    "Ein gemeldeter Schaden wurde bestaetigt. Daraus folgt keine Freigabe; "
    + "moeglich sind die Sperrung und der Rueckweg zum Operator.",
  supersededHint:
    "Zu dieser Revision liegt bereits eine spaetere Fassung vor. Entschieden "
    + "wird an der neuesten Fassung, nicht hier.",
  klaerungSignatur: "Beurteilung unterschreiben",
  qaApprovalAwaitLogin: "Nach der Anmeldung erscheint das Signaturfeld.",
  signatureComponentsHint: "Die elektronische Signatur besteht aus zwei Identifikationskomponenten: Ihrer Benutzerkennung und Ihrem persönlichen Passwort. Eine gezeichnete Unterschrift ist nicht erforderlich.",
  signatureComponentUser: "Benutzerkennung",
  signatureComponentPassword: "Passwort",
  signatureComponentPasswordHint: "persönlich, nicht weitergeben",
  fusionNoDetector: "Kein Kratzer-Detektor eingehaengt. Die Fusionskarten stehen zur Verfuegung; eine Bewertung nach Persistenz ist ohne Detektor nicht moeglich.",
  fusionPoseSpread: "Die Aufnahmen zeigen keine ausreichende Winkelvielfalt. Die Mehrwinkelauswertung ist fuer diese Serie nicht aussagekraeftig.",
  fusionExcluded: "Aus der Fusion ausgeschlossen",
  markers: "Markierte Stellen", findingIndex: "Befundstärke-Index (algorithmisch, keine Messgrösse)", unremarkable: "Unauffällig", finding: "Auffällig", printReport: "Prüfbericht",
  /* Anzeigeebenen des Befund-Overlays. Sie beschreiben, WAS gerechnet und
     WAS davon gezeichnet wurde — sie sind kein zweites Urteil. */
  layers: "Anzeigeebenen",
  layersNote: "Der Kern rechnet mehrere Masken, das Urteil je Kriterium trägt nur eine davon. Zuschaltbare Ebenen sind Zusatzhinweise: sie ändern kein Urteil, erzeugen kein FAIL und gelten nicht als bestätigter Schmutz. Pixelzahlen sind kein Verschmutzungsgrad und keine Stoffmenge.",
  layerShown: "eingeblendet", layerHidden: "ausgeblendet",
  layerAdvisory: "Zusatzhinweis, kein Urteil",
  layerVerdictBearing: "trägt das Urteil dieses Kriteriums",
  layerNotDetected: "nicht erkannt", layerOrigin: "Herkunft",
  layersStoredNote: "Festgehalten zum Zeitpunkt der Unterschrift. Nur die urteilstragende Ebene ist in das Overlay-Bild gezeichnet; weitere berechnete Masken stehen hier, sind aber nicht eingezeichnet. Zusatzhinweise ändern kein Urteil und erzeugen kein FAIL. Nichts davon wird nachgerechnet.",
  swabLegacy: "Wischtest im Altformat — damaliger Summenvergleich",
  /* Prüffläche: der Bereich, der tatsächlich untersucht wird. */
  inspectionArea: "Prüffläche",
  areaHint: "Lege fest, welcher Bereich untersucht werden soll. Nur dieser Ausschnitt wird berechnet — Pixel ausserhalb gehen in keine Rechnung ein, auch nicht in die Farbkorrektur. Das Ergebnis gilt dann für diesen Ausschnitt, nicht automatisch für das ganze Teil.",
  areaDefaultWarning: "Dies ist die Voreinstellung. Sie wurde noch nicht angepasst und wird im Bericht als Voreinstellung ausgewiesen.",
  areaLeft: "Links", areaTop: "Oben", areaWidth: "Breite", areaHeight: "Höhe",
  areaReset: "Auf Voreinstellung setzen",
  areaWholeImage: "Ausdrücklich das ganze Bild",
  areaTooSmall: "Die Prüffläche ist zu klein für eine Auswertung. Bitte vergrössern.",
  screeningNoCrop: "Kandidaten können nicht eingezeichnet werden: das Bild des bewerteten Ausschnitts liegt nicht vor. Ein Kasten auf dem vollständigen Foto würde auf die falsche Stelle zeigen.",
  markerOutsideArea: "Marker ausserhalb der Prüffläche",
  markerOutsideAreaHint: "an dieser Stelle wurde nichts bewertet — keine Messung möglich, und sie zählt nicht als übersehener Befund",
};

const EN = {
  appSubtitle: "Visual cleaning inspection",
  demonstrator: "Browser demonstrator · not a validated GMP production system",
  username: "Username", password: "Password", login: "Sign in", loggingIn: "Signing in…",
  loginError: "Invalid credentials. Please check.", requiredLogin: "Enter username and password.",
  showPassword: "Show password", hidePassword: "Hide password", demoAccess: "Demo access", demoAccessWarning: "Demonstrator only. Not a protected login: separation of persons must be ensured organisationally.",
  homeTitle: "Visibly clean.", homeText: "Deterministic on-device analysis", newInspection: "New inspection",
  reference: "Reference comparison", lightCheck: "Light check", swab: "Swab aid", history: "Inspection log",
  settings: "Settings", logout: "Sign out", close: "Close", back: "Back", home: "Home",
  selectEquipment: "Select equipment", searchEquipment: "Search equipment", scanner: "Scan QR / barcode",
  manualCode: "Enter equipment code manually", useCode: "Check code", unknownCode: "Equipment code not recognised.",
  cameraStart: "Start camera", cameraStop: "Stop camera", takePhoto: "Capture", uploadPhotos: "Select photos",
  swabAttached: "Swab test is attached to the inspection record.",
  selectZone: "Select inspection zone", photos: "Photos", photo: "Photo", maxPhotos: "Maximum 10 photos per inspection.",
  addPhoto: "Add capture", removePhoto: "Remove photo", analyze: "Start analysis", analyzing: "Analysing",
  markerMode: "Marker", markerOn: "Marker active", resetZoom: "Reset zoom", zoomIn: "Zoom in", zoomOut: "Zoom out",
  markerHint: "Tap a suspicious location. Maximum 5 markers per photo.", noPhotos: "At least one photo is required.",
  result: "Result", overall: "Overall result", dry: "Dry", clean: "Clean", intact: "Intact",
  passed: "Released", failed: "Blocked", warning: "Warning", criticalLight: "Critical lighting: PASS is technically blocked.",
  checkpoints: "Checkpoints", checkpointsHint: "Every checkpoint is assessed on its own. A checkpoint that is not assessable yields no PASS.",
  statusPass: "Passed", statusFail: "Failed", statusNotAssessable: "Not assessable",
  nextActions: "Next action", measurement: "Measurements",
  notAssessableBanner: "Not assessable - for at least one required checkpoint this image carries no reliable statement.",
  commentNotAssessable: "A checkpoint that is not assessable must be documented: substitute inspection or a new image.",
  comment: "Comment", optional: "optional", required: "required", commentFail: "For a FAIL, document the action that was initiated.",
  releaseSign: "Release & sign", failSign: "Confirm blocked & sign", override: "Override: release",
  overrideTitle: "Override analysis result", overrideWarning: "You are overriding a FAIL. Justify the release and confirm responsibility.",
  overrideConfirm: "I visually inspected the surface and accept responsibility for release.", continueSignature: "Continue to signature",
  signature: "Digital signature", signaturePurpose: "Meaning", signatureHint: "Draw a path of at least 20 pixels.",
  reauth: "Password confirmation", clear: "Clear", signSave: "Confirm & save", invalidSignature: "Signature and password are not yet valid.",
  saved: "Inspection stored in encrypted form.", saveError: "Save failed", auditOk: "Audit chain verified", auditBroken: "Audit chain damaged – saving blocked",
  filter: "Filter", all: "All", noRecords: "No inspections stored yet.", exportPdf: "Create PDF", exportJson: "JSON data export",
  collectionPdf: "Collection report PDF", trend: "Wear trend", trendHint: "Select equipment to view the intact-severity trend.",
  knownIssue: "Known issue", createKnownIssue: "Assess cosmetic scratch as known issue", knownIssueBlocked: "This finding cannot be tolerated.",
  reason: "Justification", issueType: "Finding type", since: "Known since", validity: "Validity", months: "months",
  hairlineScratch: "Superficial hairline scratch", minorWear: "Minor cosmetic wear", qaSignature: "QA tolerance approval",
  active: "Active", closed: "Closed", extend: "Extend", closeIssue: "Close known issue", issueActionReason: "Reason for action",
  language: "Language", german: "German", english: "English", offlineReady: "Offline ready", offlinePending: "Preparing offline cache",
  storage: "Local storage", selfTest: "Analysis self-test", ready: "Ready", notReady: "Not ready",
  checking: "Checking integrity…",
  scannerNative: "Native barcode scanner", scannerFallback: "Bundled QR fallback", manualFallback: "Manual entry remains available.",
  printLabels: "Print QR labels",
  stopScan: "Close scanner", scanHint: "Hold the code steady inside the frame.", cameraUnavailable: "Camera unavailable. Upload a photo or enter the code manually.",
  fusionNonPlanar: "This zone is not planar. Multi-angle evaluation does not apply here, because rectification via the QR label assumes a common plane. The individual captures are assessed in full.",
  performedByLabel: "Inspected by",
  approvedByLabel: "Approved by",
  pendingQa: "Awaiting release",
  saveForQa: "Record and hand over to QA",
  saveForQaHint: "Saves the inspection without a result. Another person with the QA Manager role releases it later from the history.",
  releaseNow: "Release as QA",
  blockNow: "Block as QA",
  qaReason: "QA reason",
  qaReasonRequired: "Blocking requires a reason.",
  pendingQaHint: "This inspection is awaiting release. Only another person with the QA Manager role can grant it.",
  profileStatus: "Capture profile",
  profileNoClaim: "No measured minimum resolution - documented, not released. No accuracy claim.",
  profileScale: "Downscaled to",
  kiAssignTitle: "Known-issue assignment required",
  kiAssignPending: "A known finding was detected automatically and the checkpoint was set to pass. Without an explicit QA assignment this inspection cannot be saved.",
  kiAssignReason: "Reason for the assignment",
  kiAssignConfirm: "Confirm assignment",
  kiAssignQaOnly: "Only a QA Manager can record this assignment. Without it, saving is refused.",
  actionTitle: "Document action",
  actionHint: "Wiping and recapturing are not quality deviations. Re-cleaning and removing visible residue permanently set the QA hold.",
  actionKind: "Type of action",
  actionReason: "Reason",
  actionAdd: "Record action",
  actionDeviation: "Quality deviation - release only by a QA Manager",
  actionNoDeviation: "no quality deviation",
  action_WIPED_AND_DRIED: "Wiped and dried",
  action_RECAPTURED: "Recaptured",
  action_RECLEANED: "Re-cleaned",
  action_RESIDUE_REMOVED: "Visible residue removed",
  qaApproval: "QA approval",
  qaApprovalHint: "Release after a quality deviation requires a QA Manager who did not perform the inspection. Please sign in with your own credentials.",
  qaApprovalPerformedBy: "Inspected by",
  qaApprovalUnknown: "Unknown credentials. Check user ID and password.",
  sequenzTitel: "Guided capture",
  sequenzStarten: "Start guided capture",
  sequenzZoneWechsel: "This guided capture belongs to a different inspection zone. Please restart the capture for this zone.",
  sequenzAbbrechen: "Leave guided capture",
  sequenzSchritt: "Step",
  sequenzVon: "of",
  sequenzOffen: "This light position is still missing.",
  sequenzFertig: "All three light positions have been captured.",
  sequenzHinweis: "Three captures of the same inspection area. A complete sequence "
    + "is the precondition for assessing the moisture checkpoint algorithmically — "
    + "it is not evidence that the assessment is correct.",
  sequenzSchritt_NORMAL: "Normal lighting: capture as usual, light from the front.",
  sequenzSchritt_STREIFLICHT_LINKS: "Grazing light from the left: hold the light "
    + "source flat from the left, as parallel to the surface as possible.",
  sequenzSchritt_STREIFLICHT_RECHTS: "Grazing light from the right: hold the light "
    + "source flat from the right, as parallel to the surface as possible.",
  licht_NORMAL: "Normal lighting",
  licht_STREIFLICHT_LINKS: "Grazing light left",
  licht_STREIFLICHT_RECHTS: "Grazing light right",
  licht_UNBEKANNT: "Light position not recorded",
  sequenzAnleitung: "Instruction version",
  screeningCandidates: "Scratch screening: suspect areas",
  screeningNoDepth: "Attention list, sorted by conspicuousness. No depth figure and "
    + "no statement about harmlessness or age \u2014 neither is measurable from an "
    + "ordinary photograph. The binding assessment is made by visual inspection, "
    + "if required by calibrated measurement.",
  screeningCount: "candidates",
  screeningSuppressed: "scored lower because of direction",
  screeningGrind: "grinding direction",
  screeningPosition: "position",
  screeningKandidat: "candidate",
  screeningRank: "directed rank",
  screeningRankHint: "Position is the place in the current sorting and is "
    + "reassigned on every switch. \u201cDirected rank\u201d is the stored place in "
    + "the ranking WITH the directional discount. The candidate key never changes.",
  screeningWaehlen: "Show in image",
  screeningMarkierung: "Suspect area in the image",
  screeningMarkierungHinweis: "Box and key come from the stored screening. They show "
    + "WHERE it was measured — no depth and no assessment.",
  screeningOhneMasse: "Screening image size not stored — the candidates cannot be "
    + "located in the image for this record.",
  screeningAusgewaehlt: "selected",
  screeningEntlangSchliff: "along grinding direction",
  depthHeading: "Depth against limit",
  depthLimitLine: "Permissible scratch/groove depth "
    + "< 1.0 µm.",
  depthNotMeasured: "depth not measured",
  depthNotMeasuredHint: "No depth follows from the image. At a usual "
    + "inspection distance one pixel covers about 50 µm; the limit is "
    + "1.0 µm. A statement about depth needs a suitable instrument.",
  depthIncomplete: "depth entry incomplete",
  depthIncompleteHint: "Mandatory measurement fields are missing. Without "
    + "value, unit, instrument, uncertainty, time and person there is no "
    + "decision.",
  depthWithin: "below the depth limit",
  depthWithinHint: "Concerns the depth criterion only. Not a release of the "
    + "finding and not an overall verdict.",
  depthExceeded: "depth limit exceeded",
  depthBoundary: "boundary case - no automatic decision",
  depthBoundaryHint: "The measurement uncertainty interval overlaps 1.0 "
    + "µm. The true value may lie on either side of the limit.",
  depthCheckRecommended: "manual depth check recommended",
  depthCheckRecommendedHint: "The hint comes from image contrast. It is an "
    + "attention value, not a depth - and it can neither meet nor violate "
    + "the depth limit.",
  depthValueLabel: "measured value",
  depthUncertaintyLabel: "uncertainty",
  depthMethodLabel: "instrument",
  depthMeasuredAtLabel: "time",
  depthMeasuredByLabel: "performed by",
  depthIntervalLabel: "interval",
  depthRawLabel: "original entry",
  missedHeading: "Manually marked spots",
  missedHint: "Spots the inspector marked. They count as NOT detected by "
    + "the algorithm - even when no candidate at all was found on this "
    + "capture. A depth measurement here is recorded as a missed finding.",
  missedBadge: "not detected by the algorithm",
  rohbefund: "Raw finding",
  verdachtMelden: "Report as suspected damage",
  verdachtHeading: "Suspected damage",
  verdachtHint: "A spot the inspector saw and the detector did not report. "
    + "It needs no detection and no depth value - only a statement of what "
    + "is visible. The suspicion stays open until it has been assessed on "
    + "record; until then no release is possible.",
  verdachtBegruendung: "What is visible?",
  verdachtSpeichern: "Report suspicion",
  verdachtOffen: "open - assessment missing",
  verdachtGeklaert: "assessed",
  verdachtKlaerungHeading: "Assess suspected damage",
  verdachtKlaerungErgebnis: "Outcome of the assessment",
  verdachtKlaerungBegruendung: "Reason",
  verdachtKlaerungSpeichern: "Record assessment",
  verdachtErgebnis_SCHADEN_BESTAETIGT: "Damage confirmed",
  verdachtErgebnis_KEIN_SCHADEN: "No damage",
  verdachtErgebnis_WEITERE_PRUEFUNG_NOETIG: "Further inspection needed",
  verdachtSperre: "Release blocked: suspected damage reported without a "
    + "documented assessment.",
  kandidatenMehr: "Load more candidates",
  kandidatenAlle: "all loaded",
  kandidatenVonGesamt: "of",
  depthUnitLabel: "unit",
  depthSourceLabel: "origin of the entry",
  depthSourceIndependent: "Independent measurement",
  depthSourceModel: "Model estimate (does not decide)",
  depthEntryHeading: "Record depth measurement",
  depthEntryBoundTo: "Bound to candidate",
  depthEntrySubmit: "Accept measurement",
  depthEntryIncomplete: "Complete first: value, unit, instrument, "
    + "uncertainty, time and person.",
  screeningLength: "relative length",
  screeningWidth: "relative width",
  screeningRelHint: "Relative to the short edge of the analysed image. "
    + "Not a physical length or depth.",
  screeningNotAvailable: "not available",
  screeningRunning: "calculation running",
  screeningUnavailable: "screening not available",
  screeningNotStored: "screening data not stored",
  screeningNoCandidates: "No candidates found",
  screeningNoProof: "This is not evidence that no scratches are present.",
  screeningNotRecomputed: "No screening was stored for this inspection. A "
    + "subsequent calculation would not be an original finding and is therefore "
    + "not shown.",
  screeningAngle: "angle to grinding",
  screeningEdge: "edge strength",
  screeningScore: "relevance",
  screeningScorePlain: "relevance without directional discount",
  screeningStrength: "directional strength",
  screeningBins: "angular bins",
  screeningUncalibrated: "reliability not calibrated",
  screeningSortBy: "sorting",
  screeningSortDirected: "with directional discount",
  screeningSortPlain: "without directional discount",
  screeningConfig: "configuration",
  releaseImpossible: "This record cannot be released.",
  releaseImpossible_NOT_ASSESSABLE_REQUIRED:
    "A mandatory checkpoint could not be assessed; what nobody could judge "
    + "cannot be overridden either. Only blocking is available.",
  releaseImpossible_OPEN_CHECKPOINT:
    "A mandatory checkpoint is open. Only blocking is available.",
  releaseImpossible_OPEN_MANUAL_FINDING:
    "A reported location has not been assessed yet. A suspicion is not a "
    + "finding that could be overridden - assess it first; blocking remains "
    + "available at any time.",
  releaseImpossible_CONFIRMED_DAMAGE:
    "A reported damage has been confirmed. That does not amount to a release; "
    + "blocking and returning to the operator remain available.",
  supersededHint:
    "A later revision of this record already exists. The decision is made on "
    + "the latest revision, not here.",
  klaerungSignatur: "Sign assessment",
  qaApprovalAwaitLogin: "The signature field appears after signing in.",
  signatureComponentsHint: "The electronic signature consists of two identification components: your user ID and your personal password. A drawn signature is not required.",
  signatureComponentUser: "User ID",
  signatureComponentPassword: "Password",
  signatureComponentPasswordHint: "personal, do not share",
  fusionNoDetector: "No scratch detector is wired. Fusion maps are available; persistence scoring requires a detector.",
  fusionPoseSpread: "The captures do not show sufficient angular diversity. Multi-angle evaluation is not meaningful for this series.",
  fusionExcluded: "Excluded from fusion",
  markers: "Marked locations", findingIndex: "Finding index (algorithmic, not a measurement)", unremarkable: "Unremarkable", finding: "Finding", printReport: "Inspection report",
  layers: "Display layers",
  layersNote: "The core computes several masks; only one of them carries each criterion's verdict. Optional layers are advisory: they change no verdict, raise no FAIL and do not count as confirmed soiling. Pixel counts are not a degree of soiling and not an amount of substance.",
  layerShown: "displayed", layerHidden: "hidden",
  layerAdvisory: "advisory, not a verdict",
  layerVerdictBearing: "carries this criterion's verdict",
  layerNotDetected: "not detected", layerOrigin: "Origin",
  layersStoredNote: "Recorded at the time of signature. Only the verdict-bearing layer is drawn into the overlay image; further computed masks are listed here but not drawn. Advisory layers change no verdict and raise no FAIL. None of this is recomputed.",
  swabLegacy: "Swab test in legacy format — sum comparison of the time",
  inspectionArea: "Inspection area",
  areaHint: "Define which region is to be examined. Only this crop is computed — pixels outside it enter no computation, not even the colour correction. The result then applies to this crop, not automatically to the whole part.",
  areaDefaultWarning: "This is the default. It has not been adjusted and is reported as a default.",
  areaLeft: "Left", areaTop: "Top", areaWidth: "Width", areaHeight: "Height",
  areaReset: "Reset to default",
  areaWholeImage: "Explicitly the whole image",
  areaTooSmall: "The inspection area is too small to be evaluated. Please enlarge it.",
  screeningNoCrop: "Candidates cannot be drawn: the image of the assessed crop is not available. A box on the full photo would point at the wrong place.",
  markerOutsideArea: "Marker outside the inspection area",
  markerOutsideAreaHint: "nothing was assessed at this location — no measurement possible, and it does not count as a missed finding",
};

export function translator(language = "de") {
  const dictionary = language === "en" ? EN : DE;
  return (key, variables = {}) => {
    let value = dictionary[key] || DE[key] || key;
    for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  };
}

const EN_VERDICTS = {
  SPECULAR_REFLECTION: ["Overexposure / specular reflection", "Change the capture angle and repeat the image."],
  MOISTURE_SUSPECT: ["Moisture suspected", "Dry the surface and inspect again."],
  DARK_WET_SUSPECT: ["Wet surface suspected", "Visually verify the drying state."],
  ORGANIC_RESIDUE: ["Warm colour deviation - suspected residue", "Repeat cleaning and assess product residue."],
  LOCAL_RESIDUE: ["Local residue detected", "Repeat cleaning and inspect marked areas."],
  BRIGHT_RESIDUE: ["Bright neutral residue detected", "Repeat cleaning; swab recommended."],
  DARK_RESIDUE: ["Dark neutral deposit detected", "Repeat cleaning; swab recommended."],
  COLOR_VARIATION: ["Patchy colour variation detected", "Repeat cleaning and compare a reference."],
  DARK_SURFACE: ["Deposit suspected", "Visually recheck the cleaning state."],
  SCRATCH_SUSPECT: ["Scratch / groove suspected", "Inspect the surface; QA known-issue review may be possible."],
  GLOBAL_TEXTURE_FAIL: ["Irregular surface detected", "Check for chips, cracks or corrosion."],
  CORROSION_SUSPECT: ["Dark spots / corrosion suspected", "Check for rust, chips or seal damage."],
  KNOWN_ISSUE_TOLERATED: ["Intact – known cosmetic finding accepted by QA", ""],
};

/* Die Ehrlichkeitskorrektur liegt in src/verdictWording.js — gemeinsam
   mit assessment.js, damit Pruefpunkt und Ergebnisanzeige denselben
   Befund nicht verschieden benennen koennen. A24 haelt sie zusammen. */

export function verdictDisplay(verdict, criterion, language = "de") {
  if (language !== "en") {
    if (!BEFUND_KORREKTUR[verdict?.code]) return verdict;
    return {
      ...verdict,
      message: befundText(verdict.code, verdict.message, "de"),
      detail: befundErlaeuterung(verdict.code, verdict.detail, "de"),
    };
  }
  if (verdict.code === "PASS") {
    const labels = { dry: "Dry ✓", clean: "Clean ✓", intact: "Intact ✓" };
    return { ...verdict, message: labels[criterion], detail: "No relevant visual finding." };
  }
  const [message, action] = EN_VERDICTS[verdict.code] || [verdict.code || "Finding", "Manual review required."];
  /* Auch im Englischen aus derselben Quelle. EN_VERDICTS trug bis rc.4.27
     eine eigene Kopie des korrigierten Satzes — zwei Kopien laufen
     frueher oder spaeter auseinander, und dann sagt die App in zwei
     Sprachen zwei verschiedene Dinge ueber denselben Befund. Die
     Handlungsempfehlung daneben bleibt sprachspezifisch. */
  return {
    ...verdict, message: befundText(verdict.code, message, "en"),
    detail: `Algorithmic finding index (not a measurement): ${verdict.severity || 0}`, action,
  };
}
