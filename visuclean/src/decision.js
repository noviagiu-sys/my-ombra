/* ─── VisuClean RC4 · Entscheidungskette ───────────────────────────────────
   Umsetzung von PLANUNG_RC4_V2.2.md, Abschnitte 1 bis 4.

   Dieser Baustein steht zwischen dem Analyse-Kern und der Persistenz. Er
   fasst alles, was RC4 an der RC3-Aussage KORRIGIERT, ohne den Kern
   anzufassen: src/analysisCore.js bleibt byte-identisch zu RC3.

   Die Korrekturen sind ausnahmslos Ehrlichkeitskorrekturen:
   - ein ungeeignetes Bild liefert kein Qualitaetsurteil, weder PASS noch FAIL;
   - ein Kratzerbefund sagt nicht, ob der Kratzer neu ist, weil das aus einem
     Einzelbild nicht folgt;
   - "keine Korrosion" wird nicht behauptet, weil Abwesenheit nicht gemessen
     wurde;
   - ein Messwertunterschied ist kein Beweis fuer eine Nachreinigung.

   Determinismus: reine Funktionen ueber uebergebene Werte.                 */

import { STATUS } from "./assessment.js";
import { DEPTH_DECISION, evaluateDepthMeasurement } from "./depthLimit.js";

/* ── 1 · Aufnahmevorbereitung ──────────────────────────────────────────── */

export const READINESS = Object.freeze({
  CONFIRMED_PREPARED: "CONFIRMED_PREPARED",
  PRECONDITION_NOT_MET: "PRECONDITION_NOT_MET",
  UNCONFIRMED: "UNCONFIRMED",
});

/** Die vier Handlungsarten. Nur zwei davon sind eine Qualitaetsabweichung. */
export const PREPARATION_ACTION = Object.freeze({
  WIPED_AND_DRIED: "WIPED_AND_DRIED",
  RECAPTURED: "RECAPTURED",
  RECLEANED: "RECLEANED",
  RESIDUE_REMOVED: "RESIDUE_REMOVED",
});

/** Handlungen, die dauerhaft einen QA-Trigger setzen. */
export const DEVIATION_ACTIONS = Object.freeze([
  PREPARATION_ACTION.RECLEANED,
  PREPARATION_ACTION.RESIDUE_REMOVED,
]);

/**
 * Ein Retake-Datensatz. Pflichtfelder nach Planung Abschnitt 1.
 * Fehlt eines, ist der Datensatz ungueltig — die Persistenz weist ihn ab.
 */
export function validateRetakeRecord(retake) {
  const fehlend = [];
  const pflicht = ["photoIdBefore", "photoIdAfter", "eqId", "zoneId",
    "action", "username", "role", "at", "reason"];
  for (const feld of pflicht) {
    if (!retake || !String(retake[feld] ?? "").trim()) fehlend.push(feld);
  }
  if (retake && !Object.values(PREPARATION_ACTION).includes(retake.action)) {
    return { valid: false, error: `Unbekannte Handlungsart: ${retake?.action}`, missing: fehlend };
  }
  if (fehlend.length) {
    return { valid: false, error: `Pflichtangaben fehlen: ${fehlend.join(", ")}`, missing: fehlend };
  }
  return { valid: true, error: null, missing: [] };
}

/**
 * Loest diese Handlung eine Qualitaetsabweichung aus?
 * Ausschliesslich die bewusst bestaetigte Nachreinigung oder Entfernung
 * sichtbaren Rueckstands. Abwischen und Neuaufnahme sind keine Abweichung.
 */
export function isDeviationAction(action) {
  return DEVIATION_ACTIONS.includes(action);
}

/**
 * Vergleicht die Messwerte vor und nach einer Handlung.
 *
 * Der Kern der V2.2-Korrektur: ein Unterschied ist ein HINWEIS, kein Beweis.
 * Diese Funktion darf niemals eine Handlung umklassifizieren und niemals
 * selbst einen Qualitaetsbefund behaupten. Sie liefert Text, sonst nichts.
 */
