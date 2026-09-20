import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "MANIFEST.txt");
const excluded = new Set(["node_modules", "dist", "dist-demo", "dist-std", ".git", ".claude", "__pycache__", "MANIFEST.txt"]);
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

/* Die Suitenzahl wird ABGELEITET, nicht behauptet. Bis rc.4.19 stand hier
   fest "19 Suiten", waehrend 20 gelistet waren — die Zahl wurde bei jedem
   neuen Test von Hand nachgezogen und lief irgendwann weg. Befund der
   unabhaengigen Gegenpruefung, zutreffend. */
const TEST_SKRIPTE = [...(packageJson.scripts?.["test:kette"] || "")
  .matchAll(/node ([A-Za-z0-9_.-]+\.mjs)/g)].map(m => m[1]);

/* BEFUND der unabhaengigen Gegenpruefung an rc.4.42, zutreffend: die Zahl
   JE SUITE und die drei Summen standen hier als getippter Text und blieben
   auf dem Stand von rc.4.41 stehen (30/30, 558, 565), obwohl die Suite 35
   Pruefungen hat. `manifest:check` konnte das nicht sehen — es vergleicht
   Dateiliste und Hashes, nicht den Fliesstext.

   Dieselbe Krankheit wie die Suitenzahl in rc.4.19, eine Ebene tiefer. Die
   Zahlen kommen jetzt aus pruefzahlen.json, das scripts/pruefzahlen.mjs aus
   einem echten Lauf schreibt und bei jedem `npm test` nachprueft. Hier wird
   nichts mehr getippt. */
const ZAHLEN = JSON.parse(await readFile(path.join(root, "pruefzahlen.json"), "utf8")).suiten;
const fehlendeZahl = TEST_SKRIPTE.filter(name => !Number.isInteger(ZAHLEN?.[name]));
if (fehlendeZahl.length) {
  console.error("pruefzahlen.json kennt diese Suiten nicht: " + fehlendeZahl.join(", "));
  console.error("Nachziehen mit: npm run test:zahlen");
  process.exit(1);
}
const BESTANDEN = TEST_SKRIPTE.filter(name => name !== "kalibrierung.mjs")
  .reduce((wert, name) => wert + ZAHLEN[name], 0);
const KALIBRIERUNG = ZAHLEN["kalibrierung.mjs"] ?? 0;
const ROHSUMME = BESTANDEN + KALIBRIERUNG;
const zz = name => `${ZAHLEN[name]}/${ZAHLEN[name]}`;
const SUITEN_GESAMT = TEST_SKRIPTE.length;
const SUITEN_OHNE_KALIBRIERUNG = TEST_SKRIPTE.filter(f => f !== "kalibrierung.mjs").length;

