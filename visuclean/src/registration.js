/* ─── VisuClean 8.3.0-rc.4.5.mehrwinkel.1 · QR-label registration (homography) ─────────────────
   Align captures of the same zone via the printed QR label corners.
   No OpenCV, ORB, SIFT — direct linear 8×8 solve + bilinear back-sample.
   Deterministic: no Math.random, no time source.                           */

/**
 * Stellwert — NOT a validated threshold.
 * Max mean reprojection residual (px) accepted for a registration to enter
 * fusion. Calibration campaign must confirm.
 */
export const REGISTRATION_RESIDUAL_MAX_PX = 2.5; // Stellwert — not validated

/**
 * Prueffeld: das Vielfache der ERKANNTEN Etikettenbreite, das die
 * Entzerrung abdeckt. Das Etikett liegt mittig darin.
 *
 * Bis …mehrwinkel.3 bildete die Homographie die vier Etikettenecken auf das
 * ganze Zielquadrat ab — entzerrt wurde also das ETIKETT und nicht die
 * Flaeche daneben, die geprueft werden soll. Befund der Gegenpruefung,
 * zutreffend.
 *
 * UNKALIBRIERTER STELLWERT. Bewusst NICHT in Millimetern benannt: der
 * tatsaechliche Etikettendruck ist nicht vermessen (siehe
 * SCALE_CALIBRATION). "3x erkannte Etikettenbreite" ist die einzige
 * Aussage, die ohne Messung traegt.
 */
export const FIELD_FACTOR = 3; // Stellwert — not validated, not in millimetres

/**
 * Nominal printed QR size from generate-labels.mjs CSS (43 mm × 43 mm).
 * Actual printer scale is unmeasured → OPEN_CALIBRATION_CASE.
 * Do NOT display millimetre lengths until a printed label is documented.
 */
export const SCALE_CALIBRATION = Object.freeze({
  status: "OPEN_CALIBRATION_CASE",
  nominalLabelMm: 43,
  reason: "Nennmass aus dem Druck-CSS. Der tatsaechliche Druck ist nicht "
        + "vermessen. Erst nach dokumentierter Messung an einem gedruckten "
        + "Etikett darf daraus eine Laengenangabe abgeleitet werden.",
});

/** Normalize corner input from jsQR / BarcodeDetector / plain {x,y} tuples. */
export function normalizeCorners(corners) {
  if (!corners) return null;
  const pick = (o, ...keys) => {
    for (const k of keys) {
      const v = o?.[k];
      if (v && Number.isFinite(Number(v.x)) && Number.isFinite(Number(v.y))) {
        return { x: Number(v.x), y: Number(v.y) };
      }
    }
    return null;
  };
  if (Array.isArray(corners) && corners.length === 4) {
    const pts = corners.map(p => {
      if (Array.isArray(p) && p.length >= 2) return { x: Number(p[0]), y: Number(p[1]) };
      if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
        return { x: Number(p.x), y: Number(p.y) };
      }
      return null;
    });
    if (pts.every(Boolean)) return Object.freeze({
      topLeft: pts[0], topRight: pts[1], bottomRight: pts[2], bottomLeft: pts[3],
    });
  }
  const topLeft = pick(corners, "topLeft", "topLeftCorner");
  const topRight = pick(corners, "topRight", "topRightCorner");
  const bottomRight = pick(corners, "bottomRight", "bottomRightCorner");
  const bottomLeft = pick(corners, "bottomLeft", "bottomLeftCorner");
  /* BarcodeDetector cornerPoints: typically TL, TR, BR, BL */
  if ((!topLeft || !topRight || !bottomRight || !bottomLeft)
      && Array.isArray(corners.cornerPoints) && corners.cornerPoints.length === 4) {
    return normalizeCorners(corners.cornerPoints);
  }
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;
  return Object.freeze({ topLeft, topRight, bottomRight, bottomLeft });
}

