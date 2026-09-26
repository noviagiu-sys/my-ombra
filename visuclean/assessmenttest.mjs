/* ─── VisuClean · Prüfpunkt-Bewertung und Gesamtergebnis (RC3) ─────────────
   Aufruf: node assessmenttest.mjs

   Weist die neuen Entscheidungsregeln nach. Der Nachweis stützt sich auf
   die realen Edelstahlbilder und auf synthetische Fälle; die Sollwerte sind
   am Code gemessen und je Fall mit dem auslösenden Messwert dokumentiert.

   Zählung: BESTANDEN / DURCHGEFALLEN. Bekannte Einschränkungen werden hier
   NICHT als Erfolg gezählt — dafür gibt es kalibrierung.mjs.              */

import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { computeFeatures, buildVerdicts } from "./src/analysisCore.js";
import {
  STATUS, OVERALL, CHECKPOINTS, buildCheckpoints, overallResult,
  applyManualSubstitute, assessmentSummary,
} from "./src/assessment.js";
import { verdictDisplay } from "./src/i18n.js";
import { CAPTURE_PATH, captureProfile } from "./src/decision.js";
import { LICHTPOSITION, feuchteSequenzStatus } from "./src/capturePaths.js";
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
function syn(seed, fn) {
  const r = rng(seed), d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, [a, b, c] = fn(x, y, r);
    d[i] = a; d[i + 1] = b; d[i + 2] = c; d[i + 3] = 255;
  }
  return d;
}
const flach = (r, m = 150) => { const v = m + Math.round((r() - 0.5) * 6); return [v, v, v]; };
function weichzeichnen(data, w, h, rad) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = (ny * w + nx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}
const real = n => PNG.sync.read(fs.readFileSync(new URL(`./tests/fixtures/real/${n}`, import.meta.url)));
/* Alle Szenarien dieser Suite pruefen etwas ANDERES als das Feuchte-Tor.
   Sie setzen eine ordentlich aufgenommene Pruefung voraus und bekommen
   deshalb eine vollstaendige Feuchte-Sequenz mit. Das Tor selbst wird in
   A25 bis A33 eigens geprueft. */
const bewerte = (data, w = W, h = H) => {
  const f = computeFeatures(data, w, h);
  const cps = buildCheckpoints(f, buildVerdicts(f), mitFeuchteSequenz());
  return { f, cps, gesamt: overallResult(cps), byId: Object.fromEntries(cps.map(c => [c.id, c])) };
};

console.log("VisuClean · Prüfpunkt-Bewertung und Gesamtergebnis");
console.log("");
console.log("── Struktur ──");

const sauber = bewerte(syn(11, (x, y, r) => flach(r)));
ok("A1", "Genau fuenf Pruefpunkte, alle erforderlich",
  sauber.cps.length === 5 && sauber.cps.every(c => c.required)
  && CHECKPOINTS.map(c => c.id).join() === sauber.cps.map(c => c.id).join(),
  sauber.cps.map(c => c.id).join(", "));

ok("A2", "Jeder Pruefpunkt traegt Status, Code, Messwerte und deutsche Bezeichnung",
  sauber.cps.every(c => [STATUS.PASS, STATUS.FAIL, STATUS.NOT_ASSESSABLE].includes(c.status)
    && typeof c.code === "string" && c.label.de && c.message.de && c.measurements),
  "Status-Trias vollstaendig");

console.log("");
console.log("── Einzelne Pruefpunkte ──");

const kratzer = bewerte(syn(13, (x, y, r) =>
  (Math.abs(y - (30 + 0.35 * x)) < 1.2 && x > 15 && x < 185) ? [92, 92, 94] : flach(r)));
ok("A3", "Kratzer faellt einzeln durch, die uebrigen Punkte bleiben bestanden",
  kratzer.byId.scratch.status === STATUS.FAIL
  && ["moisture", "residue", "corrosion", "surface"].every(id => kratzer.byId[id].status === STATUS.PASS),
  `scratch ${kratzer.byId.scratch.code} · ${kratzer.f.scratches.length} Struktur(en)`);

