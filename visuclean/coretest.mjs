/* ─── VisuClean · Regressionssuite Analyse-Kern ────────────────────────────
   Aufruf:  node coretest.mjs
   Exitcode 0 = alles bestanden, 1 = mindestens ein Szenario durchgefallen.

   Zweck (CLAUDE.md, "Kein Feature ohne Test"):
   Jede in analysisCore.js dokumentierte Urteilsregel bekommt ein eigenes
   synthetisches Szenario. Die Bilder sind mit mulberry32 geseedet, also
   reproduzierbar — es gibt keinen Aufruf von Math.random().

   Die Sollwerte sind AM CODE GEMESSEN, nicht geschätzt: jedes Szenario
   nennt den Messwert, der die Regel auslöst. Ändert sich eine Kernschwelle,
   fällt hier ein Szenario durch — genau das ist der Regressionsschutz.

   Wichtigster Fall ist C9: ein Beleuchtungsgradient darf KEINEN Fehlalarm
   erzeugen. Das ist der Kernanspruch der Beleuchtungs-Ebnung in v3.
   C11/C12 sichern den Determinismus — die GAMP-5-Validierungsgrundlage.  */

import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";

const W = 160, H = 120;

/* Deterministischer PRNG — gleicher Seed, gleiches Bild, immer. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function bild(seed, fn) {
  const r = mulberry32(seed);
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const [rr, gg, bb] = fn(x, y, r);
    d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
  }
  return d;
}
const grund = (r, mitte = 150, streu = 6) => {
  const v = mitte + Math.round((r() - 0.5) * streu);
  return [v, v, v];
};
const inKreis = (x, y, cx, cy, r2) => (x - cx) ** 2 + (y - cy) ** 2 < r2;

/* ── Szenarien ─────────────────────────────────────────────────────────── */

