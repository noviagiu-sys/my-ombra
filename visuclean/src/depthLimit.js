/* ─── VisuClean · Tiefenmodell gegen die Vorgabegrenze ──────────────
   Rein, deterministisch, ohne DOM, ohne Zufall, ohne Zeitquelle.

   DIE GRENZE
   Die Vorgabe lautet ausdruecklich: zulaessige Kratz-/
   Riefentiefe < 1,0 um (bestaetigt vom Auftraggeber am 15.09.2026; die
   zuvor genannten 1,0 mm waren ein Uebertragungsfehler, der Operator '<'
   wurde am selben Tag nachgereicht). Das ist die erste und bislang einzige
   Zahl in diesem Projekt, die von aussen belegt ist — jede andere Schwelle
   hier ist ein unvalidierter Stellwert.

   DER OPERATOR IST TEIL DER GRENZE
   '<' und '<=' sind nicht dasselbe, und der Unterschied ist messbar: im
   Messwerkzeug der Werkbank entschied genau dieses Zeichen ueber drei von
   146 Treffern. Er steht deshalb als DEPTH_LIMIT_OPERATOR im Code und in
   jeder Anzeige, statt in einem Vergleich zu verschwinden.

   WARUM EINE BELEGTE GRENZE GEFAEHRLICH IST
   Eine belegte Zahl verfuehrt dazu, sie an etwas anzulegen, das sie nicht
   messen kann. 1,0 um liegt rund zwei Groessenordnungen unter dem, was
   eine Handyaufnahme in der BILDEBENE aufloest (bei ueblichem Pruefabstand
   deckt ein Pixel etwa 50 um ab), und eine Tiefe steht in einem Einzelfoto
   ueberhaupt nicht. Deshalb gilt hier ausnahmslos:

     * Eine Tiefe entsteht NUR aus einer unabhaengigen Messung mit
       benannter Einheit, benanntem Messmittel, angegebener Unsicherheit,
       Zeitpunkt und ausfuehrender Person.
     * Aus Bildkontrast folgt hoechstens OPTICAL_DEPTH_CHECK_RECOMMENDED —
       eine Empfehlung, manuell nachzumessen. Nie ein Wert in um, nie
       WITHIN_DEPTH_LIMIT.
     * WITHIN_DEPTH_LIMIT betrifft ausschliesslich das Tiefenkriterium und
       erzeugt keinen automatischen Gesamt-PASS.

   DIE EINHEIT WIRD GEPRUEFT
   Nicht aus Formalismus: dieses Projekt hat den Unterschied zwischen mm
   und um bereits einmal durch die gesamte Planung getragen. Eine Messung
   ohne ausdrueckliche Einheit wird deshalb nicht angenommen, und "mm"
   wird nicht stillschweigend umgerechnet.                                */

/* ── Regelfassungen ───────────────────────────────────────────────────────
   Das Urteil wird nirgends mitgespeichert, sondern beim Anzeigen gerechnet.
   Das ist nur dann zulaessig, wenn die DAMALIGE Rechnung dauerhaft
   reproduzierbar bleibt — sonst machte ein spaeteres Update aus derselben
   gespeicherten Messung ein anderes Urteil, auch im PDF einer laengst
   abgeschlossenen Pruefung.

   Deshalb traegt jede Messung die Fassung der Regel, nach der sie beurteilt
   wurde. Aeltere Fassungen bleiben hier stehen und werden weiter angewandt;
   eine neue Fassung bekommt eine neue Nummer und wirkt nur auf neue
   Messungen. Eine Fassung wird NIE inhaltlich geaendert.

   Eine unbekannte Fassung wird nicht nach heutiger Regel ausgewertet —
   das waere genau der stille Urteilswechsel, den diese Konstruktion
   verhindern soll. Sie fuehrt zu NOT_MEASURED mit eigenem Grund.        */

export const DEPTH_RULES = Object.freeze({
  1: Object.freeze({
    version: 1,
    limitUm: 1.0,
    operator: "<",
    inForceFrom: "2026-09-15",
    de: "Zulaessig ist streng kleiner 1,0 um. Eingeteilt wird erst, wenn "
      + "das ganze Unsicherheitsintervall auf einer Seite liegt.",
    en: "Permissible is strictly less than 1.0 um. Classification only "
      + "once the whole uncertainty interval lies on one side.",
  }),
});

