/* ─── VisuClean · Prüfpunkt-Bewertung (RC3) ────────────────────────────────
   Zerlegt das Analyseergebnis in fünf einzeln bewertete Prüfpunkte und
   bildet daraus das Gesamtergebnis.

   Kernproblem, das dieser Baustein löst:
   Bis RC2 wurde ein Befund, dessen Primärwert über der Schwelle lag, dem
   aber die Kantenstützung fehlte (edgeFrac <= 0.06), still zu PASS. Eine
   leicht unscharfe Aufnahme einer nassen, defekten Fläche kam dadurch als
   "trocken und intakt" heraus. Ein PASS aus Nichtwissen ist in einer
   GMP-Prüfung schlimmer als gar kein Ergebnis.

   Lösung ohne jede neue Schwelle:
   Alle hier verwendeten Werte — 0.020, 0.04, 0.06, 0.18 — stammen
   unverändert aus analysisCore.js. Geändert hat sich nur, WAS passiert,
   wenn ein Tor blockiert:

     Primärwert über Schwelle, Kantentor blockiert …
       … und anomBlockFrac >= 0.18   → PASS mit Erklärung
         (viele verteilte Helligkeitsabweichungen sind der bereits
          vorhandene positive Beleg für Geometrie oder Beleuchtung)
       … sonst                        → NOT_ASSESSABLE
         (es gibt ein Signal, aber nichts, was es erklärt oder bestätigt)

   Feuchtigkeit ist an die Verlässlichkeit derselben Kantenevidenz
   gekoppelt: Ein "trocken", das sich auf Mikrokanten stützt, ist nur dort
   gültig, wo diese Kantenevidenz überhaupt trägt. Ist sie für dieselbe
   Aufnahme bereits als unzureichend erkannt, wird Feuchtigkeit
   NOT_ASSESSABLE statt "trocken".

   Determinismus: reine Funktion der Merkmale. Kein Math.random, kein
   Zeitbezug, keine Reihenfolgeabhängigkeit.                              */

import { befundErlaeuterung, befundText } from "./verdictWording.js";
import { feuchteSequenzStatus } from "./capturePaths.js";

export const STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_ASSESSABLE: "NOT_ASSESSABLE",
});

export const STATUS_LABEL = Object.freeze({
  PASS: { de: "Bestanden", en: "Pass" },
  FAIL: { de: "Nicht bestanden", en: "Fail" },
  NOT_ASSESSABLE: { de: "Nicht bewertbar", en: "Not assessable" },
});

/* Die fünf Prüfpunkte. "required" heisst: ohne bewertbares Ergebnis gibt es
   kein Gesamt-PASS. Alle fünf sind erforderlich — ein Waschgutträger gilt
   nicht als geprüft, solange einer der Punkte offen ist. */
export const CHECKPOINTS = Object.freeze([
  { id: "moisture", required: true, de: "Feuchtigkeit / Trockenheit", en: "Moisture / dryness" },
  { id: "residue", required: true, de: "Rückstände / Sauberkeit", en: "Residue / cleanliness" },
  { id: "scratch", required: true, de: "Kratzer und Riefen", en: "Scratches and scoring" },
  { id: "corrosion", required: true, de: "Korrosion / dunkle Flecken", en: "Corrosion / dark spots" },
  { id: "surface", required: true, de: "Oberflächenstruktur", en: "Surface structure" },
]);

/* Handlungsanweisungen für nicht bewertbare Punkte. */
const NEXT_ACTION = Object.freeze({
  RETAKE: { de: "Aufnahme wiederholen", en: "Repeat capture" },
  LIGHT: { de: "Beleuchtung verändern", en: "Change lighting" },
  CLOSER: { de: "Näher fotografieren", en: "Photograph closer" },
  MANUAL: { de: "Manuelle Sichtprüfung durchführen", en: "Perform manual visual inspection" },
});

const EDGE_GATE = 0.06;       // wie in analysisCore.js
const TEXTURE_LIMIT = 0.020;  // wie in analysisCore.js
const DARK_LIMIT = 0.04;      // wie in analysisCore.js
const GEOMETRY_EVIDENCE = 0.18; // wie in analysisCore.js (anomBlockFrac)

const num = v => (Number.isFinite(v) ? v : 0);

function punkt(id, status, { code, de, en, reason, actions = [], measurements = {} }) {
  const meta = CHECKPOINTS.find(c => c.id === id);
  return {
    id, status, code,
    required: !!meta?.required,
    label: { de: meta?.de ?? id, en: meta?.en ?? id },
    message: { de, en },
    reason: reason ?? null,
    actions,
    measurements,
  };
}

