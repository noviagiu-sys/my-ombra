/* ─── VisuClean · Kratzer-Screening ───────────────────────────────────────
   Zweitdetektor neben dem Analyse-Kern. Portierung des Python-Entwurfs
   (CLAHE → Sobel → Zusammenhangskomponenten → Formfilter) nach JavaScript.

   WARUM ES DAS GIBT
   Der Kern sucht auf geschliffenem Edelstahl oft gar nicht nach Kratzern.
   In analysisCore.js steht die Suche hinter einem Tor:

       if (edgeFrac < 0.06 && tvFlat < 0.035) { ... }

   Der Kommentar dort sagt warum: "sonst Schliffbild-dominiert". Das Tor
   schuetzt vor Fehlalarmen durch das Schliffmuster, indem es die Suche
   ABSCHALTET. Gemessen an der realen Kontrollaufnahme des Projekts:
   tvFlat 0.0451 gegen die Schranke 0.035 — das Tor ist zu, und ein
   Kratzer ueber 80 % der Bildkante bleibt unentdeckt.

   Dieses Modul schliesst die Luecke anders: es unterdrueckt die
   SCHLIFFRICHTUNG statt die ganze Suche.

   SICHERHEIT DURCH BAUFORM
   Das Screening darf nur Kandidaten HINZUFUEGEN und SORTIEREN. Es aendert
   kein Urteil, entfernt keinen Befund und erzeugt niemals ein PASS.
   Daraus folgt: es kann kein falsches PASS produzieren. Die Stellwerte
   beeinflussen nur, wie gut es hinweist — nicht, ob ein Ergebnis richtig
   ist. Genau deshalb darf es gebaut werden, obwohl die
   Kalibrierungskampagne noch aussteht. Wird diese Eigenschaft verletzt,
   faellt das Argument; SC-01 und SC-02 sichern sie ab.

   NICHT FILTERN, SONDERN SORTIEREN
   Der Python-Entwurf verwirft kurze Strukturen (MIN_LAENGE = 25). Das wird
   NICHT uebernommen. Stilles Wegwerfen ist in einer GMP-Sichtpruefung die
   gefaehrliche Richtung. Alle Kandidaten werden zurueckgegeben, absteigend
   nach relevanceScore sortiert.

   KEINE TIEFENANGABE. Kantenstaerke ist ein Kontrastmass, kein Tiefenmass.
   X-03 verbietet erfundene Millimeter-Tiefen und laeuft in npm test.

   Rein, deterministisch, ohne DOM, ohne Zufall, ohne Zeitquelle.        */

/* ── Stellwerte ───────────────────────────────────────────────────────────
   NICHT validierte Schwellenwerte. Sie steuern die Aufmerksamkeit, nicht
   die Richtigkeit. Aenderungen brauchen keine Neufreigabe des Urteils —
   sie koennen von aussen uebergeben werden (Konfigurierbarkeit).         */
export const SCREENING_STELLWERTE = Object.freeze({
  /* Kantenschwelle auf den normierten Sobel-Betrag (0..1). */
  edgeThreshold: 0.18,
  /* Kachelgroesse der lokalen Kontrastnormierung (CLAHE-Naeherung). */
  tileSize: 32,
  /* Mindestpixelzahl einer Komponente. Klein gehalten: kurze Strukturen
     sollen in der Liste stehen, nur niedrig bewertet. */
  minComponentPixels: 12,
  /* Bis zu diesem Winkelabstand zur Schliffrichtung gilt ein Kandidat als
     Schliffspur. Er wird dadurch NICHT verworfen, nur niedrig bewertet. */
  grindToleranceDeg: 15,
  /* Ab diesem Laengen-Breiten-Verhaeltnis gilt eine Struktur als voll
     schlank; darunter wird der Beitrag linear heruntergezogen. */
  slenderReference: 4,
  /* Bilder werden vor der Analyse auf diese lange Kante begrenzt.
     Reine Laufzeitgrenze; lengthRel bleibt aufloesungsunabhaengig. */
  maxDimension: 1024,
  /* Zahl der Winkelfaecher fuer die Schliffrichtungsschaetzung. */
  orientationBins: 36,
  note: "Stellwerte — not validated thresholds",
});

/* ── Hilfsfunktionen ──────────────────────────────────────────────────── */

