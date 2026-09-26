/* ─── VisuClean RC4 · Paketierung ──────────────────────────────────────────
   Dieses Skript existiert, weil beide TEST-PREVIEW-Pakete durch ihr eigenes
   Tor gefallen sind: nach dem letzten Prueflauf wurden noch Dateien bewegt.
   Bei 5df3848 gemessen: `npm run verify` Exit 1 bei manifest:check,
   previewtest.mjs 100/101.

   Die Reihenfolge ist deshalb erzwungen und nicht verhandelbar:

     1. Dateiliste feststellen
     2. Manifest ZULETZT erzeugen (es enthaelt die Hashes aller anderen)
     3. ZIP packen
     4. In ein LEERES Verzeichnis entpacken
     5. Dort npm ci && npm run verify

   Erst wenn Schritt 5 gruen ist, gilt das Paket als auslieferbar. Wer
   danach noch eine Datei anfasst, faengt bei 1 an.

   Aufruf: node scripts/pack-rc4.mjs [Zielverzeichnis]                      */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ziel = path.resolve(process.argv[2] || path.join(root, ".."));
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const name = `VisuClean_v${version}.zip`;
const zipPfad = path.join(ziel, name);

const schritt = (nummer, text) => console.log(`\n[${nummer}] ${text}\n${"-".repeat(70)}`);
function lauf(befehl, argumente, cwd, beschriftung) {
  const ergebnis = spawnSync(befehl, argumente, { cwd, stdio: "inherit", encoding: "utf8" });
  if (ergebnis.status !== 0) {
    console.error(`\nABBRUCH: ${beschriftung} fehlgeschlagen (Exit ${ergebnis.status}).`);
    console.error("Das Paket wird NICHT ausgeliefert.");
    process.exit(1);
  }
}

/* ── 1 · Nichts Fremdes im Paket ───────────────────────────────────────── */
schritt(1, "Paketinhalt pruefen");
const verboten = ["dist", "node_modules", ".git"];
for (const eintrag of verboten) {
  if (existsSync(path.join(root, eintrag))) {
    console.log(`  ${eintrag}/ vorhanden — wird beim Packen ausgeschlossen`);
  }
}
/* Ein verschachteltes Auslieferungs-ZIP im Paket war der Fehler, der bei
   3684d5f zu einem 448-kB-Paket mit sich selbst darin gefuehrt haette. */
const eigeneZips = spawnSync("find", [root, "-name", "*.zip", "-not", "-path", "*/node_modules/*"],
  { encoding: "utf8" }).stdout.trim();
if (eigeneZips) {
  console.error(`ABBRUCH: ZIP-Datei im Paketverzeichnis gefunden:\n${eigeneZips}`);
  process.exit(1);
}
console.log("  kein verschachteltes ZIP im Paketverzeichnis");

/* ── 2 · Manifest ZULETZT ──────────────────────────────────────────────── */
schritt(2, "Manifest erzeugen (zuletzt, weil es alle anderen Hashes traegt)");
lauf("npm", ["run", "manifest"], root, "Manifest-Erzeugung");

/* ── 3 · ZIP ───────────────────────────────────────────────────────────── */
schritt(3, `ZIP packen: ${name}`);
mkdirSync(ziel, { recursive: true });
rmSync(zipPfad, { force: true });
const ordnerName = `VisuClean_v${version}`;
const staging = mkdtempSync(path.join(tmpdir(), "visuclean-pack-"));
lauf("cp", ["-r", root, path.join(staging, ordnerName)], staging, "Kopieren");
rmSync(path.join(staging, ordnerName, "node_modules"), { recursive: true, force: true });
rmSync(path.join(staging, ordnerName, "dist"), { recursive: true, force: true });
rmSync(path.join(staging, ordnerName, "dist-demo"), { recursive: true, force: true });
rmSync(path.join(staging, ordnerName, "dist-std"), { recursive: true, force: true });
rmSync(path.join(staging, ordnerName, ".git"), { recursive: true, force: true });
/* Maschinenspezifisches gehoert nicht ins Paket. `.gitignore` bezeichnet
   beide Kategorien ausdruecklich so — der Packvorgang uebernahm sie bis
   rc.4.35 trotzdem, und das ZIP trug fuenf .claude-Dateien samt internen
   Skill-Dateien sowie Python-Bytecode. Befund der Gegenpruefung vom
   16.09.2026, zutreffend.

   Die Liste steht hier ausdruecklich und nicht als stilles Muster: was
   NICHT ausgeliefert wird, gehoert benannt. Schritt 4 unten weist
   anschliessend nach, dass der ZIP-Inhalt genau dem Manifest entspricht —
   eine Ausnahmeliste, die jemand spaeter erweitert, faellt dort auf. */
for (const weg of [".claude", "werkbank/__pycache__", "__pycache__",
  ".pytest_cache", ".DS_Store"]) {
  rmSync(path.join(staging, ordnerName, weg), { recursive: true, force: true });
}
lauf("find", [path.join(staging, ordnerName), "-name", "*.pyc", "-delete"],
  staging, "Python-Bytecode entfernen");
lauf("find", [path.join(staging, ordnerName), "-name", "__pycache__", "-type", "d",
  "-exec", "rm", "-rf", "{}", "+"], staging, "__pycache__ entfernen");
lauf("zip", ["-r", "-q", zipPfad, ordnerName], staging, "ZIP-Erzeugung");
const groesse = statSync(zipPfad).size;
const hash = createHash("sha256").update(readFileSync(zipPfad)).digest("hex");
console.log(`  ${zipPfad}`);
console.log(`  ${groesse} Byte`);
console.log(`  SHA-256 ${hash}`);

