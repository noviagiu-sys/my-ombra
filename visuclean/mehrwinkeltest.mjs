/* ─── VisuClean 8.3.0-rc.4.5.mehrwinkel.1 · Mehrwinkel-Fusion ──────────────
   Aufruf: node mehrwinkeltest.mjs

   Safety first (MA-01..03), then registration (MA-04..06), then detection
   (MA-07..13). Suite must pass on rc.4.5 alone — no import from rc.4.6.
   MA-08 uses a test-local minimal detector, never screenScratches.        */

import { buildCheckpoints, overallResult } from "./src/assessment.js";
import { runLocalEngine } from "./src/analysisEngines.js";
import { captureProfile } from "./src/decision.js";
import { aggregateResults, deriveSystemDecision, lightLevel as lightLevelDomain } from "./src/domain.js";
import {
  SCALE_CALIBRATION, REGISTRATION_RESIDUAL_MAX_PX,
  homographyFromCorners, warpToPlane, verifyByRedetect,
  applyToPoint, warpCoverage, FIELD_FACTOR, WARP_COVERAGE_MIN,
} from "./src/registration.js";
import {
  fuseAngles, scoreByPersistence, POSE_SPREAD_MIN, PERSISTENCE_HIGH,
  PERSISTENCE_EDGE_THRESHOLD, POSE_SPREAD_WARNING, NO_DETECTOR_MESSAGE,
} from "./src/multiAngle.js";
import { localBinaryPattern, orientationHistogram } from "./src/textureFeatures.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const R = [];
const ok = (id, name, bestanden, info = "") => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

function rng(a) {
  return () => {
    a |= 0; a = a + 0x9E3779B9 | 0;
    let t = Math.imul(a ^ a >>> 16, 0x85EBCA6B);
    t = Math.imul(t ^ t >>> 13, 0xC2B2AE35);
    return ((t ^ t >>> 16) >>> 0) / 4294967296;
  };
}

function makeImage(w, h, paint) {
  const d = new Uint8ClampedArray(w * h * 4);
  const r = rng(0xA11CE);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [rv, gv, bv] = paint(x, y, r);
      d[i] = rv; d[i + 1] = gv; d[i + 2] = bv; d[i + 3] = 255;
    }
  }
  return d;
}

function baseMetal(x, y, r, mean = 170) {
  const v = mean + Math.round((r() - 0.5) * 6);
  return [v, v, v + 1];
}

/** Fixed vertical scratch + gloss stripe at glossX. */
function seriesFrame(w, h, glossX, { dark = false, mean = 170 } = {}) {
  const scratchX = Math.floor(w * 0.40);
  return makeImage(w, h, (x, y, r) => {
    let [a, b, c] = baseMetal(x, y, r, dark ? 20 : mean);
    if (dark) return [a, a, a];
    if (Math.abs(x - scratchX) <= 1 && y > h * 0.1 && y < h * 0.9) {
      a = 28; b = 28; c = 30;
    }
    if (Math.abs(x - glossX) <= 2 && y > h * 0.15 && y < h * 0.85) {
      a = 245; b = 245; c = 248;
    }
    return [a, b, c];
  });
}

function meanBrightness(data) {
  let s = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    s += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    n++;
  }
  return n ? s / n : 0;
}

/**
 * Test-local minimal detector — NEVER imports screenScratches / rc.4.6.
 * Finds vertical high-contrast columns as bounding boxes.
 */
function minimalColumnDetector(imageLike) {
  const { data, width: w, height: h } = imageLike;
  const colScore = new Float64Array(w);
  for (let x = 1; x < w - 1; x++) {
    let s = 0;
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
      const i = (y * w + x) * 4;
      const L = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const iL = ((y * w + x - 1) * 4);
      const iR = ((y * w + x + 1) * 4);
      const Lleft = (0.299 * data[iL] + 0.587 * data[iL + 1] + 0.114 * data[iL + 2]) / 255;
      const Lright = (0.299 * data[iR] + 0.587 * data[iR + 1] + 0.114 * data[iR + 2]) / 255;
      s += Math.abs(L - Lleft) + Math.abs(L - Lright);
    }
    colScore[x] = s;
  }
  const candidates = [];
  const used = new Uint8Array(w);
  for (let round = 0; round < 6; round++) {
    let bestX = -1, bestS = 0;
    for (let x = 2; x < w - 2; x++) {
      if (used[x]) continue;
      if (colScore[x] > bestS) { bestS = colScore[x]; bestX = x; }
    }
    if (bestX < 0 || bestS < 2) break;
    for (let dx = -3; dx <= 3; dx++) {
      const xx = bestX + dx;
      if (xx >= 0 && xx < w) used[xx] = 1;
    }
    candidates.push({
      boundingBox: {
        minX: Math.max(0, bestX - 2),
        maxX: Math.min(w - 1, bestX + 2),
        minY: Math.floor(h * 0.15),
        maxY: Math.floor(h * 0.85),
      },
      relevanceScore: 0.55,
      source: "TEST_MINIMAL",
    });
  }
  return { candidates };
}

