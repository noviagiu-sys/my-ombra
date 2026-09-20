/* VisuClean · Domänen-, Integritäts- und Paket-Gegenbeweise
   (Versionsangabe bewusst entfernt: sie stand fest verdrahtet und
    lief bei jedem Release gegen die tatsächliche Version aus.) */
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  aggregateResults, APP_VERSION, assessMarker, authenticate, deriveSystemDecision,
  lightLevel, parseEquipmentCode, parseEquipmentTarget, signatureMeaning, verifyPassword,
} from "./src/domain.js";
import {
  canonicalize, createAuditEvent, recordDigest, sha256Hex, validSignaturePath, verifyAuditChain,
} from "./src/audit.js";
import { translator, verdictDisplay } from "./src/i18n.js";
import { runEngineSelfTest } from "./src/selfTest.js";

const checks = [];
function ok(id, name, passed, info = "") {
  checks.push({ id, passed });
  console.log(`${passed ? "BESTANDEN    " : "DURCHGEFALLEN"} ${id}  ${name}`);
  if (info) console.log(`                    ${info}`);
}
async function rejects(fn, type = Error) {
  try { await fn(); return false; } catch (error) { return error instanceof type; }
}

console.log(`VisuClean ${APP_VERSION} · Domäne, Audit und Offline-Paket\n`);

/* ALTVERHALTEN  Der Test verglich APP_VERSION gegen das Literal "8.3.0-rc.1".
   SOLLVERHALTEN Er vergleicht gegen package.json.
   BEGRUENDUNG   Ein Literal muss bei jedem Release von Hand nachgezogen
                 werden und sichert nichts zu; verglichen mit package.json
                 wird daraus eine echte Invariante. Der vollstaendige
                 Gleichstand ueber domain.js, package.json, sw.js und das
                 Etikettenblatt steht in versiontest.mjs. */
const paketVersion = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8")).version;
ok("V1", "App-Version stimmt mit package.json ueberein", APP_VERSION === paketVersion,
  `domain.js ${APP_VERSION} · package.json ${paketVersion}`);
const operator = authenticate(" OPERATOR1 ", "pharma2024");
ok("V2", "Demo-Authentifizierung normalisiert den Benutzernamen", operator?.role === "Operator");
ok("V3", "Re-Authentifizierung verlangt das richtige Passwort",
  verifyPassword(operator, "pharma2024") && !verifyPassword(operator, "falsch"));
ok("V4", "Equipment-Kurzcode wird aufgeloest", parseEquipmentCode("tp")?.id === "tp");
ok("V5", "Versionierter QR-Payload wird aufgeloest", parseEquipmentCode("VC|V=1|EQ=TP")?.id === "tp");
ok("V5B", "EAN-13-Alias wird aufgeloest", parseEquipmentCode("7610000000011")?.id === "tp");
const direct = parseEquipmentTarget("tp|Matrizenteller");
ok("V6", "QR-Direktsprung Equipment plus Zone funktioniert", direct?.equipment.id === "tp" && direct?.zone.id === "die");
ok("V7", "Unbekannte QR-Zone wird kontrolliert abgelehnt", parseEquipmentTarget("tp|unbekannt") === null);
ok("V8", "Lichtgrenzen entsprechen 15/30 Prozent",
  lightLevel(.1499) === "critical" && lightLevel(.15) === "warning" && lightLevel(.2999) === "warning" && lightLevel(.30) === "ok");

const pass = severity => ({ code: "PASS", pass: true, severity, message: "", detail: "", action: "" });
const fail = severity => ({ code: "TEST_FAIL", pass: false, severity, message: "", detail: "", action: "" });
const r1 = { dry: pass(0), clean: pass(0), intact: fail(30), lm: .55, hints: ["A"] };
const r2 = { dry: pass(0), clean: fail(42), intact: fail(75), lm: .25, hints: ["A", "B"] };
const aggregate = aggregateResults([r1, r2]);
ok("V9", "Worst-Result-Wins waehlt je Kriterium FAIL und hoechste Schwere",
  !aggregate.clean.pass && aggregate.intact.severity === 75);
ok("V10", "Aggregation verwendet das dunkelste Foto und dedupliziert Hinweise",
  aggregate.lm === .25 && JSON.stringify(aggregate.hints) === JSON.stringify(["A", "B"]));
ok("V11", "Kritisches Licht erzwingt System-FAIL",
  deriveSystemDecision({ dry: pass(0), clean: pass(0), intact: pass(0), lm: .14, hints: [] }).reason === "CRITICAL_LIGHT");
