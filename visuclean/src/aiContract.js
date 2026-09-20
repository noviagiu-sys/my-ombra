/* ─── VisuClean RC4 · KI-Gegenpruefung (Vertragsschnittstelle) ─────────────
   Umsetzung von PLANUNG_RC4_V2.2.md, Abschnitt 9.

   Was das hier IST: die Beschreibung eines Vertrags. Welche Felder eine
   Antwort tragen muss, was mit einer verspaeteten oder unvollstaendigen
   Antwort geschieht, und was eine KI-Aussage bewirken darf.

   Was das hier NICHT ist: ein Anbieter, ein Endpunkt, ein Schluessel oder
   ein Request. RC4 bleibt standardmaessig vollstaendig lokal. Es gibt in
   dieser Datei keine URL, keine Zugangsdaten und keinen fetch-Aufruf; das
   ist keine Nachlaessigkeit, sondern die Anforderung.

   Zwei Regeln, die den ganzen Baustein tragen:
   1. Eine KI-Aussage ueberschreibt niemals ein lokales FAIL oder
      NOT_ASSESSABLE. Der deterministische Kern entscheidet.
   2. Ein Widerspruch zugunsten PASS ist kein Ergebnis, sondern eine Frage
      an einen QA Manager.

   Ausdruecklich KEINE window.*-Funktion als Sicherheitsgrenze: alles, was
   im Browser global ueberschreibbar ist, ist keine Grenze.                 */

import { STATUS } from "./assessment.js";

/** Standardzustand. RC4 wird mit deaktivierter Gegenpruefung ausgeliefert. */
export const AI_CROSSCHECK_ENABLED = false;

export const AI_STATUS = Object.freeze({
  DISABLED: "AI_CROSSCHECK_DISABLED",
  ACCEPTED: "AI_RESPONSE_ACCEPTED",
  REJECTED: "AI_RESPONSE_REJECTED",
  DISCARDED_STALE: "AI_RESPONSE_DISCARDED_STALE",
  TIMEOUT: "AI_RESPONSE_TIMEOUT",
  CONFLICT_NEEDS_QA: "AI_CONFLICT_NEEDS_QA",
});

/** Die drei Kernpunkte, die eine Antwort GETRENNT bewerten muss. */
export const AI_CORE_POINTS = Object.freeze(["residue", "scratch", "corrosion"]);

/** Zulaessige Statuswerte je Kernpunkt. Alles andere wird abgewiesen. */
export const AI_POINT_STATUS = Object.freeze(["PASS", "FAIL", "NOT_ASSESSABLE"]);

export const AI_DISABLED_NOTICE = Object.freeze({
  code: AI_STATUS.DISABLED,
  de: "KI-Gegenpruefung: deaktiviert",
  en: "AI cross-check: disabled",
});

/**
 * Der Zustand fuer Anzeige und Datensatz, solange kein Adapter konfiguriert
 * ist (T-K4). Sichtbar und im Datensatz, nicht stillschweigend weggelassen.
 */
export function crosscheckState(adapter = null) {
  if (!AI_CROSSCHECK_ENABLED || !adapter) {
    return Object.freeze({
      enabled: false,
      status: AI_STATUS.DISABLED,
      notice: AI_DISABLED_NOTICE,
      adapterVersion: null,
      modelName: null,
      modelVersion: null,
    });
  }
  return Object.freeze({
    enabled: true,
    status: null,
    notice: null,
    adapterVersion: adapter.adapterVersion ?? null,
    modelName: adapter.modelName ?? null,
    modelVersion: adapter.modelVersion ?? null,
  });
}

/**
 * Prueft eine KI-Antwort gegen den Vertrag.
 *
 * @param {object} response  die Antwort des Adapters
 * @param {object} expected  {photoId, photoHash, eqId, zoneId, recordRevision}
 * @returns {{accepted: boolean, status: string, reason: string|null}}
 */
