/* VisuClean · Schadensmeldung, Kandidatenerhalt und Markerbewertung
   ═══════════════════════════════════════════════════════════════════════
   Auftrag nach dem Geraetelauf mit rc.4.43 und dem forensischen Nachlauf.

   Drei Befunde stehen dahinter, alle am echten Datensatz belegt:

   D1  Die Markerbewertung fragt den Kratzerbefund nicht ab. Ein Marker
       genau auf einer erkannten Riefe meldet UNREMARKABLE. Am Geraet:
       drei von vier Markern auf echten Riefen "unauffaellig".

   D2  Eine kompakte Ausbruchstelle entsteht als Kandidat, zerfaellt aber
       in Bruchstuecke und landet damit unter dem Schnitt. Im Nachlauf
       Rang 22 von 493 — gespeichert werden zehn. Unterhalb des Schnitts
       haelt der Datensatz nichts fest, die Stelle ist spaeter nicht mehr
       untersuchbar.

   D3  Der Pruefer kann eine Stelle nicht als Schadensverdacht melden.
       `manualFindings` steht im Vertrag und wird in App.jsx fest als
       leeres Feld uebergeben. Ohne Detektortreffer gibt es keinen Weg,
       eine gesehene Stelle in den Datensatz zu bringen.

   Geprueft wird jeweils der Vertrag UND der tatsaechliche Weg.        */
/* Vor allem anderen: der Speicherweg braucht IndexedDB. Als dynamischer
   Import NACH dem jsdom-Block kam er zu spaet — die Umgebung stand dann
   schon. */
import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";

const checks = [];
const ok = (id, name, bestanden, info = "") => {
  checks.push({ id, name, bestanden });
  console.log(`${bestanden ? "BESTANDEN   " : "DURCHGEFALLEN"} ${id.padEnd(5)} ${name}`);
  if (info) console.log(`                    ${info}`);
};

console.log("VisuClean · Schadensmeldung und Kandidatenerhalt");
console.log("==============================================================================");
console.log("");

const { assessMarker } = await import("./src/domain.js");
const {
  MANUAL_FINDING, validateManualFinding, triggersQa, collectQaTriggers,
  offeneSchadensverdachte,
} = await import("./src/decision.js");

/* ═══ M · Markerbewertung mit Kratzerhinweisen ══════════════════════════ */

const leereMasken = n => ({
  maskBright: new Uint8Array(n), maskWarm: new Uint8Array(n),
  maskDark: new Uint8Array(n), maskAnom: new Uint8Array(n),
});

/* M1 · Kernbefund: ein Marker auf einer vom KERN erkannten Riefe.
   Alle vier Masken leer — so sieht eine saubere, trockene, nicht
   korrodierte Flaeche mit einer Riefe darauf aus. Genau der Fall vom
   Geraet. */
{
  const w = 200, h = 200;
  const overlay = { w, h, ...leereMasken(w * h),
    scratches: [{ minX: 90, maxX: 110, minY: 95, maxY: 105, count: 200 }] };
  const urteil = assessMarker({ _ov: overlay }, { x: 0.5, y: 0.5 });
  ok("M1", "Ein Marker auf einer erkannten Riefe ist nicht 'unauffaellig'",
    urteil.code === "SCRATCH_FINDING",
    `Code ${urteil.code} · Index ${urteil.severity}`);
}

/* M2 · Der GEGENFALL. Eine Regel, die jeden Marker zum Befund macht,
   waere schlimmer als die Luecke: dann traegt das Wort nichts mehr. */
{
  const w = 200, h = 200;
  const overlay = { w, h, ...leereMasken(w * h),
    scratches: [{ minX: 10, maxX: 30, minY: 10, maxY: 20, count: 200 }] };
  const urteil = assessMarker({ _ov: overlay }, { x: 0.5, y: 0.5 });
  ok("M2", "Ein Marker fern jeder Riefe bleibt unauffaellig",
    urteil.code === "UNREMARKABLE",
    `Code ${urteil.code}`);
}

/* M3 · Die vier Masken behalten Vorrang. Ein dunkler Fleck ist ein
   eigener Befund und darf nicht plötzlich als Kratzer erscheinen. */
{
  const w = 200, h = 200, n = w * h;
  const overlay = { w, h, ...leereMasken(n),
    scratches: [{ minX: 90, maxX: 110, minY: 95, maxY: 105, count: 200 }] };
  overlay.maskDark.fill(1);
  const urteil = assessMarker({ _ov: overlay }, { x: 0.5, y: 0.5 });
  ok("M3", "Die bestehenden Maskenbefunde behalten Vorrang",
    urteil.code === "DARK_FINDING",
    `Code ${urteil.code}`);
}

/* M4 · Der eigentliche Geraetefall: der KERN fand nur EINE Riefe, das
   Screening 493 Kandidaten. Ein Marker auf einem Screening-Kandidaten
   muss ihn sehen — sonst bleibt die Luecke fuer genau die Stellen offen,
   um die es geht.

   Wichtig und eigens geprueft: Screening und Kern rechnen in
   VERSCHIEDENEN Aufloesungen. Der Kandidat liegt hier in 711x720, das
   Overlay in 632x640. Wer die falsche Bezugsgroesse nimmt, zeigt auf eine
   andere Stelle — derselbe Fehler, den rc.4.40 bis rc.4.42 dreimal
   hatte. */
{
  const overlay = { w: 632, h: 640, ...leereMasken(632 * 640), scratches: [] };
  const screening = { bildBreite: 711, bildHoehe: 720, candidates: [
    { boundingBox: { minX: 497, minY: 398, maxX: 500, maxY: 416 }, pixelCount: 27 },
  ] };
  /* Mitte des Kandidaten in Anteilen des Zuschnitts: */
  const x = (497 + 500) / 2 / 711, y = (398 + 416) / 2 / 720;
  const treffer = assessMarker(
    { _ov: overlay, _screeningHochaufloesend: screening }, { x, y });
  /* Dieselben Anteile, aber faelschlich auf die Overlay-Groesse bezogen
     — das darf NICHT treffen, sonst beweist M4 nur, dass irgendetwas
     irgendwo liegt. */
  const daneben = assessMarker(
    { _ov: overlay, _screeningHochaufloesend: screening }, { x: 0.15, y: 0.85 });
  ok("M4", "Ein Marker auf einem Screening-Kandidaten wird gesehen",
    treffer.code === "SCRATCH_FINDING" && daneben.code === "UNREMARKABLE",
    `auf dem Kandidaten ${treffer.code} · abseits ${daneben.code}`);
}

/* ═══ S · Schadensverdacht als eigene Feststellung ═══════════════════════ */

const basis = {
  kind: "MANUAL_DAMAGE_SUSPECTED",
  username: "operator1", role: "Operator",
  at: "2026-09-17T14:00:00.000Z",
  reason: "Kompakte Ausbruchstelle sichtbar, vom Detektor nicht gemeldet",
  photoId: "photo-1", markerId: "marker-1",
};

/* S1 · Die Art muss es ueberhaupt geben. */
{
  ok("S1", "Es gibt eine Feststellungsart 'Schadensverdacht'",
    MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED === "MANUAL_DAMAGE_SUSPECTED",
    `MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED = ${MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED}`);
}

/* S2 · Sie braucht KEINEN Referenzbezug. Sie behauptet keine Veraenderung,
   sondern nur: hier ist etwas, das angesehen werden muss. */
{
  const pruefung = validateManualFinding(basis);
  ok("S2", "Ein Schadensverdacht braucht keinen Referenzbezug",
    pruefung.valid === true,
    pruefung.valid ? "gueltig ohne referenceId" : `abgewiesen: ${pruefung.error}`);
}

/* S3 · Aber die Begruendung bleibt Pflicht. Ein Verdacht ohne Angabe,
   was gesehen wurde, ist keine Feststellung. */
{
  const ohne = validateManualFinding({ ...basis, reason: "   " });
  ok("S3", "Ohne Begruendung ist der Verdacht keine Feststellung",
    ohne.valid === false && /reason/.test(ohne.error || ""),
    `abgewiesen: ${ohne.error}`);
}

/* S4 · Keine erfundene Tiefe. Der Verdacht ist ausdruecklich der Weg OHNE
   Messung — er darf deshalb erst recht keine Zahl tragen. */
{
  /* Das Vertragsfeld … */
  const vertrag = validateManualFinding({ ...basis, depthValue: 2.4 });
  /* … und ein frei erfundenes. Der erste Entwurf dieser Gegenprobe pruefte
     nur `depthUm` — ein Name, den der Vertrag gar nicht kennt. Sie war
     gruen, weil die Feststellungsart damals unbekannt war, und haette die
     Luecke nie beruehrt. */
  const erfunden = validateManualFinding({ ...basis, depthUm: 2.4 });
  ok("S4", "Ein Schadensverdacht traegt ueberhaupt keine Tiefenangabe",
    vertrag.valid === false && erfunden.valid === false,
    `depthValue: ${vertrag.error} · depthUm: ${erfunden.error}`);
}

/* S5 · Er setzt den QA-Trigger. Eine gesehene Stelle ohne Detektortreffer
   ist genau der Fall, den die QA sehen muss. */
{
  const gruende = collectQaTriggers({ manualFindings: [basis] });
  ok("S5", "Ein Schadensverdacht setzt den QA-Trigger",
    triggersQa(basis) === true
    && gruende.some(g => g.code === "MANUAL_DAMAGE_SUSPECTED"),
    `${gruende.length} Grund/Gruende: ${gruende.map(g => g.code).join(", ")}`);
}

/* S6 · Er bleibt OFFEN, bis er dokumentiert beurteilt ist. */
{
  const offen = offeneSchadensverdachte([basis]);
  const beurteilt = offeneSchadensverdachte([{ ...basis, klaerung: {
    at: "2026-09-17T15:00:00.000Z", username: "qa_manager", role: "QA Manager",
    ergebnis: "SCHADEN_BESTAETIGT",
    begruendung: "Ausbruchstelle bestaetigt, Teil geht in die Nacharbeit",
  } }]);
  ok("S6", "Ein Schadensverdacht bleibt offen, bis er beurteilt ist",
    offen.length === 1 && beurteilt.length === 0,
    `ohne Klaerung ${offen.length} offen · mit Klaerung ${beurteilt.length} offen`);
}

