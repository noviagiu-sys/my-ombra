/* ─── VisuClean RC4.2 · Bau des Inspektionsdatensatzes ─────────────────────
   Warum dieses Modul existiert:

   In RC4.1 baute `finalize` in App.jsx den Datensatz inline — mitten in einer
   React-Komponente, unerreichbar fuer jeden Test. Gleichzeitig verschaerfte
   persistence.js den Vertrag auf Schema 3. Beide Haelften drifteten
   auseinander, und weil der einzige Test, der saveInspection aufruft, sein
   Objekt VON HAND baute, blieb alles gruen. Aufgefallen ist es erst in der
   manuellen Browserpruefung: "schemaVersion fehlt" beim Speichern.

   Die Lehre steckt in der Dateistruktur: der Erzeuger des Datensatzes ist
   jetzt eine reine Funktion. Damit kann ein Test den ECHTEN Erzeuger in die
   ECHTE Persistenz treiben, statt eine Fixture gegen den Vertrag zu halten.
   Eine Fixture kann nur bestaetigen, dass der Vertrag in sich stimmt — nie,
   dass die Anwendung ihn erfuellt.

   Reine Funktion: kein DOM, kein React, keine Zeitquelle ausser der
   uebergebenen.                                                            */

import { FINAL_RESULT, LIFECYCLE_STATE } from "./lifecycle.js";
import { collectQaTriggers, evaluateCaptureProfile, VERDACHT_KLAERUNG } from "./decision.js";
import { crosscheckState } from "./aiContract.js";
import { sequenzFuerDatensatz } from "./aufnahmeSequenz.js";

/** Der Zustand, der aus Systementscheidung und Abweichung folgt. */
export function deriveState({ finalDecision, hasDeviation, awaitingQa = false }) {
  /* Der Pruefer schliesst ab, ohne dass eine QA anwesend ist: der Datensatz
     wird erfasst, aber nicht freigegeben. Ohne diesen Weg liesse sich eine
     Pruefung mit Abweichung gar nicht speichern — und genau daraus entsteht
     in der Praxis der Druck, Konten zu teilen. */
  if (awaitingQa) return LIFECYCLE_STATE.PENDING_QA;
  if (finalDecision === "FAIL") return LIFECYCLE_STATE.FINAL_FAIL;
  if (finalDecision === "OVERRIDE") return LIFECYCLE_STATE.RELEASED_WITH_DEVIATION;
  /* Ein PASS nach einer dokumentierten Abweichung ist niemals ein
     FINAL_PASS — es ist PASS_AFTER_REMEDIATION und verlangt einen
     QA Manager, der nicht der Pruefer ist. */
  return hasDeviation ? LIFECYCLE_STATE.PASS_AFTER_REMEDIATION : LIFECYCLE_STATE.FINAL_PASS;
}

/** Der Ausgangszustand, aus dem der Uebergang erfolgt. */
export function derivePreviousState({ awaitingQa = false, fromPending = false } = {}) {
  /* Der wartende Datensatz KOMMT aus DRAFT — er geht erst nach PENDING_QA.
     Ohne diese Unterscheidung waere der Uebergang PENDING_QA → PENDING_QA,
     den die Zustandstabelle zu Recht ablehnt. */
  if (awaitingQa) return LIFECYCLE_STATE.DRAFT;

  /* PENDING_QA nur, wenn der Datensatz TATSAECHLICH aus einem gespeicherten
     wartenden Vorgang abgeleitet ist (supersedesId).

     Bis rc.4.11 stand hier `hasDeviation ? PENDING_QA : DRAFT`. Das war
     schon vorher ungenau, wurde aber erst mit der Regel "aus PENDING_QA
     fuehrt nur die QA heraus" schaedlich: ein Operator, der eine
     dokumentierte Abweichung als FAIL abschliessen wollte, wurde mit
     QA_ROLE_REQUIRED abgewiesen — obwohl sein Vorgang nie wartend war.
     Gefunden im ersten echten Bedienlauf am 11.09.2026.

     Fachlich ist die Trennung eindeutig: ein FAIL ist keine Freigabe.
     "Nachgereinigt und immer noch nicht sauber" darf ein Pruefer allein
     feststellen; `needsQaApproval` deckt nur PASS_AFTER_REMEDIATION und
     RELEASED_WITH_DEVIATION ab. */
  return fromPending ? LIFECYCLE_STATE.PENDING_QA : LIFECYCLE_STATE.DRAFT;
}

