/* ─── Testhilfe · vollständige Feuchte-Aufnahmesequenz ────────────────────
   Seit rc.4.26 entsteht aus dem Feuchtealgorithmus kein automatisches
   Trocken-PASS mehr, solange keine standardisierte Aufnahmesequenz
   vorliegt (normal, Streiflicht links, Streiflicht rechts).

   Das ist die gewollte Regel — sie trifft aber jede Suite, die eine
   ordentlich aufgenommene Prüfung VORAUSSETZT, um etwas anderes zu prüfen:
   Kratzerisolation, den QA-Freigabeweg, den Speicherpfad, die
   KI-Zweitmeinung, den Produktpfad.

   Diese Datei gibt allen dieselbe gültige Sequenz. Fünf Kopien desselben
   Literals in fünf Dateien laufen früher oder später auseinander, und dann
   prüfen sie verschiedene Dinge, ohne dass es jemand merkt.

   DAS TOR SELBST wird hier NICHT umgangen: es hat eigene Gegenproben in
   assessmenttest.mjs — A25 (ohne Sequenz), A26 (mit Sequenz), A27 (volle
   Auflösung ohne Sequenz), A29 (Wortlaut), A30 (manuell bestätigbar),
   A31 (übrige Punkte frei), A32 (halbe Sequenz reicht nicht),
   A33 (ein FAIL bleibt FAIL).                                            */

import { LICHTPOSITION } from "../src/capturePaths.js";

/**
 * Eine vollständige Sequenz, wie sie der geführte Aufnahmeablauf liefert.
 *
 * @param {string|null} zoneId  Zone, zu der die Aufnahmen gehören
 */
export function vollstaendigeFeuchteSequenz(zoneId = null) {
  return Object.freeze({
    zoneId,
    captures: Object.freeze([
      Object.freeze({ lichtposition: LICHTPOSITION.NORMAL, photoId: "seq-normal", zoneId }),
      Object.freeze({ lichtposition: LICHTPOSITION.STREIFLICHT_LINKS, photoId: "seq-links", zoneId }),
      Object.freeze({ lichtposition: LICHTPOSITION.STREIFLICHT_RECHTS, photoId: "seq-rechts", zoneId }),
    ]),
  });
}

/** Der Kontext, den buildCheckpoints erwartet. */
export function mitFeuchteSequenz(zoneId = null) {
  return { feuchteSequenz: vollstaendigeFeuchteSequenz(zoneId) };
}