console.log("VisuClean · Mehrwinkel-Fusion (8.3.0-rc.4.5.mehrwinkel.1)\n");

const W = 160, H = 120;
const glossPositions = [
  Math.floor(W * 0.55),
  Math.floor(W * 0.70),
  Math.floor(W * 0.85),
];

function frameBundle(seq, glossX, shape, opts = {}) {
  const data = seriesFrame(W, H, glossX, opts);
  return {
    sequenceIndex: seq,
    data,
    width: W,
    height: H,
    registered: opts.registered !== false,
    residualPx: opts.residualPx ?? 0.4,
    labelShape: shape,
    brightness: meanBrightness(data),
  };
}

const shapesDiverse = [
  { aspect: 1.00, shear: 0.02, widthPx: 40, heightPx: 40 },
  { aspect: 1.25, shear: 0.18, widthPx: 48, heightPx: 38 },
  { aspect: 0.82, shear: 0.30, widthPx: 36, heightPx: 44 },
];
const shapesSame = [
  { aspect: 1.00, shear: 0.05, widthPx: 40, heightPx: 40 },
  { aspect: 1.01, shear: 0.06, widthPx: 40, heightPx: 40 },
  { aspect: 0.99, shear: 0.05, widthPx: 40, heightPx: 40 },
];

const seriesDiverse = glossPositions.map((gx, i) =>
  frameBundle(i, gx, shapesDiverse[i]));

/* Der Ergebnissatz, wie ihn `src/App.jsx` baut: Urteile plus Pruefpunkte aus
   denselben Merkmalen. `aggregateResults` liest genau diese Felder.        */
function appResult(local) {
  return {
    ...local.verdict,
    checkpoints: buildCheckpoints(local.features, local.verdict),
    lm: local.features.lm,
  };
}

const bboxKey = c =>
  `${c.boundingBox.minX},${c.boundingBox.minY},${c.boundingBox.maxX},${c.boundingBox.maxY}`;

/* ── MA-01: fusion does not change checkpoint / finalDecision ───────────

   REPARIERT in …mehrwinkel.3. Die Vorfassung rief zweimal
   buildCheckpoints(local.features, local.verdict) mit denselben Argumenten
   auf und verglich die Ergebnisse — immer gleich, unabhaengig davon, was
   die Fusion tut. Sie blieb gruen, als der Prueflingsaufruf ganz entfernt
   wurde.

   Jetzt bekommt die Fusion die Gelegenheit, das Urteil zu aendern: ein
   absichtlich extremes Fusionsergebnis (jede Persistenz am Anschlag, viele
   Kandidaten mit hohem Score, meaningful=true) laeuft durch die Naht, und
   danach muss der volle Entscheidungspfad — aggregateResults und
   deriveSystemDecision — bit-identisch sein. Zusaetzlich wird zugesichert,
   dass die Fusion ueberhaupt etwas geliefert hat; sonst wuerde der Test
   auch ohne Pruefling bestehen.                                         */
{
  const locals = seriesDiverse.map(f => runLocalEngine(f.data, W, H));
  const results = locals.map(appResult);

  const vorher = JSON.stringify({
    checkpoints: results.map(r => r.checkpoints.map(c => `${c.id}:${c.status}:${c.code}`)),
    overall: results.map(r => overallResult(r.checkpoints).status),
    system: deriveSystemDecision(aggregateResults(results)),
  });

  /* Ein Detektor, der maximal laut ist: viele Kandidaten, hoechster Score. */
  const lauterDetektor = imageLike => {
    const basis = minimalColumnDetector(imageLike).candidates;
    return {
      candidates: [
        ...basis.map(c => ({ ...c, relevanceScore: 1 })),
        {
          boundingBox: { minX: 0, minY: 0, maxX: W - 1, maxY: H - 1 },
          relevanceScore: 1, source: "TEST_EXTREME",
        },
      ],
    };
  };

  const fusion = fuseAngles(seriesDiverse);
  const extrem = Object.freeze({
    ...fusion,
    persistence: fusion.persistence.map(() => 255),
    meaningful: true,
    warning: null,
  });
  const scored = scoreByPersistence(extrem, lauterDetektor);

  const nachher = JSON.stringify({
    checkpoints: results.map(r => r.checkpoints.map(c => `${c.id}:${c.status}:${c.code}`)),
    overall: results.map(r => overallResult(r.checkpoints).status),
    system: deriveSystemDecision(aggregateResults(results)),
  });

  const fusionHatGeliefert = scored.status === "SCORED" && scored.candidates.length > 0;

  ok("MA-01", "Fusion aendert kein Urteil (Checkpoints + finalDecision)",
    fusionHatGeliefert && vorher === nachher,
    fusionHatGeliefert
      ? `Fusion lieferte ${scored.candidates.length} Kandidaten bei persistence=255 · Entscheidungspfad unveraendert (${JSON.parse(nachher).system.status})`
      : `Fusion lieferte nichts (status=${scored.status}) — der Test kann nichts belegen`);
}