/** Braucht dieser Abschluss eine getrennte QA-Genehmigung? */
export function needsQaApproval(state) {
  return state === LIFECYCLE_STATE.PASS_AFTER_REMEDIATION
    || state === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION;
}

/**
 * Baut den Inspektionsdatensatz nach dem RC4-Vertrag (Schema 3).
 * Der Hash wird bewusst NICHT hier gesetzt: er gehoert an das Ende der
 * Kette, nachdem alle Felder stehen.
 */
/**
 * Felder, die eine nachgereichte FREIGABE veraendern darf.
 *
 * Bis rc.4.8 stand in persistence.js eine von Hand gepflegte Liste der zu
 * VERGLEICHENDEN Felder. Sie war unvollstaendig — `aiCrosscheck` und
 * `scratchFindings` fehlten, ein offener KI-Widerspruch und ein
 * dokumentierter Kratzerbefund konnten zwischen Pruefung und Freigabe
 * verschwinden. Befund der Gegenpruefung an rc.4.8, zutreffend.
 *
 * Eine solche Liste driftet zwangslaeufig: jedes neue Feld ist
 * ungeschuetzt, bis jemand daran denkt. Die Bindung ist deshalb UMGEDREHT.
 * Hier stehen nur die Felder, die sich aendern DUERFEN; alles andere muss
 * identisch sein. Ein spaeter hinzugefuegtes Feld ist damit automatisch
 * geschuetzt — die sichere Richtung.
 */
export const APPROVAL_MUTABLE_FIELDS = Object.freeze([
  "id", "appVersion", "createdAt", "signedAt", "user",
  "state", "previousState", "finalDecision",
  "approvedBy", "approvalRevisionHash", "supersedesId",
  "signature", "recordHash", "revisionHash",
  /* Die Begruendung der QA gehoert zur FREIGABE, nicht zur Pruefung. Der
     Kommentar des Pruefers bleibt dadurch unantastbar. */
  "approvalComment",
  /* Ebenso die Override-Begruendung: seit rc.4.10 gibt es keinen
     Sofortpfad mehr, ein Override ist also IMMER die Entscheidung des
     Genehmigers auf einen wartenden Vorgang. Der wartende Datensatz traegt
     keine. Ohne dieses Feld hier waere ein zulaessiger Override an der
     Inhaltsbindung gescheitert. */
  "overrideReason",
  /* Und die Kennzeichnung des Beurteilungsschritts. Eine Entscheidung, die
     auf einer Beurteilung aufsetzt, uebernahm sie bis rc.4.45 mit — und
     wies sich damit selbst als Beurteilung aus, obwohl sie entscheidet.
     Sie darf das Feld deshalb loeschen; den INHALT der Beurteilung
     (manualFindings.klaerung) schuetzt die Projektion weiterhin. */
  "clarification",
]);

/**
 * Kanonische Freigabeprojektion: der Datensatz OHNE die Felder, die eine
 * Freigabe veraendern darf. Zwei Projektionen muessen gleich sein, damit
 * eine Freigabe als Ableitung derselben Pruefung gilt.
 */
export function approvalProjection(record) {
  if (!record || typeof record !== "object") return null;
  const projektion = {};
  for (const schluessel of Object.keys(record).sort()) {
    if (APPROVAL_MUTABLE_FIELDS.includes(schluessel)) continue;
    projektion[schluessel] = record[schluessel];
  }
  return projektion;
}

/**
 * Felder, die eine BEURTEILUNG zusaetzlich veraendern darf.
 *
 * Zwei mehr als die Freigabe, und beide muessen es sein: `manualFindings`,
 * weil genau dort die Antwort entsteht, und `clarification`, die
 * Kennzeichnung des Vorgangs selbst.
 *
 * Die Aufweichung ist eng gefuehrt: `manualFindings` faellt hier zwar aus
 * dem Vergleich, wird aber von einer EIGENEN, strengeren Regel geprueft
 * (pruefeKlaerungsDelta in persistence.js). Ohne diese zweite Regel waere
 * die Beurteilung ein Freibrief, die Meldungen umzuschreiben. Q11 bis Q13
 * halten beide Haelften zusammen.
 */
export const CLARIFICATION_MUTABLE_FIELDS = Object.freeze([
  ...APPROVAL_MUTABLE_FIELDS, "manualFindings", "clarification",
]);