/* ── 4 · In ein LEERES Verzeichnis entpacken ───────────────────────────── */
schritt(4, "In ein leeres Verzeichnis entpacken");
const pruefRaum = mkdtempSync(path.join(tmpdir(), "visuclean-check-"));
lauf("unzip", ["-q", zipPfad, "-d", pruefRaum], pruefRaum, "Entpacken");
const entpackt = path.join(pruefRaum, ordnerName);
console.log(`  ${entpackt}`);

/* ── 4b · ZIP-Inhalt gegen das Manifest ────────────────────────────────
   Das Manifest listet die ausgelieferten Dateien mit Hash. Bis rc.4.35
   pruefte niemand die Gegenrichtung: ob das ZIP DARUEBER HINAUS etwas
   enthaelt. Es enthielt sieben Dateien mehr als das Manifest deckt.

   Geprueft wird deshalb die Gleichheit beider Mengen, nicht nur die
   Teilmenge. MANIFEST.txt selbst steht nicht in sich; alles andere muss
   dort stehen.                                                          */
schritt("4b", "ZIP-Inhalt = Manifestdateien + MANIFEST.txt");
{
  const manifestText = readFileSync(path.join(entpackt, "MANIFEST.txt"), "utf8");
  /* Zeilen der Form "<sha256>   <bytes>  <pfad>" — genau die Form, die
     generate-manifest.mjs schreibt. Die erste Fassung dieser Pruefung
     liess die Byte-Spalte weg und fand deshalb NULL Eintraege; sie meldete
     daraufhin alle 108 Dateien als ueberzaehlig. Ein Muster, das nichts
     findet, meldet alles — deshalb wird die Trefferzahl unten
     ausdruecklich geprueft, statt ihr zu vertrauen. */
  const gelistet = new Set([...manifestText.matchAll(/^[0-9a-f]{64}\s+\d+\s+(\S+)$/gm)]
    .map(m => m[1]));
  if (gelistet.size < 50) {
    console.error(`ABBRUCH: Manifest nicht lesbar — nur ${gelistet.size} Eintraege `
      + "erkannt. Das Muster passt nicht zum Format, und eine Pruefung, die "
      + "nichts findet, beweist nichts.");
    process.exit(1);
  }
  const imZip = spawnSync("find", [entpackt, "-type", "f"], { encoding: "utf8" })
    .stdout.trim().split("\n")
    .map(f => path.relative(entpackt, f))
    .filter(Boolean);
  const ueberzaehlig = imZip
    .filter(f => f !== "MANIFEST.txt" && !gelistet.has(f))
    /* node_modules entsteht erst in Schritt 5 und ist hier noch nicht da;
       der Filter steht trotzdem, falls die Reihenfolge je wechselt. */
    .filter(f => !f.startsWith("node_modules/"));
  const fehlend = [...gelistet].filter(f => !imZip.includes(f));
  if (ueberzaehlig.length || fehlend.length) {
    console.error("ABBRUCH: ZIP-Inhalt und Manifest stimmen nicht ueberein.");
    if (ueberzaehlig.length) {
      console.error(`  im ZIP, nicht im Manifest (${ueberzaehlig.length}):`);
      for (const f of ueberzaehlig.slice(0, 20)) console.error(`    ${f}`);
    }
    if (fehlend.length) {
      console.error(`  im Manifest, nicht im ZIP (${fehlend.length}):`);
      for (const f of fehlend.slice(0, 20)) console.error(`    ${f}`);
    }
    process.exit(1);
  }
  console.log(`  ${gelistet.size} Manifestdateien + MANIFEST.txt, keine ueberzaehlige Datei`);
}

/* ── 5 · Dort verifizieren ─────────────────────────────────────────────── */
schritt(5, "Im entpackten Archiv: npm ci && npm audit && npm run verify");
lauf("npm", ["ci", "--no-fund"], entpackt, "npm ci im entpackten Archiv");
lauf("npm", ["audit"], entpackt, "npm audit im entpackten Archiv");
lauf("npm", ["run", "verify"], entpackt, "npm run verify im entpackten Archiv");

/* ── Ergebnis ──────────────────────────────────────────────────────────── */
const kernHash = createHash("sha256")
  .update(readFileSync(path.join(entpackt, "src/analysisCore.js"))).digest("hex");
const RC3_KERN = "ddc0b9fe3109895f994892aa285396074fcd3b5f608633d9368997c51c0f5793";

console.log(`\n${"=".repeat(70)}`);
console.log("PAKET AUSLIEFERBAR");
console.log("=".repeat(70));
console.log(`Datei          ${name}`);
console.log(`Groesse        ${groesse} Byte`);
console.log(`SHA-256        ${hash}`);
console.log(`Analyse-Kern   ${kernHash}`);
console.log(`               ${kernHash === RC3_KERN ? "byte-identisch zu RC3" : "WEICHT VON RC3 AB"}`);
console.log("");
console.log("Verifiziert wurde das ENTPACKTE Archiv, nicht das Arbeitsverzeichnis.");
console.log("Wird nach diesem Lauf noch eine Datei angefasst, ist der Nachweis");
console.log("hinfaellig und das Skript muss erneut vollstaendig laufen.");

rmSync(staging, { recursive: true, force: true });
rmSync(pruefRaum, { recursive: true, force: true });

if (kernHash !== RC3_KERN) {
  console.error("\nABBRUCH: der Analyse-Kern ist nicht byte-identisch zu RC3.");
  process.exit(1);
}
