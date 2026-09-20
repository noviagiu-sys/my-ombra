/* ─── VisuClean · Prüffläche und Hintergrundunabhängigkeit ─────────────────
   Aufruf: node pruefflaechetest.mjs

   Diese Suite gehört zur Nacharbeit nach der Gegenprüfung an rc.4.39.
   Zwei Befunde, beide am tatsächlichen Verhalten reproduziert:

   R1  Die Kameravorschau erzwingt ein 4:3-Fenster mit object-fit: cover,
       während `shoot()` das vollständige Kamerabild speichert. Nach der
       Aufnahme erscheinen Bereiche, die beim Fotografieren nicht zu sehen
       waren.

   R3  Der Analyse-Kern bekam immer das ganze Foto. Die Grauwelt-Farb-
       korrektur bildet ihre Faktoren aus den Mittelwerten des GANZEN
       Bildes — der Hintergrund entscheidet deshalb mit darüber, wie die
       UNVERÄNDERTE Oberfläche in der Bildmitte bewertet wird.

   WAS DIESE SUITE NICHT BELEGT: dass die App Schmutz zuverlässig findet.
   Sie belegt, dass der Hintergrund das Urteil nicht mehr verschiebt. Das
   ist die Vorbedingung dafür, Erkennungsleistung überhaupt zu messen —
   nicht die Leistung selbst.                                            */

import { readFileSync } from "node:fs";
import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";
import { FLAECHE_MIN_PIXEL, FLAECHE_QUELLE, FLAECHE_VORGABE, flaecheAusreichend,
  flaecheEintrag, geltungstext, markerAufFlaeche, markerAufteilen,
  markerInFlaeche, normalisiereFlaeche, pixelRechteck } from "./src/inspectionArea.js";

const checks = [];
function ok(id, name, bestanden, info = "") {
  checks.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · Prüffläche und Hintergrundunabhängigkeit\n");

/* ── Der Prüfaufbau ─────────────────────────────────────────────────────
   Eine IDENTISCHE graue Fläche in der Bildmitte, drumherum wechselnder
   Hintergrund. Die Mitte wird Pixel für Pixel nie angefasst; was sich
   ändert, ist ausschliesslich das, was sie umgibt.

   Die Prüffläche deckt genau die graue Mitte ab. Nach dem Zuschnitt darf
   der Hintergrund rechnerisch nicht mehr vorkommen.                     */
const W = 320, H = 240;
const MX0 = 80, MY0 = 60, MX1 = 240, MY1 = 180;           // 160x120 = 19200 px
const MITTE = Object.freeze({
  x: MX0 / W, y: MY0 / H, w: (MX1 - MX0) / W, h: (MY1 - MY0) / H,
});

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Die Mitte traegt eine geseedete Koernung, damit sie nicht aus exakt
   gleichen Pixeln besteht — eine vollkommen glatte Flaeche waere ein
   unrealistisch guenstiger Fall fuer Textur- und Kantenmerkmale. Der
   Seed ist fest, die Mitte also in JEDEM Fall bitgleich. */
function bild(hintergrund) {
  const r = mulberry32(4711);
  const d = new Uint8ClampedArray(W * H * 4);
  const mitteWerte = [];
  for (let i = 0; i < (MX1 - MX0) * (MY1 - MY0); i++) {
    mitteWerte.push(150 + Math.round((r() - 0.5) * 6));
  }
  let k = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const drin = x >= MX0 && x < MX1 && y >= MY0 && y < MY1;
    let px;
    if (drin) { const g = mitteWerte[k++]; px = [g, g, g]; }
    else px = hintergrund;
    d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = 255;
  }
  return d;
}

const HINTERGRUENDE = [
  ["Neutralgrau", [150, 150, 150]],
  ["Braun/orange", [170, 110, 60]],
  ["Blau", [60, 90, 180]],
  ["Weiss", [245, 245, 245]],
  ["Schwarz", [12, 12, 12]],
];

/* Der Zuschnitt — genau das, was analyzeImage am Canvas macht, hier in
   reinen Pixeln nachgebaut. Kein Fuellen, kein Maskieren: die Pixel
   ausserhalb existieren danach nicht mehr. */
function zuschneiden(daten, breite, hoehe, flaeche) {
  const r = pixelRechteck(flaeche, breite, hoehe);
  const ziel = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const q = ((y + r.y) * breite + (x + r.x)) * 4;
      const z = (y * r.w + x) * 4;
      ziel[z] = daten[q]; ziel[z + 1] = daten[q + 1];
      ziel[z + 2] = daten[q + 2]; ziel[z + 3] = 255;
    }
  }
  return { daten: ziel, w: r.w, h: r.h };
}

/* ═══ R3a · DER BEFUND, am ganzen Bild ══════════════════════════════════
   Ohne Zuschnitt verschiebt der Hintergrund das Urteil ueber die
   unveraenderte Mitte. Das ist die Gegenprobe, die rot sein MUSS, solange
   ohne Begrenzung gerechnet wird — sie belegt den Befund und bleibt
   danach als Beleg stehen.                                             */
const ohneZuschnitt = HINTERGRUENDE.map(([name, hg]) => {
  const f = computeFeatures(bild(hg), W, H);
  const v = buildVerdicts(f);
  let warmMitte = 0;
  for (let y = MY0; y < MY1; y++) for (let x = MX0; x < MX1; x++) {
    if (f.masks.maskWarm[y * W + x]) warmMitte++;
  }
  return { name, code: v.clean.code, warmMitte, wf: f.wf };
});
const urteileOhne = new Set(ohneZuschnitt.map(e => e.code));
ok("R3a", "Ohne Begrenzung entscheidet der Hintergrund ueber die unveraenderte Mitte",
  urteileOhne.size > 1,
  ohneZuschnitt.map(e => `${e.name} ${e.code} (warm in der Mitte ${e.warmMitte}/19200)`).join(" · "));

/* ═══ R3b · MIT Zuschnitt: identische Merkmale ══════════════════════════
   Nicht "aehnlich" und nicht "gerundet gleich" — BITGLEICH. Der Zuschnitt
   liefert in jedem Fall dieselben Pixel, und ein deterministischer Kern
   muss daraus dieselben Zahlen erzeugen. Alles andere waere ein Leck.  */
const mitZuschnitt = HINTERGRUENDE.map(([name, hg]) => {
  const z = zuschneiden(bild(hg), W, H, MITTE);
  const f = computeFeatures(z.daten, z.w, z.h);
  const v = buildVerdicts(f);
  return { name, f, v, w: z.w, h: z.h };
});
const merkmalsSchluessel = ["lm", "bfr", "dfr", "vdfr", "wf", "wfRaw", "cv",
  "tvFlat", "gradMean", "edgeFrac", "warmBlocks", "warmBlockFrac",
  "anomBright", "anomDark", "anomBlockFrac"];
const abdruck = e => JSON.stringify(merkmalsSchluessel.map(k => e.f[k]));
const ersterAbdruck = abdruck(mitZuschnitt[0]);
const alleGleich = mitZuschnitt.every(e => abdruck(e) === ersterAbdruck);
ok("R3b", "Mit Zuschnitt sind die Merkmale bitgleich, egal welcher Hintergrund",
  alleGleich,
  alleGleich
    ? `${mitZuschnitt.length} Hintergruende, ein Merkmalsabdruck`
      + ` · wf ${mitZuschnitt[0].f.wf.toFixed(6)} · lm ${mitZuschnitt[0].f.lm.toFixed(6)}`
    : mitZuschnitt.map(e => `${e.name} wf ${e.f.wf.toFixed(6)}`).join(" · "));

