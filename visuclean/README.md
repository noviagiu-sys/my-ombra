# VisuClean v8.3.0 RC4 (Linie mehrwinkel)

VisuClean ist ein offlinefähiger Browser-/PWA-Demonstrator für die visuelle Reinigungskontrolle **Trocken · Sauber · Intakt**. Die aktive Bildanalyse läuft deterministisch und vollständig im Browser; Prüffotos werden nicht an einen Analysedienst übertragen.

> **Hinweis:** v8.3.0 behebt konkret die in v8.2 nachgewiesene Fehlklassifikation nasser Edelstahlflächen. Zwei vom Anwender bestätigte Nassaufnahmen und eine trockene Kontrollaufnahme sind als feste, verkleinerte Regressionstests im Paket enthalten. Das ist ein belastbarer Fehlernachweis, aber noch keine allgemeine Sensitivitäts-/Spezifitätsvalidierung.

> **Klare Abgrenzung:** Dieses Repository ist kein validiertes GMP-Produktivsystem und keine medizinische Software. Die Zielarchitektur des Pflichtenhefts bleibt eine qualifizierte native iOS-App mit eingefrorenem CoreML-Modell, zentraler Identität, kontrollierter Synchronisation sowie formaler CSV-/GAMP-5-Validierung.

## Start und vollständige Prüfung

Voraussetzung: Node.js 20.19+ oder 22.12+.

```bash
npm ci
npm run dev
```

Das vollständige Prüftor lautet:

```bash
npm run verify
```

Es prüft reproduzierbare QR-/PWA-Artefakte, ESLint inklusive `jsx-a11y`, alle automatisierten Gegenbeweise und den Production-Build. Die jeweils gültige Anzahl steht im Kopf von `MANIFEST.txt` und wird dort gemessen, nicht fortgeschrieben.

## Funktionsumfang v8.3 RC3

- semantischer, vollständig per Tastatur erreichbarer Login; Rollen Operator, QA Manager und Administrator
- neun Equipment-Typen mit Prüfzonen, Suche, QR-/Barcode-Kamera und manueller Eingabe
- QR-Direktsprung mit `equipment_id|Zone`, EAN-13-Demo-Aliasse und druckbares A4-Etikettenblatt
- ein bis zehn Fotos je Prüfung; Worst-Result-Wins je Kriterium und dunkelstes Foto als Lichtwert
- Pinch/Drag, 1–4×-Zoom, Doppel-Tap, maximal fünf Marker je Foto und zwanzig je Prüfung
- separate Markerbewertung, identisches Overlay in Oberfläche, gespeichertem Foto und PDF
- Referenzbild je Equipment/Zone für QA/Administration und sichtbarer Soll-Ist-Vergleich
- Lichtgrenzen: ab 30 % OK, 15–29 % Warnung, unter 15 % technisch kein PASS/Override
- zweistufige Wischtest-Entscheidungshilfe mit Vorher-/Nachher-Dokumentation
- restriktive Known Issues: nur lokalisierte kosmetische Kratzer; nie Feuchtigkeit, Rückstand, Korrosion oder globale Texturfehler
- PASS-, FAIL- und Override-Flow mit Pflichtkommentaren, Re-Authentifizierung und echter Signatur-Pfadlänge
- signierte Datensätze append-only, inhaltlich per SHA-256 gebunden und atomar mit einer Audit-Hash-Kette gespeichert
- AES-GCM-256-verschlüsselte IndexedDB für Prüfungen, Referenzen, Known Issues und Audit-Ereignisse
- Prüfprotokoll mit Status-/Datum-/Equipment-/Zonenfilter, Verschleißtrend, Einzel- und Sammel-PDF sowie JSON-Export
- Deutsch/Englisch, Start-Selbsttest mit Kalibrierabweichung ≤ 2 Prozentpunkten, installierbare Offline-PWA
- WCAG-Strukturprüfung, sichtbarer Fokus, Symbole zusätzlich zur Farbe und mindestens 44 px große App-Aktionen
- ursächliches Overlay: Es werden nur Masken des tatsächlich auslösenden Urteils dargestellt
- Zwei-Engine-Vertrag: lokaler Offline-Kern ist aktiv; eine spätere Firmen-KI ist technisch getrennt und ohne explizite Konfiguration deaktiviert

