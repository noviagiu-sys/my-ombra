# Arbeitsstand

**Stand:** 25.09.2026. Gearbeitet wurde ausschließlich an **VisuClean**.
Über Ombra und Trägerlotse sagt dieser Arbeitsstand nichts.

**Achtung, zwei Repositories.** Der maßgebliche VisuClean-Code liegt
**nicht** hier, sondern in `noviagiu-sys/Desktopvisuclean-standalone`.
Dort hängt auch die Vorschau-URL des Auftraggebers. `my-ombra/visuclean/`
ist die Arbeitskopie eines älteren Stands — **dort nicht weiterentwickeln.**

| | |
|---|---|
| Code, ausgeliefert | `Desktopvisuclean-standalone`, Branch `claude/session-1ocbg3`, Commit `a8dcf67` |
| Version | `8.3.0-rc.4.45-camera.3`, **an der Nutzer-URL ausgeliefert** |
| Code, neu | Branch `claude/reflex-getrennt`, Commits `6ee0e7a` + `893fedd` auf `a8dcf67` — Reflexreparatur **ohne** Tropfen, mit Belag-Korrektur. Nicht zusammengeführt, nicht ausgeliefert |
| **Release-Kandidat** | Branch `claude/release-rc4.46`, `b17e155`, Version `8.3.0-rc.4.46` — **vorbereitet, nicht ausgeliefert**. Auslieferung = Fast-Forward `claude/session-1ocbg3` → `b17e155`, nur auf Freigabe |
| Kette | `a8dcf67` → `6ee0e7a` (Reflex ohne Tropfen) → `893fedd` (Belag-Korrektur) → `bd58621` (Werkbank Kratzer) → `3b4e229` (Kratzer: kein PASS ohne Suche) → `b17e155` (Release) |
| Code, verworfen | Branch `claude/erkennung-licht-tropfen`, `339850c` — **nicht ausliefern** (Tropfenteil widerlegt) |
| Doku, dieses Repo | `my-ombra`, Branch `claude/visuclean-fortsetzung-uaf0xf` |

Kette: `ebf3a8b` (Claude) → `f5956f3`, `40f70e7` (Codex) → `a8d0afa`,
`208cf1b` (Claude) → `59eb545`, `d63d289`, `a8dcf67` (Codex).

## Prioritäten des Auftraggebers (25.09.)

1. **Schmutz und tiefe Kratzer/Riefen:** Schmutz zuverlässig erkennen und
   räumlich anzeigen; Reflexe von möglichen Rückständen unterscheiden,
   ohne Beläge auszublenden; relevante Kratzer und Riefen finden und
   präzise markieren.
2. **Feuchtigkeit und Wassertropfen** — danach, darf Priorität 1 nicht
   aufhalten.

Reihenfolge der nächsten Lieferung: erst der Fehler der Schmutz-/
Reflexkorrektur (erledigt, `893fedd`), dann die Kratzererkennung.

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
7. **Reflexreparatur getrennt und korrigiert** (`6ee0e7a`, `893fedd`) —
   Abschnitt direkt hierunter.

## Reflexreparatur ohne Tropfen, Belag-Korrektur (`893fedd`, 25.09.)

Anlass: Codex-Gegenprüfung zu `339850c`. Ein neutraler heller Belag, der
die Schliffstruktur teilweise durchscheinen lässt (`0,7 × Untergrund +
0,3 × Weiß`), galt als Licht → „Sauber". Reproduziert, auch ohne
Tropfenfinder.

- `6ee0e7a`: `339850c` ohne `src/tropfen.js`, ohne DROPLET-Regeln und ohne
  die darauf beruhenden Teständerungen (A7, A17a, I2, I4, KB3, KB5, KB8
  wieder wie camera.3). Zwischenstand, Gegenfall dort rot.
- Breit gemessen (`werkbank/belagmessung.mjs`, Vergleich camera.3): am
  Stand `6ee0e7a` wurden 161 von 225 Rasterfällen, 33/96 neben Glanz und
  49/88 in einem unabhängigen Satz „Sauber", die camera.3 im Belag meldete.
- `893fedd`: LICHT nur, wenn die Struktur um `LICHT_MARGE 0,25` über dem
  liegt, was ein Belag derselben Aufhellung übrig ließe; sonst UNKLAR
  (keine Schmutzregel, zählt verdeckt, wenn es als Oberfläche einen
  hellen Belag ergäbe → Sauber NICHT BEWERTBAR). Unterer Median; Blöcke
  mit eigener Struktur < 0,7 nicht vom Gruppenmedian zu Licht erklärt;
  verdeckt + gesehen zählen gemeinsam (`glanzVerbirgtBefund`).
- Danach: 0/225, 0/96, 0/88. Reines Licht nie FAIL, aber öfter NICHT
  BEWERTBAR (42 → 80 von 192 synthetischen Fällen). Urteile der drei
  echten Referenzbilder unverändert.

