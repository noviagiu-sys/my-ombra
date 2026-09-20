# Kontrast und Riefentiefe — Messwerkzeug

**Stand 15.09.2026 · Werkbank, nicht Teil der App**

Dieses Dokument gehört zu `werkbank/kontrastmessung.mjs` und
`werkbank/kontrastauswertung.py`. Es beantwortet **nicht**, ob Kontrast die
Riefentiefe anzeigt. Es legt fest, *wie* gemessen und *wie* ausgewertet
wird, damit die Frage später überhaupt beantwortbar ist.

> **Eine zuverlässige Tiefenerkennung ist nicht nachgewiesen.** Aus einem
> Kontrastwert folgt keine Tiefe in Mikrometern. Der Beispielwert **17,0**
> ist keine App-Schwelle und wird nirgends als Voreinstellung geführt.
>
> **Die Vorgabegrenze `< 1,0 µm` ist eine Referenzgrenze für eine
> unabhängig gemessene Tiefe — keine Kontrastschwelle.** Wer sie als
> `--schwelle` einsetzt, vergleicht Mikrometer mit Gradientenbeträgen.

---

## 1 · Bestandsaufnahme

Geprüft am Arbeitsstand `8.3.0-rc.4.28`:

| gesucht | gefunden | Folge |
|---|---|---|
| CSV mit Kontrast und gemessener Tiefe | **keine** (`find . -name "*.csv"` → 0 Treffer) | neu erstellt, ausdrücklich als **Dummy** gekennzeichnet |
| Python-Auswerteskript für diese Frage | **keines** | `kontrastauswertung.py` neu erstellt |
| Python im Repository überhaupt | `werkbank/train_rf.py` (Random-Forest-Training) | anderer Zweck; Konventionen übernommen (`label_quelle`, Zurückweisung von Labels aus der eigenen Regel) |
| ein Kontrastmaß im Bestand | `edgeStrength` in `src/scratchScreening.js` | **nicht verwendbar — siehe Abschnitt 2.6** |

Es wurden **keine früheren Ergebnisse übernommen.** Alle Zahlen in diesem
Dokument stammen aus Läufen, die unten mit ihrer Ausgabe belegt sind.

---

## 2 · Festlegung der Kontrastberechnung

Vereinbart ist der **Mittelwert des Sobel-Gradientenbetrags innerhalb eines
Kratzer-Bereichs**. Die folgenden fünf Punkte legen fest, was das konkret
heißt — jeder davon verändert die Zahl.

### 2.1 Grauwertumwandlung und Vorverarbeitung

```
Y = 0,299·R + 0,587·G + 0,114·B      (Rec. 601 Luma)
```

auf den **gespeicherten sRGB-Werten**, **ohne Gamma-Linearisierung**.
Dieselbe Formel wie im Analyse-Kern, damit die Messung nicht auf einer
anderen Helligkeit rechnet als die App.

**Vorverarbeitung: keine.** Kein Weichzeichner, kein CLAHE, keine
Histogrammspreizung, **keine bildabhängige Normalisierung**. Das ist eine
ausdrückliche Festlegung, kein Weglassen aus Bequemlichkeit — siehe 2.6.

Eine gammalinearisierte Variante wäre physikalisch näher an der Beleuchtung
und ergäbe **andere Zahlen**. Sie wäre deshalb eine eigene Entscheidung und
keine stille Zugabe.

### 2.2 Sobel-Kernel und Gradientenbetrag

```
       ⎡-1  0  1⎤          ⎡-1 -2 -1⎤
Gx  =  ⎢-2  0  2⎥    Gy =  ⎢ 0  0  0⎥      |∇| = √(Gx² + Gy²)
       ⎣-1  0  1⎦          ⎣ 1  2  1⎦
```

Der **1-Pixel-Rand wird nicht berechnet und nicht mit 0 aufgefüllt.** Eine
Nullfüllung erfindet an jedem Bildrand eine Kante; ein Kratzer am Rand
bekäme einen Wert, der aus dem Rand stammt und nicht aus ihm. Randpixel
zählen auch **nicht in den Nenner** des Mittelwerts.

### 2.3 Skalierung

Der theoretische Höchstwert auf 8-Bit-Grauwerten:

