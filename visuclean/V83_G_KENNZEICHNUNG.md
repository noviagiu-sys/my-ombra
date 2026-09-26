# Befund G — Vorgesehene Kennzeichnungen: Messung und Änderungsvorschlag

Stand 8.3.0-rc.4.45. Dieses Dokument ist **kein Ergebnis und keine
Umsetzung**, sondern die Messung und der daraus abgeleitete Vorschlag. Der
Analyse-Kern ist dafür nicht angefasst worden:
`src/analysisCore.js` = `ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793`.

Werkzeug: `node werkbank/kennzeichnung.mjs`. Es zeichnet die Bilder mit den
vom Auftraggeber vorgegebenen Parametern und liest `computeFeatures()`,
`buildVerdicts()` und `screenScratches()` in ihren Standardparametern ab.

---

## 1 · Was gemessen wurde

Bild 480×640, Grundfläche R=G=B=180, Markierung R=G=B=60. QR `VC-EQ-TP`
(ECC M, 21 Module, 4 px/Modul, Ursprung 180/210). Text `ID1234` aus
3×5-Glyphen (5 px/Glyphenpixel, Abstand 20, Ursprung 160/240).

Die beiden Zusatzbefunde sind **nicht** vorgegeben und deshalb benannt:
ein warmer Fleck (150/120/70, Radius 45, Mitte 330/430) und eine dunkle
Linie (Wert 70, Breite 2, von 60/120 nach 140/470). Der Radius 45 ist ein
**Testparameter, keine Schwelle**: bei 18 und 30 fällt der Fleck für sich
allein gar nicht durch, ab 60 erzeugt seine Kante zusätzlich einen
Kratzerbefund und vermischt die Fälle.

| ID | Fall | Sauber | Intakt | Kandidaten |
|---|---|---|---|---:|
| A | saubere Fläche, ohne Kennzeichnung | PASS | PASS | 0 |
| B | saubere Fläche + QR | DARK_RESIDUE | PASS | 133 |
| C | saubere Fläche + Schrift | DARK_RESIDUE | PASS | 47 |
| D | nur Schmutzfleck | LOCAL_RESIDUE | PASS | 6 |
| E | QR + Schmutzfleck | LOCAL_RESIDUE | PASS | 104 |
| F | Schrift + Schmutzfleck | LOCAL_RESIDUE | PASS | 52 |
| G | nur Kratzer | PASS | SCRATCH_SUSPECT | 31 |
| H | QR + Kratzer | DARK_RESIDUE | SCRATCH_SUSPECT | 110 |
| I | Schrift + Kratzer | DARK_RESIDUE | SCRATCH_SUSPECT | 72 |
| J | QR + Kratzer direkt am Regionsrand | DARK_RESIDUE | SCRATCH_SUSPECT | 121 |

**B und C bestätigen die Zahlen des Auftrags** (133 und 47) gegen den
unveränderten Kern.

Drei Ablesungen, die über die Tabelle des Auftrags hinausgehen:

1. **Ein zusätzlicher Befund verschwindet in diesen Fällen nicht.** Schmutz
   bleibt LOCAL_RESIDUE (D/E/F), der Kratzer bleibt SCRATCH_SUSPECT
   (G/H/I) — auch unmittelbar am Rand des QR-Bereichs (J).
2. **Die Kennzeichnung verschiebt den Kandidatenbestand, sie ergänzt ihn
   nicht nur:** QR allein 133, QR+Kratzer 110, QR+Schmutz 104. Wer nur
   blaue Kästen ausblendet, ändert an dieser Verschiebung nichts.
3. **Ein Kriterium trägt nur EINEN Code.** In E steht LOCAL_RESIDUE — der
   Beitrag des QR ist im selben FAIL nicht mehr sichtbar. Aus dem Code
   allein ist die Ursache also nicht ablesbar, sobald beides zusammenfällt.

---

## 2 · Was das vorhandene Mittel leistet — und wo es aufhört

Leitplanke 9a kennt genau einen belegten Ausschluss: die **Prüffläche**
wird *vor* jeder Rechnung zugeschnitten. Füllen — schwarz oder mit einem
Mittelwert — ist ausdrücklich kein Ausschluss. Bevor etwas Neues gebaut
wird, gehört gemessen, wie weit dieses vorhandene Mittel trägt.

Lage im Bild (x): QR 180–264 · Schrift 160–275 · Kratzer 60–142 ·
Schmutz 285–375.

| ID | Zuschnitt | Sauber | Intakt |
|---|---|---|---|
| K | QR + Kratzer, links neben dem QR (0–170) | **PASS** | SCRATCH_SUSPECT |
| L | QR + Schmutz, links neben dem QR (0–170) | PASS | PASS |
| M | QR + Schmutz, rechts neben dem QR (270–480) | LOCAL_RESIDUE | **SCRATCH_SUSPECT** |
| N | QR + Kratzer, rechts neben dem QR (270–480) | PASS | PASS |