export function consistencyHint({ action, before, after }) {
  if (!isFinite(Number(before)) || !isFinite(Number(after))) return null;
  if (isDeviationAction(action)) return null;
  const differenz = Math.abs(Number(after) - Number(before));
  if (!(differenz > 0)) return null;
  return Object.freeze({
    code: "CONSISTENCY_HINT",
    action,
    delta: differenz,
    de: "Die Messwerte vor und nach der Handlung unterscheiden sich. Das ist ein "
      + "Hinweis auf die Aufnahmesituation, kein Nachweis einer Nachreinigung. "
      + "Eine Umklassifizierung erfolgt nicht automatisch.",
    en: "Measured values differ before and after the action. This is a hint about "
      + "the capture situation, not evidence of re-cleaning. No automatic "
      + "reclassification takes place.",
    /* Ausdruecklich: dieser Hinweis erzeugt keinen Trigger. */
    triggersQa: false,
  });
}

/**
 * Ein ungeeignetes Bild besitzt kein gueltiges Kernergebnis.
 * Gibt die Pruefpunktliste zurueck, in der jeder Pflichtpunkt auf
 * NOT_ASSESSABLE steht — weder PASS noch FAIL.
 */
export function voidCoreResults(checkpoints, code, begruendung) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  return list.map(item => !item?.required ? item : {
    ...item,
    status: STATUS.NOT_ASSESSABLE,
    code,
    message: {
      de: "Nicht bewertbar – Aufnahme fuer eine Qualitaetsbewertung ungeeignet",
      en: "Not assessable - capture unsuitable for quality assessment",
    },
    reason: begruendung,
    ineligibleForQualityAssessment: true,
  });
}

/* ── 2 · Aufnahmeprofil und Aufloesung ─────────────────────────────────── */

export const CAPTURE_PATH = Object.freeze({
  CAMERA: "CAMERA",
  IMPORT: "IMPORT",
  DOWNSCALED: "DOWNSCALED",
  UNKNOWN: "UNKNOWN",
});

export const PROFILE_STATUS = Object.freeze({
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED: "NOT_ASSESSABLE_UNSUPPORTED_CAPTURE_PROFILE",
  NOT_MEASURED: "NOT_MEASURED",
});

/* Die Aufloesungsabhaengigkeit ist ein OFFENER KALIBRIERUNGSFALL.
   Gemessen (Planung Abschnitt 3): dasselbe trockene Kontrollbild kippt
   allein durch Verkleinerung, und der Verlauf ist nicht monoton.

   Deshalb steht hier KEINE Mindestaufloesung. Eine geratene Zahl waere
   genau der Fehler, den Gate 0 auf der Preview-Linie schon einmal
   produziert hat. Solange die Messung fehlt, ist das Profil NOT_MEASURED —
   und ein nicht gemessenes Profil erzeugt weder PASS noch FAIL.            */
export const RESOLUTION_CALIBRATION = Object.freeze({
  status: "OPEN_CALIBRATION_CASE",
  minimumWidth: null,
  minimumHeight: null,
  measuredAt: null,
  de: "Die Abhaengigkeit des Ergebnisses von der Bildaufloesung ist gemessen, "
    + "aber nicht geloest. Eine Mindestaufloesung wird erst nach einem "
    + "dokumentierten Messnachweis festgelegt.",
  en: "The dependency of the result on image resolution is measured but not "
    + "resolved. A minimum resolution will be defined only after documented "
    + "measurement.",
  evidence: Object.freeze([
    "480x640 Rueckstand PASS · Kratzer PASS · Korrosion PASS",
    "360x480 Rueckstand PASS · Kratzer FAIL · Korrosion PASS",
    "240x320 Rueckstand FAIL · Kratzer FAIL · Korrosion nicht bewertbar",
    "120x160 Rueckstand PASS · Kratzer FAIL · Korrosion nicht bewertbar",
    "Verlauf nicht monoton; Mechanismus: Kratzertor edgeFrac < 0.06 && tvFlat < 0.035",
  ]),
});

/**
 * Beschreibt das Aufnahmeprofil eines Bildes. Pflicht in JEDEM Rohbefund.
 * Traegt keine Bewertung, nur die Herkunft und die Masse.
 */
