/* ─── VisuClean · Prüffläche: der Bereich, der untersucht wird ─────────────
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis rc.4.39 bekam der Analyse-Kern IMMER das ganze Foto. Eine Begrenzung
 * auf die gewünschte Prüffläche gab es nicht; `roi.js` lag im Paket, war
 * aber an keiner Stelle eingebunden.
 *
 * Das ist nicht nur eine Frage zusätzlicher Markierungen im Hintergrund.
 * Die Grauwelt-Farbkorrektur in `computeFeatures` bildet ihre Faktoren aus
 * den Mittelwerten des GANZEN Bildes:
 *
 *     kR = 1 + s * (mGray / mR - 1)      mR, mG, mB = Bildmittel
 *     warm, wenn (r * kR) - (b * kB) > 0.08
 *
 * Ein blauer Hintergrund hebt mB, senkt damit kB, und die Farbkorrektur
 * zieht Blau im GANZEN Bild herunter — auch in der unveränderten Mitte.
 * Am Kern gemessen, gleiche graue Fläche in der Bildmitte, nur der
 * Hintergrund geändert:
 *
 *     Neutralgrau     clean = PASS               warm in der Mitte      0/19200
 *     Braun/orange    clean = ORGANIC_RESIDUE    warm in der Mitte      0/19200
 *     Blau            clean = ORGANIC_RESIDUE    warm in der Mitte  19200/19200
 *
 * Der Hintergrund entscheidet also mit darüber, wie die unveränderte
 * Oberfläche bewertet wird. Eine Erkennungsleistung lässt sich unter
 * dieser Bedingung nicht sinnvoll messen.
 *
 * WIE DIE BEGRENZUNG WIRKT
 *
 * Als echter rechteckiger ZUSCHNITT, angewandt bevor irgendetwas gerechnet
 * wird. Die Pixel ausserhalb der Prüffläche existieren für die Analyse
 * dann nicht — sie können weder die Farbkorrektur noch die Schmutzwerte
 * noch das Kratzer-Screening beeinflussen.
 *
 * Ausdrücklich NICHT gewählt: Aussenbereiche schwarz oder mit einer
 * Durchschnittsfarbe füllen. Beides ist kein Ausschluss, sondern ein
 * Ersetzen — die gefüllte Fläche geht in dieselben Bildmittel ein und
 * verschiebt die Farbkorrektur genauso, nur unauffälliger.
 *
 * `analysisCore.js` bleibt dabei byte-identisch. Der Zuschnitt liegt eine
 * Schicht darüber, und das ist der Grund, warum er überhaupt zulässig ist.
 *
 * WAS DAS ERGEBNIS DANN BEDEUTET
 *
 * Es gilt für den gewählten Bereich — nicht automatisch für das ganze
 * Teil. Dieser Satz gehört in Anzeige, Datensatz und Protokoll, sonst
 * wird aus "in diesem Ausschnitt nichts gefunden" stillschweigend "das
 * Teil ist sauber".
 *
 * Reflexionen INNERHALB der Prüffläche bleiben davon unberührt. Sie sind
 * eine eigene Aufgabe und werden hier nicht gelöst.
 */

/** Woher die Prüffläche stammt. Eine Vorgabe ist keine Auswahl. */
export const FLAECHE_QUELLE = Object.freeze({
  /* Vom Prüfer gesetzt oder ausdrücklich bestätigt. */
  GEWAEHLT: "GEWAEHLT",
  /* Voreinstellung, die niemand angefasst hat. */
  VORGABE: "VORGABE",
  /* Ausdrücklich das ganze Bild — eine Entscheidung, kein Standardfall. */
  GANZES_BILD: "GANZES_BILD",
});

/* Die Voreinstellung: ein zentrierter Ausschnitt, deutlich kleiner als das
   Bild. Stellwert, nicht validiert — er bestimmt keine Grenze zwischen gut
   und schlecht, sondern nur, wo der Rahmen beim Öffnen liegt. */
