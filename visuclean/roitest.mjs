/* ─── RC4 · ROI-Bezugsrahmen ───────────────────────────────────────────────
   Das ROI-Modul stammt aus der Preview-Linie (dea127bb) und ist in RC4
   uebernommen, weil das spaetere Befundregister einen bauteilbezogenen
   Bezugsrahmen braucht.

   Was hier geprueft wird: die Geometrie ist deterministisch, sie begrenzt
   sich selbst, und der Fuell-Effekt von copyRoiImageData ist als offener
   Kalibrierungsfall AUSGEWIESEN statt stillschweigend wirksam.            */

import {
  ROI_FILL_CALIBRATION, ROI_MIN_SIDE, clampBoxRoi, copyRoiImageData,
  defaultBoxRoi, handleInsetNorm, roiCompatibleWithPhoto, roiIsValid,
} from "./src/roi.js";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean RC4 · ROI-Bezugsrahmen\n");

const inset = handleInsetNorm(1000, 1000);
const standard = defaultBoxRoi(inset);
ok("R1", "Der Standard-ROI ist gueltig und liegt vollstaendig im Bild",
  roiIsValid(standard) && standard.x >= 0 && standard.y >= 0
  && standard.x + standard.w <= 1 && standard.y + standard.h <= 1,
  `x=${standard.x.toFixed(3)} y=${standard.y.toFixed(3)} w=${standard.w.toFixed(3)} h=${standard.h.toFixed(3)}`);

const zuKlein = clampBoxRoi(0.4, 0.4, 0.01, 0.01, inset);
ok("R2", "Ein zu kleiner ROI wird auf die Mindestkantenlaenge angehoben",
  zuKlein.w >= ROI_MIN_SIDE && zuKlein.h >= ROI_MIN_SIDE,
  `Mindestkante ${ROI_MIN_SIDE}; erhalten w=${zuKlein.w.toFixed(3)} h=${zuKlein.h.toFixed(3)}`);

const ausserhalb = clampBoxRoi(0.9, 0.9, 0.5, 0.5, inset);
ok("R3", "Ein ueber den Bildrand hinausragender ROI wird zurueckgeholt",
  ausserhalb.x + ausserhalb.w <= 1.0001 && ausserhalb.y + ausserhalb.h <= 1.0001,
  `x+w=${(ausserhalb.x + ausserhalb.w).toFixed(4)} y+h=${(ausserhalb.y + ausserhalb.h).toFixed(4)}`);

/* Determinismus: dieselbe Eingabe zweimal, bit-identische Ausgabe. */
const a = clampBoxRoi(0.2, 0.3, 0.5, 0.4, inset);
const b = clampBoxRoi(0.2, 0.3, 0.5, 0.4, inset);
ok("R4", "Gleiche Eingabe ergibt bit-identische Geometrie",
  JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));

const hochformatRoi = { ...standard, sourceWidth: 100, sourceHeight: 400 };
ok("R5", "Ein ROI aus einem anders orientierten Foto gilt als unvereinbar",
  roiCompatibleWithPhoto(hochformatRoi, { imageWidth: 400, imageHeight: 100 }) === false
  && roiCompatibleWithPhoto(hochformatRoi, { imageWidth: 200, imageHeight: 800 }) === true,
  "Hochformat-ROI auf Querformat-Foto abgelehnt, auf Hochformat akzeptiert");

/* Der Fuell-Effekt. Ein Bild mit hartem Kontrast: links schwarz, rechts
   weiss. Ein ROI ueber die rechte Haelfte fuellt aussen mit dem MITTELWERT
   des Innenbereichs — also mit synthetischen Pixeln, die es im Original
   nicht gibt. */
const W = 32, H = 32;
const bild = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const wert = x < W / 2 ? 0 : 255;
    bild[i] = wert; bild[i + 1] = wert; bild[i + 2] = wert; bild[i + 3] = 255;
  }
}
const zuschnitt = copyRoiImageData(bild, W, H, { type: "box", x: 0.5, y: 0.0, w: 0.5, h: 1.0 });
ok("R6", "copyRoiImageData liefert einen Zuschnitt der erwarteten Groesse",
  zuschnitt?.data instanceof Uint8ClampedArray
  && zuschnitt.width === W / 2 && zuschnitt.height === H
  && zuschnitt.data.length === (W / 2) * H * 4,
  `${zuschnitt?.width}x${zuschnitt?.height}, ${zuschnitt?.data?.length} Byte`);

ok("R7", "Der Fuell-Effekt ist als offener Kalibrierungsfall ausgewiesen",
  ROI_FILL_CALIBRATION.status === "OPEN_CALIBRATION_CASE"
  && ROI_FILL_CALIBRATION.measured === false
  && ROI_FILL_CALIBRATION.affects.includes("tvFlat")
  && ROI_FILL_CALIBRATION.affects.includes("edgeFrac"),
  "synthetische Pixel ausserhalb des ROI beeinflussen tvFlat, edgeFrac und "
  + "gradMean; der Effekt ist nicht gemessen");

/* Und die Konsequenz daraus: der ROI-Zuschnitt ist in RC4 NICHT an die
   Analyse verdrahtet. Das ist die eigentliche Schutzmassnahme. */
const { readFileSync } = await import("node:fs");
const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
ok("R8", "Der ROI-Zuschnitt beeinflusst in RC4 kein Qualitaetsurteil",
  !/copyRoiImageData/.test(appQuelle),
  "copyRoiImageData wird in App.jsx nicht aufgerufen; das Modul liefert "
  + "Geometrie und Koordinaten, kein Urteil");

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log("");
console.log("OFFENER KALIBRIERUNGSFALL: der Fuell-Effekt von copyRoiImageData ist");
console.log("                          nicht gemessen und zaehlt nicht als geloest.");
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
