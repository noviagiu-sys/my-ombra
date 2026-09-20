/* ─── VisuClean · Kratzer-Screening SC-01 bis SC-08 ───────────────────────
   Aus dem Arbeitsauftrag "Kratzer-Screening als Zweitdetektor".

   SC-01 und SC-02 sind die wichtigsten: sie sichern die Eigenschaft, auf
   der das gesamte Sicherheitsargument ruht — das Screening darf nur
   hinzufuegen und sortieren, niemals ein Urteil aendern oder einen Befund
   entfernen. Faellt eine der beiden, ist das Modul nicht mehr durch seine
   Bauform sicher und darf ohne validierte Schwellen nicht laufen.

   SC-04 ist der fachliche Kern: ein Querkratzer im Schliffmuster muss auf
   Platz 1 stehen. Ohne ihn ist das Screening auf gebuerstetem Edelstahl
   wertlos.

   Alle Bilder sind synthetisch und deterministisch erzeugt — kein Zufall,
   kein Seed noetig.                                                      */

import { screenScratches, mergeScreening, waehleProtokollKandidaten,
  SCREENING_STELLWERTE } from "./src/scratchScreening.js";
import { PNG } from "pngjs";
import { CLASS_LABELS, FEATURE_ORDER, exportFeatureTable, featureVector, loadModel } from "./src/scratchClassifier.js";
import { parseScreeningConfig } from "./src/screeningConfig.js";
import { ANALYSE_KANTE, AUFNAHMEZWECK } from "./src/capturePaths.js";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVerdicts, computeFeatures } from "./src/analysisCore.js";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · Kratzer-Screening (Zweitdetektor)\n");

/* ── Synthetische Bilder ──────────────────────────────────────────────── */

const W = 320, H = 320;

/** Gleichmaessige Edelstahlflaeche. */
function flaeche(w = W, h = H, grund = 150) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    d[o] = grund; d[o + 1] = grund; d[o + 2] = grund; d[o + 3] = 255;
  }
  return d;
}

/**
 * Zeichnet eine Linie durch die Bildmitte, verschoben um versatz, unter
 * dem Winkel grad (0 = waagerecht). Deterministisch, ohne Antialiasing.
 */
function linie(d, w, h, grad, versatz, laenge, dicke, dunkel) {
  const rad = grad * Math.PI / 180;
  const cx = w / 2 + Math.sin(rad) * versatz;
  const cy = h / 2 - Math.cos(rad) * versatz;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  for (let t = -laenge / 2; t <= laenge / 2; t += 0.5) {
    for (let q = -dicke / 2; q <= dicke / 2; q += 0.5) {
      const x = Math.round(cx + dx * t - dy * q);
      const y = Math.round(cy + dy * t + dx * q);
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const o = (y * w + x) * 4;
      d[o] = Math.max(0, d[o] - dunkel);
      d[o + 1] = Math.max(0, d[o + 1] - dunkel);
      d[o + 2] = Math.max(0, d[o + 2] - dunkel);
    }
  }
  return d;
}

/** Schliffmuster: viele parallele Linien unter einem Winkel. */
function schliffbild(grad, w = W, h = H) {
  const d = flaeche(w, h);
  for (let k = -Math.max(w, h); k <= Math.max(w, h); k += 6) {
    linie(d, w, h, grad, k, Math.max(w, h) * 1.5, 1, 28);
  }
  return d;
}

/* ── SC-01/SC-02 · Die Sicherheitseigenschaft ─────────────────────────── */

const mitKratzer = linie(schliffbild(0), W, H, 90, 0, 180, 3, 80);
const kernMerkmale = computeFeatures(mitKratzer, W, H);
const kernUrteilOhne = buildVerdicts(kernMerkmale);

const screening = screenScratches(mitKratzer, W, H);

/* Der Kern wird mit demselben Pixelfeld erneut ausgewertet, NACHDEM das
   Screening gelaufen ist. Veraendert das Screening das Bild oder den
   Zustand, weicht das Urteil ab. */
const kernUrteilNach = buildVerdicts(computeFeatures(mitKratzer, W, H));

const gleich = JSON.stringify(kernUrteilOhne) === JSON.stringify(kernUrteilNach);
ok("SC-01", "Das Screening darf kein Urteil veraendern",
  gleich,
  gleich
    ? `dry/clean/intact unveraendert: ${kernUrteilNach.dry.code} · ${kernUrteilNach.clean.code} · ${kernUrteilNach.intact.code}`
    : "das Kernurteil weicht nach dem Screening ab");

const kernBefunde = kernMerkmale.scratches.map((c, i) => ({ source: "CORE", index: i }));
const zusammen = mergeScreening(kernBefunde, screening);
const kernVollstaendig = kernBefunde.every(b =>
  zusammen.some(z => z.source === "CORE" && z.index === b.index));
ok("SC-02", "Das Screening darf keinen Befund des Kerns entfernen",
  kernVollstaendig && zusammen.length >= kernBefunde.length,
  `Kern ${kernBefunde.length} → zusammengefuehrt ${zusammen.length} (Menge kann nur wachsen)`);

/* ── SC-03 · Reines Schliffmuster ─────────────────────────────────────── */

