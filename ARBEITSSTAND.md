# Arbeitsstand

**Stand:** 21.09.2026. Gearbeitet wurde ausschließlich an **VisuClean**.
Über Ombra und Trägerlotse sagt dieser Arbeitsstand nichts.

**Achtung, zwei Repositories.** Der maßgebliche VisuClean-Code liegt
**nicht** hier, sondern in `noviagiu-sys/Desktopvisuclean-standalone`.
Dort hängt auch die Vorschau-URL des Auftraggebers. `my-ombra/visuclean/`
ist die Arbeitskopie eines älteren Stands (ohne Befund G Stufe 2, ohne die
Codex-Kameraänderungen) — **dort nicht weiterentwickeln.**

| | |
|---|---|
| Code, maßgeblich | `Desktopvisuclean-standalone`, Branch `claude/kritisches-licht`, Commit `208cf1b` |
| Kette dorthin | `ebf3a8b` (Claude) → `f5956f3`, `40f70e7` (Codex) → `a8d0afa`, `208cf1b` (Claude) |
| Doku, dieses Repo | `my-ombra`, Branch `claude/visuclean-fortsetzung-uaf0xf` |
| Version | `8.3.0-rc.4.45-camera.1` (vor Veröffentlichung anheben) |

## Erledigt

1. **rc.4.45 importiert** (`349a32b`), unverändert aus dem Übergabepaket.
2. **Zwei Restfehler der Gegenprüfung** (`9b5891f`): unvollständige
   Prüfpunktliste ergab „Intakt: PASS" (jetzt FAIL-Vorrang, sonst NICHT
   BEWERTBAR); eine vertagte QA-Beurteilung ließ sich nicht abschließen
   (jetzt fortsetzbar, `klaerungsverlauf` append-only).
3. **Kamerapaket integriert** (`b5a4a39` hier, `ebf3a8b` im Code-Repo),
   dazu `werkbank/kameralauf.mjs` — 13 Prüfungen des Aufnahmewegs im
   echten Chromium bei 390×844, Kamera simuliert.
4. **Doku-Übergabe** (`3c70f5f`, `7a67e63`): diese Datei, Wurzel-CLAUDE.md,
   `AGENTS.md` für Codex.
5. **Kritisches Licht** (`a8d0afa`) und die zwei Restfehler daraus
   (`208cf1b`) — siehe unten.

## Zuletzt: kritisches Licht (`a8d0afa`)

Gerätetest vom 21.09.: Die Linse wurde **absichtlich verdeckt**, um die
Erkennung schlechter Aufnahmebedingungen zu prüfen. Die Gesamtsperre griff
richtig (`CRITICAL_LIGHT`) — daneben standen aber „Verdacht auf nasse
Oberfläche" (45) und „Rückstandsverdacht, 80,8 % warme Pixel" (100) als
Teilebefunde. Die Sperre hing nur am Gesamtergebnis, die Prüfpunkte
rechneten unabhängig weiter.

Repariert: Unter der kritischen Lichtschwelle trägt kein automatischer
Prüfpunkt mehr eine Aussage (`NOT_ASSESSABLE_CRITICAL_LIGHT`). Der Text
fordert zur Handlung auf, ohne eine Ursache zu behaupten — gemessen wird
Helligkeit, ein verdecktes Objektiv ist davon nicht von einem dunklen Raum
zu unterscheiden. Kandidaten werden gekennzeichnet statt gelöscht. Die
Lichtpositionen heißen „Aufgenommen" statt „Bestanden" (eigener Schlüssel
DE/EN). `lightLevel()` steht jetzt einmalig in `capturePaths.js`.

**Zwei Restfehler daraus** hat die Gegenprüfung gefunden, beide behoben
(`208cf1b`): Die PDF-Zusammenfassung las weiter den Rohbefund und schrieb
„Sauber: FAIL", wo der Bildschirm „nicht bewertbar" zeigte — sie liest
jetzt `kriteriumKurz`, dieselbe Quelle. Und der Dunkelhinweis hing an
`aggregate.lm`, einem Wert über alle Fotos; er hängt jetzt an der
Helligkeit des einzelnen Fotos. Der Hinweis steht zusätzlich im Protokoll.

Unverändert: Gesamtsperre, gut beleuchtete Aufnahmen, manuelle
Feststellungen, Codex' Kameraänderungen.

Zuerst rot: CL1/CL4/CL5/CL6, U32/U34/U35/U37. Gegenproben CL2/CL3/U33/U36
blieben grün. Sabotageprobe bestanden. Ein eigener Entwurfsfehler ist als
Gegenprobe festgehalten (CL7): ein *fehlender* Helligkeitswert darf nicht
als gemessene Dunkelheit gelten.

## Ausgeführte Prüfungen

Alle am Stand `208cf1b`:

| Prüfung | Ergebnis |
|---|---|
| `npm ci` | 0 gemeldete Schwachstellen |
| `npm run verify` | Exit 0 |
| `manifest:check` nach Build | 133 Dateien reproduzierbar |
| `npm test` | 706 Prüfungen in 29 Suiten (7 Kalibrierungsfälle getrennt) |
| `npm run test:bedienlauf` | 31/31 im echten Chromium |
| `npm run test:kameralauf` | 13/13 im echten Chromium, Kamera simuliert |

**Nicht geprüft:** reale iPhone-Kamera, Aufnahmequalität, Zoom- und
Lichtunterstützung am Gerät, reale Erkennungsleistung. Ob einzelne
Kandidaten aus zu dunklen Bildern Rauschen sind, ist offen — deshalb
werden sie gekennzeichnet, nicht gelöscht.

## Offen

- **Veröffentlichung ist ein eigener Schritt.** `claude/kritisches-licht`
  ist ein Entwicklungsbranch; die Vorschau-URL hängt an
  `claude/session-1ocbg3` (steht auf `ebf3a8b`). Vorher App- und
  Service-Worker-Version anheben, sonst bekommen Geräte den Stand nicht.
  Die Netzwerkrichtlinie dieser Umgebung blockiert `vercel.app`; eine
  Auslieferung lässt sich von hier **nicht** bestätigen.
- **Gerätetest der Reparatur steht aus:** dunkle Aufnahme wiederholen und
  prüfen, ob Trocken und Sauber jetzt „nicht bewertbar" zeigen.
- **Sauberkeit möglicherweise lichtabhängig.** In beiden brauchbaren
  Vorgängen vom 21.09. fiel „Sauber" auf jedem Foto durch (Index 100). Die
  App nennt die Alternative selbst: warme Lichtfarbe statt Kontamination.
  Offen bis zu einer Gegenprobe unter anderem Licht.
- **Befund G Stufe 0/1** und die gemeinsame Befundschnittstelle; ältere
  Punkte P5 (Feuchte-Vergleichsdetektor) und P6 (Messkampagne).

## Nächster konkreter Schritt

`208cf1b` geht in die unabhängige Prüfung durch Codex. Danach erst:
Version anheben, bereitstellen, Gerätetest. Nicht vorher zusammenführen
oder veröffentlichen.

## Ausführliche Berichte

- PR `noviagiu-sys/my-ombra#3` — Integration des Kamerapakets.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- `CHANGELOG.md` im Code-Repo — Versionsgeschichte und Befunde im Detail.
