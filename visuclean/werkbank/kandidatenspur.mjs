/* ─── Werkbank · Kandidatenspur ────────────────────────────────────────────
   Eine gemeldete Stelle durch die ganze Analyse verfolgen: Entsteht dort ein
   Kandidat? Zerfaellt sie in mehrere Komponenten? Welchen Rang bekommt sie?
   Verschwindet sie erst durch die Auswahl?

   WARUM ES DAS GIBT — Geraetelauf mit rc.4.43, unabhaengig gegengeprueft:
   eine kompakte Ausbruchstelle war am Bildschirm deutlich zu sehen und in
   der App nirgends auffindbar. Aus dem Datensatz allein war nicht zu
   klaeren, ob sie gar nicht erst entsteht oder nur unter dem Schnitt liegt —
   gespeichert wurden zehn von 493. Die Frage entscheidet, was zu reparieren
   ist, und liess sich ohne dieses Werkzeug nicht beantworten.

   NACHVOLLZIEHBARKEIT. Ausgegeben werden: Hash des Originalbildes,
   Zuschnittrechteck, Konfiguration samt Hash, Codeversion, Bildabmessungen
   und ALLE Kandidaten. Dazu der Analysezuschnitt VERLUSTFREI als PNG mit
   dem Hash seiner Pixel — erst damit bekommt ein spaeterer Lauf garantiert
   dieselben Analysepixel.

   BEKANNTE GRENZE, gemessen und nicht behoben: derselbe gespeicherte JPEG,
   in einer anderen Umgebung dekodiert, ergibt nicht bitgleiche Pixel. Im
   Vergleich Geraet gegen Chromium: 493 statt 481 Kandidaten (+2,5 %), die
   zehn gespeicherten alle wiedergefunden (IoU 0,93 bis 1,00), Rangfolge bis
   auf einen Tausch gleich. Regel 2 gilt fuer ein gegebenes Pixelarray; das
   Pixelarray selbst haengt am Dekoder. Die Ursache ist NICHT isoliert
   nachgewiesen — dafuer muessten dekodierte Originalpixel und danach
   Zuschnittpixel zwischen beiden Umgebungen verglichen werden. Genau dafuer
   ist der Pixelhash da.

   Aufruf:
     node werkbank/kandidatenspur.mjs <export.json> [--pruefung N] [--foto N]
       [--fenster x1,y1,x2,y2] [--aus verzeichnis]

   playwright-core wird nur zum Dekodieren und Zuschneiden gebraucht — die
   Rechnung selbst macht src/scratchScreening.js. Liegt playwright-core
   woanders, zeigt PLAYWRIGHT_PFAD darauf.                                 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../src/domain.js";
import { pixelRechteck } from "../src/inspectionArea.js";
import { screenScratches, waehleProtokollKandidaten } from "../src/scratchScreening.js";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, standard = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard;
};
const exportPfad = process.argv[2];
if (!exportPfad || exportPfad.startsWith("--")) {
  console.error("Aufruf: node werkbank/kandidatenspur.mjs <export.json> [--pruefung N]"
    + " [--foto N] [--fenster x1,y1,x2,y2] [--aus verzeichnis]");
  process.exit(1);
}
const pruefungIndex = Number(arg("pruefung", "0"));
const fotoIndex = Number(arg("foto", "0"));
const ausgabe = path.resolve(arg("aus", path.join(wurzel, "werkbank", "spur")));
const fenster = (() => {
  const roh = arg("fenster");
  if (!roh) return null;
  const [x1, y1, x2, y2] = roh.split(",").map(Number);
  return [x1, y1, x2, y2].every(Number.isFinite) ? { x1, y1, x2, y2 } : null;
})();

const sha = puffer => createHash("sha256").update(puffer).digest("hex");

const daten = JSON.parse(await readFile(exportPfad, "utf8"));
const pruefung = daten.inspections?.[pruefungIndex];
if (!pruefung) { console.error(`Pruefung ${pruefungIndex} fehlt im Export.`); process.exit(1); }
const foto = pruefung.photos?.[fotoIndex];
if (!foto?.image) { console.error(`Foto ${fotoIndex} fehlt oder hat kein Bild.`); process.exit(1); }

const flaeche = foto.result?.inspectionArea;
if (!flaeche) {
  console.error("Der Datensatz traegt keine Prueffläche — er stammt aus einem Stand"
    + " vor rc.4.40. Ohne sie ist der Zuschnitt nicht rekonstruierbar.");
  process.exit(1);
}
const [kopf, base64] = String(foto.image).split(",");
const bildBytes = Buffer.from(base64, "base64");

/* Die Konfiguration, mit der GERECHNET wurde — nicht die heutige. */
const gespeicherterHash = pruefung.screening?.configHash ?? null;
const konfigDatei = JSON.parse(await readFile(
  path.join(wurzel, "public", "screening.config.json"), "utf8"));