const nurSchliff = screenScratches(schliffbild(0), W, H);
const staerkster = nurSchliff.candidates[0]?.relevanceScore ?? 0;
ok("SC-03", "Reines Schliffmuster wird als Schliff eingestuft, nicht als Befund",
  nurSchliff.suppressedCount > 0 && staerkster < 0.05,
  `unterdrueckt ${nurSchliff.suppressedCount} von ${nurSchliff.candidates.length}`
  + ` · staerkster Score ${staerkster.toFixed(4)}`);

/* ── SC-04 · Der Kern des Ganzen ──────────────────────────────────────── */

const quer = screenScratches(mitKratzer, W, H);
const platz1 = quer.candidates[0];
/* Der Querkratzer liegt senkrecht zum Schliff (0 Grad), also bei etwa 90
   Grad Hauptachse und entsprechend grossem Winkelabstand. */
const istQuerkratzer = platz1 && platz1.grindDeltaDeg > 60;
ok("SC-04", "Ein Querkratzer im Schliffmuster muss auf Platz 1 stehen",
  Boolean(istQuerkratzer),
  platz1
    ? `Platz 1: Winkelabstand ${platz1.grindDeltaDeg.toFixed(1)}°`
      + ` · Laenge ${(platz1.lengthRel * 100).toFixed(1)} % der kurzen Kante`
      + ` · Score ${platz1.relevanceScore.toFixed(4)}`
      + ` (${quer.candidates.length} Kandidaten gesamt)`
    : "keine Kandidaten gefunden");

/* ── SC-05 · Schliffrichtung ──────────────────────────────────────────── */

const richtungen = [0, 45, 90, 135];
const abweichungen = richtungen.map(soll => {
  const r = screenScratches(schliffbild(soll), W, H);
  let d = Math.abs(r.grindDirectionDeg - soll) % 180;
  if (d > 90) d = 180 - d;
  return { soll, ist: r.grindDirectionDeg, d };
});
const maxAbw = Math.max(...abweichungen.map(a => a.d));
ok("SC-05", "Die geschaetzte Schliffrichtung trifft die tatsaechliche auf 10 Grad",
  maxAbw <= 10,
  abweichungen.map(a => `${a.soll}°→${a.ist.toFixed(1)}° (${a.d.toFixed(1)}°)`).join(" · "));

/* ── SC-06 · Determinismus ────────────────────────────────────────────── */

const lauf1 = screenScratches(mitKratzer, W, H);
const lauf2 = screenScratches(mitKratzer, W, H);
const identisch = JSON.stringify(lauf1.candidates) === JSON.stringify(lauf2.candidates)
  && lauf1.grindDirectionDeg === lauf2.grindDirectionDeg;
ok("SC-06", "Zwei Laeufe liefern bit-identische Kandidaten in gleicher Reihenfolge",
  identisch,
  identisch ? `${lauf1.candidates.length} Kandidaten, Reihenfolge stabil` : "ABWEICHUNG zwischen zwei Laeufen");

/* ── SC-07 · Kurze Strukturen bleiben in der Liste ────────────────────── */

const kurzUndLang = linie(linie(flaeche(), W, H, 90, -60, 200, 3, 80),
  W, H, 90, 60, 20, 3, 80);
const beide = screenScratches(kurzUndLang, W, H);
const laengen = beide.candidates.map(c => c.lengthRel).sort((a, b) => a - b);
const hatKurze = laengen.length >= 2 && laengen[0] < 0.15;
const kurzeNiedriger = beide.candidates.length >= 2
  && beide.candidates[0].lengthRel > beide.candidates[beide.candidates.length - 1].lengthRel;
ok("SC-07", "Kurze Strukturen werden nicht verworfen, sondern niedrig bewertet",
  hatKurze && kurzeNiedriger,
  hatKurze
    ? `${beide.candidates.length} Kandidaten · kuerzester ${(laengen[0] * 100).toFixed(1)} %`
      + ` · laengster ${(laengen[laengen.length - 1] * 100).toFixed(1)} % der kurzen Kante`
    : "die kurze Struktur fehlt in der Liste — sie wurde verworfen");

/* ── SC-08 · Aufloesungsunabhaengigkeit ───────────────────────────────── */

const klein = linie(schliffbild(0, 200, 200), 200, 200, 90, 0, 110, 2, 80);
const gross = linie(schliffbild(0, 400, 400), 400, 400, 90, 0, 220, 4, 80);
const rk = screenScratches(klein, 200, 200);
const rg = screenScratches(gross, 400, 400);
const lk = rk.candidates[0]?.lengthRel ?? 0;
const lg = rg.candidates[0]?.lengthRel ?? 0;
const relAbw = lk > 0 ? Math.abs(lg - lk) / lk : 1;
ok("SC-08", "Dasselbe Bild in zwei Groessen ergibt dieselbe relative Laenge",
  relAbw < 0.10,
  `200px: ${(lk * 100).toFixed(1)} % · 400px: ${(lg * 100).toFixed(1) } %`
  + ` · Abweichung ${(relAbw * 100).toFixed(1)} % (Grenze 10 %)`);

/* ── SC-09 bis SC-12 · Der Klassifikator sortiert, er urteilt nicht ────
   Dieselbe Bauform-Sicherheit wie beim Screening. Ein ungenauer Wald darf
   die Liste schlechter sortieren, niemals ein Ergebnis falsch machen. */

