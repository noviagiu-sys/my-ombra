/* ─── VisuClean · Kratzer-Klassifikator (Random Forest, Inferenz) ─────────
   Dritte Stufe neben Kern und Screening.

   DIE ROLLE — bitte vor dem Lesen des Codes verstehen
   Der Klassifikator SORTIERT. Er urteilt nicht.

       analysisCore   entscheidet   (unveraendert, deterministische Regeln)
       scratchScreening zeigt hin   (Kandidaten, nach Relevanz sortiert)
       scratchClassifier sortiert um (dieselben Kandidaten, andere Reihenfolge)

   Er darf keinen Kandidaten entfernen, keinen hinzufuegen, kein Urteil
   aendern und kein PASS erzeugen. Damit gilt dieselbe Bauform-Sicherheit
   wie beim Screening: ein ungenauer Wald macht die Liste schlechter
   sortiert, niemals ein Ergebnis falsch. SC-09 bis SC-12 sichern das ab.

   OHNE MODELL IST ER UNTAETIG
   Solange kein trainiertes Modell vorliegt — und das ist der Stand, weil
   es keine gelabelten Bilder und keine Tastschnittmessungen gibt — gibt
   loadModel(null) einen inerten Klassifikator zurueck. Die Reihenfolge des
   Screenings bleibt dann Bit fuer Bit erhalten. Vorbild ist
   src/aiContract.js: vorhanden, deaktiviert, Zweitmeinung.

   KEIN sklearn ZUR LAUFZEIT
   Trainiert wird auf der Werkbank (Python, siehe werkbank/train_rf.py).
   Ausgeliefert wird der Wald als reines JSON — Knotenarrays. Die Inferenz
   hier sind wenige Dutzend Zeilen. Eine Offline-PWA im Reinraum bekommt
   keine WASM-Bibliothek von mehreren Megabyte.

   MERKMALSVERTRAG
   Training und Inferenz muessen DIESELBEN Merkmale in DERSELBER Reihenfolge
   verwenden. Ein Modell, dessen featureOrder abweicht, wird abgelehnt statt
   stillschweigend falsch ausgewertet — das waere der gefaehrlichste
   denkbare Fehler dieser Datei.

   Rein, deterministisch, ohne DOM, ohne Zufall, ohne Zeitquelle.        */

/**
 * Der Merkmalsvertrag. Reihenfolge ist Teil des Vertrags, nicht Kosmetik.
 *
 * Bewusst NICHT enthalten: absolute Pixelmasse und Bildkoordinaten. Sie
 * haengen an Aufloesung und Bildausschnitt; ein darauf trainierter Wald
 * lernt die Kamera, nicht den Kratzer.
 */
export const FEATURE_ORDER = Object.freeze([
  "lengthRel",      // Laenge bezogen auf die kurze Bildkante
  "widthRel",       // Breite bezogen auf die kurze Bildkante
  "elongation",     // Laenge / Breite
  "edgeStrength",   // mittlere Kantenstaerke (Kontrastmass, KEINE Tiefe)
  "grindDeltaDeg",  // Winkelabstand zur geschaetzten Schliffrichtung
  "relevanceScore", // die Regelbewertung des Screenings
]);

/** Zwei Klassen, wie in der Spezifikation. Keine dritte, kein "unbekannt". */
/* Aufmerksamkeitsstufen, KEINE Tiefenaussage.
   Bis rc.4.19 hiessen sie MIKRO_HARMLOS und TIEF_RELEVANT. Beide Begriffe
   behaupten eine Tiefe beziehungsweise eine Harmlosigkeit, die aus einem
   normalen Foto nicht messbar ist - genau das, was X-03 an anderer Stelle
   verbietet und hier nicht griff. Befund der unabhaengigen Gegenpruefung
   an rc.4.19, zutreffend. Die Werte beschreiben ausschliesslich, wie
   dringend jemand hinsehen sollte. */
export const CLASS_LABELS = Object.freeze(["ATTENTION_LOW", "ATTENTION_HIGH"]);

/**
 * Merkmalsvektor eines Screening-Kandidaten.
 * Dieselbe Funktion speist Training (ueber den Export) und Inferenz —
 * damit koennen die beiden Seiten nicht auseinanderlaufen.
 */
export function featureVector(candidate) {
  return FEATURE_ORDER.map(name => {
    const v = candidate?.[name];
    return Number.isFinite(v) ? v : 0;
  });
}

/**
 * Merkmalstabelle fuer das Labeln. Das ist die Bringschuld, bevor ueberhaupt
 * trainiert werden kann: ohne exportierte Merkmale gibt es nichts zu labeln.
 *
 * @returns {{featureOrder: string[], rows: Array<object>}}
 */