/* Gemeinsame Auswertung der beiden kantengetorten Befunde. */
function kantenGetort({ id, wert, schwelle, feature, edgeFrac, anomBlockFrac, failCode, failDe, failEn, passDe, passEn }) {
  const messwerte = {
    [feature]: num(wert), schwelle,
    edgeFrac: num(edgeFrac), edgeGate: EDGE_GATE,
    anomBlockFrac: num(anomBlockFrac), geometrieBeleg: GEOMETRY_EVIDENCE,
  };

  if (!(wert > schwelle)) {
    return punkt(id, STATUS.PASS, {
      code: "PASS", de: passDe, en: passEn,
      reason: `${feature} ${num(wert).toFixed(4)} unter der Schwelle ${schwelle}`,
      measurements: messwerte,
    });
  }
  if (edgeFrac > EDGE_GATE) {
    return punkt(id, STATUS.FAIL, {
      code: failCode, de: failDe, en: failEn,
      reason: `${feature} ${num(wert).toFixed(4)} über ${schwelle} bei ${(num(edgeFrac) * 100).toFixed(1)} % Mikrokanten`,
      measurements: messwerte,
    });
  }
  if (anomBlockFrac >= GEOMETRY_EVIDENCE) {
    return punkt(id, STATUS.PASS, {
      code: "PASS_GEOMETRY_EXPLAINED", de: passDe, en: passEn,
      reason: `${feature} ${num(wert).toFixed(4)} über ${schwelle}, aber nur ${(num(edgeFrac) * 100).toFixed(1)} % Mikrokanten; `
        + `${(num(anomBlockFrac) * 100).toFixed(0)} % verteilte Helligkeitsabweichungen belegen Geometrie oder Beleuchtung`,
      measurements: messwerte,
    });
  }
  return punkt(id, STATUS.NOT_ASSESSABLE, {
    code: "NOT_ASSESSABLE_NO_EDGE_SUPPORT",
    de: "Nicht bewertbar – Signal ohne Kantenstützung",
    en: "Not assessable - signal without edge support",
    reason: `${feature} ${num(wert).toFixed(4)} über ${schwelle}, aber nur ${(num(edgeFrac) * 100).toFixed(1)} % Mikrokanten `
      + `und kein Geometriebeleg (anomBlockFrac ${num(anomBlockFrac).toFixed(3)} < ${GEOMETRY_EVIDENCE}). `
      + "Weder bestätigt noch widerlegt.",
    actions: [NEXT_ACTION.RETAKE, NEXT_ACTION.CLOSER, NEXT_ACTION.LIGHT, NEXT_ACTION.MANUAL],
    measurements: messwerte,
  });
}

/**
 * Bildet aus Merkmalen und Urteilen die fünf Prüfpunkte.
 * @param {object} features Rückgabe von computeFeatures
 * @param {object} verdicts Rückgabe von buildVerdicts
 */
/* Der vereinbarte Wortlaut, woertlich vom Auftraggeber vorgegeben.
   Eine Konstante, damit er nicht beim naechsten Umformulieren verrutscht;
   A29 prueft ihn Zeichen fuer Zeichen. */
export const FEUCHTE_OHNE_SEQUENZ_DE =
  "Kein algorithmischer Feuchtehinweis erkannt. "
  + "Trockenheit mit dieser Aufnahme nicht zuverl\u00e4ssig beurteilbar.";
export const FEUCHTE_OHNE_SEQUENZ_EN =
  "No algorithmic moisture indication detected. "
  + "Dryness cannot be reliably assessed from this capture.";

/**
 * @param {object} features
 * @param {object} verdicts
 * @param {object|null} kontext  { feuchteSequenz }
 *
 * captureProfile steht bewusst NICHT mehr darin. Bis rc.4.25 hing die
 * Feuchtewarnung am Verkleinerungsfaktor; der Auftraggeber hat das
 * ausdruecklich ausgeschlossen ("darf nicht allein von scaleFactor
 * abhaengen und bei voller Aufloesung verschwinden"), und die Messung
 * hatte die Begruendung ohnehin widerlegt.
 */
