/* ─── VisuClean · PDF-Inhaltstest ──────────────────────────────────────────
   Aufruf: node pdftest.mjs

   Dieser Test existiert wegen eines konkreten Fehlers.

   In rc.4.7 stand in pdfExport.js `const result = record.aggregate;` und
   zwei Zeilen weiter `const fusion = result.fusionSummary;`. Die
   Mehrwinkelauswertung wurde also am falschen Objekt gesucht und erschien
   NIE im Protokoll. Der Fehler ueberlebte eine vollstaendig gruene Suite,
   weil kein Test je ein erzeugtes PDF GELESEN hat — geprueft wurde nur,
   dass der Export nicht wirft.

   Ebenso stand im Kopf "Pruefer: record.user". Bei nachgereichter Freigabe
   traegt record.user den GENEHMIGER; das Protokoll schrieb ihn damit als
   Pruefer aus — eine falsche Zuschreibung in einem GMP-Dokument.

   Beides wird hier am erzeugten Dokument geprueft, nicht am Quelltext.  */

import { exportInspectionPdf } from "./src/pdfExport.js";
import { buildInspectionRecord, SIGNATURE_MEANING } from "./src/inspectionRecord.js";
import { LIFECYCLE_STATE } from "./src/lifecycle.js";
import { buildCheckpoints } from "./src/assessment.js";
import { aggregateResults, deriveSystemDecision } from "./src/domain.js";
import { CAPTURE_PATH, captureProfile } from "./src/decision.js";
import { existsSync } from "node:fs";
import { inflateSync } from "node:zlib";

/* jsPDF komprimiert Inhaltsstroeme mit FlateDecode. Ein Test, der nur den
   Rohpuffer durchsucht, findet dann NICHTS und waere still gruen oder
   still rot — beides wertlos. Die Stroeme werden deshalb ausgepackt.

   Faellt das Auspacken, meldet der Test das ausdruecklich, statt eine
   Aussage zu treffen, die er nicht belegen kann. */
function entpacke(puffer) {
  const roh = puffer.toString("latin1");
  let text = roh;
  const muster = /stream\r?\n/g;
  let treffer;
  while ((treffer = muster.exec(roh)) !== null) {
    const start = treffer.index + treffer[0].length;
    const ende = roh.indexOf("endstream", start);
    if (ende < 0) continue;
    try {
      text += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1");
    } catch { /* unkomprimierter Strom — steht bereits im Rohtext */ }
  }
  return text;
}

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · PDF-Inhalt\n");

/* KEINE NEBENWIRKUNG. Befund der Gegenpruefung an rc.4.8: dieser Test
   schrieb `VisuClean_insp-pdf.pdf` ins Projektverzeichnis. Die Datei ist im
   Manifest gelistet und wird bei jedem Lauf mit anderem Inhalt neu erzeugt
   — `npm run verify` veraenderte damit das Paket, das es prueft, und
   `manifest:check` fiel danach mit Exit 1.

   `save()` wird deshalb VOR dem Export abgefangen. Der Test liest den
   Dokumentinhalt aus dem Speicher; auf die Platte wird nichts geschrieben. */
const { jsPDF } = await import("jspdf");
let gespeichertAls = null;
jsPDF.API.save = function abgefangen(name) { gespeichertAls = name; return this; };

/* ── Ueberstandsmessung ──────────────────────────────────────────────────
   Befund der Gegenpruefung vom 16.09.2026: Text ragte bis zu 103 mm ueber
   den Seitenrand hinaus, und der Inhaltstest merkte davon nichts — er
   liest den Textstrom, und dort steht der Text vollstaendig drin, egal wo
   er auf dem Papier landet. Person, Herkunft und Urteil fehlten auf dem
   gedruckten Blatt.

   Eine Inhaltspruefung kann diesen Fehler grundsaetzlich nicht finden.
   Gemessen wird deshalb die GEOMETRIE: jeder Textaufruf wird abgefangen
   und seine Breite bei der dann geltenden Schriftgroesse bestimmt.

   ACHTUNG, eigener Fehlgriff vom selben Tag: der erste Versuch ersetzte
   `jsPDF.API.text`. Dort steht `text` gar nicht — jsPDF legt die Methode
   als EIGENE Eigenschaft jeder Instanz an. `jsPDF.API.text` war also
   `undefined`, der Export stuerzte bei jedem Textaufruf ab, und die
   Ueberstandsliste blieb leer: P17 meldete GRUEN, weil NICHTS gemessen
   wurde. Ein Beweis, der gruen ist, weil er nicht laeuft, ist schlimmer
   als gar kein Beweis.

   Deshalb zwei Dinge: gehaengt wird am `initialized`-Ereignis, wo die
   Instanz ihre `text`-Methode bereits traegt — und der Zaehler
   `gemesseneZeilen` belegt, dass die Messung ueberhaupt stattgefunden
   hat. P17 verlangt beides.                                            */
const PDF_RAND_MM = 14;
const ueberstand = [];
let gemesseneZeilen = 0;
jsPDF.API.events.push(["initialized", function messungEinhaengen() {
  const originalText = this.text;
  if (typeof originalText !== "function") return;
  this.text = function gemessen(inhalt, x, y, ...rest) {
    try {
      const seitenbreite = this.internal.pageSize.getWidth();
      const teile = Array.isArray(inhalt) ? inhalt : [inhalt];
      for (const teil of teile) {
        const text = String(teil ?? "");
        if (!text || typeof x !== "number") continue;
        const breite = this.getTextWidth(text);
        gemesseneZeilen += 1;
        const ueber = (x + breite) - (seitenbreite - PDF_RAND_MM);
        if (ueber > 0.5) {
          ueberstand.push({ text: text.slice(0, 48), x, breite, ueber });
        }
      }
    } catch { /* Messung darf den Export nie verhindern */ }
    return originalText.call(this, inhalt, x, y, ...rest);
  };
}]);

