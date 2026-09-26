# my-ombra — Arbeitsanweisungen

**Beim Fortsetzen zuerst `ARBEITSSTAND.md` lesen.** Dort stehen Branch,
Commit, erledigte Arbeit, ausgeführte Prüfungen und der nächste Schritt.

Danach gezielt die Dateien und Abhängigkeiten öffnen, die der konkrete
Auftrag berührt — nicht das ganze Repository durchlesen und nicht bereits
Erledigtes rekonstruieren.

Drei eigenständige Teile ohne gemeinsames Build und ohne gemeinsame
Abhängigkeiten: **Ombra** (`index.html` in der Wurzel), **Trägerlotse**
(`traegerlotse/`), **VisuClean** (`visuclean/`).

## Verbindliche Arbeitsregeln

- **Rot vor grün.** Ein Test, der nie rot war, belegt keine Reparatur.
  Jede neue Wache gegen ihren eigenen Rückbau prüfen.
- **Alte Testergebnisse gelten nicht für geänderten Code.** Nach einer
  Änderung die betroffenen Prüfungen erneut ausführen.
- **Automatisch geprüfte Funktion, echter Gerätelauf und reale
  Erkennungsleistung immer getrennt benennen.** Aus synthetischen Bildern
  oder simulierten Kameras keine Erfolgsrate ableiten.
- **Unbekanntes ausdrücklich als unbekannt markieren**, nicht erfinden.
- `ARBEITSSTAND.md` nach jedem abgeschlossenen Arbeitspaket und vor jeder
  Übergabe aktualisieren.
- Antworten knapp halten: Ergebnis, Prüfungen, offene Punkte.

## Ombra (Wurzel)

Web-App, die per Rückkamera den Weg vor gehenden Smartphone-Nutzern
überwacht und bei Gefahren (Fahrzeuge, Hindernisse, rote Ampel, Stufen)
per Ton und Vibration warnt. Die Bildanalyse läuft über die Claude API.

- Statische Single-File-Web-App: die **gesamte** Anwendung (HTML, CSS, JS)
  liegt in `index.html` (~680 Zeilen). Kein Build, kein Framework, kein
  `package.json`. Vanilla JS im `<script>`-Block ab Zeile ~274.
- Ablauf: `startCamera` → Schleife alle ~3,5 s (`startLoop` / `doAnalysis`)
  → `captureFrame` (Canvas → JPEG/Base64) → `callClaude` → `applyResult`
  setzt das Warnlevel und löst `playAlert` und `navigator.vibrate` aus.
  Warnstufen `frei` / `achtung` / `stopp` (Objekt `LV`); das Modell
  antwortet als kompaktes JSON `{level, object, direction, distance}`.
- `callClaude` (ab Zeile ~468) ruft `https://api.anthropic.com/v1/messages`
  mit `claude-haiku-4-5-20251001` (Vision) direkt aus dem Browser auf,
  inklusive Header `anthropic-dangerous-direct-browser-access`. Der
  API-Key liegt in `localStorage` (`ombra_key`) — clientseitig, nicht
  serverseitig geschützt. Bewusst so für die persönliche Nutzung, vor
  breiterer Veröffentlichung zu bedenken.
- Styling über CSS-Variablen im `:root`-Block, kein Framework.
- Modell oder Prompt ändern: Vision-Aufruf mit kleinem `max_tokens`-Budget,
  reines JSON ohne Markdown; `JSON.parse` fällt bei Fehlern auf
  `level:"frei"` zurück.
- `vercel.json` setzt `Permissions-Policy: camera=*, microphone=*` —
  nötig, damit die Kamera im Deployment freigegeben ist.

## Trägerlotse

QR-Code scannen → die App zeigt Aussparung und Einlegereihenfolge auf dem
Waschgutträger. Alle Träger und Instrumente in `config.js` sind **fiktiv**;
keine Firmendaten. Einzelheiten in `traegerlotse/README.md`.

## VisuClean

Browser-/PWA-Demonstrator, React + Vite, eigener Abhängigkeitsbaum unter
`visuclean/`. **Die fachlichen Leitplanken stehen vollständig in
`visuclean/CLAUDE.md` und gelten unverändert** — dort und nicht hier
nachlesen (Worst-Result-Wins, Signatur- und Speicherregeln, Prüffläche,
Tiefenmessung, Demonstrator-Grenzen).

Kein validiertes GMP-Produktivsystem. Die regulatorische Arbeit liegt beim
Abnehmer der App; Schwerpunkt der Entwicklung sind Kamera und Erkennung.

## Befehle

Ombra und Trägerlotse brauchen einen sicheren Kontext (HTTPS oder
`localhost`), sonst verweigert der Browser `getUserMedia`.

```bash
# Ombra — kein Build, kein Test, kein Linter
python3 -m http.server 8000          # dann http://localhost:8000

# Traegerlotse — kein Installationsschritt
cd traegerlotse && npm start         # node server.js

# VisuClean — in visuclean/
npm ci
npm run verify                       # Artefakte + Lint + Tests + Build
npm test                             # alle Suiten + Zaehlkontrolle
npm run build && npm run test:bedienlauf    # echter Browser, 31 Pruefungen
npm run build && npm run test:kameralauf    # echter Browser, 13 Pruefungen
```

Die beiden Browserläufe sind **nicht** Teil von `verify` und brauchen
Chromium und Playwright (im Paket bewusst nicht enthalten). In dieser
Umgebung liegt Chromium unter `/opt/pw-browsers`; `playwright-core` ist
separat zu installieren und über `PLAYWRIGHT_PFAD` zu übergeben.

Projektlokale Skills unter `.claude/skills/ecc/`: frontend-patterns,
accessibility, coding-standards, error-handling.