Die nach Anforderung gegliederte Abdeckung steht in [V82_ACCEPTANCE.md](V82_ACCEPTANCE.md).

## Demo-Zugänge

| Rolle | Benutzer | Passwort |
|---|---|---|
| Operator | `operator1` oder `operator2` | `pharma2024` |
| QA Manager | `qa_manager` | `quality2024` |
| Administrator | `admin` | `admin2024` |

Diese Klartext-Zugänge sind ausschließlich Demodaten. Sie dürfen nicht in ein Produktivsystem übernommen werden.

## QR- und Barcode-Payloads

Akzeptiert werden:

- Kurzform, z. B. `tp`
- Equipment-Code, z. B. `VC-EQ-TP`
- versionierter Payload, z. B. `VC|V=1|EQ=TP`
- Direktsprung, z. B. `tp|Matrizenteller`
- die neun im Katalog hinterlegten EAN-13-Demo-Aliasse

Das offline verfügbare Arbeitsblatt [VisuClean_QR_Etiketten_A4.html](public/VisuClean_QR_Etiketten_A4.html) enthält alle neun QR-Codes mit Fehlerkorrektur M. EAN-13 und Code 128 werden über den nativen `BarcodeDetector` gelesen, sofern der Browser ihn anbietet. Ohne native Unterstützung greift der gebündelte `jsQR`-Fallback für QR-Codes; die manuelle Eingabe bleibt immer verfügbar.

## Lokale Daten und Offline-Betrieb

Nach dem ersten erfolgreichen Laden des Production-Builds übernimmt ein Service Worker die App-Artefakte. Danach funktionieren Analyse, Speicherung, Protokoll, PDF, JSON und Etikettenblatt ohne Netzwerk.

Die lokale AES-GCM-Verschlüsselung schützt gespeicherte BLOBs gegen Klartextzugriff. Schlüssel und Daten liegen jedoch im selben Browserprofil. Das ist eine Demonstrator-Sicherheitsgrenze, kein Ersatz für MDM, Hardware-KeyStore, zentrale Identität oder Server-Backups. Werden Website-Daten oder das Browserprofil gelöscht, gehen Schlüssel und lokale Daten verloren. Vorher den JSON-Export verwenden.

## Testaufteilung

| Suite | Umfang | Schwerpunkt |
|---|---:|---|
| `coretest.mjs` | 16 | dreizehn Urteilsregeln und drei Determinismusbeweise |
| `realimagetest.mjs` | 5 | zwei bestätigte Nassbilder, eine trockene Kontrolle und zwei Fehlalarm-Leitplanken |
| `enginetest.mjs` | 5 | Deaktivierung, Offline-Pfad, konservative Fusion und Antwortvalidierung |
| `kitest.mjs` | 30 | Known-Issue-GMP-Leitplanken inklusive 1:1-Zonenmatching |
| `v82test.mjs` | 39 | Domäne, QR/EAN, Licht, Marker, Bildbudget, Hash/Audit, PWA und Paketartefakte |
| `persisttest.mjs` | 18 | AES-Roundtrip, Append-only, Signatur-/Hash-/Override-/Audit-/Bildbudget-Speichersperren |
| `uitest.mjs` | 10 | semantische Login- und Home-Struktur in DE/EN |
| `a11ytest.mjs` | 8 | axe-Prüfung von Login, Home, Equipment und Kamera |
| `assessmenttest.mjs` | 23 | Prüfpunktstatus, die sieben Gesamtergebnisregeln, manuelle Ersatzprüfung |
| `scratchtest.mjs` | 15 | Eignung der Vergleichsaufnahme, Kratzerklassifikation, QA-Freigabe |
| `aitest.mjs` | 15 | optionale KI-Gegenprüfung, Widerspruch, dokumentierte Entscheidung |
| `integrationtest.mjs` | 16 | Prüfpunkte im echten Produktpfad und im gebauten Bundle |
| `versiontest.mjs` | 10 | Versionsgleichstand über alle Stellen und Manifestkopf |
| `kalibrierung.mjs` | 7 + 1 + 3 | getrennt gezählt: bestanden · bekannte Einschränkung · offene Kalibrierung |