export function buildCheckpoints(features, verdicts, kontext = null) {
  const f = features || {};
  const v = verdicts || {};

  const surface = kantenGetort({
    id: "surface", wert: num(f.tvFlat), schwelle: TEXTURE_LIMIT, feature: "tvFlat",
    edgeFrac: f.edgeFrac, anomBlockFrac: f.anomBlockFrac,
    failCode: "GLOBAL_TEXTURE_FAIL",
    failDe: "Unregelmässige Oberfläche erkannt", failEn: "Irregular surface detected",
    passDe: "Oberflächenstruktur unauffällig", passEn: "Surface structure inconspicuous",
  });

  const corrosion = kantenGetort({
    id: "corrosion", wert: num(f.vdfr), schwelle: DARK_LIMIT, feature: "vdfr",
    edgeFrac: f.edgeFrac, anomBlockFrac: f.anomBlockFrac,
    failCode: "CORROSION_SUSPECT",
    /* RC4 · Ehrlichkeitskorrektur (Planung Abschnitt 4). Die RC3-Logik nutzt
       Dunkelpixel- und Kantensignale; das ist kein validierter
       Korrosionsnachweis. Der Text sagt jetzt, was gemessen wurde.
       Der Schwellenwert dahinter ist unveraendert. */
    failDe: "Dunkle Auffälligkeit / algorithmischer Korrosionsverdacht",
    failEn: "Dark anomaly / algorithmic suspicion of corrosion",
    /* Und ebenso wichtig: die Abwesenheit dunkler Pixel ist KEIN Nachweis
       der Abwesenheit von Korrosion. RC3 behauptete hier "Keine dunklen
       Flecken" und damit mehr, als der Algorithmus tragen kann. */
    passDe: "Keine dunkle Auffälligkeit erkannt – kein Nachweis der Abwesenheit von Korrosion",
    passEn: "No dark anomaly detected - not evidence of the absence of corrosion",
  });

  /* RC4 · Kratzer (Planung Abschnitt 2). Der automatische Befund sagt
     ausdruecklich NICHT, ob der Kratzer neu ist — aus einem Einzelbild
     folgt die Herkunft nicht. Es gibt deshalb genau EINEN automatischen
     Status und keine Klassifikation NEW / EXISTING / GROWN.

     Der Rohcode des Analyse-Kerns (result.intact.code === "SCRATCH_SUSPECT")
     bleibt unveraendert; er ist die Kopplung zur Known-Issue-Logik. Geaendert
     ist nur, was der Pruefpunkt AUSSAGT. */
  const scratchCount = Array.isArray(f.scratches) ? f.scratches.length : 0;
  const scratch = scratchCount > 0
    ? punkt("scratch", STATUS.FAIL, {
      code: "SCRATCH_DETECTED_ORIGIN_UNDETERMINED",
      de: "Kratzer erkannt – neu oder bestehend nicht bestimmbar",
      en: "Scratch detected - new or pre-existing not determinable",
      reason: `${scratchCount} längliche Struktur(en) erkannt; die Herkunft ist `
        + "aus einer Einzelaufnahme nicht bestimmbar",
      measurements: { scratches: scratchCount },
    })
    : punkt("scratch", STATUS.PASS, {
      code: "PASS",
      de: "Keine länglichen Strukturen erkannt",
      en: "No elongated structures detected",
      reason: "keine länglichen Strukturen erkannt",
      measurements: { scratches: 0 },
    });

  /* RC4 · Rückstände. Derselbe Grundsatz wie beim Kratzer-Prüfpunkt
     darüber: der Rohcode des Analyse-Kerns bleibt unverändert (er trägt
     die Kopplung zur Known-Issue-Logik und zum Datensatz), aber was der
     Prüfpunkt AUSSAGT, wird richtiggestellt.

     `analysisCore.js` meldet ORGANIC_RESIDUE mit dem Text "Organische
     Rückstände (braun/gelb)". Gemessen ist der Anteil warmer Pixel —
     daraus folgt keine Stoffklasse; warmes Licht auf sauberem Edelstahl
     erzeugt dieselbe Abweichung. Der Kern bleibt byte-identisch zu RC3,
     die Formulierung kommt aus `verdictWording.js`.

     Dieselbe Quelle nutzt `verdictDisplay` für die Ergebnisanzeige. Bis
     rc.4.21 standen hier zwei verschiedene Sätze für denselben Befund
     untereinander auf einem Bildschirm; A24 verhindert das jetzt. */
  const residueCode = v.clean?.code ?? "RESIDUE";
  const residue = v.clean?.pass
    ? punkt("residue", STATUS.PASS, {
      code: v.clean.code ?? "PASS", de: "Sauber", en: "Clean",
      reason: v.clean.detail ?? null,
      measurements: { wf: num(f.wf), warmBlocks: num(f.warmBlocks), cv: num(f.cv) },
    })
    : punkt("residue", STATUS.FAIL, {
      code: residueCode,
      de: befundText(residueCode, v.clean?.message ?? "Rückstände erkannt", "de"),
      en: befundText(residueCode, "Residue detected", "en"),
      reason: befundErlaeuterung(residueCode, v.clean?.detail ?? null, "de") || null,
      measurements: { wf: num(f.wf), warmBlocks: num(f.warmBlocks), cv: num(f.cv) },
    });

  /* Feuchtigkeit. Ein FAIL bleibt ein FAIL. Ein "trocken" ist dagegen nur
     tragfähig, wenn die Kantenevidenz dieser Aufnahme tragfähig ist —
     denn der einzige Weg, der Feuchtigkeit ohne Glanzpunkte erkennt
     (VISIBLE_MOISTURE_TEXTURE), stützt sich genau darauf. */
  /* ── Warum ein „trocken" nicht tragfähig ist ──────────────────────────

     rc.4.24 hing diese Wache am Verkleinerungsfaktor. Die Messung hat
     diese Begründung WIDERLEGT: beide nassen Realaufnahmen bleiben bis
     hinunter zu 120x160 korrekt als nass erkannt. Auflösung ist nicht der
     Mechanismus.

     Der wirkliche Befund, an zwei weiteren nassen Realaufnahmen gemessen:

       nasse Spüle 1        edgeFrac 0,0423   gradMean 0,0428
       nasse Spüle 2        edgeFrac 0,0361   gradMean 0,0424
       trockene Kontrolle   edgeFrac 0,0296   gradMean 0,0355

     Verstreute Tropfen auf viel glatter Fläche — der Normalfall nach dem
     Abwischen — sind mit den vorhandenen Merkmalen überhaupt nicht von
     trocken zu trennen. Der Abstand ist kleiner als die Streuung
     innerhalb der nassen Klasse. Keine Schwelle leistet das; die
     Schwelle abzusenken tauschte nur Falsch-PASS gegen Fehlalarm.

     Die Bedingung ist deshalb keine Zahl, sondern eine Tatsache über die
     Aufnahme: liegt eine standardisierte Feuchte-Sequenz vor (normal,
     Streiflicht links, Streiflicht rechts)? Unter Streiflicht glänzen
     Tropfen und werden zu hellen Punkten — dann trägt der erste, robuste
     Weg (bfr) ohne Textur-Akrobatik.

     Die Wache hängt damit NICHT mehr an scaleFactor und verschwindet
     nicht bei voller Auflösung (A27).

     Der Punkt wird NOT_ASSESSABLE, nicht FAIL: damit bleibt er über
     applyManualSubstitute manuell bestätigbar (A30), und die übrigen
     Prüfpunkte werden nicht blockiert (A31). */
  const feuchteSequenz = feuchteSequenzStatus(kontext?.feuchteSequenz);

  /* Der zweite Grund, unverändert aus RC3: ein anderer kantengetorter
     Punkt konnte bereits nicht bewertet werden.

     (1) Ein anderer kantengetorter Punkt konnte bereits nicht bewertet
         werden — dann ist die Kantenevidenz dieser Aufnahme erklärtermaßen
         unzureichend.

     (2) Das Bild wurde vor der Analyse VERKLEINERT. Das ist der Fall, den
         (1) nicht sieht: ein Prüfpunkt wird nur dann „nicht bewertbar",
         wenn sein Messwert ÜBER der Schwelle liegt und die Kantenstützung
         fehlt. Ein zu stark verkleinertes Bild drückt aber ALLE Werte
         unter ihre Schwellen — dann steht überall PASS und (1) schweigt.

         Gemessen an einem echten Prüflauf: eine sichtbar von Tropfen
         bedeckte Fläche kam als „trocken, bestanden" heraus. Das
         Aufnahmeprofil meldete 900x1600 auf 360x640, und im selben
         Protokoll stand tvFlat 0.0026 — das 7,7-fache unter der Schwelle.
         Eine nasse, gebürstete Edelstahlfläche ist nicht strukturlos;
         diese Zahl beschreibt nicht das Bauteil, sondern das, was von ihm
         übrig war.

         Der Zusammenhang ist zwingend: der einzige Weg, der Feuchtigkeit
         OHNE Glanzpunkte erkennt (VISIBLE_MOISTURE_TEXTURE), hängt
         vollständig an Mikrokanten — und genau die entfernt das
         Verkleinern.

     KEIN neuer Schwellenwert. „Wurde verkleinert, ja oder nein" ist eine
     Tatsache aus dem Aufnahmeprofil. Die Regel entfällt, sobald eine
     Mindestauflösung gemessen und festgelegt ist — bis dahin ist sie in
     RESOLUTION_CALIBRATION als offener Fall deklariert.

     Fehlt das Profil ganz, bleibt es beim bisherigen Verhalten: die vielen
     internen Aufrufe ohne Aufnahmekontext sollen sich nicht ändern. Dass
     der echte Aufnahmeweg es übergibt, sichert eine eigene Gegenprobe —
     eine Wache, die nicht verdrahtet ist, ist keine Wache. */
  const kantenevidenzUnzuverlaessig =
    surface.status === STATUS.NOT_ASSESSABLE || corrosion.status === STATUS.NOT_ASSESSABLE;

  const feuchteMesswerte = {
    bfr: num(f.bfr), gradMean: num(f.gradMean), edgeFrac: num(f.edgeFrac),
    droplets: !!f.droplets, specular: !!f.specular,
    gradGate: 0.055, edgeGate: 0.08,
  };

  let moisture;
  if (v.dry && v.dry.pass === false) {
    moisture = punkt("moisture", STATUS.FAIL, {
      code: v.dry.code ?? "MOISTURE", de: v.dry.message ?? "Feuchtigkeit erkannt",
      en: "Moisture detected", reason: v.dry.detail ?? null, measurements: feuchteMesswerte,
    });
  } else if (!feuchteSequenz.vollstaendig) {
    moisture = punkt("moisture", STATUS.NOT_ASSESSABLE, {
      code: "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE",
      de: FEUCHTE_OHNE_SEQUENZ_DE,
      en: FEUCHTE_OHNE_SEQUENZ_EN,
      reason: "Für eine belastbare Trockenheitsaussage fehlt die standardisierte "
        + "Aufnahmesequenz (normal, Streiflicht links, Streiflicht rechts). Fehlend: "
        + `${feuchteSequenz.fehlend.join(", ") || "—"}. `
        + "Verstreute Tropfen auf glatter Fläche sind ohne Streiflicht messtechnisch "
        + "nicht von einer trockenen Fläche zu unterscheiden.",
      actions: [NEXT_ACTION.LIGHT, NEXT_ACTION.RETAKE, NEXT_ACTION.MANUAL],
      measurements: { ...feuchteMesswerte,
        sequenzVorhanden: feuchteSequenz.vorhanden.join(",") || null,
        sequenzFehlend: feuchteSequenz.fehlend.join(",") || null },
    });
  } else if (kantenevidenzUnzuverlaessig) {
    moisture = punkt("moisture", STATUS.NOT_ASSESSABLE, {
      code: "NOT_ASSESSABLE_UNRELIABLE_EDGE_EVIDENCE",
      de: "Nicht bewertbar – Trockenheit nicht belastbar belegt",
      en: "Not assessable - dryness not reliably supported",
      reason: "Feuchtigkeit ohne Glanzpunkte wird über Mikrokanten erkannt. Für diese Aufnahme "
        + "wurde die Kantenevidenz bereits als unzureichend eingestuft, daher ist ein "
        + "„trocken“ hier nicht belegt.",
      actions: [NEXT_ACTION.RETAKE, NEXT_ACTION.CLOSER, NEXT_ACTION.LIGHT, NEXT_ACTION.MANUAL],
      measurements: feuchteMesswerte,
    });
  } else {
    moisture = punkt("moisture", STATUS.PASS, {
      code: v.dry?.code ?? "PASS", de: "Keine sichtbare Feuchtigkeit", en: "No visible moisture",
      reason: v.dry?.detail ?? null, measurements: feuchteMesswerte,
    });
  }

  return [moisture, residue, scratch, corrosion, surface];
}

