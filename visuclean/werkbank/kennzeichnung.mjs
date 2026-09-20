/* ─── Werkbank · Vorgesehene Kennzeichnungen (BEFUND G) ────────────────────
   MESSEN, BEVOR GEBAUT WIRD. Der Auftraggeber hat die synthetische
   Reproduktion mit exakten Parametern vorgegeben und ausdruecklich
   verlangt, die Vergleichsfaelle zuerst zu fahren und die ZAHLEN zu
   berichten — nicht die naechste plausible Erklaerung einzubauen.

   Gemessen wird ausschliesslich mit den UNVERAENDERTEN Funktionen
   `computeFeatures`, `buildVerdicts` und `screenScratches` in ihren
   Standardparametern. Dieses Werkzeug aendert nichts; es zeichnet Bilder
   und liest Zahlen ab.

   Reproduktionsparameter (woertlich aus dem Reparaturauftrag):
     RGBA 480 x 640, Hintergrund R=G=B=180, Alpha=255,
     Markierungsfarbe R=G=B=60.
     QR: qrcode.create("VC-EQ-TP", { errorCorrectionLevel: "M" }),
         vier Pixel je Modul, Ursprung x=180/y=210, nur DUNKLE Module
         auf die unveraenderte Grundflaeche zeichnen.
     Text: 3x5-Glyphen, fuenf Pixel je Glyphenpixel, Zeichenabstand 20,
         Ursprung x=160/y=240.

   Die beiden Zusatzbefunde sind NICHT vorgegeben; sie stehen deshalb mit
   ihren Parametern im Bericht und sind bewusst einfach gehalten:
     Schmutz  ein warmer Fleck (R=150, G=120, B=70), Radius 45,
              Mittelpunkt x=330/y=430 — ausserhalb beider Kennzeichnungen.
              Der Radius ist ein TESTPARAMETER, keine Schwelle: er wurde
              so gewaehlt, dass der Fleck OHNE Kennzeichnung fuer sich
              allein durchfaellt (LOCAL_RESIDUE). Ein Kontrollbefund, der
              schon ohne Kennzeichnung PASS ergibt, kann nicht zeigen, ob
              eine Kennzeichnung ihn verdeckt. Gemessen: Radius 18 und 30
              ergeben PASS, ab 60 kommt zusaetzlich ein Kratzerbefund aus
              der Fleckkante dazu und vermischt die Faelle.
     Kratzer  eine dunkle Linie (R=G=B=70), Breite 2, von (60,120)
              nach (140,470) — ebenfalls ausserhalb.
     Randfall dieselbe Linie, verschoben an den rechten Rand des
              QR-Bereichs.

   Die Zahlen beschreiben den AUSGANGSFEHLER. Sie sind keine kalibrierten
   Zielwerte und keine Erkennungsrate echter Aetzungen: synthetische
   Rechtecke sind keine Gravur auf gebuerstetem Edelstahl. Reale
   Etiketten- und Aetzungsaufnahmen fehlen vollstaendig; die Abdeckung
   dafuer bleibt offen.

   Aufruf:  node werkbank/kennzeichnung.mjs [--png verzeichnis]           */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { computeFeatures, buildVerdicts } from "../src/analysisCore.js";
import { screenScratches } from "../src/scratchScreening.js";

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const W = 480, H = 640;
const GRUND = 180, MARKE = 60;

const leer = () => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = GRUND; data[i * 4 + 1] = GRUND; data[i * 4 + 2] = GRUND;
    data[i * 4 + 3] = 255;
  }
  return data;
};

const setze = (data, x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
};

/* ── Die QR-Kennzeichnung ─────────────────────────────────────────────── */
const qrModule = await QRCode.create("VC-EQ-TP", { errorCorrectionLevel: "M" });
const QR_PIXEL = 4, QR_X = 180, QR_Y = 210;
const zeichneQr = data => {
  const { size, data: module } = qrModule.modules;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      /* NUR dunkle Module. Die helle Flaeche bleibt unveraendert — ein
         weisser Rahmen waere eine zweite Aenderung am Bild und wuerde die
         Messung verfaelschen. */
      if (!module[my * size + mx]) continue;
      for (let dy = 0; dy < QR_PIXEL; dy++) {
        for (let dx = 0; dx < QR_PIXEL; dx++) {
          setze(data, QR_X + mx * QR_PIXEL + dx, QR_Y + my * QR_PIXEL + dy,
            MARKE, MARKE, MARKE);
        }
      }
    }
  }
  return { size, pixel: size * QR_PIXEL };
};