globalThis.URL = globalThis.URL || {};
globalThis.URL.createObjectURL = () => "blob:test";
globalThis.URL.revokeObjectURL = () => {};

const NOW = "2026-09-09T10:00:00.000Z";
const MERKMALE = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
const URTEIL = { dry: { pass: true, code: "PASS" }, clean: { pass: true, code: "PASS" }, intact: { pass: true, code: "PASS" } };

function ergebnis() {
  return {
    dry: { ...URTEIL.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...URTEIL.clean, message: "", detail: "", severity: 0, action: "" },
    intact: { ...URTEIL.intact, message: "", detail: "", severity: 0, action: "" },
    lm: 0.6, hints: [], checkpoints: buildCheckpoints(MERKMALE, URTEIL),
  };
}

const fotos = [{
  id: "photo-1", image: "data:image/jpeg;base64,QUJD", annotatedImage: "data:image/jpeg;base64,QUJD",
  markers: [], markerAssessments: [], result: ergebnis(), knownIssueInfo: null,
  captureProfile: captureProfile({
    processedWidth: 480, processedHeight: 640,
    sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
  }),
}];
const aggregat = aggregateResults([ergebnis()]);

const datensatz = buildInspectionRecord({
  id: "insp-pdf", appVersion: "8.3.0-rc.4.8", now: NOW,
  /* Der aktive Benutzer ist der GENEHMIGER — genau der Fall, in dem die
     alte Fassung ihn faelschlich als Pruefer ausgab. */
  /* Der displayName ist ein eindeutiges Token. Er gelangt NUR ueber
     record.user.displayName ins Dokument — also genau dann, wenn der
     Genehmiger faelschlich als Pruefer ausgegeben wird. Mehrwortige
     Zeichenketten ueberleben die Kerning-Aufteilung im PDF nicht, ein
     einzelnes Token schon. */
  user: { username: "qa_manager", role: "QA Manager", displayName: "Genehmigerkennung" },
  eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: fotos, aggregate: aggregat,
  originalSystemDecision: deriveSystemDecision(aggregat),
  finalDecision: "PASS",
  performedBy: { username: "operator1", role: "Operator", at: NOW },
  approvedBy: { username: "qa_manager", role: "QA Manager", at: NOW },
  reauthenticated: true,
  signature: {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_PASS],
    signedAt: NOW, signedBy: "qa_manager",
  },
  fusionSummary: {
    status: "NO_DETECTOR", usedCount: 2, poseSpread: 0.19, meaningful: true,
    excluded: [{ sequenceIndex: 2, reason: "LABEL_NOT_DETECTED" }],
  },
});

/* Der Export ruft doc.save(). Wir fangen den Text stattdessen ueber die
   jsPDF-interne Textsammlung ab, indem wir das erzeugte Dokument als
   Zeichenkette auslesen. */
let text = "";
let fehler = "";
try {
  const doc = exportInspectionPdf(datensatz, "de");
  /* exportInspectionPdf gibt das Dokument zurueck ODER speichert es. Beides
     wird unterstuetzt: liegt ein Dokument vor, wird sein Rohinhalt gelesen. */
  const roh = doc?.output ? doc.output("datauristring") : "";
  const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
  text = entpacke(bytes);
} catch (caught) { fehler = String(caught?.message || caught); }

/* P6/P7 - Befund aus dem Bedienlauf vom 11.09.2026.

   Das Protokoll einer QA-SPERRUNG trug im Kopf "Freigabe zu: <ID>". Der
   Entscheid war eine Sperrung; das Dokument behauptete an dieser Stelle
   das Gegenteil. Eine falsche Etikettierung in einem GMP-Protokoll wiegt
   schwerer als ein Schreibfehler - sie ist inhaltlich unwahr.

   Dazu stand daneben "Geprueffte Revision" mit doppeltem f.

   Geprueft wird am erzeugten Dokument, nicht am Quelltext.            */
const sperrDatensatz = buildInspectionRecord({
  id: "insp-pdf-block", appVersion: "8.3.0-rc.4.14", now: NOW,
  user: { username: "qa_manager", role: "QA Manager", displayName: "QA Manager" },
  eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: fotos, aggregate: aggregat,
  originalSystemDecision: deriveSystemDecision(aggregat),
  finalDecision: "FAIL",
  performedBy: { username: "operator1", role: "Operator", at: NOW },
  approvedBy: { username: "qa_manager", role: "QA Manager", at: NOW },
  reauthenticated: true,
  supersedesId: "insp-pdf-pending",
  approvalRevisionHash: "e".repeat(64),
  approvalComment: "Nachreinigung angeordnet",
  signature: {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
    signedAt: NOW, signedBy: "qa_manager",
  },
});

let sperrText = ""; let sperrFehler = "";
try {
  const doc = exportInspectionPdf(sperrDatensatz, "de");
  const roh = doc?.output ? doc.output("datauristring") : "";
  const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
  sperrText = entpacke(bytes);
} catch (caught) { sperrFehler = String(caught?.message || caught); }

ok("P6", "Ein Sperrprotokoll nennt den Bezug nicht \"Freigabe\"",
  !sperrFehler && sperrText.length > 0 && !/Freigabe zu/.test(sperrText),
  sperrFehler ? `ABSTURZ: ${sperrFehler}`
    : /Freigabe zu/.test(sperrText)
      ? "das Sperrprotokoll behauptet eine Freigabe"
      : "neutraler Bezug, kein Freigabe-Wortlaut");

ok("P7", "Kein Schreibfehler \"Geprueffte\" im Protokollkopf",
  !sperrFehler && !/Geprueffte/.test(sperrText),
  /Geprueffte/.test(sperrText) ? "doppeltes f im Protokollkopf" : "sauber geschrieben");

