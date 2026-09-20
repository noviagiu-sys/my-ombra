# VisuClean v8.3.0-rc.4.5 — Abnahmestand

> **RC4 ist ein Abnahmekandidat, kein freigegebenes System.** Dieses Dokument
> sagt, was gebaut wurde, was nachgewiesen ist und — ebenso wichtig — was
> **nicht** enthalten ist.

## Herkunft

| | |
|---|---|
| Ausgangspaket | `VisuClean_v8.3.0_RC3.zip`, 1 608 845 Byte |
| SHA-256 | `d62c510d03b5909753c8708a91688816d2722f29af2f9f1354b8756004038208` |
| Planung | `VisuClean_v8.3.0_RC4_Planung_V2.2.zip`, 31 218 Byte |
| SHA-256 | `9a4213671cd077b79b76cd583ab6e47faaa2a296f019b9531a8455bbdf9404e9` |

Die Arbeitskopie wurde **neu** aus dem RC3-ZIP erstellt (Planung Abschnitt 11,
Schritt 0). Ein früherer Vorgriff wurde ausdrücklich **nicht** als
Ausgangsstand verwendet.

**Der Analyse-Kern ist unverändert.** `src/analysisCore.js` trägt
byte-identisch denselben Hash wie in RC3:
`ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793`.
Keine Kernschwelle wurde verschoben, keine erfunden.

## Die eine Entscheidung, die der Auftraggeber getroffen hat

Die Planung V2.2 verbot ausdrücklich, das Vier-Augen-Prinzip eigenmächtig zu
entscheiden, und sperrte den Bau, solange die Frage offen war. Sie wurde am
**2026-09-08** beantwortet: **Auslegung B — Personenverschiedenheit
gefordert.**

```js
approvedBy.role === "QA Manager"
  && approvedBy.username !== performedBy.username
```

Die Entscheidung hängt an genau einer Konstanten
(`REQUIRE_DISTINCT_APPROVER` in `src/lifecycle.js`). Auslegung A wäre
derselbe Code mit `false`.

**Bekannte Grenze, die zur Entscheidung gehört:** In der statischen
Offline-App ist jede Rollen- und Personenprüfung eine **Workflow-Sperre**,
kein manipulationsgeschützter Zugriffsschutz. Anmeldung, Rollen und Signatur
liegen vollständig im Browserprofil. Eine Vier-Augen-Forderung erhöht die
organisatorische Nachvollziehbarkeit; sie ersetzt keine serverseitige oder
IdP-gestützte Identität und keine geschützte elektronische Signatur.

**Was daraus für den Betrieb folgt — dieser Satz gehört in die SOP:** Die
Invariante prüft, dass zwei **Benutzerkonten** beteiligt sind. Sie kann nicht
prüfen, dass zwei **Personen** beteiligt sind. Die Demo-Benutzer stehen in
`src/domain.js` und damit im Bundle; wer sie liest, meldet sich nacheinander
als Prüfer und als Genehmiger an und erfüllt die Invariante formal. **Die
tatsächliche Trennung zweier Personen muss organisatorisch getragen werden**,
bis eine serverseitige oder IdP-gestützte Identität vorliegt. Ohne diese
organisatorische Regelung ist die Vier-Augen-Anforderung dokumentiert, aber
nicht durchgesetzt.

Ab **8.3.0-rc.4.1** ist das Demo-Panel auf dem Anmeldeschirm
**standardmäßig ausgeblendet**; es erscheint nur bei einem Build mit
`VITE_DEMO_ACCESS=true`. Das hebt die Hürde von „auf dem Anmeldeschirm
anklicken" auf „das Bundle durchsuchen". Es **schützt die Zugänge nicht** —
diese Formulierung ist bewusst gewählt, damit niemand das Flag für einen
Zugriffsschutz hält. Die Prüfung `Z-01` in `ausschlusstest.mjs` stellt
sicher, dass das Panel nicht unbemerkt wieder standardmäßig erscheint.

## Was nach 4.1 dazugekommen ist

### 4.32 — die Tiefengrenze `< 1,0 µm`

Der Auftraggeber nannte am 13.09.2026 eine zulässige Kratz-/Riefentiefe von
**1,0 mm** und korrigierte sie am 15.09.2026 auf **1,0 µm**, ausdrücklich mit
dem Operator `<`. Das ist die **erste von außen belegte Zahl** in diesem
Projekt — jede andere Schwelle hier ist ein unvalidierter Stellwert.

Eine belegte Grenze ist gefährlicher als gar keine: sie verführt dazu, sie an
eine Größe anzulegen, die sie nicht misst. 1,0 µm liegt rund zwei
Größenordnungen unter dem, was eine Handyaufnahme in der **Bildebene**
auflöst (bei üblichem Prüfabstand deckt ein Pixel etwa 50 µm ab), und eine
Tiefe steht in einem Einzelfoto überhaupt nicht.

**Neues Modul `src/depthLimit.js`.** Vier Zustände, wie festgelegt:

| Lage | Urteil |
|---|---|
| kein vollständiger unabhängiger Messwert | `NOT_MEASURED` (mit `missing`-Liste) |
| ganzes Unsicherheitsintervall `< 1,0` | `WITHIN_DEPTH_LIMIT` |
| ganzes Unsicherheitsintervall `≥ 1,0` | `DEPTH_LIMIT_EXCEEDED` |
| Intervall schneidet 1,0 | `BOUNDARY_UNCERTAIN` |

