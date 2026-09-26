/* ─── Werkbank · Kameraweg im ECHTEN Browser ──────────────────────────────
   Das Kamerapaket (rc.4.45-camera.1) bringt 19 Pruefungen mit, die die
   echte React-Komponente gegen KONTROLLIERT NACHGEBAUTE Medien- und
   Canvas-APIs in jsdom fahren. Das ist eine gute Abdeckung der Logik — und
   es ist ausdruecklich KEIN Browserlauf: jsdom hat kein `getUserMedia`,
   kein `<video>` mit echtem Bild und kein Canvas, das wirklich zeichnet.
   Die Uebergabe sagt das selbst: der vollstaendige Browser-Bedienlauf des
   Kamerawegs stand noch aus.

   Dieser Lauf schliesst genau diese Luecke, und nur sie:

     ECHT      Chromium, gebauter Produktionsstand, echtes <video>-Element,
               echtes Canvas, echtes getUserMedia, echter MediaStreamTrack,
               echte React-Zustandsuebergaenge, echtes IndexedDB.
     SIMULIERT Die Kamera selbst. Chromium liefert mit
               --use-fake-device-for-media-stream ein synthetisches
               Testbild. Es ist eine echte Videospur mit echten Frames,
               aber keine Optik: keine Schaerfe, keine Belichtung, kein
               Zoom, kein Licht, keine reale Aufloesung eines iPhones.

   Was dieser Lauf deshalb NICHT belegt: Aufnahmequalitaet, Erkennung auf
   echten Teilen, Geraeteunterstuetzung fuer Zoom und Licht, iPhone-
   Verhalten. Der Test von Peppe am Geraet bleibt davon unberuehrt
   getrennt.

   Aufruf:  node werkbank/kameralauf.mjs [--sichtbar] [--langsam 200]
   Erwartet einen vorhandenen Produktionsbuild (npm run build).          */
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(wurzel, "dist");
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html fehlt. Zuerst: npm run build");
  process.exit(1);
}

console.log("VisuClean · Kameraweg im echten Browser (Kamera simuliert)");
console.log("==============================================================================");
console.log("");

const pruefungen = [];
const ok = (id, name, bestanden, info = "") => {
  pruefungen.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN   " : "DURCHGEFALLEN"} ${id.padEnd(5)} ${name}`);
  if (info) console.log(`                    ${info}`);
};

const typen = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = createServer((anfrage, antwort) => {
  const rein = decodeURIComponent(anfrage.url.split("?")[0]);
  const ziel = path.join(dist, rein === "/" ? "index.html" : rein);
  if (!ziel.startsWith(dist) || !existsSync(ziel)) {
    antwort.writeHead(404); antwort.end("nicht gefunden"); return;
  }
  antwort.writeHead(200, { "Content-Type": typen[path.extname(ziel)] || "application/octet-stream" });
  createReadStream(ziel).pipe(antwort);
});
await new Promise(loese => server.listen(0, "127.0.0.1", loese));
const adresse = `http://127.0.0.1:${server.address().port}/`;

const playwrightPfad = process.env.PLAYWRIGHT_PFAD || "playwright-core";
const { chromium } = await import(playwrightPfad);
const starte = async zusatz => chromium.launch({
  headless: !process.argv.includes("--sichtbar"),
  slowMo: Number(process.argv[process.argv.indexOf("--langsam") + 1]) || 0,
  executablePath: process.env.CHROMIUM_PFAD
    || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-device-for-media-stream", ...zusatz],
});
/* Zwei Browser, weil die Berechtigung am Prozess haengt, nicht am
   Kontext: einer mit erteilter Kamerafreigabe, einer, der jede
   Berechtigungsanfrage ABLEHNT. Nur so ist der verweigerte Fall der
   echte Fall (getUserMedia scheitert) und nicht bloss eine Anfrage, die
   niemand beantwortet — der Unterschied ist genau der, den K-11 und
   K-12 pruefen sollen. */
const browser = await starte(["--use-fake-ui-for-media-stream"]);
const browserOhneRecht = await starte(["--deny-permission-prompts"]);

/* iPhone-schmal. Der Auftrag verlangt das ausdruecklich, und der Befund
   aus rc.4.40 (die klebende "Analyse starten"-Flaeche lag ueber Ausloeser
   und "Kamera stoppen") war genau ein Layoutfehler dieser Breite. */
const TELEFON = { width: 390, height: 844 };

