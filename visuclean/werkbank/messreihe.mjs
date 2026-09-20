/* ─── VisuClean · Werkbank — Messreihe ueber einen Bilderordner ───────────
   Aufruf:
     node werkbank/messreihe.mjs <ordner> [--csv merkmale.csv]

   WOZU
   Die Frage "erkennt die App Kratzer und Schmutz zuverlaessig" laesst sich
   nicht durch Nachdenken beantworten, sondern nur durch Messen. Dieses
   Skript nimmt einen Ordner echter Aufnahmen, laesst ALLE Stufen darueber
   laufen und schreibt eine Tabelle, die von Hand gelabelt werden kann.

     analysisCore      → die elf Kernmerkmale und das Urteil
     scratchScreening  → Kandidaten mit ihren sechs Merkmalen

   Aus der gelabelten Tabelle trainiert werkbank/train_rf.py.

   WARUM DAS GEBRAUCHT WIRD
   Gemessen an den drei realen Aufnahmen des Projekts trennen acht von elf
   Merkmalen "nass unscharf" von "trocken scharf". Bei DREI Szenen und ELF
   Merkmalen ist eine solche Trennung aber wertlos: sie entsteht mit hoher
   Wahrscheinlichkeit zufaellig, und sie beschreibt vermutlich die
   Beleuchtung, nicht die Naesse. Erst genuegend unabhaengige Szenen
   trennen Signal von Zufall.

   WAS FOTOGRAFIERT WERDEN MUSS
   Je Klasse etwa zwanzig UNABHAENGIGE Aufnahmen:
     - verschiedene Bauteile, nicht dasselbe aus zwanzig Winkeln
     - verschiedene Abstaende
     - verschiedene Beleuchtungen, ausdruecklich auch warmes Licht
   Der letzte Punkt ist der wichtigste. Ohne warme Beleuchtung auf SAUBEREN
   Teilen lernt jedes Modell "warm = schmutzig" — und liegt im Reinraum
   unter Gluehlampenlicht dauerhaft daneben.

   Dateinamen tragen die Klasse, damit nichts von Hand zugeordnet werden
   muss:  sauber_*, schmutz_*, nass_*, kratzer_*  (sonst "unbekannt")

   Rein lesend. Schreibt nur die angegebene CSV.                          */

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { buildVerdicts, computeFeatures } from "../src/analysisCore.js";
import { screenScratches } from "../src/scratchScreening.js";
import { FEATURE_ORDER, exportFeatureTable } from "../src/scratchClassifier.js";

const KERNMERKMALE = [
  "lm", "bfr", "dfr", "vdfr", "wf", "wfRaw", "cv",
  "tvFlat", "gradMean", "edgeFrac", "anomBlockFrac", "warmBlockFrac",
];

function klasseAusName(datei) {
  const n = path.basename(datei).toLowerCase();
  if (n.startsWith("sauber")) return "SAUBER";
  if (n.startsWith("schmutz")) return "SCHMUTZ";
  if (n.startsWith("nass")) return "NASS";
  if (n.startsWith("kratzer")) return "KRATZER";
  return "UNBEKANNT";
}

/* Trennzeichen der Messreihe. MUSS mit CSV_TRENNZEICHEN in
   werkbank/train_rf.py uebereinstimmen. SC-18 fuehrt die Kette aus und
   faengt eine Abweichung - anders als eine Quelltextsuche. */
const CSV_TRENNZEICHEN = ";";