/* ── Manuelle Ersatzprüfung ────────────────────────────────────────────── */

/**
 * Ersetzt genau einen nicht bewertbaren Prüfpunkt durch eine dokumentierte
 * manuelle Sichtprüfung. Ein FAIL kann so NICHT überschrieben werden.
 */
export function applyManualSubstitute(checkpoints, substitute) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  if (!substitute || !substitute.checkpointId) return { checkpoints: list, error: "kein Prüfpunkt angegeben" };
  const { checkpointId, status, reason, method, user, timestamp } = substitute;
  if (status !== STATUS.PASS && status !== STATUS.FAIL) {
    return { checkpoints: list, error: "manuelles Ergebnis muss PASS oder FAIL sein" };
  }
  for (const feld of ["reason", "method", "user", "timestamp"]) {
    if (!substitute[feld] || String(substitute[feld]).trim().length === 0) {
      return { checkpoints: list, error: `Pflichtangabe fehlt: ${feld}` };
    }
  }
  const ziel = list.find(c => c.id === checkpointId);
  if (!ziel) return { checkpoints: list, error: "unbekannter Prüfpunkt" };
  if (ziel.status !== STATUS.NOT_ASSESSABLE) {
    return { checkpoints: list, error: "nur nicht bewertbare Prüfpunkte dürfen manuell ersetzt werden" };
  }
  return {
    checkpoints: list.map(c => c.id !== checkpointId ? c : {
      ...c, status,
      code: "MANUAL_SUBSTITUTE",
      message: {
        de: status === STATUS.PASS ? "Manuell geprüft – in Ordnung" : "Manuell geprüft – nicht in Ordnung",
        en: status === STATUS.PASS ? "Manually inspected - acceptable" : "Manually inspected - not acceptable",
      },
      reason: String(reason).trim(),
      manual: {
        method: String(method).trim(), user: String(user).trim(),
        timestamp: String(timestamp), reason: String(reason).trim(),
        replacedStatus: STATUS.NOT_ASSESSABLE, replacedCode: c.code,
      },
      actions: [],
    }),
    error: null,
  };
}

