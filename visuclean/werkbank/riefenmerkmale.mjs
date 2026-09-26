/* ─── VisuClean · Werkbank — Querprofil und Lichtwechsel ───────────────────
   Aufruf:  node werkbank/riefenmerkmale.mjs --selbsttest

   WARUM DIESE MERKMALE NEBEN DEM KONTRAST STEHEN

   Der bisherige Messwert (`kontrastmessung.mjs`) ist der MITTELWERT des
   Sobel-Betrags ueber eine Bounding Box. Er mittelt Riefe und Hintergrund
   zusammen; eine schmale Riefe in einem grossen Kasten geht darin unter.

   Naeher an der Geometrie liegen zwei andere Groessen:

     QUERPROFIL      der Schnitt SENKRECHT zur Riefe — Einbruchtiefe in
                     Grauwertstufen, Breite auf halber Tiefe, Asymmetrie
                     der Flanken.
     LICHTWECHSEL    die Aenderung dieses Profils ueber die drei
                     Lichtpositionen aus P3. Eine tiefe Riefe wirft einen
                     Schatten, der mit der Lichtrichtung die Seite
                     wechselt; eine Verfaerbung oder eine Schliffspur tut
                     das nicht.

   WAS HIER NICHT PASSIERT

     * Keine Umrechnung in Mikrometer. Saemtliche Werte sind
       Grauwertstufen und Pixel. Aus einem Bildmerkmal folgt keine Tiefe.
     * Kein Urteil. Diese Datei rechnet, sie bewertet nicht.
     * Kein Ersatz. Das bisherige Kontrastmerkmal bleibt bestehen und wird
       in der Auswertung daneben gefuehrt — ob eines der neuen Merkmale
       besser traegt, entscheiden reale Referenzmessungen, nicht diese
       Datei.

   FEHLEND IST NICHT NULL. Laesst sich ein Wert nicht bestimmen, ist er
   `null` — niemals 0. Eine gemessene Null ist eine Behauptung.

   Rein und deterministisch: kein Zufall, keine Zeitquelle.              */

import { readFileSync } from "node:fs";

/** Bilineare Abtastung. Ausserhalb des Bildes: null, nicht 0. */
function abtasten(grau, w, h, x, y) {
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return null;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const p = (xx, yy) => grau[yy * w + xx];
  return p(x0, y0) * (1 - fx) * (1 - fy) + p(x1, y0) * fx * (1 - fy)
    + p(x0, y1) * (1 - fx) * fy + p(x1, y1) * fx * fy;
}

const mittel = werte => (werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null);

function median(werte) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Querprofil senkrecht zur Riefe.
 *
 * Gemittelt wird ENTLANG der Riefe (Laenge `laenge`), abgetastet quer dazu
 * (Offsets -halbbreite … +halbbreite). Das Mitteln entlang der Riefe
 * unterdrueckt das Bildrauschen, ohne das Profil quer zu verwischen — quer
 * zu mitteln waere genau der Fehler, den der alte Boxmittelwert macht.
 *
 * `winkelGrad` ist die Richtung der RIEFE, nicht die des Schnitts.
 */
export function querprofil(grau, w, h, { x, y, winkelGrad = 0, halbbreite = 12, laenge = 21 } = {}) {
  const a = (winkelGrad * Math.PI) / 180;
  const lx = Math.cos(a), ly = Math.sin(a);      // entlang der Riefe
  /* Quer dazu, mit festgelegter Orientierung: bei einer SENKRECHTEN Riefe
     (winkelGrad 90) laeuft ein wachsender Offset nach RECHTS im Bild. Die
     Reihenfolge im Profil entspricht damit der Leserichtung, und das
     Vorzeichen der Asymmetrie ist ohne Nachrechnen lesbar: negativ heisst
     "links dunkler".

     Die erste Fassung nahm (-sin, cos) und lief bei 90 Grad nach LINKS —
     gerechnet war das richtig, aber jede spaetere Deutung des Vorzeichens
     waere seitenverkehrt gewesen. Gefunden durch Q5, das genau daran
     scheiterte. */
  const qx = Math.sin(a), qy = -Math.cos(a);     // quer dazu, +Offset nach rechts
  const halbeLaenge = (laenge - 1) / 2;
  const profil = [];
  for (let d = -halbbreite; d <= halbbreite; d++) {
    const proben = [];
    for (let t = -halbeLaenge; t <= halbeLaenge; t++) {
      const px = x + t * lx + d * qx;
      const py = y + t * ly + d * qy;
      const v = abtasten(grau, w, h, px, py);
      if (v !== null) proben.push(v);
    }
    profil.push(proben.length ? mittel(proben) : null);
  }
  return Object.freeze({ offsets: profil, halbbreite, laenge, winkelGrad });
}

