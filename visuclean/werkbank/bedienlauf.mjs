/* ─── Werkbank · Bedien- und Speicherlauf im ECHTEN Browser ───────────────
   Der Auftrag nach rc.4.44 verlangt ausdruecklich: "Meldung ueber die echte
   Oberflaeche anlegen, an QA uebergeben, ueber den echten Signaturdialog
   speichern, neu laden und exportieren."

   WARUM ES DAS BRAUCHT. Die bisherige Abdeckung hat den Fehler nicht
   gefunden, und zwar aus zwei benennbaren Gruenden:

   X1 suchte den Uebergabetext `manualFindings: schadensverdachte` per
   regulaerem Ausdruck IRGENDWO in App.jsx. Getroffen hat sie die Uebergabe
   an `collectQaTriggers` — den QA-ZAEHLER. Der Datensatzbau
   (`baueDatensatz`, der `signInspection` ruft) bekam die Meldungen nie.
   Eine Strukturwache, die die falsche Fundstelle trifft, ist schlimmer als
   keine: sie meldet Gruen fuer eine Leitung, die es nicht gibt.

   R1 startete mit einem VON HAND vollstaendig gefuellten Datensatz. Der
   Speicherweg funktionierte — nur erreichte der Test den fehlerhaften
   App-Aufrufer nie.

   Deshalb hier: kein Baustein, kein Nachbau, keine Fixture. Der gebaute
   Produktionsstand laeuft in Chromium, ein Mensch-aehnlicher Ablauf fuehrt
   ihn durch, und geprueft wird der JSON-EXPORT, den die App selbst
   erzeugt.

   Aufruf:  node werkbank/bedienlauf.mjs [--sichtbar] [--langsam 200]
   Erwartet einen vorhandenen Produktionsbuild (npm run build).          */
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(wurzel, "dist");
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html fehlt. Zuerst: npm run build");
  process.exit(1);
}

const pruefungen = [];
const ok = (id, name, bestanden, info = "") => {
  pruefungen.push({ id, bestanden });
  console.log(`${bestanden ? "BESTANDEN   " : "DURCHGEFALLEN"} ${id.padEnd(5)} ${name}`);
  if (info) console.log(`                    ${info}`);
};