/* ═══ R3c · MIT Zuschnitt: identische Urteile ═══════════════════════════ */
const urteilsAbdruck = e => `${e.v.dry.code}|${e.v.clean.code}|${e.v.intact.code}`;
const einUrteil = new Set(mitZuschnitt.map(urteilsAbdruck));
ok("R3c", "Mit Zuschnitt ist auch das Urteil in jedem Hintergrund dasselbe",
  einUrteil.size === 1,
  [...einUrteil].join("  /  ")
  + ` · ${mitZuschnitt.length} Hintergruende`);

/* ═══ R3d · Kein warmes Pixel mehr allein aus dem Hintergrund ═══════════
   Der krasseste Einzelbefund war der blaue Hintergrund: ALLE 19200
   unveraenderten grauen Pixel galten als warm. Hier wird genau diese Zahl
   nachgehalten.                                                         */
const blauOhne = ohneZuschnitt.find(e => e.name === "Blau");
const blauMit = mitZuschnitt.find(e => e.name === "Blau");
let warmMitZuschnitt = 0;
for (let i = 0; i < blauMit.f.masks.maskWarm.length; i++) {
  if (blauMit.f.masks.maskWarm[i]) warmMitZuschnitt++;
}
ok("R3d", "Der blaue Hintergrund faerbt die graue Mitte nicht mehr warm",
  blauOhne.warmMitte > 0 && warmMitZuschnitt === 0,
  `ohne Zuschnitt ${blauOhne.warmMitte}/19200 warm · mit Zuschnitt ${warmMitZuschnitt}/`
  + `${blauMit.w * blauMit.h} warm`);

/* ═══ R3e · Der Zuschnitt ist ein Ausschluss, kein Ersetzen ═════════════
   Aussenbereiche schwarz oder mit einer Durchschnittsfarbe zu fuellen
   waere KEINE saubere Loesung: die gefuellte Flaeche geht in dieselben
   Bildmittel ein und verschiebt die Farbkorrektur genauso, nur
   unauffaelliger. Diese Gegenprobe misst genau das.                     */
function fuellen(daten, breite, hoehe, flaeche, farbe) {
  const r = pixelRechteck(flaeche, breite, hoehe);
  const ziel = new Uint8ClampedArray(daten);
  for (let y = 0; y < hoehe; y++) for (let x = 0; x < breite; x++) {
    const drin = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    if (drin) continue;
    const i = (y * breite + x) * 4;
    ziel[i] = farbe[0]; ziel[i + 1] = farbe[1]; ziel[i + 2] = farbe[2]; ziel[i + 3] = 255;
  }
  return ziel;
}
const gefuellt = farbe => HINTERGRUENDE.map(([name, hg]) => {
  const f = computeFeatures(fuellen(bild(hg), W, H, MITTE, farbe), W, H);
  return { name, wf: f.wf, code: buildVerdicts(f).clean.code };
});
const schwarz = gefuellt([0, 0, 0]);
/* Die Durchschnittsfarbe der Mitte selbst — der wohlmeinendste Fuellwert,
   den man waehlen koennte. */
const mittelGefuellt = gefuellt([150, 150, 150]);
const zuschnittCode = mitZuschnitt[0].v.clean.code;

/* ERSTER EIGENER FEHLGRIFF, hier festgehalten: die erste Fassung dieser
   Gegenprobe fragte nur, ob das Fuellen zu EINEM einheitlichen Urteil
   fuehrt — und das tut es. Sie war gruen, ohne die beiden Wege ueberhaupt
   zu unterscheiden, und belegte damit nichts.

   Der Unterschied liegt woanders: die gefuellte Flaeche geht in dieselben
   Bildmittel ein. Sie macht das Ergebnis stabil und zugleich FALSCH — aus
   einer sauberen grauen Flaeche wird ein Befund, den das Fuellen selbst
   erzeugt hat. Genau das wird jetzt gemessen. */
const schwarzCode = new Set(schwarz.map(e => e.code));
const mittelCode = new Set(mittelGefuellt.map(e => e.code));
const fuellenErfindet = schwarzCode.size === 1 && !schwarzCode.has(zuschnittCode);
ok("R3e", "Fuellen erzeugt ein stabiles, aber falsches Urteil - der Zuschnitt nicht",
  zuschnittCode === "PASS" && fuellenErfindet,
  `Zuschnitt → ${zuschnittCode}`
  + ` · schwarz gefuellt → ${[...schwarzCode].join("/")} (erfundener Befund)`
  + ` · mit der Mittelfarbe gefuellt → ${[...mittelCode].join("/")}`);

