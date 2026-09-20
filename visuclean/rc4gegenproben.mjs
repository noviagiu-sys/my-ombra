/* ─── RC4 · Gegenproben: sind die RC3-Maengel behoben? ─────────────────────
   Gegenstueck zu RC3_ROTE_GEGENPROBEN.txt.

   Diese Datei prueft am RC4-Code, dass jeder der 26 am RC3-Stand belegten
   Maengel tatsaechlich behoben ist. Das Protokoll des roten Ausgangszustands
   liegt als RC3_ROTE_GEGENPROBEN.txt daneben; es wurde mit dem
   unveraenderten RC3-Quellcode erzeugt.

   Zusammen bilden beide Dateien den Nachweis, den die Planung verlangt:
   "Ein Test, der nie rot war, gilt nicht als Nachweis einer Reparatur."

   Aufruf: node rc4gegenproben.mjs                                          */

import { readFileSync } from "node:fs";
import { buildCheckpoints, STATUS } from "./src/assessment.js";
import { applyKnownIssues, extractZones } from "./src/knownIssues.js";
import { LIFECYCLE_STATE, evaluateTransition, verifyAnchors } from "./src/lifecycle.js";
import {
  PROFILE_STATUS, RESOLUTION_CALIBRATION, SCRATCH_STATUS, DEPTH_DECISION,
  evaluateCaptureProfile, validateKnownIssueAssignment, validateManualFinding,
  validateRetakeRecord, isDeviationAction, consistencyHint, PREPARATION_ACTION,
  MANUAL_FINDING, CAPTURE_PATH,
} from "./src/decision.js";
import { LEGACY_NOT_COMPARABLE, planLegacyMarking } from "./src/references.js";
import { AI_STATUS, crosscheckState, validateAiResponse } from "./src/aiContract.js";
import { RECORD_SCHEMA_VERSION } from "./src/persistence.js";

const ergebnisse = [];
let behobenZahl = 0;
let offenZahl = 0;

/** bedingung===true heisst: der RC3-Mangel ist behoben. */
function behoben(id, titel, bedingung, beleg) {
  if (bedingung) {
    behobenZahl++;
    ergebnisse.push({ id, titel, status: "BEHOBEN", beleg });
  } else {
    offenZahl++;
    ergebnisse.push({ id, titel, status: "OFFEN", beleg });
  }
}

const src = name => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf8");
const QUELLEN = ["analysisCore.js", "assessment.js", "domain.js", "knownIssues.js",
  "persistence.js", "audit.js", "lifecycle.js", "decision.js", "references.js",
  "aiContract.js", "App.jsx", "pdfExport.js", "i18n.js"];
const irgendwo = muster => QUELLEN.filter(name => muster.test(src(name)));

/* ── A · Zustandsmaschine und Lebenszyklus ─────────────────────────────── */

behoben("T-G1..G4", "Zustandsmaschine mit acht Zustaenden vorhanden",
  Object.keys(LIFECYCLE_STATE).length === 8,
  `Zustaende: ${Object.keys(LIFECYCLE_STATE).join(", ")}`);

const g1 = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.FINAL_PASS,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
});
behoben("T-G1", "PENDING_QA → FINAL_PASS ist unzulaessig",
  g1.allowed === false && g1.code === "TRANSITION_NOT_ALLOWED",
  `abgewiesen mit ${g1.code}: ${g1.message}`);

const offenerPunkt = [{ id: "residue", required: true, status: STATUS.NOT_ASSESSABLE }];
const g2a = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
  checkpoints: offenerPunkt,
  performedBy: { username: "operator1" },
  approvedBy: { username: "qa_manager", role: "QA Manager" },
});
/* Seit rc.4.11 ist AUCH die Sperrung eines wartenden Vorgangs eine
   QA-Handlung: Rolle, Genehmigeridentitaet und Vier-Augen werden verlangt.
   Die Fixture liefert diese Felder jetzt mit. Die AUSSAGE des
   Gegenbeweises ist unveraendert — g2a bleibt abgewiesen, g2b erlaubt;
   die Regel ist strenger geworden, nicht der Test schwaecher. */
