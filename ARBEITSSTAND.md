# Arbeitsstand

**Stand:** 20.09.2026 · Repository `noviagiu-sys/my-ombra` · Branch
`claude/visuclean-fortsetzung-uaf0xf` · Commit `b5a4a39`

Zuletzt gearbeitet wurde ausschließlich an **VisuClean** (`visuclean/`).
Über Ombra und Trägerlotse sagt dieser Arbeitsstand nichts aus.

## Erledigt

1. **`349a32b`** — VisuClean-Quellstand `8.3.0-rc.4.45` importiert,
   unverändert aus dem Übergabepaket (SHA-256 `cf747175…`). Ohne private
   Belege und Exporte.
2. **`9b5891f`** — zwei Restfehler der unabhängigen Gegenprüfung repariert:
   *Vollständigkeit* (eine unvollständige Prüfpunktliste ergab „Intakt:
   PASS"; jetzt behält FAIL Vorrang, sonst NICHT BEWERTBAR) und
   *fortsetzbare Beurteilung* (eine vertagte Beurteilung ließ sich nicht
   abschließen; jetzt fortsetzbar, die frühere bleibt in
   `klaerungsverlauf` append-only erhalten, eine abgeschlossene bleibt
   unantastbar). Begründungen in den Quellkommentaren und im PR.
3. **`b5a4a39`** — Kamerapaket integriert (17 Dateien, neu u. a.
   `src/cameraCapture.js`, `kameratest.mjs`), Version
   `8.3.0-rc.4.45-camera.1`; als Differenz gegen die mitgelieferte Basis,
   nicht durch Kopieren. Generierte Dateien aus diesem Stand neu erzeugt.
   Neu: `werkbank/kameralauf.mjs`.

## Entscheidungen

- Beide Reparaturen zuerst **rot** gefahren (F11/F14, U31,
  N2–N5/N7/N9/N10); die Gegenproben F12/F13/F15 und N1/N6/N8 blieben grün.
- Der Kameralauf prüft mit Chromiums synthetischer Kamera. Gegenprobe am
  Stand **ohne** Kamerapaket: sofortiger Abbruch bei der ersten Prüfung —
  der Lauf misst also wirklich den neuen Aufnahmeweg.
- Keine neue QA-Grundsatzarbeit: G Stufe 0/1 und die gemeinsame
  Befundschnittstelle sind **nicht** begonnen (Vorgabe des Auftraggebers:
  Schwerpunkt Kamera und Erkennung).

## Ausgeführte Prüfungen

Alle am Stand `b5a4a39`, Version `8.3.0-rc.4.45-camera.1`:

| Prüfung | Ergebnis |
|---|---|
| `npm ci` | 0 gemeldete Schwachstellen |
| `npm run verify` | Exit 0 |
| `manifest:check` nach Build | 129 Dateien reproduzierbar |
| `npm test` | 670 Prüfungen in 28 Suiten (7 Kalibrierungsfälle getrennt) |
| `npm run test:bedienlauf` | 31/31 im echten Chromium |
| `npm run test:kameralauf` | 13/13 im echten Chromium, Kamera simuliert |

**Nicht geprüft:** reale iPhone-Kamera, Aufnahmequalität,
Geräteunterstützung für Zoom und Licht, reale Erkennungsleistung.

## Offen

- **Auslieferung unbestätigt.** Derselbe Arbeitsstand wurde als Commit
  `ebf3a8b` auf `claude/session-1ocbg3` im Repository
  `noviagiu-sys/Desktopvisuclean-standalone` gepusst (dort zusätzlich
  Befund G Stufe 2 mit `maskentest.mjs`; dort 679 Prüfungen in 29 Suiten,
  Manifest 133 Dateien, verify Exit 0, 31/31 und 13/13). Ob die Vercel-
  Branch-Vorschau die neue Version ausliefert, ist **nicht bestätigt**:
  die Netzwerkrichtlinie dieser Umgebung blockiert `vercel.app`. Eine
  Deployment-ID liegt nicht vor.
- **Gerätetest am iPhone steht aus** (Peppe). Kurzanleitung in PR
  `my-ombra#3`.
- **Befund G Stufe 0/1** und die gemeinsame Befundschnittstelle offen;
  in diesem Repository fehlt `maskentest.mjs` ganz. Ebenso offen: P5
  (Feuchte-Vergleichsdetektor), P6 (Messkampagne, drei Lichtpositionen).

## Nächster konkreter Schritt

Rückmeldung abwarten, welche Version unter der Vorschau-URL angezeigt wird
(erwartet `8.3.0-rc.4.45-camera.1`), und den Gerätebefund auswerten. Erst
danach entscheiden, ob am Kameraweg nachgebessert wird.

## Ausführliche Berichte

- PR `noviagiu-sys/my-ombra#3` — vollständige Beschreibung der Integration.
- `visuclean/CLAUDE.md` — fachliche Leitplanken, unverändert gültig.
- `visuclean/CHANGELOG.md`, `visuclean/V83_LIEFERUNG_RC445.md`,
  `visuclean/V83_G_KENNZEICHNUNG.md` — Versionsgeschichte, Lieferbericht,
  Messung zu Befund G.