```
|Gx|max = |Gy|max = 4 · 255 = 1020
|∇|max  = √(1020² + 1020²) = 1442,4977…
```

**Die gewünschte Skala 0–255 ist eine Darstellungswahl, keine Eigenschaft
der Messung.** Es gibt drei benannte Skalen; der Name steht in **jeder**
Ausgabezeile (Spalte `kontrast_skala`):

| Skala | Rechnung | Bereich | Eigenschaft |
|---|---|---|---|
| `roh` **(festgelegt 13.09.2026)** | keine | 0 … 1442,4977 | Einheit: Grauwertstufen je Pixel |
| `g255` | `\|∇\| / 5,656854` | 0 … 255,0 exakt | verlustfrei, nur andere Einheit |
| `g255_begrenzt` | je Pixel `min(\|∇\|, 255)`, dann mitteln | 0 … 255 | **verlustig** — alles über 255 wird eingeebnet |

`g255_begrenzt` existiert nur für die Zusammenarbeit mit einem fremden
Werkzeug, das 0–255 erwartet. Im Selbsttest `M4` ist der Verlust sichtbar:
eine Stufenkante von 1020 wird auf 255 eingeebnet.

**Eine Zahl ohne ihre Skala ist keine Angabe.**

> **Entscheidung des Auftraggebers vom 13.09.2026: die Rohskala bleibt.**
> `g255` und `g255_begrenzt` bleiben als benannte Umrechnungen bestehen,
> damit eine fremde Auswertung angeschlossen werden kann — die Messreihe
> läuft auf `roh`.

### 2.4 Bildauflösung

Gemessen wird standardmäßig in der **gespeicherten Auflösung**, ohne
Verkleinerung. Optional bringt `--kante N` das Bild auf eine maximale lange
Kante; der tatsächlich verwendete Wert steht als `bild_breite` /
`bild_hoehe` in jeder Zeile.

Das ist nicht kosmetisch: eine 1 Pixel breite Riefe verliert beim Halbieren
des Bildes etwa die Hälfte ihrer Amplitude. **Kontrastwerte aus
verschiedenen Auflösungen sind nicht vergleichbar.**

### 2.5 Herkunft und Abgrenzung des Kratzer-Bereichs

Zwei Quellen, die **nie gemischt** werden — das Werkzeug weist den
gleichzeitigen Aufruf von `--bereiche` und `--detektor` ab:

| `bereich_quelle` | Herkunft | Grenze |
|---|---|---|
| `MANUELL` | Rechtecke aus einer ROI-Datei, von Hand markiert | unabhängig vom Detektor; für den Gesamtweg zwingend |
| `DETEKTOR` | Bounding Box aus `screenScratches()` | **nicht unabhängig** — was der Detektor nicht findet, bekommt keinen Bereich und taucht in keiner Zeile auf |

Der Mittelwert über eine Bounding Box enthält auch **Hintergrund**. Das ist
die vereinbarte Größe; `kontrast_median` und `kontrast_p95` stehen daneben,
damit später sichtbar ist, ob ein kleiner Kratzer in einem großen Kasten
untergeht.

ROI-Dateiformat:

```csv
befund_id,minX,minY,maxX,maxY,befundart
F001,120,340,196,352,RIEFE
```

### 2.6 Befund: `edgeStrength` aus dem Bestand ist kein Kontrastmaß

`src/scratchScreening.js` liefert pro Kandidat ein `edgeStrength`. Es sieht
wie ein Kontrastwert aus und ist **doppelt bildabhängig**:

1. Es rechnet auf einem **CLAHE-normierten** Bild:
   `(lum − lokalerMittelwert) / max(0,02, lokaleStreuung)`
2. Der Sobel-Betrag wird anschließend durch das **Maximum desselben Bildes**
   geteilt (`scratchScreening.js`, Funktion `sobel()`, Zeile 188).

Ein Wert von `0,24` heißt damit *„24 % der stärksten Kante in diesem Foto"* —
nicht *„24 Grauwertstufen"*. **Zwei Fotos sind nicht vergleichbar**, und eine
feste Schwelle wie 17,0 hat darin keinen Sinn.

Das ist **kein Fehler im Screening**: dort ist die Normierung richtig, weil
dort innerhalb *eines* Bildes sortiert wird. Es heißt nur, dass `edgeStrength`
für diese Frage nicht taugt und der Kontrast eigens gemessen werden muss.