/**
 * Kennzahlen aus einem Querprofil. Alles in Grauwertstufen und Pixeln.
 *
 * `schulterAnteil` bestimmt, welcher Randteil des Profils als ungestoerte
 * Oberflaeche gilt. Stellwert — nicht validiert; er veraendert die Zahlen
 * und ist deshalb benannt statt verborgen.
 */
export const SCHULTER_ANTEIL = 0.25; // Stellwert — not validated

export function profilkennzahlen(profil, { schulterAnteil = SCHULTER_ANTEIL } = {}) {
  const leer = Object.freeze({
    schulterNiveau: null, tiefeIndex: null, breitePx: null,
    asymmetrie: null, minimum: null, grund: null,
  });
  const werte = profil?.offsets || [];
  const vorhanden = werte.filter(v => v !== null);
  if (vorhanden.length < 5) {
    return Object.freeze({ ...leer, grund: "zu wenige Stuetzstellen" });
  }
  const n = werte.length;
  const rand = Math.max(1, Math.round(n * schulterAnteil));
  const links = werte.slice(0, rand).filter(v => v !== null);
  const rechts = werte.slice(n - rand).filter(v => v !== null);
  if (!links.length || !rechts.length) {
    return Object.freeze({ ...leer, grund: "keine Schulter auf beiden Seiten" });
  }
  /* Median statt Mittelwert: eine zweite Riefe am Rand des Fensters
     verschoebe sonst die Bezugslinie. */
  const schulterNiveau = median([...links, ...rechts]);
  const minimum = Math.min(...vorhanden);
  const tiefeIndex = schulterNiveau - minimum;

  /* Breite auf halber Einbruchtiefe. Nur sinnvoll, wenn es einen Einbruch
     gibt — bei tiefeIndex 0 ist die Breite nicht definiert, nicht 0. */
  let breitePx = null;
  if (tiefeIndex > 0) {
    const halb = schulterNiveau - tiefeIndex / 2;
    /* Bei tiefeIndex > 0 liegt das Minimum per Definition unter der
       halben Tiefe — es gibt also immer mindestens eine Stuetzstelle.
       Ein Zweig fuer "keine gefunden" waere unerreichbar und damit von
       keiner Sabotageprobe pruefbar; er steht deshalb nicht da. */
    let erste = -1, letzte = -1;
    for (let i = 0; i < n; i++) {
      if (werte[i] !== null && werte[i] <= halb) {
        if (erste < 0) erste = i;
        letzte = i;
      }
    }
    breitePx = letzte - erste + 1;
  }

  const asymmetrie = mittel(links) !== null && mittel(rechts) !== null
    ? mittel(links) - mittel(rechts) : null;

  return Object.freeze({
    schulterNiveau, tiefeIndex, breitePx, asymmetrie, minimum,
    grund: tiefeIndex > 0 ? null : "kein Einbruch im Fenster",
  });
}

/**
 * Aenderung ueber die Lichtpositionen.
 *
 * Eingabe: die Kennzahlen DERSELBEN Stelle unter verschiedenen
 * Lichtpositionen, als { NORMAL, STREIFLICHT_LINKS, STREIFLICHT_RECHTS }.
 *
 * `flankenwechsel` ist die eigentlich interessante Zahl: der Unterschied
 * der Asymmetrie zwischen linkem und rechtem Streiflicht. Bei einer
 * Vertiefung wandert die beschattete Flanke mit der Lichtrichtung, das
 * Vorzeichen kehrt sich um und der Betrag wird gross. Eine Verfaerbung
 * bleibt unter jeder Beleuchtung dieselbe.
 *
 * AUSDRUECKLICH UNKALIBRIERT. Ob dieser Unterschied mit der Tiefe
 * zusammenhaengt, ist offen — das beantworten reale Referenzmessungen.
 */
