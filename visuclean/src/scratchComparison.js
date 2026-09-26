/* ─── VisuClean · Kratzerbewertung gegen eine Referenzaufnahme (RC3) ───────
   "Neu" oder "grösser geworden" ist eine Aussage über zwei Zeitpunkte. Ohne
   geeignete Vergleichsaufnahme derselben Oberfläche ist sie nicht belegbar.
   Diese Datei setzt genau das durch: ohne belastbare Referenz lautet das
   Ergebnis ausdrücklich "neu oder bestehend nicht bestimmbar".

   Ein neuer Kratzer wird NIE automatisch zu einem Known Issue. Die
   Freigabe bleibt ein getrennter, signierter QA-Schritt (knownIssues.js).

   Deterministisch: reine Funktionen, kein Zufall, kein Zeitbezug ausser dem
   übergebenen Zeitstempel.                                                */

import { matchZones } from "./knownIssues.js";

export const SCRATCH_CLASS = Object.freeze({
  NEW_SUSPECTED: "NEW_SUSPECTED",
  NEW_CONFIRMED: "NEW_CONFIRMED",
  EXISTING: "EXISTING",
  GROWN: "GROWN",
  KNOWN_ISSUE: "KNOWN_ISSUE",
  NOT_CONFIRMED: "NOT_CONFIRMED",
  NOT_ASSESSABLE: "NOT_ASSESSABLE",
});

export const SCRATCH_CLASS_LABEL = Object.freeze({
  NEW_SUSPECTED: { de: "Neuer Kratzer vermutet", en: "New scratch suspected" },
  NEW_CONFIRMED: { de: "Neuer Kratzer bestätigt", en: "New scratch confirmed" },
  EXISTING: { de: "Bestehender Kratzer", en: "Existing scratch" },
  GROWN: { de: "Kratzer vergrössert", en: "Scratch enlarged" },
  KNOWN_ISSUE: { de: "Freigegebenes Known Issue", en: "Approved known issue" },
  NOT_CONFIRMED: { de: "Nicht bestätigt", en: "Not confirmed" },
  NOT_ASSESSABLE: { de: "Nicht bewertbar", en: "Not assessable" },
});

/** Wortlaut, wenn keine belastbare Vergleichsaufnahme vorliegt. */
export const NO_REFERENCE_TEXT = Object.freeze({
  de: "Kratzer erkannt – neu oder bestehend nicht bestimmbar.",
  en: "Scratch detected - cannot determine whether new or pre-existing.",
});

/* Mindestanforderungen an eine Vergleichsaufnahme. Die Werte sind
   Eignungskriterien für den VERGLEICH, keine Erkennungsschwellen — sie
   verschieben nichts in analysisCore.js. */
const FRAME_TOLERANCE = 0.25;   // zulässige relative Abweichung des Bildausschnitts
const MIN_EDGE_QUALITY = 0.06;  // dasselbe Kantentor wie in der Bewertung

const finite = v => Number.isFinite(v);

/**
 * Prüft, ob eine Referenzaufnahme als Vergleich taugt.
 * Liefert { eligible, reasons[] } — die Gründe sind für die Anzeige gedacht.
 */
