import { buildVerdicts, computeFeatures } from "./analysisCore.js";

export const LOCAL_ENGINE = Object.freeze({
  id: "local-deterministic",
  version: "4.0.0-rc.1",
  mode: "offline",
});

export const APPROVED_AI_ENGINE = Object.freeze({
  id: "company-approved-ai",
  version: null,
  mode: "disabled",
});

export function runLocalEngine(data, width, height) {
  const features = computeFeatures(data, width, height);
  return { engine: LOCAL_ENGINE, features, verdict: buildVerdicts(features) };
}

export function approvedAiStatus(configuration = {}) {
  const enabled = configuration.enabled === true && typeof configuration.adapter === "function";
  return enabled
    ? { ...APPROVED_AI_ENGINE, mode: "available", version: configuration.version || "company-managed" }
    : APPROVED_AI_ENGINE;
}

export async function runApprovedAiEngine(image, configuration = {}) {
  const status = approvedAiStatus(configuration);
  if (status.mode !== "available") return { engine: status, status: "disabled", verdict: null };
  const verdict = await configuration.adapter(image);
  for (const key of ["dry", "clean", "intact"]) {
    if (!verdict?.[key] || typeof verdict[key].pass !== "boolean")
      throw new Error(`Firmen-KI lieferte kein gültiges Urteil für ${key}`);
  }
  return { engine: status, status: "completed", verdict };
}

export function combineEngineVerdicts(localResult, aiResult) {
  if (!aiResult?.verdict) return {
    mode: "local-only",
    reviewRequired: false,
    verdict: localResult.verdict,
    engines: [localResult.engine, aiResult?.engine || APPROVED_AI_ENGINE],
  };
  const combined = {};
  let reviewRequired = false;
  for (const key of ["dry", "clean", "intact"]) {
    const local = localResult.verdict[key];
    const ai = aiResult.verdict[key];
    if (local.pass !== ai.pass) reviewRequired = true;
    const conservative = !local.pass ? local : !ai.pass ? ai : local;
    combined[key] = { ...conservative, engineAgreement: local.pass === ai.pass };
  }
  combined.hints = [...(localResult.verdict.hints || [])];
  if (reviewRequired) combined.hints.push("Lokale Analyse und Firmen-KI widersprechen sich — manuelle QA-Prüfung erforderlich.");
  return { mode: "dual", reviewRequired, verdict: combined, engines: [localResult.engine, aiResult.engine] };
}

/* ─── RC3: Gegenprüfung auf Prüfpunkt-Ebene ────────────────────────────────
   Die optionale Firmen-KI darf das lokale Ergebnis NIEMALS stillschweigend
   überschreiben. Bei Widerspruch entsteht ein Prüfpunkt, der eine manuelle
   Entscheidung verlangt — nicht ein stiller Kompromiss.

   Ohne konfigurierte KI verhält sich alles wie bisher: gleiche Bedienung,
   gleiche Prüfbarkeit, keine Zugangsdaten nötig, kein Netzverkehr.        */

import { STATUS } from "./assessment.js";

export const CROSS_CHECK = Object.freeze({
  LOCAL_ONLY: "LOCAL_ONLY",       // keine KI konfiguriert
  AGREEMENT: "AGREEMENT",         // beide Quellen einig
  CONTRADICTION: "CONTRADICTION", // Widerspruch -> manuelle Entscheidung nötig
});

/**
 * Vergleicht die lokalen Prüfpunkte mit einem optionalen KI-Urteil.
 * Das lokale Ergebnis bleibt in jedem Fall unverändert erhalten.
 *
 * @param {Array}  localCheckpoints  aus buildCheckpoints()
 * @param {object} aiResult          { status, verdict } aus runApprovedAiEngine()
 * @returns {{mode, reviewRequired, checkpoints, local, ai, decisions}}
 */