function solve8(A, b) {
  /* Gaussian elimination with partial pivoting on 8×8. */
  const n = 8;
  const M = A.map((row, i) => row.slice().concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    if (piv !== col) { const t = M[col]; M[col] = M[piv]; M[piv] = t; }
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function invert3(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}

function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * Homography mapping the four source label corners onto a target square
 * [0,size]×[0,size] (TL→(0,0), TR→(size,0), BR→(size,size), BL→(0,size)).
 * Returns { matrix, inverse, size } or null.
 */
export function homographyFromCorners(corners, size = 128, fieldFactor = FIELD_FACTOR) {
  const c = normalizeCorners(corners);
  if (!c) return null;
  const S = Math.max(8, size | 0);
  /* Das Etikett landet MITTIG in einem Feld von fieldFactor Etikettenbreiten.
     Bei fieldFactor 1 ist das Verhalten wie zuvor (nur das Etikett). */
  const F = Math.max(1, Number(fieldFactor) || 1);
  const seite = S / F;
  const off = (S - seite) / 2;
  const src = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  const dst = [
    { x: off, y: off }, { x: off + seite, y: off },
    { x: off + seite, y: off + seite }, { x: off, y: off + seite },
  ];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const u = dst[i].x, v = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h8 = solve8(A, b);
  if (!h8) return null;
  const matrix = Object.freeze([...h8, 1]);
  const inverse = invert3(matrix);
  if (!inverse) return null;
  return Object.freeze({
    matrix,
    inverse: Object.freeze(inverse),
    size: S,
    fieldFactor: F,
    /* Das Prueffeld in Etikettenbreiten — die einzige Groessenangabe, die
       ohne vermessenen Etikettendruck traegt. KEINE Millimeter. */
    fieldInLabelWidths: F,
  });
}

/**
 * Mindestanteil des Prueffelds, der tatsaechlich aus dem Quellbild stammt.
 *
 * Das 3x-Feld reicht ueber das Etikett hinaus und damit oft ueber den
 * Bildrand. `warpToPlane` klemmt dort auf den Randpixel — es entsteht
 * FLAECHE, die nie fotografiert wurde. Befund der Gegenpruefung an rc.4.7,
 * zutreffend: solange das nicht gemessen und begrenzt wird, arbeitet die
 * Fusion auf erfundenem Bildinhalt.
 *
 * UNKALIBRIERTER STELLWERT.
 */
export const WARP_COVERAGE_MIN = 0.6; // Stellwert — not validated

/**
 * Anteil des Prueffelds, der aus dem Quellbild stammt (0..1).
 * Reine Geometrie: jedes Zielpixel wird rueckwaerts abgebildet und gezaehlt,
 * ob es innerhalb des Quellbilds liegt.
 */
export function warpCoverage(homography, sourceWidth, sourceHeight, targetSize) {
  if (!homography?.inverse) return 0;
  const S = Math.max(8, (targetSize ?? homography.size ?? 128) | 0);
  const schritt = Math.max(1, Math.floor(S / 64));
  let innen = 0, gesamt = 0;
  for (let y = 0; y < S; y += schritt) {
    for (let x = 0; x < S; x += schritt) {
      const p = applyH(homography.inverse, x + 0.5, y + 0.5);
      gesamt++;
      if (p && p.x >= 0 && p.y >= 0 && p.x < sourceWidth && p.y < sourceHeight) innen++;
    }
  }
  return gesamt ? Math.round((innen / gesamt) * 1e6) / 1e6 : 0;
}

/** Punkt durch die Homographie schicken — fuer Aufrufer und Tests. */
export function applyToPoint(homography, x, y) {
  return homography?.matrix ? applyH(homography.matrix, x, y) : null;
}

/**
 * Unabhaengige Registrierungskontrolle.
 *
 * `registrationQuality` projiziert dieselben vier Punkte zurueck, aus denen
 * die Homographie exakt geloest wurde — der Wert liegt bauartbedingt nahe
 * null und ist deshalb KEIN Nachweis. Befund der Gegenpruefung, zutreffend;
 * MA-04 war damit ein Test, der nicht rot werden konnte.
 *
 * Diese Kontrolle geht einen anderen Weg: sie sucht das Etikett im
 * ENTZERRTEN Bild noch einmal und misst, wie weit seine Ecken vom
 * Sollquadrat abweichen. Der Sucher wird als Parameter uebergeben (wie der
 * Detektor bei der Fusion) — die Registrierung kennt ihn nicht.
 *
 * @param {ImageData|{data,width,height}} warped Das entzerrte Bild
 * @param {object} homography Rueckgabe von homographyFromCorners
 * @param {Function} findCorners (imageLike) => {topLeft,topRight,bottomRight,bottomLeft}|null
 */
export function verifyByRedetect(warped, homography, findCorners) {
  if (typeof findCorners !== "function" || !warped || !homography) {
    return Object.freeze({ redetectResidualPx: Infinity, status: "NO_DETECTOR" });
  }
  const gefunden = normalizeCorners(findCorners(warped));
  if (!gefunden) return Object.freeze({ redetectResidualPx: Infinity, status: "LABEL_NOT_FOUND" });

  const S = homography.size || 128;
  const F = Math.max(1, Number(homography.fieldFactor) || 1);
  const seite = S / F;
  const off = (S - seite) / 2;
  const soll = [
    { x: off, y: off }, { x: off + seite, y: off },
    { x: off + seite, y: off + seite }, { x: off, y: off + seite },
  ];
  const ist = [gefunden.topLeft, gefunden.topRight, gefunden.bottomRight, gefunden.bottomLeft];
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += Math.hypot(ist[i].x - soll[i].x, ist[i].y - soll[i].y);
  return Object.freeze({
    redetectResidualPx: Math.round((sum / 4) * 1e6) / 1e6,
    status: "CHECKED",
  });
}

function sampleBilinear(data, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) {
    /* Clamp to edge for out-of-bounds; return transparent-black-ish grey. */
    const cx = Math.min(w - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(h - 1, Math.max(0, Math.round(y)));
    const i = (cy * w + cx) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = x0 + 1, y1 = y0 + 1;
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const v = data[i00 + c] * (1 - fx) * (1 - fy)
      + data[i10 + c] * fx * (1 - fy)
      + data[i01 + c] * (1 - fx) * fy
      + data[i11 + c] * fx * fy;
    out[c] = Math.round(v);
  }
  return out;
}

/**
 * Warp image into the label plane. Back-projects each destination pixel
 * through the inverse homography and bilinear-samples the source.
 * imageData: { data, width, height } or ImageData-like.
 */
export function warpToPlane(imageData, homography, targetSize) {
  if (!imageData?.data || !homography?.inverse) return null;
  const srcW = imageData.width | 0;
  const srcH = imageData.height | 0;
  const S = Math.max(8, (targetSize ?? homography.size ?? 128) | 0);
  const out = new Uint8ClampedArray(S * S * 4);
  const inv = homography.inverse;
  const src = imageData.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = applyH(inv, x + 0.5, y + 0.5);
      const i = (y * S + x) * 4;
      if (!p) {
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255;
        continue;
      }
      const [r, g, b, a] = sampleBilinear(src, srcW, srcH, p.x - 0.5, p.y - 0.5);
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    }
  }
  return { data: out, width: S, height: S };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * residualPx: mean reprojection error of the four corners (px in dest space).
 * labelShape: qualitative view cue from the source parallelogram
 *   (aspect ratio + shear) — NOT a measured viewAngleDeg.
 */
export function registrationQuality(corners, homography) {
  const c = normalizeCorners(corners);
  if (!c || !homography?.matrix) {
    return Object.freeze({ residualPx: Infinity, labelShape: null });
  }
  const S = homography.size || 128;
  /* Dieselbe Feldgeometrie wie in homographyFromCorners: das Etikett liegt
     mittig, nicht auf dem ganzen Zielquadrat. */
  const F = Math.max(1, Number(homography.fieldFactor) || 1);
  const seite = S / F;
  const off = (S - seite) / 2;
  const src = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  const dst = [
    { x: off, y: off }, { x: off + seite, y: off },
    { x: off + seite, y: off + seite }, { x: off, y: off + seite },
  ];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const p = applyH(homography.matrix, src[i].x, src[i].y);
    if (!p) return Object.freeze({ residualPx: Infinity, labelShape: null });
    sum += Math.hypot(p.x - dst[i].x, p.y - dst[i].y);
  }
  const residualPx = sum / 4;

  const top = dist(c.topLeft, c.topRight);
  const bottom = dist(c.bottomLeft, c.bottomRight);
  const left = dist(c.topLeft, c.bottomLeft);
  const right = dist(c.topRight, c.bottomRight);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  const aspect = height > 1e-6 ? width / height : 0;

  /* Shear: absolute cosine of angle at top-left between top and left edges. */
  const vx = c.topRight.x - c.topLeft.x, vy = c.topRight.y - c.topLeft.y;
  const wx = c.bottomLeft.x - c.topLeft.x, wy = c.bottomLeft.y - c.topLeft.y;
  const vn = Math.hypot(vx, vy) || 1;
  const wn = Math.hypot(wx, wy) || 1;
  const shear = Math.abs((vx * wx + vy * wy) / (vn * wn));

  const labelShape = Object.freeze({
    aspect: Math.round(aspect * 1e6) / 1e6,
    shear: Math.round(shear * 1e6) / 1e6,
    widthPx: Math.round(width * 1000) / 1000,
    heightPx: Math.round(height * 1000) / 1000,
  });
  return Object.freeze({
    residualPx: Math.round(residualPx * 1e6) / 1e6,
    labelShape,
  });
}

