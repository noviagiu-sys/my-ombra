# Changelog

## 8.3.0-rc.4.45 - 2026-09-17

Reparaturauftrag nach rc.4.44, Befunde A bis G. `src/analysisCore.js`
bleibt byte-identisch zu RC3
(`ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793`); kein
Detektor wurde geaendert, keine Schwelle erfunden. Alle Korrekturen liegen
eine Schicht darueber.

### Der Befund an meinem eigenen Beweis

`werkbank/bedienlauf.mjs` fuehrt den gebauten Produktionsstand in Chromium
durch den echten Bedienweg. Zwischen der ersten und der zweiten Pruefung
stand darin ein `seite.reload()` — ein vollstaendiger Neustart, der den
Anwendungszustand ohnehin verwirft. E12, E12b und E13 waren damit gruen,
ohne dass `resetFlow` irgendetwas haette raeumen muessen; eine Gegenprobe
mit zurueckgebautem Reset blieb ebenfalls gruen. Der Beweis war gruen aus
dem falschen Grund.

Der Lauf bewegt sich bis zur zweiten Speicherung jetzt ausschliesslich
ueber die echten Schaltflaechen; der Reload steht danach und belegt dort,
was wirklich in der verschluesselten Datenbank liegt. Auch der
Benutzerwechsel (E14) steht vor dem Reload — danach waere er wertlos.

### A · Gemeldete Stellen erreichen den Datensatz

`baueDatensatz` reicht `manualFindings` weiter. Belegt ueber den ganzen
Weg: melden, unterschreiben, speichern, neu laden, exportieren (E6 bis
E10 im Browser).

### B · Die drei Beurteilungsergebnisse sind nicht dasselbe

`offeneSchadensverdachte` zaehlte alle drei als geschlossen. Jetzt:
unbeurteilt und "weitere Pruefung noetig" bleiben offen und sperren PASS
und Override; "Schaden bestaetigt" ist ein negativer Befund und erzeugt
aus sich heraus keinen PASS; "kein Schaden" gibt genau diesen Verdacht
frei. Keine neue pauschale Freigabeerlaubnis.

### C · Der nachgeladene Kandidat ist auffindbar und messbar

Bild und Speichergrenze lesen denselben Bestand wie die Tabelle
(`kandidatenBestand` / `findeKandidat`). C8 bis C12 fahren das im Browser.

### D · Der Weg nach dem Wiederoeffnen durch die QA

Ein gemeldeter Schadensverdacht sperrt PASS und Override. Nach der
Uebergabe konnte die QA ihn im wiedergeoeffneten Bericht nicht
beantworten — das Klaerungspanel gab es nur im Ergebnisbildschirm des
Pruefers. Es blieb allein die Sperrung: der Vorgang war eingemauert, und
die Sperre damit schaedlicher als die Luecke, die sie schliesst.

Drei zusammenhaengende Korrekturen:

- **Beurteilen.** Der Bericht zeigt die gemeldeten Stellen — offene wie
  beantwortete. Wer antworten darf (QA Manager, nicht der Pruefer, Vorgang
  nicht abgeloest), bekommt das Formular; alle anderen lesen nur.
- **Gebunden ergaenzen, nie ueberschreiben.** `buildClarificationRecord`
  erzeugt einen neuen Datensatz mit `supersedesId` und
  `approvalRevisionHash`; das Original bleibt Zeichen fuer Zeichen stehen.
  Die Beurteilung ist keine Freigabe: Zustand bleibt PENDING_QA,
  `finalDecision` bleibt leer, die Unterschrift traegt ihre eigene
  Bedeutung ("Schadensverdacht beurteilt, Freigabe ausstehend", §11.50).
  Die Speichergrenze prueft die Ergaenzung ENGER als eine Freigabe: nur
  `klaerung`, nur an einer gemeldeten Stelle, nur wo noch keine steht
  (`pruefeKlaerungsDelta`). Die Freigabe selbst bleibt unveraendert
  streng — eine Freigabe, die Meldungen aendert, wird weiterhin abgewiesen.
  PENDING_QA → PENDING_QA ist der einzige Uebergang, der seinen Zustand
  behaelt, und nur mit dieser Kennzeichnung, QA-Rolle,
  Reauthentifizierung und Revisionsbindung.
- **Nichts anbieten, was spaeter scheitert.** `qaDecisionOptions` kannte
  nur Pruefpunkte. Offene und bestaetigte Schadensverdachte sieht sie
  jetzt auch, und ein bereits abgeloester Vorgang bietet ueberhaupt keine
  Entscheidung mehr an.

### E · Der zweite Vorgang beginnt leer

`resetFlow` raeumt Meldungen und Tiefenmessungen. Geprueft wird nicht nur
der Bildschirm: unsichtbar ist nicht geloescht. E15 liest den ZWEITEN
gespeicherten Datensatz und sucht darin jede Kennung des ersten Vorgangs —
Foto, Marker, Datensatz und den wortwoertlichen Meldegrund.

### F · Eine Quelle fuer den Status, nicht zwei

Die Anzeige fuehrte den Rohbefund des Kerns und das massgebliche
Pruefpunkturteil als gleichwertige Ergebnisse; neben
`NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE` stand gruen "T PASS". Alle
operativen Statusanzeigen haengen jetzt an den Pruefpunkten. Ein echtes
FAIL behaelt Vorrang vor "nicht bewertbar".

Der historische Rueckfall auf den Rohbefund greift nur noch bei einem
NACHWEISLICHEN Altbestand. Eine fehlende Pruefpunktliste beweist keinen:
auch ein fehlerhafter neuer Datensatz kann ohne sie ankommen, und
ausgerechnet der bekaeme dann das gruene Urteil. Erkannt wird das
Datenformat (`istAltdatensatz`): seit RC4 weist die Speichergrenze jeden
Write ohne `schemaVersion` zurueck, ein gespeicherter Datensatz ohne
dieses Feld kann also nicht von RC4 stammen. Im Zweifel steht "?".

### Maus-Reparatur

`setPointerCapture` leitete auf dem Zoom-Viewport den anschliessenden
`click` um; mit der Maus entstand kein Marker. Die Aufnahme des Zeigers
erfolgt erst, wenn die Bewegung die Schwelle ueberschreitet. Klicken
setzt, Ziehen setzt nicht, Beruehrung setzt weiterhin (M1 bis M3 im
Browser, gegengeprueft durch Sabotage).

### Bestandspruefung vor der Lieferung

Geprueft wurde nicht die Meldung, sondern der Code — und dabei ist eine
Luecke aufgefallen: F war nur als REINE FUNKTION belegt. Dass Bericht und
PDF sie auch BENUTZEN, prueft nichts. Dieselbe Fehlerklasse wie X1.

Neu am gerenderten Bericht und am erzeugten PDF:

  U29  ein nicht bewertbarer Pruefpunkt erscheint im Bericht nicht als PASS
  U30  ein nachgewiesener Altbestand behaelt seinen Rohbefund
  P21  dasselbe im Protokoll: "T/D ?" statt "T/D PASS"
  P22  Altbestand im Protokoll unveraendert
  P23  eine Beurteilung heisst im Protokoll nicht "QA-Entscheid"

U29 war ROT, und aus einem Grund, der zaehlt: die Fotokachel zeigte "T ?",
die Urteilskarte daneben war gruen. Der Datensatz traegt die Pruefpunkte
ZWEIMAL — als `checkpoints` und in `aggregate.checkpoints`. Der Erzeuger
schreibt beide aus derselben Quelle; die Anzeige bevorzugte still die
erste Liste. Statt eine Kopie zur Wahrheit zu erklaeren, fuehrt der
Bericht beide nach Regel 3 zusammen: worst result wins. Sind sie gleich,
aendert das nichts; laufen sie auseinander, kann die guenstigere Fassung
die schlechtere nie ueberdecken.

Jede der neuen Wachen ist gegen ihren eigenen Rueckbau geprueft: P21 rot,
wenn das PDF wieder den Rohbefund druckt; P22 rot ohne
Altbestandserkennung; P23 rot bei falscher Etikettierung; U29 rot vor der
Reparatur.

### Zahlen

635 Pruefungen in 27 Suiten plus 7 Kalibrierungsfaelle, Bedienlauf 31/31
im echten Browser, `npm run verify` Exit 0.

### Offen

**G** — Kennzeichnungen (geaetzte Codes, Beschriftungen) erzeugen
Schmutzbefunde. Noch nicht synthetisch reproduziert; die vereinbarten
Vergleichsfaelle stehen aus.

## 8.3.0-rc.4.44 - 2026-09-17

Auftrag nach dem ersten echten Geraetelauf mit rc.4.43. Drei Befunde der
Gegenpruefung, alle am gespeicherten Datensatz belegt, dazu ein
forensischer Nachlauf auf dem Originalbild. `src/analysisCore.js` bleibt
byte-identisch zu RC3; kein Detektor wurde geaendert, keine Schwelle
erfunden.

### Der Nachlauf, der die Reihenfolge entschieden hat

Eine kompakte Ausbruchstelle war am Bildschirm deutlich zu sehen und in
der App nirgends auffindbar. Die Frage — geht sie bei der ERZEUGUNG
verloren oder erst bei der AUSWAHL — entscheidet, was zu reparieren ist.
Sie liess sich aus dem Datensatz nicht beantworten, weil dort nur zehn von
481 Kandidaten standen.

`werkbank/kandidatenspur.mjs` beantwortet sie am Originalbild, mit
derselben Prueffläche und bitgleicher Konfiguration: die Stelle ERZEUGT
sieben Bruchstuecke von 14 bis 30 Pixeln. Das beste steht im Nachlauf auf
Rang 22 (gerichtet) beziehungsweise 42 (ungerichtet). Der gespeicherte
Schnitt liegt bei zehn. **Sie entsteht, und die Auswahl verwirft sie.**

ZWEI EIGENE KORREKTUREN, beide von der Gegenpruefung angestossen:
- Meine erste Erklaerung nannte die Schlankheitsabwertung als Ursache. Das
  beste Bruchstueck hat eine Schlankheit von 5,04 — ueber der Referenz 4,
  also gar keine Abwertung. Die Fragmentierung ist der Haupteffekt; Laenge
  ist der groesste, aber nicht der einzige Unterschied (Kantenstaerke und
  Richtungsfaktor unterscheiden sich mit).
- Die Raenge gelten fuer den NACHLAUF. Er ergibt 493 statt 481 Kandidaten;
  damit ist seine Rangfolge nicht die urspruengliche. Die Uebereinstimmung
  der zehn gespeicherten (IoU 0,93 bis 1,00) stuetzt die Vergleichbarkeit,
  beweist sie aber nicht fuer alle uebrigen.

Offen und ausdruecklich NICHT belegt: der JPEG-Dekoder als Ursache der
2,5 Prozent Abweichung. Dafuer muessten dekodierte Originalpixel und danach
Zuschnittpixel zwischen beiden Umgebungen verglichen werden. Das Werkzeug
legt dafuer den Analysezuschnitt verlustfrei als PNG mit Pixelhash ab.

### 1 · Alle erzeugten Kandidaten bleiben erhalten und erreichbar

Der Datensatz traegt jetzt `alleKandidaten` neben der Vorauswahl. Die
Vorauswahl bleibt unveraendert, was sie war — Anzeige und PDF haengen an
ihr —, aber sie begrenzt nicht mehr, was der Datensatz ueberhaupt weiss.
In der Tabelle lassen sich weitere Kandidaten nachladen; die Stelle im
Bild bleibt dabei waehlbar.

ROHWERTE, ungerundet. GEMESSEN statt behauptet: 198 KiB je Foto als
Rohwerte, 186 KiB kanonisch fuer den ganzen Datensatz, 15 bis 25 ms zum
Kanonisieren und Hashen; zehn Fotos mit je 493 Kandidaten ergeben 2 MB und
72 ms. Gerundet zu speichern haette 140 KiB gespart und die
Nachrechenbarkeit gekostet.

Die frueher im Code stehende Begruendung "alle Kandidaten sprengen
Datensatz und PDF" galt fuer das PDF und war auf den Datensatz
miduebertragen worden. Das PDF zeigt weiterhin nur die Vorauswahl.

### 2 · Manuelle Schadensmeldung, durchgaengig verdrahtet

`manualFindings` stand seit RC4 im Vertrag — und `App.jsx` uebergab fest
`[]`. Ohne Detektortreffer gab es keinen Weg, eine gesehene Stelle in den
Datensatz zu bringen.

Neu ist die Feststellungsart `MANUAL_DAMAGE_SUSPECTED`. Sie behauptet
nichts: keine Veraenderung (also kein Referenzbezug noetig), keine
Stoffklasse, keine Tiefe. Sie sagt, dass hier etwas angesehen werden muss.

- Sie setzt dauerhaft den QA-Trigger.
- Sie bleibt OFFEN, bis sie dokumentiert beurteilt ist: Zeitpunkt, Person,
  Rolle, Ergebnis und Begruendung. Ein leeres Klaerungsobjekt schliesst
  sie nicht.