/* ═══ R2 · Die Geometrie der Prüffläche ════════════════════════════════ */
{
  const geklemmt = normalisiereFlaeche({ x: -0.5, y: 0.9, w: 2, h: 0.01 });
  const rechteck = pixelRechteck(MITTE, W, H);
  ok("R2a", "Eine Prueffläche bleibt im Bild und behaelt eine Mindestkante",
    geklemmt.x >= 0 && geklemmt.y >= 0
    && geklemmt.x + geklemmt.w <= 1 + 1e-9 && geklemmt.y + geklemmt.h <= 1 + 1e-9
    && geklemmt.w <= 1 && geklemmt.h >= 0.20
    && rechteck.x === MX0 && rechteck.y === MY0
    && rechteck.w === MX1 - MX0 && rechteck.h === MY1 - MY0,
    `geklemmt ${JSON.stringify(geklemmt)} · Pixelrechteck ${JSON.stringify(rechteck)}`);

  ok("R2b", "Ein zu kleiner Ausschnitt wird als zu klein gemeldet, nicht gerechnet",
    flaecheAusreichend(MITTE, W, H) === true
    && flaecheAusreichend({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 200, 200) === false,
    `Mitte ausreichend ${flaecheAusreichend(MITTE, W, H)}`
    + ` · 40x40 px ausreichend ${flaecheAusreichend({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 200, 200)}`
    + ` (Mindestkante ${FLAECHE_MIN_PIXEL} px)`);
}

/* ═══ R2c · Marker wandern mit — oder werden als draussen ausgewiesen ═══
   Nach dem Zuschnitt beziehen sich Masken und Overlay auf den Ausschnitt.
   Ein Marker in FOTO-Koordinaten zeigte sonst auf eine andere physische
   Stelle. Und ein Marker ausserhalb darf NICHT an den Rand geklemmt
   werden — das waere eine stille Falschangabe.                          */
{
  /* Genau die Bildmitte: in Fotoanteilen 0,5/0,5, im Zuschnitt ebenfalls
     die Mitte, weil die Prueffläche selbst zentriert ist. */
  const mittig = markerAufFlaeche({ id: "M01", x: 0.5, y: 0.5 }, MITTE);
  /* Die linke obere Ecke der Prueffläche: im Zuschnitt 0/0. */
  const ecke = markerAufFlaeche({ id: "M02", x: MITTE.x, y: MITTE.y }, MITTE);
  /* Weit im Hintergrund: keine Umrechnung. */
  const draussen = markerAufFlaeche({ id: "M03", x: 0.02, y: 0.02 }, MITTE);
  const aufgeteilt = markerAufteilen([
    { id: "M01", x: 0.5, y: 0.5 }, { id: "M03", x: 0.02, y: 0.02 },
  ], MITTE);
  ok("R2c", "Marker werden umgerechnet; ausserhalb liegende nicht an den Rand geklemmt",
    Math.abs(mittig.x - 0.5) < 1e-9 && Math.abs(mittig.y - 0.5) < 1e-9
    && Math.abs(ecke.x) < 1e-9 && Math.abs(ecke.y) < 1e-9
    && draussen === null
    && markerInFlaeche({ x: 0.5, y: 0.5 }, MITTE) === true
    && markerInFlaeche({ x: 0.02, y: 0.02 }, MITTE) === false
    && aufgeteilt.drin.length === 1 && aufgeteilt.draussen.length === 1
    && aufgeteilt.draussen[0].id === "M03",
    `Mitte → ${mittig.x.toFixed(3)}/${mittig.y.toFixed(3)}`
    + ` · Ecke → ${ecke.x.toFixed(3)}/${ecke.y.toFixed(3)}`
    + ` · ausserhalb → ${draussen}`
    + ` · aufgeteilt ${aufgeteilt.drin.length} drin / ${aufgeteilt.draussen.length} draussen`);
}

/* ═══ R4a · Der Geltungsbereich steht als Satz zur Verfügung ═══════════ */
{
  const eintrag = flaecheEintrag(MITTE, FLAECHE_QUELLE.GEWAEHLT, 1920, 1440, 160, 120);
  const text = geltungstext(eintrag, "de");
  const ohne = geltungstext(null, "de");
  ok("R4a", "Der Geltungsbereich nennt Ausschnitt, Herkunft und seine Grenze",
    /160x120 px/.test(text) && /gewaehlt/.test(text)
    && /nicht automatisch fuer das ganze Teil/.test(text)
    && /auch nicht in die Farbkorrektur/.test(text)
    && /unklar, welcher Bildbereich/.test(ohne)
    && eintrag.sourceWidth === 1920 && eintrag.sourceHeight === 1440,
    text.slice(0, 96) + "…");

  ok("R4b", "Eine unangetastete Voreinstellung wird als solche ausgewiesen",
    /Voreinstellung, nicht angepasst/.test(
      geltungstext(flaecheEintrag(FLAECHE_VORGABE, FLAECHE_QUELLE.VORGABE, 1, 1, 1, 1), "de"))
    && /ausdruecklich das ganze Bild/.test(
      geltungstext(flaecheEintrag({ x: 0, y: 0, w: 1, h: 1 },
        FLAECHE_QUELLE.GANZES_BILD, 1, 1, 1, 1), "de")),
    "Vorgabe, Auswahl und ganzes Bild sind unterscheidbar");
}

/* ═══ R1 · Vorschau und Aufnahme ════════════════════════════════════════
   Quelltextpruefung, und sie ist hier die richtige Methode: jsdom hat
   keine Layout-Engine, `object-fit` laesst sich ohne echten Browser nicht
   messen. Geprueft wird deshalb die geltende REGEL, nicht ihre Wirkung —
   und das steht ausdruecklich dabei. Die Messung am Geraet bleibt offen. */
{
  const css = readFileSync(new URL("./src/styles.css", import.meta.url), "utf8");
  const kameraRegeln = css.split("\n")
    .filter(z => /\.camera-panel\s+video/.test(z));
  const text = kameraRegeln.join(" ");
  const keinCover = !/object-fit:\s*cover/.test(text);
  const contain = /object-fit:\s*contain/.test(text);
  const keinFestes43 = !/aspect-ratio:\s*4\s*\/\s*3/.test(text);
  ok("R1a", "Die Kameravorschau schneidet das Bild nicht zu",
    kameraRegeln.length > 0 && keinCover && contain && keinFestes43,
    kameraRegeln.length === 0
      ? "keine Regel fuer .camera-panel video gefunden - der Test belegt nichts"
      : `contain ${contain} · kein cover ${keinCover} · kein festes 4:3 ${keinFestes43}`);

  /* Der Scanner ist ein anderer Fall: dort geht es ums Einrahmen eines
     Codes, nicht um ein Bild, das gespeichert wird. Er darf weiter
     zuschneiden — und diese Gegenprobe haelt fest, dass die Aenderung
     ihn NICHT mitgenommen hat. */
  const scannerRegeln = css.split("\n").filter(z => /\.scanner-view\s+video/.test(z));
  ok("R1b", "Der QR-Scanner bleibt unveraendert",
    scannerRegeln.length > 0 && /object-fit:\s*cover/.test(scannerRegeln.join(" ")),
    scannerRegeln.length ? "Scanner nutzt weiterhin cover" : "keine Scannerregel gefunden");
}

/* ═══ R4c–R4e · Der ganze Weg ═══════════════════════════════════════════
   Die Gegenproben oben rechnen auf Pixeln. Das genügt nicht: eine richtige
   Rechnung, die niemand verdrahtet, ändert an der App nichts. Hier läuft
   der ECHTE Weg — stripResult in den Datensatz, durch die Persistenz,
   zurück, und ins Protokoll.                                            */
{
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { stripResult, analyzeImage } = await vite.ssrLoadModule("/src/App.jsx");

    /* ── R3f · analyzeImage schneidet WIRKLICH zu ──────────────────────
       R3b und R3c belegen das Prinzip an Pixeln. Das genuegt nicht: eine
       richtige Rechnung, die niemand verdrahtet, aendert an der App
       nichts — genau diese Luecke ist in dieser Sitzung schon zweimal
       aufgefallen (S2i, S5a).

       Eine Quelltextsuche waere hier zu wenig. Stattdessen laeuft die
       ECHTE Funktion gegen ein nachgebautes Canvas, das `drawImage` mit
       neun Argumenten tatsaechlich ausfuehrt. Geprueft wird, welches
       Quellrechteck ankommt UND ob die Merkmale, die der Kern dabei
       sieht, denen des direkt zugeschnittenen Bildes entsprechen. */
    const aufrufe = [];
    let letzteDaten = null;
    const machCanvas = () => {
      const c = { width: 0, height: 0 };
      c.getContext = () => ({
        drawImage(quelle, sx, sy, sw, sh, dx, dy, dw, dh) {
          aufrufe.push({ sx, sy, sw, sh, dw, dh });
          /* Echter Zuschnitt mit Nearest-Neighbour — deterministisch und
             ausreichend: die Prueffläche wird hier nicht verkleinert. */
          const ziel = new Uint8ClampedArray(dw * dh * 4);
          for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
            const qx = sx + Math.floor(x * sw / dw);
            const qy = sy + Math.floor(y * sh / dh);
            const q = (qy * quelle.breite + qx) * 4;
            const z = (y * dw + x) * 4;
            ziel[z] = quelle.daten[q]; ziel[z + 1] = quelle.daten[q + 1];
            ziel[z + 2] = quelle.daten[q + 2]; ziel[z + 3] = 255;
          }
          letzteDaten = { data: ziel, width: dw, height: dh };
        },
        getImageData: () => letzteDaten,
      });
      c.toDataURL = () => "data:image/jpeg;base64,ZHVtbXk=";
      return c;
    };
    const altesDocument = globalThis.document;
    const altesImage = globalThis.Image;
    const blau = bild([60, 90, 180]);
    globalThis.document = { createElement: () => machCanvas() };
    globalThis.Image = class {
      constructor() { this.naturalWidth = W; this.naturalHeight = H;
        this.daten = blau; this.breite = W; }
      set src(_wert) { queueMicrotask(() => this.onload && this.onload()); }
    };
    let ergebnis = null, analyseFehler = "";
    try {
      ergebnis = await analyzeImage("data:image/jpeg;base64,ZHVtbXk=", undefined, null,
        MITTE, FLAECHE_QUELLE.GEWAEHLT);
    } catch (fehler) { analyseFehler = String(fehler?.message || fehler); }
    globalThis.document = altesDocument;
    globalThis.Image = altesImage;

    const ersterAufruf = aufrufe[0] || {};
    const rechteck = pixelRechteck(MITTE, W, H);
    const direkt = mitZuschnitt.find(e => e.name === "Blau");
    const gleicheMerkmale = ergebnis
      && Math.abs(ergebnis.metrics.wf - direkt.f.wf) < 1e-12
      && Math.abs(ergebnis.metrics.lm - direkt.f.lm) < 1e-12
      && ergebnis.clean.code === direkt.v.clean.code;
    ok("R3f", "analyzeImage uebergibt das Zuschnittrechteck und rechnet nur darauf",
      !analyseFehler
      && ersterAufruf.sx === rechteck.x && ersterAufruf.sy === rechteck.y
      && ersterAufruf.sw === rechteck.w && ersterAufruf.sh === rechteck.h
      && gleicheMerkmale
      && ergebnis.pruefflaeche?.analysedWidth === rechteck.w,
      analyseFehler ? `ABSTURZ: ${analyseFehler}`
        : `drawImage(sx ${ersterAufruf.sx}, sy ${ersterAufruf.sy},`
          + ` sw ${ersterAufruf.sw}, sh ${ersterAufruf.sh})`
          + ` · erwartet (${rechteck.x}, ${rechteck.y}, ${rechteck.w}, ${rechteck.h})`
          + ` · Merkmale wie beim direkten Zuschnitt ${Boolean(gleicheMerkmale)}`
          + ` · clean ${ergebnis?.clean?.code}`);

    const { exportInspectionPdf } = await vite.ssrLoadModule("/src/pdfExport.js");
    /* KEINE NEBENWIRKUNG. `exportInspectionPdf` ruft `doc.save()`. Diese
       Suite schrieb damit `VisuClean_insp-flaeche.pdf` ins
       Projektverzeichnis — `npm run verify` lief gruen und das
       anschliessende `manifest:check` fiel mit Exit 1, weil der Prueflauf
       das Paket veraendert, das er prueft.

       DRITTES MAL in dieser Sitzung (pdftest P5, schmutztest S2j, hier).
       Deshalb steht die Sperre ab jetzt zusaetzlich in versiontest V12,
       wo sie fuer JEDE Suite gilt statt fuer die, an die gerade jemand
       gedacht hat. */
    const { jsPDF } = await import("jspdf");
    let gespeichertAls = null;
    jsPDF.API.save = function abgefangen(name) { gespeichertAls = name; return this; };

    /* ── R4c · Der Eintrag erreicht den Datensatz ──────────────────────── */
    const eintrag = flaecheEintrag(MITTE, FLAECHE_QUELLE.GEWAEHLT, 1920, 1440, 160, 120);
    const roh = {
      ...mitZuschnitt[0].v, lm: mitZuschnitt[0].f.lm, hints: [],
      pruefflaeche: eintrag,
      _ov: { w: 160, h: 120, verdictCodes: {}, ebenen: [] },
    };
    const gestrippt = stripResult(roh);
    ok("R4c", "Der Geltungsbereich erreicht den Datensatz und traegt seine Zahlen",
      Boolean(gestrippt?.inspectionArea)
      && gestrippt.inspectionArea.analysedWidth === 160
      && gestrippt.inspectionArea.sourceWidth === 1920
      && gestrippt.inspectionArea.quelle === FLAECHE_QUELLE.GEWAEHLT
      && !("pruefflaeche" in gestrippt),
      gestrippt?.inspectionArea
        ? `${gestrippt.inspectionArea.analysedWidth}x${gestrippt.inspectionArea.analysedHeight}`
          + ` aus ${gestrippt.inspectionArea.sourceWidth}x${gestrippt.inspectionArea.sourceHeight}`
          + ` (${gestrippt.inspectionArea.quelle})`
        : "KEIN Geltungsbereich im Datensatz - der Bericht kann ihn nicht nennen");

    /* ── R4d · Das Protokoll nennt ihn ─────────────────────────────────── */
    const { inflateSync } = await import("node:zlib");
    const lies = doc => {
      const puffer = Buffer.from(doc.output("arraybuffer"));
      const rohText = puffer.toString("latin1");
      let text = rohText;
      const muster = /stream\r?\n/g; let treffer;
      while ((treffer = muster.exec(rohText)) !== null) {
        const start = treffer.index + treffer[0].length;
        const ende = rohText.indexOf("endstream", start);
        if (ende < 0) continue;
        try { text += "\n" + inflateSync(puffer.subarray(start, ende)).toString("latin1"); }
        catch { /* unkomprimiert */ }
      }
      return text;
    };
    const datensatz = {
      id: "insp-flaeche", eqName: "T", zoneName: "D",
      user: { displayName: "O", role: "Operator" },
      performedBy: { username: "operator1", role: "Operator" },
      aggregate: {
        dry: { pass: true, code: "PASS", message: "m", severity: 0 },
        clean: { pass: true, code: "PASS", message: "m", severity: 0 },
        intact: { pass: true, code: "PASS", message: "m", severity: 0 },
      },
      photos: [{ id: "p1", result: gestrippt }],
      signature: { meaning: "Freigabe" }, signedAt: "2026-09-17T08:00:00.000Z",
      recordHash: "a".repeat(64),
    };
    let pdfText = "", pdfFehler = "";
    try { pdfText = lies(exportInspectionPdf(datensatz, "de")); }
    catch (fehler) { pdfFehler = String(fehler?.message || fehler); }
    /* Die Meldung nennt JEDE Teilbedingung einzeln. Eine unbedingt
       formulierte Erfolgsmeldung neben einem roten Ergebnis ist selbst ein
       Fehler — sie schickt den Leser in die falsche Richtung. */
    const r4d = {
      abschnitt: /Geltungsbereich der Bewertung/.test(pdfText),
      groesse: /160x120 px/.test(pdfText),
      /* Der Satz wird im PDF umbrochen; ein Muster ueber die ganze Zeile
         faende ihn deshalb nie. Geprueft werden zwei kurze Stuecke, die
         eine Zeilenumbruchstelle nicht zerschneiden kann. */
      grenze: /nicht automatisch/.test(pdfText) && /ganze Teil/.test(pdfText),
      farbkorrektur: /Farbkorrektur/.test(pdfText),
    };
    ok("R4d", "Das Protokoll nennt den Geltungsbereich und seine Grenze",
      !pdfFehler && Object.values(r4d).every(Boolean),
      pdfFehler ? `PDF-ABSTURZ: ${pdfFehler}`
        : Object.entries(r4d).map(([k, v]) => `${k} ${v}`).join(" · "));

    /* ── R4e · Ohne Eintrag wird nichts erfunden ───────────────────────── */
    const ohneEintrag = JSON.parse(JSON.stringify(datensatz));
    delete ohneEintrag.photos[0].result.inspectionArea;
    let pdfOhne = "";
    try { pdfOhne = lies(exportInspectionPdf(ohneEintrag, "de")); } catch { /* unten */ }
    ok("R4e", "Ohne gespeicherten Geltungsbereich erfindet das Protokoll keinen",
      !/Geltungsbereich der Bewertung/.test(pdfOhne) && !/160x120 px/.test(pdfOhne),
      /160x120 px/.test(pdfOhne)
        ? "DAS PROTOKOLL RECHNET NACH"
        : "kein Abschnitt ohne gespeicherten Eintrag");
    const { existsSync: existiert } = await import("node:fs");
    ok("R4f", "Die Suite schreibt keine Datei ins Projektverzeichnis",
      gespeichertAls !== null
      && !existiert(new URL(`./${gespeichertAls}`, import.meta.url)),
      gespeichertAls === null
        ? "save() wurde gar nicht gerufen — der Abfang belegt nichts"
        : `save() abgefangen (${gespeichertAls}), keine Datei erzeugt`);
  } finally { await vite.close(); }
}

