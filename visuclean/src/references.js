/* ─── VisuClean RC4 · Alt-Referenzen ───────────────────────────────────────
   Umsetzung von PLANUNG_RC4_V2.2.md, Abschnitt 8.

   Das Problem: Referenzen aus RC2 und RC3 tragen die Felder nicht, die ein
   spaeterer Vergleich braucht. RC4 muss das sichtbar machen — aber es darf
   dabei den historischen Datensatz NICHT anfassen. Ein nachtraeglich
   veraendertes Referenzobjekt haette einen anderen recordHash, und damit
   waere genau die Integritaetskette zerstoert, die den Wert der Referenz
   ausmacht.

   Loesung: die Markierung ist eine GETRENNTE Information neben der
   Referenz, nicht in ihr. Sie ist idempotent — ein zweiter Start erzeugt
   keinen zweiten Eintrag.                                                  */

export const LEGACY_NOT_COMPARABLE = "LEGACY_NOT_COMPARABLE";

/* Felder, die eine vergleichsgeeignete Referenz tragen muss. Fehlt eines,
   ist die Referenz nicht vergleichsgeeignet. Diese Liste ist bewusst kurz
   und benennt nur, was ein Vergleich tatsaechlich braucht. */
export const REQUIRED_REFERENCE_FIELDS = Object.freeze([
  "frame",        // Bildausschnitt und Seitenverhaeltnis
  "edgeFrac",     // Kantenevidenz der Aufnahme
  "approved",     // QA-Freigabe der Referenz
  "scratchZones", // lokalisierte Kratzerzonen
]);

/**
 * Welche Pflichtfelder fehlen dieser Referenz?
 * @returns {string[]} leer, wenn die Referenz vergleichsgeeignet ist
 */
export function missingReferenceFields(reference) {
  if (!reference || typeof reference !== "object") return [...REQUIRED_REFERENCE_FIELDS];
  return REQUIRED_REFERENCE_FIELDS.filter(feld => {
    const wert = reference[feld];
    if (wert === undefined || wert === null) return true;
    if (Array.isArray(wert)) return false;
    if (typeof wert === "string") return wert.trim().length === 0;
    return false;
  });
}

/** Ist diese Referenz fuer einen automatischen Vergleich geeignet? */
export function isComparable(reference) {
  return missingReferenceFields(reference).length === 0;
}

/**
 * Baut die Markierung fuer eine Alt-Referenz. Reine Funktion; sie schreibt
 * nichts und veraendert die Referenz nicht.
 *
 * Die Markierung wird an den URSPRUENGLICHEN Referenzhash gebunden. Aendert
 * sich die Referenz-ID oder ihr Hash, passt die alte Markierung nicht mehr
 * und wird nicht uebernommen (T-C6).
 */
export function buildLegacyMarker(reference, { appVersion, at } = {}) {
  const fehlend = missingReferenceFields(reference);
  if (!fehlend.length) return null;
  return {
    id: `legacy-${reference.id}`,
    kind: LEGACY_NOT_COMPARABLE,
    referenceId: reference.id,
    /* Der Hash der Referenz ZUM ZEITPUNKT der Pruefung. Er ist der Anker:
       nur solange er passt, gilt die Markierung. */
    referenceHash: reference.recordHash ?? null,
    missingFields: [...fehlend],
    appVersion: appVersion ?? null,
    checkedAt: at ?? null,
    message: {
      de: "Diese Referenz stammt aus einer aelteren Version und ist fuer einen "
        + "automatischen Vergleich nicht geeignet. Bitte eine neue geeignete "
        + "Referenzaufnahme erstellen.",
      en: "This reference originates from an older version and is not suitable "
        + "for automatic comparison. Please create a new suitable reference "
        + "capture.",
    },
  };
}

/**
 * Bestimmt, welche Markierungen NEU geschrieben werden muessen.
 *
 * Idempotenz (T-C5): eine bereits vorhandene, zur aktuellen Referenz-ID und
 * zum aktuellen Referenzhash passende Markierung wird nicht erneut erzeugt.
 * Ein zweiter Start schreibt nichts.
 *
 * Nicht-Uebernahme (T-C6): passt der Hash nicht mehr, gilt die alte
 * Markierung nicht; sie wird als veraltet gemeldet und ersetzt, nicht
 * weitergeschleppt.
 *
 * @returns {{toWrite: Array, stale: Array, unchanged: Array}}
 */
export function planLegacyMarking(references = [], existingMarkers = [], options = {}) {
  const referenzen = Array.isArray(references) ? references : [];
  const vorhanden = Array.isArray(existingMarkers) ? existingMarkers : [];
  const nachId = new Map(vorhanden.map(marker => [marker.referenceId, marker]));

  const toWrite = [];
  const unchanged = [];
  const stale = [];

  for (const referenz of referenzen) {
    if (!referenz?.id) continue;
    const neu = buildLegacyMarker(referenz, options);
    const alt = nachId.get(referenz.id);

    if (!neu) {
      /* Die Referenz ist (wieder) vergleichsgeeignet. Eine alte Markierung
         dazu ist veraltet. */
      if (alt) stale.push(alt);
      continue;
    }
    if (!alt) {
      toWrite.push(neu);
      continue;
    }
    if (alt.referenceHash !== neu.referenceHash) {
      /* Referenz-ID oder Hash geaendert: die alte Markierung wird NICHT
         uebernommen. */
      stale.push(alt);
      toWrite.push(neu);
      continue;
    }
    unchanged.push(alt);
  }

  /* Markierungen ohne zugehoerige Referenz sind verwaist. */
  const bekannteIds = new Set(referenzen.map(referenz => referenz?.id));
  for (const marker of vorhanden) {
    if (!bekannteIds.has(marker.referenceId)) stale.push(marker);
  }

  return { toWrite, stale, unchanged };
}

/**
 * Die vorgeschriebene Meldung, wenn ein Kratzervergleich mit einer
 * Legacy-Referenz versucht wird (T-C3). Es findet KEIN automatischer
 * Vergleich statt.
 */
export const LEGACY_COMPARISON_REFUSAL = Object.freeze({
  code: LEGACY_NOT_COMPARABLE,
  de: "Kein automatischer Kratzervergleich: die hinterlegte Referenz ist nicht "
    + "vergleichsgeeignet. Eine neue geeignete Referenzaufnahme ist erforderlich.",
  en: "No automatic scratch comparison: the stored reference is not suitable for "
    + "comparison. A new suitable reference capture is required.",
});

/**
 * Die Handlungsaufforderung fuer die Referenzverwaltung (T-C4).
 */
export function referenceActionRequired(markers = []) {
  const liste = Array.isArray(markers) ? markers : [];
  if (!liste.length) return null;
  return Object.freeze({
    count: liste.length,
    referenceIds: liste.map(marker => marker.referenceId),
    de: `${liste.length} Referenz(en) sind nicht vergleichsgeeignet. Bitte fuer `
      + "diese Zonen eine neue geeignete Referenzaufnahme erstellen.",
    en: `${liste.length} reference(s) are not suitable for comparison. Please `
      + "create a new suitable reference capture for these zones.",
  });
}