/** Die Fassung, nach der NEUE Messungen beurteilt werden. */
export const DEPTH_RULE_VERSION = 1;

/** Zulaessige Kratz-/Riefentiefe in Mikrometern, aktuelle Fassung. */
export const DEPTH_LIMIT_UM = DEPTH_RULES[DEPTH_RULE_VERSION].limitUm;

/** Der Operator der Vorgabe. Teil der Grenze, nicht Implementierung. */
export const DEPTH_LIMIT_OPERATOR = DEPTH_RULES[DEPTH_RULE_VERSION].operator;

export const DEPTH_LIMIT_SOURCE = Object.freeze({
  status: "PREDEFINED_LIMIT",
  confirmedAt: "2026-09-15",
  operator: DEPTH_LIMIT_OPERATOR,
  de: "Zulaessige Kratz-/Riefentiefe < 1,0 um. "
    + "Referenzgrenze fuer eine unabhaengig gemessene Tiefe — keine "
    + "Bildschwelle.",
  en: "Permissible scratch/groove depth < 1.0 um. "
    + "Reference limit for an independently measured depth - not an image "
    + "threshold.",
});

/** Zulaessige Einheiten der Eingabe. "mm" wird NICHT umgerechnet. */
export const DEPTH_UNIT = "µm";
const EINHEIT_ERLAUBT = new Set(["µm", "um", "μm"]);

/**
 * Woher ein Tiefenwert stammt. **Nur INDEPENDENT entscheidet.**
 *
 * DETECTOR: aus dem eigenen Detektor abgeleitet — die App misst sich damit
 * an sich selbst.
 *
 * MODEL_ESTIMATE: die Schaetzung eines trainierten Modells. Sie ist
 * ausdruecklich vorgesehen und darf gespeichert, angezeigt und ins
 * Protokoll aufgenommen werden — aber sie ersetzt **heute** keine
 * unabhaengige Messung und erzeugt deshalb nie WITHIN_DEPTH_LIMIT.
 *
 * Das ist eine Grenze fuer den heutigen Entwicklungsstand, keine Absage:
 * eine spaeter nachgewiesene Messleistung kann diese Regel aendern. Dann
 * ist es aber eine bewusste, sichtbare Aenderung an dieser Stelle — und
 * nicht ein Wert, der sich unbemerkt als Messung ausgibt.
 */
export const DEPTH_MEASUREMENT_SOURCE = Object.freeze({
  INDEPENDENT: "INDEPENDENT_MEASUREMENT",
  DETECTOR: "DETECTOR",
  MODEL_ESTIMATE: "MODEL_ESTIMATE",
});

/* Genau vier Zustaende, wie vom Auftraggeber festgelegt. Ein fuenfter
   ("unvollstaendig") waere verfuehrerisch, ist aber nicht noetig: eine
   halbe Eingabe IST keine unabhaengige Messung und damit NOT_MEASURED.
   Was genau fehlt, steht im Feld `missing` — die Auskunft geht nicht
   verloren, sie steht nur nicht im Urteil. */
export const DEPTH_DECISION = Object.freeze({
  NOT_MEASURED: "NOT_MEASURED",
  WITHIN_DEPTH_LIMIT: "WITHIN_DEPTH_LIMIT",
  DEPTH_LIMIT_EXCEEDED: "DEPTH_LIMIT_EXCEEDED",
  BOUNDARY_UNCERTAIN: "BOUNDARY_UNCERTAIN",
});

/** Der EINZIGE Hinweis, den Bildkontrast erzeugen darf. */
export const OPTICAL_HINT = Object.freeze({
  NONE: "NONE",
  OPTICAL_DEPTH_CHECK_RECOMMENDED: "OPTICAL_DEPTH_CHECK_RECOMMENDED",
});

/* Stellwert — not validated. Ab dieser normierten Kantenstaerke empfiehlt
   die App, mit geeignetem Messmittel nachzusehen. Der Wert steuert nur,
   wie oft empfohlen wird; er kann kein Urteil verschieben, weil der
   Hinweis keines faellt. Eine Kalibrierung gibt es nicht. */
