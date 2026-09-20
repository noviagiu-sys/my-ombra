/* ─── VisuClean · P3 · Geführter Aufnahmeablauf, Ende zu Ende ──────────────
   Aufruf: node sequenztest.mjs

   P3 verlangt drei Dinge, und diese Suite prüft alle drei getrennt:

     AUFNAHMEABLAUF  die Bedienführung nennt die Lichtposition, führt sie
                     in fester Reihenfolge und lässt die Analyse nicht zu,
                     solange eine Position fehlt.
     SPEICHERUNG     Originalbilder, Lichtpositionen und die Zuordnung zur
                     Zone stehen im Datensatz und überleben Speichern und
                     Neuladen.
     WIEDERHOLBARKEIT im Datensatz steht alles, was jemand braucht, um
                     dieselbe Aufnahme in vier Wochen noch einmal zu
                     machen.

   AUSDRÜCKLICH NICHT GEPRÜFT: ob die Feuchtebeurteilung mit vollständiger
   Sequenz RICHTIG ist. Eine Sequenz erfüllt die Vorbedingung des Tors aus
   rc.4.26 — sie belegt keine zuverlässige Erkennung. Das kann nur eine
   Messkampagne zeigen (P6).                                               */

import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { inflateSync } from "node:zlib";

const dom = new JSDOM(
  "<!doctype html><html lang=\"de\"><head><title>VisuClean</title></head>"
  + "<body><div id=\"root\"></div></body></html>",
  { url: "https://visuclean.test/", pretendToBeVisual: true });
for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement", "Node",
  "MutationObserver", "getComputedStyle", "Image", "Blob", "Event"]) {
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
    catch { /* unkomprimiert */ }
  }
  return text;
}

/* Keine Nebenwirkung: save() abfangen, bevor irgendein PDF entsteht. */
const { jsPDF } = await import("jspdf");
const gespeicherteDateien = [];
jsPDF.API.save = function abgefangen(name) { gespeicherteDateien.push(name); return this; };
globalThis.URL = globalThis.URL || {};
globalThis.URL.createObjectURL = () => "blob:test";
globalThis.URL.revokeObjectURL = () => {};

console.log("VisuClean · P3 — geführter Aufnahmeablauf\n");

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let behaelter = null; let wurzel = null;
async function zeige(element) {
  if (!wurzel) { behaelter = document.getElementById("root"); wurzel = createRoot(behaelter); }
  await act(async () => { wurzel.render(element); });
  return behaelter;
}