const SZENARIEN = [
  {
    id: "C1", name: "Sauberer Edelstahl — alle drei Kriterien bestehen",
    daten: () => bild(42, (x, y, r) => grund(r)),
    pruefe: (f, v) => v.dry.pass && v.clean.pass && v.intact.pass && v.hints.length === 0,
    messwert: f => `lm ${f.lm.toFixed(3)} · bfr ${f.bfr.toFixed(4)} · wf ${f.wf.toFixed(4)}`,
  },
  {
    id: "C2", name: "Tropfenmuster — TROCKEN faellt, viele kleine Hell-Cluster",
    daten: () => bild(7, (x, y, r) => {
      for (const [cx, cy] of [[20, 20], [50, 30], [80, 25], [110, 60], [40, 80], [95, 90], [130, 40], [65, 55]])
        if (inKreis(x, y, cx, cy, 16)) return [250, 250, 252];
      return grund(r);
    }),
    pruefe: (f, v) => !v.dry.pass && f.droplets && !f.specular
      && /Tropfenmuster/.test(v.dry.message) && /Nachtrocknung/.test(v.dry.action),
    messwert: f => `bfr ${f.bfr.toFixed(4)} (>0.015 mit droplets) · droplets ${f.droplets}`,
  },
  {
    id: "C3", name: "Spiegelreflex — Ueberstrahlung statt Feuchtigkeit",
    daten: () => bild(8, (x, y, r) =>
      ((x - 80) ** 2 / 900 + (y - 60) ** 2 / 400 < 1) ? [252, 252, 254] : grund(r)),
    pruefe: (f, v) => !v.dry.pass && f.specular && !f.droplets
      && /Spiegelreflex/.test(v.dry.message) && /Streiflicht/.test(v.dry.action),
    messwert: f => `bfr ${f.bfr.toFixed(4)} · specular ${f.specular}`,
  },
  {
    id: "C4", name: "Organische Rueckstaende — flaechig warm, wf ueber 0.12",
    daten: () => bild(9, (x, y, r) =>
      (x > 40 && x < 120 && y > 30 && y < 90) ? [170, 130, 80] : grund(r)),
    pruefe: (f, v) => !v.clean.pass && f.wf > 0.12 && /Organische Rückstände/.test(v.clean.message),
    messwert: f => `wf ${f.wf.toFixed(4)} (>0.12) · warmBlocks ${f.warmBlocks}`,
  },
  {
    id: "C5", name: "Lokale Rueckstaende — zwei warme Zonen unter der Flaechenschwelle",
    daten: () => bild(10, (x, y, r) =>
      ((x > 20 && x < 40 && y > 20 && y < 40) || (x > 110 && x < 130 && y > 70 && y < 90))
        ? [175, 135, 85] : grund(r)),
    pruefe: (f, v) => !v.clean.pass && f.wf <= 0.12 && f.warmBlocks >= 2
      && /Lokale Rückstände/.test(v.clean.message),
    messwert: f => `wf ${f.wf.toFixed(4)} (<=0.12) · warmBlocks ${f.warmBlocks} (>=2)`,
  },
  {
    id: "C6", name: "Heller Belag — farbneutral, z. B. Pulverrueckstand",
    daten: () => bild(22, (x, y, r) => {
      for (const [cx, cy] of [[35, 35], [110, 45], [70, 85]])
        if (inKreis(x, y, cx, cy, 70)) return [188, 188, 190];
      return grund(r, 140);
    }),
    pruefe: (f, v) => !v.clean.pass && f.anomBright >= 2 && f.wf === 0
      && /Heller Belag/.test(v.clean.message),
    messwert: f => `anomBright ${f.anomBright} · anomDark ${f.anomDark} · wf ${f.wf.toFixed(4)}`,
  },
  {
    id: "C7", name: "Dunkle Ablagerung — farbneutral, dunkler als die Umgebung",
    daten: () => bild(23, (x, y, r) => {
      for (const [cx, cy] of [[35, 35], [110, 45], [70, 85]])
        if (inKreis(x, y, cx, cy, 70)) return [104, 104, 106];
      return grund(r);
    }),
    pruefe: (f, v) => !v.clean.pass && f.anomDark >= 2 && f.anomDark > f.anomBright
      && /Dunkle Ablagerung/.test(v.clean.message),
    messwert: f => `anomDark ${f.anomDark} · anomBright ${f.anomBright}`,
  },
  {
    id: "C8", name: "Zu dunkle Oberflaeche — Verdacht auf Ablagerungen",
    daten: () => bild(11, (x, y, r) => grund(r, 55)),
    pruefe: (f, v) => !v.clean.pass && f.lm < 0.28 && /Verdacht auf Ablagerungen/.test(v.clean.message),
    messwert: f => `lm ${f.lm.toFixed(4)} (<0.28)`,
  },
  {
    id: "C9", name: "Kratzer — laengliche duenne Struktur, INTAKT faellt",
    daten: () => bild(12, (x, y, r) =>
      (Math.abs(y - (30 + 0.35 * x)) < 1.2 && x > 15 && x < 145) ? [92, 92, 94] : grund(r)),
    pruefe: (f, v) => !v.intact.pass && f.scratches.length > 0
      && /Kratzer/.test(v.intact.message) && v.clean.pass && v.dry.pass,
    messwert: f => `scratches ${f.scratches.length} · tvFlat ${f.tvFlat.toFixed(5)}`,
  },
  {
    id: "C10", name: "KERNANSPRUCH v3 — Lichtgradient erzeugt KEINEN Fehlalarm",
    daten: () => bild(13, (x, y, r) => {
      const g = Math.round(70 * (x / W) + 60 * (y / H));
      const v = 110 + g + Math.round((r() - 0.5) * 6);
      return [v, v, v];
    }),
    pruefe: (f, v) => v.dry.pass && v.clean.pass && v.intact.pass,
    messwert: f => `tvFlat ${f.tvFlat.toFixed(5)} (<0.020) · anomDark ${f.anomDark} · warmBlocks ${f.warmBlocks}`,
  },
  {
    id: "C11", name: "Ambiguitaet — flaechig warm meldet Lichtfarbe statt still zu raten",
    daten: () => bild(21, (x, y, r) => {
      const v = 150 + Math.round((r() - 0.5) * 6);
      return [Math.round(v * 1.22), v, Math.round(v * 0.72)];
    }),
    pruefe: (f, v) => f.warmBlockFrac > 0.8
      && v.hints.some(h => /Flächig warme Färbung/.test(h) && /Lichtquelle/.test(h)),
    messwert: f => `warmBlockFrac ${f.warmBlockFrac.toFixed(3)} (>0.8)`,
  },
  {
    id: "C12", name: "Unschaerfe — Hinweis statt stillem Durchwinken",
    daten: () => bild(14, () => [150, 150, 150]),
    pruefe: (f, v) => f.gradMean < 0.006 && v.hints.some(h => /unscharf/.test(h)),
    messwert: f => `gradMean ${f.gradMean.toFixed(5)} (<0.006)`,
  },
  {
    id: "C13", name: "Dunkle Tropfenstruktur — Feuchtigkeit ohne helle Glanzpunkte",
    daten: () => bild(31, (x, y, r) => {
      const drop = r() < 0.13 || ((x % 19) < 2 && (y % 23) < 7);
      return drop ? grund(r, 82, 18) : grund(r, 152, 10);
    }),
    pruefe: (f, v) => !v.dry.pass && v.dry.code === "VISIBLE_MOISTURE_TEXTURE"
      && f.gradMean > 0.055 && f.edgeFrac > 0.08,
    messwert: f => `gradMean ${f.gradMean.toFixed(4)} · edgeFrac ${f.edgeFrac.toFixed(4)}`,
  },
];