async function walk(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (excluded.has(entry.name) || excluded.has(relative)) continue;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

const files = (await walk(root)).sort((a, b) => a.localeCompare(b, "en"));
const rows = [];
for (const file of files) {
  const absolute = path.join(root, file);
  const [buffer, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
  rows.push({ file, bytes: metadata.size, hash: createHash("sha256").update(buffer).digest("hex") });
}

const text = `VisuClean - Browser/PWA-Demonstrator
=========================================

Version           ${packageJson.version}
Pflichtenheft     v2.5C / Korrekturkandidat ${packageJson.version}
Basis             8.3.0-rc.4.31
                  Geschwisterlinie zu rc.4.6. Der Detektor aus jener Linie
                  wurde nicht uebernommen, sondern in rc.4.17 als
                  src/scratchScreening.js neu gebaut; er ist enthalten und
                  aktiv. Bis rc.4.19 stand hier noch "kein
                  scratchScreening" — im selben Dokument, das die Datei
                  weiter unten auflistet. Befund der unabhaengigen
                  Gegenpruefung, zutreffend.
Bedienlauf        Erster echter Bedienlauf am 11.09.2026 (lokal, Browser).
                  Gefunden und behoben: ein Operator konnte eine
                  dokumentierte Abweichung nicht mehr als FAIL abschliessen
                  ("QA_ROLE_REQUIRED: FINAL_FAIL erfordert exakt die Rolle
                  QA Manager"). Ursache: derivePreviousState behauptete
                  PENDING_QA, sobald eine Abweichung vorlag — auch bei einem
                  Einschritt-Abschluss, der nie wartend WAR. Zusammen mit
                  der in rc.4.11 eingefuehrten Regel "aus PENDING_QA fuehrt
                  nur die QA heraus" sperrte das den Pruefer aus.
Installationslauf Erste echte Installation auf Windows am 11.09.2026.
                  npm run verify brach ab: ausschlusstest.mjs baute den
                  Wurzelpfad aus dem URL-Feld pathname. Unter Windows
                  liefert das "/C:/Users/..." mit fuehrendem Schraegstrich,
                  woraus join() "C:\\C:\\Users\\..." macht (ENOENT).
                  Zweiter, stillerer Fehler derselben Klasse: die
                  Map-Schluessel kamen aus relative() und trugen unter
                  Windows "\\" statt "/", weshalb inhalt.get("src/App.jsx")
                  ins Leere lief und Z-01 ohne Begruendung rot wurde.
                  Beide behoben; X-09 bis X-12 wachen mechanisch dagegen.
                  Beide Fehler waren auf Linux unsichtbar — alle
                  vorherigen Abnahmen liefen dort.
                  Ab rc.4.12 kommt PENDING_QA nur noch von einem
                  TATSAECHLICHEN Vorgaenger (supersedesId). Ein FAIL ist
                  keine Freigabe: "nachgereinigt und immer noch nicht
                  sauber" darf ein Pruefer allein feststellen.
                  Belegt durch S48.
Bedienpruefung    Zwei-Personen-Durchlauf am 11.09.2026 von Hand belegt:
                  Uebergabe an die QA, Sitzungsende, Freigabe durch einen
                  zweiten Benutzer. Alle drei Invarianten bestaetigt - der
                  wartende Datensatz blieb unveraendert, die Genehmigung
                  ist ein eigener Eintrag, ein zweiter Entscheid wurde
                  unter Nennung des bestehenden abgewiesen.
                  Dabei drei Bedienfehler gefunden, alle im QA-Schirm:
                  (1) falsche Zugangsdaten ohne jede Rueckmeldung - der
                      Fehlertext lag in submit() und war unerreichbar,
                      weil submit nur mit gueltigem approver existierte;
                  (2) autoComplete username/current-password liess den
                      Browser die Kennung des PRUEFERS in das Feld des
                      GENEHMIGERS fuellen, auf einem Vier-Augen-Schirm;
                  (3) "Durch QA freigeben" wurde angeboten, wo weder PASS
                      noch Override erreichbar waren - der Fehlschlag kam
                      erst nach Anmeldung, Begruendung und Signatur.
                  Behoben; U19 bis U21 wachen dagegen. Die erreichbaren
                  Entscheide kommen aus qaDecisionOptions in lifecycle.js,
                  damit Oberflaeche und Grenze nicht auseinanderlaufen.
                  Keiner der drei wurde von den 351 Pruefungen gefunden:
                  sie pruefen, ob die Grenze haelt, nicht ob ein Mensch
                  durch die Tuer kommt. Die Grenzen selbst hielten.
Protokolltext     Aus demselben Bedienlauf, am erzeugten PDF gefunden:
                  ueber einer QA-SPERRUNG stand "Freigabe zu: <ID>". Der
                  Entscheid war eine Sperrung; das Dokument behauptete an
                  dieser Stelle das Gegenteil. Eine falsche Etikettierung
                  in einem GMP-Protokoll ist inhaltlich unwahr, nicht
                  bloss unschoen. Jetzt neutral "QA-Entscheid zu".
                  Daneben "Geprueffte Revision" mit doppeltem f, auch in
                  zwei Fehlermeldungen der Speichergrenze. Beides behoben;
                  P6 und P7 pruefen es am erzeugten Dokument.
Meldungstext      Vom Auftraggeber unmittelbar danach gefunden: dieselbe
                  Unwahrheit stand noch in drei Meldungen der
                  Speichergrenze. Ueber einer SPERRUNG meldete die App
                  "Diese Revision wurde bereits freigegeben; eine zweite
                  Freigabe ist nicht zulaessig". Die drei Meldungen gelten
                  fuer JEDEN QA-Entscheid und heissen jetzt neutral
                  "QA-Entscheid". Die vier Stellen, die tatsaechlich eine
                  Freigabe bezeichnen (Signaturbedeutungen, System-FAIL,
                  NOT_VERIFIED), bleiben unveraendert - dort ist das Wort
                  richtig. Belegt durch S49.
Kratzer-Screening Neu in rc.4.17: src/scratchScreening.js schliesst die
                  Luecke, die der Auftraggeber benannt hat. Gemessen an der
                  realen Kontrollaufnahme dry-stainless-control.png:
                  Der KERN findet dort KEINEN Kratzer, bei keiner Laenge -
                  sein Tor (edgeFrac < 0.06 UND tvFlat < 0.035) ist wegen
                  tvFlat 0.0451 geschlossen. Selbst ein Kratzer ueber 80 %
                  der Bildkante ergibt "Intakt".
                  Das SCREENING findet denselben Kratzer quer zum Schliff
                  ab 8 % der kurzen Bildkante auf Platz 1 der sortierten
                  Liste. Es schaltet die Suche nicht ein, sondern
                  unterdrueckt die geschaetzte Schliffrichtung - Kanten
                  laengs und quer werden GETRENNT gelabelt, sonst
                  verschmilzt ein Querkratzer an jeder Kreuzung mit dem
                  Schliffmuster (gemessen: Platz 1 ging dann an eine
                  Schliffspur mit 2,5 Grad Winkelabstand).
                  GEMESSENE GRENZE: bis etwa 20 Grad Winkelabstand zur
                  Schliffrichtung wird ein Kratzer NICHT gefunden. Das ist
                  eine Grenze des Einzelbildes, keine Schwellenfrage - der
                  vorgesehene Ausweg ist die Mehrwinkel-Fusion, die als
                  detect-Parameter jetzt vom Screening gespeist wird
                  (bis rc.4.16 stand dort null).
                  Das Screening fuegt nur hinzu und sortiert; es aendert
                  kein Urteil und erzeugt kein PASS. SC-01 und SC-02
                  sichern diese Bauform ab. Alle Stellwerte sind als
                  Stellwerte kommentiert, nicht als validierte Schwellen.
Drei Stufen       rc.4.18 stellt die Spezifikation des Auftraggebers
                  vollstaendig, in der einzigen Anordnung, die ohne
                  Kalibrierung zulaessig ist:
                    analysisCore      ENTSCHEIDET  (RC3, unveraendert)
                    scratchScreening  ZEIGT HIN    (Kandidaten, sortiert)
                    scratchClassifier SORTIERT UM  (Random Forest)
                  Weder Screening noch Wald duerfen ein Urteil aendern,
                  einen Kandidaten entfernen oder ein PASS erzeugen. Ein
                  ungenauer Wald macht die Liste schlechter sortiert,
                  niemals ein Ergebnis falsch. SC-01/02 und SC-09/11
                  sichern das ab.
                  OHNE MODELL IST DER WALD INERT (SC-09): es gibt keine
                  gelabelten Bilder und keine Ground Truth aus Tastschnitt-
                  oder Replika-Messung. werkbank/train_rf.py weist Labels
                  mit Quelle "REGEL" ausdruecklich zurueck - ein Wald, der
                  auf den Ausgaben der eigenen Regel trainiert, lernt die
                  Regel und nicht die Wirklichkeit.
                  Merkmalsvertrag: FEATURE_ORDER in scratchClassifier.js.
                  Ein Modell mit abweichender Reihenfolge wird ABGELEHNT
                  (SC-10), und SC-14 liest die Reihenfolge im Python-Code
                  mechanisch gegen - sonst trainiert die Werkbank auf einer
                  anderen Spaltenfolge, als die App auswertet.
                  Konfiguration: public/screening.config.json, am Server
                  austauschbar. Jeder Wert wird geprueft; unplausible Werte
                  werden EINZELN verworfen und benannt, nie still (SC-16).
Messreihe         werkbank/messreihe.mjs laesst alle Stufen ueber einen
                  Bilderordner laufen und schreibt die Merkmalstabelle als
                  CSV - fertig zum Labeln. Damit wird aus "wir brauchen
                  Daten" ein Arbeitsschritt mit Werkzeug.
                  Anlass ist eine Messung an den drei realen Aufnahmen:
                  ACHT von ELF Kernmerkmalen trennen "nass unscharf" von
                  "trocken scharf" - nur gradMean nicht, und genau das
                  benutzt die heutige Naesse-Regel. Das spricht dafuer,
                  dass die Achse falsch gewaehlt ist und nicht die
                  Information fehlt. BELEGT IST ES NICHT: bei drei Szenen
                  und elf Merkmalen entsteht eine solche Trennung leicht
                  zufaellig, und sie beschreibt vermutlich die Beleuchtung.
                  Das Skript sagt diese Einschraenkung bei jedem Lauf an
                  und nennt den Richtwert von etwa 20 unabhaengigen
                  Aufnahmen je Klasse. Es weist ausserdem JPEG zurueck:
                  Kompressionsartefakte erzeugen genau die Mikrokanten, an
                  denen Kratzer- und Naessemerkmale haengen.
                  SC-17 haelt die Messreihe am Merkmalsvertrag fest.
Nacharbeit rc.4.20 Unabhaengige Gegenpruefung an rc.4.19. Ihre Befunde
                  wurden einzeln reproduziert, bevor etwas geaendert wurde.
                  Umgesetzt sind S1, S4, S5, S7 und S8:
                  S1 Messkette: messreihe.mjs schrieb semikolongetrennt,
                     train_rf.py las den Komma-Standard - die Kette war
                     unbenutzbar. Das Trennzeichen ist jetzt auf beiden
                     Seiten eine benannte Konstante. Zweiter, vom ersten
                     verdeckter Bruch: der Spaltencheck pruefte auch die
                     Labels, obwohl eine frisch gemessene Tabelle
                     naturgemaess ungelabelt ist. Spalten- und Labelvertrag
                     sind getrennt. SC-18 FUEHRT die Kette aus statt
                     Quelltext zu lesen; fehlt python3, gilt sie als NICHT
                     AUSGEFUEHRT, nicht als bestanden.
                  S4 Produktpfad: das Screening lief nur in der Fusion und
                     war weder sichtbar noch gespeichert. Es laeuft jetzt
                     je Einzelbild, die Kandidaten stehen im Datensatz, in
                     der Detailansicht (U22) und im PDF (P8). Gespeichert
                     wird die sortierte Spitze je Aufnahme plus die vollen
                     Zahlen - alle Kandidaten sprengen Datensatz und PDF
                     (gemessen 799 Zeilen fuer drei Aufnahmen), die
                     Gesamtzahl bleibt sichtbar. U23 verbietet jede
                     Tiefen-, Harmlosigkeits- und Entstehungsaussage.
                     NICHT umgesetzt: Kandidat als manuelle Feststellung
                     uebernehmen oder verwerfen. Das beruehrt den
                     QA-Triggerpfad und braucht eigene rote Gegenproben.
                  S5 Konfiguration: public/screening.config.json wird jetzt
                     im Produktpfad geladen, geprueft und angewandt; der
                     SHA-256 der wirksamen Fassung steht im Datensatz und
                     im PDF (P9). Eine spaetere Aenderung deutet damit
                     keine gespeicherte Pruefung um. Bei Abrufproblem
                     greifen die paketgebundenen Werte MIT Begruendung in
                     quelle, nie stillschweigend.
                     Dafuer musste V32 angefasst werden - eine Wache, die
                     jeden fetch in App.jsx verbot. Sie wurde PRAEZISIERT,
                     nicht aufgeweicht: zusaetzlich verboten sind jetzt
                     sendBeacon und WebSocket, die vorher ungeprueft
                     blieben, sowie jeder Abruf mit absoluter oder
                     variabler Adresse. Erlaubt ist genau CONFIG_PFAD.
                     Vier Sabotagen belegen, dass sie greift.
                  S7 Labelsprache: MIKRO_HARMLOS und TIEF_RELEVANT
                     behaupteten eine Tiefe, die aus einem Foto nicht
                     messbar ist. Jetzt ATTENTION_LOW / ATTENTION_HIGH.
                     X-03 faengt solche Woerter nicht, weil es Zahlen mit
                     Millimeter sucht - deshalb SC-19 als eigene Wache.
                  S8 Manifest und Installer: der Kopf behauptete "kein
                     scratchScreening", waehrend dieselbe Datei es unten
                     auflistet. Entfernt. Die Suitenzahl wird jetzt
                     ABGELEITET statt behauptet (stand auf 19 bei 20
                     Suiten). Der Installer prueft beide von Vite
                     erlaubten Node-Bereiche; Node 21.x und 22.0 bis 22.11
                     werden abgewiesen.
                  OFFEN aus derselben Pruefung: S2 Datenhygiene, S3
                  getrennte Modelle je Kriterium, S6 leckagefreies
                  Training. Sie bauen Maschinerie fuer Daten, die es noch
                  nicht gibt.
Nacharbeit rc.4.21 Die geschaetzte Vorzugsrichtung wird ANGEZEIGT und
                  DOKUMENTIERT. Keine neue Schaltschwelle: kein Urteil und
                  keine Reihenfolge im Datensatz haengt neu an ihr.
                  Wortlaut: Richtung, Rohwert und Winkelfaecherzahl stehen
                  nebeneinander, dazu "Zuverlaessigkeit nicht kalibriert".
                  KEINE Prozentangabe - 0,141 ist keine Sicherheit von
                  14,1 Prozent - und keine Einordnung wie "schwach
                  bestimmt", die eine Kalibrierung behaupten wuerde, die
                  es nicht gibt. U24 und P10 erzwingen beides und fallen
                  bei einem Prozentzeichen durch.
                  Die AUSWIRKUNG steht daneben: wie viele Kandidaten wegen
                  ihrer Richtung niedriger bewertet wurden. Ohne diese
                  Zahl bleibt unsichtbar, was die Abwertung getan hat.
                  Zweite Rangfolge: jeder Kandidat traegt zusaetzlich
                  relevanceScoreUngerichtet - dieselbe Bewertung ohne den
                  Richtungsfaktor. Beide Werte stehen in Datensatz,
                  Anzeige und PDF; die Anzeige kann zwischen beiden
                  Rangfolgen umschalten. Das aendert nur die Reihenfolge
                  der Zeilen, nie einen Wert und nie ein Urteil (SC-20).
                  Warum das noetig ist, ist an den drei realen Aufnahmen
                  GEMESSEN: die Richtungsabwertung verschiebt einen
                  Kandidaten um bis zu 338 Plaetze.
                  Was die Richtungsstaerke aussagt, ist ebenfalls gemessen
                  und in SC-21 festgehalten. Eine fruehere Fassung dieses
                  Tests behauptete, mehr Winkelfaecher ergaeben stets
                  einen kleineren Spitzenanteil. Das ist falsch und der
                  Test bestand aus dem falschen Grund (0,888761 gegen
                  0,888739 - Rauschen). Richtig ist: bei klarer
                  Vorzugsrichtung aendert die Faecherzahl kaum etwas, ohne
                  Vorzugsrichtung bricht der Wert ein (0,0881 auf 0,0523).
                  Der Wert ist daher nur bei GLEICHER Faecherzahl
                  vergleichbar - deshalb steht orientationBins im
                  Datensatz und im PDF neben ihm.
                  Was das fuer die drei realen Aufnahmen heisst, ist der
                  Grund fuer "anzeigen, nicht schalten": sie liegen bei
                  0,141 / 0,050 / 0,033. Ein klarer Schliff liefert im
                  Testbild 0,889, eine richtungslose Flaeche 0,052 bis
                  0,088. Die realen Aufnahmen sind damit nicht sicher von
                  "keine Vorzugsrichtung" zu unterscheiden. Auf einer so
                  unsicheren Groesse wird nichts geschaltet.
                  Das Richtungshistogramm bleibt in der WERKBANK: die
                  Messreihe schreibt eine eigene Datei
                  <tabelle>_richtungshistogramm.csv mit allen Faechern,
                  den zwei staerksten Richtungen und ihrem Abstand. Im
                  Pruefdatensatz haette es nur Ballast erzeugt.
                  Die Messreihe protokolliert beide Rangfolgen parallel
                  (relevanz_ungerichtet, rang_ungerichtet). Die Spalten
                  stehen NEBEN dem Merkmalsvertrag, nicht in ihm:
                  FEATURE_ORDER bindet das Modell und bleibt bei sechs
                  Merkmalen.
                  Tippfehler "Schliffl inien" korrigiert.
                  WEITER OFFEN: die Richtungsschaetzung ist unveraendert
                  nicht kalibriert, es gibt kein trainiertes Modell, und
                  keine Trefferquote ist belegt.
Nacharbeit rc.4.22 Aus dem ersten echten Handy-Prueflauf auf einem realen
                  Bauteil. Drei Punkte, einer davon ein Fehler, den nur ein
                  echter Lauf zeigen konnte.
                  1 GESPEICHERTE SPITZE (Fehler): ausgewaehlt wurde nach der
                     GERICHTETEN Rangfolge, also nach derjenigen, die eine
                     nicht kalibrierte Richtungsschaetzung mitbewertet.
                     Gemessen an dry-stainless-control.png: sechs der zehn
                     bestplatzierten Kandidaten der ungerichteten Rangfolge
                     lagen auf den gerichteten Plaetzen 36, 46, 52, 54, 55
                     und 59 - bei 59 Kandidaten. Einer war der letzte. Sie
                     wurden nicht gespeichert, standen also weder im
                     Datensatz noch im PDF, und die in rc.4.21 eingebaute
                     Umschaltung konnte sie nicht zurueckholen: man kann
                     nur zeigen, was gespeichert wurde. Jetzt wird die
                     VEREINIGUNG beider Spitzen gespeichert, hoechstens
                     das Doppelte. SC-22 belegt es am
                     echten Bild.
                  2 STANDARDSORTIERUNG: Bildschirm und PDF ordnen jetzt
                     nach der Relevanz OHNE Richtungsabwertung, und das PDF
                     benennt seine Ordnung. Grund: auf dem realen Teil lag
                     die Richtungsstaerke bei 0,049 - unter dem Wert einer
                     Flaeche voellig ohne Vorzugsrichtung (0,056 bei 36
                     Faechern) - und dennoch wurden 19 von 66 Kandidaten
                     deswegen niedriger bewertet. Die ungerichtete
                     Rangfolge unterdrueckt niemanden und braucht keine
                     kalibrierte Zahl. KEINE Schaltschwelle: es wird nicht
                     ab einem Wert umgeschaltet, die Voreinstellung ist
                     schlicht die vorsichtigere. Die gerichtete bleibt
                     umschaltbar, beide Werte stehen je Kandidat da.
                     U25 und P11.
                  3 EINE QUELLE FUER DIE FORMULIERUNG: der Pruefpunkt
                     "Rueckstaende / Sauberkeit" reichte den Kerntext
                     "Organische Rueckstaende (braun/gelb)" roh durch,
                     waehrend die Ergebnisanzeige denselben Befund bereits
                     richtigstellte. Auf dem Handy standen beide Saetze
                     untereinander; man liest den oberen zuerst. Die
                     Korrektur liegt jetzt in src/verdictWording.js, von
                     assessment.js UND i18n.js genutzt. A24 prueft die
                     GLEICHHEIT, nicht den Wortlaut - ein Test auf einen
                     bestimmten Satz haelt nur bis zur naechsten
                     Umformulierung. analysisCore.js bleibt byte-identisch;
                     der Rohcode ORGANIC_RESIDUE bleibt im Datensatz.
                  AUFLOESUNGSVERGLEICH (Messung, keine Aenderung):
                     werkbank/aufloesungsvergleich.mjs. Anlass war das
                     Aufnahmeprofil des echten Laufs: 900x1600 -> 360x640,
                     also 40 Prozent. Gemessen an den vorliegenden
                     Aufnahmen: bei 40 Prozent ueberleben von den zehn
                     auffaelligsten Stellen der vollen Aufloesung nur noch
                     zwei (dry-stainless-control), und die Kandidatenzahl
                     verhaelt sich nicht einmal monoton (59 - 23 - 65 -
                     17). Die geschaetzte Vorzugsrichtung springt bei
                     niedriger Richtungsstaerke von 42,5 ueber 62,5 und
                     57,5 auf 112,5 Grad - unabhaengige Bestaetigung, dass
                     sie dort nichts traegt.
                     GRENZE: die vorliegenden Realaufnahmen sind bereits
                     480x640. Echte 900x1600-Originale liegen nicht vor.
                     Der Lauf zeigt, was beim Verkleinern VERLORENGEHT,
                     nicht was bei voller Kameraaufloesung zusaetzlich
                     gefunden wuerde.
                     Es wurde NICHTS daraus abgeleitet. SC-23 schreibt die
                     sieben Stellwerte auf ihren dokumentierten Zahlen
                     fest: eine Verschiebung ist moeglich, aber nicht
                     nebenbei - sie muss auch dort nachgezogen werden.
Nacharbeit rc.4.23 Der Service Worker lieferte nach jeder Auslieferung
                  genau eine Sitzung lang still die VORVERSION.
                  Aufgefallen ist es nur am Geraet: die frisch
                  ausgelieferte Preview zeigte rc.4.21, waehrend jede
                  Textpruefung gruen war. V30 liest den Quelltext - das
                  belegt, DASS es einen Cache gibt, nicht WAS er
                  ausliefert.
                  Ursache: die Auslieferung war cache-first OHNE Ausnahme
                  fuer das Dokument. Der Browser bekam die alte
                  index.html aus dem Cache, die auf die alten, gehashten
                  Bundles zeigte - eine in sich stimmige Vorversion.
                  skipWaiting und clients.claim sorgten dafuer, dass
                  spaetestens der zweite Aufruf stimmte; die eine Sitzung
                  dazwischen blieb unsichtbar.
                  Warum das mehr ist als ein Schoenheitsfehler: es trennt
                  "freigegeben" von "in Benutzung", ohne dass es von innen
                  erkennbar waere. rc.4.22 hatte einen echten Fehler
                  behoben (Kandidaten, die gar nicht erst gespeichert
                  wurden); im Feld haette ein Pruefer weiter mit der
                  fehlerhaften Fassung gearbeitet, waehrend der Stand als
                  behoben gilt. Ein verschleierter Zustand verstoesst
                  gegen Leitplanke 10.
                  Behoben: fuer NAVIGATIONSANFRAGEN Netz zuerst, Cache als
                  Rueckfall. Alles andere bleibt cache-first - die
                  Bauartefakte tragen einen Inhalts-Hash im Dateinamen,
                  ein altes Bundle unter altem Namen ist nie die falsche
                  Datei, und ein Netzabruf dafuer waere reiner Aufwand.
                  Die Offline-Zusage ist unberuehrt: ohne Netz schlaegt
                  der Versuch fehl und der Cache traegt.
                  DOKUMENT_NETZ_MS = 2000 ist neu und als Stellwert
                  kommentiert. Er beeinflusst kein Urteil, keine
                  Reihenfolge und keinen Befund - nur die Wartezeit auf
                  das Netz. Ohne ihn tauschte man einen stillen Altstand
                  gegen eine App, die bei halb offenem WLAN gar nicht
                  startet; das waere der schlechtere Handel.
                  Kein Widerspruch zu Leitplanke 1: verboten ist der
                  stille Netzwerk-Fallback fuer Bild- und Analysedaten.
                  Hier wird die eigene index.html von derselben Origin
                  geholt, ohne Nutzlast; Fremd-Origins bleiben
                  ausgeschlossen.
                  V39 bis V42 FUEHREN public/sw.js in einem Pruefstand aus
                  statt ihren Text zu lesen: V39 mit Netz gewinnt das
                  Netz, V40 ohne Netz traegt der Cache, V41 gehashte
                  Bauartefakte ohne zusaetzlichen Netzverkehr, V42 eine
                  haengende Anfrage faellt auf den Cache zurueck.
                  V40 und V41 waren schon vor der Aenderung gruen - sie
                  halten fest, was NICHT kaputtgehen darf.
                  Der Pruefstand meldet Fehler und Haenger als
                  durchgefallene Pruefung, statt den Lauf abzureissen.
                  Beides trat bei den Sabotageproben auf und haette sonst
                  verdeckt, WELCHE Zusage gebrochen ist.
Nacharbeit rc.4.24 Ein Falsch-PASS bei "Trocken", gefunden im echten
                  Prueflauf auf einem realen Bauteil: eine sichtbar von
                  Tropfen bedeckte Edelstahlflaeche kam als "Keine
                  sichtbare Feuchtigkeit - Bestanden" heraus. Das ist ein
                  PASS bei einem der drei GMP-Kriterien.
                  URSACHE, an den Zahlen des Protokolls nachvollzogen:
                  Das Trocken-Urteil kennt drei Wege zu einem FAIL.
                  Glanzpunkte (bfr > 0.04) griffen nicht - diffuses Licht
                  erzeugt keine. Dunkle nasse Flaeche (lm < 0.22) griff
                  nicht, die Helligkeit lag bei 43 Prozent. Bleibt
                  VISIBLE_MOISTURE_TEXTURE, der EINZIGE Weg fuer Naesse
                  ohne Glanz - und er haengt vollstaendig an Mikrokanten.
                  Genau die waren weg: das Aufnahmeprofil meldete 900x1600
                  auf 360x640, also 40 Prozent. Im selben Protokoll stand
                  tvFlat 0.0026, das 7,7-fache UNTER der Schwelle. Eine
                  nasse, gebuerstete Edelstahlflaeche ist nicht
                  strukturlos; diese Zahl beschreibt nicht das Bauteil,
                  sondern was von ihm uebrig war.
                  WARUM DIE VORHANDENE WACHE SCHWIEG: "kein PASS aus
                  Nichtwissen" erkannte unzuverlaessige Kantenevidenz
                  daran, dass Oberflaeche oder Korrosion NICHT BEWERTBAR
                  sind. Ein Punkt wird aber nur dann nicht bewertbar, wenn
                  sein Messwert UEBER der Schwelle liegt und die
                  Kantenstuetzung fehlt. Ein zu stark verkleinertes Bild
                  drueckt ALLE Werte unter ihre Schwellen - dann steht
                  ueberall PASS und die Wache schweigt. Sie war blind in
                  genau dem Fall, fuer den sie gebaut wurde.
                  Die Ursacheninformation lag vor: captureProfile traegt
                  scaleFactor und Aufnahmeweg. Sie erreichte die Bewertung
                  nur nie - assessment.js kannte das Aufnahmeprofil gar
                  nicht (null Treffer im Quelltext).
                  BEHOBEN: buildCheckpoints nimmt das Aufnahmeprofil. Wurde
                  das Bild verkleinert, ist ein Trocken-PASS nicht
                  bewertbar statt bestanden, Code
                  NOT_ASSESSABLE_RESOLUTION_NOT_ESTABLISHED, mit dem
                  Verkleinerungsfaktor im Klartext und in den Messwerten.
                  KEIN neuer Schwellenwert: "wurde verkleinert, ja oder
                  nein" ist eine Tatsache aus dem Profil, keine kalibrierte
                  Zahl. Die Regel entfaellt, sobald eine Mindestaufloesung
                  gemessen und festgelegt ist.
                  ENG GEFASST: ein Feuchtigkeits-FAIL ueber Glanzpunkte
                  haengt NICHT an Mikrokanten und bleibt unveraendert ein
                  FAIL (A26). Ohne Verkleinerung bleibt ein PASS ein PASS
                  (A27) - sonst waere die Regel keine Wache, sondern eine
                  pauschale Abschaltung.
                  A28 haelt die Wache VERDRAHTET: der echte Aufnahmeweg
                  muss das Profil uebergeben, und es muss vor dem Aufruf
                  gebildet sein. Lehre aus rc.4.19, wo das Screening
                  gerechnet und nie benutzt wurde.
                  SPUERBARE FOLGE: Trockenheit steht bei fast jeder
                  Handyaufnahme auf "nicht bewertbar", weil der
                  Aufnahmeweg fest auf 640 Pixel lange Kante verkleinert.
                  Das ist unbequem und richtig - und der Grund, die 640 als
                  naechstes zu untersuchen. Sie einfach hochzusetzen genuegt
                  nicht: das Bildbudget von 1 MB wird ueber die
                  JPEG-Qualitaet gehalten, und JPEG-Artefakte zerstoeren
                  dieselben Mikrokanten. Das ist eine Messfrage.
                  ANLEITUNG: werkbank/ANLEITUNG.md ist neu - trainieren,
                  anwenden, Schwellen nachjustieren, Grenzen. Sie war ein
                  ausdruecklich verlangter Liefergegenstand und fehlte
                  bisher vollstaendig; weder README noch die
                  Abnahmedokumente erwaehnten die Werkzeuge. Jeder Befehl
                  darin wurde vor der Auslieferung ausgefuehrt.
Nacharbeit rc.4.25 Messung zur Analyse-Aufloesung. Sie hat eine eigene
                  Annahme WIDERLEGT und dabei einen anderen Befund
                  geliefert als erwartet.
                  ZWEI STELLEN, die nichts miteinander zu tun haben:
                  compressPhoto() legt mit bis zu 1600 px langer Kante bei
                  Qualitaet 0.86 ab - das 1-MB-Budget betrifft NUR die
                  Ablage. analyzeImage() rechnet das gespeicherte Foto
                  DANACH auf 640 px herunter, allein fuer die Analyse.
                  Die frueher geaeusserte Vermutung, ein Hochsetzen der
                  640 erzwinge schlechtere JPEG-Qualitaet, war falsch: die
                  Ablage ist zu diesem Zeitpunkt bereits entschieden. Der
                  einzige Preis ist Rechenzeit.
                  WIDERLEGT: die Vermutung, das Verkleinern lasse die
                  Naesseregel versagen. Gemessen an beiden nassen
                  Realaufnahmen, verkleinert bis auf 120x160: beide bleiben
                  durchgehend VISIBLE_MOISTURE_TEXTURE. edgeFrac 0.198 bis
                  0.185 und 0.138 bis 0.155 - die Tore 0.08 und 0.055
                  werden nie unterschritten. Aufloesung ist NICHT der
                  Mechanismus, an dem die Naesseerkennung scheitert.
                  Der Fehlbefund des Auftraggebers hat damit eine andere,
                  bisher unbekannte Ursache. Sein tvFlat lag bei 0.0026,
                  waehrend die drei Referenzaufnahmen bei 0.0130, 0.0455
                  und 0.0487 liegen - also um ein Vielfaches darueber, nass
                  wie trocken. Was seine Aufnahme so texturarm macht, ist
                  offen. Zu klaeren ist es nur an dieser Aufnahme selbst.
                  Die Wache aus rc.4.24 greift bei seinem Fall trotzdem,
                  weil sein Bild verkleinert wurde - das Ergebnis stimmt,
                  die dort gegebene Begruendung war unvollstaendig.
                  BESTAETIGT fuer das KRATZER-Screening: am synthetischen
                  Pruefbild in Telefongroesse (900x1600, bekannte
                  Kratzerbreiten 1/2/3/5 px) ueberlebt bei 640 nur EINER
                  von zehn auffaelligsten Kandidaten; bei voller Aufloesung
                  alle zehn. edgeFrac steigt von 0.0086 auf 0.0133 (+55 %),
                  gradMean von 0.0226 auf 0.0284 (+26 %).
                  KOSTEN: die volle Aufloesung braucht etwa das Doppelte
                  der Rechenzeit, nicht das Sechsfache der Pixelzahl. Die
                  absoluten Millisekunden stammen von einem Server und sind
                  NICHT auf ein Telefon uebertragbar; nur das Verhaeltnis.
                  WEITERER BEFUND: die Kandidatenzahl verhaelt sich ueber
                  die Stufen nicht monoton (48, 301, 797, 58, 321). Dieselbe
                  Unstetigkeit zeigte schon der Aufloesungsvergleich an den
                  Realaufnahmen. Das Screening ist gegenueber Skalierung
                  nicht stabil - eigener offener Punkt.
                  WERKZEUGE: werkbank/analyseaufloesung.mjs (neu),
                  werkbank/bildhilfen.mjs (neu, gemeinsame Bildbausteine
                  statt zweier Kopien). jpeg-js als ENTWICKLUNGS-
                  Abhaengigkeit: die Analyse bekommt nie ein PNG zu sehen,
                  sondern ein dekodiertes JPEG - ohne diese Stufe misst man
                  eine Kette, die es nicht gibt. Die ausgelieferte App
                  bleibt unberuehrt.
                  GRENZE: jpeg-js ist nicht bit-gleich mit dem Encoder
                  eines Browsers; der Verlauf ist uebertragbar, die
                  absoluten Bytezahlen koennen abweichen. Das synthetische
                  Pruefbild erreicht die Naesseregel bei KEINER Aufloesung -
                  es taugt fuer Kratzer, nicht als Naessebeleg.
                  NICHTS GEAENDERT an Schwellen, an der 640 oder am
                  Aufnahmeweg. Die Messung ist eine Messung.
Nacharbeit rc.4.26 Auftrag des Auftraggebers, sechs Punkte. Umgesetzt
                  sind die Punkte 1, 2 und 4; 3, 5 und 6 folgen.
                  P2 KEIN AUTOMATISCHES TROCKEN-PASS ohne standardisierte
                     Feuchte-Aufnahmesequenz. Wortlaut woertlich
                     vorgegeben und als Konstante festgeschrieben:
                     "Kein algorithmischer Feuchtehinweis erkannt.
                     Trockenheit mit dieser Aufnahme nicht zuverlaessig
                     beurteilbar." A29 prueft ihn Zeichen fuer Zeichen.
                     Status NOT_ASSESSABLE, damit applyManualSubstitute
                     greift - der Feuchtepunkt bleibt manuell
                     bestaetigbar (A30), die uebrigen Pruefpunkte bleiben
                     bewertbar (A31). Ein Feuchte-FAIL bleibt unter allen
                     Umstaenden ein FAIL (A33).
                  P4 DIE WARNUNG HAENGT NICHT MEHR AN scaleFactor. Sie
                     verschwindet nicht bei voller Aufloesung (A27, die
                     Umkehrung des gleichnamigen Tests aus rc.4.24).
                     captureProfile ist aus der Bewertung ENTFERNT; A28
                     verbietet seine Rueckkehr, prueft dafuer aber den
                     Quelltext OHNE Kommentare - der Text erklaert
                     ausfuehrlich, warum es weg ist, und eine Rohsuche
                     traefe genau diese Begruendung.
                  P1 GETRENNTE AUFNAHMEPFADE je Kriterium, neue Datei
                     src/capturePaths.js. Analyse-Kern (Feuchte,
                     Rueckstand) bei 640, Kratzer-Screening mit der
                     gespeicherten Aufloesung. Begruendet durch Messung:
                     Kratzer 1 von 10 gegen 10 von 10; Feuchte gewinnt
                     NICHTS, edgeFrac sank von 0.0423 auf 0.0254. Die
                     hochaufgeloesten Pixel werden nach dem Screening
                     verworfen und nicht mitgefuehrt - rund 20 MB je Foto
                     bei bis zu zehn Fotos. SC-24 haelt die Trennung fest.
                  WARUM DIE ALTE BEGRUENDUNG FIEL: rc.4.24 hing die Wache
                  am Verkleinerungsfaktor. Die Messung in rc.4.25 hat das
                  widerlegt, und zwei weitere nasse Realaufnahmen zeigten
                  den wirklichen Befund - verstreute Tropfen auf glatter
                  Flaeche sind mit den vorhandenen Merkmalen ueberhaupt
                  nicht von trocken zu trennen:
                     nasse Spuele 1      edgeFrac 0.0423  gradMean 0.0428
                     nasse Spuele 2      edgeFrac 0.0361  gradMean 0.0424
                     trockene Kontrolle  edgeFrac 0.0296  gradMean 0.0355
                  Der Abstand nass/trocken ist kleiner als die Streuung
                  innerhalb der nassen Klasse. KEINE Schwelle trennt das,
                  und keine wurde abgesenkt.
                  SPUERBARE FOLGE: solange der gefuehrte Aufnahmeablauf
                  fehlt, ist die Feuchtigkeit bei JEDER Pruefung nicht
                  bewertbar und muss manuell bestaetigt werden. Das ist
                  der gewollte Zustand, keine Luecke.
                  TESTHILFE: tests/feuchteSequenz.mjs. Sechs Suiten
                  setzen eine ordentlich aufgenommene Pruefung voraus, um
                  etwas anderes zu pruefen. Sie holen die gueltige Sequenz
                  jetzt aus einer Quelle statt aus sechs Kopien - die
                  waeren auseinandergelaufen. Das Tor selbst wird in A25
                  bis A33 eigens geprueft, mit und ohne Sequenz.
                  NOCH OFFEN aus demselben Auftrag: P3 gefuehrter
                  Aufnahmeablauf (normal, Streiflicht links/rechts, alle
                  Originalbilder und Lichtpositionen gespeichert),
                  P5 Feuchte-Vergleichsdetektor als getrenntes assistives
                  Modul, P6 Messkampagne unter drei Lichtpositionen. P6
                  braucht Aufnahmen aus P3 und eine Laufzeitmessung auf
                  dem iPhone - die kann nur am Geraet entstehen.
Ausgangspaket     VisuClean_v8.3.0_RC3.zip
                  SHA-256 d62c510d03b5909753c8708a91688816d2722f29af2f9f1354b8756004038208
                  1 608 845 Byte. Die Arbeitskopie wurde NEU aus diesem ZIP
                  erstellt (Planung Abschnitt 11, Schritt 0). Ein frueherer
                  Vorgriff wurde ausdruecklich nicht als Ausgangsstand
                  verwendet. RC2 blieb unveraendert:
                  SHA-256 2476c993a4b233882e73d31633ca71a11817db1aa38e5ab67c418099f71bdda8
Analyse-Kern      src/analysisCore.js ist byte-identisch zu RC3
                  SHA-256 ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793
                  Keine Kernschwelle wurde verschoben oder erfunden.
Vier-Augen        Auslegung B, am 2026-09-08 vom Auftraggeber entschieden:
                  approvedBy.role === "QA Manager"
                  && approvedBy.username !== performedBy.username
Paketdateien      ${rows.length} (ohne MANIFEST.txt, node_modules und dist)

Abnahme
  npm ci          Lockfile-vollstaendige Neuinstallation
  npm audit       wird beim frischen Paketlauf geprueft
  npm run verify  QR/Icons/Manifest reproduzierbar, Lint, alle Tests, Build

Testaufteilung
  coretest.mjs        ${zz("coretest.mjs")}  Analyse-Regeln und Determinismus
  realimagetest.mjs     ${zz("realimagetest.mjs")}  Reale Nass-/Trocken-Edelstahlfaelle
  enginetest.mjs        ${zz("enginetest.mjs")}  Lokaler Kern und optionale Firmen-KI
  kitest.mjs          ${zz("kitest.mjs")}  Known-Issue-Leitplanken
  v82test.mjs         ${zz("v82test.mjs")}  Domaene, Audit, PWA und Paket
  persisttest.mjs     ${zz("persisttest.mjs")}  AES, Append-only und Speichersperren
  uitest.mjs          ${zz("uitest.mjs")}  semantische UI-Struktur und Bildschirmfluss
  a11ytest.mjs          ${zz("a11ytest.mjs")}  axe-/Tastatur-Smokes
  assessmenttest.mjs  ${zz("assessmenttest.mjs")}  Pruefpunktstatus, Gesamtergebnisregeln, Ersatzpruefung
  scratchtest.mjs     ${zz("scratchtest.mjs")}  Kratzerdokumentation, Vergleich, QA-Freigabe
  aitest.mjs          ${zz("aitest.mjs")}  optionale KI-Gegenpruefung ohne stilles Ueberschreiben
  integrationtest.mjs ${zz("integrationtest.mjs")}  Pruefpunkte im Produktpfad und im gebauten Bundle
  versiontest.mjs     ${zz("versiontest.mjs")}  Versions- und Manifestgleichstand,
                             Lockfile-Wurzeleintrag, keine Testnebenwirkung
  rc4gegenproben.mjs  ${zz("rc4gegenproben.mjs")}  RC3-Maengel nachweislich behoben
  roitest.mjs           ${zz("roitest.mjs")}  ROI-Bezugsrahmen und Fuell-Effekt
  ausschlusstest.mjs   ${zz("ausschlusstest.mjs")} Ausschlusspruefungen X-01 bis X-15 und Z-01
  speicherpfadtest.mjs ${zz("speicherpfadtest.mjs")} Speicherpfad Ende zu Ende, inkl. Nachfreigabe
  screeningtest.mjs     ${zz("screeningtest.mjs")} Screening, Klassifikator, Messkette (SC-01..27)
  mehrwinkeltest.mjs    ${zz("mehrwinkeltest.mjs")} Mehrwinkel-Fusion, Registrierung, Persistenz (MA-01..15)
  sequenztest.mjs        ${zz("sequenztest.mjs")} P3 gefuehrter Aufnahmeablauf: Ablauf, Speicherung,
                             Wiederholbarkeit (Q1..Q14)
  tiefentest.mjs        ${zz("tiefentest.mjs")}  Tiefengrenze < 1,0 um: Operator, Messvertrag,
                             Unsicherheitsintervall, Kontrastabgrenzung (D1..D20)
  screeninganzeigetest.mjs ${zz("screeninganzeigetest.mjs")} Screening-Anzeige Ende zu Ende: Ansicht, Speichern,
                             Neuladen, Bericht, JSON, Gesamtexport, PDF,
                             Tiefengrenze in der Anzeige (T1..T20)
  pdftest.mjs           ${zz("pdftest.mjs")}  PDF-INHALT UND -GEOMETRIE, nebenwirkungsfrei
                             (save wird abgefangen; P17 misst den Satzspiegel)
  schmutztest.mjs       ${zz("schmutztest.mjs")}  Schmutzdarstellung Ende zu Ende und Wischvergleich:
                             Anzeigeebenen, Datensatz, wiedergeoeffneter
                             Bericht, Protokoll, Altformat-Wischtests, fuenf
                             Pflichtfaelle des Wischtests (S1a..S6e)
  pruefflaechetest.mjs  ${zz("pruefflaechetest.mjs")}  Prueffläche, Koordinatensysteme und Bedienwege:
                             Vorschau, Zuschnitt vor der Berechnung,
                             Bildschirmkoordinaten, Kandidatenbild, Ortsbezug der
                             Known-Issue-Zonen, ausgeschlossene Stellen in der
                             Bilanz (R1a..R8c) sowie die drei Aufrufer ueber den
                             tatsaechlichen Erzeugungs- bzw. Bedienweg: echter
                             Known-Issue-Dialog bis onSave, echter Datensatzbau,
                             echte Aufnahmemaske mit Wechsel ueber die
                             Miniaturleiste (R9a..R9e)
  schadenstest.mjs      ${zz("schadenstest.mjs")}  Schadensmeldung, Kandidatenerhalt und
                             Markerbewertung: Marker auf erkannten Riefen und auf
                             Screening-Kandidaten, Schadensverdacht ohne
                             Detektortreffer und ohne Tiefe, Sperrwirkung im
                             Lebenszyklus und an der Speichergrenze, vollstaendige
                             Kandidatenliste an den echten 493 des Geraetelaufs,
                             Bedienweg und Rundlauf durch die Persistenz
                             (M1..M4, S1..S7, L1..L4, P1, K1..K5, U1..U5, R1/R2)
  kalibrierung.mjs      ${zz("kalibrierung.mjs")}  getrennt gezaehlt, siehe unten

Nachweiskette RC3 -> RC4
  RC3_ROTE_GEGENPROBEN.txt  26 Maengel am UNVERAENDERTEN RC3-Quellcode belegt
  rc4gegenproben.mjs        ${ZAHLEN["rc4gegenproben.mjs"]} Pruefungen, dass sie behoben sind
  Ein Test, der nie rot war, gilt nicht als Nachweis einer Reparatur.

Zaehlung
  bestanden                ${BESTANDEN}   Summe der ${SUITEN_OHNE_KALIBRIERUNG} Suiten OHNE kalibrierung.mjs
  kalibrierung.mjs           ${KALIBRIERUNG}   getrennt gezaehlt, NICHT in den ${BESTANDEN} enthalten
  Rohsumme aller ${SUITEN_GESAMT} Skripte ${ROHSUMME}   ${BESTANDEN} + ${KALIBRIERUNG}
  Alle Zahlen dieses Abschnitts stammen aus pruefzahlen.json und werden bei
  jedem npm test gegen einen echten Lauf geprueft. Sie werden nicht getippt.
  fehlgeschlagen             0
  bekannte Einschraenkung    1   KE1
  offene Kalibrierung        5   KO1, KO2, KO3, ROI-Fuell-Effekt, SCALE_CALIBRATION
  nicht ausgefuehrte
  Pflichtpruefung            1   manuelle Browserpruefung mit Screenshots

  Die offenen Kalibrierungsfaelle zaehlen ausdruecklich NICHT als Erfolg.
  Die Naesse-ERKENNUNG auf unscharfen Aufnahmen ist auch in 8.3.0-rc.4 nicht
  geloest. Geloest ist die REAKTION: der betroffene Pruefpunkt wechselt auf
  "Nicht bewertbar", statt ein falsches PASS zu erzeugen. Exitcode 0 von
  kalibrierung.mjs bedeutet "keine Regression", nicht "Anforderung erfuellt".

  Die Aufloesungsabhaengigkeit ist gemessen und als offener Kalibrierungsfall
  gefuehrt. RC4 setzt KEINE Mindestaufloesung.

  WICHTIG, korrigiert in rc.4.7: Bis rc.4.5.mehrwinkel.2 stand hier, ein
  nicht gemessenes Aufnahmeprofil erzeuge "weder PASS noch FAIL". Das war
  falsch — evaluateCaptureProfile hatte im Anwendungspfad keine
  Aufrufstelle, das Tor existierte nur in dieser Beschreibung. Ab rc.4.7
  wird das Profil ERFASST und ANGEZEIGT (Status NOT_MEASURED, Quell- und
  Analyseaufloesung, Verkleinerungsfaktor) und steht im Datensatz; es
  SPERRT in der Testphase NICHT. Das ist eine Herkunftsangabe, keine
  Genauigkeitsbehauptung. Ob bestimmte Profile vor einer produktiven
  Freigabe sperren, ist eine offene Entscheidung.

  Die Etikett-Massstabskalibrierung (SCALE_CALIBRATION) ist ebenfalls OPEN:
  Nennmass 43 mm aus dem Druck-CSS, Druck nicht vermessen. Keine
  Millimeterangabe in der Anzeige — auch nicht fuer das Prueffeld: es ist
  als "3x erkannte Etikettenbreite" benannt, ein unkalibrierter Stellwert.
  Die Mehrwinkel-Fusion ist zusaetzlich zur Einzelbildbewertung und
  veraendert vor der Kalibrierung kein Qualitaetsurteil; ohne Detektor
  (rc.4.6) bleibt scoreByPersistence auf NO_DETECTOR. Nicht ebene Zonen
  (Rohre, Kessel, Konen) sind von der Fusion ausgenommen und werden als
  Einzelbilder vollstaendig bewertet.

Elektronische Signatur
  Ab 8.3.0-rc.4.3 besteht die Signatur aus ZWEI Identifikationskomponenten
  (Benutzerkennung und Passwort) nach 21 CFR Part 11 §11.200. Die
  gezeichnete Unterschrift ist entfallen: sie war nie eine Kontrolle
  ("Pfadlaenge >= 20 px" belegt nur eine Fingerbewegung) und ist mit
  Handschuhen im Reinraum nicht reproduzierbar. Name, Zeitpunkt und
  Bedeutung stehen weiterhin in Datensatz, Anzeige und PDF (§11.50).
  Aeltere Datensaetze mit gezeichneter Unterschrift bleiben lesbar.

Vier-Augen-Prinzip — organisatorische Voraussetzung
  RC4 setzt Auslegung B technisch durch: approvedBy.role === "QA Manager"
  und approvedBy.username !== performedBy.username. Diese Invariante ist eine
  WORKFLOW-SPERRE, kein Zugriffsschutz. Die Demo-Benutzer stehen im Bundle;
  wer sie liest, kann sich nacheinander als Pruefer und als Genehmiger
  anmelden und die Invariante formal erfuellen. Die tatsaechliche Trennung
  zweier Personen muss deshalb ORGANISATORISCH getragen werden (SOP), bis
  eine serverseitige oder IdP-gestuetzte Identitaet vorliegt.

  Ab 8.3.0-rc.4.1 ist das Demo-Panel auf dem Anmeldeschirm standardmaessig
  ausgeblendet (VITE_DEMO_ACCESS=true blendet es ein). Das hebt die Huerde,
  es schuetzt nicht.

Was in RC4 NICHT enthalten ist
  Die RoiPad-Oberflaeche der Preview-Linie ist nicht nach RC4 portiert.
  Uebernommen ist ausschliesslich src/roi.js als Geometrie-Ebene fuer den
  spaeteren bauteilbezogenen Bezugsrahmen. Der ROI-Zuschnitt beeinflusst in
  RC4 kein Qualitaetsurteil (roitest.mjs R8), weil der Fuell-Effekt von
  copyRoiImageData nicht gemessen ist.

  Das Befundregister (Schaden- und Kratzerdokumentation ueber Pruefungen
  hinweg) ist NICHT Teil von RC4. Es ist als eigenes Arbeitspaket geplant.

Abgrenzung
  Kein validiertes GMP-Produktivsystem. Native iOS/CoreML, zentrale Identitaet,
  qualifizierte Synchronisation/Archivierung und formale OQ/PQ bleiben
  Produkt-Zielarchitektur. Rollen-, Personen- und Signaturpruefungen sind
  Workflow-Sperren im Browserprofil, kein manipulationsgeschuetzter
  Zugriffsschutz. Details: README.md, V83_RC4_ACCEPTANCE.md, V83_RC3_ACCEPTANCE.md und
  V82_ACCEPTANCE.md.

SHA-256-Dateiliste
------------------
${rows.map(row => `${row.hash}  ${String(row.bytes).padStart(8)}  ${row.file}`).join("\n")}
`;

if (process.argv.includes("--check")) {
  const saved = await readFile(target, "utf8").catch(() => "");
  if (saved !== text) {
    console.error("MANIFEST.txt ist nicht aktuell. Fuehre npm run manifest aus.");
    process.exit(1);
  }
  console.log(`Manifest reproduzierbar: ${rows.length} Dateien`);
} else {
  await writeFile(target, text, "utf8");
  console.log(`Manifest erzeugt: ${rows.length} Dateien`);
}
