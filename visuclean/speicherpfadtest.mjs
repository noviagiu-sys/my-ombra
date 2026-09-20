/* ─── RC4.2 · Der Speicherpfad, Ende zu Ende ───────────────────────────────
   Dieser Test existiert wegen eines konkreten Fehlers.

   In RC4.1 verschaerfte persistence.js den Datensatzvertrag auf Schema 3,
   waehrend App.jsx weiter einen RC3-Datensatz baute. Speichern war damit
   unmoeglich — die Kernfunktion der Anwendung. 268 Zusicherungen blieben
   trotzdem gruen, weil der einzige Test, der saveInspection aufruft, sein
   Objekt VON HAND baute. Eine Fixture bestaetigt, dass der Vertrag in sich
   stimmt. Sie sagt nichts darueber, ob die Anwendung ihn erfuellt.

   Aufgefallen ist es erst in der manuellen Browserpruefung.

   Dieser Test schliesst genau diese Luecke: er treibt den ECHTEN Erzeuger
   durch die ECHTEN Domaenenfunktionen in die ECHTE Persistenz. Driften die
   beiden Haelften erneut auseinander, faellt es hier auf und nicht erst im
   Browser.                                                                 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { recordDigest } from "./src/audit.js";
import { saveInspection, loadInspections } from "./src/persistence.js";
import { aggregateResults, deriveSystemDecision } from "./src/domain.js";
import { applyToleratedScratch, buildCheckpoints, CHECKPOINTS } from "./src/assessment.js";
import { CAPTURE_PATH, captureProfile, evaluateCaptureProfile } from "./src/decision.js";
import { LIFECYCLE_STATE } from "./src/lifecycle.js";
import { buildApprovalRecord, buildInspectionRecord, SIGNATURE_MEANING, deriveState, needsQaApproval, signInspection } from "./src/inspectionRecord.js";
import { mitFeuchteSequenz } from "./tests/feuchteSequenz.mjs";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}
async function rejectsWith(action, fragment) {
  try { await action(); return { rejected: false, message: "" }; }
  catch (error) {
    const message = String(error?.message || error);
    return { rejected: !fragment || message.includes(fragment), message };
  }
}

console.log("VisuClean RC4.2 · Speicherpfad Ende zu Ende\n");

/* ── Die echten Domaenenfunktionen, nicht nachgebaut ───────────────────── */

/* Merkmale einer unauffaelligen trockenen Flaeche. Die Werte laufen durch
   buildCheckpoints, also durch dieselbe Funktion wie im Produktpfad. */
const SAUBER = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
const URTEIL = { dry: { pass: true, code: "PASS" }, clean: { pass: true, code: "PASS" }, intact: { pass: true, code: "PASS" } };

function fotoErgebnis(features = SAUBER, verdicts = URTEIL) {
  return {
    dry: { ...verdicts.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...verdicts.clean, message: "", detail: "", severity: 0, action: "" },
    intact: { ...verdicts.intact, message: "", detail: "", severity: 0, action: "" },
    lm: features.lm, hints: [],
    checkpoints: buildCheckpoints(features, verdicts, mitFeuchteSequenz()),
  };
}

function foto(id, ergebnis) {
  return {
    id, image: "data:image/jpeg;base64,QUJD", annotatedImage: "data:image/jpeg;base64,QUJD",
    markers: [], markerAssessments: [], result: ergebnis, knownIssueInfo: null,
    captureProfile: captureProfile({
      processedWidth: 480, processedHeight: 640,
      sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
    }),
  };
}

const operator = { username: "operator1", role: "Operator", displayName: "Operator 1" };
const qa = { username: "qa_manager", role: "QA Manager", displayName: "QA Manager" };
const NOW = "2026-09-08T12:00:00.000Z";

function signatur(meaning, signedBy) {
  return {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning, signedAt: NOW, signedBy,
  };
}

async function mitHash(record) {
  const kopie = structuredClone(record);
  kopie.recordHash = await recordDigest(kopie);
  return kopie;
}

/** Baut einen Datensatz genau so, wie der Produktpfad es tut. */
async function datensatz({ id, actor, finalDecision = "PASS", retakes = [],
  approvedBy = null, performedBy = null, comment = "", overrideReason = null,
  features = SAUBER, verdicts = URTEIL } = {}) {
  const ergebnis = fotoErgebnis(features, verdicts);
  const fotos = [foto("photo-1", ergebnis)];
  const aggregate = aggregateResults(fotos.map(item => item.result));
  const systemDecision = deriveSystemDecision(aggregate);
  const state = deriveState({ finalDecision, hasDeviation: retakes.length > 0 });
  return mitHash(buildInspectionRecord({
    id, appVersion: "8.3.0-rc.4.2", now: NOW,
    user: actor, eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate, originalSystemDecision: systemDecision,
    finalDecision,
    performedBy: performedBy || { username: actor.username, role: actor.role, at: NOW },
    approvedBy,
    reauthenticated: true,
    comment, overrideReason,
    signature: signatur(SIGNATURE_MEANING[state], actor.username),
    retakes,
  }));
}

/* Ein WARTENDER Datensatz, so wie ihn die Uebergabe an die QA erzeugt.
   Seit rc.4.10 fuehrt JEDER QA-pflichtige Abschluss hierueber — es gibt
   keinen Sofortpfad mehr, der an der Inhaltsbindung vorbeikommt. */
async function wartend(id, { retakes = [], knownIssueAssignments = [],
  performer = operator, checkpointsOverride = null,
  verdicts = URTEIL, features = SAUBER } = {}) {
  const basis = fotoErgebnis(features, verdicts);
  const ergebnis = checkpointsOverride
    ? { ...basis, checkpoints: checkpointsOverride }
    : basis;
  const fotos = [foto("photo-1", ergebnis)];
  const aggregate = aggregateResults(fotos.map(item => item.result));
  return mitHash(buildInspectionRecord({
    id, appVersion: "8.3.0-rc.4.10", now: NOW,
    user: performer, eqId: "tp", eqName: "Tablettenpresse",
    zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate, originalSystemDecision: deriveSystemDecision(aggregate),
    awaitingQa: true,
    performedBy: { username: performer.username, role: performer.role, at: NOW },
    approvedBy: null, reauthenticated: true,
    signature: signatur(SIGNATURE_MEANING[LIFECYCLE_STATE.PENDING_QA], performer.username),
    retakes, knownIssueAssignments,
  }));
}

/** Die Freigabe darauf — ueber den ECHTEN Erzeuger. */
async function freigabeAuf(pendingId, approver, { decision = "PASS", id, kommentar = "" } = {}) {
  const bezug = (await loadInspections()).find(item => item.id === pendingId);
  return mitHash(buildApprovalRecord({
    pending: bezug, approver,
    signature: signatur("wird ueberschrieben", approver.username),
    now: NOW, decision, newId: id, appVersion: "8.3.0-rc.4.10",
    approvalComment: kommentar,
  }));
}

/* ── S1 · Der Normalfall: Operator speichert eine saubere Pruefung ─────── */

