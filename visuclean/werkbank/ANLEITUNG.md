# Werkbank — trainieren, anwenden, nachjustieren

Diese Anleitung beschreibt die drei Werkzeuge im Ordner `werkbank/` und die
externe Screening-Konfiguration. Sie gehört zum Kratzer-Screening der
VisuClean-App.

> **Was das Screening ist und was nicht.**
> Es markiert Verdachtsstellen und sortiert sie nach Auffälligkeit. Es trifft
> **keine GMP-Freigabeentscheidung** und kann kein PASS erzeugen. Es kann
> ausschließlich hinzufügen und sortieren — nie ein Urteil ändern oder einen
> Befund entfernen. Die verbindliche Bewertung erfolgt durch Sichtprüfung,
> bei Bedarf durch kalibrierte Messung (Ra/Tiefe).

---

## Überblick

| Werkzeug | Zweck |
|---|---|
| `werkbank/messreihe.mjs` | Aufnahmen → Merkmalstabelle (CSV) + Richtungshistogramm |
| `werkbank/train_rf.py` | gelabelte CSV → `modell.json` + Merkmalsgewichte |
| `werkbank/aufloesungsvergleich.mjs` | misst, was beim Verkleinern verlorengeht |
| `public/screening.config.json` | Schwellen ohne neues Release nachjustieren |

---

## 1 · Aufnahmen sammeln

Bevor irgendetwas gerechnet wird, entscheidet die Datenqualität das Ergebnis.

**Verlustfrei speichern — PNG, kein JPEG.** Die Messreihe weist JPEG
ausdrücklich zurück: die Blockartefakte der Kompression erzeugen genau die
Mikrokanten, an denen die Kratzer- und Nässemerkmale hängen. Ein JPEG-Artefakt
ist für den Detektor nicht von einem feinen Kratzer zu unterscheiden.

**Volle Kameraauflösung.** Gemessen am Vergleichslauf: bei 40 % Verkleinerung
überleben von den zehn auffälligsten Stellen nur noch zwei.

**Etwa 20 unabhängige Aufnahmen je Klasse.** Unabhängig heißt: verschiedene
Teile, Abstände und Beleuchtungen — nicht dasselbe Teil aus vielen Winkeln.
Bei einem Dutzend Merkmalen findet sich sonst fast jede Trennung, auch eine
zufällige. Das Skript sagt diese Einschränkung bei jedem Lauf an.

**Klasse im Dateinamen.** Die Messreihe liest sie aus dem Namen; ohne
erkennbare Klasse steht `UNBEKANNT` in der Tabelle.

---

## 2 · Messreihe fahren

```bash
node werkbank/messreihe.mjs <bildordner> --csv merkmale.csv
```

Erzeugt zwei Dateien:

- **`merkmale.csv`** — je Kandidat eine Zeile: Kernmerkmale der Aufnahme, die
  drei Urteile, Schliffrichtung und Richtungsstärke, dann die sechs
  Modellmerkmale, dazu **beide Rangfolgen** (`relevanz_ungerichtet`,
  `rang_ungerichtet`). Eine Aufnahme ohne Kandidaten bleibt als Zeile stehen —
  ein Bild ohne Befund ist ein Datenpunkt, kein Nichts.
- **`merkmale_richtungshistogramm.csv`** — je Aufnahme alle Winkelfächer, die
  zwei stärksten Richtungen und ihr Abstand. Bewusst eine eigene Datei: im
  Prüfdatensatz wären 36 Zahlen je Aufnahme Ballast.

Das Trennzeichen ist `;` und steht auf beiden Seiten der Kette als benannte
Konstante — JavaScript schreibt und Python liest denselben Wert.

---

## 3 · Von Hand labeln

Zwei Spalten sind leer und müssen gefüllt werden:

| Spalte | Inhalt |
|---|---|
| `label` | `1` = relevant · `0` = harmlos |
| `label_quelle` | `TASTSCHNITT` · `REPLIKA` · `SICHTPRUEFUNG` · `MIKROSKOP` |

