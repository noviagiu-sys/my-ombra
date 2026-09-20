/* ─── VisuClean · Geführter Aufnahmeablauf (P3) ────────────────────────────
   Reine Logik, keine Oberfläche, kein Zustand. Die Bedienführung in
   App.jsx holt jede Entscheidung hier ab, damit sie nicht an zwei Stellen
   verschieden getroffen wird.

   WAS P3 IST
   Drei Aufnahmen DERSELBEN Prüffläche: einmal unter normaler Beleuchtung,
   einmal mit Streiflicht von links, einmal mit Streiflicht von rechts.
   Alle Originalbilder werden gespeichert, jede Aufnahme trägt ihre
   Lichtposition, und die Zuordnung zur Zone ist eindeutig.

   WAS P3 NICHT IST
   Kein Nachweis zuverlässiger Feuchte- oder Tiefenerkennung. Eine
   vollständige Sequenz erfüllt die VORBEDINGUNG des Feuchte-Tors aus
   rc.4.26 — sie belegt nicht, dass der Algorithmus die Feuchtigkeit dann
   richtig beurteilt. Das kann erst eine Messkampagne zeigen (P6).

   WARUM ZWEI STREIFLICHTAUFNAHMEN
   Eine einzelne Richtung lässt Tropfen und Riefen im Schatten einer
   Wölbung unsichtbar. Das Pflichtenheft sieht beide Seiten in Kapitel
   4.2.4 vor.                                                              */

import { FEUCHTE_SEQUENZ_POSITIONEN, LICHTPOSITION, feuchteSequenzStatus, lichtposition }
  from "./capturePaths.js";

/**
 * Fassung der Aufnahmeanleitung.
 *
 * Sie wird MITGESPEICHERT. Wiederholbarkeit heisst: jemand kann dieselbe
 * Aufnahme später noch einmal machen — dafuer muss im Datensatz stehen,
 * nach WELCHER Anleitung die erste gemacht wurde. Aendert sich der
 * Wortlaut, aendert sich diese Zahl; alte Datensaetze behalten ihre.
 *
 * KEINE Schwelle, kein Stellwert — eine Fassungsnummer.
 */
export const SEQUENZ_ANLEITUNG_VERSION = 1;

/**
 * Die Schritte in ihrer verbindlichen Reihenfolge.
 *
 * Die Reihenfolge ist Teil der Wiederholbarkeit: wer zuerst von links und
 * dann normal aufnimmt, hat eine andere Adaption des Auges und moeglicher-
 * weise eine andere Handhaltung. Sie wird deshalb festgelegt und
 * mitgeschrieben, nicht dem Zufall ueberlassen.
 */
export const SEQUENZ_SCHRITTE = Object.freeze(FEUCHTE_SEQUENZ_POSITIONEN.map(
  (pos, index) => Object.freeze({
    lichtposition: pos,
    reihenfolge: index + 1,
    /* Textschluessel, nicht Text: die Woerter stehen in i18n.js und
       existieren in beiden Sprachen. */
    anleitung: `sequenzSchritt_${pos}`,
  })));

/** Eine leere Sequenz für eine Zone. */
export function leereSequenz(zoneId = null) {
  return Object.freeze({
    zoneId: zoneId ?? null,
    anleitungVersion: SEQUENZ_ANLEITUNG_VERSION,
    captures: Object.freeze([]),
    /* Ersetzte Aufnahmen verschwinden NICHT. Wer eine Position wiederholt,
       hat einen Grund; der erste Versuch bleibt nachvollziehbar. */
    ersetzt: Object.freeze([]),
  });
}

/** Die nächste noch fehlende Lichtposition, oder null wenn alle da sind. */
export function naechsteLichtposition(sequenz) {
  const vorhanden = new Set((sequenz?.captures || [])
    .map(c => lichtposition(c?.lichtposition)));
  const offen = SEQUENZ_SCHRITTE.find(s => !vorhanden.has(s.lichtposition));
  return offen ? offen.lichtposition : null;
}

/** Der Schritt zu einer Lichtposition (Reihenfolge, Anleitungsschlüssel). */
export function schrittZu(position) {
  return SEQUENZ_SCHRITTE.find(s => s.lichtposition === position) || null;
}

/**
 * Eine Aufnahme in die Sequenz aufnehmen.
 *
 * Regeln, die hier und nirgends sonst gelten:
 *
 *   - Eine Aufnahme aus einer ANDEREN Zone wird abgewiesen. Sonst liesse
 *     sich eine Sequenz aus Bildern verschiedener Stellen zusammensetzen,
 *     und der Feuchtepunkt beriefe sich auf eine Aufnahmeserie, die es so
 *     nie gab.
 *   - Eine unbekannte Lichtposition wird abgewiesen, nicht auf UNBEKANNT
 *     abgerundet. Eine Sequenz mit einer Aufnahme "irgendwo her" ist keine
 *     standardisierte Sequenz.
 *   - Eine wiederholte Position ERSETZT den Eintrag, und der vorherige
 *     wandert nach `ersetzt`. Nichts verschwindet still.
 *
 * @returns {{ sequenz: object, fehler: string|null }}
 */
