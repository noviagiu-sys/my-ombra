/* ─── VisuClean · Werkbank · gemeinsame Bildhilfen ────────────────────────
   Kleine Bausteine, die mehrere Messskripte brauchen. Bewusst eine eigene
   Datei: zwei Kopien derselben Verkleinerung würden früher oder später
   auseinanderlaufen, und dann wären zwei Messreihen nicht mehr
   vergleichbar.

   KEINE Analyse, KEINE Schwellen — nur Pixel bewegen.                   */

/**
 * Deterministische Verkleinerung durch Blockmittelung.
 *
 * Bewusst kein Bibliotheksfilter: jede Interpolation bringt eigene
 * Glättung mit, und genau die Glättung ist das, was hier gemessen wird.
 * Blockmittelung ist das, was eine Kamera beim Herunterskalieren im Kern
 * auch tut, und sie ist bit-genau reproduzierbar.
 */
export function verkleinere(daten, w, h, faktor) {
  if (faktor >= 1) return { daten, w, h };
  const w2 = Math.max(8, Math.round(w * faktor));
  const h2 = Math.max(8, Math.round(h * faktor));
  return aufGroesse(daten, w, h, w2, h2);
}

/** Wie verkleinere(), aber mit Zielmassen statt Faktor. */
export function aufGroesse(daten, w, h, w2, h2) {
  if (w2 >= w && h2 >= h) return { daten, w, h };
  const ziel = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const y0 = Math.floor(y * h / h2), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / h2));
    for (let x = 0; x < w2; x++) {
      const x0 = Math.floor(x * w / w2), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / w2));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * w + sx) * 4;
          r += daten[o]; g += daten[o + 1]; b += daten[o + 2]; n++;
        }
      }
      const o2 = (y * w2 + x) * 4;
      ziel[o2] = Math.round(r / n); ziel[o2 + 1] = Math.round(g / n);
      ziel[o2 + 2] = Math.round(b / n); ziel[o2 + 3] = 255;
    }
  }
  return { daten: ziel, w: w2, h: h2 };
}

/** Auf eine maximale lange Kante bringen — wie analyzeImage() in der App. */
export function aufLangeKante(daten, w, h, max) {
  const lang = Math.max(w, h);
  if (lang <= max) return { daten, w, h };
  const f = max / lang;
  return aufGroesse(daten, w, h, Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f)));
}

/** Mittelpunkt eines Kandidaten, bezogen auf die Bildgrösse (0…1). */
export function mitte(kandidat, w, h) {
  const b = kandidat.boundingBox || {};
  return { x: ((b.minX + b.maxX) / 2) / w, y: ((b.minY + b.maxY) / 2) / h };
}

/**
 * Wird ein Kandidat in einer anderen Auflösung wiedergefunden?
 *
 * Verglichen wird über die RELATIVE Lage im Bild: ein Kandidat gilt als
 * wiedergefunden, wenn bei der anderen Auflösung einer innerhalb von
 * 3 % der Bilddiagonale liegt. Grosszügig gewählt — es soll nicht an
 * Rundung scheitern, sondern zeigen, ob die Stelle überhaupt noch auffällt.
 */
export function wiedergefunden(k, wA, hA, liste, wB, hB, toleranz = 0.03) {
  const a = mitte(k, wA, hA);
  return liste.some(c => {
    const b = mitte(c, wB, hB);
    return Math.hypot(a.x - b.x, a.y - b.y) <= toleranz;
  });
}

/**
 * Reproduzierbarer Zufall (mulberry32).
 *
 * Math.random ist im Anwendungspfad verboten und hat auch in einer Messung
 * nichts zu suchen: zwei Läufe müssen dieselbe Zahl ergeben, sonst ist das
 * Ergebnis keine Messung, sondern eine Anekdote.
 */
export function saatZufall(saat) {
  let a = saat | 0;
  return () => {
    a = a + 0x9E3779B9 | 0;
    let t = Math.imul(a ^ a >>> 16, 0x85EBCA6B);
    t = Math.imul(t ^ t >>> 13, 0xC2B2AE35);
    return ((t ^ t >>> 16) >>> 0) / 4294967296;
  };
}