function csvFeld(wert) {
  const s = String(wert ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ordner = process.argv[2];
const csvIndex = process.argv.indexOf("--csv");
const csvPfad = csvIndex > 0 ? process.argv[csvIndex + 1] : "merkmale.csv";

if (!ordner) {
  console.error("Aufruf: node werkbank/messreihe.mjs <ordner> [--csv datei.csv]");
  process.exit(2);
}
if (!fs.existsSync(ordner) || !fs.statSync(ordner).isDirectory()) {
  console.error(`Kein Verzeichnis: ${ordner}`);
  process.exit(2);
}

const bilder = fs.readdirSync(ordner)
  .filter(n => /\.png$/i.test(n))
  .sort();   /* sortiert: zwei Laeufe ergeben dieselbe Tabelle */

if (bilder.length === 0) {
  console.error(`Keine PNG-Dateien in ${ordner}.`);
  console.error("JPEG wird bewusst nicht gelesen: die Blockartefakte der");
  console.error("Kompression erzeugen genau die Mikrokanten, an denen die");
  console.error("Kratzer- und Naessemerkmale haengen. Verlustfrei aufnehmen.");
  process.exit(2);
}

/* ── Kopfzeile ────────────────────────────────────────────────────────── */

const spalten = [
  "datei", "klasse_aus_dateiname", "breite", "hoehe",
  ...KERNMERKMALE.map(m => `kern_${m}`),
  "kern_trocken", "kern_sauber", "kern_intakt",
  "schliffrichtung_grad", "schliffstaerke", "schliff_faecher",
  "kandidaten_gesamt", "kandidaten_unterdrueckt",
  "kandidat_rang", ...FEATURE_ORDER,
  /* Zweite Rangfolge, parallel protokolliert: dieselbe Bewertung OHNE den
     Richtungsfaktor, und der Platz, den der Kandidat darin einnimmt. Die
     Vorzugsrichtung ist nicht kalibriert - welche Kandidaten sie nach
     hinten schiebt, muss in der Messkampagne nachrechenbar sein und darf
     sich nicht erst im Nachhinein zeigen.

     NICHT Teil von FEATURE_ORDER: der Merkmalsvertrag bindet das Modell.
     Eine Spalte hier anzuhaengen ist Messdatenerfassung, keine
     Vertragsaenderung. */
  "relevanz_ungerichtet", "rang_ungerichtet",
  /* Von Hand auszufuellen. Leer gelassen heisst: noch nicht gelabelt. */
  "label", "label_quelle", "bemerkung",
];

const zeilen = [spalten.join(CSV_TRENNZEICHEN)];

/* Richtungshistogramm: bewusst eine EIGENE Datei und NICHT im
   Pruefdatensatz.

   Im Protokoll waeren 36 Zahlen je Aufnahme Ballast, den niemand liest;
   in der Werkbank sind sie die Grundlage fuer die Frage, ob die
   geschaetzte Vorzugsrichtung ueberhaupt eine ist. Genau diese Frage ist
   offen - die Richtungsstaerke ist nicht kalibriert. Bis sie beantwortet
   ist, gehoeren die Rohzahlen dorthin, wo gemessen wird. */
const histoZeilen = [];
let histoSpalten = null;
let kandidatenGesamt = 0;
const jeKlasse = {};

console.log(`Messreihe ueber ${bilder.length} Aufnahmen aus ${ordner}\n`);
console.log("Datei                           Urteil (T/S/I)        Schliff  Kandidaten");
console.log("-".repeat(78));

for (const name of bilder) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ordner, name)));
  const { width: w, height: h } = png;
  const f = computeFeatures(png.data, w, h);
  const urteil = buildVerdicts(f);
  const s = screenScratches(png.data, w, h);
  const tabelle = exportFeatureTable(s);
  const klasse = klasseAusName(name);
  jeKlasse[klasse] = (jeKlasse[klasse] || 0) + 1;
  kandidatenGesamt += tabelle.rows.length;

  const kern = [
    ...KERNMERKMALE.map(m => (Number.isFinite(f[m]) ? f[m].toFixed(6) : "")),
    urteil.dry.code, urteil.clean.code, urteil.intact.code,
    s.grindDirectionDeg.toFixed(2), s.grindStrength.toFixed(4), s.orientationBins,
    tabelle.rows.length, s.suppressedCount,
  ];

  if (tabelle.rows.length === 0) {
    /* Auch ohne Kandidaten bleibt die Aufnahme in der Tabelle — eine
       Aufnahme ohne Befund ist ein Datenpunkt, kein Nichts. */
    zeilen.push([name, klasse, w, h, ...kern, "", ...FEATURE_ORDER.map(() => ""),
      "", "", "", "", ""].map(csvFeld).join(CSV_TRENNZEICHEN));
  } else {
    /* Platz in der ungerichteten Rangfolge. Index 0 der sortierten Liste
       ist Platz 1 - dieselbe Zaehlung wie bei rank. */
    const ungerichtet = s.candidates
      .map((k, i) => ({ i, wert: k.relevanceScoreUngerichtet }))
      .sort((a, b) => b.wert - a.wert);
    const platzUngerichtet = new Map(ungerichtet.map((e, platz) => [e.i, platz + 1]));
    for (const zeile of tabelle.rows) {
      const kandidat = s.candidates[zeile.rank - 1];
      zeilen.push([
        name, klasse, w, h, ...kern,
        zeile.rank, ...FEATURE_ORDER.map(m => zeile[m].toFixed(6)),
        kandidat.relevanceScoreUngerichtet.toFixed(6),
        platzUngerichtet.get(zeile.rank - 1),
        "", "", "",
      ].map(csvFeld).join(CSV_TRENNZEICHEN));
    }
  }

  /* Zwei staerkste Faecher und ihr Abstand. Der Abstand ist die einzige
     hier ablesbare Andeutung, ob EINE Richtung vorliegt oder zwei - mehr
     wird daraus nicht abgeleitet, solange nichts kalibriert ist. */
  if (!histoSpalten) {
    histoSpalten = [
      "datei", "klasse_aus_dateiname", "faecher",
      "richtung_grad", "staerke",
      "zweite_richtung_grad", "zweite_staerke", "abstand_grad",
      ...s.grindHistogram.map((_, i) => `fach_${String(i).padStart(3, "0")}`),
    ];
    histoZeilen.push(histoSpalten.join(CSV_TRENNZEICHEN));
  }
  const histoSumme = s.grindHistogram.reduce((z, v) => z + v, 0) || 1;
  const abstand = Number.isFinite(s.grindSecondDirectionDeg)
    ? Math.min(
      Math.abs(s.grindSecondDirectionDeg - s.grindDirectionDeg),
      180 - Math.abs(s.grindSecondDirectionDeg - s.grindDirectionDeg))
    : "";
  histoZeilen.push([
    name, klasse, s.orientationBins,
    s.grindDirectionDeg.toFixed(2), s.grindStrength.toFixed(4),
    Number.isFinite(s.grindSecondDirectionDeg) ? s.grindSecondDirectionDeg.toFixed(2) : "",
    Number.isFinite(s.grindSecondStrength) ? s.grindSecondStrength.toFixed(4) : "",
    abstand === "" ? "" : abstand.toFixed(2),
    ...s.grindHistogram.map(v => (v / histoSumme).toFixed(6)),
  ].map(csvFeld).join(CSV_TRENNZEICHEN));

  console.log(
    `${name.slice(0, 30).padEnd(32)}`
    + `${urteil.dry.pass ? "P" : "F"}/${urteil.clean.pass ? "P" : "F"}/${urteil.intact.pass ? "P" : "F"}`
    + `${(s.grindDirectionDeg.toFixed(0) + "°").padStart(20)}`
    + `${String(tabelle.rows.length).padStart(11)}`
    + ` (${s.suppressedCount} Schliff)`);
}