export function captureProfile({ width, height, path = CAPTURE_PATH.UNKNOWN,
  processedWidth, processedHeight, sourceWidth, sourceHeight,
  fusionGroupId = null, sequenceIndex = null, brightness = null,
  labelShape = null, residualPx = null, registered = null } = {}) {
  const zahl = value => (Number.isFinite(Number(value)) ? Number(value) : null);
  /* Fusion metadata is optional and additive. No viewAngleDeg — a degree
     figure would be an invented measurement; labelShape is the honest cue. */
  const pw = zahl(processedWidth ?? width);
  const sw = zahl(sourceWidth ?? width);
  /* Der Verkleinerungsfaktor ist der Wert, den die Kalibrierungskampagne
     braucht: die App rechnet Handyfotos herunter, und die Belege in
     RESOLUTION_CALIBRATION sind NICHT monoton — die Aufloesung aendert
     also nachweislich Urteile. Ohne ihn im Datensatz laesst sich das
     spaeter nicht auswerten. Er ist eine Herkunftsangabe, KEINE
     Genauigkeitsbehauptung. */
  return Object.freeze({
    scaleFactor: (pw !== null && sw !== null && sw > 0) ? pw / sw : null,
    processedWidth: pw,
    processedHeight: zahl(processedHeight ?? height),
    sourceWidth: sw,
    sourceHeight: zahl(sourceHeight ?? height),
    path: Object.values(CAPTURE_PATH).includes(path) ? path : CAPTURE_PATH.UNKNOWN,
    fusionGroupId: fusionGroupId == null ? null : String(fusionGroupId),
    sequenceIndex: zahl(sequenceIndex),
    brightness: zahl(brightness),
    labelShape: labelShape && typeof labelShape === "object"
      ? Object.freeze({ ...labelShape }) : null,
    residualPx: zahl(residualPx),
    registered: typeof registered === "boolean" ? registered : null,
  });
}

/** Ein Rohbefund ohne vollstaendiges Aufnahmeprofil ist unvollstaendig. */
export function hasCaptureProfile(profile) {
  return Boolean(profile
    && Number.isFinite(profile.processedWidth) && profile.processedWidth > 0
    && Number.isFinite(profile.processedHeight) && profile.processedHeight > 0
    && Object.values(CAPTURE_PATH).includes(profile.path));
}

/**
 * Bewertet das Aufnahmeprofil.
 *
 * Solange RESOLUTION_CALIBRATION keine gemessene Mindestaufloesung traegt,
 * liefert diese Funktion NOT_MEASURED — nicht SUPPORTED.
 *
 * WAS DAS IN DER TESTPHASE HEISST (Entscheidung des Auftraggebers,
 * …mehrwinkel.3): NOT_MEASURED wird ERFASST und ANGEZEIGT, es SPERRT
 * NICHT. Bis …mehrwinkel.2 stand hier, ein nicht gemessenes Profil duerfe
 * kein PASS und kein FAIL erzeugen — die Funktion hatte im gesamten
 * Anwendungspfad aber gar keine Aufrufstelle. Das Tor war beschrieben und
 * nicht vorhanden; die Gegenpruefung hat das zu Recht beanstandet.
 *
 * Jetzt gilt: der Status steht im Datensatz (siehe buildInspectionRecord)
 * und auf dem Bildschirm, zusammen mit Quell-, Analyseaufloesung und
 * Verkleinerungsfaktor. Er ist eine HERKUNFTSANGABE, keine
 * Genauigkeitsbehauptung. Ob bestimmte Profile spaeter sperren, wird vor
 * einer produktiven Freigabe getrennt entschieden — nicht hier.
 */
