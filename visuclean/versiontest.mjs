/* ─── VisuClean · Versionsgleichstand ──────────────────────────────────────
   Aufruf:  node versiontest.mjs

   Befund der Gegenpruefung: die Version steht an drei Stellen unabhaengig
   voneinander — package.json (Manifest), src/domain.js (Oberflaeche, PDF,
   Audit, QR-Etiketten) und public/sw.js (Cache-Schluessel). Keine davon ist
   abgeleitet, und nichts verglich sie. Eine Divergenz waere unbemerkt bis in
   den Pruefdatensatz gewandert.

   Diese Suite schliesst die Luecke: laufen die drei auseinander, faellt das
   Tor, statt eine falsche Version zu protokollieren.                       */

import { readFile, readdir } from "node:fs/promises";
import { APP_VERSION } from "./src/domain.js";

const R = [];
const ok = (id, name, bestanden, info = "") => {
  R.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
};

console.log("VisuClean · Versionsgleichstand");
console.log("");

const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const sw = await readFile(new URL("./public/sw.js", import.meta.url), "utf8");
const swVersion = (sw.match(/const CACHE = "visuclean-v([^"]+)"/) || [])[1];
const etiketten = await readFile(new URL("./public/VisuClean_QR_Etiketten_A4.html", import.meta.url), "utf8");

ok("V1", "package.json und src/domain.js nennen dieselbe Version",
  pkg.version === APP_VERSION,
  `package.json ${pkg.version} · domain.js ${APP_VERSION}`);

ok("V2", "Der Service-Worker-Cache traegt dieselbe Version",
  swVersion === APP_VERSION,
  `sw.js ${swVersion ?? "nicht gefunden"} · domain.js ${APP_VERSION}`);

ok("V3", "Das erzeugte QR-Etikettenblatt traegt dieselbe Version",
  etiketten.includes(`v${APP_VERSION}`),
  `Etikettenblatt enthaelt v${APP_VERSION}`);

const lock = JSON.parse(await readFile(new URL("./package-lock.json", import.meta.url), "utf8"));
ok("V4", "package-lock.json nennt dieselbe Version",
  lock.version === APP_VERSION && lock.packages?.[""]?.version === APP_VERSION,
  `lock ${lock.version} · lock.packages[""] ${lock.packages?.[""]?.version} · domain.js ${APP_VERSION}`);

const pdf = await readFile(new URL("./src/pdfExport.js", import.meta.url), "utf8");
ok("V5", "Die PDF-Ausgabe leitet die Version ab statt sie fest zu nennen",
  /Browser-Demonstrator v\$\{APP_VERSION\}/.test(pdf) && !/v8\.2 -/.test(pdf),
  "kein fest verdrahtetes v8.2 mehr im PDF-Kopf und -Fuss");

const persist = await readFile(new URL("./src/persistence.js", import.meta.url), "utf8");
ok("V6", "Der Export traegt appVersion, die Formatkennung bleibt unveraendert",
  /appVersion: APP_VERSION/.test(persist)
  && /schema: "visuclean-export-v8\.2"/.test(persist)
  && /const DB_NAME = "visuclean-v82"/.test(persist),
  "schema und DB_NAME unveraendert - sonst waeren RC1/RC2-Daten unlesbar");

const gen = await readFile(new URL("./scripts/generate-manifest.mjs", import.meta.url), "utf8");
ok("V7", "Der Manifest-Generator leitet die Version ab",
  /Korrekturkandidat \$\{packageJson\.version\}/.test(gen) && !/Korrekturkandidat v8\.3 RC1/.test(gen),
  "kein fest verdrahtetes RC1 mehr im Manifest-Kopf");

ok("V8", "Die Version ist ein gueltiger SemVer-Wert",
  /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(APP_VERSION),
  APP_VERSION);

/* V9 schliesst eine Luecke, die in RC3 tatsaechlich aufgetreten ist: der
   Kopfblock von MANIFEST.txt ist in scripts/generate-manifest.mjs fest
   verdrahtet. Er nannte noch schaerfetest.mjs 10/10 - eine Datei, die es
   nicht mehr gibt - und die vier neuen Suiten fehlten ganz. Das Manifest ist
   das Dokument, das ein Pruefer liest; eine dort behauptete Erfolgsmeldung
   zu einem entfernten Test ist genau der Fehler, den RC3 abstellen soll.  */
