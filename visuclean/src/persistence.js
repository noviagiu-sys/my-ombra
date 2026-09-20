import { APP_VERSION } from "./domain.js";
import { canonicalize, createAuditEvent, recordDigest, validElectronicSignature, verifyAuditChain } from "./audit.js";
import { TOLERABLE_INTACT_CODES, TOLERABLE_ISSUE_TYPES } from "./knownIssues.js";
import { CHECKPOINTS, KNOWN_ISSUE_TOLERATED, STATUS } from "./assessment.js";
import {
  approvalProjection, clarificationProjection, istKlaerungsschritt, KLAERUNG_MEANING,
} from "./inspectionRecord.js";
import {
  LIFECYCLE_STATE, LIFECYCLE_EVENT, FINAL_RESULT, TERMINAL_STATES,
  evaluateTransition, verifyAnchors, stateAfterIntegrityCheck,
} from "./lifecycle.js";
import {
  SCRATCH_STATUS, collectQaTriggers, depthStatusMatchesMeasurement,
  hasCaptureProfile, hasDeviation, rejectsNumericDepth,
  validateKnownIssueAssignment, validateManualFinding, validateRetakeRecord,
  bestaetigteSchaeden, offeneSchadensverdachte,
} from "./decision.js";
import { evaluateDepthMeasurement, istSpeicherbar } from "./depthLimit.js";
import { markerInFlaeche } from "./inspectionArea.js";
import { findeKandidat } from "./scratchScreening.js";

/* Die Datensatzversion von RC4. Sie ist NICHT dasselbe wie `schema`:
   `schema` kennzeichnet das Export-/Speicherformat und bleibt bei 2, damit
   RC2- und RC3-Daten lesbar bleiben. `schemaVersion` kennzeichnet den
   Datensatzvertrag der Anwendung. Schreiben ist nur mit 3 zulaessig; Lesen
   bleibt fuer alle Versionen moeglich. */
export const RECORD_SCHEMA_VERSION = 3;

const DB_NAME = "visuclean-v82";
const DB_VERSION = 1;
const STORES = ["inspections", "issues", "references"];
let dbPromise;

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("IndexedDB-Anfrage fehlgeschlagen"));
});

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error("IndexedDB-Transaktion fehlgeschlagen"));
  transaction.onabort = () => reject(transaction.error || new Error("IndexedDB-Transaktion abgebrochen"));
});

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB ist in diesem Browser nicht verfügbar"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("audit")) {
          const audit = db.createObjectStore("audit", { keyPath: "id" });
          audit.createIndex("seq", "seq", { unique: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("VisuClean-Datenbank konnte nicht geöffnet werden"));
    });
  }
  return dbPromise;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptionKey(db) {
  const tx = db.transaction("meta", "readonly");
  const done = transactionDone(tx);
  const saved = await requestResult(tx.objectStore("meta").get("encryption-key"));
  await done;
  if (saved?.value) return saved.value;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const write = db.transaction("meta", "readwrite");
  write.objectStore("meta").put({ id: "encryption-key", value: key, createdAt: new Date().toISOString() });
  await transactionDone(write);
  return key;
}

