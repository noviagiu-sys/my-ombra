/* ─── VisuClean · Aufnahmepfade je Prüfkriterium ──────────────────────────
   Feuchtigkeit, Rückstände und Oberflächenschäden brauchen verschiedene
   Aufnahmen und dürfen verschieden ausgewertet werden.

   WARUM DAS NÖTIG IST — an echten Aufnahmen gemessen:

   Kratzer gewinnen stark durch Auflösung. Am Prüfbild in Telefongröße
   überlebte bei 640 px langer Kante nur EINER von zehn auffälligsten
   Kandidaten; bei voller Auflösung alle zehn.

   Feuchtigkeit gewinnt NICHT. An zwei nassen Realaufnahmen sank edgeFrac
   von 0,0423 bei 640 px auf 0,0254 bei voller Auflösung — mehr Pixel
   machen es schlechter, weil die Merkmale Flächenanteile sind und die
   glatten Bereiche mitwachsen.

   Ein gemeinsamer Wert für beide Kriterien ist deshalb immer für eines
   von beiden falsch.

   WICHTIGER BEFUND ZUR FEUCHTIGKEIT, gemessen:
   Verstreute Tropfen auf viel glatter Fläche — der Normalfall nach dem
   Abwischen — sind mit den vorhandenen Merkmalen nicht von einer trockenen
   Fläche zu trennen:

     Nasse Spüle 1      edgeFrac 0,0423   gradMean 0,0428
     Nasse Spüle 2      edgeFrac 0,0361   gradMean 0,0424
     Trockene Kontrolle edgeFrac 0,0296   gradMean 0,0355

   Der Abstand zwischen nass und trocken ist kleiner als die Streuung
   innerhalb der nassen Klasse. KEIN Schwellenwert trennt das. Die beiden
   nassen Testaufnahmen, die erkannt werden, sind Nahaufnahmen, bei denen
   die Tropfen fast das ganze Bild füllen.

   Daraus folgt die Regel in assessment.js: ohne eine standardisierte
   Feuchte-Aufnahmesequenz entsteht aus dem Feuchtealgorithmus KEIN
   automatisches Trocken-PASS.                                           */

/** Wofür eine Aufnahme gemacht wurde. */
export const AUFNAHMEZWECK = Object.freeze({
  FEUCHTE: "FEUCHTE",
  RUECKSTAND: "RUECKSTAND",
  OBERFLAECHE: "OBERFLAECHE",
});

/**
 * Lichtposition einer Aufnahme.
 *
 * Streiflicht ist das physikalisch tragfähige Mittel gegen den oben
 * beschriebenen Befund: unter flachem Licht glänzen Tropfen und werden zu
 * hellen Punkten, statt nur als schwache Kante zu erscheinen. Das
 * Pflichtenheft sieht es in Kapitel 4.2.4 vor.
 */
export const LICHTPOSITION = Object.freeze({
  NORMAL: "NORMAL",
  STREIFLICHT_LINKS: "STREIFLICHT_LINKS",
  STREIFLICHT_RECHTS: "STREIFLICHT_RECHTS",
  UNBEKANNT: "UNBEKANNT",
});

/**
 * Welche Lichtpositionen eine vollständige Feuchte-Sequenz braucht.
 *
 * Drei Aufnahmen derselben Stelle: einmal normal, einmal von links, einmal
 * von rechts. Die beiden Streiflichtaufnahmen sind nicht redundant — eine
 * einzelne Richtung lässt Tropfen im Schatten einer Wölbung unsichtbar.
 */
export const FEUCHTE_SEQUENZ_POSITIONEN = Object.freeze([
  LICHTPOSITION.NORMAL,
  LICHTPOSITION.STREIFLICHT_LINKS,
  LICHTPOSITION.STREIFLICHT_RECHTS,
]);

