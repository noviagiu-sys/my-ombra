/* Prueflauf UND Zaehlkontrolle in einem Durchgang.
 *
 * BEFUND der unabhaengigen Gegenpruefung an rc.4.42, zutreffend: MANIFEST.txt
 * nannte weiter 30/30 fuer pruefflaechetest.mjs, 558 bestanden und 565
 * Rohsumme, obwohl die Suite 35 Pruefungen hat. `manifest:check` konnte das
 * nicht sehen — es vergleicht Dateiliste und Hashes, nicht den Fliesstext im
 * Kopf. Die Zahlen waren von Hand getippt und liefen weg.
 *
 * Dieselbe Krankheit hatte die SUITENZAHL schon einmal (rc.4.19, "19 Suiten"
 * bei 20 gelisteten). Sie wurde damals abgeleitet statt behauptet. Hier ist
 * derselbe Schritt eine Ebene tiefer: die Zahl JE SUITE und die drei Summen
 * werden gemessen und gegen pruefzahlen.json geprueft, und der Manifestkopf
 * wird aus derselben Datei gerendert.
 *
 *   node scripts/pruefzahlen.mjs              laeuft und PRUEFT (npm test)
 *   node scripts/pruefzahlen.mjs --schreiben  uebernimmt die gemessenen Zahlen
 *
 * HENNE UND EI beim Hinzufuegen einer Suite: die Zahl braucht das Manifest
 * (V9 verlangt, dass der Kopf jede laufende Suite nennt), und das Manifest
 * braucht die Zahl. Der Weg heraus: die Zahl einmal von Hand in
 * pruefzahlen.json eintragen, `npm run manifest` laufen lassen, danach
 * `npm test`. Der Laeufer prueft die eingetragene Behauptung dann nach —
 * eine falsche Zahl faellt beim naechsten Lauf auf.
 *
 * Das Schreiben ist ein ausdruecklicher eigener Schritt, genau wie
 * `npm run manifest` neben `npm run manifest:check`. Ein Werkzeug, das
 * seine eigene Behauptung nebenbei nachzieht, kann keine Abweichung melden.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const anspruchDatei = path.join(root, "pruefzahlen.json");
const schreiben = process.argv.includes("--schreiben");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
/* Dieselbe Quelle wie im Manifestgenerator: die Testkette aus package.json.
   Eine zweite Liste hier waere die naechste Stelle, an der etwas wegläuft. */
export const TEST_SKRIPTE = [...(packageJson.scripts?.["test:kette"] || "")
  .matchAll(/node ([A-Za-z0-9_.-]+\.mjs)/g)].map(m => m[1]);

/* Die Suiten melden ihr Ergebnis in drei Formen:
     "Bestanden: 16 / 16"      die Regel
     "Bestanden:            7" kalibrierung.mjs
     "Behoben: 33"             rc4gegenproben.mjs
   Gelesen wird der LETZTE Treffer — das ist die Schlusszeile, nicht ein
   Zwischenstand irgendwo im Protokoll. */
export function leseZahl(ausgabe) {
  const treffer = [...ausgabe.matchAll(/^(?:Bestanden|Behoben):[ \t]+(\d+)(?:[ \t]*\/[ \t]*(\d+))?[ \t]*$/gm)];
  if (!treffer.length) return null;
  const letzter = treffer[treffer.length - 1];
  const bestanden = Number(letzter[1]);
  const gesamt = letzter[2] === undefined ? bestanden : Number(letzter[2]);
  return { bestanden, gesamt };
}

function laufe(skript) {
  return new Promise((loese, scheitere) => {
    const kind = spawn(process.execPath, [skript], { cwd: root });
    let ausgabe = "";
    const sammle = strom => strom.on("data", brocken => {
      ausgabe += brocken;
      process.stdout.write(brocken);
    });
    sammle(kind.stdout);
    sammle(kind.stderr);
    kind.on("error", scheitere);
    kind.on("close", code => loese({ code, ausgabe }));
  });
}

