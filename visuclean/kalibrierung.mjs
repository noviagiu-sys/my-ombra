/* ─── VisuClean · Offene Kalibrierung und bekannte Einschränkungen ─────────
   Aufruf: node kalibrierung.mjs

   Diese Suite ersetzt schaerfetest.mjs aus RC2 und trennt streng:

     BESTANDEN              eine Anforderung ist erfüllt und nachgewiesen
     BEKANNTE EINSCHRAENKUNG ein Verhalten, das wir kennen, benennen und
                            durch eine sichere Reaktion abgefangen haben
     OFFENE KALIBRIERUNG    ein Erkennungsproblem, das Realdaten braucht und
                            in RC3 NICHT gelöst ist

   Der Unterschied ist wichtig: RC2 zählte die Schärfefälle S3-S6 als
   "bestanden" und erweckte damit den Eindruck, die Anforderung sei erfüllt.
   Sie war es nicht — die Erkennung war lediglich dokumentiert kaputt.

   RC3 löst die ERKENNUNG weiterhin nicht. Gelöst ist die REAKTION: der
   betroffene Prüfpunkt wechselt auf "Nicht bewertbar", statt ein falsches
   PASS zu erzeugen. Genau diese Trennung bildet die Suite ab.

   Exitcode 0 heisst hier: keine Regression. Er heisst NICHT, dass alle
   Produktanforderungen erfüllt sind.                                      */

import fs from "node:fs";
import { PNG } from "pngjs";
import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";
import { buildCheckpoints, overallResult, STATUS, OVERALL } from "./src/assessment.js";
import { mitFeuchteSequenz } from "./tests/feuchteSequenz.mjs";

const BESTANDEN = "BESTANDEN", EINSCHRAENKUNG = "EINSCHRAENKUNG", KALIBRIERUNG = "KALIBRIERUNG";
const R = [];
const melde = (art, id, name, erfuellt, info = "") => {
  R.push({ art, id, erfuellt });
  const marke = !erfuellt ? "DURCHGEFALLEN         "
    : art === BESTANDEN ? "BESTANDEN             "
      : art === EINSCHRAENKUNG ? "BEKANNTE EINSCHRAENKUNG"
        : "OFFENE KALIBRIERUNG   ";
  console.log(`${marke} ${id}  ${name}`);
  if (info) console.log(`                        ${info}`);
};

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
const werte = (png, rad = 0) => {
  const d = rad === 0 ? png.data : weichzeichnen(png.data, png.width, png.height, rad);
  const f = computeFeatures(d, png.width, png.height);
  const v = buildVerdicts(f);
  /* Vollstaendige Feuchte-Sequenz: diese Suite prueft die Kalibrierung der
     Analyse an realen Aufnahmen, nicht das Feuchte-Tor (A25 bis A33). */
  const cps = buildCheckpoints(f, v, mitFeuchteSequenz());
  return { f, v, cps, byId: Object.fromEntries(cps.map(c => [c.id, c])), gesamt: overallResult(cps) };
};

const nass = lade("wet-stainless-wide.png");
const scharf = werte(nass, 0);
const unscharf = werte(nass, 1);
const kontrolle = werte(lade("dry-stainless-control.png"), 0);

console.log("VisuClean · Offene Kalibrierung und bekannte Einschränkungen");
console.log("");
console.log("── Ausgangslage ──");

melde(BESTANDEN, "KB1", "Die scharfe Aufnahme der nassen Flaeche wird korrekt gesperrt",
  scharf.byId.moisture.status === STATUS.FAIL && scharf.gesamt.status === OVERALL.BLOCKED,
  `gradMean ${scharf.f.gradMean.toFixed(4)} (>0.055) · edgeFrac ${(scharf.f.edgeFrac * 100).toFixed(2)} % (>8 %)`);

melde(BESTANDEN, "KB2", "Der Reflexionsweg traegt diese Bilder nicht — nur der Texturweg",
  scharf.f.bfr <= 0.04 && !(scharf.f.droplets && scharf.f.bfr > 0.015),
  `bfr ${scharf.f.bfr.toFixed(4)} weit unter 0.04 — die gesamte Naesse-Erkennung haengt an Mikrokanten`);

console.log("");
console.log("── Noch nicht geloest: die Erkennung selbst ──");

melde(KALIBRIERUNG, "KO1", "Leichte Unschaerfe zerstoert das Naesse-Signal vollstaendig",
  unscharf.f.gradMean < 0.055 && unscharf.f.edgeFrac < 0.08,
  `Radius 1: gradMean ${scharf.f.gradMean.toFixed(4)} → ${unscharf.f.gradMean.toFixed(4)} (Tor 0.055) · `
  + `edgeFrac ${(scharf.f.edgeFrac * 100).toFixed(2)} % → ${(unscharf.f.edgeFrac * 100).toFixed(2)} % (Tor 8 %). `
  + "Die Flaeche ist unveraendert nass.");

