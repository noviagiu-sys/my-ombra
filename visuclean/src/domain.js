/* Einzige Quelle im Anwendungscode. versiontest.mjs vergleicht sie
   gegen package.json, package-lock.json, sw.js, PDF und Etiketten. */
import { aggregateCheckpoints, overallResult, OVERALL, STATUS } from "./assessment.js";

export const APP_VERSION = "8.3.0-rc.4.45";

export const USERS = Object.freeze([
  { username: "operator1", password: "pharma2024", role: "Operator", displayName: "Operator 1" },
  { username: "operator2", password: "pharma2024", role: "Operator", displayName: "Operator 2" },
  { username: "qa_manager", password: "quality2024", role: "QA Manager", displayName: "QA Manager" },
  { username: "admin", password: "admin2024", role: "Administrator", displayName: "Administrator" },
]);

/* `planar` sagt, ob die Flaeche UM das QR-Etikett herum in derselben Ebene
   liegt wie das Etikett selbst. Nur dann ist eine Homographie aus vier
   Etikettenecken fachlich gueltig.

   Bei Rohren, Kesseln, Konen und versetzten Flaechen ist sie es NICHT —
   solche Aufnahmen werden von der Mehrwinkelfusion ausgeschlossen, bleiben
   aber als Einzelbilder vollstaendig erhalten und werden normal bewertet.
   Die Eigenschaft ist DEKLARIERT, nicht gemessen: aus einem einzelnen
   Etikett laesst sich die Kruemmung der Umgebung nicht ableiten. */
const zone = (id, de, en, planar = true) => ({ id, de, en, planar });

const EQUIPMENT_CATALOG = [
  { id: "tp", code: "VC-EQ-TP", de: "Tablettenpresse", en: "Tablet press", material: "stainless", zones: [zone("punch", "Stempeloberfläche", "Punch surface"), zone("die", "Matrizenteller", "Die table"), zone("guide", "Stempelführung", "Punch guide"), zone("lower", "Unterstempel", "Lower punch"), zone("station", "Pressstation", "Press station")] },
  { id: "ct", code: "VC-EQ-CT", de: "Coater", en: "Coater", material: "stainless", zones: [zone("drum", "Trommelinnenwand", "Drum interior", false), zone("nozzles", "Sprühdüsen", "Spray nozzles", false), zone("outlet", "Trommelauslass", "Drum outlet", false), zone("seal", "Dichtungsring", "Sealing ring", false)] },
  { id: "gr", code: "VC-EQ-GR", de: "Granulator", en: "Granulator", material: "stainless", zones: [zone("chamber", "Mischkammer", "Mixing chamber", false), zone("chopper", "Zerhacker", "Chopper", false), zone("shaft", "Rührwerkswelle", "Agitator shaft", false), zone("seals", "Dichtungen", "Seals")] },
  { id: "fb", code: "VC-EQ-FB", de: "Wirbelschicht", en: "Fluid bed", material: "stainless", zones: [zone("bags", "Filterbeutel", "Filter bags", false), zone("screen", "Siebboden", "Screen plate"), zone("nozzle", "Sprühdüse", "Spray nozzle", false), zone("bowl", "Produktbehälter", "Product bowl", false)] },
  { id: "mx", code: "VC-EQ-MX", de: "Mischer / Blender", en: "Mixer / blender", material: "stainless", zones: [zone("inside", "Innenoberfläche", "Interior surface", false), zone("valve", "Klappenventil", "Flap valve", false), zone("welds", "Schweissnähte", "Weld seams", false), zone("outlet", "Auslauföffnung", "Outlet")] },
  { id: "cf", code: "VC-EQ-CF", de: "Kapselfüller", en: "Capsule filler", material: "stainless", zones: [zone("dosing", "Dosierrohr", "Dosing tube", false), zone("holder", "Kapselhalter", "Capsule holder"), zone("closing", "Schliessstation", "Closing station"), zone("eject", "Ausstossstation", "Ejection station")] },
  { id: "kt", code: "VC-EQ-KT", de: "Klappenteller", en: "Flap plate", material: "stainless", zones: [zone("top", "Telleroberfläche oben", "Plate surface top"), zone("bottom", "Telleroberfläche unten", "Plate surface bottom"), zone("seal", "Dichtungsring", "Sealing ring", false), zone("stem", "Ventilschaft", "Valve stem", false), zone("flange", "Flanschfläche", "Flange surface")] },
  { id: "ibc", code: "VC-EQ-IBC", de: "IBC Container / Bin", en: "IBC container / bin", material: "stainless", zones: [zone("floor", "Innenoberfläche Boden", "Interior floor"), zone("walls", "Innenoberfläche Wände", "Interior walls", false), zone("cone", "Auslaufkonus", "Outlet cone", false), zone("butterfly", "Butterfly-Ventil", "Butterfly valve", false), zone("welds", "Schweissnähte", "Weld seams", false)] },
  { id: "ss", code: "VC-EQ-SS", de: "Edelstahl-Kleinteile", en: "Small stainless-steel parts", material: "stainless", zones: [zone("contact", "Oberfläche produktberührend", "Product-contact surface"), zone("welds", "Schweissnähte", "Weld seams", false), zone("seals", "Dichtflächen", "Sealing surfaces"), zone("edges", "Kanten & Ecken", "Edges & corners")] },
];