export const FLAECHE_VORGABE = Object.freeze({
  x: 0.12, y: 0.12, w: 0.76, h: 0.76,
});

/* Kleinste zulässige Kantenlänge, als Anteil der Bildkante. Darunter wird
   der Zuschnitt so klein, dass die Blockanalyse (BLK = 16) und der
   5x5-Medianfilter des Beleuchtungsfeldes kaum noch Stützstellen haben.
   Stellwert, nicht validiert. */
export const FLAECHE_MIN_KANTE = 0.20;

/* Und in Pixeln: unter dieser Kante ist der Zuschnitt fuer die
   Blockanalyse zu klein, unabhaengig davon, wie gross das Foto war. */
export const FLAECHE_MIN_PIXEL = 64;

const klemme = (wert, min, max) => Math.min(max, Math.max(min, wert));
const zahl = (wert, ersatz) => (Number.isFinite(wert) ? wert : ersatz);

/**
 * Eine Prüffläche auf gültige Werte bringen.
 *
 * Immer ein Rechteck in BILDANTEILEN (0..1), immer vollständig im Bild,
 * immer mindestens FLAECHE_MIN_KANTE gross. Rein und ohne Seiteneffekt.
 */
export function normalisiereFlaeche(flaeche) {
  const w = klemme(zahl(flaeche?.w, FLAECHE_VORGABE.w), FLAECHE_MIN_KANTE, 1);
  const h = klemme(zahl(flaeche?.h, FLAECHE_VORGABE.h), FLAECHE_MIN_KANTE, 1);
  const x = klemme(zahl(flaeche?.x, FLAECHE_VORGABE.x), 0, 1 - w);
  const y = klemme(zahl(flaeche?.y, FLAECHE_VORGABE.y), 0, 1 - h);
  return Object.freeze({ x, y, w, h });
}

/** Die Prüffläche als Pixelrechteck in einem Bild gegebener Grösse. */
export function pixelRechteck(flaeche, breite, hoehe) {
  const f = normalisiereFlaeche(flaeche);
  const bw = Math.max(1, Math.round(breite));
  const bh = Math.max(1, Math.round(hoehe));
  const w = Math.max(1, Math.round(f.w * bw));
  const h = Math.max(1, Math.round(f.h * bh));
  const x = klemme(Math.round(f.x * bw), 0, bw - w);
  const y = klemme(Math.round(f.y * bh), 0, bh - h);
  return Object.freeze({ x, y, w, h });
}

/**
 * Ist der Zuschnitt gross genug, um überhaupt gerechnet zu werden?
 *
 * "Zu klein" ist eine Aussage, kein Fehler: der Prüfer soll erfahren, dass
 * seine Auswahl unter die Grenze fällt, statt ein Ergebnis zu bekommen,
 * dessen Grundlage aus einer Handvoll Blöcke besteht.
 */
export function flaecheAusreichend(flaeche, breite, hoehe) {
  const r = pixelRechteck(flaeche, breite, hoehe);
  return r.w >= FLAECHE_MIN_PIXEL && r.h >= FLAECHE_MIN_PIXEL;
}

/**
 * Liegt ein Marker (in FOTO-Anteilen) innerhalb der Prüffläche?
 */