const normal = await datensatz({ id: "insp-normal", actor: operator });
ok("S1", "Der Datensatz aus dem echten Erzeuger traegt schemaVersion 3",
  normal.schemaVersion === 3 && normal.state === LIFECYCLE_STATE.FINAL_PASS,
  `schemaVersion=${normal.schemaVersion} state=${normal.state} finalDecision=${normal.finalDecision}`);

ok("S2", "Die Pruefpunkte stehen auf der obersten Ebene, vollstaendig",
  Array.isArray(normal.checkpoints)
  && normal.checkpoints.length === CHECKPOINTS.length
  && CHECKPOINTS.every(meta => normal.checkpoints.some(item => item.id === meta.id)),
  `${normal.checkpoints.length} Pruefpunkte: ${normal.checkpoints.map(c => c.id).join(", ")}`);

ok("S3", "Jedes Foto traegt ein vollstaendiges Aufnahmeprofil",
  normal.photos.every(item => item.captureProfile?.processedWidth > 0
    && item.captureProfile?.processedHeight > 0
    && Object.values(CAPTURE_PATH).includes(item.captureProfile.path)),
  `${normal.photos[0].captureProfile.processedWidth}x${normal.photos[0].captureProfile.processedHeight}, `
  + `Pfad ${normal.photos[0].captureProfile.path}`);

let gespeichert = false;
let speicherFehler = "";
try { await saveInspection(normal, operator); gespeichert = true; }
catch (error) { speicherFehler = String(error?.message || error); }
ok("S4", "Der echte Erzeuger wird von der echten Persistenz angenommen",
  gespeichert,
  gespeichert ? "gespeichert" : `ABGEWIESEN: ${speicherFehler}`);

ok("S5", "Der gespeicherte Datensatz laesst sich verlustfrei lesen",
  gespeichert && (await loadInspections()).some(item => item.id === "insp-normal"
    && item.schemaVersion === 3 && item.checkpoints.length === CHECKPOINTS.length));

/* ── S6 · Abweichung: Operator darf nicht mehr allein freigeben ───────── */

const RETAKE = {
  photoIdBefore: "photo-0", photoIdAfter: "photo-1", eqId: "tp", zoneId: "die",
  action: "RECLEANED", username: "operator1", role: "Operator", at: NOW,
  reason: "Sichtbarer Rueckstand nachgereinigt",
};

const nachReinigung = await datensatz({
  id: "insp-remediation", actor: operator, retakes: [RETAKE],
});
ok("S6", "Nach dokumentierter Nachreinigung wird der Zustand PASS_AFTER_REMEDIATION",
  nachReinigung.state === LIFECYCLE_STATE.PASS_AFTER_REMEDIATION
  && nachReinigung.qaTriggers.length === 1
  && needsQaApproval(nachReinigung.state),
  `state=${nachReinigung.state}, QA-Trigger: ${nachReinigung.qaTriggers.map(t => t.code).join(", ")}`);

const durchOperator = await rejectsWith(() => saveInspection(nachReinigung, operator), "QA");
ok("S7", "Ein Operator kann eine Pruefung mit Abweichung nicht abschliessen",
  durchOperator.rejected, durchOperator.message);

/* ── S8 · Vier-Augen: derselbe QA Manager darf nicht freigeben ──────────
   Der Kernpunkt der Entscheidung vom 2026-09-08 (Auslegung B). Genau der
   Fall, den die Browserpruefung als 3.5 nicht erreichen konnte, weil das
   Speichern vorher abbrach.                                              */

const wartendSelbst = await wartend("insp-self-pending", { retakes: [RETAKE], performer: qa });
await saveInspection(wartendSelbst, qa);
const selbstFreigabe = await freigabeAuf("insp-self-pending", qa, { id: "insp-self" });
const selbst = await rejectsWith(() => saveInspection(selbstFreigabe, qa), "Vier-Augen");
ok("S8", "Vier-Augen: derselbe QA Manager kann die eigene Pruefung nicht freigeben",
  selbst.rejected, selbst.message);

const wartendFremd = await wartend("insp-four-eyes-pending", { retakes: [RETAKE] });
await saveInspection(wartendFremd, operator);
const fremdFreigabe = await freigabeAuf("insp-four-eyes-pending", qa, { id: "insp-four-eyes" });
let vierAugenOk = false;
let vierAugenFehler = "";
try { await saveInspection(fremdFreigabe, qa); vierAugenOk = true; }
catch (error) { vierAugenFehler = String(error?.message || error); }
ok("S9", "Vier-Augen: Pruefung durch den Operator, Freigabe durch den QA Manager wird angenommen",
  vierAugenOk, vierAugenOk ? "gespeichert" : `ABGEWIESEN: ${vierAugenFehler}`);

const wartendAdmin = await wartend("insp-admin-pending", { retakes: [RETAKE] });
await saveInspection(wartendAdmin, operator);
const durchAdmin = await freigabeAuf("insp-admin-pending",
  { username: "admin", role: "Administrator", displayName: "Administrator" },
  { id: "insp-admin" });
const admin = await rejectsWith(
  () => saveInspection(durchAdmin, { username: "admin", role: "Administrator" }), "QA Manager");
ok("S10", "Ein Administrator ist kein QA Manager",
  admin.rejected, admin.message);

/* ── S11 · Die strukturelle Luecke selbst ──────────────────────────────
   Nicht der Datensatz, sondern die Verdrahtung: App.jsx muss den
   gemeinsamen Erzeuger benutzen und darf den Datensatz nicht mehr inline
   bauen. Genau das war in RC4.1 nicht der Fall.                          */

const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
ok("S11", "App.jsx benutzt den gemeinsamen Erzeuger statt eines eigenen Datensatzes",
  /signInspection/.test(appQuelle)
  && !/id:\s*newId\("inspection"\),\s*schema:\s*2/.test(appQuelle),
  "kein zweiter, abweichender Datensatzbau in der Oberflaeche");

ok("S12", "Die Oberflaeche kennt die getrennte QA-Genehmigung",
  /approvedBy/.test(appQuelle) && /needsQaApproval/.test(appQuelle),
  "performedBy und approvedBy sind zwei Handlungen, nicht eine");

/* ── S13/S14 · Elektronische Signatur statt Zeichnung ──────────────────
   Part 11 §11.200 verlangt zwei Identifikationskomponenten. Eine
   gezeichnete Unterschrift ist weder gefordert noch ausreichend — sie
   belegt nur, dass jemand den Finger bewegt hat. Im Reinraum mit
   Handschuhen ist sie ausserdem nicht reproduzierbar.                    */

const eineKomponente = await mitHash({
  ...(await datensatz({ id: "insp-one-component", actor: operator })),
  id: "insp-one-component",
  signature: { method: "USER_ID_PASSWORD", components: ["userId"],
    meaning: "Freigabe", signedAt: NOW, signedBy: operator.username },
});
const einzeln = await rejectsWith(() => saveInspection(eineKomponente, operator), "Signatur");
ok("S13", "Eine Signatur mit nur einer Identifikationskomponente wird abgewiesen",
  einzeln.rejected, einzeln.message);

