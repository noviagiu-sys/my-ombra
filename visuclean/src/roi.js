/* Part ROI: analysis scores only the framed product-contact surface.
   Normalized coords 0–1. No RC3 threshold changes — crop then computeFeatures.

   ─── RC4 · Uebernahme aus der Preview-Linie (dea127bb) ────────────────────
   Dieses Modul ist die Geometrie-Ebene fuer den ROI-Bezugsrahmen. Es ist in
   RC4 uebernommen, weil das spaetere Befundregister einen bauteilbezogenen
   Bezugsrahmen braucht und der ROI-Rahmen der einzige ist, der ohne
   zusaetzliche Hardware verfuegbar ist.

   OFFENER KALIBRIERUNGSFALL — copyRoiImageData (siehe ROI_FILL_CALIBRATION):
   Alles ausserhalb des ROI wird mit der MITTLEREN FARBE des Innenbereichs
   gefuellt. Diese kuenstlichen Pixel gehen anschliessend in computeFeatures
   ein und beeinflussen tvFlat, edgeFrac und gradMean — also genau die
   Merkmale, an denen die Kernschwellen haengen. Der Effekt ist NICHT
   gemessen.

   Konsequenz fuer RC4: die ROI-gestuetzte ANALYSE ist nicht in die
   Pipeline verdrahtet. Das Modul liefert Geometrie und Koordinaten; es
   erzeugt kein Qualitaetsurteil. Bevor copyRoiImageData ein Ergebnis
   beeinflussen darf, ist der Fuell-Effekt zu messen — dieselbe Regel wie
   bei der Aufloesungsabhaengigkeit.                                        */

export const ROI_FILL_CALIBRATION = Object.freeze({
  status: "OPEN_CALIBRATION_CASE",
  affects: Object.freeze(["tvFlat", "edgeFrac", "gradMean"]),
  measured: false,
  de: "copyRoiImageData fuellt den Bereich ausserhalb des ROI mit der mittleren "
    + "Farbe des Innenbereichs. Der Einfluss dieser synthetischen Pixel auf die "
    + "Merkmale ist nicht gemessen. Solange das so ist, darf der ROI-Zuschnitt "
    + "kein Qualitaetsurteil beeinflussen.",
  en: "copyRoiImageData fills the area outside the ROI with the mean colour of "
    + "the inside region. The influence of these synthetic pixels on the "
    + "features is not measured. Until it is, the ROI crop must not influence "
    + "any quality verdict.",
});

export const ROI_REQUIRED_DE = "Zuerst das Teil einrahmen — der Hintergrund zählt nicht.";
export const ROI_MIN_SIDE = 0.20;
export const DEFAULT_ROI_FRAC = 0.76;
export const ROI_HANDLE_PX = 44;

const MIN_SIDE = ROI_MIN_SIDE;
const MIN_PIXELS = 16;
const HANDLE_RADIUS = ROI_HANDLE_PX / 2;

export function handleInsetNorm(frameW, frameH) {
  const maxInset = (1 - MIN_SIDE) / 2;
  const x = Number(frameW) > 0 ? HANDLE_RADIUS / Number(frameW) : 0.08;
  const y = Number(frameH) > 0 ? HANDLE_RADIUS / Number(frameH) : 0.08;
  return {
    x: Math.min(maxInset, Math.max(0, x)),
    y: Math.min(maxInset, Math.max(0, y)),
  };
}

export function defaultBoxRoi(inset) {
  const base = (1 - DEFAULT_ROI_FRAC) / 2;
  const ix = Math.max(base, Number(inset?.x) || 0);
  const iy = Math.max(base, Number(inset?.y) || 0);
  return clampBoxRoi(ix, iy, 1 - 2 * ix, 1 - 2 * iy, inset);
}

export const FINDING_BOX_W = 0.28;
export const FINDING_BOX_H = 0.22;

export function defaultFindingBox(inset, index = 0) {
  const n = Math.max(0, Number(index) || 0);
  return clampBoxRoi(0.14 + (n % 5) * 0.07, 0.16 + (n % 3) * 0.08, FINDING_BOX_W, FINDING_BOX_H, inset);
}

export function nextFindingGeometry(existingOnPhoto = [], inset) {
  return defaultFindingBox(inset, (existingOnPhoto || []).length);
}