export function markerInFlaeche(marker, flaeche) {
  const f = normalisiereFlaeche(flaeche);
  const x = zahl(marker?.x, NaN), y = zahl(marker?.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
}

/**
 * Einen Marker aus FOTO-Anteilen in ZUSCHNITT-Anteile umrechnen.
 *
 * Das ist keine Kosmetik. Nach dem Zuschnitt beziehen sich Masken und
 * Overlay auf den Ausschnitt; ein Marker in Fotokoordinaten zeigte sonst
 * auf eine andere physische Stelle — bei 0,5/0,5 zum Beispiel auf die
 * Mitte des Ausschnitts statt auf die Mitte des Teils.
 *
 * Liegt der Marker ausserhalb, gibt es KEINE Umrechnung und kein Klemmen
 * an den Rand: ein an den Rand geschobener Marker wäre eine stille
 * Falschangabe. Rückgabe ist dann `null`, und der Aufrufer muss ihn als
 * ausserhalb ausweisen.
 */
export function markerAufFlaeche(marker, flaeche) {
  const f = normalisiereFlaeche(flaeche);
  if (!markerInFlaeche(marker, f)) return null;
  return Object.freeze({
    ...marker,
    x: (marker.x - f.x) / f.w,
    y: (marker.y - f.y) / f.h,
  });
}

/**
 * Die Marker eines Fotos auf die Prüffläche abbilden.
 *
 * Gibt beide Listen zurück: die abgebildeten und die ausserhalb
 * liegenden. Der Aufrufer muss sich zu beiden verhalten — ein Marker, der
 * lautlos verschwindet, ist der Fehler, den diese Trennung verhindert.
 */
export function markerAufteilen(markers = [], flaeche) {
  const drin = [], draussen = [];
  for (const marker of Array.isArray(markers) ? markers : []) {
    const abgebildet = markerAufFlaeche(marker, flaeche);
    if (abgebildet) drin.push(abgebildet); else draussen.push(marker);
  }
  return { drin, draussen };
}

/**
 * Der Eintrag, der in den Datensatz wandert.
 *
 * Enthält die Fläche in Bildanteilen, das tatsächlich verwendete
 * Pixelrechteck, die Grösse des Originalbildes und die Herkunft. Damit ist
 * später nachvollziehbar, WELCHER Ausschnitt bewertet wurde — ohne das
 * Originalbild neu rechnen zu müssen.
 */
export function flaecheEintrag(flaeche, quelle, sourceWidth, sourceHeight, analyseBreite, analyseHoehe) {
  const f = normalisiereFlaeche(flaeche);
  return Object.freeze({
    x: f.x, y: f.y, w: f.w, h: f.h,
    quelle: Object.values(FLAECHE_QUELLE).includes(quelle) ? quelle : FLAECHE_QUELLE.VORGABE,
    sourceWidth: Math.max(0, Math.round(zahl(sourceWidth, 0))),
    sourceHeight: Math.max(0, Math.round(zahl(sourceHeight, 0))),
    analysedWidth: Math.max(0, Math.round(zahl(analyseBreite, 0))),
    analysedHeight: Math.max(0, Math.round(zahl(analyseHoehe, 0))),
  });
}

/**
 * Der Geltungsbereich in einem Satz.
 *
 * Er steht in Anzeige, Datensatz und Protokoll — aus DERSELBEN Quelle,
 * damit die drei nicht auseinanderlaufen. Ohne diesen Satz wird aus "in
 * diesem Ausschnitt nichts gefunden" stillschweigend "das Teil ist sauber".
 */
export function geltungstext(eintrag, sprache = "de") {
  const de = sprache !== "en";
  if (!eintrag) {
    return de
      ? "Keine Prueffläche festgehalten: unklar, welcher Bildbereich bewertet wurde."
      : "No inspection area recorded: unclear which part of the image was assessed.";
  }
  const anteil = Math.round(eintrag.w * eintrag.h * 100);
  const herkunft = {
    [FLAECHE_QUELLE.GEWAEHLT]: de ? "vom Pruefer gewaehlt" : "chosen by the inspector",
    [FLAECHE_QUELLE.VORGABE]: de ? "Voreinstellung, nicht angepasst" : "default, not adjusted",
    [FLAECHE_QUELLE.GANZES_BILD]: de ? "ausdruecklich das ganze Bild" : "explicitly the whole image",
  }[eintrag.quelle] || (de ? "Herkunft unbekannt" : "origin unknown");
  return de
    ? `Bewertet wurde ausschliesslich die Prueffläche: ${eintrag.analysedWidth}x`
      + `${eintrag.analysedHeight} px, rund ${anteil} % der Bildflaeche (${herkunft}).`
      + " Das Ergebnis gilt fuer diesen Ausschnitt, nicht automatisch fuer das"
      + " ganze Teil. Pixel ausserhalb sind in keine Rechnung eingegangen -"
      + " auch nicht in die Farbkorrektur."
    : `Only the inspection area was assessed: ${eintrag.analysedWidth}x`
      + `${eintrag.analysedHeight} px, about ${anteil} % of the image (${herkunft}).`
      + " The result applies to this crop, not automatically to the whole part."
      + " Pixels outside it entered no computation - not even the colour"
      + " correction.";
}

/* ─── Bildschirmkoordinaten ────────────────────────────────────────────────
 *
 * DRITTES Koordinatensystem, und das war die Fehlerquelle.
 *
 *   1. FOTO-Anteile      normiert auf das Originalfoto
 *   2. ZUSCHNITT-Anteile normiert auf die Prüffläche
 *   3. FENSTER-Anteile   normiert auf das Editorfenster
 *
 * Das Editorfenster hat ein festes Seitenverhältnis, das Foto nicht. Mit
 * `object-fit: contain` liegt das Bild deshalb mit Rändern darin — und
 * alles, was in Prozent des FENSTERS positioniert wird, sitzt falsch.
 *
 * Am Bildschirm gemessen (Gegenprüfung an rc.4.40): ein Auswahlrahmen über
 * rund 201 px, während die eingestellten 25 % von 340 px sichtbarer
 * Fotobreite 85 px wären. Im Browser nachgemessen (werkbank/
 * rahmenmessung.mjs), 900x1600 bei 390 px Fensterbreite: Rahmen 275,1 px
 * statt 116,1 px. Marker und Klickauswertung hingen an derselben Stelle.
 *
 * Die Umrechnung steht deshalb hier als reine Funktion — prüfbar ohne
 * Layout-Engine, und im echten Browser gegengemessen.
 */

/* Das Seitenverhältnis des Editorfensters. Es steht als `aspect-ratio` in
   styles.css; hier ist die Zahl, mit der gerechnet wird. Laufen die beiden
   auseinander, sitzt alles wieder daneben — pruefflaechetest R5a vergleicht
   sie deshalb miteinander. */
export const EDITOR_SEITENVERHAELTNIS = 4 / 3;

/**
 * Wo liegt das BEMALTE Bild im Fenster?
 *
 * Rückgabe in FENSTER-Anteilen (0..1). Das ist genau die Definition von
 * `object-fit: contain`: das Bild wird so gross wie möglich eingepasst und
 * zentriert; der Rest bleibt Rand.
 *
 * Eine DOM-Abfrage für die bemalte Fläche gibt es nicht — auch die
 * Browser-Messung rechnet sie so aus. `getBoundingClientRect()` liefert die
 * BOX des Bildelements, und die füllt das Fenster vollständig; wer damit
 * vergleicht, misst den Fehler nicht, sondern an ihm vorbei.
 */
export function bemalteFlaeche(fotoBreite, fotoHoehe,
  fensterVerhaeltnis = EDITOR_SEITENVERHAELTNIS) {
  const fb = Number(fotoBreite), fh = Number(fotoHoehe);
  /* Ohne bekannte Bildgroesse wird NICHT geraten: dann gilt das ganze
     Fenster, und das ist genau der alte Zustand — sichtbar, nicht still. */
  if (!Number.isFinite(fb) || !Number.isFinite(fh) || fb <= 0 || fh <= 0) {
    return Object.freeze({ x: 0, y: 0, w: 1, h: 1, bekannt: false });
  }
  const fotoVerhaeltnis = fb / fh;
  if (fotoVerhaeltnis > fensterVerhaeltnis) {
    /* Breiter als das Fenster: volle Breite, Raender oben und unten. */
    const h = fensterVerhaeltnis / fotoVerhaeltnis;
    return Object.freeze({ x: 0, y: (1 - h) / 2, w: 1, h, bekannt: true });
  }
  /* Hoeher als das Fenster: volle Hoehe, Raender links und rechts. */
  const w = fotoVerhaeltnis / fensterVerhaeltnis;
  return Object.freeze({ x: (1 - w) / 2, y: 0, w, h: 1, bekannt: true });
}

/** FOTO-Anteile → FENSTER-Anteile. Für Rahmen und Marker. */
export function aufFenster(punkt, bemalt) {
  return Object.freeze({
    x: bemalt.x + Number(punkt?.x ?? 0) * bemalt.w,
    y: bemalt.y + Number(punkt?.y ?? 0) * bemalt.h,
  });
}

/** Ein Rechteck in FOTO-Anteilen → FENSTER-Anteile. Für den Auswahlrahmen. */
export function rechteckAufFenster(flaeche, bemalt) {
  const f = normalisiereFlaeche(flaeche);
  return Object.freeze({
    x: bemalt.x + f.x * bemalt.w,
    y: bemalt.y + f.y * bemalt.h,
    w: f.w * bemalt.w,
    h: f.h * bemalt.h,
  });
}

/**
 * FENSTER-Anteile → FOTO-Anteile. Für die Klickauswertung beim Setzen
 * eines Markers.
 *
 * Ein Klick in den Randbereich liegt NICHT auf dem Foto. Er wird deshalb
 * nicht an den Rand geklemmt, sondern mit `null` beantwortet — ein Marker
 * auf dem schwarzen Rand wäre eine Angabe über eine Stelle, die es auf dem
 * Bild nicht gibt.
 */
export function ausFenster(punkt, bemalt) {
  const x = (Number(punkt?.x ?? NaN) - bemalt.x) / bemalt.w;
  const y = (Number(punkt?.y ?? NaN) - bemalt.y) / bemalt.h;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return Object.freeze({ x, y });
}

/**
 * Auf WELCHEM Bild dürfen Kandidatenkästen gezeichnet werden?
 *
 * Befund der Gegenprüfung an rc.4.40: das Screening rechnet seit rc.4.40
 * auf dem Zuschnitt, gezeichnet wurde aber weiter auf dem vollständigen
 * Originalfoto. Ein Kandidat zeigte damit auf 150/200 statt 360/300 — in
 * der Ergebnisansicht und im wiedergeöffneten Bericht. Eine daran
 * gebundene Tiefenmessung wäre an der falschen Stelle vorgenommen worden.
 *
 * Die Entscheidung steht hier als reine Funktion, nicht in der Ansicht:
 * `ScreeningMarkierung` zeichnet auf ein Canvas, und was dort landet, ist
 * ohne Layout-Engine nicht prüfbar. Die Bildwahl ist prüfbar.
 *
 * Drei Fälle, und der dritte ist der wichtige:
 *   - kein Zuschnitt (Datensätze vor rc.4.40) → das Originalfoto ist richtig
 *   - Zuschnitt und Zuschnittbild vorhanden   → der Zuschnitt
 *   - Zuschnitt, aber kein Zuschnittbild      → GAR NICHTS zeichnen
 *
 * Ein Kasten auf einem Bild, zu dem er nicht gehört, ist schlimmer als
 * kein Kasten: er sieht aus wie eine Ortsangabe.
 */
export function kandidatenBild(foto) {
  if (!foto) return Object.freeze({ quelle: null, grund: "KEIN_FOTO" });
  const zugeschnitten = Boolean(
    foto.result?.inspectionArea || foto.rawResult?.pruefflaeche);
  if (!zugeschnitten) {
    return Object.freeze({
      quelle: foto.image || null,
      grund: foto.image ? null : "KEIN_BILD",
    });
  }
  const quelle = foto.rawResult?.zuschnittBild || foto.annotatedImage || null;
  return Object.freeze({
    quelle,
    grund: quelle ? null : "KEIN_ZUSCHNITTBILD",
  });
}
