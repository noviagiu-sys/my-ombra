/* ─── Werkbank · Bildschirmbreite messen, nicht behaupten ──────────────────
   Aufruf:  node werkbank/breitenmessung.mjs [Basis-URL] [Breite]
   Beispiel: npm run preview   (in einem zweiten Terminal)
             node werkbank/breitenmessung.mjs http://localhost:4173 390

   WARUM DIESE DATEI NICHT IN `npm test` STEHT:
   Sie braucht einen echten Browser mit Layout-Engine (playwright-core und
   ein installiertes Chromium). Beides ist bewusst KEINE Abhaengigkeit des
   ausgelieferten Pakets — `npm ci` in einem leeren Verzeichnis soll ohne
   Browser-Download durchlaufen. Der dauerhafte Waechter in
   screeninganzeigetest.mjs (T8) prueft stattdessen die Struktur und die
   geltende CSS-Regel; er kann keine Pixel messen.

   WAS SIE MISST:
   scrollWidth des Dokuments gegen die Fensterbreite. Ist die Seite breiter
   als das Fenster, wandert das Layout seitlich, und Bedienelemente am
   rechten Rand sind nicht mehr erreichbar. Zusaetzlich wird geprueft, ob
   die breite Screening-Tabelle in ihrem eigenen Scrollbereich liegt —
   dort IST Ueberbreite richtig, sie darf nur nicht auf die Seite
   durchschlagen.

   GRENZE: gemessen wird der gebaute Bildschirm in einem Desktop-Chromium
   mit gesetzter Viewport-Breite. Das ist kein iPhone. Schriftskalierung,
   Systemschrift und Browserleisten koennen auf einem echten Geraet
   abweichen — die Messung ersetzt den Handytest nicht, sie ersetzt nur
   die Behauptung.                                                        */

import { chromium } from "playwright-core";

const BASIS = process.argv[2] || "http://localhost:4173";
const BREITE = Number(process.argv[3] || 390);
const PFAD = process.env.CHROMIUM_PFAD || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: PFAD });
const seite = await browser.newPage({ viewport: { width: BREITE, height: 844 } });

console.log(`VisuClean · Breitenmessung bei ${BREITE} px`);
console.log(`Chromium: ${PFAD}`);
console.log("");

try {
  await seite.goto(BASIS, { waitUntil: "networkidle" });

  /* Der Ergebnis-Bildschirm ist ohne Anmeldung und ohne Aufnahme nicht
     erreichbar. Statt den Bedienweg nachzuspielen — was jede
     UI-Aenderung brechen wuerde — wird der gebaute ScreeningPanel-Markup
     in die laufende Seite eingesetzt. Gemessen wird damit das ECHTE CSS
     des gebauten Bundles an der ECHTEN Tabelle. */
  /* Die Verschachtelung muss der ECHTEN entsprechen: app-shell > screen >
     panel. Ein erster Anlauf haengte das Panel in die Anmeldeseite — die
     ist ein `display: grid; place-items: center`, und ein Grid-Track
     waechst mit dem max-content seines Kindes. Gemessen wurden dann 492 px
     Seitenbreite, die es auf dem Ergebnis-Bildschirm gar nicht gibt: ein
     Fehler des Messaufbaus, nicht der Anwendung. Deshalb wird der Koerper
     ersetzt statt ergaenzt. */
  const markup = process.env.PANEL_MARKUP || "";
  if (markup) {
    await seite.evaluate(html => {
      document.body.innerHTML =
        `<div class="app-shell"><div class="screen">${html}</div></div>`;
    }, markup);
  }

  const messung = await seite.evaluate(() => {
    const doc = document.documentElement;
    const bereich = document.querySelector(".table-scroll");
    const tabelle = document.querySelector(".screening-table");
    const knoten = [...document.querySelectorAll("body *")];
    const zuBreit = knoten
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(el => `${el.tagName.toLowerCase()}.${el.className || "-"}`)
      .slice(0, 8);
    return {
      fenster: window.innerWidth,
      seitenbreite: doc.scrollWidth,
      bereichBreite: bereich ? Math.round(bereich.getBoundingClientRect().width) : null,
      bereichScroll: bereich ? bereich.scrollWidth : null,
      bereichScrollbar: bereich
        ? getComputedStyle(bereich).overflowX : null,
      tabellenbreite: tabelle ? Math.round(tabelle.getBoundingClientRect().width) : null,
      zuBreit,
    };
  });

  /* Zwei Bedingungen, und die zweite ist die wichtigere.

     Ohne sie waere ein `overflow: hidden` irgendwo im Elternpfad genug,
     um diese Messung gruen zu faerben: die Seite bliebe schmal, die
     rechten Tabellenspalten waeren aber abgeschnitten und unerreichbar.
     Geprueft wird deshalb auch, dass eine Tabelle, die breiter ist als
     ihr sichtbarer Bereich, in einem TATSAECHLICH scrollbaren Bereich
     liegt. */
  const seiteSchmal = messung.seitenbreite <= messung.fenster + 1;
  const brauchtScroll = messung.tabellenbreite != null
    && messung.bereichBreite != null
    && messung.tabellenbreite > messung.bereichBreite + 1;
  const istScrollbar = ["auto", "scroll"].includes(messung.bereichScrollbar);
  const erreichbar = !brauchtScroll || istScrollbar;
  const seiteOk = seiteSchmal && erreichbar;
  console.log(`Fensterbreite          ${messung.fenster} px`);
  console.log(`Seitenbreite           ${messung.seitenbreite} px  ${seiteOk ? "OK" : "UEBERBREITE"}`);
  console.log(`Scrollbereich sichtbar ${messung.bereichBreite ?? "-"} px`);
  console.log(`Scrollbereich Inhalt   ${messung.bereichScroll ?? "-"} px`);
  console.log(`overflow-x             ${messung.bereichScrollbar ?? "-"}`);
  console.log(`Tabellenbreite         ${messung.tabellenbreite ?? "-"} px`);
  if (messung.zuBreit.length) {
    console.log("");
    console.log("Ueber den rechten Rand hinaus:");
    for (const e of messung.zuBreit) console.log(`  ${e}`);
  }
  console.log("");
  console.log(`Seite schmal genug     ${seiteSchmal}`);
  console.log(`Tabelle erreichbar     ${erreichbar}`
    + (brauchtScroll ? " (braucht Scrollbereich)" : " (passt ohne Scrollen)"));
  console.log("");
  console.log(`ERGEBNIS: ${seiteOk ? "BEDIENBAR" : "NICHT BEDIENBAR"}`);
  process.exit(seiteOk ? 0 : 1);
} finally {
  await browser.close();
}
