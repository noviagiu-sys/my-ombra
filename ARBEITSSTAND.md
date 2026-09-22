# Arbeitsstand

**Stand:** 22.09.2026. Gearbeitet wurde ausschließlich an **VisuClean**.
Über Ombra und Trägerlotse sagt dieser Arbeitsstand nichts.

**Achtung, zwei Repositories.** Der maßgebliche VisuClean-Code liegt
**nicht** hier, sondern in `noviagiu-sys/Desktopvisuclean-standalone`.
Dort hängt auch die Vorschau-URL des Auftraggebers. `my-ombra/visuclean/`
ist die Arbeitskopie eines älteren Stands — **dort nicht weiterentwickeln.**

| | |
|---|---|
| Code, maßgeblich | `Desktopvisuclean-standalone`, Branch `claude/session-1ocbg3`, Commit `a8dcf67` |
| Version | `8.3.0-rc.4.45-camera.3`, **an der Nutzer-URL ausgeliefert** |
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

## Kritisches Licht (`a8d0afa`, `208cf1b`)

Gerätetest vom 21.09.: Die Linse wurde **absichtlich verdeckt**, um die
Erkennung schlechter Aufnahmebedingungen zu prüfen. Die Gesamtsperre griff
richtig (`CRITICAL_LIGHT`) — daneben standen aber „Verdacht auf nasse
Oberfläche" (45) und „Rückstandsverdacht, 80,8 % warme Pixel" (100) als
Teilebefunde. Die Sperre hing nur am Gesamtergebnis.

Repariert: Unter der kritischen Lichtschwelle trägt kein automatischer
Prüfpunkt mehr eine Aussage (`NOT_ASSESSABLE_CRITICAL_LIGHT`). Der Text
fordert zur Handlung auf, ohne eine Ursache zu behaupten — gemessen wird
Helligkeit, ein verdecktes Objektiv ist davon nicht von einem dunklen Raum
zu unterscheiden. Kandidaten werden gekennzeichnet statt gelöscht. Die
Lichtpositionen heißen „Aufgenommen" statt „Bestanden". `lightLevel()`
steht einmalig in `capturePaths.js`.

`208cf1b` behob zwei Folgefehler: Die PDF-Zusammenfassung las weiter den
Rohbefund („Sauber: FAIL", wo der Bildschirm „nicht bewertbar" zeigte) —
sie liest jetzt `kriteriumKurz`. Und der Dunkelhinweis hing an
`aggregate.lm`, einem Wert über alle Fotos; er hängt jetzt am einzelnen
Foto und steht zusätzlich im Protokoll.

## Ausgeführte Prüfungen — und wofür sie gelten

Alle Zahlen unten wurden **am Stand `208cf1b`** gemessen:

| Prüfung | Ergebnis |
|---|---|
| `npm ci` | 0 gemeldete Schwachstellen |
| `npm run verify` | Exit 0 |
| `manifest:check` nach Build | 133 Dateien reproduzierbar |
| `npm test` | 706 Prüfungen in 29 Suiten (7 Kalibrierungsfälle getrennt) |
| `npm run test:bedienlauf` | 31/31 im echten Chromium |
| `npm run test:kameralauf` | 13/13 im echten Chromium, Kamera simuliert |

**Der ausgelieferte Stand `a8dcf67` liegt drei Commits weiter** (PDF-Fix
`59eb545`, Release camera.2, Rückbau des Bildtipp-Auslösers samt Release
camera.3). Diese drei sind **nicht von dieser Sitzung geprüft** — die
Zahlen oben gelten nicht für sie.

**Grundsätzlich nicht geprüft:** reale iPhone-Kamera, Aufnahmequalität,
Zoom- und Lichtunterstützung am Gerät, reale Erkennungsleistung. Ob
einzelne Kandidaten aus zu dunklen Bildern Rauschen sind, ist offen —
deshalb werden sie gekennzeichnet, nicht gelöscht.

## Offen

- **Gerätetest der Lichtreparatur:** dunkle Aufnahme wiederholen und
  prüfen, ob Trocken und Sauber „nicht bewertbar" zeigen; helles und
  dunkles Foto zusammen, Warnung richtig zugeordnet; PDF gegen
  Ergebnisansicht.
- **Sauberkeit möglicherweise lichtabhängig.** Am 21.09. fiel „Sauber" in
  beiden brauchbaren Vorgängen auf jedem Foto durch (Index 100). Die App
  nennt die Alternative selbst: warme Lichtfarbe statt Kontamination.
  Nächster Schritt dazu: dieselbe unveränderte Edelstahlstelle unter
  verschiedenen Lichtbedingungen aufnehmen.
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

Gerätetest der Lichtreparatur an camera.3, danach die Lichtabhängigkeit
des Sauberkeitsbefunds messen.

## Ausführliche Berichte

- `CHANGELOG.md` im Code-Repo — Versionsgeschichte und Befunde im Detail.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- PR `noviagiu-sys/my-ombra#3` — Integration des Kamerapakets.