`WITHIN_DEPTH_LIMIT` betrifft **ausschließlich** das Tiefenkriterium;
`grantsRelease()` liefert für **jeden** Zustand `false` (`D17`).

**Sechs Pflichtangaben, getrennt gespeichert:** Messwert, Einheit,
Messmittel, Messunsicherheit, Zeitpunkt, ausführende Person — dazu die
**unveränderte Original­eingabe** (`raw`). Wer „0,85" eingetippt hat, findet
„0,85" wieder, neben dem gelesenen Wert `0.85` (`D20`).

**Die Einheit wird geprüft.** `mm` wird *nicht* stillschweigend umgerechnet
(`D9b`) — genau diese Verwechslung trug dieses Projekt zwei Tage lang durch
die Planung.

**Kontrast bleibt ein Aufmerksamkeitswert.** `opticalDepthHint()` liefert
höchstens `OPTICAL_DEPTH_CHECK_RECOMMENDED` und trägt `valueUm: null` sowie
`decision: NOT_MEASURED` — über die ganze Kantenstärkenskala hinweg (`D15`).
Die neue Ausschlussprüfung `X-13` verbietet zusätzlich jede µm-Angabe in der
Nähe eines Kontrastbegriffs im ausgelieferten Code.

**Zwei Befunde, die diese Arbeit selbst gefunden hat:**

1. **Gleitkomma ist an dieser Grenze zu ungenau.** Von 999 Paaren, deren
   Untergrenze `wert − unsicherheit` dezimal **exakt 1,000** ergibt, liefern
   **208** in double-Arithmetik `0,9999999999999999` — sie fielen in
   `BOUNDARY_UNCERTAIN` statt in `DEPTH_LIMIT_EXCEEDED`. Die Abweichung ging
   in die sichere Richtung, falsch war sie trotzdem. Behoben durch exakte
   Dezimalrechnung mit skalierten Ganzzahlen; eine Epsilon-Toleranz wäre eine
   erfundene Zahl an der einen belegten Grenze gewesen (`D11b`).
2. **Zwei tote Konstanten waren eine offene Tür.** `DEPTH_CLASS` in
   `decision.js` trug `SURFACE_ONLY_SUSPECTED` und `DEPTH_SUSPECTED` — nie
   vergeben, aber der fertige Platz für genau die Behauptung, die aus einem
   Bildkontrast nie folgen darf. Entfernt.

**Die Speichergrenze rechnet nach, statt zu glauben.** `persistence.js`
verlangte bis rc.4.31 `depthStatus === NOT_MEASURED` und `depthValue === null`.
Jetzt gilt: der gespeicherte Status muss aus der **beigelegten Messung
folgen** (`depthStatusMatchesMeasurement`), und eine Zahl ohne vollständige
unabhängige Messung wird weiter abgewiesen (`rejectsNumericDepth`). Die Regel
wurde dadurch nicht weicher, sondern zweiseitig — `T-34` verlangt jetzt
beides: bloße Zahl abgewiesen, belegte Messung angenommen.

**Werkbank:** `--tiefgrenze vorgabe` setzt die belegte Grenze; jede andere Zahl
wird als *frei gewählt* ausgewiesen. Grenzfälle stehen außerhalb der
Konfusionsmatrix und entwerten Vollständigkeitsaussagen: `FN = 0` trägt den
Satz „kein tiefer Kratzer übersehen" nicht mehr, solange Grenzfälle offen
sind.

**Was der Operator wert ist, in Zahlen:** in `dummy_kandidaten.csv` liegen
drei von 200 Zeilen genau auf 1,00 µm. Mit `<` zählen sie als tief
(TP 146), mit `≤` nicht (TP 143). Drei Treffer an einem Zeichen — deshalb
steht der Operator im Code, im Protokoll und auf dem Bildschirm.

**Ausdrücklich nicht belegt:** dass eine Tiefe von 1,0 µm mit einer
Handyaufnahme feststellbar wäre. Sie ist es nicht. Offen beim Auftraggeber
bleibt, ob die 1,0 µm ein **Sichtprüfkriterium** ist oder eine
Oberflächenspezifikation des Bauteils, die bei der Qualifizierung mit einem
Rauheitsmessgerät geprüft wird.

### 4.2 — der Speicherpfad war tot

Die manuelle Browserprüfung fand, was 268 grüne Zusicherungen nicht fanden:
**Speichern war unmöglich.** `persistence.js` verlangte `schemaVersion: 3`,
während `App.jsx` weiter einen RC3-Datensatz baute. Der einzige Test, der
`saveInspection` aufrief, baute sein Objekt von Hand — eine Fixture
bestätigt, dass der Vertrag in sich stimmt, nie dass die Anwendung ihn
erfüllt.

Behoben an der Wurzel: der Datensatzbau liegt jetzt in
`src/inspectionRecord.js` als reine Funktion, und `speicherpfadtest.mjs`
treibt den **echten** Erzeuger durch die **echten** Domänenfunktionen in die
**echte** Persistenz. Er war rot (S11/S12) und ist grün.

Dazu zwei Bedienelemente, ohne die der Abweichungspfad nicht erreichbar war:
**Massnahme dokumentieren** auf dem Ergebnisschirm und ein eigener
**QA-Genehmigungsschirm**, der eine andere Person mit Benutzername und
Passwort anmeldet. Erst damit ist der Vier-Augen-Fall anklickbar.

