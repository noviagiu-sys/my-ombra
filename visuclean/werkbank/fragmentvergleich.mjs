/* ─── Werkbank · Gehoeren Bruchstuecke zu einem Rand? ──────────────────────
   UNTERSUCHUNG, kein Detektor. Hier entsteht keine Regel, keine Schwelle und
   kein Urteil — nur Rohwerte, an denen sich entscheiden laesst, ob eine
   Zusammenfuehrung ueberhaupt tragfaehig waere.

   WARUM. Der Nachlauf zu rc.4.43 zeigte: eine kompakte Ausbruchstelle
   entsteht als sieben Bruchstuecke von 14 bis 30 Pixeln und landet damit
   unter dem Schnitt. Naheliegend waere, benachbarte Bruchstuecke
   zusammenzufassen. Genau das ist die Falle: Naehe allein ist kein Beleg
   fuer Zusammengehoerigkeit. Auf einer geschliffenen Flaeche liegt ueberall
   etwas in der Naehe von etwas.

   Der Auftrag formuliert es scharf: der Vergleich muss zeigen, welche
   Bruchstuecke tatsaechlich zu einem Rand gehoeren und welche
   Hintergrundstruktur sind. Deshalb wird JEDES Fenster gegen KONTROLLFENSTER
   derselben Groesse gemessen, die an unauffaelligen Stellen liegen. Erst der
   Abstand zwischen beiden Verteilungen sagt etwas.

   GESCHLOSSENHEIT ist eines der Merkmale, ausdruecklich KEINE Vorbedingung.
   Die Stelle, um die es geht, ist selbst nur teilweise sichtbar: nur ihre
   beschattete Flanke sprach an. Wer einen vollstaendig geschlossenen Umriss
   verlangt, verliert genau sie noch einmal.

   Gemessen wird je Fenster:
     n            Zahl der Bruchstuecke
     radiusMittel mittlerer Abstand vom gemeinsamen Schwerpunkt
     radiusStreu  Streuung dieser Abstaende, bezogen auf den Mittelwert
                  (klein = die Bruchstuecke liegen auf einem Ring)
     tangential   mittlerer Winkel zwischen Hauptachse und Ringtangente,
                  in Grad; 0 = laengs des Randes, 90 = quer dazu
     abdeckung    Anteil der belegten 30-Grad-Sektoren um den Schwerpunkt
                  (1 = rundum belegt, klein = nur eine Flanke)
     luecke       groesster unbelegter Winkelbereich in Grad

   Aufruf:
     node werkbank/fragmentvergleich.mjs <spur.json>
       --fenster x1,y1,x2,y2 [--fenster ...] [--kontrollen 12]           */
import { readFile } from "node:fs/promises";

const pfad = process.argv[2];
if (!pfad || pfad.startsWith("--")) {
  console.error("Aufruf: node werkbank/fragmentvergleich.mjs <spur.json>"
    + " --fenster x1,y1,x2,y2 [--fenster ...] [--kontrollen 12]");
  process.exit(1);
}
const fensterArgumente = process.argv
  .map((a, i) => (a === "--fenster" ? process.argv[i + 1] : null))
  .filter(Boolean)
  .map(roh => {
    const [x1, y1, x2, y2] = roh.split(",").map(Number);
    return { x1, y1, x2, y2 };
  })
  .filter(f => [f.x1, f.y1, f.x2, f.y2].every(Number.isFinite));
if (!fensterArgumente.length) {
  console.error("Mindestens ein --fenster wird gebraucht.");
  process.exit(1);
}
/* Ohne `--kontrollen` liefert indexOf -1, und argv[0] ist der Node-Pfad.
   Der erste Entwurf rechnete daraus NaN, und `laenge < NaN` ist immer
   falsch: es entstand KEIN einziges Kontrollfenster, und der Bericht
   meldete "keine Kontrolle" statt eines Fehlers. Ein Werkzeug, das seine
   Bezugsgroesse still weglaesst, ist schlimmer als keines. */
const kontrollIndex = process.argv.indexOf("--kontrollen");
const kontrollZahl = kontrollIndex >= 0 && process.argv[kontrollIndex + 1]
  ? Number(process.argv[kontrollIndex + 1]) : 12;