/* ═══ R5 · Bildschirmkoordinaten ════════════════════════════════════════
   Befund der Gegenpruefung an rc.4.40, am Bildschirm nachgemessen: der
   Auswahlrahmen war rund 201 px breit, waehrend 25 % von 340 px
   sichtbarer Fotobreite 85 px waeren. Nachgerechnet fuer 900x1600 im
   320x240-Fenster: 243,2 px statt 102,6 px. Marker und Klickauswertung
   hingen an derselben Stelle.

   jsdom hat keine Layout-Engine — gemessen wird in einem echten Browser
   (werkbank/rahmenmessung.mjs, dort 116,1 px statt 275,1 px bei 390 px
   Fensterbreite). Hier steht der dauerhafte Waechter: die REINE
   Umrechnung und der Gleichstand mit der CSS-Regel.                     */
{
  const { EDITOR_SEITENVERHAELTNIS, aufFenster, ausFenster, bemalteFlaeche,
    rechteckAufFenster } = await import("./src/inspectionArea.js");

  /* ── R5a · CSS und Rechnung nennen dasselbe Seitenverhaeltnis ──────
     Laufen die beiden auseinander, sitzt alles wieder daneben — und zwar
     lautlos, weil beide fuer sich genommen richtig aussehen. */
  const cssText = readFileSync(new URL("./src/styles.css", import.meta.url), "utf8");
  const viewportRegel = cssText.split("\n").find(z => /^\.zoom-viewport\s*\{/.test(z)) || "";
  const treffer = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/.exec(viewportRegel);
  const cssVerhaeltnis = treffer ? Number(treffer[1]) / Number(treffer[2]) : null;
  ok("R5a", "CSS-Fenster und Umrechnung nennen dasselbe Seitenverhaeltnis",
    cssVerhaeltnis !== null
    && Math.abs(cssVerhaeltnis - EDITOR_SEITENVERHAELTNIS) < 1e-9,
    cssVerhaeltnis === null
      ? "keine aspect-ratio an .zoom-viewport gefunden - der Test belegt nichts"
      : `CSS ${treffer[1]}/${treffer[2]} = ${cssVerhaeltnis.toFixed(4)}`
        + ` · Rechnung ${EDITOR_SEITENVERHAELTNIS.toFixed(4)}`);

  /* ── R5b · Die bemalte Flaeche, gegen Handrechnung ─────────────────── */
  const hoch = bemalteFlaeche(900, 1600);
  const quer = bemalteFlaeche(1600, 900);
  const quadrat = bemalteFlaeche(1000, 1000);
  const unbekannt = bemalteFlaeche(null, null);
  /* 900/1600 = 0,5625 gegen 4/3 = 1,3333 → Breite 0,5625/1,3333 = 0,4219 */
  const hochOk = Math.abs(hoch.w - (900 / 1600) / (4 / 3)) < 1e-9
    && Math.abs(hoch.h - 1) < 1e-9 && Math.abs(hoch.x - (1 - hoch.w) / 2) < 1e-9;
  const querOk = Math.abs(quer.w - 1) < 1e-9
    && Math.abs(quer.h - (4 / 3) / (1600 / 900)) < 1e-9;
  ok("R5b", "Die bemalte Flaeche folgt der contain-Regel, in beiden Formaten",
    hochOk && querOk
    && Math.abs(quadrat.w - 0.75) < 1e-9 && Math.abs(quadrat.h - 1) < 1e-9
    && unbekannt.bekannt === false && unbekannt.w === 1 && unbekannt.h === 1,
    `hoch w ${hoch.w.toFixed(4)} · quer h ${quer.h.toFixed(4)}`
    + ` · quadrat w ${quadrat.w.toFixed(4)}`
    + ` · ohne Bildgroesse ganzes Fenster (bekannt ${unbekannt.bekannt})`);

  /* ── R5c · Der gemessene Fall aus der Gegenpruefung ────────────────
     900x1600, Prueffläche 76 %: der Rahmen darf nicht 76 % des Fensters
     breit sein, sondern 76 % der bemalten Flaeche. */
  const rahmen = rechteckAufFenster({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 }, hoch);
  const fensterPx = 362;
  const falsch = 0.76 * fensterPx;
  const richtig = 0.76 * hoch.w * fensterPx;
  ok("R5c", "Der Rahmen misst den Ausschnitt der Fotoflaeche, nicht des Fensters",
    Math.abs(rahmen.w * fensterPx - richtig) < 0.01
    && rahmen.w * fensterPx < falsch * 0.5,
    `bei ${fensterPx} px Fenster: ${(rahmen.w * fensterPx).toFixed(1)} px`
    + ` (richtig ${richtig.toFixed(1)}) statt ${falsch.toFixed(1)} px`);

  /* ── R5d · Hin und zurueck, und der Rand ───────────────────────────
     Ein Klick auf den schwarzen Rand liegt NICHT auf dem Foto und darf
     nicht an den Bildrand geklemmt werden. */
  const probe = { x: 0.31, y: 0.62 };
  const hin = aufFenster(probe, hoch);
  const zurueck = ausFenster(hin, hoch);
  const amRand = ausFenster({ x: 0.02, y: 0.5 }, hoch);
  ok("R5d", "Umrechnung ist umkehrbar; ein Klick auf den Rand ergibt keinen Marker",
    Math.abs(zurueck.x - probe.x) < 1e-9 && Math.abs(zurueck.y - probe.y) < 1e-9
    && amRand === null
    && ausFenster({ x: 0.5, y: 0.5 }, hoch) !== null,
    `hin ${hin.x.toFixed(4)}/${hin.y.toFixed(4)} → zurueck`
    + ` ${zurueck.x.toFixed(4)}/${zurueck.y.toFixed(4)}`
    + ` · Klick auf den Seitenrand → ${amRand}`);
}

/* ═══ R8 · Kandidatenkaesten auf dem Bild, auf dem gerechnet wurde ═════
   Befund der Gegenpruefung an rc.4.40: das Screening rechnet seit rc.4.40
   auf dem Zuschnitt, gezeichnet wurde aber weiter das vollstaendige
   Originalfoto. Ein Kandidat zeigte damit auf 150/200 statt 360/300 — in
   der Ergebnisansicht UND im wiedergeoeffneten Bericht. Eine daran
   gebundene Tiefenmessung waere an der falschen Stelle vorgenommen worden.

   EIGENER FEHLGRIFF, hier festgehalten: die erste Fassung dieser
   Gegenprobe zaehlte <img>-Elemente im gerenderten Panel. Die Markierung
   zeichnet aber auf ein CANVAS — es gab nie ein <img>, und die Pruefung
   war gruen, ohne die Bildwahl beruehren zu koennen. Geprueft wird jetzt
   die reine Entscheidung, WELCHES Bild gezeichnet wird; sie steht als
   `kandidatenBild` in inspectionArea.js und wird von ScreeningPanel
   benutzt.                                                              */
{
  const { kandidatenBild } = await import("./src/inspectionArea.js");
  const ORIGINAL = "data:image/jpeg;base64,T1JJR0lOQUw=";
  const ZUSCHNITT = "data:image/jpeg;base64,WlVTQ0hOSVRU";
  const FLAECHE = { x: 0.2, y: 0.2, w: 0.5, h: 0.5, sourceWidth: 1600,
    sourceHeight: 1200, analysedWidth: 640, analysedHeight: 480, quelle: "GEWAEHLT" };

  const mitFlaeche = kandidatenBild({
    id: "photo-1", image: ORIGINAL, annotatedImage: ZUSCHNITT,
    result: { inspectionArea: FLAECHE } });
  const live = kandidatenBild({
    id: "photo-1", image: ORIGINAL,
    rawResult: { pruefflaeche: FLAECHE, zuschnittBild: ZUSCHNITT } });
  ok("R8a", "Mit Prueffläche wird der Zuschnitt gezeichnet, nicht das Original",
    mitFlaeche.quelle === ZUSCHNITT && live.quelle === ZUSCHNITT,
    `Bericht → ${mitFlaeche.quelle === ZUSCHNITT ? "Zuschnitt" : mitFlaeche.quelle}`
    + ` · Ergebnisansicht → ${live.quelle === ZUSCHNITT ? "Zuschnitt" : live.quelle}`);

  /* Der GEGENFALL: ein Datensatz VOR rc.4.40 hat keine Prueffläche. Dort
     wurde ohne Begrenzung gerechnet, und das Originalfoto IST richtig.
     Eine Regel, die auch das abweist, waere ein Rueckschritt. */
  const ohneFlaeche = kandidatenBild({
    id: "photo-1", image: ORIGINAL, annotatedImage: ZUSCHNITT, result: {} });
  ok("R8b", "Ohne Prueffläche bleibt das Originalfoto richtig (Stand vor rc.4.40)",
    ohneFlaeche.quelle === ORIGINAL && ohneFlaeche.grund === null,
    `Altdatensatz → ${ohneFlaeche.quelle === ORIGINAL ? "Originalfoto" : ohneFlaeche.quelle}`);

  /* Fehlt das Bild des Ausschnitts, wird GAR NICHTS gezeichnet — nicht
     ersatzweise das Original. Ein Kasten auf einem Bild, zu dem er nicht
     gehoert, sieht aus wie eine Ortsangabe. */
  const ohneBild = kandidatenBild({
    id: "photo-1", image: ORIGINAL, result: { inspectionArea: FLAECHE } });
  ok("R8c", "Fehlt das Zuschnittbild, wird nicht ersatzweise das Original gezeichnet",
    ohneBild.quelle === null && ohneBild.grund === "KEIN_ZUSCHNITTBILD",
    ohneBild.quelle === ORIGINAL
      ? "faellt auf das Originalfoto zurueck - stiller Rueckfall in den Fehler"
      : `kein Bild, Grund ${ohneBild.grund}`);
}

/* ═══ R6 · Known Issues brauchen einen gemeinsamen Ortsbezug ═══════════
   Befund der Gegenpruefung an rc.4.40, am echten Abgleich reproduziert:
   zwei GETRENNTE Kratzer — einer links oben, einer rechts unten —, jeweils
   mittig zugeschnitten, ergaben beide 0,5/0,5. `allMatched: true`, Status
   "unveraendert", KNOWN_ISSUE_TOLERATED. Der Abgleich hielt zwei
   verschiedene Stellen fuer dieselbe.                                    */
{
  const { extractZones, matchZones } = await import("./src/knownIssues.js");
  const ov = { w: 160, h: 120, scratches: [{ minX: 70, maxX: 90, minY: 50, maxY: 70 }] };
  const A = { x: 0.05, y: 0.05, w: 0.30, h: 0.30, sourceWidth: 1600, sourceHeight: 1200 };
  const B = { x: 0.60, y: 0.60, w: 0.30, h: 0.30, sourceWidth: 1600, sourceHeight: 1200 };
  const zA = extractZones(ov, A), zB = extractZones(ov, B);
  const alt = extractZones(ov);   // ohne Prueffläche: Stand vor rc.4.40

  const verschieden = matchZones(zB, zA.map(z => ({ ...z, issueId: "A" })));
  const dieselbe = matchZones(zA, zA.map(z => ({ ...z, issueId: "A" })));
  /* Fuer den Bezugsvergleich braucht es Zonen an DERSELBEN Stelle —
     sonst trennt schon der Abstand, und die Bezugspruefung wird gar nicht
     erreicht. Beim Sabotieren fiel genau das auf: die erste Fassung war
     gruen, obwohl der Bezugsfilter entfernt war. Ein zentrierter
     Ausschnitt bildet die Zonenmitte auf 0,5/0,5 ab — dieselben Zahlen
     wie eine Altzone, nur mit Bezug "FOTO". */
  const Z = { x: 0.25, y: 0.25, w: 0.5, h: 0.5, sourceWidth: 1600, sourceHeight: 1200 };
  const zZentriert = extractZones(ov, Z);
  const gemischt = matchZones(zZentriert, alt.map(z => ({ ...z, issueId: "A" })));
  const altGegenAlt = matchZones(alt, alt.map(z => ({ ...z, issueId: "A" })));

  ok("R6a", "Zonen tragen Fotokoordinaten, nicht Ausschnittkoordinaten",
    zA[0].bezug === "FOTO" && zB[0].bezug === "FOTO"
    && Math.abs(zA[0].x - 0.20) < 1e-9 && Math.abs(zB[0].x - 0.75) < 1e-9
    && alt[0].bezug === undefined && Math.abs(alt[0].x - 0.5) < 1e-9,
    `A ${zA[0].x.toFixed(2)}/${zA[0].y.toFixed(2)} · B ${zB[0].x.toFixed(2)}/${zB[0].y.toFixed(2)}`
    + ` · ohne Prueffläche ${alt[0].x.toFixed(2)}/${alt[0].y.toFixed(2)} (Stand vor rc.4.40)`);

  ok("R6b", "Zwei verschiedene Stellen gelten nicht als derselbe Befund",
    verschieden.allMatched === false && verschieden.matched.length === 0,
    `allMatched ${verschieden.allMatched} · Treffer ${verschieden.matched.length}`);

  /* Der GEGENFALL: eine Sperre, die alles abweist, belegt nichts. */
  ok("R6c", "Dieselbe Stelle gilt weiterhin als derselbe Befund",
    dieselbe.allMatched === true && dieselbe.matched.length === 1,
    `allMatched ${dieselbe.allMatched} · Treffer ${dieselbe.matched.length}`);

  ok("R6d", "Ohne gemeinsamen Ortsbezug wird keine Uebereinstimmung behauptet",
    gemischt.allMatched === false && altGegenAlt.allMatched === true,
    `gleiche Koordinaten (${zZentriert[0].x.toFixed(2)}/${zZentriert[0].y.toFixed(2)}`
    + ` gegen ${alt[0].x.toFixed(2)}/${alt[0].y.toFixed(2)}), nur der Bezug trennt:`
    + ` FOTO gegen Altdaten ${gemischt.allMatched}`
    + ` · Altdaten gegen Altdaten ${altGegenAlt.allMatched} (unveraendert)`);
}

/* ═══ R7 · Ausgeschlossene Stellen verfaelschen die Bilanz nicht ════════
   Befund der Gegenpruefung an rc.4.40: eine Messung an einem Marker
   AUSSERHALB der Prueffläche liess sich speichern und zaehlte danach als
   uebersehene Grenzueberschreitung — an einer Stelle, die ausdruecklich
   nicht untersucht wurde. Der Detektor kann nichts uebersehen, was ihm
   nie vorgelegt wurde.                                                   */
{
  const { befundBilanz } = await import("./src/depthLimit.js");
  const grund = {
    photoId: "photo-1", kandidatId: null, unit: "µm", method: "TASTSCHNITT",
    measuredAt: "2026-09-17T09:00:00.000Z", measuredBy: "m.koch",
    source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
    valueUm: "2,40", uncertaintyUm: "0,10",
  };
  const drin = { ...grund, markerId: "M01" };
  const draussen = { ...grund, markerId: "M02", ausserhalbFlaeche: true };
  const bilanz = befundBilanz([drin, draussen]);
  const nurDrin = befundBilanz([drin]);
  ok("R7a", "Eine Stelle ausserhalb der Prueffläche zaehlt nicht als uebersehen",
    bilanz.uebersehen === 1 && bilanz.uebersehenUeberGrenze === 1
    && bilanz.ausserhalb === 1 && bilanz.gesamt === 2
    && bilanz.uebersehen === nurDrin.uebersehen
    && bilanz.uebersehenUeberGrenze === nurDrin.uebersehenUeberGrenze,
    `gesamt ${bilanz.gesamt} · uebersehen ${bilanz.uebersehen}`
    + ` · davon ueber der Grenze ${bilanz.uebersehenUeberGrenze}`
    + ` · ausserhalb ${bilanz.ausserhalb}`
    + ` · ohne den ausgeschlossenen: uebersehen ${nurDrin.uebersehen}`);

  /* Und sie verschwindet NICHT: sie wird gezaehlt, nur getrennt. */
  ok("R7b", "Sie verschwindet nicht, sie steht in einer eigenen Kategorie",
    bilanz.ausserhalb === 1 && bilanz.gesamt === 2
    && bilanz.erkannt + bilanz.uebersehen + bilanz.ausserhalb === bilanz.gesamt,
    `erkannt ${bilanz.erkannt} + uebersehen ${bilanz.uebersehen}`
    + ` + ausserhalb ${bilanz.ausserhalb} = ${bilanz.gesamt}`);
}

/* ═══ R9 · Die drei Verbindungen, ueber den ECHTEN Weg ══════════════════
   Befunde der Gegenpruefung an rc.4.41. Alle drei sind Aufrufer, die beim
   Nachziehen der neuen Regeln uebersehen wurden — die Regeln selbst waren
   richtig. Geprueft wird deshalb jeweils der tatsaechliche Erzeugungs-
   bzw. Bedienweg, nicht die Regel noch einmal.                          */
{
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id=\"wurzel\"></div></body></html>",
    { url: "https://visuclean.test/", pretendToBeVisual: true });
  for (const name of ["window", "document", "HTMLElement", "HTMLCanvasElement",
    "HTMLImageElement", "Node", "MutationObserver", "getComputedStyle", "Image",
    "Blob", "Event", "CSSStyleSheet"]) {
    Object.defineProperty(globalThis, name, {
      value: dom.window[name], configurable: true, writable: true });
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

  /* EIN Root fuer alle Renders dieses Blocks. React warnt zu Recht, wenn
     auf demselben Container mehrfach createRoot() gerufen wird — in
     schmutztest steht genau das noch offen; hier wird es nicht wiederholt. */
  const behaelter = dom.window.document.getElementById("wurzel");
  const wurzel = createRoot(behaelter);

  try {
    const { KnownIssueDialog, MultiCapture } = await vite.ssrLoadModule("/src/App.jsx");
    const { buildInspectionRecord } = await vite.ssrLoadModule("/src/inspectionRecord.js");
    const { applyKnownIssues } = await vite.ssrLoadModule("/src/knownIssues.js");
    const { befundBilanz } = await vite.ssrLoadModule("/src/depthLimit.js");
    const { translator } = await vite.ssrLoadModule("/src/i18n.js");
    const t = translator("de");

    /* ── R9a · Der Erzeuger legt Zonen MIT Ortsbezug an ────────────────
       Die Vergleichsregel beruecksichtigt seit rc.4.41 die Prueffläche,
       der Erzeuger im Dialog nicht. Ein so angelegter bekannter Kratzer
       wurde beim naechsten Mal als "verschlechtert" eingestuft. */
    const FLAECHE = { x: 0.25, y: 0.25, w: 0.5, h: 0.5,
      sourceWidth: 1600, sourceHeight: 1200, analysedWidth: 640,
      analysedHeight: 480, quelle: "GEWAEHLT" };
    const OVERLAY = { w: 160, h: 120,
      scratches: [{ minX: 70, maxX: 90, minY: 50, maxY: 70 }] };
    const rawResult = {
      intact: { code: "SCRATCH_SUSPECT", pass: false, severity: 50 },
      _ov: OVERLAY, pruefflaeche: FLAECHE,
    };
    const foto = { id: "photo-1", image: "data:image/jpeg;base64,QUJD", rawResult };

    /* Der Dialog ist ZWEISTUFIG: Formular, dann elektronische Signatur mit
       Re-Authentifizierung. Ein Lauf, der nur das Formular ausfuellt und
       irgendeinen Knopf sucht, kommt nie bis `onSave` — der erste Entwurf
       dieser Gegenprobe war genau deshalb rot, und zwar aus dem falschen
       Grund. Ein Beweis, der aus dem falschen Grund rot ist, belegt nichts.
       Deshalb wird hier der vollstaendige Bedienweg gefahren und jeder
       Schritt einzeln belegt. */
    const setzeWert = (element, wert) => {
      const proto = element.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
      const setzer = Object.getOwnPropertyDescriptor(proto, "value").set;
      setzer.call(element, wert);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    };
    const knopfMit = beschriftung => [...behaelter.querySelectorAll("button")]
      .find(b => (b.textContent || "").trim() === beschriftung);

    let gespeichert = null;
    const bedienschritte = [];
    await act(async () => {
      wurzel.render(React.createElement(KnownIssueDialog, {
        photo: foto, equipment: { id: "tp" }, zone: { id: "die" },
        user: { username: "qa_manager", role: "QA Manager", displayName: "QA Manager" },
        language: "de", onCancel: () => {}, onSave: wert => { gespeichert = wert; }, t,
      }));
    });
    const begruendung = behaelter.querySelector("#issue-reason");
    bedienschritte.push(`Begruendungsfeld ${begruendung ? "da" : "fehlt"}`);
    await act(async () => setzeWert(begruendung, "Oberflaechlicher Haarkratzer, QA geprueft"));

    const weiter = knopfMit(t("continueSignature"));
    bedienschritte.push(`"${t("continueSignature")}" ${
      weiter ? (weiter.disabled ? "gesperrt" : "frei") : "fehlt"}`);
    if (weiter && !weiter.disabled) {
      await act(async () => {
        weiter.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
    }
    const passwort = behaelter.querySelector("#signature-password");
    bedienschritte.push(`Signaturschirm ${passwort ? "erreicht" : "nicht erreicht"}`);
    if (passwort) await act(async () => setzeWert(passwort, "quality2024"));

    const signieren = knopfMit(t("signSave"));
    bedienschritte.push(`"${t("signSave")}" ${
      signieren ? (signieren.disabled ? "gesperrt" : "frei") : "fehlt"}`);
    if (signieren && !signieren.disabled) {
      await act(async () => {
        signieren.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
      /* `finish` haengt an einer ECHTEN asynchronen Rechnung: der
         SHA-256-Datensatzpruefsumme. Die loest sich nicht in einer
         Mikrotask-Runde auf, die `act` mitnimmt — ein Lauf ohne dieses
         Warten war einmal gruen und beim naechsten Mal rot, ohne dass sich
         am Code etwas geaendert hatte. Gewartet wird auf das Ergebnis,
         begrenzt, damit ein echter Ausfall nicht haengt. */
      for (let runde = 0; runde < 200 && !gespeichert; runde += 1) {
        await act(async () => { await new Promise(loese => setTimeout(loese, 5)); });
      }
      bedienschritte.push(gespeichert ? "onSave erreicht" : "onSave blieb aus");
    }
    const zonen = gespeichert?.zones || [];
    ok("R9a", "Der Known-Issue-Erzeuger legt Zonen mit Ortsbezug an",
      zonen.length === 1 && zonen[0].bezug === "FOTO"
      && Math.abs(zonen[0].x - 0.5) < 1e-9,
      gespeichert
        ? `${zonen.length} Zone(n), bezug ${zonen[0]?.bezug}`
          + ` bei ${zonen[0]?.x?.toFixed(4)}/${zonen[0]?.y?.toFixed(4)}`
          + ` · Bedienweg: ${bedienschritte.join(" → ")}`
        : "der Dialog hat nichts gespeichert - die Gegenprobe belegt nichts"
          + ` · Bedienweg: ${bedienschritte.join(" → ")}`);

    /* Und der Rundlauf: derselbe Befund muss beim naechsten Mal
       "unveraendert" heissen, nicht "verschlechtert". */
    const issue = {
      id: "issue-1", eqId: "tp", zoneId: "die", status: "active",
      issueType: "hairline_scratch", originalIntactCode: "SCRATCH_SUSPECT",
      validUntil: "2027-12-31", zones: zonen,
    };
    const rundlauf = applyKnownIssues(rawResult, "tp", "die", [issue],
      "2026-09-17T09:00:00.000Z");
    ok("R9b", "Derselbe Befund gilt beim naechsten Mal als unveraendert",
      rundlauf.info?.status === "unveraendert"
      && rundlauf.res?.intact?.code === "KNOWN_ISSUE_TOLERATED",
      `Status ${rundlauf.info?.status} · Code ${rundlauf.res?.intact?.code}`);

    /* ── R9c · Das Kennzeichen ueberlebt den Datensatzbau ──────────────
       buildInspectionRecord liess `ausserhalbFlaeche` fallen. Die Bilanz
       zaehlte danach eine uebersehene Grenzueberschreitung, und die
       Speichergrenze wies den Datensatz ab — die Geometriepruefung
       schuetzte richtig, aber der vorgesehene Weg funktionierte nicht. */
    const messung = {
      photoId: "photo-1", kandidatId: null, markerId: "M02",
      valueUm: "2,40", unit: "µm", method: "TASTSCHNITT", uncertaintyUm: "0,10",
      measuredAt: "2026-09-17T09:00:00.000Z", measuredBy: "m.koch",
      source: "INDEPENDENT_MEASUREMENT", ruleVersion: 1,
      ausserhalbFlaeche: true,
    };
    const datensatz = buildInspectionRecord({
      id: "insp-ausserhalb", appVersion: "8.3.0-test", now: "2026-09-17T09:00:00.000Z",
      user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
      eqId: "tp", eqName: "T", zoneId: "die", zoneName: "D",
      photos: [], aggregate: null, originalSystemDecision: null,
      finalDecision: "FAIL", depthMeasurements: [messung],
    });
    const imDatensatz = datensatz.depthMeasurements?.[0];
    const bilanz = befundBilanz(datensatz.depthMeasurements || []);
    ok("R9c", "Das Kennzeichen \"ausserhalb\" ueberlebt den Datensatzbau",
      imDatensatz?.ausserhalbFlaeche === true
      && bilanz.ausserhalb === 1 && bilanz.uebersehen === 0
      && bilanz.uebersehenUeberGrenze === 0,
      `im Datensatz ${imDatensatz?.ausserhalbFlaeche}`
      + ` · Bilanz: ausserhalb ${bilanz.ausserhalb},`
      + ` uebersehen ${bilanz.uebersehen},`
      + ` davon ueber der Grenze ${bilanz.uebersehenUeberGrenze}`);

    /* Der GEGENFALL: eine Messung INNERHALB muss weiterhin als uebersehen
       zaehlen. Eine Regel, die alles zu "ausserhalb" macht, waere
       schlimmer als der Fehler. */
    const drin = buildInspectionRecord({
      id: "insp-drin", appVersion: "8.3.0-test", now: "2026-09-17T09:00:00.000Z",
      user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
      eqId: "tp", eqName: "T", zoneId: "die", zoneName: "D",
      photos: [], aggregate: null, originalSystemDecision: null,
      finalDecision: "FAIL",
      depthMeasurements: [{ ...messung, markerId: "M01", ausserhalbFlaeche: undefined }],
    });
    const bilanzDrin = befundBilanz(drin.depthMeasurements || []);
    ok("R9d", "Eine Messung innerhalb zaehlt weiterhin als uebersehen",
      drin.depthMeasurements[0].ausserhalbFlaeche === false
      && bilanzDrin.uebersehen === 1 && bilanzDrin.uebersehenUeberGrenze === 1
      && bilanzDrin.ausserhalb === 0,
      `Kennzeichen ${drin.depthMeasurements[0].ausserhalbFlaeche}`
      + ` · uebersehen ${bilanzDrin.uebersehen}`
      + ` · ausserhalb ${bilanzDrin.ausserhalb}`);

    /* ── R9e · Der Wechsel zwischen zwei Eintraegen desselben Fotos ────
       Der Wechsel loeschte die bekannten Abmessungen; weil die Bildquelle
       gleich blieb, kam kein erneutes `onLoad`, und der Rahmen fiel auf
       die Fenstergeometrie zurueck: 76 % statt 32,0625 %.

       jsdom laedt keine Bilder. Damit die Gegenprobe ueberhaupt etwas
       messen kann, meldet das Bildelement hier feste Abmessungen — genau
       das, was ein Browser nach dem Laden meldet. */
    const proto = dom.window.HTMLImageElement.prototype;
    const alteBeschreibungen = {
      complete: Object.getOwnPropertyDescriptor(proto, "complete"),
      naturalWidth: Object.getOwnPropertyDescriptor(proto, "naturalWidth"),
      naturalHeight: Object.getOwnPropertyDescriptor(proto, "naturalHeight"),
    };
    Object.defineProperty(proto, "complete", { get: () => true, configurable: true });
    Object.defineProperty(proto, "naturalWidth", { get: () => 900, configurable: true });
    Object.defineProperty(proto, "naturalHeight", { get: () => 1600, configurable: true });
    try {
      /* Gefahren wird der tatsaechliche BEDIENWEG: die echte
         Aufnahmemaske mit zwei Eintraegen, zwischen denen ueber die
         Miniaturleiste gewechselt wird. Beide zeigen DIESELBE Bildquelle
         — genau die Lage, in der kein erneutes Laden ausgeloest wird. */
      const BILD = "data:image/jpeg;base64,QUJD";
      const FLAECHE_FOTO = { x: 0.12, y: 0.12, w: 0.76, h: 0.76 };
      const fotos = [
        { id: "photo-1", image: BILD, markers: [], pruefflaeche: FLAECHE_FOTO },
        { id: "photo-2", image: BILD, markers: [], pruefflaeche: FLAECHE_FOTO },
      ];
      await act(async () => {
        wurzel.render(React.createElement(MultiCapture, {
          photos: fotos, setPhotos: () => {}, title: "T", subtitle: "S",
          onBack: () => {}, onAnalyze: () => {}, t,
        }));
      });
      const rahmenbreite = () => {
        const rahmen = behaelter.querySelector(".flaeche-rahmen");
        return rahmen ? rahmen.style.width : null;
      };
      /* Der Browser meldet das geladene Bild EINMAL. jsdom laedt nichts,
         also wird dieser eine Zeitpunkt hier nachgestellt — sonst waere
         schon der erste Wert falsch und der Unterschied, um den es geht
         (erst richtig, nach dem Wechsel falsch), gar nicht sichtbar. */
      await act(async () => {
        behaelter.querySelector(".zoom-layer img")
          ?.dispatchEvent(new dom.window.Event("load", { bubbles: false }));
      });
      const zuerst = rahmenbreite();
      const zweiteMiniatur = [...behaelter.querySelectorAll("button.thumbnail")][1];
      await act(async () => {
        zweiteMiniatur?.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
      const nachWechsel = rahmenbreite();
      /* 900x1600 im 4:3-Fenster: bemalte Breite 0,421875 → 76 % davon
         sind 32,0625 % der Fensterbreite. */
      const erwartet = (0.76 * ((900 / 1600) / (4 / 3)) * 100).toFixed(4);
      const alsZahl = wert => Number(String(wert).replace("%", ""));
      ok("R9e", "Der Wechsel zwischen Eintraegen desselben Fotos behaelt die Geometrie",
        zuerst !== null && nachWechsel !== null && Boolean(zweiteMiniatur)
        && Math.abs(alsZahl(zuerst) - Number(erwartet)) < 0.01
        && Math.abs(alsZahl(nachWechsel) - Number(erwartet)) < 0.01,
        `zuerst ${zuerst} · nach Wechsel ${nachWechsel} · erwartet ${erwartet} %`
        + ` · ${zweiteMiniatur ? "ueber die Miniaturleiste gewechselt" : "keine zweite Miniatur"}`
        + (Math.abs(alsZahl(nachWechsel) - 76) < 0.01
          ? "  — Rueckfall auf die Fenstergeometrie" : ""));
    } finally {
      for (const [name, beschreibung] of Object.entries(alteBeschreibungen)) {
        if (beschreibung) Object.defineProperty(proto, name, beschreibung);
        else delete proto[name];
      }
    }
    await act(async () => wurzel.unmount());
  } finally { await vite.close(); }
}

console.log("");
const durch = checks.filter(c => !c.bestanden);
console.log(`Bestanden: ${checks.length - durch.length} / ${checks.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(c => c.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