/* P8/P9 - Befund der unabhaengigen Gegenpruefung an rc.4.19:
   Persistenz und PDF speicherten nur eine Zusammenfassung der Fusion,
   nicht die einzelnen Screening-Kandidaten. Ein Hinweis, der nicht im
   Protokoll steht, ist spaeter nicht nachvollziehbar - und genau das ist
   der Zweck des Protokolls.

   Geprueft wird am erzeugten Dokument, nicht am Quelltext.            */
const screeningDatensatz = buildInspectionRecord({
  id: "insp-pdf-screening", appVersion: "8.3.0-rc.4.31", now: NOW,
  user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
  eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: fotos, aggregate: aggregat,
  originalSystemDecision: deriveSystemDecision(aggregat),
  finalDecision: "FAIL",
  performedBy: { username: "operator1", role: "Operator", at: NOW },
  reauthenticated: true,
  signature: {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
    signedAt: NOW, signedBy: "operator1",
  },
  screening: {
    configHash: "abc123def456" + "0".repeat(52),
    configQuelle: "DATEI",
    photos: [{
      photoId: fotos[0].id, candidateCount: 7, suppressedCount: 4,
      grindDirectionDeg: 12.5,
      candidates: [{
        rank: 1, boundingBox: { minX: 10, minY: 20, maxX: 90, maxY: 26 },
        lengthRel: 0.42, widthRel: 0.01, orientationDeg: 88,
        grindDeltaDeg: 75.5, edgeStrength: 0.61, relevanceScore: 0.2711,
        alignedWithGrind: false,
      }],
    }],
  },
});

let screeningText = ""; let screeningFehler = "";
try {
  const doc = exportInspectionPdf(screeningDatensatz, "de");
  const roh = doc?.output ? doc.output("datauristring") : "";
  const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
  screeningText = entpacke(bytes);
} catch (caught) { screeningFehler = String(caught?.message || caught); }

ok("P8", "Das Protokoll nennt die Screening-Kandidaten",
  !screeningFehler && /Screening/i.test(screeningText)
  && /75[.,]5/.test(screeningText),
  screeningFehler ? `ABSTURZ: ${screeningFehler}`
    : /Screening/i.test(screeningText) ? "Kandidat mit Winkelabstand im Dokument"
      : "die Kandidaten fehlen im Protokoll");

ok("P9", "Das Protokoll bindet die verwendete Konfiguration",
  !screeningFehler && /abc123def456/.test(screeningText),
  /abc123def456/.test(screeningText)
    ? "Konfigurations-SHA-256 im Dokument"
    : "der Konfigurationsbezug fehlt - spaeter nicht nachvollziehbar");

/* P10 - Richtung, Rohwert, Faecherzahl und Auswirkung im Protokoll.
   Vereinbart: Rohwert, Richtung und Anzahl gehoeren in Datensatz, JSON
   UND PDF. Ein Test muss pruefen, dass sie dort tatsaechlich ankommen -
   sonst bleibt es bei der Absicht.                                     */
const staerkeDatensatz = buildInspectionRecord({
  id: "insp-pdf-staerke", appVersion: "8.3.0-rc.4.31", now: NOW,
  user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
  eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: fotos, aggregate: aggregat,
  originalSystemDecision: deriveSystemDecision(aggregat),
  finalDecision: "FAIL",
  performedBy: { username: "operator1", role: "Operator", at: NOW },
  reauthenticated: true,
  signature: {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
    signedAt: NOW, signedBy: "operator1",
  },
  screening: {
    configHash: "f".repeat(64), configQuelle: "DATEI",
    photos: [{
      photoId: fotos[0].id, candidateCount: 7, suppressedCount: 4,
      grindDirectionDeg: 2.5, grindStrength: 0.141, orientationBins: 36,
      candidates: [{
        rank: 1, boundingBox: { minX: 1, minY: 2, maxX: 9, maxY: 4 },
        lengthRel: 0.42, widthRel: 0.01, orientationDeg: 88,
        grindDeltaDeg: 75.5, edgeStrength: 0.61,
        relevanceScore: 0.2711, relevanceScoreUngerichtet: 0.2800,
        alignedWithGrind: false,
      }],
    }],
  },
});

let staerkeText = ""; let staerkeFehler = "";
try {
  const doc = exportInspectionPdf(staerkeDatensatz, "de");
  const roh = doc?.output ? doc.output("datauristring") : "";
  const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
  staerkeText = entpacke(bytes);
} catch (caught) { staerkeFehler = String(caught?.message || caught); }

/* Die Pruefungen greifen die BESCHRIFTETEN Angaben ab, nicht nur die
   Ziffern: "36" und "4" stehen in nahezu jedem Protokoll irgendwo. Eine
   Zahl ohne ihre Beschriftung belegt nicht, dass die Angabe angekommen
   ist - sie belegt nur, dass irgendwo eine Ziffer steht. */
const hatRohwert = /Richtungsstaerke\s*0[.,]141/.test(staerkeText);
const hatFaecher = /36\s*Winkelfaecher/.test(staerkeText);
const hatNichtKalibriert = /Zuverlaessigkeit nicht kalibriert/.test(staerkeText);
const hatAuswirkung = /4\s*wegen Richtung niedriger bewertet/.test(staerkeText);
/* Beide Rangfolgen muessen im Protokoll stehen, nicht nur die gerichtete. */
const hatUngerichtet = /ohne Richtungsabwertung\s*0[.,]2800/.test(staerkeText);
/* Kein Prozentzeichen an der Richtungsstaerke. */
const ohneProzent = !/0[.,]141\s*%|14[.,]1\s*%/.test(staerkeText);
ok("P10", "Das Protokoll nennt Richtungsstaerke, Faecherzahl und Auswirkung",
  !staerkeFehler && hatRohwert && hatFaecher && hatNichtKalibriert && hatAuswirkung
    && hatUngerichtet && ohneProzent,
  staerkeFehler ? `ABSTURZ: ${staerkeFehler}`
    : `Rohwert ${hatRohwert} · Faecher ${hatFaecher}`
      + ` · nicht kalibriert ${hatNichtKalibriert} · Auswirkung ${hatAuswirkung}`
      + ` · zweite Rangfolge ${hatUngerichtet} · ohne Prozent ${ohneProzent}`);

