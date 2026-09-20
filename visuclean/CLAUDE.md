# VisuClean v8.3 RC3 – Entwicklungsleitplanken

## Kontext

Dieses Repository ist der **Browser-/PWA-Demonstrator v8.3 RC3** der VisuClean-App. Er demonstriert den vollständigen lokalen Bedien- und Dokumentationspfad. Er ist ausdrücklich **kein validiertes GMP-Produktivsystem**. Die Produkt-Zielarchitektur bleibt native iOS/CoreML mit zentraler Identität, qualifizierter Synchronisation und formaler CSV-/GAMP-5-Validierung.

## Nicht verhandelbare Regeln

1. **Lokaler Standardpfad.** Ohne ausdrücklich freigegebene Firmenkonfiguration verlässt kein Bild das Gerät. Keine Telemetrie und kein stiller Netzwerk-Fallback. Eine spätere Firmen-KI benötigt einen getrennten, versionierten und validierten Freigabepfad.
2. **Determinismus.** Gleiches Pixelarray ergibt bit-identische Merkmale, Masken und Urteile.
3. **Worst-Result-Wins.** FAIL schlägt PASS je Kriterium; bei mehreren FAIL gilt die höchste Schwere. Der dunkelste Einzelwert bestimmt das Lichtniveau.
4. **Kritisches Licht kann nie freigegeben werden.** Unter 15 % weder PASS noch Override – auch nicht durch direkten Aufruf der Persistenz.
5. **Keine Speicherung ohne gültige elektronische Signatur.** Zwei Identifikationskomponenten (Benutzerkennung und Passwort) nach 21 CFR Part 11 §11.200, Re-Authentifizierung, passende Bedeutungsangabe, Benutzer und Zeitbindung. Die gezeichnete Unterschrift ist ab 8.3.0-rc.4.3 entfallen — sie war nie eine Kontrolle und ist mit Handschuhen im Reinraum nicht reproduzierbar.
6. **Signierte Prüfungen sind append-only.** Niemals vorhandene Inspection-IDs überschreiben.
7. **Known Issues sind eng begrenzt.** Nur `SCRATCH_SUSPECT` plus lokalisierte `scratch`-Zonen und freigegebener kosmetischer Typ. Trocken, Sauber, Korrosion und globale Texturfehler bleiben immer FAIL.
8. **1:1-Zonenmatching.** Eine gespeicherte Zone darf nur eine aktuelle Zone abdecken. Neu oder gewachsen bleibt FAIL.
9. **Kein Feature ohne Gegenbeweis.** `npm run verify` muss vor Übergabe vollständig grün sein.
9a. **Nur die Prüffläche wird bewertet.** Der Zuschnitt erfolgt *vor* jeder Rechnung; Pixel ausserhalb gehen in nichts ein, auch nicht in die Grauwelt-Farbkorrektur. Aussenbereiche zu füllen — schwarz oder mit einer Durchschnittsfarbe — ist kein Ausschluss, sondern ein Ersetzen: die gefüllte Fläche verschiebt dieselben Bildmittel. Jeder Befund trägt seinen Geltungsbereich; er gilt für den Ausschnitt, nicht automatisch für das ganze Teil.
10. **Tiefe nur aus unabhängiger Messung.** Die Vorgabe nennt `< 1,0 µm` Kratz-/Riefentiefe — eine Referenzgrenze für eine **gemessene** Tiefe, keine Bildschwelle. Ein Tiefenurteil setzt Messwert, Einheit, Messmittel, Messunsicherheit, Zeitpunkt und ausführende Person voraus; fehlt eines, gibt es keine Entscheidung. Bildkontrast darf ausschließlich `OPTICAL_DEPTH_CHECK_RECOMMENDED` auslösen und niemals eine Tiefe in µm behaupten. `WITHIN_DEPTH_LIMIT` betrifft nur das Tiefenkriterium und erzeugt keinen Gesamt-PASS. Der Operator `<` gehört zur Grenze: bei genau 1,000 µm entscheidet allein dieses Zeichen.
11. **Eine gesehene Stelle muss meldbar sein.** Ein fehlendes algorithmisches Signal darf niemals „unauffällig" bedeuten. Der Prüfer kann jede Stelle als `MANUAL_DAMAGE_SUSPECTED` melden — ohne Detektortreffer, ohne Referenzbezug, ohne Tiefenangabe. Der Verdacht bleibt offen, bis er dokumentiert beurteilt ist (Zeitpunkt, Person, Rolle, Ergebnis, Begründung); solange sperrt er PASS **und** Override, während Sperrung und Rückweg zum Operator frei bleiben. Die Vorauswahl der Kandidaten ist eine Anzeigehilfe, nie die Grenze dessen, was der Datensatz weiß.
12. **Demonstrator-Grenzen nie verschleiern.** Keine Aussage „GMP-konform“ oder „Part-11-konform“ ohne formale Systemvalidierung.

## Struktur