/** Graustufen aus RGBA, Rec. 601. */
function luminanz(data, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  }
  return out;
}

/**
 * Ganzzahliges Box-Downsampling. Nur eine Laufzeitgrenze — es veraendert
 * keine Entscheidung, weil alle Laengen relativ zur kurzen Kante
 * ausgegeben werden.
 */
function verkleinern(data, w, h, maxKante) {
  const faktor = Math.max(1, Math.ceil(Math.max(w, h) / maxKante));
  if (faktor === 1) return { data, w, h };
  const nw = Math.max(1, Math.floor(w / faktor));
  const nh = Math.max(1, Math.floor(h / faktor));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, z = 0;
      for (let dy = 0; dy < faktor; dy++) {
        const sy = y * faktor + dy;
        if (sy >= h) break;
        for (let dx = 0; dx < faktor; dx++) {
          const sx = x * faktor + dx;
          if (sx >= w) break;
          const p = (sy * w + sx) * 4;
          r += data[p]; g += data[p + 1]; b += data[p + 2]; z++;
        }
      }
      const o = (y * nw + x) * 4;
      out[o] = r / z; out[o + 1] = g / z; out[o + 2] = b / z; out[o + 3] = 255;
    }
  }
  return { data: out, w: nw, h: nh };
}

/**
 * Lokale Kontrastnormierung als CLAHE-Naeherung.
 * Je Kachel Mittelwert und Streuung, bilinear zwischen den Kachelmitten
 * interpoliert. Zweck ist Robustheit gegen Streiflicht, nicht Bildqualitaet.
 */
function lokalNormieren(lum, w, h, kachel) {
  const tx = Math.max(1, Math.ceil(w / kachel));
  const ty = Math.max(1, Math.ceil(h / kachel));
  const mittel = new Float32Array(tx * ty);
  const streuung = new Float32Array(tx * ty);

  for (let ky = 0; ky < ty; ky++) {
    for (let kx = 0; kx < tx; kx++) {
      let summe = 0, quadrat = 0, z = 0;
      const y0 = ky * kachel, y1 = Math.min(h, y0 + kachel);
      const x0 = kx * kachel, x1 = Math.min(w, x0 + kachel);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = lum[y * w + x];
          summe += v; quadrat += v * v; z++;
        }
      }
      const m = z ? summe / z : 0;
      mittel[ky * tx + kx] = m;
      streuung[ky * tx + kx] = Math.sqrt(Math.max(0, (z ? quadrat / z : 0) - m * m));
    }
  }

  const hole = (arr, kx, ky) => arr[
    Math.min(ty - 1, Math.max(0, ky)) * tx + Math.min(tx - 1, Math.max(0, kx))];

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / kachel - 0.5;
    const ky = Math.floor(fy), wy = fy - ky;
    for (let x = 0; x < w; x++) {
      const fx = x / kachel - 0.5;
      const kx = Math.floor(fx), wx = fx - kx;
      const m =
        hole(mittel, kx, ky) * (1 - wx) * (1 - wy)
        + hole(mittel, kx + 1, ky) * wx * (1 - wy)
        + hole(mittel, kx, ky + 1) * (1 - wx) * wy
        + hole(mittel, kx + 1, ky + 1) * wx * wy;
      const s =
        hole(streuung, kx, ky) * (1 - wx) * (1 - wy)
        + hole(streuung, kx + 1, ky) * wx * (1 - wy)
        + hole(streuung, kx, ky + 1) * (1 - wx) * wy
        + hole(streuung, kx + 1, ky + 1) * wx * wy;
      /* Streuungsboden verhindert, dass gleichmaessige Flaechen durch
         Division auf Rauschen verstaerkt werden. */
      out[y * w + x] = (lum[y * w + x] - m) / Math.max(0.02, s);
    }
  }
  return out;
}