export function lichtwechsel(kennzahlenJeLicht = {}) {
  const positionen = ["NORMAL", "STREIFLICHT_LINKS", "STREIFLICHT_RECHTS"];
  const fehlend = positionen.filter(p => !kennzahlenJeLicht[p]);
  const basis = Object.freeze({
    tiefenIndexSpanne: null, flankenwechsel: null,
    vorzeichenKehrtUm: null, fehlend: Object.freeze(fehlend),
  });
  if (fehlend.length) return basis;

  const tiefen = positionen
    .map(p => kennzahlenJeLicht[p].tiefeIndex)
    .filter(v => typeof v === "number" && Number.isFinite(v));
  const links = kennzahlenJeLicht.STREIFLICHT_LINKS.asymmetrie;
  const rechts = kennzahlenJeLicht.STREIFLICHT_RECHTS.asymmetrie;
  const beide = typeof links === "number" && Number.isFinite(links)
    && typeof rechts === "number" && Number.isFinite(rechts);

  return Object.freeze({
    tiefenIndexSpanne: tiefen.length === positionen.length
      ? Math.max(...tiefen) - Math.min(...tiefen) : null,
    flankenwechsel: beide ? links - rechts : null,
    /* Ein Vorzeichenwechsel der Asymmetrie zwischen den beiden
       Streiflichtern ist das Kennzeichen einer Vertiefung. `false` heisst
       "kein Wechsel beobachtet" — NICHT "keine Vertiefung". */
    vorzeichenKehrtUm: beide ? (links > 0) !== (rechts > 0) : null,
    fehlend: Object.freeze([]),
  });
}

/* ── Selbsttest gegen analytisch bekannte Geometrie ───────────────────── */

function graubild(w, h, f) {
  const grau = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grau[y * w + x] = f(x, y);
  return { grau, w, h };
}

