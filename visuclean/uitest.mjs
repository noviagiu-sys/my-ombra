/* VisuClean v8.2 · serverseitiger UI-Struktur-Smoke-Test */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { APP_VERSION } from "./src/domain.js";
import { mitFeuchteSequenz } from "./tests/feuchteSequenz.mjs";

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}

console.log("VisuClean · UI-Struktur und semantische Login-Leitplanken\n");
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const { default: VisuClean } = await vite.ssrLoadModule("/src/App.jsx");
  const login = renderToStaticMarkup(React.createElement(VisuClean));
  ok("U1", "Login ist ein natives Formular", login.includes("<form") && login.includes('type="submit"'));
  ok("U2", "Benutzername und Passwort besitzen echte Labels", login.includes('for="username"') && login.includes('for="password"'));
  /* ALTVERHALTEN  Zaehlte >= 7 Buttons und setzte damit stillschweigend
                 voraus, dass das Demo-Panel mit seinen drei Schaltflaechen
                 gerendert wird.
     SOLLVERHALTEN Seit 8.3.0-rc.4.1 ist das Panel standardmaessig AUS
                 (VITE_DEMO_ACCESS). Der Test prueft jetzt, was er immer
                 pruefen wollte: dass die Bedienelemente native Buttons sind
                 und keine klickbaren div. Die Anzahl war nur ein Stellvertreter.
     BEGRUENDUNG Ein Test, der an einer Buttonzahl haengt, bricht bei jeder
                 UI-Aenderung und sagt nichts ueber Semantik. */
  ok("U3", "Bedienelemente sind native Buttons, keine klickbaren div",
    (login.match(/<button/g) || []).length >= 3
    && !/<div[^>]*onclick/i.test(login));
  ok("U3b", "Demo-Zugaenge sind im Standardbau nicht auf dem Anmeldeschirm",
    !login.includes("demo-access") && !login.includes("qa_manager"),
    "ohne VITE_DEMO_ACCESS=true erscheint kein QA-Zugang zum Anklicken");
  /* ALTVERHALTEN  Literal "v8.3.0-rc.1".  SOLLVERHALTEN gegen APP_VERSION.
   BEGRUENDUNG   Der Test soll zusichern, DASS die Version im Login steht,
                 nicht WELCHE — sonst bricht er bei jedem Release. */
ok("U4", "Login nennt Version und Demonstrator-Abgrenzung",
  login.includes(`v${APP_VERSION}`) && login.includes("Browser-Demonstrator"));
  ok("U5", "Passwort wird nicht als Wert in das Login-Feld gerendert", !login.includes('value="pharma2024"'));

  values.set("visuclean-language", "en");
  const english = renderToStaticMarkup(React.createElement(VisuClean));
  ok("U6", "Englischer Login wird vollstaendig umgeschaltet", english.includes("Sign in") && english.includes("Visual cleaning inspection"));

  values.set("visuclean-language", "de");
  const operator = { username: "operator1", displayName: "Operator 1", role: "Operator" };
  const home = renderToStaticMarkup(React.createElement(VisuClean, { initialUser: operator }));
  ok("U7", "Home besitzt semantische Hauptueberschrift und Settings-Button", home.includes("<h1") && home.includes('aria-label="Einstellungen"'));
  ok("U8", "Systemstatus ist nicht allein farbcodiert", home.includes("Analyse-Selbsttest") && (home.includes("Bereit") || home.includes("Nicht bereit")));
  ok("U9", "Operator kann keine Referenzverwaltung starten", /<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>[\s\S]*?Referenzvergleich/.test(home));
  ok("U10", "Alle sichtbaren Home-Aktionen sind Buttons", !home.includes("onClick") && (home.match(/<button/g) || []).length >= 7);
