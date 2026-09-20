/* ─── VisuClean · Optionale KI-Gegenprüfung (RC3) ──────────────────────────
   Aufruf: node aitest.mjs

   Zwei Betriebsarten müssen möglich sein: rein lokal und mit zusätzlicher
   Gegenprüfung. Die KI darf das lokale Ergebnis niemals stillschweigend
   überschreiben; bei Widerspruch ist eine manuelle Entscheidung nötig.
   Ohne konfigurierte KI muss sich alles genauso bedienen wie bisher.     */

/* analysisCore wird hier nicht direkt gebraucht: die Pruefpunkte kommen
   fertig aus runLocalEngine(). */
import { buildCheckpoints, overallResult, STATUS, OVERALL } from "./src/assessment.js";
import {
  approvedAiStatus, runApprovedAiEngine, runLocalEngine,
  crossCheckAssessment, recordManualDecision, CROSS_CHECK, APPROVED_AI_ENGINE,
} from "./src/analysisEngines.js";
import { mitFeuchteSequenz } from "./tests/feuchteSequenz.mjs";

const R = [];
const ok = (id, name, bestanden, info = "") => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

function rng(a) {
  return () => { a |= 0; a = a + 0x9E3779B9 | 0;
    let t = Math.imul(a ^ a >>> 16, 0x85EBCA6B);
    t = Math.imul(t ^ t >>> 13, 0xC2B2AE35);
    return ((t ^ t >>> 16) >>> 0) / 4294967296; };
}
const W = 200, H = 150;
const sauberDaten = (() => {
  const r = rng(41), d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = 150 + Math.round((r() - 0.5) * 6);
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  return d;
})();

const lokal = runLocalEngine(sauberDaten, W, H);
/* Vollstaendige Feuchte-Sequenz: diese Suite prueft den Vertrag der
   KI-Zweitmeinung, nicht das Feuchte-Tor (A25 bis A33). */
const lokaleCps = buildCheckpoints(lokal.features, lokal.verdict, mitFeuchteSequenz());
const urteil = (pass, code) => ({ pass, code, message: code, detail: "", severity: pass ? 0 : 50, action: "" });

console.log("VisuClean · Optionale KI-Gegenprüfung");
console.log("");
console.log("── Standardbetrieb: KI deaktiviert ──");

ok("K1", "Ohne Konfiguration ist die KI deaktiviert",
  approvedAiStatus().mode === "disabled" && approvedAiStatus({}).mode === "disabled"
  && APPROVED_AI_ENGINE.mode === "disabled",
  "keine Zugangsdaten noetig");

const ausgeschaltet = await runApprovedAiEngine(null, {});
ok("K2", "Der deaktivierte KI-Aufruf liefert kein Urteil und wirft nicht",
  ausgeschaltet.status === "disabled" && ausgeschaltet.verdict === null,
  "status disabled");

const nurLokal = crossCheckAssessment(lokaleCps, ausgeschaltet);
ok("K3", "Ohne KI bleibt das lokale Ergebnis unveraendert bedienbar",
  nurLokal.mode === CROSS_CHECK.LOCAL_ONLY && nurLokal.reviewRequired === false
  && nurLokal.checkpoints.length === lokaleCps.length
  && nurLokal.checkpoints.every((c, i) => c.status === lokaleCps[i].status && c.crossCheck === null),
  "fuenf Pruefpunkte, keine Gegenpruefung, kein Reviewbedarf");

ok("K4", "Auch das Gesamtergebnis bleibt ohne KI unveraendert",
  JSON.stringify(overallResult(nurLokal.checkpoints)) === JSON.stringify(overallResult(lokaleCps)),
  overallResult(lokaleCps).status);

/* Eine konfigurierte KI darf ohne Adapter nicht als verfuegbar gelten. */
ok("K5", "Ein Schalter allein aktiviert die KI nicht — es braucht einen Adapter",
  approvedAiStatus({ enabled: true }).mode === "disabled",
  "enabled ohne adapter bleibt disabled");

console.log("");
console.log("── Betrieb mit Gegenpruefung ──");

const kiEinig = await runApprovedAiEngine(null, {
  enabled: true, version: "test-1",
  adapter: async () => ({ dry: urteil(true, "AI_DRY"), clean: urteil(true, "AI_CLEAN"), intact: urteil(true, "AI_INTACT") }),
});
const einig = crossCheckAssessment(lokaleCps, kiEinig);
ok("K6", "Bei Uebereinstimmung entsteht kein Reviewbedarf",
  einig.mode === CROSS_CHECK.AGREEMENT && einig.reviewRequired === false
  && einig.checkpoints.every(c => c.crossCheck.result === CROSS_CHECK.AGREEMENT),
  "alle fuenf Pruefpunkte einig");

