/* ─── VisuClean · Werkbank · Auflösungsvergleich für das Screening ─────────
   Misst, wie viel das Kratzer-Screening verliert, wenn die Aufnahme vor
   der Analyse verkleinert wird.

   Anlass: der reale Prüflauf auf dem Handy meldete im Aufnahmeprofil
   "900×1600 → 360×640 (Verkleinerung auf 40 %)". Alle 66 Kandidaten dieses
   Laufs stammen also aus einem 360×640-Bild. Ein Kratzer von 3,6 % der
   kurzen Kante ist dort 13 Pixel lang, eine Breite von 1,37 % sind 5 Pixel.
   Was feiner ist, existiert nach der Verkleinerung nicht mehr — es ist
   weggerechnet, bevor irgendein Detektor es sehen konnte.

   ────────────────────────────────────────────────────────────────────────
   GRENZE DIESER MESSUNG — bitte nicht überlesen:

   Die im Projekt vorliegenden Realaufnahmen sind bereits 480×640. Echte
   900×1600-Originale gibt es hier nicht. Dieses Skript kann deshalb NUR
   die Richtung des Effekts zeigen (was beim Verkleinern verlorengeht),
   nicht die Frage beantworten, was die App bei 900×1600 zusätzlich fände.
   Dafür braucht es Aufnahmen in voller Kameraauflösung, verlustfrei
   gespeichert.

   Aus diesem Versuch wird ausdrücklich KEINE Auflösungs- oder
   Schwellenänderung abgeleitet. Er ist eine Messung, keine Entscheidung.
   ────────────────────────────────────────────────────────────────────────

   Aufruf:  node werkbank/aufloesungsvergleich.mjs [ordner]
   Vorgabe: tests/fixtures/real                                          */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { screenScratches } from "../src/scratchScreening.js";

const projekt = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ordner = process.argv[2] || path.join(projekt, "tests", "fixtures", "real");

/* Die Stufen. 40 % ist die im echten Lauf beobachtete Verkleinerung; die
   Zwischenstufen zeigen, ob der Verlust allmählich oder sprunghaft ist. */
const STUFEN = [1.0, 0.75, 0.55, 0.4];

/**
 * Deterministische Verkleinerung durch Blockmittelung.
 *
 * Bewusst kein Bibliotheksfilter: jede Interpolation bringt eigene
 * Glättung mit, und genau die Glättung ist das, was hier gemessen wird.
 * Blockmittelung ist das, was eine Kamera beim Herunterskalieren im Kern
 * auch tut, und sie ist bit-genau reproduzierbar.
 */
function verkleinere(daten, w, h, faktor) {
  if (faktor >= 1) return { daten, w, h };
  const w2 = Math.max(8, Math.round(w * faktor));
  const h2 = Math.max(8, Math.round(h * faktor));
  const ziel = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const y0 = Math.floor(y * h / h2), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / h2));
    for (let x = 0; x < w2; x++) {
      const x0 = Math.floor(x * w / w2), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / w2));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * w + sx) * 4;
          r += daten[o]; g += daten[o + 1]; b += daten[o + 2]; n++;
        }
      }
      const o2 = (y * w2 + x) * 4;
      ziel[o2] = Math.round(r / n); ziel[o2 + 1] = Math.round(g / n);
      ziel[o2 + 2] = Math.round(b / n); ziel[o2 + 3] = 255;
    }
  }
  return { daten: ziel, w: w2, h: h2 };
}

/** Mittelpunkt eines Kandidaten, bezogen auf die Bildgröße (0…1). */
function mitte(k, w, h) {
  const b = k.boundingBox || {};
  return {
    x: ((b.minX + b.maxX) / 2) / w,
    y: ((b.minY + b.maxY) / 2) / h,
  };
}

/**
 * Überlebt ein Kandidat die Verkleinerung?
 *
 * Verglichen wird über die RELATIVE Lage im Bild: ein Kandidat gilt als
 * wiedergefunden, wenn bei der kleineren Auflösung einer innerhalb von
 * 3 % der Bilddiagonale liegt. Das ist großzügig — es soll nicht an
 * Rundung scheitern, sondern zeigen, ob die Stelle überhaupt noch
 * auffällt.
 */
function wiedergefunden(k, wA, hA, liste, wB, hB, toleranz = 0.03) {
  const a = mitte(k, wA, hA);
  return liste.some(c => {
    const b = mitte(c, wB, hB);
    return Math.hypot(a.x - b.x, a.y - b.y) <= toleranz;
  });
}

const bilder = fs.existsSync(ordner)
  ? fs.readdirSync(ordner).filter(n => /\.png$/i.test(n)).sort()
  : [];

if (!bilder.length) {
  console.error(`Keine PNG-Dateien in ${ordner}.`);
  process.exit(2);
}

console.log("VisuClean · Auflösungsvergleich für das Kratzer-Screening");
console.log("");
console.log("GRENZE: die vorliegenden Aufnahmen sind bereits 480×640. Dieser Lauf");
console.log("zeigt, was beim Verkleinern VERLOREN geht — nicht, was die App bei");
console.log("voller Kameraauflösung (900×1600) zusätzlich fände. Dafür fehlen die");
console.log("Originale. Aus diesem Versuch wird keine Auflösungs- oder");
console.log("Schwellenänderung abgeleitet.");
console.log("");

for (const name of bilder) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ordner, name)));
  const voll = screenScratches(png.data, png.width, png.height);
  const spitzeVoll = voll.candidates.slice(0, 10);

  console.log(`${name}  (${png.width}×${png.height})`);
  console.log("  Stufe   Größe        Kandidaten  unterdrückt  Richtung  Stärke"
    + "   Spitze-10 wiedergefunden");

  for (const f of STUFEN) {
    const k = verkleinere(png.data, png.width, png.height, f);
    const s = screenScratches(k.daten, k.w, k.h);
    const ueberlebt = f >= 1
      ? spitzeVoll.length
      : spitzeVoll.filter(c =>
        wiedergefunden(c, png.width, png.height, s.candidates, k.w, k.h)).length;
    console.log(
      `  ${String(Math.round(f * 100)).padStart(4)} %`
      + `  ${`${k.w}×${k.h}`.padEnd(12)}`
      + `${String(s.candidates.length).padStart(9)}`
      + `${String(s.suppressedCount).padStart(13)}`
      + `${`${s.grindDirectionDeg.toFixed(1)}°`.padStart(10)}`
      + `${s.grindStrength.toFixed(4).padStart(9)}`
      + `${`${ueberlebt} / ${spitzeVoll.length}`.padStart(15)}`);
  }
  console.log("");
}

console.log("LESEHILFE");
console.log("  'Spitze-10 wiedergefunden' zählt, wie viele der zehn auffälligsten");
console.log("  Stellen der vollen Auflösung nach der Verkleinerung an derselben");
console.log("  Stelle (±3 % der Bilddiagonale) überhaupt noch als Kandidat");
console.log("  erscheinen. Verschwundene Stellen sind nicht 'harmlos bewertet' —");
console.log("  sie sind gar nicht mehr vorhanden, bevor bewertet wird.");
console.log("");
console.log("  Die Richtungsstärke ist nur bei GLEICHER Winkelfächerzahl");
console.log("  vergleichbar; sie ist über alle Stufen dieselbe (36).");