/** Dieselbe Projektion fuer den Beurteilungsschritt. */
export function clarificationProjection(record) {
  if (!record || typeof record !== "object") return null;
  const projektion = {};
  for (const schluessel of Object.keys(record).sort()) {
    if (CLARIFICATION_MUTABLE_FIELDS.includes(schluessel)) continue;
    projektion[schluessel] = record[schluessel];
  }
  return projektion;
}

/** Ist dieser Schreibvorgang eine Beurteilung und keine Freigabe? */
export function istKlaerungsschritt(record) {
  return Boolean(record?.clarification)
    && record.state === LIFECYCLE_STATE.PENDING_QA
    && !record.approvedBy
    && record.finalDecision === null;
}

/**
 * Baut die nachgereichte Freigaberevision aus dem GESPEICHERTEN wartenden
 * Datensatz.
 *
 * Bewusst hier und nicht in der Oberflaeche: die Gegenpruefung an rc.4.8
 * hat zu Recht beanstandet, dass U14/U15 nur das Vorhandensein eines
 * Knopfes belegen. Steht der Erzeuger hier, kann ein Test genau das fahren,
 * was die Oberflaeche aufruft — statt einen Nachbau zu pruefen.
 *
 * Die Freigabe ist eine ABLEITUNG: alle inhaltlichen Felder werden
 * unveraendert uebernommen, nur die Freigabefelder gesetzt
 * (siehe APPROVAL_MUTABLE_FIELDS). Der wartende Datensatz bleibt
 * unangetastet (Regel 6).
 *
 * @param {object} pending    der gespeicherte PENDING_QA-Datensatz
 * @param {object} approver   {username, role}
 * @param {object} signature  elektronische Signatur des Genehmigers
 * @param {string} now        EINE Zeitquelle, durchgereicht
 * @param {string} decision   "PASS" | "FAIL" | "OVERRIDE"
 * @param {string} newId      Kennung der neuen Revision
 */
export function buildApprovalRecord({ pending, approver, signature, now, decision = "PASS",
  newId: neueId, appVersion, approvalComment = "", overrideReason = "" }) {
  if (!pending || pending.state !== LIFECYCLE_STATE.PENDING_QA) return null;
  const hasDeviation = (pending.qaTriggers || []).length > 0;
  const state = deriveState({ finalDecision: decision, hasDeviation });
  const freigabe = {
    ...pending,
    id: neueId,
    appVersion: appVersion || pending.appVersion,
    createdAt: now, signedAt: now,
    user: { username: approver.username, role: approver.role,
      displayName: approver.displayName || approver.username },
    state,
    previousState: LIFECYCLE_STATE.PENDING_QA,
    finalDecision: FINAL_RESULT[state],
    approvedBy: { username: approver.username, role: approver.role, at: now },
    approvalRevisionHash: pending.recordHash,
    supersedesId: pending.id,
    signature: { ...signature, signedAt: now, signedBy: approver.username,
      meaning: SIGNATURE_MEANING[state] },
    approvalComment: String(approvalComment || "").trim(),
    overrideReason: String(overrideReason || "").trim() || pending.overrideReason || null,
  };
  delete freigabe.recordHash;
  /* Die Entscheidung ist keine Beurteilung. Traegt der Vorgaenger die
     Kennzeichnung, wird sie hier ausdruecklich geloescht — nicht
     weggelassen: ein fehlendes Feld waere im Protokoll nicht von einem
     vergessenen zu unterscheiden. */
  if ("clarification" in freigabe) freigabe.clarification = null;
  return freigabe;
}

/* Ein Kandidat fuer den Datensatz. Dieselbe Abbildung fuer die
   Vorauswahl UND fuer die vollstaendige Liste — zwei Fassungen derselben
   Abbildung liefen frueher oder spaeter auseinander, und dann stuenden im
   Protokoll zwei verschiedene Wahrheiten ueber denselben Kandidaten. */