/* ── MA-02: candidate set only grows ────────────────────────────────────

   REPARIERT in …mehrwinkel.3. Die Vorfassung prueffte
   `coreCount + N >= coreCount && N >= 0` — fuer jedes N >= 0 arithmetisch
   wahr. Sie blieb gruen, als scoreByPersistence jeden Kandidaten verwarf.

   Jetzt Mengeninklusion statt Summe: die Kandidaten des Detektors werden im
   Test unabhaengig bestimmt, und JEDER davon muss in der Ausgabe der Naht
   wiederauffindbar sein — ueber Bounding-Box-Identitaet, nicht ueber die
   Anzahl. Verschwindet ein einziger, faellt der Test.                    */
{
  const fusion = fuseAngles(seriesDiverse);
  const roh = minimalColumnDetector(fusion.fusedImage).candidates;
  const scored = scoreByPersistence(fusion, minimalColumnDetector);

  const ausgabe = new Set(scored.candidates.map(bboxKey));
  const verloren = roh.map(bboxKey).filter(k => !ausgabe.has(k));

  ok("MA-02", "Fusion entfernt keinen Kandidaten — Menge kann nur wachsen",
    roh.length > 0
    && verloren.length === 0
    && scored.candidates.length >= roh.length,
    roh.length === 0
      ? "Detektor fand nichts — der Test kann nichts belegen"
      : `Detektor ${roh.length} → Naht ${scored.candidates.length} · verloren ${verloren.length}`);
}

/* ── MA-03: excluded frame never improves worst-result-wins ─────────────

   REPARIERT in …mehrwinkel.3. Die Vorfassung bildete `worst` als Maximum
   ueber eine Liste, die `darkFd` ENTHIELT, und prueffte dann
   RANK[worst] >= RANK[darkFd] — immer wahr. Sie rechnete ihr Ergebnis
   selbst aus, statt das Produkt zu fragen, und blieb gruen, als die
   Ausschlusslogik der Fusion abgeschaltet wurde.

   Jetzt drei Zusicherungen, alle am Produkt:
     1. die verunglueckte Aufnahme steht in fusion.excluded, MIT Grund;
     2. wuerde man nur die fusionierten Aufnahmen aggregieren, waere das
        Ergebnis BESSER — die gefaehrliche Abkuerzung ist also real und
        nicht bloss theoretisch;
     3. ueber ALLE Aufnahmen aggregiert bleibt es FAIL.
   Faellt 1, ist die Ausschlusslogik defekt. Faellt 2, belegt der Test
   nichts. Faellt 3, ist der gefaehrlichste Fehler dieser App eingetreten:
   ein FAIL verschwindet, weil ein Bild aus der Fusion gefallen ist.     */
{
  /* Saubere Aufnahmen ohne Kratzer und ohne Glanzstreifen: sie bestehen.
     Nur so ist die gefaehrliche Abkuerzung ueberhaupt eine Verbesserung —
     mit lauter FAIL-Aufnahmen belegte der Test nichts. */
  const glatt = (seq, shape) => {
    const data = makeImage(W, H, (x, y, r) => baseMetal(x, y, r, 170));
    return {
      sequenceIndex: seq, data, width: W, height: H,
      registered: true, residualPx: 0.4, labelShape: shape,
      brightness: meanBrightness(data),
    };
  };
  const hell = shapesDiverse.map((shape, i) => glatt(i, shape));

  /* Die dunkle Aufnahme faellt aus der Fusion (kein Etikett erkannt) und
     traegt zugleich ein FAIL (kritisches Licht). */
  const dunkelData = seriesFrame(W, H, glossPositions[0], { dark: true });
  const dunkel = {
    sequenceIndex: hell.length,
    data: dunkelData, width: W, height: H,
    registered: false,
    excludeReason: "LABEL_NOT_DETECTED",
    residualPx: null,
    labelShape: null,
    brightness: meanBrightness(dunkelData),
  };

  const serie = [...hell, dunkel];
  const fusion = fuseAngles(serie);

  const ausgeschlossen = (fusion.excluded || [])
    .find(e => e.sequenceIndex === dunkel.sequenceIndex);
  const mitGrund = Boolean(ausgeschlossen && ausgeschlossen.reason);

  const ergebnisAlle = serie.map(f => appResult(runLocalEngine(f.data, W, H)));
  const ergebnisNurFusioniert = hell.map(f => appResult(runLocalEngine(f.data, W, H)));

  const urteilAlle = deriveSystemDecision(aggregateResults(ergebnisAlle));
  const urteilNurFusioniert = deriveSystemDecision(aggregateResults(ergebnisNurFusioniert));

  /* Ohne diese Zusicherung koennte der Test bestehen, weil ohnehin alles
     FAIL ist — dann belegte er nichts ueber den Ausschluss. */
  const abkuerzungWaereBesser = urteilNurFusioniert.status !== "FAIL";

  ok("MA-03", "Ausgeschlossene Aufnahme verbessert Ergebnis nie (WRW)",
    mitGrund && abkuerzungWaereBesser && urteilAlle.status === "FAIL",
    `excluded=${ausgeschlossen ? ausgeschlossen.reason : "FEHLT"}`
    + ` · nur fusionierte: ${urteilNurFusioniert.status}`
    + ` · alle Aufnahmen: ${urteilAlle.status} (${urteilAlle.reason})`
    + ` · usedCount=${fusion.usedCount}`);
}