/* S7 · Eine Klaerung ohne Inhalt klaert nichts. Sonst waere das Feld eine
   Schaltflaeche, die den Punkt wegmacht. */
{
  const leer = offeneSchadensverdachte([{ ...basis, klaerung: {} }]);
  const ohneBegruendung = offeneSchadensverdachte([{ ...basis, klaerung: {
    at: "2026-09-17T15:00:00.000Z", username: "qa_manager", role: "QA Manager",
    ergebnis: "SCHADEN_BESTAETIGT", begruendung: "  ",
  } }]);
  ok("S7", "Eine leere Klaerung schliesst den Verdacht nicht",
    leer.length === 1 && ohneBegruendung.length === 1,
    `leeres Objekt ${leer.length} offen · ohne Begruendung ${ohneBegruendung.length} offen`);
}

/* ═══ L · Die Sperre: offen heisst nicht abschliessbar ═══════════════════ */

const { evaluateTransition, LIFECYCLE_STATE } = await import("./src/lifecycle.js");

const gruen = [
  { id: "moisture", required: true, status: "PASS" },
  { id: "residue", required: true, status: "PASS" },
  { id: "scratch", required: true, status: "PASS" },
  { id: "corrosion", required: true, status: "PASS" },
  { id: "surface", required: true, status: "PASS" },
];
const geklaert = { ...basis, klaerung: {
  at: "2026-09-17T15:00:00.000Z", username: "qa_manager", role: "QA Manager",
  ergebnis: "KEIN_SCHADEN",
  begruendung: "Unter Streiflicht nachgesehen: Schliffspur, kein Ausbruch",
} };
/* Aus PENDING_QA ist PASS_AFTER_REMEDIATION der PASS-Weg; FINAL_PASS ist
   von dort ausdruecklich NICHT vorgesehen (T-G1). Der erste Entwurf dieser
   Gegenproben zielte auf FINAL_PASS und war deshalb rot, weil der
   Uebergang gar nicht existiert — nicht wegen des Verdachts. */
const uebergang = (manualFindings, to = LIFECYCLE_STATE.PASS_AFTER_REMEDIATION) => evaluateTransition({
  from: LIFECYCLE_STATE.PENDING_QA, to,
  actor: { username: "qa_manager", role: "QA Manager" },
  performedBy: { username: "operator1", role: "Operator", at: "2026-09-17T14:00:00.000Z" },
  approvedBy: { username: "qa_manager", role: "QA Manager", at: "2026-09-17T15:00:00.000Z" },
  reauthenticated: true, checkpoints: gruen, hasDeviation: true,
  comment: "Alle Pruefpunkte gruen, Verdacht dokumentiert",
  approvalRevisionHash: "abc", currentRevisionHash: "abc",
  manualFindings,
});

/* L1 · Alle Pruefpunkte gruen — und trotzdem kein Abschluss, solange der
   Verdacht offen ist. Genau das verlangt "bleibt offen, bis dokumentiert
   beurteilt". */
{
  const offen = uebergang([basis]);
  ok("L1", "Ein offener Schadensverdacht verhindert den Abschluss",
    offen.allowed === false && offen.code === "OPEN_MANUAL_FINDING",
    `${offen.allowed ? "ERLAUBT" : "abgewiesen"} · ${offen.code}`);
}

/* L2 · Nach dokumentierter Beurteilung ist der Weg wieder frei. Eine
   Sperre, die sich nicht oeffnen laesst, ist eine Sackgasse. */
{
  const frei = uebergang([geklaert]);
  ok("L2", "Nach dokumentierter Beurteilung ist der Abschluss wieder moeglich",
    frei.allowed === true,
    `${frei.allowed ? "erlaubt" : "abgewiesen"} · ${frei.code}`);
}

/* L3 · Die Sperrung bleibt IMMER erreichbar. Ein offener Verdacht darf
   den Vorgang nicht einmauern — sonst waere die Sperre schaedlicher als
   der Fehler. */
{
  const sperren = uebergang([basis], LIFECYCLE_STATE.FINAL_FAIL);
  ok("L3", "Die Sperrung bleibt trotz offenem Verdacht erreichbar",
    sperren.allowed === true,
    `${sperren.allowed ? "erlaubt" : "abgewiesen"} · ${sperren.code}`);
}

/* L4 · Auch der Override nicht. Ein Verdacht ist kein Befund, den ein QA
   Manager ueberstimmen koennte — er ist eine offene Frage. */
{
  const ueber = evaluateTransition({
    from: LIFECYCLE_STATE.PENDING_QA, to: LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
    actor: { username: "qa_manager", role: "QA Manager" },
    performedBy: { username: "operator1", role: "Operator", at: "2026-09-17T14:00:00.000Z" },
    approvedBy: { username: "qa_manager", role: "QA Manager", at: "2026-09-17T15:00:00.000Z" },
    reauthenticated: true, checkpoints: gruen, hasDeviation: true,
    comment: "Freigabe mit Abweichung", overrideReason: "Begruendung fuer den Override",
    approvalRevisionHash: "abc", currentRevisionHash: "abc",
    manualFindings: [basis],
  });
  ok("L4", "Auch der Override ueberspringt den offenen Verdacht nicht",
    ueber.allowed === false && ueber.code === "OPEN_MANUAL_FINDING",
    `${ueber.allowed ? "ERLAUBT" : "abgewiesen"} · ${ueber.code}`);
}

/* ═══ P · Die Speichergrenze glaubt der Oberflaeche nicht ════════════════ */

/* P1 · saveInspection ist die Sicherheitsgrenze, nicht die Oberflaeche.
   Ein Datensatz mit FINAL_PASS und offenem Verdacht darf auch bei
   direktem Aufruf nicht entstehen. */
{
  const { pruefeSchadensverdachte } = await import("./src/persistence.js");
  const mitOffenem = pruefeSchadensverdachte({
    state: "FINAL_PASS", finalDecision: "PASS", manualFindings: [basis] });
  const mitGeklaertem = pruefeSchadensverdachte({
    state: "FINAL_PASS", finalDecision: "PASS", manualFindings: [geklaert] });
  const gesperrt = pruefeSchadensverdachte({
    state: "FINAL_FAIL", finalDecision: "FAIL", manualFindings: [basis] });
  ok("P1", "Die Speichergrenze weist einen Abschluss mit offenem Verdacht ab",
    mitOffenem.valid === false && mitGeklaertem.valid === true && gesperrt.valid === true,
    `offen: ${mitOffenem.error} · geklaert: ${mitGeklaertem.valid}`
    + ` · gesperrt: ${gesperrt.valid}`);
}

/* ═══ K · Kandidatenerhalt, an den echten 493 des Geraetelaufs ══════════ */

const { buildInspectionRecord } = await import("./src/inspectionRecord.js");
const { waehleProtokollKandidaten } = await import("./src/scratchScreening.js");
const { canonicalize, sha256Hex } = await import("./src/audit.js");

const geraetelauf = JSON.parse(await readFile(
  new URL("./tests/kandidaten-geraetelauf.json", import.meta.url), "utf8"));
const echteKandidaten = geraetelauf.candidates.map((k, i) => ({ ...k, rank: i + 1 }));

const satzMit = (spitze = 10) => buildInspectionRecord({
  id: "insp-kandidaten", appVersion: "8.3.0-test", now: "2026-09-17T16:00:00.000Z",
  user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
  eqId: "tp", eqName: "T", zoneId: "die", zoneName: "D",
  photos: [], aggregate: null, originalSystemDecision: null, finalDecision: "FAIL",
  /* Ohne diese beiden faellt `canonicalize` ueber undefined — zu Recht:
     ein Datensatz ohne Pruefer und ohne Signatur ist keiner. Der erste
     Entwurf von K5 liess sie weg und scheiterte am Kanonisierer statt an
     der Sache. */
  performedBy: { username: "operator1", role: "Operator", at: "2026-09-17T16:00:00.000Z" },
  signature: { method: "USER_ID_PASSWORD", components: ["USER_ID", "PASSWORD"],
    meaning: "Sperrung", signedAt: "2026-09-17T16:00:00.000Z", signedBy: "operator1" },
  screening: {
    configHash: geraetelauf.konfig ? "hash" : null, configQuelle: "DATEI",
    photos: [{
      photoId: "photo-1", candidateCount: echteKandidaten.length,
      suppressedCount: 0, grindDirectionDeg: geraetelauf.grindDirectionDeg,
      grindStrength: 0.05, orientationBins: 36,
      bildBreite: geraetelauf.bild.w, bildHoehe: geraetelauf.bild.h,
      candidates: waehleProtokollKandidaten(echteKandidaten, spitze),
      alleKandidaten: echteKandidaten,
    }],
  },
});

/* K1 · Die vollstaendige Liste ueberlebt den Datensatzbau. */
{
  const satz = satzMit();
  const foto = satz.screening.photos[0];
  ok("K1", "Alle erzeugten Kandidaten stehen im Datensatz",
    foto.alleKandidaten.length === echteKandidaten.length
    && foto.candidates.length <= 20,
    `${foto.alleKandidaten.length} vollstaendig · ${foto.candidates.length} in der Vorauswahl`
    + ` · gemeldet ${foto.candidateCount}`);
}

/* K2 · Die gelbe Stelle. DER Fall, um den es geht: sie steht nicht in der
   Vorauswahl — und muss trotzdem auffindbar sein.

   Die Raenge stammen aus dem NACHLAUF, nicht aus dem Originallauf; bei
   493 gegen 481 Kandidaten ist die Rangfolge nicht dieselbe. Fuer diese
   Gegenprobe genuegt das: geprueft wird, dass ein Kandidat unterhalb des
   Schnitts erhalten bleibt, nicht welchen Platz er genau hatte. */
{
  const satz = satzMit();
  const foto = satz.screening.photos[0];
  const imFenster = box => box && box.minX <= 550 && box.maxX >= 470
    && box.minY <= 445 && box.maxY >= 365;
  const inVorauswahl = foto.candidates.filter(k => imFenster(k.boundingBox));
  const inVollstaendig = foto.alleKandidaten.filter(k => imFenster(k.boundingBox));
  ok("K2", "Die kompakte Ausbruchstelle bleibt unterhalb des Schnitts erhalten",
    inVorauswahl.length === 0 && inVollstaendig.length === 7,
    `Vorauswahl ${inVorauswahl.length} · vollstaendig ${inVollstaendig.length}`
    + ` · beste Raenge ${inVollstaendig.slice(0, 3).map(k => k.rank).join(", ")}`);
}