**`REGEL` wird zurückgewiesen.** Ein Wald, der auf den Ausgaben der eigenen
Regel trainiert, lernt die Regel — nicht die Wirklichkeit. Er sähe in der
Kreuzvalidierung hervorragend aus und wäre wertlos. Das Trainingsskript bricht
ab, wenn diese Quelle auftaucht.

Leer gelassene Zeilen heißen „noch nicht gelabelt" und werden übersprungen,
nicht als `0` gewertet.

---

## 4 · Tabelle prüfen, bevor trainiert wird

```bash
python3 werkbank/train_rf.py --daten merkmale.csv --spaltencheck
```

Prüft nur die Spalten gegen den Merkmalsvertrag — **ohne scikit-learn**, also
auch auf einem Rechner ohne Trainingsumgebung. Meldet Zeilenzahl, Merkmalszahl
und wie viele Zeilen gelabelt sind.

Spaltenvertrag und Labelvertrag sind getrennt: eine frisch gemessene Tabelle
ist naturgemäß ungelabelt und soll den Spaltencheck trotzdem bestehen.

---

## 5 · Trainieren

```bash
python3 werkbank/train_rf.py --daten merkmale.csv --modell modell.json
```

Optional: `--baeume 200` · `--tiefe 8` · `--seed 20260911`

Die Ausgabe enthält:

- **Beispielzahl und Klassenverteilung** — eine schiefe Verteilung ist ein
  Warnzeichen, kein Detail.
- **Labelquellen** — welche Messverfahren die Wahrheit geliefert haben.
- **F1 kreuzvalidiert, Mittel ± Streuung.** Die Kreuzvalidierung läuft
  **vor** dem Endtraining. Eine große Streuung heißt: zu wenige oder zu
  ähnliche Daten.
- **Merkmalsgewichte** — welches Merkmal wie stark trägt. Für ein Audit ist
  das die Erklärbarkeit; für Sie ist es die Warnung, wenn ein einziges Merkmal
  alles bestimmt.

`modell.json` enthält Merkmalsreihenfolge, Klassennamen, die Bäume als flache
Knotenarrays, die Merkmalsgewichte und den Trainingsbericht.

**Warum JSON und nicht joblib:** die Inferenz läuft im Browser
(`src/scratchClassifier.js`), vollständig on-device. Dort ist kein joblib
ladbar.

**Die Klassen heißen `ATTENTION_LOW` und `ATTENTION_HIGH`** — nicht
„tief/relevant" und „Mikro/harmlos". Tiefe ist aus einem Foto nicht messbar,
und ein Klassenname, der sie behauptet, wandert ins Protokoll und wird dort
zur Aussage. Die Namen beschreiben ausschließlich, wie stark eine Stelle
Aufmerksamkeit verdient.

---

## 6 · Modell einhängen

Der Klassifikator ist ohne Modell **inert** und mischt sich in nichts ein:

- `loadModel(null)` → `NO_MODEL`
- Modell ohne Bäume → `EMPTY_MODEL`
- abweichende Merkmalsreihenfolge → `FEATURE_ORDER_MISMATCH`

Der letzte Fall ist der wichtige: passt `featureOrder` im Modell nicht zum
Vertrag im Code, wird das Modell **verweigert**, nicht auf verschobenen
Spalten ausgewertet. Zahlen auf falschen Spalten sehen plausibel aus.

Ändert sich der Merkmalsvertrag, müssen alle Modelle neu trainiert werden.

---

## 7 · Schwellen nachjustieren

Datei: **`public/screening.config.json`** — wird zur Laufzeit geladen, geprüft
und angewandt. Kein neues Release nötig.

| Feld | Vorgabe | Wirkung |
|---|---|---|
| `edgeThreshold` | `0.18` | ab welcher Kantenstärke ein Pixel zählt |
| `tileSize` | `32` | Kachelgröße der Beleuchtungsebnung |
| `minComponentPixels` | `12` | kleinste zusammenhängende Struktur |
| `grindToleranceDeg` | `15` | Winkelfenster um die Schliffrichtung |
| `slenderReference` | `4` | ab welchem Längen-Breiten-Verhältnis „schlank" gilt |
| `maxDimension` | `1024` | Laufzeitgrenze für die lange Bildkante |
| `orientationBins` | `36` | Zahl der Winkelfächer |