melde(KALIBRIERUNG, "KO2", "Der vorhandene Unschaerfe-Hinweis greift dafuer zu spaet",
  unscharf.f.gradMean >= 0.006,
  `gradMean ${unscharf.f.gradMean.toFixed(4)} · Hinweisschwelle 0.006 — rund eine Groessenordnung zu tief`);

melde(KALIBRIERUNG, "KO3", "Eine einzelne Schaerfeschwelle ist keine Loesung",
  unscharf.f.gradMean < kontrolle.f.gradMean,
  `unscharf-nass ${unscharf.f.gradMean.toFixed(4)} liegt UNTER trocken-Kontrolle ${kontrolle.f.gradMean.toFixed(4)}. `
  + "Jede Schwelle, die den einen Fall verwirft, verwirft den anderen mit.");

melde(EINSCHRAENKUNG, "KE1", "Auf Urteilsebene meldet buildVerdicts weiterhin trocken",
  unscharf.v.dry.pass === true,
  `${unscharf.v.dry.code} — unveraendert gegenueber RC2, weil keine Kernschwelle verschoben wurde`);

console.log("");
console.log("── Geloest: die Reaktion auf das fehlende Signal ──");

melde(BESTANDEN, "KB3", "Der Pruefpunkt Feuchtigkeit wechselt auf NICHT BEWERTBAR statt auf trocken",
  unscharf.byId.moisture.status === STATUS.NOT_ASSESSABLE,
  `${unscharf.byId.moisture.code} — in RC2 erschien hier "Keine sichtbare Feuchtigkeit"`);

melde(BESTANDEN, "KB4", "Das Gesamtergebnis wird nicht PASS",
  unscharf.gesamt.status !== OVERALL.PASS,
  `Gesamt ${unscharf.gesamt.status}`);

melde(BESTANDEN, "KB5", "Grund und naechste Handlung werden genannt",
  unscharf.byId.moisture.reason.length > 20 && unscharf.byId.moisture.actions.length >= 2,
  unscharf.byId.moisture.actions.map(a => a.de).join(" · "));

melde(BESTANDEN, "KB6", "Unterdrueckte Signale bleiben mit Messwert und Schwelle sichtbar",
  unscharf.byId.surface.measurements.tvFlat > unscharf.byId.surface.measurements.schwelle
  && Number.isFinite(unscharf.byId.surface.measurements.edgeFrac)
  && /Mikrokanten/.test(unscharf.byId.surface.reason),
  `tvFlat ${unscharf.byId.surface.measurements.tvFlat.toFixed(4)} gegen Schwelle `
  + `${unscharf.byId.surface.measurements.schwelle} bei ${(unscharf.byId.surface.measurements.edgeFrac * 100).toFixed(2)} % Mikrokanten`);

melde(BESTANDEN, "KB7", "Keine Ueberkorrektur: die trockene Kontrollaufnahme bleibt bestanden",
  kontrolle.gesamt.status === OVERALL.PASS,
  `anomBlockFrac ${kontrolle.f.anomBlockFrac.toFixed(3)} (>=0.18) belegt Geometrie oder Beleuchtung`);

console.log("");
const durchgefallen = R.filter(x => !x.erfuellt);
const bestanden = R.filter(x => x.erfuellt && x.art === BESTANDEN);
const einschr = R.filter(x => x.erfuellt && x.art === EINSCHRAENKUNG);
const kalib = R.filter(x => x.erfuellt && x.art === KALIBRIERUNG);

console.log(`Bestanden:               ${bestanden.length}`);
console.log(`Bekannte Einschraenkung: ${einschr.length}   (${einschr.map(x => x.id).join(", ") || "-"})`);
console.log(`Offene Kalibrierung:     ${kalib.length}   (${kalib.map(x => x.id).join(", ") || "-"})`);
console.log(`Durchgefallen:           ${durchgefallen.length}`);
console.log("");
console.log("KLARSTELLUNG: Die Naesse-ERKENNUNG ist in RC3 nicht geloest. Geloest ist,");
console.log("              dass daraus kein falsches PASS mehr entsteht. Die offenen");
console.log("              Kalibrierungsfaelle zaehlen ausdruecklich NICHT als Erfolg.");
console.log("ERGEBNIS: " + (durchgefallen.length ? "DURCHGEFALLEN" : "KEINE REGRESSION"));
process.exit(durchgefallen.length ? 1 : 0);