function kandidatFuerDatensatz(k) {
  return {
          /* Stabile Kennung, unabhaengig von beiden Rangfolgen. Sie
             verbindet Tabellenzeile und Bildmarkierung und ueberlebt
             jeden Sortierwechsel. */
          kandidatId: typeof k?.kandidatId === "string" ? k.kandidatId : null,
          /* Der Platz in der GERICHTETEN Rangfolge — nicht die aktuelle
             Position in der Anzeige. Die Anzeige benennt beides getrennt. */
          rank: Number.isFinite(k?.rank) ? k.rank : null,
          boundingBox: k?.boundingBox
            ? {
              minX: k.boundingBox.minX ?? null, minY: k.boundingBox.minY ?? null,
              maxX: k.boundingBox.maxX ?? null, maxY: k.boundingBox.maxY ?? null,
            }
            : null,
          lengthRel: Number.isFinite(k?.lengthRel) ? k.lengthRel : null,
          widthRel: Number.isFinite(k?.widthRel) ? k.widthRel : null,
          orientationDeg: Number.isFinite(k?.orientationDeg) ? k.orientationDeg : null,
          grindDeltaDeg: Number.isFinite(k?.grindDeltaDeg) ? k.grindDeltaDeg : null,
          edgeStrength: Number.isFinite(k?.edgeStrength) ? k.edgeStrength : null,
          relevanceScore: Number.isFinite(k?.relevanceScore) ? k.relevanceScore : null,
          /* Dieselbe Bewertung OHNE den Richtungsfaktor. Die geschaetzte
             Vorzugsrichtung ist nicht kalibriert; sie darf die Rangfolge
             nicht allein bestimmen, ohne dass jemand nachrechnen kann,
             was sie verschoben hat. Beide Werte werden gespeichert. */
          relevanceScoreUngerichtet: Number.isFinite(k?.relevanceScoreUngerichtet)
            ? k.relevanceScoreUngerichtet : null,
          alignedWithGrind: k?.alignedWithGrind === true,
  };
}