const rueckstand = bewerte(syn(14, (x, y, r) =>
  (x > 50 && x < 150 && y > 40 && y < 110) ? [172, 132, 82] : flach(r)));
ok("A4", "Rueckstand faellt einzeln durch",
  rueckstand.byId.residue.status === STATUS.FAIL && rueckstand.byId.moisture.status === STATUS.PASS,
  `residue ${rueckstand.byId.residue.code} · wf ${rueckstand.f.wf.toFixed(4)}`);

const tropfen = bewerte(syn(15, (x, y, r) => {
  for (const [cx, cy] of [[30, 30], [70, 40], [110, 35], [150, 80], [50, 110], [130, 120], [170, 55], [90, 75]])
    if ((x - cx) ** 2 + (y - cy) ** 2 < 20) return [250, 250, 252];
  return flach(r);
}));
ok("A5", "Feuchtigkeit faellt einzeln durch",
  tropfen.byId.moisture.status === STATUS.FAIL,
  `moisture ${tropfen.byId.moisture.code} · bfr ${tropfen.f.bfr.toFixed(4)}`);

console.log("");
console.log("── NOT_ASSESSABLE statt falschem PASS (Kern von RC3) ──");

const nass = real("wet-stainless-wide.png");
const nassScharf = bewerte(nass.data, nass.width, nass.height);
ok("A6", "Ausgangslage: die scharfe nasse Aufnahme faellt begruendet durch",
  nassScharf.byId.moisture.status === STATUS.FAIL
  && nassScharf.byId.surface.status === STATUS.FAIL
  && nassScharf.gesamt.status === OVERALL.BLOCKED,
  `moisture ${nassScharf.byId.moisture.code} · surface ${nassScharf.byId.surface.code}`);

const nassUnscharf = bewerte(weichzeichnen(nass.data, nass.width, nass.height, 1), nass.width, nass.height);
ok("A7", "RC2-FEHLER BEHOBEN: die unscharfe nasse Aufnahme meldet NICHT mehr trocken",
  nassUnscharf.byId.moisture.status === STATUS.NOT_ASSESSABLE,
  `moisture ${nassUnscharf.byId.moisture.status} (${nassUnscharf.byId.moisture.code}) — in RC2 war es PASS "Keine sichtbare Feuchtigkeit"`);

ok("A8", "Oberflaeche und Korrosion sind bei derselben Aufnahme nicht bewertbar",
  nassUnscharf.byId.surface.status === STATUS.NOT_ASSESSABLE
  && nassUnscharf.byId.corrosion.status === STATUS.NOT_ASSESSABLE,
  `tvFlat ${nassUnscharf.f.tvFlat.toFixed(4)} (>0.020) · vdfr ${nassUnscharf.f.vdfr.toFixed(4)} (>0.04) · `
  + `edgeFrac ${(nassUnscharf.f.edgeFrac * 100).toFixed(2)} % (Tor 6 %) · anomBlockFrac ${nassUnscharf.f.anomBlockFrac.toFixed(3)} (<0.18)`);

ok("A9", "Jeder nicht bewertbare Punkt nennt Grund und naechste Handlung",
  nassUnscharf.cps.filter(c => c.status === STATUS.NOT_ASSESSABLE)
    .every(c => typeof c.reason === "string" && c.reason.length > 20 && c.actions.length > 0
      && c.actions.some(a => /Aufnahme wiederholen/.test(a.de))
      && c.actions.some(a => /Manuelle Sichtpruefung|Manuelle Sichtprüfung/.test(a.de))),
  nassUnscharf.byId.moisture.actions.map(a => a.de).join(" · "));

ok("A10", "Der nicht bewertbare Zustand bleibt auf den betroffenen Punkt begrenzt",
  nassUnscharf.byId.residue.status === STATUS.FAIL
  && nassUnscharf.byId.scratch.status === STATUS.PASS,
  "residue behaelt sein eigenes FAIL, scratch sein eigenes PASS");

console.log("");
console.log("── Gesamtergebnis ──");

ok("A11", "Regel 1: ein FAIL sperrt das Gesamtergebnis",
  kratzer.gesamt.status === OVERALL.BLOCKED && kratzer.gesamt.blocked === true
  && kratzer.gesamt.failed.includes("scratch"),
  kratzer.gesamt.message.de);

