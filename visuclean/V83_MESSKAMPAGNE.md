# Messkampagne Kratzertiefe — Datenvertrag und Prüfplan

**Stand 16.09.2026 · Fassung 1 · vor der ersten Messung geschrieben**

Dieses Dokument legt fest, **was** gemessen wird, **wie** die Messung einem
Befund zugeordnet wird und **woran** der bildbasierte Weg später gemessen
wird. Es entsteht bewusst **vor** den Daten: ein Annahmekriterium, das nach
den Zahlen formuliert wird, lässt sich nicht mehr widerlegen.

> **Was hier nicht steht: Zielzahlen.** Welche Verfehlungsrate, welcher
> Fehlalarmanteil und welcher Anteil unentschiedener Fälle zulässig sind, ist
> eine fachliche Festlegung des Auftraggebers und der QA. Sie bleibt in
> diesem Dokument ausdrücklich **offen** und wird nicht geschätzt. Jede
> Stelle, an der eine solche Zahl hingehört, trägt hier `OFFEN`.

Bezugsgröße ist die Zulässige Kratz-/Riefentiefe
**`< 1,0 µm`** (`src/depthLimit.js`, `DEPTH_LIMIT_UM`, Operator `<`).

---

## 1 · Die Stelle — was überhaupt gemessen wird

Eine Referenzmessung ohne eindeutig bezeichnete Stelle ist kein
Referenzwert. Foto und Messspur müssen **dieselbe** Riefe treffen, und das
muss später nachvollziehbar sein, nicht nur zum Zeitpunkt der Messung
plausibel.

### 1.1 Physische Markierung

Jede vermessene Stelle bekommt eine **dauerhafte, im Bild sichtbare
Markierung** und eine Kennung `markierung_id`. Die Markierung liegt **neben**
der Riefe, nie darauf — eine Markierung auf der Riefe verändert genau das
Merkmal, um das es geht.

Bezugsrahmen ist das gedruckte QR-Etikett (`src/registration.js`). **Achtung,
siehe Abschnitt 6:** die Entzerrung über die Etikettenecken gilt nur für
ebene Prüfflächen.

### 1.2 Messfenster

Das Messfenster ist der Bereich, in dem die Tiefe bestimmt wird: ein Rechteck
in Bauteilkoordinaten, dessen Lage relativ zur Markierung festgehalten wird
(`fenster_dx_mm`, `fenster_dy_mm`, `fenster_breite_mm`, `fenster_hoehe_mm`).

**Warum das nicht weggelassen werden darf:** die Tiefe einer Riefe schwankt
entlang ihres Verlaufs. Ohne festgelegtes Fenster misst der eine den Anfang
und der andere die Mitte, und beide Zahlen heißen „die Tiefe dieser Riefe".

---

## 2 · Was „Tiefe" bedeutet — die Messgröße

Das ist die Festlegung, an der eine Kampagne still scheitern kann.

### 2.1 Profilart und Filterkette — **offen, mit der Messtechnik abzustimmen**

> **Richtigstellung zur Fassung 1 vom 16.09.2026.** Dort stand, die übliche
> Filterung mit λc entferne eine schmale Riefe *wegen ihrer kurzen
> Wellenlänge*. **Das ist falsch.** λc ist die Grenzwellenlänge zwischen
> Rauheit und Welligkeit: der Rauheitsprofil-Filter entfernt die
> **langwelligen** Anteile und lässt die kurzwelligen stehen. Eine schmale
> Riefe wird von λc also gerade **nicht** weggefiltert.
>
> Ebenso war „ungefiltertes Primärprofil" keine eindeutige Bezeichnung: das
> Primärprofil P entsteht üblicherweise bereits durch einen **λs-Filter**,
> der sehr kurzwellige Anteile unterdrückt. „Ungefiltert" trifft darauf
> nicht zu.

**Was eine schmale Riefe tatsächlich gefährdet**, ist nicht λc, sondern die
Auflösung am kurzwelligen Ende der Kette:

| Einfluss | Wirkung auf eine schmale Riefe |
|---|---|
| **λs** (kurzwelliger Filter) | dämpft Strukturen unterhalb der Grenzwellenlänge |
| **Tastspitzenradius** bzw. laterale optische Auflösung | die Spitze taucht nicht bis zum Grund einer schmalen Riefe — der Messwert wird **zu flach** |
| **Antastkraft, Abtastschritt** | verändern, welcher Punkt überhaupt getroffen wird |
| **λc** | trennt Rauheit von Welligkeit; für eine schmale Riefe der am wenigsten kritische Punkt |