/* K3 · Die Vorauswahl bleibt, was sie war. Ein PDF, das ploetzlich 493
   Zeilen traegt, waere keine Verbesserung. */
{
  const satz = satzMit();
  const foto = satz.screening.photos[0];
  const spitze = waehleProtokollKandidaten(echteKandidaten, 10);
  ok("K3", "Die Vorauswahl ist unveraendert die bisherige",
    foto.candidates.length === spitze.length
    && foto.candidates.every((k, i) => k.rank === spitze[i].rank),
    `${foto.candidates.length} Kandidaten, Raenge ${foto.candidates.map(k => k.rank).join(", ")}`);
}

/* K4 · Rohwerte, nicht gerundet. Gerundet zu speichern hiesse, die
   Nachrechenbarkeit gegen Platz einzutauschen. */
{
  const satz = satzMit();
  const voll = satz.screening.photos[0].alleKandidaten;
  const gleich = voll.every((k, i) =>
    k.relevanceScore === echteKandidaten[i].relevanceScore
    && k.relevanceScoreUngerichtet === echteKandidaten[i].relevanceScoreUngerichtet
    && k.lengthRel === echteKandidaten[i].lengthRel);
  ok("K4", "Die gespeicherten Kandidaten tragen die Rohwerte",
    gleich,
    gleich ? "alle Bewertungen bitgleich zur Rechnung"
      : "mindestens ein Wert weicht ab");
}

/* K5 · Speicherbedarf und Laufzeit, gemessen statt behauptet. Der Auftrag
   verlangt beides ausdruecklich. Die Schranken sind Stellwerte — sie
   sollen eine Entgleisung melden, nicht eine Grenze behaupten. */
{
  const satz = satzMit();
  const t0 = process.hrtime.bigint();
  const kanon = canonicalize(satz);
  await sha256Hex(kanon);
  const t2 = process.hrtime.bigint();
  const kib = kanon.length / 1024;
  const ms = Number(t2 - t0) / 1e6;
  ok("K5", "Speicherbedarf und Laufzeit bleiben im gemessenen Rahmen",
    kib < 400 && ms < 500,
    `${kib.toFixed(0)} KiB kanonisch · ${ms.toFixed(1)} ms kanonisieren und hashen`
    + ` · ${(kanon.length / echteKandidaten.length).toFixed(0)} Byte je Kandidat`
    + "   (Stellwerte: < 400 KiB, < 500 ms — keine validierten Grenzen)");
}

