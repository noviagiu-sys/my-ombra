/* VisuClean v8.2 · Known-Issue-Regressionssuite
   Ausschliesslich ein lokalisierter, oberflaechlicher kosmetischer Kratzer
   darf durch eine aktive QA-Entscheidung toleriert werden. */

import { buildVerdicts, computeFeatures } from "./src/analysisCore.js";
import {
  applyKnownIssues, canCreateKnownIssue, extractZones, isIssueActive, matchZones,
} from "./src/knownIssues.js";

const W = 160;
const H = 120;
const JETZT = "2026-08-26T10:00:00.000Z";

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function image(seed, pixel) {
  const random = mulberry32(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [red, green, blue] = pixel(x, y, random);
    const offset = (y * W + x) * 4;
    data[offset] = red; data[offset + 1] = green; data[offset + 2] = blue; data[offset + 3] = 255;
  }
  return data;
}

function scratchResult() {
  const data = image(12, (x, y, random) => {
    if (Math.abs(y - (30 + 0.35 * x)) < 1.2 && x > 15 && x < 145) return [92, 92, 94];
    const value = 150 + Math.round((random() - 0.5) * 6);
    return [value, value, value];
  });
  const features = computeFeatures(data, W, H);
  const result = buildVerdicts(features);
  return {
    ...result,
    lm: features.lm,
    _ov: {
      w: W, h: H, scratches: features.scratches,
      maskBright: features.masks.maskBright, maskWarm: features.masks.maskWarm,
      maskDark: features.masks.maskDark, maskAnom: features.masks.maskAnom,
    },
  };
}

function issue(zones, changes = {}) {
  return {
    id: "ki-1", status: "active", eqId: "EQ-01", zoneId: "Z1",
    issueType: "hairline_scratch", originalIntactCode: "SCRATCH_SUSPECT",
    validUntil: "2027-01-01", validUntilLabel: "01.01.2027", zones,
    ...changes,
  };
}

const base = scratchResult();
const zones = extractZones(base._ov);
const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · Regressionssuite Known Issues v8.2\n");

ok("K1", "Ungueltiges Overlay ergibt keine Zone",
  extractZones(null).length === 0 && extractZones({ w: 0, h: 10 }).length === 0);
ok("K2", "Echter Analyse-Kratzer wird als scratch-Zone extrahiert",
  zones.length > 0 && zones.every(zone => zone.kind === "scratch"),
  `${zones.length} Zone(n), Core-Code ${base.intact.code}`);
ok("K3", "Zonenextraktion ist deterministisch",
  JSON.stringify(zones) === JSON.stringify(extractZones(scratchResult()._ov)));
ok("K4", "Identische Zonen matchen",
  matchZones(zones, zones).allMatched);

const shifted = zones.map(zone => ({ ...zone, x: Math.min(1, zone.x + 0.30) }));
ok("K5", "Stark verschobene Zone ist neu",
  !matchZones(shifted, zones).allMatched && matchZones(shifted, zones).unmatched.length > 0);
const near = zones.map(zone => ({ ...zone, x: zone.x + 0.05 }));
ok("K6", "Kleine Positionsabweichung bleibt tolerierbar",
  matchZones(near, zones).allMatched);
const grown = zones.map(zone => ({ ...zone, r: zone.r * 1.8 }));
ok("K7", "Gewachsene Zone wird erkannt",
  !matchZones(grown, zones).allMatched && matchZones(grown, zones).grown.length > 0);
ok("K8", "Andere Zonenart matcht nicht",
  !matchZones(zones.map(zone => ({ ...zone, kind: "dark" })), zones).allMatched);
ok("K9", "Ein gespeicherter Kratzer kann nicht zwei aktuelle Kratzer tolerieren",
  !matchZones([zones[0], { ...zones[0], x: zones[0].x + 0.02 }], [zones[0]]).allMatched,
  "1:1-Matching verhindert Mehrfachverbrauch");

const passed = { ...base, intact: { code: "PASS", pass: true, message: "Intakt", detail: "", severity: 0, action: "" } };
const untouched = applyKnownIssues(passed, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K10", "Bereits bestandenes INTAKT bleibt dasselbe Objekt",
  untouched.res === passed && untouched.info === null);
ok("K11", "Ohne Known Issue bleibt Kratzer FAIL",
  !applyKnownIssues(base, "EQ-01", "Z1", [], JETZT).res.intact.pass);
ok("K12", "Falsches Equipment greift nicht",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { eqId: "EQ-99" })], JETZT).res.intact.pass);
ok("K13", "Falsche Pruefzone greift nicht",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { zoneId: "Z9" })], JETZT).res.intact.pass);
ok("K14", "Abgelaufenes Known Issue toleriert nichts",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { validUntil: "2026-08-25" })], JETZT).res.intact.pass);
ok("K15", "Datumsfrist gilt bis Ende des angegebenen Tages",
  isIssueActive(issue(zones, { validUntil: "2026-08-26" }), new Date(JETZT)));
