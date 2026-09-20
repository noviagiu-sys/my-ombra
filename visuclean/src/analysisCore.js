/* ─── VisuClean Analyse-Kern v3 — deterministisch, on-device, ohne KI ───────
   Erweiterungen ggü. v2 (Grauwelt):
   1. Blockweise Lokal-Analyse (16-px-Raster): kleine lokale Defekte werden
      erkannt, auch wenn globale Anteile unter den Schwellen bleiben.
   2. Beleuchtungs-Ebnung (5x5-Block-MEDIAN-Feld): Lichtgradienten/Vignetten
      erzeugen keine Textur-/Dunkel-Fehlalarme mehr; Defekte bleiben sichtbar,
      weil der Median gegen lokale Ausreisser robust ist.
   3. Farbneutrale Anomalien: heller Belag (z. B. Pulverrückstand) und dunkle
      Ablagerungen werden als Abweichung vom robusten Umgebungsniveau erkannt
      — unabhängig von der Farbe.
   4. Kratzer-/Riefen-Verdacht: längliche, dünne Kantenstrukturen (Gradienten-
      Cluster mit grosser Ausdehnung und geringer Füllung).
   5. Spiegelreflex vs. Tropfenmuster: ein grosser zusammenhängender Hell-
      Bereich = Überstrahlung (Handlungsanweisung Streiflicht); viele kleine
      Hell-Cluster = Feuchtigkeits-/Tropfenmuster.
   6. Ambiguitäts-Hinweise: beleuchtungsabhängige Urteile werden explizit
      gemeldet (Grauwelt-an/aus-Vergleich; flächig warme Färbung).
   Determinismus: alle Schwellen sind fix; adaptive Statistiken (Median/MAD)
   sind deterministische Funktionen des Bildes (gleiches Bild = gleiches
   Ergebnis, GAMP-5-tauglich).                                                */

export const GREY_WORLD = true;
export const GREY_STRENGTH = 0.5; // 0 = aus, 1 = volle Korrektur
const BLK = 16;                   // Blockgrösse in px

/* Zusammenhangskomponenten (8er-Nachbarschaft) mit Bounding-Box */
export function componentStats(mask, w, h, minSize) {
  const n = w * h, seen = new Uint8Array(n), stack = [], out = [];
  for (let i = 0; i < n; i++) {
    if (!mask[i] || seen[i]) continue;
    stack.length = 0; stack.push(i); seen[i] = 1;
    let count = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (count >= minSize) out.push({ count, minX, maxX, minY, maxY });
  }
  return out;
}