export const OPTICAL_HINT_EDGE_STRENGTH = 0.45;

/** Pflichtfelder einer unabhaengigen Tiefenmessung. */
export const DEPTH_MEASUREMENT_FIELDS = Object.freeze([
  "valueUm", "unit", "method", "uncertaintyUm", "measuredAt", "measuredBy",
]);

const NACHRICHT = Object.freeze({
  [DEPTH_DECISION.NOT_MEASURED]: {
    de: "Tiefe nicht gemessen. Aus der Aufnahme folgt keine Tiefenangabe.",
    en: "Depth not measured. No depth follows from the image.",
  },
  UNVOLLSTAENDIG: {
    de: "Keine verwertbare Tiefenmessung: Pflichtangaben fehlen oder die "
      + "Angabe stammt nicht aus einer unabhaengigen Messung. Keine "
      + "Entscheidung zum Tiefenkriterium.",
    en: "No usable depth measurement: mandatory fields missing, or the "
      + "entry does not come from an independent measurement. No decision "
      + "on the depth criterion.",
  },
  /* Eigener Text fuer die Modellschaetzung. Sie ist kein Versehen und kein
     Formfehler — wer den Satz liest, soll sehen, WARUM nicht entschieden
     wurde, statt eine fehlende Eingabe zu vermuten und zu suchen. */
  UNBEKANNTE_FASSUNG: {
    de: "Unbekannte Regelfassung. Diese Messung wurde nach einer Regel "
      + "beurteilt, die in diesem Stand nicht vorliegt. Sie wird NICHT nach "
      + "der heutigen Regel neu bewertet.",
    en: "Unknown rule version. This measurement was assessed under a rule "
      + "not present in this build. It is NOT re-assessed under today's "
      + "rule.",
  },
  MODELLSCHAETZUNG: {
    de: "Modellschaetzung, keine unabhaengige Messung. Sie wird gefuehrt und "
      + "angezeigt, entscheidet das Tiefenkriterium aber nicht. Eine "
      + "Entscheidung verlangt eine unabhaengige Messung.",
    en: "Model estimate, not an independent measurement. It is recorded and "
      + "displayed but does not decide the depth criterion. A decision "
      + "requires an independent measurement.",
  },
  [DEPTH_DECISION.WITHIN_DEPTH_LIMIT]: {
    de: "Gemessene Tiefe liegt unter der Grenze von 1,0 um. "
      + "Das betrifft nur das Tiefenkriterium und ist keine Freigabe des "
      + "Befundes und kein Gesamturteil.",
    en: "Measured depth is below the limit of 1.0 um. This "
      + "concerns the depth criterion only and is not a release of the "
      + "finding and not an overall verdict.",
  },
  [DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED]: {
    de: "Gemessene Tiefe erreicht oder ueberschreitet die "
      + "Grenze von 1,0 um.",
    en: "Measured depth reaches or exceeds the limit of "
      + "1.0 um.",
  },
  [DEPTH_DECISION.BOUNDARY_UNCERTAIN]: {
    de: "Grenzfall: das Messunsicherheitsintervall ueberschneidet die "
      + "Grenze von 1,0 um. Keine automatische Entscheidung.",
    en: "Boundary case: the measurement uncertainty interval overlaps the "
      + "1.0 um limit. No automatic decision.",
  },
  [OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED]: {
    de: "Auffaellige Struktur — manuelle Tiefenkontrolle mit geeignetem "
      + "Messmittel empfohlen. Der Hinweis stammt aus dem Bildkontrast und "
      + "ist keine Tiefenangabe.",
    en: "Conspicuous structure - manual depth check with a suitable "
      + "instrument recommended. The hint comes from image contrast and is "
      + "not a depth value.",
  },
});

function endlich(wert) {
  return typeof wert === "number" && Number.isFinite(wert);
}

