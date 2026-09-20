const CACHE = "visuclean-v8.3.0-rc.4.45-camera.1";

/* Zeitlimit fuer den Netzversuch beim Laden des Dokuments, danach greift
   der Cache.

   STELLWERT, nicht validiert. Er beeinflusst kein Urteil, keine
   Reihenfolge und keinen Befund — nur wie lange auf das Netz gewartet
   wird, bevor die zwischengespeicherte Fassung startet.

   Warum es ihn ueberhaupt braucht: halb offenes oder sehr langsames WLAN
   ist in der Produktion der Normalfall, nicht die Ausnahme. Ohne
   Zeitlimit tauschte man einen stillen Altstand gegen eine App, die gar
   nicht erst startet — das waere der schlechtere Handel. */
const DOKUMENT_NETZ_MS = 2000;
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/VisuClean_QR_Etiketten_A4.html"];

async function applicationFiles() {
  const response = await fetch("/index.html", { cache: "no-store" });
  if (!response.ok) throw new Error(`index ${response.status}`);
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => new URL(match[1], self.location.origin))
    .filter(url => url.origin === self.location.origin)
    .map(url => `${url.pathname}${url.search}`);
  return [...new Set([...CORE, ...paths])];
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = await applicationFiles().catch(() => CORE);
    await cache.addAll(files);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("visuclean-") && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

/* Laeuft das Versprechen nicht binnen ms durch, wird null geliefert.
   Das urspruengliche Versprechen wird NICHT abgebrochen — eine spaet
   eintreffende Antwort landet dann einfach nirgends, statt einen Abbruch
   zu erzeugen, den der Aufrufer als Fehler behandeln muesste. */
function mitZeitlimit(versprechen, ms) {
  let uhr;
  const frist = new Promise(fertig => { uhr = setTimeout(() => fertig(null), ms); });
  return Promise.race([versprechen, frist]).finally(() => clearTimeout(uhr));
}

/* Zwei Wege, mit Absicht.

   DOKUMENT (request.mode === "navigate"): Netz zuerst, Cache als
   Rueckfall. Bis rc.4.22 war auch das Dokument Cache zuerst — mit der
   Folge, dass nach jeder Auslieferung genau eine Sitzung still die
   VORVERSION bekam. Aufgefallen ist es erst am Geraet: die frisch
   ausgelieferte Preview zeigte rc.4.21, waehrend jede Textpruefung gruen
   war. Das trennt "freigegeben" von "in Benutzung", ohne dass es jemand
   von innen erkennen kann — und ein verschleierter Zustand verstoesst
   gegen Leitplanke 10.

   Die Offline-Zusage bleibt dabei unberuehrt: ohne Netz schlaegt der
   Versuch fehl (oder laeuft ins Zeitlimit) und der Cache traegt. V40 und
   V42 halten das fest.

   ALLES ANDERE: Cache zuerst, unveraendert. Die Bauartefakte tragen einen
   Inhalts-Hash im Dateinamen — ein altes Bundle unter altem Namen ist nie
   die falsche Datei, und ein Netzabruf dafuer waere reiner Aufwand (V41).

   Kein Widerspruch zu Leitplanke 1: verboten ist der stille
   Netzwerk-Fallback fuer Bild- und Analysedaten. Hier wird die eigene
   index.html von derselben Origin geholt, ohne Nutzlast; Fremd-Origins
   sind zwei Zeilen weiter oben ausgeschlossen. */
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (request.mode === "navigate") {
      try {
        const frisch = await mitZeitlimit(fetch(request), DOKUMENT_NETZ_MS);
        if (frisch && frisch.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, frisch.clone());
          return frisch;
        }
      } catch { /* kein Netz — der Cache traegt, siehe unten */ }
      const hinterlegt = await caches.match(request) || await caches.match("/index.html");
      if (hinterlegt) return hinterlegt;
      return fetch(request);
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    /* Nicht abgefangen: fuer eine Datei, die weder im Cache noch im Netz
       liegt, ist der Fehler die richtige Antwort. Ihn hier zu schlucken
       hiesse, dem Aufrufer etwas vorzumachen. */
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