export function computeFeatures(data, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  const maskBright = new Uint8Array(n);
  const maskWarm = new Uint8Array(n);
  const maskDark = new Uint8Array(n);
  const maskAnom = new Uint8Array(n);

  /* Pass 1: Luminanz, Dunkel, Kanalmittel (Hell-Erkennung folgt nach
     der Beleuchtungs-Ebnung, damit Lichtgradienten keine Fehlalarme geben) */
  let df = 0, vdf = 0, sR = 0, sG = 0, sB = 0, lsum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[p] = l; lsum += l;
    if (l < 0.18) df++;
    if (l < 0.08) { vdf++; maskDark[p] = 1; }
    sR += r; sG += g; sB += b;
  }
  const mR = sR / n, mG = sG / n, mB = sB / n, mGray = (mR + mG + mB) / 3;
  const kR = GREY_WORLD ? 1 + GREY_STRENGTH * (mGray / (mR || 1e-6) - 1) : 1;
  const kG = GREY_WORLD ? 1 + GREY_STRENGTH * (mGray / (mG || 1e-6) - 1) : 1;
  const kB = GREY_WORLD ? 1 + GREY_STRENGTH * (mGray / (mB || 1e-6) - 1) : 1;

  /* Pass 2: Farb-Features — normalisiert UND roh (Ambiguitäts-Check) */
  let wc = 0, wcRaw = 0;
  let sDR = 0, sDR2 = 0, sDG = 0, sDG2 = 0, sDB = 0, sDB2 = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const l = lum[p];
    const rn = Math.min(1, r * kR), gn = Math.min(1, g * kG), bn = Math.min(1, b * kB);
    const avg = (rn + gn + bn) / 3;
    const dR = rn - avg, dG = gn - avg, dB = bn - avg;
    sDR += dR; sDR2 += dR * dR; sDG += dG; sDG2 += dG * dG; sDB += dB; sDB2 += dB * dB;
    if ((rn - bn) > 0.08 && l > 0.08) { wc++; maskWarm[p] = 1; }
    if ((r - b) > 0.08 && l > 0.08) wcRaw++;
  }
  /* Farb-Ungleichmässigkeit: Varianz der Chroma-Abweichungen. Ein GLEICH-
     MÄSSIGER Farbstich (Lichtfarbe) ergibt ~0; fleckige Verfärbung schlägt an. */
  const cvVar = Math.max(0, sDR2 / n - (sDR / n) ** 2)
              + Math.max(0, sDG2 / n - (sDG / n) ** 2)
              + Math.max(0, sDB2 / n - (sDB / n) ** 2);

  /* Gradienten: Schärfe global, Kantenmaske für Kratzer */
  const maskEdge = new Uint8Array(n);
  let gsum = 0;
  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const p = row + x;
      const g = Math.abs(lum[p] - lum[p + 1]) + Math.abs(lum[p] - lum[p + w]);
      gsum += g;
      if (g > 0.14) maskEdge[p] = 1;
    }
  }
  const gradMean = gsum / ((w - 1) * (h - 1));

  /* Blockraster: Mittel + Warm-Anteil je Block */
  const gw = Math.ceil(w / BLK), gh = Math.ceil(h / BLK), nb = gw * gh;
  const bSum = new Float64Array(nb), bCnt = new Uint32Array(nb), bWarm = new Uint32Array(nb);
  for (let y = 0; y < h; y++) {
    const by = (y / BLK) | 0;
    for (let x = 0; x < w; x++) {
      const p = y * w + x, b = by * gw + ((x / BLK) | 0);
      bSum[b] += lum[p]; bCnt[b]++;
      if (maskWarm[p]) bWarm[b]++;
    }
  }
  const bMean = new Float32Array(nb);
  for (let b = 0; b < nb; b++) bMean[b] = bSum[b] / (bCnt[b] || 1);

  /* Beleuchtungsfeld: 5x5-Block-MEDIAN (robust gegen Defekt-Blöcke,
     folgt aber Lichtgradienten). Defekte < ~50 px kippen den Median nicht. */
  const field = new Float32Array(nb);
  const win = [];
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    win.length = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = by + dy, xx = bx + dx;
      if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
      win.push(bMean[yy * gw + xx]);
    }
    win.sort((a, b) => a - b);
    field[by * gw + bx] = win[(win.length / 2) | 0];
  }
  const fSorted = Array.from(field).sort((a, b) => a - b);
  const med = fSorted[(nb / 2) | 0] || 0.5;

  /* Geebnete Blockmittel + MAD */
  const bFlat = new Float32Array(nb);
  for (let b = 0; b < nb; b++) bFlat[b] = bMean[b] * (med / Math.max(field[b], 1e-4));
  const devs = Array.from(bFlat, v => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = Math.max(devs[(nb / 2) | 0] || 0, 0.004);

  /* Geebnete Pixel-Varianz (Textur ohne Beleuchtungsgradient) */
  let fsum = 0, fsq = 0;
  for (let y = 0; y < h; y++) {
    const by = (y / BLK) | 0;
    for (let x = 0; x < w; x++) {
      const b = by * gw + ((x / BLK) | 0);
      const lf = lum[y * w + x] * (med / Math.max(field[b], 1e-4));
      fsum += lf; fsq += lf * lf;
    }
  }
  const fm = fsum / n, tvFlat = Math.max(0, fsq / n - fm * fm);

  /* Hell-Erkennung (beleuchtungsbereinigt): Reflexe/Tropfen sind lokal
     heller als das Umgebungsfeld ODER nahe Sättigung (echte Glanzpunkte
     clippen); ein heller Bildbereich aus Lichtgradient ist keines von beidem. */
  let bf = 0;
  for (let y = 0; y < h; y++) {
    const by = (y / BLK) | 0;
    for (let x = 0; x < w; x++) {
      const p = y * w + x, b = by * gw + ((x / BLK) | 0);
      const l = lum[p];
      const lf = l * (med / Math.max(field[b], 1e-4));
      if (l > 0.93 || (l > 0.82 && lf > 0.82)) { bf++; maskBright[p] = 1; }
    }
  }

  /* Lokal-Anomalien: warme Blöcke + farbneutrale Abweichungen */
  let warmBlocks = 0, anomBright = 0, anomDark = 0;
  const thr = Math.max(0.06, 3.5 * mad);
  for (let b = 0; b < nb; b++) {
    if (bCnt[b] < BLK * BLK * 0.5) continue; // Randblöcke ignorieren
    const wfB = bWarm[b] / bCnt[b];
    if (wfB > 0.25) warmBlocks++;
    const d = bFlat[b] - med;
    if (Math.abs(d) > thr && wfB <= 0.25) {
      if (d > 0) anomBright++; else anomDark++;
      const by = (b / gw) | 0, bx = b % gw;
      for (let y = by * BLK; y < Math.min((by + 1) * BLK, h); y++)
        for (let x = bx * BLK; x < Math.min((bx + 1) * BLK, w); x++)
          maskAnom[y * w + x] = 1;
    }
  }

  /* Kratzer-Verdacht: lange, dünne Kantenkomponenten.
     Gate: nur wenn Kantenanteil global moderat (sonst Schliffbild-dominiert). */
  let scratches = [];
  let ec = 0; for (let i = 0; i < n; i++) ec += maskEdge[i];
  const edgeFrac = ec / n;
  if (edgeFrac < 0.06 && tvFlat < 0.035) {
    const comps = componentStats(maskEdge, w, h, Math.max(24, (0.0002 * n) | 0));
    const minDim = Math.min(w, h);
    scratches = comps.filter(c => {
      const bw = c.maxX - c.minX + 1, bh2 = c.maxY - c.minY + 1;
      const diag = Math.sqrt(bw * bw + bh2 * bh2);
      const fill = c.count / (bw * bh2);
      const aspect = Math.max(bw, bh2) / Math.max(1, Math.min(bw, bh2));
      return diag > 0.28 * minDim && (fill < 0.15 || aspect > 4);
    });
  }

  /* Spiegelreflex vs. Tropfenmuster */
  let specular = false, droplets = false;
  if (bf > 0.01 * n) {
    const comps = componentStats(maskBright, w, h, Math.max(8, (0.00015 * n) | 0));
    const total = comps.reduce((s, c) => s + c.count, 0);
    const largest = comps.reduce((m, c) => Math.max(m, c.count), 0);
    specular = total > 0 && largest / total > 0.6 && largest > 0.02 * n;
    droplets = !specular && comps.length >= 6;
  }

  return {
    w, h, lm: lsum / n,
    bfr: bf / n, dfr: df / n, vdfr: vdf / n,
    wf: wc / n, wfRaw: wcRaw / n, cv: cvVar,
    tvFlat, gradMean, edgeFrac,
    warmBlocks, warmBlockFrac: warmBlocks / nb,
    anomBright, anomDark, anomBlockFrac: (anomBright + anomDark) / nb,
    scratches, specular, droplets,
    masks: { maskBright, maskWarm, maskDark, maskAnom },
  };
}