/* ── Lauf ──────────────────────────────────────────────────────────────── */

const R = [];
const ok = (id, name, bestanden, info) => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

console.log("VisuClean · Regressionssuite Analyse-Kern");
console.log("");

const gemerkt = new Map();
for (const s of SZENARIEN) {
  const daten = s.daten();
  const f = computeFeatures(daten, W, H);
  const v = buildVerdicts(f);
  gemerkt.set(s.id, { daten, f, v });
  let bestanden = false, fehler = "";
  try { bestanden = !!s.pruefe(f, v); } catch (e) { fehler = " · Ausnahme: " + e.message; }
  ok(s.id, s.name, bestanden, s.messwert(f) + fehler);
}

console.log("");
console.log("── Determinismus (GAMP-5-Grundlage) ──");

/* D1: Skalare und Masken byte-identisch bei zweitem Lauf */
let d1 = true, d1Info = "";
for (const s of SZENARIEN) {
  const { daten, f } = gemerkt.get(s.id);
  const f2 = computeFeatures(daten, W, H);
  for (const k of ["lm", "bfr", "dfr", "vdfr", "wf", "wfRaw", "cv", "tvFlat",
                   "gradMean", "edgeFrac", "warmBlocks", "warmBlockFrac", "anomBright", "anomDark", "anomBlockFrac",
                   "specular", "droplets"]) {
    if (!Object.is(f[k], f2[k])) { d1 = false; d1Info = `${s.id}: ${k} ${f[k]} != ${f2[k]}`; }
  }
  if (f.scratches.length !== f2.scratches.length) { d1 = false; d1Info = `${s.id}: scratches`; }
  for (const m of ["maskBright", "maskWarm", "maskDark", "maskAnom"]) {
    const a = f.masks[m], b = f2.masks[m];
    if (a.length !== b.length) { d1 = false; d1Info = `${s.id}: ${m} Laenge`; break; }
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d1 = false; d1Info = `${s.id}: ${m}[${i}]`; break; }
  }
}
ok("D1", "Zweiter Lauf liefert bit-identische Merkmale und Masken", d1,
   d1 ? `${SZENARIEN.length} Szenarien · 4 Masken je Szenario` : d1Info);

/* D2: Urteile als JSON identisch (ohne Masken) */
let d2 = true, d2Info = "";
for (const s of SZENARIEN) {
  const { daten, v } = gemerkt.get(s.id);
  const v2 = buildVerdicts(computeFeatures(daten, W, H));
  if (JSON.stringify(v) !== JSON.stringify(v2)) { d2 = false; d2Info = s.id; }
}
ok("D2", "Zweiter Lauf liefert zeichengleiche Urteile", d2,
   d2 ? `${SZENARIEN.length} Szenarien` : `Abweichung in ${d2Info}`);

/* D3: gleicher Seed erzeugt dasselbe Bild — der Test selbst ist reproduzierbar */
const a1 = bild(42, (x, y, r) => grund(r)), a2 = bild(42, (x, y, r) => grund(r));
let d3 = a1.length === a2.length;
for (let i = 0; d3 && i < a1.length; i++) if (a1[i] !== a2[i]) d3 = false;
ok("D3", "Seed erzeugt reproduzierbare Testbilder (kein Math.random)", d3,
   `${W}x${H} · ${a1.length} Bytes`);

/* ── Ergebnis ──────────────────────────────────────────────────────────── */
console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
