# VisuClean v8.2 – Abnahmematrix Browser/PWA-Demonstrator

Bezugsstand: `VisuClean_Pflichtenheft_v2_5_C_GIU.docx`, insbesondere Kapitel 3.4, 4.1–4.8, 5, 6 und 7.3. „Erfüllt“ bedeutet hier **im Umfang des ausdrücklich beschriebenen Browser-/PWA-Demonstrators v8.2**, nicht die Freigabe eines GMP-Produktivsystems.

## Funktionsabdeckung

| ID | Anforderung | Status | Implementierung / Gegenbeweis |
|---|---|---|---|
| UI-01 | Login, Rollen, Demo-Zugänge | Erfüllt | native Form-/Button-Elemente; `uitest` U1–U6, `a11ytest` A1–A2 |
| UI-02 | Equipment-Suche und neun Anlagen | Erfüllt | Katalog in `domain.js`, Suche in `EquipmentSelect` |
| UI-03 | QR / EAN-13 / Code 128 / manuell | Erfüllt mit Browser-Fallback | nativer `BarcodeDetector`; gebündeltes `jsQR`; manuelle Eingabe; V4–V7 |
| UI-04 | QR-Direktsprung `equipment_id|Zone` | Erfüllt | `parseEquipmentTarget`; V6 und A7 |
| UI-05 | Druckbares 9er-QR-Blatt, ECC M | Erfüllt | `public/VisuClean_QR_Etiketten_A4.html`; reproduzierbar; V37 |
| UI-06 | nummerierte Zonen, letzte Prüfung | Erfüllt | `ZoneSelect`, lokale Protokolldaten |
| IMG-01 | direkte Kamera plus Galerie | Erfüllt | Rückkamera über `getUserMedia`; mehrfacher Dateiimport |
| IMG-02 | 1–10 Fotos | Erfüllt und speicherseitig erzwungen | `MultiCapture`; `saveInspection` validiert Zahl und `photoCount` |
| IMG-03 | Worst-Result-Wins und dunkelstes Foto | Erfüllt | `aggregateResults`; V9–V10 |
| IMG-04 | Fortschritt je Foto und Ergebnis-Karussell | Erfüllt | `AnalysisProgress`, `ResultPhotoCarousel` |
| IMG-05 | Pinch/Drag, 1–4×, Doppel-Tap, Reset | Erfüllt | `ZoomMarkerViewer`, zusätzlich Tastatur `+`, `-`, `0` |
| IMG-06 | max. 5 Marker/Foto, 20/Prüfung | Erfüllt und speicherseitig erzwungen | UI-Limit plus `saveInspection`-Invarianten |
| IMG-07 | Markerkoordinaten und Einzelbewertung | Erfüllt | Koordinaten-Strip, `assessMarker`, gespeicherter/PDF-Kontext; V16 |
| IMG-08 | Richtwert maximal 1 MB je gespeichertem Foto | Erfüllt | JPEG-Normalisierung, iterative Qualitäts-/Dimensionsreduktion vor Aufnahme in den Flow; V38 |
| REF-01 | Referenz je Equipment/Zone | Erfüllt | QA/Admin-Schreibrecht; AES-Store `references`; P2/P14 |
| REF-02 | Soll-Ist-Vergleich sichtbar | Erfüllt | Kamera- und Ergebnis-Screen `ReferencePreview` |
| LGT-01 | Licht ≥30 / 15–29 / <15 % | Erfüllt | `lightLevel`; V8 |
| LGT-02 | PASS bei <15 % technisch gesperrt | Erfüllt in UI und Persistenz | `deriveSystemDecision`; Override-Button gesperrt; P12 |
| ANA-01 | on-device und deterministisch | Erfüllt | keine Analyse-Netzwerkaufrufe; C1–C12, D1–D3, V32–V33 |
| ANA-02 | identisches Overlay in UI/PDF | Erfüllt | gemeinsame `paintOverlay`-/`annotatedImage`-Pipeline |
| SWB-01 | Wischtest Vorher/Nachher | Erfüllt als Entscheidungshilfe | zwei Pflichtfotos, dokumentierte Schwereänderung, Datensatz und PDF |
| KI-01 | nur kosmetischer INTAKT-Kratzer tolerierbar | Erfüllt | stabile Urteilscodes, Typ-/Code-Whitelist; K17–K20, K23–K29 |
| KI-02 | Ablauf, Schließen, Verlängern mit QA-Signatur | Erfüllt | datumsgenau bis Tagesende; QA-Speichersperre; K14–K16, P13 |
| KI-03 | neue/gewachsene Zone bleibt FAIL | Erfüllt | konservatives 1:1-Matching; K7, K9, K21–K22 |
| DEC-01 | PASS / FAIL / Override | Erfüllt | drei getrennte finale Entscheidungen und Signaturbedeutungen |
| DEC-02 | FAIL-Kommentar und Override ≥10 Zeichen | Erfüllt in UI und Persistenz | P11; Override-Invarianten in `saveInspection` |
| SIG-01 | Fingerpfad ≥20 px plus Re-Authentifizierung | Erfüllt | Canvas-Pfadlänge, Passwortcheck; V3, V15, P9 |
| SIG-02 | Signatur an Inhalt und Zeit gebunden | Erfüllt im Demonstrator | kanonischer SHA-256 über kompletten Datensatz; P10, V20–V22 |
| DB-01 | lokale verschlüsselte Datenbank | Erfüllt im Browserumfang | AES-GCM-256, nicht extrahierbarer `CryptoKey`; P1–P5 |
| DB-02 | signierte Datensätze unveränderlich | Erfüllt | IndexedDB `add`, kein `put`; P6–P7 |
| AUD-01 | lückenlose, manipulationserkennbare Audit-Kette | Erfüllt | atomare Hash-Kette; V23–V25, P3, P16 |
| DOC-01 | Protokollfilter Equipment/Zone/Status/Datum | Erfüllt | `HistoryScreen` |
| DOC-02 | Einzel-/Sammel-PDF, alle Fotos, Marker, KI, Swab, Signatur, Hash | Erfüllt | `pdfExport.js` |
| DOC-03 | JSON-Datenexport | Erfüllt | entschlüsselter Export inklusive Audit-Verifikation |
| DOC-04 | Verschleißtrend | Erfüllt als lokaler Demonstrator-Trend | Intakt-Schwere der letzten zwölf Equipment-Prüfungen |
| LNG-01 | Deutsch / Englisch | Erfüllt | UI und Fachurteile; V26–V27, U6 |
| SYS-01 | Start-Selbsttest <5 s | Erfüllt für Demonstrator | synchroner deterministischer Test und Kalibrierabweichung ≤2 Prozentpunkte; V36 |
| PWA-01 | installierbar und offline-first | Erfüllt nach Erstinstallation | Manifest, 192/512-Icons, dynamischer Build-Precache, same-origin-only; V28–V30 |
| A11Y-01 | Kontrast, Symbole, Fokus, 44-px-Ziele | Erfüllt auf Code-/Strukturebene | CSS-Leitplanken, `jsx-a11y`, axe A1–A8; manueller Gerätecheck bleibt Teil OQ |