/**
 * Zahl aus der Eingabe lesen, ohne die Eingabe zu veraendern.
 * Akzeptiert Zahl und Zeichenkette (auch mit Komma als Dezimaltrenner),
 * damit die Anzeige das Eingetippte unveraendert weiterreichen kann.
 * Leer, Unsinn und nicht endliche Werte ergeben null — niemals 0.
 */
function zahl(roh) {
  if (endlich(roh)) return roh;
  if (typeof roh !== "string") return null;
  const text = roh.trim().replace(",", ".");
  if (!text || !/^[+-]?\d*\.?\d+(e[+-]?\d+)?$/i.test(text)) return null;
  const wert = Number(text);
  return Number.isFinite(wert) ? wert : null;
}

function text(roh) {
  return String(roh ?? "").trim();
}

/* ── Exakte Dezimalrechnung an der Grenze ──────────────────────────────────
   Der Vergleich mit 1,0 um ist die empfindlichste Stelle dieses Moduls,
   und Gleitkomma ist dort nachweislich zu ungenau: von 999 geprueften
   Paaren, deren Untergrenze `wert - unsicherheit` in Dezimalrechnung
   EXAKT 1,000 ergibt, liefern 208 in double-Arithmetik 0,9999999999999999
   (etwa 1,001 +/- 0,001). Sie fielen damit in BOUNDARY_UNCERTAIN statt in
   DEPTH_LIMIT_EXCEEDED.

   Die Abweichung ging in die sichere Richtung — mehr Grenzfaelle, keine
   stille Freigabe — falsch war sie trotzdem. Eine Epsilon-Toleranz waere
   die naheliegende Loesung und genau das, was dieses Projekt nicht tut:
   sie waere eine erfundene Zahl an der einen belegten Grenze. Stattdessen
   wird mit skalierten Ganzzahlen exakt gerechnet.                       */

/** "0,85" oder 0.85 -> { ziffern: 85n, skala: 2 }, also ziffern * 10^-skala. */
function dezimal(roh) {
  const s = typeof roh === "number"
    ? String(roh)
    : String(roh ?? "").trim().replace(",", ".");
  const m = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) return null;
  const [, vorzeichen, ganz, bruch = "", exponent = "0"] = m;
  let ziffern = BigInt((ganz || "0") + bruch);
  if (vorzeichen === "-") ziffern = -ziffern;
  return { ziffern, skala: bruch.length - Number(exponent) };
}

function angleichen(a, b) {
  const skala = Math.max(a.skala, b.skala);
  return [
    a.ziffern * 10n ** BigInt(skala - a.skala),
    b.ziffern * 10n ** BigInt(skala - b.skala),
    skala,
  ];
}

const addiere = (a, b) => { const [x, y, s] = angleichen(a, b); return { ziffern: x + y, skala: s }; };
const subtrahiere = (a, b) => { const [x, y, s] = angleichen(a, b); return { ziffern: x - y, skala: s }; };
const vergleiche = (a, b) => { const [x, y] = angleichen(a, b); return x < y ? -1 : x > y ? 1 : 0; };

/** Zurueck in eine Anzeigezahl. Nur fuer die Ausgabe, nie fuer den Vergleich. */
function alsZahl(d) {
  if (d.skala === 0) return Number(d.ziffern);
  const negativ = d.ziffern < 0n;
  const ziffern = (negativ ? -d.ziffern : d.ziffern).toString();
  let s;
  if (d.skala > 0) {
    const gepolstert = ziffern.padStart(d.skala + 1, "0");
    s = `${gepolstert.slice(0, -d.skala)}.${gepolstert.slice(-d.skala)}`;
  } else {
    s = ziffern + "0".repeat(-d.skala);
  }
  return Number(negativ ? `-${s}` : s);
}

/**
 * Wertet eine unabhaengige Tiefenmessung gegen die Vorgabegrenze aus.
 *
 * DIE REGEL, GENAU WIE FESTGELEGT:
 *   kein unabhaengiger Messwert            -> NOT_MEASURED
 *   Unsicherheitsintervall schneidet 1,0   -> BOUNDARY_UNCERTAIN
 *   valueUm <  1,0                         -> WITHIN_DEPTH_LIMIT
 *   valueUm >= 1,0                         -> DEPTH_LIMIT_EXCEEDED
 *
 * Die Reihenfolge ist wesentlich. Erst wenn das gesamte Intervall auf
 * EINER Seite der Grenze liegt, faellt eine Entscheidung; sonst koennte
 * der wahre Wert auf der anderen Seite liegen und die Einteilung waere
 * geraten. Bei Unsicherheit 0 faellt die Intervallpruefung mit der
 * Punktpruefung zusammen — 1,000 um ist dann DEPTH_LIMIT_EXCEEDED, weil
 * die Vorgabe '<' sagt und nicht '<='.
 */