/* ═══ U · Der tatsaechliche Bedienweg ═══════════════════════════════════
   Vertrag und Speichergrenze sind oben geprueft. Hier wird gefahren, was
   ein Pruefer wirklich tut — mit den echten Bildschirmen. Ein Vertrag ohne
   Bedienweg war genau der Befund D3: `manualFindings` stand da und wurde
   nie gefuellt.                                                         */
{
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id=\"wurzel\"></div></body></html>",
    { url: "https://visuclean.test/", pretendToBeVisual: true });
  for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement",
    "HTMLImageElement", "Node", "MutationObserver", "getComputedStyle", "Image",
    "Blob", "Event", "CSSStyleSheet"]) {
    Object.defineProperty(globalThis, name,
      { value: dom.window[name], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, "navigator",
    { value: dom.window.navigator, configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  /* EIN Root fuer alle Renders — die Warnung aus schmutztest wird hier
     nicht wiederholt. */
  const behaelter = dom.window.document.getElementById("wurzel");
  const wurzel = createRoot(behaelter);
  const setzeText = (element, wert) => {
    const proto = element.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, wert);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  const knopfMit = text => [...behaelter.querySelectorAll("button")]
    .find(b => (b.textContent || "").trim().startsWith(text));

  try {
    const { UebersehenePanel, VerdachtKlaerungPanel, ScreeningPanel }
      = await vite.ssrLoadModule("/src/App.jsx");
    const { translator } = await vite.ssrLoadModule("/src/i18n.js");
    const t = translator("de");
    const benutzer = { username: "operator1", role: "Operator", displayName: "Operator 1" };
    const foto = {
      id: "photo-1",
      markers: [{ id: "marker-1", x: 0.5, y: 0.5 }],
      result: { inspectionArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
    };

    /* U1 · Melden. Ohne Detektortreffer, ohne Messung. */
    let gemeldet = null;
    await act(async () => {
      wurzel.render(React.createElement(UebersehenePanel, {
        fotos: [foto], messungen: [], onMessung: () => {},
        verdachte: [], onVerdacht: eintrag => { gemeldet = eintrag; },
        benutzer, t,
      }));
    });
    const melden = knopfMit(t("verdachtMelden"));
    if (melden) await act(async () => {
      melden.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    });
    const feld = behaelter.querySelector("textarea");
    if (feld) await act(async () => setzeText(feld,
      "Kompakte Ausbruchstelle, vom Detektor nicht gemeldet"));
    const speichern = knopfMit(t("verdachtSpeichern"));
    if (speichern && !speichern.disabled) await act(async () => {
      speichern.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    });
    ok("U1", "Der Pruefer kann eine Stelle als Schadensverdacht melden",
      gemeldet?.markerId === "marker-1" && gemeldet.reason.length >= 10,
      gemeldet ? `${gemeldet.markerId} · "${gemeldet.reason}"`
        : `nichts gemeldet · Knopf ${melden ? "da" : "fehlt"}`
          + ` · Feld ${feld ? "da" : "fehlt"}`
          + ` · Speichern ${speichern ? (speichern.disabled ? "gesperrt" : "frei") : "fehlt"}`);

    /* U2 · Der gemeldete Verdacht ist danach sichtbar und als OFFEN
       gekennzeichnet. Ein Verdacht, den man nicht mehr sieht, ist keiner. */
    const verdacht = {
      kind: "MANUAL_DAMAGE_SUSPECTED", username: "operator1", role: "Operator",
      at: "2026-09-17T14:00:00.000Z", reason: gemeldet?.reason || "x".repeat(12),
      photoId: "photo-1", markerId: "marker-1", klaerung: null,
    };
    await act(async () => {
      wurzel.render(React.createElement(UebersehenePanel, {
        fotos: [foto], messungen: [], onMessung: () => {},
        verdachte: [verdacht], onVerdacht: () => {}, benutzer, t,
      }));
    });
    const textDanach = behaelter.textContent || "";
    ok("U2", "Der gemeldete Verdacht bleibt sichtbar und heisst 'offen'",
      textDanach.includes(t("verdachtOffen")) && textDanach.includes(verdacht.reason),
      `"${t("verdachtOffen")}" ${textDanach.includes(t("verdachtOffen")) ? "gefunden" : "FEHLT"}`
      + ` · Begruendung ${textDanach.includes(verdacht.reason) ? "gefunden" : "FEHLT"}`);

    /* U3 · Beurteilen. Der Verdacht wird beantwortet, nicht geloescht. */
    let beurteilt = null;
    await act(async () => {
      wurzel.render(React.createElement(VerdachtKlaerungPanel, {
        verdachte: [verdacht], onBeurteilen: wert => { beurteilt = wert; }, t,
      }));
    });
    const sperrhinweis = (behaelter.textContent || "").includes(t("verdachtSperre"));
    const grundfeld = behaelter.querySelector("textarea");
    if (grundfeld) await act(async () => setzeText(grundfeld,
      "Unter Streiflicht nachgesehen: Ausbruchstelle bestaetigt"));
    const festhalten = knopfMit(t("verdachtKlaerungSpeichern"));
    if (festhalten && !festhalten.disabled) await act(async () => {
      festhalten.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    });
    ok("U3", "Ein offener Verdacht laesst sich dokumentiert beurteilen",
      sperrhinweis && beurteilt?.ergebnis === "SCHADEN_BESTAETIGT"
      && beurteilt.begruendung.length >= 10,
      `Sperrhinweis ${sperrhinweis ? "sichtbar" : "FEHLT"}`
      + ` · ${beurteilt ? `${beurteilt.ergebnis}: "${beurteilt.begruendung}"` : "nichts beurteilt"}`);

    /* U4 · Nachladen. Die Vorauswahl bleibt die Voreinstellung — aber die
       gelbe Stelle ist erreichbar. Gefahren mit den ECHTEN 493. */
    const screeningFoto = {
      photoId: "photo-1", candidateCount: echteKandidaten.length, suppressedCount: 0,
      grindDirectionDeg: 162.5, grindStrength: 0.052, orientationBins: 36,
      bildBreite: geraetelauf.bild.w, bildHoehe: geraetelauf.bild.h,
      candidates: waehleProtokollKandidaten(echteKandidaten, 10),
      alleKandidaten: echteKandidaten,
    };
    await act(async () => {
      wurzel.render(React.createElement(ScreeningPanel, {
        screening: { configHash: "h", configQuelle: "DATEI", photos: [screeningFoto] },
        herkunft: "DATENSATZ", fotos: [], t,
      }));
    });
    const zeilenVorher = behaelter.querySelectorAll("table.screening-table tbody tr").length;
    const nachladen = knopfMit(t("kandidatenMehr"));
    if (nachladen) await act(async () => {
      nachladen.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    });
    const zeilenNachher = behaelter.querySelectorAll("table.screening-table tbody tr").length;
    ok("U4", "Weitere Kandidaten lassen sich nachladen",
      zeilenVorher <= 20 && zeilenNachher > zeilenVorher && Boolean(nachladen),
      `${zeilenVorher} Zeilen → ${zeilenNachher} nach einem Klick`
      + ` · Knopf ${nachladen ? `"${nachladen.textContent.trim()}"` : "FEHLT"}`);

    /* U5 · Und die gelbe Stelle steht dann wirklich in der Tabelle.
       Ohne diese Probe belegte U4 nur, dass IRGENDWAS nachgeladen wird. */
    const imFenster = k => k.boundingBox.minX <= 550 && k.boundingBox.maxX >= 470
      && k.boundingBox.minY <= 445 && k.boundingBox.maxY >= 365;
    const gesuchte = echteKandidaten.filter(imFenster)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
    const tabellentext = behaelter.querySelector("table.screening-table")?.textContent || "";
    ok("U5", "Die kompakte Ausbruchstelle steht nach dem Nachladen in der Tabelle",
      Boolean(gesuchte) && tabellentext.includes(String(gesuchte.kandidatId)),
      gesuchte ? `${gesuchte.kandidatId} (Rang ${gesuchte.rank}) `
        + `${tabellentext.includes(String(gesuchte.kandidatId)) ? "gefunden" : "FEHLT"}`
        : "kein Kandidat im Fenster");

    await act(async () => wurzel.unmount());
  } finally { await vite.close(); }
}

/* ═══ R · Rundlauf durch die ECHTE Persistenz ═══════════════════════════
   "Ueberlebt Speichern und Neuladen" ist eine Aussage ueber den
   Speicherweg, nicht ueber ein Objekt im Arbeitsspeicher. Gefahren wird
   deshalb saveInspection → loadInspections, verschluesselt wie im
   Betrieb.                                                              */
{
  const { recordDigest } = await import("./src/audit.js");
  const { saveInspection, loadInspections } = await import("./src/persistence.js");
  const { CHECKPOINTS, STATUS } = await import("./src/assessment.js");
  const { CAPTURE_PATH } = await import("./src/decision.js");
  const { LIFECYCLE_STATE } = await import("./src/lifecycle.js");

  const actor = { username: "qa_manager", displayName: "QA Manager", role: "QA Manager" };
  const signature = {
    method: "USER_ID_PASSWORD", components: ["userId", "password"], meaning: "Sperrung",
    signedAt: "2026-09-17T16:00:00.000Z", signedBy: actor.username,
  };
  const urteil = { code: "FAIL", pass: false, message: "FAIL", detail: "x", severity: 50, action: "" };
  const punkte = CHECKPOINTS.map(meta => ({
    id: meta.id, status: STATUS.PASS, code: "PASS", required: meta.required,
    label: { de: meta.de, en: meta.en }, message: { de: "Bestanden", en: "Pass" },
    reason: "Testfixture", actions: [], measurements: {},
  }));
  const verdachtImSatz = {
    kind: "MANUAL_DAMAGE_SUSPECTED", username: "operator1", role: "Operator",
    at: "2026-09-17T15:00:00.000Z",
    reason: "Kompakte Ausbruchstelle zwischen den Riefen, Detektor meldet nichts",
    photoId: "photo-1", markerId: "marker-1",
    klaerung: { at: "2026-09-17T15:30:00.000Z", username: "qa_manager",
      role: "QA Manager", ergebnis: "SCHADEN_BESTAETIGT",
      begruendung: "Unter Streiflicht bestaetigt, Teil geht in die Nacharbeit" },
  };
  const satz = {
    id: "inspection-verdacht", schema: 2, appVersion: "8.2.0",
    createdAt: signature.signedAt, signedAt: signature.signedAt, user: actor,
    eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
    photoCount: 1,
    photos: [{ id: "photo-1", image: "data:image/jpeg;base64,QQ==",
      annotatedImage: "data:image/jpeg;base64,QQ==",
      markers: [{ id: "marker-1", x: 0.5, y: 0.5 }], markerAssessments: [],
      result: { dry: urteil, clean: urteil, intact: urteil, lm: 0.6, hints: [],
        checkpoints: punkte },
      captureProfile: { processedWidth: 480, processedHeight: 640,
        sourceWidth: 480, sourceHeight: 640, path: CAPTURE_PATH.CAMERA },
      knownIssueInfo: null }],
    aggregate: { dry: urteil, clean: urteil, intact: urteil, lm: 0.6, hints: [] },
    originalSystemDecision: { status: "FAIL", reason: "CRITERIA_FAIL", failed: ["intact"] },
    finalDecision: "FAIL", comment: "Schadensverdacht dokumentiert beurteilt",
    overrideReason: null, referenceId: null, signature,
    schemaVersion: 3, state: LIFECYCLE_STATE.FINAL_FAIL,
    previousState: LIFECYCLE_STATE.DRAFT, checkpoints: punkte, reauthenticated: true,
    performedBy: { username: "operator1", role: "Operator", at: signature.signedAt },
    approvedBy: null, approvalRevisionHash: null, revisionHash: null,
    retakes: [], manualFindings: [verdachtImSatz], knownIssueAssignments: [],
    qaTriggers: [{ code: "MANUAL_DAMAGE_SUSPECTED", source: "MANUAL_FINDING",
      at: verdachtImSatz.at }],
    aiCrosscheck: { enabled: false, status: "AI_CROSSCHECK_DISABLED", unresolvedConflicts: 0 },
  };
  satz.recordHash = await recordDigest(satz);

  await saveInspection(satz, actor);
  const geladen = (await loadInspections()).find(r => r.id === "inspection-verdacht");
  const wieder = geladen?.manualFindings?.[0];
  ok("R1", "Ein Schadensverdacht ueberlebt Speichern und Neuladen",
    wieder?.kind === "MANUAL_DAMAGE_SUSPECTED"
    && wieder.reason === verdachtImSatz.reason
    && wieder.klaerung?.ergebnis === "SCHADEN_BESTAETIGT"
    && geladen.recordHash === satz.recordHash,
    wieder ? `${wieder.kind} · Grund erhalten · Klaerung ${wieder.klaerung?.ergebnis}`
      + ` · Hash ${geladen.recordHash === satz.recordHash ? "unveraendert" : "ABWEICHEND"}`
      : "keine manuelle Feststellung im geladenen Datensatz");

  /* R2 · Der Gegenfall am echten Speicherweg: derselbe Datensatz mit
     OFFENEM Verdacht und positivem Abschluss darf nicht hineingehen. */
  const offenerSatz = {
    ...structuredClone(satz), id: "inspection-verdacht-offen",
    state: LIFECYCLE_STATE.FINAL_PASS, previousState: LIFECYCLE_STATE.DRAFT,
    finalDecision: "PASS",
    originalSystemDecision: { status: "PASS", reason: "ALL_PASS", failed: [] },
    aggregate: { dry: { ...urteil, pass: true, code: "PASS" },
      clean: { ...urteil, pass: true, code: "PASS" },
      intact: { ...urteil, pass: true, code: "PASS" }, lm: 0.6, hints: [] },
    manualFindings: [{ ...structuredClone(verdachtImSatz), klaerung: null }],
    /* Die Signaturbedeutung muss zur Entscheidung passen — sonst weist die
       Speichergrenze den Datensatz aus einem ANDEREN Grund ab, und R2
       belegte nur, dass irgendeine Sperre gegriffen hat. */
    signature: { ...signature, meaning: "Freigabe" },
    comment: "",
  };
  offenerSatz.recordHash = await recordDigest(offenerSatz);
  let abgewiesen = null;
  try { await saveInspection(offenerSatz, actor); }
  catch (fehler) { abgewiesen = fehler.message; }
  ok("R2", "Ein offener Verdacht kommt auch ueber den Speicherweg nicht durch",
    Boolean(abgewiesen) && /Schadensverdacht/.test(abgewiesen),
    abgewiesen ? `abgewiesen: ${abgewiesen}` : "GESPEICHERT — die Sperre greift nicht");
}

/* ═══ W · Die drei Beurteilungsergebnisse sind nicht dasselbe ═══════════
   BEFUND der Gegenpruefung an rc.4.44, zutreffend: `offeneSchadensverdachte`
   zaehlte alle drei Ergebnisse gleichermassen als geschlossen, sobald die
   Felder ausgefuellt waren. Damit liess sich fuer einen BESTAETIGTEN
   Schaden ein PASS_AFTER_REMEDIATION speichern, ohne dass eine Behebung
   dokumentiert war — und "weitere Pruefung noetig" schloss den Punkt,
   obwohl es das Gegenteil sagt.

   Der Fehler war meiner: ich hatte WEITERE_PRUEFUNG_NOETIG ausdruecklich
   als schliessend beschrieben, mit der Begruendung, es sei "eine
   dokumentierte Entscheidung, nur keine abschliessende". Eine Entscheidung,
   die weitere Pruefung verlangt, ist kein Abschluss.                    */
{
  const { bestaetigteSchaeden } = await import("./src/decision.js");
  const mit = ergebnis => [{ ...basis, klaerung: {
    at: "2026-09-17T15:00:00.000Z", username: "qa_manager", role: "QA Manager",
    ergebnis, begruendung: "Dokumentierte Beurteilung mit ausreichender Laenge",
  } }];

  ok("W1", "'Weitere Pruefung noetig' laesst den Verdacht offen",
    offeneSchadensverdachte(mit("WEITERE_PRUEFUNG_NOETIG")).length === 1,
    `${offeneSchadensverdachte(mit("WEITERE_PRUEFUNG_NOETIG")).length} offen`);

  ok("W2", "'Kein Schaden' schliesst genau diesen Verdacht",
    offeneSchadensverdachte(mit("KEIN_SCHADEN")).length === 0
    && bestaetigteSchaeden(mit("KEIN_SCHADEN")).length === 0,
    `offen ${offeneSchadensverdachte(mit("KEIN_SCHADEN")).length}`
    + ` · bestaetigt ${bestaetigteSchaeden(mit("KEIN_SCHADEN")).length}`);

  ok("W3", "'Schaden bestaetigt' ist ein Befund, kein geschlossener Punkt",
    offeneSchadensverdachte(mit("SCHADEN_BESTAETIGT")).length === 0
    && bestaetigteSchaeden(mit("SCHADEN_BESTAETIGT")).length === 1,
    `offen ${offeneSchadensverdachte(mit("SCHADEN_BESTAETIGT")).length}`
    + ` · bestaetigt ${bestaetigteSchaeden(mit("SCHADEN_BESTAETIGT")).length}`);

  /* W4 · Und die Wirkung im Lebenszyklus: ein bestaetigter Schaden
     verhindert das PASS. Nicht "offen" — sondern ein Befund, den ein PASS
     nicht einfach uebergeht. */
  const bestaetigt = mit("SCHADEN_BESTAETIGT");
  const weitere = mit("WEITERE_PRUEFUNG_NOETIG");
  const keiner = mit("KEIN_SCHADEN");
  ok("W4", "Ein bestaetigter Schaden verhindert PASS_AFTER_REMEDIATION",
    uebergang(bestaetigt).allowed === false
    && uebergang(weitere).allowed === false
    && uebergang(keiner).allowed === true,
    `bestaetigt ${uebergang(bestaetigt).code}`
    + ` · weitere Pruefung ${uebergang(weitere).code}`
    + ` · kein Schaden ${uebergang(keiner).allowed ? "erlaubt" : "abgewiesen"}`);

  /* W5 · Die Sperrung bleibt in jedem der drei Faelle erreichbar. */
  const sperrbar = [bestaetigt, weitere, keiner]
    .every(f => uebergang(f, LIFECYCLE_STATE.FINAL_FAIL).allowed === true);
  ok("W5", "Die Sperrung bleibt in allen drei Faellen erreichbar", sperrbar,
    sperrbar ? "FINAL_FAIL aus jedem Beurteilungsergebnis" : "mindestens ein Weg ist verbaut");

  /* W6 · Und die Speichergrenze zieht dieselbe Grenze. Eine Oberflaeche,
     die etwas anderes erlaubt als der Speicher, ist eine Falle. */
  const { pruefeSchadensverdachte } = await import("./src/persistence.js");
  const satz = (findings, entscheidung) => pruefeSchadensverdachte({
    state: "PASS_AFTER_REMEDIATION", finalDecision: entscheidung,
    manualFindings: findings });
  ok("W6", "Die Speichergrenze unterscheidet ebenso",
    satz(bestaetigt, "PASS_AFTER_REMEDIATION").valid === false
    && satz(weitere, "PASS_AFTER_REMEDIATION").valid === false
    && satz(keiner, "PASS_AFTER_REMEDIATION").valid === true
    && satz(bestaetigt, "FAIL").valid === true,
    `bestaetigt ${satz(bestaetigt, "PASS_AFTER_REMEDIATION").valid}`
    + ` · weitere ${satz(weitere, "PASS_AFTER_REMEDIATION").valid}`
    + ` · kein Schaden ${satz(keiner, "PASS_AFTER_REMEDIATION").valid}`
    + ` · bestaetigt+FAIL ${satz(bestaetigt, "FAIL").valid}`);
}

/* ═══ F · Eine Quelle fuer den Status, nicht zwei ═══════════════════════
   BEFUND der Gegenpruefung an rc.4.44 und im Geraete-PDF sichtbar: der
   Pruefpunkt meldet NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE, und daneben steht
   gruen "T PASS" und "Trocken". Die Anzeige fuehrt den ROHBEFUND des Kerns
   und das MASSGEBLICHE Pruefpunkturteil als gleichwertige Ergebnisse.

   Das ist eine falsche Entwarnung, auch wenn eine andere Stelle die
   Freigabe sperrt: der Pruefer liest gruen.                            */
{
  const { kriteriumStatus, STATUS: ST } = await import("./src/assessment.js");

  const punkt = (id, status, code = "PASS") => ({ id, status, code, required: true });
  const nichtBewertbar = [
    punkt("moisture", ST.NOT_ASSESSABLE, "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE"),
    punkt("residue", ST.PASS), punkt("scratch", ST.PASS),
    punkt("corrosion", ST.PASS), punkt("surface", ST.PASS),
  ];

  /* F1 · Der massgebliche Status von "Trocken" ist nicht bewertbar —
     unabhaengig davon, was der Rohbefund sagt. */
  ok("F1", "Nicht bewertbarer Feuchtepunkt ergibt keinen Trocken-PASS",
    kriteriumStatus(nichtBewertbar, "dry") === ST.NOT_ASSESSABLE,
    `dry → ${kriteriumStatus(nichtBewertbar, "dry")}`);

  /* F2 · Der GEGENFALL: ein tatsaechlich bestandener Punkt bleibt
     bestanden. Eine Regel, die alles auf "nicht bewertbar" zieht, waere
     genauso falsch. */
  const alleGruen = nichtBewertbar.map(p =>
    p.id === "moisture" ? punkt("moisture", ST.PASS) : p);
  ok("F2", "Ein bestandener Feuchtepunkt bleibt bestanden",
    kriteriumStatus(alleGruen, "dry") === ST.PASS,
    `dry → ${kriteriumStatus(alleGruen, "dry")}`);

  /* F3 · "Intakt" fasst drei Pruefpunkte zusammen. Worst-Result-Wins:
     ein FAIL darunter darf nicht von zwei PASS ueberdeckt werden. */
  const einFail = [
    punkt("moisture", ST.PASS), punkt("residue", ST.PASS),
    punkt("scratch", ST.FAIL, "SCRATCH_DETECTED_ORIGIN_UNDETERMINED"),
    punkt("corrosion", ST.PASS), punkt("surface", ST.PASS),
  ];
  ok("F3", "Intakt folgt Worst-Result-Wins ueber seine drei Pruefpunkte",
    kriteriumStatus(einFail, "intact") === ST.FAIL
    && kriteriumStatus(einFail, "clean") === ST.PASS,
    `intact → ${kriteriumStatus(einFail, "intact")}`
    + ` · clean → ${kriteriumStatus(einFail, "clean")}`);

  /* F4 · Feuchte-FAIL bleibt FAIL. Ein nicht bewertbarer Punkt darf einen
     FAIL nicht entschaerfen — das waere die Umkehrung von Regel 3. */
  const feuchteFail = nichtBewertbar.map(p =>
    p.id === "moisture" ? punkt("moisture", ST.FAIL, "VISIBLE_MOISTURE") : p);
  ok("F4", "Ein Feuchte-FAIL bleibt FAIL",
    kriteriumStatus(feuchteFail, "dry") === ST.FAIL,
    `dry → ${kriteriumStatus(feuchteFail, "dry")}`);

  /* F5 · ALTBESTAND. Ein Datensatz ohne Pruefpunktliste behaelt seine
     historische Aussage. Sie still umzuschreiben waere schlimmer als die
     Widerspruechlichkeit. */
  ok("F5", "Ohne Pruefpunktliste wird nichts behauptet",
    kriteriumStatus([], "dry") === null
    && kriteriumStatus(null, "dry") === null,
    "leere und fehlende Liste ergeben null, nicht PASS");

  /* F6 · Ein echtes FAIL hat Vorrang vor "nicht bewertbar". Sonst koennte
     ein nicht bewertbarer Punkt einen Befund verdecken — die Umkehrung von
     Regel 3. Geprueft wird das ausdruecklich und nicht angenommen. */
  const failUndUnklar = [
    punkt("moisture", ST.PASS), punkt("residue", ST.PASS),
    punkt("scratch", ST.FAIL, "SCRATCH_DETECTED_ORIGIN_UNDETERMINED"),
    punkt("corrosion", ST.NOT_ASSESSABLE, "NOT_ASSESSABLE"),
    punkt("surface", ST.PASS),
  ];
  const { kriteriumKurz } = await import("./src/assessment.js");
  ok("F6", "Ein echtes FAIL hat Vorrang vor 'nicht bewertbar'",
    kriteriumStatus(failUndUnklar, "intact") === ST.FAIL
    && kriteriumKurz(failUndUnklar, "intact", true) === "FAIL",
    `intact → ${kriteriumStatus(failUndUnklar, "intact")}`
    + ` · Kurzstatus ${kriteriumKurz(failUndUnklar, "intact", true)}`);

  /* F7 · Die historische Darstellung gilt NUR fuer echte Altbestaende.
     Ein NEUER Datensatz mit Pruefpunktliste, in der dieses Kriterium
     fehlt, ist unvollstaendig — und ein unvollstaendiger Datensatz darf
     nicht auf den Rohbefund zurueckfallen. Sonst waere die Luecke von
     rc.4.44 fuer genau diesen Fall wieder offen. */
  const unvollstaendig = [punkt("residue", ST.PASS), punkt("scratch", ST.PASS)];
  ok("F7", "Ein unvollstaendiger neuer Datensatz faellt nicht auf den Rohbefund",
    kriteriumKurz(unvollstaendig, "dry", true, true) === "?"
    && kriteriumKurz([], "dry", true, true) === "PASS",
    `unvollstaendig → ${kriteriumKurz(unvollstaendig, "dry", true, true)}`
    + ` · Altbestand (leer) → ${kriteriumKurz([], "dry", true, true)}`);

  /* F8 · BEFUND der Gegenpruefung: eine FEHLENDE Pruefpunktliste beweist
     keinen Altbestand. Auch ein fehlerhafter NEUER Datensatz kann ohne sie
     ankommen — und dann waere der gruene Rohbefund wieder das massgebliche
     Urteil. Der historische Rueckfall braucht eine nachvollziehbare
     Erkennung des alten Formats, nicht das Fehlen eines Feldes. */
  const { istAltdatensatz } = await import("./src/assessment.js");
  const alt3 = { schema: 2, appVersion: "8.2.0" };
  const neu3 = { schema: 2, schemaVersion: 3, appVersion: "8.3.0-rc.4.45" };
  const kaputt = { schema: 2, schemaVersion: 3, appVersion: "8.3.0-rc.4.45",
    checkpoints: [] };
  ok("F8", "Der Altbestand wird am Datenformat erkannt, nicht am fehlenden Feld",
    istAltdatensatz(alt3) === true
    && istAltdatensatz(neu3) === false
    && istAltdatensatz(kaputt) === false
    && istAltdatensatz(null) === false,
    `ohne schemaVersion → ${istAltdatensatz(alt3)}`
    + ` · schemaVersion 3 → ${istAltdatensatz(neu3)}`
    + ` · unbekannt → ${istAltdatensatz(null)}`);

  /* F9 · Und die Wirkung: ein NEUER Datensatz ohne Pruefpunktliste zeigt
     "?" — nicht den gruenen Rohbefund. Ohne ausdrueckliche
     Altbestandsaussage gilt die sichere Richtung. */
  ok("F9", "Ein neuer Datensatz ohne Liste zeigt nicht den gruenen Rohbefund",
    kriteriumKurz([], "dry", true, istAltdatensatz(neu3)) === "?"
    && kriteriumKurz(null, "dry", true, istAltdatensatz(kaputt)) === "?"
    && kriteriumKurz([], "dry", true) === "?"
    && kriteriumKurz([], "dry", true, istAltdatensatz(alt3)) === "PASS",
    `neu → ${kriteriumKurz([], "dry", true, istAltdatensatz(neu3))}`
    + ` · ohne Angabe → ${kriteriumKurz([], "dry", true)}`
    + ` · alt → ${kriteriumKurz([], "dry", true, istAltdatensatz(alt3))}`);

  /* F10 · Die beiden Versionszahlen duerfen nicht auseinanderlaufen. Ein
     Datensatz, den DIESER Stand schreibt, darf niemals als Altbestand
     gelten — sonst kaeme der gruene Rohbefund durch die Hintertuer zurueck,
     sobald RECORD_SCHEMA_VERSION einmal erhoeht wird. Geprueft wird die
     Beziehung, nicht die Zahl. */
  const { PRUEFPUNKTE_AB_SCHEMAVERSION } = await import("./src/assessment.js");
  const { RECORD_SCHEMA_VERSION } = await import("./src/persistence.js");
  const heutiger = { schema: 2, schemaVersion: RECORD_SCHEMA_VERSION };
  ok("F10", "Ein heute geschriebener Datensatz gilt nie als Altbestand",
    RECORD_SCHEMA_VERSION >= PRUEFPUNKTE_AB_SCHEMAVERSION
    && istAltdatensatz(heutiger) === false,
    `RECORD_SCHEMA_VERSION ${RECORD_SCHEMA_VERSION}`
    + ` ≥ PRUEFPUNKTE_AB_SCHEMAVERSION ${PRUEFPUNKTE_AB_SCHEMAVERSION}`
    + ` · Altbestand → ${istAltdatensatz(heutiger)}`);
}

/* ═══ C · Ein nachgeladener Kandidat ist auffindbar und messbar ═════════
   BEFUND der Gegenpruefung an rc.4.44: Nachladen macht K340 in der Tabelle
   sichtbar und bindet eine Tiefeneingabe daran. Die Bildkomponente liest
   aber weiter nur `fotoScreening.candidates` und hebt ihn nicht hervor;
   danach weist die Speichergrenze eine vollstaendige Messung an K340 als
   nicht existierende Kennung ab. K050 aus der Vorauswahl wird angenommen.

   Beide Stellen bekommen denselben Zugriff. Erfundene Kennungen und
   Kennungen eines ANDEREN Fotos bleiben abgewiesen — sonst waere die
   Reparatur die naechste Luecke.                                        */
{
  const { findeKandidat, kandidatenBestand } =
    await import("./src/scratchScreening.js");

  const fotoScreening = {
    photoId: "photo-1", bildBreite: 711, bildHoehe: 720,
    candidates: [
      { kandidatId: "K001", rank: 1, boundingBox: { minX: 10, minY: 10, maxX: 40, maxY: 60 } },
    ],
    alleKandidaten: [
      { kandidatId: "K001", rank: 1, boundingBox: { minX: 10, minY: 10, maxX: 40, maxY: 60 } },
      { kandidatId: "K340", rank: 22, boundingBox: { minX: 497, minY: 398, maxX: 500, maxY: 416 } },
    ],
  };

  ok("C1", "Ein nur nachgeladener Kandidat ist auffindbar",
    findeKandidat(fotoScreening, "K340")?.rank === 22
    && findeKandidat(fotoScreening, "K001")?.rank === 1,
    `K340 → Rang ${findeKandidat(fotoScreening, "K340")?.rank}`
    + ` · K001 → Rang ${findeKandidat(fotoScreening, "K001")?.rank}`);

  ok("C2", "Eine erfundene Kennung wird nicht gefunden",
    findeKandidat(fotoScreening, "K999") === null
    && findeKandidat(fotoScreening, "") === null,
    "K999 und leere Kennung ergeben null");

  /* C3 · Der Bestand fuer die Anzeige: Vorauswahl PLUS der gewaehlte
     Kandidat, nicht alle 493 gleichzeitig ueber dem Bild. */
  const bestand = kandidatenBestand(fotoScreening, "K340");
  const ohneAuswahl = kandidatenBestand(fotoScreening, null);
  ok("C3", "Die Anzeige bekommt die Vorauswahl plus den gewaehlten",
    bestand.length === 2 && bestand.some(k => k.kandidatId === "K340")
    && ohneAuswahl.length === 1,
    `mit Auswahl ${bestand.length} · ohne Auswahl ${ohneAuswahl.length}`);

  /* C4..C6 · Die Speichergrenze, ueber die echte Invariante. */
  const { pruefeKandidatenbindung } = await import("./src/persistence.js");
  const satz = { screening: { photos: [fotoScreening, {
    photoId: "photo-2", bildBreite: 711, bildHoehe: 720,
    candidates: [], alleKandidaten: [
      { kandidatId: "K777", rank: 3, boundingBox: { minX: 1, minY: 1, maxX: 9, maxY: 9 } },
    ],
  }] } };
  const bindung = (photoId, kandidatId) =>
    pruefeKandidatenbindung(satz, { photoId, kandidatId });

  ok("C4", "Eine Messung am nachgeladenen Kandidaten ist bindbar",
    bindung("photo-1", "K340").valid === true
    && bindung("photo-1", "K001").valid === true,
    `K340 ${bindung("photo-1", "K340").valid} · K001 (Vorauswahl) ${bindung("photo-1", "K001").valid}`);

  ok("C5", "Eine erfundene Kennung bleibt abgewiesen",
    bindung("photo-1", "K999").valid === false,
    bindung("photo-1", "K999").error);

  ok("C6", "Die Kennung eines ANDEREN Fotos bleibt abgewiesen",
    bindung("photo-1", "K777").valid === false
    && bindung("photo-2", "K777").valid === true,
    `K777 auf photo-1 ${bindung("photo-1", "K777").valid}`
    + ` · auf photo-2 ${bindung("photo-2", "K777").valid}`);

  /* C7 · ALTBESTAND ohne vollstaendige Liste bleibt lesbar und bindbar —
     an dem, was er belegt. Es wird nichts nachberechnet und nichts
     erfunden. */
  const alt = { screening: { photos: [{
    photoId: "photo-1", bildBreite: 480, bildHoehe: 640,
    candidates: [{ kandidatId: "K050", rank: 5,
      boundingBox: { minX: 5, minY: 5, maxX: 20, maxY: 30 } }],
  }] } };
  ok("C7", "Ein Altdatensatz ohne vollstaendige Liste bleibt bindbar",
    pruefeKandidatenbindung(alt, { photoId: "photo-1", kandidatId: "K050" }).valid === true
    && pruefeKandidatenbindung(alt, { photoId: "photo-1", kandidatId: "K340" }).valid === false,
    "Vorauswahl gebunden, nicht belegte Kennung abgewiesen");
}

/* ═══ X · Strukturwache gegen den Rueckfall ═════════════════════════════
   D3 war kein Denkfehler, sondern eine nie gezogene Leitung: der Vertrag
   kannte manuelle Feststellungen, und der Erzeuger uebergab `[]`. Ein
   solcher Rueckfall faellt keiner Verhaltenspruefung auf — der Datensatz
   ist dann formal gueltig, nur leer. Deshalb eine Wache am Text.        */
{
  const quelle = await readFile(new URL("./src/App.jsx", import.meta.url), "utf8");
  const festVerdrahtetLeer = /manualFindings:\s*\[\s*\]/.test(quelle);
  const durchgereicht = /manualFindings:\s*schadensverdachte/.test(quelle);
  ok("X1", "Der Erzeuger reicht gemeldete Feststellungen weiter, statt [] zu senden",
    !festVerdrahtetLeer && durchgereicht,
    festVerdrahtetLeer
      ? "App.jsx uebergibt wieder ein festes leeres Feld"
      : durchgereicht ? "manualFindings: schadensverdachte"
        : "weder festes [] noch Durchreichung gefunden — die Leitung fehlt");
}

/* ═══ Q · BEFUND D · Der Weg nach dem Wiederoeffnen durch die QA ════════
   Der Reparaturauftrag verlangt drei Dinge fuer den wiedergeoeffneten
   Bericht, und sie haengen zusammen:

     1. Die QA muss den Bericht nach dem Wiederoeffnen BEURTEILEN koennen.
        Ein gemeldeter Schadensverdacht sperrt PASS und Override
        (Leitplanke 11). Kann die QA ihn im wiedergeoeffneten Datensatz
        nicht beantworten, bleibt nur die Sperrung — der Vorgang ist
        eingemauert, und die Sperre waere schaedlicher als der Fehler.

     2. Die Ergaenzung ist an den UNVERAENDERTEN Original-Datensatz
        gebunden. Signierte Pruefungen sind append-only (Leitplanke 6):
        die Beurteilung entsteht als neuer, auf die geprueft Revision
        bezogener Datensatz, niemals als Ueberschreiben.

     3. Es wird KEINE Freigabe angeboten, die spaeter scheitert. Bis hier
        kennt `qaDecisionOptions` nur Pruefpunkte; offene und bestaetigte
        Schadensverdachte sieht sie nicht. Die Oberflaeche bot deshalb
        "Durch QA freigeben" an, und `evaluateTransition` wies erst nach
        Anmeldung, Begruendung und Signatur ab.                          */
{
  const { qaDecisionOptions } = await import("./src/lifecycle.js");
  const wartend = (manualFindings, systemStatus = "PASS") => ({
    id: "inspection-alt", state: LIFECYCLE_STATE.PENDING_QA,
    recordHash: "hash-der-gepruften-revision",
    aggregate: { checkpoints: gruen },
    originalSystemDecision: { status: systemStatus },
    performedBy: { username: "operator1", role: "Operator", at: "2026-09-17T14:00:00.000Z" },
    qaTriggers: [{ code: "MANUAL_DAMAGE_SUSPECTED" }],
    photos: [{ id: "photo-1", markers: [{ id: "marker-1" }] }],
    manualFindings,
  });

  /* Q1 · Ein offener Verdacht darf gar nicht erst als Freigabe angeboten
     werden. Bis hier meldete qaDecisionOptions allowed=true. */
  const offen = qaDecisionOptions(wartend([basis]));
  ok("Q1", "Bei offenem Verdacht wird keine Freigabe angeboten",
    offen.release.allowed === false && offen.release.code === "OPEN_MANUAL_FINDING",
    `${offen.release.allowed ? "ANGEBOTEN" : "nicht angeboten"} · ${offen.release.code}`);

  /* Q2 · Das Angebot muss mit der Entscheidung uebereinstimmen. Eine
     angebotene Freigabe, die evaluateTransition anschliessend abweist,
     ist genau der Befund. Geprueft wird die Uebereinstimmung, nicht die
     Einzelantwort. */
  const faelle = [[basis], [geklaert], [{ ...basis, klaerung: {
    at: "2026-09-17T15:00:00.000Z", username: "qa_manager", role: "QA Manager",
    ergebnis: "SCHADEN_BESTAETIGT", begruendung: "Ausbruch bestaetigt, Teil sperren",
  } }]];
  const abweichungen = faelle.filter(findings => {
    const angebot = qaDecisionOptions(wartend(findings));
    if (!angebot.release.allowed) return false;
    const folge = uebergang(findings);
    return folge.allowed === false;
  });
  ok("Q2", "Keine Freigabe angeboten, die spaeter scheitert",
    abweichungen.length === 0,
    abweichungen.length
      ? `${abweichungen.length} Fall/Faelle angeboten und danach abgewiesen`
      : `${faelle.length} Faelle geprueft, Angebot und Entscheidung stimmen ueberein`);

  /* Q3 · Ein bestaetigter Schaden ist kein offener Verdacht — aber auch
     kein normaler PASS. Er bleibt ein negativer Befund. */
  const bestaetigt = qaDecisionOptions(wartend(faelle[2]));
  ok("Q3", "Ein bestaetigter Schaden erzeugt keinen normalen PASS-Weg",
    bestaetigt.release.allowed === false && bestaetigt.release.code === "CONFIRMED_DAMAGE",
    `${bestaetigt.release.allowed ? "ANGEBOTEN" : "nicht angeboten"} · ${bestaetigt.release.code}`);

  /* Q4 · Und die Gegenrichtung: eine dokumentiert beantwortete Meldung
     gibt den Weg wieder frei. Eine Sperre ohne Rueckweg waere eine
     Sackgasse. Die Sperrung bleibt in jedem Fall erreichbar. */
  const frei = qaDecisionOptions(wartend([geklaert]));
  ok("Q4", "Nach dokumentierter Beurteilung ist die Freigabe wieder erreichbar",
    frei.release.allowed === true && frei.block.allowed === true
    && offen.block.allowed === true && bestaetigt.block.allowed === true,
    `Freigabe ${frei.release.allowed} · Sperrung offen/bestaetigt/geklaert:`
    + ` ${offen.block.allowed}/${bestaetigt.block.allowed}/${frei.block.allowed}`);
}

/* Q5-Q9 · Die Ergaenzung als eigener, gebundener Datensatz. */
{
  const { buildClarificationRecord } = await import("./src/inspectionRecord.js");
  const original = Object.freeze({
    id: "inspection-alt", schema: 2, schemaVersion: 3,
    state: LIFECYCLE_STATE.PENDING_QA, appVersion: "8.3.0-rc.4.45",
    recordHash: "hash-der-gepruften-revision",
    createdAt: "2026-09-17T14:00:00.000Z", signedAt: "2026-09-17T14:00:00.000Z",
    aggregate: { checkpoints: gruen },
    originalSystemDecision: { status: "PASS" },
    performedBy: Object.freeze({ username: "operator1", role: "Operator", at: "2026-09-17T14:00:00.000Z" }),
    user: Object.freeze({ username: "operator1", role: "Operator", displayName: "Operator 1" }),
    qaTriggers: Object.freeze([{ code: "MANUAL_DAMAGE_SUSPECTED" }]),
    photos: Object.freeze([Object.freeze({ id: "photo-1" })]),
    manualFindings: Object.freeze([basis]),
    signature: Object.freeze({ method: "USER_ID_PASSWORD", signedBy: "operator1",
      signedAt: "2026-09-17T14:00:00.000Z", meaning: "Pruefung erfasst, Freigabe ausstehend" }),
  });
  const vorher = JSON.stringify(original);
  const klaerung = {
    photoId: "photo-1", markerId: "marker-1",
    ergebnis: "KEIN_SCHADEN",
    begruendung: "Unter Streiflicht nachgesehen: Schliffspur, kein Ausbruch",
  };
  const ergaenzung = buildClarificationRecord({
    pending: original, actor: { username: "qa_manager", role: "QA Manager", displayName: "QA" },
    signature: { method: "USER_ID_PASSWORD", components: ["USER_ID", "PASSWORD"] },
    now: "2026-09-17T15:00:00.000Z", newId: "inspection-neu",
    appVersion: "8.3.0-rc.4.45", klaerungen: [klaerung],
  });

  ok("Q5", "Die Beurteilung entsteht als eigener Datensatz, das Original bleibt",
    Boolean(ergaenzung) && ergaenzung.id === "inspection-neu"
    && ergaenzung.supersedesId === "inspection-alt"
    && JSON.stringify(original) === vorher,
    ergaenzung ? `${ergaenzung.id} loest ${ergaenzung.supersedesId} ab`
      : "kein Datensatz erzeugt");

  ok("Q6", "Die Ergaenzung ist an die gepruefte Revision gebunden",
    ergaenzung?.approvalRevisionHash === "hash-der-gepruften-revision"
    && !("recordHash" in (ergaenzung || {})),
    `Revision ${ergaenzung?.approvalRevisionHash} · eigener Hash`
    + ` ${"recordHash" in (ergaenzung || {}) ? "uebernommen (falsch)" : "neu zu bilden"}`);

  ok("Q7", "Die Beurteilung beantwortet den Verdacht, sie loescht ihn nicht",
    (ergaenzung?.manualFindings || []).length === 1
    && ergaenzung.manualFindings[0].reason === basis.reason
    && ergaenzung.manualFindings[0].klaerung?.ergebnis === "KEIN_SCHADEN"
    && ergaenzung.manualFindings[0].klaerung?.username === "qa_manager"
    && ergaenzung.manualFindings[0].klaerung?.role === "QA Manager"
    && ergaenzung.manualFindings[0].klaerung?.at === "2026-09-17T15:00:00.000Z",
    JSON.stringify(ergaenzung?.manualFindings?.[0]?.klaerung ?? null).slice(0, 120));

  /* Q8 · Die Ergaenzung ist NOCH KEINE Freigabe. Sie beantwortet eine
     Frage; die Entscheidung bleibt ein zweiter, eigener Schritt mit
     eigener Bedeutung der Unterschrift. */
  ok("Q8", "Die Beurteilung ist keine Freigabe",
    ergaenzung?.state === LIFECYCLE_STATE.PENDING_QA
    && !ergaenzung.approvedBy
    && ergaenzung.finalDecision === (original.finalDecision ?? null)
    && ergaenzung.signature?.meaning !== "Freigabe",
    `Zustand ${ergaenzung?.state} · Bedeutung "${ergaenzung?.signature?.meaning}"`);

  /* Q9 · Und die Grenzen: nur ein wartender Datensatz, nur eine Klaerung
     zu einer Meldung, die es gibt, nur mit Begruendung. */
  const nichtWartend = buildClarificationRecord({
    pending: { ...original, state: LIFECYCLE_STATE.FINAL_FAIL },
    actor: { username: "qa_manager", role: "QA Manager" },
    signature: {}, now: "2026-09-17T15:00:00.000Z", newId: "x",
    appVersion: "8.3.0", klaerungen: [klaerung] });
  const fremdeStelle = buildClarificationRecord({
    pending: original, actor: { username: "qa_manager", role: "QA Manager" },
    signature: {}, now: "2026-09-17T15:00:00.000Z", newId: "x",
    appVersion: "8.3.0", klaerungen: [{ ...klaerung, markerId: "marker-99" }] });
  const ohneBegruendung = buildClarificationRecord({
    pending: original, actor: { username: "qa_manager", role: "QA Manager" },
    signature: {}, now: "2026-09-17T15:00:00.000Z", newId: "x",
    appVersion: "8.3.0", klaerungen: [{ ...klaerung, begruendung: "  " }] });
  ok("Q9", "Die Ergaenzung kennt ihre Grenzen",
    nichtWartend === null && fremdeStelle === null && ohneBegruendung === null,
    `nicht wartend ${nichtWartend === null} · fremde Stelle ${fremdeStelle === null}`
    + ` · ohne Begruendung ${ohneBegruendung === null}`);
}

/* Q10-Q13 · Die Speichergrenze glaubt auch dieser Ergaenzung nicht.

   Eine Beurteilung AENDERT den Datensatzinhalt — genau das, was einer
   Freigabe streng verboten ist (kanonische Projektion, Befund rc.4.7/4.8).
   Die Grenze muss den einen Schreibvorgang vom anderen unterscheiden und
   fuer die Ergaenzung ihre EIGENE, engere Regel anwenden: nur `klaerung`,
   nur an einer bereits gemeldeten Stelle, nur wenn dort noch keine steht.  */
{
  const { recordDigest } = await import("./src/audit.js");
  const { saveInspection, loadInspections } = await import("./src/persistence.js");
  const { CHECKPOINTS, STATUS } = await import("./src/assessment.js");
  const { CAPTURE_PATH } = await import("./src/decision.js");
  const { buildClarificationRecord } = await import("./src/inspectionRecord.js");

  const pruefer = { username: "operator1", displayName: "Operator 1", role: "Operator" };
  const qa = { username: "qa_manager", displayName: "QA Manager", role: "QA Manager" };
  const urteil = { code: "PASS", pass: true, message: "PASS", detail: "x", severity: 0, action: "" };
  const punkte = CHECKPOINTS.map(meta => ({
    id: meta.id, status: STATUS.PASS, code: "PASS", required: meta.required,
    label: { de: meta.de, en: meta.en }, message: { de: "Bestanden", en: "Pass" },
    reason: "Testfixture", actions: [], measurements: {},
  }));
  const meldung = {
    kind: "MANUAL_DAMAGE_SUSPECTED", username: "operator1", role: "Operator",
    at: "2026-09-17T15:00:00.000Z",
    reason: "Gesehene Stelle, vom Detektor nicht gemeldet",
    photoId: "photo-1", markerId: "marker-1", klaerung: null,
  };
  const wartendeSignatur = {
    method: "USER_ID_PASSWORD", components: ["userId", "password"],
    meaning: "Pruefung erfasst, Freigabe ausstehend",
    signedAt: "2026-09-17T15:10:00.000Z", signedBy: pruefer.username,
  };
  const wartend = {
    id: "inspection-wartend-q", schema: 2, appVersion: "8.3.0-rc.4.45",
    createdAt: wartendeSignatur.signedAt, signedAt: wartendeSignatur.signedAt,
    user: pruefer, eqId: "tp", eqName: "Tablettenpresse",
    zoneId: "die", zoneName: "Matrizenteller", photoCount: 1,
    photos: [{ id: "photo-1", image: "data:image/jpeg;base64,QQ==",
      annotatedImage: "data:image/jpeg;base64,QQ==",
      markers: [{ id: "marker-1", x: 0.5, y: 0.5 }], markerAssessments: [],
      result: { dry: urteil, clean: urteil, intact: urteil, lm: 0.6, hints: [],
        checkpoints: punkte },
      captureProfile: { processedWidth: 480, processedHeight: 640,
        sourceWidth: 480, sourceHeight: 640, path: CAPTURE_PATH.CAMERA },
      knownIssueInfo: null }],
    aggregate: { dry: urteil, clean: urteil, intact: urteil, lm: 0.6, hints: [],
      checkpoints: punkte },
    originalSystemDecision: { status: "PASS", reason: "ALL_PASS", failed: [] },
    finalDecision: null, comment: "Stelle gemeldet, Beurteilung durch die QA",
    overrideReason: null, referenceId: null, signature: wartendeSignatur,
    schemaVersion: 3, state: LIFECYCLE_STATE.PENDING_QA,
    previousState: LIFECYCLE_STATE.DRAFT, checkpoints: punkte, reauthenticated: true,
    performedBy: { username: pruefer.username, role: pruefer.role, at: wartendeSignatur.signedAt },
    approvedBy: null, approvalRevisionHash: null, revisionHash: null,
    retakes: [], manualFindings: [meldung], knownIssueAssignments: [],
    qaTriggers: [{ code: "MANUAL_DAMAGE_SUSPECTED", source: "MANUAL_FINDING", at: meldung.at }],
    aiCrosscheck: { enabled: false, status: "AI_CROSSCHECK_DISABLED", unresolvedConflicts: 0 },
  };
  wartend.recordHash = await recordDigest(wartend);
  await saveInspection(wartend, pruefer);
  const gespeichert = (await loadInspections()).find(r => r.id === wartend.id);

  const baueErgaenzung = (klaerungen, id = "inspection-klaerung-q") =>
    buildClarificationRecord({
      pending: gespeichert, actor: qa,
      signature: { method: "USER_ID_PASSWORD", components: ["userId", "password"] },
      now: "2026-09-17T16:00:00.000Z", newId: id,
      appVersion: "8.3.0-rc.4.45", klaerungen,
    });

  /* Q10 · Der gute Fall: die Beurteilung geht durch, und das Original
     bleibt Zeichen fuer Zeichen stehen. */
  const ergaenzung = baueErgaenzung([{ photoId: "photo-1", markerId: "marker-1",
    ergebnis: "KEIN_SCHADEN",
    begruendung: "Unter Streiflicht nachgesehen: Schliffspur, kein Ausbruch" }]);
  ergaenzung.recordHash = await recordDigest(ergaenzung);
  let q10Fehler = null;
  try { await saveInspection(ergaenzung, qa); }
  catch (fehler) { q10Fehler = fehler.message; }
  const nachher = await loadInspections();
  const originalNachher = nachher.find(r => r.id === wartend.id);
  const klaerungNachher = nachher.find(r => r.id === "inspection-klaerung-q");
  ok("Q10", "Die Beurteilung der QA kommt durch die Speichergrenze",
    q10Fehler === null
    && originalNachher?.recordHash === wartend.recordHash
    && originalNachher?.manualFindings?.[0]?.klaerung === null
    && klaerungNachher?.manualFindings?.[0]?.klaerung?.ergebnis === "KEIN_SCHADEN"
    && klaerungNachher?.manualFindings?.[0]?.reason === meldung.reason,
    q10Fehler ? `abgewiesen: ${q10Fehler}`
      : `Original unveraendert (${originalNachher?.recordHash === wartend.recordHash})`
        + ` · Ergaenzung ${klaerungNachher?.manualFindings?.[0]?.klaerung?.ergebnis}`);

  /* Q11 · Eine Ergaenzung, die NEBENBEI etwas anderes aendert, ist keine
     Ergaenzung mehr. Hier: derselbe Schreibvorgang mit veraendertem
     Pruefer-Kommentar. */
  const geschmuggelt = baueErgaenzung([{ photoId: "photo-1", markerId: "marker-1",
    ergebnis: "KEIN_SCHADEN", begruendung: "Nachgesehen, kein Ausbruch" }],
  "inspection-klaerung-schmuggel");
  geschmuggelt.comment = "Anderer Kommentar als in der geprueften Revision";
  geschmuggelt.recordHash = await recordDigest(geschmuggelt);
  let q11 = null;
  try { await saveInspection(geschmuggelt, qa); } catch (fehler) { q11 = fehler.message; }
  ok("Q11", "Eine Beurteilung darf nichts anderes mitaendern",
    Boolean(q11),
    q11 ? `abgewiesen: ${q11.slice(0, 110)}` : "GESPEICHERT — der Kommentar liess sich mitaendern");

  /* Q12 · Und sie darf keine Meldung hinzufuegen. Eine erfundene zweite
     Stelle im Beurteilungsschritt waere ein neuer Befund ohne Pruefung. */
  const erfunden = baueErgaenzung([{ photoId: "photo-1", markerId: "marker-1",
    ergebnis: "KEIN_SCHADEN", begruendung: "Nachgesehen, kein Ausbruch" }],
  "inspection-klaerung-erfunden");
  erfunden.manualFindings = [...erfunden.manualFindings,
    { ...meldung, markerId: "marker-2", reason: "Nachtraeglich erfundene Stelle" }];
  erfunden.recordHash = await recordDigest(erfunden);
  let q12 = null;
  try { await saveInspection(erfunden, qa); } catch (fehler) { q12 = fehler.message; }
  ok("Q12", "Eine Beurteilung fuegt keine Meldung hinzu",
    Boolean(q12),
    q12 ? `abgewiesen: ${q12.slice(0, 110)}` : "GESPEICHERT — eine Stelle liess sich nachschieben");

  /* Q13 · Die Freigabe bleibt streng. Die neue Regel darf ihr Tor nicht
     mit aufgemacht haben: eine FREIGABE mit geaenderten Meldungen muss
     weiterhin abgewiesen werden. */
  const { buildApprovalRecord } = await import("./src/inspectionRecord.js");
  const freigabe = buildApprovalRecord({
    pending: gespeichert, approver: qa,
    signature: { method: "USER_ID_PASSWORD", components: ["userId", "password"] },
    now: "2026-09-17T16:30:00.000Z", decision: "FAIL",
    newId: "inspection-freigabe-q", appVersion: "8.3.0-rc.4.45",
    approvalComment: "Gesperrt",
  });
  freigabe.manualFindings = [{ ...meldung, reason: "Umgeschriebener Grund" }];
  freigabe.recordHash = await recordDigest(freigabe);
  let q13 = null;
  try { await saveInspection(freigabe, qa); } catch (fehler) { q13 = fehler.message; }
  ok("Q13", "Eine Freigabe darf Meldungen weiterhin nicht aendern",
    Boolean(q13),
    q13 ? `abgewiesen: ${q13.slice(0, 110)}` : "GESPEICHERT — die Freigabe schrieb den Grund um");

  /* Q14 · Eine Entscheidung, die auf einer Beurteilung aufsetzt, ist
     selbst keine. Bis rc.4.45 uebernahm sie die Kennzeichnung mit und wies
     sich damit im Protokoll und in der Auditnutzlast als Beurteilung aus —
     eine falsche Etikettierung in einem GMP-Dokument. */
  const { istKlaerungsschritt } = await import("./src/inspectionRecord.js");
  const geklaerterStand = (await loadInspections())
    .find(r => r.id === "inspection-klaerung-q");
  const entscheid = buildApprovalRecord({
    pending: geklaerterStand, approver: qa,
    signature: { method: "USER_ID_PASSWORD", components: ["userId", "password"] },
    now: "2026-09-17T17:00:00.000Z", decision: "FAIL",
    newId: "inspection-entscheid-q", appVersion: "8.3.0-rc.4.45",
    approvalComment: "Gesperrt nach Beurteilung",
  });
  ok("Q14", "Eine Entscheidung auf einer Beurteilung ist selbst keine",
    Boolean(geklaerterStand?.clarification)
    && entscheid?.clarification === null
    && istKlaerungsschritt(entscheid) === false
    && istKlaerungsschritt(geklaerterStand) === true,
    `Vorgaenger gekennzeichnet ${Boolean(geklaerterStand?.clarification)}`
    + ` · Entscheid ${JSON.stringify(entscheid?.clarification ?? "FEHLT")}`);
}

console.log("");
const durch = checks.filter(c => !c.bestanden);
console.log(`Bestanden: ${checks.length - durch.length} / ${checks.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(c => c.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