fs.writeFileSync(csvPfad, zeilen.join("\n") + "\n", "utf8");

const histoPfad = csvPfad.replace(/(\.csv)?$/i, "") + "_richtungshistogramm.csv";
fs.writeFileSync(histoPfad, histoZeilen.join("\n") + "\n", "utf8");

console.log("\n" + "-".repeat(78));
console.log(`Tabelle geschrieben: ${csvPfad}`);
console.log(`Richtungshistogramm (nur Werkbank): ${histoPfad}`);
console.log(`  ${bilder.length} Aufnahmen · ${kandidatenGesamt} Kandidatenzeilen`);
console.log(`  Klassen: ${Object.entries(jeKlasse).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

/* ── Ehrliche Einschaetzung der Aussagekraft ──────────────────────────── */

const unabhaengig = bilder.length;
console.log("\nAUSSAGEKRAFT");
if (unabhaengig < 20) {
  console.log(`  ${unabhaengig} Aufnahmen sind ZU WENIG. Bei zwoelf Kernmerkmalen`);
  console.log("  laesst sich damit fast jede Trennung finden - auch eine zufaellige.");
  console.log("  Richtwert: etwa 20 UNABHAENGIGE Aufnahmen je Klasse.");
} else {
  console.log(`  ${unabhaengig} Aufnahmen. Ausreichend fuer eine erste Auswertung,`);
  console.log("  sofern es verschiedene Teile, Abstaende und Beleuchtungen sind");
  console.log("  und nicht dasselbe Teil aus vielen Winkeln.");
}
console.log("\nNAECHSTER SCHRITT");
console.log("  Spalten 'label' (1 = relevant, 0 = harmlos) und 'label_quelle'");
console.log("  von Hand fuellen. Zulaessige Quellen: TASTSCHNITT, REPLIKA,");
console.log("  SICHTPRUEFUNG, MIKROSKOP. Die Quelle 'REGEL' weist das");
console.log("  Trainingsskript zurueck - ein Wald, der auf den Ausgaben der");
console.log("  eigenen Regel trainiert, lernt die Regel und nicht die Wirklichkeit.");
console.log("\n  Danach:  python3 werkbank/train_rf.py --daten " + csvPfad + " --modell modell.json");