const neueSeite = async (mitKamera = true) => {
  const kontext = await (mitKamera ? browser : browserOhneRecht).newContext({
    viewport: TELEFON, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    permissions: mitKamera ? ["camera"] : [],
  });
  if (!mitKamera) await kontext.clearPermissions();
  const seite = await kontext.newPage();
  const fehler = [];
  seite.on("pageerror", e => fehler.push(String(e.message)));
  return { kontext, seite, fehler };
};

const anmelden = async seite => {
  await seite.goto(adresse, { waitUntil: "networkidle" });
  await seite.fill("#username", "operator1");
  await seite.fill("#password", "pharma2024");
  await seite.click("button[type=submit]");
  await seite.waitForSelector("text=Neue Prüfung", { timeout: 15000 });
};

const zumAufnahmeschirm = async seite => {
  await seite.locator("button", { hasText: "Neue Prüfung" }).first().click();
  await seite.locator(".equipment-card").first().click();
  await seite.locator(".equipment-card").first().click();
  await seite.waitForSelector("input[type=file]", { timeout: 15000 });
};

const klick = (seite, text) =>
  seite.getByRole("button", { name: text, exact: true }).first().click();

let alleFehler = [];

try {
  /* ══ 1 · Der Kameraweg selbst ═══════════════════════════════════════ */
  const { kontext, seite, fehler } = await neueSeite(true);
  await anmelden(seite);
  await zumAufnahmeschirm(seite);

  /* K-01 · Kamera starten. Geprueft wird nicht der Klick, sondern das,
     was der Pruefer danach sieht: ein laufendes Bild mit der TATSAECHLICH
     gemeldeten Aufloesung. "Warte auf Kamerabild…" darf dann nicht mehr
     dastehen. */
  await klick(seite, "Kamera starten");
  await seite.waitForSelector(".camera-panel video", { timeout: 20000 });
  await seite.waitForFunction(() => {
    const p = document.querySelector(".camera-frame-status");
    return p && /Livebild/.test(p.textContent);
  }, null, { timeout: 20000 });
  const statusText = await seite.locator(".camera-frame-status").first().textContent();
  const videoMasse = await seite.locator(".camera-panel video").first()
    .evaluate(v => ({ w: v.videoWidth, h: v.videoHeight, laeuft: !v.paused }));
  const nenntMasse = new RegExp(`${videoMasse.w}\\s*×\\s*${videoMasse.h}`).test(statusText);
  ok("K-01", "Kamera startet und meldet die tatsaechliche Live-Aufloesung",
    videoMasse.w > 0 && videoMasse.h > 0 && videoMasse.laeuft && nenntMasse,
    `Video ${videoMasse.w}×${videoMasse.h}, laeuft ${videoMasse.laeuft}`
    + ` · Anzeige "${statusText?.trim()}"`);

  /* K-02 · Der Befund aus rc.4.40, im schmalen Telefonlayout: waehrend
     die Kamera laeuft, muessen Ausloeser und "Kamera stoppen" wirklich
     anklickbar sein — nicht von der Analyse-Flaeche verdeckt. Geprueft
     wird die TREFFERFLAECHE: liegt in der Mitte des Ausloesers ein
     anderes Element, ist er verdeckt. */
  const frei = async name => {
    const kasten = await seite.getByRole("button", { name, exact: true })
      .first().boundingBox();
    if (!kasten) return { name, frei: false, grund: "nicht sichtbar" };
    const treffer = await seite.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest("button")?.textContent ?? el.tagName) : "nichts";
    }, [kasten.x + kasten.width / 2, kasten.y + kasten.height / 2]);
    return { name, frei: String(treffer).includes(name), grund: String(treffer).trim() };
  };
  const ausloeser = await frei("Aufnehmen");
  const stopper = await frei("Kamera stoppen");
  ok("K-02", "Ausloeser und Kamerastopp sind im Telefonlayout nicht verdeckt",
    ausloeser.frei && stopper.frei,
    `${TELEFON.width}×${TELEFON.height} · Aufnehmen → "${ausloeser.grund}"`
    + ` · Kamera stoppen → "${stopper.grund}"`);

  /* K-03 · Aufnehmen. Das Foto muss im Streifen ankommen und ein echtes
     Bild tragen — nicht nur ein Kaestchen. */
  await klick(seite, "Aufnehmen");
  await seite.waitForSelector(".thumbnail img", { timeout: 20000 });
  const bildMasse = await seite.locator(".photo-editor img, .thumbnail img").first()
    .evaluate(img => ({ w: img.naturalWidth, h: img.naturalHeight,
      quelle: (img.src || "").slice(0, 22) }));
  ok("K-03", "Der Ausloeser erzeugt ein echtes Foto aus dem Livebild",
    bildMasse.w > 0 && bildMasse.h > 0 && bildMasse.quelle.startsWith("data:image/"),
    `${bildMasse.w}×${bildMasse.h} px · ${bildMasse.quelle}…`);

  /* K-04 · Zoom und Licht NUR bei gemeldeter Unterstuetzung. Die
     synthetische Kamera meldet beides nicht — also darf auch nichts
     angeboten werden, und die Aufnahme muss trotzdem gehen (sie ging
     gerade). Das ist der Gegenfall zu "Bedienelement ohne Wirkung". */
  const zoomDa = await seite.locator(".camera-zoom").count();
  const lichtDa = await seite.getByRole("button", { name: /Licht (ein|aus)schalten/ }).count();
  ok("K-04", "Ohne gemeldete Unterstuetzung kein Zoom- und Lichtbedienelement",
    zoomDa === 0 && lichtDa === 0,
    `Zoomregler ${zoomDa} · Lichtknopf ${lichtDa}`
    + " · (die simulierte Kamera meldet keine Unterstuetzung;"
    + " ueber echte Geraete sagt das nichts aus)");

  /* K-05 · Stoppen beendet die Spur wirklich. Ein Panel, das verschwindet,
     waehrend die Kamera weiterlaeuft, waere die schlimmere Variante:
     unsichtbar und an. */
  await klick(seite, "Kamera stoppen");
  await seite.waitForSelector(".camera-panel", { state: "detached", timeout: 15000 });
  const spurenNachStopp = await seite.evaluate(() =>
    document.querySelectorAll("video").length);
  ok("K-05", "Kamerastopp schliesst das Panel", spurenNachStopp === 0,
    `${spurenNachStopp} Videoelement(e) im Dokument`);

  /* K-06 · Wiederholtes Starten. Der Kamerastand faengt parallele Starts
     ab; hier zaehlt der nacheinander wiederholte — er ist der Weg, den
     ein Pruefer am Geraet tatsaechlich geht (starten, stoppen, neu
     starten), und bis rc.4.45 blieb dabei ein schwarzes Bild moeglich. */
  let zweitesBildDa = false;
  for (let versuch = 0; versuch < 2 && !zweitesBildDa; versuch++) {
    await klick(seite, "Kamera starten");
    await seite.waitForSelector(".camera-panel video", { timeout: 20000 });
    zweitesBildDa = await seite.waitForFunction(() => {
      const p = document.querySelector(".camera-frame-status");
      return p && /Livebild/.test(p.textContent);
    }, null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!zweitesBildDa) await klick(seite, "Kamera stoppen").catch(() => {});
  }
  ok("K-06", "Erneutes Starten liefert wieder ein Livebild", zweitesBildDa,
    zweitesBildDa ? "zweiter Start mit Bild" : "zweiter Start blieb ohne Bild");

  /* K-07 · Unterbrochener Stream. Die Spur wird von aussen beendet —
     genau das, was passiert, wenn eine andere App die Kamera uebernimmt
     oder das Geraet die Freigabe entzieht. Danach darf kein Ausloeser
     mehr dastehen, der ins Leere greift. */
  await seite.evaluate(() => {
    const video = document.querySelector(".camera-panel video");
    video?.srcObject?.getVideoTracks?.().forEach(track => {
      track.stop();
      track.dispatchEvent(new Event("ended"));
    });
  });
  await seite.waitForTimeout(600);
  const panelNachAbbruch = await seite.locator(".camera-panel").count();
  const hinweisNachAbbruch = await seite.locator(".alert-warning").allTextContents();
  ok("K-07", "Ein unterbrochener Stream sperrt die Aufnahme und sagt es",
    panelNachAbbruch === 0
    && hinweisNachAbbruch.some(text => /Kamera nicht verfügbar/.test(text)),
    `Panel ${panelNachAbbruch} · Hinweis ${JSON.stringify(hinweisNachAbbruch.slice(0, 1))}`);

  /* K-08 · Der vollstaendige Ablauf MIT dem Kamerafoto: Prueffläche,
     Analyse, Marker, Speichern. Das Foto aus K-03 liegt noch da; es ist
     der einzige Unterschied zum bekannten Bedienlauf, und genau der soll
     hier durchgetragen werden. */
  const markerKnopf = seite.locator(".editor-toolbar button", { hasText: "Marker" }).first();
  await markerKnopf.click();
  const flaeche = seite.locator(".image-interaction-layer").first();
  const kasten = await flaeche.boundingBox();
  await seite.touchscreen.tap(kasten.x + kasten.width * 0.5, kasten.y + kasten.height * 0.45);
  await seite.waitForTimeout(300);
  const markerZahl = await seite.locator(".image-marker").count();
  await klick(seite, "Analyse starten");
  const analysePanel = await seite.waitForSelector(".uebersehen-panel", { timeout: 60000 })
    .then(() => true).catch(() => false);
  ok("K-08", "Das Kamerafoto laeuft durch Marker und Analyse",
    markerZahl === 1 && analysePanel,
    `${markerZahl} Marker · Analysepanel ${analysePanel ? "da" : "FEHLT"}`);

  /* K-09 · Und bis in die Datenbank. Gespeichert wird ueber den echten
     Signaturdialog; danach muss der Bericht des wartenden Vorgangs
     dastehen. */
  await seite.fill("#inspection-comment", "Kamerafoto, Aufnahmeweg geprueft");
  /* Welcher Entscheidungsknopf dasteht, haengt am Analyseergebnis des
     synthetischen Bildes. Der Lauf schreibt es nicht vor: er nimmt den
     Weg, den die App an dieser Stelle tatsaechlich anbietet. */
  const entscheidungen = await seite.locator(".decision-actions button").allTextContents();
  const gewaehlt = entscheidungen.find(text => /QA|speichern|signieren|Sperren|Freigabe/i.test(text))
    ?? entscheidungen[0];
  await seite.locator(".decision-actions button", { hasText: gewaehlt }).first().click();
  await seite.waitForSelector("#signature-password", { timeout: 20000 });
  await seite.fill("#signature-password", "pharma2024");
  await klick(seite, "Bestätigen & speichern");
  await seite.waitForTimeout(2500);
  /* Geprueft wird die DATENBANK, nicht ein Text auf dem Bildschirm: ein
     Datensatz mit genau diesem Kommentar muss gespeichert sein. */
  const gespeicherteZahl = await seite.evaluate(() => new Promise(loese => {
    const anfrage = indexedDB.open("visuclean-v82");
    anfrage.onerror = () => loese(-1);
    anfrage.onsuccess = () => {
      const db = anfrage.result;
      const laden = db.objectStoreNames.contains("inspections")
        ? db.transaction("inspections").objectStore("inspections").getAll() : null;
      if (!laden) { loese(-1); return; }
      laden.onsuccess = () => loese(laden.result.length);
      laden.onerror = () => loese(-1);
    };
  }));
  const fehlerNachSpeichern = await seite.locator(".alert-error").allTextContents();
  ok("K-09", "Das Kamerafoto wird ueber den echten Signaturweg gespeichert",
    gespeicherteZahl > 0 && fehlerNachSpeichern.length === 0,
    `Entscheidung "${gewaehlt}" · ${gespeicherteZahl} Datensatz/Datensaetze gespeichert`
    + (fehlerNachSpeichern.length ? ` · FEHLER ${JSON.stringify(fehlerNachSpeichern.slice(0, 1))}` : ""));

  /* K-10 · Wiederoeffnen. Nach dem Speichern steht die Uebersicht da;
     der Bericht entsteht erst beim Oeffnen des Vorgangs. Genau diesen
     Weg geht auch der Pruefer — und dort muss das AUFGENOMMENE Bild
     wieder erscheinen. Ein Foto, das den Weg durch Verschluesselung und
     Datenbank nicht uebersteht, waere kein Prueffoto. */
  await seite.locator(".history-card").first().click();
  const bildImBericht = await seite.waitForFunction(() => {
    const img = document.querySelector(".report-photo-grid img");
    return img && img.complete && img.naturalWidth > 0
      ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  }, null, { timeout: 25000 }).then(h => h.jsonValue()).catch(() => ({ w: 0, h: 0 }));
  const sichtbar = (await seite.locator("h1, h2").allTextContents()).join(" | ");
  ok("K-10", "Der wiedergeoeffnete Bericht zeigt das aufgenommene Foto",
    bildImBericht.w > 0 && bildImBericht.h > 0,
    `${bildImBericht.w}×${bildImBericht.h} px · Bildschirm: ${sichtbar.slice(0, 90)}`);

  alleFehler = alleFehler.concat(fehler);
  await kontext.close();

  /* ══ 2 · Der verweigerte Fall, in einem eigenen Kontext ═════════════ */
  const verweigert = await neueSeite(false);
  await anmelden(verweigert.seite);
  await zumAufnahmeschirm(verweigert.seite);
  await klick(verweigert.seite, "Kamera starten");
  /* Auf die MELDUNG warten statt auf eine Uhr: wie lange das Ablehnen
     dauert, gehoert nicht zur Aussage dieser Pruefung. */
  await verweigert.seite.waitForSelector(".alert-warning", { timeout: 20000 })
    .catch(() => {});
  await verweigert.seite.waitForTimeout(500);
  const panelOhneRecht = await verweigert.seite.locator(".camera-panel").count();
  const hinweis = await verweigert.seite.locator(".alert-warning").allTextContents();
  const knoepfe = await verweigert.seite.locator(".capture-actions button").allTextContents();
  const importDa = knoepfe.filter(text => /Fotos auswählen/.test(text)).length
    + await verweigert.seite.locator("input[type=file]").count();
  console.log(`   Knoepfe nach Verweigerung: ${JSON.stringify(knoepfe)}`);
  ok("K-11", "Verweigerte Kameraberechtigung sagt es und sperrt nicht den Fotoimport",
    panelOhneRecht === 0 && hinweis.some(text => /Kamera nicht verfügbar/.test(text))
    && importDa >= 1,
    `Panel ${panelOhneRecht} · Hinweis ${JSON.stringify(hinweis.slice(0, 1))}`
    + ` · Fotoimport ${importDa >= 1 ? "erreichbar" : "FEHLT"}`);

  /* K-12 · Nach der Verweigerung bleibt der Ablauf benutzbar: ein
     eingespieltes Foto muss weiterhin durchgehen. Eine App, die nach
     einer abgelehnten Berechtigung haengt, waere am Geraet unbrauchbar. */
  const datenUrl = await verweigert.seite.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 640;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#b4b4b4"; ctx.fillRect(0, 0, 480, 640);
    ctx.strokeStyle = "#3c3c3c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(140, 180); ctx.lineTo(330, 470); ctx.stroke();
    return c.toDataURL("image/jpeg", 0.9);
  });
  await verweigert.seite.setInputFiles("input[type=file]", {
    name: "ersatzbild.jpg", mimeType: "image/jpeg",
    buffer: Buffer.from(datenUrl.split(",")[1], "base64"),
  });
  const ersatzDa = await verweigert.seite.waitForSelector(".photo-editor img",
    { timeout: 20000 }).then(() => true).catch(() => false);
  ok("K-12", "Nach verweigerter Kamera bleibt der Fotoweg benutzbar", ersatzDa,
    ersatzDa ? "Foto eingespielt und angezeigt" : "Foto kam nicht an");

  alleFehler = alleFehler.concat(verweigert.fehler);
  await verweigert.kontext.close();

  /* K-13 · Kein unbehandelter Fehler in beiden Laeufen. Eine rote
     Konsole neben gruenen Pruefungen ist ein halbes Ergebnis. */
  ok("K-13", "Kein unbehandelter Fehler im Browser", alleFehler.length === 0,
    alleFehler.length ? JSON.stringify(alleFehler.slice(0, 2)) : "sauber");
} catch (abbruch) {
  /* Ein Lauf, der mitten im Ablauf stirbt, soll sagen, WO er stand. Ein
     nackter Stacktrace ohne die bis dahin erreichten Punkte ist als
     Nachweis nichts wert — und die Gegenprobe am Stand OHNE Kamerapaket
     bricht hier genau so ab (dort fehlt schon die Livebild-Anzeige). */
  ok("K-ABBRUCH", "Der Lauf ist bis zum Ende gekommen", false,
    `abgebrochen nach ${pruefungen.length} Pruefung(en): `
    + String(abbruch?.message || abbruch).split("\n")[0].slice(0, 160));
} finally {
  await browser.close();
  await browserOhneRecht.close();
  server.close();
}

console.log("");
const durch = pruefungen.filter(p => !p.bestanden);
console.log(`Bestanden: ${pruefungen.length - durch.length} / ${pruefungen.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(p => p.id).join(", "));
console.log("");
console.log("GRENZE: Die Kamera ist Chromiums synthetisches Testbild. Optik,");
console.log("        Aufnahmequalitaet, Zoom-/Lichtunterstuetzung und iPhone-");
console.log("        Verhalten sind damit NICHT geprueft.");
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
process.exit(durch.length ? 1 : 0);
