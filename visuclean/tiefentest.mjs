/* ─── VisuClean · Tiefenmodell gegen die Vorgabegrenze ──────────────
   Aufruf: node tiefentest.mjs

   Die Vorgabe lautet: zulässige Kratz-/Riefentiefe < 1,0 µm.
   Der Operator gehört zur Grenze — „< 1,0" und „≤ 1,0" sind nicht
   dasselbe, und der Unterschied ist messbar: in der Werkbank entschied
   genau dieses Zeichen über drei von 146 Treffern.

   Diese Suite hält fünf Trennungen fest:

     D1–D5    die Grenze selbst, buchstäblich: 0,999 / 1,000 / 1,001;
     D6–D9    ohne unabhängige Messung gibt es keine Entscheidung;
     D10–D12  das Unsicherheitsintervall, das die Grenze überschneidet;
     D13–D16  aus Kontrast folgt NIE eine Tiefe und NIE WITHIN_DEPTH_LIMIT;
     D17–D20  getrennte Speicherung, unveränderte Eingabe, kein Gesamt-PASS.

   AUSDRÜCKLICH NICHT GEPRÜFT: ob eine Tiefe von 1,0 µm mit einer
   Handyaufnahme feststellbar ist. Sie ist es nicht — ein Pixel deckt bei
   üblichem Prüfabstand rund 50 µm ab. Diese Suite prüft, dass die App das
   auch nicht behauptet.                                                  */

import {
  DEPTH_LIMIT_UM, DEPTH_LIMIT_OPERATOR, DEPTH_LIMIT_SOURCE, DEPTH_UNIT,
  DEPTH_DECISION, DEPTH_MEASUREMENT_FIELDS, DEPTH_MEASUREMENT_SOURCE,
  DEPTH_RULES, DEPTH_RULE_VERSION, OPTICAL_HINT, befundBilanz,
  evaluateDepthMeasurement, opticalDepthHint, grantsRelease,
} from "./src/depthLimit.js";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

/** Eine vollständige, gültige Messung. Einzelne Felder werden überschrieben. */
const messung = (over = {}) => ({
  valueUm: 0.5,
  unit: "µm",
  method: "TASTSCHNITT",
  uncertaintyUm: 0.01,
  measuredAt: "2026-09-15T09:30:00.000Z",
  measuredBy: "m.koch",
  source: DEPTH_MEASUREMENT_SOURCE.INDEPENDENT,
  ...over,
});
const urteil = (over) => evaluateDepthMeasurement(messung(over)).decision;

console.log("VisuClean · Tiefenmodell gegen die Vorgabegrenze");
console.log(`Grenze: ${DEPTH_LIMIT_OPERATOR} ${DEPTH_LIMIT_UM} ${DEPTH_UNIT}\n`);

/* ── 1 · Die Grenze, buchstäblich ─────────────────────────────────────── */

ok("D1", "Die Grenze ist < 1,0 µm und als Vorgabe ausgewiesen",
  DEPTH_LIMIT_UM === 1.0
  && DEPTH_LIMIT_OPERATOR === "<"
  && DEPTH_LIMIT_SOURCE.status === "PREDEFINED_LIMIT"
  && /<\s*1[,.]0/.test(String(DEPTH_LIMIT_SOURCE.de || "")),
  `${DEPTH_LIMIT_OPERATOR} ${DEPTH_LIMIT_UM} ${DEPTH_UNIT}`);

/* Ohne Unsicherheit gibt es keine Entscheidung (D8). Für die reine
   Operatorprüfung wird sie deshalb auf 0 gesetzt: das Intervall fällt mit
   dem Punktwert zusammen, und nur der Operator entscheidet. */
ok("D2", "0,999 µm liegt unter der Grenze → WITHIN_DEPTH_LIMIT",
  urteil({ valueUm: 0.999, uncertaintyUm: 0 })
    === DEPTH_DECISION.WITHIN_DEPTH_LIMIT);

ok("D3", "1,000 µm erreicht die Grenze → DEPTH_LIMIT_EXCEEDED",
  urteil({ valueUm: 1.0, uncertaintyUm: 0 })
    === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED,
  "die Vorgabe sagt '<', nicht '≤' — 1,000 ist nicht mehr zulässig");

ok("D4", "1,001 µm überschreitet die Grenze → DEPTH_LIMIT_EXCEEDED",
  urteil({ valueUm: 1.001, uncertaintyUm: 0 })
    === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED);

