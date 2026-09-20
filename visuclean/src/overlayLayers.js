/* ─── VisuClean · Anzeigeebenen des Befund-Overlays ────────────────────────
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Der Analyse-Kern rechnet VIER Masken: warme Pixel, helle Pixel, sehr
 * dunkle Pixel und farbneutrale Blockabweichungen gegen das
 * Umgebungsniveau. Die Urteilsfindung waehlt daraus mit einer if/else-Kette
 * GENAU EINEN Sauberkeitscode. paintOverlay leitete die Sichtbarkeit jeder
 * Maske aus genau diesem einen Code ab.
 *
 * Damit schliessen sich warme und farbneutrale Auffaelligkeiten in der
 * ANZEIGE gegenseitig aus, obwohl der Kern beide gerechnet hat. Am
 * gemischten Testfall gemessen (schmutztest.mjs, S1): 3072 px warme Maske
 * sichtbar, 5888 px Anomaliemaske aus 23 Bloecken berechnet und NICHT
 * eingeblendet. Der Pruefer sah die kleinere Haelfte des Befunds und hatte
 * keinen Anhaltspunkt, dass eine zweite existiert.
 *
 * WAS DIESE DATEI AUSDRUECKLICH NICHT TUT
 *
 * Sie aendert kein Urteil, keine Schwelle und keinen Befundtext. Sie
 * erzeugt aus einer Rohmaske KEINEN bestaetigten Schmutz und KEIN
 * zusaetzliches FAIL. analysisCore.js bleibt byte-identisch; die Trennung
 * von Rohmaske und Bewertung ist der Grund, warum diese Ableitung eine
 * Schicht darueber liegt.
 *
 * Was sie leistet: sie macht "berechnet, aber nicht eingeblendet"
 * unterscheidbar von "nicht erkannt". Das sind zwei voellig verschiedene
 * Aussagen, und bis hierher sahen beide gleich aus — naemlich wie nichts.
 *
 * EINE ZAHL OHNE IHRE BEZUGSGROESSE IST KEINE ANGABE
 *
 * Jede Ebene nennt ihre Pixelzahl MIT der Gesamtpixelzahl des
 * Analysebildes. Ein Pixelanteil ist kein Verschmutzungsgrad und keine
 * Stoffmenge; er sagt, wie viel Bildflaeche ein Merkmal beruehrt, sonst
 * nichts. Die Ebenen tragen deshalb `istMessgroesse: false`.
 */

/** Status einer Ebene. Drei Zustaende, und sie sind nicht dasselbe. */
export const EBENEN_STATUS = Object.freeze({
  /* Diese Maske hat das angezeigte Urteil dieses Kriteriums getragen. */
  URTEILSTRAGEND: "URTEILSTRAGEND",
  /* Berechnet, Pixel vorhanden — aber ein anderer Befund hat das Urteil
     dieses Kriteriums belegt. Kein zweites Urteil, kein zweites FAIL. */
  ZUSATZHINWEIS: "ZUSATZHINWEIS",
  /* Die Maske ist leer. Hier gibt es nichts zu zeigen. */
  NICHT_ERKANNT: "NICHT_ERKANNT",
});

/**
 * Das Ebenenregister.
 *
 * `urteilscodes` nennt die Codes, bei denen diese Maske das Urteil ihres
 * Kriteriums traegt — exakt die Zuordnung, die paintOverlay bis rc.4.37
 * fest verdrahtet hatte. Sie steht jetzt an EINER Stelle, damit Anzeige,
 * Datensatz und Protokoll nicht auseinanderlaufen koennen.
 */
