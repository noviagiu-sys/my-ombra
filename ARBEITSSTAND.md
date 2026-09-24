# Arbeitsstand

**Stand:** 24.09.2026. Gearbeitet wurde ausschließlich an **VisuClean**.
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

## Gemessen 24.09: woran „Sauber" und „Trocken" wirklich hängen

Werkbank-Messung gegen `computeFeatures` / `buildVerdicts` am Stand
`a8dcf67`, mit **synthetischen** Flächen. Das ist die Antwortkurve des
Algorithmus, **keine** Erkennungsleistung an echten Teilen.

- **Die Belichtung allein kippt „Sauber".** Gleiche Fläche, gleiche
  Lichtfarbe: 54 % Helligkeit → PASS, 70 % → FAIL mit 74,5 % warmen
  Pixeln. `(rn − bn) > 0,08` ist eine absolute Schwelle; der Restfarbstich
  nach der **halben** Grauwelt-Korrektur wächst aber proportional zur
  Helligkeit: `rn − bn = 0,5 · P · (Ar − Ab)`.
- **Ein heller warmer Reflex auf 5 % der Fläche genügt für FAIL**
  (`LOCAL_RESIDUE`), 18 % ergeben `ORGANIC_RESIDUE`. Helle Pixel werden
  berechnet (`maskBright`), aber nie aus der Warmzählung ausgenommen.
- **Der vorhandene Lichthinweis kann das nicht auffangen:** er hängt an
  `warmBlockFrac > 0,8`. Der Gerätedatensatz vom 22.09. hat 169 von 920
  Warmzonen = 18,4 %. Ein örtlicher Reflex löst ihn nie aus.
- **Voller Weißabgleich räumt den Fehlalarm ab und öffnet einen Fehler in
  der Gegenrichtung.** Echter Rückstand bleibt bis 75 % Bedeckung rot, bei
  100 % Bedeckung kippt er auf PASS — genau der Fall „kleines Teil füllt
  das Bild".
- **Tropfen:** 60 Tropfen auf 6 % der Fläche ergeben PASS, solange ihr
  Glanz unter +0,30 Helligkeit bleibt; darüber springen die hellen Pixel
  von 0,0 % auf 5,7 % und das Tor greift. Der Texturweg
  (`gradMean > 0,055` **und** `edgeFrac > 8 %`) erreicht dabei 0,034 und
  1,6 % und trägt nie. Streiflicht erhöht die Chance auf Glanz, schließt
  die Lücke aber nicht: vollständige Sequenz ohne Glanz ergibt wieder
  PASS.
- **Die Befundstärke sagt weniger, als sie aussieht:** `wf · 700`,
  gedeckelt auf 100. Ab 14,3 % warmen Pixeln steht immer 100 — 19 % über
  der FAIL-Schwelle von 12 %.

Messskript `werkbank/lichtfarbe.mjs` ist geschrieben und ausgeführt, aber
**nirgends committet** — es gehört in `Desktopvisuclean-standalone`.

## Offen

- **Gerätetest der Lichtreparatur:** dunkle Aufnahme wiederholen und
  prüfen, ob Trocken und Sauber „nicht bewertbar" zeigen; helles und
  dunkles Foto zusammen, Warnung richtig zugeordnet; PDF gegen
  Ergebnisansicht.
- **Reparatur der Warmpixel-Prüfung** — beauftragt ist sie nicht. Vorschlag
  in dieser Reihenfolge: helle und gesättigte Pixel aus der Warmzählung
  ausnehmen, die Chroma-Schwelle auf die Helligkeit beziehen, und einen
  flächigen Farbstich zu NICHT BEWERTBAR führen statt zu FAIL oder PASS.
  Die Grauwelt-Stärke **nicht** anheben (siehe Messung oben).
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

Die Lichtabhängigkeit ist gemessen (Abschnitt oben). Offen ist die
Entscheidung des Auftraggebers, ob die Warmpixel-Prüfung repariert wird —
ohne Freigabe wird am Erkennungskern nichts geändert.

## Ausführliche Berichte

- `CHANGELOG.md` im Code-Repo — Versionsgeschichte und Befunde im Detail.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- PR `noviagiu-sys/my-ombra#3` — Integration des Kamerapakets.