```text
src/analysisCore.js   reiner deterministischer Analyse-Kern
src/knownIssues.js    restriktive Known-Issue-Regeln und 1:1-Matching
src/audit.js          accessor-sichere Kanonisierung, SHA-256, Audit-Kette
src/persistence.js    AES-GCM-IndexedDB, atomare Writes, Speicherinvarianten
src/domain.js         Rollen, Equipment/Zone, QR/EAN, Aggregation, Entscheidung
src/i18n.js           Deutsch/Englisch und Fachurteile
src/App.jsx           UI-Flows, Kamera, Zoom/Marker, Signatur, Protokoll
src/inspectionArea.js Prüffläche: Zuschnitt VOR jeder Rechnung, Geltungsbereich
src/overlayLayers.js  Anzeigeebenen des Overlays (rein, ändert kein Urteil)
src/swabComparison.js Wischvergleich je Kriterium, nie als Summe
src/scratchScreening.js Kratzer-Screening: Kandidaten, Rangfolgen, Vorauswahl
src/pdfExport.js      Einzel- und Sammelprotokolle
src/selfTest.js       deterministischer Start- und Kalibriercheck
public/sw.js          same-origin Offline-Cache
scripts/              reproduzierbare PWA-Icons und QR-Etiketten
```

## Tests

```bash
npm test                 # alle Suiten + Zaehlkontrolle gegen pruefzahlen.json
npm run test:core        # 16 Analyse-/Determinismustests
npm run test:real        # 5 reale Edelstahl-Gegenbeweise
npm run test:engines     # 5 Zwei-Engine-Leitplanken
npm run test:ki          # 30 Known-Issue-Tests
npm run test:v82         # 39 Domänen-/Audit-/PWA-Tests
npm run test:persistence # 18 Verschlüsselungs-/Speichersperren
npm run test:ui          # 31 semantische UI-Smokes, Bericht und Anzeigequelle
npm run test:a11y        # 8 axe-/Tastatur-Smokes
npm run test:schmutz     # 32 Schmutzdarstellung und Wischvergleich
npm run test:flaeche     # 35 Prüffläche, Koordinatensysteme, Bedienwege
npm run test:schaden     # 66 Schadensmeldung, Kandidatenerhalt, QA-Wiedereroeffnung
npm run verify           # Artefakte + Lint + Tests + Werkbank + Build (verlangt python3)
npm run test:bedienlauf  # 31 Pruefungen im ECHTEN Browser gegen dist/
```

`test:bedienlauf` ist NICHT Teil von `verify`: er verlangt Chromium und
Playwright, die das Paket bewusst nicht mitbringt (`npm ci` soll ohne
Browser-Download durchlaufen). Er wird getrennt gefahren, und sein Ergebnis
gehoert in jeden Uebergabebericht — die reinen Suiten koennen einen
Bedienweg nicht belegen.

```bash
npm run build && npm run test:bedienlauf
```

Bei Änderungen an `analysisCore.js` zuerst `npm run test:core`; jede neue Urteilsregel erhält ein synthetisches, geseedetes Szenario. `Math.random` bleibt im gesamten Anwendungspfad verboten.

Bei Änderungen an `knownIssues.js` müssen insbesondere diese GMP-Leitplanken grün bleiben:

- globale Texturfehler nie tolerierbar;
- Korrosionsverdacht nie tolerierbar;
- Trocken/Sauber nie tolerierbar;
- abgelaufene/geschlossene Known Issues greifen nicht;
- eine gespeicherte Zone kann nicht mehrfach verbraucht werden;
- neue oder gewachsene Zonen bleiben FAIL.

## Persistenzmodell

- IndexedDB `visuclean-v82` mit `meta`, `inspections`, `issues`, `references`, `audit`.
- AES-GCM-256; nicht extrahierbarer Browser-`CryptoKey` im Meta-Store.
- Jeder fachliche Write wird atomar mit Audit-Ereignis und `last-audit` geschrieben.
- `saveInspection`, `saveIssue` und `saveReference` sind Sicherheitsgrenzen, nicht bloße CRUD-Hilfen; ihre Invarianten nicht in die UI verschieben oder abschwächen.
- `canonicalize` lehnt Accessor, Zyklen, `undefined`, nicht-endliche Zahlen und nicht unterstützte Typen ab. Das verhindert Hash-/JSON-Divergenz.
- Website-Datenlöschung vernichtet lokalen Schlüssel und Daten. Der JSON-Export ist nur ein Demo-Backup, kein qualifiziertes Archiv.

## UI und Accessibility

- Interaktionen als native `button`, `a`, `input`, `select`, `textarea`; keine klickbaren `div`.
- App-Aktionen mindestens 44 px, Fokus sichtbar, Status nie nur über Farbe kommunizieren.
- DE und EN gemeinsam pflegen; neue sichtbare Texte gehören in `i18n.js`.
- Kamera/Scanner müssen Streams beim Unmount/Schließen stoppen.
- Maximal 10 Fotos, 5 Marker je Foto, 20 Marker insgesamt.
- Overlay-Erzeugung für Bildschirm, Speicherung und PDF niemals auseinanderziehen.

## Dokumentation

`V83_SCHMUTZKAMPAGNE.md` ist der Datenvertrag und Prüfplan für reale **Schmutz**tests; `V83_MESSKAMPAGNE.md` deckt getrennt davon die Riefentiefe ab. Beides sind Pläne, keine Ergebnisse — unabhängig markierte Stellen fehlen bislang vollständig.

`README.md` beschreibt Betrieb und Grenzen. `V83_RC3_ACCEPTANCE.md` ist die aktuelle Anforderungs-/Gegenbeweismatrix; `V82_ACCEPTANCE.md` bleibt als Stand 8.2 daneben bestehen. `MANIFEST.txt` wird erst nach einem frischen `npm ci`, `npm audit` und `npm run verify` mit finalen Hashes aktualisiert.