const manifest = await readFile(new URL("./MANIFEST.txt", import.meta.url), "utf8");
const kopf = manifest.split("SHA-256-Dateiliste")[0];
const genanntesuiten = [...kopf.matchAll(/([A-Za-z0-9_.-]+\.mjs)/g)].map(m => m[1]);
/* Die Kette steht ab rc.4.42 unter `test:kette`; `test` ruft den Laeufer
   scripts/pruefzahlen.mjs auf, der genau diese Kette abarbeitet und dabei
   die Zahlen des Manifestkopfs nachprueft. Eine zweite Liste hier waere die
   naechste Stelle, an der etwas wegläuft. */
const laufendeSuiten = [...pkg.scripts["test:kette"].matchAll(/node ([A-Za-z0-9_.-]+\.mjs)/g)].map(m => m[1]);
const fehlend = laufendeSuiten.filter(f => !genanntesuiten.includes(f));
/* Gesucht wird im Wurzelverzeichnis UND in den Unterordnern, in denen
   ausgelieferte .mjs-Dateien liegen duerfen. Bis rc.4.18 suchte V9 nur in
   der Wurzel und meldete deshalb werkbank/messreihe.mjs als verwaist,
   obwohl die Datei im Paket liegt. Die Aussage der Pruefung bleibt
   dieselbe: keine Behauptung ueber eine Datei, die es nicht gibt.

   Mit rc.4.26 kam ./tests/ dazu: tests/feuchteSequenz.mjs ist eine
   Testhilfe, keine Suite - sie meldet kein Ergebnis und steht nicht in
   npm test. Sie liegt aber im Paket und darf im Manifestkopf genannt
   werden. Die Wache bleibt scharf: ein erfundener Dateiname faellt
   weiterhin durch, egal in welchem der vier Orte gesucht wird. */
const SUCHORTE = ["./", "./werkbank/", "./scripts/", "./tests/"];
const verwaist = [];
for (const f of genanntesuiten) {
  let gefunden = false;
  for (const ort of SUCHORTE) {
    try { await readFile(new URL(`${ort}${f}`, import.meta.url), "utf8"); gefunden = true; break; }
    catch { /* naechster Ort */ }
  }
  if (!gefunden) verwaist.push(f);
}

ok("V9", "Der Manifestkopf nennt genau die Suiten, die es gibt und die laufen",
  fehlend.length === 0 && verwaist.length === 0,
  verwaist.length ? `nicht vorhanden: ${verwaist.join(", ")}`
    : fehlend.length ? `im Kopf nicht genannt: ${fehlend.join(", ")}`
      : `${laufendeSuiten.length} Suiten, keine verwaiste Nennung`);

/* V11 · Befund der Gegenpruefung vom 16.09.2026, bestaetigt.
   package.json trug bereits `^20.19.0 || >=22.12.0`, der Wurzeleintrag des
   Lockfiles aber weiterhin das alte `>=20.19.0`. Ein Lockfile ist kein
   Beiwerk: `npm ci` liest den Wurzeleintrag mit, und ein Paket, das seine
   eigene Laufzeitvorgabe an zwei Stellen unterschiedlich nennt, ist nicht
   reproduzierbar — es haengt davon ab, welche Stelle gelesen wird.

   Die Ursache war Handarbeit: package.json wurde geaendert, ohne das
   Lockfile neu zu erzeugen. Deshalb prueft V11 den ganzen Wurzeleintrag
   gegen package.json, nicht nur `engines`. */
const lockWurzel = lock.packages?.[""] ?? {};
const gleich = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const abweichend = ["version", "engines", "license", "name"]
  .filter(feld => !gleich(lockWurzel[feld], pkg[feld]));
ok("V11", "Der Wurzeleintrag des Lockfiles stimmt mit package.json ueberein",
  abweichend.length === 0,
  abweichend.length
    ? abweichend.map(feld => `${feld}: lock ${JSON.stringify(lockWurzel[feld])}`
      + ` vs. package.json ${JSON.stringify(pkg[feld])}`).join(" · ")
    : "version, engines, license und name identisch");

/* V12 · Keine Testnebenwirkung im Projektverzeichnis.
   Dreimal in Folge hat dieselbe Falle zugeschlagen: `exportInspectionPdf`
   ruft `doc.save()`, und eine Suite, die das nicht abfaengt, schreibt eine
   PDF neben die Quellen. `npm run verify` laeuft dann gruen, und das
   anschliessende `manifest:check` faellt mit Exit 1 — der Prueflauf
   veraendert das Paket, das er prueft.

   Bisher stand die Sperre je Suite (pdftest P5, schmutztest S2j,
   pruefflaechetest R4f). Das schuetzt genau die Suiten, an die jemand
   gedacht hat. Diese Pruefung gilt fuer ALLE: nach einem Testlauf darf im
   Projektverzeichnis keine erzeugte PDF liegen.

   Bewusst am Dateinamensmuster und nicht an einer Liste: eine neue Suite
   faellt damit von selbst darunter. */