const ohneModell = loadModel(null);
const unveraendert = ohneModell.classify(quer);
const gleicheListe =
  JSON.stringify(unveraendert.candidates) === JSON.stringify(quer.candidates);
ok("SC-09", "Ohne Modell bleibt die Reihenfolge des Screenings unveraendert",
  ohneModell.active === false && ohneModell.reason === "NO_MODEL" && gleicheListe,
  gleicheListe ? "inert: Liste Bit fuer Bit identisch" : "die Liste wurde ohne Modell veraendert");

/* Ein Modell mit abweichendem Merkmalsvertrag muss ABGELEHNT werden, nicht
   still falsch ausgewertet — das waere der gefaehrlichste Fehler. */
const falscherVertrag = loadModel({
  featureOrder: ["lengthRel", "edgeStrength"],
  trees: [{ feature: [-1], threshold: [0], left: [-1], right: [-1], value: [[1, 9]] }],
});
ok("SC-10", "Ein Modell mit abweichendem Merkmalsvertrag wird abgelehnt",
  falscherVertrag.active === false && falscherVertrag.reason === "FEATURE_ORDER_MISMATCH",
  `active=${falscherVertrag.active} · Grund ${falscherVertrag.reason}`);

/* Ein Wald, der alles fuer "tief/relevant" haelt, darf die MENGE nicht
   veraendern — nur die Reihenfolge. */
const immerTief = loadModel({
  featureOrder: [...FEATURE_ORDER],
  trees: [{ feature: [-1], threshold: [0], left: [-1], right: [-1], value: [[0, 10]] }],
});
const bewertet = immerTief.classify(quer);
const mengeGleich = bewertet.candidates.length === quer.candidates.length
  && quer.candidates.every(k => bewertet.candidates.some(b =>
    b.boundingBox.minX === k.boundingBox.minX
    && b.boundingBox.minY === k.boundingBox.minY
    && b.relevanceScore === k.relevanceScore));
ok("SC-11", "Der Klassifikator entfernt und erfindet keinen Kandidaten",
  immerTief.active === true && mengeGleich,
  `${quer.candidates.length} hinein → ${bewertet.candidates.length} heraus,`
  + " gleiche Menge, nur umsortiert");

/* Der Regelwert bleibt neben der Konfidenz stehen: wer die Sortierung
   nachvollziehen will, sieht beide Zahlen. */
const ersterKlassifiziert = bewertet.candidates[0];
ok("SC-12", "Klasse, Konfidenz und Regelwert stehen nebeneinander",
  Boolean(ersterKlassifiziert?.classifier)
  && CLASS_LABELS.includes(ersterKlassifiziert.classifier.klasse)
  && Number.isFinite(ersterKlassifiziert.classifier.konfidenz)
  && ersterKlassifiziert.classifier.regelScore === ersterKlassifiziert.relevanceScore,
  ersterKlassifiziert?.classifier
    ? `${ersterKlassifiziert.classifier.klasse} · Konfidenz `
      + `${ersterKlassifiziert.classifier.konfidenz.toFixed(2)} · Regelwert `
      + `${ersterKlassifiziert.classifier.regelScore.toFixed(4)}`
    : "kein classifier-Feld am Kandidaten");

/* ── SC-13/SC-14 · Merkmalsvertrag ────────────────────────────────────── */

const tabelle = exportFeatureTable(quer, { bild: "SC-13" });
const ersteZeile = tabelle.rows[0];
const vektorPasst = ersteZeile
  && FEATURE_ORDER.every((name, i) => ersteZeile[name] === featureVector(quer.candidates[0])[i]);
ok("SC-13", "Die Merkmalstabelle folgt demselben Vertrag wie die Inferenz",
  vektorPasst && tabelle.featureOrder.length === FEATURE_ORDER.length,
  `${tabelle.rows.length} Zeilen · Merkmale: ${tabelle.featureOrder.join(", ")}`);

/* Das Trainingsskript der Werkbank muss DIESELBE Reihenfolge fuehren.
   Sonst trainiert die Werkbank auf einer anderen Spaltenfolge als die App
   auswertet - und niemand merkt es. Deshalb wird die Liste im Python-Code
   hier mechanisch gegengelesen. */
