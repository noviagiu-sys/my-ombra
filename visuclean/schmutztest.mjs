/* ─── VisuClean · Schmutzdarstellung und Wischvergleich ────────────────────
   Aufruf: node schmutztest.mjs

   Diese Suite gehoert zum Auftrag "Schmutzerkennung erhalten, Darstellung
   vervollstaendigen, Wischvergleich korrigieren".

   SIE BELEGT KEINE REALE ERKENNUNGSLEISTUNG. Sie rechnet auf synthetischen,
   geseedeten Bildern und auf gebauten Datensaetzen. Was hier gruen ist,
   sagt etwas ueber Berechnung und Darstellung — nichts darueber, ob die App
   Schmutz auf echtem Edelstahl zuverlaessig findet. Dafuer braucht es reale
   Aufnahmen mit unabhaengig markierten Stellen (V83_SCHMUTZKAMPAGNE.md).

   Zwei Fehler werden hier festgenagelt, beide am tatsaechlichen Verhalten
   gemessen und nicht aus dem Quelltext geschlossen:

   S1  Der Kern rechnet vier Masken, die Anzeige leitete ihre Sichtbarkeit
       aus EINEM Sauberkeitscode ab. Am gemischten Fall gemessen: 5888 px
       Anomaliemaske aus 23 Bildzonen berechnet, keine davon eingeblendet.

   S3  Der Wischvergleich addierte die Befundstaerken von Trocken, Sauber
       und Intakt. Eine sinkende Summe hiess "Rueckstand moeglich" — auch
       dann, wenn ausschliesslich die Feuchtigkeit abgenommen hatte.     */

import "fake-indexeddb/auto";
import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";
import { EBENEN_STATUS, befundEbenen, ebenenBestand, ebenenText,
  standardEbenen, verdeckteEbenen } from "./src/overlayLayers.js";

