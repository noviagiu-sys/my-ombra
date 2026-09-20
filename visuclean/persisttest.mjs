/* VisuClean v8.2 · Persistenz-, Signatur- und Append-only-Gegenbeweise */
import "fake-indexeddb/auto";
import { recordDigest } from "./src/audit.js";
import {
  exportReadableData, loadInspections, loadIssues, loadReferences, saveInspection,
  saveIssue, saveReference, verifyStoredAudit,
} from "./src/persistence.js";
import { CHECKPOINTS, STATUS } from "./src/assessment.js";
import { CAPTURE_PATH } from "./src/decision.js";
import { LIFECYCLE_STATE } from "./src/lifecycle.js";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}
async function rejects(action) {
  try { await action(); return false; } catch { return true; }
}
function verdict() {
  return { code: "PASS", pass: true, message: "PASS", detail: "ok", severity: 0, action: "" };
}
/* RC4 · Schema 3. Der Datensatzvertrag hat sich gegenueber RC3 bewusst
   geaendert: Pruefpunktlisten, Aufnahmeprofil, Zustand und Pruefer sind
   jetzt Pflicht. Diese Helfer bauen einen vertragskonformen Datensatz. */
function checkpointList() {
  return CHECKPOINTS.map(meta => ({
    id: meta.id, status: STATUS.PASS, code: "PASS", required: meta.required,
    label: { de: meta.de, en: meta.en },
    message: { de: "Bestanden", en: "Pass" },
    reason: "Testfixture", actions: [], measurements: {},
  }));
}
function profile() {
  return {
    processedWidth: 480, processedHeight: 640,
    sourceWidth: 480, sourceHeight: 640, path: CAPTURE_PATH.CAMERA,
  };
}
async function withHash(value) {
  const copy = structuredClone(value);
  copy.recordHash = await recordDigest(copy);
  return copy;
}
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("visuclean-v82");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function row(store, id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

console.log("VisuClean · verschluesselte Persistenz und Speichersperren\n");
const actor = { username: "qa_manager", displayName: "QA Manager", role: "QA Manager" };
/* RC4.3: die elektronische Signatur besteht aus zwei
   Identifikationskomponenten, nicht aus einer Zeichnung. */
const signature = {
  method: "USER_ID_PASSWORD", components: ["userId", "password"], meaning: "Freigabe",
  signedAt: "2026-08-26T12:00:00.000Z", signedBy: actor.username,
};
const result = { dry: verdict(), clean: verdict(), intact: verdict(), lm: .6, hints: [] };
const inspection = await withHash({
  id: "inspection-p1", schema: 2, appVersion: "8.2.0", createdAt: signature.signedAt, signedAt: signature.signedAt,
  user: actor, eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photoCount: 1, photos: [{ id: "photo-1", image: "data:image/jpeg;base64,U0VDUkVUX0JJTEQ=", annotatedImage: "data:image/jpeg;base64,QU5OT1RBVEVE", markers: [], markerAssessments: [], result: { ...result, checkpoints: checkpointList() }, captureProfile: profile(), knownIssueInfo: null }],
  aggregate: result, originalSystemDecision: { status: "PASS", reason: "ALL_PASS", failed: [] },
  finalDecision: "PASS", comment: "SECRET_COMMENT", overrideReason: null, referenceId: null, signature,
  /* RC4 · Schema 3 */
  schemaVersion: 3, state: LIFECYCLE_STATE.FINAL_PASS, previousState: LIFECYCLE_STATE.DRAFT,
  checkpoints: checkpointList(), reauthenticated: true,
  performedBy: { username: actor.username, role: actor.role, at: signature.signedAt },
  approvedBy: null, approvalRevisionHash: null, revisionHash: null,
  retakes: [], manualFindings: [], knownIssueAssignments: [], qaTriggers: [],
  aiCrosscheck: { enabled: false, status: "AI_CROSSCHECK_DISABLED", unresolvedConflicts: 0 },
});
const reference = await withHash({
  id: "tp:die", schema: 1, eqId: "tp", zoneId: "die", eqName: "Tablettenpresse", zoneName: "Matrizenteller",
  image: "data:image/jpeg;base64,UkVGRVJFTkNF", annotatedImage: "data:image/jpeg;base64,UkVGRVJFTkNF",
  result, markers: [], createdAt: "2026-08-26T11:00:00.000Z", createdBy: actor,
});
const issueSignature = { ...signature, meaning: "QA-Toleranzfreigabe", signedAt: "2026-08-26T11:30:00.000Z" };
const knownIssue = await withHash({
  id: "ki-p1", schema: 2, status: "active", eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  issueType: "hairline_scratch", originalIntactCode: "SCRATCH_SUSPECT", zones: [{ kind: "scratch", x: .5, y: .5, r: .1 }],
  reason: "Kosmetischer Haarkratzer", knownSince: "2026-08-01", severity: "minor", validUntil: "2027-02-26", validUntilLabel: "26.02.2027",
  createdBy: actor.displayName, createdById: actor.username, createdAt: issueSignature.signedAt,
  referenceImage: "data:image/jpeg;base64,S0lSRUY=", signature: issueSignature, actions: [],
});

await saveReference(reference, actor);
await saveIssue(knownIssue, actor);
await saveInspection(inspection, actor);
ok("P1", "Verschluesseltes Inspection-Objekt laesst sich verlustfrei lesen",
  (await loadInspections())[0].recordHash === inspection.recordHash);
ok("P2", "Referenz und Known Issue werden getrennt persistiert",
  (await loadReferences()).length === 1 && (await loadIssues()).length === 1);
const audit = await verifyStoredAudit();
/* RC4: eine Inspektion schreibt ZWEI Ereignisse — die Signatur und genau
   einen finalen Integritaetsanker. Referenz und Known Issue je eines.
   Drei Schreibvorgaenge ergeben damit vier Ereignisse. */
ok("P3", "Drei Schreibvorgaenge bilden eine gueltige Audit-Kette (mit finalem Anker: 4 Ereignisse)",
  audit.ok && audit.count === 4, `${audit.count} Ereignisse`);

const rawInspection = await row("inspections", inspection.id);
const rawText = JSON.stringify(rawInspection);
ok("P4", "Rohspeicher enthaelt weder Bild noch Kommentar im Klartext",
  !rawText.includes("SECRET_COMMENT") && !rawText.includes("U0VDUkVUX0JJTEQ") && rawInspection.blob?.version === 1);
const keyRow = await row("meta", "encryption-key");
ok("P5", "AES-Schluessel ist nicht extrahierbar",
  keyRow.value?.algorithm?.name === "AES-GCM" && keyRow.value.extractable === false);

ok("P6", "Signierter Datensatz ist append-only und kann nicht ueberschrieben werden",
  await rejects(() => saveInspection(inspection, actor)));
const auditAfterDuplicate = await verifyStoredAudit();
ok("P7", "Gescheiterter Ueberschreibversuch erzeugt keinen Audit-Eintrag",
  auditAfterDuplicate.ok && auditAfterDuplicate.count === 4);

const exportData = await exportReadableData();
ok("P8", "Lesbarer Export enthaelt Daten und eigene Audit-Verifikation",
  exportData.inspections.length === 1 && exportData.auditVerification.ok && exportData.schema === "visuclean-export-v8.2");

/* ALTVERHALTEN  Eine zu kurze Zeichenpfadlaenge wurde abgewiesen.
   SOLLVERHALTEN Eine unvollstaendige elektronische Signatur wird abgewiesen —
                 hier fehlt die zweite Identifikationskomponente.
   BEGRUENDUNG   Part 11 §11.200 verlangt zwei Komponenten; die Pfadlaenge
                 war nie eine Kontrolle. */
const unsigned = await withHash({
  ...inspection, id: "inspection-unsigned",
  signature: { ...signature, components: ["userId"] },
});
ok("P9", "Speichermechanismus blockiert eine unvollstaendige elektronische Signatur",
  await rejects(() => saveInspection(unsigned, actor)));
const wrongHash = { ...inspection, id: "inspection-wrong-hash", comment: "manipuliert" };
ok("P10", "Speichermechanismus blockiert einen unpassenden Datensatz-Hash",
  await rejects(() => saveInspection(wrongHash, actor)));

const failNoComment = await withHash({
  ...inspection, id: "inspection-fail", finalDecision: "FAIL", comment: "",
  originalSystemDecision: { status: "FAIL", reason: "CRITERIA_FAIL", failed: ["clean"] },
  signature: { ...signature, meaning: "Sperrung" },
});
ok("P11", "FAIL ohne Massnahmenkommentar ist auf Speicherebene gesperrt",
  await rejects(() => saveInspection(failNoComment, actor)));
const criticalOverride = await withHash({
  ...inspection, id: "inspection-critical", finalDecision: "OVERRIDE", overrideReason: "Trotzdem freigeben",
  originalSystemDecision: { status: "FAIL", reason: "CRITICAL_LIGHT", failed: [] },
  signature: { ...signature, meaning: "Override-Freigabe" },
});
ok("P12", "Kritische Beleuchtung kann auch auf Speicherebene nicht ueberstimmt werden",
  await rejects(() => saveInspection(criticalOverride, actor)));

const operator = { username: "operator1", displayName: "Operator 1", role: "Operator" };
ok("P13", "Operator kann kein Known Issue schreiben",
  await rejects(() => saveIssue(knownIssue, operator)));
ok("P14", "Operator kann kein Referenzbild schreiben",
  await rejects(() => saveReference(reference, operator)));

const db = await database();
await new Promise((resolve, reject) => {
  const tx = db.transaction("audit", "readwrite");
  const store = tx.objectStore("audit");
  const request = store.get("e-does-not-exist");
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});
ok("P15", "Unveraenderte Kette bleibt nach Read/Write-Transaktion gueltig",
  (await verifyStoredAudit()).ok);
await new Promise((resolve, reject) => {
  const tx = db.transaction("audit", "readwrite");
  const store = tx.objectStore("audit");
  const request = store.getAll();
  request.onsuccess = () => {
    const first = request.result[0];
    const last = first.blob.data.at(-1);
    first.blob.data = `${first.blob.data.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    store.put(first);
  };
  request.onerror = () => reject(request.error);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
});
ok("P16", "Manipulation am verschluesselten Audit-BLOB wird erkannt",
  await rejects(() => verifyStoredAudit()));
const secondReference = await withHash({ ...reference, id: "tp:punch", zoneId: "punch", zoneName: "Stempeloberflaeche" });
ok("P17", "Beschaedigte Audit-Kette sperrt jeden weiteren Schreibvorgang",
  await rejects(() => saveReference(secondReference, actor)));
let sizeBlocked = false;
try {
  await saveReference({ ...reference, id: "too-large", image: `data:image/jpeg;base64,${"A".repeat(1400000)}` }, actor);
} catch (error) { sizeBlocked = error.message.includes("1 MB"); }
ok("P18", "Speicherschicht blockiert ein Foto ueber 1 MB unabhaengig von der UI", sizeBlocked);

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
