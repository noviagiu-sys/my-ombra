/* ─── VisuClean RC4 · Zustandsmaschine und Auditmodell ─────────────────────
   Umsetzung von PLANUNG_RC4_V2.2.md, Abschnitte 6 und 7.

   Warum dieser Baustein existiert: RC3 kannte nur `finalDecision` mit den
   drei Werten PASS, FAIL und OVERRIDE. Es gab keinen Zustand, keinen
   Uebergang und damit auch keine Stelle, an der sich "das darf jetzt nicht"
   sagen laesst. Jede Sperre lag verstreut in saveInspection oder in der
   Oberflaeche. RC4 zieht die Regel an genau einen Ort.

   Zwei Dinge, die dieser Baustein bewusst NICHT tut:
   - Er faellt kein fachliches Urteil. Ob ein Kratzer neu ist, entscheidet
     ein Mensch; hier wird nur verwaltet, was daraus folgt.
   - Er erfindet keine Schwelle. Alle Zahlen stammen aus der Planung oder
     aus dem RC3-Kern.

   Determinismus: reine Funktionen. Kein Math.random, kein Zeitbezug.       */

import { STATUS } from "./assessment.js";
import { bestaetigteSchaeden, offeneSchadensverdachte } from "./decision.js";

/* ── Zustaende ─────────────────────────────────────────────────────────── */

export const LIFECYCLE_STATE = Object.freeze({
  DRAFT: "DRAFT",
  PENDING_OPERATOR_ACTION: "PENDING_OPERATOR_ACTION",
  PENDING_QA: "PENDING_QA",
  FINAL_PASS: "FINAL_PASS",
  PASS_AFTER_REMEDIATION: "PASS_AFTER_REMEDIATION",
  RELEASED_WITH_DEVIATION: "RELEASED_WITH_DEVIATION",
  FINAL_FAIL: "FINAL_FAIL",
  NOT_VERIFIED: "NOT_VERIFIED",
});

/** Endzustaende. Aus ihnen fuehrt kein Uebergang mehr heraus. */
export const TERMINAL_STATES = Object.freeze([
  LIFECYCLE_STATE.FINAL_PASS,
  LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
  LIFECYCLE_STATE.FINAL_FAIL,
  LIFECYCLE_STATE.NOT_VERIFIED,
]);

/** Das finale Ergebnis je Endzustand. Kein Endzustand ohne Ergebnis — mit
    genau einer Ausnahme: NOT_VERIFIED liefert ausdruecklich KEIN Ergebnis. */
export const FINAL_RESULT = Object.freeze({
  /* PENDING_QA ist kein Endzustand und traegt deshalb KEIN Ergebnis. Der
     Eintrag steht hier trotzdem, damit ein wartender Datensatz ein
     ausdrueckliches null bekommt statt undefined — canonicalize weist
     undefined ab, und ein fehlendes Feld waere im Protokoll nicht von
     einem vergessenen zu unterscheiden. */
  [LIFECYCLE_STATE.PENDING_QA]: null,
  [LIFECYCLE_STATE.FINAL_PASS]: "PASS",
  [LIFECYCLE_STATE.PASS_AFTER_REMEDIATION]: "PASS_AFTER_REMEDIATION",
  [LIFECYCLE_STATE.RELEASED_WITH_DEVIATION]: "OVERRIDE",
  [LIFECYCLE_STATE.FINAL_FAIL]: "FAIL",
  [LIFECYCLE_STATE.NOT_VERIFIED]: null,
});

/* Uebergangstabelle exakt nach der Planungstabelle in Abschnitt 6.
   NOT_VERIFIED ist aus jedem Zustand erreichbar und wird deshalb nicht
   einzeln aufgefuehrt, sondern in evaluateTransition gesondert behandelt. */