export function exportFeatureTable(screening, meta = {}) {
  const rows = (screening?.candidates || []).map((c, index) => {
    const row = {
      rank: index + 1,
      boundingBox: c.boundingBox,
      alignedWithGrind: c.alignedWithGrind === true,
    };
    FEATURE_ORDER.forEach((name, i) => { row[name] = featureVector(c)[i]; });
    return Object.freeze({ ...row, ...meta });
  });
  return Object.freeze({
    featureOrder: FEATURE_ORDER,
    grindDirectionDeg: screening?.grindDirectionDeg ?? null,
    rows: Object.freeze(rows),
  });
}

/* ── Inferenz ─────────────────────────────────────────────────────────── */

/**
 * Ein Baum ist ein flaches Knotenarray, wie sklearn ihn intern haelt:
 *   feature[i]   Merkmalsindex, -1 bei einem Blatt
 *   threshold[i] Schwelle
 *   left[i], right[i]  Kindindizes
 *   value[i]     [n_klasse0, n_klasse1] im Blatt
 */
function treeProbability(tree, x) {
  let node = 0;
  /* Harte Schrittgrenze: ein manipuliertes oder fehlerhaftes Modell darf
     die Oberflaeche nicht in eine Endlosschleife ziehen. */
  for (let schritt = 0; schritt < 1000; schritt++) {
    const f = tree.feature[node];
    if (f < 0) break;
    node = x[f] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    if (!Number.isInteger(node) || node < 0 || node >= tree.feature.length) return null;
  }
  const paar = tree.value[node];
  if (!Array.isArray(paar) || paar.length !== 2) return null;
  const summe = paar[0] + paar[1];
  return summe > 0 ? paar[1] / summe : 0;
}

/**
 * Laedt ein Modell. Ohne Modell (null/undefined) entsteht ein INERTER
 * Klassifikator: classify() gibt die Kandidaten unveraendert zurueck.
 *
 * Ein Modell mit abweichender featureOrder wird ABGELEHNT — nicht
 * stillschweigend verwendet. Der Grund steht im Kopf dieser Datei.
 *
 * @returns {{active: boolean, reason: string|null, classify: Function,
 *            featureImportance: object|null}}
 */
export function loadModel(model) {
  const inert = (reason) => Object.freeze({
    active: false,
    reason,
    featureImportance: null,
    classify: (screening) => Object.freeze({
      candidates: screening?.candidates || Object.freeze([]),
      classified: false,
      reason,
    }),
  });

  if (!model) return inert("NO_MODEL");
  if (!Array.isArray(model.trees) || model.trees.length === 0) return inert("EMPTY_MODEL");

  const ordnung = model.featureOrder;
  const passt = Array.isArray(ordnung)
    && ordnung.length === FEATURE_ORDER.length
    && ordnung.every((name, i) => name === FEATURE_ORDER[i]);
  if (!passt) return inert("FEATURE_ORDER_MISMATCH");

  return Object.freeze({
    active: true,
    reason: null,
    /* Erklaerbarkeit ist im GMP-Umfeld Anforderung, nicht Beiwerk: welche
       Merkmale den Wald tragen, muss ablesbar sein. */
    featureImportance: model.featureImportance
      ? Object.freeze({ ...model.featureImportance })
      : null,

    classify(screening) {
      const kandidaten = screening?.candidates || [];
      if (kandidaten.length === 0) {
        return Object.freeze({ candidates: Object.freeze([]), classified: true, reason: null });
      }

      const bewertet = kandidaten.map(c => {
        const x = featureVector(c);
        let summe = 0, gueltig = 0;
        for (const tree of model.trees) {
          const p = treeProbability(tree, x);
          if (p !== null) { summe += p; gueltig++; }
        }
        /* Kein gueltiger Baum: der Kandidat behaelt seine Regelbewertung
           und wird ausdruecklich als nicht klassifiziert gefuehrt. */
        if (gueltig === 0) return Object.freeze({ ...c, classifier: null });
        const konfidenz = summe / gueltig;
        return Object.freeze({
          ...c,
          classifier: Object.freeze({
            klasse: konfidenz >= 0.5 ? CLASS_LABELS[1] : CLASS_LABELS[0],
            konfidenz,
            /* Der Regelwert bleibt daneben stehen. Wer die Sortierung
               nachvollziehen will, sieht beide Zahlen. */
            regelScore: c.relevanceScore,
          }),
        });
      });

      /* NUR UMSORTIEREN. Die Menge bleibt identisch — same in, same out.
         Absteigend nach Konfidenz, bei Gleichstand nach dem Regelwert,
         dann deterministisch nach Bildposition. */
      const sortiert = bewertet.slice().sort((a, b) =>
        ((b.classifier?.konfidenz ?? -1) - (a.classifier?.konfidenz ?? -1))
        || (b.relevanceScore - a.relevanceScore)
        || (a.boundingBox.minY - b.boundingBox.minY)
        || (a.boundingBox.minX - b.boundingBox.minX));

      return Object.freeze({
        candidates: Object.freeze(sortiert),
        classified: true,
        reason: null,
      });
    },
  });
}