export function evaluateCaptureProfile(profile) {
  if (!hasCaptureProfile(profile)) {
    return Object.freeze({
      status: PROFILE_STATUS.UNSUPPORTED,
      reason: "Aufnahmeprofil fehlt oder ist unvollstaendig",
      calibration: RESOLUTION_CALIBRATION,
    });
  }
  if (RESOLUTION_CALIBRATION.minimumWidth === null) {
    return Object.freeze({
      status: PROFILE_STATUS.NOT_MEASURED,
      reason: "Es gibt keine gemessene Mindestaufloesung. Das Profil wird "
        + "dokumentiert, aber nicht als freigegeben ausgewiesen.",
      calibration: RESOLUTION_CALIBRATION,
    });
  }
  /* Erreichbar erst, wenn die Messung vorliegt. Bewusst so gebaut, dass das
     Setzen der Messwerte die einzige noetige Aenderung ist. */
  const gross = profile.processedWidth >= RESOLUTION_CALIBRATION.minimumWidth
    && profile.processedHeight >= RESOLUTION_CALIBRATION.minimumHeight;
  return Object.freeze({
    status: gross ? PROFILE_STATUS.SUPPORTED : PROFILE_STATUS.UNSUPPORTED,
    reason: gross ? null : "Aufnahmeprofil unterhalb der gemessenen Mindestaufloesung",
    calibration: RESOLUTION_CALIBRATION,
  });
}

/* ── 3 · Kratzer ───────────────────────────────────────────────────────── */

/* Der EINZIGE automatische Kratzerstatus. Es gibt bewusst kein NEW, kein
   EXISTING und kein GROWN als automatische Klassifikation — aus einem
   Einzelbild folgt die Herkunft nicht. */
export const SCRATCH_STATUS = Object.freeze({
  DETECTED_ORIGIN_UNDETERMINED: "SCRATCH_DETECTED_ORIGIN_UNDETERMINED",
});

/* Eine Quelle fuer den Tiefenzustand: src/depthLimit.js. Vorher stand hier
   ein eigenes DEPTH_STATUS mit genau einem Wert und daneben ein
   DEPTH_CLASS mit SURFACE_ONLY_SUSPECTED und DEPTH_SUSPECTED. Beide
   wurden NIE vergeben — `grep` fand ausser der Definition nur
   NOT_MEASURED. Sie sind mit rc.4.32 entfernt, und zwar nicht als
   Aufraeumarbeit: "DEPTH_SUSPECTED" war der fertige Platz fuer genau die
   Behauptung, die aus einem Bildkontrast nie folgen darf. Ein unbenutzter
   Bezeichner mit dieser Bedeutung ist eine offene Tuer.

   Aus Kontrast folgt jetzt ausschliesslich
   OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED — eine Empfehlung
   nachzumessen, kein Verdacht auf eine Tiefe. */
export { DEPTH_DECISION, DEPTH_LIMIT_UM, DEPTH_MEASUREMENT_SOURCE, OPTICAL_HINT }
  from "./depthLimit.js";

export const SCRATCH_MESSAGE = Object.freeze({
  de: "Kratzer erkannt – neu oder bestehend nicht bestimmbar",
  en: "Scratch detected - new or pre-existing not determinable",
});

/**
 * Baut aus den erkannten Zusammenhangskomponenten einzelne Kratzerbefunde.
 * Jeder Bereich bleibt ein EIGENER Befund; es wird nichts zusammengefasst
 * und nichts verglichen. Die Reihenfolge der Eingabe darf das Ergebnis
 * nicht veraendern, deshalb wird deterministisch sortiert.
 */
export function buildScratchFindings({ scratches = [], photoId, zoneId, profile } = {}) {
  const liste = Array.isArray(scratches) ? scratches : [];
  return liste
    .filter(item => item && Number.isFinite(item.minX) && Number.isFinite(item.minY))
    .map(item => ({
      status: SCRATCH_STATUS.DETECTED_ORIGIN_UNDETERMINED,
      photoId: photoId ?? null,
      zoneId: zoneId ?? null,
      boundingBox: {
        minX: item.minX, minY: item.minY, maxX: item.maxX, maxY: item.maxY,
      },
      extent2d: {
        width: Math.max(1, item.maxX - item.minX + 1),
        height: Math.max(1, item.maxY - item.minY + 1),
      },
      /* Der Regelfall: aus einer Aufnahme folgt keine Tiefe. Eine
         unabhaengige Messung wird spaeter in `depthMeasurement`
         eingetragen; erst dann aendert sich `depthStatus`, und zwar
         berechnet statt behauptet (siehe rejectsNumericDepth). */
      depthStatus: DEPTH_DECISION.NOT_MEASURED,
      depthMeasurement: null,
      depthValue: null,
      captureProfile: profile ?? null,
      message: SCRATCH_MESSAGE,
    }))
    /* Deterministische Ordnung: gleiche Zonen in vertauschter Reihenfolge
       muessen dasselbe Ergebnis liefern (T-29, T-30). */
    .sort((a, b) => a.boundingBox.minY - b.boundingBox.minY
      || a.boundingBox.minX - b.boundingBox.minX
      || a.boundingBox.maxY - b.boundingBox.maxY
      || a.boundingBox.maxX - b.boundingBox.maxX);
}