ok("K16", "Geschlossenes Known Issue toleriert nichts",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { status: "closed" })], JETZT).res.intact.pass);
ok("K17", "Nicht freigegebener Auffaelligkeitstyp toleriert nichts",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { issueType: "corrosion" })], JETZT).res.intact.pass);
ok("K18", "Known Issue muss urspruenglich ein Kratzerurteil tragen",
  !applyKnownIssues(base, "EQ-01", "Z1", [issue(zones, { originalIntactCode: "CORROSION_SUSPECT" })], JETZT).res.intact.pass);

const tolerated = applyKnownIssues(base, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K19", "Unveraenderter Kratzer wird QA-toleriert",
  tolerated.res.intact.pass && tolerated.res.intact.code === "KNOWN_ISSUE_TOLERATED" && tolerated.info?.status === "unveraendert");
ok("K20", "Toleranzurteil nennt die Gueltigkeit",
  tolerated.res.intact.detail.includes("01.01.2027"));

const grownApplied = applyKnownIssues(base, "EQ-01", "Z1", [issue(zones.map(zone => ({ ...zone, r: zone.r / 2 })))], JETZT);
ok("K21", "Gewachsener Kratzer bleibt FAIL",
  !grownApplied.res.intact.pass && grownApplied.info?.status === "verschlechtert");

const extraComponent = { ...base._ov.scratches[0], minX: 4, maxX: 55, minY: 84, maxY: 87 };
const extraResult = { ...base, _ov: { ...base._ov, scratches: [...base._ov.scratches, extraComponent] } };
const extraApplied = applyKnownIssues(extraResult, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K22", "Neuer zusaetzlicher Kratzer bleibt FAIL",
  !extraApplied.res.intact.pass && extraApplied.info?.status === "verschlechtert");

const globalTexture = { ...base, intact: { ...base.intact, code: "GLOBAL_TEXTURE_FAIL", message: "Global", pass: false } };
const globalApplied = applyKnownIssues(globalTexture, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K23", "GMP-Leitplanke: globaler Texturfehler ist nie tolerierbar",
  !globalApplied.res.intact.pass && globalApplied.info?.status === "nicht_tolerierbar");
const corrosion = { ...base, intact: { ...base.intact, code: "CORROSION_SUSPECT", message: "Korrosion", pass: false } };
ok("K24", "GMP-Leitplanke: Korrosionsverdacht ist nie tolerierbar",
  !applyKnownIssues(corrosion, "EQ-01", "Z1", [issue(zones)], JETZT).res.intact.pass);

const dryFail = { ...base, dry: { ...base.dry, code: "MOISTURE_SUSPECT", pass: false, severity: 80 } };
const dryApplied = applyKnownIssues(dryFail, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K25", "GMP-Leitplanke: TROCKEN-FAIL bleibt bestehen",
  !dryApplied.res.dry.pass && dryApplied.res.dry.severity === 80);
const cleanFail = { ...base, clean: { ...base.clean, code: "ORGANIC_RESIDUE", pass: false, severity: 90 } };
const cleanApplied = applyKnownIssues(cleanFail, "EQ-01", "Z1", [issue(zones)], JETZT);
ok("K26", "GMP-Leitplanke: SAUBER-FAIL bleibt bestehen",
  !cleanApplied.res.clean.pass && cleanApplied.res.clean.severity === 90);
ok("K27", "Nur INTAKT wird ersetzt; Masken und andere Urteile bleiben identisch",
  tolerated.res.dry === base.dry && tolerated.res.clean === base.clean && tolerated.res._ov === base._ov);
ok("K28", "Anlage eines Known Issue ist nur beim lokalisierten Kratzer moeglich",
  canCreateKnownIssue(base) && !canCreateKnownIssue(globalTexture) && !canCreateKnownIssue(corrosion));

const masksOnly = { ...base._ov, scratches: [] };
ok("K29", "Dunkel- und Anomaliemasken werden nie als Kratzerzone umgedeutet",
  extractZones(masksOnly).length === 0);
const deterministicA = JSON.stringify(applyKnownIssues(scratchResult(), "EQ-01", "Z1", [issue(zones)], JETZT));
const deterministicB = JSON.stringify(applyKnownIssues(scratchResult(), "EQ-01", "Z1", [issue(zones)], JETZT));
ok("K30", "Gesamter Known-Issue-Pfad ist deterministisch",
  deterministicA === deterministicB);

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