ok("V12", "Warnlicht ergibt WARNING ohne Kriterien-FAIL",
  deriveSystemDecision({ dry: pass(0), clean: pass(0), intact: pass(0), lm: .22, hints: [] }).status === "WARNING");
ok("V13", "Kriterien-FAIL bleibt FAIL",
  deriveSystemDecision({ dry: pass(0), clean: fail(20), intact: pass(0), lm: .5, hints: [] }).failed[0] === "clean");
ok("V14", "Signaturbedeutungen sind entscheidungsspezifisch",
  signatureMeaning("PASS") === "Freigabe" && signatureMeaning("FAIL") === "Sperrung" && signatureMeaning("OVERRIDE") === "Override-Freigabe");
ok("V15", "Signaturpfad verlangt mindestens 20 Pixel",
  !validSignaturePath(19.99) && validSignaturePath(20));

const mask = () => new Uint8Array(100);
const overlay = { w: 10, h: 10, maskBright: mask(), maskWarm: mask(), maskDark: mask(), maskAnom: mask() };
for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) overlay.maskDark[y * 10 + x] = 1;
ok("V16", "Marker wird gezielt gegen lokale Analysemasken bewertet",
  assessMarker({ _ov: overlay }, { x: .5, y: .5 }).code === "DARK_FINDING");

ok("V17", "Kanonisierung sortiert Schluessel stabil",
  canonicalize({ z: 1, a: 2 }) === canonicalize({ a: 2, z: 1 }));
let getterExecuted = false;
const accessor = {};
Object.defineProperty(accessor, "secret", { enumerable: true, get() { getterExecuted = true; return "x"; } });
ok("V18", "Kanonisierung lehnt Accessor-Felder ab ohne Getter auszufuehren",
  await rejects(() => Promise.resolve(canonicalize(accessor)), TypeError) && !getterExecuted);
const cycle = {}; cycle.self = cycle;
ok("V19", "Kanonisierung lehnt zyklische Daten ab", await rejects(() => Promise.resolve(canonicalize(cycle)), TypeError));
ok("V20", "SHA-256 ist fuer gleichwertige Objekte identisch",
  await sha256Hex({ b: 2, a: 1 }) === await sha256Hex({ a: 1, b: 2 }));
const digestA = await recordDigest({ id: "1", value: 2, recordHash: "alt" });
const digestB = await recordDigest({ value: 2, id: "1", recordHash: "anders" });
ok("V21", "Datensatz-Hash ignoriert nur sein eigenes Hash-Feld", digestA === digestB);
ok("V22", "Signaturveraenderung veraendert den Datensatz-Hash",
  await recordDigest({ id: "1", signature: { pathLength: 30 } }) !== await recordDigest({ id: "1", signature: { pathLength: 31 } }));

const fixedActor = { username: "qa", displayName: "QA", role: "QA Manager" };
const event1 = await createAuditEvent({ kind: "ONE", actor: fixedActor, payload: { id: 1 }, at: "2026-01-01T00:00:00.000Z", id: "e1" });
const event2 = await createAuditEvent({ kind: "TWO", actor: fixedActor, payload: { id: 2 }, previous: event1, at: "2026-01-01T00:01:00.000Z", id: "e2" });
ok("V23", "Gueltige Audit-Kette wird verifiziert", (await verifyAuditChain([event1, event2])).ok);
ok("V24", "Manipulierter Audit-Payload wird erkannt",
  !(await verifyAuditChain([event1, { ...event2, payload: { id: 99 } }])).ok);
ok("V25", "Fehlende oder umsortierte Audit-Ereignisse werden erkannt",
  !(await verifyAuditChain([event2, event1])).ok);

const de = translator("de"); const en = translator("en");
ok("V26", "Deutsch und Englisch liefern unterschiedliche UI-Texte", de("login") === "Anmelden" && en("login") === "Sign in");
ok("V27", "Englische Fachurteile werden uebersetzt",
  verdictDisplay({ code: "CORROSION_SUSPECT", pass: false, severity: 40 }, "intact", "en").message.includes("corrosion"));

const [manifestText, serviceWorker, indexHtml, appSource, persistenceSource, packageText, labelsHtml] = await Promise.all([
  readFile("public/manifest.webmanifest", "utf8"), readFile("public/sw.js", "utf8"), readFile("index.html", "utf8"),
  readFile("src/App.jsx", "utf8"), readFile("src/persistence.js", "utf8"), readFile("package.json", "utf8"),
  readFile("public/VisuClean_QR_Etiketten_A4.html", "utf8"),
]);
const manifest = JSON.parse(manifestText); const packageJson = JSON.parse(packageText);
ok("V28", "PWA-Manifest ist standalone und on-device startbar",
  manifest.display === "standalone" && manifest.start_url === "/"
  && manifest.icons.some(icon => icon.sizes === "192x192") && manifest.icons.some(icon => icon.sizes === "512x512"));
