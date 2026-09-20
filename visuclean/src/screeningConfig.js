/* ─── VisuClean · Konfiguration des Kratzer-Screenings ────────────────────
   Punkt 4 der Spezifikation: "Alle Schwellen und Pfade in einer externen
   Konfig, NICHT hart im Code — Nachjustieren ohne Release."

   WIE DAS HIER GEHT, UND WO DIE GRENZE LIEGT
   Die Datei public/screening.config.json wird mit ausgeliefert und vom
   Service Worker zwischengespeichert. Sie laesst sich am Server
   austauschen, ohne die Anwendung neu zu bauen. Das ist "ohne Release"
   im praktischen Sinn.

   Was es NICHT ist: eine Datei auf dem Geraet. Eine Browser-PWA hat kein
   Dateisystem. Wer im Reinraum offline nachjustieren will, braucht den Weg
   ueber die Einstellungen und die lokale Datenbank — das ist nicht gebaut
   und wird hier nicht behauptet.

   JEDER WERT WIRD GEPRUEFT
   Eine kaputte oder manipulierte Konfiguration darf nicht dazu fuehren,
   dass das Screening stillschweigend Unsinn rechnet. Unplausible Werte
   werden EINZELN verworfen, der Standardwert greift, und der Grund steht
   im Ergebnis. Nie ein stiller Ruecksprung auf Standard ohne Vermerk.

   Die Konfiguration steuert ausschliesslich die AUFMERKSAMKEIT. Sie kann
   kein Urteil aendern und kein PASS erzeugen — das Screening fuegt nur
   hinzu und sortiert. Deshalb ist sie frei einstellbar, obwohl die
   Kalibrierungskampagne noch aussteht.                                   */

import { SCREENING_STELLWERTE } from "./scratchScreening.js";
import { sha256Hex } from "./audit.js";

/* Zulaessige Bereiche. Bewusst weit: sie sollen Unsinn abfangen
   (negative Laengen, Kachelgroesse 0), nicht die Einstellung bevormunden. */
const BEREICHE = Object.freeze({
  edgeThreshold:      { min: 0.01, max: 0.95 },
  tileSize:           { min: 8,    max: 256,  ganz: true },
  minComponentPixels: { min: 1,    max: 10000, ganz: true },
  grindToleranceDeg:  { min: 0,    max: 45 },
  slenderReference:   { min: 1,    max: 50 },
  maxDimension:       { min: 128,  max: 8192, ganz: true },
  orientationBins:    { min: 6,    max: 360,  ganz: true },
});

/**
 * Liest eine Konfiguration und liefert geprueft uebernehmbare Stellwerte.
 *
 * @param {object|string|null} eingabe  JSON-Text oder bereits geparst
 * @returns {{options: object, uebernommen: string[], verworfen: Array,
 *            quelle: string}}
 */
export function parseScreeningConfig(eingabe) {
  const verworfen = [];
  const uebernommen = [];
  let roh = null;
  let quelle = "STANDARD";

  if (typeof eingabe === "string") {
    try { roh = JSON.parse(eingabe); quelle = "JSON"; }
    catch (fehler) {
      verworfen.push({ feld: "(gesamt)", grund: "UNGUELTIGES_JSON",
        detail: String(fehler?.message || fehler) });
      roh = null;
    }
  } else if (eingabe && typeof eingabe === "object") {
    roh = eingabe;
    quelle = "OBJEKT";
  }

  const options = { ...SCREENING_STELLWERTE };
  if (roh && typeof roh === "object") {
    for (const [feld, bereich] of Object.entries(BEREICHE)) {
      if (!(feld in roh)) continue;
      const wert = roh[feld];
      if (typeof wert !== "number" || !Number.isFinite(wert)) {
        verworfen.push({ feld, grund: "KEINE_ZAHL", wert });
        continue;
      }
      if (bereich.ganz && !Number.isInteger(wert)) {
        verworfen.push({ feld, grund: "KEINE_GANZE_ZAHL", wert });
        continue;
      }
      if (wert < bereich.min || wert > bereich.max) {
        verworfen.push({ feld, grund: "AUSSERHALB_BEREICH", wert,
          erlaubt: `${bereich.min}..${bereich.max}` });
        continue;
      }
      options[feld] = wert;
      uebernommen.push(feld);
    }
    /* Unbekannte Felder werden benannt, nicht ignoriert: meist ein
       Tippfehler, und ein stillschweigend wirkungsloser Eintrag ist
       schlimmer als eine Meldung. */
    for (const feld of Object.keys(roh)) {
      if (feld === "note" || feld === "$schema") continue;
      if (!(feld in BEREICHE)) verworfen.push({ feld, grund: "UNBEKANNTES_FELD" });
    }
  }

  return Object.freeze({
    options: Object.freeze(options),
    uebernommen: Object.freeze(uebernommen),
    verworfen: Object.freeze(verworfen),
    quelle,
  });
}


