/* VisuClean v8.2 · kanonische Hash- und Audit-Hilfen.
   Der Browser-Demonstrator erzeugt eine manipulationserkennbare Hash-Kette.
   Das ersetzt keine serverseitige, validierte Signaturinfrastruktur. */

function ownDataEntries(value) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors)
    .filter(key => typeof key === "string" && descriptors[key].enumerable)
    .sort()
    .map(key => {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) throw new TypeError(`Accessor-Feld nicht erlaubt: ${key}`);
      return [key, descriptor.value];
    });
}

export function canonicalize(value, seen = new WeakSet()) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Nicht-endliche Zahl nicht erlaubt");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "undefined") throw new TypeError("Undefined ist in signierten Daten nicht erlaubt");
  if (typeof value !== "object") throw new TypeError(`Nicht unterstützter Typ: ${typeof value}`);
  if (seen.has(value)) throw new TypeError("Zyklische Daten nicht erlaubt");
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map(item => canonicalize(item, seen)).join(",")}]`;
    return `{${ownDataEntries(value).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/* ─── RC4.3 · Elektronische Signatur ───────────────────────────────────────
   Bis RC4.2 verlangte VisuClean eine gezeichnete Unterschrift plus
   Passwort. Die Zeichnung war nie eine Kontrolle: "Pfadlaenge >= 20 px"
   belegt, dass jemand den Finger bewegt hat, und authentifiziert niemanden.
   Sie SAH nach Unterschrift aus, und genau das war das Problem — sie
   suggerierte eine Sicherheit, die sie nicht hatte.

   21 CFR Part 11 §11.200 verlangt fuer nicht-biometrische elektronische
   Signaturen mindestens ZWEI unterschiedliche Identifikationskomponenten.
   Benutzerkennung und Passwort sind genau das. Eine Zeichnung ist nicht
   gefordert.

   Dazu kommt der praktische Grund: im Reinraum wird mit Handschuhen
   gearbeitet. Eine Unterschrift auf einem Touchscreen ist dort nicht
   reproduzierbar — und eine Signatur, die je nach Handschuh anders
   aussieht, ist als Manifestation wertlos.

   Was bleibt, ist §11.50: die Signatur traegt den Namen des
   Unterzeichners, Datum und Uhrzeit und die BEDEUTUNG der Handlung. */

export const SIGNATURE_METHOD = Object.freeze({ USER_ID_PASSWORD: "USER_ID_PASSWORD" });

/** Die zwei Identifikationskomponenten nach §11.200(a)(1). */
export const SIGNATURE_COMPONENTS = Object.freeze(["userId", "password"]);

/**
 * Prueft eine elektronische Signatur auf Vollstaendigkeit.
 * Geprueft wird die FORM, nicht die Identitaet — die Authentifizierung
 * selbst geschieht vorher gegen den Benutzerspeicher.
 */
export function validElectronicSignature(signature) {
  if (!signature || typeof signature !== "object") return false;
  if (signature.method !== SIGNATURE_METHOD.USER_ID_PASSWORD) return false;
  const komponenten = Array.isArray(signature.components) ? signature.components : [];
  if (SIGNATURE_COMPONENTS.some(name => !komponenten.includes(name))) return false;
  return ["signedBy", "signedAt", "meaning"]
    .every(feld => typeof signature[feld] === "string" && signature[feld].trim().length > 0);
}

/* ALT: die Pfadlaenge der gezeichneten Unterschrift. Bleibt als Funktion
   erhalten, weil aeltere Datensaetze das Feld tragen und lesbar bleiben
   muessen. Sie ist KEINE Sicherheitskontrolle mehr und wird beim Schreiben
   nicht mehr geprueft. */
export function validSignaturePath(length) {
  return Number.isFinite(length) && length >= 20;
}

export async function recordDigest(record) {
  const copy = Object.create(null);
  for (const [key, value] of ownDataEntries(record)) {
    if (key !== "recordHash") Object.defineProperty(copy, key, { value, enumerable: true });
  }
  return sha256Hex(copy);
}

export async function createAuditEvent({ kind, actor, payload, previous = null, at, id }) {
  const event = {
    schema: 1,
    seq: previous ? previous.seq + 1 : 1,
    id: id || crypto.randomUUID(),
    at: at || new Date().toISOString(),
    kind,
    actor: actor ? { id: actor.username || actor.id, name: actor.displayName, role: actor.role } : null,
    payload,
    prevHash: previous ? previous.hash : "GENESIS",
  };
  return { ...event, hash: await sha256Hex(event) };
}

export async function verifyAuditChain(events) {
  let previous = null;
  for (const event of events) {
    if (!event || event.seq !== (previous ? previous.seq + 1 : 1)) return { ok: false, reason: "sequence", event };
    if (event.prevHash !== (previous ? previous.hash : "GENESIS")) return { ok: false, reason: "previous_hash", event };
    const candidate = Object.create(null);
    for (const [key, value] of ownDataEntries(event)) {
      if (key !== "hash") Object.defineProperty(candidate, key, { value, enumerable: true });
    }
    if (await sha256Hex(candidate) !== event.hash) return { ok: false, reason: "hash", event };
    previous = event;
  }
  return { ok: true, count: events.length, lastHash: previous?.hash || "GENESIS" };
}
