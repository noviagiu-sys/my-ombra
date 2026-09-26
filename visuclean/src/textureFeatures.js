/* ─── VisuClean 8.3.0-rc.4.5.mehrwinkel.1 · Texture features ───────────────
   Local Binary Patterns (uniform) and orientation histogram.
   Pure functions over ImageData / {data,width,height}. Deterministic.
   Features only — never an automatic surface classification (X-07).
   Own module (not inside any screening module) so this line does not depend on rc.4.6. */

function toLuma(data, w, h) {
  const n = w * h;
  const lum = new Uint8Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return lum;
}

/** Bit-count for uniform-LBP test (at most 2 bitwise transitions). */
function isUniform(code) {
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    const a = (code >> i) & 1;
    const b = (code >> ((i + 1) % 8)) & 1;
    if (a !== b) transitions++;
  }
  return transitions <= 2;
}

const UNIFORM_MAP = (() => {
  const map = new Int16Array(256);
  let next = 0;
  for (let c = 0; c < 256; c++) map[c] = isUniform(c) ? next++ : -1;
  const nonUniform = next;
  for (let c = 0; c < 256; c++) if (map[c] < 0) map[c] = nonUniform;
  return { map, bins: nonUniform + 1 };
})();

/**
 * Uniform LBP histogram (8-neighbour, radius 1) + uniformity ratio.
 * Returns { histogram, bins, lbpUniformity, pixelCount } — never a class label.
 */
export function localBinaryPattern(imageData, _options = {}) {
  if (!imageData?.data) return null;
  const w = imageData.width | 0;
  const h = imageData.height | 0;
  if (w < 3 || h < 3) return null;
  const lum = toLuma(imageData.data, w, h);
  const { map, bins } = UNIFORM_MAP;
  const hist = new Float64Array(bins);
  let counted = 0;
  let uniformCount = 0;
  const offs = [
    [-1, -1], [0, -1], [1, -1], [1, 0],
    [1, 1], [0, 1], [-1, 1], [-1, 0],
  ];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = lum[y * w + x];
      let code = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + offs[k][0], ny = y + offs[k][1];
        if (lum[ny * w + nx] >= c) code |= (1 << k);
      }
      const bin = map[code];
      hist[bin]++;
      counted++;
      if (isUniform(code)) uniformCount++;
    }
  }
  if (counted > 0) for (let i = 0; i < bins; i++) hist[i] /= counted;
  const lbpUniformity = counted
    ? Math.round((uniformCount / counted) * 1e6) / 1e6
    : 0;
  return Object.freeze({
    histogram: Object.freeze(Array.from(hist)),
    bins,
    lbpUniformity,
    pixelCount: counted,
  });
}

/**
 * Orientation histogram via Sobel gradients (N bins over [0, π)).
 * Returns { histogram, bins, dominantBin, dominantStrength } — feature only.
 */
export function orientationHistogram(imageData, options = {}) {
  if (!imageData?.data) return null;
  const w = imageData.width | 0;
  const h = imageData.height | 0;
  if (w < 3 || h < 3) return null;
  const bins = Math.max(4, Math.min(36, (options.bins | 0) || 18));
  const lum = toLuma(imageData.data, w, h);
  const hist = new Float64Array(bins);
  let weightSum = 0;
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
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag < 1e-6) continue;
      let ang = Math.atan2(gy, gx);
      if (ang < 0) ang += Math.PI;
      if (ang >= Math.PI) ang -= Math.PI;
      const bin = Math.min(bins - 1, Math.floor((ang / Math.PI) * bins));
      hist[bin] += mag;
      weightSum += mag;
    }
  }
  if (weightSum > 0) for (let i = 0; i < bins; i++) hist[i] /= weightSum;
  let dominantBin = 0;
  for (let i = 1; i < bins; i++) if (hist[i] > hist[dominantBin]) dominantBin = i;
  return Object.freeze({
    histogram: Object.freeze(Array.from(hist)),
    bins,
    dominantBin,
    dominantStrength: Math.round((hist[dominantBin] || 0) * 1e6) / 1e6,
  });
}

/** Combined feature vector for later RF analysis — still no class label. */
export function textureFeatures(imageData, options = {}) {
  const lbp = localBinaryPattern(imageData, options);
  const orient = orientationHistogram(imageData, options);
  if (!lbp || !orient) return null;
  return Object.freeze({
    lbpUniformity: lbp.lbpUniformity,
    lbpHistogram: lbp.histogram,
    orientationHistogram: orient.histogram,
    dominantOrientationBin: orient.dominantBin,
    dominantOrientationStrength: orient.dominantStrength,
  });
}
