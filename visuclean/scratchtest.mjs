/* ─── VisuClean · Kratzerdokumentation und Vergleich (RC3) ─────────────────
   Aufruf: node scratchtest.mjs

   "Neu" ist eine Aussage über zwei Zeitpunkte. Diese Suite weist nach, dass
   sie ohne belastbare Vergleichsaufnahme nicht getroffen wird — und dass ein
   neuer Kratzer nie automatisch zu einem Known Issue wird.                */

import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";
import { extractZones } from "./src/knownIssues.js";
import {
  SCRATCH_CLASS, NO_REFERENCE_TEXT, referenceEligibility,
  classifyScratches, scratchRecord, requestKnownIssuePromotion,
} from "./src/scratchComparison.js";

const R = [];
const ok = (id, name, bestanden, info = "") => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

function rng(a) {
  return () => { a |= 0; a = a + 0x9E3779B9 | 0;
    let t = Math.imul(a ^ a >>> 16, 0x85EBCA6B);
    t = Math.imul(t ^ t >>> 13, 0xC2B2AE35);
    return ((t ^ t >>> 16) >>> 0) / 4294967296; };
}
const W = 200, H = 150;
function syn(seed, fn) {
  const r = rng(seed), d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, [a, b, c] = fn(x, y, r);
    d[i] = a; d[i + 1] = b; d[i + 2] = c; d[i + 3] = 255;
  }
  return d;
}
const flach = (r, m = 150) => { const v = m + Math.round((r() - 0.5) * 6); return [v, v, v]; };

const kratzerDaten = syn(31, (x, y, r) =>
  (Math.abs(y - (35 + 0.30 * x)) < 1.3 && x > 20 && x < 180) ? [90, 90, 92] : flach(r));
const f = computeFeatures(kratzerDaten, W, H);
const v = buildVerdicts(f);
const ov = { w: W, h: H, ...f.masks, scratches: f.scratches };
const zonen = extractZones(ov);

const gute = (over = {}) => ({
  equipmentId: "EQ-1", zoneId: "Z-1", width: W, height: H,
  edgeFrac: 0.12, viewAngle: 0, approved: true, zones: zonen.map(z => ({ ...z })), ...over,
});
const aktuell = { equipmentId: "EQ-1", zoneId: "Z-1", width: W, height: H, edgeFrac: 0.12, viewAngle: 0 };

console.log("VisuClean · Kratzerdokumentation und Vergleich");
console.log("");

ok("S1", "Voraussetzung: das Testbild liefert erkannte Kratzerzonen",
  v.intact.code === "SCRATCH_SUSPECT" && zonen.length > 0 && zonen.every(z => z.kind === "scratch"),
  `${zonen.length} Zone(n) · ${f.scratches.length} Struktur(en)`);

console.log("");
console.log("── Eignung der Vergleichsaufnahme ──");

const faelle = [
  ["kein Referenzbild", null, /Keine freigegebene/],
  ["anderes Equipment", gute({ equipmentId: "EQ-9" }), /Anderes Equipment/],
  ["andere Zone", gute({ zoneId: "Z-9" }), /Andere Prüfzone/],
  ["nicht freigegeben", gute({ approved: false }), /nicht freigegeben/],
  ["zu unterschiedlicher Ausschnitt", gute({ width: 400, height: 100 }), /Bildausschnitt/],
  ["zu unterschiedlicher Blickwinkel", gute({ viewAngle: 45 }), /Blickwinkel/],
  ["zu geringe Bildqualitaet", gute({ edgeFrac: 0.01 }), /Mikrokanten/],
];
let eigOk = true, eigInfo = [];
for (const [name, ref, muster] of faelle) {
  const e = referenceEligibility(aktuell, ref);
  const gut = e.eligible === false && e.reasons.some(r => muster.test(r.de));
  if (!gut) eigOk = false;
  eigInfo.push(name + (gut ? " ✓" : " ✗"));
}
ok("S2", "Ungeeignete Vergleichsaufnahmen werden mit Grund abgewiesen", eigOk, eigInfo.join(" · "));

ok("S3", "Eine geeignete Vergleichsaufnahme wird angenommen",
  referenceEligibility(aktuell, gute()).eligible === true,
  "gleiches Equipment, gleiche Zone, freigegeben, vergleichbarer Ausschnitt und Qualitaet");

console.log("");
console.log("── Klassifikation ──");

const ohneRef = classifyScratches({ currentZones: zonen, current: aktuell, reference: null });
ok("S4", "Ohne belastbare Referenz lautet die Anzeige wie vorgeschrieben",
  ohneRef.classification === SCRATCH_CLASS.NOT_ASSESSABLE
  && ohneRef.comparable === false
  && ohneRef.display.de === NO_REFERENCE_TEXT.de
  && ohneRef.display.de === "Kratzer erkannt – neu oder bestehend nicht bestimmbar.",
  `"${ohneRef.display.de}"`);

const bestehend = classifyScratches({ currentZones: zonen, current: aktuell, reference: gute() });
ok("S5", "Unveraenderte Zonen gelten als bestehender Kratzer",
  bestehend.classification === SCRATCH_CLASS.EXISTING && bestehend.comparable === true,
  `${bestehend.detail.matched} Zone(n) unveraendert`);