const ALLOWED_FROM = Object.freeze({
  [LIFECYCLE_STATE.DRAFT]: Object.freeze([
    LIFECYCLE_STATE.PENDING_OPERATOR_ACTION,
    LIFECYCLE_STATE.PENDING_QA,
    LIFECYCLE_STATE.FINAL_PASS,
    LIFECYCLE_STATE.FINAL_FAIL,
  ]),
  [LIFECYCLE_STATE.PENDING_OPERATOR_ACTION]: Object.freeze([
    LIFECYCLE_STATE.DRAFT,
    LIFECYCLE_STATE.PENDING_QA,
    LIFECYCLE_STATE.FINAL_FAIL,
  ]),
  [LIFECYCLE_STATE.PENDING_QA]: Object.freeze([
    LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
    LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
    LIFECYCLE_STATE.FINAL_FAIL,
    LIFECYCLE_STATE.PENDING_OPERATOR_ACTION,
  ]),
  [LIFECYCLE_STATE.FINAL_PASS]: Object.freeze([]),
  [LIFECYCLE_STATE.PASS_AFTER_REMEDIATION]: Object.freeze([]),
  [LIFECYCLE_STATE.RELEASED_WITH_DEVIATION]: Object.freeze([]),
  [LIFECYCLE_STATE.FINAL_FAIL]: Object.freeze([]),
  [LIFECYCLE_STATE.NOT_VERIFIED]: Object.freeze([]),
});

/** Zustaende, die ausschliesslich ein QA Manager herbeifuehren darf. */
const QA_ONLY = Object.freeze([
  LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
]);

/** Zustaende, die eine Reauthentifizierung verlangen. */
const REAUTH_REQUIRED = Object.freeze([
  LIFECYCLE_STATE.FINAL_PASS,
  LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
  LIFECYCLE_STATE.RELEASED_WITH_DEVIATION,
  LIFECYCLE_STATE.FINAL_FAIL,
]);

/** Zustaende, die ein PASS bedeuten. Ein offener Pflichtpunkt sperrt sie. */
const PASS_LIKE = Object.freeze([
  LIFECYCLE_STATE.FINAL_PASS,
  LIFECYCLE_STATE.PASS_AFTER_REMEDIATION,
]);

export const QA_ROLE = "QA Manager";

/* ── Vier-Augen-Prinzip ────────────────────────────────────────────────────
   Entschieden am 2026-09-08 durch den Auftraggeber: Auslegung B.
   Der Genehmiger muss eine ANDERE Benutzer-ID sein als der Pruefer.

   Die Entscheidung haengt an genau dieser einen Konstanten. Auslegung A
   (Personengleichheit erlaubt) waere REQUIRE_DISTINCT_APPROVER = false und
   sonst keine Codeaenderung — die Planung verlangte ausdruecklich, dass
   beide Antworten moeglich bleiben.

   Bekannte Grenze, die zur Entscheidung gehoert: in der statischen
   Offline-App ist jede Rollen- und Personenpruefung eine Workflow-Sperre,
   kein manipulationsgeschuetzter Zugriffsschutz. Anmeldung, Rollen und
   Signatur liegen im Browserprofil. Das erhoeht die organisatorische
   Nachvollziehbarkeit; es ersetzt keine serverseitige Identitaet.          */
export const REQUIRE_DISTINCT_APPROVER = true;

/* ── Sperrwirkung ──────────────────────────────────────────────────────── */

/**
 * Ein offener Pflichtpunkt sperrt jedes PASS — auch fuer einen QA Manager.
 * Offen heisst: erforderlich und nicht bewertbar, oder erforderlich und
 * nicht bestanden.
 */
export function hasBlockingCheckpoint(checkpoints = []) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  return list.some(item => item?.required
    && (item.status === STATUS.NOT_ASSESSABLE || item.status === STATUS.FAIL));
}

/** Die IDs der offenen Pflichtpunkte — fuer die Begruendung im Bericht. */
export function blockingCheckpointIds(checkpoints = []) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  return list
    .filter(item => item?.required
      && (item.status === STATUS.NOT_ASSESSABLE || item.status === STATUS.FAIL))
    .map(item => item.id);
}