Der Selbsttest `M5` hält den Unterschied fest: eine starke Kante *anderswo im
Bild* verändert den gemessenen Wert der schwachen Kante **nicht** — genau
das kann `edgeStrength` nicht.

---

## 3 · Auswertung

`werkbank/kontrastauswertung.py`, nur Standardbibliothek, keine Installation.

**Was fest verdrahtet ist:** nichts. Korrelation und Konfusionsmatrix werden
aus den Daten gerechnet. Der Test
`test_dummy_korrelation_taucht_nicht_als_ergebnis_auf` prüft, dass die
angenommene Zahl 0,93 nirgends als Ergebnis erscheint.

**Was das Skript verweigert:**

* fehlende Werte durch 0 zu ersetzen — sie werden gezählt und benannt;
* eine Korrelation aus weniger als drei vollständigen Paaren (zwei Punkte
  ergeben immer r = ±1);
* eine Korrelation, wenn eine der beiden Größen keine Streuung hat
  (dann ist r nicht definiert — **nicht** 0);
* jede Kennzahl mit leerem Nenner → `nicht berechenbar`;
* Riefen und Krater stillschweigend zusammenzuwerfen;
* eine Behauptung auszugeben, die den eigenen Zahlen widerspricht.

### Die Falle aus dem Auftrag

Bei `TP=146, FP=5, TN=43, FN=6` gilt Recall 0,961 und Precision 0,967 —
und **sechs tiefe Kratzer wurden übersehen**. Das Skript schreibt diesen
Satz von sich aus unter jede Matrix mit `FN > 0` und bricht mit Exitcode 2
ab, wenn jemand die Gegenbehauptung mitliefert:

```
$ python3 werkbank/kontrastauswertung.py --daten … --schwelle 17.0 \
      --tiefgrenze 1.0 --behauptung "kein tiefer Kratzer uebersehen"
── Behauptung ──
  "kein tiefer Kratzer uebersehen"
  WIDERSPRUCH: FN ist die Zahl der uebersehenen tiefen Befunde — TP=146 FP=5 TN=43 FN=6
$ echo $?
2
```

---

## 4 · Vorbereitung der realen Messung

### Pflichtspalten

| Spalte | Bedeutung | warum zwingend |
|---|---|---|
| `teil_id` | physisches Bauteil | Gruppentrennung (siehe unten) |
| `bild_id` | Aufnahme | mehrere Aufnahmen je Teil |
| `befund_id` | Einzelbefund | verbindet Referenz und Kandidat |
| `befundart` | `RIEFE` \| `KRATER` | getrennte Auswertung |
| `kontrast` + `kontrast_skala` | Messwert und seine Skala | eine Zahl ohne Skala ist keine Angabe |
| `tiefe_um` | **unabhängig gemessene** Tiefe in µm | die Zielgröße |
| `tiefe_methode` | `TASTSCHNITT` \| `REPLIKA` \| `MIKROSKOP` | ohne Methode ist die Tiefe nicht bewertbar |
| `referenz_quelle` | wie der Befund erfasst wurde | `DETEKTOR` wird **abgewiesen** |
| `aufnahme_licht` | `NORMAL` \| `STREIFLICHT_LINKS` \| `STREIFLICHT_RECHTS` | Anschluss an P3 |
| `aufnahme_abstand_cm`, `aufnahme_winkel_grad` | Aufnahmebedingungen | Kontrast hängt daran |
| `bereich_quelle` | `MANUELL` \| `DETEKTOR` | siehe 2.5 |

### Die Tiefgrenze: belegt seit 15.09.2026

**Stand 15.09.2026: die Vorgabe nennt eine zulässige Kratz-/
Riefentiefe von `< 1,0 µm`.** Das ist die erste und bislang einzige Zahl in
diesem Projekt, die von außen belegt ist. Sie wird im Werkzeug als
`--tiefgrenze vorgabe` gesetzt; jede andere Zahl gilt als **frei gewählt** und
wird in der Ausgabe so ausgewiesen — sonst läse sich ein Probelauf mit 5 µm
später wie eine Prüfung gegen die hinterlegte Vorgabe.