export function validateAiResponse(response, expected = {}) {
  const ab = (status, reason) => ({ accepted: false, status, reason });

  if (!response || typeof response !== "object") {
    return ab(AI_STATUS.REJECTED, "Antwort fehlt oder ist kein Objekt");
  }
  if (response.timeout === true) {
    return ab(AI_STATUS.TIMEOUT, "Zeitueberschreitung");
  }

  /* Bindung an genau die Aufnahme und genau die Revision. Eine Antwort fuer
     ein anderes Foto oder eine andere Revision ist keine Antwort auf diese
     Frage (T-K1). */
  for (const feld of ["photoId", "photoHash", "eqId", "zoneId"]) {
    if (expected[feld] !== undefined && response[feld] !== expected[feld]) {
      return ab(AI_STATUS.REJECTED, `Antwort gehoert zu einem anderen ${feld}`);
    }
  }
  /* Eine verspaetete Antwort fuer eine inzwischen geaenderte Revision wird
     verworfen und im Audit vermerkt — sie wirkt nicht (T-K2). */
  if (expected.recordRevision !== undefined
    && response.recordRevision !== expected.recordRevision) {
    return ab(AI_STATUS.DISCARDED_STALE,
      "Antwort bezieht sich auf eine inzwischen geaenderte Datensatzrevision");
  }

  /* Der Vertrag verlangt DREI getrennte Kernpunkte. Ein einzelnes
     Gesamturteil ("intact") ist vertragswidrig (T-37). */
  const punkte = response.points;
  if (!punkte || typeof punkte !== "object") {
    return ab(AI_STATUS.REJECTED, "Feld points fehlt");
  }
  const fehlend = AI_CORE_POINTS.filter(name => !(name in punkte));
  if (fehlend.length) {
    return ab(AI_STATUS.REJECTED,
      `Vertrag verlangt drei getrennte Kernpunkte; es fehlen: ${fehlend.join(", ")}`);
  }
  const zusaetzlich = Object.keys(punkte).filter(name => !AI_CORE_POINTS.includes(name));
  if (zusaetzlich.length) {
    return ab(AI_STATUS.REJECTED,
      `Unbekannte Kernpunkte: ${zusaetzlich.join(", ")}`);
  }
  for (const name of AI_CORE_POINTS) {
    if (!AI_POINT_STATUS.includes(punkte[name]?.status)) {
      return ab(AI_STATUS.REJECTED,
        `Unbekannter Statuswert fuer ${name}: ${punkte[name]?.status}`);
    }
  }

  /* Adapter- und Modellversion sind Pflicht: ohne sie ist eine Aussage
     spaeter nicht zuzuordnen. */
  const fehlendeVersion = ["adapterVersion", "modelName", "modelVersion"]
    .filter(feld => !String(response[feld] ?? "").trim());
  if (fehlendeVersion.length) {
    return ab(AI_STATUS.REJECTED,
      `Pflichtangaben fehlen: ${fehlendeVersion.join(", ")}`);
  }

  return { accepted: true, status: AI_STATUS.ACCEPTED, reason: null };
}

/**
 * Vergleicht die akzeptierte KI-Antwort mit dem lokalen Ergebnis.
 *
 * Die einzige Wirkung, die eine KI-Aussage haben darf: einen Widerspruch
 * SICHTBAR machen. Sie hebt nichts auf.
 *
 * @returns {{conflicts: Array, unresolved: number}}
 */
export function compareWithLocal(response, localCheckpoints = []) {
  const lokal = Array.isArray(localCheckpoints) ? localCheckpoints : [];
  const conflicts = [];

  for (const name of AI_CORE_POINTS) {
    const punkt = lokal.find(item => item?.id === name);
    if (!punkt) continue;
    const kiStatus = response?.points?.[name]?.status;
    if (!kiStatus || kiStatus === punkt.status) continue;

    /* Ein KI-PASS gegen ein lokales FAIL oder NOT_ASSESSABLE ist der Fall,
       der einen QA Manager verlangt. Der lokale Punkt bleibt offen (T-36). */
    const zugunstenPass = kiStatus === "PASS"
      && (punkt.status === STATUS.FAIL || punkt.status === STATUS.NOT_ASSESSABLE);

    conflicts.push({
      point: name,
      localStatus: punkt.status,
      aiStatus: kiStatus,
      /* Begruendung und Konfidenz sind ausschliesslich Diagnose. Sie sind
         kein Entscheidungsgrund und duerfen nie als solcher erscheinen. */
      diagnosticsOnly: {
        rationale: response?.points?.[name]?.rationale ?? null,
        confidence: response?.points?.[name]?.confidence ?? null,
      },
      requiresQaManager: zugunstenPass,
      resolved: false,
      de: zugunstenPass
        ? "KI-Gegenpruefung widerspricht zugunsten PASS. Der lokale Befund bleibt "
          + "bestehen; eine Aufloesung ist nur durch einen QA Manager moeglich."
        : "KI-Gegenpruefung weicht vom lokalen Befund ab. Der lokale Befund gilt.",
    });
  }

  return {
    conflicts,
    unresolved: conflicts.filter(item => item.requiresQaManager && !item.resolved).length,
  };
}

/**
 * Loest einen Widerspruch auf. Nur ein QA Manager darf das (T-E1).
 */
export function resolveConflict(conflict, actor) {
  if (!conflict) return { ok: false, error: "Kein Widerspruch angegeben" };
  if (!conflict.requiresQaManager) {
    return { ok: true, conflict: { ...conflict, resolved: true } };
  }
  if (actor?.role !== "QA Manager") {
    return {
      ok: false,
      error: "Ein KI-Widerspruch zugunsten PASS darf nur durch einen QA Manager "
        + "aufgeloest werden",
    };
  }
  return {
    ok: true,
    conflict: {
      ...conflict, resolved: true,
      resolvedBy: { username: actor.username, role: actor.role },
    },
  };
}

/**
 * Das Auditereignis zu einer verworfenen Antwort. Eine verworfene Antwort
 * verschwindet nicht still — sie wird vermerkt (T-K2).
 */
export function discardEventPayload(response, expected, status, reason) {
  return {
    aiStatus: status,
    reason,
    photoId: response?.photoId ?? null,
    expectedRevision: expected?.recordRevision ?? null,
    receivedRevision: response?.recordRevision ?? null,
    adapterVersion: response?.adapterVersion ?? null,
    modelName: response?.modelName ?? null,
    modelVersion: response?.modelVersion ?? null,
  };
}
