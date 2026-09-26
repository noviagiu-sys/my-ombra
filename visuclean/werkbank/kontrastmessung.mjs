/* ─── VisuClean · Werkbank · Kontrast in einem Kratzer-Bereich messen ──────
   Aufruf:
     node werkbank/kontrastmessung.mjs --selbsttest
     node werkbank/kontrastmessung.mjs --bild foto.png --bereiche roi.csv \
          --skala roh --ausgabe kontrast.csv
     node werkbank/kontrastmessung.mjs --bild foto.png --detektor \
          --ausgabe kontrast.csv

   WAS DAS IST
   Ein Messwerkzeug auf dem PC. Es erzeugt die Spalte `kontrast` fuer
   werkbank/kontrastauswertung.py. Es ist NICHT Teil der App und veraendert
   kein Urteil.

   WAS ES NICHT IST
   Es misst keine Tiefe. Der Gradientenbetrag sagt, wie stark sich die
   Helligkeit aendert — nicht, wie tief eine Riefe ist. Zwei Riefen gleicher
   Tiefe koennen bei unterschiedlichem Licht sehr verschiedene Werte
   ergeben, und genau das soll die Messkampagne erst zeigen.

   ─────────────────────────────────────────────────────────────────────────
   WICHTIGER BEFUND ZUM BESTAND (13.09.2026)

   `edgeStrength` aus src/scratchScreening.js ist NICHT als Kontrastmass
   verwendbar. Es ist DOPPELT bildabhaengig:

     1. Es rechnet auf einem CLAHE-normierten Bild:
        (lum - lokalerMittelwert) / max(0.02, lokaleStreuung)
     2. Der Sobel-Betrag wird anschliessend durch das MAXIMUM DESSELBEN
        BILDES geteilt (scratchScreening.js, Funktion sobel()).

   Ein Wert von 0,24 heisst damit "24 % der staerksten Kante in diesem
   Foto" — nicht "24 Grauwertstufen". Zwei Fotos sind nicht vergleichbar,
   und eine feste Schwelle wie 17,0 hat darin keinen Sinn.

   Dieses Skript rechnet deshalb bewusst OHNE beide Normierungen. Das ist
   kein Fehler im Screening: dort ist die Normierung richtig, weil dort
   innerhalb EINES Bildes sortiert wird.
   ───────────────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { aufLangeKante } from "./bildhilfen.mjs";
import { screenScratches } from "../src/scratchScreening.js";

/* ── Skalen ───────────────────────────────────────────────────────────────
   Der theoretische Hoechstwert des Sobel-Betrags auf 8-Bit-Grauwerten:
     |gx|max = |gy|max = 4 · 255 = 1020
     |grad|max = sqrt(1020² + 1020²) = 1442,4977…

   Die im Auftrag gewuenschte Skala 0–255 ist eine DARSTELLUNGSWAHL, keine
   Eigenschaft der Messung. Es gibt zwei ehrliche Wege dorthin und einen
   unehrlichen:

     roh            gar nicht skalieren. Einheit: Grauwertstufen je Pixel,
                    Bereich 0 … 1442,4977. VOREINSTELLUNG.
     g255           durch 5,656854 teilen (= sqrt(2)·4). Bereich 0 … 255,0
                    exakt, verlustfrei, nur eine andere Einheit.
     g255_begrenzt  je Pixel bei 255 abschneiden, dann mitteln. VERLUSTIG:
                    alles ueber 255 wird eingeebnet, starke Kanten sehen
                    schwaecher aus als sie sind. Nur fuer die Zusammenarbeit
                    mit einem fremden Werkzeug, das 0–255 erwartet.

   Der Skalenname steht in JEDER Ausgabezeile. Eine Zahl ohne ihre Skala
   ist keine Angabe.                                                       */
export const SKALEN = Object.freeze({
  roh: { teiler: 1, begrenzen: false, max: Math.sqrt(2) * 1020 },
  g255: { teiler: Math.sqrt(2) * 4, begrenzen: false, max: 255 },
  g255_begrenzt: { teiler: 1, begrenzen: true, max: 255 },
});

/* ── Grauwert ─────────────────────────────────────────────────────────────
   Rec. 601 Luma auf den GESPEICHERTEN sRGB-Werten, ohne
   Gamma-Linearisierung.

   Bewusst dieselbe Formel wie im Analyse-Kern, damit die Messung nicht auf
   einer anderen Helligkeit rechnet als die App. Eine Linearisierung waere
   physikalisch naeher an der Beleuchtung und wuerde ANDERE Zahlen ergeben —
   sie ist deshalb eine eigene Entscheidung und keine stille Zugabe.      */