> **Vorgeschichte, weil sie die Prüfungen erklärt.** Am 13.09.2026 lautete
> die Auskunft „1,0 mm". Der Unterschied zur richtigen Zahl beträgt drei
> Größenordnungen und kehrt die Machbarkeit um: 1 mm wäre eine Kerbe, 1 µm
> liegt unterhalb der Rauheit des Schliffs. Deshalb prüft `evaluateDepth­Measurement`
> in der App die **Einheit** und rechnet `mm` nicht stillschweigend um
> (Gegenprobe `D9b`).

#### Der Operator gehört zur Grenze

`< 1,0` und `≤ 1,0` sind nicht dasselbe, und der Unterschied ist an diesen
Daten messbar: in `dummy_kandidaten.csv` liegen **drei von 200 Zeilen** genau
auf 1,00 µm. Mit `<` zählen sie als tief (TP 146), mit `≤` nicht (TP 143).
Drei Treffer hängen an einem Zeichen — deshalb steht der Operator als
`GRENZOPERATOR` im Code und in jeder Matrixausgabe, statt in einem
Vergleichszeichen zu verschwinden.

#### Eingeteilt wird erst, wenn das ganze Intervall auf einer Seite liegt

| Lage | Urteil |
|---|---|
| `oben < 1,0` | NICHT_TIEF |
| `unten ≥ 1,0` | TIEF |
| sonst (Intervall schneidet die Grenze) | **GRENZFALL — nicht eingeteilt** |

Grenzfälle stehen **außerhalb** der Konfusionsmatrix und werden eigens
gezählt. Und sie entwerten Vollständigkeitsaussagen: `FN = 0` allein trägt
den Satz „kein tiefer Kratzer übersehen" nicht mehr, solange Grenzfälle
offen sind (`pruefe_behauptung`, Gegenprobe
`test_nichts_uebersehen_ist_mit_grenzfaellen_nicht_haltbar`).

#### Das Werkzeug ist weicher als der Entscheidungspfad — mit Absicht

Fehlt in einer CSV-Zeile die **Messunsicherheit** oder das **Messmittel**,
teilt das Werkzeug die Zeile trotzdem ein, **zählt sie aber getrennt und
benennt sie** (`ohne_unsicherheit`, `ohne_methode`). Es ist ein
Forschungswerkzeug und muss Daten verarbeiten, die es vor der unabhängigen
Messung schon gibt; die Minimalform `id,kontrast,tiefe_um` bleibt erlaubt.

**In der App gilt das Gegenteil:** `src/depthLimit.js` entscheidet ohne
vollständige unabhängige Messung überhaupt nicht (`NOT_MEASURED` mit
`missing`-Liste). Beide dürfen verschieden streng sein — solange beide
sagen, was ihnen fehlt.

Die alte Dreiteilung gilt unverändert weiter:

| Was | braucht `--tiefgrenze` |
|---|---|
| **Kontrast erfassen** (`kontrastmessung.mjs`) | nein — das Werkzeug kennt keine Tiefe |
| **Kontinuierliche Auswertung** (`--daten` ohne `--schwelle`) | nein — Wertebereiche, Pearson r, Spearman ρ, ganz ohne Klassen |
| **Einteilung „tief / nicht tief" und Konfusionsmatrix** | **ja, zwingend** — `--schwelle` ohne `--tiefgrenze` wird abgewiesen |

Die kontinuierliche Auswertung gibt **bewusst keine Ausgleichsgerade** aus:
eine Geradengleichung liest sich wie eine Umrechnung von Kontrast in
Mikrometer, und genau die gibt es nicht. Der Test
`test_keine_umrechnung_in_mikrometer` hält das fest.

Neben Pearson steht **Spearman ρ**. Sie misst Monotonie statt Linearität —
für die Frage „steigt der Kontrast mit der Tiefe" ist das die ehrlichere
Zahl, und sie braucht keine Klassengrenze.

### Fehlende Referenztiefen heißen „nicht gemessen"

Nicht „unvollständig", nicht 0, nicht „flach". Fehlende Referenztiefe und
fehlender Messwert werden **getrennt gezählt und getrennt benannt** — sonst
wäre nicht mehr zu sehen, ob die Messung oder die Referenz fehlt:

```
  Zeilen gesamt                 5
  vollstaendige Paare           1
  Referenztiefe nicht gemessen  2
  Kontrast nicht gemessen       2
  Kontrast von/bis              22.4 … 22.4
  Tiefe von/bis (um)            nicht gemessen
```