/* ── Laden im Produktpfad ─────────────────────────────────────────────── */

/** Wo die ausgelieferte Konfiguration liegt. Same-Origin, kein externer Host. */
export const CONFIG_PFAD = "screening.config.json";

/**
 * Laedt die Konfiguration und bindet sie nachvollziehbar an die Analyse.
 *
 * Der Abruf wird als PARAMETER hereingereicht, nicht importiert: so laesst
 * sich der Weg ohne Browser pruefen. In rc.4.19 existierten Datei und
 * Parser, aber App.jsx hat beide nie benutzt — die Zusage "ohne Release
 * nachjustierbar" war damit unerfuellt. Befund der unabhaengigen
 * Gegenpruefung, zutreffend.
 *
 * KEIN stiller Ruecksprung: schlaegt der Abruf fehl (offline, Datei fehlt,
 * kaputtes JSON), greifen die paketgebundenen Stellwerte, und quelle sagt
 * WARUM. Das ist kein Netzwerk-Fallback im Sinn von Regel 1 — es wird
 * nichts nachgeladen, was die App nicht ohnehin mitbringt.
 *
 * configHash bindet das Ergebnis an genau den Text, der gewirkt hat. Zwei
 * Analysen mit verschiedenen Einstellungen sind dadurch unterscheidbar,
 * und eine spaetere Aenderung deutet keine gespeicherte Pruefung um.
 *
 * @param {Function} abruf  async (pfad) => { ok, text() }  (z. B. fetch)
 * @returns {Promise<{options, quelle, verworfen, uebernommen, configHash}>}
 */
export async function ladeScreeningConfig(abruf, pfad = CONFIG_PFAD) {
  const paketgebunden = async (grund) => ({
    options: Object.freeze({ ...SCREENING_STELLWERTE }),
    quelle: grund,
    uebernommen: Object.freeze([]),
    verworfen: Object.freeze([]),
    /* Auch der Ruecksprung wird gehasht: ein Datensatz ohne Hash liesse
       offen, mit welchen Werten er entstanden ist. */
    configHash: await sha256Hex(JSON.stringify(SCREENING_STELLWERTE)),
  });

  if (typeof abruf !== "function") return paketgebunden("PAKET_KEIN_ABRUF");

  let text = null;
  try {
    const antwort = await abruf(pfad);
    if (!antwort || antwort.ok === false) return paketgebunden("PAKET_ABRUF_FEHLGESCHLAGEN");
    text = await antwort.text();
  } catch {
    return paketgebunden("PAKET_OFFLINE");
  }
  if (typeof text !== "string" || !text.trim()) return paketgebunden("PAKET_LEER");

  const gelesen = parseScreeningConfig(text);
  return {
    options: gelesen.options,
    quelle: gelesen.quelle === "JSON" ? "DATEI" : "PAKET_UNGUELTIGES_JSON",
    uebernommen: gelesen.uebernommen,
    verworfen: gelesen.verworfen,
    configHash: await sha256Hex(text),
  };
}