- Ein offener Verdacht sperrt JEDEN positiven Abschluss — PASS und
  Override. Der Override ist hier anders als beim offenen Pflichtpunkt MIT
  gesperrt: er ueberstimmt einen Befund, und ein Verdacht ist kein Befund,
  sondern eine offene Frage.
- Sperrung und Rueckweg zum Operator bleiben frei. Eine Sperre, die den
  Vorgang einmauert, waere schaedlicher als die Luecke.
- Sie traegt ueberhaupt kein Tiefenfeld, auch kein frei erfundenes. Eine
  gemessene Tiefe gehoert als eigene Messung an den Marker.

Die Sperre steht im Lebenszyklus UND an der Speichergrenze. `persistence`
glaubt der Oberflaeche nicht.

### 3 · Die Markerbewertung fragt Kratzerhinweise ab

`assessMarker` zaehlte vier Helligkeits- und Farbmasken. `scratches` stand
im selben Overlay daneben und wurde nie gelesen. Am Geraet: drei von vier
Markern auf echten Riefen meldeten "unauffaellig" — auf einer sauberen,
trockenen, nicht korrodierten Flaeche war das sogar das einzig moegliche
Markerurteil. Besonders unangenehm, weil der Marker der vorgesehene Weg
ist, eine UEBERSEHENE Riefe zu melden.

Abgefragt werden jetzt beide Quellen: die Riefen des Kerns und die
Kandidaten des Screenings — jede ueber ihre EIGENE Bezugsgroesse
(632x640 gegen 711x720). Die vier Masken behalten Vorrang: ein dunkler
Fleck wird nicht zum Kratzer umgedeutet.

### 4 · Werkbank: gehoeren Bruchstuecke zu einem Rand?

`werkbank/fragmentvergleich.mjs`. UNTERSUCHUNG, kein Detektor. Gemessen
werden Ringlage, Tangentialitaet, Winkelabdeckung und groesste Luecke —
und zwar gegen KONTROLLFENSTER gleicher Groesse an unauffaelligen Stellen.
Naehe allein ist kein Beleg fuer Zusammengehoerigkeit.

ERSTES ERGEBNIS, negativ und deshalb wichtig: an dieser einen Aufnahme
liegen ALLE VIER Merkmale beider gemeldeter Stellen INNERHALB der
Kontrollspanne. Nach diesen Merkmalen unterscheidet sich eine
Ausbruchstelle nicht von gewoehnlicher Schliffstruktur — eine
Zusammenfuehrung darauf waere blosse Naehe. Punkt 3 des Auftrags kann auf
dieser Grundlage nicht gebaut werden; es braucht weitere Aufnahmen und
andere Merkmale.

Geschlossenheit ist dabei ein Merkmal, ausdruecklich KEINE Vorbedingung:
die untersuchte Stelle ist nur an einer Flanke sichtbar, ein
Pflicht-Rundumschluss wuerde genau sie noch einmal verwerfen.

EIGENER FEHLGRIFF im Werkzeug, gefunden und behoben: ohne `--kontrollen`
lieferte `indexOf` -1, `argv[0]` ist der Node-Pfad, daraus wurde NaN — und
`laenge < NaN` ist immer falsch. Es entstand KEIN Kontrollfenster, und der
Bericht meldete "keine Kontrolle" statt eines Fehlers. Ein Werkzeug, das
seine Bezugsgroesse still weglaesst, ist schlimmer als keines.

### Gegenproben

29 neue in `schadenstest.mjs` (M1..M4, S1..S7, L1..L4, P1, K1..K5,
U1..U5, R1/R2, X1), gefahren gegen Vertrag, Lebenszyklus, Speichergrenze,
die echten 493 Kandidaten des Geraetelaufs, die echten Bildschirme und
einen Rundlauf durch die verschluesselte Persistenz.

SECHS SABOTAGEPROBEN, jede einzeln: der zurueckgedrehte Code macht genau
seine eigenen Gegenproben rot und keine andere.

    assessMarker ohne Kratzerabfrage      → M1 M4
    Tiefenfeld im Verdacht wieder erlaubt → S4
    Lebenszyklus ohne Sperre              → L1 L4
    Speichergrenze ohne Pruefung          → P1 R2
    nur die Vorauswahl im Datensatz       → K1 K2
    App.jsx sendet wieder []              → X1

DREI EIGENE FEHLGRIFFE in den Gegenproben, alle festgehalten: S4 war
zuerst gruen aus dem falschen Grund (es prueft ein Feld, das der Vertrag
nicht kennt); L1 bis L4 zielten auf FINAL_PASS, einen Uebergang, den es
aus PENDING_QA gar nicht gibt; R2 wurde zuerst wegen der
Signaturbedeutung abgewiesen, nicht wegen des Verdachts.

### Zahlen

593 Gegenbeweise in 26 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt,
Rohsumme 600.

### Weiterhin offen

- Punkt 3 des Auftrags: kompakte Auffaelligkeiten als eigenes
  Erkennungsziel. Wartet auf weitere Aufnahmen — die vorhandene liefert
  kein trennendes Merkmal.
- Der JPEG-Dekoder als Ursache der 2,5-Prozent-Abweichung ist nicht
  isoliert nachgewiesen.
- P5, P6, die vier Zielwerte der Schmutzkampagne, Spiegelungen INNERHALB
  der Prueffläche.
- Testhygiene: `schmutztest.mjs` ruft `createRoot()` je Render auf
  demselben Container.

## 8.3.0-rc.4.43 - 2026-09-17

Reine Nachbesserung an rc.4.42: derselbe Anwendungscode, dazu die
Zaehlkette fuer den Manifestkopf und eine eindeutige Versionskennung.
`src/analysisCore.js` bleibt byte-identisch zu RC3.

### 1 · Zwei Pakete unter einer Kennung (Rueckverfolgbarkeit)

BEFUND der Gegenpruefung, zutreffend und der Grund fuer diesen Stand: unter
der Kennung rc.4.42 wurden zwei verschiedene ZIPs gebaut — 2 103 329 Byte
(`f54d4550…c568`) und nach der Nachbesserung 2 109 277 Byte
(`bf3ecfd5…c3aa`).

EIGENER FEHLGRIFF: ich habe nachgebessert, ohne die Version zu ziehen. Ein
Screenshot oder Pruefbericht mit "rc.4.42" zeigt danach nicht mehr, welcher
Stand gelaufen ist. Fuer einen Geraetelauf, dessen Ergebnis spaeter etwas
belegen soll, ist genau das die Voraussetzung — die Kennung ist der einzige
Faden zwischen Bild und Bau. rc.4.42 ist damit zurueckgezogen; ausgeliefert
wird rc.4.43.

### 2 · Die Zahlen im Manifestkopf waren getippt

BEFUND der Gegenpruefung an rc.4.42, rein dokumentarisch und zutreffend:
MANIFEST.txt nannte weiter 30/30 fuer `pruefflaechetest.mjs`, 558 bestanden
und 565 Rohsumme. `manifest:check` konnte das nicht sehen — es vergleicht
Dateiliste und Hashes, nicht den Fliesstext im Kopf.

ZWEITER EIGENER FEHLGRIFF: ich hatte die Zahlen zuerst von
Hand in MANIFEST.txt korrigiert. Der Text steht aber im Generator; das
naechste `npm run manifest` hat die Korrektur wieder ueberschrieben. An der
falschen Stelle repariert — und die Auslieferung trug den alten Stand.

Dieselbe Krankheit hatte die SUITENZAHL schon in rc.4.19 ("19 Suiten" bei 20
gelisteten). Sie wurde damals abgeleitet statt behauptet. Jetzt derselbe
Schritt eine Ebene tiefer, in drei getrennten Teilen:

- `pruefzahlen.json` traegt die Zahl je Suite. Nichts darin wird getippt.
- `scripts/pruefzahlen.mjs` ist ab sofort `npm test`: es arbeitet die Kette
  aus `test:kette` ab, liest die Schlusszeile jeder Suite und vergleicht sie
  mit `pruefzahlen.json`. Abweichung heisst rot. Das Uebernehmen gemessener
  Zahlen ist ein ausdruecklich eigener Schritt (`npm run test:zahlen`) —
  ein Werkzeug, das seine eigene Behauptung nebenbei nachzieht, kann keine
  Abweichung melden.
- `V13` in `versiontest.mjs` schliesst die dritte Luecke ohne Laufzeit: es
  faellt auf, wenn `pruefzahlen.json` geaendert, das Manifest aber nicht neu
  erzeugt wurde. Geprueft wird jede Suite einzeln, nicht nur die Summe —
  eine Summe kann stimmen, waehrend zwei Suiten sich ausgleichen.

Beide Waechter wurden einzeln durch Sabotage geprueft: mit
`pruefflaechetest.mjs` auf 30 zurueckgesetzt meldet V13 "veraltet im Kopf",
und nach einem Manifestlauf, der V13 wieder gruen macht, meldet der Laeufer
"Manifest nennt 30, gemessen 35".

### Zahlen

564 Gegenbeweise in 25 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt,
Rohsumme 571. Gegenueber rc.4.42: `versiontest.mjs` 12 → 13 (V13 ist selbst
ein Gegenbeweis und zaehlt mit). Alle Zahlen im Manifestkopf stammen ab
jetzt aus einem gemessenen Lauf.

### Weiterhin offen

- Der Chromium-Lauf der Werkbank und der iPhone-Lauf sind getrennt und
  wurden fuer diesen Stand nicht wiederholt.
- P5 (Feuchte-Vergleichsdetektor) und P6 (Messkampagne) unveraendert offen.
- Die vier Zielwerte der Schmutzkampagne bleiben OFFEN.
- Spiegelungen INNERHALB der Prueffläche bleiben ein eigenes Problem.
- Testhygiene: `schmutztest.mjs` ruft `createRoot()` je Render auf
  demselben Container. In `pruefflaechetest.mjs` wird das nicht wiederholt —
  dort haelt ein einziger Root alle Renders.


## 8.3.0-rc.4.42 - 2026-09-17 (ZURUECKGEZOGEN)

Drei Restbefunde aus der Gegenpruefung an rc.4.41, alle drei zutreffend.
Alle drei sind AUFRUFER, die beim Nachziehen der Regeln aus rc.4.41
uebersehen wurden — die Regeln selbst waren richtig. Entsprechend eng ist
dieser Stand: keine neue Schwelle, kein neues Erkennungsverfahren, kein
Eingriff in den Analyse-Kern. `src/analysisCore.js` bleibt byte-identisch
zu RC3.

Jeder der drei Befunde hat eine Gegenprobe ueber den TATSAECHLICHEN
Erzeugungs- bzw. Bedienweg, nicht ueber die Regel noch einmal. Alle drei
Gegenproben wurden durch Sabotage geprueft: der jeweils zurueckgedrehte
Code macht genau die zugehoerigen Pruefungen rot und keine andere.

### 1 · Neue Known Issues ohne Ortsbezug (App.jsx)

`matchZones` beruecksichtigt seit rc.4.41 die Prueffläche, der ERZEUGER im
`KnownIssueDialog` nicht: `extractZones(photo.rawResult._ov)` ohne das
zweite Argument. Die so angelegten Zonen lagen in Ausschnittkoordinaten,
die spaeter verglichenen in Fotokoordinaten — derselbe Kratzer galt beim
naechsten Mal als "verschlechtert".

Zonen entstehen ab jetzt an BEIDEN Stellen mit demselben Ortsbezug.

Gegenprobe R9a/R9b faehrt den vollstaendigen Bedienweg des echten
Dialogs: Begruendung eintragen, "Weiter zur Signatur", Passwort zur
Re-Authentifizierung, "Bestaetigen & speichern" — und prueft das, was
`onSave` tatsaechlich erhaelt. Der so erzeugte Datensatz geht anschliessend
durch `applyKnownIssues`: Status "unveraendert", Code
`KNOWN_ISSUE_TOLERATED`.

EIGENER FEHLGRIFF, festgehalten: der erste Entwurf dieser Gegenprobe war
rot — aber aus dem falschen Grund. Er fuellte nur das Formular und suchte
einen Knopf mit einem Muster, das auf "Weiter zur Signatur" nicht passt;
der zweistufige Dialog wurde nie zu Ende bedient, `onSave` nie erreicht.
Ein Beweis, der aus dem falschen Grund rot ist, belegt nichts.

ZWEITER EIGENER FEHLGRIFF: `finish` haengt an einer echten asynchronen
Rechnung (SHA-256 der Datensatzpruefsumme). Ohne ausdrueckliches Warten
darauf war derselbe Lauf einmal gruen und beim naechsten Mal rot, ohne
Codeaenderung. Eine Pruefung, deren Ergebnis vom Zufall abhaengt, ist keine.

### 2 · Kennzeichen ausgeschlossener Messungen ging verloren (inspectionRecord.js)

`buildInspectionRecord` liess `ausserhalbFlaeche` fallen. Gemessene Kette:
die Eingabe war richtig gekennzeichnet, der Datensatz verlor das
Kennzeichen, die Bilanz meldete daraufhin eine uebersehene
Grenzueberschreitung, und die Speichergrenze wies den Datensatz ab.

