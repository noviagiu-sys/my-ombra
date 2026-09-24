# Arbeitsstand

**Stand:** 24.09.2026, abends. Gearbeitet wurde ausschließlich an **VisuClean**.
Über Ombra und Trägerlotse sagt dieser Arbeitsstand nichts.

**Achtung, zwei Repositories.** Der maßgebliche VisuClean-Code liegt
**nicht** hier, sondern in `noviagiu-sys/Desktopvisuclean-standalone`.
Dort hängt auch die Vorschau-URL des Auftraggebers. `my-ombra/visuclean/`
ist die Arbeitskopie eines älteren Stands — **dort nicht weiterentwickeln.**

| | |
|---|---|
| Code, ausgeliefert | `Desktopvisuclean-standalone`, Branch `claude/session-1ocbg3`, Commit `a8dcf67` |
| Version | `8.3.0-rc.4.45-camera.3`, **an der Nutzer-URL ausgeliefert** |
| Code, neu | Branch `claude/erkennung-licht-tropfen`, Commit `339850c` — **nicht zusammengeführt, nicht ausgeliefert** |
| Doku, dieses Repo | `my-ombra`, Branch `claude/visuclean-fortsetzung-uaf0xf` |

Kette: `ebf3a8b` (Claude) → `f5956f3`, `40f70e7` (Codex) → `a8d0afa`,
`208cf1b` (Claude) → `59eb545`, `d63d289`, `a8dcf67` (Codex).

## Erledigt

1. **rc.4.45 importiert** (`349a32b`), unverändert aus dem Übergabepaket.
2. **Zwei Restfehler der Gegenprüfung** (`9b5891f`): unvollständige
   Prüfpunktliste ergab „Intakt: PASS" (jetzt FAIL-Vorrang, sonst NICHT
   BEWERTBAR); eine vertagte QA-Beurteilung ließ sich nicht abschließen
   (jetzt fortsetzbar, `klaerungsverlauf` append-only).
3. **Kamerapaket integriert** (`ebf3a8b`), dazu `werkbank/kameralauf.mjs` —
   13 Prüfungen des Aufnahmewegs im echten Chromium bei 390×844.
4. **Doku-Übergabe** (`3c70f5f`, `7a67e63`): diese Datei, Wurzel-CLAUDE.md,
   `AGENTS.md` für Codex.
5. **Kritisches Licht** (`a8d0afa`) und zwei Restfehler daraus (`208cf1b`).
6. **Licht, Reflexe, Tropfen** (`339850c`) — Abschnitt unten.

## Kritisches Licht (`a8d0afa`, `208cf1b`)

Gerätetest 21.09.: Die Linse wurde **absichtlich verdeckt**. Die
Gesamtsperre griff richtig (`CRITICAL_LIGHT`), daneben standen aber
Teilebefunde — die Sperre hing nur am Gesamtergebnis. Repariert: Unter
der kritischen Lichtschwelle trägt kein automatischer Prüfpunkt mehr eine
Aussage (`NOT_ASSESSABLE_CRITICAL_LIGHT`). Der Text fordert zur Handlung
auf, ohne eine Ursache zu behaupten — gemessen wird Helligkeit, ein
verdecktes Objektiv ist davon nicht von einem dunklen Raum zu
unterscheiden. Kandidaten werden gekennzeichnet statt gelöscht, die
Lichtpositionen heißen „Aufgenommen" statt „Bestanden", `lightLevel()`
steht einmalig in `capturePaths.js`. `208cf1b` zog die PDF-Zusammenfassung
auf `kriteriumKurz` nach und hängte den Dunkelhinweis ans einzelne Foto
statt an den Mittelwert über alle Fotos.

## Ausgeführte Prüfungen — und wofür sie gelten

Alle Zahlen wurden **am Stand `208cf1b`** gemessen: `npm ci` ohne
gemeldete Schwachstelle, `npm run verify` Exit 0, `manifest:check` 133
Dateien reproduzierbar, `npm test` 706 Prüfungen in 29 Suiten,
`test:bedienlauf` 31/31 und `test:kameralauf` 13/13 im echten Chromium
mit simulierter Kamera.

**Der ausgelieferte Stand `a8dcf67` liegt drei Commits weiter** (PDF-Fix
`59eb545`, Release camera.2, Rückbau des Bildtipp-Auslösers samt Release
camera.3). Diese drei sind **nicht von dieser Sitzung geprüft** — die
Zahlen oben gelten nicht für sie.

**Grundsätzlich nicht geprüft:** reale iPhone-Kamera, Aufnahmequalität,
Zoom- und Lichtunterstützung am Gerät, reale Erkennungsleistung.

## Licht, Reflexe, Tropfen (`339850c`, freigegeben 24.09.)

Auftrag nach dem Gerätetest vom 22.09.: Reflexe wurden zu Schmutz,
eindeutige Tropfen wurden nicht erkannt. Freigabe des Auftraggebers mit
vier Vorgaben (Überbelichtetes nicht als sauber, hell ≠ unbrauchbar,
gesamte Schmutzbewertung prüfen, eigene Tropfenreparatur).

- **Farbton statt Farbmenge** über der Bezugshelligkeit 0,40, darunter
  die alte Grenze 0,08. Grauwelt-Stärke bleibt 0,5 (ein voller
  Weißabgleich rechnet voll bedeckten Belag auf PASS).