const EQUIPMENT_BARCODES = Object.freeze({
  tp: "7610000000011", ct: "7610000000028", gr: "7610000000035",
  fb: "7610000000042", mx: "7610000000059", cf: "7610000000066",
  kt: "7610000000073", ibc: "7610000000080", ss: "7610000000097",
});

export const EQUIPMENT = Object.freeze(EQUIPMENT_CATALOG.map(item => Object.freeze({
  ...item,
  barcode: EQUIPMENT_BARCODES[item.id],
})));

export function authenticate(username, password) {
  const found = USERS.find(user => user.username === String(username).trim().toLowerCase() && user.password === password);
  return found ? { username: found.username, role: found.role, displayName: found.displayName } : null;
}

/**
 * Rueckmeldung zur QA-Anmeldung. Steht hier neben authenticate, nicht in
 * der Oberflaeche, damit sie ohne Rendern pruefbar ist.
 *
 * Bis rc.4.13 stand die Meldung "Unbekannte Zugangsdaten" in submit() des
 * QA-Schirms - und submit wurde nur an SignatureConfirm uebergeben, das
 * erst bei GUELTIGEM approver gerendert wird. Der Zweig war damit toter
 * Code: Tippfehler, falsches Passwort und leeres Feld sahen alle gleich
 * aus, naemlich wie "noch nicht fertig ausgefuellt". Befund aus dem
 * Bedienlauf vom 11.09.2026.
 *
 * @returns {string|null} i18n-Schluessel oder null, wenn angemeldet
 */
export function qaLoginStatus({ username = "", password = "", approver = null } = {}) {
  if (approver) return null;
  if (!String(username).trim() || !String(password)) return "qaApprovalAwaitLogin";
  return "qaApprovalUnknown";
}

export function verifyPassword(user, password) {
  const stored = USERS.find(candidate => candidate.username === user?.username);
  return Boolean(stored && stored.password === password);
}

export function equipmentName(equipment, language = "de") {
  return equipment?.[language] || equipment?.de || "";
}

export function zoneName(selectedZone, language = "de") {
  return selectedZone?.[language] || selectedZone?.de || "";
}

export function parseEquipmentCode(raw) {
  const normalized = String(raw || "").trim().toUpperCase();
  if (!normalized) return null;
  const direct = EQUIPMENT.find(item => item.code === normalized || item.barcode === normalized || item.id.toUpperCase() === normalized);
  if (direct) return direct;
  const payload = /^VC\|V=1\|EQ=([A-Z0-9_-]+)$/.exec(normalized);
  return payload ? EQUIPMENT.find(item => item.id.toUpperCase() === payload[1] || item.code === payload[1]) || null : null;
}

export function parseEquipmentTarget(raw) {
  const value = String(raw || "").trim();
  const equipmentOnly = parseEquipmentCode(value);
  if (equipmentOnly) return { equipment: equipmentOnly, zone: null };

  const separator = value.indexOf("|");
  if (separator < 1) return null;
  const equipmentToken = value.slice(0, separator).trim();
  const zoneToken = value.slice(separator + 1).trim().toLocaleLowerCase("de-CH");
  const equipment = parseEquipmentCode(equipmentToken);
  if (!equipment || !zoneToken) return null;
  const selectedZone = equipment.zones.find(item => [item.id, item.de, item.en]
    .some(candidate => String(candidate).trim().toLocaleLowerCase("de-CH") === zoneToken));
  return selectedZone ? { equipment, zone: selectedZone } : null;
}