ok("V29", "HTML bindet Manifest und Mobile-Metadaten ein",
  indexHtml.includes('rel="manifest"') && indexHtml.includes("apple-mobile-web-app-capable"));
ok("V30", "Service Worker cached Build-Artefakte und blockt fremde Origins",
  serviceWorker.includes("applicationFiles") && serviceWorker.includes("url.origin !== self.location.origin"));
ok("V31", "Lokale Ablage verwendet AES-GCM 256 mit nicht extrahierbarem Schluessel",
  persistenceSource.includes('name: "AES-GCM", length: 256') && persistenceSource.includes('false, ["encrypt", "decrypt"]'));
/* V32 war bis rc.4.19 ein pauschaler Texttest: kein "fetch(" in App.jsx.
   Das traf zu, solange die App gar nichts laden musste. Seit rc.4.20 liest
   sie EINE paketeigene Konfigurationsdatei — der Nacharbeitsauftrag
   verlangt das ausdruecklich, und ohne sie waere die Zusage
   "ohne Release nachjustierbar" unerfuellt.

   Die Wache wird deshalb PRAEZISER, nicht schwaecher. Sie verbietet jetzt
   zusaetzlich sendBeacon und WebSocket, die vorher gar nicht geprueft
   wurden, sowie jeden fetch auf eine absolute Adresse. Erlaubt ist genau
   ein Aufruf: der benannte, relative CONFIG_PFAD. Ein Aufruf mit
   variabler Adresse faellt durch — sonst liesse sich jedes Ziel
   hineinreichen.

   Was unveraendert gilt: es verlaesst kein Bild und kein Datensatz das
   Geraet. */
const fetchArgumente = [...appSource.matchAll(/fetch\s*\(([^,)]*)/g)]
  .map(treffer => treffer[1].trim());