/* Fall ohne FAIL, aber mit nicht bewertbarem Pflichtpunkt */
const nurNb = [
  { ...sauber.byId.moisture, status: STATUS.NOT_ASSESSABLE, required: true, reason: "Testfall" },
  sauber.byId.residue, sauber.byId.scratch, sauber.byId.corrosion, sauber.byId.surface,
];
const gNurNb = overallResult(nurNb);
ok("A12", "Regel 2: ohne FAIL, aber mit nicht bewertbarem Pflichtpunkt gibt es kein PASS",
  gNurNb.status === OVERALL.NOT_ASSESSABLE && gNurNb.status !== OVERALL.PASS && gNurNb.blocked === true,
  gNurNb.message.de);

ok("A13", "Regel 3: PASS nur, wenn alle erforderlichen Punkte bewertbar und bestanden sind",
  sauber.gesamt.status === OVERALL.PASS && sauber.cps.every(c => c.status === STATUS.PASS),
  sauber.gesamt.message.de);

ok("A14", "Regel 4: eine schlechte Aufnahme wird nicht zu PASS",
  nassUnscharf.gesamt.status !== OVERALL.PASS,
  `Gesamt ${nassUnscharf.gesamt.status}`);

const trocken = real("dry-stainless-control.png");
const trockenB = bewerte(trocken.data, trocken.width, trocken.height);
ok("A15", "Keine Ueberkorrektur: die trockene Kontrollaufnahme bleibt PASS",
  trockenB.gesamt.status === OVERALL.PASS,
  `anomBlockFrac ${trockenB.f.anomBlockFrac.toFixed(3)} (>=0.18) belegt Geometrie/Beleuchtung — `
  + `${trockenB.byId.surface.code}`);

const trockenUnscharf = bewerte(weichzeichnen(trocken.data, trocken.width, trocken.height, 1), trocken.width, trocken.height);
ok("A16", "Keine Ueberkorrektur: auch leicht unscharf bleibt die saubere Flaeche PASS",
  trockenUnscharf.gesamt.status === OVERALL.PASS,
  `anomBlockFrac ${trockenUnscharf.f.anomBlockFrac.toFixed(3)}`);

console.log("");
console.log("── Manuelle Ersatzpruefung ──");

const mSub = applyManualSubstitute(nassUnscharf.cps, {
  checkpointId: "moisture", status: STATUS.FAIL, reason: "Oberflaeche mit Tuch geprueft, deutlich feucht",
  method: "Manuelle Sichtpruefung und Wischtest", user: "qa_manager", timestamp: "2026-08-29T09:15:00.000Z",
});
ok("A17", "Eine manuelle Ersatzpruefung ersetzt genau den nicht bewertbaren Punkt",
  mSub.error === null && mSub.checkpoints.find(c => c.id === "moisture").status === STATUS.FAIL
  && mSub.checkpoints.find(c => c.id === "surface").status === STATUS.NOT_ASSESSABLE,
  "moisture manuell entschieden, surface bleibt offen");

const m = mSub.checkpoints.find(c => c.id === "moisture").manual;
ok("A18", "Der Ersatzpruefung liegen Pruefpunkt, Begruendung, Methode, Benutzer und Zeitstempel bei",
  m && m.method && m.user && m.timestamp && m.reason && m.replacedStatus === STATUS.NOT_ASSESSABLE,
  `${m.user} · ${m.timestamp} · ${m.method}`);

ok("A19", "Ein FAIL kann nicht per Ersatzpruefung ueberschrieben werden",
  applyManualSubstitute(kratzer.cps, {
    checkpointId: "scratch", status: STATUS.PASS, reason: "sieht ok aus",
    method: "Sicht", user: "operator1", timestamp: "2026-08-29T09:15:00.000Z",
  }).error !== null,
  "nur nicht bewertbare Pruefpunkte duerfen manuell ersetzt werden");