/**
 * Welche QA-Entscheide sind fuer einen wartenden Datensatz ueberhaupt
 * erreichbar?
 *
 * Diese Funktion entscheidet NICHTS. Sie bildet die Regeln ab, die
 * evaluateTransition und die Speichergrenze ohnehin durchsetzen, damit die
 * Oberflaeche keine Handlung anbietet, die unten zwingend scheitert.
 * Sie ist bewusst hier abgelegt und nicht in der Oberflaeche: zwei
 * Fassungen derselben Regel laufen frueher oder spaeter auseinander.
 *
 * Befund aus dem Bedienlauf vom 11.09.2026: bei einem System-FAIL mit
 * nicht bewertbarem Pflichtpunkt bot die Oberflaeche "Durch QA freigeben"
 * an. Der Fehlschlag kam erst nach Anmeldung, Begruendung und Signatur.
 *
 * @param {object} record  {aggregate:{checkpoints}, originalSystemDecision}
 * @returns {{release:{allowed:boolean, code:string|null},
 *            block:{allowed:boolean, code:string|null}}}
 */
export function qaDecisionOptions(record = {}) {
  const checkpoints = record?.aggregate?.checkpoints || [];
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  const nichtBewertbar = list
    .filter(item => item?.required && item.status === STATUS.NOT_ASSESSABLE)
    .map(item => item.id);
  const offen = blockingCheckpointIds(checkpoints);
  const systemFail = record?.originalSystemDecision?.status === "FAIL";

  /* Ein nicht bewertbarer Pflichtpunkt schliesst BEIDE Freigabewege aus:
     PASS sowieso, und der Override scheitert daran, dass es nichts zu
     ueberstimmen gibt. */
  /* BEFUND D des Reparaturauftrags nach rc.4.44: diese Funktion kannte nur
     Pruefpunkte. Gemeldete Schadensverdachte sah sie nicht — die
     Oberflaeche bot "Durch QA freigeben" an, und `evaluateTransition` wies
     erst NACH Anmeldung, Begruendung und Signatur mit OPEN_MANUAL_FINDING
     ab. Eine Freigabe anzubieten, die spaeter scheitert, ist schlimmer als
     sie gar nicht anzubieten: der Pruefer haelt den Weg fuer offen.

     Die Reihenfolge ist dieselbe wie in evaluateTransition, und es
     entsteht hier KEINE neue Freigabeerlaubnis — diese Funktion sagt nur
     voraus, was dort ohnehin gilt. Q2 haelt beide Antworten zusammen. */
  const offeneVerdachte = offeneSchadensverdachte(record?.manualFindings);
  const bestaetigt = bestaetigteSchaeden(record?.manualFindings);

  let release = { allowed: true, code: null };
  if (nichtBewertbar.length) {
    release = { allowed: false, code: "NOT_ASSESSABLE_REQUIRED" };
  } else if (offeneVerdachte.length) {
    /* Sperrt PASS UND Override (Leitplanke 11): ein Verdacht ist kein
       Befund, den man ueberstimmen koennte, sondern eine offene Frage. */
    release = { allowed: false, code: "OPEN_MANUAL_FINDING" };
  } else if (bestaetigt.length && !systemFail) {
    /* Beurteilt, aber negativ. Ein PASS allein aus der Bestaetigung waere
       die Umkehrung dessen, was da steht. Liegt zusaetzlich ein
       bestaetigtes System-FAIL vor, bleibt der Override-Weg — dann
       entscheidet der Zweig darunter. */
    release = { allowed: false, code: "CONFIRMED_DAMAGE" };
  } else if (systemFail) {
    /* Nur ueber den Override, und der braucht ein bestaetigtes FAIL —
       das liegt hier vor. Erreichbar. */
    release = { allowed: true, code: "OVERRIDE_ONLY" };
  } else if (offen.length) {
    release = { allowed: false, code: "OPEN_CHECKPOINT" };
  }

  /* Die Sperrung bleibt immer erreichbar. Gaebe es auch sie nicht, waere
     der wartende Vorgang in einer Sackgasse. */
  return Object.freeze({
    release: Object.freeze(release),
    block: Object.freeze({ allowed: true, code: null }),
  });
}