/** Sobel: Betrag (normiert) und Kantenrichtung in Grad [0,180). */
function sobel(norm, w, h) {
  const betrag = new Float32Array(w * h);
  const richtung = new Float32Array(w * h);
  let maximum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = norm[i - w - 1], b = norm[i - w], c = norm[i - w + 1];
      const d = norm[i - 1], f = norm[i + 1];
      const g = norm[i + w - 1], k = norm[i + w], l = norm[i + w + 1];
      const gx = (c + 2 * f + l) - (a + 2 * d + g);
      const gy = (g + 2 * k + l) - (a + 2 * b + c);
      const m = Math.sqrt(gx * gx + gy * gy);
      betrag[i] = m;
      if (m > maximum) maximum = m;
      /* Der Gradient steht SENKRECHT auf der Linie. Die Linienrichtung ist
         daher der Gradientenwinkel plus 90 Grad, auf [0,180) normiert. */
      let winkel = Math.atan2(gy, gx) * 180 / Math.PI + 90;
      winkel %= 180;
      if (winkel < 0) winkel += 180;
      richtung[i] = winkel;
    }
  }
  if (maximum > 0) for (let i = 0; i < betrag.length; i++) betrag[i] /= maximum;
  return { betrag, richtung };
}

/**
 * Dominante Schliffrichtung: mit dem Kantenbetrag gewichtetes Histogramm
 * ueber die Linienrichtungen. Das ist der wertvollste Schritt des Moduls —
 * ohne ihn ist ein Querkratzer im Schliffbild nicht von der Schliffstruktur
 * zu trennen.
 */
function schliffrichtung(betrag, richtung, schwelle, faecher) {
  const hist = new Float64Array(faecher);
  const breite = 180 / faecher;
  for (let i = 0; i < betrag.length; i++) {
    if (betrag[i] < schwelle) continue;
    let b = Math.floor(richtung[i] / breite);
    if (b >= faecher) b = faecher - 1;
    hist[b] += betrag[i];
  }
  let best = 0, bestWert = -1, summe = 0;
  for (let b = 0; b < faecher; b++) {
    summe += hist[b];
    if (hist[b] > bestWert) { bestWert = hist[b]; best = b; }
  }
  return {
    grindDirectionDeg: (best + 0.5) * breite,
    /* Anteil des staerksten Faechers an der Gesamtenergie. Klein heisst:
       keine ausgepraegte Vorzugsrichtung, die Unterdrueckung greift kaum. */
    grindStrength: summe > 0 ? bestWert / summe : 0,
    histogram: Array.from(hist),
  };
}

/** Winkelabstand zweier Linienrichtungen, Ergebnis in [0,90]. */
function winkelAbstand(a, b) {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

/**
 * Zusammenhangskomponenten MIT Momenten zweiter Ordnung.
 * componentStats aus analysisCore.js liefert nur die Bounding Box; fuer die
 * Hauptachse werden Momente gebraucht, deshalb eine eigene Fassung. Der
 * Kern bleibt unberuehrt (Lesevorlage, nicht Baustelle).
 */
function komponenten(maske, betrag, w, h, minPixel) {
  const n = w * h;
  const gesehen = new Uint8Array(n);
  const stapel = [];
  const out = [];
  for (let start = 0; start < n; start++) {
    if (!maske[start] || gesehen[start]) continue;
    stapel.length = 0; stapel.push(start); gesehen[start] = 1;
    let anzahl = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sb = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    const punkte = [];
    while (stapel.length) {
      const p = stapel.pop();
      const x = p % w, y = (p / w) | 0;
      anzahl++; punkte.push(p);
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      sb += betrag[p];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (maske[q] && !gesehen[q]) { gesehen[q] = 1; stapel.push(q); }
        }
      }
    }
    if (anzahl < minPixel) continue;
    const mx = sx / anzahl, my = sy / anzahl;
    const m20 = sxx / anzahl - mx * mx;
    const m02 = syy / anzahl - my * my;
    const m11 = sxy / anzahl - mx * my;
    /* Hauptachse aus den zentralen Momenten. In Bildkoordinaten zeigt y
       nach unten; das Vorzeichen wird beim Winkel beruecksichtigt. */
    let theta = 0.5 * Math.atan2(2 * m11, m20 - m02) * 180 / Math.PI;
    theta %= 180;
    if (theta < 0) theta += 180;
    /* Laenge und Breite als Ausdehnung entlang der Hauptachse und ihrer
       Normalen — robuster als die Bounding Box bei schraegen Strukturen. */
    const rad = theta * Math.PI / 180;
    const ca = Math.cos(rad), sa = Math.sin(rad);
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of punkte) {
      const x = p % w - mx, y = ((p / w) | 0) - my;
      const a = x * ca + y * sa;
      const b = -x * sa + y * ca;
      if (a < aMin) aMin = a; if (a > aMax) aMax = a;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    out.push({
      anzahl,
      boundingBox: { minX, minY, maxX, maxY },
      orientationDeg: theta,
      laengePx: aMax - aMin + 1,
      breitePx: bMax - bMin + 1,
      edgeStrength: sb / anzahl,
    });
  }
  return out;
}