/* P11 - Das Protokoll ordnet nach der ungerichteten Rangfolge und sagt es
   Im PDF gibt es keine Umschaltung. Welche Reihenfolge dort steht, ist
   also endgueltig - und sie muss dieselbe konservative sein wie auf dem
   Bildschirm (U25): die ungerichtete unterdrueckt niemanden.

   Zusaetzlich muss das Dokument BENENNEN, wonach es geordnet ist. Eine
   Liste ohne Angabe ihrer Ordnung laedt dazu ein, den ersten Eintrag fuer
   den schlimmsten Befund zu halten.                                    */
/* Ein Wischtest und ein Ebenenbestand haengen bewusst an DIESEM Datensatz:
   P17 misst die Geometrie JEDER gezeichneten Zeile, und damit sind beide
   neuen Bloecke automatisch gegen Abschneiden gesichert. Ein Block, den
   kein Datensatz der Suite erzeugt, wird von P17 auch nicht gemessen. */
const WISCH_EBENEN = [
  { id: "warm", status: "URTEILSTRAGEND", pixel: 2640, anzahl: null,
    gesamtPixel: 76800, de: "Warme Pixel (rot-/braunstichig gegen den Bildhintergrund)",
    en: "Warm pixels", bloecke: { warm: 12 } },
  { id: "anom", status: "ZUSATZHINWEIS", pixel: 5888, anzahl: null,
    gesamtPixel: 76800, de: "Farbneutrale Helligkeitsabweichung gegen das Umgebungsniveau",
    en: "Colour-neutral brightness deviation", bloecke: { hell: 12, dunkel: 11 } },
  { id: "hell", status: "NICHT_ERKANNT", pixel: 0, anzahl: null,
    gesamtPixel: 76800, de: "Helle Pixel (Reflexion oder Saettigung)",
    en: "Bright pixels", bloecke: null },
];
const wischFotos = [0, 1].map(index => ({
  id: `swab-${index}`, image: "data:image/jpeg;base64,QUJD",
  annotatedImage: "data:image/jpeg;base64,QUJD",
  markers: [], markerAssessments: [], result: ergebnis(),
}));
/* Nur die Feuchtigkeit sinkt. Die alte Summenregel haette daraus
   "Rueckstand moeglich" gemacht; der getrennte Vergleich sagt, dass der
   Sauberkeitsbefund unveraendert ist. */
const WISCHTEST = {
  performedAt: NOW, photos: wischFotos,
  comparison: {
    aussage: "SCHMUTZBEFUND_UNVERAENDERT",
    kriterien: {
      dry: { kriterium: "dry", vorher: 60, nachher: 0, differenz: -60,
        richtung: "GESUNKEN", vorherCode: "MOISTURE_SUSPECT", nachherCode: "PASS" },
      clean: { kriterium: "clean", vorher: 35, nachher: 35, differenz: 0,
        richtung: "GLEICH", vorherCode: "LOCAL_RESIDUE", nachherCode: "LOCAL_RESIDUE" },
      intact: { kriterium: "intact", vorher: 0, nachher: 0, differenz: 0,
        richtung: "GLEICH", vorherCode: "PASS", nachherCode: "PASS" },
    },
    einschraenkungen: ["AUSSCHNITT_NICHT_BELEGT", "LICHT_NICHT_BELEGT"],
  },
};

const ordnungsDatensatz = buildInspectionRecord({
  swabTest: WISCHTEST,
  /* Eine Tiefenmessung im Grenzfall: 1,20 +/- 0,30 reicht von 0,90 bis
     1,50 und schneidet die Grenze. Das Protokoll muss genau das drucken
     und nicht etwa "ueberschritten" — der Punktwert allein laege darueber. */
  depthMeasurements: [{
    photoId: "photo-1", kandidatId: "K02", markerId: null,
    valueUm: "1,20", unit: "\u00b5m", method: "TASTSCHNITT",
    uncertaintyUm: "0,30", measuredAt: NOW, measuredBy: "m.koch",
    source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
  }, {
    /* Eine UEBERSEHENE Riefe: manuell markiert, vom Detektor nie
       angeboten. Bis rc.4.35 erschien sie im Protokoll als
       "Tiefenmessung —" — die Kennung ging verloren. */
    photoId: "photo-1", kandidatId: null, markerId: "M01",
    valueUm: "2,40", unit: "\u00b5m", method: "TASTSCHNITT",
    uncertaintyUm: "0,10", measuredAt: NOW, measuredBy: "m.koch",
    source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
  }],
  id: "insp-pdf-ordnung", appVersion: "8.3.0-rc.4.31", now: NOW,
  user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
  eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
  photos: fotos.map(f => ({ ...f,
    result: { ...f.result, overlayLayers: WISCH_EBENEN.map(e => ({ ...e })) } })),
  aggregate: aggregat,
  originalSystemDecision: deriveSystemDecision(aggregat),
  finalDecision: "FAIL",
  performedBy: { username: "operator1", role: "Operator", at: NOW },
  reauthenticated: true,
  signature: {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
    signedAt: NOW, signedBy: "operator1",
  },
  screening: {
    configHash: "a".repeat(64), configQuelle: "DATEI",
    photos: [{
      photoId: fotos[0].id, candidateCount: 40, suppressedCount: 12,
      grindDirectionDeg: 172.5, grindStrength: 0.049, orientationBins: 36,
      /* Bewusst gegenlaeufig: der gerichtet Erstplatzierte ist ungerichtet
         der Schlechtere. Ordnet das PDF nach dem gerichteten Wert, steht
         RANG1 oben - und der Test faellt durch. */
      candidates: [
        {
          rank: 1, lengthRel: 0.236, widthRel: 0.0137, orientationDeg: 28,
          grindDeltaDeg: 28.0, edgeStrength: 0.24,
          relevanceScore: 0.0260, relevanceScoreUngerichtet: 0.0554,
          alignedWithGrind: false,
        },
        {
          rank: 2, lengthRel: 0.051, widthRel: 0.0186, orientationDeg: 58,
          grindDeltaDeg: 58.6, edgeStrength: 0.35,
          relevanceScore: 0.0106, relevanceScoreUngerichtet: 0.0124,
          alignedWithGrind: false,
        },
        {
          rank: 3, lengthRel: 0.084, widthRel: 0.0084, orientationDeg: 22,
          grindDeltaDeg: 22.2, edgeStrength: 0.26,
          relevanceScore: 0.0083, relevanceScoreUngerichtet: 0.0220,
          alignedWithGrind: false,
        },
      ],
    }],
  },
});