export function missingRoiIndexes(photos) {
  return (photos || []).map((photo, index) => (roiIsValid(photo?.roi) ? null : index + 1)).filter(Boolean);
}

export function clampBoxRoi(x, y, w, h, inset) {
  const ix = Math.max(0, Number(inset?.x) || 0);
  const iy = Math.max(0, Number(inset?.y) || 0);
  const maxW = Math.max(MIN_SIDE, 1 - 2 * ix);
  const maxH = Math.max(MIN_SIDE, 1 - 2 * iy);
  let width = Math.max(MIN_SIDE, Math.min(maxW, Number(w) || 0));
  let height = Math.max(MIN_SIDE, Math.min(maxH, Number(h) || 0));
  let left = Math.max(ix, Math.min(1 - ix - width, Number(x) || 0));
  let top = Math.max(iy, Math.min(1 - iy - height, Number(y) || 0));
  if (left < ix) left = ix;
  if (top < iy) top = iy;
  if (left + width > 1 - ix) width = Math.max(MIN_SIDE, 1 - ix - left);
  if (top + height > 1 - iy) height = Math.max(MIN_SIDE, 1 - iy - top);
  return { type: "box", x: left, y: top, w: width, h: height };
}

export const MARK_MIN = ROI_MIN_SIDE;
export const DEFAULT_CIRCLE_DIAMETER = 0.50;

function insetXY(inset) {
  return {
    ix: Math.max(0, Number(inset?.x) || 0),
    iy: Math.max(0, Number(inset?.y) || 0),
  };
}

function frameSize(frameW, frameH) {
  const width = Number(frameW) > 0 ? Number(frameW) : 1;
  const height = Number(frameH) > 0 ? Number(frameH) : 1;
  return { width, height, short: Math.min(width, height) };
}

export function clampPoint(x, y, inset) {
  const { ix, iy } = insetXY(inset);
  return {
    x: Math.max(ix, Math.min(1 - ix, Number(x) || 0)),
    y: Math.max(iy, Math.min(1 - iy, Number(y) || 0)),
  };
}

export function lineLength(line) {
  const a = lineEnds(line);
  if (!a) return 0;
  return Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
}

export function lineEnds(line) {
  if (!line || typeof line !== "object") return null;
  if (line.type === "line" || (Number.isFinite(line.x1) && Number.isFinite(line.x2))) {
    const a = { x: Number(line.x1), y: Number(line.y1) };
    const b = { x: Number(line.x2), y: Number(line.y2) };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    return [a, b];
  }
  if ((line.type === "stroke" || Array.isArray(line.points)) && line.points?.length >= 2) {
    const first = line.points[0];
    const last = line.points[line.points.length - 1];
    const a = { x: Number(first?.x), y: Number(first?.y) };
    const b = { x: Number(last?.x), y: Number(last?.y) };
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    return [a, b];
  }
  return null;
}