/* ── Gesamtergebnis ────────────────────────────────────────────────────── */

export const OVERALL = Object.freeze({
  PASS: "PASS",
  BLOCKED: "BLOCKED",
  NOT_ASSESSABLE: "NOT_ASSESSABLE",
});

/**
 * Regeln (aus der Anforderung, in dieser Reihenfolge):
 *  1 bestätigtes FAIL            → gesperrt
 *  2 kein FAIL, aber ein erforderlicher Punkt NOT_ASSESSABLE → kein PASS
 *  3 PASS nur, wenn alle erforderlichen Punkte bewertbar und bestanden
 *  4 eine schlechte Aufnahme wird nie automatisch zu PASS
 */
export function overallResult(checkpoints) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  const failed = list.filter(c => c.status === STATUS.FAIL);
  const open = list.filter(c => c.status === STATUS.NOT_ASSESSABLE && c.required);
  const openOptional = list.filter(c => c.status === STATUS.NOT_ASSESSABLE && !c.required);

  if (failed.length) {
    return {
      status: OVERALL.BLOCKED, blocked: true,
      failed: failed.map(c => c.id), notAssessable: open.map(c => c.id),
      message: {
        de: `Gesperrt – ${failed.length} Prüfpunkt(e) nicht bestanden`,
        en: `Blocked - ${failed.length} checkpoint(s) failed`,
      },
      reason: failed.map(c => `${c.label.de}: ${c.message.de}`),
    };
  }
  if (open.length) {
    return {
      status: OVERALL.NOT_ASSESSABLE, blocked: true,
      failed: [], notAssessable: open.map(c => c.id),
      message: {
        de: `Kein Gesamtergebnis – ${open.length} erforderliche(r) Prüfpunkt(e) nicht bewertbar`,
        en: `No overall result - ${open.length} required checkpoint(s) not assessable`,
      },
      reason: open.map(c => `${c.label.de}: ${c.reason ?? c.message.de}`),
    };
  }
  return {
    status: OVERALL.PASS, blocked: false,
    failed: [], notAssessable: openOptional.map(c => c.id),
    message: { de: "Alle Prüfpunkte bewertbar und bestanden", en: "All checkpoints assessable and passed" },
    reason: [],
  };
}

