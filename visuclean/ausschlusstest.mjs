/* ─── RC4 · Ausschlusspruefungen X-01 bis X-08 ─────────────────────────────
   Aus TESTMATRIX_RC4_V2.2.md. Jede Pruefung ist eine Aussage darueber, was
   im Paket NICHT vorkommen darf.

   Geprueft wird der gesamte ausgelieferte Quellbaum (src, public, scripts,
   index.html) — nicht nur einzelne Dateien. Der Bundler erzeugt aus genau
   diesen Dateien das Produktionsbundle; was hier nicht drin ist, ist auch
   dort nicht drin.                                                        */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/* fileURLToPath, nicht .pathname: unter Windows liefert .pathname
   "/C:/Users/..." mit fuehrendem Schraegstrich. join() haengt das dann an
   das Arbeitsverzeichnis, und der Laufwerksbuchstabe steht doppelt
   ("C:\C:\Users\..."). Auf Linux faellt das nicht auf — deshalb pruefen
   X-09 und X-10 unten mechanisch, dass es nirgends zurueckkehrt. */
const wurzel = fileURLToPath(new URL(".", import.meta.url));

/* Verhaltensprobe statt Textprobe. X-09 unten kann diese Datei nicht
   pruefen, weil sie den verbotenen Bezeichner nennen muss, um ihn zu
   suchen. Genau hier sass der Fehler. Also wird die Wurzel selbst
   nachgewiesen: sie muss auf ein echtes Verzeichnis mit package.json
   zeigen. Mit der alten .pathname-Fassung schlaegt das unter Windows fehl
   ("/C:/Users/..."), und zwar mit Klartext statt mit ENOENT-Stapel. */
if (!statSync(join(wurzel, "package.json"), { throwIfNoEntry: false })?.isFile()) {
  console.error("DURCHGEFALLEN X-11  Wurzelpfad zeigt nicht auf das Paket");
  console.error(`                    ermittelt: ${wurzel}`);
  console.error("                    Erwartet ein Verzeichnis mit package.json.");
  console.error("                    Typische Ursache: .pathname statt fileURLToPath");
  console.error("                    (unter Windows fuehrender Schraegstrich).");
  process.exit(1);
}
const AUSGENOMMEN = new Set(["node_modules", "dist", ".git"]);
/* Diese Dateien pruefen selbst auf verbotene Bezeichner und muessen sie
   deshalb nennen duerfen. Sie werden nicht ausgeliefert. */
const PRUEFDATEIEN = /(test|gegenproben|kalibrierung)\.mjs$/;

function dateien(verzeichnis) {
  const treffer = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    if (AUSGENOMMEN.has(eintrag)) continue;
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...dateien(pfad));
    else treffer.push(pfad);
  }
  return treffer;
}

/* Der ausgelieferte Anwendungscode. */
const ANWENDUNG = dateien(join(wurzel, "src"))
  .concat(dateien(join(wurzel, "public")))
  .concat([join(wurzel, "index.html")])
  .filter(pfad => !PRUEFDATEIEN.test(pfad));

/* Schluessel immer mit "/", auch auf Windows. relative() liefert dort
   "src\\App.jsx"; ein Zugriff mit "src/App.jsx" ginge dann ins Leere und
   landete im || "" — eine stille Falschaussage statt eines Fehlers.
   X-12 unten weist nach, dass die Zugriffe wirklich etwas finden. */
const schluessel = pfad => relative(wurzel, pfad).split(sep).join("/");

const inhalt = new Map(ANWENDUNG.map(pfad => [schluessel(pfad), readFileSync(pfad, "utf8")]));

const checks = [];

/* X-11 wurde oben schon entschieden — vor dem ersten Verzeichniszugriff,
   weil ein falscher Wurzelpfad sonst mit ENOENT abstuerzt, bevor irgendeine
   Pruefung laeuft. Der Fehlerfall beendet den Lauf dort mit Exit 1. Hier
   wird nur der bestandene Fall nachgetragen, damit die Pruefung in Protokoll
   und Zaehlung sichtbar ist statt stumm zu bestehen. */
checks.push({ id: "X-11", passed: true });
console.log("BESTANDEN     X-11  Wurzelpfad zeigt auf das Paket");
console.log(`                    ${wurzel}`);