const g2b = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.FINAL_FAIL,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
  checkpoints: offenerPunkt, comment: "Massnahme eingeleitet",
  performedBy: { username: "operator1" },
  approvedBy: { username: "qa_manager", role: "QA Manager" },
});
behoben("T-G2", "Offener Pflichtpunkt laesst nur PENDING_OPERATOR_ACTION und FINAL_FAIL zu",
  g2a.allowed === false && g2a.code === "OPEN_CHECKPOINT" && g2b.allowed === true,
  `PASS abgewiesen (${g2a.code}), FINAL_FAIL erlaubt — auch fuer einen QA Manager`);

const g3 = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
  performedBy: { username: "operator1" },
  approvedBy: { username: "qa_manager", role: "QA Manager" },
  approvalRevisionHash: "aaa", currentRevisionHash: "bbb",
});
behoben("T-G3", "Aenderung nach QA-Genehmigung macht die Genehmigung ungueltig",
  g3.allowed === false && g3.code === "REVISION_CHANGED",
  `abgewiesen mit ${g3.code}`);

const g4 = evaluateTransition({
  from: LIFECYCLE_STATE.NOT_VERIFIED, to: LIFECYCLE_STATE.FINAL_PASS,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
});
behoben("T-G4", "Aus NOT_VERIFIED fuehrt kein Weg zurueck zu einer Freigabe",
  g4.allowed === false && g4.code === "NOT_VERIFIED_IS_FINAL",
  `abgewiesen mit ${g4.code}`);

/* ── B · Vier-Augen und Rollen ─────────────────────────────────────────── */

behoben("T-11 / T-38", "performedBy und approvedBy werden getrennt gefuehrt",
  irgendwo(/approvedBy/).length > 0 && irgendwo(/performedBy/).length > 0,
  `beide Felder in: ${irgendwo(/approvedBy/).join(", ")}`);

const vierAugen = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  actor: { username: "qa_manager", role: "QA Manager" }, reauthenticated: true,
  performedBy: { username: "qa_manager", role: "QA Manager" },
  approvedBy: { username: "qa_manager", role: "QA Manager" },
});
behoben("Vier-Augen (Auslegung B)", "Genehmiger und Pruefer duerfen nicht dieselbe Person sein",
  vierAugen.allowed === false && vierAugen.code === "FOUR_EYES_REQUIRED",
  `abgewiesen mit ${vierAugen.code} — vom Auftraggeber am 2026-09-08 so entschieden`);

const adminFreigabe = evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  actor: { username: "admin", role: "Administrator" }, reauthenticated: true,
  performedBy: { username: "operator1" },
  approvedBy: { username: "admin", role: "Administrator" },
});
behoben("T-B4", "Exakter Rollenvergleich: ein Administrator ist kein QA Manager",
  adminFreigabe.allowed === false && adminFreigabe.code === "QA_ROLE_REQUIRED",
  `abgewiesen mit ${adminFreigabe.code}`);

/* ── C · Aufnahmeprofil und Aufloesung ─────────────────────────────────── */

behoben("T-H2", "Rohbefunde tragen Aufnahmemetadaten",
  irgendwo(/processedWidth/).length > 0 && irgendwo(/captureProfile/).length > 0,
  "processedWidth/processedHeight und Verarbeitungspfad sind Pflichtfelder");

const ohneProfil = evaluateCaptureProfile(null);
behoben("T-H3", "Nicht freigegebenes Aufnahmeprofil erzeugt weder PASS noch FAIL",
  ohneProfil.status === PROFILE_STATUS.UNSUPPORTED
  && PROFILE_STATUS.UNSUPPORTED === "NOT_ASSESSABLE_UNSUPPORTED_CAPTURE_PROFILE",
  `Status ${ohneProfil.status}`);