/* ── Hauptfunktion ────────────────────────────────────────────────────── */

/**
 * Sucht laengliche Strukturen und bewertet sie nach Relevanz.
 *
 * Gibt ALLE Kandidaten zurueck, absteigend nach relevanceScore sortiert.
 * Nichts wird verworfen. Kandidaten in Schliffrichtung bekommen einen
 * niedrigen Wert und stehen weiter unten — sie stehen aber da.
 *
 * @param {Uint8ClampedArray|Uint8Array} data  RGBA
 * @param {number} w
 * @param {number} h
 * @param {object} [options]  ueberschreibt einzelne Stellwerte
 * @returns {{candidates: Array, grindDirectionDeg: number,
 *            grindStrength: number, suppressedCount: number,
 *            stellwerte: object}}
 */
export function screenScratches(data, w, h, options = {}) {
  const s = { ...SCREENING_STELLWERTE, ...(options || {}) };
  const leer = Object.freeze({
    candidates: Object.freeze([]),
    /* Auch im leeren Fall benannt — null heisst "nicht bestimmt", nicht 0. */
    bildBreite: null,
    bildHoehe: null,
    grindDirectionDeg: 0,
    grindStrength: 0,
    suppressedCount: 0,
    stellwerte: Object.freeze({ ...s }),
  });
  if (!data || !(w > 2) || !(h > 2)) return leer;

  const klein = verkleinern(data, w | 0, h | 0, s.maxDimension);
  const lum = luminanz(klein.data, klein.w, klein.h);
  const norm = lokalNormieren(lum, klein.w, klein.h, s.tileSize);
  const { betrag, richtung } = sobel(norm, klein.w, klein.h);

  const schliff = schliffrichtung(betrag, richtung, s.edgeThreshold, s.orientationBins);

  /* Zwei getrennte Masken, NACH Kantenrichtung.

     Das ist der eigentliche Kunstgriff. Wuerde man beide zusammen
     auswerten, verschmilzt ein Querkratzer an jeder Kreuzung mit den
     Schlifflinien zu einem einzigen Gebilde — gemessen: Platz 1 bekam
     dann eine Schliffspur mit 2,5 Grad Winkelabstand, der Kratzer ging
     darin unter. Getrennt gelabelt bleibt der Kratzer eine eigene,
     schlanke Komponente.

     Verworfen wird dabei nichts: die Schliffmaske wird ebenfalls
     ausgewertet, ihre Komponenten stehen mit niedriger Bewertung in
     derselben Liste (suppressedCount zaehlt sie). */
  const n = klein.w * klein.h;
  const maskeQuer = new Uint8Array(n);
  const maskeSchliff = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (betrag[i] < s.edgeThreshold) continue;
    if (winkelAbstand(richtung[i], schliff.grindDirectionDeg) <= s.grindToleranceDeg) {
      maskeSchliff[i] = 1;
    } else {
      maskeQuer[i] = 1;
    }
  }

  const roh = [
    ...komponenten(maskeQuer, betrag, klein.w, klein.h, s.minComponentPixels)
      .map(c => ({ ...c, ausSchliffmaske: false })),
    ...komponenten(maskeSchliff, betrag, klein.w, klein.h, s.minComponentPixels)
      .map(c => ({ ...c, ausSchliffmaske: true })),
  ];
  const kurzeKante = Math.min(klein.w, klein.h);

  let suppressedCount = 0;
  const candidates = roh.map(c => {
    const grindDeltaDeg = winkelAbstand(c.orientationDeg, schliff.grindDirectionDeg);
    const laenge = Math.max(c.laengePx, c.breitePx);
    const breite = Math.max(1, Math.min(c.laengePx, c.breitePx));
    const schlankheit = laenge / breite;

    /* Drei dimensionslose Faktoren, jeder einzeln erklaerbar — Erklaerbarkeit
       ist im GMP-Umfeld Teil der Anforderung, nicht Beiwerk:
         quer   1 bei senkrecht zum Schliff, 0 bei parallel
         schlank 1 ab slenderReference, darunter linear weniger
         laengeRel Ausdehnung bezogen auf die kurze Bildkante             */
    const quer = Math.sin(grindDeltaDeg * Math.PI / 180);
    const schlank = Math.min(1, schlankheit / s.slenderReference);
    const lengthRel = laenge / kurzeKante;
    const relevanceScore = lengthRel * c.edgeStrength * quer * schlank;
    /* Dieselbe Bewertung OHNE den Richtungsfaktor. Die geschaetzte
       Vorzugsrichtung ist nicht kalibriert; sie darf nicht die einzige
       sichtbare Rangfolge bestimmen. Der Wert aendert keine Entscheidung
       und braucht keine neue Schwelle — er macht nur nachrechenbar, was
       die Richtungsabwertung bewirkt hat. */
    const relevanceScoreUngerichtet = lengthRel * c.edgeStrength * schlank;

    /* Als Schliffspur gilt, was aus der Schliffmaske stammt ODER dessen
       Hauptachse in Schliffrichtung liegt. Beide Wege fuehren zu niedriger
       Bewertung, keiner zum Verwerfen. */
    const alsSchliff = c.ausSchliffmaske || grindDeltaDeg <= s.grindToleranceDeg;
    if (alsSchliff) suppressedCount++;

    return {
      boundingBox: c.boundingBox,
      lengthRel,
      widthRel: breite / kurzeKante,
      elongation: schlankheit,
      orientationDeg: c.orientationDeg,
      grindDeltaDeg,
      edgeStrength: c.edgeStrength,
      relevanceScore,
      relevanceScoreUngerichtet,
      /* Kein Urteil, keine Klasse. Nur ein Hinweis darauf, warum dieser
         Kandidat niedrig bewertet wurde. */
      alignedWithGrind: alsSchliff,
      pixelCount: c.anzahl,
    };
  });

  /* ── Stabile Kennung ──────────────────────────────────────────────────
     Vergeben BEVOR nach Relevanz sortiert wird, und zwar nach der
     Bildposition — nicht nach einer der beiden Rangfolgen.

     Warum das wichtig ist: bis rc.4.30 war ein Kandidat nur ueber seinen
     Platz greifbar. Beim Umschalten der Sortierung aenderte sich der
     Platz, und damit zeigte "Zeile 1" auf etwas anderes als vorher. Eine
     Kennung, die eine Rangfolge abbildet, ist keine Kennung.

     Die Vergabe ist deterministisch: dieselben Pixel ergeben dieselben
     Kennungen (Regel 2). */
  const nachLage = candidates
    .map((c, i) => ({ i, y: c.boundingBox.minY, x: c.boundingBox.minX }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.i - b.i));
  const stellen = String(candidates.length).length;
  nachLage.forEach((e, platz) => {
    candidates[e.i].kandidatId = `K${String(platz + 1).padStart(stellen, "0")}`;
  });

  /* Absteigend nach Relevanz. Bei Gleichstand deterministisch nach der
     Bildposition, damit die Reihenfolge reproduzierbar ist (SC-06). */
  candidates.sort((a, b) =>
    (b.relevanceScore - a.relevanceScore)
    || (a.boundingBox.minY - b.boundingBox.minY)
    || (a.boundingBox.minX - b.boundingBox.minX));

  /* Zweitstaerkster Faecher und sein Abstand zum staerksten. Fuer die
     Werkbank: eine klare Richtung, zwei Richtungen (Kreuzschliff) und eine
     breite Verteilung sehen daran verschieden aus. Rohwerte, keine
     abgeleitete Kennzahl — eine "Multimodalitaet" waere wieder eine
     ungemessene Zahl. */
  const hist = schliff.histogram;
  const sortiert = hist.map((wert, index) => ({ wert, index }))
    .sort((a, b) => b.wert - a.wert);
  const summe = hist.reduce((z, v) => z + v, 0);
  const breiteFach = 180 / s.orientationBins;

  return Object.freeze({
    candidates: Object.freeze(candidates.map(Object.freeze)),
    /* Die Groesse des Bildes, in dem die boundingBox-Koordinaten liegen.
       NICHT die Groesse der Aufnahme: screenScratches verkleinert intern
       auf maxDimension. Ohne diese Angabe hat eine gespeicherte Box
       keinen Bezug, und keine Kandidatenstelle laesst sich im Foto
       wiederfinden — genau das war bis rc.4.30 der Fall. */
    bildBreite: klein.w,
    bildHoehe: klein.h,
    grindDirectionDeg: schliff.grindDirectionDeg,
    /* Anteil des staerksten Winkelfaechers an der Gesamtenergie.
       KEINE Wahrscheinlichkeit und keine Zuverlaessigkeit — ein
       Konzentrationsmass, nicht kalibriert.

       Die Abhaengigkeit von orientationBins ist gemessen (SC-21) und
       NICHT gleichmaessig: liegt eine klare Vorzugsrichtung vor, fallen
       ohnehin fast alle Kanten in denselben Faecher und die Faecherzahl
       aendert kaum etwas (Testbild: 0.8888 bei 18 gegen 0.8887 bei 72).
       Fehlt eine Vorzugsrichtung, verteilt sich die Energie und der
       Spitzenanteil bricht ein (0.0881 gegen 0.0523). Der Wert ist damit
       nur bei GLEICHER Faecherzahl vergleichbar — deshalb wird
       orientationBins mit ausgegeben. */
    grindStrength: schliff.grindStrength,
    orientationBins: s.orientationBins,
    grindSecondDirectionDeg: sortiert[1] ? (sortiert[1].index + 0.5) * breiteFach : null,
    grindSecondStrength: sortiert[1] && summe > 0 ? sortiert[1].wert / summe : null,
    grindHistogram: Object.freeze(hist.slice()),
    suppressedCount,
    stellwerte: Object.freeze({ ...s }),
  });
}