/**
 * Lange Bildkante für die Analyse, je Zweck.
 *
 * STELLWERTE — nicht validierte Schwellen. Sie steuern, wie genau
 * hingesehen wird, nicht wo die Grenze zwischen gut und schlecht liegt.
 * Die Zahlen folgen der oben genannten Messung, sind aber nicht an einer
 * Kampagne mit Realdaten belegt.
 */
export const ANALYSE_KANTE = Object.freeze({
  /* Gemessen: höhere Auflösung senkt edgeFrac und gradMean. Mehr hilft
     hier nicht. */
  [AUFNAHMEZWECK.FEUCHTE]: 640,
  /* Warme Blöcke sind flächig; die Blockanalyse arbeitet ohnehin auf
     Kacheln. Unverändert der bisherige Wert. */
  [AUFNAHMEZWECK.RUECKSTAND]: 640,
  /* Gemessen: 1 von 10 gegen 10 von 10 auffälligsten Kandidaten.
     0 bedeutet: gar nicht verkleinern, mit der gespeicherten Auflösung
     rechnen. */
  [AUFNAHMEZWECK.OBERFLAECHE]: 0,
  note: "Stellwerte — not validated thresholds",
});

/** Der Zweck einer Aufnahme, sicher gelesen. */
export function aufnahmezweck(wert) {
  return Object.values(AUFNAHMEZWECK).includes(wert) ? wert : null;
}

/** Die Lichtposition einer Aufnahme, sicher gelesen. */
export function lichtposition(wert) {
  return Object.values(LICHTPOSITION).includes(wert)
    ? wert : LICHTPOSITION.UNBEKANNT;
}

/**
 * Beurteilt, ob eine Feuchte-Aufnahmesequenz standardisiert ist.
 *
 * Standardisiert heisst: dieselbe Zone, unter allen drei Lichtpositionen
 * aufgenommen. Fehlt eine Position, ist die Sequenz unvollständig — und
 * dann darf aus dem Feuchtealgorithmus kein Trocken-PASS werden.
 *
 * Bewusst KEINE Zeit- oder Ähnlichkeitsprüfung: beides wäre eine
 * ungemessene Zahl. Geprüft wird nur, was ohne Kalibrierung feststeht —
 * ob die drei Positionen da sind und ob sie zur selben Zone gehören.
 *
 * @param {object} sequenz  { zoneId, captures: [{ lichtposition, photoId, zoneId }] }
 * @returns {{ vollstaendig: boolean, vorhanden: string[], fehlend: string[], grund: string|null }}
 */
export function feuchteSequenzStatus(sequenz) {
  const leer = {
    vollstaendig: false,
    vorhanden: Object.freeze([]),
    fehlend: FEUCHTE_SEQUENZ_POSITIONEN,
    grund: "KEINE_SEQUENZ",
  };
  if (!sequenz || !Array.isArray(sequenz.captures) || !sequenz.captures.length) return Object.freeze(leer);

  const zone = sequenz.zoneId ?? null;
  const passend = sequenz.captures.filter(c => {
    if (!c || !c.photoId) return false;
    /* Eine Aufnahme aus einer anderen Zone gehört nicht zu dieser
       Sequenz — sonst liesse sich eine Sequenz aus Bildern verschiedener
       Stellen zusammensetzen. */
    if (zone !== null && c.zoneId != null && c.zoneId !== zone) return false;
    return true;
  });

  const vorhanden = FEUCHTE_SEQUENZ_POSITIONEN.filter(pos =>
    passend.some(c => lichtposition(c.lichtposition) === pos));
  const fehlend = FEUCHTE_SEQUENZ_POSITIONEN.filter(pos => !vorhanden.includes(pos));

  return Object.freeze({
    vollstaendig: fehlend.length === 0,
    vorhanden: Object.freeze(vorhanden),
    fehlend: Object.freeze(fehlend),
    grund: fehlend.length === 0 ? null : "POSITIONEN_FEHLEN",
  });
}