/* ── Winziger statischer Server. Der Service Worker und die ES-Module
      brauchen http, file:// genuegt nicht. ─────────────────────────────── */
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
const browser = await chromium.launch({
  headless: !process.argv.includes("--sichtbar"),
  slowMo: Number(process.argv[process.argv.indexOf("--langsam") + 1]) || 0,
  executablePath: process.env.CHROMIUM_PFAD
    || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const abwurf = await mkdtemp(path.join(tmpdir(), "visuclean-bedienlauf-"));
/* Telefonkontext mit BERUEHRUNG. Mit der Maus leitet `setPointerCapture`
   auf dem Zoom-Viewport den anschliessenden `click` auf den Viewport um,
   und der Marker entsteht nicht — mit Touch nicht. VisuClean ist eine
   Telefon-App; gefahren wird deshalb so, wie sie benutzt wird. Der
   Mausfall ist in M-01 eigens festgehalten. */
const kontext = await browser.newContext({ acceptDownloads: true,
  viewport: { width: 430, height: 930 }, hasTouch: true, isMobile: true,
  deviceScaleFactor: 3 });
const seite = await kontext.newPage();
const fehler = [];
seite.on("pageerror", e => fehler.push(String(e.message)));

const knopfMit = async text => seite.locator("button", { hasText: text }).first();
const klickeText = async text => {
  const el = await knopfMit(text);
  await el.click();
};

/* Zurueck zur Startseite — ueber die echten Schaltflaechen und OHNE
   Seitenreload. Ein Reload verwirft den Anwendungszustand ohnehin; wer ihn
   zwischen zwei Pruefungen einbaut, beweist ueber `resetFlow` nichts mehr.
   Genau dieser Fehler steckte bis eben in diesem Lauf. */
const zurStartseite = async () => {
  await seite.getByRole("button", { name: "Schliessen" }).first().click()
    .catch(() => {});
  for (let i = 0; i < 8 && !(await seite.locator("text=Neue Prüfung").count()); i++) {
    await seite.getByRole("button", { name: "Zurück" }).first().click().catch(() => {});
    await seite.waitForTimeout(250);
  }
  if (!(await seite.locator("text=Neue Prüfung").count())) {
    await seite.getByRole("button", { name: "Startseite" }).first().click().catch(() => {});
    await seite.waitForTimeout(300);
  }
};

try {
  await seite.goto(adresse, { waitUntil: "networkidle" });

  /* 1 · Anmelden ueber den echten Anmeldeschirm. */
  await seite.fill("#username", "operator1");
  await seite.fill("#password", "pharma2024");
  await seite.click("button[type=submit]");
  await seite.waitForSelector("text=Neue Prüfung", { timeout: 15000 });
  ok("E1", "Anmeldung ueber den echten Anmeldeschirm", true, "operator1");

  /* 2 · Pruefung starten, Equipment und Zone waehlen. */
  await klickeText("Neue Prüfung");
  await seite.locator(".equipment-card").first().click();
  await seite.locator(".equipment-card").first().click();
  await seite.waitForSelector("input[type=file]", { timeout: 15000 });
  ok("E2", "Equipment und Zone ueber die echten Listen gewaehlt", true);

  /* 3 · Foto einspielen. Erzeugt wird es IM BROWSER, damit es ein echtes
         JPEG derselben Herkunft ist wie ein Kamerabild. */
  const datenUrl = await seite.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 640;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#b4b4b4"; ctx.fillRect(0, 0, 480, 640);
    ctx.strokeStyle = "#3c3c3c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(140, 180); ctx.lineTo(330, 470); ctx.stroke();
    return c.toDataURL("image/jpeg", 0.9);
  });
  const roh = Buffer.from(datenUrl.split(",")[1], "base64");
  /* Ein zweites, KANDIDATENREICHES Bild fuer den Kandidatenweg: viele
     kurze Riefen, damit die Vorauswahl (zehn je Rangfolge) nicht schon
     alles abdeckt. Ohne mehr als zehn Kandidaten liesse sich "nachladen"
     gar nicht pruefen. */
  const vieleUrl = await seite.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 640;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#b4b4b4"; ctx.fillRect(0, 0, 480, 640);
    ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 2;
    /* Feste Anordnung, kein Zufall: derselbe Lauf ergibt dasselbe Bild. */
    for (let i = 0; i < 40; i++) {
      const x = 40 + (i % 8) * 52;
      const y = 60 + Math.floor(i / 8) * 104;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26, y + 46); ctx.stroke();
    }
    return c.toDataURL("image/jpeg", 0.92);
  });
  const vieleRoh = Buffer.from(vieleUrl.split(",")[1], "base64");
  await seite.setInputFiles("input[type=file]",
    { name: "pruefbild.jpg", mimeType: "image/jpeg", buffer: roh });
  await seite.waitForSelector(".photo-editor img", { timeout: 15000 });
  ok("E3", "Foto ueber die echte Dateiauswahl eingespielt", true,
    `${roh.length} Byte JPEG`);

  /* 4 · ZWEI Marker setzen. Zwei, weil der Auftrag ausdruecklich prueft,
         dass sich zwei Meldungen auf demselben Foto nicht gegenseitig
         ersetzen. */
  await seite.locator(".editor-toolbar button", { hasText: "Marker" }).first().click();
  const bild = seite.locator(".image-interaction-layer").first();
  const kasten = await bild.boundingBox();
  const marker = () => seite.locator(".image-marker").count();
  const loesche = async () => {
    /* Marker entfernt man durch Antippen — so bleibt der Zustand sauber,
       ohne einen zweiten Weg zu benutzen, den es in der App nicht gibt. */
    let rest = await marker();
    while (rest > 0) {
      await seite.locator(".image-marker").first().click();
      await seite.waitForTimeout(120);
      rest = await marker();
    }
  };

  /* M1 · MIT DER MAUS. Der Befund aus der Gegenpruefung: hier entstand
     kein Marker, weil setPointerCapture den click umleitete. */
  await seite.mouse.click(kasten.x + kasten.width * 0.42, kasten.y + kasten.height * 0.35);
  await seite.waitForTimeout(200);
  const mitMaus = await marker();
  ok("M1", "Ein Mausklick setzt einen Marker", mitMaus === 1,
    `${mitMaus} Marker nach einem Klick`);
  await loesche();

  /* M2 · ZIEHEN darf keinen Marker setzen. Sonst waere die Reparatur die
     naechste Falle: jede Bildverschiebung hinterliesse eine Markierung. */
  await seite.mouse.move(kasten.x + kasten.width * 0.3, kasten.y + kasten.height * 0.3);
  await seite.mouse.down();
  for (const anteil of [0.4, 0.5, 0.6, 0.7]) {
    await seite.mouse.move(kasten.x + kasten.width * anteil,
      kasten.y + kasten.height * (0.3 + anteil * 0.3));
    await seite.waitForTimeout(30);
  }
  await seite.mouse.up();
  await seite.waitForTimeout(200);
  const nachZiehen = await marker();
  ok("M2", "Ziehen setzt keinen versehentlichen Marker", nachZiehen === 0,
    `${nachZiehen} Marker nach dem Ziehen`);
  await loesche();

  /* M3 · Und die BERUEHRUNG muss weiter funktionieren. Eine Reparatur fuer
     die Maus, die das Telefon bricht, waere keine. */
  await seite.touchscreen.tap(kasten.x + kasten.width * 0.42, kasten.y + kasten.height * 0.35);
  await seite.waitForTimeout(200);
  const mitTouch = await marker();
  ok("M3", "Beruehrung setzt weiterhin einen Marker", mitTouch === 1,
    `${mitTouch} Marker nach einem Tippen`);

  /* Zweiter Marker fuer den Speicherweg: zwei Meldungen auf EINEM Foto
     duerfen sich nicht gegenseitig ersetzen. */
  await seite.touchscreen.tap(kasten.x + kasten.width * 0.58, kasten.y + kasten.height * 0.62);
  await seite.waitForTimeout(150);
  const markerZahl = await marker();
  ok("E4", "Zwei Marker ueber das echte Bild gesetzt", markerZahl === 2,
    `${markerZahl} Marker`);

  /* 5 · Analyse. */
  await klickeText("Analyse starten");
  await seite.waitForSelector(".uebersehen-panel", { timeout: 30000 });
  ok("E5", "Analyse gelaufen, Panel fuer markierte Stellen da", true);

  /* 6 · ZWEI Schadensverdachte melden, ueber den echten Bedienweg. */
  console.log("   Panel-Knoepfe:", JSON.stringify(
    await seite.locator(".uebersehen-panel button").allTextContents()));
  for (let i = 0; i < 2; i++) {
    const melden = seite.locator("button", { hasText: "Als Schadensverdacht melden" }).first();
    console.log(`   Runde ${i + 1}: Melde-Knoepfe ${await seite.locator("button", { hasText: "Als Schadensverdacht melden" }).count()}`);
    await melden.click();
    console.log(`   Formulare: ${await seite.locator(".verdacht-form").count()}`);
    const feld = seite.locator(".verdacht-form textarea").first();
    await feld.fill(`Gesehene Stelle Nummer ${i + 1}, vom Detektor nicht gemeldet`);
    /* GENAU dieser Knopf. "Verdacht melden" ist eine Teilzeichenkette von
       "Als Schadensverdacht melden"; eine unscharfe Suche trifft den
       Melde-Knopf und klappt das Formular nur wieder zu. */
    await seite.getByRole("button", { name: "Verdacht melden", exact: true })
      .first().click();
    await seite.waitForTimeout(200);
  }
  const gemeldet = await seite.locator(".verdacht-offen").count();
  ok("E6", "Zwei Meldungen ueber die echte Oberflaeche angelegt",
    gemeldet >= 2, `${gemeldet} offene Meldungen sichtbar`);

  /* 7 · Abschluss ueber den echten Signaturdialog — als UEBERGABE AN DIE
         QA, genau wie der Auftrag es nennt ("melden, an QA uebergeben,
         ueber den echten Signaturdialog speichern"). Ein offener Verdacht
         sperrt PASS und Override; die Uebergabe bleibt frei und ist der
         Weg, den ein Pruefer hier tatsaechlich geht.

         Damit steht fuer BEFUND D ein wartender Datensatz mit zwei offenen
         Meldungen bereit — der Fall, in dem die QA bisher nichts tun
         konnte ausser sperren. */
  await seite.fill("#inspection-comment",
    "Zwei Stellen gemeldet, Beurteilung durch die QA");
  console.log("   Entscheidungsknoepfe:", JSON.stringify(
    await seite.locator(".decision-actions button").allTextContents()));
  await klickeText("Erfassen und an QA uebergeben");
  await seite.waitForTimeout(400);
  console.log("   Nach Klick sichtbar:", (await seite.locator("h1").allTextContents()).join(" | "));
  await seite.waitForSelector("#signature-password", { timeout: 15000 });
  await seite.fill("#signature-password", "pharma2024");
  await klickeText("Bestätigen & speichern");
  await seite.waitForTimeout(1500);
  console.log("   Nach dem Speichern:", (await seite.locator("h1").allTextContents()).join(" | "));
  const meldung = await seite.locator(".alert-error, .alert-warning").allTextContents();
  if (meldung.length) console.log("   Meldungen:", JSON.stringify(meldung.slice(0, 2)));
  /* Nach dem Speichern zeigt die App den Pruefbericht, nicht die
     Startseite. */
  /* Nach der Uebergabe zeigt die App den Bericht des wartenden Vorgangs. */
  await seite.waitForSelector("text=wartet auf die Freigabe", { timeout: 30000 });
  const wartendAngezeigt = await seite.locator("text=Freigabe ausstehend").count();
  ok("E7", "Ueber den echten Signaturdialog an die QA uebergeben",
    wartendAngezeigt > 0,
    wartendAngezeigt ? "Pruefprotokoll, Freigabe ausstehend"
      : "gespeichert, aber nicht als wartender Vorgang ausgewiesen");

  /* 8 · ZURUECK ZUR STARTSEITE — OHNE SEITENRELOAD.

     BEFUND an meinem eigenen Beweis: hier stand bis eben ein
     `seite.reload()`. Damit lag zwischen der ersten und der zweiten
     Pruefung ein vollstaendiger Neustart der Anwendung, der den
     React-Zustand ohnehin verwirft — E12/E12b/E13 waren gruen, ohne dass
     `resetFlow` irgendetwas haette raeumen muessen. Eine Gegenprobe mit
     zurueckgebautem Reset blieb deshalb ebenfalls gruen: der Beweis war
     gruen aus dem falschen Grund.

     Der Reload steht jetzt NACH der zweiten Pruefung; erst dort belegt er,
     was wirklich in der verschluesselten Datenbank liegt. Bis dahin
     bewegt sich der Lauf ausschliesslich ueber die echten
     Zurueck-Schaltflaechen. */
  await zurStartseite();

  /* ── 12 · ZWEITE PRUEFUNG, OHNE NEULADEN ────────────────────────────
     BEFUND der Gegenpruefung an rc.4.44: `resetFlow` raeumte die
     gemeldeten Schadensverdachte nicht. Die naechste Pruefung startete mit
     Meldung und QA-Pflicht der vorigen — an einem Foto und einem Marker,
     die es dort gar nicht mehr gibt.

     Die zusaetzlichen Setter sind eine Reparatur; der Nachweis ist dieser
     Ablauf. Ausdruecklich OHNE Seitenreload: ein Reload wuerde den
     Zustand ohnehin verwerfen und damit nichts belegen. */
  await klickeText("Neue Prüfung");
  await seite.locator(".equipment-card").first().click();
  await seite.locator(".equipment-card").first().click();
  await seite.waitForSelector("input[type=file]", { timeout: 15000 });
  await seite.setInputFiles("input[type=file]",
    { name: "zweites.jpg", mimeType: "image/jpeg", buffer: vieleRoh });
  await seite.waitForSelector(".photo-editor img", { timeout: 15000 });
  await klickeText("Analyse starten");
  await seite.waitForSelector(".decision-actions", { timeout: 30000 });
  const uebernommen = await seite.locator(".verdacht-offen, .verdacht-geklaert").count();
  const verdachtPanel = await seite.locator(".verdacht-panel").count();
  ok("E12", "Die zweite Pruefung uebernimmt keine Meldung der ersten",
    uebernommen === 0 && verdachtPanel === 0,
    `${uebernommen} uebernommene Meldung(en) · ${verdachtPanel} Klaerungspanel`);

  /* E12b · Und auch KEINE Tiefenmessung und KEINE Foto-/Markerbindung aus
     dem Vorvorgang. Beide waren Teil desselben Reset-Problems: eine
     uebernommene Messung zeigt auf ein Foto, das es in dieser Pruefung
     nicht gibt, und wuerde als Befund dieser Pruefung gespeichert.

     Geprueft wird die Liste der manuell markierten Stellen: in der zweiten
     Pruefung wurde KEIN Marker gesetzt, also darf dort auch keine Zeile
     stehen — weder eine Messung noch ein Markerbezug. */
  const alteMessung = await seite.locator(".tiefe-panel, .depth-panel").count();
  const alteMarkerZeilen = await seite.locator(".uebersehen-liste li").count();
  const alteMarkerbindung = await seite.locator(".uebersehen-panel").count();
  ok("E12b", "Die zweite Pruefung uebernimmt weder Messung noch Markerbindung",
    alteMessung === 0 && alteMarkerZeilen === 0,
    `${alteMessung} Messpanel · ${alteMarkerZeilen} Markerzeile(n)`
    + ` · Panel ${alteMarkerbindung ? "vorhanden (ohne Zeilen)" : "nicht vorhanden"}`);

  /* E13 · Und auch keine geerbte SPERRE. Ein offener Schadensverdacht
     sperrt PASS und Override (Leitplanke 11) — genau das ist die Wirkung,
     die eine uebernommene Meldung haette.

     Gemessen wird deshalb der Override-Knopf, nicht die Anwesenheit einer
     QA-Uebergabe: die kann in der zweiten Pruefung voellig zu Recht
     angeboten werden, weil dieses Foto eigene QA-Ausloeser mitbringt. Eine
     Wache, die darauf anschlaegt, waere rot aus dem falschen Grund. */
  const overrideKnopf = seite.locator("button", { hasText: "Override" });
  const overrideDa = await overrideKnopf.count();
  const overrideFrei = overrideDa ? !(await overrideKnopf.first().isDisabled()) : false;
  ok("E13", "Die zweite Pruefung erbt keine Sperre der ersten",
    overrideDa > 0 && overrideFrei,
    `Override ${overrideDa ? (overrideFrei ? "frei" : "gesperrt") : "nicht angeboten"}`);

  /* ── C · DER KANDIDATENWEG ──────────────────────────────────────────
     BEFUND der Gegenpruefung an rc.4.44: Nachladen machte einen Kandidaten
     in der Tabelle sichtbar und band eine Tiefeneingabe daran — die
     Bildkomponente hob ihn aber nicht hervor, und die Speichergrenze wies
     die fertige Messung als nicht existierende Kennung ab. */
  const zeilen = () => seite.locator("table.screening-table tbody tr").count();
  const vorNachladen = await zeilen();
  const nachladen = seite.locator("button", { hasText: "Weitere Kandidaten laden" });
  const nachladbar = await nachladen.count();
  if (nachladbar) await nachladen.first().click();
  await seite.waitForTimeout(300);
  const nachNachladen = await zeilen();
  ok("C8", "Weitere Kandidaten lassen sich in der echten Tabelle nachladen",
    nachladbar > 0 && nachNachladen > vorNachladen,
    `${vorNachladen} → ${nachNachladen} Zeilen`);

  /* Einen Kandidaten waehlen, der NICHT in der Vorauswahl stand. */
  const waehlbar = seite.locator("table.screening-table tbody tr")
    .nth(Math.max(vorNachladen, nachNachladen - 1))
    .locator("button.screening-waehlen");
  const gewaehlteKennung = (await waehlbar.first().textContent() || "").trim();
  await waehlbar.first().click();
  await seite.waitForTimeout(400);
  const bildBeschriftung = await seite.locator(".screening-markierung figcaption")
    .first().textContent().catch(() => "");
  const bildLabel = await seite.locator(".screening-markierung canvas")
    .first().getAttribute("aria-label").catch(() => "");
  ok("C9", "Der nachgeladene Kandidat ist im Bild hervorgehoben",
    Boolean(gewaehlteKennung)
    && (bildBeschriftung.includes(gewaehlteKennung) || bildLabel.includes(gewaehlteKennung)),
    `gewaehlt ${gewaehlteKennung || "—"} · Bildbeschriftung "${(bildBeschriftung || "").trim()}"`);

  /* Eine vollstaendige unabhaengige Messung eintragen. */
  const messfeld = async (teil, wert) => {
    const el = seite.locator(`input[id^="tiefe-${teil}-"]`).first();
    if (await el.count()) await el.fill(wert);
  };
  await messfeld("valueUm", "0,42");
  await messfeld("uncertaintyUm", "0,05");
  await messfeld("method", "Tastschnitt");
  await messfeld("measuredAt", "2026-09-17T18:00");
  await messfeld("measuredBy", "m.koch");
  const uebernehmen = seite.locator(".depth-form button[type=submit]").first();
  const uebernehmbar = await uebernehmen.count() ? !(await uebernehmen.isDisabled()) : false;
  if (uebernehmbar) await uebernehmen.click();
  await seite.waitForTimeout(300);
  ok("C10", "Die Messung am nachgeladenen Kandidaten ist uebernehmbar",
    uebernehmbar, uebernehmbar ? "Eingabemaske vollstaendig" : "Uebernehmen blieb gesperrt");

  /* Abschliessen und speichern — hier hat die Speichergrenze bisher
     abgewiesen. */
  await seite.fill("#inspection-comment", "Messung an einem nachgeladenen Kandidaten");
  await klickeText("Gesperrt bestätigen & unterschreiben");
  await seite.waitForSelector("#signature-password", { timeout: 15000 });
  await seite.fill("#signature-password", "pharma2024");
  await klickeText("Bestätigen & speichern");
  await seite.waitForSelector("text=Prüfprotokoll", { timeout: 30000 });
  ok("C11", "Die Pruefung mit dieser Messung laesst sich speichern", true,
    "Speichergrenze hat die Bindung anerkannt");

  /* ── 13 · BENUTZERWECHSEL, WEITERHIN OHNE RELOAD ────────────────────
     Abmelden und als andere Person anmelden. Auch dabei darf nichts aus
     dem vorigen Vorgang haengenbleiben.

     Diese Pruefung steht VOR dem Neuladen, und das ist der ganze Punkt:
     nach einem Reload waere der Zustand ohnehin leer, und E14 waere gruen,
     ohne dass Ab- und Anmeldung irgendetwas geraeumt haetten. */
  await zurStartseite();
  await seite.getByRole("button", { name: "Einstellungen" }).first().click();
  await seite.waitForTimeout(300);
  await klickeText("Abmelden");
  await seite.waitForSelector("#username", { timeout: 15000 });
  await seite.fill("#username", "qa_manager");
  await seite.fill("#password", "quality2024");
  await seite.click("button[type=submit]");
  await seite.waitForSelector("text=Neue Prüfung", { timeout: 15000 });
  await klickeText("Neue Prüfung");
  await seite.locator(".equipment-card").first().click();
  await seite.locator(".equipment-card").first().click();
  await seite.waitForSelector("input[type=file]", { timeout: 15000 });
  const nachWechsel = await seite.locator(".verdacht-offen, .verdacht-geklaert").count();
  const markerNachWechsel = await seite.locator(".image-marker").count();
  ok("E14", "Nach dem Benutzerwechsel bleibt nichts aus dem Vorvorgang",
    nachWechsel === 0 && markerNachWechsel === 0,
    `${nachWechsel} uebernommene Meldung(en) · ${markerNachWechsel} uebernommene Marker`);

  /* ── BEFUND D · Der Weg nach dem Wiederoeffnen durch die QA ─────────
     Der wartende Vorgang aus Schritt 7 traegt zwei OFFENE Meldungen. Sie
     sperren PASS und Override. Bis rc.4.45 konnte die QA sie im
     wiedergeoeffneten Bericht nicht beantworten — das Klaerungspanel gab
     es nur im Ergebnisbildschirm des Pruefers. Es blieb allein die
     Sperrung, und der Vorgang war eingemauert.

     Gefahren wird der vollstaendige Weg: oeffnen, beurteilen,
     unterschreiben, erneut oeffnen, zweite Stelle beurteilen, freigeben.
     Angemeldet ist seit E14 der QA Manager. */
  await zurStartseite();
  await klickeText("Prüfprotokoll");
  await seite.waitForSelector(".history-list, .empty-state", { timeout: 15000 });
  const nurWartende = async () => {
    await seite.locator(".filter-grid select").first().selectOption("PENDING_QA");
    await seite.waitForTimeout(400);
  };
  await nurWartende();
  const wartendeVorher = await seite.locator(".history-card").count();
  await seite.locator(".history-card").first().click();
  await seite.waitForSelector(".record-meta", { timeout: 15000 });

  const knopftexte = async () => (await seite.locator(".decision-actions button")
    .allTextContents()).map(text => text.trim());
  const texteD1 = await knopftexte();
  const hinweisD1 = (await seite.locator(".alert-warning").allTextContents()).join(" ");
  const panelD1 = await seite.locator(".verdacht-panel").count();
  const offenD1 = await seite.locator(".verdacht-offen").count();
  /* Angeboten wird nur, was auch haelt — und WARUM nicht mehr, steht
     dabei. In diesem Lauf sperrt zusaetzlich ein nicht bewertbarer
     Pflichtpunkt (ohne Streiflichtsequenz ist Trockenheit nicht
     beurteilbar); genannt wird deshalb dieser Grund, nicht die Meldung.
     Beides ist richtig, und beides sperrt. Welchen Grund die Oberflaeche
     bei WELCHER Lage nennt, pruefen Q1 bis Q4 einzeln — hier zaehlt, dass
     kein Freigabeknopf dasteht, der spaeter scheitert. */
  ok("D1", "Keine Freigabe angeboten, die spaeter scheitern wuerde",
    !texteD1.some(text => text.includes("freigeben"))
    && texteD1.some(text => text.includes("sperren"))
    && /nicht m\u00f6glich|nicht moeglich/.test(hinweisD1),
    `Knoepfe: ${JSON.stringify(texteD1)} · Begruendung`
    + ` ${/nicht m\u00f6glich|nicht moeglich/.test(hinweisD1)
      ? JSON.stringify(hinweisD1.slice(0, 120)) : "FEHLT"}`);

  ok("D2", "Die QA kann die Meldung im wiedergeoeffneten Bericht beurteilen",
    panelD1 === 1 && offenD1 === 2,
    `${panelD1} Klaerungspanel · ${offenD1} offene Meldung(en) · ${wartendeVorher} wartende(r) Vorgang`);

  /* Eine Stelle beurteilen — ueber die echten Felder, mit Unterschrift. */
  const beurteile = async (ergebnis, grund) => {
    const auswahl = seite.locator("select[id^=verdacht-ergebnis-]").first();
    await auswahl.selectOption(ergebnis);
    await seite.locator("textarea[id^=verdacht-grund-]").first().fill(grund);
    await seite.getByRole("button", { name: "Beurteilung festhalten", exact: true })
      .first().click();
    await seite.waitForSelector("#signature-password", { timeout: 15000 });
    await seite.fill("#signature-password", "quality2024");
    await klickeText("Bestätigen & speichern");
    await seite.waitForSelector(".history-list", { timeout: 30000 });
  };
  await beurteile("KEIN_SCHADEN",
    "Unter Streiflicht nachgesehen: Schliffspur, kein Ausbruch");

  /* Zurueck in den JETZT gueltigen Datensatz — den neuesten wartenden. */
  await nurWartende();
  const wartendeNachher = await seite.locator(".history-card").count();
  await seite.locator(".history-card").first().click();
  await seite.waitForSelector(".record-meta", { timeout: 15000 });
  const offenD3 = await seite.locator(".verdacht-offen").count();
  const geklaertD3 = await seite.locator(".verdacht-geklaert").count();
  ok("D3", "Die Beurteilung ist eine Ergaenzung, kein Ueberschreiben",
    wartendeNachher === wartendeVorher + 1 && offenD3 === 1 && geklaertD3 === 1,
    `${wartendeVorher} → ${wartendeNachher} wartende Vorgaenge`
    + ` · ${geklaertD3} beantwortet, ${offenD3} offen`);

  await beurteile("KEIN_SCHADEN",
    "Zweite Stelle unter Streiflicht nachgesehen, ebenfalls kein Ausbruch");

  await nurWartende();
  await seite.locator(".history-card").first().click();
  await seite.waitForSelector(".record-meta", { timeout: 15000 });
  const texteD4 = await knopftexte();
  const offenD4 = await seite.locator(".verdacht-offen").count();
  const geklaertD4 = await seite.locator(".verdacht-geklaert").count();
  const panelD4 = await seite.locator(".verdacht-panel").count();
  /* Nach beiden Antworten ist die Meldung kein Hindernis mehr: das
     Panel zeigt beide Antworten (und keine offene Stelle mehr), und die
     Entscheidung haengt nur noch am Pflichtpunkt. Der Vorgang ist nicht
     mehr eingemauert — das ist BEFUND D. */
  ok("D4", "Nach der Beurteilung sperrt die Meldung nicht mehr",
    offenD4 === 0 && geklaertD4 === 2 && panelD4 === 1
    && texteD4.length > 0,
    `${geklaertD4} beantwortet, ${offenD4} offen · ${panelD4} Klaerungspanel`
    + ` · Knoepfe: ${JSON.stringify(texteD4)}`);

  /* D5 · Der abgeloeste Vorgang bietet nichts mehr an. Sonst stuenden zwei
     wartende Datensaetze mit Knoepfen da, und der aeltere scheiterte
     zwingend an "genau EIN Entscheid je Revision". */
  await seite.getByRole("button", { name: "Zurück" }).first().click();
  await seite.waitForSelector(".history-list", { timeout: 15000 });
  await nurWartende();
  const karten = await seite.locator(".history-card").count();
  await seite.locator(".history-card").nth(karten - 1).click();
  await seite.waitForSelector(".record-meta", { timeout: 15000 });
  const texteD5 = await knopftexte();
  const hinweisD5 = (await seite.locator(".alert-warning").allTextContents()).join(" ");
  ok("D5", "Ein abgeloester Vorgang bietet keine Entscheidung mehr an",
    texteD5.length === 0 && /spaetere Fassung/.test(hinweisD5),
    `Knoepfe: ${JSON.stringify(texteD5)} · Hinweis`
    + ` ${/spaetere Fassung/.test(hinweisD5) ? "genannt" : "FEHLT"}`);

  /* D6 · Und der ANGEBOTENE Entscheid haelt auch. Einer, der erst nach
     Anmeldung, Begruendung und Signatur scheitert, waere genau der Befund
     — gleich ob er Freigabe oder Sperrung heisst. Angeboten ist hier die
     Sperrung, also wird sie gefahren. */
  await seite.getByRole("button", { name: "Zurück" }).first().click();
  await seite.waitForSelector(".history-list", { timeout: 15000 });
  await nurWartende();
  await seite.locator(".history-card").first().click();
  await seite.waitForSelector(".record-meta", { timeout: 15000 });
  await seite.getByRole("button", { name: "Durch QA sperren" }).first().click();
  await seite.waitForSelector("#qa-username", { timeout: 15000 });
  await seite.fill("#qa-username", "qa_manager");
  await seite.fill("#qa-password", "quality2024");
  const grundfeld = seite.locator("#qa-reason");
  if (await grundfeld.count()) {
    await grundfeld.fill("Beide gemeldeten Stellen beurteilt, keine Beanstandung");
  }
  await seite.waitForSelector("#signature-password", { timeout: 15000 });
  await seite.fill("#signature-password", "quality2024");
  await klickeText("Bestätigen & speichern");
  await seite.waitForSelector(".history-list", { timeout: 30000 });
  const fehlermeldung = (await seite.locator(".alert-error").allTextContents()).join(" ");
  ok("D6", "Der angebotene QA-Entscheid haelt bis in die Datenbank",
    !fehlermeldung,
    fehlermeldung ? `abgewiesen: ${fehlermeldung.slice(0, 140)}` : "ohne Fehlermeldung gespeichert");

  /* ── 14 · JETZT NEU LADEN UND EXPORTIEREN ───────────────────────────
     Beide Pruefungen sind gespeichert. Was der Export nach einem
     vollstaendigen Neustart hergibt, steht wirklich in der
     verschluesselten Datenbank — und nur das zaehlt als Nachweis. */
  await seite.reload({ waitUntil: "networkidle" });
  await seite.fill("#username", "operator1");
  await seite.fill("#password", "pharma2024");
  await seite.click("button[type=submit]");
  await seite.waitForSelector("text=Neue Prüfung", { timeout: 15000 });
  /* Die Einstellungen haengen als IconButton im Kopfbereich, nicht als
     beschrifteter Knopf im Raster. */
  await seite.getByRole("button", { name: "Einstellungen" }).first().click();
  await seite.waitForTimeout(300);
  const [abgabe] = await Promise.all([
    seite.waitForEvent("download", { timeout: 30000 }),
    klickeText("Datenexport JSON"),
  ]);
  const exportPfad = path.join(abwurf, "export.json");
  await abgabe.saveAs(exportPfad);
  const daten2 = JSON.parse(await readFile(exportPfad, "utf8"));

  /* Die beiden Datensaetze werden an ihrem KOMMENTAR auseinandergehalten —
     an einer Angabe also, die mit den gepruefte Eigenschaften nichts zu tun
     hat. Sie ueber "hat Meldungen" zu unterscheiden waere zirkulaer: genau
     das ist die Frage. */
  /* Der ORIGINALE wartende Datensatz: derselbe Kommentar traegt inzwischen
     auch die Beurteilungen und der QA-Entscheid — sie sind Ableitungen
     davon. Das Original ist das einzige Glied der Kette ohne Vorgaenger. */
  const kette = (daten2.inspections || [])
    .filter(e => String(e?.comment || "").startsWith("Zwei Stellen gemeldet"));
  const satz = kette.find(e => !e?.supersedesId);
  const zweiterSatz = (daten2.inspections || [])
    .find(e => String(e?.comment || "").startsWith("Messung an einem nachgeladenen"));
  const meldungen = satz?.manualFindings || [];
  ok("E8", "Der Export traegt beide gemeldeten Stellen",
    meldungen.length === 2,
    `${meldungen.length} Meldung(en) im gespeicherten Datensatz`
    + (meldungen.length ? ` · ${meldungen.map(m => m.markerId).join(", ")}` : ""));

  /* Und sie sind vollstaendig: Art, Grund, Foto, Marker, Person, Rolle,
     Zeitpunkt. Eine Meldung ohne diese Angaben waere keine. */
  const vollstaendig = meldungen.length > 0 && meldungen.every(m =>
    m.kind === "MANUAL_DAMAGE_SUSPECTED"
    && String(m.reason || "").trim().length >= 10
    && m.photoId && m.markerId && m.username && m.role && m.at);
  const verschieden = new Set(meldungen.map(m => m.markerId)).size === meldungen.length;
  ok("E9", "Jede Meldung traegt Art, Grund, Foto, Marker, Person, Rolle, Zeit",
    vollstaendig && verschieden && meldungen.length === 2,
    vollstaendig ? `verschiedene Marker: ${verschieden}` : "mindestens eine Angabe fehlt");

  /* Der QA-Trigger muss den Speicherweg ebenfalls ueberlebt haben — sonst
     weiss die QA nichts von der Meldung. */
  const trigger = (satz?.qaTriggers || []).filter(g => g.code === "MANUAL_DAMAGE_SUSPECTED");
  ok("E10", "Der QA-Trigger der Meldung steht im Datensatz",
    trigger.length >= 1,
    `${(satz?.qaTriggers || []).length} Trigger insgesamt,`
    + ` davon ${trigger.length} aus der Meldung`);

  /* Und die Messung muss den Export erreichen, an DIESEM Kandidaten. */
  const messungen = (daten2.inspections || []).flatMap(i => i.depthMeasurements || []);
  const passend = messungen.find(m => m?.kandidatId === gewaehlteKennung);
  ok("C12", "Die Messung steht im Export, gebunden an diesen Kandidaten",
    Boolean(passend) && passend.valueUm === "0,42" && passend.unit === "µm",
    passend ? `${passend.kandidatId} · ${passend.valueUm} ${passend.unit}`
      : `${messungen.length} Messung(en), keine an ${gewaehlteKennung}`);

  /* ── E15 · UNSICHTBAR IST NICHT GELOESCHT ────────────────────────────
     E12/E12b pruefen den BILDSCHIRM der zweiten Pruefung. Der Auftraggeber
     hat zu Recht darauf bestanden, dass das nicht genuegt: eine uebernommene
     Meldung koennte im Zustand haengen, ohne gerendert zu werden, und erst
     im gespeicherten Datensatz wieder auftauchen.

     Geprueft wird deshalb der ZWEITE gespeicherte Datensatz selbst — also
     das, was die verschluesselte Datenbank hergibt und was ein Pruefer als
     Nachweis exportiert. Nicht nur "keine Meldung", sondern: KEINE Kennung
     des ersten Vorgangs taucht irgendwo darin auf. Foto-Kennungen,
     Marker-Kennungen, die Datensatzkennung und der wortwoertliche
     Meldegrund werden im ganzen Datensatz gesucht, nicht nur in den
     Feldern, an die ich gerade denke. */
  const ersteKennungen = [
    satz?.id,
    ...meldungen.map(m => m?.photoId),
    ...meldungen.map(m => m?.markerId),
    ...(satz?.photos || []).map(p => p?.id),
    "Gesehene Stelle Nummer 1, vom Detektor nicht gemeldet",
    "Gesehene Stelle Nummer 2, vom Detektor nicht gemeldet",
  ].filter(k => typeof k === "string" && k.length >= 4);
  const zweiterText = JSON.stringify(zweiterSatz ?? null);
  const durchgeschlagen = [...new Set(ersteKennungen)]
    .filter(kennung => zweiterText.includes(kennung));
  const zweiteMeldungen = (zweiterSatz?.manualFindings || []).length;
  const zweiteTrigger = (zweiterSatz?.qaTriggers || [])
    .filter(g => g?.code === "MANUAL_DAMAGE_SUSPECTED").length;
  ok("E15", "Der zweite gespeicherte Datensatz traegt nichts aus dem ersten",
    Boolean(zweiterSatz) && zweiterSatz.id !== satz?.id
    && zweiteMeldungen === 0 && zweiteTrigger === 0
    && durchgeschlagen.length === 0,
    !zweiterSatz ? "kein zweiter Datensatz im Export"
      : `${(daten2.inspections || []).length} Datensaetze · ${zweiteMeldungen} Meldung(en)`
        + ` · ${zweiteTrigger} Meldungs-Trigger · durchgeschlagen:`
        + ` ${durchgeschlagen.length ? durchgeschlagen.join(", ") : "keine"}`);

  /* ── D7 · Die Kette im Export ────────────────────────────────────────
     Was der Datensatz nach dem Wiederoeffnen erzaehlt, muss vollstaendig
     und append-only sein: das Original unveraendert mit OFFENEN Meldungen,
     zwei Beurteilungen als eigene, aufeinander aufbauende Glieder, und der
     QA-Entscheid am Ende. Wer nur den letzten Datensatz liest, sieht das
     Ergebnis; wer die Kette liest, sieht den Weg dorthin. */
  const klaerungsglieder = kette.filter(e => e?.clarification);
  const entscheid = kette.find(e => e?.approvedBy?.username);
  const originalOffen = (satz?.manualFindings || []).filter(m => !m?.klaerung).length;
  const entscheidBeantwortet = (entscheid?.manualFindings || [])
    .filter(m => m?.klaerung?.ergebnis === "KEIN_SCHADEN"
      && m.klaerung.username === "qa_manager" && m.klaerung.role === "QA Manager"
      && String(m.klaerung.begruendung || "").length >= 10).length;
  const gliederGebunden = klaerungsglieder.every(e =>
    typeof e.supersedesId === "string" && typeof e.approvalRevisionHash === "string"
    && e.approvalRevisionHash.length === 64 && e.state === "PENDING_QA"
    && e.finalDecision === null);
  /* Die Kette wird GELAUFEN, nicht nach Listenreihenfolge geprueft: der
     Export gibt keine zeitliche Ordnung her. Vom Original aus fuehrt jedes
     Glied genau ein naechstes, und am Ende steht der Entscheid. */
  const nachfolger = id => kette.filter(e => e?.supersedesId === id);
  const gelaufen = [];
  let aktuell = satz;
  while (aktuell && gelaufen.length <= kette.length) {
    gelaufen.push(aktuell);
    const weiter = nachfolger(aktuell.id);
    if (weiter.length !== 1) { aktuell = weiter.length ? false : null; break; }
    aktuell = weiter[0];
  }
  const ketteVollstaendig = aktuell === null
    && gelaufen.length === kette.length
    && gelaufen.at(-1)?.id === entscheid?.id;
  ok("D7", "Der Export zeigt die Kette: Original, Beurteilungen, Entscheid",
    kette.length === 4 && originalOffen === 2 && klaerungsglieder.length === 2
    && gliederGebunden && Boolean(entscheid) && entscheidBeantwortet === 2
    && ketteVollstaendig,
    `${kette.length} Glieder · Original ${originalOffen} offen`
    + ` · ${klaerungsglieder.length} Beurteilung(en) gebunden ${gliederGebunden}`
    + ` · Entscheid ${entscheid?.finalDecision ?? "—"} mit ${entscheidBeantwortet} beantwortet`
    + ` · Kette gelaufen ${gelaufen.length}/${kette.length}, Ende`
    + ` ${gelaufen.at(-1)?.id === entscheid?.id ? "Entscheid" : "ANDERS"}`);
  /* Den Einstellungsdialog ueber seine eigene Schaltflaeche schliessen.
     Escape genuegte nicht, und der offene Dialog verdeckte danach den
     Einstellungsknopf. */
  await seite.getByRole("button", { name: "Schliessen" }).first().click()
    .catch(() => {});
  await seite.waitForTimeout(300);

  ok("E11", "Kein unbehandelter Fehler im Browser", fehler.length === 0,
    fehler.length ? fehler.slice(0, 2).join(" · ") : "sauber");
} catch (problem) {
  ok("E0", "Der Bedienlauf ist durchgelaufen", false, String(problem.message).slice(0, 300));
} finally {
  await seite.screenshot({ path: path.join(abwurf, "ende.png"), fullPage: false })
    .catch(() => {});
  console.log(`\nAbwurf: ${abwurf}`);
  await kontext.close(); await browser.close();
  await new Promise(loese => server.close(loese));
}

console.log("");
const durch = pruefungen.filter(p => !p.bestanden);
console.log(`Bestanden: ${pruefungen.length - durch.length} / ${pruefungen.length}`);
if (durch.length) console.log("Durchgefallen: " + durch.map(p => p.id).join(", "));
console.log("ERGEBNIS: " + (durch.length ? "DURCHGEFALLEN" : "BESTANDEN"));
/* Bei einem Fehlschlag bleibt der Abwurf liegen — Export, Bildschirmfoto
   und Protokoll sind dann die einzige Spur. */
if (!durch.length) await rm(abwurf, { recursive: true, force: true }).catch(() => {});
process.exit(durch.length ? 1 : 0);