**Geprüft am Stand `893fedd`** (Kern-SHA `839a374a…85bc`): `npm run
verify` Exit 0, 30 Suiten, 738 Prüfungen plus 7 Kalibrierungsfälle,
Manifest 138 Dateien reproduzierbar, `test:bedienlauf` 31/31,
`test:kameralauf` 13/13 (Chromium, synthetische Kamera). RL23–RL27 neu,
alle am Stand `6ee0e7a` rot; RL22 verlangt jetzt PASS. 19 Sabotagen
(`werkbank/sabotage_sauberkeit.py`), jede erkannt.

**Nicht geprüft:** echte Beläge (alle synthetisch; ein körniger echter
Film könnte strukturell noch schwerer von Licht zu trennen sein), iPhone.
**Knackpunkt:** Im App-Ausschnitt der echten trockenen Kontrolle gelten
3 Glanzzonen als UNKLAR; PASS bleibt sie nur über die Verteilungsgrenze
0,18. Auf echten Fotos ist mit mehr „nicht bewertbar – Glanzstelle" zu
rechnen.

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

## ⚠ Korrektur 24.09. abends: der Tropfenteil ist NICHT belegt

Der Auftraggeber hat das App-Overlay geprüft: **Die als Tropfen markierten
Stellen in `wet-stainless-close.png` sind Kaffeereste, die für
Schmutzpartikel stehen — keine Tropfen.** Die Fläche ist nass (Film), die
Punkte sind Partikel.

Folgen, ausdrücklich:
- Es gibt **keinen echten Nachweis**, dass `src/tropfen.js` Wassertropfen
  erkennt. Die „echten Positivfälle" TR1–TR3, TR13, KB8 sowie die neuen
  Erwartungen in A7 und I2 beruhen auf Partikeln. Belegt ist nur: der
  Detektor findet kompakte Hell-Dunkel-Flecken — Partikel mit Relief
  eingeschlossen.
- Der Detektor meldet damit **Schmutzpartikel als Tropfenmuster unter
  Trocken** — falsches Kriterium, falsche Handlung (nachtrocknen statt
  nachreinigen).
- TR8 (Partikel sind keine Tropfen) war zu schwach: gefüllte, einfarbige
  Scheiben ohne Relief. Echte Partikel sehen anders aus.
- Die Aussagen „echte Tropfen … erkannt" im CHANGELOG und in der
  Commitnachricht von `339850c` sind falsch.

**Weiter gültig:** die Reflex- und Sauberkeitsreparatur — die echten Bilder
dienten dort nur als Negativfälle, die Mechanismen sind synthetisch und am
App-Ausschnitt der trockenen Kontrolle gemessen.

**Voraussetzung für jeden weiteren Schritt am Tropfenteil:** echte Aufnahmen
mit bekannter Wahrheit — dasselbe saubere Teil trocken, mit Wassertropfen,
mit Partikeln, möglichst unter Normal- und Streiflicht.

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

## Echtes Wasserfoto (Auftraggeber, 24.09.) — Ergebnis

Edelstahlpfanne mit Wasser, braunem Rand, Glanzstelle. Das Foto liegt nur im
Arbeitsordner der Sitzung, in keinem Repository.

- Wasser liegt dort als **flache Lachen mit scharfer Randlinie**, nicht als
  runde Tropfen; die Schliffriefen laufen unter dem Wasser sichtbar weiter.
- App-Ausschnitt, `a8dcf67` und `339850c` gleich: Trocken FAIL, Sauber FAIL
  (lokaler Rückstand = brauner Rand, richtig). Das Trocken-FAIL kommt aber
  fast ganz von der **Lichtbahn** des Schliffs, nicht vom Wasser.
- Ganzes Bild mit Sequenz: `a8dcf67` meldet **trocken, bestanden**;
  `339850c` nicht bewertbar (2 Einzelstellen, keine davon eine Lache).
- Folgerung: Wasser muss über die Randlinie (Meniskus) und die Verzerrung der
  Schliffstruktur erkannt werden. Braucht echte Bildpaare derselben Stelle:
  trocken / mit Wasser / mit Wasser und Sediment.

## Prüfung „Tiefenrekonstruktion photometrisches Stereo" (Fremdskript, 24.09.)

Nicht im Repository. An synthetischen Rillen bekannter Tiefe geprüft
(Mechanik, keine Erkennungsleistung):
- Vorzeichenfehler „Licht von oben" (+y zeigt im Bild nach unten): waagerechte
  Rillen werden zu Graten.
- Diagonale Kratzer fallen immer heraus (achsenparallele Box statt Streckung).
- Gleiche Tiefe ergibt je nach Breite 0,40–0,60, Handy-Gamma −60 %,
  Umgebungslicht −57 %, 8° Lampenfehler −50 %: ein Kalibrierfaktor trägt nicht.
- Reines Schliffbild: 17 Scheinkratzer.
- „r.E." ist die Pixelbreite; bei ~25 µm/px liegt 1 µm unter der eigenen
  Rauschgrenze (Abschätzung). Edelstahl ist nicht lambertsch — nicht geprüft.
