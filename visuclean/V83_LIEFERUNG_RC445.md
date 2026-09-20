# Lieferung 8.3.0-rc.4.45 — Reparaturpaket A–F

Erste Lieferung nach dem Auftrag „Weiterbau der lokalen Prüfung und
Vorbereitung der KI-Erweiterung". Sie enthält die abgeschlossenen
Reparaturen A–F einschließlich Mausbedienung. **G ist darin ausdrücklich
offen**: gemessen und als Änderungsvorschlag beschrieben
(`V83_G_KENNZEICHNUNG.md`), nicht umgesetzt.

`src/analysisCore.js` ist in dieser Lieferung unverändert byte-identisch zu
RC3: `ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793`.
Die für G freigegebene Kernänderung gehört in den **nächsten** Stand.

---

## 1 · Bestandsprüfung gegen den tatsächlichen Arbeitsstand

Geprüft wurde nicht die Meldung, sondern der Code. Dabei ist **eine echte
Lücke** aufgefallen und geschlossen worden.

| Befund | Stand | Belegt durch |
|---|---|---|
| A · gemeldete Stellen erreichen den Datensatz | erledigt | E6–E10 (Browser), X1 (Struktur) |
| B · drei Beurteilungsergebnisse fachlich getrennt | erledigt | W1–W6, L1–L4, P1 |
| C · nachgeladener Kandidat auffindbar und messbar | erledigt | C1–C7 (rein), C8–C12 (Browser) |
| D · Weg nach dem Wiederöffnen durch die QA | erledigt | Q1–Q14 (rein), D1–D7 (Browser) |
| E · zweiter Vorgang beginnt leer | erledigt | E12, E12b, E13 (Bildschirm), E15 (Datensatz) |
| F · widerspruchsfreie Statusanzeige | **nachgebessert** | F1–F10 (rein), **U29/U30** (Bericht), **P21–P23** (PDF) |
| Maus · Klick setzt, Ziehen nicht, Touch weiter | erledigt | M1–M3 (Browser) |

### Die Lücke, die die Bestandsprüfung gefunden hat

F war nur als **reine Funktion** belegt. Dass Bericht und PDF sie auch
*benutzen*, prüfte nichts — dieselbe Fehlerklasse, die `X1` schon einmal
gekostet hat: eine Wache am falschen Ort meldet Grün für eine Leitung, die
es nicht gibt.

Neu und am **gerenderten** Bericht bzw. am **erzeugten** PDF geprüft:

- `U29` — ein nicht bewertbarer Prüfpunkt erscheint im Bericht nicht als
  PASS.
- `U30` — ein nachgewiesener Altbestand behält seinen Rohbefund.
- `P21` — dasselbe im Protokoll: „T/D ?" statt „T/D PASS".
- `P22` — Altbestand im Protokoll unverändert.
- `P23` — eine Beurteilung wird im Protokoll nicht „QA-Entscheid" genannt.

`U29` war **rot**, und zwar aus einem Grund, der zählt: die Fotokachel
zeigte „T ?", die Urteilskarte daneben war grün. Ursache: der Datensatz
trägt die Prüfpunkte **zweimal** — einmal als `checkpoints`, einmal in
`aggregate.checkpoints`. Der Erzeuger schreibt beide aus derselben Quelle,
die Anzeige bevorzugte aber still die erste Liste.

Reparatur: der Bericht führt beide Listen nach **Regel 3**
(worst-result-wins) zusammen. Sind sie gleich, ändert das nichts; laufen
sie auseinander, kann die günstigere Fassung die schlechtere nie
überdecken.

Sabotage-Gegenproben (jede Wache muss beissen):

| Wache | Rückbau | Ergebnis |
|---|---|---|
| P21 | PDF druckt wieder den Rohbefund | rot |
| P22 | Altbestandserkennung abgeschaltet | rot |
| P23 | Beurteilung wieder „QA-Entscheid zu" | rot |
| U29 | vor der Reparatur | rot |

---

## 2 · Die geforderten Bedienwege

Alle im **echten Browser** gegen den gebauten Produktionsstand
(`npm run test:bedienlauf`, 31 Prüfungen).