export function lightLevel(luminance) {
  if (luminance < 0.15) return "critical";
  if (luminance < 0.30) return "warning";
  return "ok";
}

export function aggregateResults(results) {
  if (!Array.isArray(results) || !results.length) throw new Error("Mindestens ein Analyseergebnis erforderlich");
  const worst = key => results.map(result => result[key]).reduce((a, b) => {
    if (a.pass !== b.pass) return a.pass ? b : a;
    if (!a.pass && !b.pass) return (b.severity || 0) > (a.severity || 0) ? b : a;
    return a;
  });
  const zusammengefasst = {
    dry: worst("dry"),
    clean: worst("clean"),
    intact: worst("intact"),
    lm: Math.min(...results.map(result => result.lm)),
    hints: [...new Set(results.flatMap(result => result.hints || []))],
  };
  /* Pruefpunkte werden nur angehaengt, wenn die Ergebnisse welche tragen.
     So bleiben aeltere Datensaetze und bestehende Tests unveraendert
     gueltig - das Feld ist rein additiv. */
  const punkte = aggregateCheckpoints(results.map(result => result.checkpoints));
  if (punkte.length) zusammengefasst.checkpoints = punkte;
  return zusammengefasst;
}

export function deriveSystemDecision(result) {
  const light = lightLevel(result?.lm ?? 0);
  const failed = ["dry", "clean", "intact"].filter(key => result?.[key] && !result[key].pass);
  /* RC3: ein Pruefpunkt, der nicht bewertbar ist, darf niemals zu einem
     automatischen PASS fuehren. Das ist die Regel, wegen der RC3 existiert:
     eine ungeeignete Aufnahme wird nicht durchgewinkt, sie wird offen
     ausgewiesen. Ein FAIL bleibt vorrangig - "nicht bewertbar" ist kein
     Ersatz fuer ein bestaetigtes Nicht-Bestanden. */
  const punkte = Array.isArray(result?.checkpoints) ? result.checkpoints : [];
  const offen = punkte.filter(c => c.required && c.status === STATUS.NOT_ASSESSABLE).map(c => c.id);
  if (light === "critical") return { status: "FAIL", reason: "CRITICAL_LIGHT", failed, notAssessable: offen };
  if (failed.length) return { status: "FAIL", reason: "CRITERIA_FAIL", failed, notAssessable: offen };
  if (offen.length) return { status: "WARNING", reason: "NOT_ASSESSABLE", failed: [], notAssessable: offen };
  if (light === "warning" || (result?.hints || []).length) return { status: "WARNING", reason: light === "warning" ? "LIGHT_WARNING" : "ANALYSIS_HINT", failed: [], notAssessable: [] };
  return { status: "PASS", reason: "ALL_PASS", failed: [], notAssessable: [] };
}

/**
 * Das Gesamtergebnis der Pruefpunkte (BLOCKED / NOT_ASSESSABLE / PASS).
 * Liefert null, wenn ein Datensatz noch keine Pruefpunkte traegt.
 */
export function checkpointOverall(result) {
  const punkte = Array.isArray(result?.checkpoints) ? result.checkpoints : [];
  return punkte.length ? overallResult(punkte) : null;
}

export { OVERALL };

export function signatureMeaning(finalDecision) {
  if (finalDecision === "OVERRIDE") return "Override-Freigabe";
  if (finalDecision === "FAIL") return "Sperrung";
  return "Freigabe";
}

/* Liegt der Marker auf einer laenglichen Struktur? Geprueft werden BEIDE
   Quellen, die es gibt: die Riefen des Kerns (im Overlay) und die
   Kandidaten des Screenings.

   BEFUND des Geraetelaufs mit rc.4.43, zutreffend: assessMarker zaehlte
   nur die vier Helligkeits- und Farbmasken. `scratches` stand im selben
   Overlay daneben und wurde nie gelesen. Ein Marker GENAU auf einer
   erkannten Riefe meldete deshalb "unauffaellig" — auf einer sauberen,
   trockenen, nicht korrodierten Flaeche war das sogar das einzig
   moegliche Markerurteil. Besonders unangenehm, weil der Marker der
   vorgesehene Weg ist, eine UEBERSEHENE Riefe zu melden: die Anzeige
   widersprach ihrem eigenen Zweck.

   Kern und Screening rechnen in VERSCHIEDENEN Aufloesungen (gemessen:
   632x640 gegen 711x720). Beide Kastenlisten werden deshalb ueber ihre
   EIGENE Bezugsgroesse in Anteile zurueckgerechnet und erst dann mit dem
   Marker verglichen. Dieselbe Verwechslung hat rc.4.40 bis rc.4.42
   dreimal gekostet; sie wird in M4 eigens geprueft. */