function lineRecord(a, b) {
  return { type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function clampLine(a, b, inset) {
  const ends = b == null ? lineEnds(a) : [{ x: Number(a?.x), y: Number(a?.y) }, { x: Number(b?.x), y: Number(b?.y) }];
  const start = clampPoint(ends?.[0]?.x, ends?.[0]?.y, inset);
  let end = clampPoint(ends?.[1]?.x, ends?.[1]?.y, inset);
  const minLen = MARK_MIN;
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  let len = Math.hypot(dx, dy);
  if (len >= minLen) return lineRecord(start, end);
  const ux = len < 1e-6 ? 1 : dx / len;
  const uy = len < 1e-6 ? 0 : dy / len;
  end = clampPoint(start.x + ux * minLen, start.y + uy * minLen, inset);
  len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len >= minLen - 1e-9) return lineRecord(start, end);
  const back = clampPoint(end.x - ux * minLen, end.y - uy * minLen, inset);
  return lineRecord(back, end);
}

export function defaultLine(inset) {
  const { ix, iy } = insetXY(inset);
  const left = Math.max(0.12, ix);
  const right = 1 - left;
  const y = Math.max(iy, Math.min(1 - iy, 0.5));
  return clampLine({ x: left, y }, { x: right, y }, inset);
}

export function movedLine(start, origin, point, inset) {
  const ends = lineEnds(start) || lineEnds(defaultLine(inset));
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const { ix, iy } = insetXY(inset);
  const minX = Math.min(ends[0].x, ends[1].x);
  const maxX = Math.max(ends[0].x, ends[1].x);
  const minY = Math.min(ends[0].y, ends[1].y);
  const maxY = Math.max(ends[0].y, ends[1].y);
  const shiftX = Math.max(ix - minX, Math.min((1 - ix) - maxX, dx));
  const shiftY = Math.max(iy - minY, Math.min((1 - iy) - maxY, dy));
  return clampLine(
    { x: ends[0].x + shiftX, y: ends[0].y + shiftY },
    { x: ends[1].x + shiftX, y: ends[1].y + shiftY },
    inset,
  );
}

export function resizedLine(start, endIndex, point, inset) {
  const ends = lineEnds(start) || lineEnds(defaultLine(inset));
  const next = [ends[0], ends[1]];
  next[endIndex === 0 ? 0 : 1] = point;
  return clampLine(next[0], next[1], inset);
}

export function circleExtents(r, frameW, frameH) {
  const { width, height, short } = frameSize(frameW, frameH);
  const radiusPx = Math.max(0, Number(r) || 0) * short;
  return { rx: radiusPx / width, ry: radiusPx / height, short, width, height };
}

export function isLegacyEqualFractionCircle(roi) {
  const r = Number(roi?.r);
  if (!Number.isFinite(r)) return false;
  const rx = Number(roi?.rx);
  const ry = Number(roi?.ry);
  if (!Number.isFinite(rx) && !Number.isFinite(ry)) return true;
  return rx === r && ry === r;
}

export function hasIndependentCircleAxes(roi) {
  return Number.isFinite(Number(roi?.rx)) && Number.isFinite(Number(roi?.ry)) && !isLegacyEqualFractionCircle(roi);
}

export function circlePixelRadii(roi, frameW, frameH) {
  const { width, height, short } = frameSize(frameW, frameH);
  const r = Number(roi?.r);
  const fallback = (Number.isFinite(r) ? r : DEFAULT_CIRCLE_DIAMETER / 2) * short;
  if (hasIndependentCircleAxes(roi)) {
    return { rx: Number(roi.rx) * width, ry: Number(roi.ry) * height, width, height, short };
  }
  return { rx: fallback, ry: fallback, width, height, short };
}

export function circleNormalizedRadii(roi, frameW, frameH) {
  const { rx, ry, width, height } = circlePixelRadii(roi, frameW, frameH);
  return { rx: rx / width, ry: ry / height };
}

export function clampEllipse(x, y, rx, ry, inset, frameW, frameH) {
  const { ix, iy } = insetXY(inset);
  const { width, height, short } = frameSize(frameW, frameH);
  const minR = MARK_MIN / 2;
  const minRadiusPx = minR * short;
  const maxRx = Math.max(minRadiusPx / width, 0.5 - ix);
  const maxRy = Math.max(minRadiusPx / height, 0.5 - iy);
  let rxPx = Number(rx) * width;
  let ryPx = Number(ry) * height;
  if (!Number.isFinite(rxPx) || !Number.isFinite(ryPx)) {
    const fallback = (DEFAULT_CIRCLE_DIAMETER / 2) * short;
    rxPx = Number.isFinite(rxPx) ? rxPx : fallback;
    ryPx = Number.isFinite(ryPx) ? ryPx : fallback;
  }
  rxPx = Math.max(minRadiusPx, Math.min(maxRx * width, rxPx));
  ryPx = Math.max(minRadiusPx, Math.min(maxRy * height, ryPx));
  const rxN = rxPx / width;
  const ryN = ryPx / height;
  const radius = Math.min(rxPx, ryPx) / short;
  const cx = Math.max(ix + rxN, Math.min(1 - ix - rxN, Number(x) || 0.5));
  const cy = Math.max(iy + ryN, Math.min(1 - iy - ryN, Number(y) || 0.5));
  return { type: "circle", x: cx, y: cy, r: radius, rx: rxN, ry: ryN };
}

export function clampCircle(x, y, r, inset, frameW, frameH) {
  const { width, height, short } = frameSize(frameW, frameH);
  const minR = MARK_MIN / 2;
  const { ix, iy } = insetXY(inset);
  const maxRx = Math.max(minR * short / width, 0.5 - ix);
  const maxRy = Math.max(minR * short / height, 0.5 - iy);
  const maxR = Math.max(minR, Math.min(maxRx * width / short, maxRy * height / short));
  const radius = Math.max(minR, Math.min(maxR, Number(r) || minR));
  const { rx, ry } = circleExtents(radius, width, height);
  return clampEllipse(Number(x) || 0.5, Number(y) || 0.5, rx, ry, inset, width, height);
}

export function defaultCircle(inset, frameW, frameH) {
  return clampCircle(0.5, 0.5, DEFAULT_CIRCLE_DIAMETER / 2, inset, frameW, frameH);
}

export const LIVE_RADAR_DIAMETER = 0.70;

export function defaultLiveRadar(inset, frameW, frameH) {
  return clampCircle(0.5, 0.5, LIVE_RADAR_DIAMETER / 2, inset, frameW, frameH);
}

export function seedCircleRoi(live, frameW, frameH, inset) {
  const x = Number(live?.x);
  const y = Number(live?.y);
  const r = Number(live?.r);
  return clampCircle(
    Number.isFinite(x) ? x : 0.5,
    Number.isFinite(y) ? y : 0.5,
    Number.isFinite(r) ? r : LIVE_RADAR_DIAMETER / 2,
    inset || handleInsetNorm(frameW, frameH),
    frameW,
    frameH,
  );
}

export function shownCircle(roi, inset, frameW, frameH) {
  if (roi?.type !== "circle") return defaultCircle(inset, frameW, frameH);
  if (hasIndependentCircleAxes(roi)) {
    return clampEllipse(roi.x, roi.y, roi.rx, roi.ry, inset, frameW, frameH);
  }
  return clampCircle(roi.x, roi.y, roi.r, inset, frameW, frameH);
}

export function movedCircle(start, origin, point, inset, frameW, frameH) {
  const circle = start?.type === "circle" ? start : defaultCircle(inset, frameW, frameH);
  const x = circle.x + (point.x - origin.x);
  const y = circle.y + (point.y - origin.y);
  if (hasIndependentCircleAxes(circle)) {
    return clampEllipse(x, y, circle.rx, circle.ry, inset, frameW, frameH);
  }
  return clampCircle(x, y, circle.r, inset, frameW, frameH);
}

export function resizedCircle(start, point, inset, frameW, frameH, axis) {
  const circle = start?.type === "circle" ? start : defaultCircle(inset, frameW, frameH);
  const { width, height, short } = frameSize(frameW, frameH);
  const radii = circleNormalizedRadii(circle, width, height);
  if (axis === "e" || axis === "w") {
    return clampEllipse(circle.x, circle.y, Math.abs(point.x - circle.x), radii.ry, inset, width, height);
  }
  if (axis === "n" || axis === "s") {
    return clampEllipse(circle.x, circle.y, radii.rx, Math.abs(point.y - circle.y), inset, width, height);
  }
  const dx = (point.x - circle.x) * width;
  const dy = (point.y - circle.y) * height;
  return clampCircle(circle.x, circle.y, Math.hypot(dx, dy) / short, inset, width, height);
}

const finite01 = value => Number.isFinite(value) && value >= 0 && value <= 1;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export const LINE_ROI_HALF = 0.08;

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const RADAR_TAP_SLIP = 0.025;
const MIN_RADAR_R = 0.04;
const MIN_VERTEX_GAP = 0.03;

export function emptyRadarPolygon() {
  return { type: "polygon", center: null, vertices: [] };
}

export function radarCenterOf(poly, fallback = { x: 0.5, y: 0.5 }) {
  const c = poly?.center;
  if (c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y))) {
    return { x: Number(c.x), y: Number(c.y) };
  }
  const pts = radarRawPoints(poly);
  if (pts.length) {
    return {
      x: pts.reduce((sum, point) => sum + point.x, 0) / pts.length,
      y: pts.reduce((sum, point) => sum + point.y, 0) / pts.length,
    };
  }
  return { x: Number(fallback.x) || 0.5, y: Number(fallback.y) || 0.5 };
}

