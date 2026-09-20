/* ─── VisuClean 8.3.0-rc.4.5.mehrwinkel.1 · Multi-angle fusion ─────────────
   Pure function over N registered (plane-aligned) captures of the same zone.
   Fusion may ONLY add/score candidates — never remove findings, never change
   single-image verdicts, never produce PASS.
   An excluded frame must NEVER improve the result (worst-result-wins over
   all individual captures remains binding).

   NO import of screenScratches / scratchScreening — detect is a parameter
   of scoreByPersistence. When rc.4.6 arrives it is wired from the outside.

   Stellwerte below are free knobs until a calibration campaign — they are
   NOT validated thresholds.                                            */

import { REGISTRATION_RESIDUAL_MAX_PX } from "./registration.js";

/**
 * Stellwert — NOT a validated threshold.
 * Per-pixel Sobel magnitude floor used when counting persistence across
 * frames. Campaign must confirm under cleanroom ambient lighting.
 */
export const PERSISTENCE_EDGE_THRESHOLD = 0.12; // Stellwert — not validated

/**
 * Stellwert — NOT a validated threshold.
 * Minimum poseSpread (labelShape distance) before multi-angle evidence is
 * considered meaningful. Below this, a clear UI warning is set.
 */
export const POSE_SPREAD_MIN = 0.08; // Stellwert — not validated

/**
 * Stellwert — NOT a validated threshold.
 * persistence >= this → high relevance boost; persistence == 1 → low score
 * (kept, never dropped — sort, don't filter).
 */
export const PERSISTENCE_HIGH = 2; // Stellwert — not validated

export const POSE_SPREAD_WARNING = Object.freeze({
  code: "POSE_SPREAD_TOO_SMALL",
  de: "Die Aufnahmen zeigen keine ausreichende Winkelvielfalt. Die "
    + "Mehrwinkelauswertung ist fuer diese Serie nicht aussagekraeftig.",
  en: "The captures do not show sufficient angular diversity. Multi-angle "
    + "evaluation is not meaningful for this series.",
});

export const NO_DETECTOR_MESSAGE = Object.freeze({
  de: "Kein Kratzer-Detektor eingehaengt. Die Fusionskarten (fusedImage, "
    + "maxMag, persistence) stehen zur Verfuegung; eine Bewertung nach "
    + "Persistenz ist ohne Detektor nicht moeglich.",
  en: "No scratch detector is wired. Fusion maps (fusedImage, maxMag, "
    + "persistence) are available; persistence scoring requires a detector.",
});

function luminance(data, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }
  return lum;
}

function sobelMag(lum, w, h) {
  const n = w * h;
  const mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        -lum[p - w - 1] + lum[p - w + 1]
        - 2 * lum[p - 1] + 2 * lum[p + 1]
        - lum[p + w - 1] + lum[p + w + 1];
      const gy =
        -lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1]
        + lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1];
      mag[p] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function shapeDistance(a, b) {
  if (!a || !b) return 0;
  const da = (a.aspect ?? 0) - (b.aspect ?? 0);
  const ds = (a.shear ?? 0) - (b.shear ?? 0);
  return Math.hypot(da, ds);
}

/** Max pairwise labelShape distance across used frames. */
export function computePoseSpread(shapes) {
  const list = (shapes || []).filter(Boolean);
  if (list.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = shapeDistance(list[i], list[j]);
      if (d > max) max = d;
    }
  }
  return Math.round(max * 1e6) / 1e6;
}

/**
 * @param {Array} registeredImages
 *   [{ sequenceIndex, data, width, height, registered, residualPx, labelShape,
 *      excludeReason? }]
 * @param {object} options  optional Stellwert overrides
 */
