/* ─── VisuClean · Werkbank · Auflösungsvergleich für den Rückstandspfad ────
 *
 * Aufruf:  node werkbank/schmutzaufloesung.mjs [ordner]
 * Vorgabe: tests/fixtures/real
 *
 * WAS DIESES SKRIPT IST
 *
 * Eine Messung. Es rechnet dieselbe Originalaufnahme bei mehreren
 * Auflösungen durch den Rückstandspfad und schreibt auf, was dabei
 * herauskommt: Bildabmessungen, Verarbeitungsschritte, Schmutzbefund,
 * die Merkmale dahinter, die markierten Bereiche samt Position, die
 * Laufzeit und die Messumgebung.
 *
 * WAS ES AUSDRÜCKLICH NICHT IST
 *
 * Es ist keine Entscheidung. Aus diesem Lauf wird KEINE Auflösung
 * abgeleitet und KEINE Schwelle geändert. `ANALYSE_KANTE.RUECKSTAND`
 * steht bei 640 und bleibt dort, bis eine Kampagne mit Realbildern etwas
 * anderes belegt.
 *
 * Es stuft höhere Auflösung weder als besser noch als schlechter ein. Was
 * es zeigt, ist ein Unterschied — und ein Unterschied ist kein Urteil
 * darüber, welche Seite richtig liegt. Dafür bräuchte es unabhängig
 * markierte Stellen, und die gibt es hier nicht.
 *
 * Es optimiert nichts anhand eines einzelnen Bildes. Deshalb läuft es über
 * alle Bilder des Ordners und schreibt jedes einzeln aus, statt irgendwo
 * einen Mittelwert zu bilden, aus dem dann jemand eine Einstellung liest.
 *
 * ZUR LAUFZEIT
 *
 * Die gemessenen Zeiten gelten für DIESE Maschine, in Node, mit diesen
 * Bildgrössen. Sie sind KEINE Aussage über ein iPhone: andere CPU, andere
 * Laufzeitumgebung, anderer Speicher, andere Energieverwaltung. Die
 * Messumgebung steht deshalb im Kopf jedes Laufs, damit niemand die Zahl
 * ohne sie weiterreicht.
 *
 * GRENZE DER VORLIEGENDEN BILDER
 *
 * Die im Projekt vorliegenden Realaufnahmen sind bereits 480x640 gross.
 * Eine "gespeicherte Originalauflösung" oberhalb davon gibt es hier nicht.
 * Der Lauf kennzeichnet das ausdrücklich, statt eine Stufe zu erfinden:
 * hochskalieren würde Information vortäuschen, die im Bild nicht steht.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { computeFeatures, buildVerdicts } from "../src/analysisCore.js";
import { ANALYSE_KANTE, AUFNAHMEZWECK } from "../src/capturePaths.js";
import { befundEbenen, ebenenBestand, EBENEN_STATUS } from "../src/overlayLayers.js";
import { verkleinere } from "./bildhilfen.mjs";

const projekt = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ordner = process.argv[2] || path.join(projekt, "tests", "fixtures", "real");

/* Die drei Stufen, die der Auftrag nennt. "ORIGINAL" ist die gespeicherte
   Auflösung, also gar keine Verkleinerung. */
const STUFEN = [
  { name: "640 (Stand)", langeKante: ANALYSE_KANTE[AUFNAHMEZWECK.RUECKSTAND] },
  { name: "960 (Vergleich)", langeKante: 960 },
  { name: "Originalauflösung", langeKante: 0 },
  /* Zusätzlich, und ausdrücklich NICHT als Einstellungsvorschlag: eine
     Stufe UNTERHALB des Stands. Sie ist der einzige Weg, mit den hier
     vorliegenden kleinen Aufnahmen überhaupt eine Richtung des Effekts zu
     sehen — nach oben geht nichts, weil nicht hochskaliert wird. Sie
     beantwortet nicht, welche Auflösung besser ist. */
  { name: "320 (nur Richtung des Effekts)", langeKante: 320 },
];

/**
 * Auf eine lange Kante bringen — durch Blockmittelung, wie der
 * Auflösungsvergleich des Screenings.
 *
 * Bewusst kein Bibliotheksfilter: jede Interpolation bringt ihre eigene
 * Glättung mit, und genau die Glättung ist hier der Messgegenstand.
 *
 * NIE HOCHSKALIEREN. Ist das Bild kleiner als die Zielkante, bleibt es wie
 * es ist und der Lauf sagt das. Ein vergrössertes Bild trägt keine
 * zusätzliche Information, aber es sähe in einer Tabelle so aus.
 */