async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { version: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function unseal(key, blob) {
  if (!blob || blob.version !== 1) throw new Error("Unbekanntes Speicherformat");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(blob.iv) }, key, base64ToBytes(blob.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function readLastAuditMeta(db) {
  const tx = db.transaction("meta", "readonly");
  const done = transactionDone(tx);
  const row = await requestResult(tx.objectStore("meta").get("last-audit"));
  await done;
  return row?.value || null;
}

async function commitWithAudit({ storeName, id, value, kind, actor, payload, insertOnly = false,
  extraEvents = [] }) {
  const db = await openDatabase();
  const key = await encryptionKey(db);
  const previous = await readLastAuditMeta(db);
  const existingEvents = await loadAuditEvents();
  const verification = await verifyAuditChain(existingEvents);
  if (!verification.ok) throw new Error("Audit-Kette ist beschaedigt; Schreibvorgang gesperrt");
  const actualLast = existingEvents.at(-1) || null;
  const metaConsistent = actualLast
    ? previous?.id === actualLast.id && previous?.seq === actualLast.seq && previous?.hash === actualLast.hash
    : previous === null;
  if (!metaConsistent) throw new Error("Audit-Metadaten stimmen nicht mit der Kette ueberein; Schreibvorgang gesperrt");
  /* Ein Schreibvorgang kann mehrere Lebenszyklusereignisse erzeugen — zum
     Beispiel die Signatur UND den finalen Integritaetsanker. Sie bilden
     eine fortlaufende Kette und werden in derselben Transaktion
     geschrieben: entweder alle oder keines. */
  const events = [];
  let vorheriges = previous;
  for (const beschreibung of [{ kind, payload }, ...extraEvents]) {
    const event = await createAuditEvent({
      kind: beschreibung.kind, actor, payload: beschreibung.payload, previous: vorheriges,
    });
    events.push(event);
    vorheriges = event;
  }
  const letztes = events.at(-1);
  const [valueBlob, ...eventBlobs] = await Promise.all([
    seal(key, value), ...events.map(event => seal(key, event)),
  ]);

  const tx = db.transaction([storeName, "audit", "meta"], "readwrite");
  const done = transactionDone(tx);
  const row = { id, blob: valueBlob, updatedAt: new Date().toISOString() };
  if (insertOnly) tx.objectStore(storeName).add(row);
  else tx.objectStore(storeName).put(row);
  events.forEach((event, index) => {
    tx.objectStore("audit").put({ id: event.id, seq: event.seq, blob: eventBlobs[index] });
  });
  tx.objectStore("meta").put({ id: "last-audit", value: { id: letztes.id, seq: letztes.seq, hash: letztes.hash } });
  await done;
  return events[0];
}

async function getAllEncrypted(storeName) {
  const db = await openDatabase();
  const key = await encryptionKey(db);
  const tx = db.transaction(storeName, "readonly");
  const done = transactionDone(tx);
  const rows = await requestResult(tx.objectStore(storeName).getAll());
  await done;
  return Promise.all(rows.map(row => unseal(key, row.blob)));
}

export async function loadInspections() {
  const rows = await getAllEncrypted("inspections");
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function loadIssues() {
  const rows = await getAllEncrypted("issues");
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function loadReferences() {
  return getAllEncrypted("references");
}

export async function loadAuditEvents() {
  const db = await openDatabase();
  const key = await encryptionKey(db);
  const tx = db.transaction("audit", "readonly");
  const done = transactionDone(tx);
  const rows = await requestResult(tx.objectStore("audit").index("seq").getAll());
  await done;
  return Promise.all(rows.map(row => unseal(key, row.blob)));
}

export async function verifyStoredAudit() {
  return verifyAuditChain(await loadAuditEvents());
}

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};
const imageBytes = value => Math.ceil((String(value || "").split(",")[1]?.length || 0) * .75);

async function validateRecordHash(value) {
  invariant(typeof value?.recordHash === "string" && value.recordHash.length === 64, "Gueltiger Datensatz-Hash fehlt");
  invariant(await recordDigest(value) === value.recordHash, "Datensatz-Hash stimmt nicht mit dem Inhalt ueberein");
}

/* ── RC4 · Datensatzvertrag ───────────────────────────────────────────────
   Diese Pruefungen sind eine Sicherheitsgrenze, keine Formalitaet. Sie
   duerfen nicht in die Oberflaeche verschoben oder dort dupliziert werden.

   Reihenfolge ist Absicht: erst Schema und Struktur, dann Zustand und
   Rolle, dann die fachlichen Befunde. Ein Datensatz, der schon strukturell
   nicht stimmt, soll nicht mit einer fachlichen Fehlermeldung abgewiesen
   werden — das verschleiert die Ursache.                                  */

const ownEnumerable = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key)
  && Object.getOwnPropertyDescriptor(object, key)?.enumerable === true;

const CHECKPOINT_IDS = CHECKPOINTS.map(item => item.id);
const REQUIRED_BY_ID = new Map(CHECKPOINTS.map(item => [item.id, item.required]));

/**
 * Prueft eine Pruefpunktliste. Leer, unvollstaendig, doppelt oder mit
 * unbekanntem Status ist unzulaessig. Ein angeliefertes `required: false`
 * ist wirkungslos — massgeblich ist ausschliesslich CHECKPOINTS (T-22).
 */
function validateCheckpointList(list, wo) {
  invariant(Array.isArray(list) && list.length > 0, `Pruefpunktliste fehlt oder ist leer (${wo})`);
  const ids = list.map(item => item?.id);
  invariant(new Set(ids).size === ids.length, `Doppelte Pruefpunkte (${wo})`);
  for (const id of CHECKPOINT_IDS) {
    invariant(ids.includes(id), `Pruefpunkt fehlt: ${id} (${wo})`);
  }
  for (const item of list) {
    invariant(CHECKPOINT_IDS.includes(item?.id), `Unbekannter Pruefpunkt: ${item?.id} (${wo})`);
    invariant(Object.values(STATUS).includes(item?.status),
      `Unbekannter Pruefpunktstatus: ${item?.status} (${wo})`);
    invariant(item.required === REQUIRED_BY_ID.get(item.id),
      `Angeliefertes required stimmt nicht mit der Definition ueberein: ${item.id} (${wo})`);
  }
}

/**
 * Ein gemeldeter Schadensverdacht bleibt offen, bis er dokumentiert
 * beurteilt ist. Solange er offen ist, darf kein positiver Abschluss
 * gespeichert werden — weder PASS noch Override.
 *
 * BEFUND des Geraetelaufs mit rc.4.43: eine kompakte Ausbruchstelle war am
 * Bildschirm deutlich zu sehen und stand im Nachlauf auf Rang 22 von 493,
 * also unter dem gespeicherten Schnitt. Der Pruefer hatte keinen Weg, sie
 * in den Datensatz zu bringen: `manualFindings` wurde in App.jsx fest als
 * leeres Feld uebergeben. Ein fehlendes algorithmisches Signal machte die
 * gesehene Stelle damit zu "unauffaellig".
 *
 * Reine Funktion, eigens exportiert: die Regel ist ohne IndexedDB
 * pruefbar, und die Gegenprobe soll sie nicht ueber einen Speicherlauf
 * erraten muessen.
 */
/**
 * Belegt der Datensatz die Kandidatenbindung dieser Messung?
 *
 * BEFUND der Gegenpruefung an rc.4.44: geprueft wurde nur gegen die
 * VORAUSWAHL (`candidates`). Eine vollstaendige unabhaengige Messung an
 * einem nachgeladenen Kandidaten — genau der Fall, um den es geht — wurde
 * deshalb als "Kennung existiert nicht" abgewiesen, obwohl der Datensatz
 * ihn seit rc.4.44 in `alleKandidaten` belegt.
 *
 * Unveraendert bleibt die Aussage der Sperre: eine Bindung, die der
 * Datensatz NICHT belegt, ist keine Bindung. Erfundene Kennungen und
 * Kennungen eines anderen Fotos werden weiter abgewiesen.
 *
 * Reine Funktion, eigens exportiert — dieselbe Quelle wie die Anzeige
 * (findeKandidat in scratchScreening.js), damit nicht wieder drei
 * Fassungen desselben Bestands entstehen.
 */
export function pruefeKandidatenbindung(record, messung) {
  const fotoScreening = (record?.screening?.photos || [])
    .find(f => f?.photoId === messung?.photoId);
  if (findeKandidat(fotoScreening, messung?.kandidatId)) {
    return { valid: true, error: null };
  }
  return {
    valid: false,
    error: `Kandidaten-Kennung ${messung?.kandidatId} existiert nicht auf Foto `
      + `${messung?.photoId}. Eine Messung, die sich auf einen nicht `
      + "belegten Kandidaten beruft, wuerde als erkannt gezaehlt und die "
      + "Zahl der uebersehenen Befunde schoenen.",
  };
}

/**
 * Die enge Regel fuer den Beurteilungsschritt (BEFUND D).
 *
 * `clarificationProjection` nimmt `manualFindings` aus dem Inhaltsvergleich
 * heraus — sonst koennte die QA im Beurteilungsschritt die Meldung selbst
 * umschreiben, Stellen nachschieben oder eine fremde Antwort ersetzen. Was
 * die Projektion nicht mehr prueft, prueft diese Funktion, und zwar enger:
 *
 *   - gleiche Anzahl, gleiche Reihenfolge, gleiche Stellen;
 *   - alles ausser `klaerung` bleibt Zeichen fuer Zeichen gleich;
 *   - eine bereits dokumentierte Beurteilung bleibt unangetastet;
 *   - mindestens eine offene Meldung wird tatsaechlich beantwortet.
 *
 * Verglichen wird kanonisch, nicht mit JSON.stringify: der gespeicherte
 * Datensatz kommt aus der Verschluesselung zurueck, und die
 * Schluesselreihenfolge ist danach nicht garantiert.
 *
 * Reine Funktion, eigens exportiert — Q11 und Q12 fahren sie ueber den
 * echten Speicherweg.
 */
export function pruefeKlaerungsDelta(bezug, record) {
  const alt = Array.isArray(bezug?.manualFindings) ? bezug.manualFindings : [];
  const neu = Array.isArray(record?.manualFindings) ? record.manualFindings : [];
  if (alt.length !== neu.length) {
    return { valid: false,
      error: "Die Beurteilung darf keine gemeldete Stelle hinzufuegen oder entfernen: "
        + `vorher ${alt.length}, jetzt ${neu.length}` };
  }
  let beantwortet = 0;
  for (let i = 0; i < alt.length; i++) {
    const { klaerung: alteKlaerung, ...alterRest } = alt[i] ?? {};
    const { klaerung: neueKlaerung, ...neuerRest } = neu[i] ?? {};
    if (canonicalize(alterRest) !== canonicalize(neuerRest)) {
      return { valid: false,
        error: "Die Beurteilung veraendert die Meldung selbst "
          + `(${alt[i]?.markerId ?? "ohne Kennung"}). Sie beantwortet sie nur.` };
    }
    if (alteKlaerung && canonicalize(alteKlaerung) !== canonicalize(neueKlaerung ?? null)) {
      return { valid: false,
        error: "Eine bereits dokumentierte Beurteilung darf nicht ueberschrieben werden "
          + `(${alt[i]?.markerId ?? "ohne Kennung"})` };
    }
    if (!alteKlaerung && neueKlaerung) beantwortet++;
  }
  if (!beantwortet) {
    return { valid: false,
      error: "Die Beurteilung beantwortet keine offene Meldung" };
  }
  return { valid: true, error: null, beantwortet };
}

export function pruefeSchadensverdachte(record) {
  const entscheidung = record?.finalDecision;
  const offen = offeneSchadensverdachte(record?.manualFindings);
  /* Offen (unbeurteilt oder "weitere Pruefung noetig") sperrt JEDEN
     positiven Abschluss, den Override eingeschlossen. */
  if (offen.length && ["PASS", "OVERRIDE", "PASS_AFTER_REMEDIATION"].includes(entscheidung)) {
    return {
      valid: false,
      error: `${offen.length} gemeldete(r) Schadensverdacht ohne abschliessende `
        + `Beurteilung; ${entscheidung} ist damit nicht speicherbar`,
    };
  }
  /* Ein bestaetigter Schaden sperrt das PASS. Der Override bleibt moeglich
     — er ist die dokumentierte Abweichungsentscheidung und traegt seine
     eigenen Bedingungen. */
  const bestaetigt = bestaetigteSchaeden(record?.manualFindings);
  if (bestaetigt.length && ["PASS", "PASS_AFTER_REMEDIATION"].includes(entscheidung)) {
    return {
      valid: false,
      error: `${bestaetigt.length} bestaetigte(r) Schaden; ${entscheidung} folgt `
        + "daraus nicht. Moeglich sind FAIL oder die Freigabe mit Abweichung",
    };
  }
  return { valid: true, error: null };
}

/* `vorgaengerZustand` kommt vom Aufrufer: er hat den gespeicherten
   Vorgaenger bereits geladen. Ohne diesen Parameter muesste die Pruefung
   dem behaupteten previousState glauben — genau die Luecke, die die
   Gegenpruefung an rc.4.10 ausgenutzt hat. */
function validateRc4Contract(record, actor, vorgaengerZustand = null) {
  /* Schema. Lesen bleibt fuer jede Version moeglich; geschrieben wird nur 3. */
  invariant(ownEnumerable(record, "schemaVersion"), "schemaVersion fehlt");
  invariant(record.schemaVersion === RECORD_SCHEMA_VERSION,
    `Nur schemaVersion ${RECORD_SCHEMA_VERSION} darf geschrieben werden; vorliegend ${record.schemaVersion}`);

  /* finalDecision muss eine eigene, aufzaehlbare Eigenschaft sein. Ein
     geerbter oder nicht enumerierbarer Wert wuerde beim Kanonisieren
     verschwinden und damit aus dem Hash fallen (T-25). */
  invariant(ownEnumerable(record, "finalDecision"),
    "finalDecision muss eine eigene, aufzaehlbare Eigenschaft sein");
  invariant(ownEnumerable(record, "state"),
    "state muss eine eigene, aufzaehlbare Eigenschaft sein");

  /* Zustand. */
  /* Speicherbar sind abgeschlossene Datensaetze UND der wartende Zustand
     PENDING_QA. Letzterer traegt keinen Genehmiger und kein Ergebnis; er
     ist die Erfassung ohne Freigabe. */
  const wartend = record.state === LIFECYCLE_STATE.PENDING_QA;
  invariant(wartend
    || (TERMINAL_STATES.includes(record.state) && record.state !== LIFECYCLE_STATE.NOT_VERIFIED),
  `Nur abgeschlossene oder wartende Datensaetze werden gespeichert; vorliegend ${record.state}`);
  if (wartend) {
    invariant(record.approvedBy === null, "Ein wartender Datensatz darf keinen Genehmiger tragen");
    /* Die BEURTEILUNG eines Schadensverdachts ist die eine Ausnahme: sie
       wartet weiter auf die Entscheidung und MUSS trotzdem an die
       gepruefte Revision gebunden sein — sonst waere sie eine freischwebende
       Aussage ueber eine Pruefung, die niemand mehr zuordnen kann.
       Ein wartender Datensatz OHNE diese Kennzeichnung bindet nach wie vor
       nichts. */
    invariant(record.approvalRevisionHash === null || istKlaerungsschritt(record),
      "Ein wartender Datensatz bindet noch keine Revision");
  }


  invariant(record.finalDecision === FINAL_RESULT[record.state],
    `finalDecision ${record.finalDecision} passt nicht zum Zustand ${record.state}`);

  /* Pruefpunkte je Foto und aggregiert. */
  validateCheckpointList(record.checkpoints, "aggregiert");
  for (const photo of record.photos) {
    validateCheckpointList(photo?.result?.checkpoints, `Foto ${photo?.id}`);
    invariant(hasCaptureProfile(photo?.captureProfile),
      `Aufnahmeprofil fehlt oder ist unvollstaendig (Foto ${photo?.id})`);
  }

  /* Widerspruchsfreiheit zwischen Foto-, Auto-, Final- und
     Systementscheidung (T-24). Ein aggregierter Punkt darf nie besser sein
     als der schlechteste Einzelpunkt — Worst-Result-Wins. */
  const RANG = { [STATUS.PASS]: 0, [STATUS.NOT_ASSESSABLE]: 1, [STATUS.FAIL]: 2 };
  for (const id of CHECKPOINT_IDS) {
    const einzeln = record.photos
      .map(photo => photo.result.checkpoints.find(item => item.id === id))
      .filter(Boolean);
    const schlechtester = einzeln.reduce((a, b) => (RANG[b.status] > RANG[a.status] ? b : a));
    const aggregiert = record.checkpoints.find(item => item.id === id);
    invariant(RANG[aggregiert.status] >= RANG[schlechtester.status],
      `Aggregiertes Ergebnis ist besser als der schlechteste Einzelbefund: ${id}`);
  }

  /* Retakes und Handlungsarten. */
  const retakes = Array.isArray(record.retakes) ? record.retakes : [];
  for (const retake of retakes) {
    const pruefung = validateRetakeRecord(retake);
    invariant(pruefung.valid, `Retake-Datensatz ungueltig: ${pruefung.error}`);
    invariant(retake.eqId === record.eqId && retake.zoneId === record.zoneId,
      "Retake gehoert zu einem anderen Equipment oder einer anderen Zone");
  }

  /* Manuelle Feststellungen. */
  const manualFindings = Array.isArray(record.manualFindings) ? record.manualFindings : [];
  for (const finding of manualFindings) {
    const pruefung = validateManualFinding(finding);
    invariant(pruefung.valid, `Manuelle Feststellung ungueltig: ${pruefung.error}`);
  }
  /* Ein gemeldeter Schadensverdacht ohne dokumentierte Beurteilung
     verhindert jeden positiven Abschluss — auch beim direkten Aufruf.
     Die Sperre steht HIER und nicht nur im Lebenszyklus: saveInspection
     ist die Sicherheitsgrenze, und die Oberflaeche kann umgebaut werden. */
  const verdachtspruefung = pruefeSchadensverdachte(record);
  invariant(verdachtspruefung.valid, verdachtspruefung.error);

  /* Known-Issue-Zuordnungen: nur manuell, nur QA Manager. */
  const assignments = Array.isArray(record.knownIssueAssignments) ? record.knownIssueAssignments : [];
  for (const assignment of assignments) {
    const pruefung = validateKnownIssueAssignment(assignment);
    invariant(pruefung.valid, `Known-Issue-Zuordnung ungueltig: ${pruefung.error}`);
  }

  /* Eine tolerierte Auffaelligkeit ohne QA-Zuordnung ist nicht speicherbar.
     Befund der Gegenpruefung an …mehrwinkel.2: `applyToleratedScratch`
     macht in der Anzeige aus einem Kratzer-FAIL ein PASS, aber die
     Oberflaeche reichte keine `knownIssueAssignments` weiter. Damit blieb
     `collectQaTriggers` leer, es entstand kein KNOWN_ISSUE_ACTIVE, und die
     Pruefung war als FINAL_PASS abschliessbar — die QA erfuhr nichts.

     Die Sperre steht hier und nicht in der Oberflaeche: `saveInspection`
     ist die Sicherheitsgrenze. Wird die Oberflaeche spaeter umgebaut,
     traegt sie trotzdem. */
  const allePunkte = [
    ...(record.checkpoints || []),
    ...record.photos.flatMap(photo => photo?.result?.checkpoints || []),
  ];
  const toleriert = allePunkte.filter(item => item?.code === KNOWN_ISSUE_TOLERATED);
  /* Die Sperre gilt fuer den ABSCHLUSS, nicht fuer die Uebergabe. Ein
     wartender Datensatz ist genau das Mittel, mit dem der Operator einen
     unbestaetigten Befund an die QA weiterreicht — ihn hier abzuweisen
     erzeugte die Sackgasse, die die Gegenpruefung an rc.4.10 gefunden hat:
     der Operator konnte weder abschliessen noch uebergeben. Der QA-Trigger
     KNOWN_ISSUE_UNCONFIRMED sorgt dafuer, dass der Vorgang QA-pflichtig
     bleibt und nicht still durchlaeuft. */
  invariant(wartend || toleriert.length === 0 || assignments.length > 0,
    "Known-Issue-Toleranz ohne QA-Zuordnung: "
    + `${toleriert.map(item => item.id).join(", ")} steht auf PASS, `
    + "aber es liegt keine knownIssueAssignment vor");

  /* Kratzerbefunde: nur der eine automatische Status, niemals eine
     numerische Tiefe. */
  for (const finding of (record.scratchFindings || [])) {
    invariant(finding?.status === SCRATCH_STATUS.DETECTED_ORIGIN_UNDETERMINED,
      `Unzulaessiger automatischer Kratzerstatus: ${finding?.status}`);
    /* Der Tiefenzustand wird NACHGERECHNET, nicht geglaubt. Ein Datensatz
       darf WITHIN_LIMIT nur tragen, wenn die beigelegte Messung das auch
       ergibt — sonst stuende in der Akte ein Urteil ohne die Messung, die
       es traegt. */
    invariant(depthStatusMatchesMeasurement(finding),
      `depthStatus "${finding.depthStatus}" folgt nicht aus der beigelegten `
      + "Messung (Messwert, Messmittel, Messunsicherheit, unabhaengige Quelle)");
    invariant(!rejectsNumericDepth(finding),
      "Tiefenangabe ohne vollstaendige unabhaengige Messung ist nicht zulaessig");
  }

  /* Tiefenmessungen: jede gehoert an genau EINEN Befund, ist vollstaendig,
     und traegt kein Urteil.

     Die Bindung ist keine Formalie. Eine Messung ohne Kandidaten-Kennung
     sagt "irgendwo an diesem Teil ist es 0,85 um tief" — das ist bei
     mehreren Riefen im Bild keine Aussage, sondern eine Verwechslung, die
     spaeter niemand mehr aufloesen kann. */
  for (const messung of (record.depthMeasurements || [])) {
    invariant(Boolean(messung?.photoId), "Tiefenmessung ohne Foto-Bindung");
    /* GENAU EIN Bindungsweg. Beide gesetzt hiesse, die Stelle sei zugleich
       erkannt und uebersehen worden; keiner gesetzt hiesse "irgendwo an
       diesem Teil". */
    const anKandidat = Boolean(messung?.kandidatId);
    const anMarker = Boolean(messung?.markerId);
    invariant(anKandidat !== anMarker,
      "Tiefenmessung braucht GENAU eine Bindung: Kandidaten-Kennung (vom "
      + "Detektor gefunden) ODER Marker-Kennung (vom Pruefer manuell "
      + `gesetzt) — vorgefunden: kandidatId ${messung?.kandidatId ?? "—"}, `
      + `markerId ${messung?.markerId ?? "—"}`);
    /* BEIDE Bindungen muessen auf etwas zeigen, das es auf DIESEM Foto
       gibt. Bis rc.4.35 wurde nur die Marker-Kennung geprueft; eine
       erfundene Kandidaten-Kennung ging durch und wurde anschliessend als
       "vom Detektor erkannt" gezaehlt.

       Das umgeht keine Freigabesicherung — es verfaelscht die Kennzahl,
       um die es in der Messkampagne geht: ein UEBERSEHENER Befund kann
       dann als erkannt erscheinen, und die Verfehlungsrate ist geschoent,
       ohne dass es auffaellt. Befund der Gegenpruefung vom 16.09.2026,
       zutreffend und sperrend. */
    if (anMarker) {
      const foto = (record.photos || []).find(f => f?.id === messung.photoId);
      invariant((foto?.markers || []).some(mk => mk?.id === messung.markerId),
        `Marker-Kennung ${messung.markerId} existiert nicht auf Foto `
        + `${messung.photoId}`);
      /* AUSSERHALB DER PRUEFFLAECHE wird GEPRUEFT, nicht geglaubt.
         Befund der Gegenpruefung an rc.4.40: eine Messung an einem Marker
         ausserhalb des bewerteten Ausschnitts liess sich speichern und
         zaehlte anschliessend als uebersehene Grenzueberschreitung — an
         einer Stelle, die ausdruecklich nicht untersucht wurde.

         Das Kennzeichen steht im Datensatz, damit die Bilanz es lesen
         kann. Es darf aber nicht BEHAUPTBAR sein: wer es weglaesst,
         koennte eine ausgeschlossene Stelle als uebersehenen Befund
         zaehlen lassen; wer es faelschlich setzt, koennte einen echten
         uebersehenen Befund verschwinden lassen. Beides waere eine
         geschoente Kennzahl. Geprueft wird deshalb gegen die Geometrie. */
      const flaeche = foto?.result?.inspectionArea || null;
      const markerPunkt = (foto?.markers || []).find(mk => mk?.id === messung.markerId);
      if (flaeche && markerPunkt) {
        const tatsaechlichDraussen = !markerInFlaeche(markerPunkt, flaeche);
        invariant(Boolean(messung.ausserhalbFlaeche) === tatsaechlichDraussen,
          `Kennzeichen "ausserhalb der Prueffläche" stimmt nicht mit der `
          + `Geometrie ueberein (Marker ${messung.markerId} liegt `
          + `${tatsaechlichDraussen ? "ausserhalb" : "innerhalb"}, `
          + `gekennzeichnet als ${messung.ausserhalbFlaeche ? "ausserhalb" : "innerhalb"}). `
          + "Ein falsches Kennzeichen verschiebt die Zahl der uebersehenen "
          + "Befunde in die eine oder andere Richtung.");
      }
    }
    if (anKandidat) {
      const bindung = pruefeKandidatenbindung(record, messung);
      invariant(bindung.valid, bindung.error);
    }
    invariant(istSpeicherbar(messung),
      "Unvollstaendige Tiefenmessung: Messwert, Einheit, Messmittel, "
      + "Messunsicherheit, Zeitpunkt, ausfuehrende Person und eine bekannte "
      + `Herkunft sind Pflicht (fehlt: ${evaluateDepthMeasurement(messung).missing.join(", ") || "Herkunft unbekannt"})`);
    /* Ein mitgeliefertes Urteil wird nicht uebernommen, sondern abgewiesen:
       es wird beim Anzeigen gerechnet. Stuende es im Datensatz, koennte es
       von seinen eigenen Feldern abweichen. */
    invariant(messung.decision === undefined,
      "Tiefenmessungen tragen kein Urteil im Datensatz — es wird aus den "
      + "Messangaben gerechnet");
  }

  /* Der QA-Trigger wird aus den dokumentierten Handlungen abgeleitet, nicht
     vom Aufrufer behauptet. Ein angelieferter Trigger, der nicht aus den
     Daten folgt, wird abgewiesen. */
  const abgeleitet = collectQaTriggers({
    retakes, manualFindings, knownIssueAssignments: assignments,
    /* DIESELBE Ableitung wie im Erzeuger: eine unbestaetigte Toleranz ist
       ein QA-Grund. Ohne sie zaehlte die Grenze anders als der Erzeuger
       und wies dessen Datensatz ab. */
    unconfirmedTolerations: assignments.length ? [] : toleriert,
  });
  invariant((record.qaTriggers || []).length === abgeleitet.length,
    `QA-Trigger im Datensatz (${(record.qaTriggers || []).length}) stimmen nicht `
    + `mit den dokumentierten Handlungen (${abgeleitet.length}) ueberein`);

  /* Der Zustandsuebergang. Hier greifen Rolle, Reauthentifizierung,
     Vier-Augen-Prinzip und die Sperrwirkung offener Pflichtpunkte. */
  const uebergang = evaluateTransition({
    /* Der Ausgangszustand kommt aus dem GESPEICHERTEN Vorgaenger, nicht aus
       dem behaupteten previousState des Antrags. Bis rc.4.10 genuegte
       previousState = "DRAFT", um die Rollensperre auszuhebeln — der
       referenzierte Datensatz stand weiter auf PENDING_QA. Befund der
       Gegenpruefung an rc.4.10, zutreffend. */
    from: vorgaengerZustand || record.previousState || LIFECYCLE_STATE.DRAFT,
    to: record.state,
    actor,
    performedBy: record.performedBy,
    approvedBy: record.approvedBy,
    reauthenticated: record.reauthenticated === true,
    checkpoints: record.checkpoints,
    hasDeviation: hasDeviation(abgeleitet),
    /* Bei einer nachgereichten Freigabe traegt die QA ihre Begruendung in
       `approvalComment`; `comment` gehoert dem Pruefer und ist gebunden. */
    comment: record.comment || record.approvalComment,
    overrideReason: record.overrideReason,
    approvalRevisionHash: record.approvalRevisionHash,
    currentRevisionHash: record.revisionHash,
    unresolvedAiConflicts: record.aiCrosscheck?.unresolvedConflicts ?? 0,
    integrityViolation: false,
    manualFindings: record.manualFindings,
    /* Der Beurteilungsschritt behaelt seinen Zustand. Nur mit dieser
       Kennzeichnung laesst die Zustandsmaschine ihn zu. */
    clarification: istKlaerungsschritt(record),
  });
  invariant(uebergang.allowed, `Zustandsuebergang abgewiesen (${uebergang.code}): ${uebergang.message}`);

  /* Der Pruefer ist immer gesetzt und ist der Unterzeichner der Pruefung. */
  invariant(record.performedBy?.username, "performedBy fehlt");
}

export async function saveInspection(record, actor) {
  /* Nachgereichte Freigabe: die Bindung an die gepruefte Revision.

     Bis …mehrwinkel.3 stand hier nichts — `revisionHash` war fest null und
     die Pruefung in lifecycle.js lief nur, wenn beide Werte gesetzt waren.
     Die behauptete Bindung existierte also nicht.

     Jetzt gilt: eine Freigabe, die auf einen erfassten Datensatz zeigt,
     muss dessen GESPEICHERTEN recordHash nennen. Hat sich daran etwas
     geaendert, zeigt die Freigabe ins Leere und wird abgewiesen. */
  /* Ein QA-pflichtiger Abschluss MUSS auf eine gepruefte Revision zeigen.

     Bis rc.4.9 lief die gesamte Inhaltspruefung nur `if (record.supersedesId)`.
     Wer den Bezug auf null setzte, umging sie vollstaendig — ein
     PASS_AFTER_REMEDIATION war damit frei erfindbar. Befund der
     Gegenpruefung an rc.4.9, zutreffend.

     Damit gibt es keinen "Sofortfreigabepfad" mehr, der an der Bindung
     vorbeifuehrt: auch wenn die QA daneben steht, entsteht zuerst der
     wartende Datensatz und dann die Freigabe darauf. Ein Sonderfall
     weniger ist eine Umgehung weniger. */
  const qaPflichtigerAbschluss = record.approvedBy?.username
    || record.state === LIFECYCLE_STATE.PASS_AFTER_REMEDIATION
    || record.state === LIFECYCLE_STATE.RELEASED_WITH_DEVIATION;
  if (qaPflichtigerAbschluss) {
    invariant(typeof record.supersedesId === "string" && record.supersedesId.length > 0,
      "Revisionsbezug fehlt: ein QA-pflichtiger Abschluss muss auf die "
      + "gepruefte wartende Revision zeigen (supersedesId)");
    invariant(typeof record.approvalRevisionHash === "string"
      && record.approvalRevisionHash.length === 64,
    "Revisionsbezug unvollstaendig: approvalRevisionHash fehlt oder ist ungueltig");
  }

  let vorgaengerZustand = null;
  if (record.supersedesId) {
    const vorhandene = await loadInspections();
    const bezug = vorhandene.find(item => item.id === record.supersedesId);
    vorgaengerZustand = bezug?.state ?? null;
    invariant(bezug, `Freigabe verweist auf einen unbekannten Datensatz: ${record.supersedesId}`);
    invariant(bezug.state === LIFECYCLE_STATE.PENDING_QA,
      `Freigegeben werden kann nur ein wartender Datensatz; ${record.supersedesId} steht auf ${bezug.state}`);
    invariant(typeof record.approvalRevisionHash === "string"
      && record.approvalRevisionHash === bezug.recordHash,
    "QA-Entscheid ist nicht an die gepruefte Revision gebunden: "
    + `erwartet ${bezug.recordHash}, angegeben ${record.approvalRevisionHash}`);

    /* Der Hash allein bindet nur sich selbst. Befund der Gegenpruefung an
       rc.4.7: eine Freigabe konnte auf den richtigen Hash zeigen und
       trotzdem Inhalte austauschen.

       Bis rc.4.8 stand hier eine von Hand gepflegte Liste der zu
       vergleichenden Felder — und sie war unvollstaendig: `aiCrosscheck`
       und `scratchFindings` fehlten, ein offener KI-Widerspruch und ein
       dokumentierter Kratzerbefund konnten also doch verschwinden.

       Jetzt wird die KANONISCHE PROJEKTION verglichen: alles ausser den
       Feldern, die eine Freigabe aendern DARF. Ein spaeter hinzugefuegtes
       Feld ist damit automatisch geschuetzt, statt bis zur naechsten
       Gegenpruefung offen zu stehen. */
    /* BEFUND D: eine BEURTEILUNG aendert den Inhalt — genau das, was
       einer Freigabe verboten ist. Beide Schreibvorgaenge kommen hier an,
       und sie duerfen nicht dieselbe Regel bekommen.

       Die Beurteilung nimmt `manualFindings` aus dem Projektionsvergleich
       heraus und bekommt dafuer eine EIGENE, engere Regel: nur `klaerung`,
       nur an einer bereits gemeldeten Stelle, nur wo noch keine steht
       (pruefeKlaerungsDelta). Die Freigabe bleibt unveraendert streng —
       Q13 haelt das fest. */
    const klaerungsschritt = istKlaerungsschritt(record);
    const projektion = klaerungsschritt ? clarificationProjection : approvalProjection;
    const projektionBezug = canonicalize(projektion(bezug));
    const projektionFreigabe = canonicalize(projektion(record));
    if (projektionBezug !== projektionFreigabe) {
      const abweichend = Object.keys(projektion(bezug) || {})
        .filter(feld => JSON.stringify(record[feld] ?? null) !== JSON.stringify(bezug[feld] ?? null));
      const zusaetzlich = Object.keys(projektion(record) || {})
        .filter(feld => !(feld in (bezug || {})));
      const felder = [...abweichend, ...zusaetzlich.map(f => `${f} (neu)`)].join(", ")
        || "kanonische Projektion";
      invariant(false, klaerungsschritt
        ? `Die Beurteilung veraendert mehr als die Antwort: ${felder}. `
          + "Eine Beurteilung beantwortet eine gemeldete Stelle, sie ist keine neue Pruefung."
        : `QA-Entscheid weicht im Inhalt von der geprueften Revision ab: ${felder}. `
          + "Ein QA-Entscheid ist eine Ableitung, keine neue Pruefung.");
    }
    if (klaerungsschritt) {
      const delta = pruefeKlaerungsDelta(bezug, record);
      invariant(delta.valid, delta.error);
    }

    /* Genau EINE wirksame Freigabe je wartender Revision. Ohne diese
       Sperre liessen sich zwei eigenstaendige Freigaben auf denselben
       Datensatz schreiben — beide gueltig, mit verschiedenen Ergebnissen. */
    /* Die Meldung sagt ENTSCHIEDEN, nicht "freigegeben": der bestehende
       Entscheid kann eine Sperrung sein. Bis rc.4.15 behauptete sie ueber
       einer Sperrung eine Freigabe - dieselbe Unwahrheit, die im PDF
       "Freigabe zu" ueber einen Sperrentscheid schrieb. Befund aus dem
       Bedienlauf vom 11.09.2026; belegt durch S49. */
    const schonEntschieden = vorhandene.find(item =>
      item.supersedesId === record.supersedesId && item.id !== record.id);
    invariant(!schonEntschieden,
      `Fuer diese Revision liegt bereits ein QA-Entscheid vor `
      + `(${schonEntschieden?.id}); ein zweiter Entscheid ist nicht zulaessig`);
  }
  /* Ein wartender Datensatz ist erfasst, aber nicht freigegeben: er traegt
     ausdruecklich KEIN Ergebnis. Jeder andere speicherbare Zustand muss
     eines tragen. */
  invariant(record && (record.state === LIFECYCLE_STATE.PENDING_QA
    ? record.finalDecision === null
    : ["PASS", "FAIL", "OVERRIDE", "PASS_AFTER_REMEDIATION"].includes(record.finalDecision)),
  record?.state === LIFECYCLE_STATE.PENDING_QA
    ? "Ein wartender Datensatz darf kein Ergebnis tragen"
    : "Ungueltige finale Entscheidung");
  invariant(record.user?.username === actor?.username, "Unterzeichner und aktiver Benutzer stimmen nicht ueberein");
  invariant(record.signature?.signedBy === actor?.username, "Signatur ist keinem aktiven Benutzer zugeordnet");
  invariant(record.signature?.signedAt === record.signedAt, "Signatur-Zeitstempel ist nicht an den Datensatz gebunden");
  /* RC4.3: die Signatur besteht aus zwei Identifikationskomponenten
     (Benutzerkennung und Passwort), nicht aus einer Zeichnung. */
  invariant(validElectronicSignature(record.signature),
    "Elektronische Signatur unvollstaendig: Verfahren, beide Identifikationskomponenten, "
    + "Unterzeichner, Zeitpunkt und Bedeutung sind erforderlich");
  /* Der wartende Datensatz traegt keine Freigabe, also auch nicht deren
     Bedeutung. §11.50 verlangt, dass die Bedeutung zur Handlung passt —
     hier ist die Handlung das Erfassen, nicht das Freigeben. */
  /* Die Beurteilung ist eine dritte Handlung. §11.50 verlangt, dass die
     Bedeutung sie NENNT — weder "Freigabe" noch "Pruefung erfasst" trifft
     zu, also traegt sie ihren eigenen Wortlaut. */
  const expectedMeaning = record.state === LIFECYCLE_STATE.PENDING_QA
    ? (istKlaerungsschritt(record) ? KLAERUNG_MEANING : "Pruefung erfasst, Freigabe ausstehend")
    : {
      PASS: "Freigabe", FAIL: "Sperrung", OVERRIDE: "Override-Freigabe",
      PASS_AFTER_REMEDIATION: "Freigabe nach Massnahme",
    }[record.finalDecision];
  invariant(record.signature.meaning === expectedMeaning, "Signaturbedeutung passt nicht zur Entscheidung");
  invariant(Array.isArray(record.photos) && record.photos.length >= 1 && record.photos.length <= 10, "Es sind 1 bis 10 Fotos erforderlich");
  invariant(record.photoCount === record.photos.length, "Fotozaehler stimmt nicht mit dem Datensatz ueberein");
  invariant(record.photos.every(photo => (photo.markers || []).length <= 5), "Mehr als 5 Marker in einem Foto");
  invariant(record.photos.reduce((sum, photo) => sum + (photo.markers || []).length, 0) <= 20, "Mehr als 20 Marker in einer Pruefung");
  invariant(record.photos.every(photo => String(photo.image || "").startsWith("data:image/") && imageBytes(photo.image) <= 1024 * 1024), "Prueffoto fehlt oder ueberschreitet 1 MB");
  invariant((record.swabTest?.photos || []).every(photo => String(photo.image || "").startsWith("data:image/") && imageBytes(photo.image) <= 1024 * 1024), "Wischtestfoto fehlt oder ueberschreitet 1 MB");
  invariant(record.photos.every(photo => photo.result?.dry && photo.result?.clean && photo.result?.intact), "Fotoanalyse ist unvollstaendig");
  invariant(record.originalSystemDecision?.status, "Originale Systementscheidung fehlt");
  /* Bei einer nachgereichten Freigabe darf `comment` NICHT geaendert werden
     — er gehoert zur geprueften Revision und ist durch die kanonische
     Projektion gebunden. Die Begruendung der QA steht deshalb in einem
     eigenen Feld `approvalComment`, das die Freigabe setzen darf. Ohne
     diese Trennung koennte eine QA entweder gar nicht sperren oder den
     Kommentar des Pruefers ueberschreiben. */
  if (record.finalDecision === "FAIL") {
    invariant(String(record.comment || "").trim().length > 0
      || String(record.approvalComment || "").trim().length > 0,
    "FAIL erfordert einen Massnahmenkommentar");
  }
  if (record.originalSystemDecision.status === "FAIL") invariant(record.finalDecision !== "PASS", "Ein System-FAIL darf nur als OVERRIDE freigegeben werden");
  if (record.finalDecision === "OVERRIDE") {
    invariant(record.originalSystemDecision.status === "FAIL", "Override ist nur fuer ein System-FAIL zulaessig");
    invariant(record.originalSystemDecision.reason !== "CRITICAL_LIGHT", "Kritische Beleuchtung darf nicht ueberstimmt werden");
    invariant(String(record.overrideReason || "").trim().length >= 10, "Override erfordert mindestens 10 Zeichen Begruendung");
  }
  validateRc4Contract(record, actor, vorgaengerZustand);
  await validateRecordHash(record);

  /* Schnappschuss-Schutz (T-26). Ab hier wird ausschliesslich mit einer
     tiefen Kopie gearbeitet. Mutiert der Aufrufer sein Objekt waehrend des
     Speichervorgangs, veraendert das den gespeicherten Datensatz nicht —
     und der Hash bleibt der gepruefte. */
  const snapshot = structuredClone(record);
  invariant(await recordDigest(snapshot) === record.recordHash,
    "Schnappschuss weicht vom geprueften Datensatz ab");

  return commitWithAudit({
    storeName: "inspections",
    id: snapshot.id,
    value: snapshot,
    kind: "INSPECTION_SIGNED",
    actor,
    insertOnly: true,
    payload: {
      inspectionId: snapshot.id,
      originalDecision: snapshot.originalSystemDecision,
      finalDecision: snapshot.finalDecision,
      state: snapshot.state,
      performedBy: snapshot.performedBy ?? null,
      approvedBy: snapshot.approvedBy ?? null,
      comment: snapshot.comment,
      overrideReason: snapshot.overrideReason,
      photoCount: snapshot.photoCount,
      markerCount: (snapshot.photos || []).reduce((sum, photo) => sum + (photo.markers || []).length, 0),
      swabPerformed: Boolean(snapshot.swabTest),
      qaTriggerCount: (snapshot.qaTriggers || []).length,
      /* Die Beurteilung eines Schadensverdachts gehoert in die Auditkette,
         und zwar als solche: ohne diese beiden Felder sähe ein Pruefer nur
         einen weiteren wartenden Datensatz und muesste aus dem Inhalt
         erraten, was geschehen ist. */
      supersedesId: snapshot.supersedesId ?? null,
      clarification: snapshot.clarification ?? null,
      recordHash: snapshot.recordHash,
    },
    /* Genau EIN finaler Integritaetsanker je finaler Datensatzrevision.
       Keine Inspektion ohne Anker, kein verwaister Anker. */
    extraEvents: [{
      kind: LIFECYCLE_EVENT.FINAL_ANCHOR,
      payload: {
        inspectionId: snapshot.id,
        revisionHash: snapshot.revisionHash ?? snapshot.recordHash,
        state: snapshot.state,
        finalResult: FINAL_RESULT[snapshot.state],
      },
    }],
  });
}

/* ── Integritaet beim Laden ────────────────────────────────────────────────
   Eine beschaedigte oder unlesbare Audit-Ablage darf nicht abstuerzen und
   darf keinen Datensatz als verifiziert ausweisen (T-D1). Sie fuehrt nach
   NOT_VERIFIED — sichtbar, ohne gruene Auditmeldung.                       */

export async function loadInspectionsVerified() {
  let inspections = [];
  let verification = { ok: false, reason: "unread" };
  let anchors = { ok: false, problems: [{ code: "AUDIT_UNREADABLE" }] };

  try {
    inspections = await loadInspections();
  } catch (error) {
    return { inspections: [], verification: { ok: false, reason: "inspections_unreadable" },
      anchors, error: String(error?.message || error) };
  }
  try {
    const events = await loadAuditEvents();
    verification = await verifyAuditChain(events);
    anchors = verifyAnchors(events, inspections.map(item => ({
      id: item.id, state: item.state, finalRevisionHash: item.revisionHash ?? item.recordHash,
    })));
  } catch (error) {
    /* Kein Absturz. Kein Datensatz gilt als verifiziert. */
    return {
      inspections: inspections.map(item => ({ ...item, state: LIFECYCLE_STATE.NOT_VERIFIED })),
      verification: { ok: false, reason: "audit_unreadable" },
      anchors, error: String(error?.message || error),
    };
  }

  const gesamtOk = verification.ok && anchors.ok;
  const problemeNachId = new Map();
  for (const problem of anchors.problems) {
    if (problem.inspectionId) problemeNachId.set(problem.inspectionId, problem);
  }

  return {
    inspections: await Promise.all(inspections.map(async item => {
      /* Der Datensatz-Hash wird beim Laden erneut gerechnet. Eine
         nachtraegliche Manipulation faellt hier auf (T-27). */
      let hashOk = false;
      try {
        hashOk = await recordDigest(item) === item.recordHash;
      } catch { hashOk = false; }
      const eigenesProblem = problemeNachId.get(item.id);
      const unversehrt = gesamtOk && hashOk && !eigenesProblem;
      return {
        ...item,
        state: unversehrt
          ? stateAfterIntegrityCheck(item, verification)
          : LIFECYCLE_STATE.NOT_VERIFIED,
        integrity: {
          ok: unversehrt,
          recordHashOk: hashOk,
          auditChainOk: verification.ok,
          anchorProblem: eigenesProblem?.code ?? null,
        },
      };
    })),
    verification,
    anchors,
    error: null,
  };
}

export async function saveIssue(issue, actor, action = "KNOWN_ISSUE_CREATED") {
  invariant(actor?.role === "QA Manager", "Known Issues duerfen nur durch QA Manager geaendert werden");
  invariant(TOLERABLE_ISSUE_TYPES.includes(issue?.issueType), "Ungueltiger Known-Issue-Typ");
  invariant(TOLERABLE_INTACT_CODES.includes(issue?.originalIntactCode), "Nur ein Kratzerurteil darf toleriert werden");
  invariant(Array.isArray(issue?.zones) && issue.zones.length > 0 && issue.zones.every(zone => zone.kind === "scratch"), "Lokalisierte Kratzerzone fehlt");
  const signature = action === "KNOWN_ISSUE_CREATED" ? issue.signature : issue.actions?.at(-1)?.signature;
  invariant(validElectronicSignature(signature), "Gueltige elektronische QA-Signatur fehlt");
  await validateRecordHash(issue);
  return commitWithAudit({
    storeName: "issues",
    id: issue.id,
    value: issue,
    kind: action,
    actor,
    payload: { issueId: issue.id, status: issue.status, validUntil: issue.validUntil, issueType: issue.issueType },
  });
}

export async function saveReference(reference, actor) {
  invariant(["QA Manager", "Administrator"].includes(actor?.role), "Referenzbilder duerfen nur durch QA oder Administration gespeichert werden");
  invariant(reference?.image && reference?.eqId && reference?.zoneId, "Referenzbild oder Zuordnung fehlt");
  invariant(String(reference.image).startsWith("data:image/") && imageBytes(reference.image) <= 1024 * 1024, "Referenzbild ueberschreitet 1 MB");
  await validateRecordHash(reference);
  return commitWithAudit({
    storeName: "references",
    id: reference.id,
    value: reference,
    kind: "REFERENCE_SAVED",
    actor,
    payload: { referenceId: reference.id, eqId: reference.eqId, zoneId: reference.zoneId },
  });
}

export async function exportReadableData() {
  const [inspections, issues, references, audit] = await Promise.all([
    loadInspections(), loadIssues(), loadReferences(), loadAuditEvents(),
  ]);
  return {
    /* Schema- und Datenbankkennung bleiben bewusst unveraendert: sie
       identifizieren das FORMAT, nicht die Anwendungsversion. Ein Umbenennen
       wuerde bestehende RC1/RC2-Daten unlesbar machen. Die Anwendungsversion
       steht daneben in appVersion. */
    schema: "visuclean-export-v8.2",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    inspections,
    issues,
    references,
    audit,
    auditVerification: await verifyAuditChain(audit),
  };
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage || 0, quota: estimate.quota || 0, remaining: Math.max(0, (estimate.quota || 0) - (estimate.usage || 0)) };
}