/* ── Die Schrift-Kennzeichnung ────────────────────────────────────────── */
const GLYPHEN = {
  I: ["111", "010", "010", "010", "111"],
  D: ["110", "101", "101", "101", "110"],
  1: ["010", "110", "010", "010", "111"],
  2: ["110", "001", "010", "100", "111"],
  3: ["110", "001", "010", "001", "110"],
  4: ["101", "101", "111", "001", "001"],
};
const TEXT = "ID1234", TEXT_PIXEL = 5, TEXT_ABSTAND = 20, TEXT_X = 160, TEXT_Y = 240;
const zeichneText = data => {
  [...TEXT].forEach((zeichen, index) => {
    const glyphe = GLYPHEN[zeichen];
    if (!glyphe) return;
    const x0 = TEXT_X + index * TEXT_ABSTAND;
    glyphe.forEach((zeile, gy) => {
      [...zeile].forEach((wert, gx) => {
        if (wert !== "1") return;
        for (let dy = 0; dy < TEXT_PIXEL; dy++) {
          for (let dx = 0; dx < TEXT_PIXEL; dx++) {
            setze(data, x0 + gx * TEXT_PIXEL + dx, TEXT_Y + gy * TEXT_PIXEL + dy,
              MARKE, MARKE, MARKE);
          }
        }
      });
    });
  });
  return { zeichen: TEXT.length, breite: (TEXT.length - 1) * TEXT_ABSTAND + 3 * TEXT_PIXEL };
};

/* ── Die beiden Zusatzbefunde ─────────────────────────────────────────── */
const SCHMUTZ = { x: 330, y: 430, r: 45, rgb: [150, 120, 70] };
const zeichneSchmutz = data => {
  for (let dy = -SCHMUTZ.r; dy <= SCHMUTZ.r; dy++) {
    for (let dx = -SCHMUTZ.r; dx <= SCHMUTZ.r; dx++) {
      if (dx * dx + dy * dy > SCHMUTZ.r * SCHMUTZ.r) continue;
      setze(data, SCHMUTZ.x + dx, SCHMUTZ.y + dy, ...SCHMUTZ.rgb);
    }
  }
};

const KRATZER = { x1: 60, y1: 120, x2: 140, y2: 470, breite: 2, wert: 70 };
const zeichneKratzer = (data, versatzX = 0) => {
  const { x1, y1, x2, y2, breite, wert } = KRATZER;
  const schritte = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let s = 0; s <= schritte; s++) {
    const t = s / schritte;
    const x = Math.round(x1 + (x2 - x1) * t) + versatzX;
    const y = Math.round(y1 + (y2 - y1) * t);
    for (let b = 0; b < breite; b++) setze(data, x + b, y, wert, wert, wert);
  }
};

/* Der Randfall: dieselbe Linie unmittelbar am rechten Rand des
   QR-Bereichs. `versatzX` verschiebt sie dorthin, ohne ihre Form zu
   aendern — sonst waere nicht die Lage, sondern die Linie der Unterschied. */
const qrBreite = qrModule.modules.size * QR_PIXEL;
const RAND_VERSATZ = QR_X + qrBreite + 3 - KRATZER.x1;

const faelle = [
  { id: "A", name: "saubere Flaeche, ohne Kennzeichnung", bauen: () => leer() },
  { id: "B", name: "saubere Flaeche + QR", bauen: () => { const d = leer(); zeichneQr(d); return d; } },
  { id: "C", name: "saubere Flaeche + Schrift", bauen: () => { const d = leer(); zeichneText(d); return d; } },
  { id: "D", name: "nur Schmutzfleck, ohne Kennzeichnung", bauen: () => { const d = leer(); zeichneSchmutz(d); return d; } },
  { id: "E", name: "QR + Schmutzfleck", bauen: () => { const d = leer(); zeichneQr(d); zeichneSchmutz(d); return d; } },
  { id: "F", name: "Schrift + Schmutzfleck", bauen: () => { const d = leer(); zeichneText(d); zeichneSchmutz(d); return d; } },
  { id: "G", name: "nur Kratzer, ohne Kennzeichnung", bauen: () => { const d = leer(); zeichneKratzer(d); return d; } },
  { id: "H", name: "QR + Kratzer", bauen: () => { const d = leer(); zeichneQr(d); zeichneKratzer(d); return d; } },
  { id: "I", name: "Schrift + Kratzer", bauen: () => { const d = leer(); zeichneText(d); zeichneKratzer(d); return d; } },
  { id: "J", name: "QR + Kratzer DIREKT am Regionsrand",
    bauen: () => { const d = leer(); zeichneQr(d); zeichneKratzer(d, RAND_VERSATZ); return d; } },
];

const zahl = (wert, stellen = 4) => Number.isFinite(wert) ? wert.toFixed(stellen) : "—";