export function grauwert(daten, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    g[i] = 0.299 * daten[o] + 0.587 * daten[o + 1] + 0.114 * daten[o + 2];
  }
  return g;
}

/* ── Sobel ────────────────────────────────────────────────────────────────
   gx = [[-1,0,1],[-2,0,2],[-1,0,1]]   gy = [[-1,-2,-1],[0,0,0],[1,2,1]]
   Betrag = sqrt(gx² + gy²)

   Der 1-Pixel-Rand wird NICHT berechnet und NICHT mit 0 aufgefuellt. Eine
   Nullfuellung erfindet an jedem Bildrand eine Kante; ein Kratzer am Rand
   bekaeme dadurch einen Wert, der aus dem Rand stammt, nicht aus ihm.   */
export function sobelBetrag(grau, w, h) {
  const betrag = new Float32Array(w * h);
  const gueltig = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = grau[i - w - 1], b = grau[i - w], c = grau[i - w + 1];
      const d = grau[i - 1], f = grau[i + 1];
      const g = grau[i + w - 1], k = grau[i + w], l = grau[i + w + 1];
      const gx = (c + 2 * f + l) - (a + 2 * d + g);
      const gy = (g + 2 * k + l) - (a + 2 * b + c);
      betrag[i] = Math.sqrt(gx * gx + gy * gy);
      gueltig[i] = 1;
    }
  }
  return { betrag, gueltig };
}

/**
 * Mittlerer Gradientenbetrag in einem Rechteck.
 *
 * Randpixel ohne gueltigen Gradienten zaehlen NICHT in den Nenner — sonst
 * verduennte der Bildrand den Mittelwert.
 *
 * Der Mittelwert ueber eine Bounding Box enthaelt auch Hintergrund. Das ist
 * gewollt und dokumentiert: die vereinbarte Groesse ist der Mittelwert im
 * Bereich. Median und 95. Perzentil stehen daneben, damit spaeter sichtbar
 * ist, ob ein kleiner Kratzer in einem grossen Kasten untergeht.
 */
export function kontrastImBereich(betrag, gueltig, w, h, bereich, skala) {
  const s = SKALEN[skala];
  if (!s) throw new Error(`unbekannte Skala: ${skala}`);
  const x0 = Math.max(0, Math.floor(bereich.minX));
  const x1 = Math.min(w - 1, Math.ceil(bereich.maxX));
  const y0 = Math.max(0, Math.floor(bereich.minY));
  const y1 = Math.min(h - 1, Math.ceil(bereich.maxY));
  const werte = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!gueltig[i]) continue;
      let v = betrag[i];
      if (s.begrenzen) v = Math.min(v, 255);
      werte.push(v / s.teiler);
    }
  }
  if (!werte.length) {
    return { mittel: null, median: null, p95: null, flaechePx: 0,
      grund: "kein gueltiger Pixel im Bereich (nur Bildrand?)" };
  }
  const summe = werte.reduce((a, b) => a + b, 0);
  const sortiert = [...werte].sort((a, b) => a - b);
  const bei = q => sortiert[Math.min(sortiert.length - 1,
    Math.max(0, Math.round(q * (sortiert.length - 1))))];
  return {
    mittel: summe / werte.length,
    median: bei(0.5),
    p95: bei(0.95),
    flaechePx: werte.length,
    grund: null,
  };
}

/* ── Bild laden ───────────────────────────────────────────────────────────
   GRENZE: jpeg-js ist nicht bit-gleich mit dem Decoder eines Browsers oder
   einer Kamera. Fuer eine Messreihe ist das unerheblich, solange ALLE
   Bilder durch denselben Decoder laufen — fuer einen Vergleich mit einer
   Messung aus einem anderen Werkzeug ist es das nicht.                   */
export function ladeBild(datei) {
  const roh = fs.readFileSync(datei);
  const endung = path.extname(datei).toLowerCase();
  if (endung === ".png") {
    const png = PNG.sync.read(roh);
    return { daten: new Uint8ClampedArray(png.data), w: png.width, h: png.height };
  }
  if (endung === ".jpg" || endung === ".jpeg") {
    const bild = jpeg.decode(roh, { useTArray: true });
    return { daten: new Uint8ClampedArray(bild.data), w: bild.width, h: bild.height };
  }
  throw new Error(`nicht unterstuetztes Bildformat: ${endung} (PNG oder JPEG)`);
}

