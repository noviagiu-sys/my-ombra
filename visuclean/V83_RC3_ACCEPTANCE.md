# VisuClean v8.3.0-rc.3 — Abnahmestand

Grundlage: `VisuClean_v8.3.0_RC2.zip`,
SHA-256 `2476c993a4b233882e73d31633ca71a11817db1aa38e5ab67c418099f71bdda8`.
RC2 wurde nicht verändert.

## Was RC3 löst

RC2 konnte bei ungeeigneter Aufnahme ein **falsches PASS** erzeugen. Der
belegte Fall: eine bestätigt nasse Edelstahlfläche, um einen Kastenradius
weichgezeichnet, wurde als „Keine sichtbare Feuchtigkeit" gemeldet, und der
Intakt-Befund verschwand mit.

RC3 beseitigt diese falsche Sicherheit. Jeder Prüfpunkt trägt jetzt einen
eigenen Status — **Bestanden · Nicht bestanden · Nicht bewertbar** — und ein
Gesamt-PASS setzt voraus, dass alle erforderlichen Punkte bewertbar *und*
bestanden sind.

## Was RC3 ausdrücklich NICHT löst

Die **Erkennung** von Feuchtigkeit auf unscharfen Aufnahmen ist ungelöst.
Sie bleibt eine offene Kalibrierungsaufgabe, die Realdaten braucht.

Gelöst ist die **Reaktion**: Wo die Erkennung nichts Belastbares liefert,
erscheint „Nicht bewertbar" statt eines PASS. Diese Trennung ist in
`kalibrierung.mjs` mit getrennter Zählung festgehalten — die offenen Fälle
zählen dort ausdrücklich nicht als Erfolg.

## Die Entscheidungsregeln

| # | Regel | Nachweis |
|---|---|---|
| 1 | Ein FAIL sperrt das Gesamtergebnis | A11 |
| 2 | Kein FAIL, aber ein Pflichtpunkt nicht bewertbar → kein PASS | A12 |
| 3 | PASS nur bei allen Punkten bewertbar und bestanden | A13 |
| 4 | Eine schlechte Aufnahme wird nie automatisch PASS | A14, A7 |
| 5 | „Nicht bewertbar" bleibt auf den betroffenen Punkt begrenzt | A10 |
| 6 | Jeder offene Punkt nennt Grund und nächste Handlung | A9 |
| 7 | Manuelle Ersatzprüfung mit Punkt, Grund, Methode, Benutzer, Zeit | A17, A18 |

## Prüfpunkte

`moisture` · `residue` · `scratch` · `corrosion` · `surface` — alle fünf
erforderlich. Bis RC2 lagen Kratzer, Korrosion und Oberflächenstruktur
gemeinsam unter „Intakt" und konnten sich gegenseitig verdecken.

Die Regeln sind an die Anwendung angeschlossen und nicht nur als Bibliothek
vorhanden. Beim Packen war das zunächst **nicht** der Fall: `assessment.js`
war vollständig getestet, aber von `App.jsx` nie aufgerufen, und fehlte
deshalb restlos im gebauten Bundle. Nachgewiesen wird die Integration jetzt
von `integrationtest.mjs`:

| Nachweis | Test |
|---|---|
| Der Analysepfad der Anwendung liefert fünf Prüfpunkte | I1 |
| Die unscharfe nasse Aufnahme meldet dort „Nicht bewertbar" | I2 |
| Prüfpunkte stehen im Gesamtergebnis und damit im Datensatz | I3 |
| Ein bestandenes Foto überdeckt ein nicht bewertbares nicht | I4, I5 |
| Ältere Datensätze ohne Prüfpunkte bleiben gültig | I6 |
| Ein offener Pflichtpunkt verhindert das automatische PASS | I7 |
| Keine Überkorrektur der trockenen Kontrollaufnahme | I8 |
| Known Issues entschärfen nur, was sie dürfen | I11–I13 |
| Die Entscheidungslogik kommt im gebauten Bundle an | I14, I15 |
| Kein SOP-QR-Weg im Bundle entstanden | I16 |

Im Ergebnisschirm und im Protokoll erscheinen die fünf Punkte einzeln mit
Status, Grund, nächster Handlung und Messwerten. Ein offener Punkt löst
dieselbe Kommentarpflicht aus wie ein FAIL; bis dahin bleibt die
Freigabeschaltfläche gesperrt.

**Offen geblieben und nicht als Erfolg gezählt:** die trockene
Kontrollaufnahme erreicht auch in RC3 kein PASS, sondern WARNING. Ursache
ist ein bereits in RC2 vorhandener Analysehinweis, nicht die neue Regel —
`deriveSystemDecision` stuft jede Aufnahme mit Hinweis auf WARNING. Für RC3
zählt, dass dabei **kein** Prüfpunkt offen ist (I8).

## Keine Schwelle wurde verschoben

Die Bewertung nutzt ausschließlich Werte, die bereits in
`analysisCore.js` stehen: `tvFlat > 0.020`, `vdfr > 0.04`,
`edgeFrac > 0.06`, `anomBlockFrac >= 0.18`, `gradMean > 0.055`,
`edgeFrac > 0.08`.

Geändert hat sich nur, **was bei blockiertem Kantentor geschieht**:

- `anomBlockFrac >= 0.18` → PASS mit Erklärung (Geometrie oder Beleuchtung
  ist positiv belegt)
- sonst → **Nicht bewertbar**

Damit bleibt die trockene Kontrollaufnahme bestanden (`anomBlockFrac 0.212`),
während die unscharfe nasse Aufnahme (`0.098`) nicht mehr durchgewinkt wird.

## Kratzer

Ohne geeignete freigegebene Vergleichsaufnahme lautet die Anzeige
**„Kratzer erkannt – neu oder bestehend nicht bestimmbar."** Ein neuer
Kratzer wird nie automatisch zu einem Known Issue; dafür braucht es eine
vollständige, signierte QA-Freigabe durch die Rolle QA Manager.

## Optionale Firmen-KI

Standardmäßig deaktiviert und ohne Zugangsdaten lauffähig. Ein Schalter
allein genügt nicht — es braucht einen Adapter. Die KI überschreibt das
lokale Ergebnis nie stillschweigend: bei Widerspruch entsteht ein
Prüfpunkt, der eine dokumentierte manuelle Entscheidung verlangt. Ein
lokal nicht bewertbarer Punkt bleibt nicht bewertbar, auch wenn die KI
PASS sagt.

## Ausgeschlossen

Keine SOP-Suche und keine SOP-Verlinkung per QR-Code. Im Bundle nachgeprüft:
nicht vorhanden. Die vorhandenen QR-Etiketten für Equipment und Prüfzone
bleiben unverändert (9/9 reproduzierbar).

## Abgrenzung

Kein validiertes GMP-Produktivsystem. Native iOS/CoreML, zentrale Identität,
qualifizierte Synchronisation und Archivierung sowie formale OQ/PQ bleiben
Produkt-Zielarchitektur. Die Schwellenwerte sind weiterhin vorläufig; die
Phase-1-Kalibrierung mit Realdaten steht aus.