const gemessen = {};
const gescheitert = [];
for (const skript of TEST_SKRIPTE) {
  const { code, ausgabe } = await laufe(skript);
  if (code !== 0) {
    gescheitert.push(`${skript} beendete sich mit Code ${code}`);
    continue;
  }
  const zahl = leseZahl(ausgabe);
  if (!zahl) {
    gescheitert.push(`${skript} meldet keine lesbare Schlusszeile`);
    continue;
  }
  if (zahl.bestanden !== zahl.gesamt) {
    gescheitert.push(`${skript}: ${zahl.bestanden} von ${zahl.gesamt} bestanden`);
    continue;
  }
  gemessen[skript] = zahl.bestanden;
}

console.log("");
console.log("==============================================================================");
console.log("ZAEHLKONTROLLE");
console.log("==============================================================================");

if (gescheitert.length) {
  for (const zeile of gescheitert) console.log("  FEHLGESCHLAGEN  " + zeile);
  console.log("");
  console.log("ERGEBNIS: DURCHGEFALLEN - nicht alle Suiten sind grün.");
  process.exit(1);
}

export const OHNE_KALIBRIERUNG = skript => skript !== "kalibrierung.mjs";
const summe = auswahl => Object.entries(gemessen)
  .filter(([skript]) => auswahl(skript)).reduce((wert, [, zahl]) => wert + zahl, 0);
const bestanden = summe(OHNE_KALIBRIERUNG);
const kalibrierung = gemessen["kalibrierung.mjs"] ?? 0;

if (schreiben) {
  const inhalt = {
    hinweis: "Gemessen von scripts/pruefzahlen.mjs. Nicht von Hand pflegen —"
      + " MANIFEST.txt wird aus dieser Datei gerendert.",
    suiten: Object.fromEntries(TEST_SKRIPTE.map(skript => [skript, gemessen[skript]])),
  };
  await writeFile(anspruchDatei, JSON.stringify(inhalt, null, 2) + "\n", "utf8");
  console.log(`  Gemessene Zahlen uebernommen: ${TEST_SKRIPTE.length} Suiten,`
    + ` ${bestanden} bestanden ohne kalibrierung.mjs (${kalibrierung} getrennt).`);
  console.log("  MANIFEST.txt muss danach neu erzeugt werden: npm run manifest");
  process.exit(0);
}

let anspruch;
try {
  anspruch = JSON.parse(await readFile(anspruchDatei, "utf8")).suiten || {};
} catch {
  console.log("  pruefzahlen.json fehlt oder ist unlesbar.");
  console.log("  Erzeugen mit: node scripts/pruefzahlen.mjs --schreiben");
  process.exit(1);
}

const abweichungen = [];
for (const skript of TEST_SKRIPTE) {
  if (anspruch[skript] !== gemessen[skript]) {
    abweichungen.push(`${skript}: Manifest nennt ${anspruch[skript] ?? "nichts"},`
      + ` gemessen ${gemessen[skript]}`);
  }
}
for (const skript of Object.keys(anspruch)) {
  if (!TEST_SKRIPTE.includes(skript)) {
    abweichungen.push(`${skript}: steht in pruefzahlen.json, laeuft aber nicht mehr in npm test`);
  }
}

if (abweichungen.length) {
  for (const zeile of abweichungen) console.log("  ABWEICHUNG  " + zeile);
  console.log("");
  console.log("  Die Zahlen im Manifestkopf stimmen nicht mehr mit den Suiten ueberein.");
  console.log("  Nachziehen mit: node scripts/pruefzahlen.mjs --schreiben && npm run manifest");
  console.log("");
  console.log("ERGEBNIS: DURCHGEFALLEN");
  process.exit(1);
}

console.log(`  ${TEST_SKRIPTE.length} Suiten gelaufen, alle gruen.`);
console.log(`  bestanden                 ${bestanden}   ohne kalibrierung.mjs`);
console.log(`  kalibrierung.mjs          ${kalibrierung}   getrennt gezaehlt`);
console.log(`  Rohsumme                  ${bestanden + kalibrierung}`);
console.log("  Die Zahlen im Manifestkopf stimmen mit den gelaufenen Suiten ueberein.");
console.log("");
console.log("ERGEBNIS: BESTANDEN");