**Was daraus folgt, und was nicht.** Die Schlussfolgerung aus Fassung 1
bleibt richtig: **die gesamte Verarbeitungskette gehört dokumentiert** —
λs, λc, Filtertyp, Tastspitzenradius bzw. laterale Auflösung, Antastkraft
und Abtastschritt, je Messwert. An einer Grenze von 1,0 µm kann jeder
dieser Punkte über „darüber" oder „darunter" mitentscheiden.

**Welche Profilart maßgeblich ist, legt dieses Dokument NICHT fest.** Das
ist eine messtechnische Entscheidung und wird mit dem Messlabor
abgestimmt. Festgehalten wird sie in `profilart` samt der zugehörigen
Filterangaben.

### 2.1b Die folgenden Festlegungen sind Vorschläge

**Bezugslinie, Messfenster und „maximale Vertiefung" (2.2 bis 2.4) sind
vorgeschlagene Festlegungen dieses Dokuments — nicht automatisch die
Messmethode, die zur hinterlegten Grenze gehört.**

Wenn zu der Grenze von 1,0 µm eine bestimmte Messvorschrift gehört, gilt
diese. Dann sind die Abschnitte 2.2 bis 2.4 entsprechend zu ersetzen, und
die hier vorgeschlagenen Kennwerte entfallen. Solange keine solche
Vorschrift vorliegt, dienen sie als Ausgangspunkt für die Abstimmung — und
sind als Vorschlag zu lesen, nicht als gesetzte Methode.

Zu klären ist insbesondere:

- Welche Profilart und welche Filtereinstellungen die Messvorschrift nennt.
- Ob die Tiefe gegen eine örtliche Bezugslinie oder anders bestimmt wird.
- Ob das Maximum, ein Mittelwert oder ein anderer Kennwert maßgeblich ist.
- Mit welchem Messmittel und welcher Unsicherheit gemessen werden soll.

### 2.2 Bezugslinie *(Vorschlag)*

Die Tiefe wird gegen eine **Ausgleichsgerade über die ungestörte Oberfläche
beidseits der Riefe** gemessen, nicht gegen den globalen Profilmittelwert.
Der Bereich, aus dem die Ausgleichsgerade stammt, wird mitgeführt
(`bezugslinie`, `bezugsbreite_mm`).

Grund: eine gekrümmte oder geneigte Fläche verschiebt sonst den Nullpunkt,
und die Verschiebung geht vollständig in den Messwert ein.

### 2.3 Kennwert: das Maximum im Messfenster *(Vorschlag)*

**Vorgeschlagen ist die größte Tiefe im Messfenster**, nicht der Mittelwert und
nicht der Median.

Begründung aus dem Projekt selbst: Leitplanke 3 lautet **Worst-Result-Wins**.
Die Vorgabe begrenzt einen Schaden; für die Frage, ob dieser Schaden
zulässig ist, zählt seine tiefste Stelle. Ein Mittelwert über eine Riefe
verdünnt genau das.

**Median und Anzahl der Spuren werden zusätzlich erfasst** (`tiefe_median_um`,
`spuren_n`) — sie sind für die spätere Auswertung wertvoll, aber sie
entscheiden nicht. Welcher Kennwert in einer Zeile steht, sagt die Spalte
`tiefe_kennwert` ausdrücklich.

### 2.4 Spurführung *(Vorschlag)*

- **senkrecht zur Riefe**, nicht längs (`spur_winkel_grad` gegenüber der
  Riefenrichtung, Sollwert 90);
- mehrere Spuren über die Länge des Messfensters verteilt, Anzahl `OFFEN` —
  festzulegen mit dem Messlabor;
- die Spurlage wird relativ zur Markierung festgehalten, damit eine
  Wiederholungsmessung dieselbe Stelle trifft.

### 2.5 Messmittel und Unsicherheit