/**
 * Fuehrt Kernbefunde und Screening-Kandidaten zusammen.
 *
 * NUR HINZUFUEGEN. Jeder Kernbefund bleibt unveraendert erhalten; das
 * Screening haengt eigene Eintraege mit source "SCREENING" an. Die Menge
 * kann nur wachsen — SC-02 sichert das ab.
 */
export function mergeScreening(coreFindings, screening) {
  const kern = Array.isArray(coreFindings) ? coreFindings : [];
  const kandidaten = screening?.candidates || [];
  const zusatz = kandidaten.map((c, index) => Object.freeze({
    source: "SCREENING",
    rank: index + 1,
    boundingBox: c.boundingBox,
    lengthRel: c.lengthRel,
    widthRel: c.widthRel,
    orientationDeg: c.orientationDeg,
    grindDeltaDeg: c.grindDeltaDeg,
    edgeStrength: c.edgeStrength,
    relevanceScore: c.relevanceScore,
    alignedWithGrind: c.alignedWithGrind,
  }));
  return Object.freeze([...kern, ...zusatz]);
}

/**
 * Waehlt die Kandidaten aus, die ins Protokoll kommen.
 *
 * Alle Kandidaten zu speichern sprengt Datensatz und PDF (gemessen: 799
 * Zeilen fuer drei Aufnahmen). Es muss also ausgewaehlt werden — und
 * genau hier lag der Fehler bis rc.4.21: ausgewaehlt wurde die Spitze
 * der GERICHTETEN Rangfolge, also derjenigen, die eine nicht kalibrierte
 * Richtungsschaetzung mitbewertet.
 *
 * Gemessen an tests/fixtures/real/dry-stainless-control.png: von den
 * zehn bestplatzierten Kandidaten der UNGERICHTETEN Rangfolge lagen
 * sechs auf den gerichteten Plaetzen 36, 46, 52, 54, 55 und 59 — bei 59
 * Kandidaten insgesamt. Einer davon war der allerletzte. Sie wurden nicht
 * gespeichert, standen also weder im Datensatz noch im PDF, und eine
 * Umschaltung der Anzeige konnte sie auch nicht zurueckholen.
 *
 * Deshalb: die VEREINIGUNG der Spitzen beider Rangfolgen. Hoechstens
 * doppelt so viele Eintraege, und keine Rangfolge kann der anderen einen
 * Kandidaten wegnehmen. Das ist derselbe Grundsatz wie ueberall sonst
 * hier — nicht filtern, sondern sortieren; wo ausgewaehlt werden muss,
 * im Zweifel mehr statt weniger.
 *
 * rank bleibt der Platz in der gerichteten Rangfolge (das ist die
 * Reihenfolge, in der screenScratches liefert). Die zweite Rangfolge
 * traegt jeder Kandidat als eigenen Wert bei sich.
 *
 * @param {Array} candidates  Kandidaten, gerichtet sortiert
 * @param {number} spitze     Wie viele je Rangfolge
 * @returns {Array} Auswahl, gerichtet sortiert, je mit rank
 */