Die Speichergrenze hat also korrekt geschuetzt — aber der vorgesehene Weg
fuer gekennzeichnete ausgeschlossene Messungen funktionierte nicht
durchgaengig. Das Kennzeichen wandert jetzt mit, immer als Boolescher Wert
und nie als `undefined`, weil die Kanonisierung `undefined` abweist.

Gegenprobe R9c ueber den echten Datensatzbau; R9d ist der Gegenfall: eine
Messung INNERHALB zaehlt weiterhin als uebersehen. Eine Regel, die alles zu
"ausserhalb" macht, waere schlimmer als der Fehler.

### 3 · Rahmen fiel beim Wechsel zwischen zwei Eintraegen zurueck (App.jsx)

Der Wechsel loeschte die bekannten Bildabmessungen. Weil die Bildquelle
dieselbe blieb, loeste das kein erneutes Laden aus — `onLoad` kam nie, und
der Rahmen fiel auf die Fenstergeometrie zurueck: 76 % statt 32,0625 % der
Fensterbreite.

Blind zu loeschen ist falsch, blind zu behalten auch: die Abmessungen eines
ANDEREN Fotos waeren genauso daneben. Gelesen wird deshalb das
Bildelement selbst — ist es bereits geladen, stehen die Abmessungen sofort
zur Verfuegung; ist es das nicht, gilt "unbekannt", bis `onLoad` kommt.

Gegenprobe R9e faehrt die echte Aufnahmemaske (`MultiCapture`) mit zwei
Eintraegen DERSELBEN Bildquelle und wechselt ueber die Miniaturleiste. Der
eine Zeitpunkt, an dem ein Browser das geladene Bild meldet, wird
nachgestellt; sonst waere schon der erste Wert falsch und der Unterschied,
um den es geht, gar nicht sichtbar. Gegen den zurueckgedrehten rc.4.41-Code
misst die Gegenprobe genau die Beobachtung der Gegenpruefung: zuerst
32,0625 %, nach dem Wechsel 76 %.

### Zahlen

563 Gegenbeweise in 25 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt,
Rohsumme 570. `pruefflaechetest.mjs` 30 → 35.

### ZURUECKGEZOGEN

Dieser Stand ist **nicht zu verwenden**. Unter derselben Kennung rc.4.42
wurden zwei verschiedene Pakete gebaut:

    2 103 329 Byte  f54d4550b5663cbe19e34ce2002afe3cd2f94b1df2c4558dfc31232e23d0c568
    2 109 277 Byte  bf3ecfd577c7d35651fb98d019016d6ed52d7624d588572574daee8249bcc3aa

Der Inhalt von rc.4.42 ist vollstaendig in rc.4.43 enthalten. Siehe dort.

## 8.3.0-rc.4.41 - 2026-09-17

Fuenf Befunde aus der Gegenpruefung an rc.4.40, alle zutreffend und alle
unabhaengig reproduziert. Sie betreffen die ZUORDNUNG: welcher Bildbereich
wurde untersucht, und wo wird der Befund angezeigt.

Der Analyse-Kern bleibt byte-identisch. Keine Schmutzschwelle wurde
angefasst, keine neuen Kalibrierbilder gebraucht.

### Drei Koordinatensysteme, die nicht verbunden waren

    1. FOTO-Anteile       normiert auf das Originalfoto
    2. ZUSCHNITT-Anteile  normiert auf die Prueffläche
    3. FENSTER-Anteile    normiert auf das Editorfenster

Das Editorfenster hat ein festes 4:3, das Foto nicht. Mit `object-fit:
contain` liegt das Bild mit Raendern darin — und alles, was in Prozent des
FENSTERS positioniert wurde, sass daneben.

Am Bildschirm nachgemessen (Gegenpruefung): Rahmen rund 201 px, waehrend
25 % von 340 px sichtbarer Fotobreite 85 px waeren. Nachgerechnet fuer
900x1600 im 320x240-Fenster: 243,2 px statt 102,6 px. Im echten Browser
gemessen (werkbank/rahmenmessung.mjs, 390 px): 275,1 px statt 116,1 px.
Marker und Klickauswertung hingen an derselben Stelle — das war ein
Altfehler, aelter als der Rahmen.

Die Umrechnung steht jetzt als reine Funktion in inspectionArea.js
(`bemalteFlaeche`, `aufFenster`, `ausFenster`, `rechteckAufFenster`).
Ein Klick auf den schwarzen Rand ergibt KEINEN Marker: er wird nicht an den
Bildrand geklemmt, weil es dort kein Bild gibt.

ZWEI EIGENE FEHLGRIFFE an dieser Messung, beide festgehalten:
- Der erste Versuch verglich den Rahmen mit `getBoundingClientRect()` des
  <img>. Das ist die BOX des Elements; bei `contain` liegt das Bild nur
  innerhalb davon. Die Box entsprach immer der Ebene — die Messung war
  gruen, ohne den Fehler beruehren zu koennen.
- Der zweite schrieb die Prozente im Testaufbau direkt hin und bildete
  damit den alten Zustand nach; er konnte die Reparatur nicht bestaetigen.

### Kandidatenkaesten auf dem falschen Bild

Das Screening rechnet seit rc.4.40 auf dem Zuschnitt, gezeichnet wurde
aber weiter das vollstaendige Originalfoto. Gemessen: ein Kandidat zeigte
auf 150/200 statt 360/300 — in der Ergebnisansicht UND im
wiedergeoeffneten Bericht. Eine daran gebundene Tiefenmessung waere an der
falschen Stelle vorgenommen worden.

`kandidatenBild()` entscheidet jetzt, WELCHES Bild gezeichnet wird. Fehlt
das Bild des Ausschnitts, wird GAR NICHTS gezeichnet und gesagt, warum —
ein Kasten auf einem Bild, zu dem er nicht gehoert, sieht aus wie eine
Ortsangabe. Datensaetze vor rc.4.40 zeichnen weiter auf dem Originalfoto;
dort wurde ohne Begrenzung gerechnet, und das ist richtig.

DRITTER EIGENER FEHLGRIFF: die erste Gegenprobe zaehlte <img>-Elemente im
Panel. Die Markierung zeichnet auf ein CANVAS — es gab nie ein <img>, und
die Pruefung war gruen, ohne die Bildwahl beruehren zu koennen.

### Verschiedene Stellen galten als derselbe bekannte Kratzer

Am echten Abgleich reproduziert: zwei getrennte Kratzer, jeweils mittig
zugeschnitten, ergaben beide 0,5/0,5. `allMatched: true`, Status
"unveraendert", KNOWN_ISSUE_TOLERATED.

`extractZones` rechnet Zonen jetzt in FOTO-Koordinaten zurueck und
kennzeichnet sie mit `bezug: "FOTO"`. `matchZones` verlangt gleichen
Ortsbezug als Vorbedingung: ohne belegten gemeinsamen Bezug wird keine
Uebereinstimmung behauptet. Altdaten ohne Bezug bleiben untereinander
vergleichbar — ihr Verhalten aendert sich nicht —, matchen aber nicht mit
FOTO-Zonen.

VIERTER EIGENER FEHLGRIFF, beim Sabotieren aufgefallen: die Gegenprobe zum
Ortsbezug benutzte Zonen an verschiedenen Stellen. Dann trennt schon der
Abstand, und die Bezugspruefung wird nie erreicht — die Pruefung blieb
gruen, obwohl der Bezugsfilter entfernt war. Jetzt liegen beide Zonen auf
denselben Koordinaten, und nur der Bezug trennt sie.

### Ausgeschlossene Stellen zaehlten als "uebersehen"

Ein Marker ausserhalb der Prueffläche blieb im Eingabeweg fuer uebersehene
Riefen waehlbar; eine dort eingetragene Messung liess sich speichern, und
die Bilanz zaehlte danach eine uebersehene Grenzueberschreitung — an einer
Stelle, die ausdruecklich nicht untersucht wurde. Der Detektor kann nichts
uebersehen, was ihm nie vorgelegt wurde.

"Ausserhalb der Prueffläche" ist jetzt eine eigene Kategorie: solche
Messungen werden weiter gezaehlt, aber getrennt, und gehen weder in
`erkannt` noch in `uebersehen` ein. Im Eingabeweg werden diese Marker
angezeigt, aber ohne Eingabemoeglichkeit und mit Begruendung. Das
Kennzeichen ist nicht behauptbar: die Speichergrenze prueft es gegen die
Geometrie, in beide Richtungen.

### Der Test veraenderte erneut das Paket

pruefflaechetest.mjs schrieb VisuClean_insp-flaeche.pdf ins
Projektverzeichnis. `npm run verify` lief gruen, das anschliessende
`manifest:check` fiel mit Exit 1 — genau wie gemeldet.

DAS WAR DAS DRITTE MAL in dieser Sitzung (pdftest P5, schmutztest S2j,
jetzt hier). Die Sperre stand bisher je Suite und schuetzte damit genau
die Suiten, an die jemand gedacht hatte. V12 prueft jetzt fuer ALLE: nach
einem Testlauf darf im Projektverzeichnis keine erzeugte PDF liegen. Am
Dateinamensmuster, nicht an einer Liste — eine neue Suite faellt von
selbst darunter.

### Kamerabedienung

"Analyse starten" lag als klebende Schaltflaeche ueber dem Kamerabild und
verdeckte Ausloeser und "Kamera stoppen". Bei geoeffneter Kamera klebt sie
nicht mehr, sondern steht im Fluss darunter. Sie verschwindet nicht.

### Abnahmekriterien der Gegenpruefung

- Rahmen und Marker beziehen sich auf die tatsaechliche Fotoflaeche:
  im Browser gemessen, drei Formate, Abweichung 0,0 px.
- Der im Rahmen sichtbare Inhalt entspricht dem analysierten Ausschnitt:
  dieselbe Umrechnung in Anzeige und Zuschnitt, R5c.
- Jeder Kandidatenkasten zeigt vor und nach dem Speichern auf dieselbe
  Stelle: R8a prueft beide Wege.
- Keine Schaltflaeche verdeckt die Kamerabedienung.

### Offen

Der Live-Ausschnitt auf dem Geraet ist weiterhin nicht nachgemessen; die
Browsermessung ist kein iPhone. Reflexionen innerhalb der Prueffläche
bleiben eine eigene Aufgabe. Eine hoehere reale Trefferleistung ist nach
wie vor nicht belegt.

## 8.3.0-rc.4.40 - 2026-09-17

Zwei strukturelle Befunde aus der Gegenpruefung an rc.4.39, beide
zutreffend und beide unabhaengig reproduziert. Sie liegen VOR jeder
Aussage ueber Erkennungsleistung: solange der Hintergrund mitentscheidet,
laesst sich Erkennungsleistung nicht sinnvoll messen.

Der Analyse-Kern bleibt byte-identisch. Keine Schwelle wurde veraendert.

### Vorschau und Aufnahme stimmten nicht ueberein

styles.css erzwang fuer `.camera-panel video` ein 4:3-Fenster mit
`object-fit: cover`; `shoot()` speichert dagegen das VOLLSTAENDIGE
Kamerabild (`canvas.width = video.videoWidth`). Weicht das Kameraformat
von 4:3 ab — im Hochformat immer —, zeigte die Vorschau einen Ausschnitt,
und nach der Aufnahme erschienen Bereiche, die beim Fotografieren nicht zu
sehen waren.

Jetzt `contain` ohne festes Seitenverhaeltnis: was gespeichert wird, ist
vorher sichtbar. Der QR-Scanner behaelt `cover` — dort wird ein Code
eingerahmt und kein Bild gespeichert (R1b haelt das fest).

R1a prueft die geltende CSS-Regel, nicht ihre Wirkung: jsdom hat keine
Layout-Engine, und `object-fit` laesst sich ohne echten Browser nicht
messen. Das steht ausdruecklich dabei; die Messung am Geraet bleibt offen.

### Der Hintergrund entschied ueber das Urteil

Der Kern bekam immer das ganze Foto. Die Grauwelt-Farbkorrektur bildet
ihre Faktoren aus den Mittelwerten des GANZEN Bildes:

    kR = 1 + s * (mGray / mR - 1)       mR, mG, mB = Bildmittel
    warm, wenn (r * kR) - (b * kB) > 0.08

Ein blauer Hintergrund hebt mB, senkt kB, und die Korrektur zieht Blau im
ganzen Bild herunter — auch in der unveraenderten Mitte. Am Kern gemessen,
identische graue Flaeche in der Bildmitte, nur der Hintergrund geaendert:

    Neutralgrau    PASS               warm in der Mitte      0/19200
    Braun/orange   ORGANIC_RESIDUE    warm in der Mitte      0/19200
    Blau           ORGANIC_RESIDUE    warm in der Mitte  19200/19200
    Weiss          DARK_RESIDUE       warm in der Mitte      0/19200
    Schwarz        BRIGHT_RESIDUE     warm in der Mitte      0/19200

Fuenf Hintergruende, vier verschiedene Sauberkeitsurteile ueber dieselben
Pixel. `src/roi.js` lag im Paket, war aber an keiner Stelle eingebunden.