| | |
|---|---|
| Verfahren | Tastschnitt, Weißlichtinterferometrie oder konfokale Mikroskopie |
| Auflösung | deutlich unter 1 µm — Sollwert `OFFEN`, aber **die Unsicherheit muss deutlich kleiner sein als der Abstand des Messwerts zur Grenze**, sonst ist das Ergebnis `BOUNDARY_UNCERTAIN` |
| verpflichtend je Zeile | `messgeraet`, `messgeraet_aufloesung_um`, `tiefe_unsicherheit_um` |

**Rechenbeispiel zur Warnung, keine Zielvorgabe:** bei einer Unsicherheit von
± 0,5 µm liegt für jeden Messwert zwischen 0,5 und 1,5 µm das Intervall auf
beiden Seiten der Grenze — alle diese Befunde sind per Regel unentschieden.
Ein Gerät mit dieser Unsicherheit erzeugt genau im interessanten Band keine
verwertbaren Referenzwerte.

Die Unsicherheit ist **je Messwert** anzugeben, nicht einmal pauschal für die
Kampagne: sie hängt von Oberfläche, Neigung und Spurlänge ab.

---

## 3 · Zuordnung — Teil, Befund, Bilder, Spur, Messwert

Vier Ebenen, die eindeutig ineinander greifen müssen:

```
teil_id                 das Bauteil
  markierung_id         die physisch markierte Stelle darauf
    befund_id           die Riefe an dieser Stelle
      sequenz_id        die drei Aufnahmen derselben Stelle (P3)
        bild_id         eine Aufnahme, mit aufnahme_licht
      spur_nr           eine Messspur der Referenzmessung
```

**`befund_id` ist der Schlüssel, an dem Bild und Messung zusammenfinden.** Er
wird bei der Markierung vergeben — **nicht** vom Detektor, und nicht
nachträglich beim Auswerten.

### 3.1 Referenztabelle (`referenz.csv`)

Eine Zeile je Befund. Bestehende Spalten bleiben, neue sind markiert.

| Spalte | Bedeutung |
|---|---|
| `teil_id`, `markierung_id`, `befund_id` | Zuordnung |
| `befundart` | `RIEFE` oder `KRATER` — getrennt ausgewertet |
| `tiefe_um` | Messwert |
| `tiefe_kennwert` *(neu)* | `MAX` oder `MEDIAN`; maßgeblich ist `MAX` |
| `tiefe_median_um` *(neu)* | zusätzlich, nicht entscheidend |
| `tiefe_unsicherheit_um` | Unsicherheit **dieses** Werts |
| `tiefe_methode`, `messgeraet`, `messgeraet_aufloesung_um` *(neu)* | Messmittel |
| `profilart` *(neu)* | `P` oder `R` — mit der Messtechnik abgestimmt |
| `filter_lc_mm`, `filter_ls_um`, `filtertyp` *(neu)* | **Pflicht**, sobald gefiltert wird |
| `tastspitze_radius_um` bzw. `laterale_aufloesung_um` *(neu)* | **Pflicht** — hier, nicht bei λc, liegt die Gefahr für eine schmale Riefe |
| `antastkraft_mn`, `abtastschritt_um` *(neu)* | Verarbeitungskette vollständig |
| `bezugslinie`, `bezugsbreite_mm` *(neu)* | Nullpunkt der Tiefe |
| `spuren_n`, `spur_winkel_grad` *(neu)* | Spurführung |
| `fenster_*` *(neu)* | Lage und Größe des Messfensters |
| `referenz_quelle` | **niemals `DETEKTOR`** — wird vom Werkzeug abgewiesen |
| `gemessen_von`, `gemessen_am` *(neu)* | Person und Zeitpunkt |
| `im_bild_sichtbar` *(neu)* | `JA` / `NEIN` / `UNKLAR`, durch einen Menschen beurteilt |

### 3.2 Aufnahmetabelle (`aufnahmen.csv`) *(neu)*

Eine Zeile je Bild. Ohne sie ist später nicht rekonstruierbar, unter welchen
Bedingungen ein Merkmal entstanden ist.

`teil_id`, `markierung_id`, `sequenz_id`, `bild_id`, `aufnahme_licht`
(`NORMAL` / `STREIFLICHT_LINKS` / `STREIFLICHT_RECHTS`),
`aufnahme_abstand_cm`, `aufnahme_winkel_grad`, `bild_breite`, `bild_hoehe`,
`aufnahmeprofil_id`, `anleitungsversion`, `aufgenommen_von`, `aufgenommen_am`.