/* ── MA-04 · Registrierung, UNABHAENGIG geprueft ────────────────────────

   REPARIERT in …mehrwinkel.3. Die Vorfassung mass `registrationQuality`,
   das dieselben vier Punkte zurueckprojiziert, aus denen die Homographie
   exakt geloest wurde — der Wert ist bauartbedingt nahe null. Der Test
   konnte nicht rot werden. Befund der Gegenpruefung, zutreffend.

   Jetzt: das Etikett wird im ENTZERRTEN Bild noch einmal gesucht, mit
   einem testeigenen Eckenfinder, der die Homographie nicht kennt. Der
   Abstand zum Sollquadrat ist ein echter Messwert.                      */
{
  const SW = 220, SH = 200;
  const srcCorners = {
    topLeft: { x: 40, y: 30 },
    topRight: { x: 150, y: 25 },
    bottomRight: { x: 170, y: 140 },
    bottomLeft: { x: 35, y: 150 },
  };

  /* Quellbild: helle Flaeche, das Etikett als dunkles Viereck. */
  const innen = (x, y) => {
    const p = [srcCorners.topLeft, srcCorners.topRight, srcCorners.bottomRight, srcCorners.bottomLeft];
    let drin = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = p[i], b = p[j];
      if ((a.y > y) !== (b.y > y)
        && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) drin = !drin;
    }
    return drin;
  };
  const quelle = {
    data: makeImage(SW, SH, (x, y) => (innen(x, y) ? [20, 20, 22] : [230, 230, 232])),
    width: SW, height: SH,
  };

  /* Eckenfinder: sucht die dunkelste zusammenhaengende Flaeche und liefert
     ihre aeussersten Punkte. Kennt weder Homographie noch Sollgeometrie. */
  const findeEcken = bild => {
    const { data, width: w, height: h } = bild;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const L = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        if (L > 0.5) continue;
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (!n) return null;
    return {
      topLeft: { x: minX, y: minY }, topRight: { x: maxX, y: minY },
      bottomRight: { x: maxX, y: maxY }, bottomLeft: { x: minX, y: maxY },
    };
  };

  const Hm = homographyFromCorners(srcCorners, 120);
  const entzerrt = warpToPlane(quelle, Hm, 120);
  const kontrolle = verifyByRedetect(entzerrt, Hm, findeEcken);

  /* Gegenprobe im selben Test: eine ABSICHTLICH falsche Homographie muss
     einen deutlich groesseren Abstand liefern. Ohne diese Haelfte waere
     nicht belegt, dass die Kontrolle ueberhaupt etwas misst. */
  const falsch = homographyFromCorners({
    topLeft: { x: 40, y: 30 }, topRight: { x: 150, y: 25 },
    bottomRight: { x: 120, y: 90 }, bottomLeft: { x: 35, y: 150 },
  }, 120);
  const falschEntzerrt = warpToPlane(quelle, falsch, 120);
  const falschKontrolle = verifyByRedetect(falschEntzerrt, falsch, findeEcken);

  ok("MA-04", "Registrierung unabhaengig geprueft: Etikett im entzerrten Bild wiedergefunden",
    kontrolle.status === "CHECKED"
    && kontrolle.redetectResidualPx <= REGISTRATION_RESIDUAL_MAX_PX
    && falschKontrolle.redetectResidualPx > kontrolle.redetectResidualPx * 3,
    `korrekt=${kontrolle.redetectResidualPx} px · verfaelscht=${falschKontrolle.redetectResidualPx} px `
    + `· Stellschwelle=${REGISTRATION_RESIDUAL_MAX_PX}`);
}