let ordnungText = ""; let ordnungFehler = "";
try {
  const doc = exportInspectionPdf(ordnungsDatensatz, "de");
  const roh = doc?.output ? doc.output("datauristring") : "";
  const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
  ordnungText = entpacke(bytes);
} catch (caught) { ordnungFehler = String(caught?.message || caught); }

/* Reihenfolge im Dokument: Rang 1, dann Rang 3, dann Rang 2 - das ist die
   ungerichtete Ordnung (0,0554 > 0,0220 > 0,0124). */
/* Seit rc.4.31 heisst die Zeilenbeschriftung "Position n"; der
   gespeicherte gerichtete Platz steht als "Rang gerichtet n" daneben.
   Geprueft wird weiter DIE ORDNUNG: ungerichtet geordnet erscheint der
   gerichtete Rang 1, dann 3, dann 2. */
const pos = n => ordnungText.indexOf(`Rang gerichtet ${n}`);
const richtigeOrdnung = pos(1) >= 0 && pos(3) > pos(1) && pos(2) > pos(3);
const benenntOrdnung = /ohne Richtungsabwertung/.test(ordnungText)
  && /geordnet|sortiert/i.test(ordnungText);
ok("P11", "Das Protokoll ordnet ohne Richtungsabwertung und benennt die Ordnung",
  !ordnungFehler && richtigeOrdnung && benenntOrdnung,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Reihenfolge 1/3/2 ${richtigeOrdnung} · Ordnung benannt ${benenntOrdnung}`);

/* ─── P12 · Kein Prozentzeichen an einer Rohgroesse im Protokoll ──────────
   Dieselbe Regel wie auf dem Bildschirm (U26). Laenge und Breite sind
   Anteile der kurzen Bildkante, kein Millimetermass — "23,6 %" behauptet
   eine Messung, die es nicht gibt. Das Protokoll ist die Fassung, die
   ausgedruckt in einer Akte landet und dort Jahre spaeter gelesen wird;
   dort waere die Verwechslung dauerhaft.                                  */
const laengeRoh = /Relative Laenge 0[.,]2360/.test(ordnungText);
const breiteRoh = /Relative Breite 0[.,]0137/.test(ordnungText);
const pdfBezug = /kurze Kante des analysierten Bildes/.test(ordnungText);
const pdfOhneProzent = !/(Laenge|Breite|length|width) [\d.,]+ ?%/.test(ordnungText);
ok("P12", "Das Protokoll druckt Laenge und Breite als Rohwert mit Bezug, ohne Prozent",
  !ordnungFehler && laengeRoh && breiteRoh && pdfBezug && pdfOhneProzent,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Laenge roh ${laengeRoh} · Breite roh ${breiteRoh}`
      + ` · Bezug benannt ${pdfBezug} · ohne Prozent ${pdfOhneProzent}`);

/* ─── P13 · Position, Kennung und gerichteter Rang getrennt beschriftet ──
   BEFUND aus dem Geraetelauf vom 13.09.2026: das Protokoll druckte nur
   "Rang" und meinte den GERICHTETEN Platz, waehrend die Liste
   ungerichtet geordnet war. Wer das Protokoll liest, sah eine Liste, die
   mit "Rang 36" beginnt, und konnte nicht wissen, worauf sich die Zahl
   bezieht. Jetzt drei Angaben mit drei Beschriftungen — dieselbe
   Trennung wie am Bildschirm (T11).                                     */
const nenntPosition = /Position 1/.test(ordnungText) && /Position 3/.test(ordnungText);
const nenntGerichtet = /Rang gerichtet/.test(ordnungText);
const nenntKandidat = /Kandidat/.test(ordnungText);
ok("P13", "Das Protokoll beschriftet Position, Kandidat und gerichteten Rang getrennt",
  !ordnungFehler && nenntPosition && nenntGerichtet && nenntKandidat,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Position ${nenntPosition} · Rang gerichtet ${nenntGerichtet}`
      + ` · Kandidat ${nenntKandidat}`);

/* ─── P14 · Die Tiefengrenze steht im Protokoll, mit ihrem Operator ─────
   Ein gedrucktes Protokoll wird Jahre spaeter gelesen. "< 1,0 um" und
   "<= 1,0 um" sind dort nicht dasselbe: bei genau 1,000 entscheidet
   allein dieses Zeichen. Und die Kantenstaerke, die in derselben Zeile
   steht, darf nicht wie eine Antwort auf diese Grenze aussehen.

   Dieselbe Fehlerklasse wie P12/T7: was am Bildschirm richtig steht, muss
   auch gedruckt richtig stehen — bei der Ehrlichkeitskorrektur war das
   einmal nicht so.                                                      */
const nenntGrenzeMitOperator = /<\s*1,0\s*um/.test(ordnungText);
const nenntKeinKleinerGleich = !/<=\s*1,0\s*um|≤\s*1,0\s*um/.test(ordnungText);
const trenntKontrastVonTiefe = /Aufmerksamkeitswert/.test(ordnungText)
  && /(keine Tiefe|nicht eingehalten|weder einhalten)/.test(ordnungText);
ok("P14", "Das Protokoll nennt die Tiefengrenze mit Operator und trennt sie vom Kontrast",
  !ordnungFehler && nenntGrenzeMitOperator && nenntKeinKleinerGleich
  && trenntKontrastVonTiefe,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Operator "<" ${nenntGrenzeMitOperator} · kein "<=" ${nenntKeinKleinerGleich}`
      + ` · Kontrast als Aufmerksamkeitswert benannt ${trenntKontrastVonTiefe}`);

