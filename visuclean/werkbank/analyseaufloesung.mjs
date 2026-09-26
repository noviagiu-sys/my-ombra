/* ─── VisuClean · Werkbank · Analyse-Auflösung ────────────────────────────
   Was verliert die Analyse dadurch, dass sie das GESPEICHERTE Foto auf
   640 Pixel lange Kante herunterrechnet — und was kostet es, das zu lassen?

   ANLASS
   Im echten Prüflauf kam eine sichtbar von Tropfen bedeckte Fläche als
   "trocken, bestanden" heraus. Das Aufnahmeprofil meldete 900x1600 auf
   360x640. rc.4.24 fängt diesen Fall ab (Trockenheit wird "nicht
   bewertbar"), aber die Ursache steht unverändert im Code.

   DER BEFUND, DER DIESE MESSUNG NÖTIG MACHT
   Es sind ZWEI verschiedene Stellen, und sie haben nichts miteinander zu tun:

     compressPhoto()  speichert mit bis zu 1600 px langer Kante bei
                      Qualität 0.86. Das 1-MB-Budget betrifft NUR die Ablage.
     analyzeImage()   rechnet das gespeicherte Foto DANACH auf 640 px
                      herunter — allein für die Analyse (`const max = 640`).

   Die Information ist also vorhanden und wird verworfen. Es gibt hier
   keinen Abtausch gegen Bytes: die Ablage ist schon entschieden. Der
   einzige Preis einer höheren Analyse-Auflösung ist RECHENZEIT auf dem
   Telefon. Genau die wird hier mitgemessen.

   WAS GEMESSEN WIRD
   Die Kette wird so nachgestellt, wie die App sie durchläuft:
     Quellbild -> JPEG Qualität 0.86 (Ablage) -> dekodieren
               -> auf lange Kante L verkleinern (Analyse)
               -> computeFeatures + buildVerdicts + screenScratches
   Für jedes L: Rechenzeit, die kantenabhängigen Merkmale, das
   Trockenheits-Urteil und die Kandidaten.

   Aufruf:  node werkbank/analyseaufloesung.mjs [ordner]
   Ohne Ordner läuft nur das synthetische Prüfbild.                      */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { computeFeatures, buildVerdicts } from "../src/analysisCore.js";
import { screenScratches } from "../src/scratchScreening.js";
import { aufLangeKante, saatZufall, wiedergefunden } from "./bildhilfen.mjs";

const projekt = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* Die Stufen. 640 ist der heutige Wert, "voll" bedeutet: gar nicht
   verkleinern, also mit der gespeicherten Auflösung rechnen. */
const STUFEN = [640, 800, 1024, 1280, Infinity];

/* Ablagequalität und Grössengrenze aus compressPhoto(). */
const ABLAGE_QUALITAET = 86;   // 0.86 in der App
const ABLAGE_MAX_KANTE = 1600;

/* ── Synthetisches Prüfbild ──────────────────────────────────────────────
   Warum synthetisch: die vorliegenden Realaufnahmen sind 480x640 und damit
   UNTER der 640er-Grenze — die Analyse verkleinert sie gar nicht erst. An
   ihnen ist der Verlust also nicht messbar. Gebraucht wird eine Aufnahme
   in der Grösse, die das Telefon tatsächlich liefert.

   Das Bild trägt drei Dinge mit bekannter Wahrheit:
     - gebürsteter Edelstahl (feine parallele Schliffspuren)
     - Tropfen: viele kleine linsenförmige Strukturen. Sie treiben
       edgeFrac und gradMean, also genau den einzigen Weg, der Nässe OHNE
       Glanzpunkte erkennt (VISIBLE_MOISTURE_TEXTURE).
     - vier Querkratzer bekannter Breite (1, 2, 3 und 5 px bei 900x1600)   */