const kiWiderspruch = await runApprovedAiEngine(null, {
  enabled: true, version: "test-1",
  adapter: async () => ({ dry: urteil(false, "AI_WET"), clean: urteil(true, "AI_CLEAN"), intact: urteil(true, "AI_INTACT") }),
});
const wider = crossCheckAssessment(lokaleCps, kiWiderspruch);
const feuchte = wider.checkpoints.find(c => c.id === "moisture");
ok("K7", "Ein Widerspruch verlangt eine manuelle Entscheidung",
  wider.mode === CROSS_CHECK.CONTRADICTION && wider.reviewRequired === true
  && feuchte.crossCheck.result === CROSS_CHECK.CONTRADICTION,
  `lokal ${feuchte.crossCheck.localStatus} · KI ${feuchte.crossCheck.aiStatus}`);

ok("K8", "Die KI ueberschreibt das lokale Ergebnis NICHT stillschweigend",
  feuchte.status === lokaleCps.find(c => c.id === "moisture").status,
  `Pruefpunktstatus bleibt ${feuchte.status}, der KI-Wert steht daneben in crossCheck`);

ok("K9", "Uebereinstimmende Pruefpunkte bleiben vom Widerspruch unberuehrt",
  wider.checkpoints.filter(c => c.id !== "moisture")
    .every(c => c.crossCheck.result === CROSS_CHECK.AGREEMENT),
  "nur der widersprechende Punkt verlangt eine Entscheidung");

console.log("");
console.log("── Manuelle Entscheidung ──");

ok("K10", "Eine unvollstaendige Entscheidung wird abgewiesen",
  ["chosenSource", "user", "timestamp", "reason"].every(feld => {
    const d = { checkpointId: "moisture", chosenSource: "local", user: "u", timestamp: "t", reason: "r" };
    delete d[feld];
    return recordManualDecision(wider, d).error != null;
  }),
  "jede fehlende Pflichtangabe blockiert");

const entschieden = recordManualDecision(wider, {
  checkpointId: "moisture", chosenSource: "ai", user: "qa_manager",
  timestamp: "2026-08-29T12:00:00.000Z", reason: "Nachkontrolle vor Ort bestaetigt Restfeuchte",
});
ok("K11", "Die dokumentierte Entscheidung traegt Quelle, Benutzer, Zeit und Begruendung",
  entschieden.error === null && entschieden.decisions.length === 1
  && entschieden.decisions[0].chosenSource === "ai"
  && entschieden.decisions[0].user === "qa_manager"
  && entschieden.decisions[0].localStatus === STATUS.PASS
  && entschieden.decisions[0].aiStatus === STATUS.FAIL
  && entschieden.decisions[0].reason.length > 10,
  `${entschieden.decisions[0].chosenSource} · ${entschieden.decisions[0].user} · ${entschieden.decisions[0].timestamp}`);

ok("K12", "Nach der Entscheidung ist kein Review mehr offen und der Status ist gesetzt",
  entschieden.reviewRequired === false
  && entschieden.checkpoints.find(c => c.id === "moisture").status === STATUS.FAIL
  && overallResult(entschieden.checkpoints).status === OVERALL.BLOCKED,
  "Gesamtergebnis gesperrt, weil die Entscheidung auf FAIL lautete");

ok("K13", "Ohne Widerspruch gibt es nichts zu entscheiden",
  recordManualDecision(einig, {
    checkpointId: "moisture", chosenSource: "ai", user: "u",
    timestamp: "2026-08-29T12:00:00.000Z", reason: "grundlos",
  }).error != null,
  "nur Widersprueche verlangen eine manuelle Entscheidung");

console.log("");
console.log("── Die KI ersetzt keine fehlende lokale Aussage ──");

const nichtBewertbar = lokaleCps.map(c =>
  c.id === "surface" ? { ...c, status: STATUS.NOT_ASSESSABLE, code: "NOT_ASSESSABLE_NO_EDGE_SUPPORT" } : c);
const mitKi = crossCheckAssessment(nichtBewertbar, kiEinig);
const flaeche = mitKi.checkpoints.find(c => c.id === "surface");
ok("K14", "Ein lokal nicht bewertbarer Punkt bleibt nicht bewertbar, auch wenn die KI PASS sagt",
  flaeche.status === STATUS.NOT_ASSESSABLE
  && flaeche.crossCheck.result === CROSS_CHECK.CONTRADICTION
  && /ersetzt keine fehlende lokale Aussage/.test(flaeche.crossCheck.note.de),
  `KI sagt ${flaeche.crossCheck.aiStatus}, lokal bleibt ${flaeche.status}`);

ok("K15", "Ein ungueltiges KI-Urteil wird zurueckgewiesen",
  await (async () => {
    try {
      await runApprovedAiEngine(null, { enabled: true, adapter: async () => ({ dry: { pass: "vielleicht" } }) });
      return false;
    } catch (e) { return /kein gültiges Urteil/.test(e.message); }
  })(),
  "unvollstaendiges Urteil fuehrt zum Fehler statt zu einem stillen PASS");

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
