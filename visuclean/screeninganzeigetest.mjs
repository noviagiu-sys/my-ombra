/* ─── VisuClean · Screening-Anzeige von der Aufnahme bis zum Protokoll ─────
   Aufruf: node screeninganzeigetest.mjs

   Diese Suite gehoert zur Nacharbeit nach dem Geraetelauf vom 12.09.2026.
   Sie prueft den durchgaengigen Weg: Ergebnisansicht → Speichern → neu
   Laden → Pruefbericht → Einzel-JSON → Gesamtexport → PDF.

   ZWEI GRENZEN, die diese Datei bewusst einhaelt:

   1. Sie rendert die ECHTEN Bildschirme in einem DOM und bedient sie
      (Sortierumschaltung per change-Ereignis). Eine Quelltextsuche wuerde
      nicht zeigen, ob ein Kandidat beim Umschalten verschwindet.

   2. Sie schreibt in die ECHTE Persistenz (fake-indexeddb) und liest
      zurueck. Eine handgebaute Fixture belegt nur, dass der Vertrag in
      sich stimmt — das war der Fehler, der zu speicherpfadtest.mjs
      gefuehrt hat.

   WAS SIE NICHT KANN: echte Bildschirmbreiten messen. jsdom hat keine
   Layout-Engine. T8 prueft deshalb die Struktur (liegt die breite Tabelle
   in einem scrollbaren Bereich) und die tatsaechlich geltende CSS-Regel,
   ausgelesen ueber die CSSOM, nicht per Textsuche. Die Messung in einem
   echten Browser bei 390 px liegt getrennt in
   werkbank/breitenmessung.mjs — sie braucht Chromium und kann deshalb
   nicht Teil von `npm test` sein.                                        */

import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { inflateSync } from "node:zlib";

const dom = new JSDOM(
  "<!doctype html><html lang=\"de\"><head><title>VisuClean</title></head>"
  + "<body><div id=\"root\"></div></body></html>",
  { url: "https://visuclean.test/", pretendToBeVisual: true });
for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement", "Node",
  "MutationObserver", "getComputedStyle", "Image", "Blob", "Event", "CSSStyleSheet"]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