ok("A20", "Unvollstaendige Ersatzpruefungen werden abgewiesen",
  ["reason", "method", "user", "timestamp"].every(feld => {
    const s = { checkpointId: "moisture", status: STATUS.PASS, reason: "x", method: "y", user: "z", timestamp: "t" };
    delete s[feld];
    return applyManualSubstitute(nassUnscharf.cps, s).error !== null;
  }),
  "jede fehlende Pflichtangabe fuehrt zur Ablehnung");

console.log("");
console.log("── Determinismus ──");

const zweiterLauf = bewerte(weichzeichnen(nass.data, nass.width, nass.height, 1), nass.width, nass.height);
ok("A21", "Gleiche Eingabe ergibt zeichengleiche Bewertung",
  JSON.stringify(assessmentSummary(nassUnscharf.cps)) === JSON.stringify(assessmentSummary(zweiterLauf.cps)),
  "vollstaendige Zusammenfassung verglichen");

const reihenfolge = [sauber, kratzer, rueckstand, tropfen].map(x => JSON.stringify(x.gesamt));
const reihenfolgeRueck = [tropfen, rueckstand, kratzer, sauber]
  .map(x => JSON.stringify(overallResult(x.cps))).reverse();
ok("A22", "Kein verborgener Zustand zwischen Bewertungen",
  JSON.stringify(reihenfolge) === JSON.stringify(reihenfolgeRueck),
  "vier Faelle vorwaerts und rueckwaerts ausgewertet");

const echt = Math.random; let benutzt = false;
Math.random = () => { benutzt = true; return echt(); };
buildCheckpoints(nassUnscharf.f, buildVerdicts(nassUnscharf.f));
overallResult(nassUnscharf.cps);
Math.random = echt;
/* A24 - Pruefpunkt und Ergebnisanzeige duerfen nicht auseinanderlaufen
   analysisCore.js meldet ORGANIC_RESIDUE mit dem Text "Organische
   Rueckstaende (braun/gelb)". Gemessen wird der Anteil warmer Pixel -
   daraus folgt keine Stoffklasse. Der Kern bleibt byte-identisch zu RC3
   (Hash-Zusage), die Formulierung wird eine Schicht hoeher
   richtiggestellt; so war die Konfliktaufloesung fuer RC4 geplant.

   Bis rc.4.21 war sie nur an EINER Stelle durchgezogen. Der Pruefpunkt
   "Rueckstaende / Sauberkeit" reichte v.clean.message roh durch. Auf dem
   echten Handy-Bildschirm des Auftraggebers standen daher beide Saetze
   untereinander - die Stoffklassenbehauptung oben, die Richtigstellung
   darunter. Man liest die obere zuerst.

   Dieser Test bindet beide Schichten an dieselbe Quelle. Er prueft nicht
   einen Wortlaut, sondern die GLEICHHEIT - sonst haelt er nur bis zur
   naechsten Umformulierung.                                            */
{
  const kern = { code: "ORGANIC_RESIDUE", pass: false,
    message: "Organische Rückstände (braun/gelb)",
    detail: "38.7% warme Pixel (nach Beleuchtungs-Normalisierung)",
    severity: 100, action: "Nachreinigung · Produktrückstände prüfen" };
  const angezeigt = verdictDisplay(kern, "clean", "de");
  const punkte = buildCheckpoints(
    { wf: 0.387, warmBlocks: 12, cv: 0.2, scratches: [], edgeFrac: 0.1 },
    { clean: kern, dry: { pass: true, code: "PASS" }, intact: { pass: true, code: "PASS" } });
  const residue = punkte.find(c => c.id === "residue");

  const gleich = residue?.message?.de === angezeigt.message;
  /* Und die Stoffklassenbehauptung darf in KEINER der beiden Schichten
     mehr auftauchen. */
  const text = `${residue?.message?.de || ""} ${residue?.reason || ""} `
    + `${angezeigt.message} ${angezeigt.detail}`;
  const ohneStoffklasse = !/organische/i.test(text);
  ok("A24", "Pruefpunkt und Ergebnisanzeige nennen denselben Befund gleich",
    gleich && ohneStoffklasse,
    gleich
      ? `beide: "${residue?.message?.de}" · ohne Stoffklassenbehauptung ${ohneStoffklasse}`
      : `Pruefpunkt: "${residue?.message?.de}" ≠ Anzeige: "${angezeigt.message}"`);

  /* A34 - dieselbe Bindung im ENGLISCHEN.
     A24 prueft seit rc.4.22 den deutschen Pfad. Der englische lief
     daneben her: EN_VERDICTS in i18n.js trug eine EIGENE Kopie des
     korrigierten Satzes. Zwei Kopien laufen frueher oder spaeter
     auseinander, und dann sagt die App in zwei Sprachen zwei
     verschiedene Dinge ueber denselben Befund - in einem GMP-Protokoll
     ist das kein Schoenheitsfehler.

     Geprueft wird auch hier die GLEICHHEIT, nicht der Wortlaut.        */
  const angezeigtEn = verdictDisplay(kern, "clean", "en");
  const gleichEn = residue?.message?.en === angezeigtEn.message;
  const ohneStoffklasseEn = !/organic/i.test(
    `${residue?.message?.en || ""} ${angezeigtEn.message}`);
  ok("A34", "Auch im Englischen nennen Pruefpunkt und Anzeige denselben Befund gleich",
    gleichEn && ohneStoffklasseEn,
    gleichEn
      ? `beide: "${residue?.message?.en}" · ohne Stoffklassenbehauptung ${ohneStoffklasseEn}`
      : `Pruefpunkt: "${residue?.message?.en}" ≠ Anzeige: "${angezeigtEn.message}"`);
}