## Technisch erzwungene Speicherinvarianten

`saveInspection` akzeptiert keinen Datensatz, wenn eine der folgenden Bedingungen verletzt ist:

- finale Entscheidung nicht PASS, FAIL oder OVERRIDE;
- aktiver Benutzer, Datensatzbenutzer und Signaturbenutzer stimmen nicht überein;
- Signaturpfad kürzer als 20 px, Signaturbild/Zeit/Bedeutung fehlen oder sind inkonsistent;
- weniger als ein oder mehr als zehn Fotos, falscher Fotozähler, mehr als 5/20 Marker;
- unvollständige Einzelfotoanalyse oder fehlende ursprüngliche Systementscheidung;
- FAIL ohne Maßnahmenkommentar;
- direktes PASS trotz System-FAIL;
- Override ohne ursprüngliches FAIL, bei kritischem Licht oder mit zu kurzer Begründung;
- SHA-256 passt nicht exakt zum kanonischen Datensatz;
- dieselbe Inspection-ID existiert bereits.

Known Issues und Referenzbilder besitzen entsprechend eigene Rollen-, Typ-, Signatur-, Zonen- und Hash-Invarianten.

## Abgrenzungen zur Produkt-Zielarchitektur

| Produktanforderung | Demonstrator-Status / notwendiger nächster Schritt |
|---|---|
| validierte Sensitivität ≥97 %, Spezifität ≥92 % | Nicht beansprucht. Hold-out-Datensatz, Trainings-/Validierungsplan und OQ/PQ fehlen. |
| CoreML / native iOS 17+ | Nicht Bestandteil dieses React/PWA-Repositories. |
| zentrale Identität, 2FA, PKI/Part-11-Infrastruktur | Demo-Zugänge und lokale Re-Authentifizierung; produktiv durch IdP/MDM/HSM ersetzen. |
| Server-Sync, Konfliktregeln, Backup, 99,5 % | Keine Serverkomponente im Demonstrator. |
| freier Gerätespeicher 2 GB Warnung / 500 MB Sperre | Browser liefert nur Origin-Quota, keinen zuverlässigen freien Gerätespeicher. Native Implementierung erforderlich. |
| automatische zentrale Driftalarme | Lokaler Selbsttest und lokaler Trend vorhanden; zentrale Kontrollkarte/Benachrichtigung fehlt. |
| qualifizierte Aufbewahrung und Wiederherstellung | Browserprofil ist kein qualifiziertes Archiv; Löschung der Website-Daten entfernt Schlüssel und Daten. |
| validierter Referenz-/Swab-Grenzwert | Referenz ist sichtbar und dokumentiert; Swab bleibt ausdrücklich qualitative Operator-Entscheidungshilfe. |
| Video-Frame-Analyse | Laut Pflichtenheft Phase 2, nicht v8.2-Demonstratorumfang. |

## Prüftor

```bash
npm ci
npm audit
npm run verify
```

Akzeptanz: QR- und Icon-Artefakte reproduzierbar, Audit 0 bekannte Schwachstellen, Lint 0 Fehler, alle 120 Tests grün, Production-Build erfolgreich.