/**
 * Ist dieser numerische Tiefenwert unzulaessig?
 *
 * Bis rc.4.31 lautete die Regel: JEDE Zahl ist unzulaessig. Das war
 * richtig, solange es keine belegte Bezugsgroesse gab — eine Tiefenangabe
 * haette damals nur erfunden sein koennen.
 *
 * Mit der Vorgabegrenze von 1,0 um gibt es jetzt einen zulaessigen
 * Weg, und genau EINEN: eine unabhaengige Messung mit benanntem Messmittel
 * und angegebener Unsicherheit. Die Regel wird dadurch nicht weicher,
 * sondern praeziser — sie verlangt zusaetzlich, dass die gespeicherte Zahl
 * DIESELBE ist wie die gemessene. Ein `depthValue`, das neben der Messung
 * steht statt aus ihr zu stammen, waere wieder eine Behauptung.
 */
export function rejectsNumericDepth(finding) {
  const wert = finding?.depthValue;
  if (wert === null || wert === undefined) return false;
  const bewertet = evaluateDepthMeasurement(finding?.depthMeasurement);
  if (bewertet.decision === DEPTH_DECISION.NOT_MEASURED
    || bewertet.decision === DEPTH_DECISION.MEASUREMENT_INCOMPLETE) return true;
  return bewertet.valueUm !== wert;
}

/**
 * Der gespeicherte Tiefenzustand wird NACHGERECHNET, nicht geglaubt.
 * Ein Datensatz, der WITHIN_LIMIT behauptet, ohne dass die beigelegte
 * Messung das ergibt, ist kein gueltiger Datensatz.
 */
export function depthStatusMatchesMeasurement(finding) {
  return finding?.depthStatus
    === evaluateDepthMeasurement(finding?.depthMeasurement).decision;
}

/* ── 4 · Korrosion ─────────────────────────────────────────────────────── */

export const CORROSION_STATUS = Object.freeze({
  DARK_ANOMALY_SUSPECTED: "DARK_ANOMALY_ALGORITHMIC_SUSPICION",
  NOT_ASSESSED: "CORROSION_NOT_ASSESSED",
  CONFIRMED: "CORROSION_CONFIRMED",
});

export const CORROSION_MESSAGE = Object.freeze({
  suspicion: {
    de: "Dunkle Auffaelligkeit / algorithmischer Korrosionsverdacht",
    en: "Dark anomaly / algorithmic suspicion of corrosion",
  },
  /* Bewusst KEINE Aussage "keine Korrosion". Der Algorithmus misst
     Dunkelpixel; die Abwesenheit von Dunkelpixeln ist kein Nachweis der
     Abwesenheit von Korrosion. */
  notAssessed: {
    de: "Keine dunkle Auffaelligkeit erkannt – das ist kein Nachweis der "
      + "Abwesenheit von Korrosion",
    en: "No dark anomaly detected - this is not evidence of the absence of "
      + "corrosion",
  },
  confirmed: {
    de: "Korrosion durch dokumentierte manuelle Sichtpruefung bestaetigt",
    en: "Corrosion confirmed by documented manual visual inspection",
  },
});

/* ── 5 · Manuelle Feststellungen ───────────────────────────────────────── */

/* Schluessel und Wert tragen beide das Praefix MANUAL_. Das ist Absicht:
   ein Schluessel ohne dieses Praefix liesse sich als automatische
   Klassifikation lesen, und genau die ist verboten (X-07). Die Herkunft
   einer Feststellung steht hier im Namen. */