const pngVerzeichnis = arg("png");
if (pngVerzeichnis) await mkdir(path.resolve(pngVerzeichnis), { recursive: true });

console.log("VisuClean · Werkbank: vorgesehene Kennzeichnungen (BEFUND G)");
console.log("==============================================================================");
console.log(`Bild ${W}x${H} · Grundflaeche ${GRUND} · Markierung ${MARKE}`);
console.log(`QR "VC-EQ-TP" ECC M · ${qrModule.modules.size} Module · ${QR_PIXEL} px/Modul`
  + ` · Ursprung ${QR_X}/${QR_Y} · ${qrBreite} px breit`);
console.log(`Text "${TEXT}" · 3x5-Glyphen · ${TEXT_PIXEL} px/Glyphenpixel`
  + ` · Abstand ${TEXT_ABSTAND} · Ursprung ${TEXT_X}/${TEXT_Y}`);
console.log(`Schmutz warm ${SCHMUTZ.rgb.join("/")} · Radius ${SCHMUTZ.r}`
  + ` · Mitte ${SCHMUTZ.x}/${SCHMUTZ.y}`);
console.log(`Kratzer ${KRATZER.wert} · Breite ${KRATZER.breite}`
  + ` · (${KRATZER.x1},${KRATZER.y1}) nach (${KRATZER.x2},${KRATZER.y2})`);
console.log("");

const zeilen = [];
for (const fall of faelle) {
  const data = fall.bauen();
  const f = computeFeatures(data, W, H);
  const v = buildVerdicts(f);
  const screening = screenScratches(data, W, H);
  const pixelHash = createHash("sha256").update(Buffer.from(data.buffer)).digest("hex");
  if (pngVerzeichnis) {
    await writeFile(path.join(path.resolve(pngVerzeichnis), `${fall.id}.raw`),
      Buffer.from(data.buffer));
  }
  zeilen.push({
    id: fall.id, name: fall.name,
    sauber: v.clean.pass ? "PASS" : v.clean.code,
    trocken: v.dry.pass ? "PASS" : v.dry.code,
    intakt: v.intact.pass ? "PASS" : v.intact.code,
    kandidaten: (screening?.candidates || []).length,
    gesamt: screening?.total ?? (screening?.candidates || []).length,
    wf: f.wf, warmBlocks: f.warmBlocks, cv: f.cv, vdfr: f.vdfr,
    tvFlat: f.tvFlat, edgeFrac: f.edgeFrac,
    scratches: Array.isArray(f.scratches) ? f.scratches.length : 0,
    pixelHash: pixelHash.slice(0, 16),
  });
}

const spalte = (text, breite) => String(text).padEnd(breite);
console.log(spalte("ID", 3) + spalte("Fall", 40) + spalte("Sauber", 16)
  + spalte("Intakt", 24) + spalte("Kand.", 7) + "Kratzer");
console.log("-".repeat(100));
for (const z of zeilen) {
  console.log(spalte(z.id, 3) + spalte(z.name, 40) + spalte(z.sauber, 16)
    + spalte(z.intakt, 24) + spalte(z.kandidaten, 7) + z.scratches);
}

console.log("");
console.log("Rohwerte, ungerundet gerechnet und auf vier Stellen ausgegeben:");
console.log(spalte("ID", 3) + spalte("wf", 10) + spalte("warmBlocks", 12)
  + spalte("cv", 10) + spalte("vdfr", 10) + spalte("tvFlat", 10)
  + spalte("edgeFrac", 10) + "Pixelhash");
console.log("-".repeat(100));
for (const z of zeilen) {
  console.log(spalte(z.id, 3) + spalte(zahl(z.wf), 10) + spalte(z.warmBlocks, 12)
    + spalte(zahl(z.cv), 10) + spalte(zahl(z.vdfr), 10) + spalte(zahl(z.tvFlat), 10)
    + spalte(zahl(z.edgeFrac), 10) + z.pixelHash);
}

/* ── Was die Zahlen beantworten, und was nicht ─────────────────────────── */
const hole = id => zeilen.find(z => z.id === id);
const [a, b, c, d, e, ff, g, h, i, j] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map(hole);

console.log("");
console.log("Ablesung");
console.log("--------");
console.log(`1. Kennzeichnung ALLEIN: ohne ${a.sauber}/${a.kandidaten} Kandidaten,`
  + ` mit QR ${b.sauber}/${b.kandidaten}, mit Schrift ${c.sauber}/${c.kandidaten}.`);
console.log(`2. Zusatzbefund OHNE Kennzeichnung: Schmutz ${d.sauber},`
  + ` Kratzer ${g.intakt} (${g.scratches} Struktur(en), ${g.kandidaten} Kandidaten).`);