/* ── U12/U13 · Wartender Datensatz im Verlauf und in der Detailansicht ──

   Befund der Gegenpruefung an rc.4.7: `PENDING_QA` traegt korrekt
   finalDecision === null, aber der Verlauf rief
   record.finalDecision.toLowerCase() auf — die Ansicht stuerzt ab.

   Der Fehler hat jede gruene Suite ueberlebt, weil kein Test einen
   Bildschirm mit einem echten Datensatz gerendert hat. Genau das tun diese
   beiden: sie fahren HistoryScreen und RecordDetail mit einem wartenden
   Datensatz.                                                             */
{
  const { HistoryScreen, RecordDetail, ScreeningPanel, ResultScreen } = await vite.ssrLoadModule("/src/App.jsx");
  const { translator } = await vite.ssrLoadModule("/src/i18n.js");
  const { buildInspectionRecord, SIGNATURE_MEANING } = await vite.ssrLoadModule("/src/inspectionRecord.js");
  const { LIFECYCLE_STATE } = await vite.ssrLoadModule("/src/lifecycle.js");
  const { buildCheckpoints } = await vite.ssrLoadModule("/src/assessment.js");
  const { aggregateResults, deriveSystemDecision } = await vite.ssrLoadModule("/src/domain.js");
  const { CAPTURE_PATH, captureProfile } = await vite.ssrLoadModule("/src/decision.js");

  const JETZT = "2026-09-09T08:00:00.000Z";
  const merkmale = { tvFlat: 0.001, vdfr: 0.001, edgeFrac: 0.01, anomBlockFrac: 0.3, scratches: [], lm: 0.6 };
  const urteil = { dry: { pass: true, code: "PASS" }, clean: { pass: true, code: "PASS" }, intact: { pass: true, code: "PASS" } };
  const ergebnis = {
    dry: { ...urteil.dry, message: "", detail: "", severity: 0, action: "" },
    clean: { ...urteil.clean, message: "", detail: "", severity: 0, action: "" },
    intact: { ...urteil.intact, message: "", detail: "", severity: 0, action: "" },
    /* Vollstaendige Feuchte-Sequenz: U14 prueft die Sichtbarkeit der
       QA-Freigabeaktion, nicht das Feuchte-Tor (A25 bis A33). */
    lm: 0.6, hints: [], checkpoints: buildCheckpoints(merkmale, urteil, mitFeuchteSequenz("die")),
  };
  const fotos = [{
    id: "photo-1", image: "data:image/jpeg;base64,QUJD", annotatedImage: "data:image/jpeg;base64,QUJD",
    markers: [], markerAssessments: [], result: ergebnis, knownIssueInfo: null,
    captureProfile: captureProfile({
      processedWidth: 480, processedHeight: 640,
      sourceWidth: 1920, sourceHeight: 2560, path: CAPTURE_PATH.CAMERA,
    }),
  }];
  const aggregat = aggregateResults([ergebnis]);
  const wartend = buildInspectionRecord({
    id: "insp-ui-pending", appVersion: APP_VERSION, now: JETZT,
    user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
    eqId: "tp", eqName: "Tablettenpresse", zoneId: "die", zoneName: "Matrizenteller",
    photos: fotos, aggregate: aggregat,
    originalSystemDecision: deriveSystemDecision(aggregat),
    awaitingQa: true,
    performedBy: { username: "operator1", role: "Operator", at: JETZT },
    reauthenticated: true,
    signature: {
      method: "USER_ID_PASSWORD", components: ["userId", "password"],
      meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.PENDING_QA],
      signedAt: JETZT, signedBy: "operator1",
    },
  });
  wartend.recordHash = "a".repeat(64);

  const uebersetzer = schluessel => schluessel;
  let verlauf = ""; let verlaufFehler = "";
  try {
    verlauf = renderToStaticMarkup(React.createElement(HistoryScreen, {
      records: [wartend], language: "de", onSelect: () => {}, onExport: () => {},
      onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { verlaufFehler = String(fehler?.message || fehler); }

  ok("U12", "Der Verlauf rendert einen wartenden Datensatz ohne Absturz",
    Boolean(verlauf) && !verlaufFehler,
    verlaufFehler ? `ABSTURZ: ${verlaufFehler}` : "gerendert");

  let detail = ""; let detailFehler = "";
  try {
    detail = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: wartend, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { detailFehler = String(fehler?.message || fehler); }

  ok("U13", "Die Detailansicht rendert einen wartenden Datensatz ohne Absturz",
    Boolean(detail) && !detailFehler,
    detailFehler ? `ABSTURZ: ${detailFehler}` : "gerendert");

  /* U14/U15 · Ist der nachgereichte Freigabeweg ueberhaupt ERREICHBAR?

     Das ist der Kern der Beanstandung an rc.4.7: PENDING_QA war
     speicherbar, aber im Bildschirmfluss kam der Zustand nicht vor. Ein
     Vertrag, den keine Oberflaeche bedient, ist kein Feature.            */
  const alsQa = renderToStaticMarkup(React.createElement(RecordDetail, {
    record: wartend, language: "de", onBack: () => {}, t: uebersetzer,
    user: { username: "qa_manager", role: "QA Manager", displayName: "QA Manager" },
    onRelease: () => {},
  }));
  ok("U14", "Ein anderer QA Manager sieht die Aktion zur nachgereichten Freigabe",
    alsQa.includes("releaseNow"),
    alsQa.includes("releaseNow") ? "Aktion vorhanden" : "KEINE Freigabeaktion im Bildschirm");

  const alsPruefer = renderToStaticMarkup(React.createElement(RecordDetail, {
    record: wartend, language: "de", onBack: () => {}, t: uebersetzer,
    user: { username: "operator1", role: "QA Manager", displayName: "Pruefer mit QA-Rolle" },
    onRelease: () => {},
  }));
  /* U16/U17 · Die angezeigte Signaturbedeutung muss der gewaehlten
     Entscheidung folgen. Bis rc.4.9 stand im Freigabedialog fest "PASS":
     wer "Sperren" waehlte, sah "Freigabe nach Massnahme" und speicherte
     dann eine Sperrung. Befund der Gegenpruefung an rc.4.9. */
  const { QaApprovalScreen } = await vite.ssrLoadModule("/src/App.jsx");
  const { SIGNATURE_MEANING: BEDEUTUNG, deriveState: ableiten } =
    await vite.ssrLoadModule("/src/inspectionRecord.js");
  const { LIFECYCLE_STATE: LIFECYCLE_ZUSTAND } = await vite.ssrLoadModule("/src/lifecycle.js");

  const sperrBedeutung = BEDEUTUNG[ableiten({ finalDecision: "FAIL", hasDeviation: true })];
  const freiBedeutung = BEDEUTUNG[ableiten({ finalDecision: "PASS", hasDeviation: true })];
  ok("U16", "Sperren und Freigeben tragen verschiedene Signaturbedeutungen",
    sperrBedeutung && freiBedeutung && sperrBedeutung !== freiBedeutung,
    `FAIL → "${sperrBedeutung}" · PASS → "${freiBedeutung}"`);

  const sperrDialog = renderToStaticMarkup(React.createElement(QaApprovalScreen, {
    performedBy: { username: "operator1", role: "Operator" },
    context: "Tablettenpresse · Matrizenteller",
    meaning: sperrBedeutung, onCancel: () => {}, onConfirm: () => {},
    t: uebersetzer, begruendungPflicht: true, begruendung: "",
    setBegruendung: () => {},
  }));
  ok("U17", "Der Sperrdialog zeigt die Sperrbedeutung und verlangt eine Begruendung",
    sperrDialog.includes(sperrBedeutung) && !sperrDialog.includes(freiBedeutung)
    && sperrDialog.includes("qa-reason") && sperrDialog.includes("qaReasonRequired"),
    sperrDialog.includes(sperrBedeutung)
      ? "Bedeutung und Pflichtbegruendung vorhanden"
      : "FALSCHE BEDEUTUNG im Sperrdialog");

  /* U18 · Die Operator-Unterschrift darf keine andere Bedeutung bekommen
     als die, die gespeichert wird. Bis rc.4.10 zeigte der Bildschirm
     "Sperrung" bzw. "Freigabe" und gespeichert wurde "Pruefung erfasst,
     Freigabe ausstehend". Befund der Gegenpruefung an rc.4.10. */
  const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const bedeutungVorher = /const unterschriftBedeutung = \(\) => \{|const unterschriftBedeutung = \(\(\) => \{/
    .test(appQuelle)
    && /meaning=\{unterschriftBedeutung\}/.test(appQuelle)
    && !/screen === "signature"[\s\S]{0,200}meaning=\{signatureMeaning\(pendingDecision\)\}/.test(appQuelle);
  ok("U18", "Die angezeigte Bedeutung der Operator-Unterschrift ist die gespeicherte",
    bedeutungVorher && BEDEUTUNG[LIFECYCLE_ZUSTAND.PENDING_QA] === "Pruefung erfasst, Freigabe ausstehend",
    bedeutungVorher
      ? `Uebergabe zeigt "${BEDEUTUNG[LIFECYCLE_ZUSTAND.PENDING_QA]}"`
      : "der Unterschriftsbildschirm rechnet noch mit der Endentscheidung");

  /* -- Befunde aus dem Bedienlauf vom 11.09.2026 ------------------------
     Drei Fehler, die 351 gruene Pruefungen nicht gefunden haben, weil sie
     alle fragen, ob die GRENZE haelt - und keine fragt, ob ein Mensch
     durch die Tuer kommt. Alle drei sitzen im QA-Genehmigungsschirm.   */

  /* U19 - Falsche Zugangsdaten muessen eine Rueckmeldung erzeugen.
     Bis rc.4.13 stand die Meldung in submit(), und submit existierte nur
     mit bereits gueltigem approver - der Zweig war toter Code. Tippfehler,
     falsches Passwort und leeres Feld sahen identisch aus. */
  const { qaLoginStatus } = await vite.ssrLoadModule("/src/domain.js");
  const leerStatus   = qaLoginStatus?.({ username: "", password: "", approver: null });
  const falschStatus = qaLoginStatus?.({ username: "qu_manager", password: "quality2024", approver: null });
  const gutStatus    = qaLoginStatus?.({ username: "qa_manager", password: "quality2024", approver: { username: "qa_manager" } });
  ok("U19", "Falsche QA-Zugangsdaten erzeugen eine eigene Rueckmeldung",
    typeof qaLoginStatus === "function"
    && leerStatus === "qaApprovalAwaitLogin" && falschStatus === "qaApprovalUnknown"
    && gutStatus === null,
    typeof qaLoginStatus === "function"
      ? `leer -> ${leerStatus} . falsch -> ${falschStatus} . gueltig -> ${gutStatus}`
      : "qaLoginStatus fehlt; die Fehlermeldung ist weiterhin unerreichbar");

  /* U20 - Der Browser darf auf einem Vier-Augen-Schirm nichts vorschlagen.
     Mit autoComplete="username"/"current-password" fuellte Chrome die
     Zugangsdaten des PRUEFERS in das Feld des GENEHMIGERS. Im Bedienlauf
     dreimal passiert. */
  const qaMarkup = renderToStaticMarkup(React.createElement(QaApprovalScreen, {
    performedBy: { username: "operator1", role: "Operator" },
    context: "Tablettenpresse . Matrizenteller",
    meaning: sperrBedeutung, onCancel: () => {}, onConfirm: () => {}, t: uebersetzer,
  }));
  const keinVorschlag = !/autocomplete="username"/i.test(qaMarkup)
    && !/autocomplete="current-password"/i.test(qaMarkup)
    && /autocomplete="off"/i.test(qaMarkup)
    && /autocomplete="new-password"/i.test(qaMarkup);
  ok("U20", "Der QA-Schirm laedt den Browser nicht zum Vorausfuellen ein",
    keinVorschlag,
    keinVorschlag ? "autoComplete off / new-password"
      : "Autofill bietet weiterhin die Kennung des Pruefers an");

  /* U21 - Keine Handlung anbieten, die zwingend scheitert.
     Bei System-FAIL mit nicht bewertbarem Pflichtpunkt ist WEDER PASS noch
     Override erreichbar; nur die Sperrung bleibt. Die Oberflaeche bot
     trotzdem "Durch QA freigeben" an - der Fehlschlag kam erst nach
     Anmeldung, Begruendung und Signatur. */
  const unbewertbar = { ...wartend,
    aggregate: { ...wartend.aggregate, checkpoints: [
      { id: "moisture", required: true, status: "NOT_ASSESSABLE" },
      { id: "corrosion", required: true, status: "NOT_ASSESSABLE" },
    ] },
    originalSystemDecision: { ...(wartend.originalSystemDecision || {}), status: "FAIL" },
  };
  const qaSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
    record: unbewertbar, language: "de", onBack: () => {}, t: uebersetzer,
    user: { username: "qa_manager", role: "QA Manager", displayName: "QA Manager" },
    onRelease: () => {},
  }));
  const sperrenBleibt = qaSicht.includes("blockNow");
  const freigabeWeg = !qaSicht.includes(">releaseNow<");
  const grundGenannt = qaSicht.includes("releaseImpossible");
  ok("U21", "Eine unmoegliche Freigabe wird nicht angeboten, der Grund steht da",
    sperrenBleibt && freigabeWeg && grundGenannt,
    grundGenannt && freigabeWeg
      ? "nur Sperrung angeboten, Grund sichtbar"
      : "Freigabe wird weiterhin angeboten, obwohl sie nicht durchgehen kann");

  /* -- U22/U23 - Das Screening muss den Operator ERREICHEN ---------------
     Befund der unabhaengigen Gegenpruefung an rc.4.19: screenScratches()
     wurde berechnet, aber in der sichtbaren App fehlten Kandidatenliste
     und Overlay, und weder Datensatz noch PDF trugen die Kandidaten.
     Eine Aufmerksamkeitshilfe, die niemand sieht, hilft niemandem.

     Geprueft wird am GERENDERTEN Bildschirm, nicht am Quelltext.        */
  const mitScreening = {
    ...wartend,
    screening: {
      configHash: "c".repeat(64),
      configQuelle: "DATEI",
      photos: [{
        photoId: fotos[0].id,
        candidateCount: 7,
        suppressedCount: 4,
        grindDirectionDeg: 12.5,
        candidates: [
          { rank: 1, boundingBox: { minX: 10, minY: 20, maxX: 90, maxY: 26 },
            lengthRel: 0.42, widthRel: 0.01, orientationDeg: 88.0,
            grindDeltaDeg: 75.5, edgeStrength: 0.61, relevanceScore: 0.2711,
            alignedWithGrind: false },
          { rank: 2, boundingBox: { minX: 30, minY: 60, maxX: 44, maxY: 63 },
            lengthRel: 0.07, widthRel: 0.01, orientationDeg: 11.0,
            grindDeltaDeg: 1.5, edgeStrength: 0.30, relevanceScore: 0.0009,
            alignedWithGrind: true },
        ],
      }],
    },
  };

  let screeningSicht = ""; let screeningFehler = "";
  try {
    screeningSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: mitScreening, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { screeningFehler = String(fehler?.message || fehler); }

  const nenntKandidaten = screeningSicht.includes("screeningCandidates");
  const nenntRang = /0\.2711|0,2711/.test(screeningSicht) || /75[.,]5/.test(screeningSicht);
  ok("U22", "Die Detailansicht zeigt die Screening-Kandidaten",
    !screeningFehler && nenntKandidaten && nenntRang,
    screeningFehler ? `ABSTURZ: ${screeningFehler}`
      : nenntKandidaten ? "Kandidatenliste mit Rang und Merkmalen sichtbar"
        : "die Kandidaten erscheinen NICHT im Bildschirm");

  /* Kein Kandidat darf als tief, harmlos, neu oder vergroessert gelten.
     Der Bildschirm darf nur zeigen, was gemessen wurde. */
  const behauptet = /(TIEF|MIKRO|HARMLOS|\bneu\b|vergroessert|vergrößert)/i
    .test(screeningSicht.replace(/screeningCandidates|screeningNoDepth/g, ""));
  ok("U23", "Kein Kandidat wird als tief, harmlos, neu oder vergroessert ausgewiesen",
    !screeningFehler && !behauptet,
    behauptet ? "der Bildschirm behauptet Tiefe, Harmlosigkeit oder Entstehungszeit"
      : "nur gemessene Groessen");

  /* -- U24 - Richtungsstaerke und ihre AUSWIRKUNG muessen sichtbar sein --
     Vereinbarter Wortlaut: die Zahl ist ein Rohwert, keine Sicherheit.
     "Zuverlaessigkeit nicht kalibriert" steht ausdruecklich dabei, weil
     auch eine Einordnung wie "schwach bestimmt" eine Kalibrierung
     behaupten wuerde, die es nicht gibt.

     Dazu die Auswirkung: wie viele Kandidaten wurden wegen ihrer Richtung
     niedriger bewertet. Ohne diese Zahl bleibt unsichtbar, was die
     Unterdrueckung ueberhaupt getan hat.                                */
  const mitStaerke = {
    ...mitScreening,
    screening: {
      ...mitScreening.screening,
      photos: [{
        ...mitScreening.screening.photos[0],
        grindStrength: 0.141,
        orientationBins: 36,
      }],
    },
  };
  let staerkeSicht = ""; let staerkeFehler = "";
  try {
    staerkeSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: mitStaerke, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { staerkeFehler = String(fehler?.message || fehler); }

  const nenntRohwert = /0[.,]141/.test(staerkeSicht);
  const nenntNichtKalibriert = /screeningUncalibrated/.test(staerkeSicht);
  const nenntAuswirkung = /screeningSuppressed/.test(staerkeSicht) && /\b4\b/.test(staerkeSicht);
  /* Die Faecherzahl gehoert zwingend neben den Rohwert: ohne sie sind zwei
     Richtungsstaerken nicht vergleichbar (gemessen in SC-21). Eine Zahl
     ohne ihre Bezugsgroesse ist keine Angabe, sondern eine Andeutung. */
  const nenntFaecherzahl = /screeningBins/.test(staerkeSicht) && /\b36\b/.test(staerkeSicht);
  /* Keine Prozentangabe an der Richtungsstaerke: 14,1 % liest sich wie
     eine Sicherheit von 14,1 Prozent. Genau das ist sie nicht. */
  const keineProzent = !/0[.,]141\s*%|14[.,]1\s*%/.test(staerkeSicht);
  ok("U24", "Richtungsstaerke als Rohwert, ohne Zuverlaessigkeitsbehauptung, mit Auswirkung",
    !staerkeFehler && nenntRohwert && nenntNichtKalibriert && nenntAuswirkung
      && nenntFaecherzahl && keineProzent,
    staerkeFehler ? `ABSTURZ: ${staerkeFehler}`
      : `Rohwert ${nenntRohwert} · nicht kalibriert ${nenntNichtKalibriert}`
        + ` · Auswirkung ${nenntAuswirkung} · Faecherzahl ${nenntFaecherzahl}`
        + ` · ohne Prozent ${keineProzent}`);

  /* -- U25 - Die Voreinstellung sortiert OHNE Richtungsabwertung -------
     Die Richtungsschaetzung ist nicht kalibriert. Auf dem realen Teil des
     Auftraggebers lag ihre Staerke bei 0,049 - unter dem Wert einer
     Flaeche voellig ohne Vorzugsrichtung (0,056 bei 36 Faechern, SC-21) -
     und dennoch wurden 19 von 66 Kandidaten deswegen niedriger bewertet.

     Welche Rangfolge die Anzeige ZUERST zeigt, ist damit eine
     Sicherheitsfrage und keine Geschmacksfrage: die ungerichtete
     unterdrueckt niemanden. Sie ist die konservative Wahl und braucht
     keine kalibrierte Zahl. Die gerichtete bleibt umschaltbar.

     KEINE Schwelle: es wird nicht "ab Staerke X umgeschaltet" - das waere
     genau die ungemessene Zahl, die hier nicht vorkommen darf.        */
  const sortierSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
    record: mitScreening, language: "de", onBack: () => {}, t: uebersetzer,
  }));
  /* Die Voreinstellung des Auswahlfeldes steht im gerenderten Markup als
     selected-Option. */
  const voreinstellungPlain = /<option[^>]*selected[^>]*value="plain"|value="plain"[^>]*selected/
    .test(sortierSicht);
  /* Und die gezeigte Rangfolge muss benannt sein, sonst weiss ein Leser
     nicht, welche Reihenfolge vor ihm liegt. */
  const benennt = /screeningSortPlain/.test(sortierSicht)
    && /screeningSortDirected/.test(sortierSicht);
  /* Beide Werte bleiben je Kandidat sichtbar - umschalten heisst
     umsortieren, nicht verbergen. */
  const beideSpalten = /screeningScore\b/.test(sortierSicht)
    && /screeningScorePlain/.test(sortierSicht);
  ok("U25", "Voreingestellt ist die Rangfolge ohne Richtungsabwertung",
    voreinstellungPlain && benennt && beideSpalten,
    `Voreinstellung ungerichtet ${voreinstellungPlain} · beide benannt ${benennt}`
      + ` · beide Spalten ${beideSpalten}`);

  /* ── U26 · Kein Prozentzeichen an den Screening-Rohwerten ────────────
     ALTVERHALTEN  Laenge und Breite standen als "23,6 %" und "1,37 %" in
                   der Tabelle. Das liest sich wie ein Messwert, ist aber
                   ein Verhaeltnis zur kurzen Kante des analysierten
                   Bildes: dieselbe Riefe aus doppeltem Abstand ergibt den
                   halben Wert, und ohne den Bezug ist die Zahl zwischen
                   zwei Aufnahmen wertlos.
     SOLLVERHALTEN Dimensionsloser Rohwert mit benanntem Bezug — dieselbe
                   Regel, die fuer die Richtungsstaerke in U24 gilt.
     UMFANG        Geprueft werden die VEREINBARTEN Screening-Rohwerte:
                   jede Zahl in der Kandidatentabelle und die
                   Richtungsstaerke. KEINE globale Prozentsperre fuer die
                   App — ein nachvollziehbar bestimmter Bildflaechenanteil
                   ("3,1 % warme Pixel") ist eine andere Groesse und darf
                   sein Prozentzeichen behalten. Das prueft U28.
     GRENZE        Sie prueft den Bildschirm. Fuer das Protokoll gilt
                   dasselbe, belegt in P12.                              */
  const rohwerte = {
    configHash: "d".repeat(64), configQuelle: "DATEI",
    photos: [{
      photoId: fotos[0].id, candidateCount: 3, suppressedCount: 1,
      grindDirectionDeg: 172.5, grindStrength: 0.141, orientationBins: 36,
      candidates: [{
        rank: 1, boundingBox: { minX: 10, minY: 20, maxX: 90, maxY: 26 },
        lengthRel: 0.236, widthRel: 0.0137, orientationDeg: 28,
        grindDeltaDeg: 28.0, edgeStrength: 0.24,
        relevanceScore: 0.0260, relevanceScoreUngerichtet: 0.0554,
        alignedWithGrind: false,
      }],
    }],
  };
  let panelDe = ""; let panelEn = ""; let panelFehler = "";
  try {
    panelDe = renderToStaticMarkup(React.createElement(ScreeningPanel,
      { screening: rohwerte, t: translator("de") }));
    panelEn = renderToStaticMarkup(React.createElement(ScreeningPanel,
      { screening: rohwerte, t: translator("en") }));
  } catch (fehler) { panelFehler = String(fehler?.message || fehler); }

  /* Jede Zahl in der Kandidatentabelle, Zelle fuer Zelle. Eine Pruefung
     auf eine einzelne Spalte haelt nur bis zur naechsten Spalte — genau
     so ist der Fehler entstanden. */
  const tabellenZellen = markup => [...markup.matchAll(/<td[^>]*>(.*?)<\/td>/gs)]
    .map(treffer => treffer[1].replace(/<[^>]*>/g, ""));
  const zelleMitProzent = markup => tabellenZellen(markup)
    .find(inhalt => /[\d.,]\s*%/.test(inhalt)) || null;
  /* Und die Richtungsstaerke, die ausserhalb der Tabelle steht. */
  const staerkeMitProzent = markup => /0[.,]141\s*%|14[.,]1\s*%/.test(markup);
  const ohneProzent = !zelleMitProzent(panelDe) && !zelleMitProzent(panelEn)
    && !staerkeMitProzent(panelDe) && !staerkeMitProzent(panelEn);
  const zeigtRohwerte = /0[.,]2360/.test(panelDe) && /0[.,]0137/.test(panelDe);
  /* Ein Rohwert ohne seine Bezugsgroesse ist keine Angabe, sondern eine
     Andeutung — dieselbe Begruendung wie bei der Faecherzahl in U24. */
  const nenntBezug = /kurze[nr]? Kante des analysierten Bildes/.test(panelDe)
    && /short edge of the analysed image/.test(panelEn);
  ok("U26", "Screening-Rohwerte mit benanntem Bezug, ohne Prozentzeichen",
    !panelFehler && ohneProzent && zeigtRohwerte && nenntBezug,
    panelFehler ? `ABSTURZ: ${panelFehler}`
      : `ohne Prozent ${ohneProzent}${zelleMitProzent(panelDe)
        ? ` (Zelle "${zelleMitProzent(panelDe)}")` : ""}`
        + ` · Rohwerte ${zeigtRohwerte} · Bezug benannt ${nenntBezug}`);

  /* ── U28 · Die Regel ist KEINE globale Prozentsperre ─────────────────
     Ein Bildflaechenanteil ist nachvollziehbar bestimmt: "3,1 % warme
     Pixel" sagt, welcher Anteil der Bildflaeche warm ist, und das ist
     genau das, was gemessen wurde. Das Prozentzeichen ist dort richtig.

     Diese Gegenprobe haelt die Regel eng. Ohne sie waere der naechste
     Schritt eine App, die aus Vorsicht auch dort kein Prozent mehr zeigt,
     wo es die zutreffende Einheit ist — und das waere keine Ehrlichkeit,
     sondern Informationsverlust.                                        */
  const mitFlaechenanteil = {
    ...wartend,
    aggregate: {
      ...wartend.aggregate,
      checkpoints: wartend.aggregate.checkpoints.map(p => p.id === "residue"
        ? {
          ...p, status: "FAIL", code: "ORGANIC_RESIDUE",
          message: { de: "Warme Farbabweichung", en: "Warm colour deviation" },
          reason: "Anteil warmer Pixel. 3.1% warme Pixel (nach Beleuchtungs-Normalisierung)",
        }
        : p),
    },
  };
  const flaechenSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
    record: mitFlaechenanteil, language: "de", onBack: () => {}, t: translator("de"),
  }));
  ok("U28", "Der Bildflaechenanteil behaelt sein Prozentzeichen",
    /3[.,]1\s*%/.test(flaechenSicht),
    /3[.,]1\s*%/.test(flaechenSicht)
      ? "3,1 % warme Pixel bleibt als Flaechenanteil stehen"
      : "die Prozentregel greift zu weit und loescht eine zutreffende Einheit");

  /* ── U27 · Das Screening erreicht den Ergebnis-Bildschirm ────────────
     Befund aus dem Geraetelauf vom 12.09.2026: die Kandidatenliste war
     ausschliesslich in der Detailansicht eines GESPEICHERTEN Datensatzes
     zu sehen. Wer eine Aufnahme macht und das Ergebnis liest, sah sie
     nie — also genau die Person, die noch nachsehen, nachfotografieren
     oder ablehnen kann, BEVOR unterschrieben wird.

     Das war seit rc.4.19 so. U22 hat es nicht bemerkt, weil es nur die
     Detailansicht rendert; eine Gegenprobe prueft nur den Bildschirm,
     den sie aufruft.                                                    */
  let ergebnisSicht = ""; let ergebnisFehler = "";
  try {
    ergebnisSicht = renderToStaticMarkup(React.createElement(ResultScreen, {
      mode: "inspect",
      equipment: { id: "tp", de: "Tablettenpresse", en: "Tablet press" },
      zone: { id: "die", de: "Matrizenteller", en: "Die table" },
      /* Der Ergebnis-Bildschirm sieht LEBENDE Aufnahmen, keine aus einem
         Datensatz zurueckgelesenen: sie tragen rawResult samt Overlay. */
      photos: fotos.map(foto => ({ ...foto, rawResult: { ...ergebnis, _ov: null } })),
      aggregate: aggregat,
      systemDecision: deriveSystemDecision(aggregat),
      reference: null, swabData: null, language: "de",
      user: { username: "operator1", role: "Operator", displayName: "Operator 1" },
      comment: "", setComment: () => {}, onDecision: () => {},
      onOverride: () => {}, onKnownIssue: () => {}, onSwab: () => {},
      onDone: () => {}, t: translator("de"), screening: rohwerte,
    }));
  } catch (fehler) { ergebnisFehler = String(fehler?.message || fehler); }
  const ergebnisZeigtKandidaten = /0[.,]236/.test(ergebnisSicht)
    && /Verdachtsstellen/.test(ergebnisSicht);
  ok("U27", "Der Ergebnis-Bildschirm zeigt die Screening-Kandidaten",
    !ergebnisFehler && ergebnisZeigtKandidaten,
    ergebnisFehler ? `ABSTURZ: ${ergebnisFehler}`
      : ergebnisZeigtKandidaten
        ? "Kandidatenliste vor der Unterschrift sichtbar"
        : "die Kandidaten erscheinen erst nach dem Speichern");

  /* ── U29/U30 · BEFUND F auf dem BILDSCHIRM ──────────────────────────
     F1 bis F10 pruefen die reine Funktion. Dass der Bericht sie auch
     BENUTZT, prueft bisher nichts — dieselbe Luecke, die X1 einmal
     gekostet hat. Geprueft wird deshalb am gerenderten Bericht.

     Der Fall ist der echte: ohne Streiflichtsequenz ist der
     Feuchte-Pruefpunkt NICHT BEWERTBAR, waehrend der Rohbefund des Kerns
     "trocken" sagt. Bis rc.4.44 stand daneben gruen "T PASS". */
  const feuchteUnklar = {
    ...wartend,
    aggregate: { ...wartend.aggregate, checkpoints: [
      { id: "moisture", required: true, status: "NOT_ASSESSABLE",
        code: "NOT_ASSESSABLE_NO_MOISTURE_SEQUENCE",
        label: { de: "Feuchtigkeit / Trockenheit", en: "Moisture" },
        message: { de: "Nicht bewertbar", en: "Not assessable" },
        reason: "keine Streiflichtsequenz", actions: [], measurements: {} },
      { id: "residue", required: true, status: "PASS", code: "PASS",
        label: { de: "Rueckstaende", en: "Residue" },
        message: { de: "Sauber", en: "Clean" }, actions: [], measurements: {} },
    ] },
    photos: [{ ...fotos[0], result: { ...fotos[0].result, checkpoints: [
      { id: "moisture", required: true, status: "NOT_ASSESSABLE" },
      { id: "residue", required: true, status: "PASS" },
    ] } }],
  };
  let unklarSicht = ""; let unklarFehler = "";
  try {
    unklarSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: feuchteUnklar, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { unklarFehler = String(fehler?.message || fehler); }

  /* Die Fotokachel traegt die Kurzform. "T ?" heisst nicht bewertbar. */
  const kachelUnklar = /T \?/.test(unklarSicht);
  const kachelGruen = /T PASS/.test(unklarSicht);
  /* Und die Urteilskarte darf nicht gruen sein. */
  const karteUnklar = /verdict-unknown/.test(unklarSicht);
  ok("U29", "Ein nicht bewertbarer Pruefpunkt erscheint im Bericht nicht als PASS",
    !unklarFehler && kachelUnklar && !kachelGruen && karteUnklar,
    unklarFehler ? `ABSTURZ: ${unklarFehler}`
      : `Fotokachel ${kachelGruen ? "T PASS (FALSCH)" : kachelUnklar ? "T ?" : "ohne Kurzform"}`
        + ` · Urteilskarte ${karteUnklar ? "nicht bewertbar" : "GRUEN"}`);

  /* U30 · Der Gegenfall. Ein NACHWEISLICHER Altbestand — `schema`
     vorhanden, `schemaVersion` fehlt, keine Pruefpunkte — behaelt seine
     historische Aussage. Sie still umzuschreiben waere schlimmer als die
     Widerspruechlichkeit, die hier behoben wird. */
  const altbestand = {
    ...wartend,
    id: "insp-ui-alt", appVersion: "8.2.0",
    aggregate: { ...wartend.aggregate, checkpoints: [] },
    checkpoints: [],
    photos: [{ ...fotos[0], result: { ...fotos[0].result, checkpoints: [] } }],
  };
  delete altbestand.schemaVersion;
  let altSicht = ""; let altFehler = "";
  try {
    altSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: altbestand, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { altFehler = String(fehler?.message || fehler); }
  ok("U30", "Ein nachgewiesener Altbestand behaelt im Bericht seinen Rohbefund",
    !altFehler && /T PASS/.test(altSicht) && !/T \?/.test(altSicht),
    altFehler ? `ABSTURZ: ${altFehler}`
      : /T PASS/.test(altSicht) ? "T PASS wie im Stand 8.2"
        : "der historische Befund ist im Bericht verlorengegangen");

  /* U31 · BEFUND der unabhaengigen Gegenpruefung an rc.4.45, Punkt 2:
     eine Pruefpunktliste, in der zwei der drei erforderlichen
     Intakt-Punkte FEHLEN, zeigte im Bericht "I PASS" und eine gruene
     Urteilskarte. Geprueft wird die ECHTE Darstellung, nicht nur die
     Funktion: der Befund stand auf dem Bildschirm, nicht in einem
     Rueckgabewert. */
  const intaktUnvollstaendig = {
    ...wartend,
    id: "insp-ui-intakt-luecke",
    aggregate: { ...wartend.aggregate, checkpoints: [
      { id: "scratch", required: true, status: "PASS", code: "PASS",
        label: { de: "Kratzer und Riefen", en: "Scratches" },
        message: { de: "Bestanden", en: "Pass" }, actions: [], measurements: {} },
    ] },
    checkpoints: [
      { id: "scratch", required: true, status: "PASS", code: "PASS",
        label: { de: "Kratzer und Riefen", en: "Scratches" },
        message: { de: "Bestanden", en: "Pass" }, actions: [], measurements: {} },
    ],
    photos: [{ ...fotos[0], result: { ...fotos[0].result, checkpoints: [
      { id: "scratch", required: true, status: "PASS" },
    ] } }],
  };
  let luckenSicht = ""; let luckenFehler = "";
  try {
    luckenSicht = renderToStaticMarkup(React.createElement(RecordDetail, {
      record: intaktUnvollstaendig, language: "de", onBack: () => {}, t: uebersetzer,
    }));
  } catch (fehler) { luckenFehler = String(fehler?.message || fehler); }
  const kachelIntaktGruen = /I PASS/.test(luckenSicht);
  const kachelIntaktUnklar = /I \?/.test(luckenSicht);
  ok("U31", "Ein unvollstaendiges Intakt erscheint im Bericht nicht als PASS",
    !luckenFehler && kachelIntaktUnklar && !kachelIntaktGruen
    && /verdict-unknown/.test(luckenSicht),
    luckenFehler ? `ABSTURZ: ${luckenFehler}`
      : `Fotokachel ${kachelIntaktGruen ? "I PASS (FALSCH)" : kachelIntaktUnklar ? "I ?" : "ohne Kurzform"}`
        + ` · Urteilskarte ${/verdict-unknown/.test(luckenSicht) ? "nicht bewertbar" : "GRUEN"}`);

  ok("U15", "Der Pruefer selbst sieht sie nicht, auch nicht mit QA-Rolle",
    !alsPruefer.includes("releaseNow") && alsPruefer.includes("pendingQaHint"),
    !alsPruefer.includes("releaseNow")
      ? "Vier-Augen auch in der Oberflaeche sichtbar"
      : "FREIGABE FUER DEN PRUEFER SELBST ANGEBOTEN");
}

} finally {
  await vite.close();
}

/* ─── U11 · Der Kamerastream haengt an einem Effekt, nicht an einem Frame ──
   ALTVERHALTEN  requestAnimationFrame direkt nach setCameraOpen(true). Lief
                 der Callback vor dem React-Commit, war videoRef.current noch
                 null und der Stream wurde nie angehaengt: Bild schwarz,
                 Panel offen. Eine Wettlaufsituation — in der Browserpruefung
                 als "Kamera oft schwarz beim ersten Start" gemeldet.
   SOLLVERHALTEN Ein Effekt auf cameraOpen laeuft nach dem Commit; das
                 Element existiert dann garantiert.
   GRENZE        Diese Pruefung liest den Quelltext. Ob der Stream auf einem
                 echten Geraet erscheint, kann nur die Browserpruefung
                 belegen — sie ersetzt sie nicht. */
{
  const quelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  const startBlock = quelle.slice(
    quelle.indexOf("const startCamera"),
    quelle.indexOf("const shoot ="));
  const keinFrame = !/requestAnimationFrame[\s\S]{0,120}srcObject/.test(startBlock);
  const effekt = /useEffect\(\(\) => \{[\s\S]{0,400}srcObject = stream[\s\S]{0,400}\}, \[cameraOpen/.test(startBlock);
  const fehlerSichtbar = !/play\(\)\.catch\(\(\) => \{\}\)/.test(startBlock);
  ok("U11", "Kamerastream wird nach dem Render angehaengt, Fehler nicht verschluckt",
    keinFrame && effekt && fehlerSichtbar,
    `kein rAF: ${keinFrame} · Effekt auf cameraOpen: ${effekt} · play-Fehler sichtbar: ${fehlerSichtbar}`);
}

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