ok("A23", "Die Bewertung ruft Math.random nicht auf", !benutzt, "instrumentiert");

/* ── A25-A27, A29-A31 · Kein Trocken-PASS ohne Aufnahmesequenz ──────────
   ERSETZT die Regel aus rc.4.24. Dort haengte die Wache am
   Verkleinerungsfaktor. Die Messung hat diese Begruendung widerlegt:

     Beide nassen Realaufnahmen bleiben bis hinunter zu 120x160 korrekt
     als nass erkannt. Aufloesung ist NICHT der Mechanismus.

   Und an zwei weiteren nassen Realaufnahmen zeigte sich der wirkliche
   Befund - verstreute Tropfen auf viel glatter Flaeche sind mit den
   vorhandenen Merkmalen ueberhaupt nicht von trocken zu trennen:

     nasse Spuele 1       edgeFrac 0.0423   gradMean 0.0428
     nasse Spuele 2       edgeFrac 0.0361   gradMean 0.0424
     trockene Kontrolle   edgeFrac 0.0296   gradMean 0.0355

   Der Abstand nass/trocken ist kleiner als die Streuung innerhalb der
   nassen Klasse. Keine Schwelle trennt das.

   Deshalb die neue Bedingung: ohne standardisierte Feuchte-Aufnahme-
   sequenz (normal, Streiflicht links, Streiflicht rechts) entsteht aus
   dem Feuchtealgorithmus KEIN automatisches Trocken-PASS.              */

/* Merkmale einer Aufnahme, die durch alle drei FAIL-Wege faellt. */
const ohneFeuchtehinweis = {
  lm: 0.45, bfr: 0.005, dfr: 0.19, vdfr: 0.026,
  gradMean: 0.043, edgeFrac: 0.042, tvFlat: 0.014,
  wf: 0.02, warmBlocks: 0, warmBlockFrac: 0, cv: 0.1,
  anomBlockFrac: 0.17, scratches: [], specular: false, droplets: false,
};
const ohneHinweisUrteil = buildVerdicts(ohneFeuchtehinweis);

const vollstaendigeSequenz = {
  zoneId: "die",
  captures: [
    { lichtposition: LICHTPOSITION.NORMAL, photoId: "p1", zoneId: "die" },
    { lichtposition: LICHTPOSITION.STREIFLICHT_LINKS, photoId: "p2", zoneId: "die" },
    { lichtposition: LICHTPOSITION.STREIFLICHT_RECHTS, photoId: "p3", zoneId: "die" },
  ],
};
const halbeSequenz = { zoneId: "die", captures: [vollstaendigeSequenz.captures[0]] };

const punkteOhneSequenz = buildCheckpoints(ohneFeuchtehinweis, ohneHinweisUrteil, {});
const feuchteOhneSequenz = punkteOhneSequenz.find(c => c.id === "moisture");