const nurZeichnung = await mitHash({
  ...(await datensatz({ id: "insp-drawing-only", actor: operator })),
  id: "insp-drawing-only",
  signature: { image: "data:image/png;base64,AA==", pathLength: 42,
    meaning: "Freigabe", signedAt: NOW, signedBy: operator.username },
});
const zeichnung = await rejectsWith(() => saveInspection(nurZeichnung, operator), "Signatur");
ok("S14", "Eine blosse Zeichnung ist keine gueltige elektronische Signatur",
  zeichnung.rejected, zeichnung.message);

/* ── S15/S16 · Eine Zeitquelle ────────────────────────────────────────
   In 8.3.0-rc.4.4 las `finalize` die Uhr fuer die Signatur und
   `buildInspectionRecord` ein zweites Mal fuer den Datensatz. Millisekunden
   dazwischen — und die Invariante `signature.signedAt === record.signedAt`
   blockierte jedes Speichern. Gefunden in der Browserpruefung, nicht hier:
   dieser Test uebergab beiden Seiten denselben festen NOW und konnte die
   Divergenz gar nicht sehen.

   S15 prueft jetzt die Bindung an der Funktion, die sie herstellt.
   S16 prueft, dass in der Oberflaeche keine zweite Uhrablesung
   dazwischenkommen kann.                                                 */

const gebunden = await mitHash(signInspection({
  id: "insp-timestamp", appVersion: "8.3.0-rc.4.5", now: NOW, signedBy: operator.username,
  user: operator, eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: [foto("photo-1", fotoErgebnis())],
  aggregate: aggregateResults([fotoErgebnis()]),
  originalSystemDecision: deriveSystemDecision(aggregateResults([fotoErgebnis()])),
  finalDecision: "PASS",
  performedBy: { username: operator.username, role: operator.role, at: NOW },
  reauthenticated: true,
  signature: { method: "USER_ID_PASSWORD", components: ["userId", "password"], meaning: "Freigabe" },
}));
let zeitOk = false;
let zeitFehler = "";
try { await saveInspection(gebunden, operator); zeitOk = true; }
catch (error) { zeitFehler = String(error?.message || error); }
ok("S15", "Signatur-Zeitstempel und Datensatz-Zeitstempel stammen aus einer Quelle",
  gebunden.signature.signedAt === gebunden.signedAt && zeitOk,
  zeitOk
    ? `signedAt ${gebunden.signedAt} in Signatur und Datensatz identisch`
    : `ABGEWIESEN: ${zeitFehler}`);

const appQuelleZeit = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const bauBlock = appQuelleZeit.slice(
  appQuelleZeit.indexOf("const baueDatensatz"),
  appQuelleZeit.indexOf("const schreibe"));
ok("S16", "Der Datensatzbau in der Oberflaeche liest die Uhr nicht selbst",
  !/new Date\(\)/.test(bauBlock) && /signInspection/.test(bauBlock),
  "baueDatensatz bekommt now uebergeben und reicht es an signInspection durch");

/* ── S17/S18 · Known-Issue-Toleranz ohne QA-Zuordnung ──────────────────

   Befund der Gegenpruefung an …mehrwinkel.2/.3: `applyToleratedScratch`
   macht aus einem Kratzer-FAIL ein PASS (code KNOWN_ISSUE_TOLERATED), aber
   `App.jsx` reicht keine `knownIssueAssignments` weiter. Damit sieht
   `collectQaTriggers` eine leere Liste, es entsteht kein
   KNOWN_ISSUE_ACTIVE, und die Pruefung kann als FINAL_PASS abgeschlossen
   werden — die QA erfaehrt nichts davon.

   Die vorhandenen Tests konnten das nicht sehen: sie pruefen die Regel in
   `decision.js` (dort stimmt sie) und nie den Weg von der Oberflaeche bis
   zur Speichergrenze.

   S17 setzt an der Speichergrenze an, nicht in der Oberflaeche. Eine
   Toleranz ohne Zuordnung darf gar nicht erst speicherbar sein — dann
   traegt die Sperre auch, wenn spaeter jemand die Oberflaeche umbaut.   */

const toleriertePunkte = applyToleratedScratch(
  buildCheckpoints(SAUBER, URTEIL, mitFeuchteSequenz()).map(c =>
    c.id === "scratch" ? { ...c, status: "FAIL", code: "SCRATCH_DETECTED_ORIGIN_UNDETERMINED" } : c),
  { status: "unveraendert", matchedZones: 1 });

const tolerierterPunkt = toleriertePunkte.find(c => c.id === "scratch");

async function toleranzDatensatz(id, knownIssueAssignments, approvedBy = null, actor = operator) {
  const ergebnis = { ...fotoErgebnis(), checkpoints: toleriertePunkte };
  const fotos = [foto("photo-1", ergebnis)];
  const aggregate = aggregateResults(fotos.map(item => item.result));
  /* Wie im Produktpfad: eine QA-Zuordnung IST eine Abweichung, also aendert
     sich der Zustand und mit ihm die passende Signaturbedeutung. */
  const state = deriveState({
    finalDecision: "PASS", hasDeviation: knownIssueAssignments.length > 0,
  });
  return mitHash(buildInspectionRecord({
    id, appVersion: "8.3.0-rc.4.7", now: NOW,
    user: actor, eqId: "tp", eqName: "Tablettenpresse",
    zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate, originalSystemDecision: deriveSystemDecision(aggregate),
    finalDecision: "PASS",
    performedBy: { username: operator.username, role: operator.role, at: NOW },
    approvedBy, reauthenticated: true, comment: "", overrideReason: null,
    signature: signatur(SIGNATURE_MEANING[state], actor.username),
    retakes: [], knownIssueAssignments,
  }));
}

const ohneZuordnung = await toleranzDatensatz("insp-ki-ohne", []);
/* Seit rc.4.11 erzeugt eine unbestaetigte Toleranz selbst einen QA-Trigger.
   Der Abschluss ist damit QA-pflichtig und scheitert entweder an der
   Toleranzsperre oder am fehlenden Revisionsbezug — beides ist dieselbe
   Zusage: ohne QA kommt dieser Datensatz nicht in den Endzustand. */
const abgewiesen = await rejectsWith(
  () => saveInspection(ohneZuordnung, operator), null);

ok("S17", "Tolerierter Kratzer ohne QA-Zuordnung ist nicht speicherbar",
  tolerierterPunkt?.code === "KNOWN_ISSUE_TOLERATED" && abgewiesen.rejected,
  tolerierterPunkt?.code !== "KNOWN_ISSUE_TOLERATED"
    ? "Vorbedingung fehlt: der Punkt wurde gar nicht toleriert"
    : (abgewiesen.rejected
      ? `abgewiesen: ${abgewiesen.message}`
      : `ANGENOMMEN — state=${ohneZuordnung.state}, qaTriggers=${ohneZuordnung.qaTriggers.length}`));