function ausschluss(id, name, muster, hinweis) {
  const treffer = [...inhalt.entries()]
    .filter(([, text]) => muster.test(text))
    .map(([pfad]) => pfad);
  const passed = treffer.length === 0;
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (!passed) console.log(`                    gefunden in: ${treffer.join(", ")}`);
  else if (hinweis) console.log(`                    ${hinweis}`);
}

console.log("VisuClean RC4 · Ausschlusspruefungen\n");
console.log(`Geprueft: ${inhalt.size} ausgelieferte Dateien\n`);

ausschluss("X-01", "Keine SOP-Suche und keine SOP-QR-Verlinkung",
  /\bSOP[_-]?(Suche|Search|Link|QR)\b|sopSearch|sopLink/i,
  "kein SOP-Bezeichner im Anwendungscode");

ausschluss("X-02", "Keine Tessera-Datei und kein Tessera-Bezeichner",
  /tessera/i,
  "kein Tessera-Bezug");

ausschluss("X-03", "Keine erfundene Tiefenangabe in Millimetern",
  /depth[A-Za-z]*\s*[:=]\s*[0-9.]+\s*(mm|"mm")|[0-9.]+\s*mm\s*(tief|deep|Tiefe)/i,
  "Tiefe bleibt qualitativ; depthStatus ist NOT_MEASURED");

/* X-13 · Die Mikrometer-Fassung von X-03.
   Seit rc.4.32 gibt es eine belegte Tiefgrenze (1,0 um aus der
   Vorgabe). Genau das macht diese Pruefung noetig: eine
   belegte Zahl verfuehrt dazu, sie an eine Groesse anzulegen, die sie
   nicht misst. Verboten ist deshalb die NAEHE von Kontrastbegriffen zu
   einer Mikrometerangabe — eine Tiefe in um darf nie neben oder aus
   edgeStrength, Kantenstaerke oder Kontrast entstehen.

   Die Verhaltensprobe dazu ist D11 in tiefentest.mjs: der Rueckgabewert
   von opticalDepthHint() darf keine Zahl mit Einheit enthalten. Eine
   Textsuche allein genuegt nicht — sie faende eine berechnete Zahl nie. */
/* Das Muster war zuerst mit [^;\n] gebaut — aus X-04 uebernommen, ohne zu
   pruefen, ob es hier passt. Es passte nicht: das Semikolon in
   `const staerke = kandidat.edgeStrength; / * rund 3 um * /` schnitt die
   Naehe ab, und die Sabotageprobe blieb gruen. Jetzt zeilenweit. */
ausschluss("X-13", "Aus Bildkontrast folgt keine Tiefenangabe in Mikrometern",
  /(edgeStrength|kantenstaerke|kantenstärke|relevanceScore)[^\n]{0,60}\d\s*(µm|um\b)|\d\s*(µm|um\b)[^\n]{0,60}(edgeStrength|kantenstaerke|kantenstärke|relevanceScore)/i,
  "Kontrast erzeugt hoechstens OPTICAL_DEPTH_CHECK_RECOMMENDED, nie einen Wert");

/* X-14 · Der Begriff darf nicht zurueckkommen.
   Vorgabe des Auftraggebers vom 16.09.2026: im ausgelieferten Stand darf
   nirgends stehen, dass eine Firmenvorgabe hinterlegt ist — weder in der
   Oberflaeche noch in einem Quelltextkommentar, denn das Paket enthaelt
   den Quelltext.

   Die Tiefengrenze SELBST bleibt sichtbar (< 1,0 um); gesperrt ist
   ausschliesslich die Zuschreibung. Eine Textsuche reicht hier aus: ein
   Wort kann nicht berechnet werden. */
ausschluss("X-14", "Keine Zuschreibung der Tiefengrenze an eine Firmenvorgabe",
  /Firmenspezifikation|Firmenvorgabe|Company specification|company specification/i,
  "die Grenze steht da, ihre Herkunft nicht");

ausschluss("X-04", "Kein Prozentzeichen an der algorithmischen Befundstaerke",
  /severity[^;\n]{0,40}%|\$\{[^}]*severity[^}]*\}\s*%/,
  "die Befundstaerke wird als dimensionsloser Index gefuehrt");