### 4.3 — elektronische Signatur statt Zeichnung

Die gezeichnete Unterschrift ist entfallen. Sie war nie eine Kontrolle:
„Pfadlänge ≥ 20 px" belegt eine Fingerbewegung, sonst nichts — und im
Reinraum mit Handschuhen ist sie ohnehin nicht reproduzierbar.

An ihre Stelle tritt, was 21 CFR Part 11 §11.200 verlangt: **zwei
Identifikationskomponenten**, Benutzerkennung und persönliches Passwort,
festgehalten als `method: "USER_ID_PASSWORD"` mit
`components: ["userId", "password"]`. §11.50 bleibt erfüllt — Name, Rolle,
Zeitpunkt und die **Bedeutung** der Handlung stehen in Datensatz, Anzeige
und PDF. Das PDF trennt seit 4.3 zusätzlich **Prüfer und Genehmiger**
(T-38). Ältere Datensätze mit gezeichneter Unterschrift bleiben lesbar; die
neue Regel gilt nur beim Schreiben.

Gegenproben: `S13` weist eine Signatur mit nur einer Komponente ab, `S14`
eine blosse Zeichnung.

**Die Grenze bleibt bestehen und verschärft sich sogar:** eine Signatur ist
nur so belastbar wie die Zuordnung zur Person. Solange vier geteilte
Demo-Zugänge im Bundle liegen, ist jedes Passwort ein geteiltes Passwort.
Persönliche Zugangsdaten brauchen einen echten Benutzerspeicher und liegen
ausserhalb dieses Demonstrators.

### 4.5 — zwei Befunde aus der Browserprüfung

**Der Signatur-Zeitstempel war nicht an den Datensatz gebunden.** `finalize`
las die Uhr für die Signatur, `buildInspectionRecord` ein zweites Mal für den
Datensatz. Millisekunden dazwischen — und die Invariante blockierte jedes
Speichern. Behoben durch `signInspection()`: eine Zeitquelle, an beide Stellen
durchgereicht. Gegenproben `S15` und `S16`.

Bemerkenswert daran: **derselbe Fehlermechanismus wie 4.2.** Erzeuger und
Aufrufer waren sich uneins, und der bestehende Test konnte es nicht sehen,
weil er beiden Seiten denselben festen Zeitstempel übergab. Ein Test, der
seine Eingaben zu weit vereinheitlicht, prüft die Zusammensetzung nicht mehr.

**Der Kamerastream startete unzuverlässig.** Anhängen in einem einzelnen
`requestAnimationFrame` nach `setCameraOpen(true)`; lief der Callback vor dem
React-Commit, war das Videoelement noch nicht da und die Zuweisung fiel still
aus. Jetzt ein Effekt auf `cameraOpen`, und `play()`-Fehler werden angezeigt
statt verschluckt. Gegenprobe `U11` — **quelltextbasiert**; ob der Stream auf
einem echten Gerät erscheint, kann nur die Browserprüfung belegen.

### 4.4 — dieses Dokument

Das Abnahmedokument war in 4.2 und 4.3 nicht nachgezogen worden: falscher
Titel, veraltete Zählung, kein Wort zu den Änderungen. Aufgefallen ist es
beim Nachsehen im ausgelieferten Paket. Ein Abnahmedokument, das den Stand
nicht beschreibt, ist schlimmer als keines — es sieht aus wie ein Nachweis.

### 4.27 — zwei Befunde aus dem Gerätelauf vom 12.09.2026

**1 · Prozentzeichen an einer Rohgröße.** Länge und Breite der
Screening-Kandidaten standen als „23,6 %" und „1,37 %" in Tabelle und
Protokoll. Beide sind Anteile der kurzen Bildkante. Die Vereinbarung „kein
Prozent an einer Rohgröße" bestand seit rc.4.20, war aber nur an der Stelle
umgesetzt, an der sie ausgesprochen wurde. Behoben in Anzeige und Protokoll,
mit benanntem Bezug. Neue Gegenproben `U26` und `P12`; beide greifen über die
ganze Anzeige beziehungsweise über beide Spalten, nicht über eine einzelne.

**2 · Das Screening erreichte den Entscheider nicht.** Die Kandidatenliste war
ausschließlich in der Detailansicht eines **gespeicherten** Datensatzes
sichtbar — also erst nach der Signatur. Wer am Ergebnis-Bildschirm steht,
kann noch nachsehen, nachfotografieren oder ablehnen; genau dort fehlte sie.
Bestand seit rc.4.19 und war nie benannt. `U22` hat es nicht bemerkt, weil es
nur die Detailansicht rendert: eine Gegenprobe prüft nur den Bildschirm, den
sie aufruft. Neu: `U27`, und `screeningUebersicht()` als **eine** Quelle für
Bildschirm, Datensatz und Protokoll — sonst laufen zwei Fassungen
auseinander, ohne dass es jemand merkt.

Beide Befunde sind Anzeige- und Dokumentationsfehler. Kein Urteil, keine
Schwelle und kein gespeicherter Datensatz ändert sich dadurch; bereits
signierte Protokolle behalten ihren Wortlaut, weil sie append-only sind.

### 4.31 — Kandidaten identifizierbar und im Bild auffindbar

Zwei Befunde aus dem Gerätelauf vom 13.09.2026, beide in der Anzeige.