const ZUORDNUNG = [{
  issueId: "issue-1", zoneId: "die", username: "qa_manager", role: "QA Manager",
  at: NOW, reason: "Bekannte kosmetische Riefe, unveraendert - QA-toleriert",
}];
const wartendKi = await wartend("insp-ki-pending", {
  knownIssueAssignments: ZUORDNUNG, checkpointsOverride: toleriertePunkte,
});
await saveInspection(wartendKi, operator);
const mitZuordnung = await freigabeAuf("insp-ki-pending", qa, { id: "insp-ki-mit" });
let mitOk = false; let mitFehler = "";
try { await saveInspection(mitZuordnung, qa); mitOk = true; }
catch (error) { mitFehler = String(error?.message || error); }

ok("S18", "Mit QA-Zuordnung und QA-Freigabe ist derselbe Datensatz speicherbar und traegt den QA-Trigger",
  mitOk && mitZuordnung.qaTriggers.some(t => t.code === "KNOWN_ISSUE_ACTIVE"),
  mitOk
    ? `qaTriggers: ${mitZuordnung.qaTriggers.map(t => t.code).join(", ") || "keine"} · state=${mitZuordnung.state}`
    : `ABGEWIESEN: ${mitFehler}`);

const appQuelleKi = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
ok("S19", "Die Oberflaeche reicht knownIssueAssignments an den Erzeuger durch",
  /knownIssueAssignments/.test(appQuelleKi),
  "sonst entsteht die Toleranz in der Anzeige, aber kein QA-Trigger im Datensatz");

/* ── S20-S24 · Nachgereichte QA-Freigabe mit echter Revisionsbindung ────

   Befund der Gegenpruefung: `revisionHash` und `approvalRevisionHash` wurden
   nie gesetzt, und `lifecycle.js` prueft die Bindung nur, wenn beide Werte
   vorhanden sind — die behauptete Bindung war also nie aktiv.

   Zugleich war PENDING_QA zwar als Zustand vorhanden, aber nicht
   speicherbar (persistence liess nur Endzustaende zu). Ohne anwesenden
   QA Manager liess sich eine Pruefung mit Abweichung gar nicht erfassen —
   der Druck, Konten zu teilen, entsteht genau dort.

   Entscheidung des Auftraggebers: Auslegung B bleibt, PENDING_QA wird
   speicherbar, die Freigabe kommt spaeter von einem ANDEREN Benutzer mit
   Rolle QA Manager, mit Re-Auth und Signatur auf den exakten Revisionshash.

   Append-only bleibt gewahrt: die Freigabe ueberschreibt den Pruefdatensatz
   nicht, sondern ist ein EIGENER Datensatz, der auf dessen recordHash
   zeigt.                                                                 */

async function pendingDatensatz(id) {
  const ergebnis = fotoErgebnis();
  const fotos = [foto("photo-1", ergebnis)];
  const aggregate = aggregateResults(fotos.map(item => item.result));
  return mitHash(buildInspectionRecord({
    id, appVersion: "8.3.0-rc.4.7", now: NOW,
    user: operator, eqId: "tp", eqName: "Tablettenpresse",
    zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate, originalSystemDecision: deriveSystemDecision(aggregate),
    awaitingQa: true,
    performedBy: { username: operator.username, role: operator.role, at: NOW },
    approvedBy: null, reauthenticated: true,
    signature: signatur(SIGNATURE_MEANING[LIFECYCLE_STATE.PENDING_QA], operator.username),
    retakes: [RETAKE],
  }));
}

const wartendA = await pendingDatensatz("insp-pending");
let wartendOk = false; let wartendFehler = "";
try { await saveInspection(wartendA, operator); wartendOk = true; }
catch (error) { wartendFehler = String(error?.message || error); }

ok("S20", "Der Operator kann eine Pruefung ohne anwesende QA als PENDING_QA erfassen",
  wartendOk && wartendA.state === LIFECYCLE_STATE.PENDING_QA,
  wartendOk ? `state=${wartendA.state}` : `ABGEWIESEN: ${wartendFehler}`);

ok("S21", "Ein wartender Datensatz traegt kein Ergebnis und keinen Genehmiger",
  wartendA.finalDecision === null && wartendA.approvedBy === null,
  `finalDecision=${JSON.stringify(wartendA.finalDecision)} approvedBy=${JSON.stringify(wartendA.approvedBy)}`);

async function freigabeDatensatz(id, revisionHash, approver = qa) {
  const ergebnis = fotoErgebnis();
  const fotos = [foto("photo-1", ergebnis)];
  const aggregate = aggregateResults(fotos.map(item => item.result));
  return mitHash(buildInspectionRecord({
    id, appVersion: "8.3.0-rc.4.7", now: NOW,
    user: approver, eqId: "tp", eqName: "Tablettenpresse",
    zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate, originalSystemDecision: deriveSystemDecision(aggregate),
    finalDecision: "PASS",
    performedBy: { username: operator.username, role: operator.role, at: NOW },
    approvedBy: { username: approver.username, role: approver.role, at: NOW },
    approvalRevisionHash: revisionHash,
    supersedesId: "insp-pending",
    reauthenticated: true,
    signature: signatur(SIGNATURE_MEANING[LIFECYCLE_STATE.PASS_AFTER_REMEDIATION], approver.username),
    retakes: [RETAKE],
  }));
}

const freigabe = await freigabeDatensatz("insp-freigabe", wartendA.recordHash);
let freigabeOk = false; let freigabeFehler = "";
try { await saveInspection(freigabe, qa); freigabeOk = true; }
catch (error) { freigabeFehler = String(error?.message || error); }

ok("S22", "Die nachgereichte Freigabe auf den exakten Revisionshash wird angenommen",
  freigabeOk && freigabe.approvalRevisionHash === wartendA.recordHash,
  freigabeOk ? `gebunden an ${String(freigabe.approvalRevisionHash).slice(0, 16)}…`
    : `ABGEWIESEN: ${freigabeFehler}`);

const falscheRevision = await freigabeDatensatz("insp-falsch", "0".repeat(64));
const falsch = await rejectsWith(() => saveInspection(falscheRevision, qa), "Revision");
ok("S23", "Eine Freigabe auf eine andere Revision wird abgewiesen",
  falsch.rejected, falsch.message || "ANGENOMMEN — die Bindung greift nicht");

/* Eigener wartender Datensatz: `insp-pending` ist durch S22 bereits
   freigegeben, und die Einmal-Regel wuerde vor der Vier-Augen-Pruefung
   greifen — der Test wuerde dann das Falsche belegen. */
const wartend3 = await pendingDatensatz("insp-pending-3");
await saveInspection(wartend3, operator);
const selbstNachgereicht = await mitHash({
  ...(await freigabeDatensatz("insp-selbst", wartend3.recordHash,
    { username: "operator1", role: "QA Manager", displayName: "Operator als QA" })),
  supersedesId: "insp-pending-3",
});
const selbstNach = await rejectsWith(
  () => saveInspection(selbstNachgereicht, { username: "operator1", role: "QA Manager" }),
  "Vier-Augen");
ok("S24", "Auch auf dem nachgereichten Weg gilt Vier-Augen",
  selbstNach.rejected, selbstNach.message || "ANGENOMMEN — Vier-Augen umgangen");