Neu ist `src/inspectionArea.js` und ein echter rechteckiger ZUSCHNITT,
angewandt bevor irgendetwas gerechnet wird. `drawImage` schneidet direkt
aus der Quelle zu; die Pixel ausserhalb existieren danach nicht. Der
Oberflaechenpfad (Kratzer-Screening) wird mit zugeschnitten — sonst
staenden Kandidaten aus dem Hintergrund neben einem Urteil, das den
Hintergrund ausdruecklich nicht bewertet hat.

Mit Zuschnitt sind die Merkmale BITGLEICH ueber alle fuenf Hintergruende
(R3b), und das Urteil ist dasselbe (R3c). Im blauen Fall: 19200/19200
warme Pixel vorher, 0 nachher (R3d).

### Warum nicht gefuellt wird

Aussenbereiche schwarz oder mit einer Durchschnittsfarbe zu fuellen waere
kein Ausschluss, sondern ein Ersetzen: die gefuellte Flaeche geht in
dieselben Bildmittel ein. Gemessen (R3e): Schwarzfuellen macht aus
derselben sauberen grauen Flaeche BRIGHT_RESIDUE — stabil ueber alle
Hintergruende und damit unauffaellig, aber falsch. Ein Befund, den erst
das Fuellen erzeugt hat.

EIGENER FEHLGRIFF, hier festgehalten: die erste Fassung von R3e fragte
nur, ob das Fuellen zu EINEM einheitlichen Urteil fuehrt — das tut es. Sie
war gruen, ohne die beiden Wege ueberhaupt zu unterscheiden.

### Marker und Overlay wandern mit

Nach dem Zuschnitt beziehen sich Masken und Overlay auf den Ausschnitt.
Ein Marker in Fotokoordinaten zeigte sonst auf eine andere physische
Stelle, und ein Overlay ueber dem vollen Foto laege um den Zuschnittversatz
daneben.

Marker werden deshalb umgerechnet; ein Marker AUSSERHALB der Prueffläche
wird NICHT an den Rand geklemmt, sondern als ausserhalb ausgewiesen — an
seiner Stelle wurde nichts bewertet. Die Nummerierung reist am Marker mit,
damit sie nicht verrutscht, wenn einer nicht gezeichnet wird. Gezeichnet
wird auf dem Zuschnitt; das Originalfoto bleibt unveraendert erhalten.

### Die Prüffläche festlegen

Native Schieberegler statt Ziehgriffe: mit Handschuhen ist ein
44-px-Regler zuverlaessiger zu treffen als eine Ecke, und er ist mit
Tastatur bedienbar. Der Rahmen im Bild zeigt laufend, was bewertet wird.

Die Voreinstellung ist NICHT das ganze Foto, sondern ein zentrierter
Ausschnitt — und solange niemand sie anfasst, wird sie im Datensatz als
VORGABE ausgewiesen, nicht als Auswahl. Das ganze Bild bleibt waehlbar,
aber als ausdrueckliche Entscheidung (GANZES_BILD).

Ein zu kleiner Ausschnitt wird gemeldet, nicht gerechnet: unterhalb von
64 px Kante haben Blockanalyse und Medianfilter kaum Stuetzstellen.

### Der Geltungsbereich steht dabei

"In diesem Ausschnitt nichts gefunden" ist nicht "das Teil ist sauber".
Jeder Befund traegt deshalb seinen Geltungsbereich — am Bild, im
Datensatz und im Protokoll, aus derselben Quelle. Er nennt Ausschnitt-
groesse, Herkunft der Flaeche und ausdruecklich, dass das Ergebnis nicht
automatisch fuer das ganze Teil gilt. Nachgerechnet wird nichts: fehlt der
gespeicherte Eintrag, erfindet der Bericht keinen (R4e).

### Nachweise

R3f laesst die ECHTE `analyzeImage` gegen ein nachgebautes Canvas laufen,
das `drawImage` mit neun Argumenten tatsaechlich ausfuehrt, und prueft
sowohl das uebergebene Quellrechteck als auch, dass die Merkmale denen des
direkt zugeschnittenen Bildes entsprechen. Eine Quelltextsuche waere hier
zu wenig gewesen — dieselbe Luecke war in dieser Sitzung schon zweimal
aufgefallen (S2i, S5a).

Vier Sabotagen, alle beissend: ganzes Bild statt Zuschnitt, Geltungs-
bereich nicht in den Datensatz, PDF-Abschnitt entfernt, Vorschau zurueck
auf cover.

### Was weiterhin offen ist

- Der Live-Ausschnitt auf dem Geraet ist nicht nachgemessen. R1a prueft
  die CSS-Regel, nicht das, was das iPhone daraus macht.
- Reflexionen INNERHALB der Prueffläche bleiben eine eigene Aufgabe.
- Der Zuschnittweg ist ausserhalb von R3f durch keine bestehende Suite
  abgedeckt: jsdom hat kein Canvas, und die uebrigen Suiten rufen
  `analyzeImage` nicht auf. Der Geraetelauf ist die naechste Pruefung.
- Und unveraendert: eine hoehere reale Trefferleistung ist nicht belegt.
  Diese Fassung stellt die Vorbedingung her, sie ueberhaupt messen zu
  koennen.

## 8.3.0-rc.4.39 - 2026-09-16

Zwei Anzeigefehler aus der Gegenpruefung von rc.4.38, beide zutreffend und
beide reproduziert. Der Analyse-Kern bleibt byte-identisch; keine Schwelle
und kein Urteil wurden angefasst.

### Der wiedergeoeffnete Pruefbericht liess die Zusatzhinweise weg

Der Ebenenbestand ueberlebte das Speichern (S2f) und stand im PDF (S2g) —
aber die Bildschirmansicht des geladenen Datensatzes zeigte ihn nicht.
Reproduziert: gespeichert fuenf Ebenen einschliesslich der 5888
farbneutralen Pixel, im Bericht keine Ebenenliste und keine Mengenangabe.

Die Daten gingen nicht verloren. Fuer den Leser des Berichts ist das
trotzdem dasselbe — und es erzeugt genau den Eindruck, den rc.4.38
beseitigen sollte: "vor dem Speichern war mehr zu sehen".

Neu ist der Abschnitt `EbenenBericht` in RecordDetail. Er ist bewusst
read-only: der Datensatz traegt das fertige Overlay-Bild, nicht die
Masken, also gibt es nichts umzuschalten. Was er traegt, ist die Liste
dessen, was gerechnet und was davon gezeichnet wurde.

Es wird NICHTS nachgerechnet. Fehlt die Liste, war zur Unterschrift keine
da — dieselbe Regel, nach der das Screening im Bericht mit
herkunft="DATENSATZ" arbeitet. S5b haelt das fest.

### Alte Wischtests bekamen eine falsche Aussage

Ein Wischtest aus einer frueheren Fassung hat kein Feld `comparison`.
rc.4.38 las ausschliesslich dieses Feld und meldete daraufhin:

    "Kein Vergleich moeglich: die Vorher-/Nachher-Zuordnung fehlt"

Die Zuordnung fehlte nicht. Die beiden Fotos und die damaligen Werte
stehen im Datensatz; es fehlte nur die getrennte Auswertung, und die gab
es zum Zeitpunkt der Unterschrift noch nicht. Der Fehler betraf Bildschirm
UND Protokoll.

Ein signierter Bericht, der ueber seine eigenen Daten etwas Falsches sagt,
ist schlimmer als einer, der weniger sagt.

Neu ist `wischAnsicht()` in swabComparison.js. Sie unterscheidet drei
Faelle — getrennte Auswertung, Altformat, und wirklich nichts — und der
Altfall traegt seine Zahlen IM SATZ:

    "Damaliger Summenvergleich, keine getrennte Kriterienauswertung:
     95 -> 35 · damalige Aussage "Rueckstand moeglich" (RESIDUE_POSSIBLE).
     Die Summe vermischt Trocken, Sauber und Intakt; sie ist nachtraeglich
     nicht trennbar. Die Aufnahmen und die damaligen Werte liegen
     unveraendert vor."

Es werden KEINE Einzelwerte erfunden. Die damalige Summe laesst sich nicht
in drei Kriterien zerlegen — die Summanden wurden nie gespeichert, und sie
zu schaetzen waere eine Erfindung. Der Altfall traegt deshalb keine
Kriterienzeilen, sondern die ausdrueckliche Einschraenkung
SUMME_NICHT_TRENNBAR.

Der signierte Datensatz wird nicht angefasst; `wischAnsicht` liefert eine
Ansicht. S6c prueft das am Datensatz vor und nach dem Rendern.

Bildschirm und PDF lesen jetzt dieselbe Quelle. Bis rc.4.38 las das PDF
`swabTest.comparison` direkt — ein Bildschirm, der es richtig macht, und
ein Protokoll, das es falsch macht, waeren zwei Aussagen zu einem
Datensatz.

### Der Gegenfall

Eine Altformat-Erkennung, die auch neue Datensaetze einfaengt, waere ein
Rueckschritt und wuerde die Reparatur aus rc.4.38 aufheben. S6e prueft
deshalb ausdruecklich, dass ein Wischtest MIT `comparison` bei der
getrennten Auswertung bleibt und NICHT als Altformat gekennzeichnet wird.
Alle vier Sabotagen beissen: Ebenenabschnitt entfernt, Altformat-Erkennung
entfernt, Altformat greift zu weit, PDF wieder direkt auf `comparison`.

### P19 und die Geometrie

Der Altformat-Block hat eigene Textzeilen. Ein Block, den kein Datensatz
der Suite erzeugt, wird von P17 auch nicht auf Ueberstand gemessen —
deshalb erzeugt pdftest jetzt ein zweites Dokument mit einem
Altformat-Wischtest. P17 misst damit 427 statt 327 Zeilen, alle innerhalb
des Satzspiegels.

### Was diese Fassung NICHT aendert

Keine Erkennungsleistung. rc.4.39 repariert zwei Anzeigefehler; dass die
App Schmutz auf echten Teilen zuverlaessiger findet, ist damit weiterhin
nicht belegt und wird hier auch nicht behauptet. Unabhaengig markierte
Stellen fehlen nach wie vor vollstaendig (V83_SCHMUTZKAMPAGNE.md, SK4).

## 8.3.0-rc.4.38 - 2026-09-16

Auftrag "Schmutzerkennung erhalten, Darstellung vervollstaendigen,
Wischvergleich korrigieren". Der Analyse-Kern bleibt byte-identisch; keine
Erkennungsschwelle wurde angefasst, kein Befundtext abgeschwaecht.

### Berechnet und trotzdem unsichtbar: die zweite Schmutzmaske

Der Kern rechnet vier Masken. Die Urteilskette waehlt mit einer
if/else-Kette GENAU EINEN Sauberkeitscode, und paintOverlay leitete die
Sichtbarkeit jeder Maske aus genau diesem einen Code ab. Warme und
farbneutrale Auffaelligkeiten schlossen sich in der ANZEIGE damit
gegenseitig aus.

Am gemischten Testfall gemessen, nicht aus dem Quelltext geschlossen:
2640 px warme Maske eingeblendet, 5888 px Anomaliemaske aus 23 Bildzonen
berechnet und NICHT eingeblendet. Der Pruefer sah die kleinere Haelfte des
Befunds und hatte keinen Anhaltspunkt, dass eine zweite existiert.

Neu ist src/overlayLayers.js: eine reine Ableitung, die aus Merkmalen und
Urteilscodes beschriftete Anzeigeebenen erzeugt. Drei Zustaende, und sie
stehen im Klartext da statt nur in einer Farbe:

    eingeblendet     traegt das Urteil dieses Kriteriums
    zuschaltbar      berechnet, Zusatzhinweis, KEIN zweites Urteil
    nicht erkannt    die Maske ist leer

Die VOREINSTELLUNG aendert sich nicht. Sichtbar ist genau, was rc.4.37
sichtbar hatte; alles Weitere schaltet der Pruefer selbst zu. Eine Rohmaske
blendet sich nicht von selbst ein, erzeugt kein FAIL und gilt nicht als
bestaetigter Schmutz. Beide Richtungen sind durch Sabotage geprueft:
Verstecken der Zusatzebenen und automatisches Einblenden fallen beide durch.

Jede Mengenangabe nennt ihre Bezugsgroesse ("5888 von 76800 px"). Ein
Pixelanteil ist kein Verschmutzungsgrad und keine Stoffmenge; die Ebenen
tragen dafuer eigens `istMessgroesse: false`.

### Der Bericht sagt jetzt, was er nicht zeigt

Das eingebettete Overlay-Bild zeigt weiterhin nur die urteilstragende
Ebene. Bis rc.4.37 stand nirgends, dass eine zweite ueberhaupt existierte —
der Bericht sah aus, als haette es sie nicht gegeben.