export function evaluateDepthMeasurement(messung, { regeln = DEPTH_RULES } = {}) {
  const roh = messung && typeof messung === "object"
    ? Object.freeze({ ...messung })
    : null;

  const basis = {
    valueUm: null, unit: null, uncertaintyUm: null, intervalUm: null,
    method: null, measuredAt: null, measuredBy: null, source: null,
    limitUm: null, limitOperator: null, ruleVersion: null,
    /* Die originale Eingabe bleibt unveraendert erhalten — inklusive der
       Schreibweise, die jemand eingetippt hat. */
    raw: roh,
    missing: [],
  };

  if (!roh) {
    return Object.freeze({
      ...basis, decision: DEPTH_DECISION.NOT_MEASURED,
      limitUm: DEPTH_LIMIT_UM, limitOperator: DEPTH_LIMIT_OPERATOR,
      ruleVersion: DEPTH_RULE_VERSION,
      message: NACHRICHT[DEPTH_DECISION.NOT_MEASURED],
    });
  }

  /* Die Fassung kommt aus der MESSUNG, nicht aus dem heutigen Stand. Fehlt
     sie, ist die Messung vor der Versionierung entstanden und wird nach
     Fassung 1 beurteilt — das war damals die einzige. */
  const fassungNr = Number.isInteger(roh.ruleVersion) ? roh.ruleVersion : 1;
  const regel = regeln?.[fassungNr] || null;
  if (!regel) {
    /* NICHT nach heutiger Regel auswerten: genau das waere der stille
       Urteilswechsel, den die Versionierung verhindern soll. */
    return Object.freeze({
      ...basis, decision: DEPTH_DECISION.NOT_MEASURED,
      ruleVersion: fassungNr,
      missing: Object.freeze(["ruleVersion"]),
      message: NACHRICHT.UNBEKANNTE_FASSUNG,
    });
  }

  const wert = zahl(roh.valueUm);
  const unsicherheit = zahl(roh.uncertaintyUm);
  const einheit = text(roh.unit);
  const methode = text(roh.method);
  const zeitpunkt = text(roh.measuredAt);
  const person = text(roh.measuredBy);
  const quelle = text(roh.source);

  const fehlend = [];
  if (wert === null || wert < 0) fehlend.push("valueUm");
  if (!EINHEIT_ERLAUBT.has(einheit)) fehlend.push("unit");
  if (!methode) fehlend.push("method");
  /* Eine fehlende Unsicherheit ist NICHT +/- 0. */
  if (unsicherheit === null || unsicherheit < 0) fehlend.push("uncertaintyUm");
  if (!zeitpunkt) fehlend.push("measuredAt");
  if (!person) fehlend.push("measuredBy");
  /* Eine vom Detektor erzeugte "Messung" misst die App an sich selbst.
     Dieselbe Sperre wie `referenz_quelle = DETEKTOR` in der Werkbank. */
  if (quelle !== DEPTH_MEASUREMENT_SOURCE.INDEPENDENT) fehlend.push("source");

  const getrennt = {
    ...basis,
    limitUm: regel.limitUm, limitOperator: regel.operator,
    ruleVersion: fassungNr,
    valueUm: wert, unit: einheit || null, uncertaintyUm: unsicherheit,
    method: methode || null, measuredAt: zeitpunkt || null,
    measuredBy: person || null, source: quelle || null,
  };

  if (fehlend.length) {
    return Object.freeze({
      ...getrennt,
      decision: DEPTH_DECISION.NOT_MEASURED,
      missing: Object.freeze(fehlend),
      /* Drei Texte, ein Zustand: "nichts eingetragen", "halb eingetragen"
         und "Modellschaetzung" sind alle keine Messung, sehen aber im
         Protokoll verschieden aus — und verlangen verschiedene naechste
         Schritte. */
      message: quelle === DEPTH_MEASUREMENT_SOURCE.MODEL_ESTIMATE
        ? NACHRICHT.MODELLSCHAETZUNG
        : (roh.valueUm === undefined || roh.valueUm === null
          ? NACHRICHT[DEPTH_DECISION.NOT_MEASURED]
          : NACHRICHT.UNVOLLSTAENDIG),
    });
  }

  /* Exakt gerechnet, nicht in Gleitkomma — siehe `dezimal` oben. Fuer eine
     Eingabe, die sich nicht als Dezimalzahl lesen laesst (etwa eine sehr
     grosse Exponentialschreibweise), bleibt der Gleitkommaweg als
     Rueckfall; er ist an dieser Grenze ungenauer, aber nie stiller. */
  const dWert = dezimal(roh.valueUm);
  const dUnsicher = dezimal(roh.uncertaintyUm);
  const dGrenze = dezimal(regel.limitUm);
  const exakt = dWert !== null && dUnsicher !== null && dGrenze !== null;
  const betragU = exakt && dUnsicher.ziffern < 0n
    ? { ...dUnsicher, ziffern: -dUnsicher.ziffern } : dUnsicher;

  const dUnten = exakt ? subtrahiere(dWert, betragU) : null;
  const dOben = exakt ? addiere(dWert, betragU) : null;
  const unten = exakt ? alsZahl(dUnten) : wert - Math.abs(unsicherheit);
  const oben = exakt ? alsZahl(dOben) : wert + Math.abs(unsicherheit);

  /* Die Regel, buchstaeblich:
       ganzes Intervall unter der Grenze   -> WITHIN_DEPTH_LIMIT
       ganzes Intervall ab der Grenze      -> DEPTH_LIMIT_EXCEEDED
       sonst schneidet es die Grenze       -> BOUNDARY_UNCERTAIN
     Bei Unsicherheit 0 faellt das mit der Punktpruefung zusammen, und dann
     entscheidet allein der Operator der Vorgabe: 1,000 um ist
     bereits DEPTH_LIMIT_EXCEEDED, weil dort '<' steht und nicht '<='. */
  const obenUnterGrenze = exakt
    ? vergleiche(dOben, dGrenze) < 0 : oben < regel.limitUm;
  const untenAbGrenze = exakt
    ? vergleiche(dUnten, dGrenze) >= 0 : unten >= regel.limitUm;

  let entscheidung;
  if (obenUnterGrenze) {
    entscheidung = DEPTH_DECISION.WITHIN_DEPTH_LIMIT;
  } else if (untenAbGrenze) {
    entscheidung = DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED;
  } else {
    entscheidung = DEPTH_DECISION.BOUNDARY_UNCERTAIN;
  }

  return Object.freeze({
    ...getrennt,
    decision: entscheidung,
    uncertaintyUm: Math.abs(unsicherheit),
    intervalUm: Object.freeze({ from: unten, to: oben }),
    exactComparison: exakt,
    missing: Object.freeze([]),
    message: NACHRICHT[entscheidung],
  });
}