/* ── Uebergangspruefung ────────────────────────────────────────────────── */

const deny = (code, message) => Object.freeze({ allowed: false, code, message });
const allow = code => Object.freeze({ allowed: true, code, message: null });

/**
 * Prueft einen Zustandsuebergang. Reine Funktion.
 *
 * @param {object} context
 * @param {string} context.from             aktueller Zustand
 * @param {string} context.to               Zielzustand
 * @param {object} context.actor            handelnder Benutzer {username, role}
 * @param {object} [context.performedBy]    Pruefer {username, role, at}
 * @param {object} [context.approvedBy]     Genehmiger {username, role, at}
 * @param {boolean} [context.reauthenticated]
 * @param {Array}  [context.checkpoints]
 * @param {boolean} [context.hasDeviation]  Qualitaetsabweichung dokumentiert
 * @param {string} [context.comment]
 * @param {string} [context.overrideReason]
 * @param {string} [context.approvalRevisionHash] Revision, auf die sich die
 *                                          QA-Genehmigung bezieht
 * @param {string} [context.currentRevisionHash]  aktuelle Revision
 * @param {number} [context.unresolvedAiConflicts]
 * @param {boolean} [context.integrityViolation]
 * @param {boolean} [context.clarification] Beurteilung eines gemeldeten
 *                                          Schadensverdachts (BEFUND D)
 * @returns {{allowed: boolean, code: string, message: string|null}}
 */