export const MANUAL_FINDING = Object.freeze({
  MANUAL_SCRATCH_NEW: "MANUAL_SCRATCH_NEW",
  MANUAL_SCRATCH_GROWN: "MANUAL_SCRATCH_GROWN",
  MANUAL_SCRATCH_UNCHANGED: "MANUAL_SCRATCH_UNCHANGED",
  MANUAL_CORROSION_CONFIRMED: "MANUAL_CORROSION_CONFIRMED",
  MANUAL_CORROSION_NOT_PRESENT: "MANUAL_CORROSION_NOT_PRESENT",
  /* BEFUND des Geraetelaufs mit rc.4.43: eine kompakte Ausbruchstelle war
     am Bildschirm deutlich zu sehen, stand aber im Nachlauf auf Rang 22
     von 493 und damit unter dem gespeicherten Schnitt. Der Pruefer hatte
     keinen Weg, sie in den Datensatz zu bringen.

     Die vorhandenen Arten taugen dafuer nicht: NEW und GROWN behaupten
     eine VERAENDERUNG und verlangen deshalb einen Referenzbezug,
     CORROSION_CONFIRMED behauptet eine Stoffklasse. Ein Verdacht
     behauptet nichts davon. Er sagt: hier ist etwas, das angesehen werden
     muss — ohne Detektortreffer, ohne Klassifikation, ohne Tiefe. */
  MANUAL_DAMAGE_SUSPECTED: "MANUAL_DAMAGE_SUSPECTED",
});

/** Manuelle Feststellungen, die dauerhaft den QA-Trigger setzen. */
export const QA_TRIGGERING_FINDINGS = Object.freeze([
  MANUAL_FINDING.MANUAL_SCRATCH_NEW,
  MANUAL_FINDING.MANUAL_SCRATCH_GROWN,
  MANUAL_FINDING.MANUAL_CORROSION_CONFIRMED,
  MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED,
]);

/** Ergebnisse, mit denen ein Schadensverdacht geklaert werden kann. */
export const VERDACHT_KLAERUNG = Object.freeze({
  SCHADEN_BESTAETIGT: "SCHADEN_BESTAETIGT",
  KEIN_SCHADEN: "KEIN_SCHADEN",
  WEITERE_PRUEFUNG_NOETIG: "WEITERE_PRUEFUNG_NOETIG",
});

/**
 * Schadensverdachte, die noch NICHT dokumentiert beurteilt sind.
 *
 * "Dokumentiert beurteilt" heisst: Zeitpunkt, Person, Rolle, ein Ergebnis
 * aus VERDACHT_KLAERUNG und eine Begruendung. Fehlt eines davon, ist der
 * Punkt offen. Ein leeres Klaerungsobjekt waere sonst eine Schaltflaeche,
 * die den Verdacht wegmacht, ohne ihn zu beantworten (S7).
 *
 * BEFUND der Gegenpruefung an rc.4.44, zutreffend: hier stand, dass
 * WEITERE_PRUEFUNG_NOETIG den Punkt MIT schliesst — "eine dokumentierte
 * Entscheidung, nur keine abschliessende". Das war mein Fehler. Eine
 * Entscheidung, die WEITERE PRUEFUNG verlangt, ist kein Abschluss; sie
 * sagt das Gegenteil. Gemessen liess sich damit fuer alle drei Ergebnisse
 * ein PASS_AFTER_REMEDIATION speichern, ohne dass fuer die ersten beiden
 * irgendeine Behebung dokumentiert war.
 *
 * OFFEN heisst ab jetzt: unbeurteilt ODER "weitere Pruefung noetig".
 * Beides sperrt PASS und Override.
 */
export function offeneSchadensverdachte(manualFindings = []) {
  const liste = Array.isArray(manualFindings) ? manualFindings : [];
  return liste.filter(finding => {
    if (finding?.kind !== MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED) return false;
    const k = finding.klaerung;
    if (!k || typeof k !== "object") return true;
    if (!Object.values(VERDACHT_KLAERUNG).includes(k.ergebnis)) return true;
    if (["at", "username", "role", "begruendung"]
      .some(feld => !String(k[feld] ?? "").trim())) return true;
    return k.ergebnis === VERDACHT_KLAERUNG.WEITERE_PRUEFUNG_NOETIG;
  });
}