const nurKonfigPfad = fetchArgumente.every(arg => arg === "CONFIG_PFAD");
const verboteneWege = /XMLHttpRequest|navigator\s*\.\s*sendBeacon|new\s+WebSocket|fetch\s*\(\s*[`"']https?:/;
ok("V32", "Pruefpfad ruft nichts ab ausser der paketeigenen Konfiguration",
  !verboteneWege.test(appSource) && nurKonfigPfad,
  nurKonfigPfad
    ? `${fetchArgumente.length} Abruf(e), ausschliesslich CONFIG_PFAD`
    : `unerlaubte Abrufziele: ${fetchArgumente.filter(a => a !== "CONFIG_PFAD").join(", ")}`);
ok("V33", "Kein Zufallspfad im Anwendungscode",
  !appSource.includes("Math.random") && !(await readFile("src/analysisCore.js", "utf8")).includes("Math.random"));
ok("V34", "QR-Fallback und echter PDF-Generator sind feste Build-Abhaengigkeiten",
  Boolean(packageJson.dependencies.jsqr) && Boolean(packageJson.dependencies.jspdf));
ok("V35", "Accessibility-Lint ist als feste Leitplanke installiert",
  Boolean(packageJson.devDependencies["eslint-plugin-jsx-a11y"]));
const selfTest = runEngineSelfTest();
ok("V36", "Start-Selbsttest prueft Determinismus und Kalibrierabweichung <= 2 Prozentpunkte",
  selfTest.ok && selfTest.deterministic && selfTest.calibrationPass && selfTest.calibrationTolerance === .02);
ok("V37", "Druckbares A4-Arbeitsblatt enthaelt alle neun Equipment-QR-Codes",
  (labelsHtml.match(/data-payload=/g) || []).length === 9 && labelsHtml.includes("7610000000011") && labelsHtml.includes("7610000000097"));
/* Der Encoder liegt jetzt in cameraCapture.js. Das Budget wird ausgefuehrt
   geprueft statt nur nach einer Konstanten in App.jsx zu suchen. */
{
  const { encodePhoto, MAX_PHOTO_BYTES } = await import("./src/cameraCapture.js");
  const previousDocument = globalThis.document;
  const source = { fixture: "uncompressed-frame" };
  const oversized = "data:image/jpeg;base64," + "A".repeat(Math.ceil(1024 * 1024 * 4 / 3) + 4);
  let attempts = 0, sameSource = true, alwaysOversized = false;
  globalThis.document = { createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage(value) { sameSource &&= value === source; } }),
    toDataURL: () => { attempts++; return alwaysOversized || attempts < 3 ? oversized : "data:image/jpeg;base64,QUJD"; },
  }) };
  try {
    const image = encodePhoto(source, 1920, 1080);
    const fits = Math.ceil(image.split(",")[1].length * .75) <= 1024 * 1024;
    const retried = attempts === 3;
    alwaysOversized = true;
    const blocked = await rejects(() => encodePhoto(source, 1920, 1080));
    ok("V38", "Fotoaufnahme erzwingt das 1-MB-Speicherbudget vor der Ablage",
      MAX_PHOTO_BYTES === 1024 * 1024 && fits && retried && sameSource && blocked,
      "zu grosse JPEGs werden erneut aus der Quelle kodiert; dauerhaft zu grosses Bild wird abgewiesen");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

/* ── V39-V42 · Service Worker im PRUEFSTAND, nicht im Text ──────────────
   V30 liest den Quelltext. Das reicht, um zu sehen, DASS es einen Cache
   gibt - nicht, WAS er ausliefert. Genau daran ist es gescheitert: der
   Auftraggeber oeffnete die frisch ausgelieferte Preview und bekam die
   Vorversion, waehrend jede Textpruefung gruen war.

   Diese vier Gegenproben FUEHREN public/sw.js aus: echter Quelltext,
   gefaelschte Umgebung (self, caches, fetch), synthetisches fetch-Ereignis,
   und dann wird angesehen, was tatsaechlich zurueckkommt.

   Der Zielkonflikt, um den es geht:
   - Der Offline-Cache ist eine zugesagte Eigenschaft. Im Reinraum ist
     kein WLAN der Normalfall, nicht die Ausnahme.
   - Ein still ausgelieferter Altstand ist aber ein verschleierter
     Zustand (Leitplanke 10) und trennt "freigegeben" von "in Benutzung".
   Beides zusammen geht nur so: fuer das DOKUMENT Netz zuerst, Cache als
   Rueckfall; fuer alles andere Cache zuerst.                            */
{
  const swQuelle = await readFile(new URL("./public/sw.js", import.meta.url), "utf8");

  /* Minimaler Prüfstand. Absichtlich klein gehalten: je mehr die
     Faelschung kann, desto weniger sagt der Test ueber die Wirklichkeit. */
  function pruefstand({ netz, imCache = {} }) {
    const hoerer = {};
    const abgelegt = new Map(Object.entries(imCache));
    let netzAufrufe = 0;
    const self = {
      addEventListener: (typ, fn) => { hoerer[typ] = fn; },
      location: { origin: "https://pruefstand.test" },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    const caches = {
      open: async () => ({
        addAll: async () => {},
        put: async (anfrage, antwort) => {
          abgelegt.set(String(anfrage?.url ?? anfrage), antwort);
        },
      }),
      match: async anfrage => abgelegt.get(String(anfrage?.url ?? anfrage)),
      keys: async () => [],
      delete: async () => true,
    };
    const fetchStub = async anfrage => {
      netzAufrufe += 1;
      return netz(String(anfrage?.url ?? anfrage));
    };
    const umgebung = vm.createContext({
      self, caches, fetch: fetchStub, URL, console,
      setTimeout, clearTimeout, Promise, AbortController,
    });
    umgebung.globalThis = umgebung;
    vm.runInContext(swQuelle, umgebung);
    return { hoerer, zaehler: () => netzAufrufe };
  }

  const koerper = text => ({ ok: true, marke: text, clone() { return this; },
    text: async () => text });

  /* Ein Fehler im Service Worker wird zur Antwort "FEHLER: ..." statt zur
     Ausnahme. Sonst reisst die erste kaputte Zusage den ganzen Lauf ab und
     man sieht nicht mehr, WELCHE der vier es war - gemessen bei der
     Sabotageprobe, die den Cache-Rueckfall entfernte. */
  async function hole(stand, url, modus) {
    const ereignis = {
      request: { url, method: "GET", mode: modus },
      respondWith(p) { ereignis.antwort = p; },
    };
    try {
      stand.hoerer.fetch(ereignis);
      if (!ereignis.antwort) return "KEINE_ANTWORT";
      /* Eigenes Wartelimit: antwortet der Service Worker gar nicht, soll
         die Gegenprobe das MELDEN und nicht den Lauf anhalten. Grosszuegig
         gegenueber dem Zeitlimit im Service Worker (2 s), damit hier nur
         echtes Haengen anschlaegt und keine Langsamkeit. */
      const haenger = new Promise(fertig => setTimeout(() => fertig("HAENGT"), 8000));
      const antwort = await Promise.race([ereignis.antwort, haenger]);
      return antwort === "HAENGT" ? "HAENGT" : (antwort?.marke ?? "OHNE_MARKE");
    } catch (fehler) {
      return `FEHLER: ${fehler?.message || fehler}`;
    }
  }

  const DOK = "https://pruefstand.test/index.html";
  const BUNDLE = "https://pruefstand.test/assets/index-abc123.js";

  /* V39 - mit Netz gewinnt fuer das Dokument das Netz.
     Sonst sieht der Pruefer nach jeder Auslieferung einmal die
     Vorversion, ohne dass es ihm irgendetwas anzeigt. */
  const mitNetz = pruefstand({
    netz: async () => koerper("NEU"),
    imCache: { [DOK]: koerper("ALT") },
  });
  const dokMitNetz = await hole(mitNetz, DOK, "navigate");

  /* V40 - ohne Netz bleibt die Offline-Zusage. Das ist die Bedingung,
     unter der V39 ueberhaupt vertretbar ist. */
  const ohneNetz = pruefstand({
    netz: async () => { throw new Error("offline"); },
    imCache: { [DOK]: koerper("ALT") },
  });
  const dokOhneNetz = await hole(ohneNetz, DOK, "navigate");

  /* V41 - alles ausser dem Dokument bleibt Cache zuerst, und es wird
     dafuer NICHT ins Netz gegangen. Die Bundle-Namen tragen einen
     Inhalts-Hash; ein altes Bundle unter altem Namen ist nie falsch. */
  const bundleStand = pruefstand({
    netz: async () => koerper("NEU"),
    imCache: { [BUNDLE]: koerper("ALT") },
  });
  const bundle = await hole(bundleStand, BUNDLE, "no-cors");
  const bundleOhneNetzverkehr = bundleStand.zaehler() === 0;

  /* V42 - eine haengende Anfrage darf den Start nicht blockieren.
     Halb offenes WLAN ist im Reinraum der Normalfall; ohne Zeitlimit
     tauscht man einen Altstand gegen eine App, die gar nicht startet. */
  const beginn = Date.now();
  const haengt = pruefstand({
    netz: () => new Promise(() => {}),
    imCache: { [DOK]: koerper("ALT") },
  });
  const dokBeiHaenger = await hole(haengt, DOK, "navigate");
  const dauer = Date.now() - beginn;

  ok("V39", "Mit Netz liefert der Service Worker die AUSGELIEFERTE Fassung, nicht die zwischengespeicherte",
    dokMitNetz === "NEU",
    dokMitNetz === "NEU" ? "Navigationsanfrage: Netz gewinnt"
      : `Navigationsanfrage lieferte "${dokMitNetz}" - der Altstand kommt still durch`);

  ok("V40", "Ohne Netz startet die App weiter aus dem Cache",
    dokOhneNetz === "ALT",
    dokOhneNetz === "ALT" ? "Offline-Zusage unveraendert"
      : `offline lieferte "${dokOhneNetz}" - die Offline-Faehigkeit waere verloren`);

  ok("V41", "Gehashte Bauartefakte bleiben Cache zuerst, ohne zusaetzlichen Netzverkehr",
    bundle === "ALT" && bundleOhneNetzverkehr,
    `Bundle aus dem Cache: ${bundle === "ALT"} · Netzaufrufe: ${bundleStand.zaehler()}`);

  ok("V42", "Eine haengende Netzanfrage faellt auf den Cache zurueck statt zu blockieren",
    dokBeiHaenger === "ALT" && dauer < 5000,
    dokBeiHaenger === "ALT"
      ? `nach ${dauer} ms aus dem Cache beantwortet`
      : `haengende Anfrage lieferte "${dokBeiHaenger}" nach ${dauer} ms`);
}

console.log("");
const failedChecks = checks.filter(check => !check.passed);
console.log(`Bestanden: ${checks.length - failedChecks.length} / ${checks.length}`);
if (failedChecks.length) console.log(`Durchgefallen: ${failedChecks.map(check => check.id).join(", ")}`);
console.log(`ERGEBNIS: ${failedChecks.length ? "DURCHGEFALLEN" : "BESTANDEN"}`);
process.exit(failedChecks.length ? 1 : 0);