Der Ebenenbestand wandert deshalb als ABGELEITETE LISTE in den signierten
Datensatz, nicht als Rohzahl. Wuerde das Protokoll die Liste spaeter aus
einem Bestand neu ableiten, koennte eine geaenderte Konfiguration still
eine andere Aussage erzeugen als der Bildschirm bei der Aufnahme. Die
Masken selbst wandern nicht mit; die Zahl mit ihrer Bezugsgroesse genuegt.

Das PDF druckt die Anzeigebegrenzung als eigenen Abschnitt, ausdruecklich
als "Hinweis, kein Urteil".

### Wischvergleich: drei Ursachen in einer Zahl

Der Vergleich addierte die Befundstaerken von Trocken, Sauber und Intakt
und gab eine sinkende Summe als "Rueckstand moeglich" aus. Die Regel stand
zweimal im Quelltext, wortgleich.

Damit genuegte NACHTROCKNEN, um eine Reinigungswirkung auszuweisen, die es
nicht gab. Gemessen: die alte Regel meldete "RESIDUE_POSSIBLE" bei 95 -> 35,
obwohl der Sauberkeitswert unveraendert bei 35 stand. Ebenso reichte ein
anderer Kratzerwert — und der aendert sich schon bei anderem Streiflicht.

Neu ist src/swabComparison.js. Verglichen wird je Kriterium; die
Gesamtaussage haengt ausschliesslich am Sauberkeitskriterium. Feuchte und
Unversehrtheit stehen daneben, gehen aber nicht in die Aussage ein.

Bei sinkendem Schmutzbefund wird die beobachtete Veraenderung BESCHRIEBEN:
kein Beleg fuer die Art des Stoffes, kein Beleg fuer vollstaendige
Entfernung, kein automatisches PASS. Der Originalbefund bleibt stehen.

Gleicher Ausschnitt und gleiches Licht werden von der App nicht
festgestellt. Sie erscheinen deshalb ausdruecklich als NICHT BELEGT, in der
Ansicht und im Protokoll. Nicht festgestellt ist nicht festgestellt gleich.

Die fuenf Pflichtfaelle liegen als S3-1 bis S3-5 vor, dazu S3-6 fuer die
Vergleichbarkeit und S3-7 dagegen, dass jemand die Summe zurueckbaut.

### Auflösungsvergleich fuer den Rueckstandspfad

werkbank/schmutzaufloesung.mjs haelt je Lauf Bildabmessungen,
Verarbeitungsschritte, Schmutzbefund, Merkmale, markierte Bereiche mit
relativer Position, Laufzeit und Messumgebung fest.

Zwei Befunde am eigenen Werkzeug, beide vor der Auslieferung korrigiert:

- Die vorliegenden Realaufnahmen sind 480x640. Die Stufen "960" und
  "Originalaufloesung" fallen damit mit "640" zusammen. Hochskaliert wird
  ausdruecklich nicht; der Lauf kennzeichnet je Zeile, dass hier KEIN
  Vergleich stattfindet. Drei gleiche Zeilen sind nicht drei Belege.
- Die erste Stufe mass 114 ms gegen 26 ms fuer dasselbe Bild in derselben
  Groesse. Das war die JIT-Uebersetzung, kein Aufloesungseffekt. Vor jeder
  Zeitmessung laeuft jetzt ein Aufwaermlauf.

Ein Ergebnis, das ausdruecklich KEINE Entscheidung ist: beim Halbieren auf
320 px kippt das trockene Kontrollbild von PASS auf DARK_RESIDUE — ein
Fehlalarm auf der sauberen Referenz. Das ist EIN Bild und keine Rate.
ANALYSE_KANTE.RUECKSTAND bleibt bei 640.

### V83_SCHMUTZKAMPAGNE.md

Datenvertrag und Pruefplan fuer reale Schmutztests: unabhaengig markierte
Stellen, vor/nach-Paare, saubere Vergleichsflaechen, Verwechslungsfaelle,
Trennung nach unabhaengigen TEILEN zwischen Anpassung und Abschlusspruefung.

Vier Kennzahlen mit Zaehler, Nenner und der Angabe, was sie NICHT sagen;
der Unentschiedenanteil ist Pflicht, sonst verschwinden schwierige Faelle
lautlos. Zielwerte bleiben OFFEN. Referenzlabels werden nicht aus
Detektorausgaben erzeugt. Sieben Luecken sind als SK1 bis SK7 benannt.

### Eigener Fehlgriff, hier festgehalten

schmutztest.mjs schrieb beim ersten Lauf VisuClean_insp-ebenen-1.pdf ins
Projektverzeichnis — dieselbe Falle, die pdftest.mjs seit rc.4.8 in seinem
Kopf beschreibt, und manifest:check fiel danach mit Exit 1. save() wird
jetzt abgefangen; S2j belegt, dass der Abfang greift und dass save
ueberhaupt gerufen wurde.

### Was diese Fassung NICHT behauptet

Keine verbesserte reale Erkennungsleistung. Was hier gruen ist, sagt etwas
ueber Berechnung und Darstellung — nichts darueber, ob die App Schmutz auf
echtem Edelstahl zuverlaessig findet. Dafuer fehlen Aufnahmen mit
unabhaengig markierten Stellen vollstaendig.

## 8.3.0-rc.4.37 - 2026-09-16

Zwei Befunde aus der Gegenpruefung von rc.4.36, beide zutreffend und beide
reproduziert. Dazu die veraltete Node-Angabe im Lockfile, die aus rc.4.35
uebrig geblieben war.

### Eine zweite manuelle Markierung loeschte die erste

Reproduziert wie gemeldet: M01 mit 2,40 +- 0,10 um eintragen, dann M02 mit
0,40 +- 0,10 um ergaenzen — M01 war weg. Nach Speichern, Neuladen und
Export stand nur noch M02 im Datensatz, und die Bilanz der uebersehenen
Grenzueberschreitungen meldete 0 statt 1.

Ursache in App.jsx: die Ersetzungsregel erkannte eine schon vorhandene
Messung an `photoId + kandidatId`. Bei JEDER manuellen Markierung ist
`kandidatId` aber `null`, und `null === null` ist wahr — jede neue
Markierung galt damit als Korrektur der vorigen.

Die Regel steht jetzt als reine Funktion `ersetzeMessung()` in
`src/depthLimit.js` und vergleicht die VOLLSTAENDIGE Bindung: Foto,
Kandidat und Marker, wobei die fehlende Seite ausdruecklich als "kein
Wert" geschrieben wird statt als leerer String. Korrigieren derselben
Stelle ersetzt weiterhin, und zwar an Ort und Stelle — eine Korrektur
sortiert die Liste nicht um. `entferneMessung()` folgt derselben Regel,
damit ein Loeschen nicht denselben Fehler auf der anderen Seite macht.

Die Regel gehoert nicht in die Oberflaeche. Sie ist eine Datenregel, und
als Datenregel ist sie pruefbar, ohne ein Formular zu rendern.

Zwei Gegenbeweise, beide durch Sabotage geprueft: T33 gegen die reine
Regel, T34 ueber den ganzen Weg — zwei Markierungen auf demselben Foto
durch die echte Persistenz, den Wiederauf-Ruf, den lesbaren Export und das
erzeugte PDF, mit der Bilanz am GELADENEN Datensatz. T34 existiert, weil
die Gegenpruefung den Fehler nicht an der Regel gesehen hat, sondern am
Ende der Kette.

### Text ragte bis 199 mm ueber den Seitenrand hinaus

Sichtbar bestaetigt und schlimmer als gemeldet. `line()` in pdfExport.js
setzte den Wert ohne jeden Umbruch an eine feste Spalte; alles, was
darueber hinausging, lag neben dem Papier und fehlte auf dem gedruckten
Protokoll — bei der Tiefenmessung samt Person, Messmittel und Urteil.

Der Wert wird jetzt auf die verbleibende Spaltenbreite umbrochen, `y`
laeuft um die tatsaechliche Zeilenzahl weiter, und der Seitenumbruch wird
vor dem Setzen geprueft statt danach. Ist die Beschriftung breiter als die
Spalte, wandert der Wert nach rechts — aber hoechstens bis zur halben
Satzbreite.

### Ein Inhaltstest kann diesen Fehler grundsaetzlich nicht finden

Das ist der eigentliche Befund. Im Textstrom des PDF steht der Text
vollstaendig drin, egal wo er auf dem Blatt landet; pdftest.mjs las den
Strom und meldete gruen. Sechzehn abgeschnittene Zeilen ueberlebten eine
vollstaendig gruene Suite.

P17 misst deshalb die GEOMETRIE: jeder Textaufruf wird abgefangen und
seine Breite bei der dann geltenden Schriftgroesse bestimmt.

Dabei ein eigener Fehlgriff, der hier stehen bleibt, weil er die Regel
belegt: der erste Versuch ersetzte `jsPDF.API.text`. Dort steht `text`
gar nicht — jsPDF legt die Methode als eigene Eigenschaft jeder Instanz
an. Der Export stuerzte bei jedem Textaufruf ab, die Ueberstandsliste
blieb leer, und P17 meldete GRUEN, weil nichts gemessen wurde. Ein Beweis,
der gruen ist, weil er nicht laeuft, ist schlimmer als gar kein Beweis.
Gehaengt wird jetzt am `initialized`-Ereignis, und P17 verlangt zusaetzlich
eine Mindestzahl tatsaechlich gemessener Zeilen — 308 sind es, 16
Ueberstaende waren es vorher, der groesste 199,0 mm.

### Veraltete Node-Angabe im Wurzeleintrag des Lockfiles

package.json trug bereits `^20.19.0 || >=22.12.0`, der Wurzeleintrag von
package-lock.json weiterhin das alte `>=20.19.0`. Ursache war Handarbeit:
package.json wurde in rc.4.35 geaendert, ohne das Lockfile neu zu erzeugen.

Das Lockfile ist jetzt mit `npm install --package-lock-only` neu erzeugt —
genau eine geaenderte Zeile. V11 vergleicht den Wurzeleintrag gegen
package.json in Version, engines, license und name, damit dieselbe
Handarbeit nicht noch einmal unbemerkt bleibt.

### Was diese Fassung NICHT aendert

Der Analyse-Kern bleibt byte-identisch. Die Tiefenregel, ihre Fassung und
die Grenze bleiben unveraendert; `WITHIN_DEPTH_LIMIT` erzeugt weiterhin
keinen Gesamt-PASS, und Bildkontrast behauptet weiterhin keine Tiefe in um.

## 8.3.0-rc.4.36 - 2026-09-16

Fuenf Befunde aus der Gegenpruefung von rc.4.35, alle zutreffend. Einer
davon war sperrend.

### SPERREND · Erfundene Kandidaten-Kennung wurde akzeptiert

Die Speichergrenze prueft seit rc.4.35 die MARKER-Kennung gegen das Foto —
die KANDIDATEN-Kennung aber nicht. Eine Messung mit

    photoId: "photo-1", kandidatId: "K999-EXISTIERT-NICHT", markerId: null

wurde gespeichert und anschliessend von befundBilanz() als "vom Detektor
erkannt" gezaehlt.

Das umgeht keine Freigabesicherung — es verfaelscht genau die Kennzahl, um
die es in der Messkampagne geht: ein UEBERSEHENER Befund kann als erkannt
erscheinen, und die Verfehlungsrate ist geschoent, ohne dass es auffaellt.

Geprueft wird jetzt gegen die gespeicherte Kandidatenliste DIESES Fotos.
Der Datensatz haelt nur die Spitze beider Rangfolgen; was dort nicht steht,
kann er auch nicht belegen. T31b deckt alle drei Faelle ab: gueltiger
Kandidat angenommen, erfundene Kennung abgewiesen, Kandidat eines anderen
Fotos abgewiesen.

### Das ZIP enthielt nicht manifestierte Dateien

115 Dateien im Paket, 108 im Manifest. Darunter fuenf .claude-Dateien samt
internen Skill-Dateien und eine Python-Bytecode-Datei — beide Kategorien
bezeichnet .gitignore ausdruecklich als maschinenspezifisch, der
Packvorgang uebernahm sie trotzdem.

Ausnahmen ergaenzt. Neuer Packschritt 4b prueft die GLEICHHEIT beider
Mengen, nicht nur die Teilmenge: ZIP-Inhalt = Manifestdateien +
MANIFEST.txt. Ergebnis jetzt 109 Dateien, keine ueberzaehlige.

Eigener Fehler dabei, offengelegt: die erste Fassung der Pruefung las das
Manifestformat falsch (die Byte-Spalte fehlte im Muster), fand null
Eintraege und meldete daraufhin ALLE 108 Dateien als ueberzaehlig. Ein
Muster, das nichts findet, meldet alles. Jetzt bricht der Schritt
ausdruecklich ab, wenn er weniger als 50 Manifesteintraege erkennt.

### Das PDF verlor bei uebersehenen Befunden die Marker-Kennung

Gedruckt wurde nur kandidatId; eine manuell markierte Messung erschien als
"Tiefenmessung —". Damit ging die Aussage verloren, um die es geht: dass
der Detektor diese Stelle NICHT angeboten hat. Jetzt steht die Bindung im
Protokoll, samt dem Zusatz "vom Algorithmus nicht erkannt".