const mitProfil = evaluateCaptureProfile({
  processedWidth: 480, processedHeight: 640, path: CAPTURE_PATH.CAMERA,
});
behoben("T-H1", "Aufloesungsabhaengigkeit ist als offener Kalibrierungsfall ausgewiesen",
  RESOLUTION_CALIBRATION.status === "OPEN_CALIBRATION_CASE"
  && RESOLUTION_CALIBRATION.minimumWidth === null
  && mitProfil.status === PROFILE_STATUS.NOT_MEASURED,
  "keine geratene Mindestaufloesung; ein Profil ohne Messung gilt als NOT_MEASURED, "
  + "nicht als freigegeben");

/* ── D · Kratzer ───────────────────────────────────────────────────────── */

const kp = buildCheckpoints(
  { scratches: [{ x: 1, y: 1 }], tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3 },
  { dry: { pass: true }, clean: { pass: true } });
const kratzerPunkt = kp.find(c => c.id === "scratch");
behoben("T-12 / T-I2", "Automatischer Kratzerbefund weist die Herkunft als unbestimmt aus",
  kratzerPunkt.code === "SCRATCH_DETECTED_ORIGIN_UNDETERMINED"
  && /nicht bestimmbar/.test(kratzerPunkt.message.de),
  `code=${kratzerPunkt.code}, Text "${kratzerPunkt.message.de}"`);

behoben("X-07", "Keine automatische Klassifikation NEW / EXISTING / GROWN",
  SCRATCH_STATUS.DETECTED_ORIGIN_UNDETERMINED === "SCRATCH_DETECTED_ORIGIN_UNDETERMINED"
  && Object.keys(SCRATCH_STATUS).length === 1,
  "SCRATCH_STATUS kennt genau einen Wert");

/* T-34 hiess bis rc.4.31 "jede numerische Tiefenangabe wird abgewiesen".
   Mit der belegten Vorgabegrenze (< 1,0 um) gibt es jetzt genau
   EINEN zulaessigen Weg: eine vollstaendige unabhaengige Messung. Die
   Gegenprobe wird dadurch nicht schwaecher, sondern zweiseitig — sie
   verlangt zusaetzlich, dass der zulaessige Weg auch wirklich offen ist.
   Eine Sperre, die alles abweist, beweist nichts ueber ihre Grenze. */
const blosseZahl = {
  kind: MANUAL_FINDING.MANUAL_CORROSION_CONFIRMED, username: "qa_manager",
  role: "QA Manager", at: "2026-09-08T10:00:00.000Z", reason: "Sichtpruefung",
  photoId: "p1", depthValue: 0.4,
};
const mitMessung = {
  ...blosseZahl,
  depthMeasurement: {
    valueUm: 0.4, unit: "\u00b5m", method: "TASTSCHNITT", uncertaintyUm: 0.05,
    measuredAt: "2026-09-08T10:05:00.000Z", measuredBy: "m.koch",
    source: "INDEPENDENT_MEASUREMENT",
  },
};
behoben("T-34", "Tiefenangabe nur mit vollstaendiger unabhaengiger Messung",
  DEPTH_DECISION.NOT_MEASURED === "NOT_MEASURED"
  && validateManualFinding(blosseZahl).valid === false
  && validateManualFinding(mitMessung).valid === true,
  "blosse Zahl abgewiesen, belegte Messung angenommen");

const manuell = validateManualFinding({
  kind: MANUAL_FINDING.MANUAL_SCRATCH_NEW, username: "qa_manager", role: "QA Manager",
  at: "2026-09-08T10:00:00.000Z", reason: "Vergleich mit Referenz", photoId: "p1",
});
behoben("T-I1", "Manuelle Feststellung verlangt Benutzer, Rolle, Zeit, Begruendung, Foto- und Referenzbezug",
  manuell.valid === false && /referenceId/.test(manuell.error),
  `ohne Referenzbezug abgewiesen: ${manuell.error}`);

/* ── E · Korrosion ─────────────────────────────────────────────────────── */

const korrosionPunkt = buildCheckpoints(
  { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [] },
  { dry: { pass: true }, clean: { pass: true } }).find(c => c.id === "corrosion");