const wurzel = new URL("./", import.meta.url);
const erzeugtePdf = (await readdir(wurzel))
  .filter(name => /^VisuClean_.*\.pdf$/i.test(name));
ok("V12", "Kein Testlauf hinterlaesst eine PDF im Projektverzeichnis",
  erzeugtePdf.length === 0,
  erzeugtePdf.length
    ? `gefunden: ${erzeugtePdf.join(", ")} — eine Suite faengt doc.save() nicht ab`
    : "keine erzeugte PDF neben den Quellen");

ok("V10", "Der Manifestkopf nennt RC2 als Ausgangspaket und zaehlt getrennt",
  kopf.includes("2476c993a4b233882e73d31633ca71a11817db1aa38e5ab67c418099f71bdda8")
  && /bekannte Einschraenkung/i.test(kopf) && /offene Kalibrierung/i.test(kopf),
  "RC2-SHA-256 sowie getrennte Zaehlung fuer Einschraenkungen und offene Kalibrierung");

/* V13 · Befund der unabhaengigen Gegenpruefung an rc.4.42, zutreffend:
   MANIFEST.txt nannte weiter 30/30 fuer pruefflaechetest.mjs, 558 bestanden
   und 565 Rohsumme, obwohl die Suite 35 Pruefungen hat. `manifest:check`
   konnte das nicht sehen — es vergleicht Dateiliste und Hashes, nicht den
   Fliesstext im Kopf. Meine eigene Handkorrektur am MANIFEST.txt wurde vom
   naechsten `npm run manifest` wieder ueberschrieben, weil der Text im
   Generator steht: an der falschen Stelle repariert.

   Ab rc.4.42 rendert der Generator diese Zahlen aus pruefzahlen.json, und
   scripts/pruefzahlen.mjs misst sie bei jedem `npm test` an einem echten
   Lauf nach. V13 schliesst die dritte Luecke dazwischen, ohne etwas laufen
   zu lassen: es faellt auf, wenn pruefzahlen.json geaendert, das Manifest
   aber nicht neu erzeugt wurde. Alle drei Zahlen werden geprueft, nicht nur
   die Summe — eine Summe kann stimmen, waehrend zwei Suiten sich
   gegenseitig ausgleichen. */
const zahlen = JSON.parse(await readFile(new URL("./pruefzahlen.json", import.meta.url), "utf8")).suiten;
const erwarteteSumme = Object.entries(zahlen)
  .filter(([name]) => name !== "kalibrierung.mjs")
  .reduce((wert, [, zahl]) => wert + zahl, 0);
const erwarteteKalibrierung = zahlen["kalibrierung.mjs"] ?? 0;
const abweichendeSuiten = Object.entries(zahlen)
  .filter(([name, zahl]) => !new RegExp(
    `${name.replaceAll(".", "\\.")}\\s+${zahl}/${zahl}(?!\\d)`).test(kopf))
  .map(([name, zahl]) => `${name} soll ${zahl}/${zahl}`);
const summeImKopf = (kopf.match(/^ {2}bestanden\s+(\d+)/m) || [])[1];
const rohsummeImKopf = (kopf.match(/^ {2}Rohsumme aller \d+ Skripte (\d+)/m) || [])[1];
ok("V13", "Der Manifestkopf traegt die gemessenen Pruefzahlen, nicht getippte",
  abweichendeSuiten.length === 0
  && Number(summeImKopf) === erwarteteSumme
  && Number(rohsummeImKopf) === erwarteteSumme + erwarteteKalibrierung,
  abweichendeSuiten.length
    ? `veraltet im Kopf: ${abweichendeSuiten.join(", ")} — npm run manifest fehlt`
    : `je Suite stimmig · bestanden ${summeImKopf} · Rohsumme ${rohsummeImKopf}`
      + ` (erwartet ${erwarteteSumme} und ${erwarteteSumme + erwarteteKalibrierung})`);

console.log("");
const durch = R.filter(x => !x.bestanden);
console.log(`Bestanden: ${R.length - durch.length} / ${R.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(x => x.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