const python = readFileSync(new URL("./werkbank/train_rf.py", import.meta.url), "utf8");
const block = python.split("FEATURE_ORDER = [")[1]?.split("]")[0] ?? "";
const pyOrder = [...block.matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
const vertragGleich = pyOrder.length === FEATURE_ORDER.length
  && pyOrder.every((n, i) => n === FEATURE_ORDER[i]);
ok("SC-14", "Werkbank und App fuehren denselben Merkmalsvertrag",
  vertragGleich,
  vertragGleich ? `${pyOrder.length} Merkmale, gleiche Reihenfolge`
    : `Python: ${pyOrder.join(", ")} | App: ${FEATURE_ORDER.join(", ")}`);

/* SC-17 - Auch die Messreihe muss dem Merkmalsvertrag folgen.
   Sie schreibt die Spalten, die spaeter gelabelt und trainiert werden.
   Weicht ihre Reihenfolge ab, trainiert die Werkbank auf verschobenen
   Spalten - und niemand merkt es, weil die Zahlen plausibel aussehen. */
const messreihe = readFileSync(new URL("./werkbank/messreihe.mjs", import.meta.url), "utf8");
const nutztVertrag = /\.\.\.FEATURE_ORDER/.test(messreihe)
  && /from "\.\.\/src\/scratchClassifier\.js"/.test(messreihe)
  && !/"lengthRel"\s*,\s*"widthRel"/.test(messreihe);
ok("SC-17", "Die Messreihe schreibt die Spalten aus dem Merkmalsvertrag",
  nutztVertrag,
  nutztVertrag
    ? "FEATURE_ORDER wird importiert und ausgebreitet, keine eigene Liste"
    : "die Messreihe fuehrt eine EIGENE Spaltenliste - sie kann abdriften");

/* ── SC-15/SC-16 · Konfiguration ──────────────────────────────────────── */

const ausgeliefert = readFileSync(new URL("./public/screening.config.json", import.meta.url), "utf8");
const gelesen = parseScreeningConfig(ausgeliefert);
const deckungsgleich = Object.keys(SCREENING_STELLWERTE)
  .filter(k => k !== "note")
  .every(k => gelesen.options[k] === SCREENING_STELLWERTE[k]);
ok("SC-15", "Die ausgelieferte Konfiguration entspricht den Stellwerten im Code",
  gelesen.verworfen.length === 0 && deckungsgleich,
  gelesen.verworfen.length
    ? `verworfen: ${gelesen.verworfen.map(v => `${v.feld} (${v.grund})`).join(", ")}`
    : `${gelesen.uebernommen.length} Werte uebernommen, keine Abweichung`);

/* Unsinnige Werte duerfen nicht stillschweigend greifen. */
const kaputt = parseScreeningConfig({
  edgeThreshold: -5, tileSize: 0.5, grindToleranceDeg: 12,
  slenderReference: "vier", tippfehla: 1,
});
const gruende = Object.fromEntries(kaputt.verworfen.map(v => [v.feld, v.grund]));
ok("SC-16", "Unplausible Konfigurationswerte werden einzeln verworfen und benannt",
  kaputt.options.edgeThreshold === SCREENING_STELLWERTE.edgeThreshold
  && kaputt.options.tileSize === SCREENING_STELLWERTE.tileSize
  && kaputt.options.grindToleranceDeg === 12
  && gruende.edgeThreshold === "AUSSERHALB_BEREICH"
  && gruende.tileSize === "KEINE_GANZE_ZAHL"
  && gruende.slenderReference === "KEINE_ZAHL"
  && gruende.tippfehla === "UNBEKANNTES_FELD",
  `verworfen: ${kaputt.verworfen.map(v => `${v.feld}=${v.grund}`).join(" · ")}`
  + ` | uebernommen: ${kaputt.uebernommen.join(", ") || "keine"}`);

/* -- SC-18 - Die Messkette wird AUSGEFUEHRT, nicht gelesen -------------
   Befund der unabhaengigen Gegenpruefung an rc.4.19, reproduziert:
   messreihe.mjs schrieb semikolongetrennt, train_rf.py las mit dem
   Komma-Standard. Der dokumentierte Ablauf brach ab mit
   "FEHLER: Spalten fehlen: lengthRel, ...".

   SC-17 hat das nicht gefangen, weil er nur Quelltextmerkmale sucht. Ein
   Vertrag zwischen zwei Sprachen laesst sich nicht durch Lesen pruefen,
   nur durch Ausfuehren. Deshalb erzeugt dieser Test eine CSV mit
   JavaScript und laesst sie von GENAU DEM Lader einlesen, den das
   Training verwendet.

   Fehlt python3, gilt der Test als NICHT AUSGEFUEHRT - nicht als
   bestanden. Eine fehlende Abhaengigkeit ist kein Nachweis.          */
const nichtAusgefuehrt = [];
{
  const arbeit = mkdtempSync(join(tmpdir(), "visuclean-kette-"));
  try {
    const csv = join(arbeit, "merkmale.csv");
    const mess = spawnSync(process.execPath,
      ["werkbank/messreihe.mjs", "tests/fixtures/real", "--csv", csv],
      { encoding: "utf8" });

    if (mess.status !== 0) {
      ok("SC-18", "Die Messkette JavaScript -> CSV -> Python laeuft durch",
        false, `messreihe.mjs Exit ${mess.status}: ${(mess.stderr || "").slice(0, 200)}`);
    } else {
      const py = spawnSync("python3",
        ["werkbank/train_rf.py", "--daten", csv, "--spaltencheck"],
        { encoding: "utf8" });

      if (py.error && py.error.code === "ENOENT") {
        nichtAusgefuehrt.push("SC-18 (python3 nicht vorhanden)");
        console.log("NICHT AUSGEFUEHRT SC-18  Die Messkette laeuft durch");
        console.log("                    python3 fehlt. Das ist KEIN bestandener Test -");
        console.log("                    die Kette wurde nicht nachgewiesen.");
      } else {
        const ausgabe = `${py.stdout || ""}${py.stderr || ""}`.trim();
        ok("SC-18", "Die Messkette JavaScript -> CSV -> Python laeuft durch",
          py.status === 0 && /SPALTENCHECK OK/.test(ausgabe),
          py.status === 0 ? ausgabe.split("\n")[0]
            : `Python Exit ${py.status}: ${ausgabe.split("\n")[0]}`);
      }
    }
  } finally {
    rmSync(arbeit, { recursive: true, force: true });
  }
}

/* -- SC-19 - Keine Tiefen- oder Harmlosigkeitsbehauptung im Klassennamen
   Befund der unabhaengigen Gegenpruefung an rc.4.19: die Klassen hiessen
   MIKRO_HARMLOS und TIEF_RELEVANT. Beide behaupten etwas, das aus einem
   normalen Foto nicht messbar ist - eine Tiefe und eine Unbedenklichkeit.

   X-03 faengt das NICHT: sein Muster sucht Zahlen mit Millimeterangabe.
   Ein Wort wie "TIEF" ohne Zahl geht durch. Die Luecke war meine, nicht
   die des Musters - deshalb hier eine eigene Wache, die auf die Begriffe
   selbst schaut. Zulaessig sind Aufmerksamkeitsstufen.                 */
{
  /* OHNE \b: der Unterstrich ist in JavaScript ein Wortzeichen, deshalb
     trifft \bTIEF\b ausgerechnet TIEF_RELEVANT nicht. Genau daran war der
     erste Entwurf dieses Tests gruen, obwohl die verbotenen Namen
     zurueckgeholt waren. */
  const verbotene = /(TIEF|DEEP|MIKRO|MICRO|HARMLOS|HARMLESS|SHALLOW)/i;
  const klassenNamen = CLASS_LABELS.join(" ");
  const quellen = {
    "scratchClassifier.js": readFileSync(new URL("./src/scratchClassifier.js", import.meta.url), "utf8"),
    "train_rf.py": readFileSync(new URL("./werkbank/train_rf.py", import.meta.url), "utf8"),
  };
  /* Nur die tatsaechlich vergebenen Klassenwerte pruefen, nicht den
     Fliesstext: die Dateien DUERFEN erklaeren, warum die alten Namen
     falsch waren. Ein Kommentar, der den Fehler benennt, ist kein
     Rueckfall - ein classLabels-Eintrag waere einer. */
  const zugewiesen = [];
  for (const [datei, text] of Object.entries(quellen)) {
    for (const treffer of text.matchAll(/classLabels"?\s*:\s*\[([^\]]*)\]/g)) {
      zugewiesen.push([datei, treffer[1]]);
    }
    for (const treffer of text.matchAll(/CLASS_LABELS = Object\.freeze\(\[([^\]]*)\]/g)) {
      zugewiesen.push([datei, treffer[1]]);
    }
  }
  const verstoesse = zugewiesen
    .filter(([, wert]) => verbotene.test(wert))
    .map(([datei]) => datei);
  const sauber = !verbotene.test(klassenNamen) && verstoesse.length === 0;
  ok("SC-19", "Klassennamen behaupten keine Tiefe und keine Harmlosigkeit",
    sauber && zugewiesen.length >= 2,
    sauber
      ? `${CLASS_LABELS.join(", ")} - reine Aufmerksamkeitsstufen,`
        + ` ${zugewiesen.length} Zuweisungen geprueft`
      : `Tiefen- oder Harmlosigkeitsbehauptung in: ${verstoesse.join(", ") || klassenNamen}`);
}

/* -- SC-20 - Zweite Rangfolge ohne Richtungsabwertung -----------------
   Die geschaetzte Vorzugsrichtung ist nicht kalibriert. Sie darf nicht die
   EINZIGE sichtbare Rangfolge bestimmen, sonst schiebt eine moeglicherweise
   unzuverlaessige Richtung echte Schaeden nach hinten, ohne dass es jemand
   nachrechnen kann.

   relevanceScoreUngerichtet ist dieselbe Bewertung OHNE den Faktor
   sin(Winkelabstand). Kein neuer Schwellenwert, keine geaenderte
   Entscheidung - nur nachrechenbar.                                    */
{
  const k = quer.candidates[0];
  const quotient = k.relevanceScore / k.relevanceScoreUngerichtet;
  const erwartet = Math.sin(k.grindDeltaDeg * Math.PI / 180);
  const stimmt = Math.abs(quotient - erwartet) < 1e-9;
  /* Ohne Richtungsabwertung ist der Wert nie kleiner: sin liegt in [0,1]. */
  const nieKleiner = quer.candidates.every(c =>
    c.relevanceScoreUngerichtet >= c.relevanceScore - 1e-12);
  ok("SC-20", "Jeder Kandidat traegt auch die Bewertung ohne Richtungsabwertung",
    Number.isFinite(k.relevanceScoreUngerichtet) && stimmt && nieKleiner,
    stimmt
      ? `Platz 1: mit ${k.relevanceScore.toFixed(4)} · ohne ${k.relevanceScoreUngerichtet.toFixed(4)}`
        + ` · Verhaeltnis = sin(${k.grindDeltaDeg.toFixed(1)} Grad)`
      : "der ungerichtete Wert folgt nicht der Bewertung ohne Richtungsfaktor");
}

/* -- SC-21 - Was die Richtungsstaerke aussagt und was sie nicht aussagt
   grindStrength ist der Energieanteil des staerksten Winkelfaechers.

   Erste Fassung dieses Tests behauptete: mehr Faecher = kleinerer Anteil.
   Das ist falsch. Gemessen am schliffdominierten Testbild: 18 Faecher
   0.888761, 72 Faecher 0.888739 - der Unterschied ist Rauschen, weil alle
   Kanten ohnehin in einen Faecher fallen. Der Test bestand aus dem
   falschen Grund und wird hier durch die tatsaechlich messbare Aussage
   ersetzt.

   Messbar ist zweierlei, und beides zusammen begruendet, warum der
   Rohwert angezeigt wird:
   a) Auf einer Flaeche OHNE Vorzugsrichtung haengt der Wert stark an der
      Faecherzahl - die Zahl ist also nur bei gleicher Faecherzahl
      vergleichbar. Deshalb wird orientationBins mitgegeben.
   b) Der Wert trennt "es gibt eine Vorzugsrichtung" von "es gibt keine"
      um eine Groessenordnung. Das ist die Information, die der Wert
      traegt - und mehr behauptet die Anzeige auch nicht.             */
{
  /* Stern: Linien in 15 Richtungen, also keine Vorzugsrichtung. */
  let stern = flaeche();
  for (let grad = 0; grad < 180; grad += 12) {
    for (const versatz of [-90, -30, 30, 90]) {
      stern = linie(stern, W, H, grad, versatz, 150, 2, 70);
    }
  }
  const sternGrob = screenScratches(stern, W, H, { orientationBins: 18 });
  const sternFein = screenScratches(stern, W, H, { orientationBins: 72 });
  const schliffGrob = screenScratches(mitKratzer, W, H, { orientationBins: 18 });
  const schliffFein = screenScratches(mitKratzer, W, H, { orientationBins: 72 });

  const gemeldet = sternGrob.orientationBins === 18 && sternFein.orientationBins === 72
    && schliffGrob.orientationBins === 18 && schliffFein.orientationBins === 72;
  /* (a) ohne Vorzugsrichtung haengt der Wert deutlich an der Faecherzahl */
  const faecherWirkt = sternFein.grindStrength < sternGrob.grindStrength * 0.8;
  /* (b) mit Vorzugsrichtung liegt er um eine Groessenordnung hoeher,
         und zwar bei beiden Faecherzahlen */
  const trenntKlar = schliffGrob.grindStrength > sternGrob.grindStrength * 5
    && schliffFein.grindStrength > sternFein.grindStrength * 5;

  ok("SC-21", "Die Richtungsstaerke trennt Vorzugsrichtung von keiner, und haengt an der Faecherzahl",
    gemeldet && faecherWirkt && trenntKlar,
    gemeldet
      ? `ohne Vorzugsrichtung ${sternGrob.grindStrength.toFixed(4)} (18) -> `
        + `${sternFein.grindStrength.toFixed(4)} (72) · mit Schliff `
        + `${schliffGrob.grindStrength.toFixed(4)} / ${schliffFein.grindStrength.toFixed(4)} `
        + "- nur bei gleicher Faecherzahl vergleichbar"
      : "orientationBins wird nicht zurueckgegeben");
}

/* -- SC-22 - Die gespeicherte Spitze darf keine Rangfolge bevorzugen
   Alle Kandidaten zu speichern sprengt Datensatz und PDF, es muss also
   ausgewaehlt werden. Bis rc.4.21 wurde nach der GERICHTETEN Rangfolge
   ausgewaehlt - also nach derjenigen, die eine nicht kalibrierte
   Richtungsschaetzung mitbewertet.

   Gemessen an einer echten Edelstahlaufnahme: sechs der zehn
   bestplatzierten Kandidaten der ungerichteten Rangfolge lagen auf den
   gerichteten Plaetzen 36 bis 59 von 59 und wurden nicht gespeichert.
   Sie standen weder im Datensatz noch im PDF, und die Umschaltung der
   Anzeige konnte sie nicht zurueckholen - man kann nur zeigen, was
   gespeichert wurde.

   Der Test laeuft auf dem ECHTEN Bild, nicht auf einem Testmuster: die
   Divergenz der beiden Rangfolgen ist eine Eigenschaft realer
   Oberflaechen, und ein synthetisches Bild koennte sie wegkonstruieren. */
{
  const roh = PNG.sync.read(readFileSync(
    new URL("./tests/fixtures/real/dry-stainless-control.png", import.meta.url)));
  const echt = screenScratches(roh.data, roh.width, roh.height);
  const SPITZE = 10;
  const auswahl = waehleProtokollKandidaten(echt.candidates, SPITZE);
  const gewaehlt = new Set(auswahl.map(k => k.rank - 1));

  /* Beide Spitzen muessen vollstaendig enthalten sein. */
  const gerichteteSpitze = echt.candidates.slice(0, SPITZE).map((_, i) => i);
  const ungerichteteSpitze = echt.candidates
    .map((c, i) => ({ i, w: c.relevanceScoreUngerichtet }))
    .sort((a, b) => b.w - a.w).slice(0, SPITZE).map(e => e.i);
  const beideDrin = [...gerichteteSpitze, ...ungerichteteSpitze].every(i => gewaehlt.has(i));

  /* Der Test waere wertlos, wenn die beiden Rangfolgen auf diesem Bild
     ohnehin dasselbe lieferten - dann koennte auch die alte Auswahl
     bestehen. Also erst belegen, dass sie auseinanderlaufen. */
  const nurUngerichtet = ungerichteteSpitze.filter(i => !gerichteteSpitze.includes(i));
  const divergiert = nurUngerichtet.length > 0;

  /* Obergrenze: hoechstens doppelt so viele wie eine Spitze. */
  const begrenzt = auswahl.length <= SPITZE * 2;
  /* Deterministisch und aufsteigend nach gerichtetem Platz. */
  const raenge = auswahl.map(k => k.rank);
  const sortiert = raenge.every((r, i) => i === 0 || r > raenge[i - 1]);

  ok("SC-22", "Die gespeicherte Spitze enthaelt beide Rangfolgen vollstaendig",
    divergiert && beideDrin && begrenzt && sortiert,
    divergiert
      ? `${echt.candidates.length} Kandidaten · ${nurUngerichtet.length} nur in der `
        + `ungerichteten Spitze (gerichtete Plaetze `
        + `${nurUngerichtet.map(i => i + 1).join(", ")}) · gespeichert ${auswahl.length}`
      : "die beiden Rangfolgen liefern hier dasselbe - der Test belegt nichts");
}

/* -- SC-23 - Aus einer Messung folgt keine stille Schwellenaenderung
   Der Aufloesungsvergleich (werkbank/aufloesungsvergleich.mjs) zeigt
   deutliche Effekte: bei 40 Prozent Verkleinerung ueberleben von den zehn
   auffaelligsten Stellen einer echten Aufnahme nur zwei, und die
   geschaetzte Vorzugsrichtung springt bei niedriger Richtungsstaerke von
   42,5 auf 112,5 Grad.

   Genau an dieser Stelle ist die Versuchung am groessten, "das Ergebnis
   einzuarbeiten" - eine Kachelgroesse anzupassen, eine Mindestaufloesung
   zu setzen, eine Kantenschwelle nachzuziehen. Der Auftraggeber hat das
   ausdruecklich ausgeschlossen: aus dem Versuch wird keine Aufloesungs-
   oder Schwellenaenderung abgeleitet.

   Dieser Test haelt die Stellwerte auf den dokumentierten Zahlen fest.
   Er verbietet keine Aenderung - er erzwingt, dass sie sichtbar ist:
   wer eine Zahl verschiebt, muss auch hier eine Zahl verschieben und
   kann es nicht nebenbei tun.                                          */
{
  const festgeschrieben = {
    edgeThreshold: 0.18, tileSize: 32, minComponentPixels: 12,
    grindToleranceDeg: 15, slenderReference: 4,
    maxDimension: 1024, orientationBins: 36,
  };
  const abweichend = Object.entries(festgeschrieben)
    .filter(([k, v]) => SCREENING_STELLWERTE[k] !== v)
    .map(([k, v]) => `${k}: ${SCREENING_STELLWERTE[k]} statt ${v}`);
  ok("SC-23", "Die Stellwerte stehen unveraendert auf den dokumentierten Zahlen",
    abweichend.length === 0,
    abweichend.length
      ? `VERSCHOBEN: ${abweichend.join(" · ")} - das ist eine Entscheidung, `
        + "keine Messfolge. Begruenden und hier nachziehen."
      : `${Object.keys(festgeschrieben).length} Werte unveraendert - der `
        + "Aufloesungsvergleich hat nichts stillschweigend nachgezogen");
}

/* -- SC-24 - Die Kriterien haben getrennte Analyse-Aufloesungen
   Der Auftraggeber verlangt getrennte Aufnahmepfade, und die Messung
   begruendet sie:

     Kratzer  bei 640 ueberlebte 1 von 10 auffaelligsten Kandidaten,
              bei voller Aufloesung 10 von 10.
     Feuchte  mehr Aufloesung hilft NICHT - edgeFrac sank an zwei nassen
              Realaufnahmen von 0.0423 auf 0.0254.

   Ein gemeinsamer Wert ist deshalb immer fuer eines von beiden falsch.
   Dieser Test haelt fest, dass sie getrennt BLEIBEN und dass der
   Oberflaechenpfad nicht wieder auf die Kernaufloesung zurueckfaellt.  */
{
  const kernKante = ANALYSE_KANTE[AUFNAHMEZWECK.FEUCHTE];
  const oberKante = ANALYSE_KANTE[AUFNAHMEZWECK.OBERFLAECHE];
  /* 0 heisst: gar nicht verkleinern. Alles andere waere eine Grenze
     OBERHALB der Kernaufloesung - auch zulaessig, aber nie gleich. */
  const getrennt = oberKante === 0 || oberKante > kernKante;

  /* Und der Aufnahmeweg muss sie benutzen, nicht nur deklarieren.
     Lehre aus rc.4.19: gerechnet und nie verwendet. */
  const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const benutztKern = /ANALYSE_KANTE\[AUFNAHMEZWECK\.FEUCHTE\]/.test(appQuelle);
  const benutztOberflaeche = /ANALYSE_KANTE\[AUFNAHMEZWECK\.OBERFLAECHE\]/.test(appQuelle);
  /* Die fest verdrahtete 640 darf in analyzeImage nicht zurueckkehren. */
  const ohneFesteZahl = !/const max = 640/.test(appQuelle);

  ok("SC-24", "Kratzer und Feuchte werden mit getrennten Aufloesungen analysiert",
    getrennt && benutztKern && benutztOberflaeche && ohneFesteZahl,
    `Kern ${kernKante} · Oberflaeche ${oberKante === 0 ? "voll" : oberKante}`
      + ` · im Aufnahmeweg benutzt: Kern ${benutztKern}, Oberflaeche ${benutztOberflaeche}`
      + ` · ohne feste 640 ${ohneFesteZahl}`);
}

/* ── SC-25 bis SC-27 · Kandidaten identifizierbar und verortbar ────────
   Befund aus dem Geraetelauf vom 13.09.2026:

   1. Die Spalte "Rang" zeigte den Platz der GERICHTETEN Rangfolge,
      waehrend die Zeilen nach der UNGERICHTETEN sortiert waren. Zwei
      Zahlen aus zwei Ordnungen in einer Spalte — der erste Eintrag trug
      dann z.B. die 36.
   2. Es gab keine stabile Kennung. Beim Umschalten der Sortierung war
      ein Kandidat nur ueber seinen Platz greifbar, und der aenderte sich.
   3. Die Bounding Boxes liegen im INTERN verkleinerten Bild
      (maxDimension), und diese Groesse wurde nirgends mitgegeben. Damit
      war keine einzige Kandidatenstelle im Foto auffindbar — die Frage
      "welche Stelle gehoert zu 0,1562" war nicht beantwortbar.        */
{
  const r = screenScratches(mitKratzer, W, H);
  const ids = (r.candidates || []).map(c => c.kandidatId);
  const alleDa = ids.length > 0 && ids.every(x => typeof x === "string" && x.length > 0);
  const eindeutig = new Set(ids).size === ids.length;
  /* Die Kennung darf KEINE der beiden Rangfolgen abbilden: sonst waere
     sie beim naechsten Sortierwechsel wieder eine Platznummer. Geprueft
     an der ungerichteten Ordnung — sie unterscheidet sich von der
     gerichteten, in der die Liste geliefert wird. */
  const ungerichtet = [...(r.candidates || [])]
    .sort((a, b) => b.relevanceScoreUngerichtet - a.relevanceScoreUngerichtet);
  const idsUngerichtet = ungerichtet.map(c => c.kandidatId);
  const bleibtGleich = ids.length === idsUngerichtet.length
    && ids.every(x => idsUngerichtet.includes(x));
  ok("SC-25", "Jeder Kandidat traegt eine stabile, eindeutige Kennung",
    alleDa && eindeutig && bleibtGleich,
    alleDa ? `${ids.length} Kandidaten, ${new Set(ids).size} verschiedene Kennungen`
      : "kandidatId fehlt");
}

{
  const r = screenScratches(mitKratzer, W, H);
  const bb = r.bildBreite; const bh = r.bildHoehe;
  const gesetzt = Number.isInteger(bb) && Number.isInteger(bh) && bb > 0 && bh > 0;
  const imRahmen = gesetzt && Math.max(bb, bh) <= SCREENING_STELLWERTE.maxDimension;
  /* Und die Boxen liegen tatsaechlich darin — sonst waere die Angabe
     eine Behauptung. */
  const drin = gesetzt && (r.candidates || []).every(c =>
    c.boundingBox.minX >= 0 && c.boundingBox.maxX < bb
    && c.boundingBox.minY >= 0 && c.boundingBox.maxY < bh);
  ok("SC-26", "Das Ergebnis nennt die Bildgroesse, in der die Boxen liegen",
    gesetzt && imRahmen && drin,
    gesetzt ? `${bb}x${bh} (Eingabe ${W}x${H}) · Boxen darin ${drin}`
      : "bildBreite/bildHoehe fehlen — die Boxen haben keinen Bezug");
}

{
  const r = screenScratches(mitKratzer, W, H);
  const auswahl = waehleProtokollKandidaten(r.candidates, 3);
  const mitId = auswahl.every(c => typeof c.kandidatId === "string" && c.kandidatId);
  /* rank bleibt der Platz in der GERICHTETEN Rangfolge — das ist die
     Reihenfolge, in der screenScratches liefert. Die Anzeige muss ihn
     als solchen benennen und darf ihn nicht als aktuelle Position
     ausgeben. */
  const rangIstGerichtet = auswahl.every(c =>
    r.candidates[c.rank - 1]?.kandidatId === c.kandidatId);
  ok("SC-27", "Die Auswahl reicht die Kennung durch, rank bleibt der gerichtete Platz",
    mitId && rangIstGerichtet,
    `${auswahl.length} ausgewaehlt · Kennung durchgereicht ${mitId}`
      + ` · rank == gerichteter Platz ${rangIstGerichtet}`);
}

/* ── Stellwerte offenlegen ────────────────────────────────────────────── */

console.log("");
console.log("Stellwerte (explicitly commented as Stellwerte — not validated):");
for (const [k, v] of Object.entries(SCREENING_STELLWERTE)) {
  if (k === "note") continue;
  console.log(`  ${k.padEnd(22)} = ${v}`);
}
console.log("");
console.log("Diese Werte steuern die Aufmerksamkeit, nicht die Richtigkeit.");
console.log("Das Screening fuegt nur hinzu und sortiert — es kann kein PASS erzeugen.");

console.log("");
const failed = checks.filter(c => !c.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (nichtAusgefuehrt.length) {
  console.log(`Nicht ausgefuehrt: ${nichtAusgefuehrt.join(", ")}`);
  console.log("  Eine nicht ausgefuehrte Pruefung ist kein Nachweis.");
}
if (failed.length) console.log(`Durchgefallen: ${failed.map(c => c.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