/**
 * Verdachte, die als SCHADEN BESTAETIGT beurteilt wurden.
 *
 * Sie sind nicht "offen" — es hat jemand hingesehen und entschieden. Aber
 * sie sind auch nicht erledigt: ein bestaetigter Schaden ist ein negativer
 * Befund. Ein PASS allein aus der Bestaetigung waere die Umkehrung ihrer
 * Aussage.
 *
 * Der Override bleibt unberuehrt — nicht weil ein bestaetigter Schaden
 * harmlos waere, sondern weil der Override seine EIGENEN Bedingungen hat
 * (bestaetigtes FAIL, QA-Rolle, Begruendung, Reauthentifizierung). Hier
 * wird keine neue Freigabeerlaubnis erfunden; es wird nur der Weg
 * versperrt, der gar keine Abweichungsentscheidung verlangt.
 */
export function bestaetigteSchaeden(manualFindings = []) {
  const liste = Array.isArray(manualFindings) ? manualFindings : [];
  return liste.filter(finding =>
    finding?.kind === MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED
    && finding.klaerung?.ergebnis === VERDACHT_KLAERUNG.SCHADEN_BESTAETIGT
    && !offeneSchadensverdachte([finding]).length);
}

/**
 * Prueft eine manuelle Feststellung auf Vollstaendigkeit.
 * Ohne Benutzer, Rolle, Zeit, Begruendung, Foto- und Referenzbezug ist sie
 * kein dokumentierter Befund, sondern eine Behauptung.
 */
export function validateManualFinding(finding) {
  if (!finding || !Object.values(MANUAL_FINDING).includes(finding.kind)) {
    return { valid: false, error: `Unbekannte manuelle Feststellung: ${finding?.kind}` };
  }
  const pflicht = ["username", "role", "at", "reason", "photoId"];
  /* Ein Referenzbezug ist nur dort Pflicht, wo ueberhaupt verglichen wird:
     "neu" und "vergroessert" behaupten eine Veraenderung gegenueber etwas.
     Eine Korrosionsbestaetigung braucht keine Referenz — ein
     Schadensverdacht ebenfalls nicht: er behauptet keine Veraenderung,
     sondern benennt eine Stelle. Waere die Referenz auch hier Pflicht,
     waere der Weg genau dann versperrt, wenn es ihn am noetigsten gibt:
     bei der ersten Aufnahme eines Teils. */
  if (finding.kind === MANUAL_FINDING.MANUAL_SCRATCH_NEW
    || finding.kind === MANUAL_FINDING.MANUAL_SCRATCH_GROWN) {
    pflicht.push("referenceId");
  }
  const fehlend = pflicht.filter(feld => !String(finding[feld] ?? "").trim());
  if (fehlend.length) {
    return { valid: false, error: `Pflichtangaben fehlen: ${fehlend.join(", ")}` };
  }
  /* Eine Tiefe darf der Pruefer eintragen — aber nur als vollstaendige
     unabhaengige Messung. Ohne Messmittel, ohne Unsicherheit oder aus dem
     Detektor waere es wieder eine Zahl ohne Deckung. */
  if (rejectsNumericDepth(finding)) {
    return {
      valid: false,
      error: "Tiefenangabe ohne vollstaendige unabhaengige Messung "
        + "(Messwert, Messmittel, Messunsicherheit) ist nicht zulaessig",
    };
  }
  /* Ein Schadensverdacht ist ausdruecklich der Weg OHNE Messung. Er darf
     deshalb ueberhaupt kein Tiefenfeld tragen — auch keines, das der
     Vertrag sonst nicht kennt. Eine gemessene Tiefe gehoert in
     record.depthMeasurements, ueber markerId gebunden, mit ihren sechs
     Pflichtangaben. Ohne diese Sperre waere der Verdacht die bequeme
     Hintertuer fuer genau die Zahl, die Regel 10 verbietet. */
  if (finding.kind === MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED) {
    const tiefenfeld = Object.keys(finding)
      .find(name => /tiefe|depth/i.test(name) && finding[name] !== null
        && finding[name] !== undefined);
    if (tiefenfeld) {
      return {
        valid: false,
        error: `Ein Schadensverdacht traegt keine Tiefenangabe (${tiefenfeld}); `
          + "eine gemessene Tiefe gehoert als eigene Messung an den Marker",
      };
    }
  }
  return { valid: true, error: null };
}

