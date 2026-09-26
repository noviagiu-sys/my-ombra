/* ─── VisuClean · Integration der Prüfpunkte in das Produkt (RC3) ──────────
   Aufruf: node integrationtest.mjs

   Diese Suite ist aus einem konkreten Befund entstanden. Die Prüfpunkt-
   Logik aus assessment.js war vollständig implementiert und mit 23 Tests
   belegt — aber NICHT an die Anwendung angeschlossen. buildCheckpoints,
   overallResult, classifyScratches und crossCheckAssessment fehlten
   restlos im gebauten Bundle, weil App.jsx sie nie aufrief. Der Benutzer
   hätte weiterhin "Keine sichtbare Feuchtigkeit" gesehen.

   Eine grüne Modulsuite beweist also nicht, dass ein Produktfehler behoben
   ist. Genau diese Lücke schliesst diese Datei: sie prüft den Weg, den die
   Anwendung wirklich geht, und sie prüft, dass die Entscheidungslogik im
   ausgelieferten Bundle ankommt.                                         */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { build } from "vite";
import { runLocalEngine } from "./src/analysisEngines.js";
import { buildCheckpoints, aggregateCheckpoints, applyToleratedScratch, STATUS } from "./src/assessment.js";
import { aggregateResults, deriveSystemDecision, checkpointOverall, OVERALL } from "./src/domain.js";
import { mitFeuchteSequenz } from "./tests/feuchteSequenz.mjs";

const R = [];
const ok = (id, name, bestanden, info = "") => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

/* Dieselbe Kastenunschaerfe wie in kalibrierung.mjs — ein Radius, der eine
   reale Handaufnahme aus der Hueftbewegung nachbildet. */
function weichzeichnen(data, w, h, rad) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = (ny * w + nx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}
const lade = n => PNG.sync.read(fs.readFileSync(new URL(`./tests/fixtures/real/${n}`, import.meta.url)));

/* Genau der Aufruf, den analyzeImage() in App.jsx macht. */
function wieDieAnwendung(png, rad = 0) {
  const d = rad === 0 ? png.data : weichzeichnen(png.data, png.width, png.height, rad);
  const local = runLocalEngine(d, png.width, png.height);
  return {
    ...local.verdict,
    /* Vollstaendige Feuchte-Sequenz: diese Suite prueft, dass die
       Pruefpunkte im Anwendungspfad entstehen, nicht das Feuchte-Tor
       (A25 bis A33). */
    checkpoints: buildCheckpoints(local.features, local.verdict, mitFeuchteSequenz()),
    lm: local.features.lm,
  };
}

const nass = lade("wet-stainless-wide.png");
const unscharfNass = wieDieAnwendung(nass, 1);
const scharfNass = wieDieAnwendung(nass, 0);
const trocken = wieDieAnwendung(lade("dry-stainless-control.png"), 0);
const punktVon = (r, id) => r.checkpoints.find(c => c.id === id);

console.log("VisuClean · Prüfpunkte im Produktpfad");
console.log("");
console.log("── Der Weg, den die Anwendung geht ──");

ok("I1", "analyzeImage-Pfad liefert fuenf Pruefpunkte",
  unscharfNass.checkpoints.length === 5
  && ["moisture", "residue", "scratch", "corrosion", "surface"]
    .every(id => unscharfNass.checkpoints.some(c => c.id === id)),
  unscharfNass.checkpoints.map(c => `${c.id}=${c.status}`).join(" · "));

ok("I2", "Die unscharfe nasse Aufnahme meldet im Produktpfad NICHT bewertbar",
  punktVon(unscharfNass, "moisture").status === STATUS.NOT_ASSESSABLE,
  `${punktVon(unscharfNass, "moisture").code} — RC2 zeigte hier "Keine sichtbare Feuchtigkeit"`);

console.log("");
console.log("── Zusammenfassung ueber mehrere Fotos ──");

const eineAufnahme = aggregateResults([unscharfNass]);
ok("I3", "aggregateResults haengt die Pruefpunkte an das Gesamtergebnis",
  Array.isArray(eineAufnahme.checkpoints) && eineAufnahme.checkpoints.length === 5,
  "das Feld wandert damit in Datensatz, Protokoll, Export und PDF");

const gemischt = aggregateResults([trocken, unscharfNass]);
ok("I4", "Ein bestandenes Foto ueberdeckt ein nicht bewertbares NICHT",
  gemischt.checkpoints.find(c => c.id === "moisture").status === STATUS.NOT_ASSESSABLE,
  "Worst-Result-Wins gilt auch fuer den offenen Zustand");

