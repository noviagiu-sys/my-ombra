/* VisuClean v8.2 · Known-Issue-Leitplanken
   Ein Known Issue darf ausschliesslich einen durch QA klassifizierten,
   oberflächlichen kosmetischen Kratzer tolerieren. Globale Texturfehler,
   Korrosion, Rückstände und Feuchtigkeit bleiben unveränderbar FAIL. */

export const TOLERABLE_INTACT_CODES = Object.freeze(["SCRATCH_SUSPECT"]);
export const TOLERABLE_ISSUE_TYPES = Object.freeze(["hairline_scratch", "minor_wear"]);

const finite = (v) => Number.isFinite(v);

function endOfValidity(value) {
  if (typeof value !== "string" || !value) return new Date(NaN);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  }
  return new Date(value);
}

export function isIssueActive(issue, now = new Date()) {
  if (!issue || issue.status !== "active") return false;
  if (!TOLERABLE_ISSUE_TYPES.includes(issue.issueType)) return false;
  if (!TOLERABLE_INTACT_CODES.includes(issue.originalIntactCode)) return false;
  const until = endOfValidity(issue.validUntil);
  return Number.isFinite(until.getTime()) && until >= now;
}

/* Kratzer-Zonen stammen direkt aus den vom Analyse-Kern erkannten
   Zusammenhangskomponenten. Dunkel-/Anomalie-Masken werden absichtlich nicht
   verwendet: Sie können Korrosion oder Rückstände darstellen. */
/* Der Ortsbezug einer Zone: WORAUF sind ihre Koordinaten normiert?

   Seit rc.4.40 rechnet die Analyse auf einem ZUSCHNITT. Zonen aus zwei
   verschiedenen Ausschnitten tragen dann dieselben relativen Koordinaten,
   obwohl sie verschiedene Stellen auf dem Teil bezeichnen.

   Am echten Abgleich reproduziert (Gegenpruefung an rc.4.40): ein Kratzer
   links oben und ein Kratzer rechts unten, jeweils mittig zugeschnitten,
   ergaben beide 0,5/0,5 — `allMatched: true`, Status "unveraendert",
   KNOWN_ISSUE_TOLERATED. Der Abgleich hielt zwei verschiedene Stellen
   fuer dieselbe.

   Ohne belegten gemeinsamen Ortsbezug darf das Matching keine
   Uebereinstimmung behaupten. */
export const ZONEN_BEZUG = Object.freeze({
  /* Koordinaten auf das ganze FOTO normiert — ueber Ausschnitte hinweg
     vergleichbar, weil der Zuschnitt herausgerechnet ist. */
  FOTO: "FOTO",
  /* Kein Ausschnitt bekannt (Datensaetze vor rc.4.40). Diese Zonen sind
     untereinander vergleichbar, aber nicht mit FOTO-Zonen. */
  UNBEKANNT: undefined,
});

/* Kratzer-Zonen stammen direkt aus den vom Analyse-Kern erkannten
   Zusammenhangskomponenten.

   `flaeche` ist der Prueffläche-Eintrag (x, y, w, h, sourceWidth,
   sourceHeight). Ist er gegeben, werden die Koordinaten aus dem Zuschnitt
   in FOTO-Koordinaten zurueckgerechnet und die Zone traegt
   `bezug: "FOTO"`. Fehlt er, bleibt es beim alten Verhalten — und die
   Zone traegt keinen Bezug, was sie von FOTO-Zonen unterscheidbar macht. */
export function extractZones(overlay, flaeche = null) {
  if (!overlay || !finite(overlay.w) || !finite(overlay.h) || overlay.w <= 0 || overlay.h <= 0) return [];
  const scratches = Array.isArray(overlay.scratches) ? overlay.scratches : [];
  const minDim = Math.min(overlay.w, overlay.h);
  /* Der Radius ist auf die kurze Kante normiert. Beim Zurueckrechnen auf
     das Foto aendert sich diese Bezugsgroesse mit — sonst waere die Zone
     im Foto genauso "gross" wie im Ausschnitt. */
  const gueltig = flaeche && [flaeche.x, flaeche.y, flaeche.w, flaeche.h,
    flaeche.sourceWidth, flaeche.sourceHeight].every(finite)
    && flaeche.w > 0 && flaeche.h > 0
    && flaeche.sourceWidth > 0 && flaeche.sourceHeight > 0;
  const rFaktor = gueltig
    ? Math.min(flaeche.w * flaeche.sourceWidth, flaeche.h * flaeche.sourceHeight)
      / Math.min(flaeche.sourceWidth, flaeche.sourceHeight)
    : 1;
  return scratches
    .filter(c => c && finite(c.minX) && finite(c.maxX) && finite(c.minY) && finite(c.maxY))
    .map(c => {
      const width = Math.max(1, c.maxX - c.minX + 1);
      const height = Math.max(1, c.maxY - c.minY + 1);
      const x = (c.minX + c.maxX) / 2 / overlay.w;
      const y = (c.minY + c.maxY) / 2 / overlay.h;
      const r = Math.max(7, 0.5 * Math.hypot(width, height) * 1.15) / minDim;
      if (!gueltig) return { kind: "scratch", x, y, r };
      return {
        kind: "scratch",
        bezug: ZONEN_BEZUG.FOTO,
        x: flaeche.x + x * flaeche.w,
        y: flaeche.y + y * flaeche.h,
        r: r * rFaktor,
      };
    })
    .filter(z => [z.x, z.y, z.r].every(finite) && z.x >= 0 && z.x <= 1 && z.y >= 0 && z.y <= 1 && z.r > 0)
    .slice(0, 20);
}