/* ─── P15 · Die Tiefenmessung steht im Protokoll, mit gerechnetem Urteil ─
   Das Urteil wird beim Drucken aus den Messangaben GERECHNET, nicht aus
   dem Datensatz gelesen — dort steht es gar nicht. Der Grenzfall ist der
   aussagekraeftige Fall: der Punktwert 1,20 laege ueber der Grenze, das
   Unsicherheitsintervall schneidet sie aber. Ein Protokoll, das hier
   "ueberschritten" druckt, verschweigt die Unsicherheit.              */
const nenntMessung = /Kandidat K02/.test(ordnungText);
const nenntAlleAngaben = /1,20/.test(ordnungText) && /0,30/.test(ordnungText)
  && /TASTSCHNITT/.test(ordnungText) && /m\.koch/.test(ordnungText)
  && /INDEPENDENT_MEASUREMENT/.test(ordnungText);
const nenntGrenzfall = /Grenzfall/.test(ordnungText);
const nenntNichtUeberschritten = !/K02[^\n]*ueberschritten/.test(ordnungText);
ok("P15", "Das Protokoll druckt die Tiefenmessung samt gerechnetem Urteil",
  !ordnungFehler && nenntMessung && nenntAlleAngaben && nenntGrenzfall
  && nenntNichtUeberschritten,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Zeile ${nenntMessung} · alle Angaben ${nenntAlleAngaben}`
      + ` · Grenzfall ${nenntGrenzfall} · nicht "ueberschritten" ${nenntNichtUeberschritten}`);

/* ─── P16 · Marker-Kennung und Regelfassung im Protokoll ────────────────
   Zwei Befunde der Gegenpruefung vom 16.09.2026, beide zutreffend.

   1. Das Protokoll druckte nur kandidatId. Eine manuell markierte Messung
      erschien als "Tiefenmessung —" — und damit ging genau die Aussage
      verloren, um die es in der Messkampagne geht: dass der Detektor diese
      Stelle NICHT angeboten hat.
   2. Die Regelfassung fehlte. Unter einer spaeteren Fassung 2 waere das
      Protokoll nicht mehr aus sich heraus nachvollziehbar: dieselbe Zahl,
      anderes Urteil, und nirgends stuende, nach welcher Regel.        */
const nenntMarker = /manuell markiert M01/.test(ordnungText);
const nenntNichtErkannt = /nicht erkannt/.test(ordnungText);
const keineLeereBindung = !/Tiefenmessung:\s*-\s/.test(ordnungText);
const nenntFassung = /Regelfassung/.test(ordnungText)
  && /Fassung 1/.test(ordnungText);
const nenntGrenzeDerFassung = /Grenze < 1 um/.test(ordnungText);
ok("P16", "Das Protokoll nennt die Marker-Kennung und die Regelfassung mit ihrer Grenze",
  !ordnungFehler && nenntMarker && nenntNichtErkannt && keineLeereBindung
  && nenntFassung && nenntGrenzeDerFassung,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Marker M01 ${nenntMarker} · "nicht erkannt" ${nenntNichtErkannt}`
      + ` · keine leere Bindung ${keineLeereBindung}`
      + ` · Fassung ${nenntFassung} · Grenze der Fassung ${nenntGrenzeDerFassung}`);

/* ─── P17 · Kein Text ragt ueber den Seitenrand ─────────────────────────
   Gemessen, nicht gelesen. Der Inhaltstest findet diesen Fehler
   grundsaetzlich nicht: im Textstrom steht alles, auch was neben dem
   Papier liegt.                                                        */
/* ─── P19 · Der Altformat-Wischtest wird ebenfalls gesetzt ─────────────
   Er hat einen eigenen Textblock (Kennzeichnung, damalige Werte, der
   Hinweis auf die nicht trennbare Summe) — und ein Block, den kein
   Datensatz dieser Suite erzeugt, wird von P17 auch nicht auf Ueberstand
   gemessen. Deshalb wird hier ein zweites Dokument erzeugt, dessen
   Zeilen in dieselbe Ueberstandsmessung laufen.               */
const altWischDatensatz = JSON.parse(JSON.stringify(ordnungsDatensatz));
altWischDatensatz.id = "insp-pdf-altwisch";
altWischDatensatz.swabTest = {
  performedAt: NOW, photos: wischFotos,
  beforeScore: 95, afterScore: 35, interpretation: "RESIDUE_POSSIBLE",
};
let altWischText = ""; let altWischFehler = "";
try {
  altWischText = entpacke(Buffer.from(
    exportInspectionPdf(altWischDatensatz, "de").output("arraybuffer")));
} catch (caught) { altWischFehler = String(caught?.message || caught); }
const altGekennzeichnet = /Altformat/.test(altWischText)
  && /Summenvergleich/.test(altWischText);
const altWerte = /95/.test(altWischText) && /35/.test(altWischText);
const altKeineFalschaussage = !/Zuordnung fehlt/.test(altWischText);
const altNichtTrennbar = /nicht nachtraeglich in Trocken, Sauber und/.test(altWischText);
ok("P19", "Ein Wischtest im Altformat behaelt seine Werte und ist gekennzeichnet",
  !altWischFehler && altGekennzeichnet && altWerte && altKeineFalschaussage
  && altNichtTrennbar,
  altWischFehler ? `ABSTURZ: ${altWischFehler}`
    : `gekennzeichnet ${altGekennzeichnet} · damalige Werte ${altWerte}`
      + ` · keine Falschaussage ${altKeineFalschaussage}`
      + ` · Summe als nicht trennbar benannt ${altNichtTrennbar}`);