**1 · Zwei Ordnungen in einer Spalte.** Die Zeilen standen nach der
*ungerichteten* Relevanz, die Spalte „Rang" zeigte aber den Platz der
*gerichteten*. Der erste Eintrag trug damit etwa die 36 — und keine der
beiden Zahlen war beschriftet. Jetzt drei getrennte Spalten: **Position**
(laufend, wird bei jedem Sortierwechsel neu vergeben), **Kandidat** (stabile
Kennung) und **Rang gerichtet** (der gespeicherte Platz). Dieselbe Trennung
im Protokoll (`P13`).

**2 · Kein Kandidat war im Bild auffindbar.** Zwei Ursachen, beide vorher
unbemerkt:

- Es gab **keine stabile Kennung**. Ein Kandidat war nur über seinen Platz
  greifbar, und der änderte sich beim Umschalten (`SC-25`).
- Die Bounding Boxes liegen im **intern verkleinerten** Screening-Bild
  (`maxDimension`), und diese Größe wurde nirgends mitgegeben (`SC-26`).
  Eine gespeicherte Box hatte damit **keinen Bezugsrahmen**. Die Frage
  „welche Stelle gehört zu 0,1562" war nicht beantwortbar — nicht schwer
  zu beantworten, sondern *nicht beantwortbar*.

Beides behoben: `kandidatId` wird vor der Relevanzsortierung nach der
Bildlage vergeben (deterministisch, unabhängig von beiden Rangfolgen),
`bildBreite`/`bildHoehe` stehen im Ergebnis und im Datensatz. Neue
Komponente `ScreeningMarkierung` zeichnet die Kandidaten ins Bild und hebt
den angetippten hervor (`T13`, `T14`).

**Ohne gespeicherte Bildmaße wird nichts gezeichnet** (`T15`) — ältere
Datensätze sagen das ausdrücklich, statt eine Markierung zu erfinden.

`ScreeningMarkierung` ist bewusst **getrennt** von `paintOverlay()`: das ist
die Analyse-Darstellung, die in Bildschirm, gespeichertem Bild und PDF
identisch sein muss. Die Kandidatenmarkierung ist eine zusätzliche Ansicht
am Bildschirm, wird nicht gespeichert und geht nicht ins Protokoll.

**Was damit noch nicht belegt ist:** ob die Stelle hinter dem höchsten
ungerichteten Wert tatsächlich der Riefe entspricht, die am Teil zu sehen
ist. Das ist der nächste Gerätelauf — und er sagt etwas über den Nutzen der
Sortierung, nichts über Tiefe.

### 4.30 — P3: geführter Aufnahmeablauf

Punkt 3 der Sechs-Punkte-Vorgabe. Drei Aufnahmen **derselben** Prüffläche:
normale Beleuchtung, Streiflicht links, Streiflicht rechts. Neue Suite
`sequenztest.mjs` mit vierzehn Gegenproben `Q1`–`Q14`.

**Ablauf.** Die Reihenfolge ist festgelegt und kommt aus
`src/aufnahmeSequenz.js`, nicht aus einer Zählung in der Oberfläche — sonst
gäbe es zwei Auffassungen davon, was als Nächstes dran ist. Der Bildschirm
nennt Schrittzahl, Lichtposition und die Anleitung dazu. **Die Analyse ist
gesperrt**, solange eine Position fehlt (`Q12`) — als Sperre, nicht als
wegklickbarer Hinweis.

Bewusst **derselbe** Aufnahmebildschirm und kein zweiter: Kamera, Hochladen,
Marker und das Stoppen des Streams gibt es damit nur einmal. Ein zweiter
Aufnahmebildschirm hätte früher oder später eine eigene Kamerafassung — und
die Wettlaufsituation aus rc.4.5 ein zweites Mal.

**Speicherung.** Jedes Originalbild trägt seine Lichtposition; der Datensatz
trägt Zone, Reihenfolge, Foto-Zuordnung, Zeitpunkt und die
**Anleitungsfassung** (`Q6`, `Q7`). Alles überlebt Speichern und Neuladen
bitgleich (`Q9`) und steht im Protokoll (`Q10`).

**Wiederholbarkeit** ist eine eigene, prüfbare Aussage — nicht „es lief
einmal durch". `wiederholbarkeit()` verlangt Zone, alle drei Positionen,
Reihenfolge, Anleitungsfassung **und je Aufnahme das Aufnahmeprofil**; fehlt
eines, sagt sie welches (`Q8`).

**Was P3 nicht ist.** Eine wiederholte Position **ersetzt** den Eintrag, der
erste Versuch bleibt im Datensatz sichtbar (`Q3`). Eine Aufnahme aus einer
anderen Zone, eine unbekannte Lichtposition und eine fehlende Foto-ID werden
**abgewiesen** (`Q4`), und eine aus mehreren Zonen zusammengesetzte Sequenz
zählt nicht (`Q13`) — sonst wäre P3 ein Schlüssel, der jedes Schloss öffnet.

**Ausdrücklich offen:** ob die Feuchtebeurteilung mit vollständiger Sequenz
**richtig** ist. Eine Sequenz erfüllt die Vorbedingung des Tors aus rc.4.26;
sie belegt keine zuverlässige Erkennung. Das kann nur die Messkampagne (P6)
zeigen. Der Satz steht so auf dem Bildschirm, im Protokoll und am Ende der
Suite.