ok("D5", "Die drei Nachbarwerte ergeben genau zwei verschiedene Urteile",
  (() => {
    const drei = [0.999, 1.0, 1.001].map(v => urteil({ valueUm: v, uncertaintyUm: 0 }));
    return new Set(drei).size === 2 && drei[0] !== drei[1] && drei[1] === drei[2];
  })(),
  "die Trennlinie liegt zwischen 0,999 und 1,000 — genau dort, wo '<' sie legt");

/* ── 2 · Ohne unabhängige Messung keine Entscheidung ──────────────────── */

ok("D6", "Gar keine Messung ergibt NOT_MEASURED, nicht 0",
  evaluateDepthMeasurement(null).decision === DEPTH_DECISION.NOT_MEASURED
  && evaluateDepthMeasurement(null).valueUm === null
  && evaluateDepthMeasurement(undefined).decision === DEPTH_DECISION.NOT_MEASURED);

ok("D7", "Messwert ohne Messmittel entscheidet nicht",
  (() => {
    const e = evaluateDepthMeasurement(messung({ method: "" }));
    return e.decision === DEPTH_DECISION.NOT_MEASURED
      && e.missing.includes("method");
  })(),
  "eine Zahl ohne benanntes Messmittel ist keine Messung");

ok("D8", "Messwert ohne Messunsicherheit entscheidet nicht",
  (() => {
    const a = evaluateDepthMeasurement(messung({ uncertaintyUm: null }));
    const b = evaluateDepthMeasurement(messung({ uncertaintyUm: undefined }));
    return a.decision === DEPTH_DECISION.NOT_MEASURED
      && b.decision === DEPTH_DECISION.NOT_MEASURED
      && a.missing.includes("uncertaintyUm");
  })(),
  "fehlende Unsicherheit ist NICHT ± 0");

ok("D9", "Zeitpunkt, Person, Einheit und unabhängige Quelle sind Pflicht",
  ["measuredAt", "measuredBy", "unit", "source"].every(feld => {
    const e = evaluateDepthMeasurement(messung({ [feld]: "" }));
    return e.decision === DEPTH_DECISION.NOT_MEASURED && e.missing.includes(feld);
  })
  && evaluateDepthMeasurement(messung({ source: DEPTH_MEASUREMENT_SOURCE.DETECTOR }))
    .decision === DEPTH_DECISION.NOT_MEASURED,
  "eine Messung aus dem Detektor misst die App an sich selbst");

ok("D9b", "Die Einheit wird geprüft: 'mm' wird nicht stillschweigend umgerechnet",
  (() => {
    const e = evaluateDepthMeasurement(messung({ valueUm: 0.5, unit: "mm" }));
    return e.decision === DEPTH_DECISION.NOT_MEASURED && e.missing.includes("unit");
  })(),
  "genau diese Verwechslung trug dieses Projekt einmal durch die ganze Planung");

/* ── 3 · Das Unsicherheitsintervall ───────────────────────────────────── */

ok("D10", "Überlappendes Intervall → BOUNDARY_UNCERTAIN",
  urteil({ valueUm: 1.2, uncertaintyUm: 0.3 })
    === DEPTH_DECISION.BOUNDARY_UNCERTAIN,
  "1,2 ± 0,3 reicht bis 0,9 — der wahre Wert kann unter der Grenze liegen");

ok("D11", "Ein Intervall, das die Grenze nur berührt, entscheidet auch nicht",
  urteil({ valueUm: 0.999, uncertaintyUm: 0.001 })
    === DEPTH_DECISION.BOUNDARY_UNCERTAIN,
  "0,999 ± 0,001 reicht bis genau 1,000 — und 1,000 wäre bereits überschritten");

ok("D11b", "An der Grenze wird exakt gerechnet, nicht in Gleitkomma",
  (() => {
    /* Gefunden durch D19: 0,4 − 0,05 ergibt in double 0,35000000000000003.
       Der gefährliche Fall ist die Untergrenze: für 208 von 999 Paaren,
       deren Untergrenze dezimal EXAKT 1,000 ist, liefert double
       0,9999999999999999 — das wären 208 Grenzfälle, die in Wahrheit
       überschritten sind. Hier wird an allen 999 nachgerechnet. */
    let falsch = 0;
    for (let v = 1001; v <= 1999; v++) {
      const wert = v / 1000;
      const u = (v - 1000) / 1000;         // wert − u ist dezimal exakt 1,000
      if (urteil({ valueUm: wert, uncertaintyUm: u })
        !== DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED) falsch += 1;
    }
    const e = evaluateDepthMeasurement(messung({ valueUm: 0.4, uncertaintyUm: 0.05 }));
    return falsch === 0 && e.exactComparison === true;
  })(),
  "999 Paare mit Untergrenze genau 1,000 — alle DEPTH_LIMIT_EXCEEDED");