export function buildVerdicts(f) {
  const hints = [];
  let dry, clean, intact;

  /* ── TROCKEN ── */
  if (f.bfr > 0.04 || (f.droplets && f.bfr > 0.015)) {
    if (f.specular)
      dry = { code: "SPECULAR_REFLECTION", pass: false, message: "Überstrahlung / Spiegelreflex erkannt", detail: `${(f.bfr * 100).toFixed(1)}% helle Pixel — grossflächige zusammenhängende Reflexion`, severity: Math.min(100, Math.round(f.bfr * 1200)), action: "Aufnahmewinkel ändern / Streiflicht — Aufnahme wiederholen" };
    else
      dry = { code: "MOISTURE_SUSPECT", pass: false, message: "Feuchtigkeit erkannt" + (f.droplets ? " (Tropfenmuster)" : ""), detail: `${(f.bfr * 100).toFixed(1)}% helle Reflexionspunkte${f.droplets ? " in vielen kleinen Clustern" : ""}`, severity: Math.min(100, Math.round(f.bfr * 1200)), action: "Nachtrocknung erforderlich" };
  } else if (f.gradMean > 0.055 && f.edgeFrac > 0.08)
    dry = { code: "VISIBLE_MOISTURE_TEXTURE", pass: false, message: "Sichtbare Feuchtigkeitsstruktur erkannt", detail: `Mikrokanten ${(f.edgeFrac * 100).toFixed(1)}% · Texturwert ${f.gradMean.toFixed(3)}`, severity: Math.min(100, Math.round(35 + f.edgeFrac * 250)), action: "Oberfläche nachtrocknen und Kontrollaufnahme erstellen" };
  else if (f.lm < 0.22 && f.dfr > 0.30)
    dry = { code: "DARK_WET_SUSPECT", pass: false, message: "Verdacht auf nasse Oberfläche", detail: "Sehr dunkle Oberfläche — Feuchtigkeit möglich", severity: 45, action: "Trocknungszustand visuell prüfen" };
  else
    dry = { code: "PASS", pass: true, message: "Keine sichtbare Feuchtigkeit", detail: `Bildbasierte Prüfung bestanden (Helligkeit ${(f.lm * 100).toFixed(0)}%) — kein physischer Feuchtesensor`, severity: 0, action: "" };

  /* ── SAUBER ── */
  if (f.wf > 0.12) {
    clean = { code: "ORGANIC_RESIDUE", pass: false, message: "Organische Rückstände (braun/gelb)", detail: `${(f.wf * 100).toFixed(1)}% warme Pixel (nach Beleuchtungs-Normalisierung)`, severity: Math.min(100, Math.round(f.wf * 700)), action: "Nachreinigung · Produktrückstände prüfen" };
    if (f.warmBlockFrac > 0.8)
      hints.push("Flächig warme Färbung: ganzflächige Kontamination ODER warme Lichtfarbe — Lichtquelle prüfen bzw. Referenzbild vergleichen.");
  } else if (f.warmBlocks >= 2 && f.warmBlockFrac > 0.015) {
    clean = { code: "LOCAL_RESIDUE", pass: false, message: "Lokale Rückstände (warm/braun)", detail: `${f.warmBlocks} auffällige Bildzonen (blockweise Analyse)`, severity: Math.min(100, 20 + f.warmBlocks * 15), action: "Nachreinigung · markierte Zonen prüfen" };
  } else if (f.anomBright + f.anomDark >= 2 && f.anomBlockFrac < 0.18) {
    clean = { code: f.anomBright >= f.anomDark ? "BRIGHT_RESIDUE" : "DARK_RESIDUE", pass: false, message: f.anomBright >= f.anomDark ? "Heller Belag erkannt (farbneutral, z. B. Pulverrückstand)" : "Dunkle Ablagerung erkannt (farbneutral)", detail: `${f.anomBright + f.anomDark} Bildzonen weichen vom Umgebungsniveau ab`, severity: Math.min(100, 20 + (f.anomBright + f.anomDark) * 12), action: "Nachreinigung · Abstrich empfohlen" };
  } else if (f.cv > 0.0015) {
    clean = { code: "COLOR_VARIATION", pass: false, message: "Fleckige Verfärbung erkannt", detail: `Farb-Ungleichmässigkeit: ${(f.cv * 1000).toFixed(2)}‰`, severity: Math.min(100, Math.round(f.cv * 25000)), action: "Reinigung wiederholen · Abstrich empfohlen" };
  } else if (f.lm < 0.28) {
    clean = { code: "DARK_SURFACE", pass: false, message: "Verdacht auf Ablagerungen", detail: `Oberfläche zu dunkel (${(f.lm * 100).toFixed(0)}%) — Edelstahl sollte heller sein`, severity: 50, action: "Reinigungszustand visuell nachprüfen" };
  } else {
    clean = { code: "PASS", pass: true, message: "Sauber ✓", detail: "Keine sichtbaren Rückstände", severity: 0, action: "" };
  }

  /* Ambiguität: Urteil hängt an der Farbkorrektur */
  if (!(f.wf > 0.12) && f.wfRaw > 0.12)
    hints.push("Ergebnis beleuchtungsabhängig: ohne Farbkorrektur ergäbe «Sauber» FAIL — Lichtfarbe prüfen.");

  /* ── INTAKT ── */
  if (f.scratches.length > 0) {
    intact = { code: "SCRATCH_SUSPECT", pass: false, message: "Kratzer- / Riefen-Verdacht", detail: `${f.scratches.length} längliche Struktur(en) erkannt`, severity: Math.min(100, 30 + f.scratches.length * 20), action: "Oberfläche prüfen — ggf. Known-Issue-Bewertung durch QA" };
  } else if (f.tvFlat > 0.020 && f.edgeFrac > 0.06) {
    intact = { code: "GLOBAL_TEXTURE_FAIL", pass: false, message: "Unregelmässige Oberfläche erkannt", detail: `Textur-Varianz (beleuchtungsbereinigt): ${f.tvFlat.toFixed(4)}`, severity: Math.min(100, Math.round((f.tvFlat - 0.020) * 3500)), action: "Abplatzer / Risse / Korrosion? → Nachprüfung" };
  } else if (f.vdfr > 0.04 && f.edgeFrac > 0.06) {
    intact = { code: "CORROSION_SUSPECT", pass: false, message: "Dunkle Flecken / Korrosionsverdacht", detail: `${(f.vdfr * 100).toFixed(1)}% sehr dunkle Pixel`, severity: 40, action: "Rost / Abplatzer / Dichtungsschäden prüfen" };
  } else {
    intact = { code: "PASS", pass: true, message: "Intakt ✓", detail: "Oberfläche gleichmässig", severity: 0, action: "" };
  }

  /* Schärfe-Hinweis */
  if (f.gradMean < 0.006)
    hints.push("Bild wirkt unscharf — Schärfe prüfen, ggf. Aufnahme wiederholen.");
  if (f.anomBlockFrac >= 0.18)
    hints.push("Viele verteilte Helligkeitsabweichungen sprechen für Geometrie oder Beleuchtung; daraus wurde kein lokaler Sauberkeitsfehler abgeleitet.");

  /* Unterdrückte Intakt-Befunde sichtbar machen.
     GLOBAL_TEXTURE_FAIL und CORROSION_SUSPECT sind seit 8.3.0-rc.1 zusätzlich
     an edgeFrac > 0.06 gebunden. Liegt der Primärwert über seiner Schwelle,
     fehlt aber die Kantenstützung, entstand bisher ein stilles PASS. Der
     Prüfer erfährt jetzt, dass ein Signal vorlag und warum es verworfen wurde
     — symmetrisch zum Hinweis auf der Sauber-Seite. Keine Schwelle und kein
     Urteil ändern sich dadurch. */
  if (f.scratches.length === 0 && f.edgeFrac <= 0.06) {
    if (f.tvFlat > 0.020)
      hints.push(`Texturabweichung ${f.tvFlat.toFixed(4)} über der Schwelle 0.0200, aber nur ${(f.edgeFrac * 100).toFixed(1)}% Mikrokanten: als Geometrie oder Unschärfe gewertet, nicht als Defekt. Bei Zweifel scharfe Nahaufnahme wiederholen.`);
    if (f.vdfr > 0.04)
      hints.push(`${(f.vdfr * 100).toFixed(1)}% sehr dunkle Pixel ohne Kantenstützung (${(f.edgeFrac * 100).toFixed(1)}% Mikrokanten): nicht als Korrosion gewertet. Bei Zweifel scharfe Nahaufnahme wiederholen.`);
  }

  return { dry, clean, intact, hints };
}