/* ── S25-S27 · Aufnahmeprofil erfassen, ohne zu sperren ─────────────────

   Befund der Gegenpruefung: `evaluateCaptureProfile` hatte im gesamten
   Anwendungspfad KEINE Aufrufstelle. Das dokumentierte Tor
   "NOT_MEASURED → weder PASS noch FAIL" existierte praktisch nicht, und
   Handyfotos wurden auf 640 px verkleinert und trotzdem bewertet.

   Entscheidung des Auftraggebers fuer die Testphase: erfassen und anzeigen,
   aber NICHT sperren. Sichtbar als NOT_MEASURED, mit Verkleinerungsfaktor
   sowie Quell- und Analyseaufloesung, ohne Genauigkeitsbehauptung. Ob
   bestimmte Profile spaeter sperren, wird vor einer produktiven Freigabe
   getrennt entschieden.                                                  */

const profil = captureProfile({
  processedWidth: 480, processedHeight: 640,
  sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
});

ok("S25", "Das Aufnahmeprofil traegt den Verkleinerungsfaktor",
  Number.isFinite(profil.scaleFactor) && Math.abs(profil.scaleFactor - 0.25) < 1e-9,
  `scaleFactor=${profil.scaleFactor} (480/1920) · Quelle ${profil.sourceWidth}x${profil.sourceHeight} `
  + `· Analyse ${profil.processedWidth}x${profil.processedHeight}`);

const bewertung = evaluateCaptureProfile(profil);
ok("S26", "Der Profilstatus wird im Datensatz mitgefuehrt und lautet NOT_MEASURED",
  bewertung.status === "NOT_MEASURED"
  && normal.photos.every(item => item.captureProfileStatus?.status === "NOT_MEASURED"),
  `Bewertung ${bewertung.status} · im Datensatz `
  + `${normal.photos.map(item => item.captureProfileStatus?.status ?? "FEHLT").join(", ")}`);

ok("S27", "NOT_MEASURED sperrt in der Testphase NICHT",
  gespeichert && normal.state === LIFECYCLE_STATE.FINAL_PASS,
  "der Datensatz mit nicht gemessenem Profil wurde angenommen und traegt ein Ergebnis");

/* ── S28 · Die Mehrwinkelauswertung ist nachvollziehbar ─────────────────

   Befund der Gegenpruefung: Fusionsergebnis, ausgeschlossene Bilder,
   poseSpread und NO_DETECTOR wurden angezeigt, aber nirgends gespeichert.
   Was der Pruefer am Bildschirm sah, war spaeter nicht mehr belegbar.    */

const mitFusion = await mitHash(buildInspectionRecord({
  id: "insp-fusion", appVersion: "8.3.0-rc.4.7", now: NOW,
  user: operator, eqId: "tp", eqName: "Tablettenpresse",
  zoneId: "die", zoneName: "Matrizenteller",
  photos: [foto("photo-1", fotoErgebnis())],
  aggregate: aggregateResults([fotoErgebnis()]),
  originalSystemDecision: deriveSystemDecision(aggregateResults([fotoErgebnis()])),
  finalDecision: "PASS",
  performedBy: { username: operator.username, role: operator.role, at: NOW },
  reauthenticated: true,
  signature: signatur(SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_PASS], operator.username),
  fusionSummary: {
    status: "NO_DETECTOR", usedCount: 2, poseSpread: 0.19, meaningful: true,
    excluded: [{ sequenceIndex: 2, reason: "LABEL_NOT_DETECTED" }],
  },
}));

ok("S28", "Das Fusionsergebnis steht im Datensatz, nicht nur auf dem Bildschirm",
  mitFusion.fusionSummary?.status === "NO_DETECTOR"
  && mitFusion.fusionSummary.excluded?.[0]?.reason === "LABEL_NOT_DETECTED"
  && mitFusion.fusionSummary.poseSpread === 0.19
  && normal.fusionSummary === null,
  `status=${mitFusion.fusionSummary?.status ?? "FEHLT"} `
  + `ausgeschlossen=${mitFusion.fusionSummary?.excluded?.length ?? "-"} `
  + `· ohne Fusion: ${JSON.stringify(normal.fusionSummary)}`);

/* ── S29-S31 · Die Freigabe muss den INHALT binden, nicht nur den Hash ──

   Befund der Gegenpruefung an rc.4.7, reproduziert: eine Freigabe konnte
   auf den richtigen recordHash verweisen und trotzdem Equipment, Zone,
   Fotos und Befunde austauschen — der Prueferhash band nur sich selbst.
   Und derselbe wartende Datensatz liess sich mehrfach freigeben.

   Beides wird an der Speichergrenze gesperrt.                            */

const wartend2 = await pendingDatensatz("insp-pending-2");
await saveInspection(wartend2, operator);

/* (a) Inhalt vertauscht, Hash korrekt */
/* In sich vollstaendig stimmig — auch der Retake zeigt auf ct/drum.
   Bestehende Invarianten greifen hier nicht; nur eine Bindung an den
   INHALT der wartenden Revision kann das abweisen. */
const vertauscht = await mitHash({
  ...(await freigabeDatensatz("insp-vertauscht", wartend2.recordHash)),
  eqId: "ct", eqName: "Coater", zoneId: "drum", zoneName: "Trommelinnenwand",
  retakes: [{ ...RETAKE, eqId: "ct", zoneId: "drum" }],
  supersedesId: "insp-pending-2",
});
const inhalt = await rejectsWith(() => saveInspection(vertauscht, qa), "Inhalt");
ok("S29", "Eine Freigabe darf den Inhalt der wartenden Revision nicht austauschen",
  inhalt.rejected, inhalt.message || "ANGENOMMEN — Equipment/Zone frei austauschbar");

/* (b) genau eine wirksame Freigabe je wartender Revision */
const ersteFreigabe = await mitHash({
  ...(await freigabeDatensatz("insp-freigabe-a", wartend2.recordHash)),
  supersedesId: "insp-pending-2",
});
let ersteOk = false; let ersterFehler = "";
try { await saveInspection(ersteFreigabe, qa); ersteOk = true; }
catch (error) { ersterFehler = String(error?.message || error); }
ok("S30", "Die erste Freigabe einer wartenden Revision wird angenommen",
  ersteOk, ersteOk ? "gespeichert" : `ABGEWIESEN: ${ersterFehler}`);

const zweiteFreigabe = await mitHash({
  ...(await freigabeDatensatz("insp-freigabe-b", wartend2.recordHash)),
  supersedesId: "insp-pending-2",
});
const zweite = await rejectsWith(() => saveInspection(zweiteFreigabe, qa), "bereits");
ok("S31", "Eine zweite Freigabe derselben wartenden Revision wird abgewiesen",
  zweite.rejected, zweite.message || "ANGENOMMEN — Mehrfachfreigabe moeglich");

/* S49 · Die Abweisung darf keine Freigabe behaupten.
   Befund aus dem Bedienlauf vom 11.09.2026: der bestehende Entscheid war
   eine SPERRUNG, die Meldung sagte "bereits freigegeben ... eine zweite
   Freigabe ist nicht zulaessig". Dieselbe Unwahrheit, die im PDF ueber
   einer Sperrung "Freigabe zu" schrieb — dort behoben, hier stehen
   geblieben. Die Meldung gilt fuer JEDEN QA-Entscheid und muss deshalb
   neutral sein. */