function radarRawPoints(poly) {
  const raw = Array.isArray(poly?.vertices) ? poly.vertices
    : Array.isArray(poly?.points) ? poly.points
      : [];
  return raw
    .filter(point => finite01(Number(point?.x)) && finite01(Number(point?.y)))
    .map(point => ({
      ...(Number.isFinite(Number(point.id)) ? { id: Number(point.id) } : {}),
      x: Number(point.x),
      y: Number(point.y),
    }));
}

export function radarClockwisePoints(points, center) {
  const c = center && Number.isFinite(center.x) && Number.isFinite(center.y) ? center : { x: 0.5, y: 0.5 };
  return [...(points || [])]
    .filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
    .map(point => ({ ...point, x: Number(point.x), y: Number(point.y) }))
    .sort((a, b) => {
      const aa = Math.atan2(a.y - c.y, a.x - c.x);
      const ba = Math.atan2(b.y - c.y, b.x - c.x);
      if (aa !== ba) return aa - ba;
      return Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y);
    });
}

function nextVertexId(vertices) {
  return (vertices || []).reduce((max, point) => Math.max(max, Number(point.id) || 0), 0) + 1;
}

export function addRadarVertex(poly, point, inset) {
  const tap = clampPoint(point?.x, point?.y, inset);
  const current = poly?.type === "polygon" ? poly : emptyRadarPolygon();
  if (!current.center || !Number.isFinite(Number(current.center.x))) {
    return { type: "polygon", center: tap, vertices: [] };
  }
  const center = clampPoint(current.center.x, current.center.y, inset);
  if (Math.hypot(tap.x - center.x, tap.y - center.y) < MIN_RADAR_R) return { type: "polygon", center, vertices: [...(current.vertices || [])] };
  const vertices = [...(current.vertices || [])];
  if (vertices.some(vertex => Math.hypot(vertex.x - tap.x, vertex.y - tap.y) < MIN_VERTEX_GAP)) {
    return { type: "polygon", center, vertices };
  }
  vertices.push({ id: nextVertexId(vertices), x: tap.x, y: tap.y });
  return { type: "polygon", center, vertices };
}