Die Spalte `tiefe_um` darf **ganz fehlen**: Kontraste werden erfasst, bevor
die unabhängige Tiefenmessung vorliegt. Dann gilt jede Zeile als
*Referenztiefe nicht gemessen*.

### Gruppentrennung

Mehrere Aufnahmen desselben Teils gehören in **dieselbe** Gruppe. Sonst
steht dasselbe Teil in Entwicklung und Test, das Modell hat es schon
gesehen, und die Testzahl ist geschönt, ohne dass es auffällt.

```bash
python3 werkbank/kontrastauswertung.py --gruppen-pruefen entwicklung.csv test.csv
# Exitcode 2 bei Überschneidung, mit Nennung der teil_id
```

### Riefen und Krater getrennt

Andere Geometrie, andere Schattenbildung, andere Beziehung zwischen
Kantenkontrast und Tiefe. **Ergebnisse für Riefen belegen nichts über
Krater.** Das Skript berichtet je Befundart getrennt; ein gepoolter Wert nur
mit `--gepoolt` und ausgedruckter Warnung.

---

## 5 · Zwei getrennte Ergebnisse

Beide werden berichtet, nie nur eines:

**(a) Bewertung bereits gefundener Kandidaten** — `--daten`.
Wie gut trennt die Schwelle *unter denen, die der Detektor gefunden hat*?

**(b) Erkennung vom vollständigen Foto bis zum angezeigten Befund** —
`--referenz` + `--kandidaten`.
Eine Riefe, die der Detektor **gar nicht** gefunden hat, erzeugt **keine
Kandidatenzeile**. Wer nur (a) berichtet, sieht sie nie und bekommt eine
Trefferquote, die den halben Weg auslässt. Im Gesamtweg zählt sie als `FN`
und wird namentlich genannt.

Damit (b) etwas bedeutet, müssen die Referenzbefunde **unabhängig vom
Detektor** erfasst sein. Das Skript kann das nicht prüfen — es verlangt die
Spalte `referenz_quelle` und weist `DETEKTOR` mit Begründung zurück.

---

## 6 · Startanleitung

```bash
# 1 · Rechnung prüfen (analytisch bekannte Werte, braucht keine Daten)
node werkbank/kontrastmessung.mjs --selbsttest

# 2 · Kontrast messen — Bereiche von Hand markiert
node werkbank/kontrastmessung.mjs \
     --bild aufnahmen/T-101_B-1.png \
     --bereiche aufnahmen/T-101_B-1_roi.csv \
     --skala roh --ausgabe messung/T-101_B-1.csv

#    … oder Bereiche vom Detektor (nicht unabhängig, siehe 2.5)
node werkbank/kontrastmessung.mjs --bild foto.png --detektor --ausgabe k.csv

# 3 · Tiefe je befund_id aus der unabhängigen Messung ergänzen
#     (Spalten tiefe_um, tiefe_methode, referenz_quelle)

# 4 · Auswerten — Kandidatenbewertung
python3 werkbank/kontrastauswertung.py \
        --daten messung/T-101_B-1.csv --schwelle 17.0 --tiefgrenze 1.0

# 5 · Auswerten — Gesamtweg
python3 werkbank/kontrastauswertung.py \
        --referenz referenz.csv --kandidaten messung/T-101_B-1.csv \
        --schwelle 17.0 --tiefgrenze 1.0

# 6 · Gruppentrennung prüfen
python3 werkbank/kontrastauswertung.py --gruppen-pruefen entwicklung.csv test.csv

# 7 · Verhaltenstests
python3 werkbank/test_kontrastauswertung.py
```

Beispieldaten liegen in `werkbank/beispieldaten/` und tragen alle das
Präfix `dummy_` oder `fehler_`.

---

## 7 · Stand: implementiert / ausgeführt / ungeprüft