try {
  const seq = await vite.ssrLoadModule("/src/aufnahmeSequenz.js");
  const { LICHTPOSITION } = await vite.ssrLoadModule("/src/capturePaths.js");
  const { MultiCapture } = await vite.ssrLoadModule("/src/App.jsx");
  const { translator } = await vite.ssrLoadModule("/src/i18n.js");
  const { buildInspectionRecord, SIGNATURE_MEANING } =
    await vite.ssrLoadModule("/src/inspectionRecord.js");
  const { LIFECYCLE_STATE } = await vite.ssrLoadModule("/src/lifecycle.js");
  const { buildCheckpoints, STATUS } = await vite.ssrLoadModule("/src/assessment.js");
  const { aggregateResults, deriveSystemDecision, APP_VERSION } =
    await vite.ssrLoadModule("/src/domain.js");
  const { CAPTURE_PATH, captureProfile } = await vite.ssrLoadModule("/src/decision.js");
  const { exportInspectionPdf } = await vite.ssrLoadModule("/src/pdfExport.js");
  const { saveInspection, loadInspections } = await vite.ssrLoadModule("/src/persistence.js");
  const { recordDigest } = await vite.ssrLoadModule("/src/audit.js");

  const t = translator("de");
  const ZONE = "die";
  const JETZT = "2026-09-13T08:00:00.000Z";

  /* ── Q1 · Reihenfolge ist festgelegt, nicht zufällig ─────────────────── */
  {
    let s = seq.leereSequenz(ZONE);
    const folge = [];
    for (let i = 0; i < 3; i++) {
      const pos = seq.naechsteLichtposition(s);
      folge.push(pos);
      s = seq.schrittHinzufuegen(s, {
        lichtposition: pos, photoId: `p${i}`, zoneId: ZONE,
        aufgenommenAm: JETZT,
      }).sequenz;
    }
    const erwartet = [LICHTPOSITION.NORMAL, LICHTPOSITION.STREIFLICHT_LINKS,
      LICHTPOSITION.STREIFLICHT_RECHTS];
    ok("Q1", "Der Ablauf führt in fester Reihenfolge: normal, links, rechts",
      folge.join(",") === erwartet.join(",")
      && seq.naechsteLichtposition(s) === null,
      folge.join(" → "));
  }

  /* ── Q2 · Unvollständig bleibt unvollständig ─────────────────────────── */
  {
    let s = seq.leereSequenz(ZONE);
    s = seq.schrittHinzufuegen(s, { lichtposition: LICHTPOSITION.NORMAL, photoId: "p1", zoneId: ZONE }).sequenz;
    s = seq.schrittHinzufuegen(s, { lichtposition: LICHTPOSITION.STREIFLICHT_LINKS, photoId: "p2", zoneId: ZONE }).sequenz;
    const status = seq.sequenzStatus(s);
    ok("Q2", "Zwei von drei Positionen ergeben KEINE vollständige Sequenz",
      !status.vollstaendig && status.fehlend.includes(LICHTPOSITION.STREIFLICHT_RECHTS),
      `fehlend: ${status.fehlend.join(", ")}`);
  }

  /* ── Q3 · Wiederholte Position ersetzt, verliert aber nichts ─────────── */
  {
    let s = seq.leereSequenz(ZONE);
    s = seq.schrittHinzufuegen(s, { lichtposition: LICHTPOSITION.NORMAL, photoId: "alt", zoneId: ZONE }).sequenz;
    s = seq.schrittHinzufuegen(s, { lichtposition: LICHTPOSITION.NORMAL, photoId: "neu", zoneId: ZONE }).sequenz;
    const normal = s.captures.filter(c => c.lichtposition === LICHTPOSITION.NORMAL);
    ok("Q3", "Eine wiederholte Position ersetzt den Eintrag, der erste Versuch bleibt sichtbar",
      normal.length === 1 && normal[0].photoId === "neu"
      && s.ersetzt.length === 1 && s.ersetzt[0].photoId === "alt",
      `aktiv: ${normal[0]?.photoId} · ersetzt: ${s.ersetzt.map(c => c.photoId).join(", ")}`);
  }

  /* ── Q4 · Fremde Zone und unbekannte Position werden abgewiesen ──────── */
  {
    const s = seq.leereSequenz(ZONE);
    const fremd = seq.schrittHinzufuegen(s, {
      lichtposition: LICHTPOSITION.NORMAL, photoId: "x", zoneId: "andere",
    });
    const unbekannt = seq.schrittHinzufuegen(s, {
      lichtposition: "TASCHENLAMPE", photoId: "y", zoneId: ZONE,
    });
    const ohneId = seq.schrittHinzufuegen(s, {
      lichtposition: LICHTPOSITION.NORMAL, photoId: "", zoneId: ZONE,
    });
    ok("Q4", "Fremde Zone, unbekannte Lichtposition und fehlende Foto-ID werden abgewiesen",
      fremd.fehler === "ANDERE_ZONE" && unbekannt.fehler === "UNBEKANNTE_LICHTPOSITION"
      && ohneId.fehler === "PHOTO_ID_FEHLT"
      && fremd.sequenz.captures.length === 0,
      `${fremd.fehler} · ${unbekannt.fehler} · ${ohneId.fehler}`);
  }

  /* ── Aufnahmen und Datensatz für die folgenden Prüfungen ─────────────── */
  const MERKMALE = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
  const URTEIL = {
    dry: { pass: true, code: "PASS" }, clean: { pass: true, code: "PASS" },
    intact: { pass: true, code: "PASS" },
  };
  let vollSequenz = seq.leereSequenz(ZONE);
  const fotos = [];
  for (const [i, pos] of [LICHTPOSITION.NORMAL, LICHTPOSITION.STREIFLICHT_LINKS,
    LICHTPOSITION.STREIFLICHT_RECHTS].entries()) {
    const id = `photo-${i + 1}`;
    vollSequenz = seq.schrittHinzufuegen(vollSequenz, {
      lichtposition: pos, photoId: id, zoneId: ZONE,
      aufgenommenAm: `2026-09-13T08:0${i}:00.000Z`,
    }).sequenz;
    fotos.push({
      id, image: "data:image/jpeg;base64,QUJD", annotatedImage: "data:image/jpeg;base64,QUJD",
      markers: [], markerAssessments: [], knownIssueInfo: null,
      lichtposition: pos,
      captureProfile: captureProfile({
        processedWidth: 480, processedHeight: 640,
        sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
      }),
    });
  }

  /* ── Q5 · Mit Sequenz kein NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE ───────── */
  {
    const ohne = buildCheckpoints(MERKMALE, URTEIL, null)
      .find(p => p.id === "moisture");
    const mit = buildCheckpoints(MERKMALE, URTEIL, { feuchteSequenz: vollSequenz })
      .find(p => p.id === "moisture");
    ok("Q5", "Erst eine vollständige Sequenz hebt die Sperre des Feuchtepunkts auf",
      ohne.code === "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE"
      && ohne.status === STATUS.NOT_ASSESSABLE
      && mit.code !== "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE",
      `ohne Sequenz ${ohne.code} · mit Sequenz ${mit.code}`);
  }

  const ergebnis = pos => ({
    dry: { ...URTEIL.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...URTEIL.clean, message: "", detail: "", severity: 0, action: "" },
    intact: { ...URTEIL.intact, message: "", detail: "", severity: 0, action: "" },
    lm: 0.6, hints: [],
    checkpoints: buildCheckpoints(MERKMALE, URTEIL, { feuchteSequenz: vollSequenz }),
    _pos: pos,
  });
  const fotosMitErgebnis = fotos.map(f => ({ ...f, result: ergebnis(f.lichtposition) }));
  const aggregat = aggregateResults(fotosMitErgebnis.map(f => f.result));

  const datensatz = buildInspectionRecord({
    id: "insp-p3", appVersion: APP_VERSION, now: JETZT,
    user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
    eqId: "tp", eqName: "Tablettenpresse", zoneId: ZONE, zoneName: "Matrizenteller",
    photos: fotosMitErgebnis, aggregate: aggregat,
    originalSystemDecision: deriveSystemDecision(aggregat),
    finalDecision: "PASS",
    performedBy: { username: "operator1", role: "Operator", at: JETZT },
    reauthenticated: true,
    signature: {
      method: "USER_ID_PASSWORD", components: ["userId", "password"],
      meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_PASS],
      signedAt: JETZT, signedBy: "operator1",
    },
    feuchteSequenz: vollSequenz,
  });
  datensatz.recordHash = await recordDigest(datensatz);

  /* ── Q6 · Der Datensatz trägt die Sequenz vollständig ────────────────── */
  {
    const s = datensatz.feuchteSequenz;
    const positionen = (s?.captures || []).map(c => c.lichtposition);
    const alleFotos = (s?.captures || []).every(c =>
      datensatz.photos.some(f => f.id === c.photoId && f.image));
    ok("Q6", "Lichtpositionen, Foto-Zuordnung, Reihenfolge und Zone stehen im Datensatz",
      Boolean(s) && s.zoneId === ZONE && s.vollstaendig === true
      && positionen.length === 3 && alleFotos
      && (s.captures || []).every(c => Number.isInteger(c.reihenfolge))
      && (s.captures || []).every(c => typeof c.aufgenommenAm === "string"),
      s ? `${positionen.join(", ")} · Zone ${s.zoneId} · Anleitung v${s.anleitungVersion}`
        : "keine Sequenz im Datensatz");
  }

  /* ── Q7 · Jede Aufnahme trägt ihre Lichtposition ─────────────────────── */
  {
    const alle = datensatz.photos.every(f => typeof f.lichtposition === "string"
      && f.lichtposition !== LICHTPOSITION.UNBEKANNT);
    ok("Q7", "Jedes gespeicherte Originalbild trägt seine Lichtposition",
      alle, datensatz.photos.map(f => `${f.id}:${f.lichtposition}`).join(" · "));
  }

  /* ── Q8 · Wiederholbarkeit ──────────────────────────────────────────── */
  {
    const w = seq.wiederholbarkeit(vollSequenz, fotos);
    /* Und die Gegenprobe: ohne Aufnahmeprofil ist sie NICHT wiederholbar. */
    const ohneProfil = seq.wiederholbarkeit(vollSequenz,
      fotos.map(f => ({ ...f, captureProfile: null })));
    ok("Q8", "Der Datensatz trägt alles für eine Wiederholung — und meldet es, wenn nicht",
      w.wiederholbar && !ohneProfil.wiederholbar
      && ohneProfil.fehlend.some(f => f.startsWith("AUFNAHMEPROFIL")),
      `wiederholbar ${w.wiederholbar} · ohne Profil fehlt: ${ohneProfil.fehlend.join(", ")}`);
  }

  /* ── Q9 · Speichern und neu laden ────────────────────────────────────── */
  {
    const akteur = { username: "operator1", role: "Operator", displayName: "Operator 1" };
    let fehler = "";
    try { await saveInspection(datensatz, akteur); }
    catch (caught) { fehler = String(caught?.message || caught); }
    const geladen = (await loadInspections()).find(r => r.id === datensatz.id) || null;
    /* `undefined === undefined` waere hier gruen gewesen, ohne dass
       irgendetwas gespeichert wurde. Deshalb wird zuerst verlangt, DASS
       drei Aufnahmen zurueckkommen, und erst dann, dass sie gleich sind. */
    const zurueck = geladen?.feuchteSequenz;
    const vorhanden = Boolean(zurueck) && (zurueck.captures || []).length === 3
      && zurueck.vollstaendig === true;
    const gleich = vorhanden
      && JSON.stringify(zurueck) === JSON.stringify(datensatz.feuchteSequenz);
    /* Und die Originalbilder tragen ihre Lichtposition auch nach dem
       Neuladen — nicht nur im frisch gebauten Objekt. */
    const fotosMitLicht = (geladen?.photos || []).length === 3
      && geladen.photos.every(f => typeof f.lichtposition === "string"
        && f.lichtposition !== "UNBEKANNT" && typeof f.image === "string");
    ok("Q9", "Sequenz und Lichtpositionen überleben Speichern und Neuladen",
      !fehler && gleich && fotosMitLicht,
      fehler ? `SPEICHERN FEHLGESCHLAGEN: ${fehler}`
        : `drei Aufnahmen zurückgelesen ${vorhanden} · bitgleich ${gleich}`
          + ` · Lichtpositionen am Foto ${fotosMitLicht}`);
  }

  /* ── Q10 · Das Protokoll nennt die Sequenz ───────────────────────────── */
  {
    let text = ""; let fehler = "";
    try {
      const doc = exportInspectionPdf(datensatz, "de");
      const roh = doc?.output ? doc.output("datauristring") : "";
      text = entpacke(Buffer.from(roh.split(",")[1] || "", "base64"));
    } catch (caught) { fehler = String(caught?.message || caught); }
    const nenntPositionen = /Streiflicht links/i.test(text) && /Streiflicht rechts/i.test(text);
    const nenntAnleitung = /Anleitung/i.test(text);
    ok("Q10", "Das Protokoll nennt Lichtpositionen und Anleitungsfassung",
      !fehler && nenntPositionen && nenntAnleitung,
      fehler ? `PDF-ABSTURZ: ${fehler}`
        : `Positionen ${nenntPositionen} · Anleitungsfassung ${nenntAnleitung}`);
  }

  /* ── Q11 · Die Bedienführung nennt den aktuellen Schritt ─────────────── */
  {
    let markup = ""; let fehler = "";
    try {
      const el = await zeige(React.createElement(MultiCapture, {
        photos: [], setPhotos: () => {}, title: "Aufnahme", subtitle: "",
        onBack: () => {}, onAnalyze: () => {}, t,
        sequenz: seq.leereSequenz(ZONE), zoneId: ZONE,
      }));
      markup = el.textContent || "";
    } catch (caught) { fehler = String(caught?.message || caught); }
    const nenntSchritt = /Schritt 1 von 3/.test(markup);
    const nenntPosition = /normale[rn]? Beleuchtung/i.test(markup);
    ok("Q11", "Der geführte Bildschirm nennt Schrittzahl und Lichtposition",
      !fehler && nenntSchritt && nenntPosition,
      fehler ? `ABSTURZ: ${fehler}`
        : `Schrittzahl ${nenntSchritt} · Lichtposition ${nenntPosition}`);
  }

  /* ── Q12 · Keine Analyse, solange eine Position fehlt ────────────────── */
  {
    let halb = seq.leereSequenz(ZONE);
    halb = seq.schrittHinzufuegen(halb, {
      lichtposition: LICHTPOSITION.NORMAL, photoId: "photo-1", zoneId: ZONE }).sequenz;
    const el = await zeige(React.createElement(MultiCapture, {
      photos: [fotos[0]], setPhotos: () => {}, title: "Aufnahme", subtitle: "",
      onBack: () => {}, onAnalyze: () => {}, t,
      sequenz: halb, zoneId: ZONE,
    }));
    /* Der Zustand wird SOFORT gelesen, nicht spaeter. React verwendet
       denselben DOM-Knoten wieder; ein nach dem zweiten Render gelesenes
       `disabled` gehoert zum zweiten Render. Genau daran ist diese
       Gegenprobe beim ersten Anlauf falsch rot geworden. */
    const analyseKnopf = knoten => [...knoten.querySelectorAll("button")]
      .find(b => /Analyse|analysieren/i.test(b.textContent || ""));
    const halbKnopf = analyseKnopf(el);
    const halbGesperrt = Boolean(halbKnopf) && halbKnopf.disabled === true;

    const el2 = await zeige(React.createElement(MultiCapture, {
      photos: fotos, setPhotos: () => {}, title: "Aufnahme", subtitle: "",
      onBack: () => {}, onAnalyze: () => {}, t,
      sequenz: vollSequenz, zoneId: ZONE,
    }));
    const vollKnopf = analyseKnopf(el2);
    const vollFrei = Boolean(vollKnopf) && vollKnopf.disabled === false;

    ok("Q12", "Die Analyse ist gesperrt, solange eine Lichtposition fehlt",
      halbGesperrt && vollFrei,
      `unvollständig gesperrt ${halbGesperrt} · vollständig frei ${vollFrei}`);
  }

  /* ── Q13 · P3 öffnet das Tor nicht allgemein ─────────────────────────── */
  {
    /* Eine Sequenz aus DREI Aufnahmen verschiedener Zonen darf nicht
       zaehlen. Sonst waere P3 ein Schluessel, der jedes Schloss oeffnet. */
    const gemischt = {
      zoneId: ZONE, anleitungVersion: 1,
      captures: [
        { lichtposition: LICHTPOSITION.NORMAL, photoId: "a", zoneId: ZONE, reihenfolge: 1 },
        { lichtposition: LICHTPOSITION.STREIFLICHT_LINKS, photoId: "b", zoneId: "andere", reihenfolge: 2 },
        { lichtposition: LICHTPOSITION.STREIFLICHT_RECHTS, photoId: "c", zoneId: "noch_andere", reihenfolge: 3 },
      ],
      ersetzt: [],
    };
    const punkt = buildCheckpoints(MERKMALE, URTEIL, { feuchteSequenz: gemischt })
      .find(p => p.id === "moisture");
    ok("Q13", "Eine aus mehreren Zonen zusammengesetzte Sequenz zählt nicht",
      punkt.code === "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE",
      `Code: ${punkt.code}`);
  }

  /* ── Q14 · Kein PDF im Projektverzeichnis ────────────────────────────── */
  {
    const { existsSync } = await import("node:fs");
    const keineDatei = !existsSync(new URL("./VisuClean_insp-p3.pdf", import.meta.url));
    ok("Q14", "Der Test schreibt keine PDF-Datei ins Projektverzeichnis",
      gespeicherteDateien.length > 0 && keineDatei,
      gespeicherteDateien.length
        ? `${gespeicherteDateien.length}x save() abgefangen`
        : "save() wurde gar nicht aufgerufen — der Abfang belegt nichts");
  }

} finally {
  await vite.close();
}

console.log("");
const durch = checks.filter(c => !c.passed);
console.log(`Bestanden: ${checks.length - durch.length} / ${checks.length}`);
if (durch.length) console.log(`Durchgefallen: ${durch.map(c => c.id).join(", ")}`);
console.log(`ERGEBNIS: ${durch.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
console.log("");
console.log("GRENZE: geprueft sind Ablauf, Speicherung und Wiederholbarkeit.");
console.log("Ob die Feuchtebeurteilung mit vollstaendiger Sequenz RICHTIG ist,");
console.log("prueft diese Suite NICHT — das kann nur eine Messkampagne (P6).");
process.exit(durch.length ? 1 : 0);