### 4.29 — Messwerkzeug Kontrast/Riefentiefe, Nachtrag

Entscheidungen des Auftraggebers vom 13.09.2026, im Werkzeug umgesetzt:

- **Die Rohskala bleibt.** `g255` und `g255_begrenzt` bleiben als benannte
  Umrechnungen bestehen; gemessen wird auf `roh`.
- **Keine erfundene Tiefgrenze.** `--tiefgrenze` ist jetzt **nur** für die
  Einteilung „tief / nicht tief" und deren Konfusionsmatrix Pflicht.
  Kontraste erfassen und kontinuierlich auswerten geht ohne sie;
  `--schwelle` ohne `--tiefgrenze` wird abgewiesen.
- **Kontinuierliche Auswertung ohne Klassengrenze**: Wertebereiche,
  Pearson r und **Spearman ρ** (Monotonie statt Linearität). **Keine
  Ausgleichsgerade** — eine Geradengleichung läse sich wie eine Umrechnung
  von Kontrast in Mikrometer, und die gibt es nicht.
- **Fehlende Referenztiefen heißen „nicht gemessen"**, getrennt gezählt vom
  fehlenden Messwert. Die Spalte `tiefe_um` darf ganz fehlen.

41 Verhaltenstests (vorher 32). Das Werkzeug bleibt Werkbank; `npm test`
bleibt python-frei.

### 4.28 — die Screening-Anzeige durchgängig, und zwei neue Befunde

Nacharbeit auf Anforderung des Auftraggebers. Neue Suite
`screeninganzeigetest.mjs` mit zehn Gegenproben `T1`–`T10`; sie rendert die
echten Bildschirme in einem DOM, **bedient** sie (Sortierumschaltung per
`change`-Ereignis) und schreibt in die **echte** Persistenz.

**Darstellung.** Die Größenspalten heißen jetzt *Relative Länge* und
*Relative Breite* und tragen die Erklärung „Bezogen auf die kurze Kante des
analysierten Bildes. Keine physikalische Länge oder Tiefe." in
Ergebnisansicht, Prüfbericht und PDF. Im JSON bleiben die Zahlen unverändert
(`T2`).

**Fehlend ist nicht Null.** `?? 0` machte aus einem nicht gemessenen Wert
eine gemessene Null. Jetzt steht dort *nicht verfügbar*; eine echte Null
bleibt sichtbar Null (`T3`).

**Drei unterscheidbare Zustände.** *Berechnung läuft*, *Screening nicht
verfügbar* und *Keine Kandidaten gefunden* gaben bis rc.4.27 alle dasselbe
zurück: nichts. Ein leerer Bereich liest sich wie Entwarnung. Keiner der
Zustände sagt „keine Kratzer" (`T9`). Ein historischer Datensatz ohne
Screening-Daten sagt *Screening-Daten nicht gespeichert* und wird
**nicht nachgerechnet** — ein nachträglich erzeugtes Ergebnis wäre kein
Originalbefund.

**Historische Befundtexte.** Ein Datensatz, dessen gespeicherter Text noch
die Stoffbehauptung trägt, bekommt einen **abgesetzten** Hinweis daneben —
im Bildschirm als eigener Block, im PDF unter der Überschrift
*Nachträgliche Erläuterung*. Der Datensatz selbst und sein Hash bleiben
unangetastet (`T6`). Erkannt wird am **gespeicherten Text**, nicht am Datum
und nicht an `appVersion`: ein Erstellungsdatum belegt keine App-Version.

#### Zwei Befunde, die diese Nacharbeit erst zutage gefördert hat

**Das PDF trug die Ehrlichkeitskorrektur nicht.** `pdfExport.js` druckte
`verdict.message` roh, also den Text des Analyse-Kerns. Auf dem Bildschirm
lief derselbe Wert durch `verdictDisplay` und wurde richtiggestellt. Das
Protokoll behauptete damit „Organische Rückstände (braun/gelb)", während der
Bildschirm daneben „Warme Farbabweichung" zeigte — **dieselbe Fehlerklasse
wie die Korrektur selbst**: eine Richtigstellung, die nur dort greift, wo sie
bemerkt wurde. Behoben, Gegenprobe `T7`. Ebenso trug `EN_VERDICTS` in
`i18n.js` eine **eigene Kopie** des korrigierten Satzes; jetzt eine Quelle,
Gegenprobe `A34`.

**Überbreite bei 390 px — und nicht dort, wo sie vermutet wurde.** Die
Messung in einem echten Chromium (`werkbank/breitenmessung.mjs`) ergab
**492 px Seitenbreite bei 390 px Fenster**. Ursache war nicht die
Kandidatentabelle, sondern die **SHA-256-Zeile**: 64 Zeichen ohne Leerstelle,
ohne Umbruchregel. Die Tabelle sah nur nach der Ursache aus, weil sie das
Breiteste auf dem Bildschirm ist. Nach `overflow-wrap: anywhere` misst die
Seite 390 px; die Tabelle bleibt 797 px breit in ihrem eigenen, tatsächlich
scrollbaren Bereich von 330 px. Gegenprobe `T8` hält beide Regeln fest.