ok("I5", "Ein FAIL ist staerker als NICHT BEWERTBAR",
  aggregateResults([scharfNass, unscharfNass]).checkpoints
    .find(c => c.id === "moisture").status === STATUS.FAIL,
  "ein bestaetigtes Nicht-Bestanden wird nicht zu einer offenen Frage abgeschwaecht");

ok("I6", "Ohne Pruefpunkte bleibt aggregateResults unveraendert",
  (() => {
    const ohne = aggregateResults([{ ...trocken, checkpoints: undefined }]);
    return ohne.checkpoints === undefined && ohne.dry && ohne.clean && ohne.intact;
  })(),
  "aeltere Datensaetze und bestehende Suiten bleiben gueltig - das Feld ist additiv");

console.log("");
console.log("── Die Systementscheidung der Anwendung ──");

/* Die unscharfe Nassaufnahme traegt zusaetzlich einen echten Rueckstands-
   befund. Um die NEUE Regel isoliert zu pruefen, wird der Fall konstruiert,
   in dem die drei Sammelurteile bestehen und einzig ein Pruefpunkt offen
   ist — vor RC3 waere genau das ein glattes PASS gewesen. */
const gut = urteil => ({ pass: true, code: "PASS", message: urteil, detail: "", severity: 0, action: "" });
const nurOffen = {
  dry: gut("trocken"), clean: gut("sauber"), intact: gut("intakt"), lm: 0.5, hints: [],
  checkpoints: aggregateCheckpoints([[
    { id: "moisture", status: STATUS.NOT_ASSESSABLE, required: true, code: "NOT_ASSESSABLE_UNRELIABLE_EDGE_EVIDENCE", label: { de: "Feuchtigkeit", en: "Moisture" }, message: { de: "", en: "" } },
    { id: "residue", status: STATUS.PASS, required: true, code: "PASS", label: { de: "Rueckstaende", en: "Residue" }, message: { de: "", en: "" } },
    { id: "scratch", status: STATUS.PASS, required: true, code: "PASS", label: { de: "Kratzer", en: "Scratch" }, message: { de: "", en: "" } },
    { id: "corrosion", status: STATUS.PASS, required: true, code: "PASS", label: { de: "Korrosion", en: "Corrosion" }, message: { de: "", en: "" } },
    { id: "surface", status: STATUS.PASS, required: true, code: "PASS", label: { de: "Oberflaeche", en: "Surface" }, message: { de: "", en: "" } },
  ]]),
};
const entscheidungOffen = deriveSystemDecision(nurOffen);
ok("I7", "Alle drei Sammelurteile bestehen, ein Pruefpunkt ist offen -> kein PASS",
  entscheidungOffen.status !== "PASS" && entscheidungOffen.reason === "NOT_ASSESSABLE"
  && entscheidungOffen.notAssessable.includes("moisture"),
  `Status ${entscheidungOffen.status} · Grund ${entscheidungOffen.reason} · offen: ${entscheidungOffen.notAssessable.join(", ")} `
  + "— in RC2 waere dieselbe Lage PASS gewesen");

/* BEFUND, nicht behoben und nicht als Erfolg gezaehlt: die trockene
   Kontrollaufnahme erreicht auch in RC3 kein PASS, sondern WARNING. Grund
   ist ein bereits in RC2 vorhandener Analysehinweis (hints), nicht die neue
   Regel — deriveSystemDecision stuft jede Aufnahme mit Hinweis auf WARNING.
   Entscheidend fuer RC3 ist, dass KEIN Pruefpunkt offen ist. */
const entscheidungTrocken = deriveSystemDecision(aggregateResults([trocken]));
ok("I8", "Keine Ueberkorrektur: die trockene Kontrollaufnahme oeffnet keinen Pruefpunkt",
  entscheidungTrocken.status !== "FAIL" && entscheidungTrocken.notAssessable.length === 0
  && entscheidungTrocken.reason !== "NOT_ASSESSABLE",
  `Status ${entscheidungTrocken.status} · Grund ${entscheidungTrocken.reason} · offene Punkte 0. `
  + "WARNING kommt aus einem RC2-Analysehinweis, nicht aus der neuen Regel.");

