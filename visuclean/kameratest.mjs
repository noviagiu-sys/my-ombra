/* Echte MultiCapture-Komponente mit kontrollierten Medien-APIs in jsdom.
   Prueft Bedienung und Verdrahtung, keine optische Erkennungsleistung. */
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLCanvasElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.localStorage = dom.window.localStorage;
const { createRoot } = await import("react-dom/client");
const vite = await createServer({ root: process.env.VISUCLEAN_TEST_ROOT || process.cwd(), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const checks = [];
const ok = (name, passed) => { checks.push(passed); console.log(`${passed ? "BESTANDEN" : "DURCHGEFALLEN"} ${name}`); };
let root;
try {
  const { MultiCapture } = await vite.ssrLoadModule("/src/App.jsx");
  const { translator } = await vite.ssrLoadModule("/src/i18n.js");
  const t = translator("de");
  let photos, starts, encodes, dimensions, resolveStart, rejectStart, track, stream, settings;
  let failSetting = false;
  let deferStart = false;
  let failPlay = false;
  let supported = true;
  const createStream = () => {
    settings = { zoom: 1, torch: false };
    track = new dom.window.EventTarget();
    Object.assign(track, {
      readyState: "live", muted: false, enabled: true, stops: 0,
      stop() { this.stops++; this.readyState = "ended"; },
      getSettings: () => ({ ...settings }),
      getCapabilities: () => supported ? { zoom: { min: 1, max: 4, step: .1 }, torch: [false, true] } : {},
      getConstraints: () => ({}),
      async applyConstraints(c) {
        if (failSetting) throw new Error("OverconstrainedError");
        for (const s of c.advanced || []) Object.assign(settings, s);
      },
    });
    stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    return stream;
  };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: () => {
      starts++;
      if (deferStart) return new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
      return Promise.resolve(createStream());
    },
  } });
  const proto = dom.window.HTMLVideoElement.prototype;
  proto.play = () => failPlay ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve();
  proto.pause = () => {};
  Object.defineProperties(proto, {
    videoWidth: { configurable: true, get: () => dimensions.w },
    videoHeight: { configurable: true, get: () => dimensions.h },
    readyState: { configurable: true, get: () => dimensions.ready },
  });
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  HTMLCanvasElement.prototype.toDataURL = function() { encodes++; return "data:image/jpeg;base64,QUJD"; };
  globalThis.Image = class {
    naturalWidth = 1920; naturalHeight = 1080;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  const button = label => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === label);
  const click = async label => { const b = button(label); if (!b) return false; await act(async () => b.click()); return true; };
  const mount = async () => {
    if (root) await act(async () => root.unmount());
    photos = []; starts = 0; encodes = 0; dimensions = { w: 0, h: 0, ready: 0 };
    root = createRoot(document.getElementById("root"));
    function Harness() {
      const [items, setItems] = React.useState([]);
      photos = items;
      return React.createElement(MultiCapture, {
        photos: items, setPhotos: setItems, title: "Aufnahme", onBack() {}, onAnalyze() {}, t,
      });
    }
    await act(async () => root.render(React.createElement(Harness)));
  };
  const ready = async () => {
    dimensions = { w: 1920, h: 1080, ready: 4 };
    await act(async () => document.querySelector("video")?.dispatchEvent(new Event("loadeddata")));
  };

  await mount();
  await click(t("cameraStart"));
  ok("K01 Ausloeser wartet auf das erste Kamerabild", button(t("takePhoto"))?.disabled === true);
  await ready();
  ok("K02 Verfuegbares Kamerabild schaltet Ausloeser frei", button(t("takePhoto"))?.disabled === false);
  ok("K18 Stream ist am tatsaechlich gerenderten Video angeschlossen", document.querySelector("video")?.srcObject === stream);
  await click(t("takePhoto"));
  ok("K03 Ein Kamerafoto erreicht die Fotoauswahl", photos.length === 1 && photos[0].image.startsWith("data:image/jpeg"));
  ok("K04 Keine verlustbehaftete JPEG-Zwischenkopie", encodes === 1);
  ok("K05 Unterstuetzter Kamerazoom ist bedienbar", Boolean(document.querySelector('input[aria-label="Kamerazoom"]')));
  const zoomInput = document.querySelector('input[aria-label="Kamerazoom"]');
  if (zoomInput) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(zoomInput, "2");
      zoomInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  ok("K19 Zoomregler aendert den Kameratrack und zeigt dessen Wert", Boolean(zoomInput) && settings.zoom === 2 && zoomInput.value === "2");
  const torch = document.querySelector('button[aria-label="Kameralicht"]');
  if (torch) await act(async () => torch.click());
  ok("K06 Kameralicht schaltet den Track statt nur die Anzeige", settings.torch === true && torch?.getAttribute("aria-pressed") === "true");
  failSetting = true;
  if (torch) await act(async () => torch.click());
  ok("K07 Abgelehnte Lichteinstellung zeigt keinen falschen Zustand", Boolean(torch) && settings.torch === true && torch.getAttribute("aria-pressed") === "true" && document.body.textContent.includes(t("cameraSettingFailed")));
  failSetting = false;
  track.muted = true;
  await act(async () => track.dispatchEvent(new Event("mute")));
  ok("K08 Unterbrochener Kamerastream sperrt den Ausloeser", button(t("takePhoto"))?.disabled === true);
  track.muted = false;
  await act(async () => track.dispatchEvent(new Event("unmute")));
  ok("K09 Fortgesetzter Stream erlaubt wieder Aufnahmen", button(t("takePhoto"))?.disabled === false);
  const activeTrack = track;
  await click(t("cameraStop"));
  ok("K10 Stoppen beendet die Kameraspur", activeTrack.stops === 1 && !document.querySelector("video"));

  supported = false;
  await mount();
  await click(t("cameraStart"));
  await ready();
  ok("K11 Kamera ohne Zusatzfunktionen bleibt benutzbar", !document.querySelector('input[aria-label="Kamerazoom"]') && !document.querySelector('button[aria-label="Kameralicht"]') && button(t("takePhoto"))?.disabled === false);

  supported = true; deferStart = true;
  await mount();
  const start = button(t("cameraStart"));
  await act(async () => { start.click(); start.click(); });
  ok("K12 Parallele Startklicks oeffnen nur eine Kameraanfrage", starts === 1);
  await click(t("cameraStop"));
  const lateStream = createStream(); const lateTrack = track;
  await act(async () => resolveStart(lateStream));
  ok("K13 Abgebrochene Anfrage beendet spaet eintreffenden Stream", lateTrack.stops === 1 && !document.querySelector("video"));

  await mount();
  await click(t("cameraStart"));
  await act(async () => rejectStart(new Error("Permission denied")));
  ok("K14 Fehlende Kameraberechtigung laesst Fotoimport erreichbar", Boolean(button(t("uploadPhotos"))) && document.body.textContent.includes(t("cameraUnavailable")));

  deferStart = false; failPlay = true;
  await mount();
  await click(t("cameraStart"));
  ok("K15 Fehler beim Abspielen wird sichtbar", document.body.textContent.includes(t("cameraUnavailable")));
  ok("K16 Fehler beim Abspielen gibt die Kamera wieder frei", track.stops === 1 && Boolean(button(t("cameraStart"))));

  failPlay = false;
  await mount();
  await click(t("cameraStart")); await ready();
  const shoot = button(t("takePhoto"));
  await act(async () => { shoot.click(); shoot.click(); });
  ok("K17 Parallele Ausloeseklicks erzeugen nur ein Foto", photos.length === 1);
} finally {
  if (root) await act(async () => root.unmount());
  await vite.close(); dom.window.close();
}
console.log(`Bestanden: ${checks.filter(Boolean).length} / ${checks.length}`);
process.exitCode = checks.every(Boolean) ? 0 : 1;