### Die Regelfassung fehlte im PDF

Die Rechnung verwendete die gespeicherte ruleVersion, das Protokoll nannte
sie nicht. Unter einer spaeteren Fassung 2 waere es nicht mehr aus sich
heraus nachvollziehbar gewesen. Jetzt stehen Fassung UND ihre Grenze da.

Beides belegt durch P16.

### Node-Angabe war zu weit

">=20.19.0" erlaubte Node 21, das Vite 8.2.2 ausschliesst. Jetzt
"^20.19.0 || >=22.12.0" — identisch mit der Build-Abhaengigkeit.

### Werkbanktests sind Teil von verify

npm run verify fuehrt jetzt auch test:kontrast aus. Die Python-Auswertung
wurde zwischen rc.4.33 und rc.4.35 geaendert und gehoert damit ins
verbindliche Gate. Hinweis: verify verlangt dadurch python3.

489 Gegenbeweise in 23 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt,
dazu 74 in der Werkbank — jetzt alle im selben Lauf.

## 8.3.0-rc.4.35 - 2026-09-16

Drei Befunde aus der Gegenpruefung vom 16.09.2026, alle zutreffend.

### 1 · Filterkette: die Begruendung war sachlich falsch

V83_MESSKAMPAGNE.md Fassung 1 behauptete, der Rauheitsfilter mit lambda_c
entferne eine schmale Riefe WEGEN ihrer kurzen Wellenlaenge. Das ist
falsch: lambda_c trennt Rauheit von Welligkeit und entfernt die
LANGwelligen Anteile. Eine schmale Riefe bleibt davon gerade unberuehrt.

Ebenso war "ungefiltertes Primaerprofil" keine eindeutige Bezeichnung: das
Primaerprofil entsteht ueblicherweise bereits durch einen lambda_s-Filter.

Richtiggestellt. Gefaehrlich fuer eine schmale Riefe sind lambda_s, der
Tastspitzenradius bzw. die laterale Aufloesung, Antastkraft und
Abtastschritt — nicht lambda_c. Alle vier sind jetzt Pflichtspalten.

Die Schlussfolgerung bleibt: die Verarbeitungskette gehoert dokumentiert.
Welche Profilart maszgeblich ist, legt das Dokument NICHT mehr fest — das
ist eine messtechnische Entscheidung. Bezugslinie, Messfenster und
Maximum sind ausdruecklich als VORSCHLAG gekennzeichnet.

### 2 · Uebersehene Riefen waren nicht erfassbar

Die wichtigste Luecke. Die Eingabemaske haing ausschliesslich an
automatisch erkannten Kandidaten. Eine Riefe, die der Detektor gar nicht
anbietet, haette keine Messung aufnehmen koennen — und genau dieser Fehler
waere in einer Kampagne unsichtbar geblieben.

Neuer zweiter Bindungsweg: eine Messung bindet an einen Detektorkandidaten
ODER an eine manuell gesetzte Markierung, genau eines von beiden. Die
Speichergrenze prueft das und verlangt zusaetzlich, dass die Marker-Kennung
auf diesem Foto wirklich existiert. befundBilanz() leitet "erkannt" aus der
BINDUNG ab, nicht aus einem Feld.

Neue Komponente UebersehenePanel, bewusst NEBEN dem Screening: der
interessante Fall ist der mit null Kandidaten, und dort kehrt das
Screening-Panel frueh zurueck.

Belegt durch T28 bis T32, Ende zu Ende gegen die echte Persistenz:
Detektor findet nichts, Pruefer markiert manuell, Messung wird gespeichert,
neu geladen, exportiert und als uebersehene Grenzueberschreitung gezaehlt.

Eigene Luecke offengelegt: T28 prueft die Komponente isoliert und belegt
nichts ueber ihre Verdrahtung. T32 prueft jetzt die echte Ergebnisansicht.

### 3 · Neuberechnung konnte alte Urteile aendern

"Das Urteil wird gerechnet und nie gespeichert" traegt nur, wenn die
damalige Rechnung reproduzierbar bleibt. Sonst machte ein Update aus
derselben Messung ein anderes Urteil — auch im PDF einer abgeschlossenen
Pruefung.

Jede Messung traegt jetzt ihre Regelfassung. DEPTH_RULES haelt die
Fassungen; eine neue bekommt eine neue Nummer und wirkt nur auf neue
Messungen. Eine unbekannte Fassung wird NICHT nach heutiger Regel bewertet,
sondern als NOT_MEASURED mit eigenem Grund gefuehrt.

D22 weist es nach: dieselbe Messung, 3,0 +/- 0,1 um, bleibt unter Fassung 1
ueberschritten, waehrend sie unter einer neu eingehaengten Fassung 2
darunter laege.

### Ausserdem

Die vier Kennzahlen stehen jetzt mit Zaehler, Nenner, Zweck und der Angabe,
was sie NICHT sagen. "Uebersehen" ist in seine zwei Faelle getrennt.

P3 ist als offene Nachweisfrage ausgewiesen: Ablauflogik und Speicherung
sind in jsdom belegt, der gefuehrte Ablauf AM GERAET nicht. Eine
jsdom-Suite ersetzt keine Kamera.

487 Gegenbeweise in 23 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt.

## 8.3.0-rc.4.34 - 2026-09-16

Begriffskorrektur auf Weisung des Auftraggebers: im ausgelieferten Stand
darf die HERKUNFT der Tiefengrenze nicht genannt werden.

Die Tiefengrenze SELBST bleibt unveraendert sichtbar — "< 1,0 um", mit
Operator, am Bildschirm, im Protokoll und im Datensatz. Entfernt ist
ausschliesslich die ZUSCHREIBUNG. Aus

    <Herkunftsangabe>: zulaessige Kratz-/Riefentiefe < 1,0 um.

wird

    Zulaessige Kratz-/Riefentiefe < 1,0 um.

Bereinigt wurden nicht nur die sichtbaren Texte, sondern auch
Quelltextkommentare und die ausgelieferten Dokumente: das Paket enthaelt
den Quelltext, und ein Kommentar darin ist genauso ausgeliefert wie eine
Bildschirmzeile. Betroffen waren 21 Stellen in 14 Dateien.

Mitgezogen: der Bezeichner fuer die hinterlegte Grenze heisst jetzt
VORGABE_TIEFGRENZE_UM, die Herkunftsmarke "SPEZIFIKATION" heisst "VORGABE",
das Schluesselwort `--tiefgrenze spez` heisst `--tiefgrenze vorgabe`, und
DEPTH_LIMIT_SOURCE.status ist PREDEFINED_LIMIT statt SPECIFICATION.

### Zwei neue Ausschlusspruefungen

X-14 sperrt die Herkunftsangabe im Anwendungscode, X-15 in den
ausgelieferten Markdown-Dokumenten. Beide durch Sabotageproben belegt:
kehrt der Begriff in den Bildschirmtext oder in ein Dokument zurueck,
faellt der Lauf.

X-15 hat beim ersten Lauf diesen Changelog-Eintrag selbst abgewiesen — er
nannte den Begriff im Erklaertext. Das ist der Beleg, dass die Sperre auch
den trifft, der sie geschrieben hat.

Nicht angetastet: drei aeltere Stellen, die "Spezifikation" in einem
anderen Zusammenhang nennen (screeningConfig.js und scratchClassifier.js
verweisen auf die technische Python-Spezifikation des Projekts,
werkbank/ANLEITUNG.md ebenso). Sie stammen aus frueheren Staenden und
meinen einen ganz anderen Zusammenhang.

478 Gegenbeweise in 23 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt.

## 8.3.0-rc.4.33 - 2026-09-16

Vier Arbeitsschritte auf dem Weg zur Messkampagne. Kein Stellwert
verschoben, keine Schwelle erfunden, keine Zielzahl geschaetzt.

### K1 · Datenvertrag und Pruefplan (V83_MESSKAMPAGNE.md)

Vor der ersten Messung geschrieben. Legt fest, welche Stelle gemessen wird
und was "Tiefe" dort bedeutet: ungefiltertes Primaerprofil statt
Rauheitsprofil (ein Filter entfernt eine schmale Riefe je nach Breite ganz
oder teilweise), Ausgleichsgerade ueber die ungestoerte Flaeche als
Bezugslinie, MAXIMUM im Messfenster als Kennwert (Worst-Result-Wins),
Spuren senkrecht zur Riefe.

Vier Ausgaenge statt zwei: richtig, uebersehene Grenzueberschreitung,
Fehlalarm und UNENTSCHIEDEN. Der Anteil unentschiedener Faelle ist
Hauptkennzahl — ein System, das alles zur manuellen Kontrolle schickt, hat
null Fehler und ist wertlos. Fehlerraten werden ohne die Entscheidungsquote
nicht ausgegeben.

Zielwerte bleiben ausdruecklich OFFEN. Kriterien, Modell, Merkmalsrechnung
und Datenaufteilung werden vor dem Abschlusstest gehasht.

### K2 · MODEL_ESTIMATE als getrennte Herkunft

Eine Modellschaetzung darf gespeichert, angezeigt und gedruckt werden — sie
erfuellt die Pruefung in evaluateDepthMeasurement aber nicht und erzeugt nie
WITHIN_DEPTH_LIMIT. Grenze fuer den heutigen Stand, kein Ausschluss einer
spaeter nachgewiesenen Messfunktion.

Befund aus der eigenen Sabotageprobe: ein zweiter Aufzaehlungsschluessel mit
dem Wert INDEPENDENT_MEASUREMENT rutschte durch. Funktional nur ein Alias,
im Aufrufcode aber ein Name, der etwas anderes sagt als sein Wert tut.
Geschlossen durch D16e.

### K3 · Eingabemaske fuer Tiefenmessungen

Sechs Pflichtangaben ueber die Oberflaeche, gebunden an EINEN Kandidaten.
Die Bindung entsteht durch das Antippen im Bild, nicht durch eine Auswahl in
der Maske. Das Urteil steht vor dem Uebernehmen da. Speichern, Neuladen,
Export und PDF erhalten die Zuordnung; das Urteil wird ueberall GERECHNET
und nie mitgespeichert.

Befund aus der eigenen Sabotageprobe: die Vollstaendigkeitssperre an der
Speichergrenze war von keinem Test belegt — T23 prueft nur die Maske, und
eine Maske ist keine Sicherheitsgrenze. Geschlossen durch T27.

### K4 · Ebenenannahme der Entzerrung

Eine Homographie bildet eine EBENE auf eine Ebene ab. Bis rc.4.32 lief
warpToPlane unabhaengig von zone.planar, und NON_PLANAR_ZONE wurde erst
nachtraeglich auf das Ergebnis gesetzt — der Oberflaechentext versprach, die
Mehrwinkelauswertung entfalle hier, waehrend sie lief.

Die Sperre greift jetzt VOR der Entzerrung. verifyByRedetect faengt das
nicht ab: es sucht das ETIKETT im entzerrten Bild wieder, und das Etikett
ist per Bauart eben. Dieselbe Fehlerklasse wie registrationQuality in
rc.4.7, eine Ebene hoeher. Eine nicht erfasste Ebenheit sperrt ebenfalls,
mit eigenem Grund.

### K5 · Querprofil und Lichtwechsel (Werkbank)

Neues Modul riefenmerkmale.mjs: Schnitt senkrecht zur Riefe mit
Einbruchtiefe, Breite auf halber Tiefe und Flankenasymmetrie, dazu die
Aenderung ueber die drei Lichtpositionen. Alles in Grauwertstufen und
Pixeln, keine Mikrometer. Das bisherige Kontrastmerkmal bleibt als
Vergleich. Zehn Selbsttests gegen analytisch bekannte Geometrie.

Zwei eigene Fehler offengelegt: die Schatten-Vorlage lag nicht im
Schulterfenster, und die Querachse lief bei senkrechter Riefe gegen die
Bildrichtung — gerechnet richtig, aber jede spaetere Deutung des
Vorzeichens waere seitenverkehrt gewesen.

**Nicht belegt:** dass Querprofil oder Lichtwechsel die Riefentiefe
anzeigen. Das koennen nur reale Aufnahmen mit unabhaengig gemessener Tiefe.

476 Gegenbeweise in 23 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt,
dazu 74 in der Werkbank.

## 8.3.0-rc.4.32 - 2026-09-15

Die Vorgabe nennt eine zulaessige Kratz-/Riefentiefe von
**< 1,0 um** (Korrektur vom 15.09.2026; zuvor war von 1,0 mm die Rede). Das
ist die erste von aussen belegte Zahl in diesem Projekt.

### Neu: src/depthLimit.js

Vier Zustaende - NOT_MEASURED, WITHIN_DEPTH_LIMIT, DEPTH_LIMIT_EXCEEDED,
BOUNDARY_UNCERTAIN. Eingeteilt wird erst, wenn das ganze
Unsicherheitsintervall auf einer Seite der Grenze liegt; sonst Grenzfall.
WITHIN_DEPTH_LIMIT betrifft nur das Tiefenkriterium und erzeugt keinen
Gesamt-PASS: `grantsRelease()` liefert fuer jeden Zustand `false`.