**Die Prozentregel wurde enger gefasst.** `U26` verbot in rc.4.27 *jedes*
Prozentzeichen in der Screening-Anzeige. Das greift zu weit: ein
nachvollziehbar bestimmter **Bildflächenanteil** („3,1 % warme Pixel") ist
eine andere Größe, und das Prozentzeichen ist dort die zutreffende Einheit.
`U26` prüft jetzt die vereinbarten Rohwerte — jede Zelle der
Kandidatentabelle und die Richtungsstärke —, und `U28` hält ausdrücklich
fest, dass der Flächenanteil sein Prozentzeichen behält.

**Grenze der 390-px-Messung:** gemessen wurde der gebaute Bildschirm in einem
Desktop-Chromium mit gesetzter Viewport-Breite. Das ist kein iPhone;
Schriftskalierung und Browserleisten können abweichen. Die Messung ersetzt
den Gerätelauf nicht — sie ersetzt die Behauptung. `playwright-core` ist
**keine** Paketabhängigkeit; `werkbank/breitenmessung.mjs` läuft deshalb
nicht in `npm test`.

---

## Der Weg nach dem Wiederöffnen durch die QA (Befund D, rc.4.45)

Ein gemeldeter Schadensverdacht sperrt PASS **und** Override (Leitplanke 11).
Nach der Übergabe an die QA konnte niemand ihn mehr beantworten: das
Klärungspanel gab es nur im Ergebnisbildschirm des Prüfers. Es blieb allein
die Sperrung — der Vorgang war eingemauert, und die Sperre damit schädlicher
als die Lücke, die sie schließt.

| ID | Prüfung | Ebene |
|---|---|---|
| Q1 | bei offenem Verdacht wird keine Freigabe angeboten | Regel |
| Q2 | Angebot und Entscheidung stimmen überein — nichts wird angeboten, was danach scheitert | Regel |
| Q3 | ein bestätigter Schaden erzeugt keinen normalen PASS-Weg | Regel |
| Q4 | nach dokumentierter Beurteilung ist die Freigabe wieder erreichbar; die Sperrung bleibt immer erreichbar | Regel |
| Q5 | die Beurteilung entsteht als eigener Datensatz, das Original bleibt Zeichen für Zeichen stehen | Erzeuger |
| Q6 | sie ist an die geprüfte Revision gebunden (`supersedesId`, `approvalRevisionHash`) | Erzeuger |
| Q7 | sie beantwortet den Verdacht, sie löscht ihn nicht — Grund und Antwort stehen nebeneinander | Erzeuger |
| Q8 | sie ist keine Freigabe: PENDING_QA, kein Ergebnis, eigene Signaturbedeutung (§11.50) | Erzeuger |
| Q9 | nur ein wartender Datensatz, nur eine gemeldete Stelle, nur mit Begründung | Erzeuger |
| Q10 | die Beurteilung kommt durch die Speichergrenze, das Original bleibt unverändert | Speichergrenze |
| Q11 | sie darf nichts anderes mitändern (hier: den Prüferkommentar) | Speichergrenze |
| Q12 | sie fügt keine Meldung hinzu und entfernt keine | Speichergrenze |
| Q13 | eine **Freigabe** darf Meldungen weiterhin nicht ändern — die neue Regel hat ihr Tor nicht mit aufgemacht | Speichergrenze |
| Q14 | eine Entscheidung, die auf einer Beurteilung aufsetzt, ist selbst keine | Erzeuger |
| D1 | im wiedergeöffneten Bericht steht kein Freigabeknopf, der später scheitern würde | Browser |
| D2 | die QA kann die gemeldete Stelle dort beurteilen | Browser |
| D3 | die Beurteilung ist eine Ergänzung: ein Vorgang mehr, eine Antwort mehr, eine offene Stelle weniger | Browser |
| D4 | nach beiden Antworten sperrt die Meldung nicht mehr; beide bleiben im Bericht lesbar | Browser |
| D5 | ein abgelöster Vorgang bietet gar keine Entscheidung mehr an | Browser |
| D6 | der angebotene QA-Entscheid hält bis in die Datenbank | Browser |
| D7 | der Export zeigt die ganze Kette: Original offen, zwei gebundene Beurteilungen, Entscheid | Browser |

Die Zustandsmaschine bekommt dafür **einen** neuen Übergang: PENDING_QA →
PENDING_QA, der einzige, der seinen Ausgangszustand behält. Er verlangt die
Kennzeichnung des Beurteilungsschritts, die QA-Rolle, Reauthentifizierung
und die Revisionsbindung; *welche* Antwort an *welcher* Stelle zulässig ist,
prüft die Speichergrenze (`pruefeKlaerungsDelta`), weil nur sie den
gespeicherten Vorgängerstand sieht.

**Was dabei NICHT gelockert wurde:** die kanonische Projektion der Freigabe.
Eine Freigabe bleibt eine Ableitung und darf keinen Inhalt ändern (Q13). Die
Beurteilung bekommt eine eigene, engere Projektion plus eine eigene Regel —
nicht dieselbe Regel mit einer Ausnahme.

---

## Nachweiskette: rot vor grün

Die Planung verlangt: *„Ein Test, der nie rot war, gilt nicht als Nachweis
einer Reparatur."*

| Datei | Inhalt |
|---|---|
| `RC3_ROTE_GEGENPROBEN.txt` | 26 Mängel, am **unveränderten RC3-Quellcode** reproduziert |
| `rc4gegenproben.mjs` | 33 Prüfungen, dass genau diese Mängel behoben sind |
| `speicherpfadtest.mjs` | 14 Prüfungen des Speicherpfads Ende zu Ende; S11/S12 waren rot |

Beim Erstellen der roten Gegenproben wurden drei eigene Annahmen widerlegt
(falsche Funktionssignatur, zu weiter Regex, falsches Datenformat). Sie
wurden korrigiert — die Befunde nicht.

## Was RC4 hinzufügt

| Baustein | Datei | Wofür |
|---|---|---|
| Zustandsmaschine | `src/lifecycle.js` | acht Zustände, Übergangstabelle, Sperrwirkung, Vier-Augen, Anker-Invarianten |
| Entscheidungskette | `src/decision.js` | Aufnahmeprofil, Handlungsarten, Kratzer- und Korrosionsehrlichkeit, manuelle Feststellungen |
| Alt-Referenzen | `src/references.js` | `LEGACY_NOT_COMPARABLE`, getrennt und idempotent |
| KI-Vertrag | `src/aiContract.js` | anbieterneutral, **deaktiviert**, drei getrennte Kernpunkte |
| ROI-Geometrie | `src/roi.js` | aus der Preview-Linie (`dea127bb`) übernommen |
| Schema 3 | `src/persistence.js` | Datensatzvertrag, Schnappschuss-Schutz, finaler Integritätsanker |
| Datensatzbau | `src/inspectionRecord.js` | reine Funktion, damit Erzeuger und Vertrag nicht mehr auseinanderdriften |

### Die vier Ehrlichkeitskorrekturen

1. **Kratzer.** Der automatische Status ist ausschließlich
   `SCRATCH_DETECTED_ORIGIN_UNDETERMINED`. Es gibt kein `NEW`, `EXISTING`
   oder `GROWN` als automatische Klassifikation — aus einem Einzelbild folgt
   die Herkunft nicht. Sichtbar: *„Kratzer erkannt – neu oder bestehend nicht
   bestimmbar."*
2. **Korrosion.** Nur noch *„Dunkle Auffälligkeit / algorithmischer
   Korrosionsverdacht"*. Und in der Gegenrichtung: RC3 behauptete bei
   unauffälligem Bild *„Keine dunklen Flecken"* — eine Aussage über
   Abwesenheit, die der Algorithmus nicht tragen kann. RC4 sagt stattdessen,
   dass das **kein Nachweis der Abwesenheit von Korrosion** ist.
3. **Befundstärke.** Sie wird nicht mehr als Prozentwert dargestellt. Ein
   algorithmischer Index mit Prozentzeichen liest sich wie eine Messgröße mit
   Einheit. Der zugrunde liegende Anteil ist unverändert.

   **Nachtrag 8.3.0-rc.4.27 — die Korrektur war zu eng gefasst.** Sie wurde
   dort umgesetzt, wo sie ausgesprochen wurde: an der Befundstärke, später an
   der Richtungsstärke. Die **Länge** und **Breite** der Screening-Kandidaten
   standen weiter als „23,6 %" und „1,37 %" in Tabelle und Protokoll. Beide
   sind Anteile der **kurzen Bildkante**, keine Längen: dieselbe Riefe aus
   doppeltem Abstand ergibt den halben Wert. Seit rc.4.27 stehen dort
   Rohwerte mit benanntem Bezug. Die Gegenprobe prüft nicht mehr eine
   einzelne Spalte, sondern duldet **im gesamten Screening-Bildschirm kein
   Prozentzeichen** (`U26`) und im Protokoll keines an Länge oder Breite
   (`P12`) — damit derselbe Fehler nicht an der nächsten Stelle
   wiederkehrt.
4. **Abwischen ≠ Nachreinigen.** Ein Messwertunterschied zwischen zwei
   Aufnahmen erzeugt höchstens einen sichtbaren **Konsistenzhinweis**. Er
   klassifiziert `WIPED_AND_DRIED` nicht automatisch nach `RECLEANED` um und
   löst keinen QA-Trigger aus. Nur eine bewusst bestätigte Nachreinigung oder
   Rückstandsentfernung tut das — dauerhaft.

## Zählung

Stand 8.3.0-rc.4.45 (Lieferung A–F).

| | |
|---|---:|
| bestanden (26 Suiten ohne `kalibrierung.mjs`) | 635 |
| `kalibrierung.mjs`, getrennt gezählt | 7 |
| Rohsumme aller 27 Skripte | 642 |
| Bedienlauf im echten Browser, getrennt gezählt | 31 |
| fehlgeschlagen | 0 |
| bekannte Einschränkung | 1 |
| offene Kalibrierungsfälle | 4 |
| nicht ausgeführte Pflichtprüfung | 1 |

`npm ci` · `npm audit` (0 Schwachstellen) · `npm run verify` — Exit 0.

**Der Bedienlauf zählt getrennt, und zwar aus einem Grund.**
`werkbank/bedienlauf.mjs` fährt den gebauten Produktionsstand in Chromium
durch den echten Bedienweg und prüft den JSON-Export, den die App selbst
erzeugt. Er ist **nicht** Teil von `npm run verify`: Chromium und Playwright
gehören bewusst nicht zum Paket, damit `npm ci` ohne Browser-Download
durchläuft. Sein Ergebnis gehört trotzdem in jeden Übergabebericht — keine
reine Suite kann einen Bedienweg belegen. Die Lehre dahinter steht in
`X1`: eine Strukturwache, die die falsche Fundstelle trifft, meldet Grün
für eine Leitung, die es nicht gibt.

### Offene Kalibrierungsfälle — kein Erfolg

| # | Fall | Stand |
|---|---|---|
| KO1 | Leichte Unschärfe zerstört das Nässe-Signal | ungelöst |
| KO2 | Der Unschärfe-Hinweis greift zu spät | ungelöst |
| KO3 | Eine einzelne Schärfeschwelle ist keine Lösung | ungelöst |
| — | **Auflösungsabhängigkeit** | gemessen, ungelöst |
| — | **ROI-Füll-Effekt** | nicht gemessen |

**Auflösungsabhängigkeit:** dasselbe trockene Kontrollbild kippt allein durch
Verkleinerung, und der Verlauf ist **nicht monoton**. Mechanismus: das
Kratzertor `edgeFrac < 0.06 && tvFlat < 0.035` öffnet sich, weil Verkleinern
die Textur glättet. RC4 setzt deshalb **keine Mindestauflösung**. Ein nicht
gemessenes Aufnahmeprofil gilt als `NOT_MEASURED` und erzeugt weder ein
Qualitäts-PASS noch ein Qualitäts-FAIL.

**ROI-Füll-Effekt:** `copyRoiImageData` füllt alles außerhalb des ROI mit der
mittleren Farbe des Innenbereichs. Diese synthetischen Pixel gehen in
`tvFlat`, `edgeFrac` und `gradMean` ein — genau die Merkmale, an denen die
Kernschwellen hängen. Der Effekt ist nicht gemessen. **Konsequenz:** der
ROI-Zuschnitt beeinflusst in RC4 kein Qualitätsurteil
(`roitest.mjs`, R8).

### Nicht ausgeführte Pflichtprüfung

Die **manuelle Browserprüfung mit Screenshots** ist nicht ausgeführt. Sie
verlangt ein Gerät mit Kamera und einen Menschen davor; sie lässt sich in
dieser Umgebung nicht ersetzen. Sie zählt nicht als bestanden.

## Was RC4 ausdrücklich NICHT enthält

**Die RoiPad-Oberfläche** der Preview-Linie ist **nicht** portiert.
Übernommen ist ausschließlich `src/roi.js` als Geometrie-Ebene. Die
RoiPad-Komponente hängt an Preview-spezifischem Zustand
(`surfaceNotes`, `documentKind`, `findingDraft`); eine Portierung ohne
Browserprüfung wäre eine unbelegte Behauptung.

**Eingabemasken für manuelle Feststellungen** (neuer/vergrösserter Kratzer,
bestätigte Korrosion). Die Regeln sind auf der Durchsetzungsebene
vollständig — `saveInspection` weist eine unvollständige manuelle
Feststellung ab —, die Bedienelemente fehlen.

Seit 4.2 vorhanden und damit **nicht** mehr auf dieser Liste: die
Handlungsart (Massnahme dokumentieren) und die QA-Genehmigung als getrennte
Handlung.

**Das Befundregister** (Schaden- und Kratzerdokumentation über Prüfungen
hinweg, sodass bei der nächsten Kontrolle nur Neues erscheint) ist **nicht**
Teil von RC4. Es ist als eigenes Arbeitspaket geplant und setzt eine
Messkampagne voraus, die die Toleranz bestimmt — geraten wird sie nicht.

## Ausschlussprüfungen

| ID | Prüfung | Stand |
|---|---|---|
| X-01 | keine SOP-Suche, keine SOP-QR-Verlinkung | bestanden |
| X-02 | kein Tessera-Bezug | bestanden |
| X-03 | keine erfundene Tiefenangabe in Millimetern | bestanden |
| X-04 | kein Prozentzeichen an einer algorithmischen Rohgröße — Befundstärke, Richtungsstärke, relative Länge, relative Breite; Bildschirm und Protokoll. **Keine globale Sperre:** ein bestimmter Bildflächenanteil behält sein Prozentzeichen | bestanden (U24, U26, U28, P12, T2) |
| X-05 | keine externen Requests im lokalen Standardbetrieb | bestanden |
| X-06 | keine Kratzerklassifizierung aus einer Legacy-Referenz | bestanden |
| X-07 | kein `NEW`/`EXISTING`/`GROWN` als automatische Klassifikation | bestanden |
| X-08 | keine `window.*`-Funktion als Sicherheitsgrenze, keine Zugangsdaten | bestanden |
| Z-01 | Demo-Zugänge standardmäßig ausgeblendet | bestanden |

Zu X-08 eine benannte Ausnahme: die **Demo-Zugänge** stehen in
`src/domain.js` und damit im Bundle. Es sind keine Zugangsdaten für einen
externen Dienst, sondern die Benutzer des Demonstrators selbst. Das Panel auf
dem Anmeldeschirm ist seit 8.3.0-rc.4.1 standardmäßig aus (`Z-01`); die
Zugänge selbst bleiben im Bundle lesbar. Siehe den Abschnitt zum
Vier-Augen-Prinzip.

## Abgrenzung

Kein validiertes GMP-Produktivsystem. Native iOS/CoreML, zentrale Identität,
qualifizierte Synchronisation und Archivierung sowie formale OQ/PQ bleiben
Produkt-Zielarchitektur. Keine Aussage „GMP-konform" oder „Part-11-konform"
ohne formale Systemvalidierung.