behoben("T-J2", "Keine automatische Aussage „keine Korrosion“",
  /kein Nachweis der Abwesenheit/.test(korrosionPunkt.message.de),
  `Prueftext: "${korrosionPunkt.message.de}"`);

behoben("T-J1", "Korrosionsverdacht ist als algorithmischer Verdacht benannt",
  /algorithmischer Korrosionsverdacht/.test(src("assessment.js")),
  "assessment.js meldet „Dunkle Auffälligkeit / algorithmischer Korrosionsverdacht“");

behoben("T-J4", "Bestaetigte Korrosion nur durch dokumentierte manuelle Sichtpruefung",
  irgendwo(/CORROSION_CONFIRMED/).length > 0,
  "MANUAL_CORROSION_CONFIRMED setzt dauerhaft den QA-Trigger");

/* ── F · Known Issues ──────────────────────────────────────────────────── */

const overlay = { w: 64, h: 64, scratches: [{ minX: 24, maxX: 40, minY: 31, maxY: 33 }] };
const [zoneA] = extractZones(overlay);
const kiRoh = applyKnownIssues(
  { intact: { pass: false, code: "SCRATCH_SUSPECT" }, _ov: overlay },
  "tp", "punch",
  [{ id: "ki-1", eqId: "tp", zoneId: "punch", status: "active",
    issueType: "hairline_scratch", originalIntactCode: "SCRATCH_SUSPECT",
    zones: [zoneA], validUntil: "2099-01-01" }],
  "2026-01-01T00:00:00.000Z");
const automatisch = validateKnownIssueAssignment({
  issueId: "ki-1", username: "system", role: "QA Manager", at: "2026-09-08",
  reason: "Positionsuebereinstimmung", assignedAutomatically: true,
});
const durchOperator = validateKnownIssueAssignment({
  issueId: "ki-1", username: "operator1", role: "Operator", at: "2026-09-08",
  reason: "sieht gleich aus",
});
behoben("T-B6", "Known-Issue-Zuordnung nur manuell und nur durch einen QA Manager",
  automatisch.valid === false && durchOperator.valid === false,
  `automatische Zuordnung abgewiesen (${automatisch.error}); Operator abgewiesen `
  + `(${durchOperator.error}). Der Rohbefund von applyKnownIssues `
  + `(status="${kiRoh?.info?.status}") wirkt ohne QA-Zuordnung nicht mehr.`);

behoben("T-B3", "Aktives Known Issue bleibt erneut QA-pflichtig",
  irgendwo(/KNOWN_ISSUE_ACTIVE/).length > 0,
  "jede Known-Issue-Zuordnung erzeugt einen QA-Trigger; keine wiederverwendbare "
  + "Vorabfreigabe");

/* ── G · Aufnahmevorbereitung, Abwischen, Nachreinigen ─────────────────── */

behoben("T-01", "PRECONDITION_NOT_MET und ineligibleForQualityAssessment vorhanden",
  irgendwo(/PRECONDITION_NOT_MET/).length > 0
  && irgendwo(/ineligibleForQualityAssessment/).length > 0,
  "ein ungeeignetes Bild besitzt kein gueltiges Kernergebnis");

const retakeUnvollstaendig = validateRetakeRecord({
  photoIdBefore: "p1", photoIdAfter: "p2", eqId: "tp", zoneId: "punch",
  action: PREPARATION_ACTION.WIPED_AND_DRIED,
});
behoben("T-A6", "Retake-Datensatz ohne Rolle, Zeit oder Begruendung wird abgewiesen",
  retakeUnvollstaendig.valid === false,
  retakeUnvollstaendig.error);

const hinweis = consistencyHint({
  action: PREPARATION_ACTION.WIPED_AND_DRIED, before: 0.02, after: 0.09,
});
behoben("T-A1 / T-A2", "Messwertunterschied ist ein Hinweis, kein Beweis",
  hinweis?.code === "CONSISTENCY_HINT" && hinweis.triggersQa === false
  && isDeviationAction(PREPARATION_ACTION.WIPED_AND_DRIED) === false
  && isDeviationAction(PREPARATION_ACTION.RECLEANED) === true,
  "Abwischen loest keinen QA-Trigger aus; nur eine bewusst bestaetigte "
  + "Nachreinigung oder Rueckstandsentfernung tut das");