if (!Number.isInteger(kontrollZahl) || kontrollZahl < 1) {
  console.error("--kontrollen braucht eine ganze Zahl >= 1.");
  process.exit(1);
}

const spur = JSON.parse(await readFile(pfad, "utf8"));
const kandidaten = spur.candidates || [];
const breite = spur.zuschnitt?.gerechnet?.w ?? spur.bild?.w;
const hoehe = spur.zuschnitt?.gerechnet?.h ?? spur.bild?.h;
if (!(breite > 0 && hoehe > 0)) {
  console.error("Die Spur nennt keine Bildabmessungen.");
  process.exit(1);
}

const mitte = b => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
const imFenster = (b, f) =>
  b.minX <= f.x2 && b.maxX >= f.x1 && b.minY <= f.y2 && b.maxY >= f.y1;

/* Winkelabstand zweier Richtungen ohne Vorzeichen, 0..90 Grad. */
const richtungsabstand = (a, b) => {
  const d = Math.abs(((a - b) % 180 + 180) % 180);
  return d > 90 ? 180 - d : d;
};

function messe(fragmente) {
  const n = fragmente.length;
  if (n < 2) return { n, radiusMittel: null, radiusStreu: null,
    tangential: null, abdeckung: null, luecke: null };
  const punkte = fragmente.map(k => mitte(k.boundingBox));
  const sx = punkte.reduce((s, p) => s + p.x, 0) / n;
  const sy = punkte.reduce((s, p) => s + p.y, 0) / n;
  const radien = punkte.map(p => Math.hypot(p.x - sx, p.y - sy));
  const rMittel = radien.reduce((s, r) => s + r, 0) / n;
  const rStreu = rMittel > 0
    ? Math.sqrt(radien.reduce((s, r) => s + (r - rMittel) ** 2, 0) / n) / rMittel
    : null;

  /* Tangential: liegt die Hauptachse eines Bruchstuecks laengs des
     gedachten Randes? Die Tangente steht senkrecht auf dem Radius. */
  const winkel = fragmente.map((k, i) => {
    const p = punkte[i];
    const radiusGrad = Math.atan2(p.y - sy, p.x - sx) * 180 / Math.PI;
    const tangenteGrad = radiusGrad + 90;
    return richtungsabstand(k.orientationDeg ?? 0, tangenteGrad);
  });
  const tangential = winkel.reduce((s, w) => s + w, 0) / n;

  /* Winkelabdeckung in Sektoren von 30 Grad und die groesste Luecke. */
  const sektoren = new Set(punkte.map(p => {
    const g = (Math.atan2(p.y - sy, p.x - sx) * 180 / Math.PI + 360) % 360;
    return Math.floor(g / 30);
  }));
  const belegt = [...sektoren].sort((a, b) => a - b);
  let luecke = 0;
  for (let i = 0; i < belegt.length; i++) {
    const naechster = belegt[(i + 1) % belegt.length];
    const abstand = ((naechster - belegt[i] + 12) % 12) * 30;
    luecke = Math.max(luecke, abstand === 0 ? 360 : abstand);
  }
  return { n, radiusMittel: rMittel, radiusStreu: rStreu, tangential,
    abdeckung: sektoren.size / 12, luecke };
}

/* Kontrollfenster: gleiche Groesse, gleichmaessig ueber das Bild verteilt,
   ohne die gemeldeten Stellen. Sie liefern die Vergleichsverteilung —
   ohne sie waere jede Zahl aus dem Schadensfenster ohne Bezugsgroesse. */
function kontrollfenster(muster, meidend) {
  const fw = muster.x2 - muster.x1, fh = muster.y2 - muster.y1;
  const ergebnis = [];
  const spalten = Math.ceil(Math.sqrt(kontrollZahl));
  for (let i = 0; i < spalten && ergebnis.length < kontrollZahl; i++) {
    for (let j = 0; j < spalten && ergebnis.length < kontrollZahl; j++) {
      const x1 = Math.round((i + 0.5) * (breite - fw) / spalten);
      const y1 = Math.round((j + 0.5) * (hoehe - fh) / spalten);
      const f = { x1, y1, x2: x1 + fw, y2: y1 + fh };
      const kollidiert = meidend.some(m =>
        f.x1 <= m.x2 && f.x2 >= m.x1 && f.y1 <= m.y2 && f.y2 >= m.y1);
      if (!kollidiert) ergebnis.push(f);
    }
  }
  return ergebnis;
}