function pruefbild(w = 900, h = 1600) {
  const d = new Uint8ClampedArray(w * h * 4);
  const wuerfel = saatZufall(20260912);

  for (let i = 0; i < w * h; i++) {
    const g = 148 + Math.round((wuerfel() - 0.5) * 6);
    d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g; d[i * 4 + 3] = 255;
  }
  /* Schliffspuren: feine, fast senkrechte Linien mit kleiner Amplitude. */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const phase = (x + y * 0.06) % 5;
      if (phase < 1) {
        const o = (y * w + x) * 4;
        const v = Math.max(0, d[o] - 9);
        d[o] = v; d[o + 1] = v; d[o + 2] = v;
      }
    }
  }
  /* Tropfen: kleine Linsen mit dunklem Rand und hellem Kern. Kein
     grossflächiger Glanz — genau der Fall, den nur die Texturregel fängt. */
  const tropfen = 900;
  for (let t = 0; t < tropfen; t++) {
    const cx = Math.floor(wuerfel() * w);
    const cy = Math.floor(wuerfel() * h);
    const r = 2 + Math.floor(wuerfel() * 4);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > r) continue;
        const o = (y * w + x) * 4;
        /* Rand dunkel, Mitte etwas heller als der Untergrund. */
        const delta = dist > r - 1.2 ? -26 : Math.round(10 * (1 - dist / r));
        const v = Math.max(0, Math.min(255, d[o] + delta));
        d[o] = v; d[o + 1] = v; d[o + 2] = v;
      }
    }
  }
  /* Vier Querkratzer bekannter Breite, quer zur Schliffrichtung. */
  const kratzer = [1, 2, 3, 5];
  kratzer.forEach((breite, index) => {
    const y0 = Math.round(h * (0.2 + index * 0.18));
    for (let x = Math.round(w * 0.12); x < Math.round(w * 0.88); x++) {
      const y = y0 + Math.round((x - w / 2) * 0.06);
      for (let b = 0; b < breite; b++) {
        const yy = y + b;
        if (yy < 0 || yy >= h) continue;
        const o = (yy * w + x) * 4;
        const v = Math.max(0, d[o] - 60);
        d[o] = v; d[o + 1] = v; d[o + 2] = v;
      }
    }
  });
  return { daten: d, w, h, kratzerBreiten: kratzer };
}

/* ── Die Ablagestufe der App nachstellen ────────────────────────────────
   Das Bild, das die Analyse zu sehen bekommt, ist NIE das Original: es ist
   ein dekodiertes JPEG. Diese Stufe gehört also in die Messung, sonst misst
   man eine Kette, die es so nicht gibt.

   HINWEIS ZUR GENAUIGKEIT: jpeg-js ist nicht bit-gleich mit dem Encoder
   eines Browsers. Der VERLAUF ist übertragbar, die absoluten Bytezahlen
   können um einige Prozent abweichen. Beides ist Baseline-JPEG mit den
   Standard-Quantisierungstabellen.                                      */
function durchAblage(daten, w, h) {
  const klein = aufLangeKante(daten, w, h, ABLAGE_MAX_KANTE);
  const kodiert = jpeg.encode(
    { data: Buffer.from(klein.daten.buffer, klein.daten.byteOffset, klein.daten.length),
      width: klein.w, height: klein.h },
    ABLAGE_QUALITAET);
  const zurueck = jpeg.decode(kodiert.data, { useTArray: true });
  return {
    daten: new Uint8ClampedArray(zurueck.data.buffer, zurueck.data.byteOffset, zurueck.data.length),
    w: zurueck.width, h: zurueck.height, bytes: kodiert.data.length,
  };
}

/* ── Ein Bild über alle Stufen messen ───────────────────────────────── */