/** Kurzfassung für Anzeige, Export und PDF. */
export function assessmentSummary(checkpoints) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  return {
    overall: overallResult(list),
    counts: {
      pass: list.filter(c => c.status === STATUS.PASS).length,
      fail: list.filter(c => c.status === STATUS.FAIL).length,
      notAssessable: list.filter(c => c.status === STATUS.NOT_ASSESSABLE).length,
    },
    checkpoints: list.map(c => ({
      id: c.id, label: c.label, status: c.status, code: c.code,
      message: c.message, reason: c.reason, actions: c.actions,
      measurements: c.measurements, manual: c.manual ?? null,
    })),
  };
}

/* ─── Mehrere Fotos und Known Issues ───────────────────────────────────────
   Zwei kleine Helfer, die die Prüfpunkte an die bereits vorhandenen Regeln
   der Anwendung anschliessen. Beide fassen keine Schwelle an.             */

const RANG = { [STATUS.PASS]: 0, [STATUS.NOT_ASSESSABLE]: 1, [STATUS.FAIL]: 2 };

/**
 * Worst-Result-Wins je Prüfpunkt über mehrere Fotos — dieselbe Regel, die
 * VisuClean schon für Trocken/Sauber/Intakt anwendet, nur feiner aufgelöst.
 * FAIL schlägt NICHT BEWERTBAR, und NICHT BEWERTBAR schlägt BESTANDEN.
 * Ein bestandener Punkt darf einen offenen Punkt niemals überdecken.
 *
 * @param {Array<Array>} listen  je Foto eine Prüfpunktliste
 * @returns {Array} eine Prüfpunktliste, leer wenn keine Eingabe vorlag
 */