Messwert, Einheit, Messmittel, Messunsicherheit, Zeitpunkt und ausfuehrende
Person werden getrennt gespeichert; die Originaleingabe bleibt unveraendert
erhalten. Fehlt eine Pflichtangabe, gibt es keine Entscheidung - eine
fehlende Unsicherheit ist NICHT +/- 0. Die Einheit wird geprueft: "mm" wird
nicht stillschweigend umgerechnet.

Bildkontrast loest hoechstens OPTICAL_DEPTH_CHECK_RECOMMENDED aus und traegt
nie einen Wert in um. Neue Ausschlusspruefung X-13 sperrt jede
Mikrometerangabe in der Naehe eines Kontrastbegriffs.

### Befund: Gleitkomma ist an dieser Grenze zu ungenau

Von 999 Paaren, deren Untergrenze dezimal exakt 1,000 ergibt, liefern 208 in
double-Arithmetik 0,9999999999999999 und fielen damit in BOUNDARY_UNCERTAIN
statt in DEPTH_LIMIT_EXCEEDED. Behoben durch exakte Dezimalrechnung mit
skalierten Ganzzahlen - keine Epsilon-Toleranz, die waere eine erfundene Zahl
an der einen belegten Grenze.

### Befund: zwei tote Konstanten waren eine offene Tuer

DEPTH_CLASS in decision.js trug SURFACE_ONLY_SUSPECTED und DEPTH_SUSPECTED.
Beide wurden nie vergeben - und waren der fertige Platz fuer genau die
Behauptung, die aus einem Bildkontrast nie folgen darf. Entfernt.

### Speichergrenze rechnet nach

persistence.js prueft jetzt, dass der gespeicherte depthStatus aus der
beigelegten Messung FOLGT, statt ihn zu glauben. Eine Zahl ohne vollstaendige
unabhaengige Messung wird weiter abgewiesen.

### Werkbank

--tiefgrenze vorgabe setzt die belegte Grenze; jede andere Zahl wird als frei
gewaehlt ausgewiesen. Grenzfaelle stehen ausserhalb der Konfusionsmatrix und
entwerten Vollstaendigkeitsaussagen. Der Operator ist messbar: drei von 200
Dummy-Zeilen liegen genau auf 1,00 um - mit "<" TP 146, mit "<=" TP 143.

**Nicht belegt:** dass eine Tiefe von 1,0 um mit einer Handyaufnahme
feststellbar waere. Sie ist es nicht.

463 Gegenbeweise in 23 Suiten, kalibrierung.mjs mit 7 getrennt gezaehlt.

## 8.3.0-rc.4.5 - 2026-09-09

Zwei Befunde aus der manuellen Browserpruefung. Beide blockierten die
Testphase, beide sind an der Wurzel behoben.

### 1 · Signatur-Zeitstempel-Mismatch (blockierte jedes Speichern)
`finalize` las die Uhr fuer die Signatur, `buildInspectionRecord` las sie ein
zweites Mal fuer den Datensatz. Millisekunden dazwischen, und die Invariante
`signature.signedAt === record.signedAt` schlug zu.

Behoben nicht durch Durchreichen einer Variablen, sondern durch
`signInspection()` in `src/inspectionRecord.js`: die Funktion nimmt `now`
einmal entgegen und setzt es an beide Stellen. Ein zweiter `new Date()` kann
nicht mehr dazwischengeraten.

Dieselbe Fehlerklasse wie der schemaVersion-Bruch in 4.2 — Erzeuger und
Aufrufer uneins. Der bestehende Test konnte sie nicht sehen, weil er beiden
Seiten denselben festen Zeitstempel uebergab. Neu: `S15` prueft die Bindung,
`S16` prueft, dass die Oberflaeche die Uhr nicht selbst liest.

### 2 · Kamerastream oft schwarz beim ersten Start
Der Stream wurde in einem einzelnen `requestAnimationFrame` direkt nach
`setCameraOpen(true)` angehaengt. React 18 garantiert den DOM-Commit vor
diesem Frame nicht: lief der Callback zu frueh, war `videoRef.current` noch
null, die Zuweisung fiel still aus. Panel offen, "Kamera stoppen" aktiv, Bild
schwarz — eine Wettlaufsituation, daher "oft" statt "immer".

Der Stream haengt jetzt an einem Effekt auf `cameraOpen`, der nach dem
Commit laeuft. Zusaetzlich wird `play()` nicht mehr stillschweigend
verschluckt: ein schwarzes Bild ohne Meldung ist nicht deutbar. Der
QR-Scanner war nie betroffen, er nutzte bereits einen Effekt.

Neu: `U11`. **Grenze:** die Pruefung liest den Quelltext. Ob der Stream auf
einem echten Geraet erscheint, kann nur die Browserpruefung belegen.

### Nicht behoben
RoiPad/Eingrenzung fehlt weiterhin — bekannte Luecke, nicht dieser Stand.

## 8.3.0-rc.4.4 – 2026-09-08

Nur Dokumentation. Das Abnahmedokument war in 4.2 und 4.3 nicht nachgezogen
worden — falscher Titel, veraltete Zaehlung (261/268 statt 274/281), kein Wort
zu Speicherpfad, QA-Genehmigung und elektronischer Signatur. Aufgefallen beim
Nachsehen im ausgelieferten Paket, nicht durch einen Test.

- `V83_RC4_ACCEPTANCE.md` beschreibt jetzt 4.2, 4.3 und 4.4 einzeln.
- Die Eingabemasken fuer Handlungsart und QA-Genehmigung sind von der Liste
  "nicht enthalten" gestrichen — sie sind seit 4.2 vorhanden.
- `src/inspectionRecord.js` in der Bausteintabelle ergaenzt.

## 8.3.0-rc.4.3 – 2026-09-08

Die gezeichnete Unterschrift ist entfallen.

- Signatur = zwei Identifikationskomponenten nach 21 CFR Part 11 §11.200:
  `method: "USER_ID_PASSWORD"`, `components: ["userId", "password"]`.
  Durchgesetzt in `saveInspection` und `saveIssue` ueber
  `validElectronicSignature`.
- Grund, zweifach: die Pfadlaengenpruefung war nie eine Kontrolle, und im
  Reinraum mit Handschuhen ist eine Unterschrift auf dem Touchscreen nicht
  reproduzierbar.
- PDF: Signaturmanifestation als Text (§11.50) und **Pruefer und Genehmiger
  getrennt** (T-38).
- `CLAUDE.md` Regel 5 korrigiert — sie forderte weiterhin "Pfad >= 20 px".
- Neu: `S13` (nur eine Komponente) und `S14` (blosse Zeichnung) werden
  abgewiesen. Aeltere Datensaetze bleiben lesbar.

## 8.3.0-rc.4.2 – 2026-09-08

Der Speicherpfad war tot. Gefunden von der manuellen Browserpruefung, nicht
von 268 gruenen Zusicherungen.

- `App.jsx` baute einen RC3-Datensatz, waehrend `persistence.js` Schema 3
  verlangte. Speichern war unmoeglich — die Kernfunktion der Anwendung.
- Ursache der Blindheit: der einzige Test, der `saveInspection` aufruft, baute
  sein Objekt von Hand. Eine Fixture bestaetigt den Vertrag, nicht seine
  Erfuellung.
- Behoben an der Wurzel: `src/inspectionRecord.js` als reine Funktion, dazu
  `speicherpfadtest.mjs` (echter Erzeuger -> echte Persistenz). Rot bei
  S11/S12, dann gruen.
- Neu bedienbar: Massnahme dokumentieren und QA-Genehmigung als getrennte
  Handlung mit zweiter Person. Erst damit ist der Vier-Augen-Fall anklickbar.

## 8.3.0-rc.4.1 – 2026-09-08

Sammelbuild nach der unabhaengigen Gegenpruefung von 8.3.0-rc.4. Kein
Funktionsumbau; `src/analysisCore.js` weiterhin byte-identisch zu RC3.

### Geaendert
- **Demo-Panel auf dem Anmeldeschirm standardmaessig ausgeblendet.** Es
  erscheint nur bei einem Build mit `VITE_DEMO_ACCESS=true`. Grund: ein per
  Klick bereitliegender QA-Manager-Zugang macht das Vier-Augen-Prinzip zur
  Formsache — eine einzelne Person erfuellt die Invariante durch zweimaliges
  Anmelden. Das Flag hebt die Huerde; es schuetzt die Zugaenge nicht, weil
  sie in `src/domain.js` und damit im Bundle stehen.
- Neue Pruefung `Z-01` in `ausschlusstest.mjs`: das Panel darf nicht
  unbemerkt wieder standardmaessig erscheinen.

### Dokumentation
- Manifest-Zaehlung eindeutig: 260 (16 Suiten) + 7 (`kalibrierung.mjs`,
  getrennt) = 267 Rohsumme. Die 7 waren vorher nur implizit.
- Abnahmedokument: die Vier-Augen-Invariante prueft zwei **Benutzerkonten**,
  nicht zwei **Personen**. Die tatsaechliche Trennung muss organisatorisch
  getragen werden, bis serverseitige Identitaet vorliegt. Der Satz gehoert in
  die SOP.

## 8.3.0-rc.4 – 2026-09-08

Gebaut aus `VisuClean_v8.3.0_RC3.zip` (SHA-256 `d62c510d…4038208`) nach
`PLANUNG_RC4_V2.2.md`. `src/analysisCore.js` ist byte-identisch zu RC3
(`ddc0b9fe…5793`) — keine Kernschwelle verschoben oder erfunden.

### Entschieden
- **Vier-Augen-Prinzip, Auslegung B**: `approvedBy` muss eine andere
  Benutzer-ID sein als `performedBy`. Die Planung hatte den Bau gesperrt,
  solange diese Frage offen war.

### Neu
- `src/lifecycle.js` — Zustandsmaschine mit acht Zuständen, Sperrwirkung bei
  offenem Pflichtpunkt, Bindung der QA-Genehmigung an die Datensatzrevision,
  finaler Integritätsanker (fehlend / doppelt / verwaist / falsche Revision).
- `src/decision.js` — Aufnahmeprofil, Handlungsarten, manuelle
  Feststellungen, Known-Issue-Zuordnung nur durch QA Manager.
- `src/references.js` — `LEGACY_NOT_COMPARABLE`, getrennt gespeichert und
  idempotent; der historische Datensatz bleibt bytegleich.
- `src/aiContract.js` — deaktivierte, anbieterneutrale Vertragsschnittstelle.
- `src/roi.js` — Geometrie-Ebene aus der Preview-Linie (`dea127bb`).
- Schema 3 in `src/persistence.js`: Prüfpunktlisten, Aufnahmeprofil, Zustand
  und Prüfer sind Pflicht; Schnappschuss-Schutz beim Speichern.

### Geändert — Ehrlichkeitskorrekturen
- Kratzer: nur noch `SCRATCH_DETECTED_ORIGIN_UNDETERMINED`, sichtbar als
  „Kratzer erkannt – neu oder bestehend nicht bestimmbar".
- Korrosion: „Dunkle Auffälligkeit / algorithmischer Korrosionsverdacht";
  bei unauffälligem Bild keine Behauptung der Abwesenheit mehr.
- Befundstärke: dimensionsloser Index statt Prozentwert.
- Abwischen ist keine Nachreinigung; ein Messwertunterschied erzeugt nur
  einen Konsistenzhinweis ohne QA-Trigger.

### Nachweis
- `RC3_ROTE_GEGENPROBEN.txt`: 26 Mängel am unveränderten RC3-Code belegt.
- `rc4gegenproben.mjs`: 33 Prüfungen, dass sie behoben sind.
- `ausschlusstest.mjs`: X-01 bis X-08.
- `roitest.mjs`: ROI-Geometrie und der ausgewiesene Füll-Effekt.

### Nicht enthalten
RoiPad-Oberfläche, Eingabemasken für Retakes und manuelle Feststellungen,
Befundregister. Offene Kalibrierungsfälle: Nässe-Erkennung (KO1–KO3),
Auflösungsabhängigkeit, ROI-Füll-Effekt. Nicht ausgeführt: manuelle
Browserprüfung mit Screenshots.

## 8.3.0-rc.3 – 2026-08-30

### Nachtrag: die Entscheidungsregeln erreichen jetzt tatsaechlich das Produkt

Beim Packen fiel auf, dass `assessment.js` und `scratchComparison.js` zwar
vollstaendig implementiert und mit 53 Tests belegt waren, aber von `App.jsx`
nie aufgerufen wurden. `buildCheckpoints`, `overallResult`,
`classifyScratches` und `crossCheckAssessment` fehlten deshalb restlos im
gebauten Bundle — die Oberflaeche zeigte weiterhin das RC2-Verhalten.

Behoben, additiv:

- `analyzeImage` in `App.jsx` berechnet die Pruefpunkte aus denselben
  Messwerten wie die drei Urteile (keine zweite Analyse, keine zweite
  Schwelle) und haengt sie an das Ergebnis.