/* Die Datensatz-ID steht in Klammern in der Meldung und ist ein
   TESTDATUM, keine Formulierung. Sie wird vor der Pruefung entfernt -
   sonst misst der Test den Namen der Vorrichtung statt der Aussage.
   Genau dieser Fehler steckte im ersten Entwurf von S49. */
const s49Text = String(zweite.message || "").replace(/\([^)]*\)/g, "");
const s49Behauptet = /[Ff]reigabe|freigegeben/.test(s49Text);
ok("S49", "Die Abweisung eines zweiten Entscheids behauptet keine Freigabe",
  zweite.rejected && !s49Behauptet,
  s49Behauptet
    ? `behauptet eine Freigabe: "${s49Text.trim()}"`
    : "neutral formuliert");

/* ── S32/S33 · Kanonische Freigabeprojektion ───────────────────────────

   Befund der Gegenpruefung an rc.4.8, reproduziert: die Bindung verglich
   eine VON HAND gepflegte Liste von 19 Feldern. `aiCrosscheck` und
   `scratchFindings` fehlten darin — ein offener KI-Widerspruch und ein
   dokumentierter Kratzerbefund konnten zwischen Pruefung und Freigabe
   verschwinden.

   Eine Feldliste driftet immer: jedes neue Feld ist ungeschuetzt, bis
   jemand daran denkt. Die Bindung wird deshalb UMGEDREHT — nicht "diese
   Felder muessen gleich sein", sondern "nur DIESE duerfen sich aendern,
   alles andere muss identisch sein". Ein spaeter hinzugefuegtes Feld ist
   damit automatisch geschuetzt.                                          */

const wartend4 = await mitHash({
  ...(await pendingDatensatz("insp-pending-4")),
  aiCrosscheck: {
    enabled: true, status: "conflict", unresolvedConflicts: 1,
    adapterVersion: "1.0", modelName: "test", modelVersion: "1",
  },
  scratchFindings: [{
    id: "sc-1", status: "SCRATCH_DETECTED_ORIGIN_UNDETERMINED",
    depthStatus: "NOT_MEASURED", depthValue: null,
  }],
});
await saveInspection(wartend4, operator);

const ohneKi = await mitHash({
  ...(await freigabeDatensatz("insp-ohne-ki", wartend4.recordHash)),
  aiCrosscheck: { ...wartend4.aiCrosscheck, status: "clear", unresolvedConflicts: 0 },
  scratchFindings: wartend4.scratchFindings,
  supersedesId: "insp-pending-4",
});
const kiWeg = await rejectsWith(() => saveInspection(ohneKi, qa), "Inhalt");
ok("S32", "Ein offener KI-Widerspruch kann nicht zwischen Pruefung und Freigabe verschwinden",
  kiWeg.rejected, kiWeg.message || "ANGENOMMEN — unresolvedConflicts frei aenderbar");

/* Eigener wartender Datensatz — sonst greift die Einmal-Regel vor der
   Inhaltspruefung und der Test belegte das Falsche. */
const wartend5 = await mitHash({
  ...(await pendingDatensatz("insp-pending-5")),
  aiCrosscheck: wartend4.aiCrosscheck,
  scratchFindings: wartend4.scratchFindings,
});
await saveInspection(wartend5, operator);

const ohneKratzer = await mitHash({
  ...(await freigabeDatensatz("insp-ohne-kratzer", wartend5.recordHash)),
  aiCrosscheck: wartend5.aiCrosscheck,
  scratchFindings: [],
  supersedesId: "insp-pending-5",
});
const kratzerWeg = await rejectsWith(() => saveInspection(ohneKratzer, qa), "Inhalt");
ok("S33", "Ein dokumentierter Kratzerbefund kann nicht bei der Freigabe entfallen",
  kratzerWeg.rejected, kratzerWeg.message || "ANGENOMMEN — scratchFindings frei entfernbar");

/* ── S34-S38 · Der nachgereichte Weg, Ende zu Ende ──────────────────────

   Befund der Gegenpruefung an rc.4.8: U14/U15 belegen nur, dass ein Knopf
   gerendert wird. Klick, Re-Auth, Signatur, Speicherung der
   Freigaberevision, Neuladen und die Sperre der zweiten Freigabe waren
   automatisiert unbelegt.

   Dieser Ablauf faehrt den ECHTEN Erzeuger `buildApprovalRecord` — genau
   den, den `App.jsx` aufruft — durch die ECHTE Persistenz, mit einem
   Neuladen aus der Datenbank dazwischen.

   Was er NICHT ersetzt: den Klickpfad im Browser. Das bleibt der manuelle
   Handytest.                                                             */

const abl = await pendingDatensatz("insp-ablauf");
await saveInspection(abl, operator);

/* Neuladen — wie nach App-Neustart: der Datensatz kommt aus der Datenbank,
   nicht aus dem Arbeitsspeicher. */
const nachNeustart = (await loadInspections()).find(item => item.id === "insp-ablauf");
ok("S34", "Nach dem Neuladen liegt der wartende Datensatz vollstaendig vor",
  nachNeustart?.state === LIFECYCLE_STATE.PENDING_QA
  && nachNeustart.finalDecision === null
  && typeof nachNeustart.recordHash === "string",
  `state=${nachNeustart?.state} finalDecision=${JSON.stringify(nachNeustart?.finalDecision)}`);

const freigabeRevision = await mitHash(buildApprovalRecord({
  pending: nachNeustart, approver: qa,
  signature: signatur("wird ueberschrieben", qa.username),
  now: NOW, decision: "PASS", newId: "insp-ablauf-frei", appVersion: "8.3.0-rc.4.9",
}));
let ablaufOk = false; let ablaufFehler = "";
try { await saveInspection(freigabeRevision, qa); ablaufOk = true; }
catch (error) { ablaufFehler = String(error?.message || error); }

ok("S35", "Der echte Freigabe-Erzeuger wird von der Speichergrenze angenommen",
  ablaufOk && freigabeRevision.supersedesId === "insp-ablauf"
  && freigabeRevision.approvalRevisionHash === nachNeustart.recordHash,
  ablaufOk ? `state=${freigabeRevision.state} gebunden an ${String(freigabeRevision.approvalRevisionHash).slice(0, 16)}…`
    : `ABGEWIESEN: ${ablaufFehler}`);

const nachFreigabe = await loadInspections();
const wartendDanach = nachFreigabe.find(item => item.id === "insp-ablauf");
ok("S36", "Der wartende Datensatz bleibt unveraendert (append-only)",
  wartendDanach?.recordHash === nachNeustart.recordHash
  && wartendDanach.state === LIFECYCLE_STATE.PENDING_QA
  && wartendDanach.approvedBy === null,
  `recordHash unveraendert: ${wartendDanach?.recordHash === nachNeustart.recordHash}`);