export function evaluateTransition(context = {}) {
  const {
    from, to, actor, performedBy, approvedBy,
    reauthenticated = false, checkpoints = [], hasDeviation = false,
    comment = "", overrideReason = "",
    approvalRevisionHash = null, currentRevisionHash = null,
    unresolvedAiConflicts = 0, integrityViolation = false,
    manualFindings = [],
    /* Kennzeichnet den Beurteilungsschritt. Ohne dieses Merkmal bleibt
       PENDING_QA → PENDING_QA weiterhin nicht vorgesehen. */
    clarification = false,
  } = context;

  if (!Object.values(LIFECYCLE_STATE).includes(from)) {
    return deny("UNKNOWN_STATE", `Unbekannter Ausgangszustand: ${from}`);
  }
  if (!Object.values(LIFECYCLE_STATE).includes(to)) {
    return deny("UNKNOWN_STATE", `Unbekannter Zielzustand: ${to}`);
  }

  /* Eine erkannte Integritaetsverletzung fuehrt aus JEDEM Zustand nach
     NOT_VERIFIED — und sonst nirgendwohin. Das steht bewusst ganz oben:
     kein anderer Uebergang darf sie ueberholen. */
  if (integrityViolation) {
    return to === LIFECYCLE_STATE.NOT_VERIFIED
      ? allow("INTEGRITY_VIOLATION")
      : deny("INTEGRITY_VIOLATION",
        "Integritaetsverletzung erkannt; nur NOT_VERIFIED ist erreichbar");
  }
  if (to === LIFECYCLE_STATE.NOT_VERIFIED) {
    return deny("NO_ARBITRARY_NOT_VERIFIED",
      "NOT_VERIFIED entsteht nur aus einer festgestellten Integritaetsverletzung");
  }

  /* Aus NOT_VERIFIED gibt es keinen Weg zurueck. */
  if (from === LIFECYCLE_STATE.NOT_VERIFIED) {
    return deny("NOT_VERIFIED_IS_FINAL",
      "Aus NOT_VERIFIED fuehrt kein Weg zurueck zu einer Freigabe");
  }
  if (TERMINAL_STATES.includes(from)) {
    return deny("TERMINAL_STATE", `${from} ist ein Endzustand`);
  }

  /* ── Die BEURTEILUNG eines gemeldeten Schadensverdachts (BEFUND D) ─────
     Der einzige Uebergang, der seinen Ausgangszustand behaelt. Er ist es
     ausdruecklich: die Beurteilung beantwortet eine Frage, sie entscheidet
     nichts. Der Vorgang wartet danach weiter — nur eben mit einer Antwort.

     Warum er hier oben steht: ein offener Verdacht sperrt PASS und
     Override, und ein offener Pflichtpunkt laesst nur zwei Ziele zu. Beide
     Sperren wuerden auch die Antwort blockieren, und dann waere der
     Vorgang eingemauert — die Sperre schaedlicher als die Luecke.

     Die Bedingungen bleiben streng: nur ein QA Manager, nur
     reauthentifiziert, nur an eine gepruefte Revision gebunden, und nur
     wenn tatsaechlich eine Antwort vorliegt. WELCHE Antwort und an welcher
     Stelle, prueft die Speichergrenze (pruefeKlaerungsDelta) — sie sieht
     als einzige den gespeicherten Vorgaengerstand. */
  if (clarification && from === LIFECYCLE_STATE.PENDING_QA && to === LIFECYCLE_STATE.PENDING_QA) {
    if (actor?.role !== QA_ROLE) {
      return deny("QA_ROLE_REQUIRED",
        "Nach der Uebergabe beurteilt ein QA Manager den gemeldeten Schadensverdacht");
    }
    if (!reauthenticated) {
      return deny("REAUTH_REQUIRED", "Die Beurteilung verlangt eine elektronische Signatur");
    }
    if (typeof approvalRevisionHash !== "string" || !approvalRevisionHash) {
      return deny("REVISION_BINDING_REQUIRED",
        "Die Beurteilung muss an die gepruefte Revision gebunden sein");
    }
    if (!(Array.isArray(manualFindings) && manualFindings.some(v => v?.klaerung))) {
      return deny("NO_CLARIFICATION", "Es liegt keine dokumentierte Beurteilung vor");
    }
    return allow("MANUAL_FINDING_CLARIFIED");
  }

  if (!ALLOWED_FROM[from].includes(to)) {
    return deny("TRANSITION_NOT_ALLOWED", `Uebergang ${from} → ${to} ist nicht vorgesehen`);
  }

  /* Sperrwirkung: ein offener Pflichtpunkt laesst nur zwei Ziele zu. */
  const offen = blockingCheckpointIds(checkpoints);
  if (offen.length
    && to !== LIFECYCLE_STATE.PENDING_OPERATOR_ACTION
    && to !== LIFECYCLE_STATE.FINAL_FAIL
    && to !== LIFECYCLE_STATE.DRAFT
    && to !== LIFECYCLE_STATE.PENDING_QA
    /* Der Override wird UNTEN gesondert geprueft. Bis rc.4.10 fiel er hier
       schon durch: `blockingCheckpointIds` fasst FAIL und NOT_ASSESSABLE
       zusammen, und ein bestaetigtes FAIL ist genau das, was ein Override
       ueberstimmt. Die allgemeine Sperre beendete die Pruefung damit vor
       der besonderen Regel — ein fachlich zulaessiger Override war nicht
       erreichbar. Befund der Gegenpruefung an rc.4.10, zutreffend.
       Die Sperre fuer NICHT BEWERTBARE Punkte bleibt: sie steht unten. */
    && to !== LIFECYCLE_STATE.RELEASED_WITH_DEVIATION) {
    return deny("OPEN_CHECKPOINT",
      `Offene Pflichtpunkte (${offen.join(", ")}); erreichbar sind nur `
      + "PENDING_OPERATOR_ACTION und FINAL_FAIL");
  }

  /* Ein PASS verlangt zusaetzlich, dass gar kein Pflichtpunkt offen ist —
     auch nicht durch einen QA Manager ueberstimmbar. */
  if (PASS_LIKE.includes(to) && offen.length) {
    return deny("OPEN_CHECKPOINT",
      `PASS ist bei offenen Pflichtpunkten ausgeschlossen (${offen.join(", ")})`);
  }

  /* Ein gemeldeter Schadensverdacht bleibt offen, bis er dokumentiert
     beurteilt ist — und ein offener Verdacht schliesst JEDEN positiven
     Abschluss aus, den PASS wie den Override.

     Der Override ist hier ausdruecklich MIT gesperrt, anders als beim
     offenen Pflichtpunkt: ein Override ueberstimmt einen BEFUND. Ein
     Verdacht ist kein Befund, sondern eine offene Frage — es gibt nichts
     zu ueberstimmen, solange niemand hingesehen hat.

     Die Sperrung (FINAL_FAIL) und der Rueckweg zum Operator bleiben frei.
     Eine Sperre, die den Vorgang einmauert, waere schaedlicher als die
     Luecke, die sie schliesst. */
  const offeneVerdachte = offeneSchadensverdachte(manualFindings);
  if (offeneVerdachte.length
    && (PASS_LIKE.includes(to) || to === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION)) {
    return deny("OPEN_MANUAL_FINDING",
      `${offeneVerdachte.length} gemeldete(r) Schadensverdacht ohne abschliessende `
      + "Beurteilung; erreichbar sind PENDING_OPERATOR_ACTION und FINAL_FAIL");
  }

  /* Ein BESTAETIGTER Schaden ist beurteilt — und trotzdem ein negativer
     Befund. Ein PASS allein aus der Bestaetigung waere die Umkehrung
     dessen, was da steht.

     Der Override bleibt ausdruecklich offen, aber nur mit SEINEN eigenen
     Bedingungen (bestaetigtes FAIL, QA-Rolle, Begruendung,
     Reauthentifizierung), die weiter unten geprueft werden. Hier entsteht
     keine neue Freigabeerlaubnis — es wird der Weg versperrt, der gar
     keine Abweichungsentscheidung verlangt. */
  const bestaetigt = bestaetigteSchaeden(manualFindings);
  if (bestaetigt.length && PASS_LIKE.includes(to)) {
    return deny("CONFIRMED_DAMAGE",
      `${bestaetigt.length} bestaetigte(r) Schaden; ein PASS folgt daraus nicht. `
      + "Erreichbar sind PENDING_OPERATOR_ACTION, FINAL_FAIL und - unter den "
      + "dafuer geltenden Bedingungen - die Freigabe mit Abweichung");
  }

  /* Ein Override verlangt ein bestaetigtes FAIL, aber KEINEN offenen
     (nicht bewertbaren) Pflichtpunkt. Ein nicht bewertbarer Punkt ist kein
     Befund, den man ueberstimmen koennte. */
  if (to === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION) {
    const nichtBewertbar = (checkpoints || [])
      .filter(item => item?.required && item.status === STATUS.NOT_ASSESSABLE)
      .map(item => item.id);
    if (nichtBewertbar.length) {
      return deny("OPEN_CHECKPOINT",
        `Override bei nicht bewertbarem Pflichtpunkt ausgeschlossen (${nichtBewertbar.join(", ")})`);
    }
    if (String(overrideReason || "").trim().length < 10) {
      return deny("OVERRIDE_REASON_TOO_SHORT",
        "Override erfordert mindestens 10 Zeichen Begruendung");
    }
  }

  /* Aus einem WARTENDEN Vorgang darf nur die QA herausfuehren — auch in
     die Sperrung. Bis rc.4.9 erfasste die Rollenpruefung nur die positiven
     Abschluesse (QA_ONLY); ein Operator oder Administrator konnte einen
     wartenden Vorgang endgueltig auf FINAL_FAIL setzen und damit die
     eigentliche QA-Entscheidung verhindern. Befund der Gegenpruefung an
     rc.4.9, zutreffend. */
  const ausWartend = from === LIFECYCLE_STATE.PENDING_QA;

  /* Rolle. Der Vergleich ist exakt; ein Administrator ist kein QA Manager. */
  if ((QA_ONLY.includes(to) || ausWartend) && actor?.role !== QA_ROLE) {
    return deny("QA_ROLE_REQUIRED",
      `${to} erfordert exakt die Rolle "${QA_ROLE}"; vorliegend "${actor?.role ?? "keine"}"`);
  }

  /* Nach einer dokumentierten Qualitaetsabweichung gibt es kein FINAL_PASS
     mehr — nur noch PASS_AFTER_REMEDIATION durch einen QA Manager. */
  if (to === LIFECYCLE_STATE.FINAL_PASS && hasDeviation) {
    return deny("DEVIATION_REQUIRES_QA",
      "Nach einer Qualitaetsabweichung ist nur PASS_AFTER_REMEDIATION zulaessig");
  }

  if (REAUTH_REQUIRED.includes(to) && !reauthenticated) {
    return deny("REAUTH_REQUIRED", `${to} erfordert eine Reauthentifizierung`);
  }

  if (to === LIFECYCLE_STATE.FINAL_FAIL && !String(comment || "").trim()) {
    return deny("COMMENT_REQUIRED", "FINAL_FAIL erfordert einen Massnahmenkommentar");
  }

  /* Pruefer und Genehmiger.

     Bis rc.4.10 galt dieser Block nur fuer QA_ONLY — also die positiven
     Abschluesse. Ein QA Manager konnte damit seine EIGENE wartende
     Pruefung sperren: FINAL_FAIL lief an Vier-Augen und
     Genehmigerpruefung vorbei. Befund der Gegenpruefung an rc.4.10,
     zutreffend. Jeder abschliessende Entscheid ueber einen wartenden
     Vorgang ist eine QA-Handlung — auch die Sperrung. */
  if (QA_ONLY.includes(to) || (ausWartend && TERMINAL_STATES.includes(to))) {
    if (!performedBy?.username) {
      return deny("PERFORMED_BY_MISSING", "performedBy ist nicht gesetzt");
    }
    if (!approvedBy?.username) {
      return deny("APPROVED_BY_MISSING", "approvedBy ist nicht gesetzt");
    }
    if (approvedBy.role !== QA_ROLE) {
      return deny("QA_ROLE_REQUIRED",
        `approvedBy muss exakt die Rolle "${QA_ROLE}" tragen`);
    }
    if (approvedBy.username !== actor?.username) {
      return deny("APPROVER_MISMATCH",
        "approvedBy und der handelnde Benutzer stimmen nicht ueberein");
    }
    if (REQUIRE_DISTINCT_APPROVER && approvedBy.username === performedBy.username) {
      return deny("FOUR_EYES_REQUIRED",
        "Vier-Augen-Prinzip: Genehmiger und Pruefer muessen verschiedene "
        + "Benutzer sein");
    }
    /* Die Genehmigung haengt am Hash genau der geprueften Revision. */
    if (approvalRevisionHash && currentRevisionHash
      && approvalRevisionHash !== currentRevisionHash) {
      return deny("REVISION_CHANGED",
        "Der Datensatz wurde nach der QA-Genehmigung geaendert; zurueck nach PENDING_QA");
    }
  }

  /* Ein ungeloester KI-Widerspruch sperrt jede Freigabe. */
  if (PASS_LIKE.includes(to) || to === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION) {
    if (Number(unresolvedAiConflicts) > 0) {
      return deny("AI_CONFLICT_UNRESOLVED",
        `${unresolvedAiConflicts} ungeloeste(r) KI-Widerspruch; Freigabe gesperrt`);
    }
  }

  return allow("OK");
}