/**
 * Der einzige Weg vom Bildkontrast zu einer Aussage — und die Aussage ist
 * eine Empfehlung, kein Befund.
 *
 * Rueckgabe traegt bewusst `decision: NOT_MEASURED` und `valueUm: null`.
 * Wer diesen Rueckgabewert anzeigt, kann daraus keine Tiefe ablesen, weil
 * keine darin steht — und WITHIN_DEPTH_LIMIT kann daraus nie werden.
 */
export function opticalDepthHint(kandidat) {
  const basis = {
    hint: OPTICAL_HINT.NONE,
    decision: DEPTH_DECISION.NOT_MEASURED,
    valueUm: null,
    limitUm: DEPTH_LIMIT_UM,
    limitOperator: DEPTH_LIMIT_OPERATOR,
    message: NACHRICHT[DEPTH_DECISION.NOT_MEASURED],
  };
  if (!kandidat || typeof kandidat !== "object") return Object.freeze(basis);
  const staerke = kandidat.edgeStrength;
  if (!endlich(staerke) || staerke < OPTICAL_HINT_EDGE_STRENGTH) {
    /* KEIN Hinweis heisst NICHT "nicht tief". Die Kantenstaerke ist auf
       das Maximum desselben Bildes normiert; ihre Abwesenheit belegt
       nichts. */
    return Object.freeze(basis);
  }
  return Object.freeze({
    ...basis,
    hint: OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED,
    candidateId: kandidat.kandidatId ?? null,
    message: NACHRICHT[OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED],
  });
}

