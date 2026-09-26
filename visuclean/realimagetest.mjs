import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import { buildVerdicts, computeFeatures } from "./src/analysisCore.js";

const FIXTURE_DIR = new URL("./tests/fixtures/real/", import.meta.url);

function analyze(name) {
  const png = PNG.sync.read(fs.readFileSync(new URL(name, FIXTURE_DIR)));
  const features = computeFeatures(png.data, png.width, png.height);
  return { features, verdict: buildVerdicts(features) };
}

const cases = [
  ["R1", "wet-stainless-close.png", false, "vom Anwender bestätigte, vollständig nasse Edelstahlfläche"],
  ["R2", "wet-stainless-wide.png", false, "vom Anwender bestätigte, vollständig nasse Edelstahlfläche"],
  ["R3", "dry-stainless-control.png", true, "trockene Edelstahl-Kontrollaufnahme nach Reinigung"],
];

console.log("VisuClean · reale Edelstahl-Regressionsfälle\n");
for (const [id, file, expectedDry, groundTruth] of cases) {
  const { features, verdict } = analyze(file);
  assert.equal(verdict.dry.pass, expectedDry, `${id}: TROCKEN weicht von der bestätigten Referenz ab`);
  console.log(`BESTANDEN  ${id}  ${groundTruth}`);
  console.log(`             ${verdict.dry.code} · grad ${features.gradMean.toFixed(4)} · Kanten ${(features.edgeFrac * 100).toFixed(1)}%`);
}

const control = analyze("dry-stainless-control.png");
assert.equal(control.verdict.clean.pass, true, "R4: Geometrie/Beleuchtung darf keinen lokalen Rückstand erfinden");
assert.equal(control.verdict.intact.pass, true, "R5: übliche Edelstahlstruktur darf keinen Defekt erfinden");
console.log("BESTANDEN  R4  trockene Kontrollaufnahme ohne erfundene lokale Rückstände");
console.log("BESTANDEN  R5  übliche Edelstahlstruktur ohne erfundenen Defekt");
console.log("\nBestanden: 5 / 5\nERGEBNIS: BESTANDEN");