const zweiteRevision = await mitHash(buildApprovalRecord({
  pending: nachNeustart, approver: qa,
  signature: signatur("wird ueberschrieben", qa.username),
  now: NOW, decision: "PASS", newId: "insp-ablauf-frei-2", appVersion: "8.3.0-rc.4.9",
}));
const zweiteAbgewiesen = await rejectsWith(() => saveInspection(zweiteRevision, qa), "bereits ein QA-Entscheid");
ok("S37", "Eine zweite Freigabe wird auch nach dem Neuladen abgewiesen",
  zweiteAbgewiesen.rejected, zweiteAbgewiesen.message || "ANGENOMMEN");

/* Die QA muss auch NEGATIV abschliessen koennen. */
const ablFail = await pendingDatensatz("insp-ablauf-fail");
await saveInspection(ablFail, operator);
const gesperrt = await mitHash(buildApprovalRecord({
  pending: (await loadInspections()).find(item => item.id === "insp-ablauf-fail"),
  approver: qa, signature: signatur("wird ueberschrieben", qa.username),
  now: NOW, decision: "FAIL", newId: "insp-ablauf-fail-frei", appVersion: "8.3.0-rc.4.9",
  approvalComment: "Bei der Nachpruefung Rueckstand bestaetigt - gesperrt.",
}));
let failOk = false; let failFehler = "";
try { await saveInspection(gesperrt, qa); failOk = true; }
catch (error) { failFehler = String(error?.message || error); }
ok("S38", "Die QA kann einen wartenden Vorgang auch als FINAL_FAIL abschliessen",
  failOk && gesperrt.state === LIFECYCLE_STATE.FINAL_FAIL && gesperrt.finalDecision === "FAIL",
  failOk ? `state=${gesperrt.state} finalDecision=${gesperrt.finalDecision}`
    : `ABGEWIESEN: ${failFehler}`);

/* ── S39-S42 · Die vier Befunde der vierten Gegenpruefung ───────────────

   S39: Die Inhaltspruefung lief NUR bei vorhandenem supersedesId. Wer den
        Bezug auf null setzte, umging sie vollstaendig — ein QA-pflichtiger
        Abschluss war damit frei erfindbar.
   S40: Ein Operator konnte einen wartenden Vorgang endgueltig SPERREN; die
        Rollen- und Vier-Augen-Pruefung erfasste nur positive Abschluesse.
   S41: dasselbe fuer einen Administrator.
   S42: Die ausdrueckliche Uebergabe an die QA speicherte bei FAIL
        FINAL_FAIL statt PENDING_QA.                                      */

const ohneBezug = await mitHash({
  ...(await freigabeDatensatz("insp-ohne-bezug", "0".repeat(64))),
  eqName: "Frei erfundene Anlage",
  supersedesId: null, approvalRevisionHash: null,
});
const bezugFehlt = await rejectsWith(() => saveInspection(ohneBezug, qa), "Revisionsbezug");
ok("S39", "Ein QA-pflichtiger Abschluss ohne Revisionsbezug wird abgewiesen",
  bezugFehlt.rejected,
  bezugFehlt.message || "ANGENOMMEN — die Inhaltsbindung ist umgehbar");

const wartendSperre = await pendingDatensatz("insp-sperre");
await saveInspection(wartendSperre, operator);
const geladen = (await loadInspections()).find(item => item.id === "insp-sperre");

const durchOperatorGesperrt = await mitHash(buildApprovalRecord({
  pending: geladen, approver: operator,
  signature: signatur("wird ueberschrieben", operator.username),
  now: NOW, decision: "FAIL", newId: "insp-sperre-op", appVersion: "8.3.0-rc.4.9",
  approvalComment: "Operator versucht zu sperren",
}));
const opGesperrt = await rejectsWith(
  () => saveInspection(durchOperatorGesperrt, operator), "QA");
ok("S40", "Ein Operator kann einen wartenden Vorgang nicht endgueltig sperren",
  opGesperrt.rejected, opGesperrt.message || "ANGENOMMEN — Operator sperrt endgueltig");

const wartendSperre2 = await pendingDatensatz("insp-sperre-2");
await saveInspection(wartendSperre2, operator);
const geladen2 = (await loadInspections()).find(item => item.id === "insp-sperre-2");
const adminNutzer = { username: "admin", role: "Administrator", displayName: "Administrator" };
const durchAdminGesperrt = await mitHash(buildApprovalRecord({
  pending: geladen2, approver: adminNutzer,
  signature: signatur("wird ueberschrieben", adminNutzer.username),
  now: NOW, decision: "FAIL", newId: "insp-sperre-admin", appVersion: "8.3.0-rc.4.9",
  approvalComment: "Administrator versucht zu sperren",
}));
const adminGesperrt = await rejectsWith(
  () => saveInspection(durchAdminGesperrt, adminNutzer), "QA");
ok("S41", "Ein Administrator kann einen wartenden Vorgang nicht endgueltig sperren",
  adminGesperrt.rejected, adminGesperrt.message || "ANGENOMMEN — Administrator sperrt endgueltig");

/* Die ausdrueckliche Uebergabe muss IMMER PENDING_QA erzeugen — auch wenn
   der aktuelle Befund FAIL lautet. `deriveState` kann das bereits; der
   Fehler sass in der BEDINGUNG der Oberflaeche, die die Uebergabe
   zusaetzlich von needsQaApproval abhaengig machte. Bei FAIL liefert das
   false, und der Pruefer schloss allein ab. */
const appQuelleUebergabe = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
/* `spaeterFreigeben` muss HINREICHEND sein — als erster Operand einer
   ODER-Bedingung oder allein. Eine UND-Verknuepfung mit needsQaApproval
   macht die Uebergabe bei FAIL wirkungslos. */
const uebergabeUnabhaengig =
  !/needsQaApproval\([^)]*\)\s*&&\s*spaeterFreigeben/.test(appQuelleUebergabe)
  && !/spaeterFreigeben\s*&&\s*needsQaApproval/.test(appQuelleUebergabe)
  && /if \(spaeterFreigeben(\s*\|\||\))/.test(appQuelleUebergabe);
ok("S42", "Die Uebergabe an die QA haengt nicht an needsQaApproval",
  uebergabeUnabhaengig && deriveState({
    finalDecision: "FAIL", hasDeviation: false, awaitingQa: true,
  }) === LIFECYCLE_STATE.PENDING_QA,
  uebergabeUnabhaengig
    ? "ausdrueckliche Uebergabe erzeugt PENDING_QA, auch bei FAIL"
    : "die Uebergabe ist noch an needsQaApproval gekoppelt");

/* ── S43-S47 · Die Befunde der fuenften Gegenpruefung ───────────────────

   S43: Die Rollensperre vertraute dem BEHAUPTETEN Vorgaengerzustand. Wer
        previousState auf "DRAFT" setzte, umging sie — der referenzierte
        Datensatz stand weiter auf PENDING_QA.
   S44: Ein QA Manager konnte seine EIGENE wartende Pruefung sperren; die
        Vier-Augen-Regel griff nur bei positiven Abschluessen.
   S45: Ein fachlich zulaessiger Override war nicht erreichbar — die
        allgemeine Sperre behandelte ein BESTAETIGTES FAIL wie einen
        offenen Punkt und beendete die Pruefung vor der Override-Regel.
   S46/S47: Known-Issue-Sackgasse — der Operator konnte einen tolerierten
        Befund weder abschliessen noch uebergeben.                        */