/**
 * Darf diese Messung in einen Datensatz?
 *
 * Getrennt von `evaluateDepthMeasurement`, weil es zwei verschiedene Fragen
 * sind: „ist sie vollstaendig genug zum Speichern" und „entscheidet sie das
 * Tiefenkriterium". Eine Modellschaetzung ist speicherbar und entscheidet
 * nicht — beides gleichzeitig.
 *
 * Verlangt werden die sechs inhaltlichen Pflichtangaben und eine BEKANNTE
 * Herkunft. Eine halb ausgefuellte Messung gehoert nicht in eine signierte
 * Akte; eine unbekannte Herkunft erst recht nicht.
 */
export function istSpeicherbar(messung) {
  const e = evaluateDepthMeasurement(messung);
  const bekannt = Object.values(DEPTH_MEASUREMENT_SOURCE).includes(e.source);
  return e.missing.every(feld => feld === "source") && bekannt;
}

/**
 * Die Kennung, unter der eine Tiefenmessung EINDEUTIG ist.
 *
 * Eine Messung haengt an genau einer Bindung: entweder an einem
 * Detektorkandidaten oder an einer manuell gesetzten Markierung (die
 * Speichergrenze erzwingt das XOR). Die Identitaet ist deshalb das Foto
 * PLUS beide Bindungsfelder — und die fehlende Seite wird ausdruecklich
 * als "kein Wert" geschrieben, nicht als leerer String. Sonst faellt eine
 * Kandidatenmessung mit der Kennung "" mit einer Markermessung ohne
 * Kandidat zusammen.
 */
function bindungsSchluessel(messung) {
  const teil = wert => (wert === null || wert === undefined || wert === ""
    ? " " : String(wert));
  return [
    teil(messung?.photoId),
    teil(messung?.kandidatId),
    teil(messung?.markerId),
  ].join("");
}

/**
 * Eine Tiefenmessung in eine Liste aufnehmen oder die GLEICHE Bindung
 * ersetzen.
 *
 * Befund der Gegenpruefung vom 16.09.2026, zutreffend und sperrend: die
 * Oberflaeche erkannte eine vorhandene Messung an `photoId + kandidatId`.
 * Bei jeder manuellen Markierung ist `kandidatId` aber `null`, und
 * `null === null` ist wahr — die zweite Markierung auf demselben Foto
 * loeschte damit die erste. Genau die uebersehenen Befunde, die eine
 * Messkampagne zaehlen will, verschwanden dabei zuerst.
 *
 * Die Regel steht deshalb hier und nicht in der Oberflaeche: sie ist eine
 * Datenregel, sie ist rein, und sie ist pruefbar, ohne ein Formular zu
 * rendern. Korrigieren derselben Stelle bleibt moeglich und ersetzt AN
 * ORT UND STELLE — eine Korrektur darf die Reihenfolge nicht umsortieren.
 *
 * @param {Array} liste  bisherige Messungen (wird nicht veraendert)
 * @param {Object} messung  neue oder korrigierte Messung
 * @returns {Array} neue Liste
 */
export function ersetzeMessung(liste, messung) {
  const alt = Array.isArray(liste) ? liste : [];
  if (!messung) return alt.slice();
  const schluessel = bindungsSchluessel(messung);
  const stelle = alt.findIndex(m => bindungsSchluessel(m) === schluessel);
  if (stelle < 0) return [...alt, messung];
  const neu = alt.slice();
  neu[stelle] = messung;
  return neu;
}