ok("A25", "Ohne Aufnahmesequenz entsteht kein automatisches Trocken-PASS",
  feuchteOhneSequenz?.status === STATUS.NOT_ASSESSABLE,
  ohneHinweisUrteil.dry.pass
    ? `Kern meldet PASS (Kaskade durchgefallen) · Pruefpunkt: ${feuchteOhneSequenz?.status}`
    : "Vorbedingung verfehlt: der Kern meldet hier kein PASS, der Test belegt nichts");

/* Der vereinbarte Wortlaut, woertlich. Ein Test auf den Status allein
   liesse zu, dass daneben etwas anderes steht. */
const SOLL_TEXT = "Kein algorithmischer Feuchtehinweis erkannt. "
  + "Trockenheit mit dieser Aufnahme nicht zuverlässig beurteilbar.";
const gezeigt = `${feuchteOhneSequenz?.message?.de || ""} ${feuchteOhneSequenz?.reason || ""}`;
ok("A29", "Der vereinbarte Wortlaut steht woertlich im Pruefpunkt",
  gezeigt.includes(SOLL_TEXT),
  gezeigt.includes(SOLL_TEXT) ? "woertlich vorhanden"
    : `gefunden: "${gezeigt.trim().slice(0, 120)}"`);

/* Manuell bestaetigbar: NOT_ASSESSABLE ist der einzige Status, den
   applyManualSubstitute annimmt. Der Auftraggeber verlangt ausdruecklich,
   dass der Feuchtepunkt manuell bestaetigt werden kann. */
const nachManuell = applyManualSubstitute(punkteOhneSequenz, {
  checkpointId: "moisture", status: STATUS.PASS,
  reason: "Sichtpruefung mit Streiflicht durch den Pruefer",
  method: "SICHTPRUEFUNG", user: "operator1", timestamp: "2026-09-12T18:00:00.000Z",
});
ok("A30", "Der Feuchtepunkt bleibt manuell bestaetigbar",
  !nachManuell.error
    && nachManuell.checkpoints.find(c => c.id === "moisture")?.status === STATUS.PASS,
  nachManuell.error || "manuell auf PASS gesetzt, Begruendung und Person gebunden");

/* Andere geeignete Pruefpunkte duerfen dadurch nicht blockiert werden. */
const andere = punkteOhneSequenz.filter(c => c.id !== "moisture");
const andereBewertet = andere.every(c => c.status !== STATUS.NOT_ASSESSABLE);
ok("A31", "Die uebrigen Pruefpunkte bleiben bewertbar",
  andereBewertet,
  andere.map(c => `${c.id}:${c.status}`).join(" · "));

/* Mit vollstaendiger Sequenz ist ein PASS wieder moeglich. Sonst waere
   die Regel keine Wache, sondern eine Abschaltung. */
const punkteMitSequenz = buildCheckpoints(ohneFeuchtehinweis, ohneHinweisUrteil,
  { feuchteSequenz: vollstaendigeSequenz });
ok("A26", "Mit vollstaendiger Aufnahmesequenz ist ein Trocken-PASS wieder moeglich",
  punkteMitSequenz.find(c => c.id === "moisture")?.status === STATUS.PASS,
  `Pruefpunkt: ${punkteMitSequenz.find(c => c.id === "moisture")?.status}`);

/* UMGEKEHRT ZU rc.4.24: die Warnung darf NICHT an scaleFactor haengen und
   nicht bei voller Aufloesung verschwinden. Volles Bild, keine
   Verkleinerung, aber auch keine Sequenz -> weiter nicht bewertbar. */
const profilVoll = captureProfile({
  processedWidth: 1932, processedHeight: 2576,
  sourceWidth: 1932, sourceHeight: 2576, path: CAPTURE_PATH.CAMERA,
});
const punkteVollOhneSequenz = buildCheckpoints(ohneFeuchtehinweis, ohneHinweisUrteil,
  { captureProfile: profilVoll });