ok("I9", "Ein FAIL bleibt vorrangig vor NICHT BEWERTBAR",
  deriveSystemDecision(aggregateResults([scharfNass, unscharfNass])).status === "FAIL",
  "\"nicht bewertbar\" ersetzt kein bestaetigtes Nicht-Bestanden");

ok("I10", "checkpointOverall liefert das Gesamtergebnis der Pruefpunkte",
  checkpointOverall(nurOffen).status === OVERALL.NOT_ASSESSABLE
  && checkpointOverall(aggregateResults([unscharfNass])).status === OVERALL.BLOCKED
  && checkpointOverall(aggregateResults([trocken])).status === OVERALL.PASS
  && checkpointOverall({}) === null,
  "offen -> NOT_ASSESSABLE · mit Rueckstandsbefund -> BLOCKED · Kontrolle -> PASS · ohne Punkte -> null");

console.log("");
console.log("── Known Issues wirken nur dort, wo sie duerfen ──");

const mitKratzer = [{ id: "scratch", status: STATUS.FAIL, code: "SCRATCH_SUSPECT", required: true, label: { de: "Kratzer", en: "Scratch" }, message: { de: "", en: "" } }];
ok("I11", "Eine bestaetigte Known-Issue-Toleranz entschaerft den Kratzerpunkt",
  applyToleratedScratch(mitKratzer, { status: "unveraendert", matchedZones: 2 })[0].status === STATUS.PASS,
  "Status PASS mit Code KNOWN_ISSUE_TOLERATED, Originalstatus bleibt dokumentiert");

ok("I12", "Verschlechterung, Nichtlokalisierbarkeit und Untolerierbarkeit entschaerfen nichts",
  ["verschlechtert", "nicht_lokalisierbar", "nicht_tolerierbar"].every(status =>
    applyToleratedScratch(mitKratzer, { status })[0].status === STATUS.FAIL)
  && applyToleratedScratch(mitKratzer, null)[0].status === STATUS.FAIL,
  "ein neuer oder gewachsener Kratzer bleibt ein FAIL");

ok("I13", "Ein nicht bewertbarer Punkt wird durch Known Issues nicht bewertbar gemacht",
  applyToleratedScratch(
    [{ ...mitKratzer[0], status: STATUS.NOT_ASSESSABLE }],
    { status: "unveraendert", matchedZones: 1 })[0].status === STATUS.NOT_ASSESSABLE,
  "nur ein FAIL kann toleriert werden, keine offene Frage");

console.log("");
console.log("── Kommt die Entscheidungslogik im gebauten Bundle an? ──");

const ziel = fs.mkdtempSync(path.join(os.tmpdir(), "visuclean-bundle-"));
let bundle = "";
try {
  await build({ logLevel: "silent", build: { outDir: ziel, emptyOutDir: true } });
  bundle = fs.readdirSync(path.join(ziel, "assets"))
    .filter(name => name.endsWith(".js"))
    .map(name => fs.readFileSync(path.join(ziel, "assets", name), "utf8"))
    .join("\n");
} finally {
  fs.rmSync(ziel, { recursive: true, force: true });
}

const imBundle = muster => (bundle.match(new RegExp(muster, "g")) || []).length;
ok("I14", "Der Prüfpunkt-Text erreicht die ausgelieferte Oberflaeche",
  imBundle("Nicht bewertbar") > 0 && imBundle("NOT_ASSESSABLE_UNRELIABLE_EDGE_EVIDENCE") > 0
  && imBundle("Prüfpunkte") > 0,
  `"Nicht bewertbar" ${imBundle("Nicht bewertbar")}x · Ursachencode ${imBundle("NOT_ASSESSABLE_UNRELIABLE_EDGE_EVIDENCE")}x`);

ok("I15", "Die Entscheidungsregeln sind im Bundle vorhanden und nicht wegoptimiert",
  imBundle("NOT_ASSESSABLE_NO_EDGE_SUPPORT") > 0 && imBundle("geometrieBeleg") > 0
  && imBundle("KNOWN_ISSUE_TOLERATED") > 0,
  "die Codes entstehen nur, wenn buildCheckpoints tatsaechlich aufgerufen wird");

ok("I16", "Der ausgeschlossene SOP-QR-Weg ist auch im Bundle nicht entstanden",
  imBundle("sopUrl") === 0 && imBundle("sopLink") === 0 && imBundle("sopSearch") === 0,
  "keine SOP-Suche, keine SOP-Verlinkung per QR-Code");

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