**Alle sieben sind Stellwerte, nicht validierte Schwellen.** Sie steuern die
Aufmerksamkeit, nicht die Richtigkeit — deshalb sind sie vertretbar, obwohl
sie nicht an Realdaten belegt sind.

**Was bei Unsinn passiert:** jedes Feld wird einzeln geprüft. Unplausible
Werte werden **einzeln verworfen und benannt** (`AUSSERHALB_BEREICH`,
`KEINE_GANZE_ZAHL`, `KEINE_ZAHL`, `UNBEKANNTES_FELD`); die übrigen greifen.
Es gibt kein stillschweigendes Ignorieren und kein Alles-oder-nichts.

**Was bei Abrufproblemen passiert:** es greifen die paketgebundenen Werte —
**mit Begründung** im Feld `quelle`, nie stillschweigend.

**Der SHA-256 der wirksamen Fassung steht im Datensatz und im PDF.** Eine
spätere Änderung deutet damit keine gespeicherte Prüfung um; sie erzeugt einen
anderen Hash.

> **Eine Zahl aus der Spezifikation wurde bewusst nicht übernommen:**
> `MIN_LAENGE`. Kurze Kandidaten werden *niedriger bewertet*, nicht verworfen.
> Stilles Wegwerfen ist in einer GMP-Prüfung die gefährliche Richtung — nicht
> filtern, sondern sortieren.

---

## 8 · Auflösungsvergleich

```bash
node werkbank/aufloesungsvergleich.mjs [bildordner]
```

Misst über vier Verkleinerungsstufen, wie viele Kandidaten bleiben und wie
viele der zehn auffälligsten Stellen an derselben Stelle wiedergefunden
werden.

Verschwundene Stellen sind **nicht** „harmlos bewertet" — sie sind
weggerechnet, bevor überhaupt bewertet wird.

Die Richtungsstärke ist nur bei **gleicher Winkelfächerzahl** vergleichbar;
deshalb steht die Fächerzahl überall neben ihr.

---

## Grenzen — nicht als Fehler melden

- **Keine belegte Trefferquote.** Es gibt bislang kein trainiertes Modell und
  keine Zahl zu Sensitivität oder Spezifität.
- **Keine Tiefenangabe.** Aus einem Frontalfoto folgt keine Kratzertiefe. Es
  gibt kein Merkmal, keine Klasse und keinen Text, der eine behauptet.
- **Keine Aussage über Alter oder Harmlosigkeit** eines Befundes aus einer
  Einzelaufnahme.
- **Keine Längenangabe in Millimetern.** Das Etikettenmaß von 43 mm ist ein
  Nennmaß aus dem Druck-CSS und nicht vermessen.
- **Die Richtungsschätzung ist nicht kalibriert.** Auf einem realen Bauteil
  lag ihre Stärke bei 0,049 — unter dem Wert einer Fläche ganz ohne
  Vorzugsrichtung (0,056). Deshalb ordnet die Anzeige voreingestellt **ohne**
  Richtungsabwertung; die gerichtete Rangfolge bleibt umschaltbar.

---

## Was die Gegenproben absichern

`node screeningtest.mjs` — darunter:

- `SC-01` / `SC-02` — das Screening kann kein Urteil ändern und keinen Befund
  entfernen
- `SC-17` — die Messreihe schreibt die Spalten aus dem Merkmalsvertrag
- `SC-18` — die Kette JavaScript → CSV → Python wird **ausgeführt**, nicht nur
  gelesen; fehlt `python3`, gilt sie als *nicht ausgeführt*, nicht als
  bestanden
- `SC-19` — kein Klassenname behauptet Tiefe oder Harmlosigkeit
- `SC-22` — die gespeicherte Spitze enthält **beide** Rangfolgen vollständig
- `SC-23` — die sieben Stellwerte stehen auf ihren dokumentierten Zahlen; eine
  Verschiebung bleibt möglich, aber nicht nebenbei
