# Ombra — Distracted Walking Guard

Web-App, die per Rückkamera den Weg vor gehenden Smartphone-Nutzern überwacht
und bei Gefahren (Fahrzeuge, Hindernisse, rote Ampel, Stufen) per Ton und
Vibration warnt. Die Bildanalyse läuft über die Claude API.

## Stack

- Statische Single-File-Web-App: die **gesamte** Anwendung (HTML, CSS, JS) liegt
  in `index.html` (~680 Zeilen). Kein Build, kein Framework, kein `package.json`.
- Vanilla JavaScript im `<script>`-Block (ab Zeile ~274).
- Deployment über Vercel (`vercel.json`).

## Befehle

Kein Build- oder Test-Schritt. Lokal genügt ein statischer Server, z. B.:

- `python3 -m http.server 8000` und dann `http://localhost:8000` öffnen

Kamera-APIs (`getUserMedia`) brauchen einen sicheren Kontext (HTTPS oder
`localhost`). Es gibt keine Tests, keinen Linter und keinen Formatter.

## Architektur-Hinweise

- Ablauf: `startCamera` (Rückkamera) → Schleife alle ~3,5 s (`startLoop` /
  `doAnalysis`) → `captureFrame` zeichnet das Videobild auf ein Canvas und
  kodiert es als JPEG/Base64 → `callClaude` schickt es an die Claude API →
  `applyResult` setzt das Warnlevel und löst `playAlert` (AudioContext) und
  `navigator.vibrate` aus.
- Warnstufen sind `frei` / `achtung` / `stopp` (Objekt `LV`); das Modell
  antwortet als kompaktes JSON `{level, object, direction, distance}`.
- `callClaude` (ab Zeile ~468) ruft `https://api.anthropic.com/v1/messages`
  mit Modell `claude-haiku-4-5-20251001` (Vision) direkt aus dem Browser auf —
  inklusive Header `anthropic-dangerous-direct-browser-access: true`. Der
  API-Key wird vom Nutzer eingegeben und in `localStorage` (`ombra_key`)
  gehalten. Das heißt: Der Schlüssel liegt clientseitig im Browser und ist
  nicht serverseitig geschützt — bewusst so für die persönliche Nutzung, aber
  vor einer breiteren Veröffentlichung zu bedenken.
- Styling erfolgt über CSS-Variablen im `:root`-Block am Anfang von
  `index.html`, nicht über externe Stylesheets oder ein Framework.
- `vercel.json` setzt `Permissions-Policy: camera=*` — notwendig, damit die
  Kamera im Deployment freigegeben ist.

## Claude-API-Hinweise

Wenn am Modell oder am Prompt in `callClaude` etwas geändert wird: Es handelt
sich um einen Vision-Aufruf (Bild + Text) mit kleinem `max_tokens`-Budget. Der
Prompt verlangt reines JSON ohne Markdown; `applyResult`/`callClaude` parsen die
Antwort mit `JSON.parse` und fallen bei Fehlern auf `level:"frei"` zurück.

## ECC-Skills

Unter `.claude/skills/ecc/` sind projektlokale Skills installiert:
frontend-patterns, accessibility, coding-standards, error-handling.