export function moveRadarCenter(poly, point, inset) {
  const current = poly?.type === "polygon" ? poly : emptyRadarPolygon();
  return {
    type: "polygon",
    center: clampPoint(point?.x, point?.y, inset),
    vertices: [...(current.vertices || [])].map(vertex => ({
      ...vertex,
      ...clampPoint(vertex.x, vertex.y, inset),
    })),
  };
}

export function moveRadarVertex(poly, vertexId, point, inset) {
  const current = poly?.type === "polygon" ? poly : emptyRadarPolygon();
  const tap = clampPoint(point?.x, point?.y, inset);
  const center = current.center ? clampPoint(current.center.x, current.center.y, inset) : tap;
  const vertices = (current.vertices || []).map(vertex => (
    vertex.id === vertexId ? { ...vertex, x: tap.x, y: tap.y } : { ...vertex, ...clampPoint(vertex.x, vertex.y, inset) }
  ));
  return { type: "polygon", center, vertices };
}

export function undoRadarVertex(poly) {
  const current = poly?.type === "polygon" ? poly : emptyRadarPolygon();
  const vertices = [...(current.vertices || [])];
  if (vertices.length) {
    vertices.pop();
    return { type: "polygon", center: current.center, vertices };
  }
  return emptyRadarPolygon();
}

export function persistRadarPolygon(poly, inset) {
  const current = poly?.type === "polygon" ? poly : emptyRadarPolygon();
  const center = current.center ? clampPoint(current.center.x, current.center.y, inset) : radarCenterOf(current);
  const points = radarClockwisePoints(radarRawPoints(current), center).map(point => ({ x: point.x, y: point.y }));
  return sanitizeRoi({ type: "polygon", points, center });
}