- Einordnung: Werkbankkandidat für die Messkampagne, **nie** Tiefenurteil in
  der App (Leitplanke 10).

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

## Kratzer und Riefen — Bestandsaufnahme (25.09., `bd58621`)

- **Stiller PASS (gemessen, `werkbank/kratzmessung.mjs`):** Der Prüfpunkt
  „Kratzer und Riefen" hängt allein an `f.scratches` des Kerns, und der
  sucht nur hinter dem Tor `edgeFrac < 0,06 && tvFlat < 0,035`. Auf der
  echten Kontrolle ist es zu (tvFlat 0,045) → PASS „Keine länglichen
  Strukturen erkannt" für **jeden** eingesetzten Kratzer, auch quer, 60 %
  der Bildkante, Kontrast 0,25. Auf glattem synthetischem Schliff (Tor
  offen) meldet der Kern erst ab Kontrast 0,25.
- Das Screening (`scratchScreening.js`) findet auf dem echten Bild die
  meisten eingesetzten Kratzer nicht (Kantenschwelle am Bildmaximum
  normiert; die Beckenkante dominiert) und trägt ohnehin kein Urteil.
- Das Kontrollbild ist ein **benutztes Becken voller feiner
  Gebrauchskratzer**. KB7/A15/A16 („Kontrolle Gesamt PASS") beruhen beim
  Kratzer auf der nicht durchgeführten Suche.
- Prototyp `werkbank/rillendetektor.mjs` (Rille statt Kante, örtliche
  Streuung je Richtung): findet eingesetzte Kratzer auf der echten
  Kontrolle ab Kontrast 0,10, meldet dort aber 6 Geometrielinien
  (Überlaufschlitz, Rundungen) und kaum die Gebrauchskratzer. Geometrie
  und Kratzer trennen weder Streckung noch Seitenstufe an diesen Bildern.
  181 ms je 480×640 (Node).

## Entscheidungen des Auftraggebers zu Kratzern (25.09.)

1. Stillen PASS sofort schließen: **ja** → umgesetzt in `3b4e229`.
2. **Keine 12-%-Längengrenze** als Relevanzregel. Länge und Kontrast
   dürfen Kandidaten sortieren, aber kurze Stellen nicht als harmlos
   aussortieren (Aufnahmeabstand verändert den Bildanteil).
3. Echte Teilefotos für die Verbesserung nötig, nicht für die Korrektur:
   dieselbe Stelle als Übersicht und Nahaufnahme, Riefe vom Auftraggeber
   markiert, möglichst zwei Lichtwinkel, dazu eine unauffällige
   Vergleichsfläche. Wassertests derzeit nicht.

## Kratzer: kein PASS ohne Suche (`3b4e229`)

Prüfpunkt NICHT BEWERTBAR (`NOT_ASSESSABLE_SCRATCH_NOT_SEARCHED`), wenn
die Kernsuche hinter ihrem Tor nicht lief; gefundener Kratzer bleibt FAIL,
gelaufene Suche ohne Fund PASS; Rohcode unverändert. Fotobetrachter färbt
nach Prüfpunkten. Geänderte Erwartungen A10, A15, A16, KB7, I8, I10, S45
(Anforderung jeweils gleich; dort war der Kratzerpunkt PASS ohne Suche).
`kratzertest` KS1–KS9, 25 Sabotagen gesamt erkannt.

**Bekannt, unverändert seit camera.3:** Im App-Ausschnitt der Kontrolle
ist das Tor offen (tvFlat 0,014); der Kern meldet dort eine Struktur am
Abflussring (Geometrie) → Intakt FAIL. Eingesetzte Linien werden dort
gefunden, verschmelzen aber mit dem Ring zu einem großen Kasten.

**Geprüft am Release `b17e155`:** `npm ci` ohne Schwachstelle, `verify`
Exit 0 (31 Suiten, 747 + 7), Manifest 141 Dateien reproduzierbar,
`test:bedienlauf` 31/31, `test:kameralauf` 13/13. Nicht geprüft: iPhone,
Auslieferung an der URL.

## Nächster konkreter Schritt

1. **Freigabe der Auslieferung** von `b17e155` an die bestehende URL
   (Fast-Forward `claude/session-1ocbg3`). Danach Gerätetest: Glanz auf
   sauberem Teil, Belag, geschliffene Fläche (Kratzer „nicht bewertbar").
2. **Kratzerdetektor an echten Teilen** (`werkbank/rillendetektor.mjs`),
   ohne Längengrenze als Freigaberegel; präzise Markierung statt großer
   Kästen; Geometrie (Ringe, Rundungen) abgrenzen. Wartet auf die Fotos.
3. Tropfen/Feuchte ruhen (Priorität 2).

## Ausführliche Berichte

- `CHANGELOG.md` im Code-Repo — Versionsgeschichte und Befunde im Detail.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- PR `noviagiu-sys/my-ombra#3` — Integration des Kamerapakets.