function messe(name, quelle) {
  const abgelegt = durchAblage(quelle.daten, quelle.w, quelle.h);
  console.log(`${name}`);
  console.log(`  Quelle ${quelle.w}x${quelle.h} · abgelegt als JPEG q${ABLAGE_QUALITAET}: `
    + `${abgelegt.w}x${abgelegt.h}, ${(abgelegt.bytes / 1024).toFixed(0)} KB `
    + `(Budget 1024 KB${abgelegt.bytes > 1024 * 1024 ? " · UEBERSCHRITTEN" : ""})`);
  console.log("");
  console.log("  Analyse bei   Groesse        ms   edgeFrac  gradMean    tvFlat  "
    + "Trocken             Kand.  Spitze-10");

  let referenz = null;
  const zeilen = [];

  for (const stufe of STUFEN) {
    const k = stufe === Infinity
      ? { daten: abgelegt.daten, w: abgelegt.w, h: abgelegt.h }
      : aufLangeKante(abgelegt.daten, abgelegt.w, abgelegt.h, stufe);

    /* Aufwaermen: der erste Lauf traegt die Uebersetzungskosten der
       Laufzeitumgebung. Ohne das misst die erste Zeile etwas anderes als
       alle folgenden — im ersten Lauf dieser Messung standen 160 ms gegen
       125 ms fuer das GROESSERE Bild. */
    computeFeatures(k.daten, k.w, k.h);
    const t0 = process.hrtime.bigint();
    const f = computeFeatures(k.daten, k.w, k.h);
    const urteil = buildVerdicts(f);
    const s = screenScratches(k.daten, k.w, k.h);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;

    if (referenz === null) referenz = null; /* gesetzt nach der Schleife */
    zeilen.push({ stufe, k, f, urteil, s, ms });
  }

  /* Referenz ist die volle Auflösung — die letzte Stufe. */
  const voll = zeilen[zeilen.length - 1];
  const spitzeVoll = voll.s.candidates.slice(0, 10);

  for (const z of zeilen) {
    const ueberlebt = z === voll
      ? spitzeVoll.length
      : spitzeVoll.filter(c =>
        wiedergefunden(c, voll.k.w, voll.k.h, z.s.candidates, z.k.w, z.k.h)).length;
    const etikett = z.stufe === Infinity ? "voll" : String(z.stufe);
    const trocken = z.urteil.dry.pass ? "PASS" : z.urteil.dry.code;
    console.log(
      `  ${etikett.padStart(11)}`
      + `   ${`${z.k.w}x${z.k.h}`.padEnd(11)}`
      + `${z.ms.toFixed(0).padStart(5)}`
      + `${z.f.edgeFrac.toFixed(4).padStart(11)}`
      + `${z.f.gradMean.toFixed(4).padStart(10)}`
      + `${z.f.tvFlat.toFixed(4).padStart(10)}`
      + `  ${trocken.padEnd(20)}`
      + `${String(z.s.candidates.length).padStart(5)}`
      + `${`${ueberlebt}/${spitzeVoll.length}`.padStart(11)}`);
  }
  console.log("");
}

/* ── Lauf ───────────────────────────────────────────────────────────── */

console.log("VisuClean · Analyse-Aufloesung");
console.log("");
console.log("Gemessen wird die Kette der App: Ablage als JPEG q0.86, dekodieren,");
console.log("dann auf die Analyse-Kante verkleinern. Die 640 stehen in");
console.log("analyzeImage(); mit dem 1-MB-Budget haben sie nichts zu tun — das");
console.log("betrifft nur compressPhoto(). Der einzige Preis einer hoeheren");
console.log("Analyse-Aufloesung ist Rechenzeit.");
console.log("");
console.log("Die Trocken-Kaskade: Glanzpunkte (bfr > 0.04), sonst Textur");
console.log("(gradMean > 0.055 UND edgeFrac > 0.08), sonst dunkel-nass, sonst PASS.");
console.log("");
console.log("-".repeat(100));
console.log("");

const bild = pruefbild();
messe(`Pruefbild 900x1600 (synthetisch, Saat 20260912)\n`
  + `  bekannte Wahrheit: nass (900 Tropfen ohne Glanz) · `
  + `Kratzerbreiten ${bild.kratzerBreiten.join(", ")} px`, bild);

