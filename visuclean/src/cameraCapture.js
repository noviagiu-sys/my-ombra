/* Aufnahmehilfen. Keine Aenderung der Analyse- oder Bewertungsschwellen.
   Ein Kameraframe wird zuerst verlustfrei eingefroren. Alle JPEG-Versuche
   lesen denselben Frame, niemals eine bereits komprimierte Zwischenkopie. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
export const MAX_PHOTO_EDGE = 1600;
const dataUrlBytes = value => Math.ceil((String(value).split(",")[1]?.length || 0) * .75);

export function cameraFrameReady(video, track) {
  return Boolean(video && video.readyState >= 2
    && video.videoWidth > 0 && video.videoHeight > 0
    && track && track.readyState === "live" && track.enabled !== false && !track.muted);
}

export function cameraControls(track) {
  let caps = {}, settings = {};
  try { caps = track?.getCapabilities?.() || {}; } catch { /* Aufnahme bleibt moeglich. */ }
  try { settings = track?.getSettings?.() || {}; } catch { /* Unbekannte Einstellungen. */ }
  const adjustable = typeof track?.applyConstraints === "function";
  const range = caps.zoom;
  const hasZoom = adjustable && Number.isFinite(range?.min) && Number.isFinite(range?.max)
    && range.min > 0 && range.max > range.min;
  const zoom = hasZoom ? {
    min: range.min, max: range.max,
    step: Number.isFinite(range.step) && range.step > 0 ? range.step : .1,
    value: Number.isFinite(settings.zoom) ? Math.min(range.max, Math.max(range.min, settings.zoom)) : range.min,
  } : null;
  const torch = adjustable && Array.isArray(caps.torch) && caps.torch.includes(true) && caps.torch.includes(false);
  return { zoom, torch, torchOn: settings.torch === true };
}

export async function changeCameraControl(track, name, value) {
  const controls = cameraControls(track);
  if (track?.readyState !== "live") throw new Error("CAMERA_ENDED");
  if (name === "zoom") {
    if (!controls.zoom || !Number.isFinite(value)
      || value < controls.zoom.min || value > controls.zoom.max) throw new Error("CAMERA_ZOOM_UNSUPPORTED");
  } else if (name !== "torch" || !controls.torch || typeof value !== "boolean") {
    throw new Error("CAMERA_CONTROL_UNSUPPORTED");
  }
  /* Vorherige Werte derselben Eigenschaft aus advanced entfernen, sonst
     fordert eine Folgeaenderung gleichzeitig den alten und neuen Wert.
     Andere Einstellungen, etwa Aufloesung und Kamerarichtung, erhalten. */
  const previous = track.getConstraints?.() || {};
  const next = { ...previous };
  delete next[name];
  next.advanced = (previous.advanced || []).map(entry => {
    const copy = { ...entry }; delete copy[name]; return copy;
  }).filter(entry => Object.keys(entry).length);
  next.advanced.push({ [name]: value });
  await track.applyConstraints(next);
  const actual = track.getSettings?.() || {};
  if (name === "torch" ? actual.torch !== value
    : !Number.isFinite(actual.zoom) || Math.abs(actual.zoom - value) > Math.max(1e-6, controls.zoom.step / 2)) {
    throw new Error("CAMERA_SETTING_NOT_CONFIRMED");
  }
  return cameraControls(track);
}

export function encodePhoto(source, sourceWidth, sourceHeight) {
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0) throw new Error("Bild besitzt keine gültigen Dimensionen");
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight));
  let width = Math.max(1, Math.round(sourceWidth * scale));
  let height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bildverarbeitung nicht verfügbar");
  let quality = .86;
  for (let attempt = 0; attempt < 20; attempt++) {
    canvas.width = width; canvas.height = height;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const result = canvas.toDataURL("image/jpeg", quality);
    if (result.startsWith("data:image/jpeg") && dataUrlBytes(result) <= MAX_PHOTO_BYTES) return result;
    if (quality > .54) quality -= .08;
    else { width = Math.max(1, Math.round(width * .82)); height = Math.max(1, Math.round(height * .82)); quality = .78; }
  }
  throw new Error("Bild konnte nicht unter 1 MB komprimiert werden");
}

export function captureCameraFrame(video, track) {
  if (!cameraFrameReady(video, track)) throw new Error("CAMERA_FRAME_NOT_READY");
  const frame = document.createElement("canvas");
  frame.width = video.videoWidth; frame.height = video.videoHeight;
  const context = frame.getContext("2d");
  if (!context) throw new Error("Bildverarbeitung nicht verfügbar");
  context.drawImage(video, 0, 0);
  return encodePhoto(frame, frame.width, frame.height);
}

export function compressPhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try { resolve(encodePhoto(image, image.naturalWidth, image.naturalHeight)); }
      catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    image.src = dataUrl;
  });
}