const kleinereRef = gute({ zones: zonen.map(z => ({ ...z, r: z.r / 2 })) });
const gewachsen = classifyScratches({ currentZones: zonen, current: aktuell, reference: kleinereRef });
ok("S6", "Eine gewachsene Zone wird als vergroessert klassifiziert",
  gewachsen.classification === SCRATCH_CLASS.GROWN,
  `gewachsen ${gewachsen.detail.grown}`);

const fremdeRef = gute({ zones: [{ kind: "scratch", x: 0.9, y: 0.9, r: 0.03 }] });
const neuVermutet = classifyScratches({ currentZones: zonen, current: aktuell, reference: fremdeRef });
ok("S7", "Ohne ausdrueckliche Bestaetigung lautet der Befund nur VERMUTET",
  neuVermutet.classification === SCRATCH_CLASS.NEW_SUSPECTED
  && neuVermutet.display.de === "Neuer Kratzer vermutet",
  `${neuVermutet.detail.unmatched} Zone(n) ohne Entsprechung`);

const neuBestaetigt = classifyScratches({
  currentZones: zonen, current: aktuell, reference: fremdeRef, operatorConfirmed: true });
ok("S8", "Erst die ausdrueckliche Bestaetigung macht daraus BESTAETIGT",
  neuBestaetigt.classification === SCRATCH_CLASS.NEW_CONFIRMED,
  neuBestaetigt.display.de);

const kiZonen = zonen.map(z => ({ ...z }));
const knownIssue = classifyScratches({ currentZones: zonen, current: aktuell, reference: gute(), knownIssueZones: kiZonen });
ok("S9", "Freigegebene Known Issues werden als solche erkannt",
  knownIssue.classification === SCRATCH_CLASS.KNOWN_ISSUE,
  knownIssue.display.de);

console.log("");
console.log("── Automatische Known-Issue-Uebernahme ist verboten ──");

const satz = scratchRecord({
  classification: neuBestaetigt, photo: "data:image/jpeg;base64,AAA", overlay: "data:image/png;base64,BBB",
  equipmentId: "EQ-1", zoneId: "Z-1", user: "operator1", timestamp: "2026-08-29T10:00:00.000Z",
  measurements: { scratches: f.scratches.length }, status: "FAIL", reason: "Neuer Kratzer bestaetigt",
});

ok("S10", "Ein bestaetigter neuer Kratzer wird NICHT automatisch zum Known Issue",
  satz.knownIssueCandidate === true
  && requestKnownIssuePromotion(satz, null).allowed === false,
  "Kandidat ja, automatische Uebernahme nein");

ok("S11", "Nur die Rolle QA Manager darf freigeben",
  requestKnownIssuePromotion(satz, {
    role: "Operator", user: "operator1", signature: "sig", reason: "passt schon",
    timestamp: "2026-08-29T10:00:00.000Z", validUntil: "2027-01-01",
  }).allowed === false,
  "Operator wird abgewiesen");

ok("S12", "Eine unvollstaendige Freigabe wird abgewiesen",
  ["user", "signature", "reason", "timestamp", "validUntil"].every(feld => {
    const a = { role: "QA Manager", user: "q", signature: "s", reason: "r", timestamp: "t", validUntil: "2027-01-01" };
    delete a[feld];
    return requestKnownIssuePromotion(satz, a).allowed === false;
  }),
  "jede fehlende Pflichtangabe blockiert");

const freigabe = requestKnownIssuePromotion(satz, {
  role: "QA Manager", user: "qa_manager", signature: "QA-SIG-1",
  reason: "Kosmetischer Haarriss, Funktion nicht beeintraechtigt",
  timestamp: "2026-08-29T11:00:00.000Z", validUntil: "2027-06-30",
});
ok("S13", "Mit vollstaendiger QA-Freigabe entsteht ein regelkonformes Known Issue",
  freigabe.allowed === true && freigabe.issue.issueType === "hairline_scratch"
  && freigabe.issue.originalIntactCode === "SCRATCH_SUSPECT"
  && freigabe.issue.approvedBy === "qa_manager",
  `gueltig bis ${freigabe.issue.validUntil} · freigegeben von ${freigabe.issue.approvedBy}`);

console.log("");
console.log("── Dokumentationsumfang ──");

ok("S14", "Der Kratzersatz enthaelt alle geforderten Angaben",
  ["equipmentId", "zoneId", "user", "timestamp", "photo", "overlay", "zones",
   "classification", "comparable", "measurements", "status", "reason"]
    .every(k => satz[k] !== undefined) && satz.zones.length > 0
  && satz.zones.every(z => Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.r)),
  "Originalfoto, Overlay, Equipment, Zone, Zeit, Benutzer, Position, Messwerte, Status, Begruendung");

console.log("");
console.log("── Determinismus ──");
ok("S15", "Klassifikation ist deterministisch",
  JSON.stringify(classifyScratches({ currentZones: zonen, current: aktuell, reference: gute() }))
  === JSON.stringify(bestehend),
  "zweiter Lauf zeichengleich");

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