/* ── Auditmodell ───────────────────────────────────────────────────────────
   Beliebig viele Lebenszyklusereignisse, genau ein finaler Anker je finaler
   Datensatzrevision. Die Formulierung "genau ein Auditereignis pro
   Inspektion" aus V2.1 war mit dem Lebenszyklus unvereinbar.               */

export const LIFECYCLE_EVENT = Object.freeze({
  FINDING_RECORDED: "FINDING_RECORDED",
  PREPARATION_ACTION: "PREPARATION_ACTION",
  RETAKE_RECORDED: "RETAKE_RECORDED",
  MANUAL_FINDING: "MANUAL_FINDING",
  KNOWN_ISSUE_ASSIGNED: "KNOWN_ISSUE_ASSIGNED",
  STATE_CHANGED: "STATE_CHANGED",
  QA_APPROVAL: "QA_APPROVAL",
  AI_CROSSCHECK: "AI_CROSSCHECK",
  AI_RESPONSE_DISCARDED: "AI_RESPONSE_DISCARDED",
  FINAL_ANCHOR: "FINAL_ANCHOR",
});

/**
 * Prueft die Anker-Invarianten ueber alle Auditereignisse einer Ablage.
 * Findet: fehlender Anker, doppelter Anker, verwaistes Ereignis, Anker auf
 * falscher Revision.
 *
 * @param {Array} events   Auditereignisse (bereits kettengeprueft)
 * @param {Array} records  Inspektionsdatensaetze {id, finalRevisionHash, state}
 */