/**
 * Eine Tiefenmessung anhand ihrer Bindung entfernen.
 *
 * Gegenstueck zu `ersetzeMessung` und aus demselben Grund hier: ein
 * Loeschen, das auf `kandidatId` allein vergleicht, raeumt mit einer
 * Markermessung alle uebrigen gleich mit ab.
 */
export function entferneMessung(liste, bindung) {
  const alt = Array.isArray(liste) ? liste : [];
  if (!bindung) return alt.slice();
  const schluessel = bindungsSchluessel(bindung);
  return alt.filter(m => bindungsSchluessel(m) !== schluessel);
}

/**
 * Bilanz ueber die Tiefenmessungen einer Pruefung.
 *
 * Trennt ERKANNTE von UEBERSEHENEN Befunden. Das ist der Punkt, an dem
 * sich entscheidet, ob eine Messkampagne den ganzen Weg misst oder nur
 * die Schaeden, die der Detektor ohnehin gefunden hat.
 *
 * `uebersehen` sind Messungen, die an eine MANUELLE Markierung gebunden
 * sind — der Pruefer hat die Stelle selbst gesetzt, weil der Detektor sie
 * nicht angeboten hat. `uebersehenUeberGrenze` zaehlt davon jene, die die
 * Grenze ueberschreiten: das sind die verfehlten Grenzueberschreitungen,
 * und sie sind die teuerste Fehlerart.
 */
export function befundBilanz(messungen = [], optionen = {}) {
  const liste = Array.isArray(messungen) ? messungen : [];
  const zaehler = {
    gesamt: liste.length, erkannt: 0, uebersehen: 0,
    uebersehenUeberGrenze: 0, ueberGrenze: 0,
    unterGrenze: 0, unentschieden: 0, ohneUrteil: 0,
    ausserhalb: 0,
  };
  for (const m of liste) {
    /* AUSSERHALB DER PRUEFFLAECHE ist eine eigene Kategorie.
       Befund der Gegenpruefung an rc.4.40: eine Messung an einem Marker
       ausserhalb des bewerteten Ausschnitts wurde als uebersehene
       Grenzueberschreitung gezaehlt — an einer Stelle, die ausdruecklich
       nicht untersucht wurde. Das verfaelscht genau die Kennzahl, um die
       es in der Kampagne geht: der Detektor kann nichts uebersehen, was
       ihm nie vorgelegt wurde.

       Solche Messungen werden weiter GEZAEHLT, aber getrennt, und sie
       gehen weder in `erkannt` noch in `uebersehen` ein. */
    if (m?.ausserhalbFlaeche === true) {
      zaehler.ausserhalb += 1;
      continue;
    }
    /* ERKANNT heisst: an einen Detektorkandidaten gebunden. Das wird aus
       der Bindung ABGELEITET, nicht aus einem Feld geglaubt. */
    const erkannt = Boolean(m?.kandidatId);
    zaehler[erkannt ? "erkannt" : "uebersehen"] += 1;
    const e = evaluateDepthMeasurement(m, optionen);
    if (e.decision === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED) {
      zaehler.ueberGrenze += 1;
      if (!erkannt) zaehler.uebersehenUeberGrenze += 1;
    } else if (e.decision === DEPTH_DECISION.WITHIN_DEPTH_LIMIT) {
      zaehler.unterGrenze += 1;
    } else if (e.decision === DEPTH_DECISION.BOUNDARY_UNCERTAIN) {
      zaehler.unentschieden += 1;
    } else {
      zaehler.ohneUrteil += 1;
    }
  }
  return Object.freeze(zaehler);
}

/**
 * Gibt dieses Tiefenergebnis einen Befund frei?
 *
 * Immer nein — und das ist keine Uebergangsloesung. WITHIN_DEPTH_LIMIT
 * betrifft ausschliesslich das Tiefenkriterium. Trocken, Sauber und die
 * uebrigen Kriterien entscheidet es nicht, und die Freigabe bleibt eine
 * dokumentierte menschliche Handlung. Eine Funktion, die hier jemals
 * `true` lieferte, waere der Punkt, an dem aus einem Messwert ein
 * automatischer Gesamt-PASS wuerde.
 */
export function grantsRelease() {
  return false;
}