Drei Befunde daraus, und alle drei sind unangenehm:

- **K: der Zuschnitt trägt.** Der Fehlalarm der Kennzeichnung ist weg, und
  der echte Kratzer bleibt erhalten. Für eine Kennzeichnung am Rand ist
  das die vorhandene, bereits freigegebene Lösung.
- **L und N: der Zuschnitt nimmt den Befund mit.** „Kein Befund" heisst
  hier nicht „sauber", sondern „nicht geprüft". Der Geltungsbereich steht
  bereits in jedem Befund — genau dafür ist er da.
- **M: der Zuschnitt ist nicht neutral.** Im schmalen rechten Ausschnitt
  entsteht ein SCRATCH_SUSPECT, den das Vollbild nicht zeigt. Ursache sind
  die **grössenrelativen Schwellen** des Kerns: `diag > 0.28 * minDim`,
  `componentStats(..., 0.0002 * n)`, `bf > 0.01 * n`, `0.00015 * n`. Wird
  die Fläche kleiner, ändert sich, was als „lang" gilt.

Und die vierte, die den Rahmen setzt: **in diesem Bild trennt kein
einziges Rechteck die Kennzeichnung von beiden Zusatzbefunden.** Der
Kratzer liegt links, der Schmutz rechts, die Kennzeichnung dazwischen.

---

## 3 · Vorschlag

### Stufe 0 — Kennzeichnung als eigener Kontext (ohne Kernänderung)

Die Region wird vom Prüfer räumlich zugeordnet und bestätigt, gehört zu
Teil, Foto und Prüffläche und überlebt Speichern und Neuladen. QR-, Data-
Matrix- oder Texterkennung darf eine Region **vorschlagen** — jsQR deckt
nicht jeden Code-Typ ab, und ein lesbarer Code beweist weder Zulässigkeit
noch Sauberkeit noch Unversehrtheit.

Der Befund bleibt dabei **bestehen**. Er wird nur zusätzlich als
„überlappt mit erklärter Kennzeichnung" ausgewiesen — was nach Ablesung 3
nötig ist, weil der Code allein die Ursache nicht mehr hergibt.

**Stufe 0 ist ausdrücklich kein behobener automatischer Fehlalarm** und
darf nicht als solcher ausgeliefert werden. Sie macht den Verdacht
dokumentierbar, nicht das Urteil richtig.

### Stufe 1 — Prüffläche als echter Ausschluss (ohne Kernänderung)

Für eine Kennzeichnung am Rand ist der vorhandene Zuschnitt die Lösung,
und K belegt das. Drei Bedingungen, die aus L, N und M folgen:

1. Der Zuschnitt wird **nie automatisch** aus einer erkannten Region
   gesetzt. Er ist die Entscheidung des Prüfers.
2. Der Geltungsbereich steht am Befund — die weggeschnittene Fläche ist
   *nicht geprüft*, nicht *in Ordnung*.
3. Ein Zuschnitt, der die Kennzeichnung ausschliesst, **aber die
   verbleibende Fläche stark verkleinert, ist zu kennzeichnen**: M zeigt,
   dass dann Befunde entstehen können, die das Vollbild nicht zeigt.

### Stufe 2 — Gültigkeitsmaske im Kern (Änderungsantrag, getrennt)

Eine Kennzeichnung mitten in der Fläche lässt sich mit einem Rechteck
nicht ausschliessen. Ein korrekter rechnerischer Ausschluss verlangt, dass
die betroffenen Pixel in **keine** Summe eingehen. Das ist eine Änderung an
`src/analysisCore.js` und damit an der Byte-Identität zu RC3.

Betroffen sind — vollständig aufgezählt, damit der Antrag prüfbar ist —
folgende Stellen in `computeFeatures()`:

| # | Operation | Was sich ändert |
|---|---|---|
| 1 | Pass 1: `lsum`, `df`, `vdf`, `sR/sG/sB` | Akkumulation überspringt maskierte Pixel; Divisor `n` → gültige Pixel |
| 2 | Grauwelt `kR/kG/kB` aus `mR/mG/mB` | Mittel nur über gültige Pixel (9a: Füllen verschiebt genau das) |
| 3 | Pass 2: `wc`, `wcRaw`, `sDR…sDB2` → `wf`, `wfRaw`, `cv` | wie 1 |
| 4 | Gradienten: `gsum`, `maskEdge` | Paare mit maskiertem Partner zählen nicht; Divisor `(w-1)(h-1)` → gültige Paare |
| 5 | Blockraster `bSum`/`bCnt`/`bWarm` | `bCnt` zählt nur gültige Pixel — der Anknüpfpunkt ist vorhanden |
| 6 | Beleuchtungsfeld (5×5-Block-Median), `med` | Blöcke ohne gültige Pixel fallen aus dem Median |
| 7 | `bFlat`, `devs`, `mad`, `thr` | wie 6 |
| 8 | `tvFlat` (`fsum`, `fsq`) | wie 1 |
| 9 | Hell-Erkennung `bf`, `maskBright` | wie 1 |
| 10 | Lokal-Anomalien: `warmBlocks`, `anomBright/anomDark`, `maskAnom` | bestehende Regel `bCnt[b] < BLK*BLK*0.5` greift bereits — sie ist der vorhandene Präzedenzfall |
| 11 | `edgeFrac` = `ec/n` | Divisor → gültige Pixel |
| 12 | `componentStats(maskEdge…)`, Kratzerfilter | Komponenten dürfen nicht durch die Region laufen; Mindestgrösse relativ zur **gültigen** Fläche |
| 13 | `specular`/`droplets` (`0.01*n`, `0.00015*n`) | wie 12 |

Dazu `screenScratches()` mit derselben Maske.

**Die eine Entscheidung, die der Antrag nicht selbst treffen darf:**
beziehen sich die grössenrelativen Schwellen (`0.28*minDim`, `0.0002*n`,
`0.01*n`, `0.00015*n`) künftig auf die **gültige Fläche** oder auf die
**Bildfläche**? M zeigt, dass die Antwort Urteile verschiebt. Beide
Varianten müssen gemessen werden, bevor eine gewählt wird.

#### Abnahmekriterien für Stufe 2 (vor dem Bau festzulegen)

1. **Gleichheitskriterium.** Für eine block-ausgerichtete rechteckige
   Maske müssen die pixelweisen Merkmale des maskierten Vollbilds
   bit-identisch zu denen des zugeschnittenen Bildes sein. Weicht etwas
   ab, ist die Maske falsch verdrahtet — und nicht der Zuschnitt.
   Block-Ausrichtung ist Bedingung: das Raster ist an 0/0 verankert
   (`BLK = 16`).
2. **Nicht-Verdeckung.** E, F, H, I und J bleiben in ihren Zusatzbefunden
   unverändert. Ein Befund innerhalb und unmittelbar neben der Region
   bleibt meldbar; die manuelle Meldung (Leitplanke 11) bleibt in jedem
   Fall offen.
3. **Kein stilles PASS.** Die ausgenommene Fläche wird als ausgenommen
   dargestellt und nie als sauber oder intakt mitgezählt. Aus einer
   einzelnen Kennzeichnungsregion folgt umgekehrt **keine**
   Nichtbewertbarkeit des ganzen Teils.
4. **Rot vor grün.** Jede der 13 Stellen bekommt eine Gegenprobe, die ohne
   die Änderung rot ist.

#### Was ausdrücklich nicht vorgeschlagen wird

- **Füllen** der Region (schwarz oder Mittelwert) — nach 9a kein
  Ausschluss, sondern ein Ersetzen.
- **Nur die blauen Kästen ausblenden** — gemessen: der Bestand verschiebt
  sich (133 → 110 / 104), das Urteil bleibt falsch.
- **Known-Issue-Tolerierung** — Leitplanke 7 lässt nur `SCRATCH_SUSPECT`
  zu; Sauberkeit bleibt immer FAIL, und genau dort liegt der Fehlalarm.
- **Referenzabgleich per QR-Homographie** — bei gewölbtem Metall belegt
  eine Homographie keine Ebenheit; unsicheres Matching darf keine Befunde
  unterdrücken.

---

## 4 · Offene Abdeckung

Reale Aufnahmen geätzter Codes und Beschriftungen auf gebürstetem
Edelstahl fehlen **vollständig**. Die Zahlen oben stammen aus Rechtecken
auf einer konstanten Fläche; sie belegen den Fehlalarm, nicht die
Erkennungsleistung. Es gibt daher keine Erkennungsrate und keine Aussage
über echte Ätzungen.

Ebenfalls offen: die konkrete Geräteaufnahme aus dem Auftrag. Dort lautet
das Kratzerurteil PASS und der Sauberkeitsfehler ORGANIC_RESIDUE mit
58,9 % warmen Pixeln. Die Beschriftung als alleinige Ursache dieses
Gesamt-FAIL ist damit **nicht belegt**; warme Reflexion, Oberflächenfarbe
und tatsächlicher Rückstand sind aus dieser Darstellung nicht zuverlässig
getrennt.