- `aggregateResults` fasst sie ueber mehrere Fotos zusammen — Worst-Result-
  Wins gilt jetzt auch fuer den offenen Zustand: ein bestandenes Foto
  ueberdeckt ein nicht bewertbares nicht mehr. Ohne Pruefpunkte bleibt die
  Funktion unveraendert, das Feld ist rein additiv.
- `deriveSystemDecision` liefert kein automatisches PASS mehr, solange ein
  erforderlicher Pruefpunkt nicht bewertbar ist (`reason: "NOT_ASSESSABLE"`).
  Ein FAIL bleibt vorrangig.
- Der Ergebnisschirm und die Protokollansicht zeigen die fuenf Pruefpunkte
  einzeln mit Status, Grund, naechster Handlung und Messwerten; der offene
  Zustand hat eine eigene Farbe, damit er weder als Freigabe noch als
  Sperrung gelesen wird.
- Ein offener Pruefpunkt loest dieselbe Kommentarpflicht aus wie ein FAIL;
  die Freigabeschaltflaeche bleibt bis dahin gesperrt.
- Pruefpunkte stehen im signierten Datensatz (`stripResult`) und damit in
  Protokoll, JSON-Export und PDF.
- Eine bestaetigte Known-Issue-Toleranz entschaerft den Pruefpunkt Kratzer;
  Verschlechterung, fehlende Lokalisierbarkeit und nicht tolerierbare Codes
  entschaerfen nichts.
- Neue Suite `integrationtest.mjs` (I1-I16). Sie prueft den Weg, den die
  Anwendung wirklich geht, und dass die Entscheidungslogik im gebauten
  Bundle ankommt — genau die Luecke, die den Befund verdeckt hatte.

Keine Kernschwelle wurde dabei verschoben.

Grundlage: RC2, SHA-256 2476c993a4b233882e73d31633ca71a11817db1aa38e5ab67c418099f71bdda8.
RC2 blieb unveraendert.

### Entscheidungslogik (Verhaltensaenderung)

- Jeder Pruefpunkt traegt einen eigenen Status: PASS, FAIL oder
  NOT_ASSESSABLE (sichtbar: "Nicht bewertbar").
- Fuenf getrennte Pruefpunkte statt drei Sammelurteile: Feuchtigkeit,
  Rueckstaende, Kratzer, Korrosion, Oberflaechenstruktur. Bis RC2 lagen die
  letzten drei gemeinsam unter "Intakt" und konnten einander verdecken.
- Gesamtergebnis: ein FAIL sperrt; ein nicht bewertbarer Pflichtpunkt
  verhindert PASS; PASS nur, wenn alle erforderlichen Punkte bewertbar und
  bestanden sind.
- Jeder nicht bewertbare Punkt nennt Messwert, Schwelle, Verwerfungsgrund
  und naechste Handlung.
- Manuelle Ersatzpruefung mit Pruefpunkt, Begruendung, Methode, Benutzer und
  Zeitstempel. Ein FAIL kann so NICHT ueberschrieben werden.

### Behobener RC2-Fehler

Eine leicht unscharfe Aufnahme einer bestaetigt nassen Flaeche wurde als
"Keine sichtbare Feuchtigkeit" gemeldet. Der Pruefpunkt Feuchtigkeit
wechselt jetzt auf "Nicht bewertbar". Nachweis: assessmenttest A7.

### Kratzer

- Klassifikation gegen eine freigegebene Vergleichsaufnahme: neu vermutet,
  neu bestaetigt, bestehend, vergroessert, Known Issue, nicht bestaetigt,
  nicht bewertbar.
- Ohne geeignete Referenz lautet die Anzeige "Kratzer erkannt - neu oder
  bestehend nicht bestimmbar."
- Ein neuer Kratzer wird nie automatisch zum Known Issue. Freigabe nur
  durch die Rolle QA Manager mit vollstaendiger Signatur.
- Vollstaendiger Dokumentationssatz: Originalfoto, Overlay, Equipment, Zone,
  Zeit, Benutzer, Position, Messwerte, Status, Begruendung.

### Optionale Firmen-KI

- Standardmaessig deaktiviert, ohne Zugangsdaten lauffaehig. Ein Schalter
  allein genuegt nicht, es braucht einen Adapter.
- Widerspruch fuehrt zur dokumentierten manuellen Entscheidung mit Quelle,
  Benutzer, Zeit und Begruendung. Die KI ueberschreibt nie stillschweigend.
- Ein lokal nicht bewertbarer Punkt bleibt nicht bewertbar, auch wenn die
  KI PASS meldet.

### Versionskonsistenz

package.json, package-lock.json, src/domain.js, public/sw.js, PDF-Ausgabe,
QR-Etiketten, Manifest-Kopf und Testausgaben nennen dieselbe Version;
versiontest.mjs prueft alle acht Quellen. Behoben: package-lock stand auf
rc.1, das PDF nannte v8.2, der Manifest-Generator und eine Testausgabe
nannten RC1, die Acceptance-Datei hiess noch RC1.

Die Format- und Speicherkennungen visuclean-export-v8.2 und visuclean-v82
bleiben UNVERAENDERT - sie identifizieren das Format, nicht die Anwendung.
Der Export traegt zusaetzlich appVersion. Bestehende RC1/RC2-Daten bleiben
lesbar.

### Testsystem

- schaerfetest.mjs wurde durch kalibrierung.mjs ersetzt. Getrennte Zaehlung:
  bestanden, bekannte Einschraenkung, offene Kalibrierung. Die frueheren
  S3-S6 zaehlen nicht mehr als Erfolg.
- Neu: assessmenttest.mjs (23), scratchtest.mjs (15), aitest.mjs (15).
- Stand: 199 bestanden, 0 durchgefallen, 1 bekannte Einschraenkung,
  3 offene Kalibrierungsfaelle.

### Unveraendert

Keine Kernschwelle wurde verschoben. Kein Math.random in der Analyse. Keine
externe Bilduebertragung im lokalen Standardbetrieb. Kein SOP-QR-Code.

### Offen

Die Naesse-ERKENNUNG auf unscharfen Aufnahmen ist nicht geloest und bleibt
eine Kalibrierungsaufgabe mit Realdaten. Eine einzelne Schaerfeschwelle
traegt nicht: das unscharfe nasse Bild (gradMean 0.0322) liegt unter der
scharfen trockenen Kontrollaufnahme (0.0355).

## 8.3.0-rc.2 – 2026-08-29

Ergebnis einer unabhaengigen Gegenpruefung von rc.1. Keine Schwelle wurde
verschoben, kein Urteil geaendert — ergaenzt wurde ausschliesslich
Sichtbarkeit und Regressionsschutz.

### Befund

Die Naesse-Erkennung der beigelegten Realbilder laeuft ausschliesslich ueber
`VISIBLE_MOISTURE_TEXTURE` (`gradMean > 0.055` UND `edgeFrac > 0.08`); der
Reflexionsweg traegt nicht, weil `bfr` bei rund 0.005 liegt. Beide
Bedingungen haengen an der Bildschaerfe. Gemessen an
`wet-stainless-wide.png`: bereits eine Kastenunschaerfe mit Radius 1 senkt
`gradMean` von 0.0734 auf 0.0322 und `edgeFrac` von 13.3 % auf 3.5 %.
Dieselbe bestaetigt nasse Flaeche wird dann als "Keine sichtbare
Feuchtigkeit" gemeldet, und auch der Intakt-Befund verschwindet, obwohl
`tvFlat` mit 0.0366 weiter ueber seiner Schwelle 0.0200 liegt. Der
vorhandene Unschaerfe-Hinweis greift erst bei `gradMean < 0.006` und damit
rund eine Groessenordnung zu spaet.

Eine reine Schaerfeschwelle behebt das nicht: das unscharfe nasse Bild
(0.0322) liegt unter der scharfen trockenen Kontrollaufnahme (0.0355). Eine
Schwelle, die den einen Fall verwirft, verwirft den anderen mit.

### Aenderungen

- unterdrueckte Intakt-Befunde werden ausgewiesen: liegt `tvFlat` oder
  `vdfr` ueber seiner Schwelle, fehlt aber die Kantenstuetzung
  (`edgeFrac <= 0.06`), nennt das Ergebnis den Messwert und den Grund der
  Verwerfung — symmetrisch zum bereits vorhandenen Hinweis auf der
  Sauber-Seite. Rein additiv, kein Urteil aendert sich.
- neue Suite `schaerfetest.mjs` (S1-S10) haelt die gemessene Grenze fest,
  damit sie dokumentiert ist und sich nicht stillschweigend aendern kann.
  S3 bis S6 halten ausdruecklich eine BEKANNTE GRENZE fest, keinen
  Sollzustand.
- `npm run verify` und `npm test` schliessen die neue Suite ein.

### Offen

Die Schaerfeabhaengigkeit selbst ist nicht behoben. Eine belastbare Loesung
braucht entweder eine Aufnahmequalitaets-Pruefung vor der Analyse oder einen
Referenzbildvergleich — beides setzt die ausstehende Phase-1-Kalibrierung
mit Realdaten voraus und wird hier nicht geraten.

## 8.3.0-rc.1 – 2026-08-28

- reale Regressionstests für zwei bestätigte nasse Edelstahlbilder und eine trockene Kontrollaufnahme
- zusätzliche Erkennung sichtbarer dunkler Tropfen-/Feuchtigkeitsstruktur ohne helle Glanzpunkte
- konservativere Unterdrückung großflächiger Geometrie-/Beleuchtungsartefakte bei Sauber und Intakt
- PASS-Text präzisiert: bildbasierte Sichtprüfung, kein physischer Feuchtesensor
- Overlay auf die tatsächlich entscheidungsrelevanten Masken begrenzt
- getrennte Zwei-Engine-Schnittstelle vorbereitet; lokale Analyse aktiv, Firmen-KI standardmäßig deaktiviert
- keine allgemeine Leistungsvalidierung: RC1 bleibt ein nicht validierter Browser-Demonstrator

## 8.2.0 – 2026-08-26

### Fachlogik und Datenintegrität

- stabile Urteilscodes für sämtliche Trocken-/Sauber-/Intakt-Regeln
- Known Issues auf lokalisierte kosmetische Kratzer begrenzt; Korrosion, globale Textur, Rückstand und Feuchtigkeit technisch ausgeschlossen
- eindeutiges 1:1-Zonenmatching sowie Tagesende-Semantik für Gültigkeitsdaten
- kanonische SHA-256-Datensatzbindung und manipulationserkennbare Audit-Kette
- AES-GCM-256-verschlüsselte IndexedDB für Prüfungen, Referenzen, Known Issues und Audit
- append-only Speicherung signierter Prüfungen mit serverunabhängigen Invarianten für Signatur, Kommentare, Override, Licht, Fotos, Marker und Hash

### Bedienung

- Login und gesamte Navigation auf native, tastaturerreichbare Controls umgestellt
- QR-/Barcode-Scanner mit nativer Erkennung, gebündeltem `jsQR` und manueller Rückfallebene
- QR-Direktsprung zu Equipment/Zone sowie neun EAN-13-Demo-Aliasse
- Mehrfach-Aufnahmen 1–10, Thumbnail-Löschung, Fortschritt und Worst-Result-Wins
- Pinch/Drag, 1–4×-Zoom, Doppel-Tap, Reset und Marker mit Koordinaten/Einzelbewertung
- Referenzbild je Equipment/Zone und Soll-Ist-Vergleich
- Lichtprüfung, zweistufige Wischtest-Entscheidungshilfe und Speicherung im Prüfdatensatz
- restriktive QA-Known-Issue-Erstellung, Schließen und Verlängern jeweils mit Signatur
- PASS-/FAIL-/Override-Flows mit Pflichtkommentaren und Re-Authentifizierung
- Prüfprotokoll mit vier Filtern, lokalem Verschleißtrend und Detailansicht
- vollständige Deutsch-/Englisch-Umschaltung

### Dokumentation und Offline

- echte Einzel- und Sammel-PDFs mit Mehrfachfotos, Markern, Known Issues, Wischtest, Signatur und SHA-256
- entschlüsselter JSON-Export inklusive Audit-Verifikation
- installierbare PWA mit reproduzierbaren 192-/512-Icons und Offline-Cache
- druckbares, reproduzierbares A4-Blatt mit neun Equipment-QR-Codes (ECC M)
- Start-Selbsttest mit deterministischer Kalibrierabweichung ≤2 Prozentpunkte

### Qualität

- `eslint-plugin-jsx-a11y` aktiviert und Lint-Warnungen auf Fehlerniveau gehoben
- 120 automatisierte Gegenbeweise in sechs Suiten
- `npm run verify` prüft Artefakte, Lint, Tests und Build
- Production-Abhängigkeiten und gesamter Dependency-Baum mit `npm audit` ohne bekannte Schwachstellen

### Bewusste Grenzen

Der Stand bleibt ein Browser-Demonstrator. CoreML, Produktionsvalidierung, zentrale Identität/2FA, qualifizierte Synchronisation/Archivierung, native Gerätespeichergrenzen und formale OQ/PQ sind nicht Bestandteil dieses Pakets.