/* ── MA-15 · Gueltige Abdeckung des Prueffelds ─────────────────────────

   Befund der Gegenpruefung an rc.4.7: das 3x-Feld reicht ueber den
   Bildrand hinaus, und `warpToPlane` klemmt dort auf den Randpixel — es
   entsteht Flaeche, die nie fotografiert wurde. Ohne Messung und Grenze
   arbeitet die Fusion auf erfundenem Bildinhalt.                        */
{
  const mittig = homographyFromCorners({
    topLeft: { x: 100, y: 100 }, topRight: { x: 140, y: 100 },
    bottomRight: { x: 140, y: 140 }, bottomLeft: { x: 100, y: 140 },
  }, 120);
  const amRand = homographyFromCorners({
    topLeft: { x: 5, y: 5 }, topRight: { x: 45, y: 5 },
    bottomRight: { x: 45, y: 45 }, bottomLeft: { x: 5, y: 45 },
  }, 120);
  const voll = warpCoverage(mittig, 400, 400, 120);
  const teilweise = warpCoverage(amRand, 400, 400, 120);
  ok("MA-15", "Die gueltige Abdeckung des Prueffelds wird gemessen und begrenzt",
    voll === 1 && teilweise < WARP_COVERAGE_MIN && teilweise > 0,
    `mittig ${voll} · am Bildrand ${teilweise} · Stellwert ${WARP_COVERAGE_MIN}`);
}

/* ── MA-14 · Prueffeld deckt mehr ab als das Etikett ───────────────────── */
{
  const ecken = {
    topLeft: { x: 10, y: 10 }, topRight: { x: 50, y: 10 },
    bottomRight: { x: 50, y: 50 }, bottomLeft: { x: 10, y: 50 },
  };
  const Hm = homographyFromCorners(ecken, 120);
  const mitte = applyToPoint(Hm, 30, 30);
  const eckeOben = applyToPoint(Hm, 10, 10);
  const seite = 120 / FIELD_FACTOR;
  const off = (120 - seite) / 2;
  ok("MA-14", "Die Entzerrung deckt 3x Etikettenbreite ab, das Etikett liegt mittig",
    FIELD_FACTOR === 3
    && Hm.fieldInLabelWidths === 3
    && Math.abs(mitte.x - 60) < 1 && Math.abs(mitte.y - 60) < 1
    && Math.abs(eckeOben.x - off) < 1 && Math.abs(eckeOben.y - off) < 1,
    `Etikettenecke → (${eckeOben.x.toFixed(1)}, ${eckeOben.y.toFixed(1)}), erwartet (${off}, ${off}); `
    + "Feld = 3x erkannte Etikettenbreite, unkalibrierter Stellwert");
}

/* ── MA-05: no label → excluded with reason, visible ──────────────────── */
{
  const withMissing = [
    ...seriesDiverse.slice(0, 2),
    {
      sequenceIndex: 2,
      data: seriesDiverse[2].data,
      width: W, height: H,
      registered: false,
      residualPx: null,
      labelShape: null,
      excludeReason: "LABEL_NOT_DETECTED",
    },
  ];
  const fuse = fuseAngles(withMissing);
  const hit = fuse.excluded.find(e => e.sequenceIndex === 2);
  const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const i18n = readFileSync(new URL("./src/i18n.js", import.meta.url), "utf8");
  const visible = /fusionExcluded|LABEL_NOT_DETECTED|Aus der Fusion ausgeschlossen/.test(app + i18n);
  ok("MA-05", "Ohne Etikett: excluded mit Grund, nicht still weggelassen",
    fuse.usedCount === 2 && hit && String(hit.reason).length > 0 && visible,
    `used=${fuse.usedCount} · excluded=${JSON.stringify(fuse.excluded)} · UI=${visible}`);
}

/* ── MA-06: SCALE_CALIBRATION open; no mm in UI strings for scale ─────── */
{
  const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const i18n = readFileSync(new URL("./src/i18n.js", import.meta.url), "utf8");
  const uiHit = /mmPerPixel|nominalLabelMm|43\s*mm/.test(app + i18n);
  ok("MA-06", "SCALE_CALIBRATION OPEN; keine Millimeterangabe in der Anzeige",
    SCALE_CALIBRATION.status === "OPEN_CALIBRATION_CASE"
    && SCALE_CALIBRATION.nominalLabelMm === 43
    && !uiHit,
    `status=${SCALE_CALIBRATION.status} · UI-mm=${uiHit}`);
}