export function schrittHinzufuegen(sequenz, eintrag) {
  const basis = sequenz || leereSequenz(eintrag?.zoneId ?? null);
  const pos = eintrag?.lichtposition;
  const bekannt = SEQUENZ_SCHRITTE.some(s => s.lichtposition === pos);
  if (!bekannt) {
    return { sequenz: basis, fehler: "UNBEKANNTE_LICHTPOSITION" };
  }
  if (!eintrag?.photoId) {
    return { sequenz: basis, fehler: "PHOTO_ID_FEHLT" };
  }
  const zone = basis.zoneId ?? eintrag.zoneId ?? null;
  if (zone !== null && eintrag.zoneId != null && eintrag.zoneId !== zone) {
    return { sequenz: basis, fehler: "ANDERE_ZONE" };
  }
  const schritt = schrittZu(pos);
  const neu = Object.freeze({
    lichtposition: pos,
    photoId: eintrag.photoId,
    zoneId: zone,
    reihenfolge: schritt.reihenfolge,
    aufgenommenAm: eintrag.aufgenommenAm ?? null,
  });
  const alt = basis.captures.filter(c => lichtposition(c?.lichtposition) === pos);
  const rest = basis.captures.filter(c => lichtposition(c?.lichtposition) !== pos);
  return {
    sequenz: Object.freeze({
      zoneId: zone,
      anleitungVersion: basis.anleitungVersion ?? SEQUENZ_ANLEITUNG_VERSION,
      captures: Object.freeze([...rest, neu]
        .sort((a, b) => (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0))),
      ersetzt: Object.freeze([...basis.ersetzt, ...alt]),
    }),
    fehler: null,
  };
}

/** Eine Aufnahme wieder herausnehmen (Foto gelöscht). */
export function schrittEntfernen(sequenz, photoId) {
  if (!sequenz || !photoId) return sequenz || leereSequenz();
  return Object.freeze({
    ...sequenz,
    captures: Object.freeze(sequenz.captures.filter(c => c.photoId !== photoId)),
    ersetzt: Object.freeze(sequenz.ersetzt.filter(c => c.photoId !== photoId)),
  });
}

/** Vollständigkeit — dieselbe Quelle wie das Feuchte-Tor in assessment.js. */
export function sequenzStatus(sequenz) {
  return feuchteSequenzStatus(sequenz);
}

/**
 * Was für eine WIEDERHOLUNG der Aufnahme im Datensatz stehen muss.
 *
 * Wiederholbarkeit ist nicht "es lief einmal durch". Wiederholbarkeit
 * heisst: eine andere Person kann in vier Wochen dieselbe Aufnahme noch
 * einmal machen. Dafuer braucht sie die Zone, die drei Lichtpositionen,
 * die Reihenfolge, die Anleitungsfassung — und je Aufnahme das
 * Aufnahmeprofil, weil ein anderer Abstand andere Zahlen ergibt.
 *
 * Diese Funktion PRUEFT das, sie ergaenzt nichts. Fehlt ein Stueck, sagt
 * sie welches.
 *
 * @param {object} sequenz
 * @param {Array}  fotos  die Aufnahmen mit ihren captureProfile-Angaben
 */
export function wiederholbarkeit(sequenz, fotos = []) {
  const fehlend = [];
  const status = sequenzStatus(sequenz);
  if (!sequenz?.zoneId) fehlend.push("ZONE");
  if (!status.vollstaendig) fehlend.push(...status.fehlend.map(p => `POSITION_${p}`));
  if (!Number.isInteger(sequenz?.anleitungVersion)) fehlend.push("ANLEITUNGSFASSUNG");
  for (const c of sequenz?.captures || []) {
    if (!Number.isInteger(c.reihenfolge)) fehlend.push(`REIHENFOLGE_${c.lichtposition}`);
    const foto = fotos.find(f => f?.id === c.photoId);
    if (!foto) { fehlend.push(`AUFNAHME_${c.lichtposition}`); continue; }
    const profil = foto.captureProfile;
    if (!(profil?.processedWidth > 0) || !(profil?.processedHeight > 0)) {
      fehlend.push(`AUFNAHMEPROFIL_${c.lichtposition}`);
    }
  }
  return Object.freeze({
    wiederholbar: fehlend.length === 0,
    fehlend: Object.freeze([...new Set(fehlend)]),
  });
}

/**
 * Die Sequenz in der Form, die in den Datensatz geschrieben wird.
 *
 * Keine `undefined`-Werte: `canonicalize` in audit.js weist sie ab, und
 * das waere ein Speicherfehler erst beim Unterschreiben.
 */
export function sequenzFuerDatensatz(sequenz) {
  if (!sequenz || !(sequenz.captures || []).length) return null;
  const eintrag = c => ({
    lichtposition: lichtposition(c?.lichtposition),
    photoId: typeof c?.photoId === "string" ? c.photoId : null,
    zoneId: c?.zoneId ?? null,
    reihenfolge: Number.isInteger(c?.reihenfolge) ? c.reihenfolge : null,
    aufgenommenAm: typeof c?.aufgenommenAm === "string" ? c.aufgenommenAm : null,
  });
  const status = sequenzStatus(sequenz);
  return {
    zoneId: sequenz.zoneId ?? null,
    anleitungVersion: Number.isInteger(sequenz.anleitungVersion)
      ? sequenz.anleitungVersion : null,
    vollstaendig: status.vollstaendig,
    fehlend: [...status.fehlend],
    captures: (sequenz.captures || []).map(eintrag),
    ersetzt: (sequenz.ersetzt || []).map(eintrag),
  };
}

export { LICHTPOSITION };