/* ── Wann kippt ein nasses Teil auf "trocken"? ──────────────────────────
   Das ist die Frage, an der der echte Fehlbefund hing. Die beiden nassen
   Realaufnahmen werden korrekt als nass erkannt — bei 480x640. Hier wird
   schrittweise verkleinert, bis die Regel nicht mehr greift.

   Der gesuchte Wert ist die lange Kante, unterhalb derer eine nachweislich
   nasse Flaeche als trocken durchgeht.                                  */
function naessekaskade(ordner) {
  const nasse = fs.readdirSync(ordner)
    .filter(n => /wet.*\.png$/i.test(n)).sort();
  if (!nasse.length) return;

  console.log("-".repeat(100));
  console.log("");
  console.log("WANN KIPPT NASS AUF TROCKEN");
  console.log("");
  console.log("Beide Aufnahmen sind bei voller Aufloesung korrekt als nass erkannt.");
  console.log("Verkleinert wird wie im Aufnahmeweg der App.");
  console.log("");

  for (const name of nasse) {
    const png = PNG.sync.read(fs.readFileSync(path.join(ordner, name)));
    const abgelegt = durchAblage(new Uint8ClampedArray(png.data), png.width, png.height);
    console.log(`${name}  (abgelegt ${abgelegt.w}x${abgelegt.h})`);
    console.log("  lange Kante   Groesse       edgeFrac  gradMean   Tor 0.08 / 0.055   Urteil");
    let kipppunkt = null;
    for (const kante of [640, 560, 480, 420, 360, 320, 280, 240, 200, 160]) {
      const k = aufLangeKante(abgelegt.daten, abgelegt.w, abgelegt.h, kante);
      const f = computeFeatures(k.daten, k.w, k.h);
      const u = buildVerdicts(f);
      const tor = `${f.edgeFrac > 0.08 ? "ja" : "NEIN"} / ${f.gradMean > 0.055 ? "ja" : "NEIN"}`;
      const urteil = u.dry.pass ? "PASS (trocken)" : u.dry.code;
      if (u.dry.pass && kipppunkt === null) kipppunkt = kante;
      console.log(
        `  ${String(kante).padStart(11)}`
        + `   ${`${k.w}x${k.h}`.padEnd(11)}`
        + `${f.edgeFrac.toFixed(4).padStart(9)}`
        + `${f.gradMean.toFixed(4).padStart(10)}`
        + `   ${tor.padEnd(18)} ${urteil}`);
    }
    console.log(kipppunkt
      ? `  --> kippt bei ${kipppunkt} px langer Kante auf "trocken"`
      : "  --> kippt in diesem Bereich nicht");
    console.log("");
  }
}

const ordner = process.argv[2];
if (ordner && fs.existsSync(ordner)) {
  for (const name of fs.readdirSync(ordner).filter(n => /\.png$/i.test(n)).sort()) {
    const png = PNG.sync.read(fs.readFileSync(path.join(ordner, name)));
    messe(`${name} (real)`, { daten: new Uint8ClampedArray(png.data), w: png.width, h: png.height });
  }
  naessekaskade(ordner);
  console.log("HINWEIS zu den Realaufnahmen: sie sind 480x640 und liegen damit UNTER");
  console.log("der 640er-Grenze. Die Analyse verkleinert sie gar nicht — alle Stufen");
  console.log("zeigen deshalb dasselbe Bild. Das ist kein Fehler der Messung, sondern");
  console.log("der Grund, warum ein synthetisches Bild in Telefongroesse noetig war.");
} else {
  console.log(`Kein Ordner angegeben — nur das Pruefbild gelaufen.`);
  console.log(`Mit Realaufnahmen:  node werkbank/analyseaufloesung.mjs ${
    path.relative(process.cwd(), path.join(projekt, "tests", "fixtures", "real"))}`);
}