const konfigText = await readFile(path.join(wurzel, "public", "screening.config.json"), "utf8");
const heutigerHash = sha(konfigText);

/* ── Dekodieren und zuschneiden, Zeile fuer Zeile wie analyzeImage ────── */
const playwrightPfad = process.env.PLAYWRIGHT_PFAD || "playwright-core";
const { chromium } = await import(playwrightPfad);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD
    || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const seite = await browser.newPage();
const roh = await seite.evaluate(async ({ url, flaeche }) => {
  const bild = new Image();
  await new Promise((ok, nok) => { bild.onload = ok; bild.onerror = nok; bild.src = url; });
  const w = bild.naturalWidth, h = bild.naturalHeight;
  const q = {
    x: Math.round(flaeche.x * w), y: Math.round(flaeche.y * h),
    w: Math.round(flaeche.w * w), h: Math.round(flaeche.h * h),
  };
  /* ANALYSE_KANTE[OBERFLAECHE] ist 0: das Screening rechnet mit der
     gespeicherten Aufloesung, ohne zu verkleinern. */
  const c = document.createElement("canvas");
  c.width = q.w; c.height = q.h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bild, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
  return {
    natur: { w, h }, quelle: q,
    daten: Array.from(ctx.getImageData(0, 0, q.w, q.h).data),
    /* VERLUSTFREI. Ein JPEG hier waere die naechste Dekoderfrage. */
    png: c.toDataURL("image/png").split(",")[1],
  };
}, { url: `${kopf},${base64}`, flaeche });
await browser.close();

const pixel = Uint8ClampedArray.from(roh.daten);
const pixelHash = sha(Buffer.from(pixel.buffer));
const ergebnis = screenScratches(pixel, roh.quelle.w, roh.quelle.h, konfigDatei);
const alle = ergebnis.candidates.map((k, i) => ({ ...k, rangGerichtet: i + 1 }));
const ungerichtet = [...alle]
  .sort((a, b) => b.relevanceScoreUngerichtet - a.relevanceScoreUngerichtet);
const rangUngerichtet = new Map(ungerichtet.map((k, i) => [k.rangGerichtet, i + 1]));

const gespeicherte = pruefung.screening?.photos?.[fotoIndex] ?? null;
const rechteck = pixelRechteck(flaeche, roh.natur.w, roh.natur.h);

const bericht = {
  werkzeug: "werkbank/kandidatenspur.mjs",
  codeversion: APP_VERSION,
  datensatz: {
    inspectionId: pruefung.id, photoId: foto.id,
    appVersionDesLaufs: pruefung.appVersion ?? null,
    recordHash: pruefung.recordHash ?? null,
  },
  original: {
    sha256: sha(bildBytes), bytes: bildBytes.length,
    breite: roh.natur.w, hoehe: roh.natur.h,
  },
  pruefflaeche: flaeche,
  zuschnitt: { ...rechteck, gerechnet: roh.quelle,
    stimmtMitGespeichertem: gespeicherte
      ? gespeicherte.bildBreite === roh.quelle.w && gespeicherte.bildHoehe === roh.quelle.h
      : null },
  analysepixel: { sha256: pixelHash, bytes: pixel.length, datei: "zuschnitt.png" },
  konfiguration: {
    werte: konfigDatei, sha256HeuteImPaket: heutigerHash,
    sha256ImDatensatz: gespeicherterHash,
    bitgleich: gespeicherterHash ? gespeicherterHash === heutigerHash : null,
  },
  lauf: {
    kandidaten: alle.length,
    kandidatenImDatensatz: gespeicherte?.candidateCount ?? null,
    schliffspuren: ergebnis.suppressedCount,
    grindDirectionDeg: ergebnis.grindDirectionDeg,
    /* Gespeichert wird eine Vorauswahl; wie gross sie war, steht daneben. */
    vorauswahlImDatensatz: gespeicherte?.candidates?.length ?? null,
    vollstaendigImDatensatz: gespeicherte?.alleKandidaten?.length ?? null,
  },
  candidates: alle.map(k => ({ ...k, rangUngerichtet: rangUngerichtet.get(k.rangGerichtet) })),
};

await mkdir(ausgabe, { recursive: true });
await writeFile(path.join(ausgabe, "zuschnitt.png"), Buffer.from(roh.png, "base64"));
await writeFile(path.join(ausgabe, "spur.json"), JSON.stringify(bericht, null, 2));