export const EBENEN = Object.freeze([
  Object.freeze({
    id: "warm", maskKey: "maskWarm", kriterium: "clean",
    farbe: [251, 146, 60], ringFarbe: "orange",
    de: "Warme Pixel (rot-/braunstichig gegen den Bildhintergrund)",
    en: "Warm pixels (reddish/brownish against the image background)",
    herkunftDe: "Farbabstand Rot minus Blau je Pixel (Merkmal wf)",
    herkunftEn: "Per-pixel red-minus-blue distance (feature wf)",
    urteilscodes: Object.freeze(["ORGANIC_RESIDUE", "LOCAL_RESIDUE"]),
  }),
  Object.freeze({
    id: "anom", maskKey: "maskAnom", kriterium: "clean",
    farbe: [192, 132, 252], ringFarbe: "violet",
    de: "Farbneutrale Helligkeitsabweichung gegen das Umgebungsniveau",
    en: "Colour-neutral brightness deviation from the surrounding level",
    herkunftDe: "Blockweiser Abstand zum 5x5-Median (Merkmale anomBright, anomDark)",
    herkunftEn: "Block distance from the 5x5 median (features anomBright, anomDark)",
    urteilscodes: Object.freeze(["BRIGHT_RESIDUE", "DARK_RESIDUE"]),
  }),
  Object.freeze({
    id: "hell", maskKey: "maskBright", kriterium: "dry",
    farbe: [30, 144, 255], ringFarbe: "blau",
    de: "Helle Pixel (Reflexion oder Saettigung)",
    en: "Bright pixels (reflection or saturation)",
    herkunftDe: "Helligkeit ueber dem geebneten Umgebungsfeld (Merkmal bfr)",
    herkunftEn: "Luminance above the flattened surround field (feature bfr)",
    urteilscodes: Object.freeze(["MOISTURE_SUSPECT", "SPECULAR_REFLECTION"]),
  }),
  Object.freeze({
    id: "dunkel", maskKey: "maskDark", kriterium: "dry",
    farbe: [248, 113, 113], ringFarbe: "rot",
    de: "Sehr dunkle Pixel",
    en: "Very dark pixels",
    herkunftDe: "Helligkeit unter 0,08 (Merkmale dfr, vdfr)",
    herkunftEn: "Luminance below 0.08 (features dfr, vdfr)",
    urteilscodes: Object.freeze(["DARK_WET_SUSPECT"]),
  }),
  Object.freeze({
    id: "kratzer", maskKey: "scratches", kriterium: "intact",
    farbe: [251, 146, 60], ringFarbe: "orange",
    de: "Laengliche Kantenstrukturen",
    en: "Elongated edge structures",
    herkunftDe: "Kantenkomponenten mit Laengen-/Fuellkriterium (Merkmal scratches)",
    herkunftEn: "Edge components with length/fill criterion (feature scratches)",
    urteilscodes: Object.freeze(["SCRATCH_SUSPECT"]),
  }),
]);

const zaehle = maske => {
  if (!maske) return 0;
  let summe = 0;
  for (let i = 0; i < maske.length; i++) if (maske[i]) summe += 1;
  return summe;
};

/**
 * Den Ebenenbestand aus den Merkmalen des Kerns ableiten.
 *
 * Laeuft EINMAL bei der Analyse und erzeugt einen schlichten, serialisier-
 * baren Bestand: je Ebene die Pixelzahl, dazu die Bildgroesse als
 * Bezugsgroesse. Die Masken selbst wandern nicht in den Datensatz — sie
 * sind gross, und fuer die Nachvollziehbarkeit genuegt die Zahl mit ihrem
 * Bezug.
 *
 * @param {Object} features  Rueckgabe von computeFeatures
 * @returns {Object} { w, h, gesamtPixel, warm, anom, hell, dunkel, kratzer }
 */
export function ebenenBestand(features) {
  const masken = features?.masks || {};
  const w = Number(features?.w) || 0;
  const h = Number(features?.h) || 0;
  const bestand = { w, h, gesamtPixel: w * h };
  for (const ebene of EBENEN) {
    bestand[ebene.id] = ebene.maskKey === "scratches"
      ? { pixel: null, anzahl: (features?.scratches || []).length }
      : { pixel: zaehle(masken[ebene.maskKey]), anzahl: null };
  }
  /* Blockzahlen, weil die Anomalieebene blockweise entsteht und "23
     Bloecke" fuer einen Pruefer aussagekraeftiger ist als "5888 px". */
  bestand.anom.bloeckeHell = Number(features?.anomBright) || 0;
  bestand.anom.bloeckeDunkel = Number(features?.anomDark) || 0;
  bestand.warm.bloecke = Number(features?.warmBlocks) || 0;
  return bestand;
}

/**
 * Die Anzeigeebenen eines Fotos.
 *
 * REIN. Gleicher Bestand und gleiche Codes ergeben dieselbe Liste — das
 * ist die Voraussetzung dafuer, dass ein gespeicherter Bericht dieselbe
 * Aussage traegt wie der Bildschirm bei der Aufnahme.
 *
 * `standardSichtbar` ist genau dann wahr, wenn die Ebene das Urteil ihres
 * Kriteriums traegt. Damit zeigt die Voreinstellung exakt das Bild, das
 * rc.4.37 gezeigt hat; alles Zusaetzliche ist zuschaltbar und als
 * Zusatzhinweis beschriftet. Ein Zusatzhinweis ist kein Urteil.
 *
 * @param {Object} bestand  Rueckgabe von ebenenBestand
 * @param {Object} verdictCodes  { dry, clean, intact }
 * @returns {Array} Ebenenliste
 */
