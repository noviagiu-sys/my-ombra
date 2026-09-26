import assert from "node:assert/strict";
import {
  APPROVED_AI_ENGINE, approvedAiStatus, combineEngineVerdicts, LOCAL_ENGINE, runApprovedAiEngine,
} from "./src/analysisEngines.js";

const pass = code => ({ code, pass: true, message: code, severity: 0 });
const fail = code => ({ code, pass: false, message: code, severity: 80 });
const local = { engine: LOCAL_ENGINE, verdict: { dry: pass("LOCAL_DRY"), clean: pass("LOCAL_CLEAN"), intact: pass("LOCAL_INTACT"), hints: [] } };

console.log("VisuClean · Zwei-Engine-Vertrag\n");
assert.equal(approvedAiStatus().mode, "disabled");
const disabled = await runApprovedAiEngine({}, {});
assert.equal(disabled.status, "disabled");
assert.equal(disabled.engine, APPROVED_AI_ENGINE);
console.log("BESTANDEN  E1  Firmen-KI ist ohne explizite Freigabe deaktiviert");

const localOnly = combineEngineVerdicts(local, disabled);
assert.equal(localOnly.mode, "local-only");
assert.equal(localOnly.verdict.clean.pass, true);
console.log("BESTANDEN  E2  Offline-Betrieb verwendet ausschließlich den deterministischen Kern");

const ai = { engine: { ...APPROVED_AI_ENGINE, mode: "available", version: "test-1" }, verdict: { dry: pass("AI_DRY"), clean: fail("AI_CLEAN_FAIL"), intact: pass("AI_INTACT"), hints: [] } };
const dual = combineEngineVerdicts(local, ai);
assert.equal(dual.mode, "dual");
assert.equal(dual.verdict.clean.pass, false);
assert.equal(dual.reviewRequired, true);
assert.match(dual.verdict.hints.at(-1), /manuelle QA/);
console.log("BESTANDEN  E3  Ein FAIL der Firmen-KI kann kein lokales PASS freigeben");
console.log("BESTANDEN  E4  Widerspruch erzwingt manuelle QA-Prüfung");

await assert.rejects(
  runApprovedAiEngine({}, { enabled: true, version: "bad", adapter: async () => ({ dry: pass("x") }) }),
  /kein gültiges Urteil/,
);
console.log("BESTANDEN  E5  Unvollständige KI-Antwort wird verworfen");
console.log("\nBestanden: 5 / 5\nERGEBNIS: BESTANDEN");