export function crossCheckAssessment(localCheckpoints, aiResult) {
  const local = Array.isArray(localCheckpoints) ? localCheckpoints : [];

  if (!aiResult || aiResult.status !== "completed" || !aiResult.verdict) {
    return {
      mode: CROSS_CHECK.LOCAL_ONLY,
      reviewRequired: false,
      checkpoints: local.map(c => ({ ...c, crossCheck: null })),
      local, ai: null, decisions: [],
    };
  }

  /* Die KI liefert Urteile auf der groben Ebene dry/clean/intact. Diese
     werden auf die feineren Prüfpunkte abgebildet — intact deckt Kratzer,
     Korrosion und Oberflächenstruktur ab. */
  const ZUORDNUNG = { moisture: "dry", residue: "clean", scratch: "intact", corrosion: "intact", surface: "intact" };

  let reviewRequired = false;
  const checkpoints = local.map(c => {
    const feld = ZUORDNUNG[c.id];
    const aiUrteil = feld ? aiResult.verdict[feld] : null;
    if (!aiUrteil || typeof aiUrteil.pass !== "boolean") return { ...c, crossCheck: null };

    const aiStatus = aiUrteil.pass ? STATUS.PASS : STATUS.FAIL;
    /* Ein lokal nicht bewertbarer Punkt bleibt nicht bewertbar. Die KI
       darf eine fehlende lokale Aussage nicht ersetzen. */
    if (c.status === STATUS.NOT_ASSESSABLE) {
      return {
        ...c,
        crossCheck: {
          result: CROSS_CHECK.CONTRADICTION, aiStatus, localStatus: c.status,
          note: {
            de: "Lokal nicht bewertbar; die Firmen-KI ersetzt keine fehlende lokale Aussage.",
            en: "Not locally assessable; the company AI does not replace a missing local result.",
          },
        },
      };
    }
    const einig = c.status === aiStatus;
    if (!einig) reviewRequired = true;
    return {
      ...c,
      crossCheck: {
        result: einig ? CROSS_CHECK.AGREEMENT : CROSS_CHECK.CONTRADICTION,
        aiStatus, localStatus: c.status,
        note: einig
          ? { de: "Lokale Analyse und Firmen-KI stimmen überein.", en: "Local analysis and company AI agree." }
          : { de: "Widerspruch zwischen lokaler Analyse und Firmen-KI — manuelle Entscheidung erforderlich.",
              en: "Contradiction between local analysis and company AI - manual decision required." },
      },
    };
  });

  return {
    mode: reviewRequired ? CROSS_CHECK.CONTRADICTION : CROSS_CHECK.AGREEMENT,
    reviewRequired,
    checkpoints, local, ai: aiResult.verdict, decisions: [],
  };
}

/**
 * Dokumentiert eine manuelle Entscheidung über einen Widerspruch.
 * Ohne vollständige Angaben wird nichts übernommen.
 */
export function recordManualDecision(crossCheckResult, decision) {
  const basis = crossCheckResult || { checkpoints: [], decisions: [] };
  if (!decision || !decision.checkpointId) return { ...basis, error: "kein Prüfpunkt angegeben" };
  for (const feld of ["chosenSource", "user", "timestamp", "reason"]) {
    if (!decision[feld] || String(decision[feld]).trim().length === 0) {
      return { ...basis, error: `Pflichtangabe fehlt: ${feld}` };
    }
  }
  if (!["local", "ai", "manual"].includes(decision.chosenSource)) {
    return { ...basis, error: "chosenSource muss local, ai oder manual sein" };
  }
  const ziel = (basis.checkpoints || []).find(c => c.id === decision.checkpointId);
  if (!ziel) return { ...basis, error: "unbekannter Prüfpunkt" };
  if (ziel.crossCheck?.result !== CROSS_CHECK.CONTRADICTION) {
    return { ...basis, error: "nur Widersprüche verlangen eine manuelle Entscheidung" };
  }

  const eintrag = {
    checkpointId: decision.checkpointId,
    localStatus: ziel.crossCheck.localStatus,
    aiStatus: ziel.crossCheck.aiStatus,
    chosenSource: decision.chosenSource,
    resultingStatus: decision.chosenSource === "local" ? ziel.crossCheck.localStatus
      : decision.chosenSource === "ai" ? ziel.crossCheck.aiStatus
        : decision.status ?? ziel.crossCheck.localStatus,
    user: String(decision.user).trim(),
    timestamp: String(decision.timestamp),
    reason: String(decision.reason).trim(),
  };

  const offen = (basis.checkpoints || []).filter(c =>
    c.crossCheck?.result === CROSS_CHECK.CONTRADICTION
    && ![...(basis.decisions || []), eintrag].some(d => d.checkpointId === c.id));

  return {
    ...basis,
    error: null,
    decisions: [...(basis.decisions || []), eintrag],
    checkpoints: (basis.checkpoints || []).map(c => c.id !== decision.checkpointId ? c : {
      ...c, status: eintrag.resultingStatus, code: "MANUAL_DECISION",
      manualDecision: eintrag,
    }),
    reviewRequired: offen.length > 0,
  };
}