function selbsttest() {
  const pruefungen = [];
  const ok = (id, name, bestanden, info = "") => {
    pruefungen.push({ id, bestanden });
    console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
    if (info) console.log(`                    ${info}`);
  };

  console.log("VisuClean · Werkbank — Querprofil und Lichtwechsel, Selbsttest\n");

  /* Eine senkrechte Riefe: Spalten 29..31 liegen 40 Stufen tiefer.
     Breite exakt 3 px, Einbruch exakt 40 Stufen. */
  const riefe = (tiefe = 40, breite = 3, mitte = 30) => graubild(60, 40,
    x => (Math.abs(x - mitte) <= (breite - 1) / 2 ? 200 - tiefe : 200));

  /* Q1 · Der Einbruch wird exakt getroffen. */
  {
    const b = riefe(40, 3);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    ok("Q1", "Einbruchtiefe entspricht exakt der gebauten Stufe",
      k.tiefeIndex === 40, `tiefeIndex ${k.tiefeIndex} (erwartet 40)`);
  }

  /* Q2 · Die Breite auf halber Tiefe entspricht der gebauten Breite. */
  {
    const b = riefe(40, 3);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    ok("Q2", "Breite auf halber Tiefe entspricht der gebauten Breite",
      k.breitePx === 3, `breitePx ${k.breitePx} (erwartet 3)`);
  }

  /* Q3 · Eine gleichmaessige Flaeche hat KEINE Breite — nicht Breite 0. */
  {
    const b = graubild(60, 40, () => 200);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    ok("Q3", "Ohne Einbruch ist die Breite nicht bestimmbar, nicht 0",
      k.tiefeIndex === 0 && k.breitePx === null && k.grund !== null,
      `tiefeIndex ${k.tiefeIndex} · breitePx ${k.breitePx} · Grund "${k.grund}"`);
  }

  /* Q4 · Eine symmetrische Riefe hat Asymmetrie exakt 0. */
  {
    const b = riefe(40, 3);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    ok("Q4", "Symmetrische Riefe ergibt Asymmetrie 0",
      k.asymmetrie === 0, `asymmetrie ${k.asymmetrie}`);
  }

  /* Q5 · Einseitiger Schatten: die beschattete Seite senkt EINE Schulter.
     Links abgedunkelt -> linke Schulter niedriger -> Asymmetrie negativ.

     Der Schattenstreifen muss bis ins SCHULTERFENSTER reichen (aeussere
     25 % je Seite, bei halbbreite 12 also die Offsets -12..-7 und 7..12).
     Die erste Fassung dieser Vorlage legte ihn auf die Offsets -6..-1 —
     dort misst die Kennzahl gar nicht, und Q5 meldete Asymmetrie 0. Das
     war ein Fehler der Vorlage, nicht der Rechnung. */
  const schatten = seite => graubild(60, 40, x => {
    if (Math.abs(x - 30) <= 1) return 160;
    const imSchatten = seite === "links" ? (x < 29 && x >= 18) : (x > 31 && x <= 42);
    return imSchatten ? 180 : 200;
  });
  {
    const kl = profilkennzahlen(querprofil(schatten("links").grau, 60, 40,
      { x: 30, y: 20, winkelGrad: 90 }));
    const kr = profilkennzahlen(querprofil(schatten("rechts").grau, 60, 40,
      { x: 30, y: 20, winkelGrad: 90 }));
    ok("Q5", "Einseitiger Schatten kippt das Vorzeichen der Asymmetrie",
      kl.asymmetrie < 0 && kr.asymmetrie > 0
      && Math.abs(kl.asymmetrie + kr.asymmetrie) < 1e-9,
      `links ${kl.asymmetrie} · rechts ${kr.asymmetrie} (spiegelbildlich)`);
  }

  /* Q6 · Der Lichtwechsel erkennt den Vorzeichenwechsel. */
  {
    const k = pos => profilkennzahlen(querprofil(
      (pos === "NORMAL" ? riefe(40, 3) : schatten(pos === "STREIFLICHT_LINKS" ? "links" : "rechts")).grau,
      60, 40, { x: 30, y: 20, winkelGrad: 90 }));
    const w = lichtwechsel({
      NORMAL: k("NORMAL"),
      STREIFLICHT_LINKS: k("STREIFLICHT_LINKS"),
      STREIFLICHT_RECHTS: k("STREIFLICHT_RECHTS"),
    });
    ok("Q6", "Lichtwechsel meldet Flankenwechsel und Vorzeichenumkehr",
      w.vorzeichenKehrtUm === true && w.flankenwechsel < 0
      && w.fehlend.length === 0,
      `flankenwechsel ${w.flankenwechsel} · Umkehr ${w.vorzeichenKehrtUm}`);
  }

  /* Q7 · Dieselbe Aufnahme unter allen drei Positionen: Wechsel exakt 0.
     Das ist der Fall einer Verfaerbung — sie aendert sich mit dem Licht
     nicht. */
  {
    const b = riefe(40, 3);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    const w = lichtwechsel({
      NORMAL: k, STREIFLICHT_LINKS: k, STREIFLICHT_RECHTS: k,
    });
    ok("Q7", "Unveraenderte Aufnahmen ergeben Wechsel exakt 0",
      w.flankenwechsel === 0 && w.tiefenIndexSpanne === 0
      && w.vorzeichenKehrtUm === false,
      `flankenwechsel ${w.flankenwechsel} · Spanne ${w.tiefenIndexSpanne}`);
  }

  /* Q8 · Eine fehlende Lichtposition ergibt null, nicht 0. */
  {
    const b = riefe(40, 3);
    const k = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 90 }));
    const w = lichtwechsel({ NORMAL: k, STREIFLICHT_LINKS: k });
    ok("Q8", "Fehlende Lichtposition ergibt null und wird benannt",
      w.flankenwechsel === null && w.tiefenIndexSpanne === null
      && w.fehlend.includes("STREIFLICHT_RECHTS"),
      `fehlend: ${w.fehlend.join(", ")}`);
  }

  /* Q9 · Die Riefenrichtung wird beachtet: dieselbe Riefe, um 90 Grad
     gedreht abgetastet, ergibt KEINEN Einbruch — dann schneidet das
     Profil laengs statt quer. */
  {
    const b = riefe(40, 3);
    const laengs = profilkennzahlen(querprofil(b.grau, b.w, b.h,
      { x: 30, y: 20, winkelGrad: 0 }));
    ok("Q9", "Falsche Riefenrichtung zeigt keinen Einbruch",
      laengs.tiefeIndex === 0,
      `laengs tiefeIndex ${laengs.tiefeIndex} · quer 40`);
  }

  /* Q10 · Nirgends eine Mikrometerangabe. Textprobe auf die eigene Datei:
     ein Merkmal in Grauwertstufen darf nie als Tiefe auftreten. */
  {
    let quelle = null;
    try { quelle = readFileSync(new URL("./riefenmerkmale.mjs", import.meta.url), "utf8"); }
    catch { quelle = null; }
    const verdacht = /(tiefeIndex|flankenwechsel|asymmetrie)[^\n]{0,40}\d\s*(µm|um\b)/i;
    ok("Q10", "Kein Merkmal traegt eine Mikrometerangabe",
      quelle !== null && !verdacht.test(quelle),
      quelle === null ? "Datei nicht lesbar" : "Textprobe ohne Treffer");
  }

  console.log("");
  const durch = pruefungen.filter(p => !p.bestanden);
  console.log(`Bestanden: ${pruefungen.length - durch.length} / ${pruefungen.length}`);
  if (durch.length) console.log(`Durchgefallen: ${durch.map(p => p.id).join(", ")}`);
  console.log(`ERGEBNIS: ${durch.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
  console.log("");
  console.log("GRENZE: geprueft ist die RECHNUNG an analytisch bekannter");
  console.log("Geometrie. Ob Querprofil oder Lichtwechsel die Riefentiefe");
  console.log("anzeigen, ist damit NICHT geprueft — das koennen nur reale");
  console.log("Aufnahmen mit unabhaengig gemessener Tiefe zeigen.");
  return durch.length ? 1 : 0;
}

if (process.argv.includes("--selbsttest")) process.exit(selbsttest());