/** Bereiche aus einer CSV lesen: befund_id,minX,minY,maxX,maxY[,befundart] */
export function liesBereiche(datei) {
  const zeilen = fs.readFileSync(datei, "utf8").trim().split(/\r?\n/);
  if (!zeilen.length) throw new Error(`${datei}: leer`);
  const kopf = zeilen[0].split(",").map(s => s.trim());
  const pflicht = ["befund_id", "minX", "minY", "maxX", "maxY"];
  const fehlend = pflicht.filter(s => !kopf.includes(s));
  if (fehlend.length) throw new Error(`${datei}: Spalten fehlen: ${fehlend.join(", ")}`);
  return zeilen.slice(1).filter(Boolean).map(zeile => {
    const teile = zeile.split(",");
    const feld = name => teile[kopf.indexOf(name)]?.trim();
    const zahl = name => {
      const v = Number(feld(name));
      if (!Number.isFinite(v)) throw new Error(`${datei}: ${name} ist keine Zahl: "${feld(name)}"`);
      return v;
    };
    return {
      befund_id: feld("befund_id"),
      befundart: (feld("befundart") || "UNBEKANNT").toUpperCase(),
      minX: zahl("minX"), minY: zahl("minY"), maxX: zahl("maxX"), maxY: zahl("maxY"),
    };
  });
}

/* ── Selbsttest ───────────────────────────────────────────────────────────
   Gegen ANALYTISCH bekannte Werte, nicht gegen einen frueheren Lauf. Ein
   Test gegen die eigene Vorversion bestaetigt nur, dass sich nichts
   geaendert hat — auch wenn beide falsch sind.                           */
function graubild(w, h, f) {
  const daten = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const o = (y * w + x) * 4;
      daten[o] = v; daten[o + 1] = v; daten[o + 2] = v; daten[o + 3] = 255;
    }
  }
  return { daten, w, h };
}