/* ── Gemeinsamer Kandidatenzugriff je Foto ────────────────────────────────
   BEFUND der Gegenpruefung an rc.4.44: Tabelle, Bildmarkierung und
   Speichergrenze lasen DREI verschiedene Fassungen desselben Bestands. Die
   Tabelle konnte nachladen, die Bildkomponente las nur die Vorauswahl, und
   die Speichergrenze pruefte ebenfalls nur gegen die Vorauswahl — eine
   vollstaendige Messung an einem nachgeladenen Kandidaten wurde deshalb
   als "existiert nicht" abgewiesen.

   Ab jetzt eine Quelle. Sie ist bewusst hier abgelegt und nicht in der
   Oberflaeche: zwei Fassungen derselben Regel laufen frueher oder spaeter
   auseinander, und genau das ist hier passiert.                          */

/** Alles, was dieses Foto an Kandidaten BELEGT — Vorauswahl und volle Liste. */
function bestandVon(fotoScreening) {
  const vorauswahl = Array.isArray(fotoScreening?.candidates)
    ? fotoScreening.candidates : [];
  const alle = Array.isArray(fotoScreening?.alleKandidaten)
    ? fotoScreening.alleKandidaten : [];
  /* Altdatensaetze tragen keine vollstaendige Liste. Dann gilt, was da
     ist — es wird nichts nachberechnet und nichts erfunden. */
  return alle.length ? alle : vorauswahl;
}

