/* ─── Werkbank · Rahmen und Marker im echten Layout messen ─────────────────
 *
 * Aufruf:  node werkbank/rahmenmessung.mjs [Breite]
 *
 * WARUM DIESE DATEI NICHT IN `npm test` STEHT
 *
 * Sie braucht einen echten Browser mit Layout-Engine. playwright-core und
 * Chromium sind bewusst KEINE Abhängigkeit des ausgelieferten Pakets —
 * `npm ci` in einem leeren Verzeichnis soll ohne Browser-Download
 * durchlaufen. Der dauerhafte Wächter steht in pruefflaechetest (R5a) und
 * prüft die geltende CSS-Regel; er kann keine Pixel messen.
 *
 * WAS SIE MISST
 *
 * Die Gegenprüfung an rc.4.40 hat am Bildschirm nachgemessen: bei einem
 * Hochformatfoto im 4:3-Fenster war der Auswahlrahmen rund 201 px breit,
 * während die eingestellte Prüffläche 25 % von 340 px sichtbarer
 * Fotobreite entspricht — also 85 px. Nachgerechnet für 900x1600 im
 * 320x240-Fenster: 243,2 px gezeichnet statt 102,6 px.
 *
 * Ursache: `.zoom-layer` füllte das ganze 4:3-Fenster, das Foto darin nur
 * einen Teil (`object-fit: contain`). Kinder, die in Prozent der Ebene
 * positioniert werden — Rahmen UND Marker — bezogen sich damit auf das
 * Fenster einschliesslich der schwarzen Ränder.
 *
 * Gemessen wird hier deshalb in Pixeln, im echten Layout:
 *   - liegt der Rahmen exakt auf dem Ausschnitt des SICHTBAREN Fotos?
 *   - liegt ein Marker bei 0,5/0,5 in der Mitte des SICHTBAREN Fotos?
 *   - gilt das im Hoch- UND im Querformat?
 *
 * GRENZE: gemessen wird in einem Desktop-Chromium mit gesetzter
 * Viewport-Breite, gegen die echte styles.css und die echte
 * Editor-Struktur. Das ist kein iPhone. Die Messung ersetzt den
 * Gerätelauf nicht — sie ersetzt die Behauptung.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/* playwright-core ist KEINE Paketabhaengigkeit. Liegt es anderswo, wird
   dieses Skript von dort aus gestartet und der Projektpfad per
   VISUCLEAN_PFAD gesetzt:

     cd /pfad/zu/playwright && VISUCLEAN_PFAD=/pfad/zu/visuclean \
       node /pfad/zu/visuclean/werkbank/rahmenmessung.mjs            */
const projekt = process.env.VISUCLEAN_PFAD
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { aufFenster, bemalteFlaeche, rechteckAufFenster } =
  await import(path.join(projekt, "src", "inspectionArea.js"));
const BREITE = Number(process.argv[2] || 390);
const PFAD = process.env.CHROMIUM_PFAD || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const css = readFileSync(path.join(projekt, "src", "styles.css"), "utf8");

/* Ein Testbild mit bekanntem Seitenverhältnis. SVG, damit keine Binärdatei
   ins Paket wandert und die Groesse exakt bekannt ist. */
const bild = (b, h) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}">`
  + `<rect width="100%" height="100%" fill="#777"/></svg>`);

/* Die Prüffläche, die gemessen wird — dieselben Zahlen wie die
   Voreinstellung in inspectionArea.js. */
const F = { x: 0.12, y: 0.12, w: 0.76, h: 0.76 };

const FAELLE = [
  { name: "Hochformat 900x1600", b: 900, h: 1600 },
  { name: "Querformat 1600x900", b: 1600, h: 900 },
  { name: "Quadrat 1000x1000", b: 1000, h: 1000 },
];

/* Gesetzt wird mit GENAU der Umrechnung, die auch die App verwendet —
   sonst misst dieses Skript ein Fixture und nicht das Verhalten. Das war
   der zweite eigene Fehlgriff hier: die erste Fassung schrieb die Prozente
   direkt hin und bildete damit den alten Zustand nach; sie konnte die
   Reparatur gar nicht bestaetigen. */