ausschluss("X-05", "Im lokalen Standardbetrieb keine externen Requests",
  /\bfetch\s*\(\s*["'`]https?:|XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket/,
  "kein Netzwerkaufruf gegen eine externe Adresse");

ausschluss("X-06", "Keine automatische Kratzerklassifizierung aus einer Legacy-Referenz",
  /legacy[A-Za-z]*\s*\.\s*(compare|classify)|compareWithLegacy/i,
  "LEGACY_NOT_COMPARABLE verweigert den Vergleich, statt ihn zu fuehren");

/* X-07 ist die schaerfste: NEW, EXISTING und GROWN duerfen nicht als
   automatische Kratzerklassifikation vorkommen. Der Bezeichner darf in
   anderer Bedeutung auftreten (etwa "newId"), deshalb wird auf die
   Klassifikationsform geprueft. */
ausschluss("X-07", "Kein NEW / EXISTING / GROWN als automatische Kratzerklassifikation",
  /(?<!MANUAL_)SCRATCH_(NEW|EXISTING|GROWN)\b|automaticStatus\s*[:=]\s*["'](NEW|EXISTING|GROWN)["']|classification\s*[:=]\s*["'](NEW|EXISTING|GROWN)["']/,
  "der einzige automatische Status ist SCRATCH_DETECTED_ORIGIN_UNDETERMINED; "
  + "MANUAL_SCRATCH_NEW und MANUAL_SCRATCH_GROWN sind dokumentierte manuelle "
  + "Feststellungen und ausdruecklich vorgesehen");

ausschluss("X-08", "Keine window.*-Funktion als Sicherheitsgrenze, keine Zugangsdaten",
  /window\.[A-Za-z_$]+\s*=\s*(async\s+)?(function|\([^)]*\)\s*=>)|(api[_-]?key|apiKey|client[_-]?secret|accessToken|bearer|authorization)\s*[:=]\s*["'][^"']{8,}/i,
  "keine global ueberschreibbare Funktion als Grenze; keine eingebetteten Zugangsdaten");

/* X-09/X-10 · Windows-Pfadfalle.
   Gefunden im ersten echten Installationslauf auf einem Windows-PC, nicht
   von diesen 347 Pruefungen — sie liefen alle auf Linux. Beide Pruefungen
   decken den Node-seitigen Code ab (Tests und scripts/), der in ANWENDUNG
   bewusst nicht enthalten ist. public/sw.js ist Browsercode; dort ist
   url.pathname korrekt und bleibt unberuehrt. */
const NODE_DATEIEN = dateien(wurzel)
  .filter(pfad => /\.mjs$/.test(pfad))
  .concat(dateien(join(wurzel, "scripts")))
  .filter(pfad => !/node_modules|[/\\]dist[/\\]/.test(pfad))
  /* Diese Datei nimmt sich aus, weil sie den gesuchten Bezeichner nennen
     muss. Das ist eine echte Luecke, keine Formalie — der Fehler sass in
     genau dieser Datei. Sie wird deshalb oben durch X-11 behandelt, das
     den Wurzelpfad nachweist statt Text zu lesen. */
  .filter(pfad => schluessel(pfad) !== "ausschlusstest.mjs");

const nodeInhalt = new Map(
  [...new Set(NODE_DATEIEN)].map(pfad => [schluessel(pfad), readFileSync(pfad, "utf8")]));

function nodeAusschluss(id, name, muster, hinweis) {
  const treffer = [...nodeInhalt.entries()]
    .filter(([, text]) => muster.test(text))
    .map(([pfad]) => pfad);
  const passed = treffer.length === 0;
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (!passed) console.log(`                    gefunden in: ${treffer.join(", ")}`);
  else if (hinweis) console.log(`                    ${hinweis}`);
}

console.log("");
console.log(`Node-seitig geprueft: ${nodeInhalt.size} Dateien\n`);

nodeAusschluss("X-09", "Kein .pathname als Dateipfad (Windows-Laufwerksfalle)",
  /\.pathname\b/,
  "Pfade kommen aus fileURLToPath, nicht aus .pathname");

nodeAusschluss("X-10", "Kein __dirname-Ersatz ueber String-Zerlegung der URL",
  /import\.meta\.url\s*\.\s*(replace|slice|substring|split)|\bimport\.meta\.url\.replace\(/,
  "keine handgebaute URL-Zerlegung");

/* X-12 · Die Schluessel muessen wirklich treffen.
   Ohne diese Pruefung liefert inhalt.get("src/App.jsx") unter Windows
   undefined, der || ""-Zweig greift, und Z-01 meldet rot, ohne dass
   jemand den Grund sieht. Eine stille Falschaussage ist schlimmer als
   ein Absturz — deshalb wird der Treffer hier ausdruecklich belegt. */
{
  const pflicht = ["src/App.jsx", "src/domain.js", "src/persistence.js"];
  const fehlend = pflicht.filter(name => !(inhalt.get(name) || "").length);
  const passed = fehlend.length === 0;
  checks.push({ id: "X-12", passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} X-12  Pfadschluessel treffen auf allen Betriebssystemen`);
  console.log(`                    ${passed
    ? `${pflicht.length} Pflichtdateien ueber "/"-Schluessel gefunden`
    : `nicht auffindbar: ${fehlend.join(", ")} — vermutlich Trennzeichen "${sep}"`}`);
}

/* X-15 · Dieselbe Sperre ueber die ausgelieferten DOKUMENTE.
   X-14 deckt src/, public/ und index.html ab. Das Paket enthaelt aber auch
   Markdown: Anleitung, Abnahmestand, Changelog, Werkbank-Dokumente. Ein
   Begriff, der dort steht, ist genauso ausgeliefert. */
{
  const DOKUMENTE = dateien(wurzel)
    .filter(pfad => /\.md$/.test(pfad))
    .filter(pfad => !/node_modules|[/\\]dist[/\\]|[/\\]\.claude[/\\]/.test(pfad));
  const muster = /Firmenspezifikation|Firmenvorgabe|Company specification|company specification/i;
  const treffer = DOKUMENTE
    .filter(pfad => muster.test(readFileSync(pfad, "utf8")))
    .map(pfad => schluessel(pfad));
  const passed = treffer.length === 0;
  checks.push({ id: "X-15", passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} X-15  Auch die ausgelieferten Dokumente nennen keine Firmenvorgabe`);
  console.log(`                    ${passed
    ? `${DOKUMENTE.length} Markdown-Dateien geprueft`
    : `gefunden in: ${treffer.join(", ")}`}`);
}

/* ── Zusatzpruefung (RC4.1) ────────────────────────────────────────────────
   Das Demo-Panel muss standardmaessig AUS sein. Diese Pruefung existiert,
   damit es nicht unbemerkt zurueckkommt: ein per Klick bereitliegender
   QA-Manager-Zugang macht das Vier-Augen-Prinzip zur Formsache, weil eine
   einzelne Person die Invariante durch zweimaliges Anmelden erfuellt.      */
const appQuelle = inhalt.get("src/App.jsx") || "";
const hinterFlag = /DEMO_ACCESS_VISIBLE\s*&&\s*<section className="panel demo-access"/.test(appQuelle);
const standardAus = /const DEMO_ACCESS_VISIBLE = import\.meta\.env\?\.VITE_DEMO_ACCESS === "true";/.test(appQuelle);
{
  const passed = hinterFlag && standardAus;
  checks.push({ id: "Z-01", passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} Z-01  Demo-Zugaenge sind standardmaessig ausgeblendet`);
  console.log(`                    ${passed
    ? "Panel haengt an DEMO_ACCESS_VISIBLE; sichtbar nur bei VITE_DEMO_ACCESS=true"
    : `hinter Flag: ${hinterFlag} · Standard aus: ${standardAus}`}`);
}

/* Die Demo-Zugaenge sind eine bewusste, dokumentierte Ausnahme: sie stehen
   sichtbar auf dem Login-Schirm und sind Teil des Demonstrator-Charakters.
   Sie werden hier ausdruecklich benannt, statt die Pruefung stumm zu
   lockern. */
const demoZugaenge = /pharma2024|quality2024|admin2024/.test(inhalt.get("src/domain.js") || "");
console.log("");
console.log(`HINWEIS  Demo-Zugaenge in src/domain.js vorhanden: ${demoZugaenge ? "ja" : "nein"}`);
console.log("         Sie sind im Bundle lesbar. Das Flag verbirgt das Panel, es");
console.log("         schuetzt die Zugaenge nicht. Eine belastbare Personentrennung");
console.log("         braucht serverseitige Identitaet und liegt ausserhalb RC4.");
console.log("         Es ist KEINE Zugangsdatenhinterlegung fuer einen externen Dienst.");

console.log("");
const failed = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) console.log(`Durchgefallen: ${failed.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failed.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failed.length ? 1 : 0);