/**
 * Der Kandidat mit dieser Kennung auf DIESEM Foto, oder null.
 *
 * Bewusst ohne Rueckgriff auf andere Fotos: eine Kennung aus einem anderen
 * Foto ist keine Bindung, sondern eine Verwechslung.
 */
export function findeKandidat(fotoScreening, kandidatId) {
  if (!kandidatId || typeof kandidatId !== "string") return null;
  return bestandVon(fotoScreening).find(k => k?.kandidatId === kandidatId) || null;
}

/**
 * Was die Bildmarkierung zeichnen soll: die uebersichtliche Vorauswahl,
 * und zusaetzlich den GEWAEHLTEN Kandidaten, auch wenn er nachgeladen
 * wurde.
 *
 * Ausdruecklich NICHT alle Kandidaten gleichzeitig: 493 Kaesten ueber
 * einem Foto beantworten die Frage "wo liegt dieser eine" nicht mehr.
 */
export function kandidatenBestand(fotoScreening, ausgewaehlt = null) {
  const vorauswahl = Array.isArray(fotoScreening?.candidates)
    ? fotoScreening.candidates : [];
  if (!ausgewaehlt) return vorauswahl;
  if (vorauswahl.some(k => k?.kandidatId === ausgewaehlt)) return vorauswahl;
  const gewaehlt = findeKandidat(fotoScreening, ausgewaehlt);
  return gewaehlt ? [...vorauswahl, gewaehlt] : vorauswahl;
}

export function waehleProtokollKandidaten(candidates, spitze) {
  const liste = Array.isArray(candidates) ? candidates : [];
  const n = Number.isInteger(spitze) && spitze > 0 ? spitze : 0;
  if (!n) return [];
  const gerichtet = liste.slice(0, n).map((_, i) => i);
  const ungerichtet = liste
    .map((c, i) => ({ i, wert: Number.isFinite(c?.relevanceScoreUngerichtet)
      ? c.relevanceScoreUngerichtet : -Infinity }))
    .sort((a, b) => b.wert - a.wert)
    .slice(0, n)
    .map(e => e.i);
  /* Aufsteigend nach gerichtetem Platz, damit die Reihenfolge
     deterministisch ist und rank monoton bleibt. */
  const indizes = [...new Set([...gerichtet, ...ungerichtet])].sort((a, b) => a - b);
  return indizes.map(i => ({ ...liste[i], rank: i + 1 }));
}