/** Convenience: corners → homography + quality, or null if unusable. */
export function registerFromCorners(corners, size = 128) {
  const c = normalizeCorners(corners);
  if (!c) return null;
  const H = homographyFromCorners(c, size);
  if (!H) return null;
  const q = registrationQuality(c, H);
  return Object.freeze({
    homography: H,
    ...q,
    corners: c,
    registered: Number.isFinite(q.residualPx)
      && q.residualPx <= REGISTRATION_RESIDUAL_MAX_PX,
  });
}

/* ─── Ebenenannahme: wo die Entzerrung gilt und wo nicht ──────────────────
   Eine Homographie bildet eine EBENE auf eine Ebene ab. Das ist keine
   Feinheit der Umsetzung, sondern die Voraussetzung des Verfahrens.

   Auf einer gekruemmten Prueffflaeche gilt sie nicht: dieselbe Abbildung,
   die das ebene Etikett korrekt entzerrt, verzerrt die gewoelbte Flaeche
   daneben — und zwar umso staerker, je weiter man sich vom Etikett
   entfernt. FIELD_FACTOR deckt das Dreifache der Etikettenbreite ab.

   WARUM DAS RESIDUUM DAS NICHT ABFAENGT
   `verifyByRedetect` sucht das Etikett im ENTZERRTEN Bild wieder. Das
   Etikett ist per Bauart eben; ein kleines Rueckprojektionsresiduum ist
   deshalb mit einer stark gekruemmten Umgebung vollstaendig vertraeglich.
   Dieselbe Fehlerklasse, die rc.4.7 an `registrationQuality` gefunden hat —
   eine Pruefung, die ihre eigene Eingabe bestaetigt — nur eine Ebene
   hoeher. Die Entzerrung wird deshalb VOR jeder Residuumspruefung
   gesperrt, nicht nach ihr.

   Befund aus der Gegenpruefung vom 16.09.2026, zutreffend: bis rc.4.32
   lief `warpToPlane` unabhaengig von `zone.planar`, und die Kennzeichnung
   NON_PLANAR_ZONE wurde erst nachtraeglich auf das Ergebnis gesetzt. Der
   Oberflaechentext versprach "die Mehrwinkelauswertung entfaellt hier",
   waehrend sie lief.                                                     */

export const PLANARITY = Object.freeze({
  PLANAR: "PLANAR",
  NON_PLANAR: "NON_PLANAR_ZONE",
  UNKNOWN: "PLANARITY_UNKNOWN",
});

/**
 * Darf auf dieser Zone entzerrt werden?
 *
 * Nimmt AUSSCHLIESSLICH die dokumentierte Form der Zone entgegen. Kein
 * Residuum, keine Abdeckung, keine Bildgroesse — sonst koennte eine gute
 * Messung am Etikett eine Entscheidung ueber die Flaeche daneben tragen.
 *
 * Eine fehlende Angabe ist KEINE Ebenheit. Sie sperrt ebenfalls, aber mit
 * eigenem Grund: "nicht erfasst" und "nicht eben" verlangen verschiedene
 * naechste Schritte.
 */
export function rectificationAllowed(zone) {
  if (zone?.planar === true) {
    return { allowed: true, planarity: PLANARITY.PLANAR, reason: null };
  }
  if (zone?.planar === false) {
    return { allowed: false, planarity: PLANARITY.NON_PLANAR, reason: PLANARITY.NON_PLANAR };
  }
  return { allowed: false, planarity: PLANARITY.UNKNOWN, reason: PLANARITY.UNKNOWN };
}