ok("A27", "Bei voller Aufloesung ohne Sequenz verschwindet die Warnung NICHT",
  punkteVollOhneSequenz.find(c => c.id === "moisture")?.status === STATUS.NOT_ASSESSABLE,
  `scaleFactor ${profilVoll.scaleFactor} · Pruefpunkt: `
    + `${punkteVollOhneSequenz.find(c => c.id === "moisture")?.status}`);

/* Und eine halbe Sequenz reicht nicht. */
const punkteHalb = buildCheckpoints(ohneFeuchtehinweis, ohneHinweisUrteil,
  { feuchteSequenz: halbeSequenz });
ok("A32", "Eine unvollstaendige Sequenz reicht nicht",
  punkteHalb.find(c => c.id === "moisture")?.status === STATUS.NOT_ASSESSABLE,
  `fehlend: ${feuchteSequenzStatus(halbeSequenz).fehlend.join(", ")}`);

/* Ein Feuchtigkeits-FAIL bleibt unter allen Umstaenden ein FAIL. */
const nassMitGlanz = { ...ohneFeuchtehinweis, bfr: 0.09, droplets: true };
const punkteFail = buildCheckpoints(nassMitGlanz, buildVerdicts(nassMitGlanz), {});
ok("A33", "Ein Feuchtigkeits-FAIL bleibt ein FAIL, auch ohne Sequenz",
  punkteFail.find(c => c.id === "moisture")?.status === STATUS.FAIL,
  `Kern: ${buildVerdicts(nassMitGlanz).dry.code} · Pruefpunkt: `
    + `${punkteFail.find(c => c.id === "moisture")?.status}`);

/* A28 - Die Wache muss im ECHTEN Aufnahmeweg haengen.
   Lehre aus rc.4.19: das Kratzer-Screening wurde gerechnet und nie
   benutzt, und keine Pruefung fiel darueber. Eine Wache, die nur in einem
   Testaufruf greift, ist keine Wache.

   Geprueft wird am Quelltext, weil der Aufnahmeweg eine Kamera braucht.
   Bis rc.4.25 stand hier das Aufnahmeprofil; seit rc.4.26 haengt die
   Feuchtewache an der AUFNAHMESEQUENZ, nicht mehr am
   Verkleinerungsfaktor - der Auftraggeber hat das ausdruecklich
   ausgeschlossen. Der Test folgt der Regel, die tatsaechlich gilt.     */
{
  const appQuelle = await readFile(new URL("./src/App.jsx", import.meta.url), "utf8");
  const aufruf = appQuelle.match(/buildCheckpoints\(([^)]*)\)/);
  const argumente = aufruf ? aufruf[1].split(",").map(t => t.trim()) : [];
  const dreiArgumente = argumente.length === 3;
  /* Das dritte Argument muss die Feuchte-Sequenz tragen. */
  const nenntSequenz = dreiArgumente && /feuchteSequenz/i.test(argumente[2]);

  /* Und der Verkleinerungsfaktor darf die Bewertung nicht mehr steuern:
     in assessment.js darf scaleFactor gar nicht mehr vorkommen. Sonst
     koennte die alte Kopplung unbemerkt zurueckkehren. */
  const bewertung = await readFile(new URL("./src/assessment.js", import.meta.url), "utf8");
  /* Kommentare ZUERST entfernen. Der Quelltext erklaert ausfuehrlich,
     WARUM scaleFactor dort nichts mehr zu suchen hat - eine Suche ueber
     den Rohtext traefe genau diese Erklaerung und meldete einen Fehler,
     wo eine Begruendung steht. Derselbe Fehler wie frueher bei S49. */
  const ohneKommentare = bewertung
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const ohneSkalenfaktor = !/scaleFactor/.test(ohneKommentare);

  ok("A28", "Der echte Aufnahmeweg uebergibt die Feuchte-Sequenz, nicht den Skalenfaktor",
    dreiArgumente && nenntSequenz && ohneSkalenfaktor,
    dreiArgumente
      ? `drittes Argument "${argumente[2]}" · nennt Sequenz ${nenntSequenz}`
        + ` · assessment.js ohne scaleFactor ${ohneSkalenfaktor}`
      : `buildCheckpoints wird mit ${argumente.length} Argumenten aufgerufen`);
}

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