export function buildInspectionRecord({
  id, appVersion, now,
  user, eqId, eqName, zoneId, zoneName,
  photos = [], aggregate, originalSystemDecision,
  finalDecision, performedBy, approvedBy = null, approvalRevisionHash = null,
  awaitingQa = false, supersedesId = null, fusionSummary = null, screening = null,
  feuchteSequenz = null,
  reauthenticated = false,
  comment = "", overrideReason = null, swabTest = null, referenceId = null,
  signature,
  retakes = [], manualFindings = [], knownIssueAssignments = [],
  depthMeasurements = [],
  aiAdapter = null,
} = {}) {
  /* Eine tolerierte Auffaelligkeit OHNE QA-Zuordnung ist selbst ein
     QA-Grund. Ohne diesen Trigger sass der Operator in einer Sackgasse:
     der Pruefpunkt stand auf PASS, es entstand kein Trigger, also gab es
     keinen Uebergabeknopf — und die Speichergrenze wies den Abschluss ab.
     Befund der Gegenpruefung an rc.4.10, zutreffend. */
  const unbestaetigteToleranzen = [
    ...(Array.isArray(aggregate?.checkpoints) ? aggregate.checkpoints : []),
    ...photos.flatMap(photo => photo?.result?.checkpoints || []),
  ].filter(punkt => punkt?.code === "KNOWN_ISSUE_TOLERATED"
    && !knownIssueAssignments.length);

  const qaTriggers = collectQaTriggers({
    retakes, manualFindings, knownIssueAssignments,
    unconfirmedTolerations: unbestaetigteToleranzen,
  });
  const hasDeviation = qaTriggers.length > 0;
  const state = deriveState({ finalDecision, hasDeviation, awaitingQa });
  const ki = crosscheckState(aiAdapter);

  return {
    /* Speicher- und Exportformat bleiben bei 2 — sie kennzeichnen das
       FORMAT, nicht den Datensatzvertrag. RC1/RC2-Daten blieben sonst
       unlesbar. */
    id, schema: 2, schemaVersion: 3,
    appVersion, createdAt: now, signedAt: now,
    user, eqId, eqName, zoneId, zoneName,
    photoCount: photos.length,
    /* Das Aufnahmeprofil wird BEWERTET und die Bewertung mitgeschrieben.
       Sie sperrt in der Testphase nichts — die Mindestaufloesung ist nicht
       gemessen, der Status lautet deshalb NOT_MEASURED. Er steht im
       Datensatz, damit die Kalibrierungskampagne ihn auswerten kann, und
       er ist ausdruecklich KEINE Genauigkeitsbehauptung.

       Die Bewertung entsteht hier im Erzeuger und nicht in der
       Oberflaeche: sonst haette sie jeder Aufrufer einzeln zu setzen, und
       genau so ist sie in RC4.1 beim schemaVersion-Feld verlorengegangen. */
    photos: photos.map(photo => (photo && photo.captureProfile
      ? { ...photo, captureProfileStatus: evaluateCaptureProfile(photo.captureProfile) }
      : photo)),
    aggregate,
    /* Die Pruefpunkte gehoeren auf die oberste Ebene: der Vertrag prueft
       sie dort, und im Protokoll sind sie dort zu finden. */
    checkpoints: Array.isArray(aggregate?.checkpoints) ? aggregate.checkpoints : [],
    originalSystemDecision,
    state,
    previousState: derivePreviousState({ awaitingQa, fromPending: Boolean(supersedesId) }),
    finalDecision: FINAL_RESULT[state] ?? null,
    performedBy,
    approvedBy,
    approvalRevisionHash,
    /* Auf welchen erfassten Datensatz sich eine nachgereichte Freigabe
       bezieht. Der Pruefdatensatz wird NICHT ueberschrieben (Regel 6);
       die Freigabe ist ein eigener Datensatz, der auf dessen recordHash
       zeigt. */
    supersedesId,
    revisionHash: null,
    reauthenticated,
    retakes, manualFindings, knownIssueAssignments, qaTriggers,
    /* Die Mehrwinkelauswertung gehoert in den Datensatz, nicht nur auf den
       Bildschirm: was der Pruefer gesehen hat, muss spaeter belegbar sein
       (ausgeschlossene Aufnahmen mit Grund, Winkelvielfalt, ob ueberhaupt
       ein Detektor eingehaengt war). Bilddaten stehen ausdruecklich NICHT
       darin — nur die Herkunft der Anzeige.

       null heisst: keine Mehrwinkelauswertung. Ausdruecklich null und nicht
       fehlend, damit "nicht durchgefuehrt" von "vergessen" unterscheidbar
       bleibt. */
    /* Kratzer-Screening: Kandidaten und der Bezug auf die Konfiguration,
       mit der sie entstanden sind.

       Bis rc.4.19 wurde das Screening berechnet und dann weggeworfen -
       weder Datensatz noch PDF trugen einen Kandidaten. Eine
       Aufmerksamkeitshilfe, die nicht im Protokoll steht, ist spaeter
       nicht nachvollziehbar. Befund der unabhaengigen Gegenpruefung.

       configHash bindet den Datensatz an genau die Einstellung, die
       gewirkt hat. Eine spaetere Aenderung der Konfiguration deutet damit
       keine gespeicherte Pruefung um - sie erzeugt einen anderen Hash.

       Gespeichert wird je Foto die SORTIERTE Spitze, dazu die vollen
       Zahlen. Alle Kandidaten zu speichern sprengt Datensatz und PDF
       (gemessen: 799 Zeilen fuer drei Aufnahmen); die Gesamtzahlen bleiben
       trotzdem sichtbar, damit nichts verschwiegen wird.

       KEINE Tiefen-, Harmlosigkeits- oder Entstehungsaussage. */
    /* Tiefenmessungen, je Eintrag an EINEN Kandidaten gebunden.
       Gespeichert werden ausschliesslich die Messangaben — das Urteil
       (WITHIN_DEPTH_LIMIT und so weiter) steht bewusst NICHT im Datensatz.
       Es wird beim Anzeigen aus diesen Feldern gerechnet.

       Grund: ein mitgespeichertes Urteil kann von den Feldern abweichen,
       aus denen es stammt, und dann steht in der Akte eine Bewertung, die
       ihre eigene Grundlage nicht mehr trifft. Dieselbe Regel wie beim
       depthStatus der Kratzerbefunde (siehe persistence.js).

       `valueUm` und `uncertaintyUm` bleiben SO STEHEN, wie sie eingegeben
       wurden — "0,85" bleibt "0,85". Die Zahl daraus liest depthLimit.js. */
    depthMeasurements: (Array.isArray(depthMeasurements) ? depthMeasurements : [])
      .map(m => ({
        photoId: m?.photoId ?? null,
        /* Zwei Bindungswege, genau einer davon gesetzt:
           kandidatId  der Detektor hat die Stelle angeboten
           markerId    der Pruefer hat sie selbst markiert, weil der
                       Detektor sie NICHT angeboten hat
           Der zweite Weg ist der Grund, warum eine Messkampagne den ganzen
           Weg misst und nicht nur die bereits gefundenen Schaeden. */
        kandidatId: m?.kandidatId ?? null,
        markerId: m?.markerId ?? null,
        /* AUSSERHALB DER PRUEFFLAECHE muss mitwandern. Befund der
           Gegenpruefung an rc.4.41: das Kennzeichen wurde hier
           fallengelassen. Die Bilanz zaehlte die Stelle danach als
           uebersehene Grenzueberschreitung, und die Speichergrenze wies
           den Datensatz ab — die Geometriepruefung schuetzte also richtig,
           aber der vorgesehene Weg fuer gekennzeichnete ausgeschlossene
           Messungen funktionierte gar nicht.

           Immer ein Boolescher Wert, nie undefined: die Kanonisierung
           weist undefined ab, und "fehlt" waere hier nicht dasselbe wie
           "innerhalb". */
        ausserhalbFlaeche: m?.ausserhalbFlaeche === true,
        /* Die Fassung der Regel, nach der beurteilt wurde. Ohne sie
           koennte ein spaeteres Update aus derselben Messung ein anderes
           Urteil machen. */
        ruleVersion: Number.isInteger(m?.ruleVersion) ? m.ruleVersion : 1,
        valueUm: m?.valueUm ?? null,
        unit: m?.unit ?? null,
        method: m?.method ?? null,
        uncertaintyUm: m?.uncertaintyUm ?? null,
        measuredAt: m?.measuredAt ?? null,
        measuredBy: m?.measuredBy ?? null,
        source: m?.source ?? null,
      })),
    screening: screening ? {
      configHash: typeof screening.configHash === "string" ? screening.configHash : null,
      configQuelle: screening.configQuelle ?? null,
      photos: (screening.photos || []).map(item => ({
        photoId: item?.photoId ?? null,
        candidateCount: Number.isFinite(item?.candidateCount) ? item.candidateCount : 0,
        suppressedCount: Number.isFinite(item?.suppressedCount) ? item.suppressedCount : 0,
        grindDirectionDeg: Number.isFinite(item?.grindDirectionDeg)
          ? item.grindDirectionDeg : null,
        /* Richtungsstaerke: Anteil des staerksten Winkelfaechers an der
           Gesamtenergie. Rohwert, keine Sicherheit und keine
           Zuverlaessigkeit — nicht kalibriert.

           orientationBins gehoert zwingend daneben: der Wert ist nur bei
           gleicher Faecherzahl vergleichbar (gemessen in SC-21). Ohne die
           Faecherzahl im Datensatz waeren zwei Protokolle spaeter nicht
           mehr gegeneinander lesbar. */
        grindStrength: Number.isFinite(item?.grindStrength) ? item.grindStrength : null,
        orientationBins: Number.isInteger(item?.orientationBins)
          ? item.orientationBins : null,
        /* Die Bildgroesse, in der die boundingBox-Koordinaten liegen.
           Ohne sie hat eine gespeicherte Box keinen Bezug und laesst sich
           im Foto nicht wiederfinden. null heisst "nicht gespeichert" —
           die Anzeige erfindet dann keine Markierung. */
        bildBreite: Number.isInteger(item?.bildBreite) ? item.bildBreite : null,
        bildHoehe: Number.isInteger(item?.bildHoehe) ? item.bildHoehe : null,
        candidates: (item?.candidates || []).map(kandidatFuerDatensatz),
        /* BEFUND der Gegenpruefung nach dem Geraetelauf mit rc.4.43,
           zutreffend: gespeichert wurden nur die zehn besten je Rangfolge.
           Eine kompakte Ausbruchstelle stand im Nachlauf auf Rang 22 von
           493 — aus dem Datensatz allein war das nicht feststellbar, denn
           unterhalb des Schnitts hielt er nichts fest.

           Die frueher hier vermerkte Begruendung "alle Kandidaten sprengen
           Datensatz und PDF" galt fuer das PDF und wurde auf den Datensatz
           mituebertragen. Gemessen sind es 198 KiB je Foto als Rohwerte;
           Kanonisieren und Hashen von zehn Fotos dauern zusammen 72 ms.
           Das PDF zeigt weiterhin nur die Vorauswahl.

           ROHWERTE, ungerundet: gerundet zu speichern hiesse, die
           Nachrechenbarkeit gegen 140 KiB einzutauschen. */
        alleKandidaten: (item?.alleKandidaten || []).map(kandidatFuerDatensatz),
      })),
    } : null,
    /* P3 · die geführte Aufnahmesequenz.
       Sie gehoert in den Datensatz, nicht nur in den Ablauf: ohne
       Lichtpositionen, Reihenfolge und Anleitungsfassung laesst sich die
       Aufnahme spaeter nicht wiederholen, und der Feuchtepunkt beriefe
       sich auf eine Serie, die niemand mehr nachvollziehen kann.
       sequenzFuerDatensatz() liefert eine Form ohne `undefined` —
       canonicalize() in audit.js weist die sonst beim Unterschreiben ab. */
    feuchteSequenz: sequenzFuerDatensatz(feuchteSequenz),
    fusionSummary: fusionSummary ? {
      status: fusionSummary.status ?? null,
      usedCount: Number.isFinite(fusionSummary.usedCount) ? fusionSummary.usedCount : 0,
      poseSpread: Number.isFinite(fusionSummary.poseSpread) ? fusionSummary.poseSpread : null,
      meaningful: fusionSummary.meaningful === true,
      excluded: (fusionSummary.excluded || []).map(item => ({
        sequenceIndex: item?.sequenceIndex ?? null,
        reason: item?.reason ?? null,
      })),
      /* Je Aufnahme: wie viel des Prueffelds aus dem Foto stammt und wie
         weit das Etikett im entzerrten Bild vom Sollquadrat abweicht.
         Beides wurde in rc.4.8 berechnet und dann weggeworfen — die
         Anzeige war spaeter nicht nachvollziehbar. */
      captures: (fusionSummary.captures || []).map(item => ({
        sequenceIndex: item?.sequenceIndex ?? null,
        fieldCoverage: Number.isFinite(item?.fieldCoverage) ? item.fieldCoverage : null,
        redetectResidualPx: Number.isFinite(item?.redetectResidualPx) ? item.redetectResidualPx : null,
      })),
    } : null,
    aiCrosscheck: {
      enabled: ki.enabled,
      status: ki.status,
      unresolvedConflicts: 0,
      adapterVersion: ki.adapterVersion,
      modelName: ki.modelName,
      modelVersion: ki.modelVersion,
    },
    comment, overrideReason, swabTest, referenceId,
    signature,
  };
}