export function sanitizeRoi(roi) {
  if (!roi || typeof roi !== "object") return null;
  if (roi.type === "polygon") {
    const raw = radarRawPoints(roi);
    if (raw.length < 3) return null;
    const center = radarCenterOf({ ...roi, points: raw });
    const points = radarClockwisePoints(raw, center).map(point => ({ x: clamp01(point.x), y: clamp01(point.y) }));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    if (w < MIN_SIDE || h < MIN_SIDE) return null;
    return {
      type: "polygon",
      points,
      center: { x: clamp01(center.x), y: clamp01(center.y) },
    };
  }
  if (roi.type === "line" || roi.type === "stroke") {
    const line = clampLine(roi, null);
    if (lineLength(line) < MARK_MIN - 1e-9) return null;
    return line;
  }
  if (roi.type === "circle") {
    const x = Number(roi.x), y = Number(roi.y), r = Number(roi.r);
    if (![x, y, r].every(Number.isFinite) || r < MARK_MIN / 2) return null;
    const out = { type: "circle", x: clamp01(x), y: clamp01(y), r: Math.max(MARK_MIN / 2, r) };
    if (hasIndependentCircleAxes(roi)) {
      out.rx = Math.max(0.04, Number(roi.rx));
      out.ry = Math.max(0.04, Number(roi.ry));
    }
    return out;
  }
  const x = Number(roi.x), y = Number(roi.y), w = Number(roi.w), h = Number(roi.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const box = {
    type: "box",
    x: clamp01(x),
    y: clamp01(y),
    w: Math.max(0, Math.min(1 - clamp01(x), w)),
    h: Math.max(0, Math.min(1 - clamp01(y), h)),
  };
  if (box.w < MIN_SIDE || box.h < MIN_SIDE) return null;
  return box;
}

export function roiIsValid(roi) {
  return Boolean(sanitizeRoi(roi));
}

export function roiBoundingBox(roi, width, height) {
  const clean = sanitizeRoi(roi);
  if (!clean) return null;
  if (clean.type === "box") return { x: clean.x, y: clean.y, w: clean.w, h: clean.h };
  if (clean.type === "circle") {
    const { rx, ry } = circleNormalizedRadii(clean, width, height);
    const x = Math.max(0, clean.x - rx);
    const y = Math.max(0, clean.y - ry);
    return { x, y, w: Math.min(1 - x, 2 * rx), h: Math.min(1 - y, 2 * ry) };
  }
  if (clean.type === "line") {
    const pad = LINE_ROI_HALF;
    const x = Math.max(0, Math.min(clean.x1, clean.x2) - pad);
    const y = Math.max(0, Math.min(clean.y1, clean.y2) - pad);
    const right = Math.min(1, Math.max(clean.x1, clean.x2) + pad);
    const bottom = Math.min(1, Math.max(clean.y1, clean.y2) + pad);
    return { x, y, w: Math.max(MIN_SIDE, right - x), h: Math.max(MIN_SIDE, bottom - y) };
  }
  const xs = clean.points.map(p => p.x), ys = clean.points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function roiContains(roi, nx, ny, width, height) {
  const clean = sanitizeRoi(roi);
  if (!clean) return false;
  if (clean.type === "box") {
    return nx >= clean.x && ny >= clean.y && nx <= clean.x + clean.w && ny <= clean.y + clean.h;
  }
  if (clean.type === "circle") {
    const { rx, ry } = circleNormalizedRadii(clean, width, height);
    const dx = (nx - clean.x) / (rx || 1e-9);
    const dy = (ny - clean.y) / (ry || 1e-9);
    return dx * dx + dy * dy <= 1;
  }
  if (clean.type === "line") {
    return distToSegment(nx, ny, clean.x1, clean.y1, clean.x2, clean.y2) <= LINE_ROI_HALF;
  }
  return pointInPolygon(nx, ny, clean.points);
}

export function roiContainsRect(roi, nx, ny, nw, nh, width, height) {
  return roiContains(roi, nx, ny, width, height)
    && roiContains(roi, nx + nw, ny, width, height)
    && roiContains(roi, nx, ny + nh, width, height)
    && roiContains(roi, nx + nw, ny + nh, width, height);
}

export function roiPixelRect(roi, width, height) {
  const box = roiBoundingBox(roi, width, height);
  if (!box || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const sx = Math.max(0, Math.min(width - 1, Math.floor(box.x * width)));
  const sy = Math.max(0, Math.min(height - 1, Math.floor(box.y * height)));
  const ex = Math.max(sx + 1, Math.min(width, Math.ceil((box.x + box.w) * width)));
  const ey = Math.max(sy + 1, Math.min(height, Math.ceil((box.y + box.h) * height)));
  const sw = Math.max(MIN_PIXELS, ex - sx);
  const sh = Math.max(MIN_PIXELS, ey - sy);
  return {
    sx: Math.max(0, Math.min(width - sw, sx)),
    sy: Math.max(0, Math.min(height - sh, sy)),
    sw: Math.min(sw, width),
    sh: Math.min(sh, height),
  };
}

export function copyRoiImageData(src, srcW, srcH, roi) {
  const rect = roiPixelRect(roi, srcW, srcH);
  if (!rect || !(src instanceof Uint8ClampedArray) && !Array.isArray(src) && !(src?.length >= srcW * srcH * 4)) {
    return null;
  }
  const { sx, sy, sw, sh } = rect;
  const dest = new Uint8ClampedArray(sw * sh * 4);
  const inside = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = (sx + x + 0.5) / srcW;
      const ny = (sy + y + 0.5) / srcH;
      if (roiContains(roi, nx, ny, srcW, srcH)) inside.push([sx + x, sy + y]);
    }
  }
  let fillR = 150, fillG = 150, fillB = 152;
  if (inside.length) {
    let r = 0, g = 0, b = 0;
    for (const [px, py] of inside) {
      const i = (py * srcW + px) * 4;
      r += src[i]; g += src[i + 1]; b += src[i + 2];
    }
    fillR = Math.round(r / inside.length);
    fillG = Math.round(g / inside.length);
    fillB = Math.round(b / inside.length);
  }
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const di = (y * sw + x) * 4;
      const nx = (sx + x + 0.5) / srcW;
      const ny = (sy + y + 0.5) / srcH;
      if (roiContains(roi, nx, ny, srcW, srcH)) {
        const si = ((sy + y) * srcW + (sx + x)) * 4;
        dest[di] = src[si]; dest[di + 1] = src[si + 1]; dest[di + 2] = src[si + 2]; dest[di + 3] = 255;
      } else {
        dest[di] = fillR; dest[di + 1] = fillG; dest[di + 2] = fillB; dest[di + 3] = 255;
      }
    }
  }
  return { data: dest, width: sw, height: sh, rect };
}