| Geforderter Weg | Belegt durch |
|---|---|
| Schadensmeldungen anlegen, unterschreiben, speichern, neu laden, exportieren | E4–E7 → Reload → E8, E9, E10 |
| Nachgeladene Kandidaten im richtigen Bild wählen, dauerhaft mit Messung verbinden | C8, C9, C10, C11 → Reload → C12 |
| Offene Meldungen nach QA-Übergabe beurteilen, ohne das signierte Original zu verändern | D1–D4; Original unverändert: Q5, Q10 (Hash gleich) |
| Nach der abschließenden Entscheidung erneut laden und den gespeicherten Zustand prüfen | D6 → Reload → D7 (ganze Kette im Export) |
| Zwei Prüfungen ohne Seitenreload; zweiter Datensatz frei vom ersten | E12, E12b, E13 (Bildschirm) und E15 (gespeicherter Datensatz) |
| Widerspruchsfreie Statusanzeigen in Oberfläche, Bericht und PDF | F1–F10, U29/U30, P21–P23 |

Zwischen erster und zweiter Prüfung liegt **kein** Seitenreload — der
Reload steht danach und belegt dort, was wirklich in der verschlüsselten
Datenbank liegt. Ein Reload an der falschen Stelle hatte diesen Nachweis
vorher wertlos gemacht; das ist in `CHANGELOG.md` unter rc.4.45 als
eigener Befund festgehalten.

---

## 3 · Drei Arten von Aussage, getrennt

| | Stand |
|---|---|
| **Automatisch geprüfte Funktion** | 635 Prüfungen in 27 Suiten + 7 Kalibrierungsfälle, dazu 31 Prüfungen im echten Browser. Alle grün. |
| **Tatsächlicher Gerätelauf** | steht aus. Der Browserlauf ist ein Chromium-Telefonkontext, kein iPhone. |
| **Reale Erkennungsleistung** | unverändert nicht belegt. Reale Ätzungs- und Etikettenaufnahmen fehlen vollständig; aus synthetischen Bildern wird keine Erfolgsrate abgeleitet. |

---

## 4 · Kurze iPhone-Testanleitung

Nur die Fragen, die der automatisierte Lauf nicht beantworten kann.

1. **Vor dem Start:** vorhandene Prüfungen über *Einstellungen →
   Datenexport JSON* sichern. Kein Löschen der Browserdaten als
   Voraussetzung.
2. **Kamera und Marker:** Prüfung starten, Foto aufnehmen, mit dem Finger
   zwei Marker setzen. Erwartet: jeder Tipp setzt genau einen Marker; ein
   Wischen über das Bild setzt keinen.
3. **Melden:** eine Stelle als Schadensverdacht melden (Begründung ≥ 10
   Zeichen). Erwartet: die Meldung erscheint als „offen" und sperrt
   Freigabe und Override.
4. **Übergeben:** *Erfassen und an QA übergeben*, Passwort eingeben.
   Erwartet: Prüfbericht mit „Freigabe ausstehend".
5. **Beurteilen:** als QA Manager anmelden, den Bericht im Prüfprotokoll
   öffnen. Erwartet: das Beurteilungsformular steht da; nach der Antwort
   entsteht ein **neuer** wartender Vorgang, der alte zeigt „spätere
   Fassung vorhanden" und bietet keine Entscheidung mehr an.
6. **Entscheiden und neu laden:** entscheiden, App schliessen und neu
   öffnen. Erwartet: der Entscheid steht, das Original ist unverändert
   daneben.
7. **Anzeige:** dort, wo ein Prüfpunkt „nicht bewertbar" ist, darf weder
   auf dem Bildschirm noch im PDF ein grünes PASS für dasselbe Kriterium
   stehen.

Zu melden wären: abweichende Darstellung auf dem kleinen Schirm,
Kameraverhalten, Geschwindigkeit, und jede Stelle, an der die App etwas
behauptet, was sie nicht gemessen hat.

---

## 5 · Grenzen dieser Lieferung

- **G ist offen.** Kennzeichnungen erzeugen weiterhin Schmutzbefunde. Die
  Messung dazu liegt vor, der Vorschlag ebenfalls; die freigegebene
  Kernänderung ist **nicht** Teil dieses Pakets.
- Der Demonstrator bleibt **kein validiertes GMP-Produktivsystem**.
- `npm run test:bedienlauf` ist nicht Teil von `npm run verify`: Chromium
  und Playwright gehören bewusst nicht zum Paket. Er wird getrennt
  gefahren, und sein Ergebnis steht in diesem Bericht.