export function befundEbenen(bestand, verdictCodes = {}) {
  const b = bestand || {};
  return EBENEN.map(ebene => {
    const eintrag = b[ebene.id] || {};
    const menge = ebene.maskKey === "scratches"
      ? (Number(eintrag.anzahl) || 0)
      : (Number(eintrag.pixel) || 0);
    const traegtUrteil = ebene.urteilscodes.includes(verdictCodes?.[ebene.kriterium]);
    const status = menge === 0
      ? EBENEN_STATUS.NICHT_ERKANNT
      : traegtUrteil ? EBENEN_STATUS.URTEILSTRAGEND : EBENEN_STATUS.ZUSATZHINWEIS;
    return Object.freeze({
      id: ebene.id,
      maskKey: ebene.maskKey,
      kriterium: ebene.kriterium,
      de: ebene.de, en: ebene.en,
      herkunftDe: ebene.herkunftDe, herkunftEn: ebene.herkunftEn,
      status,
      /* Rohzahl mit Bezugsgroesse. Kein Anteil, kein Grad, keine Menge. */
      pixel: ebene.maskKey === "scratches" ? null : menge,
      anzahl: ebene.maskKey === "scratches" ? menge : null,
      gesamtPixel: Number(b.gesamtPixel) || 0,
      bloecke: ebene.id === "anom"
        ? { hell: Number(eintrag.bloeckeHell) || 0, dunkel: Number(eintrag.bloeckeDunkel) || 0 }
        : ebene.id === "warm" ? { warm: Number(eintrag.bloecke) || 0 } : null,
      standardSichtbar: status === EBENEN_STATUS.URTEILSTRAGEND,
      /* Damit niemand spaeter einen Verschmutzungsgrad daraus liest. */
      istMessgroesse: false,
    });
  });
}

/**
 * Die Ebenen, die ohne Zutun des Pruefers eingeblendet werden.
 *
 * Unveraendert gegenueber rc.4.37: genau die urteilstragenden. Eine
 * Rohmaske blendet sich nicht von selbst ein.
 */
export function standardEbenen(ebenen = []) {
  return ebenen.filter(e => e.standardSichtbar).map(e => e.id);
}

/**
 * Ebenen, die berechnet wurden, aber in der Voreinstellung nicht zu sehen
 * sind. Genau die Menge, die vor dieser Fassung verloren ging.
 */
export function verdeckteEbenen(ebenen = []) {
  return ebenen.filter(e => e.status === EBENEN_STATUS.ZUSATZHINWEIS);
}

/**
 * Eine Ebene in einem Satz beschreiben — fuer Bildschirm und Protokoll aus
 * DERSELBEN Quelle, damit die beiden nicht auseinanderlaufen koennen.
 */
export function ebenenText(ebene, sprache = "de") {
  const de = sprache !== "en";
  const name = de ? ebene.de : ebene.en;
  if (ebene.status === EBENEN_STATUS.NICHT_ERKANNT) {
    return `${name}: ${de ? "nicht erkannt" : "not detected"}`;
  }
  const menge = ebene.pixel === null
    ? `${ebene.anzahl} ${de ? "Struktur(en)" : "structure(s)"}`
    : `${ebene.pixel} ${de ? "von" : "of"} ${ebene.gesamtPixel} px`;
  const bloecke = ebene.bloecke
    ? ebene.id === "anom"
      ? ` · ${ebene.bloecke.hell + ebene.bloecke.dunkel} ${de ? "Bildzonen" : "image zones"}`
        + ` (${ebene.bloecke.hell} ${de ? "hell" : "bright"}, ${ebene.bloecke.dunkel} ${de ? "dunkel" : "dark"})`
      : ` · ${ebene.bloecke.warm} ${de ? "Bildzonen" : "image zones"}`
    : "";
  const lage = ebene.status === EBENEN_STATUS.URTEILSTRAGEND
    ? (de ? "eingeblendet, traegt das Urteil dieses Kriteriums"
      : "displayed, carries this criterion's verdict")
    : (de ? "berechnet, in der Voreinstellung NICHT eingeblendet - Zusatzhinweis, kein Urteil"
      : "computed, NOT displayed by default - advisory, not a verdict");
  return `${name}: ${menge}${bloecke} · ${lage}`;
}