/** Setzt diese Feststellung dauerhaft den QA-Trigger? */
export function triggersQa(finding) {
  return QA_TRIGGERING_FINDINGS.includes(finding?.kind);
}

/* ── 6 · Known Issues in RC4 ───────────────────────────────────────────── */

/* Ohne belastbare Ausrichtung und Vergleichseignung wirkt keine Toleranz
   automatisch. In RC4 darf ein Known Issue hoechstens MANUELL durch einen
   QA Manager zugeordnet werden — und jede Endfreigabe bleibt erneut
   QA-pflichtig. Es gibt keine wiederverwendbare Vorabfreigabe. */
export const KNOWN_ISSUE_ASSIGNMENT = Object.freeze({
  MANUAL_QA_ONLY: "KNOWN_ISSUE_MANUAL_QA_ONLY",
  ACTIVE: "KNOWN_ISSUE_ACTIVE",
  /* Automatisch erkannt, aber noch nicht von einem QA Manager zugeordnet. */
  UNCONFIRMED: "KNOWN_ISSUE_UNCONFIRMED",
});

/**
 * Eine Known-Issue-Zuordnung ist nur gueltig, wenn ein QA Manager sie
 * ausdruecklich vorgenommen hat. Eine automatische Positionsuebereinstimmung
 * genuegt nicht.
 */
export function validateKnownIssueAssignment(assignment) {
  if (!assignment) return { valid: false, error: "Keine Zuordnung angegeben" };
  if (assignment.assignedAutomatically === true) {
    return { valid: false, error: "Automatische Known-Issue-Zuordnung ist nicht zulaessig" };
  }
  if (assignment.role !== "QA Manager") {
    return { valid: false, error: "Known Issues darf nur ein QA Manager zuordnen" };
  }
  const fehlend = ["issueId", "username", "at", "reason"]
    .filter(feld => !String(assignment[feld] ?? "").trim());
  if (fehlend.length) {
    return { valid: false, error: `Pflichtangaben fehlen: ${fehlend.join(", ")}` };
  }
  return { valid: true, error: null };
}

/* ── 7 · Qualitaetsabweichung ──────────────────────────────────────────── */

/**
 * Sammelt alle Gruende, aus denen dieser Datensatz dauerhaft QA-pflichtig
 * ist. "Dauerhaft" heisst: ein spaeteres PASS aller Pruefpunkte hebt den
 * Trigger nicht auf.
 */
export function collectQaTriggers({ retakes = [], manualFindings = [],
  knownIssueAssignments = [], unconfirmedTolerations = [] } = {}) {
  const gruende = [];
  for (const retake of retakes) {
    if (isDeviationAction(retake?.action)) {
      gruende.push({ code: retake.action, source: "PREPARATION_ACTION", at: retake.at });
    }
  }
  for (const finding of manualFindings) {
    if (triggersQa(finding)) {
      gruende.push({ code: finding.kind, source: "MANUAL_FINDING", at: finding.at });
    }
  }
  for (const assignment of knownIssueAssignments) {
    gruende.push({
      code: KNOWN_ISSUE_ASSIGNMENT.ACTIVE, source: "KNOWN_ISSUE",
      at: assignment?.at, issueId: assignment?.issueId,
    });
  }
  /* Eine automatisch tolerierte Auffaelligkeit, die noch KEIN QA Manager
     zugeordnet hat. Sie ist ein Grund fuer die QA — nicht ein Grund, den
     Vorgang steckenbleiben zu lassen. */
  for (const punkt of unconfirmedTolerations) {
    gruende.push({
      code: KNOWN_ISSUE_ASSIGNMENT.UNCONFIRMED, source: "KNOWN_ISSUE",
      at: null, checkpointId: punkt?.id ?? null,
    });
  }
  return gruende;
}

/** Traegt dieser Datensatz eine Qualitaetsabweichung? */
export function hasDeviation(triggers) {
  return Array.isArray(triggers) && triggers.length > 0;
}