/* ── Bericht ───────────────────────────────────────────────────────────── */
const z = (name, wert) => console.log(`${name.padEnd(26)}${wert}`);
console.log("VisuClean · Kandidatenspur");
console.log("==============================================================================");
z("Werkzeug-Codeversion", APP_VERSION);
z("Pruefung", `${pruefung.id} · Foto ${foto.id}`);
z("App-Version des Laufs", pruefung.appVersion ?? "—");
z("Original SHA-256", bericht.original.sha256);
z("Originalgroesse", `${roh.natur.w}x${roh.natur.h} · ${bildBytes.length} Byte`);
z("Prueffläche", `x${flaeche.x} y${flaeche.y} w${flaeche.w} h${flaeche.h} · ${flaeche.quelle}`);
z("Zuschnitt", `${JSON.stringify(rechteck)}`
  + (bericht.zuschnitt.stimmtMitGespeichertem === false ? "   ABWEICHEND!" : ""));
z("Analysepixel SHA-256", pixelHash);
z("Konfiguration", `${heutigerHash.slice(0, 16)}…`
  + (bericht.konfiguration.bitgleich === false ? "   ABWEICHEND zum Datensatz!"
    : bericht.konfiguration.bitgleich === true ? "   bitgleich zum Datensatz" : ""));
z("Kandidaten im Nachlauf", `${alle.length}`
  + (gespeicherte?.candidateCount != null ? `   (Datensatz: ${gespeicherte.candidateCount})` : ""));
z("davon Schliffspuren", ergebnis.suppressedCount);
z("Im Datensatz erhalten", `${bericht.lauf.vollstaendigImDatensatz ?? 0} vollstaendig`
  + ` · ${bericht.lauf.vorauswahlImDatensatz ?? 0} in der Vorauswahl`);

if (fenster) {
  const schneidet = b => b.minX <= fenster.x2 && b.maxX >= fenster.x1
    && b.minY <= fenster.y2 && b.maxY >= fenster.y1;
  const treffer = alle.filter(k => schneidet(k.boundingBox));
  console.log("");
  console.log(`Fenster (${fenster.x1},${fenster.y1})-(${fenster.x2},${fenster.y2})`
    + `  ·  ${treffer.length} Kandidat(en)`);
  if (!treffer.length) {
    console.log("  KEIN Kandidat — die Stelle geht bei der ERZEUGUNG verloren.");
  } else {
    console.log("  Rang   Rang      Box                     Pixel Schlank laengeRel  Kante"
      + "    relevanz ungerichtet Schliff");
    console.log("  gerich ungerich");
    for (const k of treffer) {
      const b = k.boundingBox;
      console.log("  "
        + String(k.rangGerichtet).padStart(5)
        + String(rangUngerichtet.get(k.rangGerichtet)).padStart(7)
        + `   (${b.minX},${b.minY},${b.maxX},${b.maxY})`.padEnd(24)
        + String(k.pixelCount).padStart(5)
        + k.elongation.toFixed(2).padStart(8)
        + k.lengthRel.toFixed(4).padStart(11)
        + k.edgeStrength.toFixed(3).padStart(7)
        + k.relevanceScore.toExponential(2).padStart(12)
        + k.relevanceScoreUngerichtet.toExponential(2).padStart(12)
        + (k.alignedWithGrind ? "     ja" : "   nein"));
    }
    const spitze = waehleProtokollKandidaten(alle, 10);
    const inSpitze = treffer.filter(k => spitze.some(s =>
      s.boundingBox.minX === k.boundingBox.minX && s.boundingBox.minY === k.boundingBox.minY));
    console.log("");
    console.log(`  In der Vorauswahl (Spitze 10): ${inSpitze.length} von ${treffer.length}.`);
    console.log(inSpitze.length
      ? "  Die Stelle ist ueber die Vorauswahl erreichbar."
      : "  Die Stelle entsteht, wird aber von der AUSWAHL verworfen —"
        + " nicht von der Erzeugung.");
  }
}
console.log("");
console.log(`Geschrieben: ${path.join(ausgabe, "spur.json")}`);
console.log(`             ${path.join(ausgabe, "zuschnitt.png")}  (verlustfrei, Pixelhash oben)`);
console.log("");
console.log("Die Raenge gelten fuer DIESEN Lauf. Weicht die Kandidatenzahl vom");
console.log("Datensatz ab, ist die Rangfolge nicht die urspruengliche — die");
console.log("Uebereinstimmung der gespeicherten Vorauswahl stuetzt die");
console.log("Vergleichbarkeit, beweist sie aber nicht fuer alle uebrigen.");