console.log(`3. Zusatzbefund MIT Kennzeichnung: QR+Schmutz ${e.sauber},`
  + ` Schrift+Schmutz ${ff.sauber}, QR+Kratzer ${h.intakt} (${h.scratches}),`
  + ` Schrift+Kratzer ${i.intakt} (${i.scratches}).`);
console.log(`4. Befund am Regionsrand: ${j.intakt} (${j.scratches} Struktur(en),`
  + ` ${j.kandidaten} Kandidaten).`);

/* ── Was der VORHANDENE Zuschnitt leistet ──────────────────────────────
   Leitplanke 9a kennt genau einen belegten Ausschluss: die Prueffläche
   wird VOR jeder Rechnung zugeschnitten, und Pixel ausserhalb gehen in
   nichts ein — auch nicht in die Grauwelt-Korrektur. Fuellen (schwarz
   oder mit einem Mittelwert) ist ausdruecklich KEIN Ausschluss.

   Bevor irgendetwas Neues gebaut wird, gehoert deshalb gemessen, wie weit
   dieses vorhandene Mittel traegt. Zugeschnitten wird hier genau so, wie
   die App es tut: ein Rechteck, das Bild wird darauf reduziert, und
   gerechnet wird nur noch darin. */
const zuschnitt = (data, x0, y0, x1, y1) => {
  const bw = x1 - x0, bh = y1 - y0;
  const aus = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const q = ((y0 + y) * W + (x0 + x)) * 4, z = (y * bw + x) * 4;
      aus[z] = data[q]; aus[z + 1] = data[q + 1];
      aus[z + 2] = data[q + 2]; aus[z + 3] = 255;
    }
  }
  return { data: aus, w: bw, h: bh };
};

const zuschnitte = [
  { id: "K", name: "QR + Kratzer, Zuschnitt LINKS neben dem QR",
    quelle: "H", rechteck: [0, 0, 170, H] },
  { id: "L", name: "QR + Schmutz, Zuschnitt LINKS neben dem QR",
    quelle: "E", rechteck: [0, 0, 170, H] },
  { id: "M", name: "QR + Schmutz, Zuschnitt RECHTS neben dem QR",
    quelle: "E", rechteck: [270, 0, W, H] },
  { id: "N", name: "QR + Kratzer, Zuschnitt RECHTS neben dem QR",
    quelle: "H", rechteck: [270, 0, W, H] },
];

console.log("");
console.log("Der vorhandene Zuschnitt (Leitplanke 9a), auf dieselben Bilder angewandt:");
console.log(spalte("ID", 3) + spalte("Fall", 46) + spalte("Sauber", 16)
  + spalte("Intakt", 24) + "Kratzer");
console.log("-".repeat(100));
const zuschnittZeilen = [];
for (const z of zuschnitte) {
  const quelle = faelle.find(f => f.id === z.quelle);
  const [x0, y0, x1, y1] = z.rechteck;
  const aus = zuschnitt(quelle.bauen(), x0, y0, x1, y1);
  const f = computeFeatures(aus.data, aus.w, aus.h);
  const v = buildVerdicts(f);
  const zeile = {
    id: z.id, name: z.name,
    sauber: v.clean.pass ? "PASS" : v.clean.code,
    intakt: v.intact.pass ? "PASS" : v.intact.code,
    scratches: Array.isArray(f.scratches) ? f.scratches.length : 0,
    flaeche: `${aus.w}x${aus.h}`,
  };
  zuschnittZeilen.push(zeile);
  console.log(spalte(z.id, 3) + spalte(z.name, 46) + spalte(zeile.sauber, 16)
    + spalte(zeile.intakt, 24) + zeile.scratches);
}

console.log("");
console.log("Lage der Elemente im Bild (x-Bereiche):");
console.log(`  QR        ${QR_X} bis ${QR_X + qrBreite}`);
console.log(`  Schrift   ${TEXT_X} bis ${TEXT_X + (TEXT.length - 1) * TEXT_ABSTAND + 3 * TEXT_PIXEL}`);
console.log(`  Kratzer   ${KRATZER.x1} bis ${KRATZER.x2 + KRATZER.breite}`);
console.log(`  Schmutz   ${SCHMUTZ.x - SCHMUTZ.r} bis ${SCHMUTZ.x + SCHMUTZ.r}`);

console.log("");
console.log("Nicht beantwortet: reale Aetzungen und Etiketten auf gebuerstetem");
console.log("Edelstahl. Diese Bilder sind Rechtecke auf einer konstanten Flaeche;");
console.log("sie belegen den Fehlalarm, nicht die Erkennungsleistung.");
