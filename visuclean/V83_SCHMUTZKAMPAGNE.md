# VisuClean 8.3 · Datenvertrag und Prüfplan für reale Schmutztests

Stand 8.3.0-rc.4.38 · 16.09.2026

Dieses Dokument beschreibt, welche realen Aufnahmen gebraucht werden, um
über die **sichtbare Schmutzerkennung** etwas Belastbares sagen zu können,
und wie ausgewertet wird. Es ist ein Plan, kein Ergebnis.

Für diesen Test sind **keine Riefentiefenmessungen** erforderlich. Die
Tiefengrenze und ihre Messvorschrift liegen getrennt in
`V83_MESSKAMPAGNE.md`; die Kratzerbilder sind ein eigener Erkennungstest.

---

## 0 · Was heute belegt ist und was nicht

**Belegt** ist Berechnungs- und Darstellungsverhalten. `schmutztest.mjs`
rechnet auf synthetischen, geseedeten Bildern; `realimagetest.mjs` prüft
fünf reale Edelstahlfälle gegen festgehaltene Befunde.

**Nicht belegt** ist Erkennungsleistung im Alltag. Keine der vorhandenen
Aufnahmen trägt eine **unabhängig markierte** Stelle — also eine Markierung,
die jemand ohne die App gesetzt hat. Ohne sie lässt sich nicht sagen, ob
ein Befund richtig war; man sieht nur, dass der Detektor etwas gemeldet hat.

Grüne Softwaretests belegen keine verbesserte reale Erkennungsleistung.
Dieser Satz steht hier, weil er der häufigste Kurzschluss ist.

---

## 1 · Die Aufnahmen

### 1.1 Sichtbare Rückstände mit unabhängiger Markierung

Je Fall:

| Angabe | Pflicht | Bemerkung |
|---|---|---|
| Teil-/Zonenkennung | ja | keine echten Chargen- oder Auftragsnummern |
| Foto in voller Kameraauflösung | ja | verlustfrei oder mit hoher JPEG-Qualität |
| Markierung der Stelle | ja | **ohne** die App gesetzt, siehe 1.2 |
| Art des Rückstands | ja | soweit bekannt; „unbekannt" ist eine zulässige Angabe |
| Aufnahmeprofil | ja | Abstand, Winkel, Lichtquelle, Gerät |
| Zeitpunkt und Person | ja | |

Die Markierung ist der Kern. Sie darf **nicht** aus einer Detektorausgabe
entstehen — weder durch Übernehmen einer Kandidatenliste noch durch
Nachzeichnen eines Overlays. Ein Modell, das auf seinen eigenen Ausgaben
trainiert oder geprüft wird, misst nur, wie gut es sich selbst reproduziert.

### 1.2 Wie markiert wird

Zulässig sind unter anderem: eine Skizze auf einem Ausdruck, ein
Klebepunkt neben der Stelle (nicht darauf), eine Beschreibung mit
Bezugskanten, oder eine Markierung in einem beliebigen Bildwerkzeug, das
nichts mit VisuClean zu tun hat.

Wer markiert, sieht vorher **kein** VisuClean-Ergebnis zu diesem Bild.

### 1.3 Dasselbe Teil vor und nach der Reinigung

Wo möglich dieselbe Stelle zweimal, mit möglichst gleichem Ausschnitt und
gleichem Licht. Das ist die einzige Möglichkeit, den Wischvergleich gegen
etwas zu prüfen.

**Gleicher Ausschnitt und gleiches Licht werden von der App nicht
festgestellt.** Sie erscheinen im Protokoll ausdrücklich als *nicht
belegt*, solange sie niemand belegt. Wer sie sicherstellt, hält fest wie:
Stativ, Markierung am Bauteil, feste Leuchte.

### 1.4 Saubere Vergleichsflächen

Flächen ohne Rückstand, unter denselben Bedingungen aufgenommen. Ohne sie
lässt sich ein Fehlalarm nicht von einem Treffer unterscheiden.

Ein erster Hinweis liegt bereits vor: im Auflösungsvergleich
(`werkbank/schmutzaufloesung.mjs`) kippt das trockene Kontrollbild beim
Halbieren der Auflösung von PASS auf `DARK_RESIDUE`. Das ist **ein** Bild
und keine Rate — aber es zeigt, wozu die Vergleichsflächen da sind.

### 1.5 Verwechslungsfälle

Ausdrücklich erwünscht, weil sie die teuren Fehler erzeugen:

* Reflexe und Glanzpunkte auf geschliffenem Edelstahl;
* Wasser, Tropfen, feuchte Schlieren;
* wechselnde Beleuchtung, insbesondere warmes Licht — der Kern warnt hier
  bereits („Ergebnis beleuchtungsabhängig"), und die Warnung will geprüft
  sein;
* Schatten von Geometrie und Kanten;
* bekannte, tolerierte Kratzer.

---

## 2 · Trennung der Teile

Zwischen **Anpassung** und **abschliessender Prüfung** wird nach
**unabhängigen Teilen** getrennt, nicht nach Bildern.

Mehrere Aufnahmen desselben Teils sind nicht unabhängig: gleiche
Oberfläche, gleicher Schliff, gleiche Beleuchtungssituation. Werden sie
über die Trennlinie hinweg verteilt, misst die Abschlussprüfung teilweise
Bekanntes und fällt zu gut aus.

Kriterien und Modellstand werden **vor** der abschliessenden Prüfung
eingefroren und festgehalten (Dateihashes, Regelfassung, Konfiguration).
Nach dem Einfrieren wird an der Abschlussmenge nichts mehr nachgestellt.

---

## 3 · Was ausgewertet wird

Vier Kennzahlen, jede mit Zähler, Nenner und einer ausdrücklichen Aussage
darüber, was sie **nicht** sagt. Die Zielwerte sind **offen** — sie werden
nicht erfunden.

| Kennzahl | Zähler | Nenner | Was sie nicht sagt |
|---|---|---|---|
| Trefferanteil | unabhängig markierte Stellen, die der Detektor gemeldet hat | alle unabhängig markierten Stellen | nichts über Fehlalarme |
| Fehlalarmanteil | gemeldete Stellen ohne unabhängige Markierung | alle gemeldeten Stellen | nichts darüber, ob die Markierung vollständig war |
| Verfehlungsanteil | unabhängig markierte Stellen ohne Meldung | alle unabhängig markierten Stellen | nichts über die Schwere der Verfehlung |
| Unentschiedenanteil | Fälle ohne eindeutige Zuordnung | alle bewerteten Fälle | **muss neben den anderen dreien stehen**, sonst verschwinden schwierige Fälle lautlos |

Der Unentschiedenanteil ist Pflicht. Eine Auswertung, die nur Treffer und
Fehlalarme nennt, kann jede unbequeme Aufnahme still fallen lassen.

**Zielwerte: OFFEN.** Es gibt keine belegte Grundlage für eine Zahl, und
eine erfundene Schwelle wäre schlimmer als keine.

---

## 4 · Zuordnung zwischen Markierung und Meldung

Eine Meldung gilt als Treffer, wenn sie dieselbe Stelle betrifft. „Dieselbe
Stelle" braucht eine **festgelegte und vorher aufgeschriebene** Regel —
zum Beispiel eine Überlappung der markierten Fläche oder ein Abstand
unterhalb eines Bruchteils der kurzen Bildkante.

Die Regel wird **vor** der Auswertung festgelegt. Wird sie nachträglich
angepasst, ist die Auswertung keine Prüfung mehr, sondern eine Anpassung.

**Diese Regel ist noch nicht festgelegt** (Vorschlag offen). Sie gehört in
die Abstimmung, nicht in eine stille Entscheidung im Code.

---

## 5 · Auflösung

Der Rückstandspfad rechnet derzeit mit `ANALYSE_KANTE.RUECKSTAND = 640`
(Stellwert, nicht validiert).

`werkbank/schmutzaufloesung.mjs` hält je Lauf fest: Bildabmessungen,
Verarbeitungsschritte, Schmutzbefund, Merkmale, markierte Bereiche mit
relativer Position, Laufzeit und Messumgebung.

Bereits sichtbare Grenzen des heutigen Standes:

* Die vorliegenden Realaufnahmen sind **480×640**. Die Stufen „960" und
  „Originalauflösung" fallen damit mit „640" zusammen; es wird
  ausdrücklich **nicht hochskaliert**. Der Lauf kennzeichnet das je Zeile.
* Eine Aussage über die höhere Auflösung ist daher **nicht möglich**,
  solange keine Aufnahmen in voller Kameraauflösung vorliegen. Das ist
  eine Lücke, kein Ergebnis.
* Die Laufzeiten gelten für die Messmaschine in Node. Sie sind **keine**
  iPhone-Leistung.

Aus diesem Lauf wird keine Auflösung und keine Schwelle abgeleitet.

---

## 6 · Was diese Kampagne ausdrücklich nicht leistet

* Keine Aussage „GMP-konform" oder „Part-11-konform". Dafür braucht es
  eine formale Systemvalidierung.
* Keine Stoffklasse. Der Kern sieht Farbe, Helligkeit und Struktur; er
  sieht keinen Stoff. Die vereinbarte Formulierung bleibt: „Warme
  Farbabweichung – Rückstandsverdacht. Keine Stoffklasse bestimmbar."
* Keine Aussage über Menge. Ein Pixelanteil ist kein Verschmutzungsgrad,
  und der Befundstärke-Index ist eine algorithmische Zahl, keine
  physikalische Messgrösse.
* Kein automatisches PASS aus dem Wischvergleich. Die Freigabe bleibt eine
  dokumentierte menschliche Handlung.

---

## 7 · Offene Punkte

| Nr. | Punkt | Status |
|---|---|---|
| SK1 | Zuordnungsregel Markierung ↔ Meldung | offen, vor der Auswertung festzulegen |
| SK2 | Zielwerte der vier Kennzahlen | offen, bewusst nicht erfunden |
| SK3 | Aufnahmen in voller Kameraauflösung | fehlen |
| SK4 | Unabhängig markierte Stellen | fehlen vollständig |
| SK5 | Vor/nach-Paare derselben Stelle | fehlen |
| SK6 | Laufzeit auf dem Gerät | nicht gemessen |
| SK7 | Ob „gleicher Ausschnitt/gleiches Licht" technisch feststellbar gemacht wird | offen; heute wird es als *nicht belegt* ausgewiesen |