- **Glanzbereich** — der eigentliche Schmutzweg des Reflexes war nicht die
  Warmregel, sondern „Heller Belag" über die Blockabweichung. Gesättigte
  Zonen und helle Zonen mit erhaltener Schliffstruktur (Licht addiert,
  Belag verdeckt) gehen in keine Schmutzregel ein. Was dort verborgen sein
  könnte, macht Sauber NICHT BEWERTBAR. Überbelichtet → kein „trocken".
- **Tropfen ohne Glanz** (`src/tropfen.js`): Hell-Dunkel-Fleck oder dunkler
  Ring gegen die ortsübliche Streuung, Bildpyramide 1–4, Riefen verworfen.
  Ab 3 Stellen FAIL, 1–2 Stellen NICHT BEWERTBAR, auch mit Sequenz.
- **Anzeige:** Tropfen als türkisfarbene Ringe, Glanzbereich eingeblendet,
  wenn er Sauber unbewertbar macht.

**Geprüft am Stand `339850c`:** `verify` Exit 0, 31 Suiten, 751 Prüfungen
plus 8 Kalibrierungsfälle, Manifest 138 Dateien reproduzierbar,
`test:bedienlauf` 31/31, `test:kameralauf` 13/13, 20 Sabotagen alle
erkannt. App im echten Chromium mit den echten Fixture-Bildern: nass →
„Tropfenmuster erkannt", 42 Stellen; trocken → S PASS wie `a8dcf67`.
Eine Regression (Farbton-Untergrenze 0,25) fand **nur** dieser App-Lauf;
jetzt bewacht durch `reflextest` RL22.

**Nicht geprüft:** iPhone-Kamera und -Laufzeit (Kern im Node-Lauf
12 → 90 ms je Bild), reale Erkennungsrate an Waschgutteilen.
**Offene Kalibrierung** (`kalibrierung.mjs`): KO4 Unschärfe kostet den
Tropfenweg Stellen (19 → 5), KO5 Riefen von 3–5 px sind unter Streiflicht
nicht von kleinsten Tropfen zu trennen, KO6 schwacher warmer Film auf
heller Fläche wird jetzt belichtungsunabhängig mit der Grenze der mittleren
Helligkeit bewertet (bisher je nach Belichtung erkannt oder nicht).

## Offen

- **Gerätetest der Lichtreparatur:** dunkle Aufnahme wiederholen und
  prüfen, ob Trocken und Sauber „nicht bewertbar" zeigen; helles und
  dunkles Foto zusammen, Warnung richtig zugeordnet; PDF gegen
  Ergebnisansicht.
- **Gerätetest von `339850c`** — erst nach Auslieferung möglich, und die
  ist ein eigener Auftrag. Zu prüfen: Tageslicht- und Lampenreflex auf
  sauberem Teil (kein Schmutz), echte Tropfen ohne Glanz (Ringe sichtbar),
  Streiflicht auf verkratztem Teil (keine Tropfen), Laufzeit je Foto.
- **Flächiger Farbstich** bleibt ein FAIL mit Hinweis (RL14): ohne
  neutrale Referenz nicht von flächigem Belag zu trennen. Mein früherer
  Vorschlag, ihn NICHT BEWERTBAR zu machen, ist bewusst **nicht** umgesetzt.
- **Unabhängiger Anker fehlt.** Aus einem einzelnen Bild ohne neutrale
  Referenz sind warme Lichtfarbe und warmer Rückstand nicht trennbar.
  Kandidaten: Graukarte im Bild, oder Referenzaufnahme des sauberen Teils
  unter demselben Licht.
- **Befund G Stufe 0/1** und die gemeinsame Befundschnittstelle; ältere
  Punkte P5 (Feuchte-Vergleichsdetektor) und P6 (Messkampagne).

## Entschiedene Fragen — nicht neu aufrollen

- **Das Claude-Code-Kit bleibt außen vor** (Entscheidung 21.09.). Keine
  Ersetzung der Prüfinfrastruktur, kein zweiter Versionswächter, die
  Nachweismatrix hat geringere Priorität als Kamera und Erkennung.
- **Einen Versions-/Cache-Wächter gibt es bereits:** `versiontest.mjs` V2
  prüft, dass `public/sw.js` (`CACHE = "visuclean-v…"`) dieselbe Version
  trägt wie `APP_VERSION`; er läuft in `verify`. Seine Grenze: Bleiben
  alle Versionsnummern unverändert, erzwingt er allein keinen
  Versionssprung vor einer Veröffentlichung.
- **Anforderungen sind teilweise zugeordnet** in den vorhandenen
  Abnahmedokumenten (`V83_RC4_ACCEPTANCE.md`, `V83_RC3_ACCEPTANCE.md`).
  Eine automatische Zuordnung zu jedem Testlauf wäre eine Zusatzfunktion.
- **Tessera bleibt getrennt.**

## Nächster konkreter Schritt

Entscheidung des Auftraggebers, ob `339850c` an die bestehende URL
ausgeliefert wird. Danach Gerätetest (Liste unter „Offen").

## Ausführliche Berichte

- `CHANGELOG.md` im Code-Repo — Versionsgeschichte und Befunde im Detail.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- PR `noviagiu-sys/my-ombra#3` — Integration des Kamerapakets.