export function referenceEligibility(current, reference) {
  const reasons = [];
  if (!reference) {
    reasons.push({ de: "Keine freigegebene Vergleichsaufnahme hinterlegt", en: "No approved reference capture stored" });
    return { eligible: false, reasons };
  }
  if (!current) {
    reasons.push({ de: "Keine aktuelle Aufnahme", en: "No current capture" });
    return { eligible: false, reasons };
  }
  if (current.equipmentId !== reference.equipmentId) {
    reasons.push({ de: "Anderes Equipment", en: "Different equipment" });
  }
  if (current.zoneId !== reference.zoneId) {
    reasons.push({ de: "Andere Prüfzone", en: "Different inspection zone" });
  }
  if (reference.approved !== true) {
    reasons.push({ de: "Referenzaufnahme ist nicht freigegeben", en: "Reference capture is not approved" });
  }
  /* Bildausschnitt: Seitenverhältnis und Massstab müssen grob passen,
     sonst vergleicht man Positionen, die nichts miteinander zu tun haben. */
  const ar = (o) => (finite(o?.width) && finite(o?.height) && o.height > 0 ? o.width / o.height : null);
  const arC = ar(current), arR = ar(reference);
  if (arC === null || arR === null) {
    reasons.push({ de: "Bildabmessungen unbekannt", en: "Image dimensions unknown" });
  } else if (Math.abs(arC - arR) / Math.max(arC, arR) > FRAME_TOLERANCE) {
    reasons.push({ de: "Bildausschnitt zu unterschiedlich", en: "Framing too different" });
  }
  /* Blickwinkel, falls erfasst */
  if (finite(current.viewAngle) && finite(reference.viewAngle)
      && Math.abs(current.viewAngle - reference.viewAngle) > 20) {
    reasons.push({ de: "Blickwinkel zu unterschiedlich", en: "View angle too different" });
  }
  /* Bildqualität: ohne Kantenstützung ist ein Kratzervergleich wertlos */
  for (const [o, wer] of [[current, "Aktuelle Aufnahme"], [reference, "Referenzaufnahme"]]) {
    if (!finite(o?.edgeFrac)) {
      reasons.push({ de: `${wer}: Qualitätsmass fehlt`, en: `${wer}: quality measure missing` });
    } else if (o.edgeFrac <= MIN_EDGE_QUALITY) {
      reasons.push({
        de: `${wer}: zu wenig Mikrokanten (${(o.edgeFrac * 100).toFixed(1)} %)`,
        en: `${wer}: insufficient micro-edges (${(o.edgeFrac * 100).toFixed(1)} %)`,
      });
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * Klassifiziert die aktuell erkannten Kratzerzonen.
 *
 * @param {object} p
 * @param {Array}  p.currentZones   Zonen der aktuellen Aufnahme (extractZones)
 * @param {object} p.current        { equipmentId, zoneId, width, height, edgeFrac, viewAngle? }
 * @param {object} p.reference      dieselbe Struktur plus zones[] und approved
 * @param {Array}  p.knownIssueZones Zonen aktiver, freigegebener Known Issues
 * @param {boolean} p.operatorConfirmed  ausdrückliche Bestätigung durch den Prüfer
 */
export function classifyScratches({ currentZones = [], current = null, reference = null,
                                    knownIssueZones = [], operatorConfirmed = false } = {}) {
  const zones = Array.isArray(currentZones) ? currentZones : [];

  if (zones.length === 0) {
    return {
      classification: null, zones: [], comparable: false,
      display: { de: "Keine Kratzer erkannt", en: "No scratches detected" },
      reasons: [], knownIssueCandidate: false,
    };
  }

  /* Freigegebene Known Issues zuerst: sie sind bereits QA-bewertet. */
  if (knownIssueZones.length) {
    const m = matchZones(zones, knownIssueZones);
    if (m.allMatched) {
      return {
        classification: SCRATCH_CLASS.KNOWN_ISSUE, zones, comparable: true,
        display: SCRATCH_CLASS_LABEL.KNOWN_ISSUE,
        reasons: [{ de: `${zones.length} Zone(n) decken sich mit einem freigegebenen Known Issue`,
                    en: `${zones.length} zone(s) match an approved known issue` }],
        knownIssueCandidate: false,
      };
    }
  }

  const eig = referenceEligibility(current, reference);
  if (!eig.eligible) {
    /* Ohne belastbare Referenz wird KEINE Aussage über neu oder bestehend
       getroffen. Der Kratzer selbst bleibt gemeldet. */
    return {
      classification: SCRATCH_CLASS.NOT_ASSESSABLE, zones, comparable: false,
      display: NO_REFERENCE_TEXT,
      reasons: eig.reasons,
      knownIssueCandidate: false,
    };
  }

  const refZones = Array.isArray(reference.zones) ? reference.zones : [];
  const m = matchZones(zones, refZones);

  if (m.grown.length) {
    return {
      classification: SCRATCH_CLASS.GROWN, zones, comparable: true,
      display: SCRATCH_CLASS_LABEL.GROWN,
      reasons: [{ de: `${m.grown.length} Zone(n) grösser als in der Vergleichsaufnahme`,
                  en: `${m.grown.length} zone(s) larger than in the reference capture` }],
      knownIssueCandidate: false,
      detail: { grown: m.grown.length, unmatched: m.unmatched.length, matched: m.matched.length },
    };
  }
  if (m.unmatched.length) {
    /* Neu gegenüber der Referenz. "Bestätigt" erst mit ausdrücklicher
       Bestätigung durch den Prüfer — die Bildlage allein reicht nicht. */
    const bestaetigt = operatorConfirmed === true;
    return {
      classification: bestaetigt ? SCRATCH_CLASS.NEW_CONFIRMED : SCRATCH_CLASS.NEW_SUSPECTED,
      zones, comparable: true,
      display: bestaetigt ? SCRATCH_CLASS_LABEL.NEW_CONFIRMED : SCRATCH_CLASS_LABEL.NEW_SUSPECTED,
      reasons: [{ de: `${m.unmatched.length} Zone(n) ohne Entsprechung in der Vergleichsaufnahme`,
                  en: `${m.unmatched.length} zone(s) without counterpart in the reference capture` }],
      /* Kandidat heisst: die QA DARF daraus ein Known Issue machen.
         Automatisch geschieht das nie. */
      knownIssueCandidate: true,
      detail: { grown: 0, unmatched: m.unmatched.length, matched: m.matched.length },
    };
  }
  return {
    classification: SCRATCH_CLASS.EXISTING, zones, comparable: true,
    display: SCRATCH_CLASS_LABEL.EXISTING,
    reasons: [{ de: `${m.matched.length} Zone(n) unverändert gegenüber der Vergleichsaufnahme`,
                en: `${m.matched.length} zone(s) unchanged versus the reference capture` }],
    knownIssueCandidate: false,
    detail: { grown: 0, unmatched: 0, matched: m.matched.length },
  };
}

/**
 * Vollständiger Dokumentationssatz eines Kratzerbefunds für Inspektion,
 * Verlauf, Export, PDF und Audit-Trail.
 */
export function scratchRecord({ classification, photo, overlay, equipmentId, zoneId,
                                user, timestamp, measurements = {}, status, reason } = {}) {
  return {
    equipmentId: equipmentId ?? null,
    zoneId: zoneId ?? null,
    user: user ?? null,
    timestamp: timestamp ?? null,
    photo: photo ?? null,          // Originalfoto
    overlay: overlay ?? null,      // Analysebild mit Markierung
    zones: (classification?.zones ?? []).map(z => ({ kind: z.kind, x: z.x, y: z.y, r: z.r })),
    classification: classification?.classification ?? null,
    classificationLabel: classification?.display ?? null,
    comparable: classification?.comparable ?? false,
    comparisonReasons: classification?.reasons ?? [],
    knownIssueCandidate: classification?.knownIssueCandidate ?? false,
    measurements,
    status: status ?? null,
    reason: reason ?? null,
  };
}

/**
 * Ein neuer Kratzer wird nie automatisch zum Known Issue. Diese Funktion
 * ist die einzige Stelle, die das erlaubt — und sie verlangt eine
 * vollständige, signierte QA-Freigabe.
 */
export function requestKnownIssuePromotion(record, approval) {
  if (!record || !record.knownIssueCandidate) {
    return { allowed: false, error: "kein Known-Issue-Kandidat" };
  }
  if (!approval) return { allowed: false, error: "QA-Freigabe fehlt" };
  if (approval.role !== "QA Manager") {
    return { allowed: false, error: "nur die Rolle QA Manager darf freigeben" };
  }
  for (const feld of ["user", "signature", "reason", "timestamp", "validUntil"]) {
    if (!approval[feld] || String(approval[feld]).trim().length === 0) {
      return { allowed: false, error: `Pflichtangabe fehlt: ${feld}` };
    }
  }
  return {
    allowed: true, error: null,
    issue: {
      status: "active",
      issueType: "hairline_scratch",
      originalIntactCode: "SCRATCH_SUSPECT",
      eqId: record.equipmentId,
      zoneId: record.zoneId,
      zones: record.zones,
      validUntil: approval.validUntil,
      approvedBy: approval.user,
      approvedAt: approval.timestamp,
      approvalReason: String(approval.reason).trim(),
    },
  };
}