function aufKante(daten, w, h, langeKante) {
  const lang = Math.max(w, h);
  if (!langeKante || langeKante >= lang) {
    return { daten, w, h, schritt: langeKante && langeKante > lang
      ? `keine Änderung (Bild ist mit ${lang} px kleiner als die Zielkante ${langeKante} px; nicht hochskaliert)`
      : "keine Änderung (gespeicherte Auflösung)" };
  }
  const faktor = langeKante / lang;
  const klein = verkleinere(daten, w, h, faktor);
  return { ...klein, schritt: `Blockmittelung ${w}x${h} -> ${klein.w}x${klein.h}`
    + ` (Faktor ${faktor.toFixed(3)})` };
}

function lies(datei) {
  const png = PNG.sync.read(fs.readFileSync(datei));
  return { daten: new Uint8ClampedArray(png.data), w: png.width, h: png.height };
}

/* Die markierten Bereiche einer Maske, mit ihrer Position. Positionen
   werden RELATIV angegeben (0..1), sonst wären zwei Auflösungen gar nicht
   vergleichbar — und genau der Vergleich ist der Zweck. */
function bereiche(maske, w, h, blockGroesse = 16) {
  if (!maske) return [];
  const gw = Math.ceil(w / blockGroesse), gh = Math.ceil(h / blockGroesse);
  const treffer = [];
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let n = 0, gesamt = 0;
      for (let y = by * blockGroesse; y < Math.min((by + 1) * blockGroesse, h); y++) {
        for (let x = bx * blockGroesse; x < Math.min((bx + 1) * blockGroesse, w); x++) {
          gesamt += 1;
          if (maske[y * w + x]) n += 1;
        }
      }
      if (gesamt > 0 && n / gesamt > 0.5) {
        treffer.push({
          xRel: ((bx + 0.5) * blockGroesse) / w,
          yRel: ((by + 0.5) * blockGroesse) / h,
          pixel: n,
        });
      }
    }
  }
  return treffer;
}

const drei = wert => (Number.isFinite(wert) ? wert.toFixed(3) : "—");

console.log("VisuClean · Werkbank · Auflösungsvergleich Rückstandspfad");
console.log("=".repeat(72));
console.log("MESSUNG, KEINE ENTSCHEIDUNG. Aus diesem Lauf wird keine Auflösung");
console.log("und keine Schwelle abgeleitet. Höhere Auflösung gilt hier weder");
console.log("als besser noch als schlechter — dafür fehlen unabhängig");
console.log("markierte Stellen.");
console.log("");
console.log("Messumgebung (gilt NICHT für ein iPhone):");
console.log(`  Node        ${process.version}`);
console.log(`  Plattform   ${process.platform} ${process.arch}`);
console.log(`  CPU         ${os.cpus()[0]?.model ?? "unbekannt"} x${os.cpus().length}`);
console.log(`  Speicher    ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GiB`);
console.log(`  Stand       ANALYSE_KANTE.RUECKSTAND = ${ANALYSE_KANTE[AUFNAHMEZWECK.RUECKSTAND]} px`);
console.log("=".repeat(72));

let dateien = [];
try {
  dateien = fs.readdirSync(ordner).filter(n => n.toLowerCase().endsWith(".png")).sort();
} catch {
  console.log(`\nOrdner nicht lesbar: ${ordner}`);
  process.exit(2);
}
if (!dateien.length) {
  console.log(`\nKeine PNG-Dateien in ${ordner}.`);
  process.exit(2);
}

/* Kein Mittelwert über die Bilder. Jedes Bild steht für sich — sonst
   entsteht eine Zahl, aus der jemand eine Einstellung liest. */