const zahl = (w, n = 3) => (w === null || w === undefined || Number.isNaN(w)
  ? "—" : w.toFixed(n));

console.log("VisuClean · Werkbank · gehoeren Bruchstuecke zu einem Rand?");
console.log("==============================================================================");
console.log(`Bild ${breite}x${hoehe} · ${kandidaten.length} Kandidaten aus ${pfad}`);
console.log("");
console.log("UNTERSUCHUNG, kein Detektor. Keine Schwelle, kein Urteil, keine Regel.");
console.log("");

const kopf = "Fenster                     n  radiusMittel radiusStreu tangential"
  + " abdeckung luecke";
const zeile = (name, m) => console.log(
  name.padEnd(26)
  + String(m.n).padStart(3)
  + zahl(m.radiusMittel, 1).padStart(14)
  + zahl(m.radiusStreu, 3).padStart(12)
  + zahl(m.tangential, 1).padStart(11)
  + zahl(m.abdeckung, 2).padStart(10)
  + zahl(m.luecke, 0).padStart(7));

console.log(kopf);
console.log("-".repeat(78));

const gemeldet = [];
for (const f of fensterArgumente) {
  const fragmente = kandidaten.filter(k => imFenster(k.boundingBox, f));
  const m = messe(fragmente);
  gemeldet.push(m);
  zeile(`GEMELDET ${f.x1},${f.y1}`, m);
}

const kontrollen = kontrollfenster(fensterArgumente[0], fensterArgumente)
  .map(f => ({ f, m: messe(kandidaten.filter(k => imFenster(k.boundingBox, f))) }))
  .filter(e => e.m.n >= 2);
console.log("-".repeat(78));
for (const { f, m } of kontrollen) zeile(`Kontrolle ${f.x1},${f.y1}`, m);

/* Die Spannweite der Kontrollen ist die Bezugsgroesse. Ein Wert aus dem
   Schadensfenster, der mitten darin liegt, unterscheidet nichts. */
const spanne = feld => {
  const werte = kontrollen.map(e => e.m[feld]).filter(Number.isFinite);
  if (!werte.length) return null;
  return { min: Math.min(...werte), max: Math.max(...werte),
    mittel: werte.reduce((s, w) => s + w, 0) / werte.length };
};

console.log("");
console.log("Kontrollspanne (Bezugsgroesse der Zahlen oben)");
for (const feld of ["radiusStreu", "tangential", "abdeckung", "luecke"]) {
  const s = spanne(feld);
  if (!s) { console.log(`  ${feld.padEnd(13)} keine Kontrolle mit n >= 2`); continue; }
  const eigen = gemeldet.map(m => m[feld]).filter(Number.isFinite);
  const drinnen = eigen.filter(w => w >= s.min && w <= s.max).length;
  console.log(`  ${feld.padEnd(13)} Kontrollen ${zahl(s.min, 2)} bis ${zahl(s.max, 2)}`
    + ` (Mittel ${zahl(s.mittel, 2)})`
    + ` · gemeldet ${eigen.map(w => zahl(w, 2)).join(", ") || "—"}`
    + ` · ${drinnen} von ${eigen.length} innerhalb der Kontrollspanne`);
}

console.log("");
console.log("LESART. Ein Merkmal trennt nur, wenn der gemeldete Wert AUSSERHALB");
console.log("der Kontrollspanne liegt. Liegt er darin, unterscheidet es eine");
console.log("Ausbruchstelle nicht von gewoehnlicher Schliffstruktur — dann waere");
console.log("eine Zusammenfuehrung nach diesem Merkmal blosse Naehe.");
console.log("");
console.log("Geschlossenheit ist hier ein MERKMAL (abdeckung, luecke), keine");
console.log("Vorbedingung. Die untersuchte Stelle ist nur an einer Flanke");
console.log("sichtbar; ein Pflicht-Rundumschluss wuerde genau sie verwerfen.");
console.log("");
console.log("Diese Zahlen begruenden keine Schwelle. Sie sagen, ob es sich lohnt,");
console.log("nach einer zu suchen — und an welchen Aufnahmen.");