**Die drei Lichtpositionen einer Stelle teilen sich `sequenz_id`.** Das ist
die Voraussetzung dafür, die Änderung über den Lichtwechsel überhaupt als
Merkmal rechnen zu können (K5).

### 3.3 Kandidatentabelle (`kandidaten.csv`)

Unverändert wie bisher, plus `markierung_id`. Sie enthält, was der Detektor
**gefunden** hat — nicht, was da ist.

---

## 4 · Übersehene Schäden

**Ein Befund, den der Detektor nicht findet, erzeugt keine Kandidatenzeile —
und fehlt damit in jeder Auswertung, die nur Kandidaten betrachtet.** Das ist
die stille Lücke, die eine Trefferquote schöner macht, als sie ist.

Deshalb:

1. Die **Referenztabelle ist führend**, nicht die Kandidatentabelle. Jede
   markierte und vermessene Stelle steht dort, unabhängig davon, ob der
   Detektor sie gesehen hat.
2. Ein Referenzbefund ohne zugehörige Kandidatenzeile zählt als
   **übersehen** — und wenn er die Grenze überschreitet, als verfehlte
   Grenzüberschreitung.
3. `im_bild_sichtbar` wird von einem Menschen beurteilt und getrennt geführt.
   Ein Schaden, den auch ein Mensch im Bild nicht sieht, ist ein anderer Fall
   als einer, den der Detektor übersieht — beide zählen als übersehen, aber
   sie sagen Verschiedenes über die Ursache.

Das Werkzeug setzt das bereits um: `gesamtweg()` in
`werkbank/kontrastauswertung.py` rechnet über die Referenzbefunde und weist
`referenz_quelle = DETEKTOR` zurück.

---

## 5 · Prüfplan — vier Ausgänge, nicht zwei

### 5.1 Die Falle

Ein System, das fast alles als „unentschieden" zur manuellen Kontrolle
schickt, hat **null übersehene Grenzüberschreitungen und null Fehlalarme**.
Es sieht in einer Konfusionsmatrix makellos aus und ist wertlos.

**Deshalb ist der Anteil unentschiedener Fälle kein Nebenwert, sondern eine
Hauptkennzahl.** Er steht in jedem Bericht neben den Fehlerraten, nie ohne
sie und sie nie ohne ihn.

### 5.2 Die Kennzahlen

Jeder Referenzbefund fällt in genau einen von vier Ausgängen:

| Ausgang | Bedeutung |
|---|---|
| **richtig entschieden** | Aussage der App stimmt mit der Referenz überein |
| **übersehene Grenzüberschreitung** | Referenz ≥ 1,0 µm, App sagt „unter der Grenze" |
| **Fehlalarm** | Referenz < 1,0 µm, App sagt „überschritten" |
| **unentschieden** | App trifft keine Aussage (`BOUNDARY_UNCERTAIN`, `NOT_MEASURED`, ungeeignete Aufnahme) |

### Die vier Kennzahlen — Name, Rechnung, Zweck

Berichtet wird **immer als Satz, nie einzeln**. Jede Zahl trägt ihren
Nenner, denn derselbe Zähler bedeutet über verschiedenen Nennern
Verschiedenes.

| Name | Zähler | Nenner | Wozu sie dient | Was sie NICHT sagt |
|---|---|---|---|---|
| **Entscheidungsquote** | Befunde, zu denen die App eine Aussage trifft | **alle** Referenzbefunde | misst die Nützlichkeit: wie viel Arbeit die App überhaupt abnimmt | nichts über Richtigkeit |
| **Verfehlungsrate** | übersehene Grenzüberschreitungen | Referenzbefunde **≥ 1,0 µm** | die teuerste Fehlerart: ein Teil wird freigegeben, das nicht durfte | nichts über Fehlalarme |
| **Fehlalarmanteil** | Fehlalarme | Referenzbefunde **< 1,0 µm** | misst die Kosten: unnötige Nacharbeit und Nachmessung | nichts über Verfehlungen |
| **Anteil unentschieden** | Befunde ohne Aussage | **alle** Referenzbefunde | begrenzt die Ausweichlösung: ein System, das alles weiterreicht, hat null Fehler und keinen Nutzen | nichts über Richtigkeit der entschiedenen Fälle |

**„Übersehen" umfasst zwei Fälle, die getrennt gezählt werden:**