/* ── Welches Kriterium haengt an welchen Pruefpunkten ──────────────────────
   BEFUND der Gegenpruefung an rc.4.44 und im Geraete-PDF sichtbar: der
   Pruefpunkt meldete NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE, und daneben
   stand gruen "T PASS" und "Trocken". Die Anzeige fuehrte den ROHBEFUND
   des Kerns und das MASSGEBLICHE Pruefpunkturteil als gleichwertige
   Ergebnisse — eine falsche Entwarnung, auch wenn eine andere Stelle die
   Freigabe sperrt. Der Pruefer liest gruen.

   Ab jetzt haben alle operativen Statusanzeigen EINE Quelle: die
   Pruefpunkte. Der Rohbefund bleibt sichtbar, aber als Rohbefund
   gekennzeichnet und nie als gruener Status.                             */
export const KRITERIUM_PRUEFPUNKTE = Object.freeze({
  dry: Object.freeze(["moisture"]),
  clean: Object.freeze(["residue"]),
  /* Drei Pruefpunkte, ein Kriterium. Worst-Result-Wins (Regel 3): ein FAIL
     darunter darf nicht von zwei PASS ueberdeckt werden. */
  intact: Object.freeze(["scratch", "corrosion", "surface"]),
});

/**
 * Der MASSGEBLICHE Status eines Kriteriums, abgeleitet aus den
 * Pruefpunkten. Worst-Result-Wins ueber die zugehoerigen Punkte.
 *
 * Liefert `null`, wenn keine Pruefpunktliste vorliegt — dann wird NICHTS
 * behauptet. Datensaetze aus Staenden ohne Pruefpunkte behalten damit ihre
 * historische Aussage; sie still umzuschreiben waere schlimmer als die
 * Widerspruechlichkeit, die hier behoben wird.
 */
export function kriteriumStatus(checkpoints, kriterium) {
  const ids = KRITERIUM_PRUEFPUNKTE[kriterium];
  if (!ids) return null;
  const liste = Array.isArray(checkpoints) ? checkpoints : [];
  const passend = liste.filter(punkt => ids.includes(punkt?.id));
  if (!passend.length) return null;
  return passend.reduce((schlimmster, punkt) =>
    (RANG[punkt.status] ?? 0) > (RANG[schlimmster.status] ?? 0) ? punkt : schlimmster).status;
}

/* ── Woran ein Altbestand erkannt wird ────────────────────────────────────
   BEFUND des Auftraggebers an rc.4.45: "Eine fehlende Pruefpunktliste
   beweist keinen Altbestand. Auch ein fehlerhafter neuer Datensatz koennte
   ohne diese Liste ankommen."

   Zutreffend. Die fehlende Liste ist das SYMPTOM, das beide Faelle teilen —
   und ausgerechnet der gefaehrliche der beiden (neuer Datensatz mit Luecke)
   bekaeme dann den gruenen Rohbefund als massgebliches Urteil.

   Der nachvollziehbare Unterschied steht im Datensatz selbst: seit RC4
   traegt jeder geschriebene Datensatz `schemaVersion` (inspectionRecord.js
   setzt `schema: 2, schemaVersion: 3`), und die Speichergrenze in
   persistence.js WEIST einen Write ohne dieses Feld ZURUECK. Ein
   gespeicherter Datensatz ohne `schemaVersion` kann daher nicht von RC4
   stammen — das ist eine pruefbare Tatsache ueber das Datenformat, keine
   Vermutung ueber den Inhalt.

   Ab dieser Datensatzversion gehoert die Pruefpunktliste zum Vertrag. Die
   Zahl ist bewusst NICHT RECORD_SCHEMA_VERSION aus persistence.js: jene
   sagt, was heute geschrieben wird, diese sagt, ab wann Pruefpunkte
   verbindlich sind. Steigt die erste spaeter auf 4, bleibt die zweite bei
   3. F8 haelt die Beziehung der beiden fest. */
export const PRUEFPUNKTE_AB_SCHEMAVERSION = 3;

/**
 * Stammt dieser Datensatz nachweislich aus einem Stand VOR den
 * Pruefpunkten? Nur dann darf der Rohbefund die massgebliche Aussage sein.
 *
 * Verlangt zwei positive Belege, nicht das Fehlen von etwas:
 *   1. es ist ueberhaupt ein gespeicherter Datensatz (`schema` vorhanden);
 *   2. sein Datensatzvertrag liegt vor PRUEFPUNKTE_AB_SCHEMAVERSION —
 *      entweder ausdruecklich kleiner, oder das Feld fehlt, was seit RC4
 *      nicht mehr schreibbar ist.
 *
 * Alles andere — ein neuer Datensatz, ein Bruchstueck, `null`, ein Objekt
 * unklarer Herkunft — ist KEIN Altbestand. Im Zweifel gilt: nichts
 * behaupten, "?" anzeigen.
 */