export function persistRoi(roi, width, height) {
  const clean = sanitizeRoi(roi);
  if (!clean) return null;
  if (clean.type !== "circle") return clean;
  if (Number(width) > 0 && Number(height) > 0) {
    return hasIndependentCircleAxes(clean)
      ? clampEllipse(clean.x, clean.y, clean.rx, clean.ry, undefined, width, height)
      : clampCircle(clean.x, clean.y, clean.r, undefined, width, height);
  }
  return clean;
}

export function photoOrientation(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return null;
  return w >= h ? "landscape" : "portrait";
}

export function bindRoiToPhoto(roi, width, height) {
  const clean = persistRoi(roi, width, height);
  if (!clean || !(Number(width) > 0 && Number(height) > 0)) return null;
  return { ...clean, sourceWidth: Number(width), sourceHeight: Number(height) };
}

export function roiCompatibleWithPhoto(roi, photo = {}) {
  if (!roi) return true;
  const width = Number(photo.imageWidth ?? photo.width);
  const height = Number(photo.imageHeight ?? photo.height);
  if (!(width > 0 && height > 0)) return false;
  const sourceWidth = Number(roi.sourceWidth);
  const sourceHeight = Number(roi.sourceHeight);
  if (sourceWidth > 0 && sourceHeight > 0) {
    if (photoOrientation(sourceWidth, sourceHeight) !== photoOrientation(width, height)) return false;
  }
  return roiIsValid(persistRoi(roi, width, height));
}

export function canTransferRoi(roi, fromPhoto, toPhoto) {
  const fromW = Number(fromPhoto?.imageWidth);
  const fromH = Number(fromPhoto?.imageHeight);
  const toW = Number(toPhoto?.imageWidth);
  const toH = Number(toPhoto?.imageHeight);
  if (!(fromW > 0 && fromH > 0 && toW > 0 && toH > 0)) return false;
  if (photoOrientation(fromW, fromH) !== photoOrientation(toW, toH)) return false;
  if (!roiIsValid(persistRoi(roi, fromW, fromH))) return false;
  return roiIsValid(persistRoi(roi, toW, toH));
}

export function transferRoiToPhoto(roi, fromPhoto, toPhoto) {
  if (!canTransferRoi(roi, fromPhoto, toPhoto)) return null;
  return bindRoiToPhoto(roi, toPhoto.imageWidth, toPhoto.imageHeight);
}