Zusätzlich laufen ESLint/`jsx-a11y`, ein reproduzierbarer Build und `npm audit` ohne bekannte Abhängigkeitsschwachstellen.

`kalibrierung.mjs` zählt bewusst in drei Kategorien statt in einer. Die drei
offenen Kalibrierungsfälle (KO1–KO3) sind **kein** Erfolg: die Nässe-Erkennung
auf unscharfen Aufnahmen ist ungelöst und braucht Realdaten. Gelöst ist die
Reaktion darauf — der betroffene Prüfpunkt wechselt auf „Nicht bewertbar",
statt ein falsches PASS zu erzeugen. Exitcode 0 dieser Suite heißt „keine
Regression", nicht „Anforderung erfüllt".

Gesamtzählung: siehe Kopf von `MANIFEST.txt` (gemessen je Paket) · 0 fehlgeschlagen · 1 bekannte Einschränkung
(KE1) · 3 offene Kalibrierungsfälle (KO1, KO2, KO3)**.

## Bewusste Demonstrator-Grenzen

- Heuristik und Schwellenwerte sind nicht mit Produktionsbildern klinisch/GMP-validiert; Sensitivität und Spezifität sind nicht nachgewiesen.
- Ein einzelnes RGB-Foto ist kein physischer Feuchtesensor. Gleichmäßige, visuell strukturlose Wasserfilme können ohne validierten Sensor-, Referenz- oder KI-Pfad ununterscheidbar bleiben.
- Die Firmen-KI-Schnittstelle enthält im RC3 weder Anbieter noch Endpoint, Schlüssel oder Modell. Aktivierung erfordert Firmenfreigabe, Datenschutz-/Risikoentscheidung und eigene Validierung.
- Known-Issue-Abgleich ist positionsbasiert und setzt gleiche Zone sowie ähnlichen Bildausschnitt voraus.
- Referenzbilder werden sichtbar dokumentiert; die Heuristik ist kein trainiertes Referenzvergleichsmodell.
- Der Wischtest zeigt eine Entscheidungshilfe ohne validierten quantitativen Grenzwert.
- Keine zentrale Synchronisation, 2FA, elektronische Signatur nach qualifizierter PKI, Benutzerverwaltung, MDM-Integration oder serverseitige Aufbewahrung.
- Der Browser kann freien Gerätespeicher nicht zuverlässig gemäß 2-GB-/500-MB-Grenzen bestimmen; angezeigt wird nur die Origin-Speicherschätzung.
- Video-Frame-Analyse, CoreML, Torch/MDM-Steuerung, zentrale Driftalarme und native iOS-Qualifizierung gehören zu späteren Produktphasen.

## Struktur

```text
src/analysisCore.js   deterministischer Analysekern
src/analysisEngines.js getrennter Vertrag für lokalen Kern und optionale Firmen-KI
src/knownIssues.js    restriktives Known-Issue-Matching
src/audit.js          kanonische SHA-256- und Audit-Kette
src/persistence.js    AES-GCM-IndexedDB und Speichersperren
src/domain.js         Equipment, Rollen und Entscheidungsregeln
src/App.jsx           vollständiger PWA-Demonstrator-Flow
src/pdfExport.js       Einzel- und Sammel-PDF
public/sw.js           Offline-Cache
scripts/               reproduzierbare QR-/Icon-Artefakte
```