ok("D12", "Derselbe Messwert, zwei Urteile — die Unsicherheit entscheidet mit",
  urteil({ valueUm: 5.0, uncertaintyUm: 4.5 }) === DEPTH_DECISION.BOUNDARY_UNCERTAIN
  && urteil({ valueUm: 5.0, uncertaintyUm: 0.5 }) === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED,
  "eine große Unsicherheit macht aus einem klaren Wert einen Grenzfall");

/* ── 4 · Aus Kontrast folgt keine Tiefe ───────────────────────────────── */

const starkerKandidat = {
  kandidatId: "K01", edgeStrength: 1.0, relevanceScore: 0.9999,
  lengthRel: 0.5, widthRel: 0.01,
};

ok("D13", "Ein Höchstkontrast erzeugt nur eine Empfehlung",
  opticalDepthHint(starkerKandidat).hint
    === OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED,
  "OPTICAL_DEPTH_CHECK_RECOMMENDED — eine manuelle Tiefenkontrolle");

ok("D14", "Die Empfehlung trägt KEINE Tiefe und keine Einheit µm",
  (() => {
    const h = opticalDepthHint(starkerKandidat);
    if (h.valueUm !== null || h.decision !== DEPTH_DECISION.NOT_MEASURED) return false;
    const text = JSON.stringify(h);
    return !/\d\s*(µm|um\b|micro)/i.test(text);
  })(),
  "der Hinweis ist ein Hinweis, kein Messwert");

ok("D15", "Kontrast kann WITHIN_DEPTH_LIMIT nicht vergeben",
  (() => {
    for (const staerke of [0, 0.44, 0.45, 0.9, 1.0]) {
      const h = opticalDepthHint({ kandidatId: "K", edgeStrength: staerke });
      if (h.decision !== DEPTH_DECISION.NOT_MEASURED) return false;
    }
    return opticalDepthHint(null).hint === OPTICAL_HINT.NONE
      && opticalDepthHint(null).decision === DEPTH_DECISION.NOT_MEASURED;
  })(),
  "über die ganze Skala hinweg — und 'kein Hinweis' heißt nicht 'nicht tief'");

ok("D16", "Die Empfehlung überschreibt eine vorhandene Messung nicht",
  (() => {
    const gemessen = evaluateDepthMeasurement(messung({ valueUm: 0.4 }));
    const h = opticalDepthHint(starkerKandidat);
    return gemessen.decision === DEPTH_DECISION.WITHIN_DEPTH_LIMIT
      && h.decision === DEPTH_DECISION.NOT_MEASURED;
  })(),
  "zwei getrennte Größen, zwei getrennte Felder");

/* ── 4b · Eine Modellschätzung ist keine Messung ──────────────────────── */

ok("D16b", "MODEL_ESTIMATE erfüllt die Prüfung nicht und entscheidet nichts",
  (() => {
    /* Eine Schätzung mit allen sechs Pflichtangaben, sauber und
       vollständig — sie scheitert allein an ihrer Herkunft. */
    const schaetzung = messung({
      valueUm: 0.4, source: DEPTH_MEASUREMENT_SOURCE.MODEL_ESTIMATE,
    });
    const e = evaluateDepthMeasurement(schaetzung);
    return e.decision === DEPTH_DECISION.NOT_MEASURED
      && e.missing.includes("source")
      && e.source === DEPTH_MEASUREMENT_SOURCE.MODEL_ESTIMATE;
  })(),
  "vollständig ausgefüllt, trotzdem keine Entscheidung — die Herkunft zählt");

ok("D16c", "Keine Herkunft außer der unabhängigen Messung entscheidet",
  Object.values(DEPTH_MEASUREMENT_SOURCE)
    .filter(q => q !== DEPTH_MEASUREMENT_SOURCE.INDEPENDENT)
    .every(q => evaluateDepthMeasurement(messung({ valueUm: 0.4, source: q }))
      .decision === DEPTH_DECISION.NOT_MEASURED),
  /* Die Probe zählt über die Aufzählung, nicht über eine Liste im Test.
     Eine künftig ergänzte Herkunft wird damit automatisch mitgeprüft und
     muss sich ausdrücklich freischalten, statt still durchzurutschen. */
  `geprüft: ${Object.values(DEPTH_MEASUREMENT_SOURCE).length - 1} Herkünfte außer INDEPENDENT`);