/**
 * Bindet die Signatur an den Datensatz und baut ihn — mit GENAU EINER
 * Zeitquelle.
 *
 * Warum das eine eigene Funktion ist: in 8.3.0-rc.4.4 las `finalize` die Uhr
 * fuer die Signatur, und `buildInspectionRecord` las sie fuer den Datensatz
 * ein zweites Mal. Zwischen beiden Ablesungen lagen Millisekunden, und die
 * Invariante `signature.signedAt === record.signedAt` schlug zu. Speichern
 * war blockiert.
 *
 * Dieselbe Fehlerklasse wie der schemaVersion-Bruch: Erzeuger und Aufrufer
 * waren sich uneins. Die Lehre ist dieselbe — die Moeglichkeit beseitigen,
 * nicht die Symptome. `now` wird hier einmal entgegengenommen und an beide
 * Stellen durchgereicht; ein zweiter `new Date()` kann nicht mehr
 * dazwischengeraten.
 */
export function signInspection({ signature, signedBy, now, ...rest }) {
  const gebunden = { ...signature, signedAt: now, signedBy };
  return buildInspectionRecord({ ...rest, now, signature: gebunden });
}

/** Die Signaturbedeutung, die zum Zustand passt. */
/* Die BEDEUTUNG der Beurteilungsunterschrift. Sie ist nicht "Freigabe" und
   nicht "Pruefung erfasst" — die Handlung ist eine dritte: eine gemeldete
   Stelle wird beantwortet, die Entscheidung bleibt aus. §11.50 verlangt,
   dass die Bedeutung die tatsaechliche Handlung nennt; deshalb ein eigener
   Wortlaut und keine Anleihe bei einem der beiden anderen. */