export function istAltdatensatz(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (!Object.prototype.hasOwnProperty.call(record, "schema")) return false;
  const version = record.schemaVersion;
  if (version === undefined || version === null) return true;
  if (!Number.isFinite(version)) return false;
  return version < PRUEFPUNKTE_AB_SCHEMAVERSION;
}

/**
 * Derselbe Status als Kurzzeichen fuer Fotokacheln und Protokollzeilen.
 * "?" heisst ausdruecklich nicht bewertbar — nicht "vermutlich in Ordnung".
 *
 * @param {Array|null} checkpoints  Pruefpunkte des Fotos bzw. der Pruefung
 * @param {string} kriterium        dry | clean | intact
 * @param {boolean|null} rohbefundPass  der historische Rohbefund
 * @param {boolean} altbestand      Ergebnis von istAltdatensatz(record).
 *   Default `false`: wer die Herkunft nicht kennt, bekommt keinen
 *   Rueckfall auf den Rohbefund. Der Live-Bildschirm laesst ihn weg — dort
 *   ist der Datensatz per Definition neu.
 */
export function kriteriumKurz(checkpoints, kriterium, rohbefundPass = null, altbestand = false) {
  const status = kriteriumStatus(checkpoints, kriterium);
  if (status !== null) {
    if (status === STATUS.PASS) return "PASS";
    if (status === STATUS.FAIL) return "FAIL";
    return "?";
  }
  /* Kein Status ableitbar — der Rohbefund darf nur unter ZWEI Bedingungen
     zugleich einspringen:

     (1) der Datensatz ist am Datenformat als Altbestand erkannt
         (istAltdatensatz) — dort WAR der Rohbefund die massgebliche
         Aussage, und sie still umzuschreiben waere schlimmer als die
         Widerspruechlichkeit, die hier behoben wird;
     (2) es gibt ueberhaupt keine Pruefpunktliste. Traegt der Datensatz
         eine Liste, in der genau dieses Kriterium fehlt, ist das eine
         LUECKE und kein historischer Stand — auch dann nicht, wenn das
         Format alt ist.

     Jede andere Lage — neuer Datensatz ohne Liste, unbekannte Herkunft —
     bleibt "?". Der Rohbefund als Rueckfall hiesse hier, die Luecke von
     rc.4.44 fuer genau diesen Fall offen zu lassen: ein gruenes "T PASS"
     ohne massgeblichen Pruefpunkt. */
  if (!altbestand) return "?";
  const liste = Array.isArray(checkpoints) ? checkpoints : null;
  if (liste !== null && liste.length > 0) return "?";
  if (rohbefundPass === null) return "?";
  return rohbefundPass ? "PASS" : "FAIL";
}

export function aggregateCheckpoints(listen) {
  const vorhanden = (Array.isArray(listen) ? listen : []).filter(l => Array.isArray(l) && l.length);
  if (!vorhanden.length) return [];
  return CHECKPOINTS.map(meta => {
    const kandidaten = vorhanden
      .map(liste => liste.find(c => c.id === meta.id))
      .filter(Boolean);
    if (!kandidaten.length) return null;
    return kandidaten.reduce((a, b) => (RANG[b.status] ?? 0) > (RANG[a.status] ?? 0) ? b : a);
  }).filter(Boolean);
}

/**
 * Übernimmt eine bestätigte Known-Issue-Toleranz in den Prüfpunkt "scratch".
 * Nur der Status "unveraendert" aus applyKnownIssues() toleriert etwas —
 * jede andere Rückmeldung (verschlechtert, nicht_tolerierbar,
 * nicht_lokalisierbar) lässt den Prüfpunkt unangetastet. Ein neuer oder
 * gewachsener Kratzer wird hier also nie stillschweigend entschärft.
 */
/* Die Kennung, die eine QA-tolerierte Auffaelligkeit im Pruefpunkt
   hinterlaesst. Exportiert, damit die Speichergrenze in persistence.js
   dieselbe Konstante prueft und nicht ein zweites Stringliteral. */
export const KNOWN_ISSUE_TOLERATED = "KNOWN_ISSUE_TOLERATED";

export function applyToleratedScratch(checkpoints, info) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  if (!info || info.status !== "unveraendert") return list;
  return list.map(c => c.id !== "scratch" || c.status !== STATUS.FAIL ? c : {
    ...c,
    status: STATUS.PASS,
    code: KNOWN_ISSUE_TOLERATED,
    message: {
      de: "Bekannte kosmetische Auffälligkeit (QA-toleriert)",
      en: "Known cosmetic finding (QA tolerated)",
    },
    reason: `${info.matchedZones ?? 0} bekannte Kratzerzone(n), unverändert`,
    originalStatus: STATUS.FAIL,
    originalCode: c.code,
  });
}