1. Der Detektor hat die Stelle **gar nicht angeboten** — der Prüfer hat sie
   manuell markiert (`markerId` statt `kandidatId` im Datensatz; in der App
   ist das `befundBilanz().uebersehen`).
2. Der Detektor hat die Stelle angeboten, die App hat sie aber **unter der
   Grenze** eingeordnet, obwohl die Referenz darüber liegt.

Beide zählen in die Verfehlungsrate. Sie getrennt auszuweisen ist nötig,
weil sie verschiedene Ursachen haben: der erste Fall ist ein Problem der
Erkennung, der zweite eines der Beurteilung.

**Rechenregel, die in jedem Bericht gilt:** Fehlerraten werden auf der
**entschiedenen** Teilmenge gerechnet und **ohne die Entscheidungsquote
nicht ausgegeben**. Eine Verfehlungsrate von 0 % bei einer
Entscheidungsquote von 5 % ist keine Leistung.

**Fehlerraten werden auf der entschiedenen Teilmenge gerechnet und ohne die
Entscheidungsquote nicht ausgegeben.** Eine Verfehlungsrate von 0 % bei einer
Entscheidungsquote von 5 % ist keine Leistung.

Zusätzlich getrennt auszuweisen:

- **je Befundart** — Riefen und Krater niemals zusammen;
- **im Band nahe der Grenze** (Vorschlag: 0,5 bis 2,0 µm), weil dort die
  Entscheidung fällt und eine Gesamtzahl über sehr flache und sehr tiefe
  Befunde die Leistung genau dort verdeckt;
- **je Lichtposition und je Aufnahmeprofil**, um zu sehen, ob die Leistung an
  den Aufnahmebedingungen hängt.

### 5.3 Zielwerte

| Kennzahl | zulässig |
|---|---|
| Verfehlungsrate | `OFFEN` |
| Fehlalarmanteil | `OFFEN` |
| Anteil unentschieden | `OFFEN` |
| Entscheidungsquote | `OFFEN` |

**Diese vier Felder werden vom Auftraggeber und der QA gefüllt, bevor der
Abschlusstest läuft.** Sie werden hier nicht geschätzt.

Ein Hinweis zur Gewichtung, ohne Zahl: die Fehler sind **nicht symmetrisch**.
Eine übersehene Grenzüberschreitung gibt ein Teil frei, das nicht
freigegeben werden durfte; ein Fehlalarm kostet Nacharbeit. Genauigkeit ist
deshalb die falsche Kennzahl.

### 5.4 Datentrennung

- Aufgeteilt wird **nach Teilen, nicht nach Befunden.** Mehrere Riefen
  desselben Teils gehören vollständig auf dieselbe Seite;
  `gruppen_ueberschneidung()` weist die Vermischung zurück (Exitcode 2).
- Der **Abschlusstestsatz wird einmal berührt** — für den Abschlusstest.
  Jede vorherige Auswertung auf ihm macht ihn zum Entwicklungssatz.
- Maßgeblich für die Belastbarkeit ist die Zahl **unabhängiger Teile**, nicht
  die Zahl der Befunde, und die **Besetzung des Bandes 0,5 bis 2,0 µm**. Ein
  Datensatz, in dem alles entweder 0,2 µm oder 30 µm tief ist, sagt über
  1,0 µm nichts — egal wie groß er ist.

---

## 6 · Einfrieren vor dem Abschlusstest

Vor dem ersten Zugriff auf den Abschlusstestsatz werden festgeschrieben und
**gehasht**:

| eingefroren | Nachweis |
|---|---|
| die Zielwerte aus 5.3 | SHA-256 dieses Dokuments in der ausgefüllten Fassung |
| das Modell samt Gewichten und Vorverarbeitung | SHA-256 der Modelldatei |
| die Merkmalsberechnung | SHA-256 der beteiligten Werkbank-Dateien |
| die Zuordnung Teil → Entwicklungs-/Testsatz | SHA-256 der Aufteilungsdatei |

Die Hashes stehen **im Bericht vor den Ergebnissen**. Ändert sich danach
etwas, ist es ein neuer Lauf mit neuem Testsatz — nicht derselbe Test mit
einer Korrektur.

---

## 7 · Ebenenannahme der Entzerrung