export const KLAERUNG_MEANING = "Schadensverdacht beurteilt, Freigabe ausstehend";

/**
 * BEFUND D des Reparaturauftrags nach rc.4.44: die QA konnte einen
 * gemeldeten Schadensverdacht im WIEDERGEOEFFNETEN Bericht nicht
 * beantworten. Das Klaerungspanel gab es nur im Ergebnisbildschirm des
 * Pruefers — nach der Uebergabe war es fort. Der Verdacht sperrt aber PASS
 * und Override (Leitplanke 11); ohne Antwort blieb nur die Sperrung. Eine
 * Sperre, die den Vorgang einmauert, ist schaedlicher als die Luecke, die
 * sie schliesst.
 *
 * Die Beurteilung ist eine ERGAENZUNG, kein Ueberschreiben (Leitplanke 6):
 * ein neuer Datensatz, an die gepruefte Revision gebunden
 * (`supersedesId` + `approvalRevisionHash`), der den Verdacht mitsamt
 * seiner urspruenglichen Begruendung behaelt und ihn BEANTWORTET.
 *
 * Und sie ist ausdruecklich KEINE Freigabe: der Zustand bleibt PENDING_QA,
 * `finalDecision` bleibt leer, die Entscheidung ist ein zweiter Schritt
 * mit eigener Unterschrift und eigener Bedeutung.
 *
 * Gibt `null` zurueck, wenn irgendeine Voraussetzung fehlt. Ein halb
 * gebauter Datensatz waere hier schlimmer als keiner.
 *
 * @param {object} pending     der gespeicherte PENDING_QA-Datensatz
 * @param {object} actor       {username, role, displayName}
 * @param {object} signature   elektronische Signatur des Beurteilenden
 * @param {string} now         EINE Zeitquelle, durchgereicht
 * @param {string} newId       Kennung der neuen Revision
 * @param {Array}  klaerungen  [{photoId, markerId, ergebnis, begruendung}]
 */