const wartendLuege = await pendingDatensatz("insp-luege");
await saveInspection(wartendLuege, operator);
const bezugLuege = (await loadInspections()).find(item => item.id === "insp-luege");

const mitFalschemVorgaenger = await mitHash({
  ...buildApprovalRecord({
    pending: bezugLuege, approver: operator,
    signature: signatur("wird ueberschrieben", operator.username),
    now: NOW, decision: "FAIL", newId: "insp-luege-frei", appVersion: "8.3.0-rc.4.11",
    approvalComment: "Operator behauptet einen anderen Vorgaengerzustand",
  }),
  previousState: LIFECYCLE_STATE.DRAFT,
});
const luege = await rejectsWith(() => saveInspection(mitFalschemVorgaenger, operator), "QA");
ok("S43", "Ein behaupteter Vorgaengerzustand hebelt die Rollensperre nicht aus",
  luege.rejected, luege.message || "ANGENOMMEN — previousState wird geglaubt");

const wartendSelbstFail = await wartend("insp-selbst-fail", { performer: qa });
await saveInspection(wartendSelbstFail, qa);
const selbstSperre = await freigabeAuf("insp-selbst-fail", qa,
  { decision: "FAIL", id: "insp-selbst-fail-frei", kommentar: "QA sperrt die eigene Pruefung" });
const selbstGesperrt = await rejectsWith(() => saveInspection(selbstSperre, qa), "Vier-Augen");
ok("S44", "Auch die Sperrung unterliegt dem Vier-Augen-Prinzip",
  selbstGesperrt.rejected,
  selbstGesperrt.message || "ANGENOMMEN — QA sperrt die eigene Pruefung");

/* Ein BESTAETIGTES FAIL ist genau das, was ein Override ueberstimmt. Ein
   NICHT BEWERTBARER Punkt dagegen nicht — der bleibt gesperrt. */
const FAIL_URTEIL = {
  dry: { pass: true, code: "PASS" }, clean: { pass: false, code: "LOCAL_RESIDUE" },
  intact: { pass: true, code: "PASS" },
};
const FAIL_MERKMALE = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.10, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
const punkteMitFail = buildCheckpoints(FAIL_MERKMALE, FAIL_URTEIL, mitFeuchteSequenz()).map(c =>
  c.id === "residue" ? { ...c, status: "FAIL", code: "LOCAL_RESIDUE" } : c);

const wartendOverride = await wartend("insp-override", {
  retakes: [RETAKE], checkpointsOverride: punkteMitFail,
  verdicts: FAIL_URTEIL, features: FAIL_MERKMALE,
});
await saveInspection(wartendOverride, operator);
const overrideFreigabe = await mitHash({
  ...(await freigabeAuf("insp-override", qa, { decision: "OVERRIDE", id: "insp-override-frei" })),
  overrideReason: "Restbefund fachlich bewertet und dokumentiert freigegeben",
});
let overrideOk = false; let overrideFehler = "";
try { await saveInspection(overrideFreigabe, qa); overrideOk = true; }
catch (error) { overrideFehler = String(error?.message || error); }
ok("S45", "Ein Override auf ein BESTAETIGTES FAIL ist erreichbar",
  overrideOk && overrideFreigabe.state === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
  overrideOk ? `state=${overrideFreigabe.state}` : `ABGEWIESEN: ${overrideFehler}`);

/* Known-Issue-Sackgasse: ein tolerierter Befund OHNE Zuordnung muss
   uebergeben werden koennen — sonst kommt der Operator nicht weiter. */
const wartendKiOhne = await wartend("insp-ki-sackgasse", {
  checkpointsOverride: toleriertePunkte,
});
let kiWartendOk = false; let kiWartendFehler = "";
try { await saveInspection(wartendKiOhne, operator); kiWartendOk = true; }
catch (error) { kiWartendFehler = String(error?.message || error); }
ok("S46", "Ein tolerierter Befund ohne Zuordnung ist als PENDING_QA uebergebbar",
  kiWartendOk && wartendKiOhne.state === LIFECYCLE_STATE.PENDING_QA,
  kiWartendOk ? "uebergeben" : `ABGEWIESEN: ${kiWartendFehler}`);

ok("S47", "Ein tolerierter Befund ohne Zuordnung erzeugt einen QA-Trigger",
  (wartendKiOhne.qaTriggers || []).some(t => t.source === "KNOWN_ISSUE"),
  `qaTriggers: ${(wartendKiOhne.qaTriggers || []).map(t => t.code).join(", ") || "keine"}`);

/* ── S48 · Der Operator kann eine Abweichung als FAIL abschliessen ──────

   Befund aus dem ersten echten Bedienlauf (rc.4.11, 11.09.2026):

     Zustandsuebergang abgewiesen (QA_ROLE_REQUIRED): FINAL_FAIL erfordert
     exakt die Rolle "QA Manager"; vorliegend "Operator"

   Ursache: `derivePreviousState` behauptete PENDING_QA, sobald eine
   Abweichung dokumentiert war — auch bei einem Einschritt-Abschluss, der
   nie wartend WAR. Die in rc.4.11 eingefuehrte Regel "aus PENDING_QA fuehrt
   nur die QA heraus" griff dadurch auf einen Vorgang, der gar nicht aus
   PENDING_QA kam.

   Fachlich: ein FAIL ist keine Freigabe. "Nachgereinigt und immer noch
   nicht sauber" darf ein Operator allein feststellen — needsQaApproval
   deckt nur PASS_AFTER_REMEDIATION und RELEASED_WITH_DEVIATION ab.        */

const operatorFail = await mitHash(buildInspectionRecord({
  id: "insp-op-fail", appVersion: "8.3.0-rc.4.31", now: NOW,
  user: operator, eqId: "tp", eqName: "Tablettenpresse",
  zoneId: "die", zoneName: "Matrizenteller",
  photos: [foto("photo-1", fotoErgebnis())],
  aggregate: aggregateResults([fotoErgebnis()]),
  originalSystemDecision: deriveSystemDecision(aggregateResults([fotoErgebnis()])),
  finalDecision: "FAIL",
  performedBy: { username: operator.username, role: operator.role, at: NOW },
  reauthenticated: true,
  comment: "Nachgereinigt, Rueckstand bleibt sichtbar - gesperrt.",
  signature: signatur(SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL], operator.username),
  retakes: [RETAKE],
}));
let opFailOk = false; let opFailFehler = "";
try { await saveInspection(operatorFail, operator); opFailOk = true; }
catch (error) { opFailFehler = String(error?.message || error); }

ok("S48", "Ein Operator kann eine dokumentierte Abweichung als FAIL abschliessen",
  opFailOk && operatorFail.state === LIFECYCLE_STATE.FINAL_FAIL
  && operatorFail.previousState !== LIFECYCLE_STATE.PENDING_QA,
  opFailOk
    ? `state=${operatorFail.state} previousState=${operatorFail.previousState}`
    : `ABGEWIESEN: ${opFailFehler}`);

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