const checks = [];
function ok(id, name, bestanden, info = "") {
  checks.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · Schmutzdarstellung und Wischvergleich\n");

/* ── Deterministische Bilder. Kein Math.random im Anwendungspfad und
      keines in dieser Suite. ─────────────────────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const W = 320, H = 240;

/* Der gemischte Fall: raeumlich GETRENNTE warme, helle und dunkle
   Bereiche, alle auf Blockgrenzen (BLK = 16). Getrennt, weil der Kern
   warme Bloecke von der Anomaliezaehlung ausnimmt (wfB <= 0.25) — ein
   ueberlappender Aufbau wuerde also gar keine zwei Befunde erzeugen und
   die Gegenprobe waere wertlos.

   Die Raender sind ueber vier Pixel weich, damit der Aufbau keinen
   Kratzerverdacht aus seinen eigenen Rechteckkanten erzeugt. Ein Fixture,
   das nebenbei einen dritten Befund ausloest, prueft nicht mehr das, was
   es zu pruefen vorgibt. */
function mischbild() {
  const r = mulberry32(2026);
  const d = new Uint8ClampedArray(W * H * 4);
  const weich = (x, y, x0, y0, x1, y1) => {
    const rand = 4;
    const dx = Math.min(x - x0, x1 - 1 - x), dy = Math.min(y - y0, y1 - 1 - y);
    if (dx < 0 || dy < 0) return 0;
    return Math.min(1, Math.min(dx, dy) / rand);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const g = 150 + Math.round((r() - 0.5) * 6);
    let px = [g, g, g];
    const mische = (ziel, t) => [
      Math.round(g + (ziel[0] - g) * t),
      Math.round(g + (ziel[1] - g) * t),
      Math.round(g + (ziel[2] - g) * t)];
    /* WARM links oben */
    let t = weich(x, y, 16, 16, 80, 64);
    if (t > 0) px = mische([186, 150, 112], t);
    /* HELL rechts oben — ueber dem Umgebungsniveau, aber unter 0.82,
       damit es eine Block-ANOMALIE ist und nicht die Hellmaske fuellt */
    else if ((t = weich(x, y, 224, 16, 288, 64)) > 0) px = mische([196, 196, 196], t);
    /* DUNKEL links unten */
    else if ((t = weich(x, y, 16, 176, 80, 224)) > 0) px = mische([96, 96, 96], t);
    d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = 255;
  }
  return d;
}

const merkmale = computeFeatures(mischbild(), W, H);
const urteil = buildVerdicts(merkmale);
const codes = { dry: urteil.dry.code, clean: urteil.clean.code, intact: urteil.intact.code };
const bestand = ebenenBestand(merkmale);
const ebenen = befundEbenen(bestand, codes);
const finde = id => ebenen.find(e => e.id === id);

/* ── S1a · Der Kern rechnet BEIDE Befunde ──────────────────────────────
   Erst wenn das belegt ist, ist die Anzeige ueberhaupt die Frage. Waere
   nur einer berechnet, laege der Fehler im Kern — und der ist in diesem
   Auftrag ausdruecklich nicht zu aendern. */
ok("S1a", "Der gemischte Fall erzeugt warme UND farbneutrale Auffaelligkeiten",
  finde("warm").pixel > 0 && finde("anom").pixel > 0
  && finde("anom").bloecke.hell > 0 && finde("anom").bloecke.dunkel > 0,
  `warm ${finde("warm").pixel} px in ${finde("warm").bloecke.warm} Zonen`
  + ` · farbneutral ${finde("anom").pixel} px in`
  + ` ${finde("anom").bloecke.hell + finde("anom").bloecke.dunkel} Zonen`
  + ` (${finde("anom").bloecke.hell} hell, ${finde("anom").bloecke.dunkel} dunkel)`);

/* ── S1b · Genau EIN Sauberkeitscode, und er traegt nur EINE Maske ──── */
ok("S1b", "Die Urteilskette waehlt einen Code; die zweite Maske traegt kein Urteil",
  codes.clean === "LOCAL_RESIDUE"
  && finde("warm").status === EBENEN_STATUS.URTEILSTRAGEND
  && finde("anom").status === EBENEN_STATUS.ZUSATZHINWEIS,
  `clean ${codes.clean} · warm ${finde("warm").status}`
  + ` · farbneutral ${finde("anom").status}`);

/* ── S1c · DER BEFUND: berechnet und trotzdem unsichtbar ───────────────
   Nachgebaut wird hier die Sichtbarkeitsregel, wie paintOverlay sie bis
   rc.4.37 hatte: jede Maske haengt an den Urteilscodes. Die Zahl, die
   dabei herauskommt, ist der gemessene Verlust. */
const altSichtbar = {
  hell: ["MOISTURE_SUSPECT", "SPECULAR_REFLECTION"].includes(codes.dry),
  warm: ["ORGANIC_RESIDUE", "LOCAL_RESIDUE"].includes(codes.clean),
  anom: ["BRIGHT_RESIDUE", "DARK_RESIDUE"].includes(codes.clean),
  dunkel: codes.dry === "DARK_WET_SUSPECT",
};
const altVerloren = ebenen.filter(e =>
  e.status !== EBENEN_STATUS.NICHT_ERKANNT && altSichtbar[e.id] === false);
ok("S1c", "Der alte Weg blendet eine berechnete Maske ersatzlos aus",
  altVerloren.length > 0,
  altVerloren.length
    ? `${altVerloren.map(e => `${e.id} (${e.pixel} px)`).join(", ")} berechnet, nicht eingeblendet`
    : "kein Verlust — dann belegt diese Gegenprobe nichts");

/* ── S1d · "Nicht eingeblendet" ist von "nicht erkannt" unterscheidbar ─
   Die Kernforderung des Auftrags. Drei Zustaende, drei verschiedene
   Aussagen — und die leere Maske darf nicht wie eine verdeckte aussehen. */
const leer = ebenen.filter(e => e.status === EBENEN_STATUS.NICHT_ERKANNT);
const verdeckt = verdeckteEbenen(ebenen);
ok("S1d", "Nicht eingeblendet und nicht erkannt sind unterscheidbar",
  leer.length > 0 && verdeckt.length > 0
  && leer.every(e => /nicht erkannt/.test(ebenenText(e, "de")))
  && verdeckt.every(e => /NICHT eingeblendet/.test(ebenenText(e, "de")))
  && leer.every(e => !verdeckt.includes(e)),
  `${leer.length} leer (${leer.map(e => e.id).join(", ")})`
  + ` · ${verdeckt.length} verdeckt (${verdeckt.map(e => e.id).join(", ")})`);

/* ── S1e · Die Voreinstellung aendert sich NICHT ───────────────────────
   Eine Rohmaske blendet sich nicht von selbst ein. Sichtbar bleibt genau,
   was rc.4.37 sichtbar hatte; alles Zusaetzliche ist zuschaltbar. Ohne
   diese Gegenprobe waere die Reparatur eine stille Verhaltensaenderung
   in der Bewertungsanzeige. */
const standard = standardEbenen(ebenen);
const altStandard = ebenen.filter(e =>
  e.status !== EBENEN_STATUS.NICHT_ERKANNT && altSichtbar[e.id] === true).map(e => e.id);
ok("S1e", "Die Voreinstellung zeigt genau das Bild von rc.4.37",
  standard.length === altStandard.length
  && standard.every(id => altStandard.includes(id)),
  `neu [${standard.join(", ")}] · alt [${altStandard.join(", ")}]`);

/* ── S1f · Kein neues FAIL, kein bestaetigter Schmutz aus der Rohmaske ─ */
const nachher = buildVerdicts(computeFeatures(mischbild(), W, H));
ok("S1f", "Die Ebenenableitung aendert kein Urteil und erzeugt kein FAIL",
  nachher.clean.code === codes.clean && nachher.dry.code === codes.dry
  && nachher.intact.code === codes.intact
  && ebenen.every(e => e.istMessgroesse === false)
  && !ebenen.some(e => "pass" in e || "severity" in e),
  `clean ${nachher.clean.code} · dry ${nachher.dry.code} · intact ${nachher.intact.code}`
  + " · keine Ebene traegt pass oder severity");

/* ── S1g · Rein und reproduzierbar ─────────────────────────────────────
   Ein gespeicherter Bericht traegt den Bestand, nicht die Masken. Aus
   demselben Bestand muss dieselbe Liste entstehen — sonst koennte ein
   Protokoll spaeter etwas anderes sagen als der Bildschirm bei der
   Aufnahme. */
const wieder = befundEbenen(JSON.parse(JSON.stringify(bestand)), codes);
ok("S1g", "Gleicher Bestand ergibt dieselbe Ebenenliste",
  JSON.stringify(wieder) === JSON.stringify(ebenen),
  "durch JSON gereicht und erneut abgeleitet - identisch");

/* ── S1h · Die Bezugsgroesse steht dabei ───────────────────────────────
   Ein Pixelanteil ist kein Verschmutzungsgrad. Die Zahl darf nie ohne
   ihre Bezugsgroesse erscheinen, und sie darf nicht als Prozentgrad
   auftreten. */
const texte = ebenen.filter(e => e.status !== EBENEN_STATUS.NICHT_ERKANNT)
  .map(e => ebenenText(e, "de"));
ok("S1h", "Jede Mengenangabe nennt ihre Bezugsgroesse und behauptet keinen Grad",
  texte.length > 0
  && texte.every(t => /von \d+ px/.test(t) || /Struktur\(en\)/.test(t))
  && !texte.some(t => /%|Grad|Verschmutzungsgrad|Menge/i.test(t)),
  texte.map(t => t.slice(0, 64)).join(" | "));

/* ═══ S2 · Kommt es in der ECHTEN Ergebnisansicht an? ═══════════════════
   S1 prueft die Ableitung. Das genuegt nicht: eine richtige Ableitung,
   die niemand verdrahtet, aendert am Bildschirm nichts. Hier wird die
   echte ResultScreen in einem DOM gerendert und der Schalter GEDRUECKT.

   Bewusst nicht das Panel allein: eine Gegenprobe prueft nur den
   Bildschirm, den sie aufruft.                                          */
{
  const { JSDOM } = await import("jsdom");
  const { createServer } = await import("vite");
  const dom = new JSDOM(
    "<!doctype html><html lang=\"de\"><head><title>VisuClean</title></head>"
    + "<body><div id=\"root\"></div></body></html>",
    { url: "https://visuclean.test/", pretendToBeVisual: true });
  for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement", "Node",
    "MutationObserver", "getComputedStyle", "Image", "Blob", "Event", "CSSStyleSheet"]) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");

  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { ResultScreen } = await vite.ssrLoadModule("/src/App.jsx");
    const { translator } = await vite.ssrLoadModule("/src/i18n.js");
    const { aggregateResults, deriveSystemDecision } = await vite.ssrLoadModule("/src/domain.js");
    const { buildCheckpoints } = await vite.ssrLoadModule("/src/assessment.js");
    const { CAPTURE_PATH, captureProfile } = await vite.ssrLoadModule("/src/decision.js");
    const t = translator("de");

    /* `lm` gehoert dazu: aggregateResults mittelt es ueber die Ergebnisse,
       und ohne den Wert entsteht NaN — die Kanonisierung weist das dann zu
       Recht ab. Ein Fixture, das den Vertrag nicht erfuellt, prueft nichts. */
    const ergebnis = {
      dry: urteil.dry, clean: urteil.clean, intact: urteil.intact,
      lm: merkmale.lm, hints: [...urteil.hints],
      checkpoints: buildCheckpoints(merkmale, urteil, {}),
    };
    const foto = {
      id: "photo-1", image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      result: ergebnis, markers: [], markerAssessments: [],
      rawResult: {
        ...ergebnis,
        _ov: { w: W, h: H, verdictCodes: codes, ebenen, scratches: [] },
      },
    };
    const aggregat = aggregateResults([ergebnis]);

    const behaelter = dom.window.document.getElementById("root");
    const wurzel = createRoot(behaelter);
    await act(async () => {
      wurzel.render(React.createElement(ResultScreen, {
        mode: "inspect",
        equipment: { id: "tp", de: "Tablettenpresse", en: "Tablet press" },
        zone: { id: "die", de: "Matrizenteller", en: "Die table" },
        photos: [foto], aggregate: aggregat,
        systemDecision: deriveSystemDecision(aggregat),
        reference: null, swabData: null, language: "de",
        user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
        comment: "", setComment: () => {}, onDecision: () => {},
        onOverride: () => {}, onKnownIssue: () => {}, onSwab: () => {},
        onDone: () => {}, t, screening: null,
      }));
    });

    const schalter = () => [...behaelter.querySelectorAll("button.layer-toggle")];
    const anomSchalter = () => schalter().find(b =>
      /[Ff]arbneutrale Helligkeitsabweichung/.test(b.textContent || ""));

    /* ── S2a · Die verdeckte Ebene ist ueberhaupt auffindbar ─────────── */
    const text = behaelter.textContent || "";
    ok("S2a", "Die verdeckte Ebene erscheint in der Ergebnisansicht",
      Boolean(anomSchalter()) && /5888 von 76800 px/.test(text)
      && /23 Bildzonen/.test(text),
      anomSchalter()
        ? `Schalter vorhanden · Mengenangabe mit Bezug im Text: ${/5888 von 76800 px/.test(text)}`
        : "KEIN Schalter fuer die berechnete, nicht eingeblendete Maske");

    /* ── S2b · Sie ist als Zusatzhinweis beschriftet, nicht als Urteil ─ */
    const anomText = anomSchalter()?.textContent || "";
    ok("S2b", "Sie ist als Zusatzhinweis beschriftet und ausgeblendet",
      /ausgeblendet/.test(anomText) && /Zusatzhinweis, kein Urteil/.test(anomText)
      && !/FAIL/.test(anomText),
      anomText.replace(/\s+/g, " ").slice(0, 96));

    /* ── S2c · Der Druck wirkt: aria-pressed und Zustand kippen ────────
       Fehlt der Schalter, faellt diese Pruefung SAUBER durch statt die
       Suite abzubrechen — ein Absturz hier wuerde die folgenden Pruefungen
       verdecken und damit verbergen, wie weit der Schaden reicht. */
    const vorher = anomSchalter()?.getAttribute("aria-pressed") ?? null;
    if (anomSchalter()) {
      await act(async () => {
        anomSchalter().dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
    }
    const nachherAttr = anomSchalter()?.getAttribute("aria-pressed") ?? null;
    const nachherText = anomSchalter()?.textContent || "";
    ok("S2c", "Der Ebenenschalter laesst sich druecken und kippt seinen Zustand",
      vorher === "false" && nachherAttr === "true" && /eingeblendet/.test(nachherText),
      vorher === null ? "kein Schalter vorhanden - nichts zu druecken"
        : `aria-pressed ${vorher} → ${nachherAttr}`);

    /* ── S2d · Das urteilstragende Bild bleibt die Voreinstellung ──────
       Ohne diese Gegenprobe waere die Reparatur eine stille Aenderung der
       Bewertungsanzeige: eine Rohmaske, die sich selbst einblendet. */
    const warmSchalter = schalter().find(b => /Warme Pixel/.test(b.textContent || ""));
    ok("S2d", "Die urteilstragende Ebene war von Anfang an eingeblendet",
      warmSchalter?.getAttribute("aria-pressed") === "true"
      && vorher === "false",
      `warm ${warmSchalter?.getAttribute("aria-pressed")} · farbneutral anfangs ${vorher}`);

    /* ── S2e · "Nicht erkannt" steht als eigener Zustand da ──────────── */
    const leereEintraege = [...behaelter.querySelectorAll("li.layer-empty")];
    ok("S2e", "Leere Masken stehen als \"nicht erkannt\" da, nicht als Schalter",
      leereEintraege.length === 3
      && leereEintraege.every(li => /nicht erkannt/.test(li.textContent || ""))
      && !leereEintraege.some(li => li.querySelector("button")),
      `${leereEintraege.length} leere Ebenen, keine davon zuschaltbar`);

    await act(async () => wurzel.unmount());

    /* ═══ S2f–S2h · Speichern, Neuladen, Protokoll ═══════════════════════
       Der Bildschirm allein genuegt nicht. Der Auftrag verlangt, dass
       Zuordnung, Herkunft und Anzeigebegrenzung NACHVOLLZIEHBAR bleiben —
       und dass ein gespeicherter Bericht sie nicht nach einer spaeteren
       Konfiguration still neu rechnet. Beides entscheidet sich hinter der
       Speichergrenze, nicht davor.                                       */
    const { buildInspectionRecord, SIGNATURE_MEANING } = await vite.ssrLoadModule("/src/inspectionRecord.js");
    const { saveInspection, loadInspections } = await vite.ssrLoadModule("/src/persistence.js");
    const { recordDigest } = await vite.ssrLoadModule("/src/audit.js");
    const { exportInspectionPdf } = await vite.ssrLoadModule("/src/pdfExport.js");
    /* KEINE NEBENWIRKUNG. `exportInspectionPdf` ruft `doc.save()`, und der
       erste Lauf dieser Suite schrieb prompt `VisuClean_insp-ebenen-1.pdf`
       ins Projektverzeichnis — dieselbe Falle, die pdftest.mjs in seinem
       Kopf beschreibt, und `manifest:check` fiel danach mit Exit 1.
       `save` wird deshalb abgefangen; S2j belegt, dass der Abfang greift. */
    const { jsPDF } = await import("jspdf");
    let gespeichertAls = null;
    jsPDF.API.save = function abgefangen(name) { gespeichertAls = name; return this; };
    const { LIFECYCLE_STATE } = await vite.ssrLoadModule("/src/lifecycle.js");
    const akteur = { username: "operator1", role: "Operator", displayName: "Operator 1" };
    const winz = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

    const record = buildInspectionRecord({
      id: "insp-ebenen-1", appVersion: "8.3.0-test", now: "2026-09-16T12:00:00.000Z",
      signedBy: akteur.username, user: akteur,
      eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
      photos: [{
        id: "photo-1", image: winz, annotatedImage: winz, markers: [], markerAssessments: [],
        knownIssueInfo: null,
        captureProfile: captureProfile({
          processedWidth: 480, processedHeight: 640,
          sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
        }),
        /* Genau das, was stripResult in den Datensatz legt. */
        result: { ...ergebnis, lm: merkmale.lm, hints: [], overlayLayers: ebenen.map(e => ({ ...e })) },
      }],
      aggregate: aggregat, originalSystemDecision: deriveSystemDecision(aggregat),
      finalDecision: "FAIL",
      performedBy: { username: "operator1", role: "Operator", at: "2026-09-16T12:00:00.000Z" },
      reauthenticated: true, comment: "Nachreinigung eingeleitet",
      signature: {
        method: "USER_ID_PASSWORD", components: ["userId", "password"],
        meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.FINAL_FAIL],
        signedAt: "2026-09-16T12:00:00.000Z", signedBy: "operator1",
      },
    });
    record.recordHash = await recordDigest(record);
    let speicherFehler = "";
    try { await saveInspection(record, akteur); }
    catch (fehler) { speicherFehler = String(fehler?.message || fehler); }
    const geladen = (await loadInspections()).find(r => r.id === "insp-ebenen-1") || null;
    const geladeneEbenen = geladen?.photos?.[0]?.result?.overlayLayers || [];

    ok("S2f", "Der Ebenenbestand ueberlebt Speichern und Neuladen",
      !speicherFehler && geladeneEbenen.length === ebenen.length
      && geladeneEbenen.find(e => e.id === "anom")?.pixel === 5888
      && geladeneEbenen.find(e => e.id === "anom")?.status === "ZUSATZHINWEIS"
      && geladeneEbenen.find(e => e.id === "warm")?.status === "URTEILSTRAGEND",
      speicherFehler ? `SPEICHERN ABGEWIESEN: ${speicherFehler}`
        : `${geladeneEbenen.length} Ebenen geladen · farbneutral`
          + ` ${geladeneEbenen.find(e => e.id === "anom")?.pixel} px`
          + ` (${geladeneEbenen.find(e => e.id === "anom")?.status})`);

    /* ── S2i · Die ECHTE Uebergabe an den Datensatz ───────────────────
       S2f prueft, dass ein Bestand die Speichergrenze uebersteht — aber
       das Fixture legt ihn von Hand hinein und umgeht damit genau die
       Stelle, die ihn dorthin bringen soll. Beim Sabotieren fiel das auf:
       `stripResult` liess sich ersatzlos entfernen, ohne dass eine
       Gegenprobe rot wurde.

       Hier laeuft deshalb die echte Funktion. Zusaetzlich geprueft: die
       Masken selbst duerfen NICHT mitwandern — sie sind gross, und der
       Datensatz braucht die Zahl mit ihrer Bezugsgroesse, nicht das Feld. */
    const { stripResult } = await vite.ssrLoadModule("/src/App.jsx");
    const roh = {
      ...ergebnis,
      _ov: { w: W, h: H, verdictCodes: codes, ebenen, scratches: [],
        maskWarm: new Uint8Array(4), maskAnom: new Uint8Array(4) },
      metrics: { anomBright: merkmale.anomBright, anomDark: merkmale.anomDark },
    };
    const gestrippt = stripResult(roh);
    ok("S2i", "stripResult traegt den Ebenenbestand in den Datensatz, ohne die Masken",
      Array.isArray(gestrippt?.overlayLayers)
      && gestrippt.overlayLayers.length === ebenen.length
      && gestrippt.overlayLayers.find(e => e.id === "anom")?.pixel === 5888
      && gestrippt.overlayLayers.find(e => e.id === "anom")?.status === "ZUSATZHINWEIS"
      && !("maskWarm" in gestrippt) && !("maskAnom" in gestrippt)
      && !("_ov" in gestrippt),
      Array.isArray(gestrippt?.overlayLayers)
        ? `${gestrippt.overlayLayers.length} Ebenen uebergeben, keine Maske im Datensatz`
        : "KEIN Ebenenbestand im Datensatz - der Weg endet vor der Speicherung");

    /* ── S2g · Das Protokoll nennt die Anzeigebegrenzung ──────────────── */
    let pdfText = "", pdfFehler = "";
    try {
      const doc = exportInspectionPdf(geladen, "de");
      const { inflateSync } = await import("node:zlib");
      const puffer = Buffer.from(doc.output("arraybuffer"));
      const roh = puffer.toString("latin1");
      pdfText = roh;
      const muster = /stream\r?\n/g; let treffer;
      while ((treffer = muster.exec(roh)) !== null) {
        const start = treffer.index + treffer[0].length;
        const ende = roh.indexOf("endstream", start);
        if (ende < 0) continue;
        try { pdfText += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1"); }
        catch { /* unkomprimiert, steht schon im Rohtext */ }
      }
    } catch (fehler) { pdfFehler = String(fehler?.message || fehler); }
    const nenntEbenen = /Anzeigeebenen/.test(pdfText);
    const nenntVerdeckt = /NICHT eingeblendet/.test(pdfText);
    const nenntMenge = /5888 von 76800 px/.test(pdfText);
    const nenntLeer = /nicht erkannt/.test(pdfText);
    /* Die Ebenen duerfen nicht wie ein zweites Urteil aussehen. Geprueft
       wird die Ueberschrift und der Satz, der es ausspricht — NICHT die
       Abwesenheit des Wortes FAIL irgendwo in der Naehe: der PDF-Textstrom
       ist nicht linear, und eine Naeheregel ueber ihn misst nichts. */
    /* ACHTUNG, Falle im PDF-Textstrom: runde Klammern begrenzen dort einen
       String und werden im Inhalt als \\( und \\) maskiert. Ein Muster mit
       nackten Klammern findet die Ueberschrift deshalb NIE — und der Test
       waere still rot aus dem falschen Grund. Die Maskierung wird hier
       ausdruecklich zugelassen. */
    const keinUrteil = /Anzeigeebenen \\?\(Hinweis, kein Urteil\\?\)/.test(pdfText)
      && /erzeugen kein FAIL/.test(pdfText)
      && /Zusatzhinweis, kein Urteil/.test(pdfText);
    if (!keinUrteil && process.env.VISUCLEAN_PDF_DUMP) {
      const stelle = pdfText.indexOf("Anzeigeebenen");
      console.log(JSON.stringify(pdfText.slice(stelle - 40, stelle + 900)));
    }
    ok("S2g", "Das Protokoll nennt berechnet-aber-nicht-eingeblendet mit Bezugsgroesse",
      !pdfFehler && nenntEbenen && nenntVerdeckt && nenntMenge && nenntLeer && keinUrteil,
      pdfFehler ? `PDF-ABSTURZ: ${pdfFehler}`
        : `Abschnitt ${nenntEbenen} · verdeckt ${nenntVerdeckt} · Menge mit Bezug ${nenntMenge}`
          + ` · nicht erkannt ${nenntLeer} · als Hinweis ausgewiesen ${keinUrteil}`);

    /* ── S2h · Der Bericht rechnet NICHT neu ──────────────────────────
       Der gespeicherte Datensatz traegt die abgeleitete Liste, nicht den
       Rohbestand. Selbst wenn man ihm einen widersprechenden Bestand
       unterschiebt, muss das Protokoll bei dem bleiben, was unterschrieben
       wurde — sonst koennte eine spaetere Konfiguration die Aussage eines
       signierten Berichts aendern, ohne dass es jemand bemerkt. */
    const untergeschoben = geladen ? JSON.parse(JSON.stringify(geladen)) : null;
    if (untergeschoben) {
      untergeschoben.photos[0].result.metrics = {
        ...(untergeschoben.photos[0].result.metrics || {}), anomBright: 0, anomDark: 0,
      };
    }
    let pdfZwei = "";
    try {
      if (!untergeschoben) throw new Error("kein geladener Datensatz");
      const doc = exportInspectionPdf(untergeschoben, "de");
      const { inflateSync } = await import("node:zlib");
      const puffer = Buffer.from(doc.output("arraybuffer"));
      const roh = puffer.toString("latin1");
      pdfZwei = roh;
      const muster = /stream\r?\n/g; let treffer;
      while ((treffer = muster.exec(roh)) !== null) {
        const start = treffer.index + treffer[0].length;
        const ende = roh.indexOf("endstream", start);
        if (ende < 0) continue;
        try { pdfZwei += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1"); }
        catch { /* unkomprimiert */ }
      }
    } catch { /* faellt unten durch */ }
    /* ── S2j · Die Suite schreibt nichts ins Projektverzeichnis ────────
       Beim ersten Lauf tat sie genau das: `exportInspectionPdf` ruft
       `doc.save()`, und `VisuClean_insp-ebenen-1.pdf` landete neben den
       Quellen. `manifest:check` faellt danach mit Exit 1, weil `npm run
       verify` das Paket veraendert, das es prueft.

       Geprueft wird BEIDES: dass save ueberhaupt gerufen wurde (sonst
       belegt der Abfang nichts) und dass keine Datei entstanden ist. */
    const { existsSync } = await import("node:fs");
    ok("S2j", "Der Test schreibt keine Datei ins Projektverzeichnis",
      gespeichertAls !== null
      && !existsSync(new URL(`./${gespeichertAls}`, import.meta.url)),
      gespeichertAls === null
        ? "save() wurde gar nicht gerufen — der Abfang belegt nichts"
        : `save() abgefangen (${gespeichertAls}), keine Datei erzeugt`);

    /* ═══ S5 · Der wiedergeoeffnete Pruefbericht ════════════════════════
       Befund der Gegenpruefung an rc.4.38, zutreffend: der Ebenenbestand
       ueberlebt das Speichern (S2f) und steht im PDF (S2g) — aber die
       BILDSCHIRMANSICHT des geladenen Datensatzes zeigte ihn nicht.

       Das ist genau die Fehlerklasse, die dieser Auftrag beseitigen
       sollte: "vor dem Speichern war mehr zu sehen". Die Daten gehen
       nicht verloren, die Ansicht laesst sie nur weg — und fuer den
       Leser des Berichts ist das dasselbe.

       Geprueft wird die ECHTE RecordDetail mit dem GELADENEN Datensatz.  */
    {
      const { RecordDetail } = await vite.ssrLoadModule("/src/App.jsx");
      const berichtWurzel = createRoot(behaelter);
      await act(async () => {
        berichtWurzel.render(React.createElement(RecordDetail, {
          record: geladen, language: "de", onBack: () => {}, t,
        }));
      });
      const berichtText = behaelter.textContent || "";
      const berichtEbenen = behaelter.querySelectorAll(".layer-list li, .report-layers li");
      ok("S5a", "Der wiedergeoeffnete Pruefbericht zeigt die gespeicherten Ebenen",
        /Anzeigeebenen/.test(berichtText)
        && /5888 von 76800 px/.test(berichtText)
        && /23 Bildzonen/.test(berichtText)
        && /NICHT eingeblendet/.test(berichtText)
        && berichtEbenen.length >= 5,
        `Abschnitt ${/Anzeigeebenen/.test(berichtText)}`
        + ` · Menge mit Bezug ${/5888 von 76800 px/.test(berichtText)}`
        + ` · verdeckt benannt ${/NICHT eingeblendet/.test(berichtText)}`
        + ` · ${berichtEbenen.length} Ebenenzeilen`);

      /* ── S5b · Der Bericht rechnet dabei NICHTS nach ────────────────
         Die Liste kommt aus dem signierten Datensatz. Eine nachtraegliche
         Ableitung waere kein Originalbefund — dieselbe Regel, nach der
         ScreeningPanel im Bericht mit herkunft="DATENSATZ" arbeitet. */
      const ohneEbenen = JSON.parse(JSON.stringify(geladen));
      delete ohneEbenen.photos[0].result.overlayLayers;
      const leerWurzel = createRoot(behaelter);
      await act(async () => {
        leerWurzel.render(React.createElement(RecordDetail, {
          record: ohneEbenen, language: "de", onBack: () => {}, t,
        }));
      });
      const leerText = behaelter.textContent || "";
      ok("S5b", "Ohne gespeicherte Ebenen erfindet der Bericht keine",
        !/5888 von 76800 px/.test(leerText) && !/23 Bildzonen/.test(leerText),
        /5888/.test(leerText)
          ? "DER BERICHT RECHNET NACH - das waere kein Originalbefund"
          : "keine Ebenen ohne gespeicherte Ebenen");
      await act(async () => leerWurzel.unmount());
    }

    /* ═══ S6 · Wischtests im ALTFORMAT ══════════════════════════════════
       Zweiter Befund der Gegenpruefung, ebenfalls zutreffend und in der
       Wirkung schlimmer: ein vorhandener Wischtest ohne das neue Feld
       `comparison` bekam die Aussage "Kein Vergleich moeglich: die
       Vorher-/Nachher-Zuordnung fehlt". Die Zuordnung fehlte nicht — die
       Fotos und die damaligen Werte stehen im Datensatz. Nur die
       getrennte Auswertung gab es damals nicht.

       Ein signierter Bericht, der ueber seine eigenen Daten etwas
       Falsches sagt, ist schlimmer als einer, der weniger sagt.         */
    {
      const { RecordDetail } = await vite.ssrLoadModule("/src/App.jsx");
      const altDatensatz = JSON.parse(JSON.stringify(geladen));
      altDatensatz.swabTest = {
        performedAt: "2026-09-01T08:00:00.000Z",
        beforeScore: 95, afterScore: 35, interpretation: "RESIDUE_POSSIBLE",
        photos: [0, 1].map(i => ({
          id: `alt-swab-${i}`, image: winz, annotatedImage: winz,
          markers: [], markerAssessments: [],
          result: { ...ergebnis, overlayLayers: undefined },
        })),
      };
      /* Der Datensatz, wie er vor dem Rendern aussieht — Wort fuer Wort. */
      const vorher = JSON.stringify(altDatensatz.swabTest);

      const altWurzel = createRoot(behaelter);
      await act(async () => {
        altWurzel.render(React.createElement(RecordDetail, {
          record: altDatensatz, language: "de", onBack: () => {}, t,
        }));
      });
      const altText = behaelter.textContent || "";
      await act(async () => altWurzel.unmount());

      ok("S6a", "Ein Alt-Wischtest behaelt seine historischen Werte und Aussage",
        /95/.test(altText) && /35/.test(altText)
        && /RESIDUE_POSSIBLE|Rueckstand|Rückstand/.test(altText)
        && !/Zuordnung fehlt/.test(altText),
        /Zuordnung fehlt/.test(altText)
          ? "FALSCHAUSSAGE: behauptet eine fehlende Zuordnung, die vorliegt"
          : `Werte ${/95/.test(altText) && /35/.test(altText)} im Bericht`);

      ok("S6b", "Der Alt-Wischtest ist als Summenvergleich gekennzeichnet",
        /Summenvergleich/.test(altText)
        && /keine getrennte Kriterienauswertung/.test(altText),
        /Summenvergleich/.test(altText)
          ? "als damaliger Summenvergleich ausgewiesen"
          : "NICHT gekennzeichnet - sieht aus wie die neue getrennte Auswertung");

      ok("S6c", "Die Anzeige veraendert den signierten Datensatz nicht",
        JSON.stringify(altDatensatz.swabTest) === vorher,
        JSON.stringify(altDatensatz.swabTest) === vorher
          ? "Datensatz unveraendert"
          : "DER DATENSATZ WURDE BEIM ANZEIGEN VERAENDERT");

      /* ── S6d · Das Protokoll sagt dasselbe ──────────────────────────
         Ein Bildschirm, der es richtig macht, und ein PDF, das es falsch
         macht, sind zwei Aussagen zu einem Datensatz. */
      let altPdf = "";
      try {
        const doc = exportInspectionPdf(altDatensatz, "de");
        const { inflateSync } = await import("node:zlib");
        const puffer = Buffer.from(doc.output("arraybuffer"));
        const roh = puffer.toString("latin1");
        altPdf = roh;
        const muster = /stream\r?\n/g; let treffer;
        while ((treffer = muster.exec(roh)) !== null) {
          const start = treffer.index + treffer[0].length;
          const ende = roh.indexOf("endstream", start);
          if (ende < 0) continue;
          try { altPdf += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1"); }
          catch { /* unkomprimiert */ }
        }
      } catch { /* faellt unten durch */ }
      ok("S6d", "Das Protokoll gibt den Alt-Wischtest ebenso wieder",
        /Summenvergleich/.test(altPdf) && /95/.test(altPdf) && /35/.test(altPdf)
        && !/Zuordnung fehlt/.test(altPdf),
        /Summenvergleich/.test(altPdf)
          ? "gekennzeichnet, mit den damaligen Werten"
          : "PDF weicht vom Bildschirm ab");

      /* ── S6e · Der GEGENFALL: ein neuer Wischtest bleibt getrennt ───
         Eine Altformat-Erkennung, die auch neue Datensaetze einfaengt,
         waere ein Rueckschritt und wuerde die Reparatur aus rc.4.38
         wieder aufheben. */
      const neuDatensatz = JSON.parse(JSON.stringify(geladen));
      neuDatensatz.swabTest = {
        performedAt: "2026-09-16T10:00:00.000Z",
        photos: altDatensatz.swabTest.photos,
        comparison: {
          aussage: "SCHMUTZBEFUND_UNVERAENDERT",
          kriterien: {
            dry: { kriterium: "dry", vorher: 60, nachher: 0, differenz: -60, richtung: "GESUNKEN" },
            clean: { kriterium: "clean", vorher: 35, nachher: 35, differenz: 0, richtung: "GLEICH" },
            intact: { kriterium: "intact", vorher: 0, nachher: 0, differenz: 0, richtung: "GLEICH" },
          },
          einschraenkungen: ["AUSSCHNITT_NICHT_BELEGT", "LICHT_NICHT_BELEGT"],
        },
      };
      const neuWurzel = createRoot(behaelter);
      await act(async () => {
        neuWurzel.render(React.createElement(RecordDetail, {
          record: neuDatensatz, language: "de", onBack: () => {}, t,
        }));
      });
      const neuText = behaelter.textContent || "";
      await act(async () => neuWurzel.unmount());
      ok("S6e", "Ein neuer Wischtest bleibt bei der getrennten Auswertung",
        /Sauberkeitsbefund ist unveraendert/.test(neuText)
        && !/Summenvergleich/.test(neuText)
        && /Trocken/.test(neuText) && /60/.test(neuText),
        /Summenvergleich/.test(neuText)
          ? "RUECKSCHRITT: neuer Datensatz als Altformat behandelt"
          : "getrennte Kriterienauswertung unveraendert");
    }

    ok("S2h", "Ein signierter Bericht wird nicht aus geaenderten Merkmalen neu abgeleitet",
      /5888 von 76800 px/.test(pdfZwei) && /23 Bildzonen/.test(pdfZwei),
      /5888 von 76800 px/.test(pdfZwei)
        ? "Protokoll haelt an der unterschriebenen Ableitung fest"
        : "DER BERICHT HAT SICH GEAENDERT - die Ableitung haengt an spaeteren Werten");
  } finally { await vite.close(); }
}

/* ═══ S3 · Wischvergleich ══════════════════════════════════════════════
   Bis rc.4.37:
     score = dry.severity + clean.severity + intact.severity
     beforeScore > afterScore  →  "Rueckstand moeglich"

   Drei verschiedene Ursachen in einer Zahl. Die fuenf Pflichtfaelle des
   Auftrags pruefen genau das.                                           */
{
  const { WISCH_AUSSAGE, WISCH_RICHTUNG, WISCH_EINSCHRAENKUNG,
    vergleicheWischtest, wischGibtFrei, wischText, wischKriteriumText,
    wischEinschraenkungsTexte } = await import("./src/swabComparison.js");

  const u = (code, severity, pass = severity === 0) => ({ code, severity, pass });
  /* Die alte Regel, nachgebaut — sie ist der Massstab, gegen den gemessen
     wird. Ohne sie waere nicht belegbar, dass sich etwas geaendert hat. */
  const alteSumme = e => ["dry", "clean", "intact"]
    .reduce((s, k) => s + (e?.[k]?.severity || 0), 0);
  const alteAussage = (v, n) => (alteSumme(v) > alteSumme(n)
    ? "RESIDUE_POSSIBLE" : "STRUCTURAL_FINDING_POSSIBLE");

  /* ── Fall 1 · Nur die Feuchtigkeit sinkt, der Schmutzwert bleibt ──── */
  {
    const vorher = { dry: u("MOISTURE_SUSPECT", 60), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) };
    const nachher = { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) };
    const v = vergleicheWischtest(vorher, nachher);
    ok("S3-1", "Nur sinkende Feuchtigkeit ergibt KEINE Schmutzabnahme",
      v.aussage === WISCH_AUSSAGE.SCHMUTZBEFUND_UNVERAENDERT
      && v.kriterien.dry.richtung === WISCH_RICHTUNG.GESUNKEN
      && v.kriterien.clean.richtung === WISCH_RICHTUNG.GLEICH
      && alteAussage(vorher, nachher) === "RESIDUE_POSSIBLE",
      `neu ${v.aussage} · alte Summenregel sagte ${alteAussage(vorher, nachher)}`
      + ` (${alteSumme(vorher)} → ${alteSumme(nachher)})`);
  }

  /* ── Fall 2 · Nur der Kratzerwert aendert sich ─────────────────────
     Ein Kratzerwert ist keine Reinigungswirkung. Er aendert sich schon
     bei anderem Streiflicht. */
  {
    const vorher = { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("SCRATCH_SUSPECT", 70) };
    const nachher = { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("SCRATCH_SUSPECT", 30) };
    const v = vergleicheWischtest(vorher, nachher);
    ok("S3-2", "Ein geaenderter Kratzerwert wird nicht als Reinigungswirkung ausgegeben",
      v.aussage === WISCH_AUSSAGE.SCHMUTZBEFUND_UNVERAENDERT
      && v.kriterien.intact.richtung === WISCH_RICHTUNG.GESUNKEN
      && v.kriterien.clean.differenz === 0
      && !/Rueckstand|residue|Reinigung/i.test(wischText(v, "de"))
      && alteAussage(vorher, nachher) === "RESIDUE_POSSIBLE",
      `neu ${v.aussage} · Intakt ${v.kriterien.intact.vorher} → ${v.kriterien.intact.nachher}`
      + ` · alte Summenregel sagte ${alteAussage(vorher, nachher)}`);
  }

  /* ── Fall 3 · Der Schmutzbefund sinkt ──────────────────────────────
     Beschrieben wird die beobachtete Veraenderung. KEINE Stoffidentitaet,
     KEINE sichere Entfernung. */
  {
    const vorher = { dry: u("PASS", 0), clean: u("ORGANIC_RESIDUE", 80), intact: u("PASS", 0) };
    const nachher = { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 25), intact: u("PASS", 0) };
    const v = vergleicheWischtest(vorher, nachher);
    const text = wischText(v, "de");
    ok("S3-3", "Sinkender Schmutzbefund wird beschrieben, nicht gedeutet",
      v.aussage === WISCH_AUSSAGE.SCHMUTZBEFUND_GERINGER
      && /kein Beleg fuer die Art des Stoffes/.test(text)
      && /nicht.*vollstaendig entfernt|kein Beleg, dass er vollstaendig entfernt/.test(text)
      && !/organisch|Protein|Fett|Produktrueckstand/i.test(text)
      && v.grantsRelease === false && wischGibtFrei() === false,
      `${v.aussage} · ${text.slice(0, 84)}…`);
  }

  /* ── Fall 4 · Der Schmutzbefund bleibt gleich oder steigt ──────────── */
  {
    const gleich = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) },
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) });
    const hoeher = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) },
      { dry: u("PASS", 0), clean: u("ORGANIC_RESIDUE", 80), intact: u("PASS", 0) });
    ok("S3-4", "Gleichbleibender und steigender Schmutzbefund sind unterscheidbar",
      gleich.aussage === WISCH_AUSSAGE.SCHMUTZBEFUND_UNVERAENDERT
      && hoeher.aussage === WISCH_AUSSAGE.SCHMUTZBEFUND_GROESSER
      && /Ursache offen/.test(wischText(hoeher, "de"))
      && gleich.grantsRelease === false && hoeher.grantsRelease === false,
      `gleich ${gleich.aussage} · hoeher ${hoeher.aussage}`);
  }

  /* ── Fall 5 · Zuordnung fehlt oder ist unvollstaendig ───────────────
     Dann gibt es nichts zu vergleichen — und das ist die Aussage, nicht
     ein stillschweigendes "keine Abnahme". */
  {
    const fehlt = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) }, null);
    const halb = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) },
      { dry: u("PASS", 0), intact: u("PASS", 0) });
    ok("S3-5", "Fehlende oder unvollstaendige Zuordnung ergibt keinen Vergleich",
      fehlt.aussage === WISCH_AUSSAGE.NICHT_VERGLEICHBAR
      && halb.aussage === WISCH_AUSSAGE.NICHT_VERGLEICHBAR
      && fehlt.einschraenkungen.includes(WISCH_EINSCHRAENKUNG.KEINE_ZUORDNUNG)
      && halb.einschraenkungen.includes(WISCH_EINSCHRAENKUNG.UNVOLLSTAENDIGE_AUFNAHME)
      && halb.kriterien.clean.differenz === null,
      `fehlt ${fehlt.aussage} (${fehlt.einschraenkungen.join(", ")})`
      + ` · halb ${halb.aussage} (${halb.einschraenkungen.join(", ")})`);
  }

  /* ── S3-6 · Vergleichbarkeit wird nicht behauptet ──────────────────
       "Nicht festgestellt" ist nicht "festgestellt gleich". Voreinstellung
       ist deshalb: nicht belegt. */
  {
    const ohne = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("ORGANIC_RESIDUE", 80), intact: u("PASS", 0) },
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 25), intact: u("PASS", 0) });
    const mit = vergleicheWischtest(
      { dry: u("PASS", 0), clean: u("ORGANIC_RESIDUE", 80), intact: u("PASS", 0) },
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 25), intact: u("PASS", 0) },
      { ausschnittBelegt: true, lichtBelegt: true });
    const texte = wischEinschraenkungsTexte(ohne, "de");
    ok("S3-6", "Unbelegte Vergleichbarkeit wird ausdruecklich genannt",
      ohne.einschraenkungen.includes(WISCH_EINSCHRAENKUNG.AUSSCHNITT_NICHT_BELEGT)
      && ohne.einschraenkungen.includes(WISCH_EINSCHRAENKUNG.LICHT_NICHT_BELEGT)
      && mit.einschraenkungen.length === 0
      && texte.some(t => /nicht festgestellt/.test(t)),
      `ohne Beleg: ${ohne.einschraenkungen.join(", ")} · mit Beleg: ${mit.einschraenkungen.length}`);
  }

  /* ── S3-7 · Die Summe ist weg und entsteht nicht nebenbei ───────────
     Der Vergleich darf keine Zahl anbieten, die die drei Kriterien wieder
     zusammenwirft — sonst baut sie jemand in der Anzeige zurueck. */
  {
    const v = vergleicheWischtest(
      { dry: u("MOISTURE_SUSPECT", 60), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) },
      { dry: u("PASS", 0), clean: u("LOCAL_RESIDUE", 35), intact: u("PASS", 0) });
    const flach = JSON.stringify(v);
    const zeilen = Object.values(v.kriterien).map(e => wischKriteriumText(e, "de"));
    ok("S3-7", "Der Vergleich bietet keine Summe an und nennt den Index als solchen",
      !/beforeScore|afterScore|summe|score/i.test(flach)
      && !("gesamt" in v) && !("score" in v)
      && zeilen.every(z => /Befundstaerke-Index, algorithmisch, keine Messgroesse/.test(z)),
      zeilen[0]);
  }
}

console.log("");
const durch = checks.filter(c => !c.bestanden);
console.log(`Bestanden: ${checks.length - durch.length} / ${checks.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(c => c.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