/* Eindeutiges 1:1-Matching: Eine gespeicherte Zone darf niemals mehrere
   aktuelle Zonen abdecken. */
export function matchZones(current = [], stored = [], posTol = 0.15, growTol = 1.35) {
  const unmatched = [];
  const grown = [];
  const matched = [];
  const usedStored = new Set();

  for (const zone of current) {
    const candidates = stored
      .map((saved, index) => ({ saved, index, distance: Math.hypot(saved.x - zone.x, saved.y - zone.y) }))
      /* Gleicher Ortsbezug ist Vorbedingung, nicht Zugabe. Eine
         FOTO-Zone und eine Zone ohne Bezug sind nicht vergleichbar: die
         eine meint eine Stelle auf dem Teil, die andere eine Stelle in
         einem unbekannten Ausschnitt. Ohne belegten gemeinsamen Bezug
         wird KEINE Uebereinstimmung behauptet. */
      .filter(c => !usedStored.has(c.index) && c.saved.kind === zone.kind
        && (c.saved.bezug ?? null) === (zone.bezug ?? null)
        && c.distance <= posTol)
      .sort((a, b) => a.distance - b.distance);

    if (!candidates.length) {
      unmatched.push(zone);
      continue;
    }

    const fitting = candidates.find(c => zone.r <= c.saved.r * growTol);
    if (!fitting) {
      grown.push(zone);
      usedStored.add(candidates[0].index);
      continue;
    }

    usedStored.add(fitting.index);
    matched.push({ current: zone, stored: fitting.saved, storedIndex: fitting.index });
  }

  return {
    allMatched: current.length > 0 && unmatched.length === 0 && grown.length === 0,
    unmatched,
    grown,
    matched,
  };
}

export function canCreateKnownIssue(result) {
  return Boolean(
    result &&
    result.intact &&
    !result.intact.pass &&
    TOLERABLE_INTACT_CODES.includes(result.intact.code) &&
    extractZones(result._ov).length > 0
  );
}

export function applyKnownIssues(result, equipmentId, zoneId, issues = [], nowIso) {
  if (!result || !result.intact || result.intact.pass) return { res: result, info: null };

  const now = nowIso ? new Date(nowIso) : new Date();
  const relevant = issues.filter(issue =>
    issue && issue.eqId === equipmentId && issue.zoneId === zoneId && isIssueActive(issue, now));

  if (!relevant.length) return { res: result, info: null };

  if (!TOLERABLE_INTACT_CODES.includes(result.intact.code)) {
    return {
      res: result,
      info: { status: "nicht_tolerierbar", reason: result.intact.code, issues: relevant },
    };
  }

  const currentZones = extractZones(result._ov, result.pruefflaeche || null);
  if (!currentZones.length) {
    return { res: result, info: { status: "nicht_lokalisierbar", issues: relevant } };
  }

  const storedZones = relevant.flatMap(issue =>
    (issue.zones || []).map(zone => ({ ...zone, issueId: issue.id })));
  const comparison = matchZones(currentZones, storedZones);

  if (!comparison.allMatched) {
    return {
      res: result,
      info: {
        status: "verschlechtert",
        issues: relevant,
        neu: comparison.unmatched.length,
        gewachsen: comparison.grown.length,
      },
    };
  }

  const matchedIssueIds = new Set(comparison.matched.map(m => m.stored.issueId));
  const matchedIssues = relevant.filter(issue => matchedIssueIds.has(issue.id));
  const nearestExpiry = [...matchedIssues].sort((a, b) => endOfValidity(a.validUntil) - endOfValidity(b.validUntil))[0];

  return {
    res: {
      ...result,
      intact: {
        code: "KNOWN_ISSUE_TOLERATED",
        pass: true,
        message: "Intakt – bekannte kosmetische Auffälligkeit (QA-toleriert)",
        detail: `${currentZones.length} bekannte Kratzerzone(n), unverändert · gültig bis ${nearestExpiry?.validUntilLabel || nearestExpiry?.validUntil}`,
        severity: 0,
        action: "",
        originalVerdict: result.intact,
      },
    },
    info: {
      status: "unveraendert",
      issue: nearestExpiry,
      issues: matchedIssues,
      matchedZones: comparison.matched.length,
    },
  };
}