export function buildClarificationRecord({ pending, actor, signature, now,
  newId: neueId, appVersion, klaerungen = [] }) {
  if (!pending || pending.state !== LIFECYCLE_STATE.PENDING_QA) return null;
  if (!actor?.username || !actor?.role) return null;
  if (!Array.isArray(klaerungen) || klaerungen.length === 0) return null;

  const gepflegt = (Array.isArray(pending.manualFindings) ? pending.manualFindings : [])
    .map(eintrag => ({ ...eintrag }));
  if (!gepflegt.length) return null;

  for (const k of klaerungen) {
    if (!k || typeof k.photoId !== "string" || typeof k.markerId !== "string") return null;
    if (!Object.values(VERDACHT_KLAERUNG).includes(k.ergebnis)) return null;
    const begruendung = String(k.begruendung || "").trim();
    if (!begruendung) return null;
    const stelle = gepflegt.findIndex(v =>
      v.photoId === k.photoId && v.markerId === k.markerId);
    /* Eine Beurteilung zu einer Stelle, die es in diesem Datensatz nicht
       gibt, waere eine Antwort auf eine nicht gestellte Frage. */
    if (stelle < 0) return null;
    /* Und eine zweite Antwort auf dieselbe Frage ueberschriebe die erste.
       Wer eine Beurteilung revidieren will, macht das als eigener,
       sichtbarer Vorgang — nicht still an derselben Stelle. */
    if (gepflegt[stelle].klaerung) return null;
    gepflegt[stelle] = {
      ...gepflegt[stelle],
      klaerung: {
        at: now, username: actor.username, role: actor.role,
        ergebnis: k.ergebnis, begruendung,
      },
    };
  }

  const ergaenzung = {
    ...pending,
    id: neueId,
    appVersion: appVersion || pending.appVersion,
    createdAt: now, signedAt: now,
    user: { username: actor.username, role: actor.role,
      displayName: actor.displayName || actor.username },
    state: LIFECYCLE_STATE.PENDING_QA,
    previousState: LIFECYCLE_STATE.PENDING_QA,
    finalDecision: null,
    approvedBy: pending.approvedBy ?? null,
    approvalRevisionHash: pending.recordHash,
    supersedesId: pending.id,
    manualFindings: gepflegt,
    /* Die Kennzeichnung, an der die Speichergrenze diesen Schreibvorgang
       von einer Freigabe unterscheidet. Ohne sie waere er eine Freigabe,
       die Inhalte aendert — und genau die ist verboten. */
    clarification: {
      by: { username: actor.username, role: actor.role }, at: now,
      count: klaerungen.length,
    },
    signature: { ...signature, signedAt: now, signedBy: actor.username,
      meaning: KLAERUNG_MEANING },
  };
  delete ergaenzung.recordHash;
  return ergaenzung;
}

export const SIGNATURE_MEANING = Object.freeze({
  [LIFECYCLE_STATE.PENDING_QA]: "Pruefung erfasst, Freigabe ausstehend",
  [LIFECYCLE_STATE.FINAL_PASS]: "Freigabe",
  [LIFECYCLE_STATE.PASS_AFTER_REMEDIATION]: "Freigabe nach Massnahme",
  [LIFECYCLE_STATE.RELEASED_WITH_DEVIATION]: "Override-Freigabe",
  [LIFECYCLE_STATE.FINAL_FAIL]: "Sperrung",
});