export function verifyAnchors(events = [], records = []) {
  const list = Array.isArray(events) ? events : [];
  const recordList = Array.isArray(records) ? records : [];
  const problems = [];

  const knownIds = new Set(recordList.map(record => record.id));
  const anchorsById = new Map();

  for (const event of list) {
    const inspectionId = event?.payload?.inspectionId;
    if (!inspectionId) continue;
    if (!knownIds.has(inspectionId)) {
      problems.push({
        code: "ORPHAN_EVENT", inspectionId, eventId: event.id,
        message: `Auditereignis ${event.kind} verweist auf eine unbekannte Inspektion`,
      });
      continue;
    }
    if (event.kind !== LIFECYCLE_EVENT.FINAL_ANCHOR) continue;
    const bisher = anchorsById.get(inspectionId) || [];
    anchorsById.set(inspectionId, [...bisher, event]);
  }

  for (const record of recordList) {
    /* Nur ein abgeschlossener Datensatz braucht einen Anker. Ein Entwurf
       hat naturgemaess keinen — das ist kein Fehler. */
    if (!TERMINAL_STATES.includes(record.state)) continue;
    if (record.state === LIFECYCLE_STATE.NOT_VERIFIED) continue;

    const anker = anchorsById.get(record.id) || [];
    if (anker.length === 0) {
      problems.push({
        code: "ANCHOR_MISSING", inspectionId: record.id,
        message: "Abgeschlossene Inspektion ohne finalen Integritaetsanker",
      });
      continue;
    }
    if (anker.length > 1) {
      problems.push({
        code: "ANCHOR_DUPLICATE", inspectionId: record.id, count: anker.length,
        message: `${anker.length} finale Anker fuer eine Revision; genau einer ist zulaessig`,
      });
      continue;
    }
    const revision = anker[0]?.payload?.revisionHash;
    if (record.finalRevisionHash && revision !== record.finalRevisionHash) {
      problems.push({
        code: "ANCHOR_WRONG_REVISION", inspectionId: record.id,
        message: "Der finale Anker verweist auf eine andere Revision als der Datensatz",
      });
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    anchored: [...anchorsById.keys()],
  };
}

/**
 * Der Zustand, den ein Datensatz beim Laden bekommt. Jede erkannte
 * Verletzung fuehrt nach NOT_VERIFIED — und zwar ohne Absturz, auch wenn
 * die Audit-Ablage unlesbar ist.
 */
export function stateAfterIntegrityCheck(record, verification) {
  if (!verification || verification.ok !== true) return LIFECYCLE_STATE.NOT_VERIFIED;
  return record?.state && Object.values(LIFECYCLE_STATE).includes(record.state)
    ? record.state
    : LIFECYCLE_STATE.NOT_VERIFIED;
}