| | Stand |
|---|---|
| Kontrastberechnung (Grauwert, Sobel, Skalen, Bereich) | **implementiert und ausgeführt** — 7 Selbsttests gegen analytisch bekannte Werte, alle grün |
| Messung an einem realen Foto | **ausgeführt** — `dry-stainless-control.png`, 59 Bereiche, Skala `roh`: min 36,0 · Median 84,5 · max 557,0 |
| Auswertung (Korrelation, Matrix, Kennzahlen) | **implementiert und ausgeführt** — 32 Verhaltenstests, alle grün |
| Dummy-Zahlen reproduziert | **ausgeführt** — TP 146 / FP 5 / TN 43 / FN 6 → Precision 0,967 · Recall 0,961 |
| Zusammenhang Kontrast ↔ Tiefe | **ungeprüft** — es gibt keine Aufnahme mit unabhängig gemessener Tiefe |
| Tiefgrenze | **belegt seit 15.09.2026** — Vorgabe `< 1,0 µm`, im Werkzeug als `--tiefgrenze vorgabe`. Operator `<` ist Teil der Grenze |
| Tauglichkeit der Schwelle 17,0 | **ungeprüft** und auf der Skala `roh` unplausibel: an der einen gemessenen Aufnahme lag **kein einziger** der 59 Bereiche unter 17,0. Das sagt nichts über die richtige Schwelle — es sagt, dass 17,0 aus einer anderen Skala stammt |
| Kratererkennung | **ungeprüft** — es liegen keine Kraterdaten vor |
| Einbindung in die App | **nicht erfolgt und nicht vorgesehen.** 17,0 ist keine App-Schwelle |

---

## 8 · Was als Nächstes gebraucht wird

Vom Auftraggeber, nicht vom Werkzeug:

1. **Reale Aufnahmen** mit unabhängig gemessener Tiefe je Befund, samt
   Messmethode. Der Auftraggeber organisiert die Tiefenmessung getrennt.
2. ~~**Die Tiefgrenze** in µm~~ — **erledigt am 15.09.2026:**
   Vorgabe `< 1,0 µm`. Nicht erfunden, sondern belegt.

**Erledigt am 13.09.2026:** die Skala ist entschieden — `roh` bleibt.

### Was die 1,0 µm für die Messkampagne (P6) bedeutet

Die Grenze ist jetzt bekannt — und sie verschiebt die Anforderung an das
**Referenzmessmittel**, nicht an die App:

| | |
|---|---|
| Zu trennen ist | `< 1,0 µm` gegen `≥ 1,0 µm` |
| Dafür nötige Auflösung der Referenzmessung | **deutlich unter 1 µm**, sonst überlappt jedes Unsicherheitsintervall die Grenze und **jede** Zeile wird zum Grenzfall |
| In Frage kommende Verfahren | Tastschnittgerät, Weißlichtinterferometrie, konfokale Mikroskopie |
| Nicht in Frage kommt | jede Ableitung aus dem Foto — auch die dieser App |

**Die Messunsicherheit entscheidet mit.** Ein Gerät mit ± 0,5 µm
Unsicherheit erzeugt an dieser Grenze fast nur Grenzfälle: bei 1,2 ± 0,5 µm
reicht das Intervall von 0,7 bis 1,7 und liegt auf beiden Seiten. Vor der
Kampagne ist deshalb die Unsicherheit des Messmittels zu klären, nicht erst
danach — sonst steht am Ende eine Tabelle voller `GRENZFALL`.

**Die ehrliche Erwartung, vorab notiert:** 1,0 µm liegt in der Größenordnung
der Rauheit eines geschliffenen Edelstahls. Dass der Bildkontrast einer
Handyaufnahme dort trennt, ist unwahrscheinlich. Ein belegtes Nein ist ein
brauchbares Ergebnis — aber es rechtfertigt keine teure Kampagne, solange
nicht geklärt ist, ob die 1,0 µm überhaupt ein **Sichtprüfkriterium** ist
oder eine Oberflächenspezifikation des Bauteils, die bei der Qualifizierung
mit einem Rauheitsmessgerät geprüft wird. Diese Frage steht beim
Auftraggeber und ist mit rc.4.32 nicht beantwortet.

Der anschließende Arbeitsschritt **P3** (geführte Aufnahmen derselben
Prüffläche bei normaler Beleuchtung sowie Streiflicht links und rechts, mit
gespeicherten Originalbildern und eindeutiger Zuordnung) liefert die
Aufnahmen für Punkt 2. **Eine vollständige Aufnahmesequenz allein ist noch
kein Nachweis zuverlässiger Tiefen- oder Trockenheitserkennung.**