for (const name of dateien) {
  const bild = lies(path.join(ordner, name));
  console.log(`\n── ${name} · gespeichert ${bild.w}x${bild.h} ${"─".repeat(Math.max(0, 40 - name.length))}`);

  const gesehen = new Map();
  for (const stufe of STUFEN) {
    const skaliert = aufKante(bild.daten, bild.w, bild.h, stufe.langeKante);
    /* AUFWÄRMEN vor der Zeitmessung.
       Ohne diesen Lauf misst die erste Stufe die JIT-Übersetzung mit: im
       ersten Versuch standen 114 ms gegen 26 ms für dasselbe Bild in
       derselben Grösse. Das sah nach einem Auflösungseffekt aus und war
       keiner. Eine Laufzeit, die die Übersetzung mitmisst, ist keine
       Laufzeitangabe. */
    computeFeatures(skaliert.daten, skaliert.w, skaliert.h);
    const t0 = performance.now();
    const merkmale = computeFeatures(skaliert.daten, skaliert.w, skaliert.h);
    const urteil = buildVerdicts(merkmale);
    const dauer = performance.now() - t0;

    const codes = { dry: urteil.dry.code, clean: urteil.clean.code, intact: urteil.intact.code };
    const ebenen = befundEbenen(ebenenBestand(merkmale), codes);
    const warm = bereiche(merkmale.masks.maskWarm, skaliert.w, skaliert.h);
    const anom = bereiche(merkmale.masks.maskAnom, skaliert.w, skaliert.h);

    /* Fallen zwei Stufen auf dieselbe Bildgrösse, ist es KEIN Vergleich
       mehr, sondern derselbe Lauf zweimal. Das steht dann da — sonst
       liest eine Tabelle mit drei gleichen Zeilen wie drei Belege. */
    const groesse = `${skaliert.w}x${skaliert.h}`;
    const schonGesehen = gesehen.get(groesse);
    gesehen.set(groesse, stufe.name);

    console.log(`\n  [${stufe.name}]`);
    console.log(`    Abmessungen      ${groesse}`);
    if (schonGesehen) {
      console.log(`    HINWEIS          identisch mit "${schonGesehen}" — kein Vergleich,`);
      console.log("                     dieselbe Rechnung. Die Aufnahme ist zu klein für");
      console.log("                     diese Stufe.");
    }
    console.log(`    Verarbeitung     ${skaliert.schritt}`);
    console.log(`    Schmutzbefund    ${codes.clean}`);
    console.log(`    Merkmale         wf ${drei(merkmale.wf)} · warmBlocks ${merkmale.warmBlocks}`
      + ` · anomBright ${merkmale.anomBright} · anomDark ${merkmale.anomDark}`
      + ` · cv ${merkmale.cv.toFixed(5)} · lm ${drei(merkmale.lm)}`);
    /* Die Kratzerebene zählt Strukturen, keine Pixel. "null px" wäre eine
       Zahl ohne Bezugsgrösse — also keine Angabe. */
    console.log(`    Ebenen           ${ebenen
      .filter(e => e.status !== EBENEN_STATUS.NICHT_ERKANNT)
      .map(e => `${e.id} ${e.pixel === null ? `${e.anzahl} Struktur(en)` : `${e.pixel} px`}`
        + ` (${e.status === EBENEN_STATUS.URTEILSTRAGEND
          ? "urteilstragend" : "Zusatzhinweis"})`).join(" · ") || "keine"}`);
    console.log(`    Markiert warm    ${warm.length} Zonen${warm.length
      ? ": " + warm.slice(0, 6).map(z => `(${z.xRel.toFixed(2)},${z.yRel.toFixed(2)})`).join(" ")
        + (warm.length > 6 ? " …" : "") : ""}`);
    console.log(`    Markiert farbn.  ${anom.length} Zonen${anom.length
      ? ": " + anom.slice(0, 6).map(z => `(${z.xRel.toFixed(2)},${z.yRel.toFixed(2)})`).join(" ")
        + (anom.length > 6 ? " …" : "") : ""}`);
    console.log(`    Laufzeit         ${dauer.toFixed(1)} ms (diese Maschine, Node — nicht iPhone)`);
  }
}

console.log("");
console.log("=".repeat(72));
console.log("OFFEN — und hier absichtlich nicht beantwortet:");
console.log("  · Welche Auflösung reale Rückstände zuverlässiger findet. Dafür");
console.log("    braucht es Bilder mit unabhängig markierten Stellen.");
console.log("  · Was auf dem Gerät an Laufzeit anfällt. Dafür braucht es eine");
console.log("    Messung auf dem Gerät.");
console.log("  · Ob die Stufe 'Originalauflösung' hier überhaupt etwas zeigt:");
console.log("    die vorliegenden Aufnahmen sind bereits klein, und es wurde");
console.log("    ausdrücklich nicht hochskaliert.");
console.log("=".repeat(72));
