import { buildVerdicts, computeFeatures } from "./analysisCore.js";

const CALIBRATION = Object.freeze({
  lm: 0.5882333792891756,
  tvFlat: 0.00003076490281167521,
  gradMean: 0.01882333067989854,
});

export function runEngineSelfTest() {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const value = 150 + ((index * 17) % 5) - 2;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const firstFeatures = computeFeatures(data, width, height);
  const secondFeatures = computeFeatures(data, width, height);
  const first = buildVerdicts(firstFeatures);
  const second = buildVerdicts(secondFeatures);
  const deterministic = JSON.stringify(first) === JSON.stringify(second)
    && ["lm", "tvFlat", "gradMean"].every(key => Object.is(firstFeatures[key], secondFeatures[key]));
  const deviations = Object.fromEntries(Object.keys(CALIBRATION)
    .map(key => [key, Math.abs(firstFeatures[key] - CALIBRATION[key])]));
  const calibrationPass = Object.values(deviations).every(value => value <= 0.02);
  return {
    ok: deterministic && calibrationPass && first.dry.pass && first.clean.pass && first.intact.pass,
    deterministic,
    calibrationPass,
    calibrationTolerance: 0.02,
    deviations,
    verdict: first,
    metrics: { lm: firstFeatures.lm, tvFlat: firstFeatures.tvFlat, gradMean: firstFeatures.gradMean },
  };
}