const seiteHtml = (quelle, fb, fh) => {
  const bemalt = bemalteFlaeche(fb, fh);
  const rahmen = rechteckAufFenster(F, bemalt);
  const marker = aufFenster({ x: 0.5, y: 0.5 }, bemalt);
  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><style>${css}</style>
<style>body{margin:0}.huelle{width:${BREITE - 26}px}</style></head>
<body><div class="huelle"><div class="photo-editor">
  <div class="zoom-viewport">
    <div class="zoom-layer">
      <img id="foto" src="${quelle}" alt="">
      <span class="flaeche-rahmen" id="rahmen" style="left:${rahmen.x * 100}%;top:${rahmen.y * 100}%;width:${rahmen.w * 100}%;height:${rahmen.h * 100}%"></span>
      <button type="button" class="image-marker" id="marker" style="left:${marker.x * 100}%;top:${marker.y * 100}%">1</button>
    </div>
  </div>
</div></div></body></html>`;
};

const browser = await chromium.launch({ executablePath: PFAD });
const seite = await browser.newPage({ viewport: { width: BREITE, height: 900 } });

console.log(`VisuClean · Werkbank · Rahmen- und Markergeometrie bei ${BREITE} px`);
console.log("=".repeat(72));
console.log("Gemessen im echten Layout gegen die echte styles.css.");
console.log("Kein iPhone — die Messung ersetzt den Geraetelauf nicht.");
console.log("=".repeat(72));

let fehler = 0;
const TOLERANZ = 1.0;   // px; Rundung im Layout

try {
  for (const fall of FAELLE) {
    await seite.setContent(seiteHtml(bild(fall.b, fall.h), fall.b, fall.h));
    await seite.waitForFunction(() => {
      const el = document.getElementById("foto");
      return el && el.getBoundingClientRect().width > 0;
    });
    const mass = await seite.evaluate(() => {
      const r = el => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      /* EIGENER MESSFEHLER, hier festgehalten: der erste Versuch verglich
         den Rahmen mit getBoundingClientRect() des <img>. Das ist die BOX
         des Elements — bei `object-fit: contain` liegt das Bild nur
         INNERHALB dieser Box, mit Raendern. Die Box entsprach immer der
         Ebene, also stimmte der Rahmen per Konstruktion mit ihr ueberein,
         und die Messung war gruen, ohne den Fehler beruehren zu koennen.

         Gemessen wird deshalb die BEMALTE Flaeche. Eine DOM-Abfrage dafuer
         gibt es nicht; sie folgt aber eindeutig aus der natuerlichen
         Bildgroesse und der Box — genau das ist die Definition von
         `contain`. */
      const el = document.getElementById("foto");
      const box = r(el);
      const stil = getComputedStyle(el);
      let bemalt = box;
      if (stil.objectFit === "contain" && el.naturalWidth && el.naturalHeight) {
        const s = Math.min(box.w / el.naturalWidth, box.h / el.naturalHeight);
        const bw = el.naturalWidth * s, bh = el.naturalHeight * s;
        bemalt = { x: box.x + (box.w - bw) / 2, y: box.y + (box.h - bh) / 2, w: bw, h: bh };
      }
      return {
        foto: bemalt,
        fotoBox: box,
        objectFit: stil.objectFit,
        rahmen: r(document.getElementById("rahmen")),
        marker: r(document.getElementById("marker")),
        fenster: r(document.querySelector(".zoom-viewport")),
      };
    });

    const sollX = mass.foto.x + F.x * mass.foto.w;
    const sollY = mass.foto.y + F.y * mass.foto.h;
    const sollB = F.w * mass.foto.w;
    const sollH = F.h * mass.foto.h;
    const dX = Math.abs(mass.rahmen.x - sollX);
    const dY = Math.abs(mass.rahmen.y - sollY);
    const dB = Math.abs(mass.rahmen.w - sollB);
    const dH = Math.abs(mass.rahmen.h - sollH);
    /* Der Marker traegt 44 px Kantenlaenge und wird ueber
       translate(-50%,-50%) zentriert; gemessen wird sein Mittelpunkt. */
    const mX = mass.marker.x + mass.marker.w / 2;
    const mY = mass.marker.y + mass.marker.h / 2;
    const dMX = Math.abs(mX - (mass.foto.x + 0.5 * mass.foto.w));
    const dMY = Math.abs(mY - (mass.foto.y + 0.5 * mass.foto.h));

    const gut = Math.max(dX, dY, dB, dH, dMX, dMY) <= TOLERANZ;
    if (!gut) fehler += 1;

    console.log(`\n${gut ? "OK  " : "FEHL"} ${fall.name}`);
    console.log(`  Fenster        ${mass.fenster.w.toFixed(1)} x ${mass.fenster.h.toFixed(1)} px`);
    console.log(`  Bildbox        ${mass.fotoBox.w.toFixed(1)} x ${mass.fotoBox.h.toFixed(1)} px`
      + `  (object-fit: ${mass.objectFit})`);
    console.log(`  BEMALTES Foto  ${mass.foto.w.toFixed(1)} x ${mass.foto.h.toFixed(1)} px`
      + (Math.abs(mass.foto.w - mass.fotoBox.w) > 1
        ? `  (Seitenrand je ${((mass.fotoBox.w - mass.foto.w) / 2).toFixed(1)} px)`
        : "  (keine Raender)"));
    console.log(`  Rahmen soll    ${sollB.toFixed(1)} x ${sollH.toFixed(1)} px bei`
      + ` (${sollX.toFixed(1)}, ${sollY.toFixed(1)})`);
    console.log(`  Rahmen ist     ${mass.rahmen.w.toFixed(1)} x ${mass.rahmen.h.toFixed(1)} px bei`
      + ` (${mass.rahmen.x.toFixed(1)}, ${mass.rahmen.y.toFixed(1)})`);
    console.log(`  Abweichung     Breite ${dB.toFixed(1)} px · Hoehe ${dH.toFixed(1)} px`
      + ` · Lage ${dX.toFixed(1)}/${dY.toFixed(1)} px`);
    console.log(`  Marker 0,5/0,5 Abweichung ${dMX.toFixed(1)}/${dMY.toFixed(1)} px`);
  }
} finally {
  await browser.close();
}

console.log("");
console.log("=".repeat(72));
if (fehler) {
  console.log(`ERGEBNIS: DURCHGEFALLEN — ${fehler} von ${FAELLE.length} Faellen`);
  console.log("Rahmen und/oder Marker beziehen sich nicht auf die Fotoflaeche.");
} else {
  console.log(`ERGEBNIS: BESTANDEN — ${FAELLE.length} Faelle, Abweichung <= ${TOLERANZ} px`);
}
process.exit(fehler ? 1 : 0);