const werte = new Map();
globalThis.localStorage = {
  getItem: key => werte.get(key) || null,
  setItem: (key, value) => werte.set(key, String(value)),
  removeItem: key => werte.delete(key),
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

/* jsPDF-Textstroeme auspacken - dieselbe Hilfe wie in pdftest.mjs. Faellt
   das Auspacken, meldet der Test das ausdruecklich, statt eine Aussage zu
   treffen, die er nicht belegen kann. */
function entpacke(puffer) {
  const roh = puffer.toString("latin1");
  let text = roh;
  const muster = /stream\r?\n/g;
  let treffer;
  while ((treffer = muster.exec(roh)) !== null) {
    const start = treffer.index + treffer[0].length;
    const ende = roh.indexOf("endstream", start);
    if (ende < 0) continue;
    try { text += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1"); }
    catch { /* unkomprimiert - steht schon im Rohtext */ }
  }
  return text;
}

/* KEINE NEBENWIRKUNG. Beim ersten Lauf dieser Suite lagen anschliessend
   drei PDF-Dateien im Projektverzeichnis — exakt der Fehler, fuer den
   pdftest.mjs in rc.4.8 repariert wurde: `npm run verify` veraendert dann
   das Paket, das es prueft, und `manifest:check` faellt beim naechsten
   Lauf. `save()` wird deshalb VOR dem ersten Export abgefangen; gelesen
   wird der Dokumentinhalt aus dem Speicher. T10 belegt, dass der Abfang
   greift. */
const { jsPDF } = await import("jspdf");
const gespeicherteDateien = [];
jsPDF.API.save = function abgefangen(name) { gespeicherteDateien.push(name); return this; };
globalThis.URL = globalThis.URL || {};
globalThis.URL.createObjectURL = () => "blob:test";
globalThis.URL.revokeObjectURL = () => {};

console.log("VisuClean · Screening-Anzeige Ende zu Ende\n");

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let behaelter = null; let wurzel = null;

async function zeige(element) {
  if (!wurzel) {
    behaelter = document.getElementById("root");
    wurzel = createRoot(behaelter);
  }
  await act(async () => { wurzel.render(element); });
  return behaelter;
}

try {
  const { ScreeningPanel, ResultScreen, RecordDetail } = await vite.ssrLoadModule("/src/App.jsx");
  const { translator } = await vite.ssrLoadModule("/src/i18n.js");
  const { buildInspectionRecord, SIGNATURE_MEANING } =
    await vite.ssrLoadModule("/src/inspectionRecord.js");
  const { LIFECYCLE_STATE } = await vite.ssrLoadModule("/src/lifecycle.js");
  const { buildCheckpoints } = await vite.ssrLoadModule("/src/assessment.js");
  const { aggregateResults, deriveSystemDecision, APP_VERSION } = await vite.ssrLoadModule("/src/domain.js");
  const { CAPTURE_PATH, captureProfile } = await vite.ssrLoadModule("/src/decision.js");
  const { exportInspectionPdf } = await vite.ssrLoadModule("/src/pdfExport.js");
  const { saveInspection, loadInspections, exportReadableData } =
    await vite.ssrLoadModule("/src/persistence.js");
  const { recordDigest } = await vite.ssrLoadModule("/src/audit.js");
  const { mitFeuchteSequenz } = await vite.ssrLoadModule("/tests/feuchteSequenz.mjs");

  const t = translator("de");
  const JETZT = "2026-09-12T20:00:00.000Z";
  const MERKMALE = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
  const URTEIL = {
    dry: { pass: true, code: "PASS" }, clean: { pass: true, code: "PASS" },
    intact: { pass: true, code: "PASS" },
  };
  const ergebnis = () => ({
    dry: { ...URTEIL.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...URTEIL.clean, message: "", detail: "", severity: 0, action: "" },
    intact: { ...URTEIL.intact, message: "", detail: "", severity: 0, action: "" },
    lm: 0.6, hints: [],
    checkpoints: buildCheckpoints(MERKMALE, URTEIL, mitFeuchteSequenz("die")),
  });

  const fotos = [{
    id: "photo-1", image: "data:image/jpeg;base64,QUJD",
    annotatedImage: "data:image/jpeg;base64,QUJD",
    markers: [], markerAssessments: [], result: ergebnis(), knownIssueInfo: null,
    captureProfile: captureProfile({
      processedWidth: 480, processedHeight: 640,
      sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
    }),
  }];
  const lebendeFotos = fotos.map(f => ({ ...f, rawResult: { ...ergebnis(), _ov: null } }));
  const aggregat = aggregateResults([ergebnis()]);

  /* Die Bezugswerte des Auftraggebers: lengthRel 0,2360 und ein bekannter
     widthRel-Wert. Absichtlich gegenlaeufige Bewertungen, damit ein
     Sortierwechsel die Reihenfolge SICHTBAR aendert. */
  const SCREENING = {
    configHash: "a".repeat(64), configQuelle: "DATEI",
    photos: [{
      photoId: "photo-1", candidateCount: 40, suppressedCount: 12,
      grindDirectionDeg: 172.5, grindStrength: 0.141, orientationBins: 36,
      candidates: [
        {
          kandidatId: "K01", rank: 1, boundingBox: { minX: 10, minY: 20, maxX: 90, maxY: 26 },
          lengthRel: 0.2360, widthRel: 0.0137, orientationDeg: 28,
          grindDeltaDeg: 28.0, edgeStrength: 0.24,
          relevanceScore: 0.0260, relevanceScoreUngerichtet: 0.0554,
          alignedWithGrind: false,
        },
        {
          kandidatId: "K02", rank: 2, boundingBox: { minX: 30, minY: 60, maxX: 44, maxY: 63 },
          lengthRel: 0.0510, widthRel: 0.0186, orientationDeg: 58,
          grindDeltaDeg: 58.6, edgeStrength: 0.35,
          relevanceScore: 0.0106, relevanceScoreUngerichtet: 0.0124,
          alignedWithGrind: false,
        },
        {
          kandidatId: "K03", rank: 3, boundingBox: { minX: 12, minY: 80, maxX: 60, maxY: 84 },
          lengthRel: 0.0840, widthRel: 0.0084, orientationDeg: 22,
          grindDeltaDeg: 22.2, edgeStrength: 0.26,
          relevanceScore: 0.0083, relevanceScoreUngerichtet: 0.0220,
          alignedWithGrind: false,
        },
      ],
    }],
  };

  const basis = {
    id: "insp-screen-1", appVersion: APP_VERSION, now: JETZT,
    user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
    eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate: aggregat,
    originalSystemDecision: deriveSystemDecision(aggregat),
    finalDecision: "PASS",
    performedBy: { username: "operator1", role: "Operator", at: JETZT },
    reauthenticated: true,
    signature: {
      method: "USER_ID_PASSWORD", components: ["userId", "password"],
      meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_PASS],
      signedAt: JETZT, signedBy: "operator1",
    },
    screening: SCREENING,
  };

  const ergebnisAnsicht = (screening, zusatz = {}) => React.createElement(ResultScreen, {
    mode: "inspect",
    equipment: { id: "tp", de: "Tablettenpresse", en: "Tablet press" },
    zone: { id: "die", de: "Matrizenteller", en: "Die table" },
    photos: lebendeFotos, aggregate: aggregat,
    systemDecision: deriveSystemDecision(aggregat),
    reference: null, swabData: null, language: "de",
    user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
    comment: "", setComment: () => {}, onDecision: () => {}, onOverride: () => {},
    onKnownIssue: () => {}, onSwab: () => {}, onDone: () => {}, t,
    screening, ...zusatz,
  });

  const zellen = knoten => [...knoten.querySelectorAll("td")].map(z => z.textContent.trim());

  /* ── T1 · Screening vor dem Speichern ───────────────────────────────── */
  let el = await zeige(ergebnisAnsicht(SCREENING));
  const t1Panel = el.querySelector(".screening-panel");
  const t1Text = el.textContent || "";
  ok("T1", "Screening ist in der Ergebnisansicht vor dem Speichern sichtbar",
    Boolean(t1Panel) && /0[.,]2360/.test(t1Text) && !el.querySelector(".signature-record"),
    t1Panel ? `${t1Panel.querySelectorAll("tbody tr").length} Kandidatenzeilen vor der Unterschrift`
      : "kein Screening-Bereich in der Ergebnisansicht");

  /* ── T2 · Rohwerte mit Bezug in Ansicht, Bericht und echtem PDF ─────── */
  const datensatz = buildInspectionRecord(basis);
  datensatz.recordHash = await recordDigest(datensatz);
  const berichtEl = await zeige(React.createElement(RecordDetail, {
    record: datensatz, language: "de", onBack: () => {}, t,
  }));
  const berichtText = berichtEl.textContent || "";

  let pdfText = ""; let pdfFehler = "";
  try {
    const doc = exportInspectionPdf(datensatz, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    pdfText = entpacke(Buffer.from(roh.split(",")[1] || "", "base64"));
  } catch (fehler) { pdfFehler = String(fehler?.message || fehler); }

  /* Der Bezug muss in allen drei Ausgaben benannt sein - eine Zahl ohne
     Bezugsgroesse ist keine Angabe. */
  const bezug = text => /kurze[nr]? Kante des analysierten Bildes/.test(text)
    && /Keine physikalische L(ä|ae)nge oder Tiefe/.test(text);
  const zeigtWerte = text => /0[.,]2360/.test(text) && /0[.,]0137/.test(text);
  /* Und keine Prozentangabe AN DIESEN Rohwerten. Bewusst KEINE globale
     Prozentsperre: der Anteil warmer Pixel im Rueckstandsdetail ist ein
     nachvollziehbar bestimmter Bildflaechenanteil und darf Prozent
     tragen. */
  const ohneProzentAmRohwert = text =>
    !/0[.,]2360\s*%/.test(text) && !/0[.,]0137\s*%/.test(text)
    && !/23[.,]6\s*%/.test(text) && !/1[.,]37\s*%/.test(text);

  const t1Wieder = (await zeige(ergebnisAnsicht(SCREENING))).textContent || "";
  const t2Ansicht = zeigtWerte(t1Wieder) && bezug(t1Wieder) && ohneProzentAmRohwert(t1Wieder);
  const t2Bericht = zeigtWerte(berichtText) && bezug(berichtText) && ohneProzentAmRohwert(berichtText);
  const t2Pdf = !pdfFehler && zeigtWerte(pdfText) && ohneProzentAmRohwert(pdfText)
    && /kurze[nr]? Kante des analysierten Bildes/.test(pdfText);
  /* Im JSON bleiben die Zahlen unveraendert - eine Anzeigeaenderung darf
     keinen Messwert umrechnen. */
  const k1 = datensatz.screening.photos[0].candidates.find(k => k.rank === 1);
  const t2Json = k1.lengthRel === 0.2360 && k1.widthRel === 0.0137
    && typeof k1.lengthRel === "number";
  ok("T2", "Relative Laenge und Breite mit Bezug in Ansicht, Bericht und PDF; JSON unveraendert",
    t2Ansicht && t2Bericht && t2Pdf && t2Json,
    pdfFehler ? `PDF-ABSTURZ: ${pdfFehler}`
      : `Ansicht ${t2Ansicht} · Bericht ${t2Bericht} · PDF ${t2Pdf} · JSON ${t2Json}`);

  /* ── T3 · Fehlend ist nicht Null ────────────────────────────────────── */
  const luecken = {
    ...SCREENING,
    photos: [{
      ...SCREENING.photos[0],
      grindStrength: null, orientationBins: null,
      candidates: [{
        rank: 1, boundingBox: null,
        /* echte gemessene Null - muss Null bleiben */
        lengthRel: 0, widthRel: 0,
        /* nicht gemessen - darf nicht als 0 erscheinen */
        orientationDeg: null, grindDeltaDeg: null, edgeStrength: null,
        relevanceScore: null, relevanceScoreUngerichtet: null,
        alignedWithGrind: false,
      }],
    }],
  };
  const t3El = await zeige(React.createElement(ScreeningPanel, { screening: luecken, t }));
  const t3Zellen = zellen(t3El);
  const nichtVerfuegbar = t3Zellen.filter(z => /nicht verf(ü|ue)gbar/i.test(z)).length;
  const echteNull = t3Zellen.filter(z => /^0[.,]0000$/.test(z)).length;
  ok("T3", "Fehlende Werte als nicht verfuegbar, gemessene Null bleibt Null",
    nichtVerfuegbar >= 4 && echteNull >= 2,
    `${nichtVerfuegbar} Zellen "nicht verfuegbar" · ${echteNull} Zellen echte Null`
    + ` · Zellen: ${t3Zellen.join(" | ")}`);

  /* ── T4 · Umschalten sortiert um, mehr nicht ────────────────────────── */
  const t4El = await zeige(React.createElement(ScreeningPanel, { screening: SCREENING, t }));
  const auswahl = t4El.querySelector("select");
  /* Verglichen wird ueber die STABILE Kennung, nicht ueber die erste
     Zelle: seit rc.4.31 steht dort die laufende Position, und die SOLL
     sich beim Umschalten aendern. Die Messwerte eines Kandidaten duerfen
     es nicht. */
  const kennungen = knoten => [...knoten.querySelectorAll("tbody tr")]
    .map(zeile => zellen(zeile)[1]);
  const werteJeKennung = knoten => new Map([...knoten.querySelectorAll("tbody tr")]
    .map(zeile => {
      const z = zellen(zeile);
      return [z[1], z.slice(2).join("|")];
    }));
  const vorher = kennungen(t4El);
  const werteVorher = werteJeKennung(t4El);
  await act(async () => {
    auswahl.value = "directed";
    auswahl.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const nachher = kennungen(t4El);
  const werteNachher = werteJeKennung(t4El);
  const gleicheMenge = vorher.length === nachher.length
    && [...vorher].sort().join(",") === [...nachher].sort().join(",");
  const reihenfolgeAnders = vorher.join(",") !== nachher.join(",");
  const werteGleich = vorher.every(k => werteVorher.get(k) === werteNachher.get(k));
  /* Und die Position wird lueckenlos neu vergeben. */
  const positionen = [...t4El.querySelectorAll("tbody tr")].map(z => zellen(z)[0]);
  const positionenNeu = positionen.join(",") === "1,2,3";
  ok("T4", "Sortierwechsel aendert nur die Reihenfolge, kein Kandidat verschwindet",
    gleicheMenge && reihenfolgeAnders && werteGleich && positionenNeu,
    `vorher ${vorher.join("/")} · nachher ${nachher.join("/")}`
    + ` · Menge gleich ${gleicheMenge} · Messwerte je Kennung gleich ${werteGleich}`
    + ` · Position lueckenlos ${positionenNeu}`);

  /* ── T5 · Speichern, neu laden, Bericht, JSON, Gesamtexport, PDF ────── */
  const akteur = { username: "operator1", role: "Operator", displayName: "Operator 1" };
  let speicherFehler = "";
  try { await saveInspection(datensatz, akteur); }
  catch (fehler) { speicherFehler = String(fehler?.message || fehler); }
  const geladen = (await loadInspections()).find(r => r.id === datensatz.id) || null;
  const gesamt = await exportReadableData();
  const ausGesamt = (gesamt.inspections || []).find(r => r.id === datensatz.id) || null;

  const fuenfAngaben = quelle => quelle && quelle.photos?.[0]
    && quelle.photos[0].candidateCount === 40
    && quelle.photos[0].suppressedCount === 12
    && quelle.photos[0].grindDirectionDeg === 172.5
    && quelle.photos[0].grindStrength === 0.141
    && quelle.photos[0].orientationBins === 36;
  const kandidatenGleich = (a, b) => JSON.stringify(a?.photos?.[0]?.candidates)
    === JSON.stringify(b?.photos?.[0]?.candidates);
  const fotoZuordnung = geladen?.screening?.photos?.[0]?.photoId === "photo-1"
    && geladen?.photos?.[0]?.id === "photo-1";

  let pdfNachLaden = ""; let pdfNachFehler = "";
  try {
    const doc = exportInspectionPdf(geladen, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    pdfNachLaden = entpacke(Buffer.from(roh.split(",")[1] || "", "base64"));
  } catch (fehler) { pdfNachFehler = String(fehler?.message || fehler); }

  const t5 = !speicherFehler && geladen && fuenfAngaben(geladen.screening)
    && fuenfAngaben(ausGesamt?.screening)
    && kandidatenGleich(geladen.screening, datensatz.screening)
    && kandidatenGleich(ausGesamt?.screening, datensatz.screening)
    && fotoZuordnung && !pdfNachFehler && /0[.,]2360/.test(pdfNachLaden);
  ok("T5", "Speichern, neu laden, Bericht, Einzel-JSON, Gesamtexport und PDF stimmen ueberein",
    t5,
    speicherFehler ? `SPEICHERN FEHLGESCHLAGEN: ${speicherFehler}`
      : pdfNachFehler ? `PDF-ABSTURZ: ${pdfNachFehler}`
        : `geladen ${Boolean(geladen)} · fuenf Angaben ${fuenfAngaben(geladen?.screening)}`
          + ` · Kandidaten identisch ${kandidatenGleich(geladen?.screening, datensatz.screening)}`
          + ` · Gesamtexport ${fuenfAngaben(ausGesamt?.screening)} · Fotozuordnung ${fotoZuordnung}`);

  /* ── T6 · Historischer Datensatz bleibt unangetastet ────────────────── */
  /* Ein Datensatz, wie ihn rc.4.21 geschrieben hat: der Kerntext mit der
     Stoffbehauptung steht IM Datensatz, weil Pruefpunkttexte mitgespeichert
     werden. Er darf nicht nachtraeglich umgeschrieben werden - ein
     nachtraeglich umformulierter GMP-Datensatz waere der schwerere Fehler.
     Der Hinweis gehoert daneben, erkennbar als Zusatz. */
  const ALTTEXT = "Organische Rückstände (braun/gelb)";
  const altAggregat = JSON.parse(JSON.stringify(aggregat));
  const altPunkt = altAggregat.checkpoints.find(p => p.id === "residue");
  altPunkt.status = "FAIL";
  altPunkt.code = "ORGANIC_RESIDUE";
  altPunkt.message = { de: ALTTEXT, en: "Organic residue (brown/yellow)" };
  altAggregat.clean = {
    pass: false, code: "ORGANIC_RESIDUE", message: ALTTEXT,
    detail: "3.1% warme Pixel (nach Beleuchtungs-Normalisierung)",
    severity: 40, action: "Nachreinigung",
  };
  const historisch = buildInspectionRecord({
    ...basis, id: "insp-alt-421", appVersion: "8.3.0-rc.4.21",
    aggregate: altAggregat, originalSystemDecision: deriveSystemDecision(altAggregat),
    finalDecision: "FAIL", screening: null,
  });
  historisch.recordHash = await recordDigest(historisch);
  const hashVorher = historisch.recordHash;
  const kopieVorher = JSON.stringify(historisch);

  const altEl = await zeige(React.createElement(RecordDetail, {
    record: historisch, language: "de", onBack: () => {}, t,
  }));
  const altText = altEl.textContent || "";
  const hashNachher = await recordDigest(historisch);

  let altPdf = ""; let altPdfFehler = "";
  try {
    const doc = exportInspectionPdf(historisch, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    altPdf = entpacke(Buffer.from(roh.split(",")[1] || "", "base64"));
  } catch (fehler) { altPdfFehler = String(fehler?.message || fehler); }

  const unveraendert = JSON.stringify(historisch) === kopieVorher
    && hashNachher === hashVorher;
  const originalNochDa = altText.includes(ALTTEXT);
  const hinweisDa = /Historischer Befundtext/.test(altText)
    && /keine Stoffklasse bestimmbar/i.test(altText);
  const hinweisAbgesetzt = Boolean(altEl.querySelector(".checkpoint-historic"));
  const pdfTrennt = !altPdfFehler && /Nachtr(ä|ae)gliche Erl(ä|ae)uterung/.test(altPdf)
    && /Historischer Befundtext/.test(altPdf);
  const keinScreening = /Screening-Daten nicht gespeichert/.test(altText);
  ok("T6", "Historischer Datensatz unveraendert, Hinweis erkennbar als Zusatz",
    unveraendert && originalNochDa && hinweisDa && hinweisAbgesetzt && pdfTrennt && keinScreening,
    altPdfFehler ? `PDF-ABSTURZ: ${altPdfFehler}`
      : `Datensatz unveraendert ${unveraendert} · Original sichtbar ${originalNochDa}`
        + ` · Hinweis ${hinweisDa} · abgesetzt ${hinweisAbgesetzt} · PDF trennt ${pdfTrennt}`
        + ` · "nicht gespeichert" ${keinScreening}`);

  /* ── T7 · Neue Pruefung ohne unbelegte Stoffbehauptung ──────────────── */
  /* Dieselben Merkmale, die den Kern ORGANIC_RESIDUE melden lassen - aber
     durch die HEUTIGE Bewertungsschicht. Der Rohcode darf bleiben, die
     Behauptung nicht. */
  const neuUrteil = {
    dry: { pass: true, code: "PASS" },
    clean: {
      pass: false, code: "ORGANIC_RESIDUE", message: ALTTEXT,
      detail: "3.1% warme Pixel (nach Beleuchtungs-Normalisierung)",
      severity: 40, action: "Nachreinigung",
    },
    intact: { pass: true, code: "PASS" },
  };
  const neuErgebnis = {
    dry: { ...neuUrteil.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...neuUrteil.clean },
    intact: { ...neuUrteil.intact, message: "", detail: "", severity: 0, action: "" },
    lm: 0.6, hints: [],
    checkpoints: buildCheckpoints(MERKMALE, neuUrteil, mitFeuchteSequenz("die")),
  };
  const neuAggregat = aggregateResults([neuErgebnis]);
  const neuFotos = [{ ...fotos[0], result: neuErgebnis }];
  const neuDatensatz = buildInspectionRecord({
    ...basis, id: "insp-neu-427", photos: neuFotos, aggregate: neuAggregat,
    originalSystemDecision: deriveSystemDecision(neuAggregat), finalDecision: "FAIL",
  });
  neuDatensatz.recordHash = await recordDigest(neuDatensatz);

  const neuAnsicht = (await zeige(ergebnisAnsicht(SCREENING, {
    photos: neuFotos.map(f => ({ ...f, rawResult: { ...neuErgebnis, _ov: null } })),
    aggregate: neuAggregat, systemDecision: deriveSystemDecision(neuAggregat),
  }))).textContent || "";
  const neuBericht = (await zeige(React.createElement(RecordDetail, {
    record: neuDatensatz, language: "de", onBack: () => {}, t,
  }))).textContent || "";
  let neuPdf = ""; let neuPdfFehler = "";
  try {
    const doc = exportInspectionPdf(neuDatensatz, "de");
    const roh = doc?.output ? doc.output("datauristring") : "";
    neuPdf = entpacke(Buffer.from(roh.split(",")[1] || "", "base64"));
  } catch (fehler) { neuPdfFehler = String(fehler?.message || fehler); }

  const KORRIGIERT = /Warme Farbabweichung/;
  const STOFFBEHAUPTUNG = /Organische R(ü|ue)ckst(ä|ae)nde/;
  const t7Ansicht = KORRIGIERT.test(neuAnsicht) && !STOFFBEHAUPTUNG.test(neuAnsicht);
  const t7Bericht = KORRIGIERT.test(neuBericht) && !STOFFBEHAUPTUNG.test(neuBericht);
  const t7Pdf = !neuPdfFehler && KORRIGIERT.test(neuPdf) && !STOFFBEHAUPTUNG.test(neuPdf);
  /* Der Rohcode darf im Datensatz stehen bleiben - er traegt die Kopplung
     zur Known-Issue-Logik. */
  const rohcodeBleibt = JSON.stringify(neuDatensatz).includes("ORGANIC_RESIDUE");
  ok("T7", "Neue Pruefung behauptet nirgends organische Rueckstaende, Rohcode bleibt",
    t7Ansicht && t7Bericht && t7Pdf && rohcodeBleibt,
    neuPdfFehler ? `PDF-ABSTURZ: ${neuPdfFehler}`
      : `Ansicht ${t7Ansicht} · Bericht ${t7Bericht} · PDF ${t7Pdf} · Rohcode gespeichert ${rohcodeBleibt}`);

  /* ── T8 · Bedienbar auf 390 px ──────────────────────────────────────── */
  /* jsdom rechnet kein Layout. Geprueft wird deshalb zweierlei, beides
     ohne Textsuche: die tatsaechliche DOM-Verschachtelung und die
     tatsaechlich geltende CSS-Regel ueber die CSSOM.

     Die Messung in einem echten Browser bei 390 px liegt in
     werkbank/breitenmessung.mjs - sie braucht Chromium und ist deshalb
     nicht Teil von npm test. */
  const breitEl = await zeige(ergebnisAnsicht(SCREENING));
  const tabellen = [...breitEl.querySelectorAll(".screening-panel table")];
  const imScrollbereich = tabellen.length > 0 && tabellen.every(tabelle => {
    let knoten = tabelle.parentElement;
    while (knoten && knoten !== breitEl) {
      if (knoten.classList?.contains("table-scroll")) return true;
      knoten = knoten.parentElement;
    }
    return false;
  });

  const stil = new dom.window.CSSStyleSheet();
  stil.replaceSync(readFileSync(new URL("./src/styles.css", import.meta.url), "utf8"));
  const regel = auswahl2 => [...stil.cssRules]
    .filter(r => r.selectorText && r.selectorText.split(",").map(s => s.trim()).includes(auswahl2));
  const scrollRegeln = regel(".table-scroll");
  const hatScroll = scrollRegeln.some(r => /auto|scroll/.test(r.style.getPropertyValue("overflow-x")));
  const hatMaxBreite = scrollRegeln.some(r => r.style.getPropertyValue("max-width") === "100%");
  /* Der zweite Befund der Browsermessung: nicht die Tabelle schob die
     Seite auf, sondern die SHA-256-Zeile. 64 Zeichen ohne Leerstelle
     sind breiter als ein Telefonbildschirm; ohne Umbruchregel waren es
     492 px Seitenbreite bei 390 px Fenster. Die Tabelle sah nur nach der
     Ursache aus, weil sie die breiteste Sache auf dem Bildschirm ist. */
  const hashUmbruch = regel(".record-hash")
    .some(r => /anywhere|break-word/.test(r.style.getPropertyValue("overflow-wrap")));
  ok("T8", "Breite Screening-Tabelle scrollbar, Pruefsumme umbrechbar",
    imScrollbereich && hatScroll && hatMaxBreite && hashUmbruch,
    `${tabellen.length} Tabellen · im Scrollbereich ${imScrollbereich}`
    + ` · overflow-x gesetzt ${hatScroll} · max-width 100% ${hatMaxBreite}`
    + ` · Pruefsumme umbrechbar ${hashUmbruch}`);

  /* ── T9 · Drei unterscheidbare Zustaende, keiner heisst "keine Kratzer" */
  const zustand = async (element) => (await zeige(element)).textContent || "";
  const laeuft = await zustand(React.createElement(ScreeningPanel, { screening: undefined, t }));
  const nichtDa = await zustand(React.createElement(ScreeningPanel, { screening: null, t }));
  const nichtGespeichert = await zustand(React.createElement(ScreeningPanel, {
    screening: null, t, herkunft: "DATENSATZ",
  }));
  const keine = await zustand(React.createElement(ScreeningPanel, {
    screening: { ...SCREENING, photos: [{ ...SCREENING.photos[0], candidateCount: 0, candidates: [] }] }, t,
  }));
  const dreiVerschieden = new Set([laeuft, nichtDa, keine]).size === 3
    && /Berechnung l(ä|ae)uft/.test(laeuft)
    && /Screening nicht verf(ü|ue)gbar/.test(nichtDa)
    && /Screening-Daten nicht gespeichert/.test(nichtGespeichert)
    && /Keine Kandidaten gefunden/i.test(keine);
  /* Und keiner der vier Zustaende darf sich als Entwarnung lesen. */
  const keineEntwarnung = [laeuft, nichtDa, nichtGespeichert, keine]
    .every(text => !/keine Kratzer\b/i.test(text.replace(/kein Nachweis[^.]*\./gi, "")));
  ok("T9", "Berechnung laeuft, nicht verfuegbar, nicht gespeichert und keine Kandidaten sind unterscheidbar",
    dreiVerschieden && keineEntwarnung,
    `unterscheidbar ${dreiVerschieden} · keine Entwarnung ${keineEntwarnung}`);

  /* ── T11 · Position und gespeicherter Rang sind zwei Spalten ────────
     BEFUND aus dem Geraetelauf vom 13.09.2026: die Zeilen standen nach
     der UNGERICHTETEN Relevanz, die Spalte "Rang" zeigte aber den Platz
     der GERICHTETEN. Der erste Eintrag trug damit z.B. die 36 — zwei
     Ordnungen in einer Spalte, und keine davon war beschriftet.

     Jetzt: eine laufende POSITION, die sich beim Umschalten neu vergibt,
     und der gespeicherte gerichtete Rang getrennt und benannt daneben. */
  const mitKennung = {
    ...SCREENING,
    photos: [{
      ...SCREENING.photos[0],
      bildBreite: 480, bildHoehe: 640,
      candidates: SCREENING.photos[0].candidates.map((k, i) => ({
        ...k, kandidatId: `K0${i + 1}`,
      })),
    }],
  };
  const spaltenTexte = knoten => [...knoten.querySelectorAll("th")]
    .map(z => z.textContent.trim());
  const t11El = await zeige(React.createElement(ScreeningPanel,
    { screening: mitKennung, t }));
  const kopf = spaltenTexte(t11El);
  const hatPosition = kopf.some(x => /^Position$/i.test(x));
  const hatGerichtetenRang = kopf.some(x => /Rang.*gerichtet|gerichtet.*Rang/i.test(x));
  const hatKennung = kopf.some(x => /Kandidat/i.test(x));
  /* Die Voreinstellung ist die ungerichtete Sortierung; der erste
     Kandidat hat dort die hoechste ungerichtete Relevanz (0,0554 -> Rang
     1 der Anzeige), traegt aber den gespeicherten Rang 1 ... in dieser
     Fixture absichtlich gegenlaeufig: Rang 3 steht an Position 2. */
  /* Die Ueberschriften allein belegen nichts — eine Spalte "Position",
     in der der gespeicherte Rang steht, waere derselbe Fehler mit neuem
     Namen. Geprueft wird deshalb der INHALT: die Position laeuft
     lueckenlos 1..n, und in dieser absichtlich gegenlaeufigen Fixture
     weicht sie mindestens einmal vom gerichteten Rang ab. */
  const zeilen11 = [...t11El.querySelectorAll("tbody tr")]
    .map(z => [...z.querySelectorAll("td")].map(c => c.textContent.trim()));
  const positionLaeuft = zeilen11.map(z => z[0]).join(",") === "1,2,3";
  const weichtAb = zeilen11.some(z => z[0] !== z[2].split("\n")[0].trim());
  ok("T11", "Laufende Position und gespeicherter gerichteter Rang stehen getrennt",
    hatPosition && hatGerichtetenRang && hatKennung && positionLaeuft && weichtAb,
    `Spalten: ${kopf.join(" | ")}`
      + ` · Position lueckenlos ${positionLaeuft} · weicht vom Rang ab ${weichtAb}`
      + ` · Zeilen: ${zeilen11.map(z => `${z[0]}/${z[1]}/${z[2]}`).join("  ")}`);

  /* ── T12 · Die Kennung bleibt beim Sortierwechsel an ihrem Kandidaten */
  {
    const el = await zeige(React.createElement(ScreeningPanel,
      { screening: mitKennung, t }));
    const lies = knoten => [...knoten.querySelectorAll("tbody tr")].map(zeile => {
      const z = [...zeile.querySelectorAll("td")].map(c => c.textContent.trim());
      return { position: z[0], kennung: z[1], laenge: z[3] };
    });
    const vorher = lies(el);
    const auswahl = el.querySelector("select");
    await act(async () => {
      auswahl.value = "directed";
      auswahl.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const nachher = lies(el);
    /* Die Position wird neu vergeben: 1..n, immer lueckenlos. */
    const positionenNeu = nachher.map(r => r.position).join(",") === "1,2,3"
      && vorher.map(r => r.position).join(",") === "1,2,3";
    /* Die Kennung wandert MIT ihrem Messwert. */
    const paarVorher = new Map(vorher.map(r => [r.kennung, r.laenge]));
    const kennungBleibt = nachher.every(r => paarVorher.get(r.kennung) === r.laenge);
    const reihenfolgeAnders = vorher.map(r => r.kennung).join(",")
      !== nachher.map(r => r.kennung).join(",");
    ok("T12", "Die Kandidaten-Kennung ueberlebt den Sortierwechsel, die Position wird neu vergeben",
      positionenNeu && kennungBleibt && reihenfolgeAnders,
      `vorher ${vorher.map(r => r.kennung).join("/")} · nachher ${nachher.map(r => r.kennung).join("/")}`
        + ` · Position lueckenlos ${positionenNeu} · Kennung bleibt am Messwert ${kennungBleibt}`);
  }

  /* ── T13 · Zeile antippen waehlt genau diesen Kandidaten ────────────── */
  {
    const gewaehlt = [];
    const el = await zeige(React.createElement(ScreeningPanel, {
      screening: mitKennung, t,
      onAuswahl: (photoId, kandidatId) => gewaehlt.push(`${photoId}:${kandidatId}`),
    }));
    const ersteZelle = el.querySelector("tbody tr td button");
    let fehler = "";
    try {
      await act(async () => {
        ersteZelle.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
    } catch (caught) { fehler = String(caught?.message || caught); }
    const erwartet = [...el.querySelectorAll("tbody tr")][0]
      ?.querySelectorAll("td")[1]?.textContent.trim();
    ok("T13", "Ein Antippen der Zeile meldet Foto und stabile Kennung",
      !fehler && gewaehlt.length === 1 && gewaehlt[0] === `photo-1:${erwartet}`,
      fehler ? `ABSTURZ: ${fehler}`
        : gewaehlt.length ? `gemeldet: ${gewaehlt[0]} (erwartet photo-1:${erwartet})`
          : "kein Auswahlereignis — die Zeile ist nicht antippbar");
  }

  /* ── T14 · Der gewaehlte Kandidat ist im Bild hervorgehoben ─────────── */
  {
    const { ScreeningMarkierung } = await vite.ssrLoadModule("/src/App.jsx");
    const foto = mitKennung.photos[0];
    const el = await zeige(React.createElement(ScreeningMarkierung, {
      quelle: "data:image/jpeg;base64,QUJD",
      fotoScreening: foto, ausgewaehlt: "K02", t,
    }));
    const beschriftung = el.textContent || "";
    ok("T14", "Die Bildmarkierung nennt den hervorgehobenen Kandidaten",
      /K02/.test(beschriftung),
      beschriftung.trim().slice(0, 120));
  }

  /* ── T15 · Ohne gespeicherte Bildmasse keine erfundene Markierung ───── */
  {
    const { ScreeningMarkierung } = await vite.ssrLoadModule("/src/App.jsx");
    const ohneMasse = { ...mitKennung.photos[0], bildBreite: null, bildHoehe: null };
    const el = await zeige(React.createElement(ScreeningMarkierung, {
      quelle: "data:image/jpeg;base64,QUJD",
      fotoScreening: ohneMasse, ausgewaehlt: "K02", t,
    }));
    const text = el.textContent || "";
    ok("T15", "Ohne gespeicherte Bildmasse wird keine Markierung erfunden",
      /nicht gespeichert|nicht verortbar/i.test(text) && !/K02/.test(text),
      text.trim().slice(0, 140));
  }

  /* ── T16–T18 · Tiefengrenze in der Anzeige ──────────────────────────
     Die Vorgabe sagt "< 1,0 µm". Die gefährliche Richtung ist
     nicht, dass die Grenze fehlt — sondern dass die Kandidatentabelle
     aussieht, als beantwortete sie sie. */
  {
    const { ScreeningPanel: SP, DepthPanel, tiefenAnzeige }
      = await vite.ssrLoadModule("/src/App.jsx");
    /* Ein Kandidat mit Höchstkontrast und einer mit sehr geringem. */
    const gemischt = {
      ...mitKennung,
      photos: [{
        ...mitKennung.photos[0],
        candidates: mitKennung.photos[0].candidates.map((k, i) => ({
          ...k, edgeStrength: i === 0 ? 1.0 : 0.01,
        })),
      }],
    };
    const el = await zeige(React.createElement(SP, { screening: gemischt, t }));
    const text = el.textContent;
    const zeilen = [...el.querySelectorAll("tbody tr")]
      .map(z => [...z.querySelectorAll("td")].map(c => c.textContent.trim()));
    const letzte = zeilen.map(z => z[z.length - 1]);

    ok("T16", "Die Vorgabegrenze steht mit ihrem Operator über der Tabelle",
      /<\s*1,0\s*µm/.test(text),
      /* "≤ 1,0" und "< 1,0" sind nicht dasselbe — bei genau 1,000
         entscheidet allein dieses Zeichen. */
      `gefunden: ${(text.match(/[<≤]\s*1,0\s*µm/) || ["—"])[0]}`);

    ok("T17", "Hoher Kontrast empfiehlt eine Kontrolle, nennt aber keine Tiefe",
      letzte.some(x => /empfohlen/i.test(x))
      && !/\d\s*µm/.test(letzte.join(" ")),
      `Spalte: ${letzte.join(" | ")}`);

    ok("T18", "Niedriger Kontrast heißt 'nicht gemessen', nie 'nicht tief'",
      letzte.some(x => /nicht gemessen/i.test(x))
      && !/nicht tief|flach|unbedenklich|in Ordnung/i.test(letzte.join(" ")),
      "die Kantenstärke ist auf das Maximum DESSELBEN Bildes normiert — "
      + "ihre Abwesenheit belegt nichts");

    /* ── T19 · Der Tiefenkasten trennt die sechs Pflichtangaben ─────── */
    const messung = {
      valueUm: "0,85", unit: "µm", method: "TASTSCHNITT",
      uncertaintyUm: 0.05, measuredAt: "2026-09-15T09:30:00.000Z",
      measuredBy: "m.koch", source: "INDEPENDENT_MEASUREMENT",
    };
    const dEl = await zeige(React.createElement(DepthPanel, { messung, t }));
    const dText = dEl.textContent;
    const a = tiefenAnzeige(messung, t);
    ok("T19", "Der Tiefenkasten zeigt Messwert, Unsicherheit, Mittel, Zeit, Person und Original",
      a.entscheidung === "WITHIN_DEPTH_LIMIT"
      && a.zeilen.length >= 6
      && /0,85/.test(dText)            // die Eingabe im Original
      && /0\.85/.test(dText)           // der gelesene Wert
      && /TASTSCHNITT/.test(dText)
      && /m\.koch/.test(dText)
      && /keine Freigabe/i.test(dText),
      `Zustand ${a.entscheidung} · ${a.zeilen.length} Angaben`);

    /* ── T20 · Ohne Messung erfindet der Kasten nichts ──────────────── */
    const leerEl = await zeige(React.createElement(DepthPanel, { messung: null, t }));
    const leerA = tiefenAnzeige(null, t);
    /* Erste Fassung dieser Probe verbot JEDE Zahl mit µm im Kasten und
       fiel über den Erklärtext, der die Grenze (1,0 µm) und die
       Pixelabdeckung (50 µm) nennt — beides gehört dorthin. Geprüft wird
       deshalb die STRUKTUR: es darf keine Werteliste geben. Ein Messwert
       steht in der Liste, nie in der Prosa. */
    ok("T20", "Ohne Messung gibt es keine Werteliste und keinen Platzhalterwert",
      /nicht gemessen/i.test(leerEl.textContent)
      && leerA.zeilen.length === 0
      && leerEl.querySelector(".depth-werte") === null
      && leerA.ergebnis.valueUm === null,
      `${leerA.zeilen.length} Werte · Liste im DOM: `
      + `${leerEl.querySelector(".depth-werte") ? "vorhanden" : "keine"}`);
  }

  /* ── T21–T26 · Eingabemaske für Tiefenmessungen ─────────────────────
     Die sechs Pflichtangaben müssen über die Oberfläche erfassbar sein,
     an EINEN konkreten Befund gebunden, und die Bindung muss Speichern,
     Neuladen und Export überleben. Eine Messung ohne Befund ist keine
     Messung an diesem Teil. */
  {
    const { DepthMeasurementForm } = await vite.ssrLoadModule("/src/App.jsx");
    const { DEPTH_MEASUREMENT_SOURCE, evaluateDepthMeasurement, istSpeicherbar }
      = await vite.ssrLoadModule("/src/depthLimit.js");

    const gemeldet = [];
    const formEl = await zeige(React.createElement(DepthMeasurementForm, {
      photoId: "photo-1", kandidatId: "K02",
      user: { username: "m.koch", displayName: "M. Koch" },
      jetzt: () => "2026-09-16T08:00:00.000Z",
      onMessung: (m) => gemeldet.push(m), t,
    }));

    /* ── T21 · Alle sechs Pflichtangaben sind native Bedienelemente ──── */
    const felder = ["valueUm", "unit", "method", "uncertaintyUm", "measuredAt", "measuredBy"];
    const gefunden = felder.filter(name =>
      formEl.querySelector(`[name="${name}"]`) !== null);
    const nurNative = [...formEl.querySelectorAll("[name]")]
      .every(el => ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName));
    const hatBeschriftung = felder.every(name => {
      const el = formEl.querySelector(`[name="${name}"]`);
      if (!el) return false;
      return Boolean(el.id && formEl.querySelector(`label[for="${el.id}"]`))
        || Boolean(el.closest("label"));
    });
    ok("T21", "Alle sechs Pflichtangaben sind beschriftete native Bedienelemente",
      gefunden.length === 6 && nurNative && hatBeschriftung,
      `gefunden: ${gefunden.join(", ")} · nativ ${nurNative} · beschriftet ${hatBeschriftung}`);

    /* ── T22 · Die Maske zeigt das Urteil VOR dem Übernehmen ─────────── */
    const setze = async (name, wert) => {
      const el = formEl.querySelector(`[name="${name}"]`);
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          el.tagName === "SELECT"
            ? dom.window.HTMLSelectElement.prototype
            : dom.window.HTMLInputElement.prototype, "value").set;
        setter.call(el, wert);
        el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    };
    await setze("valueUm", "0,85");
    await setze("uncertaintyUm", "0,05");
    await setze("method", "TASTSCHNITT");
    const vorschauText = () => formEl.textContent || "";
    const zeigtUnter = /Unter der Tiefengrenze/i.test(vorschauText());
    await setze("valueUm", "1,20");
    await setze("uncertaintyUm", "0,30");
    const zeigtGrenzfall = /Grenzfall/i.test(vorschauText());
    ok("T22", "Die Maske zeigt das Urteil, bevor übernommen wird",
      zeigtUnter && zeigtGrenzfall,
      `0,85 ± 0,05 → unter der Grenze ${zeigtUnter}`
      + ` · 1,20 ± 0,30 → Grenzfall ${zeigtGrenzfall}`);

    /* ── T23 · Unvollständig lässt sich nicht übernehmen ─────────────── */
    await setze("method", "");
    const knopf = formEl.querySelector("button[type='submit']");
    const gesperrt = knopf.disabled === true;
    await setze("method", "TASTSCHNITT");
    const offen = formEl.querySelector("button[type='submit']").disabled === false;
    ok("T23", "Ohne Messmittel ist das Übernehmen gesperrt, mit wieder offen",
      gesperrt && offen,
      `ohne Messmittel gesperrt ${gesperrt} · mit Messmittel offen ${offen}`);

    /* ── T24 · Die übernommene Messung trägt Befund und Originaleingabe */
    await act(async () => {
      formEl.querySelector("form").dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    const m = gemeldet[0] || null;
    ok("T24", "Die Messung trägt Foto, Kennung und die Eingabe im Original",
      Boolean(m) && m.photoId === "photo-1" && m.kandidatId === "K02"
      && m.valueUm === "1,20" && m.uncertaintyUm === "0,30"
      && m.unit === "µm" && m.method === "TASTSCHNITT"
      && m.measuredBy === "m.koch" && m.measuredAt === "2026-09-16T08:00:00.000Z"
      && m.source === DEPTH_MEASUREMENT_SOURCE.INDEPENDENT
      && istSpeicherbar(m) === true,
      m ? `${m.photoId}/${m.kandidatId} · ${m.valueUm} ${m.unit} ± ${m.uncertaintyUm}`
        : "keine Messung gemeldet");

    /* ── T25 · Speichern und Neuladen erhalten die Zuordnung ─────────── */
    const messung = {
      photoId: "photo-1", kandidatId: "K02",
      valueUm: "0,85", unit: "µm", method: "TASTSCHNITT", uncertaintyUm: "0,05",
      measuredAt: "2026-09-16T08:00:00.000Z", measuredBy: "m.koch",
      source: DEPTH_MEASUREMENT_SOURCE.INDEPENDENT,
    };
    const mitMessung = buildInspectionRecord({
      ...basis, id: "insp-tiefe-1", depthMeasurements: [messung],
    });
    mitMessung.recordHash = await recordDigest(mitMessung);
    let mFehler = "";
    try { await saveInspection(mitMessung, akteur); }
    catch (fehler) { mFehler = String(fehler?.message || fehler); }
    const mGeladen = (await loadInspections()).find(r => r.id === "insp-tiefe-1") || null;
    const mExport = ((await exportReadableData()).inspections || [])
      .find(r => r.id === "insp-tiefe-1") || null;
    const bindung = quelle => quelle?.depthMeasurements?.[0]?.photoId === "photo-1"
      && quelle?.depthMeasurements?.[0]?.kandidatId === "K02"
      && quelle?.depthMeasurements?.[0]?.valueUm === "0,85";
    ok("T25", "Speichern, Neuladen und Export erhalten die Zuordnung zum Befund",
      !mFehler && bindung(mGeladen) && bindung(mExport),
      mFehler ? `SPEICHERN ABGEWIESEN: ${mFehler}`
        : `geladen ${bindung(mGeladen)} · Export ${bindung(mExport)}`);

    /* ── T26 · Eine Messung ohne Befundbindung wird abgewiesen ───────── */
    const ohneBindung = buildInspectionRecord({
      ...basis, id: "insp-tiefe-2",
      depthMeasurements: [{ ...messung, kandidatId: null }],
    });
    ohneBindung.recordHash = await recordDigest(ohneBindung);
    let abgewiesen = "";
    try { await saveInspection(ohneBindung, akteur); }
    catch (fehler) { abgewiesen = String(fehler?.message || fehler); }
    /* Und die Gegenrichtung: das Urteil wird beim Anzeigen GERECHNET,
       nicht aus dem Datensatz geglaubt. */
    const ausDatensatz = evaluateDepthMeasurement(mGeladen?.depthMeasurements?.[0]);
    /* ── T27 · Unvollständig kommt auch an der Maske vorbei nicht durch ─
       Befund aus der eigenen Sabotageprobe S14: die Vollständigkeitssperre
       an der SPEICHERGRENZE war von keinem Test belegt. T23 prüft nur die
       Maske — und eine Maske ist keine Sicherheitsgrenze, sie ist eine
       Bequemlichkeit. Wer `saveInspection` direkt aufruft, umgeht sie. */
    const unvollstaendig = buildInspectionRecord({
      ...basis, id: "insp-tiefe-3",
      depthMeasurements: [{ ...messung, method: null }],
    });
    unvollstaendig.recordHash = await recordDigest(unvollstaendig);
    let luecke = "";
    try { await saveInspection(unvollstaendig, akteur); }
    catch (fehler) { luecke = String(fehler?.message || fehler); }
    /* Und ein mitgeliefertes Urteil wird ebenfalls abgewiesen. */
    const mitUrteil = buildInspectionRecord({ ...basis, id: "insp-tiefe-4" });
    mitUrteil.depthMeasurements = [{ ...messung, decision: "WITHIN_DEPTH_LIMIT" }];
    mitUrteil.recordHash = await recordDigest(mitUrteil);
    let urteilAbgewiesen = "";
    try { await saveInspection(mitUrteil, akteur); }
    catch (fehler) { urteilAbgewiesen = String(fehler?.message || fehler); }
    ok("T27", "Die Speichergrenze weist unvollständige Messungen und mitgelieferte Urteile ab",
      /Messmittel|Unvollstaendig|unvollständig/i.test(luecke)
      && /Urteil/i.test(urteilAbgewiesen),
      `ohne Messmittel: ${luecke ? luecke.slice(0, 50) : "DURCHGELASSEN"}`
      + ` · mit Urteil: ${urteilAbgewiesen ? urteilAbgewiesen.slice(0, 40) : "DURCHGELASSEN"}`);

    ok("T26", "Ohne Kandidaten-Kennung weist die Speichergrenze ab; das Urteil wird gerechnet",
      Boolean(abgewiesen) && /Kennung|kandidatId|Befund/i.test(abgewiesen)
      && ausDatensatz.decision === "WITHIN_DEPTH_LIMIT"
      && mGeladen?.depthMeasurements?.[0]?.decision === undefined,
      abgewiesen ? `abgewiesen: ${abgewiesen.slice(0, 70)}`
        : "die Speichergrenze liess eine Messung ohne Befund durch");
  }

  /* ── T28–T31 · Der ÜBERSEHENE Befund ────────────────────────────────
     Die wichtigste Lücke aus der Gegenprüfung vom 16.09.2026: wenn die
     Eingabemaske nur über automatisch erkannte Kandidaten erreichbar ist,
     misst eine Kampagne erneut nur die Schäden, die der Detektor ohnehin
     gefunden hat — und genau der Fehler „Riefe gar nicht markiert" bleibt
     unerfassbar.

     Der geprüfte Weg: Detektor findet NICHTS · Prüfer markiert die Stelle
     manuell · trägt die Referenzmessung ein · sie wird gespeichert, neu
     geladen, exportiert und in der Bilanz als ÜBERSEHEN gezählt. */
  {
    const { UebersehenePanel } = await vite.ssrLoadModule("/src/App.jsx");
    const { befundBilanz } = await vite.ssrLoadModule("/src/depthLimit.js");

    /* Ein Foto mit einer manuell markierten Stelle — und ein Screening,
       das auf diesem Foto NULL Kandidaten hat. */
    const markiertesFoto = {
      ...fotos[0], id: "photo-1",
      markers: [{ id: "M01", x: 0.42, y: 0.61 }],
    };
    const ohneKandidaten = {
      ...SCREENING,
      photos: [{ ...SCREENING.photos[0], candidateCount: 0, candidates: [] }],
    };

    /* ── T28 · Der manuelle Weg ist erreichbar, auch wenn der Detektor
           GAR NICHTS gefunden hat ── */
    const gemeldet = [];
    const uEl = await zeige(React.createElement(UebersehenePanel, {
      fotos: [markiertesFoto], messungen: [], onMessung: m => gemeldet.push(m),
      benutzer: { username: "m.koch" }, t,
    }));
    const knoepfe = [...uEl.querySelectorAll("button")]
      .filter(b => /M01/.test(b.textContent || ""));
    ok("T28", "Ohne einen einzigen Kandidaten ist die manuelle Markierung erreichbar",
      knoepfe.length === 1 && /übersehen|nicht erkannt/i.test(uEl.textContent),
      `${knoepfe.length} Markierung(en) angeboten · Screening meldet `
      + `${ohneKandidaten.photos[0].candidateCount} Kandidaten`);

    /* ── T29 · Die Messung bindet an den Marker, nicht an einen Kandidaten */
    const uebersehen = {
      photoId: "photo-1", markerId: "M01", kandidatId: null,
      valueUm: "2,40", unit: "µm", method: "TASTSCHNITT", uncertaintyUm: "0,10",
      measuredAt: "2026-09-16T09:00:00.000Z", measuredBy: "m.koch",
      source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
    };
    const mitUebersehen = buildInspectionRecord({
      ...basis, id: "insp-uebersehen-1",
      photos: [markiertesFoto],
      depthMeasurements: [uebersehen],
    });
    mitUebersehen.recordHash = await recordDigest(mitUebersehen);
    let uFehler = "";
    try { await saveInspection(mitUebersehen, akteur); }
    catch (fehler) { uFehler = String(fehler?.message || fehler); }
    const uGeladen = (await loadInspections()).find(r => r.id === "insp-uebersehen-1") || null;
    const uExport = ((await exportReadableData()).inspections || [])
      .find(r => r.id === "insp-uebersehen-1") || null;
    const gebunden = q => q?.depthMeasurements?.[0]?.markerId === "M01"
      && q?.depthMeasurements?.[0]?.kandidatId === null
      && q?.depthMeasurements?.[0]?.photoId === "photo-1";
    ok("T29", "Die übersehene Riefe wird gespeichert, neu geladen und exportiert",
      !uFehler && gebunden(uGeladen) && gebunden(uExport),
      uFehler ? `SPEICHERN ABGEWIESEN: ${uFehler}`
        : `geladen ${gebunden(uGeladen)} · Export ${gebunden(uExport)}`);

    /* ── T30 · Die Auswertung zählt sie als übersehen — und als verfehlte
           Grenzüberschreitung, weil 2,40 ± 0,10 über 1,0 liegt ── */
    const bilanz = befundBilanz(uGeladen?.depthMeasurements || []);
    ok("T30", "Die Bilanz führt sie als übersehene Grenzüberschreitung",
      bilanz.gesamt === 1 && bilanz.erkannt === 0 && bilanz.uebersehen === 1
      && bilanz.uebersehenUeberGrenze === 1,
      `erkannt ${bilanz.erkannt} · übersehen ${bilanz.uebersehen}`
      + ` · davon über der Grenze ${bilanz.uebersehenUeberGrenze}`);

    /* ── T31 · Genau EINE Bindung, und der Marker muss es geben ── */
    const baue = (over, id) => {
      const r = buildInspectionRecord({
        ...basis, id, photos: [markiertesFoto],
        depthMeasurements: [{ ...uebersehen, ...over }],
      });
      return r;
    };
    const abweisung = async (over, id) => {
      const r = baue(over, id);
      r.recordHash = await recordDigest(r);
      try { await saveInspection(r, akteur); return ""; }
      catch (fehler) { return String(fehler?.message || fehler); }
    };
    const beide = await abweisung({ kandidatId: "K01" }, "insp-uebersehen-2");
    const keiner = await abweisung({ markerId: null }, "insp-uebersehen-3");
    const fremder = await abweisung({ markerId: "M99" }, "insp-uebersehen-4");
    /* ── T32 · Die VERDRAHTUNG, nicht nur die Komponente ──────────────
       Befund aus der eigenen Sabotageprobe S23: T28 rendert
       UebersehenePanel direkt und belegt damit nichts darüber, ob es im
       Bildschirmfluss überhaupt erscheint. Läge es INNERHALB von
       ScreeningPanel, verschwände es genau im interessanten Fall — dort
       kehrt die Komponente bei null Kandidaten früh zurück.

       Geprüft wird deshalb die echte Ergebnisansicht mit einem Screening
       OHNE Kandidaten. */
    {
      /* Die Ergebnisansicht braucht die LEBENDE Fotoform (mit rawResult),
         nicht die Datensatzform. */
      const lebendMarkiert = { ...lebendeFotos[0], markers: markiertesFoto.markers };
      const el = await zeige(ergebnisAnsicht(ohneKandidaten, {
        photos: [lebendMarkiert],
        depthMeasurements: [], onDepthMeasurement: () => {},
      }));
      const panel = el.querySelector(".uebersehen-panel");
      const screeningFrueh = /Keine Kandidaten gefunden/i.test(el.textContent);
      ok("T32", "Die Ergebnisansicht zeigt den manuellen Weg auch bei null Kandidaten",
        Boolean(panel) && screeningFrueh
        && /M01/.test(panel?.textContent || ""),
        `Screening meldet "keine Kandidaten" ${screeningFrueh}`
        + ` · manueller Bereich vorhanden ${Boolean(panel)}`);
    }

    /* ── T33 · Eine zweite Markierung verdrängt die erste NICHT ───────
       Befund der Gegenprüfung vom 16.09.2026, reproduziert am echten
       Handler. Er erkannte eine schon vorhandene Messung an
       `photoId + kandidatId` — und `kandidatId` ist bei JEDER manuellen
       Markierung `null`. `null === null` ist wahr, also galt M02 als
       Ersatz für M01, und M01 verschwand.

       Folge für die Kampagne: die Zahl der übersehenen
       Grenzüberschreitungen sinkt auf 0, obwohl eine vorlag. Genau die
       Kennzahl, um die es geht.

       Geprüft wird die REINE Ersetzungsregel, nicht die Oberfläche —
       sie ist der Ort des Fehlers. */
    {
      const { ersetzeMessung } = await vite.ssrLoadModule("/src/depthLimit.js");
      const m01 = { photoId: "photo-1", kandidatId: null, markerId: "M01",
        valueUm: "2,40", uncertaintyUm: "0,10" };
      const m02 = { photoId: "photo-1", kandidatId: null, markerId: "M02",
        valueUm: "0,40", uncertaintyUm: "0,10" };
      const k01 = { photoId: "photo-1", kandidatId: "K01", markerId: null,
        valueUm: "1,50", uncertaintyUm: "0,10" };
      const k01neu = { ...k01, valueUm: "1,90" };

      const nachM01 = ersetzeMessung([], m01);
      const nachM02 = ersetzeMessung(nachM01, m02);
      const nachK01 = ersetzeMessung(nachM02, k01);
      /* Dieselbe Bindung ERSETZT — das ist gewollt und muss bleiben. */
      const nachKorrektur = ersetzeMessung(nachK01, k01neu);

      const beideMarker = nachM02.length === 2
        && nachM02.some(m => m.markerId === "M01")
        && nachM02.some(m => m.markerId === "M02");
      const dreiBindungen = nachK01.length === 3;
      const ersetztRichtig = nachKorrektur.length === 3
        && nachKorrektur.find(m => m.kandidatId === "K01").valueUm === "1,90";

      /* Und die Kennzahl, um die es geht. */
      const bilanz2 = befundBilanz(nachKorrektur.map(m => ({
        ...m, unit: "µm", method: "TASTSCHNITT",
        measuredAt: "2026-09-16T09:00:00.000Z", measuredBy: "m.koch",
        source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
      })));
      ok("T33", "Eine zweite manuelle Markierung verdrängt die erste nicht",
        beideMarker && dreiBindungen && ersetztRichtig
        && bilanz2.uebersehen === 2 && bilanz2.uebersehenUeberGrenze === 1,
        `nach M01+M02: ${nachM02.length} Einträge (${nachM02.map(m => m.markerId || m.kandidatId).join(", ")})`
        + ` · nach Korrektur K01: ${nachKorrektur.length}`
        + ` · übersehen ${bilanz2.uebersehen}, davon über der Grenze ${bilanz2.uebersehenUeberGrenze}`);
    }

    /* ── T34 · Derselbe Fall über den GANZEN Weg ──────────────────────
       T33 prüft die Regel. Das genügt nicht: die Gegenprüfung hat den
       Fehler nicht an der Regel gesehen, sondern am Ende der Kette —
       „Speichern, Neuladen, Export → nur M02". Eine Regel kann richtig
       sein und trotzdem an der Speichergrenze oder beim Serialisieren
       verloren gehen; genau dort lagen die früheren Befunde.

       Deshalb hier zwei manuelle Markierungen auf DEMSELBEN Foto durch
       die echte Persistenz, den Wiederauf-Ruf, den lesbaren Export und
       das erzeugte PDF — und die Bilanz am geladenen Datensatz, nicht
       an der Eingabe. Das ist der Weg, den der Handytest geht. */
    {
      const { ersetzeMessung } = await vite.ssrLoadModule("/src/depthLimit.js");
      const zweiMarker = {
        ...fotos[0], id: "photo-1",
        markers: [{ id: "M01", x: 0.42, y: 0.61 }, { id: "M02", x: 0.18, y: 0.30 }],
      };
      const grund = {
        photoId: "photo-1", kandidatId: null, unit: "µm", method: "TASTSCHNITT",
        measuredAt: "2026-09-16T09:00:00.000Z", measuredBy: "m.koch",
        source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
      };
      /* Die Reihenfolge der Eingabe im Handytest: erst M01, dann M02. */
      const eingetragen = ersetzeMessung(
        ersetzeMessung([], { ...grund, markerId: "M01", valueUm: "2,40", uncertaintyUm: "0,10" }),
        { ...grund, markerId: "M02", valueUm: "0,40", uncertaintyUm: "0,10" });

      const zwei = buildInspectionRecord({
        ...basis, id: "insp-zwei-marker",
        photos: [zweiMarker], depthMeasurements: eingetragen,
      });
      zwei.recordHash = await recordDigest(zwei);
      let zFehler = "";
      try { await saveInspection(zwei, akteur); }
      catch (fehler) { zFehler = String(fehler?.message || fehler); }

      const zGeladen = (await loadInspections()).find(r => r.id === "insp-zwei-marker") || null;
      const zExport = ((await exportReadableData()).inspections || [])
        .find(r => r.id === "insp-zwei-marker") || null;
      const beide = quelle => {
        const m = quelle?.depthMeasurements || [];
        return m.length === 2
          && m.some(x => x.markerId === "M01" && x.valueUm === "2,40")
          && m.some(x => x.markerId === "M02" && x.valueUm === "0,40");
      };

      /* Und das gedruckte Blatt: beide Kennungen, beide Werte. */
      let pdfText = "", pdfFehler = "";
      try {
        const doc = exportInspectionPdf(zGeladen, "de");
        pdfText = entpacke(Buffer.from(doc.output("arraybuffer")));
      } catch (fehler) { pdfFehler = String(fehler?.message || fehler); }
      const imPdf = /M01/.test(pdfText) && /M02/.test(pdfText)
        && /2[,.]40/.test(pdfText) && /0[,.]40/.test(pdfText);

      /* Die Kennzahl der Kampagne — am GELADENEN Datensatz. */
      const zBilanz = befundBilanz(zGeladen?.depthMeasurements || []);

      ok("T34", "Zwei manuelle Markierungen überleben Speichern, Neuladen, Export und PDF",
        !zFehler && !pdfFehler && beide(zGeladen) && beide(zExport) && imPdf
        && zBilanz.uebersehen === 2 && zBilanz.uebersehenUeberGrenze === 1,
        zFehler ? `SPEICHERN ABGEWIESEN: ${zFehler}`
          : pdfFehler ? `PDF-ABSTURZ: ${pdfFehler}`
            : `geladen ${(zGeladen?.depthMeasurements || []).length} Messungen`
              + ` (${(zGeladen?.depthMeasurements || []).map(m => m.markerId).join(", ")})`
              + ` · Export ${beide(zExport)} · im PDF ${imPdf}`
              + ` · übersehen ${zBilanz.uebersehen}, davon über der Grenze`
              + ` ${zBilanz.uebersehenUeberGrenze}`);
    }

    /* ── T31b · Auch die KANDIDATEN-Kennung muss existieren ───────────
       Befund der Gegenprüfung vom 16.09.2026, zutreffend und sperrend: die
       Speichergrenze prüfte die Marker-Kennung, die Kandidaten-Kennung
       aber nicht. Eine erfundene Kennung wurde als „vom Detektor erkannt"
       gespeichert — und befundBilanz() zählte sie als erkannt.

       Das umgeht keine Freigabesicherung, verfälscht aber genau die
       Kennzahl, um die es in der Kampagne geht: ein übersehener Befund
       kann als erkannt erscheinen. Damit wäre die Verfehlungsrate
       geschönt, ohne dass es jemandem auffällt.

       Geprüft werden alle drei Fälle — auch der gültige, denn eine Sperre,
       die alles abweist, beweist nichts über ihre Grenze. */
    {
      const mitScreening = { ...basis, screening: mitKennung };
      const baueK = (over, id) => buildInspectionRecord({
        ...mitScreening, id,
        depthMeasurements: [{
          ...uebersehen, markerId: null, kandidatId: "K02", ...over,
        }],
      });
      const versuch = async (over, id) => {
        const r = baueK(over, id);
        r.recordHash = await recordDigest(r);
        try { await saveInspection(r, akteur); return ""; }
        catch (fehler) { return String(fehler?.message || fehler); }
      };
      /* K02 gibt es auf photo-1 — dieser Fall MUSS durchgehen. */
      const gueltig = await versuch({}, "insp-kand-ok");
      /* Erfundene Kennung. */
      const erfunden = await versuch(
        { kandidatId: "K999-EXISTIERT-NICHT" }, "insp-kand-erfunden");
      /* Kennung, die es gibt — aber auf einem anderen Foto. */
      const falschesFoto = await versuch(
        { photoId: "photo-2" }, "insp-kand-falschesfoto");

      ok("T31b", "Eine Kandidaten-Kennung muss auf genau diesem Foto existieren",
        !gueltig && /existiert nicht/i.test(erfunden)
        && Boolean(falschesFoto),
        `gültig (K02 auf photo-1): ${gueltig ? "ABGEWIESEN — " + gueltig.slice(0, 40) : "angenommen"}`
        + ` · erfunden: ${erfunden ? "abgewiesen" : "DURCHGELASSEN"}`
        + ` · falsches Foto: ${falschesFoto ? "abgewiesen" : "DURCHGELASSEN"}`);
    }

    ok("T31", "Genau eine Bindung, und die Marker-Kennung muss auf dem Foto existieren",
      /GENAU eine Bindung/i.test(beide) && /GENAU eine Bindung/i.test(keiner)
      && /existiert nicht/i.test(fremder),
      `beide gesetzt: ${beide ? "abgewiesen" : "DURCHGELASSEN"}`
      + ` · keine: ${keiner ? "abgewiesen" : "DURCHGELASSEN"}`
      + ` · fremder Marker: ${fremder ? "abgewiesen" : "DURCHGELASSEN"}`);
  }

  /* ── T10 · Der Test schreibt nichts ins Projektverzeichnis ───────────
     Diese Suite erzeugt vier PDFs. Landen sie auf der Platte, veraendert
     `npm run verify` das Paket, das es prueft. Der Abfang muss GEGRIFFEN
     haben — dass keine Datei da ist, waere fuer sich kein Beleg (der
     Export koennte gar nicht aufgerufen worden sein). */
  const keineDatei = ["insp-screen-1", "insp-alt-421", "insp-neu-427"]
    .every(id => !existsSync(new URL(`./VisuClean_${id}.pdf`, import.meta.url)));
  ok("T10", "Der Test schreibt keine PDF-Datei ins Projektverzeichnis",
    gespeicherteDateien.length > 0 && keineDatei,
    gespeicherteDateien.length
      ? `${gespeicherteDateien.length}x save() abgefangen, keine Datei erzeugt`
      : "save() wurde gar nicht aufgerufen — der Abfang belegt nichts");

} finally {
  await vite.close();
}

console.log("");
const durchgefallen = checks.filter(c => !c.passed);
console.log(`Bestanden: ${checks.length - durchgefallen.length} / ${checks.length}`);
if (durchgefallen.length) console.log(`Durchgefallen: ${durchgefallen.map(c => c.id).join(", ")}`);
console.log(`ERGEBNIS: ${durchgefallen.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(durchgefallen.length ? 1 : 0);