export function fuseAngles(registeredImages, options = {}) {
  const edgeThr = Number.isFinite(options.persistenceEdgeThreshold)
    ? options.persistenceEdgeThreshold : PERSISTENCE_EDGE_THRESHOLD;
  const residualMax = Number.isFinite(options.registrationResidualMaxPx)
    ? options.registrationResidualMaxPx : REGISTRATION_RESIDUAL_MAX_PX;
  const poseMin = Number.isFinite(options.poseSpreadMin)
    ? options.poseSpreadMin : POSE_SPREAD_MIN;

  const stellwerte = Object.freeze({
    persistenceEdgeThreshold: edgeThr,
    registrationResidualMaxPx: residualMax,
    poseSpreadMin: poseMin,
    persistenceHigh: PERSISTENCE_HIGH,
    note: "Stellwerte — not validated thresholds",
  });

  const excluded = [];
  const used = [];
  const list = Array.isArray(registeredImages) ? registeredImages : [];

  for (const img of list) {
    const idx = Number.isFinite(img?.sequenceIndex) ? img.sequenceIndex : used.length + excluded.length;
    if (!img || img.registered === false) {
      excluded.push({ sequenceIndex: idx, reason: img?.excludeReason || "LABEL_NOT_DETECTED" });
      continue;
    }
    if (!img.data || !img.width || !img.height) {
      excluded.push({ sequenceIndex: idx, reason: "MISSING_IMAGE" });
      continue;
    }
    if (Number.isFinite(img.residualPx) && img.residualPx > residualMax) {
      excluded.push({ sequenceIndex: idx, reason: "REGISTRATION_RESIDUAL_TOO_HIGH" });
      continue;
    }
    used.push({ ...img, sequenceIndex: idx });
  }

  if (!used.length) {
    return Object.freeze({
      maxMag: null,
      persistence: null,
      usedCount: 0,
      excluded: Object.freeze(excluded.slice()),
      poseSpread: 0,
      width: 0,
      height: 0,
      warning: null,
      fusedImage: null,
      stellwerte,
      meaningful: false,
    });
  }

  const w = used[0].width | 0;
  const h = used[0].height | 0;
  const n = w * h;
  for (const img of used) {
    if ((img.width | 0) !== w || (img.height | 0) !== h) {
      excluded.push({
        sequenceIndex: img.sequenceIndex,
        reason: "SIZE_MISMATCH",
      });
    }
  }
  const aligned = used.filter(img => (img.width | 0) === w && (img.height | 0) === h);

  const maxMag = new Float32Array(n);
  const persistence = new Uint8Array(n);
  const mags = [];

  for (const img of aligned) {
    const lum = luminance(img.data, w, h);
    const mag = sobelMag(lum, w, h);
    mags.push(mag);
    for (let i = 0; i < n; i++) {
      if (mag[i] > maxMag[i]) maxMag[i] = mag[i];
    }
  }
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (const mag of mags) if (mag[i] >= edgeThr) c++;
    persistence[i] = c;
  }

  /* Max luminance across frames → fused ImageData (detector-agnostic). */
  const fusedData = new Uint8ClampedArray(n * 4);
  const lums = aligned.map(img => luminance(img.data, w, h));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const lum of lums) if (lum[i] > v) v = lum[i];
    const edge = Math.min(1, maxMag[i] * 2.2);
    const g = Math.round(Math.max(0, Math.min(1, v * (1 - 0.55 * edge))) * 255);
    const o = i * 4;
    fusedData[o] = g; fusedData[o + 1] = g; fusedData[o + 2] = g; fusedData[o + 3] = 255;
  }

  const poseSpread = computePoseSpread(aligned.map(img => img.labelShape));
  const meaningful = poseSpread >= poseMin;
  const warning = meaningful ? null : Object.freeze({ ...POSE_SPREAD_WARNING });

  return Object.freeze({
    fusedImage: Object.freeze({ data: fusedData, width: w, height: h }),
    maxMag,
    persistence,
    usedCount: aligned.length,
    excluded: Object.freeze(excluded.slice()),
    poseSpread,
    width: w,
    height: h,
    warning,
    stellwerte,
    meaningful,
  });
}

/**
 * Scores foreign candidates against the persistence map.
 * detect is a PARAMETER, not an import. Missing → status NO_DETECTOR;
 * fusion maps remain available. Sort, don't filter: persistence == 1 is
 * scored low, never dropped.
 *
 * detect(fusedImageLike, options?) → { candidates: [{ boundingBox, ... }] }
 *   or an array of candidates directly.
 */
export function scoreByPersistence(fusion, detect, options = {}) {
  const base = {
    candidates: [],
    status: "NO_DETECTOR",
    fuse: fusion,
    evidenceIsMeaningful: fusion?.meaningful === true,
    warning: fusion?.warning ?? null,
    message: NO_DETECTOR_MESSAGE,
    stellwerte: fusion?.stellwerte ?? null,
  };

  if (typeof detect !== "function") {
    return Object.freeze({ ...base, status: "NO_DETECTOR" });
  }
  if (!fusion?.fusedImage || !fusion.persistence) {
    return Object.freeze({
      ...base,
      status: "SCORED",
      message: null,
      candidates: Object.freeze([]),
    });
  }

  const { data, width, height } = fusion.fusedImage;
  const raw = detect({ data, width, height }, options);
  const list = Array.isArray(raw) ? raw
    : (Array.isArray(raw?.candidates) ? raw.candidates : []);
  const pers = fusion.persistence;
  const high = Number.isFinite(options.persistenceHigh)
    ? options.persistenceHigh : PERSISTENCE_HIGH;

  const candidates = list.map(c => {
    const bb = c.boundingBox || c;
    const minX = bb.minX | 0, minY = bb.minY | 0;
    const maxX = bb.maxX | 0, maxY = bb.maxY | 0;
    let sum = 0, count = 0, maxP = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const p = pers[y * width + x];
        sum += p; count++;
        if (p > maxP) maxP = p;
      }
    }
    const persistence = count ? Math.round((sum / count) * 1000) / 1000 : 0;
    const persistenceMax = maxP;
    let relevanceScore = Number.isFinite(c.relevanceScore) ? c.relevanceScore : 0.5;
    /* Boost on mean persistence (Stellwert PERSISTENCE_HIGH). A single
       noisy pixel must not promote a transient reflex. persistence == 1
       stays low — sort, don't filter. */
    if (persistence >= high) {
      relevanceScore = Math.min(1, relevanceScore * 1.35 + 0.15);
    } else if (persistence <= 1.25 || persistenceMax <= 1) {
      relevanceScore = Math.min(relevanceScore, 0.35);
    }
    return {
      ...c,
      boundingBox: { minX, minY, maxX, maxY },
      persistence,
      persistenceMax,
      relevanceScore: Math.round(relevanceScore * 1e6) / 1e6,
    };
  });

  candidates.sort((a, b) =>
    (b.relevanceScore - a.relevanceScore)
    || (b.persistenceMax - a.persistenceMax)
    || (a.boundingBox.minY - b.boundingBox.minY)
    || (a.boundingBox.minX - b.boundingBox.minX));

  return Object.freeze({
    candidates: Object.freeze(candidates.slice()),
    status: "SCORED",
    fuse: fusion,
    evidenceIsMeaningful: fusion.meaningful === true,
    warning: fusion.warning,
    message: null,
    stellwerte: fusion.stellwerte,
  });
}