function selbsttest() {
  const pruefungen = [];
  const ok = (id, name, bestanden, info = "") => {
    pruefungen.push({ id, bestanden });
    console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
    if (info) console.log(`                    ${info}`);
  };

  console.log("VisuClean · Werkbank — Kontrastmessung, Selbsttest\n");

  /* M1 · Gleichmaessige Flaeche: der Gradient ist ueberall exakt 0. */
  {
    const b = graubild(20, 20, () => 128);
    const g = grauwert(b.daten, b.w, b.h);
    const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
    const r = kontrastImBereich(betrag, gueltig, b.w, b.h,
      { minX: 2, minY: 2, maxX: 17, maxY: 17 }, "roh");
    ok("M1", "Gleichmaessige Flaeche ergibt Kontrast 0",
      r.mittel === 0, `Mittel ${r.mittel}`);
  }

  /* M2 · Rampe mit Steigung s in x: |grad| = 8·s, exakt.
     Nachrechnung steht im Kopf der Datei. */
  {
    const s = 3;
    const b = graubild(24, 24, x => Math.min(255, 10 + s * x));
    const g = grauwert(b.daten, b.w, b.h);
    const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
    /* Bereich innerhalb der Saettigung: 10 + 3x < 255 fuer x < 81,7 —
       hier also ueberall. */
    const r = kontrastImBereich(betrag, gueltig, b.w, b.h,
      { minX: 3, minY: 3, maxX: 20, maxY: 20 }, "roh");
    ok("M2", "Rampe mit Steigung 3 ergibt exakt 8·3 = 24",
      Math.abs(r.mittel - 24) < 1e-6, `Mittel ${r.mittel.toFixed(9)}`);
  }

  /* M3 · Stufenkante 0 -> 255: |gx| = 4·255 = 1020, gy = 0. */
  {
    const b = graubild(21, 21, x => (x < 10 ? 0 : 255));
    const g = grauwert(b.daten, b.w, b.h);
    const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
    /* Nur die beiden Spalten links und rechts der Sprungstelle tragen. */
    const r = kontrastImBereich(betrag, gueltig, b.w, b.h,
      { minX: 9, minY: 5, maxX: 9, maxY: 15 }, "roh");
    ok("M3", "Stufenkante 0->255 ergibt exakt 1020",
      Math.abs(r.mittel - 1020) < 1e-6, `Mittel ${r.mittel.toFixed(6)}`);
  }

  /* M4 · Die Skalen rechnen ineinander um, ohne etwas zu erfinden. */
  {
    const b = graubild(21, 21, x => (x < 10 ? 0 : 255));
    const g = grauwert(b.daten, b.w, b.h);
    const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
    const bereich = { minX: 9, minY: 5, maxX: 9, maxY: 15 };
    const roh = kontrastImBereich(betrag, gueltig, b.w, b.h, bereich, "roh").mittel;
    const g255 = kontrastImBereich(betrag, gueltig, b.w, b.h, bereich, "g255").mittel;
    const beg = kontrastImBereich(betrag, gueltig, b.w, b.h, bereich, "g255_begrenzt").mittel;
    const umrechnung = Math.abs(g255 - roh / (Math.sqrt(2) * 4)) < 1e-9;
    const verlust = Math.abs(beg - 255) < 1e-9;
    ok("M4", "g255 rechnet verlustfrei um, g255_begrenzt schneidet sichtbar ab",
      umrechnung && verlust,
      `roh ${roh.toFixed(2)} · g255 ${g255.toFixed(4)} · begrenzt ${beg.toFixed(2)}`
      + " — 1020 wird auf 255 eingeebnet, das ist der dokumentierte Verlust");
  }

  /* M5 · KEINE bildabhaengige Normierung.
     Dasselbe Muster, einmal auf einem Bild mit einer viel staerkeren Kante
     daneben. Bei bildabhaengiger Normierung (wie in scratchScreening.js)
     wuerde der Wert der schwachen Kante SINKEN, obwohl sich an ihr nichts
     geaendert hat. */
  {
    const schwach = graubild(41, 21, x => (x < 10 ? 100 : 120));
    const gemischt = graubild(41, 21, x => {
      if (x < 10) return 100;
      if (x < 25) return 120;
      return x < 30 ? 120 : 255;     /* zusaetzliche starke Kante rechts */
    });
    const messe = b => {
      const g = grauwert(b.daten, b.w, b.h);
      const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
      return kontrastImBereich(betrag, gueltig, b.w, b.h,
        { minX: 9, minY: 5, maxX: 9, maxY: 15 }, "roh").mittel;
    };
    const a = messe(schwach);
    const c = messe(gemischt);
    ok("M5", "Eine starke Kante anderswo im Bild veraendert den Messwert NICHT",
      Math.abs(a - c) < 1e-9,
      `allein ${a.toFixed(4)} · mit starker Kante daneben ${c.toFixed(4)}`
      + " — genau das kann edgeStrength aus dem Screening nicht");
  }

  /* M6 · Der Bildrand erfindet keine Kante. */
  {
    const b = graubild(12, 12, () => 200);
    const g = grauwert(b.daten, b.w, b.h);
    const { betrag, gueltig } = sobelBetrag(g, b.w, b.h);
    const randNurRand = kontrastImBereich(betrag, gueltig, b.w, b.h,
      { minX: 0, minY: 0, maxX: 0, maxY: 11 }, "roh");
    ok("M6", "Ein Bereich, der nur aus Randpixeln besteht, liefert kein Ergebnis",
      randNurRand.mittel === null && randNurRand.flaechePx === 0,
      randNurRand.grund || "");
  }

  /* M7 · Unbekannte Skala wird abgewiesen statt still angenommen. */
  {
    let abgewiesen = false;
    try {
      kontrastImBereich(new Float32Array(4), new Uint8Array(4), 2, 2,
        { minX: 0, minY: 0, maxX: 1, maxY: 1 }, "prozent");
    } catch (fehler) { abgewiesen = /unbekannte Skala/.test(fehler.message); }
    ok("M7", "Eine unbekannte Skala wird abgewiesen", abgewiesen);
  }

  console.log("");
  const durch = pruefungen.filter(p => !p.bestanden);
  console.log(`Bestanden: ${pruefungen.length - durch.length} / ${pruefungen.length}`);
  if (durch.length) console.log(`Durchgefallen: ${durch.map(p => p.id).join(", ")}`);
  console.log(`ERGEBNIS: ${durch.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
  console.log("");
  console.log("GRENZE: geprueft ist die Rechnung an synthetischen Bildern mit");
  console.log("analytisch bekanntem Gradienten. An realen Aufnahmen mit");
  console.log("unabhaengig gemessener Tiefe wurde NICHTS geprueft.");
  return durch.length ? 1 : 0;
}

/* ── Hauptprogramm ────────────────────────────────────────────────────── */

function argument(name, standard = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : standard;
}
const hatSchalter = name => process.argv.includes(name);

if (hatSchalter("--selbsttest")) {
  process.exit(selbsttest());
}

const bilddatei = argument("--bild");
if (!bilddatei) {
  console.error("Aufruf: node werkbank/kontrastmessung.mjs --selbsttest");
  console.error("   oder: --bild F.png [--bereiche roi.csv | --detektor]"
    + " [--skala roh|g255|g255_begrenzt] [--kante N] [--ausgabe k.csv]");
  process.exit(1);
}

const skala = argument("--skala", "roh");
if (!SKALEN[skala]) {
  console.error(`unbekannte Skala: ${skala} (erlaubt: ${Object.keys(SKALEN).join(", ")})`);
  process.exit(1);
}
const kante = Number(argument("--kante", "0"));
const bereichsdatei = argument("--bereiche");
const perDetektor = hatSchalter("--detektor");
if (!bereichsdatei && !perDetektor) {
  console.error("Entweder --bereiche (manuell markiert) oder --detektor angeben.");
  console.error("Beides mischen waere ein stiller Wechsel der Bereichsherkunft.");
  process.exit(1);
}
if (bereichsdatei && perDetektor) {
  console.error("--bereiche und --detektor zugleich: die Herkunft der Bereiche"
    + " muss eindeutig sein.");
  process.exit(1);
}

const roh = ladeBild(bilddatei);
const bild = kante > 0 ? aufLangeKante(roh.daten, roh.w, roh.h, kante) : roh;
const grau = grauwert(bild.daten, bild.w, bild.h);
const { betrag, gueltig } = sobelBetrag(grau, bild.w, bild.h);

let bereiche;
let quelle;
if (perDetektor) {
  /* Die Bereiche stammen vom Detektor. Sie sind damit NICHT unabhaengig:
     was der Detektor nicht findet, bekommt hier keinen Bereich und taucht
     in keiner Zeile auf. Fuer den Gesamtweg braucht es zusaetzlich
     unabhaengig erfasste Referenzbefunde — siehe kontrastauswertung.py. */
  const ergebnis = screenScratches(bild.daten, bild.w, bild.h);
  bereiche = (ergebnis.candidates || []).map((k, i) => ({
    befund_id: `D${String(i + 1).padStart(3, "0")}`,
    befundart: "UNBEKANNT",
    ...k.boundingBox,
  }));
  quelle = "DETEKTOR";
} else {
  bereiche = liesBereiche(bereichsdatei);
  quelle = "MANUELL";
}

const spalten = ["befund_id", "befundart", "kontrast", "kontrast_median",
  "kontrast_p95", "kontrast_skala", "bereich_quelle", "flaeche_px",
  "bild_breite", "bild_hoehe", "bild_datei", "hinweis"];
const zeilen = [spalten.join(",")];
for (const b of bereiche) {
  const r = kontrastImBereich(betrag, gueltig, bild.w, bild.h, b, skala);
  zeilen.push([
    b.befund_id, b.befundart,
    /* Leer statt 0, wenn nichts messbar war. Eine 0 waere ein Messwert. */
    r.mittel === null ? "" : r.mittel.toFixed(4),
    r.median === null ? "" : r.median.toFixed(4),
    r.p95 === null ? "" : r.p95.toFixed(4),
    skala, quelle, r.flaechePx, bild.w, bild.h,
    path.basename(bilddatei), r.grund ? `"${r.grund}"` : "",
  ].join(","));
}

const ausgabe = argument("--ausgabe");
const text = zeilen.join("\n") + "\n";
if (ausgabe) {
  fs.writeFileSync(ausgabe, text, "utf8");
  console.log(`${bereiche.length} Bereiche gemessen → ${ausgabe}`);
  console.log(`Skala ${skala} · Bereichsherkunft ${quelle} · `
    + `Bild ${bild.w}x${bild.h}${kante > 0 ? ` (auf lange Kante ${kante} gebracht)` : ""}`);
  console.log("Der Kontrast sagt nichts ueber die Tiefe. Fuer eine Aussage"
    + " braucht es unabhaengig gemessene Tiefen.");
} else {
  process.stdout.write(text);
}