/* ── MA-07: wandering gloss persistence 1, fixed scratch persistence 3 ─ */
{
  const fuse = fuseAngles(seriesDiverse, { persistenceEdgeThreshold: 0.08 });
  const scratchX = Math.floor(W * 0.40);
  const pers = fuse.persistence;
  const colMean = (x) => {
    let s = 0, n = 0;
    for (let y = Math.floor(H * 0.2); y < Math.floor(H * 0.8); y++) {
      s += pers[y * W + x]; n++;
    }
    return n ? s / n : 0;
  };
  const scratchMean = Math.max(colMean(scratchX - 1), colMean(scratchX + 1));
  const glossMeans = glossPositions.map(gx =>
    Math.max(colMean(gx - 2), colMean(gx + 2)));
  const glossMean = Math.max(...glossMeans);
  const scratchP = Math.round(scratchMean);
  const glossP = Math.round(glossMean);

  console.log("");
  console.log("── MA-07 REPORT ──────────────────────────────────────────────");
  console.log(`Kratzer persistence: ${scratchP} (mean ${scratchMean.toFixed(2)} an Kanten)`);
  console.log(`Reflex  persistence: ${glossP} (mean ${glossMean.toFixed(2)} an Kanten; je Pose ~1)`);
  console.log(`  je Glanz-Pose: ${glossMeans.map(v => v.toFixed(2)).join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("");

  ok("MA-07", "Wandernder Glanz persistence==1, fester Kratzer persistence==3",
    scratchP === 3 && glossP === 1
    && scratchMean >= 2.5 && glossMean <= 1.25
    && glossMeans.every(v => v <= 1.25),
    `Kratzer pers=${scratchP} (mean ${scratchMean.toFixed(2)}) · Reflex pers=${glossP} (mean ${glossMean.toFixed(2)})`);
}

/* ── MA-08: scratch ranks above reflex via TEST-LOCAL detector ────────── */
{
  const fuse = fuseAngles(seriesDiverse, { persistenceEdgeThreshold: 0.08 });
  const scratchX = Math.floor(W * 0.40);
  /* Testeigener Minimaldetektor: liefert Kandidaten an bekannten Spalten
     (Kratzer + Glanz). Nie screenScratches / rc.4.6. scoreByPersistence
     bewertet und sortiert danach. */
  const testLocalDetect = () => ({
    candidates: [
      {
        boundingBox: {
          minX: scratchX - 1, maxX: scratchX + 1,
          minY: Math.floor(H * 0.2), maxY: Math.floor(H * 0.8),
        },
        relevanceScore: 0.5,
        tag: "scratch",
      },
      ...glossPositions.map((gx, i) => ({
        boundingBox: {
          minX: gx - 2, maxX: gx + 2,
          minY: Math.floor(H * 0.2), maxY: Math.floor(H * 0.8),
        },
        relevanceScore: 0.5,
        tag: `gloss-${i}`,
      })),
    ],
  });
  const screened = scoreByPersistence(fuse, testLocalDetect);
  const scratchBest = screened.candidates.find(c => c.tag === "scratch");
  const glossBest = screened.candidates.filter(c => String(c.tag).startsWith("gloss"))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
  const rankOk = scratchBest && glossBest
    && screened.candidates[0].tag === "scratch"
    && scratchBest.relevanceScore > glossBest.relevanceScore
    && scratchBest.persistence >= 2
    && glossBest.persistence <= 1.25;
  const maSrc = readFileSync(new URL("./src/multiAngle.js", import.meta.url), "utf8");
  const noRc46 = !/^\s*import\s+.*scratchScreening/m.test(maSrc)
    && !/^\s*import\s+.*screenScratches/m.test(maSrc);
  ok("MA-08", "Kratzer steht vor dem Reflex (testeigener Minimaldetektor)",
    rankOk && screened.candidates.length >= 2 && screened.status === "SCORED" && noRc46,
    scratchBest && glossBest
      ? `scratchScore=${scratchBest.relevanceScore} pers=${scratchBest.persistenceMax}`
        + ` · glossScore=${glossBest.relevanceScore} pers=${glossBest.persistenceMax}`
        + ` · top=${screened.candidates[0].tag} · noScratchImport=${noRc46}`
      : `n=${screened.candidates.length}`);
}

/* ── MA-09: same pose → poseSpread warning ────────────────────────────── */
{
  const sameSeries = glossPositions.map((gx, i) =>
    frameBundle(i, gx, shapesSame[i]));
  const fuse = fuseAngles(sameSeries);
  console.log("");
  console.log("── MA-09 REPORT ──────────────────────────────────────────────");
  console.log(`poseSpread gemessen: ${fuse.poseSpread}`);
  console.log(`Schwelle (POSE_SPREAD_MIN): ${POSE_SPREAD_MIN}`);
  console.log(`warning: ${fuse.warning ? fuse.warning.de : "(keine)"}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log("");
  ok("MA-09", "Gleiche Richtung: poseSpread unter Schwelle, Hinweis gesetzt",
    fuse.poseSpread < POSE_SPREAD_MIN
    && fuse.warning
    && fuse.warning.code === POSE_SPREAD_WARNING.code
    && fuse.meaningful === false,
    `poseSpread=${fuse.poseSpread} · min=${POSE_SPREAD_MIN}`);
}

/* ── MA-10: determinism ───────────────────────────────────────────────── */
{
  const a = scoreByPersistence(fuseAngles(seriesDiverse), minimalColumnDetector);
  const b = scoreByPersistence(fuseAngles(seriesDiverse), minimalColumnDetector);
  const strip = o => JSON.stringify({
    candidates: o.candidates,
    status: o.status,
    evidenceIsMeaningful: o.evidenceIsMeaningful,
    warning: o.warning,
  });
  ok("MA-10", "Determinismus: zwei Laeufe bit-identisch",
    strip(a) === strip(b),
    "JSON zeichengleich");
}

/* ── MA-11: single-image path fully working without fusion ────────────── */
{
  const local = runLocalEngine(seriesDiverse[0].data, W, H);
  const cp = buildCheckpoints(local.features, local.verdict);
  const fd = overallResult(cp);
  ok("MA-11", "Einzelbildpfad ohne Fusion vollstaendig funktionsfaehig",
    local.features && local.verdict && cp.length > 0 && fd.status,
    `features ok · overall=${fd.status}`);
}

/* ── MA-12: dark single capture stays blocked despite bright siblings ─── */
{
  const darkData = seriesFrame(W, H, glossPositions[0], { dark: true });
  const bright = meanBrightness(seriesDiverse[0].data);
  const dark = meanBrightness(darkData);
  const level = lightLevelDomain(dark);
  ok("MA-12", "Zu dunkle Einzelaufnahme (<15%) bleibt gesperrt trotz heller Serie",
    dark < 0.15 && level === "critical" && bright >= 0.15,
    `dark=${dark.toFixed(3)} (${level}) · siblingBright=${bright.toFixed(3)}`);
}

/* ── MA-13: detect=null → NO_DETECTOR + clear UI message ──────────────── */
{
  const fuse = fuseAngles(seriesDiverse);
  const scored = scoreByPersistence(fuse, null);
  const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const i18n = readFileSync(new URL("./src/i18n.js", import.meta.url), "utf8");
  const uiMsg = /fusionNoDetector/.test(app) && /Kein Kratzer-Detektor|No scratch detector/.test(i18n);
  ok("MA-13", "detect=null → NO_DETECTOR, Karten stehen, UI meldet Klartext",
    scored.status === "NO_DETECTOR"
    && scored.candidates.length === 0
    && fuse.fusedImage && fuse.persistence && fuse.maxMag
    && scored.message?.de === NO_DETECTOR_MESSAGE.de
    && uiMsg,
    `status=${scored.status} · used=${fuse.usedCount} · UI=${uiMsg}`);
}

/* captureProfile fields smoke */
{
  const p = captureProfile({
    width: W, height: H, path: "CAMERA",
    fusionGroupId: "g1", sequenceIndex: 0, brightness: 0.5,
    labelShape: shapesDiverse[0], residualPx: 0.4, registered: true,
  });
  ok("MA-CP", "captureProfile traegt Fusionfelder, kein viewAngleDeg",
    p.fusionGroupId === "g1" && p.sequenceIndex === 0 && p.registered === true
    && !("viewAngleDeg" in p),
    `keys=${Object.keys(p).join(",")}`);
}

/* texture features smoke (not a class label) */
{
  const img = { data: seriesDiverse[0].data, width: W, height: H };
  const lbp = localBinaryPattern(img);
  const ori = orientationHistogram(img);
  const noClass = lbp && !("surfaceClass" in lbp) && !("class" in lbp);
  ok("MA-TX", "textureFeatures: LBP+Orientierung, kein Klassenurteil, eigene Datei",
    lbp && ori && Number.isFinite(lbp.lbpUniformity) && noClass,
    `lbpUniformity=${lbp.lbpUniformity} · orientBins=${ori.bins}`);
}

/* multiAngle must not import scratchScreening */
{
  const ma = readFileSync(new URL("./src/multiAngle.js", import.meta.url), "utf8");
  const importsScratch = /^\s*import\s+.*scratchScreening/m.test(ma)
    || /^\s*import\s+.*screenScratches/m.test(ma);
  ok("MA-ISO", "multiAngle.js importiert kein scratchScreening/screenScratches",
    !importsScratch,
    importsScratch ? "IMPORT GEFUNDEN" : "keine Detektor-Imports");
}

console.log("");
console.log("Stellwerte (explicitly commented as Stellwerte — not validated):");
console.log(`  PERSISTENCE_EDGE_THRESHOLD   = ${PERSISTENCE_EDGE_THRESHOLD}`);
console.log(`  PERSISTENCE_HIGH             = ${PERSISTENCE_HIGH}`);
console.log(`  POSE_SPREAD_MIN              = ${POSE_SPREAD_MIN}`);
console.log(`  REGISTRATION_RESIDUAL_MAX_PX = ${REGISTRATION_RESIDUAL_MAX_PX}`);

/* ── MA-EB: die Ebenenannahme sperrt VOR jeder Residuumspruefung ─────────
   Eine Homographie bildet eine Ebene auf eine Ebene ab. Auf einer
   gekruemmten Prueffflaeche gilt sie nicht — und `verifyByRedetect` faengt
   das NICHT ab: es sucht das ETIKETT im entzerrten Bild wieder, und das
   Etikett ist per Bauart eben. Ein Residuum von 0 ist mit einer stark
   gewoelbten Umgebung vollstaendig vertraeglich.

   Bis rc.4.32 lief `warpToPlane` unabhaengig von `zone.planar`; die
   Kennzeichnung NON_PLANAR_ZONE wurde erst nachtraeglich auf das Ergebnis
   gesetzt. Der Oberflaechentext versprach, die Mehrwinkelauswertung
   entfalle hier, waehrend sie lief.                                     */
{
  const { rectificationAllowed, PLANARITY } = await import("./src/registration.js");
  const eben = rectificationAllowed({ id: "die", planar: true });
  const gewoelbt = rectificationAllowed({ id: "drum", planar: false });
  const unbekannt = rectificationAllowed({ id: "alt" });
  /* Auch mit einem perfekten Residuum bleibt die gekruemmte Zone gesperrt:
     die Funktion nimmt gar keines entgegen. Waere sie dafuer empfaenglich,
     koennte eine gute Messung AM ETIKETT ueber die Flaeche DANEBEN
     entscheiden. */
  const mitPerfektemResiduum = rectificationAllowed({
    id: "drum", planar: false, redetectResidualPx: 0, registrationQuality: 1,
  });
  const richtig = eben.allowed === true
    && gewoelbt.allowed === false && gewoelbt.reason === PLANARITY.NON_PLANAR
    && unbekannt.allowed === false && unbekannt.reason === PLANARITY.UNKNOWN
    && mitPerfektemResiduum.allowed === false;
  /* Und die Verdrahtung: App.jsx muss die Sperre VOR dem Entzerren
     auswerten, nicht danach. Quelltextpruefung, weil der Aufruf im
     Analyse-Ablauf sitzt und nicht einzeln aufrufbar ist. */
  const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const vorWarp = appQuelle.indexOf("rectificationAllowed(zone)");
  const beiWarp = appQuelle.indexOf("warpToPlane(src");
  const verdrahtet = vorWarp > 0 && beiWarp > vorWarp
    && /const registered = ebene\.allowed/.test(appQuelle);
  R.push({ id: "MA-EB", bestanden: richtig && verdrahtet });
  console.log(`${richtig && verdrahtet ? "BESTANDEN    " : "DURCHGEFALLEN"} MA-EB  Gekruemmte Zone wird vor der Entzerrung gesperrt, nicht danach`);
  console.log(`                    eben ${eben.allowed} · gewoelbt ${gewoelbt.allowed}`
    + ` · unbekannt ${unbekannt.allowed} · trotz Residuum 0 gesperrt ${!mitPerfektemResiduum.allowed}`
    + ` · in App.jsx vor warpToPlane verdrahtet ${verdrahtet}`);
}

const coreHash = createHash("sha256")
  .update(readFileSync(new URL("./src/analysisCore.js", import.meta.url)))
  .digest("hex");
console.log("");
console.log(`analysisCore.js SHA-256 ${coreHash}`);
console.log(`byte-identisch RC3: ${coreHash === "ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793"}`);

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
