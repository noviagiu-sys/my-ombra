/* ─── VisuClean · Ehrlichkeitskorrektur der Befundtexte ────────────────────
   EINE Quelle fuer die Formulierungen, die der Analyse-Kern nicht mehr
   aendern darf.

   Warum es diese Datei gibt:
   `src/analysisCore.js` ist byte-identisch zu RC3 festgeschrieben
   (SHA-256 ddc0b9fe3109895f…, `scripts/pack-rc4.mjs` bricht sonst ab).
   Der Kern meldet deshalb weiter den Code ORGANIC_RESIDUE mit dem Text
   "Organische Rueckstaende (braun/gelb)". Gemessen wird aber der Anteil
   warmer Pixel — daraus folgt keine Stoffklasse. Warmes Licht auf sauberem
   Edelstahl erzeugt dieselben warmen Pixel wie ein Produktrueckstand.

   Die Konfliktaufloesung fuer RC4 lautete: Kern unveraendert lassen,
   Formulierung eine Schicht hoeher richtigstellen. Bis rc.4.21 war das nur
   an EINER Stelle durchgezogen — `verdictDisplay` in i18n.js. Der
   Pruefpunkt "Rueckstaende / Sauberkeit" in assessment.js reichte den
   Kerntext roh durch. Auf dem Bildschirm standen daher beide Saetze
   untereinander: die Stoffklassenbehauptung oben, die Richtigstellung
   darunter. Man liest die obere zuerst.

   Zwei Schichten mit demselben Wortlaut, aber getrennten Kopien, laufen
   frueher oder spaeter auseinander. Deshalb diese Datei: beide holen den
   Text hier. A24 prueft die GLEICHHEIT, nicht den Wortlaut — ein Test auf
   einen bestimmten Satz haelt nur bis zur naechsten Umformulierung.

   Bewusst KEINE Abhaengigkeiten: sowohl `assessment.js` (reine
   Bewertungslogik) als auch `i18n.js` (Anzeige) importieren sie.       */

/**
 * Befundcodes, deren Kerntext mehr behauptet, als gemessen wurde.
 *
 * Nur Formulierung — der Code selbst bleibt unveraendert, weil er die
 * Kopplung zur Known-Issue-Logik und zum Datensatz traegt.
 */
export const BEFUND_KORREKTUR = Object.freeze({
  ORGANIC_RESIDUE: Object.freeze({
    /* "Organisch" und "braun/gelb" sind Stoffaussagen. Gemessen ist eine
       Farbabweichung ins Warme, sonst nichts.

       Die Einschraenkung steht seit rc.4.28 IM Befundtext und nicht nur im
       Erlaeuterungsvorspann: der Befundtext wandert allein in Listen,
       Tabellen und Kurzansichten, in denen die Erlaeuterung fehlt. */
    de: "Warme Farbabweichung – Rückstandsverdacht. Keine Stoffklasse bestimmbar.",
    en: "Warm colour deviation – suspected residue. No substance class determinable.",
    detailPrefixDe: "Anteil warmer Pixel. ",
    detailPrefixEn: "Share of warm pixels. ",
  }),
});

/**
 * Befundtexte, die ein FRUEHERER Stand gespeichert hat und die mehr
 * behaupten, als gemessen wurde.
 *
 * Diese Texte stehen in bereits signierten Datensaetzen. Sie duerfen dort
 * NICHT ersetzt werden — ein nachtraeglich umformulierter GMP-Datensatz
 * waere der schwerere Fehler. Stattdessen wird in der ANZEIGE ein
 * abgesetzter Hinweis danebengestellt.
 *
 * Der Text stammt woertlich aus `src/analysisCore.js` (Zeile 246), der
 * byte-identisch zu RC3 festgeschrieben ist. Er ist damit kein geratenes
 * Muster, sondern das Literal, das der Kern bis heute meldet und das die
 * Bewertungsschicht seit rc.4.22 ersetzt.
 */
export const BEFUND_ALTTEXT = Object.freeze({
  ORGANIC_RESIDUE: Object.freeze([
    "Organische Rückstände (braun/gelb)",
  ]),
});

/** Umlaute und Bindestriche vereinheitlichen, damit Schreibvarianten
    ("Rueckstaende") denselben Text bezeichnen. */
function normalisiere(text) {
  return String(text ?? "")
    .replace(/ä|ae/g, "a").replace(/ö|oe/g, "o").replace(/ü|ue/g, "u")
    .replace(/ß|ss/g, "s").replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Traegt ein gespeicherter Befundtext noch die alte Stoffbehauptung?
 *
 * Bewusst KEINE Datums- oder Versionsheuristik: ein Erstellungsdatum
 * belegt keine App-Version, und ein fehlendes appVersion-Feld belegt gar
 * nichts. Geprueft wird der Text selbst — das ist die einzige Angabe, die
 * im Datensatz tatsaechlich steht.
 *
 * @param {string} code   Befundcode aus dem Datensatz
 * @param {string} text   der GESPEICHERTE Anzeigetext
 */
export function istAltbefund(code, text) {
  const alte = BEFUND_ALTTEXT[code];
  if (!alte || !text) return false;
  const gesucht = normalisiere(text);
  return alte.some(alt => gesucht.includes(normalisiere(alt)));
}

/**
 * Der abgesetzte Hinweis zu einem historischen Befundtext.
 *
 * Er ersetzt den Originalbefund nicht und steht nicht im Datensatz — er
 * wird bei jeder Anzeige neu erzeugt.
 */
export const ALTBEFUND_HINWEIS = Object.freeze({
  de: "Historischer Befundtext. Aus der Farbabweichung allein ist keine "
    + "Stoffklasse bestimmbar.",
  en: "Historical finding text. The colour deviation alone does not "
    + "determine a substance class.",
});

/**
 * Die anzuzeigende Bezeichnung eines Befunds.
 *
 * @param {string} code      Befundcode aus dem Analyse-Kern
 * @param {string} rohtext   Was der Kern selbst meldet
 * @param {string} language  "de" oder "en"
 * @returns {string} korrigierte Bezeichnung, sonst der Rohtext
 */
export function befundText(code, rohtext, language = "de") {
  const k = BEFUND_KORREKTUR[code];
  if (!k) return rohtext;
  return language === "en" ? k.en : k.de;
}

/**
 * Der Erlaeuterungstext mit vorangestellter Einordnung, falls noetig.
 *
 * Die Einordnung steht VORNE: sie muss gelesen werden, bevor die Zahl
 * gelesen wird, sonst wirkt die Zahl wie ein Beleg fuer etwas, das sie
 * nicht belegt.
 */
export function befundErlaeuterung(code, rohdetail, language = "de") {
  const k = BEFUND_KORREKTUR[code];
  const detail = rohdetail || "";
  if (!k) return detail;
  const prefix = language === "en" ? k.detailPrefixEn : k.detailPrefixDe;
  return `${prefix}${detail}`.trim();
}