function laenglicheTreffer(result, marker, radiusAnteil) {
  const quellen = [
    { boxen: result?._ov?.scratches, w: result?._ov?.w, h: result?._ov?.h },
    {
      boxen: result?._screeningHochaufloesend?.candidates?.map(c => c.boundingBox),
      w: result?._screeningHochaufloesend?.bildBreite,
      h: result?._screeningHochaufloesend?.bildHoehe,
    },
  ];
  let treffer = 0;
  for (const { boxen, w, h } of quellen) {
    if (!Array.isArray(boxen) || !(w > 0) || !(h > 0)) continue;
    for (const box of boxen) {
      if (!box || ![box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite)) continue;
      /* Der Kasten in Anteilen seiner eigenen Bezugsgroesse, um den
         Markerradius geweitet. Beruehrung genuegt: ein Marker am Rand
         einer Riefe zeigt auf dieselbe Stelle. */
      const drin = marker.x >= box.minX / w - radiusAnteil
        && marker.x <= (box.maxX + 1) / w + radiusAnteil
        && marker.y >= box.minY / h - radiusAnteil
        && marker.y <= (box.maxY + 1) / h + radiusAnteil;
      if (drin) treffer++;
    }
  }
  return treffer;
}

export function assessMarker(result, marker) {
  const overlay = result?._ov;
  if (!overlay || !marker) return { code: "UNKNOWN", severity: 0 };
  const x = Math.max(0, Math.min(overlay.w - 1, Math.round(marker.x * overlay.w)));
  const y = Math.max(0, Math.min(overlay.h - 1, Math.round(marker.y * overlay.h)));
  const radius = Math.max(2, Math.round(Math.min(overlay.w, overlay.h) * 0.035));
  const counts = { bright: 0, warm: 0, dark: 0, anomaly: 0, total: 0 };
  for (let yy = Math.max(0, y - radius); yy <= Math.min(overlay.h - 1, y + radius); yy++) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(overlay.w - 1, x + radius); xx++) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > radius ** 2) continue;
      const index = yy * overlay.w + xx;
      counts.total++;
      if (overlay.maskBright?.[index]) counts.bright++;
      if (overlay.maskWarm?.[index]) counts.warm++;
      if (overlay.maskDark?.[index]) counts.dark++;
      if (overlay.maskAnom?.[index]) counts.anomaly++;
    }
  }
  /* RC4 · X-04. Die Befundstaerke ist ein algorithmischer Index, keine
     Messgroesse. Bis RC3 wurde sie mit 100 multipliziert und mit einem
     Prozentzeichen angezeigt — das las sich wie ein Messwert mit Einheit.
     Der zugrunde liegende Anteil ist unveraendert; nur die Skalierung auf
     eine Prozentanmutung entfaellt. Der Wert bleibt dimensionslos. */
  const fraction = key => counts.total ? counts[key] / counts.total : 0;
  const index = key => Number(fraction(key).toFixed(3));
  if (fraction("dark") > 0.08) return { code: "DARK_FINDING", severity: index("dark") };
  if (fraction("warm") > 0.08) return { code: "RESIDUE_FINDING", severity: index("warm") };
  if (fraction("bright") > 0.08) return { code: "MOISTURE_FINDING", severity: index("bright") };
  if (fraction("anomaly") > 0.08) return { code: "ANOMALY_FINDING", severity: index("anomaly") };
  /* Erst NACH den vier Masken: ein dunkler Fleck bleibt ein dunkler Fleck
     und wird nicht zum Kratzer umgedeutet (M3). Der Index zaehlt die
     getroffenen Strukturen — eine Anzahl, keine Messgroesse, und
     ausdruecklich keine Tiefe. */
  const radiusAnteil = radius / Math.min(overlay.w, overlay.h);
  const laenglich = laenglicheTreffer(result, marker, radiusAnteil);
  if (laenglich > 0) return { code: "SCRATCH_FINDING", severity: laenglich };
  return { code: "UNREMARKABLE", severity: 0 };
}

export function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