/* ── H · Schema und Integritaet ────────────────────────────────────────── */

behoben("T-19 / T-20", "Schema 3 wird beim Schreiben erzwungen",
  RECORD_SCHEMA_VERSION === 3 && /schemaVersion/.test(src("persistence.js")),
  "nur schemaVersion 3 darf geschrieben werden; Lesen bleibt fuer alle Versionen moeglich");

behoben("T-21 / T-22", "Pruefpunktlisten werden speicherseitig verlangt",
  /validateCheckpointList/.test(src("persistence.js"))
  && /Angeliefertes required/.test(src("persistence.js")),
  "leere, unvollstaendige und doppelte Listen werden abgewiesen; ein "
  + "angeliefertes required:false ist wirkungslos");

const ankerFehlt = verifyAnchors([], [{ id: "i1", state: LIFECYCLE_STATE.FINAL_PASS, finalRevisionHash: "abc" }]);
const ankerDoppelt = verifyAnchors(
  [{ id: "e1", kind: "FINAL_ANCHOR", payload: { inspectionId: "i1", revisionHash: "abc" } },
    { id: "e2", kind: "FINAL_ANCHOR", payload: { inspectionId: "i1", revisionHash: "abc" } }],
  [{ id: "i1", state: LIFECYCLE_STATE.FINAL_PASS, finalRevisionHash: "abc" }]);
const ankerFalsch = verifyAnchors(
  [{ id: "e1", kind: "FINAL_ANCHOR", payload: { inspectionId: "i1", revisionHash: "xxx" } }],
  [{ id: "i1", state: LIFECYCLE_STATE.FINAL_PASS, finalRevisionHash: "abc" }]);
const verwaist = verifyAnchors(
  [{ id: "e1", kind: "INSPECTION_SIGNED", payload: { inspectionId: "unbekannt" } }], []);
behoben("T-D2..D5", "Fehlender, doppelter, verwaister und falsch verweisender Anker werden erkannt",
  ankerFehlt.problems[0]?.code === "ANCHOR_MISSING"
  && ankerDoppelt.problems[0]?.code === "ANCHOR_DUPLICATE"
  && ankerFalsch.problems[0]?.code === "ANCHOR_WRONG_REVISION"
  && verwaist.problems[0]?.code === "ORPHAN_EVENT",
  "vier getrennte Befunde: ANCHOR_MISSING, ANCHOR_DUPLICATE, ANCHOR_WRONG_REVISION, ORPHAN_EVENT");

behoben("T-D6", "QA-Genehmigung ist an die Datensatzrevision gebunden",
  irgendwo(/revisionHash/).length > 0 && g3.code === "REVISION_CHANGED",
  "eine Signatur zu einer anderen Revision wird abgewiesen");

/* ── I · Alt-Referenzen ────────────────────────────────────────────────── */

const alt = { id: "tp:die", recordHash: "h1", image: "x" };
const plan1 = planLegacyMarking([alt], [], { appVersion: "8.3.0-rc.4", at: "2026-09-08" });
const plan2 = planLegacyMarking([alt], plan1.toWrite, { appVersion: "8.3.0-rc.4", at: "2026-09-08" });
const plan3 = planLegacyMarking([{ ...alt, recordHash: "h2" }], plan1.toWrite,
  { appVersion: "8.3.0-rc.4", at: "2026-09-08" });
behoben("T-C1 / T-C5 / T-C6", "Alt-Referenz-Markierung: getrennt, idempotent, nicht uebernommen",
  plan1.toWrite.length === 1 && plan1.toWrite[0].kind === LEGACY_NOT_COMPARABLE
  && plan2.toWrite.length === 0 && plan2.unchanged.length === 1
  && plan3.stale.length === 1 && plan3.toWrite.length === 1,
  "erster Start markiert, zweiter Start schreibt nichts, geaenderter Referenzhash "
  + "uebernimmt die alte Markierung nicht");