ok("D16e", "Keine zweite Herkunft trägt den Wert der unabhängigen Messung",
  (() => {
    /* Befund aus der eigenen Sabotageprobe S12: `D16c` filtert nach WERTEN.
       Ein neuer Schlüssel mit dem Wert "INDEPENDENT_MEASUREMENT" wurde
       dadurch aus der Prüfung herausgefiltert statt geprüft.

       Funktional ist das nur ein Alias — aber im Aufrufcode stünde dann
       `DEPTH_MEASUREMENT_SOURCE.GESCHAETZT_AUS_KONTRAST`, und das läse sich
       wie eine Schätzung, während es als unabhängige Messung wirkt. Ein
       Name, der etwas anderes sagt als sein Wert tut, ist genau die Art
       Tür, die dieses Projekt schließt. */
    const eintraege = Object.entries(DEPTH_MEASUREMENT_SOURCE);
    const werte = eintraege.map(([, v]) => v);
    const eindeutig = new Set(werte).size === werte.length;
    const nurEinsIstUnabhaengig = eintraege
      .filter(([, v]) => v === DEPTH_MEASUREMENT_SOURCE.INDEPENDENT)
      .every(([k]) => k === "INDEPENDENT");
    return eindeutig && nurEinsIstUnabhaengig;
  })(),
  "Werte paarweise verschieden; nur der Schlüssel INDEPENDENT trägt ihn");

ok("D16d", "Die Schätzung ist als Schätzung benannt, nicht als fehlende Messung",
  (() => {
    const e = evaluateDepthMeasurement(messung({
      valueUm: 0.4, source: DEPTH_MEASUREMENT_SOURCE.MODEL_ESTIMATE,
    }));
    return /Schaetzung|Schätzung|Modell/i.test(e.message.de)
      && /estimate|model/i.test(e.message.en);
  })(),
  "wer den Text liest, muss sehen, WARUM nicht entschieden wurde");

/* ── 4c · Regelfassung: alte Urteile bleiben erhalten ─────────────────── */

ok("D21", "Jede Messung traegt die Fassung, nach der sie beurteilt wurde",
  (() => {
    const e = evaluateDepthMeasurement(messung({ valueUm: 0.4 }));
    return e.ruleVersion === 1 && DEPTH_RULE_VERSION === 1
      && DEPTH_RULES[1].limitUm === 1.0 && DEPTH_RULES[1].operator === "<";
  })(),
  "ohne Angabe gilt Fassung 1 — vor der Versionierung gab es nur diese");

ok("D22", "Eine NEUE Regelfassung aendert das Urteil eines alten Datensatzes nicht",
  (() => {
    /* „Neue Fassung installiert": ein Register, das Fassung 1 UNVERAENDERT
       enthaelt und zusaetzlich eine Fassung 2 mit anderer Grenze. Genau so
       muss ein kuenftiges Update aussehen — alte Fassungen bleiben stehen. */
    const spaeter = {
      ...DEPTH_RULES,
      2: { version: 2, limitUm: 5.0, operator: "<", inForceFrom: "2027-01-01" },
    };
    const alt = messung({ valueUm: 3.0, uncertaintyUm: 0.1, ruleVersion: 1 });
    const neu = messung({ valueUm: 3.0, uncertaintyUm: 0.1, ruleVersion: 2 });

    const vorher = evaluateDepthMeasurement(alt).decision;
    const nachher = evaluateDepthMeasurement(alt, { regeln: spaeter });
    const neuerFall = evaluateDepthMeasurement(neu, { regeln: spaeter });

    return vorher === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED
      && nachher.decision === DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED
      && nachher.limitUm === 1.0 && nachher.ruleVersion === 1
      /* Derselbe Messwert unter der NEUEN Fassung: anderes Urteil. Das
         belegt, dass die Fassung wirklich wirkt und der alte Datensatz
         nicht bloss zufaellig gleich bleibt. */
      && neuerFall.decision === DEPTH_DECISION.WITHIN_DEPTH_LIMIT
      && neuerFall.limitUm === 5.0;
  })(),
  "3,0 ± 0,1 µm: unter Fassung 1 ueberschritten, unter Fassung 2 darunter");