/* ─── P18 · Wischvergleich je Kriterium statt Summe ────────────────────
   Bis rc.4.37 druckte das Protokoll `beforeScore -> afterScore | CODE`,
   also die Summe der Befundstaerken von Trocken, Sauber und Intakt. Bei
   diesem Datensatz sinkt AUSSCHLIESSLICH die Feuchtigkeit (60 -> 0); der
   Sauberkeitswert steht unveraendert bei 35. Die alte Regel haette
   "RESIDUE_POSSIBLE" gedruckt — eine Reinigungswirkung, die es nicht gab.

   Geprueft wird das erzeugte Dokument, nicht der Quelltext.            */
const wischAussage = /Sauberkeitsbefund ist unveraendert/.test(ordnungText);
const wischProKriterium = /Trocken: 60 -> 0/.test(ordnungText)
  && /Sauber: 35 -> 35/.test(ordnungText);
const wischOhneSumme = !/RESIDUE_POSSIBLE|STRUCTURAL_FINDING_POSSIBLE/.test(ordnungText)
  && !/\b95 -> 35\b/.test(ordnungText);
const wischIndexBenannt = /Befundstaerke-Index, algorithmisch, keine Messgroesse/.test(ordnungText);
const wischVergleichbarkeit = /Vergleichbarkeit/.test(ordnungText)
  && /Gleiche Beleuchtung ist nicht festgestellt/.test(ordnungText);
ok("P18", "Das Protokoll vergleicht den Wischtest je Kriterium und nennt die Grenzen",
  !ordnungFehler && wischAussage && wischProKriterium && wischOhneSumme
  && wischIndexBenannt && wischVergleichbarkeit,
  ordnungFehler ? `ABSTURZ: ${ordnungFehler}`
    : `Aussage ${wischAussage} · je Kriterium ${wischProKriterium}`
      + ` · ohne Summe/Code ${wischOhneSumme} · Index benannt ${wischIndexBenannt}`
      + ` · Vergleichbarkeit ${wischVergleichbarkeit}`);

ok("P17", "Kein Text ragt ueber den rechten Seitenrand hinaus",
  gemesseneZeilen > 100 && ueberstand.length === 0,
  gemesseneZeilen <= 100
    ? `nur ${gemesseneZeilen} Zeilen gemessen — der Abfang greift nicht,`
      + " dieser Test belegt nichts"
    : ueberstand.length
      ? `${gemesseneZeilen} Zeilen gemessen, ${ueberstand.length} Ueberstand/`
        + `Ueberstaende, groesster ${
          Math.max(...ueberstand.map(u => u.ueber)).toFixed(1)} mm: "${
          ueberstand.slice().sort((a, b) => b.ueber - a.ueber)[0].text}"`
      : `${gemesseneZeilen} Zeilen gemessen, alle innerhalb des Satzspiegels`);

ok("P1", "Der PDF-Export laeuft ohne Fehler durch",
  !fehler, fehler || "erzeugt");

ok("P5", "Der Test schreibt keine Datei ins Projektverzeichnis",
  gespeichertAls !== null && !existsSync(new URL(`./${gespeichertAls}`, import.meta.url)),
  gespeichertAls
    ? `save() abgefangen (${gespeichertAls}), keine Datei erzeugt`
    : "save() wurde gar nicht aufgerufen — der Abfang belegt nichts");

ok("P2", "Das Dokument traegt Inhalt, der gelesen werden kann",
  text.length > 500, `${text.length} Byte Rohinhalt`);

/* jsPDF komprimiert Textstroeme nicht, wenn keine Kompression gesetzt ist;
   die Zeichenketten stehen dann im Rohdokument. Faellt das hier auf, ist
   der Test ehrlich als UNBELEGT zu melden statt still gruen zu bleiben. */
const lesbar = text.includes("VisuClean") || text.includes("Pruefer");

if (!lesbar) {
  ok("P3", "Mehrwinkelauswertung steht im Protokoll", false,
    "Rohtext nicht lesbar (Kompression) — dieser Test kann so nichts belegen");
  ok("P4", "Pruefer ist performedBy, nicht der aktive Benutzer", false,
    "Rohtext nicht lesbar (Kompression) — dieser Test kann so nichts belegen");
} else {
  const nenntFusion = text.includes("Mehrwinkel") || text.includes("LABEL_NOT_DETECTED");
  ok("P3", "Mehrwinkelauswertung steht im Protokoll", nenntFusion,
    nenntFusion ? "Fusionsblock gefunden" : "FEHLT — record.fusionSummary wird nicht ausgegeben");

  /* Scharf stellen: "operator1" allein genuegt NICHT — der Name steht
     ohnehin im Signaturblock ("Geprueft: operator1 ..."). Unterscheidend
     ist, ob die Kopfzeile "Pruefer" den displayName des aktiven Benutzers
     traegt. Die alte Fassung schrieb dort "QA Manager (QA Manager)". */
  const falscheZuschreibung = text.includes("Genehmigerkennung");
  const nenntPruefer = text.includes("operator1");
  ok("P4", "Pruefer ist performedBy, nicht der aktive Benutzer",
    nenntPruefer && !falscheZuschreibung,
    falscheZuschreibung
      ? "FEHLT — der Genehmiger steht als Pruefer im Kopf"
      : "operator1 (Operator) im Kopf, Genehmiger getrennt ausgewiesen");
}