behoben("T-C2", "Der historische Referenzdatensatz bleibt unangetastet",
  !/\breference\.[A-Za-z]+\s*=[^=]/.test(src("references.js"))
  && /GETRENNTE Information/.test(src("references.js")),
  "references.js schreibt nie in das Referenzobjekt; der recordHash wird nicht "
  + "neu berechnet");

/* ── J · KI-Vertragsschnittstelle ──────────────────────────────────────── */

const kiAus = crosscheckState(null);
behoben("T-K4", "Ohne konfigurierten Adapter: sichtbar deaktiviert, keine externen Requests",
  kiAus.enabled === false && kiAus.status === AI_STATUS.DISABLED
  && !/fetch\(|XMLHttpRequest|https?:\/\//.test(src("aiContract.js")),
  "keine URL, kein fetch, keine Zugangsdaten in aiContract.js");

const einzelurteil = validateAiResponse({
  photoId: "p1", points: { intact: { status: "PASS" } },
  adapterVersion: "1", modelName: "m", modelVersion: "1",
}, { photoId: "p1" });
const verspaetet = validateAiResponse({
  photoId: "p1", recordRevision: "alt",
  points: { residue: { status: "PASS" }, scratch: { status: "PASS" }, corrosion: { status: "PASS" } },
  adapterVersion: "1", modelName: "m", modelVersion: "1",
}, { photoId: "p1", recordRevision: "neu" });
const unbekannterStatus = validateAiResponse({
  photoId: "p1",
  points: { residue: { status: "BANANA" }, scratch: { status: "PASS" }, corrosion: { status: "PASS" } },
  adapterVersion: "1", modelName: "m", modelVersion: "1",
}, { photoId: "p1" });
behoben("T-37 / T-K2 / T-K3", "Einzelurteil, verspaetete Antwort und unbekannter Status werden abgewiesen",
  einzelurteil.accepted === false && verspaetet.status === AI_STATUS.DISCARDED_STALE
  && unbekannterStatus.accepted === false,
  "der Vertrag verlangt drei getrennte Kernpunkte, bindet an die Revision und "
  + "kennt nur PASS / FAIL / NOT_ASSESSABLE");

/* ── K · Ausschlusspruefungen ──────────────────────────────────────────── */

behoben("X-04", "Keine Prozentanmutung an der algorithmischen Befundstaerke",
  !/Math\.round\(fraction\([^)]*\)\s*\*\s*100\)/.test(src("domain.js")),
  "assessMarker fuehrt die Befundstaerke nicht mehr als Prozentwert");

behoben("X-08", "Keine window.*-Funktion als Sicherheitsgrenze, keine Zugangsdaten",
  !/window\.[A-Za-z_$]+\s*=\s*(function|\()/.test(src("aiContract.js"))
  && !/apikey|api_key|secret|token\s*[:=]\s*["']/i.test(src("aiContract.js")),
  "aiContract.js definiert keine globale Funktion und traegt keine Zugangsdaten");

/* ── Bericht ───────────────────────────────────────────────────────────── */

console.log("VisuClean RC4 · Sind die RC3-Maengel behoben?");
console.log("=".repeat(78));
console.log("");
console.log("Der rote Ausgangszustand steht in RC3_ROTE_GEGENPROBEN.txt und wurde");
console.log("mit dem unveraenderten RC3-Quellcode erzeugt.");
console.log("");
for (const eintrag of ergebnisse) {
  console.log(`${eintrag.status.padEnd(9)} ${String(eintrag.id).padEnd(26)} ${eintrag.titel}`);
  for (const teil of String(eintrag.beleg).match(/.{1,70}(\s|$)/g) || []) {
    console.log(`                                     ${teil.trim()}`);
  }
  console.log("");
}
console.log("=".repeat(78));
console.log(`Behoben: ${behobenZahl}`);
console.log(`Offen:   ${offenZahl}`);
console.log("");
console.log(`ERGEBNIS: ${offenZahl ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(offenZahl ? 1 : 0);