ok("D23", "Eine unbekannte Fassung wird NICHT nach heutiger Regel bewertet",
  (() => {
    const e = evaluateDepthMeasurement(messung({ valueUm: 0.4, ruleVersion: 99 }));
    return e.decision === DEPTH_DECISION.NOT_MEASURED
      && e.missing.includes("ruleVersion")
      && /Regelfassung/i.test(e.message.de);
  })(),
  "sonst waere genau der stille Urteilswechsel wieder moeglich");

/* ── 4d · Uebersehene Befunde ─────────────────────────────────────────── */

ok("D24", "Die Bilanz trennt erkannte von uebersehenen Befunden",
  (() => {
    const erkannt = messung({ valueUm: 3.0, uncertaintyUm: 0.1, kandidatId: "K01" });
    const uebersehen = messung({ valueUm: 3.0, uncertaintyUm: 0.1, markerId: "M01" });
    const flach = messung({ valueUm: 0.2, uncertaintyUm: 0.01, markerId: "M02" });
    const b = befundBilanz([erkannt, uebersehen, flach]);
    return b.gesamt === 3 && b.erkannt === 1 && b.uebersehen === 2
      && b.uebersehenUeberGrenze === 1 && b.ueberGrenze === 2
      && b.unterGrenze === 1;
  })(),
  "erkannt wird aus der BINDUNG abgeleitet, nicht aus einem Feld geglaubt");

/* ── 5 · Speicherung, Eingabe, kein Gesamt-PASS ───────────────────────── */

ok("D17", "Kein Tiefenergebnis gibt einen Befund frei",
  Object.values(DEPTH_DECISION).every(d => grantsRelease(d) === false),
  "auch WITHIN_DEPTH_LIMIT nicht — es betrifft nur das Tiefenkriterium");

ok("D18", "WITHIN_DEPTH_LIMIT bestreitet den Gesamt-PASS im Text",
  (() => {
    const de = evaluateDepthMeasurement(messung({ valueUm: 0.4 })).message.de;
    /* Erste Fassung dieser Probe suchte nach /frei/ und fiel über die
       VERNEINUNG „keine Freigabe" — das Muster traf den Satz, der die
       Sache richtig stellt. Jetzt wird beides einzeln verlangt. */
    return /Tiefenkriterium/i.test(de)
      && /keine Freigabe/i.test(de)
      && !/\bi\. ?O\.\b|\bin Ordnung\b|\bbestanden\b|\bPASS\b/i.test(de);
  })(),
  "kein Gesamturteil aus einem Einzelkriterium");

ok("D19", "Alle sechs Pflichtangaben stehen getrennt im Ergebnis",
  (() => {
    const e = evaluateDepthMeasurement(messung({ valueUm: 0.4, uncertaintyUm: 0.05 }));
    return DEPTH_MEASUREMENT_FIELDS.length === 6
      && e.valueUm === 0.4 && e.unit === "µm" && e.method === "TASTSCHNITT"
      && e.uncertaintyUm === 0.05 && e.measuredAt === "2026-09-15T09:30:00.000Z"
      && e.measuredBy === "m.koch"
      && e.intervalUm.from === 0.35 && e.limitUm === DEPTH_LIMIT_UM;
  })(),
  "eine Zahl ohne Einheit, Methode, Unsicherheit, Zeit und Person ist keine Angabe");

ok("D20", "Die originale Eingabe bleibt unverändert erhalten",
  (() => {
    /* Wie eingetippt: Komma als Dezimaltrenner, Zahl als Zeichenkette. */
    const eingabe = messung({ valueUm: "0,85", uncertaintyUm: "0,05" });
    const e = evaluateDepthMeasurement(eingabe);
    return e.decision === DEPTH_DECISION.WITHIN_DEPTH_LIMIT
      && e.valueUm === 0.85
      && e.raw.valueUm === "0,85"
      && e.raw.uncertaintyUm === "0,05";
  })(),
  "der gelesene Wert und das Eingetippte stehen nebeneinander, nicht übereinander");

/* ── Ergebnis ─────────────────────────────────────────────────────────── */

console.log("");
const durch = checks.filter(c => !c.passed);
console.log(`Bestanden: ${checks.length - durch.length} / ${checks.length}`);
if (durch.length) console.log(`Durchgefallen: ${durch.map(c => c.id).join(", ")}`);
console.log(`ERGEBNIS: ${durch.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
console.log("");
console.log("GRENZE: geprueft ist die LOGIK an der Vorgabegrenze.");
console.log("Dass eine Tiefe von 1,0 um mit einer Handyaufnahme feststellbar");
console.log("waere, ist damit NICHT behauptet — sie ist es nicht.");
process.exit(durch.length ? 1 : 0);