/* ═══ P21-P23 · BEFUND F im PROTOKOLL ══════════════════════════════════
   Der Auftrag verlangt widerspruchsfreie Statusanzeigen in Oberflaeche,
   Bericht UND PDF. F1 bis F10 pruefen die reine Funktion; dass sie im
   Protokoll auch ANGESCHLOSSEN ist, prueft bisher nichts.

   Genau diese Luecke hat X1 schon einmal gekostet: eine Wache am falschen
   Ort meldet Gruen fuer eine Leitung, die es nicht gibt. Geprueft wird
   deshalb am erzeugten Dokument.                                       */
{
  /* Ein Datensatz, wie ihn der echte Aufnahmeweg ohne Streiflichtsequenz
     liefert: der Feuchte-Pruefpunkt ist NICHT BEWERTBAR, der Rohbefund des
     Kerns sagt trotzdem "trocken". Bis rc.4.44 stand dann "T/D PASS" im
     Protokoll — neben einem Punkt, den niemand beurteilen konnte. */
  const ohneSequenz = buildCheckpoints(MERKMALE, URTEIL, { feuchteSequenz: null });
  const feuchtePunkt = ohneSequenz.find(punkt => punkt.id === "moisture");
  const ergebnisOhneSequenz = {
    ...ergebnis(), checkpoints: ohneSequenz,
  };
  const fotoOhneSequenz = [{ ...fotos[0], result: ergebnisOhneSequenz }];
  const aggregatOhneSequenz = aggregateResults([ergebnisOhneSequenz]);
  const unklarDatensatz = buildInspectionRecord({
    id: "insp-pdf-unklar", appVersion: "8.3.0-rc.4.45", now: NOW,
    user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
    eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
    photos: fotoOhneSequenz, aggregate: aggregatOhneSequenz,
    originalSystemDecision: deriveSystemDecision(aggregatOhneSequenz),
    finalDecision: "FAIL",
    performedBy: { username: "operator1", role: "Operator", at: NOW },
    reauthenticated: true, comment: "Ohne Streiflichtsequenz aufgenommen",
    signature: {
      method: "USER_ID_PASSWORD", components: ["userId", "password"],
      meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
      signedAt: NOW, signedBy: "operator1",
    },
  });
  let unklarText = ""; let unklarFehler = "";
  try {
    const doc = exportInspectionPdf(unklarDatensatz, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
    unklarText = entpacke(bytes);
  } catch (caught) { unklarFehler = String(caught?.message || caught); }

  const zeigtFragezeichen = /T\/D \?/.test(unklarText);
  const zeigtGruen = /T\/D PASS/.test(unklarText);
  ok("P21", "Ein nicht bewertbarer Feuchtepunkt steht im Protokoll nicht als PASS",
    !unklarFehler && unklarText.length > 0
    && feuchtePunkt?.status === "NOT_ASSESSABLE"
    && zeigtFragezeichen && !zeigtGruen,
    unklarFehler ? `ABSTURZ: ${unklarFehler}`
      : `Pruefpunkt ${feuchtePunkt?.status} · Protokoll zeigt`
        + ` ${zeigtGruen ? "T/D PASS (FALSCH)" : zeigtFragezeichen ? "T/D ?" : "keine Kurzform"}`);

  /* P22 · Der Gegenfall: ein NACHWEISLICHER Altbestand behaelt seine
     historische Aussage. Erkannt wird er am Datenformat — `schema`
     vorhanden, `schemaVersion` fehlt —, nicht daran, dass eine
     Pruefpunktliste fehlt. */
  const altbestand = {
    ...unklarDatensatz,
    id: "insp-pdf-alt", appVersion: "8.2.0",
    photos: [{ ...fotoOhneSequenz[0],
      result: { ...ergebnisOhneSequenz, checkpoints: [] } }],
    aggregate: { ...aggregatOhneSequenz, checkpoints: [] },
    checkpoints: [],
  };
  delete altbestand.schemaVersion;
  let altText = ""; let altFehler = "";
  try {
    const doc = exportInspectionPdf(altbestand, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
    altText = entpacke(bytes);
  } catch (caught) { altFehler = String(caught?.message || caught); }
  ok("P22", "Ein nachgewiesener Altbestand behaelt im Protokoll seinen Rohbefund",
    !altFehler && /T\/D PASS/.test(altText),
    altFehler ? `ABSTURZ: ${altFehler}`
      : /T\/D PASS/.test(altText) ? "T/D PASS wie im Stand 8.2"
        : "der historische Befund ist im Protokoll verlorengegangen");

  /* P23 · Die BEURTEILUNG heisst im Protokoll auch so. "QA-Entscheid zu"
     ueber einer Beurteilung waere dieselbe falsche Etikettierung, die P6
     fuer die Sperrung festhaelt: sie entscheidet nichts. */
  const beurteilung = {
    ...unklarDatensatz,
    id: "insp-pdf-klaerung",
    state: LIFECYCLE_STATE.PENDING_QA, finalDecision: null,
    supersedesId: "insp-pdf-unklar", approvalRevisionHash: "a".repeat(64),
    clarification: { by: { username: "qa_manager", role: "QA Manager" },
      at: NOW, count: 1 },
    signature: { ...unklarDatensatz.signature,
      meaning: "Schadensverdacht beurteilt, Freigabe ausstehend" },
  };
  let klaerText = ""; let klaerFehler = "";
  try {
    const doc = exportInspectionPdf(beurteilung, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    const bytes = roh ? Buffer.from(roh.split(",")[1] || "", "base64") : Buffer.alloc(0);
    klaerText = entpacke(bytes);
  } catch (caught) { klaerFehler = String(caught?.message || caught); }
  ok("P23", "Eine Beurteilung wird im Protokoll nicht QA-Entscheid genannt",
    !klaerFehler && /Beurteilung zu/.test(klaerText) && !/QA-Entscheid zu/.test(klaerText),
    klaerFehler ? `ABSTURZ: ${klaerFehler}`
      : /QA-Entscheid zu/.test(klaerText)
        ? "die Beurteilung gibt sich als Entscheid aus"
        : "Beurteilung zu: insp-pdf-unklar");
}

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