Die Registrierung über die QR-Etikettenecken
(`src/registration.js`) ist eine **Homographie**. Eine Homographie beschreibt
die Abbildung **einer Ebene** auf eine andere. Auf einer gekrümmten
Prüffläche gilt diese Annahme nicht: dieselbe Abbildung, die das ebene
Etikett korrekt entzerrt, verzerrt die gewölbte Fläche daneben — und zwar
umso stärker, je weiter man sich vom Etikett entfernt (`FIELD_FACTOR = 3`
deckt das Dreifache der Etikettenbreite ab).

**Das Rückprojektionsresiduum der vier Etikettenecken belegt das nicht.** Es
misst, wie gut die vier Punkte des *Etiketts* getroffen werden, und die
liegen definitionsgemäß in einer Ebene. Ein kleines Residuum ist mit einer
stark gekrümmten Umgebung vollständig verträglich.

**Folge für die Kampagne:** die Krümmung der Prüffläche wird je Stelle
erfasst (`flaeche_form`: `EBEN` / `GEKRUEMMT` / `UNBEKANNT`, bei
`GEKRUEMMT` zusätzlich `kruemmungsradius_mm`, soweit bekannt). Messwerte von
gekrümmten Flächen werden **getrennt ausgewertet** und nicht mit ebenen
zusammengeworfen.

Die Umsetzung in der App ist K4 und kommt gesondert.

---

## 7b · Was P3 belegt und was nicht

Der geführte Aufnahmeablauf (P3) ist Voraussetzung dieser Kampagne: ohne
drei Aufnahmen derselben Stelle gibt es keinen Lichtwechsel zu rechnen.
**Was bisher belegt ist und was nicht, ist auseinanderzuhalten:**

| | Stand |
|---|---|
| Ablauflogik, Reihenfolge, Ersetzen, Abweisung fremder Zonen | `sequenztest.mjs` `Q1`–`Q14`, ausgeführt |
| Speichern, Neuladen, Protokoll, Wiederholbarkeitsprädikat | `Q6`–`Q10`, ausgeführt — in jsdom gegen die **echte** Persistenz |
| Merkmalsrechnung für den Lichtwechsel | `riefenmerkmale.mjs` `Q1`–`Q10`, gegen **synthetische** Geometrie |
| **Der geführte Ablauf am Gerät** | **nicht belegt** |

Ein Werkbank-Modul für den Lichtwechsel belegt den Aufnahmeweg nicht, und
eine jsdom-Suite ersetzt keine Kamera. **Vor der Kampagne muss am Gerät
tatsächlich durchlaufen werden:** Normalaufnahme, Streiflicht links,
Streiflicht rechts, die Zuordnung der drei Bilder zur selben Stelle — und
die Wiederherstellung nach einem Neustart der App.

Dieser Lauf steht aus. Er ist die Vorbedingung dafür, Messdaten als
Trainingsgrundlage zu sammeln, nicht ein Nachweis, der nebenher entsteht.

## 8 · Was dieser Plan nicht leistet

- Er sagt **nicht**, dass eine Tiefe von 1,0 µm aus einer Handyaufnahme
  bestimmbar ist. Bei üblichem Prüfabstand deckt ein Pixel rund 50 µm ab;
  was im Bild überlebt, ist Lichtstreuung, nicht Geometrie. Die Streuung
  hängt außer von der Tiefe auch von Breite, Flankenwinkel und
  Schliffrichtung ab.
- Er ersetzt **keine Qualifizierung.** Selbst ein erfolgreicher Abschlusstest
  ist der Nachweis einer Messleistung an einem Prüfsatz, nicht die Freigabe
  eines Messmittels für den Routinebetrieb.
- Er beantwortet **nicht**, ob die 1,0 µm ein Sichtprüfkriterium sind oder
  eine Oberflächenspezifikation des Bauteils, die bei der Qualifizierung mit
  einem Rauheitsmessgerät geprüft wird. Diese Frage steht weiter beim
  Auftraggeber.
- Eine Modellschätzung ersetzt **heute keine unabhängige Messung**. Die App
  führt sie als eigene Herkunft `MODEL_ESTIMATE`, die die Prüfung in
  `evaluateDepthMeasurement` nicht erfüllt und deshalb niemals
  `WITHIN_DEPTH_LIMIT` erzeugt. Diese Grenze bleibt bestehen, bis eine
  nachgewiesene Messleistung vorliegt und die Regel bewusst geändert wird.
