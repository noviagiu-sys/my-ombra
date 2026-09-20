import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  AlertTriangle, ArrowLeft, BarChart2, Camera, Check, CheckCircle, ChevronLeft, ChevronRight,
  ClipboardList, Crop, Download, Eye, EyeOff, FileSignature, FileText, Globe2, Home,
  HelpCircle, ImagePlus, Info, Languages, Lightbulb, Lock, LogOut, Package, QrCode,
  ScanLine, Search, Settings, ShieldCheck, Sun, Trash2, Upload, X, XCircle, ZoomIn,
  ZoomOut,
} from "lucide-react";
import { componentStats } from "./analysisCore.js";
import { APPROVED_AI_ENGINE, runLocalEngine } from "./analysisEngines.js";
import { applyKnownIssues, canCreateKnownIssue, extractZones } from "./knownIssues.js";
import { aggregateCheckpoints, applyToleratedScratch, buildCheckpoints, istAltdatensatz, kriteriumKurz, kriteriumStatus, STATUS } from "./assessment.js";
import { CAPTURE_PATH, MANUAL_FINDING, PREPARATION_ACTION, VERDACHT_KLAERUNG, bestaetigteSchaeden, captureProfile, collectQaTriggers, evaluateCaptureProfile, offeneSchadensverdachte, validateKnownIssueAssignment, validateRetakeRecord } from "./decision.js";
import { REGISTRATION_RESIDUAL_MAX_PX, WARP_COVERAGE_MIN, rectificationAllowed, registerFromCorners, verifyByRedetect, warpCoverage, warpToPlane } from "./registration.js";
import { findeKandidat, kandidatenBestand, screenScratches, waehleProtokollKandidaten } from "./scratchScreening.js";
import { DEPTH_DECISION, DEPTH_MEASUREMENT_SOURCE, DEPTH_RULE_VERSION, DEPTH_UNIT,
  OPTICAL_HINT, ersetzeMessung, evaluateDepthMeasurement, istSpeicherbar,
  opticalDepthHint } from "./depthLimit.js";
import { EBENEN, EBENEN_STATUS, befundEbenen, ebenenBestand, ebenenText,
  standardEbenen } from "./overlayLayers.js";
import { WISCH_FORMAT, vergleicheWischtest, wischAnsicht,
  wischEinschraenkungsTexte, wischKriteriumText, wischText } from "./swabComparison.js";
import { FLAECHE_MIN_KANTE, FLAECHE_QUELLE, FLAECHE_VORGABE,
  aufFenster, ausFenster, bemalteFlaeche, flaecheAusreichend, flaecheEintrag,
  rechteckAufFenster,
  geltungstext, kandidatenBild, markerAufFlaeche, markerInFlaeche,
  normalisiereFlaeche, pixelRechteck }
  from "./inspectionArea.js";
import { ANALYSE_KANTE, AUFNAHMEZWECK } from "./capturePaths.js";
import { CONFIG_PFAD, ladeScreeningConfig } from "./screeningConfig.js";
import {
  fuseAngles, scoreByPersistence,
} from "./multiAngle.js";
import { KLAERUNG_MEANING, SIGNATURE_MEANING, buildApprovalRecord, buildClarificationRecord, deriveState, needsQaApproval, signInspection } from "./inspectionRecord.js";
import { LIFECYCLE_STATE, qaDecisionOptions } from "./lifecycle.js";
import {
  aggregateResults, APP_VERSION, assessMarker, authenticate, deriveSystemDecision, EQUIPMENT,
  equipmentName, newId, parseEquipmentTarget, qaLoginStatus, signatureMeaning, verifyPassword,
  zoneName,
} from "./domain.js";
import { translator, verdictDisplay } from "./i18n.js";
import { ALTBEFUND_HINWEIS, istAltbefund } from "./verdictWording.js";
import {
  SEQUENZ_SCHRITTE, leereSequenz, naechsteLichtposition, schrittEntfernen,
  schrittHinzufuegen, schrittZu, sequenzStatus,
} from "./aufnahmeSequenz.js";
import {
  exportReadableData, loadInspections, loadIssues, loadReferences, saveInspection, saveIssue, saveReference,
  storageEstimate, verifyStoredAudit,
} from "./persistence.js";
import { SIGNATURE_COMPONENTS, SIGNATURE_METHOD, recordDigest } from "./audit.js";
import { exportInspectionCollectionPdf, exportInspectionPdf } from "./pdfExport.js";
import { runEngineSelfTest } from "./selfTest.js";

const C = {
  bg: "#070c14", card: "#0f1724", elevated: "#162033", border: "#334155", blue: "#38bdf8",
  green: "#4ade80", red: "#fb7185", orange: "#fb923c", text: "#f1f5f9", muted: "#a8b6ca",
  subtle: "#cbd5e1", violet: "#c084fc",
};

export function analyzeImage(dataUrl, screeningOptionen = undefined, sequenzFuerZone = null,
  flaeche = FLAECHE_VORGABE, flaechenQuelle = FLAECHE_QUELLE.VORGABE) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        /* Getrennte Analyse-Auflösungen je Kriterium.

           Der Analyse-KERN (Feuchtigkeit, Rückstände, Korrosion, Textur)
           rechnet weiter bei 640. Gemessen an zwei nassen Realaufnahmen
           bringt mehr Auflösung dort NICHTS, im Gegenteil: edgeFrac sank
           von 0,0423 auf 0,0254, weil die Merkmale Flächenanteile sind.

           Das Kratzer-SCREENING rechnet mit der gespeicherten Auflösung.
           Gemessen am Prüfbild in Telefongröße: bei 640 überlebte nur
           EINER von zehn auffälligsten Kandidaten, bei voller Auflösung
           alle zehn.

           Beide Zahlen stehen in capturePaths.js und sind dort als
           Stellwerte ausgewiesen. */
        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("Bild besitzt keine gültigen Dimensionen");
        }
        /* ── Prüffläche: ECHTER ZUSCHNITT, vor jeder Rechnung ────────────
           Befund der Gegenprüfung an rc.4.39, zutreffend und sperrend: der
           Kern bekam immer das ganze Foto. Die Grauwelt-Farbkorrektur
           bildet ihre Faktoren aus den Mittelwerten des GANZEN Bildes —
           der Hintergrund entschied damit mit darüber, wie die
           unveränderte Oberfläche bewertet wird. Am Kern gemessen
           (pruefflaechetest R3a): dieselbe graue Mitte, fünf Hintergründe,
           vier verschiedene Sauberkeitsurteile; bei blauem Hintergrund
           galten ALLE 19200 unveränderten grauen Pixel als warm.

           `drawImage` schneidet hier direkt aus der Quelle zu. Die Pixel
           ausserhalb der Prüffläche existieren danach nicht — sie können
           weder die Farbkorrektur noch die Schmutzwerte noch das
           Kratzer-Screening beeinflussen.

           Ausdrücklich NICHT gefüllt, weder schwarz noch mit einer
           Durchschnittsfarbe: eine gefüllte Fläche geht in dieselben
           Bildmittel ein. Gemessen (R3e): Schwarzfüllen macht aus
           derselben sauberen Fläche BRIGHT_RESIDUE — einen Befund, den
           erst das Füllen erzeugt hat.

           analysisCore.js bleibt dabei byte-identisch. Genau deshalb
           liegt der Zuschnitt hier und nicht im Kern. */
        /* Zu klein ist eine AUSSAGE, kein Ergebnis. Unterhalb der
           Mindestkante hat die Blockanalyse (BLK = 16) und der
           5x5-Medianfilter des Beleuchtungsfeldes kaum noch Stuetzstellen;
           ein Urteil daraus waere eine Zahl ohne Grundlage. Der Pruefer
           erfaehrt das, statt ein Ergebnis zu bekommen. */
        if (!flaecheAusreichend(flaeche, image.naturalWidth, image.naturalHeight)) {
          throw new Error("AREA_TOO_SMALL");
        }
        const quelle = pixelRechteck(flaeche, image.naturalWidth, image.naturalHeight);
        const max = ANALYSE_KANTE[AUFNAHMEZWECK.FEUCHTE];
        let width = quelle.w;
        let height = quelle.h;
        if (width > max || height > max) {
          const scale = max / Math.max(width, height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas-Analyse ist nicht verfügbar");
        context.drawImage(image, quelle.x, quelle.y, quelle.w, quelle.h, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        /* Das zugeschnittene Bild wird mitgeführt: Masken und Overlay
           beziehen sich ab jetzt auf den Ausschnitt, und ein Overlay über
           dem VOLLEN Foto läge um den Zuschnittversatz daneben. Das
           Originalfoto bleibt davon unberührt erhalten. */
        const zuschnittBild = canvas.toDataURL("image/jpeg", 0.9);
        /* ── Oberflächenpfad: eigene, höhere Analyse-Auflösung ──────────
           Das Kratzer-Screening läuft HIER, solange die volle Aufnahme
           noch als Canvas vorliegt. Die hochaufgelösten Pixel werden
           danach verworfen und NICHT im Ergebnis mitgeführt: eine
           1932x2576-Aufnahme sind rund 20 MB je Foto, bei bis zu zehn
           Fotos. Was bleibt, ist die Kandidatenliste — wenige Kilobyte.

           ANALYSE_KANTE[OBERFLAECHE] === 0 bedeutet: gar nicht
           verkleinern. */
        const oberflaechenKante = ANALYSE_KANTE[AUFNAHMEZWECK.OBERFLAECHE];
        let screening = null;
        try {
          /* Der Oberflaechenpfad wird MIT zugeschnitten. Liefe das
             Kratzer-Screening weiter auf dem ganzen Foto, waere die
             Begrenzung nur halb wirksam: Kandidaten aus dem Hintergrund
             stuenden im Protokoll neben einem Urteil, das den Hintergrund
             ausdruecklich nicht bewertet hat. */
          const lange = Math.max(quelle.w, quelle.h);
          const sw = oberflaechenKante > 0
            ? Math.min(lange, oberflaechenKante) : lange;
          const skalierung = sw / lange;
          const hw = Math.max(1, Math.round(quelle.w * skalierung));
          const hh = Math.max(1, Math.round(quelle.h * skalierung));
          if (hw > width || hh > height) {
            const hiCanvas = document.createElement("canvas");
            hiCanvas.width = hw; hiCanvas.height = hh;
            const hiContext = hiCanvas.getContext("2d", { willReadFrequently: true });
            hiContext.drawImage(image, quelle.x, quelle.y, quelle.w, quelle.h, 0, 0, hw, hh);
            const hiData = hiContext.getImageData(0, 0, hw, hh);
            screening = screenScratches(hiData.data, hw, hh, screeningOptionen);
            hiCanvas.width = 0; hiCanvas.height = 0;
          }
        } catch { screening = null; /* Oberflächenpfad ist Zugabe, nie Bedingung */ }

        const local = runLocalEngine(imageData.data, width, height);
        const { features, verdict } = local;
        /* Helligkeit dieser Aufnahme (Leitplanke 4 gilt je Einzelbild). */
        let brightnessSum = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          brightnessSum += (0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1]
            + 0.114 * imageData.data[i + 2]) / 255;
        }
        const brightness = brightnessSum / (width * height);
        /* QR-Ecken fuer Registrierung — Geometrie, nicht nur Textinhalt. */
        const qr = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
        const corners = qr?.location ? {
          topLeftCorner: qr.location.topLeftCorner,
          topRightCorner: qr.location.topRightCorner,
          bottomRightCorner: qr.location.bottomRightCorner,
          bottomLeftCorner: qr.location.bottomLeftCorner,
        } : null;
        const reg = corners ? registerFromCorners(corners) : null;
        /* Das Aufnahmeprofil wird VOR den Pruefpunkten gebildet, weil es in
           sie eingeht: ein verkleinertes Bild traegt kein belastbares
           "trocken" (siehe assessment.js, A25). Bis rc.4.23 entstand das
           Profil erst im Ergebnisobjekt und erreichte die Bewertung nie. */
        const feuchteSequenz = sequenzFuerZone ?? null;
        const aufnahmeprofil = captureProfile({
          /* Bezugsgroesse ist jetzt der ZUSCHNITT, nicht das ganze Foto:
             der Verkleinerungsfaktor beschreibt, wie stark das
             tatsaechlich bewertete Bild verkleinert wurde. Die Groesse des
             Originalfotos steht getrennt im Prueffläche-Eintrag. */
          processedWidth: width, processedHeight: height,
          sourceWidth: quelle.w, sourceHeight: quelle.h,
          path: (quelle.w > width || quelle.h > height)
            ? CAPTURE_PATH.DOWNSCALED : CAPTURE_PATH.CAMERA,
          brightness,
          labelShape: reg?.labelShape ?? null,
          residualPx: reg?.residualPx ?? null,
          registered: reg ? reg.registered : false,
        });
        resolve({
          ...verdict,
          /* RC4: JEDER Rohbefund traegt sein Aufnahmeprofil. Quelle und
             Verarbeitungsgroesse stehen hier ohnehin fest; bis RC4.1 wurden
             sie verworfen. Ohne sie ist ein Befund spaeter nicht
             einzuordnen — und kein Trainingsdatum. */
          _registration: reg,
          _imageData: { data: imageData.data, width, height },
          /* Welcher Ausschnitt bewertet wurde — samt Herkunft und der
             Groesse des Originalfotos. Ohne das ist spaeter nicht
             nachvollziehbar, worauf sich das Urteil bezieht. */
          pruefflaeche: flaecheEintrag(flaeche, flaechenQuelle,
            image.naturalWidth, image.naturalHeight, width, height),
          zuschnittBild,
          /* Kandidaten aus dem Oberflächenpfad, in dessen eigener
             Auflösung gerechnet. null, wenn dort nicht mehr Auflösung zur
             Verfügung stand als im Kern. */
          _screeningHochaufloesend: screening,
          _screeningKante: screening ? oberflaechenKante : null,
          captureProfile: aufnahmeprofil,
          /* RC3: die Pruefpunkte entstehen aus denselben Messwerten wie die
             drei Urteile - keine zweite Analyse, keine zweite Schwelle. */
          /* Die Feuchte-Sequenz entsteht im gefuehrten Aufnahmeablauf
             (normal, Streiflicht links, Streiflicht rechts). Solange der
             nicht durchlaufen wurde, liegt keine vor - und dann entsteht
             aus dem Feuchtealgorithmus kein automatisches Trocken-PASS.
             Das ist der gewollte Zustand, keine Luecke. */
          checkpoints: buildCheckpoints(features, verdict, { feuchteSequenz }),
          lm: features.lm,
          metrics: {
            lm: features.lm, bfr: features.bfr, dfr: features.dfr, vdfr: features.vdfr,
            wf: features.wf, cv: features.cv, tvFlat: features.tvFlat, gradMean: features.gradMean, edgeFrac: features.edgeFrac,
            warmBlocks: features.warmBlocks, anomBright: features.anomBright, anomDark: features.anomDark,
          },
          _ov: {
            w: width, h: height,
            maskBright: features.masks.maskBright,
            maskWarm: features.masks.maskWarm,
            maskDark: features.masks.maskDark,
            maskAnom: features.masks.maskAnom,
            scratches: features.scratches,
            verdictCodes: { dry: verdict.dry.code, clean: verdict.clean.code, intact: verdict.intact.code },
            /* Der Ebenenbestand wird HIER einmal gezaehlt und dann nur noch
               weitergereicht. Die Masken selbst wandern nicht in den
               Datensatz - fuer die Nachvollziehbarkeit genuegt die Zahl mit
               ihrer Bezugsgroesse, und die Ableitung bleibt reproduzierbar,
               weil sie auf dem festgehaltenen Bestand arbeitet und nicht auf
               einer spaeteren Konfiguration. */
            ebenen: befundEbenen(ebenenBestand(features), {
              dry: verdict.dry.code, clean: verdict.clean.code, intact: verdict.intact.code,
            }),
          },
          analysis: { mode: "local-only", engines: [local.engine, APPROVED_AI_ENGINE] },
        });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    image.src = dataUrl;
  });
}

/* Welche Ebenen zeigt ein Overlay, wenn niemand etwas umgeschaltet hat?
   Genau die urteilstragenden — das ist das Bild, das rc.4.37 gezeigt hat.
   Traegt der Datensatz noch keinen Ebenenbestand (Pruefungen vor rc.4.38),
   wird dieselbe Menge aus den Urteilscodes abgeleitet. Ein alter Bericht
   aendert dadurch seine Darstellung nicht. */
export function overlayStandardEbenen(overlay) {
  if (Array.isArray(overlay?.ebenen) && overlay.ebenen.length) {
    return standardEbenen(overlay.ebenen);
  }
  const codes = overlay?.verdictCodes || {};
  return EBENEN.filter(e => e.urteilscodes.includes(codes[e.kriterium])).map(e => e.id);
}

function paintOverlay(canvas, image, overlay, markers = [], aktiveEbenen = null) {
  const context = canvas.getContext("2d");
  canvas.width = overlay.w; canvas.height = overlay.h;
  context.drawImage(image, 0, 0, overlay.w, overlay.h);
  /* Die Sichtbarkeit haengt nicht mehr am Urteilscode, sondern an der
     Ebenenauswahl. Bis rc.4.37 leitete jede Maske ihre Sichtbarkeit aus
     GENAU EINEM Sauberkeitscode ab — und weil die Urteilskette nur einen
     Code liefert, schlossen warme und farbneutrale Auffaelligkeiten sich
     in der Anzeige gegenseitig aus, obwohl der Kern beide gerechnet hatte
     (schmutztest S1c: 5888 px in 23 Bildzonen berechnet, nicht gezeigt).
     Die Voreinstellung bleibt unveraendert; zusaetzlich EINGEBLENDET wird
     nur, was der Pruefer ausdruecklich zuschaltet. */
  const aktiv = new Set(Array.isArray(aktiveEbenen)
    ? aktiveEbenen : overlayStandardEbenen(overlay));
  const showBright = aktiv.has("hell");
  const showWarm = aktiv.has("warm");
  const showAnom = aktiv.has("anom");
  const showDark = aktiv.has("dunkel");
  const showScratches = aktiv.has("kratzer");
  const layer = context.createImageData(overlay.w, overlay.h);
  for (let pixel = 0; pixel < overlay.w * overlay.h; pixel++) {
    const offset = pixel * 4;
    const color = showBright && overlay.maskBright?.[pixel] ? [30, 144, 255, 115]
      : showWarm && overlay.maskWarm?.[pixel] ? [251, 146, 60, 125]
      : showDark && overlay.maskDark?.[pixel] ? [248, 113, 113, 135]
      : showAnom && overlay.maskAnom?.[pixel] ? [192, 132, 252, 110] : null;
    if (color) layer.data.set(color, offset);
  }
  const temporary = document.createElement("canvas");
  temporary.width = overlay.w; temporary.height = overlay.h;
  temporary.getContext("2d").putImageData(layer, 0, 0);
  context.drawImage(temporary, 0, 0);

  const minimum = Math.max(12, Math.round(0.0004 * overlay.w * overlay.h));
  const ring = (x, y, radius, color) => {
    context.lineWidth = 4; context.strokeStyle = "rgba(7,12,20,.9)";
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 2; context.strokeStyle = color;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
  };
  [[showWarm && overlay.maskWarm, C.orange], [showDark && overlay.maskDark, C.red], [showAnom && overlay.maskAnom, C.violet], [showBright && overlay.maskBright, "#1e90ff"]]
    .forEach(([mask, color]) => mask && componentStats(mask, overlay.w, overlay.h, minimum)
      .filter(component => component.count <= 0.4 * overlay.w * overlay.h)
      .slice(0, 8)
      .forEach(component => ring(
        (component.minX + component.maxX) / 2,
        (component.minY + component.maxY) / 2,
        Math.max(7, Math.hypot(component.maxX - component.minX + 1, component.maxY - component.minY + 1) * 0.58),
        color,
      )));
  (showScratches ? overlay.scratches || [] : []).forEach(component => {
    context.lineWidth = 3; context.strokeStyle = C.orange;
    context.strokeRect(component.minX - 3, component.minY - 3, component.maxX - component.minX + 7, component.maxY - component.minY + 7);
  });
  markers.forEach((marker, index) => {
    const x = marker.x * overlay.w; const y = marker.y * overlay.h;
    ring(x, y, Math.max(10, Math.min(overlay.w, overlay.h) * 0.035), "#ffffff");
    context.fillStyle = "#070c14"; context.beginPath(); context.arc(x, y, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#ffffff"; context.font = "bold 11px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    /* Die Nummer reist am Marker mit, wenn eine gesetzt ist. Ohne das
       verschiebt sich die Beschriftung, sobald ein Marker ausserhalb der
       Prueffläche liegt und deshalb gar nicht gezeichnet wird. */
    context.fillText(String(marker.nummer ?? index + 1), x, y);
  });
}

function annotatedImage(imageSource, overlay, markers) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        paintOverlay(canvas, image, overlay, markers);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Overlay-Bild konnte nicht erzeugt werden"));
    image.src = imageSource;
  });
}

function OverlayCanvas({ source, overlay, markers = [], label, aktiveEbenen = null }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!source || !overlay || !ref.current) return;
    const image = new Image();
    image.onload = () => paintOverlay(ref.current, image, overlay, markers, aktiveEbenen);
    image.src = source;
  }, [source, overlay, markers, aktiveEbenen]);
  return <canvas ref={ref} role="img" aria-label={label} className="result-canvas"/>;
}

function Button({ children, variant = "secondary", icon: Icon, className = "", ...props }) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={17} aria-hidden="true"/>}{children}</button>;
}

function IconButton({ label, icon: Icon, ...props }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}><Icon size={18} aria-hidden="true"/></button>;
}

function ScreenHeader({ title, subtitle, onBack, t }) {
  return <div className="screen-header">
    {onBack && <IconButton label={t("back")} icon={ArrowLeft} onClick={onBack}/>}<div className="screen-heading"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
  </div>;
}

function Field({ label, id, children, hint, required }) {
  return <div className="field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{hint && <div className="field-hint">{hint}</div>}</div>;
}

/* ─── RC4.1 · Sichtbarkeit der Demo-Zugaenge ───────────────────────────────
   Standard: AUS. Das Panel erscheint nur, wenn beim Bauen ausdruecklich
   VITE_DEMO_ACCESS=true gesetzt wird.

   Was das leistet und was nicht — beides gehoert dazu:

   ES LEISTET, dass ein QA-Manager-Zugang nicht mehr per Klick auf dem
   Anmeldeschirm bereitliegt. Das ist relevant, weil RC4 das
   Vier-Augen-Prinzip in Auslegung B durchsetzt: approvedBy und performedBy
   muessen verschiedene Benutzer sein. Liegt der QA-Zugang offen bereit,
   erfuellt eine einzelne Person diese Invariante durch zweimaliges Anmelden,
   und die Regel wird zur Formsache.

   ES LEISTET NICHT, die Zugaenge zu schuetzen. Die Demo-Benutzer stehen in
   src/domain.js und landen im Bundle; wer die Datei liest, hat sie. Dieses
   Flag hebt die Huerde von "ablesen" auf "Bundle durchsuchen" — mehr nicht.
   Eine belastbare Personentrennung braucht serverseitige oder IdP-gestuetzte
   Identitaet und liegt ausserhalb dieses Demonstrators.                     */
const DEMO_ACCESS_VISIBLE = import.meta.env?.VITE_DEMO_ACCESS === "true";

function LoginScreen({ language, setLanguage, onLogin }) {
  const t = translator(language);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = event => {
    event?.preventDefault();
    if (!username || !password) { setError(t("requiredLogin")); return; }
    setBusy(true);
    const user = authenticate(username, password);
    if (user) onLogin(user);
    else { setError(t("loginError")); setBusy(false); }
  };
  return <main className="login-page">
    <div className="login-shell">
      <div className="brand-mark"><Eye size={31} aria-hidden="true"/></div>
      <h1>VisuClean</h1><p className="login-subtitle">{t("appSubtitle")} · v{APP_VERSION}</p>
      <div className="language-switch" aria-label={t("language")}>
        <Button variant={language === "de" ? "primary" : "ghost"} onClick={() => setLanguage("de")}>DE</Button>
        <Button variant={language === "en" ? "primary" : "ghost"} onClick={() => setLanguage("en")}>EN</Button>
      </div>
      <form className="panel login-form" onSubmit={submit}>
        <Field label={t("username")} id="username" required><input id="username" autoComplete="username" value={username} onChange={event => { setUsername(event.target.value); setError(""); }}/></Field>
        <Field label={t("password")} id="password" required>
          <div className="password-field"><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(""); }}/>
            <IconButton label={showPassword ? t("hidePassword") : t("showPassword")} icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword(value => !value)}/></div>
        </Field>
        {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17} aria-hidden="true"/>{error}</div>}
        <button className="button button-primary button-full" type="submit" disabled={busy}><Lock size={17} aria-hidden="true"/>{busy ? t("loggingIn") : t("login")}</button>
      </form>
      {DEMO_ACCESS_VISIBLE && <section className="panel demo-access" aria-labelledby="demo-heading"><h2 id="demo-heading">{t("demoAccess")}</h2>
        {[["operator1", "pharma2024", "Operator"], ["qa_manager", "quality2024", "QA Manager"], ["admin", "admin2024", "Admin"]].map(([name, pass, role]) =>
          <button type="button" key={name} onClick={() => { setUsername(name); setPassword(pass); setError(""); }}><span>{name}</span><span className="role-chip">{role}</span></button>)}
        <p className="demo-disclaimer">{t("demoAccessWarning")}</p>
      </section>}
      <p className="demo-disclaimer">{t("demonstrator")}</p>
    </div>
  </main>;
}

function EquipmentScanner({ onDetected, onClose, t }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const finished = useRef(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("");
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        let detector = null;
        if ("BarcodeDetector" in window) {
          try {
            const requested = ["qr_code", "ean_13", "code_128"];
            const supported = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : requested;
            const formats = requested.filter(format => supported.includes(format));
            if (formats.length) detector = new window.BarcodeDetector({ formats });
          } catch { detector = null; }
        }
        setMethod(detector ? t("scannerNative") : t("scannerFallback"));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        timerRef.current = window.setInterval(async () => {
          if (finished.current || video.readyState < 2) return;
          try {
            let value = null;
            if (detector) {
              const codes = await detector.detect(video);
              value = codes[0]?.rawValue || null;
            } else {
              const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" })?.data || null;
            }
            if (value) { finished.current = true; onDetected(value); }
          } catch { /* nächster Frame */ }
        }, 350);
      } catch { setError(t("cameraUnavailable")); }
    };
    start();
    return () => {
      active = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [onDetected, t]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="modal-card">
    <div className="modal-title"><h2 id="scanner-title"><QrCode size={20} aria-hidden="true"/> {t("scanner")}</h2><IconButton label={t("stopScan")} icon={X} onClick={onClose}/></div>
    <div className="scanner-view"><video ref={videoRef} muted playsInline/><div className="scanner-frame" aria-hidden="true"/></div>
    <p>{error || t("scanHint")}</p>{method && <div className="status-note"><ScanLine size={15} aria-hidden="true"/>{method}</div>}
    <p className="muted">{t("manualFallback")}</p>
  </div></div>;
}

function EquipmentSelect({ language, onSelect, onBack, t }) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const filtered = EQUIPMENT.filter(item => `${item.de} ${item.en} ${item.code} ${item.barcode}`.toLowerCase().includes(query.toLowerCase()));
  const resolve = useCallback(value => {
    const target = parseEquipmentTarget(value);
    if (!target) { setError(t("unknownCode")); return; }
    setScannerOpen(false); setError(""); onSelect(target.equipment, target.zone);
  }, [onSelect, t]);
  return <section className="screen">
    <ScreenHeader title={t("selectEquipment")} subtitle="QR · EAN-13 · Code 128 · manuell" onBack={onBack} t={t}/>
    <div className="toolbar-stack">
      <div className="search-field"><Search size={17} aria-hidden="true"/><label className="sr-only" htmlFor="equipment-search">{t("searchEquipment")}</label><input id="equipment-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("searchEquipment")}/></div>
      <Button icon={QrCode} variant="primary" onClick={() => setScannerOpen(true)}>{t("scanner")}</Button>
      <div className="manual-code"><label className="sr-only" htmlFor="equipment-code">{t("manualCode")}</label><input id="equipment-code" value={manual} onChange={event => { setManual(event.target.value); setError(""); }} placeholder="VC-EQ-TP"/><Button onClick={() => resolve(manual)}>{t("useCode")}</Button></div>
      {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
    </div>
    <div className="equipment-list">{filtered.map(item => <button type="button" className="equipment-card" key={item.id} onClick={() => onSelect(item)}>
      <span className="equipment-icon"><Package size={21} aria-hidden="true"/></span><span><strong>{equipmentName(item, language)}</strong><small>{item.code} · EAN {item.barcode}</small><small>{item.zones.length} {language === "en" ? "zones" : "Prüfzonen"}</small></span><ChevronRight size={19} aria-hidden="true"/>
    </button>)}</div>
    {scannerOpen && <EquipmentScanner onDetected={resolve} onClose={() => setScannerOpen(false)} t={t}/>}
  </section>;
}

function ZoneSelect({ equipment, language, records, onSelect, onBack, t }) {
  return <section className="screen"><ScreenHeader title={t("selectZone")} subtitle={`${equipmentName(equipment, language)} · ${equipment.code}`} onBack={onBack} t={t}/>
    <div className="equipment-list">{equipment.zones.map((item, index) => {
      const previous = records.find(record => record.eqId === equipment.id && record.zoneId === item.id);
      return <button type="button" className="equipment-card" key={item.id} onClick={() => onSelect(item)}>
        <span className="zone-number">{index + 1}</span><span><strong>{zoneName(item, language)}</strong><small>{equipment.material === "stainless" ? "Stainless steel / Edelstahl" : equipment.material}</small><small>{previous ? `${language === "en" ? "Last inspection" : "Letzte Prüfung"}: ${new Date(previous.signedAt).toLocaleDateString(language === "en" ? "en-GB" : "de-CH")}` : (language === "en" ? "No previous inspection" : "Noch keine Prüfung")}</small></span><ChevronRight size={19} aria-hidden="true"/>
      </button>;
    })}</div>
  </section>;
}

/**
 * Die Prüffläche festlegen.
 *
 * Native Regler, keine Ziehgriffe: im Reinraum mit Handschuhen ist ein
 * 44-px-Schieberegler zuverlässiger zu treffen als eine Ecke, und er ist
 * mit Tastatur bedienbar. Der Rahmen im Bild darüber zeigt laufend, was
 * tatsächlich bewertet wird.
 *
 * Die Voreinstellung ist NICHT das ganze Foto. Sie ist ein zentrierter
 * Ausschnitt, und solange niemand sie anfasst, wird sie im Datensatz als
 * Voreinstellung ausgewiesen — nicht als Auswahl. Das ganze Bild bleibt
 * wählbar, aber als ausdrückliche Entscheidung.
 */
function PruefflaechePanel({ flaeche, quelle, onChange, t }) {
  const f = normalisiereFlaeche(flaeche ?? FLAECHE_VORGABE);
  const setzen = (schluessel, wert) => onChange(
    normalisiereFlaeche({ ...f, [schluessel]: Number(wert) }), FLAECHE_QUELLE.GEWAEHLT);
  const prozent = wert => `${Math.round(wert * 100)} %`;
  const regler = [
    ["x", t("areaLeft"), 0, 1 - f.w],
    ["y", t("areaTop"), 0, 1 - f.h],
    ["w", t("areaWidth"), FLAECHE_MIN_KANTE, 1 - f.x],
    ["h", t("areaHeight"), FLAECHE_MIN_KANTE, 1 - f.y],
  ];
  return <section className="flaeche-panel">
    <h3><Crop size={16} aria-hidden="true"/> {t("inspectionArea")}</h3>
    <p className="editor-hint">{t("areaHint")}</p>
    {quelle !== FLAECHE_QUELLE.GEWAEHLT && quelle !== FLAECHE_QUELLE.GANZES_BILD
      && <p className="flaeche-vorgabe">{t("areaDefaultWarning")}</p>}
    <div className="flaeche-regler">
      {regler.map(([schluessel, beschriftung, min, max]) => <label key={schluessel}>
        <span>{beschriftung}</span>
        <input type="range" min={min} max={Math.max(min, max)} step="0.01"
          value={f[schluessel]} onChange={event => setzen(schluessel, event.target.value)}/>
        <output>{prozent(f[schluessel])}</output>
      </label>)}
    </div>
    <div className="flaeche-aktionen">
      <Button onClick={() => onChange(FLAECHE_VORGABE, FLAECHE_QUELLE.GEWAEHLT)}>
        {t("areaReset")}</Button>
      <Button variant="ghost"
        onClick={() => onChange({ x: 0, y: 0, w: 1, h: 1 }, FLAECHE_QUELLE.GANZES_BILD)}>
        {t("areaWholeImage")}</Button>
    </div>
  </section>;
}

function ZoomMarkerViewer({ photo, onMarkersChange, onFlaecheChange = null, t, readOnly = false, maxMarkers = 5 }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [markerMode, setMarkerMode] = useState(false);
  const pointers = useRef(new Map());
  const gesture = useRef({ distance: 0, zoom: 1, x: 0, y: 0, panX: 0, panY: 0 });
  const moved = useRef(false);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setMarkerMode(false); }, [photo?.id]);
  const clampZoom = value => Math.max(1, Math.min(4, value));
  /* BEFUND der Gegenpruefung an rc.4.44, im Browser reproduziert: mit der
     MAUS entstand kein Marker. `setPointerCapture` auf dem Zoom-Viewport
     leitet in Chromium den anschliessenden `click` auf den Viewport um —
     die Klickflaeche darin bekam ihn nie. Mit Beruehrung faellt es nicht
     auf, weil der Klick dort aus dem Trefferpunkt bestimmt wird. Marker
     setzen ist eine Grundfunktion; sie darf nicht vom Eingabegeraet
     abhaengen.

     Gefangen wird der Zeiger ab jetzt erst, wenn tatsaechlich eine GESTE
     beginnt — also sobald die Bewegungsschwelle ueberschritten ist. Ein
     Tippen oder Klicken bleibt damit ein Klick, ein Ziehen bekommt
     weiterhin seine Ereignisse auch ausserhalb des Elements. */
  const pointerDown = event => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    const values = [...pointers.current.values()];
    if (values.length === 2) gesture.current = { ...gesture.current, distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y), zoom };
    else gesture.current = { ...gesture.current, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };
  const pointerMove = event => {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId);
    if (Math.hypot(previous.x - event.clientX, previous.y - event.clientY) > 4) {
      if (!moved.current) event.currentTarget.setPointerCapture?.(event.pointerId);
      moved.current = true;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 2 && gesture.current.distance) {
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      setZoom(clampZoom(gesture.current.zoom * distance / gesture.current.distance));
    } else if (values.length === 1 && zoom > 1 && !markerMode) {
      setPan({ x: gesture.current.panX + event.clientX - gesture.current.x, y: gesture.current.panY + event.clientY - gesture.current.y });
    }
  };
  const pointerUp = event => { pointers.current.delete(event.pointerId); };
  const placeMarker = (x, y) => {
    if (readOnly || !markerMode || (photo.markers || []).length >= maxMarkers) return;
    onMarkersChange?.([...(photo.markers || []), { id: newId("marker"), x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }]);
  };
  const addMarker = event => {
    if (moved.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    /* Ein Klick auf den schwarzen Rand liegt NICHT auf dem Foto. Er wird
       nicht an den Bildrand geklemmt — ein Marker dort waere eine Angabe
       ueber eine Stelle, die es auf dem Bild nicht gibt. */
    const imFoto = ausFenster({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }, bemalt);
    if (!imFoto) return;
    placeMarker(imFoto.x, imFoto.y);
  };
  const keyboard = event => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom(value => clampZoom(value + 0.5)); }
    else if (event.key === "-") { event.preventDefault(); setZoom(value => clampZoom(value - 0.5)); }
    else if (event.key.toLowerCase() === "m" && !readOnly) { event.preventDefault(); setMarkerMode(value => !value); }
    else if (event.key === "Enter" && markerMode) { event.preventDefault(); placeMarker(0.5, 0.5); }
    else if (event.key === "0") { event.preventDefault(); reset(); }
  };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  /* Das Editorfenster hat ein festes Seitenverhaeltnis, das Foto nicht.
     Mit `object-fit: contain` liegt das Bild mit Raendern darin — und alles,
     was in Prozent des FENSTERS positioniert wird, sitzt daneben. Im
     Browser nachgemessen: Rahmen 275,1 px statt 116,1 px bei 900x1600.
     Deshalb wird die bemalte Flaeche aus der natuerlichen Bildgroesse
     bestimmt und Rahmen, Marker und Klickauswertung darauf bezogen. */
  /* BEFUND der Gegenpruefung an rc.4.41, zutreffend: der Wechsel zwischen
     zwei Eintraegen DESSELBEN Fotos loeschte die bekannten Abmessungen.
     Weil die Bildquelle gleich blieb, loeste das kein erneutes Laden aus —
     `onLoad` kam nie, und der Rahmen fiel auf die alte Fenstergeometrie
     zurueck: gemessen 76 % statt 32,0625 % der Fensterbreite.

     Blind zu loeschen ist falsch, blind zu behalten auch: die
     Abmessungen eines ANDEREN Fotos waeren genauso daneben. Gelesen wird
     deshalb das Bildelement selbst — ist es bereits geladen, stehen die
     Abmessungen sofort zur Verfuegung; ist es das nicht, gilt "unbekannt",
     bis `onLoad` kommt. */
  const [natur, setNatur] = useState(null);
  const bildRef = useRef(null);
  const lies = element => {
    if (element?.complete && element.naturalWidth > 0) {
      setNatur({ w: element.naturalWidth, h: element.naturalHeight });
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (!lies(bildRef.current)) setNatur(null);
  }, [photo.id, photo.image]);
  const bemalt = bemalteFlaeche(natur?.w, natur?.h);
  const rahmen = rechteckAufFenster(photo.pruefflaeche ?? FLAECHE_VORGABE, bemalt);
  return <div className="photo-editor">
    <div className="zoom-viewport" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <div className="zoom-layer" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <img src={photo.image} alt={t("photo")} ref={bildRef}
          onLoad={event => lies(event.currentTarget)}/>
        <button type="button" className={`image-interaction-layer ${markerMode ? "marker-active" : ""}`} aria-label={`${t("photo")} · ${t("zoomIn")} / ${t("markerMode")}`} onClick={addMarker} onDoubleClick={() => setZoom(value => value === 1 ? 2 : 1)} onKeyDown={keyboard}/>
        {/* Der Rahmen der Prueffläche liegt UEBER dem Bild, damit sichtbar
            ist, was tatsaechlich bewertet wird. Er ist kein Bedienelement —
            gesetzt wird er mit den Reglern darunter, die mit Handschuhen
            zuverlaessiger zu treffen sind als ein Ziehgriff. */}
        {onFlaecheChange && <span className="flaeche-rahmen" aria-hidden="true" style={{
          left: `${rahmen.x * 100}%`, top: `${rahmen.y * 100}%`,
          width: `${rahmen.w * 100}%`, height: `${rahmen.h * 100}%`,
        }}/>}
        {(photo.markers || []).map((marker, index) => <button type="button" className="image-marker" key={marker.id} style={{ left: `${aufFenster(marker, bemalt).x * 100}%`, top: `${aufFenster(marker, bemalt).y * 100}%` }} aria-label={`${t("markerMode")} ${index + 1}${readOnly ? "" : ` · ${t("removePhoto")}`}`} onClick={event => { event.stopPropagation(); if (!readOnly) onMarkersChange(photo.markers.filter(item => item.id !== marker.id)); }}>{index + 1}</button>)}
      </div>
    </div>
    <div className="editor-toolbar">
      <IconButton label={t("zoomOut")} icon={ZoomOut} onClick={() => setZoom(value => clampZoom(value - 0.5))}/>
      <button type="button" className="zoom-readout" onClick={reset} aria-label={t("resetZoom")}>{zoom.toFixed(1)}×</button>
      <IconButton label={t("zoomIn")} icon={ZoomIn} onClick={() => setZoom(value => clampZoom(value + 0.5))}/>
      {!readOnly && <Button icon={ScanLine} variant={markerMode ? "warning" : "secondary"} onClick={() => setMarkerMode(value => !value)}>{markerMode ? t("markerOn") : t("markerMode")}</Button>}
    </div>
    {!readOnly && markerMode && <p className="editor-hint">{t("markerHint")}</p>}
    {!readOnly && onFlaecheChange
      && <PruefflaechePanel flaeche={photo.pruefflaeche} quelle={photo.flaechenQuelle}
        onChange={onFlaecheChange} t={t}/>}
    {(photo.markers || []).length > 0 && <div className="marker-coordinate-strip" aria-label={t("markers")}>{photo.markers.map((marker, index) => <span key={marker.id}>{index + 1}: {Math.round(marker.x * 100)}% x · {Math.round(marker.y * 100)}% y</span>)}</div>}
  </div>;
}

const MAX_PHOTO_BYTES = 1024 * 1024;
const dataUrlBytes = value => Math.ceil((String(value).split(",")[1]?.length || 0) * 0.75);

function compressPhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        let width = image.naturalWidth; let height = image.naturalHeight;
        if (!width || !height) throw new Error("Bild besitzt keine gültigen Dimensionen");
        const initialScale = Math.min(1, 1600 / Math.max(width, height));
        width = Math.max(1, Math.round(width * initialScale)); height = Math.max(1, Math.round(height * initialScale));
        const canvas = document.createElement("canvas"); let quality = .86; let result = "";
        for (let attempt = 0; attempt < 20; attempt++) {
          canvas.width = width; canvas.height = height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
          result = canvas.toDataURL("image/jpeg", quality);
          if (dataUrlBytes(result) <= MAX_PHOTO_BYTES) { resolve(result); return; }
          if (quality > .54) quality -= .08;
          else { width = Math.max(1, Math.round(width * .82)); height = Math.max(1, Math.round(height * .82)); quality = .78; }
        }
        if (dataUrlBytes(result) > MAX_PHOTO_BYTES) throw new Error("Bild konnte nicht unter 1 MB komprimiert werden");
        resolve(result);
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    image.src = dataUrl;
  });
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Nur Bilddateien sind erlaubt")); return; }
    if (file.size > 25 * 1024 * 1024) { reject(new Error("Bilddatei ist grösser als 25 MB")); return; }
    const reader = new FileReader(); reader.onload = () => compressPhoto(reader.result).then(resolve, reject); reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden")); reader.readAsDataURL(file);
  });
}

/**
 * Aufnahmebildschirm — mit optionaler geführter Sequenz (P3).
 *
 * Ohne `sequenz` verhält er sich wie bisher: bis zu zehn freie Aufnahmen.
 *
 * MIT `sequenz` führt er durch die drei Lichtpositionen. Bewusst DERSELBE
 * Bildschirm und nicht ein zweiter: Kamera, Hochladen, Marker und das
 * Stoppen des Streams beim Verlassen gibt es dann nur einmal. Ein zweiter
 * Aufnahmebildschirm hätte früher oder später eine eigene Kamerafassung —
 * und die Wettlaufsituation aus rc.4.5 ein zweites Mal.
 */
export function MultiCapture({ photos, setPhotos, title, subtitle, reference, onBack, onAnalyze, minPhotos = 1, maxPhotos = 10, t, sequenz = null, zoneId = null, onSequenz = null, onSequenzStart = null }) {
  const [selected, setSelected] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef(null); const streamRef = useRef(null); const fileRef = useRef(null);
  const mountedRef = useRef(true);
  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; if (mountedRef.current) setCameraOpen(false); }, []);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stopCamera(); }; }, [stopCamera]);
  useEffect(() => { if (selected >= photos.length) setSelected(Math.max(0, photos.length - 1)); }, [photos.length, selected]);
  /* ── P3 · geführter Ablauf ────────────────────────────────────────────
     Der offene Schritt kommt aus aufnahmeSequenz.js, nicht aus einer
     Zählung hier. Sonst gäbe es zwei Auffassungen davon, was als Nächstes
     dran ist. */
  const gefuehrt = Boolean(sequenz);
  /* Die Sequenz gehoert an EINE Zone. Zeigt der Bildschirm eine andere,
     stimmt etwas im Ablauf nicht — dann wird nicht weiter aufgenommen,
     sondern gesagt, was los ist. Stillschweigend weiterzulaufen hiesse,
     eine Serie unter dem Namen einer Stelle zu fuehren, an der sie nicht
     entstanden ist. */
  const zoneWechsel = gefuehrt && zoneId != null && sequenz.zoneId != null
    && sequenz.zoneId !== zoneId;
  const offenePosition = gefuehrt ? naechsteLichtposition(sequenz) : null;
  const sequenzStand = gefuehrt ? sequenzStatus(sequenz) : null;
  const schritt = offenePosition ? schrittZu(offenePosition) : null;
  const grenze = gefuehrt ? SEQUENZ_SCHRITTE.length : maxPhotos;

  const addSources = useCallback(sources => {
    setPhotos(current => {
      const frei = Math.max(0, (sequenz ? SEQUENZ_SCHRITTE.length : maxPhotos) - current.length);
      const neue = sources.slice(0, frei).map(image => ({
        id: newId("photo"), image, markers: [],
        /* Die Lichtposition wird beim Aufnehmen festgehalten, nicht
           nachträglich zugeordnet. Eine nachträgliche Zuordnung wäre eine
           Erinnerung, keine Erfassung. */
        ...(sequenz ? { lichtposition: naechsteLichtposition(sequenz) } : {}),
      }));
      if (sequenz && onSequenz && neue.length) {
        onSequenz(neue[0].id, neue[0].lichtposition);
      }
      return [...current, ...neue];
    });
  }, [maxPhotos, setPhotos, sequenz, onSequenz]);
  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream; setCameraOpen(true);
      /* Der Stream wird NICHT hier angehaengt. Siehe den Effekt unten. */
    } catch { setCameraError(t("cameraUnavailable")); }
  };

  /* ─── RC4.5 · Warum das ein Effekt ist und kein requestAnimationFrame ───
     Bis 8.3.0-rc.4.4 wurde der Stream in einem einzelnen rAF direkt nach
     setCameraOpen(true) angehaengt. React 18 garantiert aber nicht, dass der
     DOM-Commit vor diesem Frame liegt: laeuft der Callback zu frueh, ist
     videoRef.current noch null, die Zuweisung faellt still aus, und das
     Panel zeigt ein leeres Video — Bild schwarz, "Kamera stoppen" aktiv.
     Eine Wettlaufsituation, deshalb "oft" und nicht "immer".

     Ein Effekt auf cameraOpen laeuft nach dem Commit. Das Element existiert
     dann garantiert. Und play() wird nicht mehr stillschweigend verschluckt:
     ein schwarzes Bild ohne Meldung ist fuer den Pruefer nicht deutbar. */
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOpen || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(error => setCameraError(`${t("cameraUnavailable")} (${error?.name || error})`));
  }, [cameraOpen, t]);
  const shoot = async () => {
    const video = videoRef.current; if (!video || photos.length >= grenze) return;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    try {
      canvas.getContext("2d").drawImage(video, 0, 0); addSources([await compressPhoto(canvas.toDataURL("image/jpeg", .88))]); setSelected(photos.length); setError("");
    } catch (caught) { setError(caught.message); }
  };
  const selectFiles = async event => {
    try {
      const files = [...(event.target.files || [])].slice(0, maxPhotos - photos.length);
      addSources(await Promise.all(files.map(fileAsDataUrl))); setSelected(photos.length); setError("");
    } catch (caught) { setError(caught.message); }
    event.target.value = "";
  };
  const selectedPhoto = photos[selected];
  const remove = () => setPhotos(current => current.filter(item => item.id !== selectedPhoto.id));
  const updateMarkers = markers => setPhotos(current => current.map(item => item.id === selectedPhoto.id ? { ...item, markers } : item));
  /* Die Prueffläche gehoert zum FOTO, nicht zum Bildschirm: sie wandert
     mit in die Analyse und von dort in den Datensatz. `quelle` haelt
     fest, ob der Pruefer sie gesetzt hat oder ob die Voreinstellung
     unangetastet geblieben ist — das ist ein Unterschied, den der Bericht
     spaeter ausweisen muss. */
  const updateFlaeche = (flaeche, quelle) => setPhotos(current => current.map(item =>
    item.id === selectedPhoto.id
      ? { ...item, pruefflaeche: flaeche, flaechenQuelle: quelle } : item));
  const otherMarkerCount = photos.reduce((sum, photo) => photo.id === selectedPhoto?.id ? sum : sum + (photo.markers || []).length, 0);
  const markerLimit = Math.max(0, Math.min(5, 20 - otherMarkerCount));
  /* Im geführten Ablauf ist die Analyse gesperrt, solange eine
     Lichtposition fehlt. Nicht als Warnung, sondern als Sperre: eine
     unvollständige Sequenz ist keine Sequenz, und ein Hinweis, den man
     wegklicken kann, ist keine Vorbedingung. */
  const analyseFrei = gefuehrt
    ? Boolean(sequenzStand?.vollstaendig) && !zoneWechsel
    : photos.length >= minPhotos;
  const startAnalysis = () => {
    if (!analyseFrei) { setError(gefuehrt ? t("sequenzOffen") : t("noPhotos")); return; }
    stopCamera(); onAnalyze();
  };
  const lichtName = pos => t(`licht_${pos || "UNBEKANNT"}`);
  return <section className="screen"><ScreenHeader title={gefuehrt ? t("sequenzTitel") : title} subtitle={subtitle || `${photos.length}/${grenze} ${t("photos")}`} onBack={() => { stopCamera(); onBack(); }} t={t}/>
    {zoneWechsel && <div className="alert alert-error" role="alert">
      <AlertTriangle size={17}/>{t("sequenzZoneWechsel")}</div>}
    {!gefuehrt && onSequenzStart && <div className="capture-actions">
      <Button icon={Sun} onClick={onSequenzStart}>{t("sequenzStarten")}</Button>
    </div>}
    {gefuehrt && <section className="panel sequenz-panel" aria-label={t("sequenzTitel")}>
      <p className="field-hint">{t("sequenzHinweis")}</p>
      {schritt
        ? <>
          <p className="sequenz-schritt"><strong>
            {t("sequenzSchritt")} {schritt.reihenfolge} {t("sequenzVon")} {SEQUENZ_SCHRITTE.length}
            {": "}{lichtName(schritt.lichtposition)}
          </strong></p>
          <p>{t(schritt.anleitung)}</p>
        </>
        : <p className="sequenz-schritt"><strong>{t("sequenzFertig")}</strong></p>}
      <ol className="sequenz-liste">
        {SEQUENZ_SCHRITTE.map(s => {
          const da = (sequenz.captures || []).some(c => c.lichtposition === s.lichtposition);
          return <li key={s.lichtposition} className={da ? "sequenz-da" : "sequenz-offen"}>
            {da ? <CheckCircle size={16} aria-hidden="true"/> : <HelpCircle size={16} aria-hidden="true"/>}
            <span>{lichtName(s.lichtposition)}</span>
            <span className="sequenz-status">{da ? t("statusPass") : t("sequenzOffen")}</span>
          </li>;
        })}
      </ol>
    </section>}
    {reference !== undefined && <ReferencePreview reference={reference} current={selectedPhoto?.image} t={t}/>}
    {cameraOpen && <div className="camera-panel"><video ref={videoRef} muted playsInline autoPlay/><div className="camera-actions"><Button icon={Camera} variant="primary" disabled={photos.length >= grenze} onClick={shoot}>{t("takePhoto")}</Button><Button icon={X} onClick={stopCamera}>{t("cameraStop")}</Button></div></div>}
    {!cameraOpen && <div className="capture-actions"><Button icon={Camera} variant="primary" onClick={startCamera}>{t("cameraStart")}</Button><Button icon={Upload} onClick={() => fileRef.current?.click()}>{t("uploadPhotos")}</Button><input className="sr-only" ref={fileRef} type="file" accept="image/*" multiple aria-label={t("uploadPhotos")} onChange={selectFiles}/></div>}
    {cameraError && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>{cameraError}</div>}
    {selectedPhoto ? <><ZoomMarkerViewer photo={selectedPhoto} onMarkersChange={updateMarkers} onFlaecheChange={updateFlaeche} maxMarkers={markerLimit} t={t}/>
      <div className="thumbnail-strip" aria-label={t("photos")}>{photos.map((photo, index) => <div className="thumbnail-wrap" key={photo.id}><button type="button" className={index === selected ? "thumbnail active" : "thumbnail"} onClick={() => setSelected(index)} aria-label={`${t("photo")} ${index + 1}${photo.lichtposition ? ` \u00b7 ${lichtName(photo.lichtposition)}` : ""}`}><img src={photo.image} alt=""/><span>{index + 1}</span>{photo.lichtposition && <small className="thumbnail-licht">{lichtName(photo.lichtposition)}</small>}</button><button type="button" className="thumbnail-remove" aria-label={`${t("removePhoto")} ${index + 1}`} onClick={() => setPhotos(current => current.filter(item => item.id !== photo.id))}><X size={14}/></button></div>)}</div>
      <Button icon={Trash2} variant="danger" onClick={remove}>{t("removePhoto")}</Button></> : <div className="empty-state"><ImagePlus size={38} aria-hidden="true"/><p>{t("noPhotos")}</p><small>{t("maxPhotos")}</small></div>}
    {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
    {/* BEFUND der Gegenpruefung an rc.4.40 (IMG_6516): "Analyse starten"
        lag als klebende Schaltflaeche UEBER dem Kamerabild und verdeckte
        Ausloeser und "Kamera stoppen". Waehrend der Aufnahme muessen genau
        diese beiden frei erreichbar bleiben — die Analyse kommt danach.

        Bei geoeffneter Kamera klebt die Schaltflaeche deshalb nicht,
        sondern steht im Fluss unterhalb der Kamerabedienung. Sie
        verschwindet nicht: sie liegt nur nicht mehr darueber. */}
    <div className={cameraOpen ? "analyse-aktion" : "sticky-action"}>
      <Button icon={BarChart2} variant="primary" disabled={!analyseFrei} onClick={startAnalysis}>{t("analyze")}</Button>
    </div>
  </section>;
}

function AnalysisProgress({ current, total, t }) {
  const percent = total ? Math.round(current / total * 100) : 0;
  return <section className="screen analysis-progress" aria-live="polite"><div className="spinner" aria-hidden="true"/><h1>{t("analyzing")}…</h1><p>{t("photo")} {Math.min(current + 1, total)}/{total}</p><div className="progress-track"><div style={{ width: `${percent}%` }}/></div></section>;
}

/* ─── RC3: Prüfpunkte einzeln anzeigen ─────────────────────────────────────
   Bis RC2 zeigte der Ergebnisschirm drei Sammelurteile. Kratzer, Korrosion
   und Oberflächenstruktur lagen gemeinsam unter "Intakt" und konnten sich
   gegenseitig verdecken; ein nicht belegbares "trocken" war von einem
   belegten nicht zu unterscheiden. Diese Liste macht beides sichtbar.   */
function CheckpointList({ checkpoints, language, t }) {
  const list = Array.isArray(checkpoints) ? checkpoints : [];
  if (!list.length) return null;
  const klasse = status => status === STATUS.PASS ? "checkpoint-pass"
    : status === STATUS.FAIL ? "checkpoint-fail" : "checkpoint-open";
  const label = status => status === STATUS.PASS ? t("statusPass")
    : status === STATUS.FAIL ? t("statusFail") : t("statusNotAssessable");
  const symbol = status => status === STATUS.PASS ? <CheckCircle size={19} aria-hidden="true"/>
    : status === STATUS.FAIL ? <XCircle size={19} aria-hidden="true"/>
      : <HelpCircle size={19} aria-hidden="true"/>;
  return <section className="panel checkpoint-panel" aria-label={t("checkpoints")}>
    <h3>{t("checkpoints")}</h3>
    <p className="field-hint">{t("checkpointsHint")}</p>
    <ul className="checkpoint-list">{list.map(point => <li key={point.id} className={klasse(point.status)}>
      <span className="checkpoint-icon">{symbol(point.status)}</span>
      <div>
        <strong>{point.label?.[language === "en" ? "en" : "de"] || point.id}</strong>
        <span className="checkpoint-status">{label(point.status)}{point.code ? ` · ${point.code}` : ""}</span>
        <p>{point.message?.[language === "en" ? "en" : "de"]}</p>
        {/* Historischer Befundtext: der Datensatz bleibt unangetastet —
            Pruefpunkttexte werden mitgespeichert, und ein nachtraeglich
            umgeschriebener GMP-Datensatz waere der schwerere Fehler. Der
            Hinweis steht deshalb DANEBEN und ist als Zusatz erkennbar,
            nicht als Teil des Originalbefunds.

            Erkannt wird er am gespeicherten TEXT, nicht am Datum und nicht
            an appVersion: ein Erstellungsdatum belegt keine App-Version,
            und ein fehlendes Versionsfeld belegt gar nichts. */}
        {istAltbefund(point.code, point.message?.[language === "en" ? "en" : "de"])
          && <small className="checkpoint-historic">
            {ALTBEFUND_HINWEIS[language === "en" ? "en" : "de"]}
          </small>}
        {point.reason && <small className="checkpoint-reason">{point.reason}</small>}
        {(point.actions || []).length > 0 && <div className="action-hint">{t("nextActions")}: {point.actions.map(action => action[language === "en" ? "en" : "de"]).join(" · ")}</div>}
        {point.manual && <small className="checkpoint-manual">{point.manual.method} · {point.manual.user} · {point.manual.timestamp}</small>}
      </div>
    </li>)}</ul>
  </section>;
}

function VerdictCard({ criterion, verdict, checkpoints = null, altbestand = false, language, t }) {
  const shown = verdictDisplay(verdict, criterion, language);
  /* MASSGEBLICH ist der Pruefpunkt, nicht der Rohbefund des Kerns.
     Der Rohbefund springt nur fuer einen NACHWEISLICHEN Altbestand ein —
     dieselben zwei Bedingungen wie in kriteriumKurz (F8/F9): das
     Datenformat weist ihn als alt aus, UND es gibt ueberhaupt keine
     Pruefpunktliste. Ein neuer Datensatz mit Luecke bekommt hier kein
     gruenes Feld, sondern "nicht bewertbar". */
  const status = kriteriumStatus(checkpoints, criterion);
  const liste = Array.isArray(checkpoints) ? checkpoints : null;
  const historisch = status === null && altbestand && (liste === null || liste.length === 0);
  const gruen = status === null ? (historisch && verdict.pass) : status === STATUS.PASS;
  const nichtBewertbar = status === STATUS.NOT_ASSESSABLE || (status === null && !historisch);
  const klasse = nichtBewertbar ? "verdict-unknown" : gruen ? "verdict-pass" : "verdict-fail";
  return <article className={`verdict-card ${klasse}`}>
    <span className="verdict-icon">{nichtBewertbar
      ? <HelpCircle size={24} aria-hidden="true"/>
      : gruen ? <CheckCircle size={24} aria-hidden="true"/> : <XCircle size={24} aria-hidden="true"/>}</span>
    <div><h3>{t(criterion)}</h3>
      <strong>{nichtBewertbar ? t("statusNotAssessable") : shown.message}</strong>
      {/* Der Rohbefund bleibt sichtbar — aber ausdruecklich ALS Rohbefund.
          Er darf nie wie ein Ergebnis aussehen. */}
      <p>{nichtBewertbar
        ? <><span className="rohbefund-marke">{t("rohbefund")}</span>{" "}{shown.message} · {shown.detail}</>
        : shown.detail}</p>
      {!gruen && !nichtBewertbar && shown.action && <div className="action-hint">{shown.action}</div>}</div>
    <div className="severity-block"><span className="severity" aria-hidden="true">{verdict.severity || 0}</span><small className="severity-note">{t("findingIndex")}</small></div>
  </article>;
}

/**
 * Die beschrifteten Anzeigeebenen eines Fotos.
 *
 * Bis rc.4.37 leitete das Overlay die Sichtbarkeit jeder Maske aus GENAU
 * EINEM Urteilscode ab. Weil die Urteilskette nur einen Sauberkeitscode
 * liefert, schlossen warme und farbneutrale Auffaelligkeiten sich in der
 * Anzeige gegenseitig aus, obwohl der Kern beide gerechnet hatte.
 *
 * Drei Zustaende, drei verschiedene Aussagen, und sie stehen im Klartext
 * da statt nur in einer Farbe:
 *   eingeblendet          traegt das Urteil dieses Kriteriums
 *   zuschaltbar           berechnet, Zusatzhinweis, KEIN zweites Urteil
 *   nicht erkannt         die Maske ist leer
 *
 * Eine zugeschaltete Rohmaske aendert kein Urteil, erzeugt kein FAIL und
 * gilt nicht als bestaetigter Schmutz.
 */
function EbenenSchalter({ ebenen, aktiv, setAktiv, language, t }) {
  const de = language !== "en";
  if (!Array.isArray(ebenen) || !ebenen.length) return null;
  const zeigbar = ebenen.filter(e => e.status !== EBENEN_STATUS.NICHT_ERKANNT);
  const leer = ebenen.filter(e => e.status === EBENEN_STATUS.NICHT_ERKANNT);
  const umschalten = id => setAktiv(aktiv.includes(id)
    ? aktiv.filter(x => x !== id) : [...aktiv, id]);
  return <section className="overlay-layers">
    <h3>{t("layers")}</h3>
    <p className="layer-note">{t("layersNote")}</p>
    <ul className="layer-list">
      {zeigbar.map(ebene => {
        const an = aktiv.includes(ebene.id);
        const zusatz = ebene.status === EBENEN_STATUS.ZUSATZHINWEIS;
        return <li key={ebene.id}>
          <button type="button" className={`layer-toggle${an ? " layer-on" : ""}`}
            aria-pressed={an} onClick={() => umschalten(ebene.id)}>
            {an ? <Eye size={16} aria-hidden="true"/> : <EyeOff size={16} aria-hidden="true"/>}
            <span className="layer-name">{de ? ebene.de : ebene.en}</span>
            <span className={`layer-state${zusatz ? " layer-extra" : ""}`}>
              {an ? t("layerShown") : t("layerHidden")}
              {zusatz ? ` · ${t("layerAdvisory")}` : ` · ${t("layerVerdictBearing")}`}
            </span>
          </button>
          <small className="layer-origin">{ebenenText(ebene, de ? "de" : "en")}</small>
          <small className="layer-origin">{t("layerOrigin")}: {de ? ebene.herkunftDe : ebene.herkunftEn}</small>
        </li>;
      })}
      {leer.map(ebene => <li key={ebene.id} className="layer-empty">
        <span className="layer-name">{de ? ebene.de : ebene.en}</span>
        <span className="layer-state">{t("layerNotDetected")}</span>
      </li>)}
    </ul>
  </section>;
}

/**
 * Der Geltungsbereich eines Befunds.
 *
 * Ohne diesen Satz wird aus "in diesem Ausschnitt nichts gefunden"
 * stillschweigend "das Teil ist sauber". Er steht deshalb am Bild, im
 * Datensatz und im Protokoll — aus derselben Quelle.
 */
function GeltungsHinweis({ eintrag, language, t }) {
  const de = language !== "en";
  return <p className="geltungsbereich">
    <Crop size={15} aria-hidden="true"/>{" "}
    <strong>{t("inspectionArea")}:</strong>{" "}
    {geltungstext(eintrag, de ? "de" : "en")}
  </p>;
}

function ResultPhotoCarousel({ photos, selected, setSelected, language = "de", t }) {
  const photo = photos[selected];
  const ebenen = photo?.rawResult?._ov?.ebenen || [];
  /* Die Voreinstellung ist genau das Bild von rc.4.37: die urteilstragenden
     Ebenen. Beim Fotowechsel wird sie neu gesetzt, weil die Ebenen eines
     anderen Fotos einen anderen Bestand haben. */
  const [aktiv, setAktiv] = useState(() => overlayStandardEbenen(photo?.rawResult?._ov));
  useEffect(() => {
    setAktiv(overlayStandardEbenen(photos[selected]?.rawResult?._ov));
  }, [selected, photos]);
  if (!photo) return null;
  const photoPassed = photo.result.dry.pass && photo.result.clean.pass && photo.result.intact.pass;
  const okCount = photos.filter(item => item.result.dry.pass && item.result.clean.pass && item.result.intact.pass).length;
  return <div className={`result-photo-viewer ${photoPassed ? "photo-pass" : "photo-fail"}`}>
    {/* Gezeichnet wird auf dem ZUSCHNITT. Das volle Foto laege um den
        Zuschnittversatz neben den Masken. Faellt der Zuschnitt aus (alte
        Datensaetze), bleibt das Originalfoto — dann stimmt das Overlay,
        weil dort auch ohne Begrenzung gerechnet wurde. */}
    <OverlayCanvas source={photo.rawResult.zuschnittBild || photo.image} overlay={photo.rawResult._ov} markers={photo.gezeichneteMarker ?? photo.markers} aktiveEbenen={aktiv} label={`${t("photo")} ${selected + 1} · Overlay`}/>
    <GeltungsHinweis eintrag={photo.rawResult.pruefflaeche} language={language} t={t}/>
    <EbenenSchalter ebenen={ebenen} aktiv={aktiv} setAktiv={setAktiv} language={language} t={t}/>
    <div className="carousel-controls"><IconButton label={t("back")} icon={ChevronLeft} onClick={() => setSelected((selected - 1 + photos.length) % photos.length)}/>
      <div className="carousel-dots">{photos.map((item, index) => <button type="button" key={item.id} className={index === selected ? "dot active" : "dot"} onClick={() => setSelected(index)} aria-label={`${t("photo")} ${index + 1}`}><span className="sr-only">{index + 1}</span></button>)}</div>
      <IconButton label="Next" icon={ChevronRight} onClick={() => setSelected((selected + 1) % photos.length)}/></div>
    {/* Kurzstatus aus den PRUEFPUNKTEN. Bis rc.4.44 stand hier der
         Rohbefund: "T PASS" neben einem nicht bewertbaren Feuchtepunkt. */}
      <div className="photo-verdict-chips">{["dry", "clean", "intact"].map(kriterium => {
        const kurz = kriteriumKurz(photo.result.checkpoints,
          kriterium, photo.result[kriterium].pass);
        const buchstabe = kriterium === "dry" ? "T" : kriterium === "clean" ? "S" : "I";
        return <span key={kriterium}
          className={kurz === "PASS" ? "pass" : kurz === "FAIL" ? "fail" : "unknown"}>
          {buchstabe} {kurz}</span>;
      })}</div>
    <p className="photo-summary"><strong>{okCount}/{photos.length}</strong> OK · <strong>{photos.length - okCount}/{photos.length}</strong> FAIL</p>
    {(photo.markerAssessments || []).length > 0 && <section className="marker-results"><h3>{t("markers")}</h3>{photo.markerAssessments.map((finding, index) => <div key={photo.markers[index]?.id || index}><span>{index + 1}</span><strong>{finding.code === "UNREMARKABLE" ? t("unremarkable") : t("finding")}</strong><small>{finding.code} · {t("findingIndex")} {finding.severity}</small></div>)}</section>}
    {photo.knownIssueInfo && <div className={`alert ${photo.knownIssueInfo.status === "unveraendert" ? "alert-warning" : "alert-error"}`}><ShieldCheck size={17}/>{photo.knownIssueInfo.status === "unveraendert" ? "Known Issue: unverändert / unchanged" : `Known Issue: ${photo.knownIssueInfo.status}`}</div>}
  </div>;
}

const QUICK_COMMENTS = [
  ["Erneute Reinigung eingeleitet", "Repeat cleaning initiated"], ["Teil wird ersetzt", "Part will be replaced"],
  ["Wartungsauftrag erstellt", "Maintenance order created"], ["Nach 2. Reinigung freigegeben", "Released after second cleaning"],
  ["Gemäss SOP akzeptabel", "Acceptable according to SOP"], ["Bekannte Auffälligkeit – unverändert (Known Issue)", "Known issue – unchanged"],
  ["QA informiert", "QA informed"], ["Referenzbild verglichen – akzeptabel", "Reference image compared – acceptable"],
  ["Lichtbedingungen haben Analyse beeinflusst", "Lighting conditions affected the analysis"],
];

export function ResultScreen({ mode, equipment, zone, photos, aggregate, systemDecision, reference, swabData, language, user, comment, setComment, onDecision, onOverride, onKnownIssue, onSwab, onDone, t, retakes = [], onAddRetake, fusionScore = null, knownIssueAssignments = [], onAssignKnownIssue, onDeferQa, qaTriggerAnzahl = 0, screening = null,
  depthMeasurements = [], onDepthMeasurement = null,
  schadensverdachte = [], onSchadensverdacht = null, onBeurteilenVerdacht = null }) {
  /* Drei Lagen, drei Wirkungen — dieselbe Unterscheidung wie in
     lifecycle.js und persistence.js. Die verbindliche Sperre steht dort;
     hier wird nur nicht angeboten, was unten zwingend scheitert.

     offen (unbeurteilt oder "weitere Pruefung noetig")  PASS und Override
     bestaetigter Schaden                                PASS
     kein Schaden                                        nichts */
  const verdachtOffenAnzahl = offeneSchadensverdachte(schadensverdachte).length;
  const bestaetigteSchadenAnzahl = bestaetigteSchaeden(schadensverdachte).length;
  const passGesperrt = verdachtOffenAnzahl > 0 || bestaetigteSchadenAnzahl > 0;
  /* Dieselbe Berechnung wie im Erzeuger — nicht "gibt es Retakes". */
  const qaPflichtig = Boolean(onDeferQa) && qaTriggerAnzahl > 0;
  const [selected, setSelected] = useState(0);
  const failed = systemDecision.status === "FAIL";
  const critical = systemDecision.reason === "CRITICAL_LIGHT";
  /* Ein nicht bewertbarer Pflicht-Prüfpunkt ist kein Fehler, aber auch keine
     Freigabe. Er verlangt eine dokumentierte Entscheidung - deshalb greift
     hier dieselbe Kommentarpflicht wie bei einem FAIL. */
  const offenePunkte = (systemDecision.notAssessable || []);
  const nichtBewertbar = offenePunkte.length > 0;
  const commentValid = (!failed && !nichtBewertbar) || comment.trim().length > 0;
  const statusClass = failed ? "status-fail" : systemDecision.status === "WARNING" ? "status-warning" : "status-pass";
  const statusLabel = failed ? t("failed") : systemDecision.status === "WARNING" ? t("warning") : t("passed");
  const selectedPhoto = photos[selected];
  const utilityMode = mode !== "inspect";
  const addQuickComment = value => setComment(current => current ? `${current}; ${value}` : value);
  return <section className="screen"><ScreenHeader title={t("result")} subtitle={`${equipmentName(equipment, language)} · ${zoneName(zone, language)}`} onBack={onDone} t={t}/>
    <div className={`status-banner ${statusClass}`}>{failed ? <XCircle size={28}/> : systemDecision.status === "WARNING" ? <AlertTriangle size={28}/> : <CheckCircle size={28}/>}<div><span>{t("overall")}</span><strong>{statusLabel}</strong><small>{systemDecision.reason}</small></div></div>
    {critical && <div className="alert alert-error"><Sun size={18}/>{t("criticalLight")}</div>}
    {nichtBewertbar && <div className="alert alert-warning" role="status"><HelpCircle size={18}/>{t("notAssessableBanner")}</div>}
    {fusionScore?.status === "NON_PLANAR_ZONE" && <div className="alert alert-warning" role="status"><AlertTriangle size={18}/>{t("fusionNonPlanar")}</div>}
    {fusionScore?.status === "NO_DETECTOR" && <div className="alert alert-warning" role="status"><AlertTriangle size={18}/>{t("fusionNoDetector")}</div>}
    {fusionScore?.warning?.code === "POSE_SPREAD_TOO_SMALL" && <div className="alert alert-warning" role="status"><AlertTriangle size={18}/>{t("fusionPoseSpread")}</div>}
    {(fusionScore?.fuse?.excluded || []).length > 0 && <div className="alert alert-warning" role="status"><AlertTriangle size={18}/>{t("fusionExcluded")}: {(fusionScore.fuse.excluded || []).map(e => `#${e.sequenceIndex} ${e.reason}`).join(" · ")}</div>}
    <ResultPhotoCarousel photos={photos} selected={selected} setSelected={setSelected} language={language} t={t}/>
    {mode === "inspect" && <ReferencePreview reference={reference} current={selectedPhoto?.annotatedImage || selectedPhoto?.image} t={t}/>}
    <CheckpointList checkpoints={aggregate.checkpoints} language={language} t={t}/>
    <CaptureProfileNote photos={photos} t={t}/>
    {/* Die Verdachtsstellen gehoeren VOR die Entscheidung, nicht erst in
        die Detailansicht des gespeicherten Datensatzes. Wer hier steht,
        kann noch nachsehen, nachfotografieren oder ablehnen; wer den
        Datensatz oeffnet, hat bereits unterschrieben (U27).

        Dieselbe Uebersicht wie im Datensatz, aus derselben Quelle
        (screeningUebersicht) — der Bildschirm zeigt nicht mehr und nicht
        weniger als das spaetere Protokoll. Das Screening fuegt nur hinzu
        und sortiert; es aendert kein Urteil (SC-01/SC-02). */}
    <ScreeningPanel screening={screening} t={t} fotos={photos}
      onAuswahl={onDepthMeasurement ? () => {} : null}
      onMessung={onDepthMeasurement} messungen={depthMeasurements}
      benutzer={user}/>
    {/* Der uebersehene Befund. Bewusst NEBEN dem Screening und nicht darin:
        der interessante Fall ist der, in dem das Screening gar keinen
        Kandidaten hat — dann kehrt ScreeningPanel frueh zurueck, und ein
        Weg, der darin haengt, waere genau dort nicht erreichbar. */}
    {onDepthMeasurement && <UebersehenePanel fotos={photos}
      verdachte={schadensverdachte} onVerdacht={onSchadensverdacht}
      messungen={depthMeasurements} onMessung={onDepthMeasurement}
      benutzer={user} t={t}/>}
    {onAddRetake && <KnownIssueAssignPanel photos={photos} assignments={knownIssueAssignments} onAssign={onAssignKnownIssue} user={user} t={t}/>}
    {onAddRetake && <ActionPanel photos={photos} retakes={retakes} onAdd={onAddRetake} user={user} t={t}/>}
    <VerdictCard criterion="dry" verdict={aggregate.dry} checkpoints={aggregate.checkpoints} language={language} t={t}/><VerdictCard criterion="clean" verdict={aggregate.clean} checkpoints={aggregate.checkpoints} language={language} t={t}/><VerdictCard criterion="intact" verdict={aggregate.intact} checkpoints={aggregate.checkpoints} language={language} t={t}/>
    {(aggregate.hints || []).map((hint, index) => <div key={index} className="alert alert-warning"><AlertTriangle size={17}/>{hint}</div>)}
    {utilityMode ? <div className="sticky-action"><Button icon={Home} variant="primary" onClick={onDone}>{t("home")}</Button></div> : <>
      <div className="field"><label htmlFor="inspection-comment">{t("comment")} ({failed || nichtBewertbar ? t("required") : t("optional")})</label><textarea id="inspection-comment" maxLength={500} rows={3} value={comment} onChange={event => setComment(event.target.value)} aria-describedby="comment-count"/><div id="comment-count" className="field-hint">{comment.length}/500</div></div>
      <div className="comment-chips" aria-label="Quick comments">{QUICK_COMMENTS.map(values => { const value = values[language === "en" ? 1 : 0]; return <button type="button" key={values[0]} onClick={() => addQuickComment(value)}>{value}</button>; })}</div>
      {failed && !commentValid && <div className="alert alert-error" role="alert"><AlertTriangle size={17}/>{t("commentFail")}</div>}
      {!failed && nichtBewertbar && !commentValid && <div className="alert alert-warning" role="alert"><AlertTriangle size={17}/>{t("commentNotAssessable")}</div>}
      {user.role === "QA Manager" && selectedPhoto && canCreateKnownIssue(selectedPhoto.rawResult) && <Button icon={ShieldCheck} variant="warning" onClick={() => onKnownIssue(selectedPhoto)}>{t("createKnownIssue")}</Button>}
      {failed && (!aggregate.clean.pass || !aggregate.intact.pass) && <Button icon={Lightbulb} onClick={onSwab}>{t("swab")}</Button>}
      {swabData && <div className="alert alert-warning"><Lightbulb size={17}/>{t("swabAttached")}{" "}
        {wischText({ aussage: swabData.comparison?.aussage }, language === "en" ? "en" : "de")}</div>}
      {schadensverdachte.length > 0 && <VerdachtKlaerungPanel
        verdachte={schadensverdachte} onBeurteilen={onBeurteilenVerdacht} t={t}/>}
      <div className="decision-actions">{failed ? <>
        <Button icon={Lock} variant="danger" disabled={!commentValid} onClick={() => onDecision("FAIL")}>{t("failSign")}</Button>
        <Button icon={AlertTriangle} variant="warning" disabled={critical || verdachtOffenAnzahl > 0} onClick={onOverride}>{t("override")}</Button>
      </> : <Button icon={FileSignature} variant="primary" disabled={!commentValid || passGesperrt} onClick={() => onDecision("PASS")}>{t("releaseSign")}</Button>}</div>
      {/* Nachgereichte Freigabe: nur sichtbar, wenn der Vorgang ueberhaupt
          QA-pflichtig ist. Der Pruefer signiert seine eigene Handlung, das
          Ergebnis bleibt offen, bis eine ANDERE Person mit QA-Rolle
          freigibt. */}
      {qaPflichtig && <div className="decision-actions">
        <Button icon={ClipboardList} variant="secondary" disabled={!commentValid}
          onClick={() => onDeferQa(failed ? "FAIL" : "PASS")}>{t("saveForQa")}</Button>
      </div>}
      {qaPflichtig && <p className="field-hint">{t("saveForQaHint")}</p>}
    </>}
  </section>;
}

function OverrideDialog({ systemDecision, language, onCancel, onContinue, t }) {
  const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const valid = reason.trim().length >= 10 && confirmed;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="override-title"><div className="modal-card">
    <div className="modal-title"><h2 id="override-title"><AlertTriangle size={21}/> {t("overrideTitle")}</h2><IconButton label={t("close")} icon={X} onClick={onCancel}/></div>
    <div className="alert alert-error">{t("overrideWarning")}</div>
    <p className="failed-list">FAIL: {systemDecision.failed.join(", ")}</p>
    <Field label={`${t("reason")} · min. 10`} id="override-reason" required><textarea id="override-reason" rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></Field>
    <div className="comment-chips" aria-label="Quick comments">{QUICK_COMMENTS.map(values => { const value = values[language === "en" ? 1 : 0]; return <button type="button" key={values[0]} onClick={() => setReason(current => current ? `${current}; ${value}` : value)}>{value}</button>; })}</div>
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{t("overrideConfirm")}</span></label>
    <Button icon={ChevronRight} variant="warning" disabled={!valid} onClick={() => onContinue(reason.trim())}>{t("continueSignature")}</Button>
  </div></div>;
}

/* ─── RC4.3 · Elektronische Signatur statt gezeichneter Unterschrift ───────
   Die Zeichnung ist entfallen. Zwei Gruende, beide tragen fuer sich:

   Normativ verlangt 21 CFR Part 11 §11.200 zwei unterschiedliche
   Identifikationskomponenten — Benutzerkennung und Passwort. Eine
   Zeichnung ist nicht gefordert und war hier auch nie eine Kontrolle: die
   Pruefung "Pfadlaenge >= 20 px" belegte nur, dass jemand den Finger
   bewegt hat.

   Praktisch wird im Reinraum mit Handschuhen gearbeitet. Eine Unterschrift
   auf einem Touchscreen ist dort nicht reproduzierbar — und was je nach
   Handschuh anders aussieht, taugt nicht als Manifestation.

   Was bleibt, ist §11.50: Name, Zeitpunkt und die BEDEUTUNG der Handlung
   stehen sichtbar im Datensatz und im Protokoll.                          */
function SignatureConfirm({ user, meaning, context, onCancel, onConfirm, t, busy = false }) {
  const [password, setPassword] = useState("");
  const valid = verifyPassword(user, password);
  const confirm = () => valid && onConfirm({
    method: SIGNATURE_METHOD.USER_ID_PASSWORD,
    components: [...SIGNATURE_COMPONENTS],
    meaning,
  });
  return <section className="screen signature-screen">
    <ScreenHeader title={t("signature")} subtitle={`${t("signaturePurpose")}: ${meaning}`} onBack={onCancel} t={t}/>
    <div className="panel signature-context">
      <strong>{context}</strong>
      <span>{user.displayName} · {user.role}</span>
    </div>
    <p className="field-hint">{t("signatureComponentsHint")}</p>
    <div className="panel signature-components">
      <p><strong>{t("signatureComponentUser")}:</strong> {user.username}</p>
      <p><strong>{t("signatureComponentPassword")}:</strong> {t("signatureComponentPasswordHint")}</p>
    </div>
    <Field label={t("reauth")} id="signature-password" required>
      <input id="signature-password" type="password" autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)}/>
    </Field>
    {!valid && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>{t("invalidSignature")}</div>}
    <Button icon={Check} variant="primary" disabled={!valid || busy} onClick={confirm}>{t("signSave")}</Button>
  </section>;
}


/* ─── RC4.2 · Dokumentierte Massnahme ──────────────────────────────────────
   Die Handlungsart ist der Punkt, an dem eine Qualitaetsabweichung entsteht
   oder eben nicht. Abwischen und Neuaufnahme sind KEINE Abweichung;
   Nachreinigen und Rueckstandsentfernung setzen dauerhaft den QA-Trigger.
   Bis RC4.1 fehlte diese Eingabe ganz — der Abweichungspfad war deshalb
   ueber die Oberflaeche nicht erreichbar und 3.5 nicht pruefbar.          */
/* Known-Issue-Zuordnung als AUSDRUECKLICHE Handlung eines QA Managers.

   Befund der Gegenpruefung an …mehrwinkel.2: `applyKnownIssues` fand die
   Zone automatisch, `applyToleratedScratch` setzte den Pruefpunkt auf PASS
   — und niemand trug eine Zuordnung ein. Damit entstand kein QA-Trigger und
   die Pruefung war als FINAL_PASS abschliessbar. Die automatische Erkennung
   darf hinweisen; tolerieren darf nur ein Mensch mit QA-Rolle.

   Die Speichergrenze in persistence.js weist einen tolerierten Pruefpunkt
   ohne Zuordnung ohnehin ab. Dieses Panel ist der Weg, sie zu erzeugen. */
/* Das Aufnahmeprofil sichtbar machen, ohne etwas zu behaupten.

   Bis …mehrwinkel.3 hatte `evaluateCaptureProfile` keine Aufrufstelle: das
   dokumentierte Tor "NOT_MEASURED → weder PASS noch FAIL" existierte nur
   auf dem Papier. Entscheidung fuer die Testphase: erfassen und anzeigen,
   NICHT sperren. Die Anzeige nennt Quelle, Analyseaufloesung und
   Verkleinerungsfaktor — Herkunftsangaben, keine Genauigkeitsaussage. */
function CaptureProfileNote({ photos, t }) {
  /* ALLE Aufnahmen, nicht nur die erste. Bei Mehrfachaufnahmen blieben
     Profile und Verkleinerungen der weiteren Bilder sonst unsichtbar —
     Befund der Gegenpruefung an rc.4.8. */
  const mitProfil = (photos || []).filter(photo => photo?.captureProfile);
  if (!mitProfil.length) return null;
  return <div className="alert alert-info" role="status">
    <Info size={17}/>
    <span>
      <strong>{t("profileStatus")}</strong> · {t("profileNoClaim")}
      <ul className="profile-list">
        {mitProfil.map((photo, index) => {
          const profile = photo.captureProfile;
          const faktor = Number.isFinite(profile.scaleFactor)
            ? `${(profile.scaleFactor * 100).toFixed(0)} %` : "—";
          return <li key={photo.id || index}>
            #{index + 1}: {evaluateCaptureProfile(profile).status} ·{" "}
            {profile.sourceWidth}×{profile.sourceHeight} → {profile.processedWidth}×{profile.processedHeight}
            {" "}({t("profileScale")} {faktor})
          </li>;
        })}
      </ul>
    </span>
  </div>;
}

function KnownIssueAssignPanel({ photos, assignments, onAssign, user, t }) {
  const [reason, setReason] = useState("");
  const offen = photos.filter(photo => photo.knownIssueInfo?.status === "unveraendert"
    && (photo.knownIssueInfo.issues || []).some(issue =>
      !assignments.some(item => item.issueId === issue.id)));
  if (!offen.length) return null;

  const istQa = user.role === "QA Manager";
  const ready = istQa && reason.trim().length > 0;
  const zuordnen = () => {
    if (!ready) return;
    const at = new Date().toISOString();
    for (const photo of offen) {
      for (const issue of (photo.knownIssueInfo.issues || [])) {
        if (assignments.some(item => item.issueId === issue.id)) continue;
        onAssign({
          issueId: issue.id, zoneId: photo.knownIssueInfo.zoneId ?? null,
          username: user.username, role: user.role, at, reason: reason.trim(),
        });
      }
    }
    setReason("");
  };

  return <section className="panel action-panel" aria-labelledby="ki-assign-heading">
    <h3 id="ki-assign-heading">{t("kiAssignTitle")}</h3>
    <div className="alert alert-warning" role="status">
      <AlertTriangle size={18}/>{t("kiAssignPending")}
    </div>
    {istQa
      ? <>
        <Field label={t("kiAssignReason")} id="ki-assign-reason" required>
          <textarea id="ki-assign-reason" rows={2} value={reason}
            onChange={event => setReason(event.target.value)}/>
        </Field>
        <Button icon={ShieldCheck} disabled={!ready} onClick={zuordnen}>{t("kiAssignConfirm")}</Button>
      </>
      : <p className="field-hint">{t("kiAssignQaOnly")}</p>}
  </section>;
}

function ActionPanel({ photos, retakes, onAdd, user, t }) {
  const [action, setAction] = useState(PREPARATION_ACTION.WIPED_AND_DRIED);
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0 && photos.length > 0;
  const add = () => {
    if (!ready) return;
    onAdd({
      photoIdBefore: photos[0].id,
      photoIdAfter: photos[photos.length - 1].id,
      action, username: user.username, role: user.role,
      at: new Date().toISOString(), reason: reason.trim(),
    });
    setReason("");
  };
  return <section className="panel action-panel" aria-labelledby="action-heading">
    <h3 id="action-heading">{t("actionTitle")}</h3>
    <p className="field-hint">{t("actionHint")}</p>
    <Field label={t("actionKind")} id="action-kind" required>
      <select id="action-kind" value={action} onChange={event => setAction(event.target.value)}>
        {Object.values(PREPARATION_ACTION).map(value =>
          <option key={value} value={value}>{t(`action_${value}`)}</option>)}
      </select>
    </Field>
    <Field label={t("actionReason")} id="action-reason" required>
      <textarea id="action-reason" rows={2} value={reason} onChange={event => setReason(event.target.value)}/>
    </Field>
    <Button icon={Check} disabled={!ready} onClick={add}>{t("actionAdd")}</Button>
    {retakes.length > 0 && <ul className="action-list">
      {retakes.map((item, index) => <li key={index}>
        <strong>{t(`action_${item.action}`)}</strong>
        <span>{item.reason}</span>
        <small>{DEVIATION_HINT_CODES.includes(item.action) ? t("actionDeviation") : t("actionNoDeviation")}</small>
      </li>)}
    </ul>}
  </section>;
}

/* ─── RC4.2 · QA-Genehmigung als getrennte Handlung ────────────────────────
   Anders als SignaturePad authentifiziert dieser Schirm eine ANDERE Person:
   Benutzername UND Passwort. Genau das macht den Vier-Augen-Fall ueberhaupt
   erreichbar. Entschieden wird er nicht hier, sondern in evaluateTransition —
   die Oberflaeche darf keine Sicherheitsgrenze sein.                       */
export function QaApprovalScreen({ performedBy, context, meaning, onCancel, onConfirm, t, busy = false,
  begruendungPflicht = false, begruendung = "", setBegruendung = null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const approver = authenticate(username, password);
  const anmeldung = qaLoginStatus({ username, password, approver });
  const submit = signature => {
    /* Verteidigung in der Tiefe. Erreichbar ist dieser Zweig nicht, weil
       SignatureConfirm nur mit gueltigem approver gerendert wird — die
       sichtbare Rueckmeldung liefert qaLoginStatus oben. */
    if (!approver) { setError(t("qaApprovalUnknown")); return; }
    onConfirm({ approver, signature });
  };
  return <section className="screen qa-approval-screen">
    <ScreenHeader title={t("qaApproval")} subtitle={`${t("signaturePurpose")}: ${meaning}`} onBack={onCancel} t={t}/>
    <div className="panel signature-context">
      <strong>{context}</strong>
      <span>{t("qaApprovalPerformedBy")}: {performedBy?.username} · {performedBy?.role}</span>
    </div>
    <p className="field-hint">{t("qaApprovalHint")}</p>
    {/* autoComplete aus: auf einem Vier-Augen-Schirm darf der Browser
        nichts vorschlagen. Mit "username"/"current-password" fuellte
        Chrome die Zugangsdaten des PRUEFERS in die Felder des
        GENEHMIGERS — im Bedienlauf vom 11.09.2026 dreimal passiert.
        "new-password" wird von Chrome zuverlaessiger beachtet als "off". */}
    <Field label={t("username")} id="qa-username" required>
      <input id="qa-username" autoComplete="off" value={username}
        onChange={event => { setUsername(event.target.value); setError(""); }}/>
    </Field>
    <Field label={t("password")} id="qa-password" required>
      <input id="qa-password" type="password" autoComplete="new-password" value={password}
        onChange={event => { setPassword(event.target.value); setError(""); }}/>
    </Field>
    {/* Eigenes Begruendungsfeld der QA. Der Kommentar des Pruefers gehoert
        zur geprueften Revision und ist durch die Inhaltsbindung geschuetzt;
        eine Sperrung braucht trotzdem eine Begruendung (§11.50). */}
    {setBegruendung && <Field label={t("qaReason")} id="qa-reason" required={begruendungPflicht}>
      <textarea id="qa-reason" rows={2} value={begruendung}
        onChange={event => setBegruendung(event.target.value)}/>
    </Field>}
    {begruendungPflicht && !String(begruendung).trim()
      && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>{t("qaReasonRequired")}</div>}
    {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
    {approver && (!begruendungPflicht || String(begruendung).trim())
      && <SignatureConfirm user={approver} meaning={meaning} context={context}
        onCancel={onCancel} onConfirm={submit} t={t} busy={busy}/>}
    {anmeldung === "qaApprovalUnknown"
      && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>{t("qaApprovalUnknown")}</div>}
    {anmeldung === "qaApprovalAwaitLogin" && <p className="muted">{t("qaApprovalAwaitLogin")}</p>}
  </section>;
}

const DEVIATION_HINT_CODES = [PREPARATION_ACTION.RECLEANED, PREPARATION_ACTION.RESIDUE_REMOVED];

function localDateString(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function KnownIssueDialog({ photo, equipment, zone, user, language, onCancel, onSave, t }) {
  const [step, setStep] = useState("form"); const [issueType, setIssueType] = useState("hairline_scratch");
  const [reason, setReason] = useState(""); const [knownSince, setKnownSince] = useState(localDateString(new Date())); const [months, setMonths] = useState(6);
  /* BEFUND der Gegenpruefung an rc.4.41, zutreffend: der Abgleich
     beruecksichtigt seit rc.4.41 die Prueffläche, der ERZEUGER hier aber
     nicht. Ein so angelegter bekannter Kratzer wurde beim naechsten Mal
     als "verschlechtert" eingestuft, weil seine Zonen in
     Ausschnittkoordinaten lagen und die aktuellen in Fotokoordinaten.

     Die neue Vergleichsregel war richtig; ihr Aufrufer beim Anlegen war
     nicht nachgezogen. Zonen entstehen ab jetzt an BEIDEN Stellen mit
     demselben Ortsbezug. */
  const flaecheDesFotos = photo.rawResult?.pruefflaeche || null;
  const zonen = extractZones(photo.rawResult._ov, flaecheDesFotos);
  const valid = reason.trim().length >= 10 && zonen.length > 0;
  const finish = async signature => {
    const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months);
    const issue = {
      id: newId("ki"), schema: 2, status: "active", eqId: equipment.id, eqName: equipmentName(equipment, language), zoneId: zone.id, zoneName: zoneName(zone, language),
      issueType, originalIntactCode: photo.rawResult.intact.code, zones: zonen, reason: reason.trim(), knownSince,
      severity: "minor", validUntil: localDateString(expiry), validUntilLabel: expiry.toLocaleDateString(language === "en" ? "en-GB" : "de-CH"),
      createdBy: user.displayName, createdById: user.username, createdAt: new Date().toISOString(), referenceImage: photo.annotatedImage || photo.image,
      signature: { ...signature, signedAt: new Date().toISOString(), signedBy: user.username }, actions: [],
    };
    issue.recordHash = await recordDigest(issue); await onSave(issue);
  };
  return <div className="modal-backdrop modal-scroll" role="dialog" aria-modal="true" aria-labelledby="ki-title"><div className="modal-card">
    {step === "form" ? <><div className="modal-title"><h2 id="ki-title"><ShieldCheck size={21}/> {t("knownIssue")}</h2><IconButton label={t("close")} icon={X} onClick={onCancel}/></div>
      <div className="alert alert-warning">Nur ein oberflächlicher kosmetischer Kratzer ist tolerierbar. Korrosion, globale Texturfehler, Rückstände und Feuchtigkeit sind technisch gesperrt.</div>
      <Field label={t("issueType")} id="issue-type" required><select id="issue-type" value={issueType} onChange={event => setIssueType(event.target.value)}><option value="hairline_scratch">{t("hairlineScratch")}</option><option value="minor_wear">{t("minorWear")}</option></select></Field>
      <Field label={t("reason")} id="issue-reason" required hint={`${reason.trim().length}/10`}><textarea id="issue-reason" rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></Field>
      <Field label={t("since")} id="issue-since" required><input id="issue-since" type="date" value={knownSince} max={localDateString(new Date())} onChange={event => setKnownSince(event.target.value)}/></Field>
      <fieldset><legend>{t("validity")}</legend><div className="segmented">{[3, 6, 12].map(value => <button type="button" className={months === value ? "active" : ""} key={value} onClick={() => setMonths(value)}>{value} {t("months")}</button>)}</div></fieldset>
      <Button icon={ChevronRight} variant="warning" disabled={!valid} onClick={() => setStep("signature")}>{t("continueSignature")}</Button>
    </> : <SignatureConfirm user={user} meaning={t("qaSignature")} context={`${equipmentName(equipment, language)} · ${zoneName(zone, language)}`} onCancel={() => setStep("form")} onConfirm={finish} t={t}/>}
  </div></div>;
}

function IssueActionDialog({ issue, action, user, language, onCancel, onSave, t }) {
  const [step, setStep] = useState("form"); const [reason, setReason] = useState(""); const [months, setMonths] = useState(6);
  const title = action === "close" ? t("closeIssue") : t("extend");
  const finish = async signature => {
    const now = new Date(); const updated = { ...issue, actions: [...(issue.actions || [])] };
    if (action === "close") { updated.status = "closed"; updated.closedAt = now.toISOString(); updated.closedBy = user.username; updated.closedReason = reason.trim(); }
    else { const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months); updated.validUntil = localDateString(expiry); updated.validUntilLabel = expiry.toLocaleDateString(language === "en" ? "en-GB" : "de-CH"); }
    updated.actions.push({ action, at: now.toISOString(), by: user.username, reason: reason.trim(), signature });
    updated.recordHash = await recordDigest({ ...updated, recordHash: undefined });
    await onSave(updated, action === "close" ? "KNOWN_ISSUE_CLOSED" : "KNOWN_ISSUE_EXTENDED");
  };
  return <div className="modal-backdrop modal-scroll" role="dialog" aria-modal="true" aria-labelledby="issue-action-title"><div className="modal-card">
    {step === "form" ? <><div className="modal-title"><h2 id="issue-action-title">{title}</h2><IconButton label={t("close")} icon={X} onClick={onCancel}/></div>
      <p><strong>{issue.eqName}</strong> · {issue.zoneName}</p><Field label={t("issueActionReason")} id="issue-action-reason" required hint={`${reason.trim().length}/10`}><textarea id="issue-action-reason" rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></Field>
      {action === "extend" && <fieldset><legend>{t("validity")}</legend><div className="segmented">{[3, 6, 12].map(value => <button type="button" className={months === value ? "active" : ""} key={value} onClick={() => setMonths(value)}>{value} {t("months")}</button>)}</div></fieldset>}
      <Button icon={ChevronRight} variant="warning" disabled={reason.trim().length < 10} onClick={() => setStep("signature")}>{t("continueSignature")}</Button>
    </> : <SignatureConfirm user={user} meaning={title} context={`${issue.eqName} · ${issue.zoneName}`} onCancel={() => setStep("form")} onConfirm={finish} t={t}/>}
  </div></div>;
}

/* Exportiert, damit Tests diese Bildschirme mit ECHTEN Datensaetzen
   rendern koennen. Die Gegenpruefung an rc.4.7 hat zu Recht beanstandet,
   dass Vertrag, Speichergrenze und Erzeuger geprueft waren, der
   Bildschirmfluss aber nicht — der Absturz bei finalDecision === null hat
   deshalb jede gruene Suite ueberlebt. */
export function HistoryScreen({ records, language, onSelect, onExport, onBack, t }) {
  const [status, setStatus] = useState("ALL"); const [equipment, setEquipment] = useState("ALL"); const [zoneFilter, setZoneFilter] = useState("ALL"); const [date, setDate] = useState("");
  /* Wartende Datensaetze sind ueber ihren ZUSTAND filterbar, nicht ueber
     das Ergebnis — sie haben keines. Ohne diesen Zweig waeren sie im
     Verlauf nur unter "alle" auffindbar. */
  const filtered = records.filter(record => (status === "ALL"
    || (status === "PENDING_QA" ? record.state === "PENDING_QA" : record.finalDecision === status))
    && (equipment === "ALL" || record.eqId === equipment) && (zoneFilter === "ALL" || record.zoneId === zoneFilter) && (!date || String(record.signedAt || record.createdAt).startsWith(date)));
  const zones = [...new Map(records.filter(record => equipment === "ALL" || record.eqId === equipment).map(record => [record.zoneId, record.zoneName])).entries()];
  const trend = records.filter(record => equipment !== "ALL" && record.eqId === equipment)
    .sort((a, b) => String(a.signedAt).localeCompare(String(b.signedAt))).slice(-12);
  return <section className="screen"><ScreenHeader title={t("history")} subtitle={`${filtered.length}/${records.length}`} onBack={onBack} t={t}/>
    <div className="filter-grid"><label>{t("filter")}<select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">{t("all")}</option><option value="PENDING_QA">{t("pendingQa")}</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="OVERRIDE">OVERRIDE</option></select></label>
      <label>Equipment<select value={equipment} onChange={event => { setEquipment(event.target.value); setZoneFilter("ALL"); }}><option value="ALL">{t("all")}</option>{EQUIPMENT.map(item => <option key={item.id} value={item.id}>{equipmentName(item, language)}</option>)}</select></label>
      <label>Zone<select value={zoneFilter} onChange={event => setZoneFilter(event.target.value)}><option value="ALL">{t("all")}</option>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{language === "en" ? "Date" : "Datum"}<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>
    <details className="panel trend-panel"><summary>{t("trend")}</summary>{equipment === "ALL" ? <p className="muted">{t("trendHint")}</p> : trend.length === 0 ? <p className="muted">{t("noRecords")}</p> : <div className="trend-list" aria-label={t("trend")}>{trend.map(record => { const severity = record.aggregate?.intact?.severity || 0; /* Balkenlaenge ist eine Darstellungsgroesse, nicht die Befundstaerke selbst. */ const balkenBreite = Math.max(0, Math.min(100, severity)); return <div key={record.id}><time dateTime={record.signedAt}>{new Date(record.signedAt).toLocaleDateString(language === "en" ? "en-GB" : "de-CH")}</time><span><i style={{ width: `${balkenBreite}%` }}/></span><strong>{severity}</strong></div>; })}</div>}</details>
    <Button icon={FileText} disabled={filtered.length === 0} onClick={() => onExport(filtered)}>{t("collectionPdf")}</Button>
    {filtered.length === 0 ? <div className="empty-state"><ClipboardList size={38}/><p>{t("noRecords")}</p></div> : <div className="history-list">{filtered.map(record => <button type="button" key={record.id} className="history-card" onClick={() => onSelect(record)}>
      {record.photos?.[0] && <img src={record.photos[0].annotatedImage || record.photos[0].image} alt=""/>}<span><strong>{record.eqName} · {record.zoneName}</strong><small>{new Date(record.signedAt || record.createdAt).toLocaleString(language === "en" ? "en-GB" : "de-CH")} · {record.performedBy?.username || record.user.displayName}{record.approvedBy?.username ? ` → ${record.approvedBy.username}` : ""}</small><small><FileSignature size={13}/> {record.signature ? t("signature") : "–"}{record.comment ? ` · ${t("comment")}` : ""}</small><small className="hash-short">{record.recordHash?.slice(0, 16)}…</small></span><span className={`decision-chip decision-${String(record.finalDecision || record.state || "offen").toLowerCase()}`}>{record.finalDecision || t("pendingQa")}</span>
    </button>)}</div>}
  </section>;
}

/**
 * Kandidaten des Kratzer-Screenings, sortiert nach Relevanz.
 *
 * Bis rc.4.19 wurde das Screening berechnet und nie angezeigt — eine
 * Aufmerksamkeitshilfe, die niemand sieht. Befund der unabhaengigen
 * Gegenpruefung, zutreffend.
 *
 * Gezeigt wird ausschliesslich GEMESSENES: Rang, Laenge und Breite
 * bezogen auf die kurze Bildkante, Winkelabstand zur Schliffrichtung,
 * Kantenstaerke. KEINE Tiefe, keine Harmlosigkeit, keine Aussage darueber,
 * ob ein Befund neu ist oder gewachsen — nichts davon ist aus einem
 * normalen Foto messbar (X-03, X-07).
 */
/**
 * Die Verdachtsstellen eines Fotos im Bild markiert.
 *
 * BEWUSST GETRENNT von paintOverlay(): das ist die Analyse-Darstellung
 * (Masken, Kernbefunde, Marker), die in Bildschirm, gespeichertem Bild und
 * PDF identisch sein muss. Diese hier ist eine ZUSAETZLICHE Ansicht, die
 * nur zeigt, wo ein Screening-Kandidat liegt. Sie wird nicht gespeichert
 * und geht nicht ins Protokoll — sie beantwortet am Bildschirm die Frage
 * "welche Stelle gehoert zu dieser Zeile".
 *
 * Ohne gespeicherte Bildmasse wird NICHTS gezeichnet. Die Bounding Boxes
 * liegen im intern verkleinerten Screening-Bild; ohne dessen Groesse
 * waere jede Umrechnung geraten.
 */
export function ScreeningMarkierung({ quelle, fotoScreening, ausgewaehlt = null, t }) {
  const ref = useRef(null);
  const bw = fotoScreening?.bildBreite;
  const bh = fotoScreening?.bildHoehe;
  const verortbar = Number.isInteger(bw) && Number.isInteger(bh) && bw > 0 && bh > 0;
  /* BEFUND der Gegenpruefung an rc.4.44: hier stand `fotoScreening.candidates`
     — nur die Vorauswahl. Ein nachgeladener und in der Tabelle gewaehlter
     Kandidat wurde deshalb NICHT hervorgehoben, obwohl eine Messung an ihn
     gebunden werden konnte. Die Tabelle konnte mehr als das Bild.

     `kandidatenBestand` liefert die uebersichtliche Vorauswahl UND den
     gewaehlten Kandidaten — ausdruecklich nicht alle 493 gleichzeitig:
     ein Bild voller Kaesten beantwortet die Frage "wo liegt dieser eine"
     nicht mehr. Dieselbe Quelle wie die Speichergrenze. */
  const kandidaten = kandidatenBestand(fotoScreening, ausgewaehlt);
  const treffer = findeKandidat(fotoScreening, ausgewaehlt);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !quelle || !verortbar) return;
    const bild = new Image();
    bild.onload = () => {
      const context = canvas.getContext("2d");
      canvas.width = bw; canvas.height = bh;
      context.drawImage(bild, 0, 0, bw, bh);
      const kasten = (k, aktiv) => {
        const b = k.boundingBox;
        if (!b || !Number.isFinite(b.minX)) return;
        const x = b.minX - 2, y = b.minY - 2;
        const w = b.maxX - b.minX + 5, h = b.maxY - b.minY + 5;
        context.lineWidth = aktiv ? 4 : 2;
        context.strokeStyle = "rgba(7,12,20,.85)";
        context.strokeRect(x - 1, y - 1, w + 2, h + 2);
        context.strokeStyle = aktiv ? "#facc15" : C.blue;
        context.strokeRect(x, y, w, h);
        /* Die Kennung steht am Kasten. Sie ist die Verbindung zur
           Tabellenzeile und aendert sich beim Sortieren nicht. */
        const schrift = Math.max(10, Math.round(Math.min(bw, bh) * 0.022));
        context.font = `bold ${schrift}px sans-serif`;
        context.textAlign = "left"; context.textBaseline = "bottom";
        const text = k.kandidatId || "?";
        const breite = context.measureText(text).width + 6;
        context.fillStyle = aktiv ? "#facc15" : "rgba(7,12,20,.85)";
        context.fillRect(x, Math.max(0, y - schrift - 4), breite, schrift + 4);
        context.fillStyle = aktiv ? "#070c14" : "#e6f4ff";
        context.fillText(text, x + 3, Math.max(schrift, y - 2));
      };
      /* Erst die uebrigen, dann der ausgewaehlte — er liegt oben. */
      kandidaten.filter(k => k !== treffer).forEach(k => kasten(k, false));
      if (treffer) kasten(treffer, true);
    };
    bild.src = quelle;
  }, [quelle, bw, bh, verortbar, kandidaten, treffer]);

  if (!verortbar) {
    return <p className="field-hint screening-ohne-masse">{t("screeningOhneMasse")}</p>;
  }
  return <figure className="screening-markierung">
    <canvas ref={ref} role="img"
      aria-label={`${t("screeningMarkierung")}${treffer ? ` · ${treffer.kandidatId}` : ""}`}/>
    <figcaption className="field-hint">
      {t("screeningMarkierungHinweis")}
      {treffer ? ` · ${treffer.kandidatId} ${t("screeningAusgewaehlt")}` : ""}
    </figcaption>
  </figure>;
}

/**
 * EINE Aufbereitung des Tiefenergebnisses für Bildschirm, Prüfbericht und
 * PDF. Dieselbe Bauart wie screeningUebersicht(): zwei Fassungen desselben
 * Sachverhalts laufen auseinander, und beim PDF ist genau das schon einmal
 * passiert (rc.4.28, T7 — dort stand die unkorrigierte Fassung im
 * Protokoll, während der Bildschirm die korrigierte zeigte).
 */
export function tiefenAnzeige(messung, t) {
  const e = evaluateDepthMeasurement(messung);
  const titel = {
    [DEPTH_DECISION.NOT_MEASURED]: e.missing?.length
      ? t("depthIncomplete") : t("depthNotMeasured"),
    [DEPTH_DECISION.WITHIN_DEPTH_LIMIT]: t("depthWithin"),
    [DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED]: t("depthExceeded"),
    [DEPTH_DECISION.BOUNDARY_UNCERTAIN]: t("depthBoundary"),
  }[e.decision];
  const hinweis = {
    [DEPTH_DECISION.NOT_MEASURED]: e.missing?.length
      ? t("depthIncompleteHint") : t("depthNotMeasuredHint"),
    [DEPTH_DECISION.WITHIN_DEPTH_LIMIT]: t("depthWithinHint"),
    [DEPTH_DECISION.DEPTH_LIMIT_EXCEEDED]: null,
    [DEPTH_DECISION.BOUNDARY_UNCERTAIN]: t("depthBoundaryHint"),
  }[e.decision];

  /* Die sechs Pflichtangaben stehen EINZELN da. Eine Zusammenfassung wie
     "0,4 µm (Tastschnitt)" verliert die Unsicherheit, und ohne die ist der
     Wert an dieser Grenze nicht zu beurteilen. Fehlende Angaben bleiben
     sichtbar — eine weggelassene Zeile ist von einer gemessenen Null nicht
     zu unterscheiden. */
  const wert = w => (Number.isFinite(w) ? String(w) : t("screeningNotAvailable"));
  const zeilen = e.valueUm === null && !e.missing?.length ? [] : [
    [t("depthValueLabel"), `${wert(e.valueUm)} ${e.unit || t("screeningNotAvailable")}`],
    [t("depthUncertaintyLabel"), `± ${wert(e.uncertaintyUm)} ${e.unit || ""}`.trim()],
    [t("depthMethodLabel"), e.method || t("screeningNotAvailable")],
    [t("depthMeasuredAtLabel"), e.measuredAt || t("screeningNotAvailable")],
    [t("depthMeasuredByLabel"), e.measuredBy || t("screeningNotAvailable")],
    e.intervalUm
      ? [t("depthIntervalLabel"), `${e.intervalUm.from} … ${e.intervalUm.to} ${e.unit}`]
      : null,
    /* Die originale Eingabe steht NEBEN dem gelesenen Wert, nicht darüber.
       Wer "0,85" eingetippt hat, soll "0,85" wiederfinden. */
    e.raw && e.raw.valueUm !== undefined && String(e.raw.valueUm) !== String(e.valueUm)
      ? [t("depthRawLabel"), String(e.raw.valueUm)] : null,
  ].filter(Boolean);

  return { entscheidung: e.decision, titel, hinweis, zeilen, ergebnis: e };
}

/**
 * Eingabemaske für eine Tiefenmessung, gebunden an EINEN Befund.
 *
 * Die Bindung (`photoId` + `kandidatId`) kommt von außen und wird nicht in
 * der Maske gewählt: eine Messung, deren Zuordnung der Eingebende selbst
 * setzt, ist genau so belastbar wie seine Erinnerung daran, welche Riefe er
 * gerade unter dem Messgerät hatte.
 *
 * Die Maske ÜBERNIMMT nur vollständige Messungen (`istSpeicherbar`) und
 * zeigt das Urteil vorher an — wer 1,20 ± 0,30 einträgt, soll den Grenzfall
 * sehen, bevor er speichert, und nicht erst im Protokoll.
 */
export function DepthMeasurementForm({
  photoId, kandidatId = null, markerId = null, user = null, onMessung, t,
  jetzt = () => new Date().toISOString(),
}) {
  const [werte, setWerte] = useState(() => ({
    valueUm: "", unit: DEPTH_UNIT, method: "", uncertaintyUm: "",
    measuredAt: jetzt(), measuredBy: user?.username || "",
    source: DEPTH_MEASUREMENT_SOURCE.INDEPENDENT,
    /* Die Fassung, nach der beurteilt wird, wandert MIT der Messung in den
       Datensatz — sonst koennte ein spaeteres Update das Urteil aendern. */
    ruleVersion: DEPTH_RULE_VERSION,
  }));
  const setzen = (feld, wert) => setWerte(alt => ({ ...alt, [feld]: wert }));
  /* GENAU EIN Bindungsweg. `kandidatId` heisst: der Detektor hat die
     Stelle angeboten. `markerId` heisst: der Pruefer hat sie selbst
     gesetzt, weil der Detektor sie NICHT angeboten hat. */
  const messung = { ...werte, photoId, kandidatId, markerId };
  const gebunden = Boolean(photoId) && (Boolean(kandidatId) !== Boolean(markerId));
  const vorschau = tiefenAnzeige(messung, t);
  const uebernehmbar = istSpeicherbar(messung) && gebunden;

  const feld = (name, beschriftung, art = "text", zusatz = {}) => {
    const id = `tiefe-${name}-${photoId || "x"}-${kandidatId || markerId || "x"}`;
    return <label className="field" htmlFor={id}>
      <span>{beschriftung}</span>
      <input id={id} name={name} type={art} value={werte[name]}
        onChange={e => setzen(name, e.target.value)} {...zusatz}/>
    </label>;
  };

  return <form className="panel depth-form" onSubmit={e => {
    e.preventDefault();
    if (uebernehmbar) onMessung?.(messung);
  }}>
    <h3>{t("depthEntryHeading")}</h3>
    <p className="field-hint">
      {t("depthEntryBoundTo")}: {kandidatId || markerId || t("screeningNotAvailable")}
      {markerId && <> · <strong>{t("missedBadge")}</strong></>}
    </p>
    <p className="field-hint">{t("depthLimitLine")}</p>

    {feld("valueUm", t("depthValueLabel"), "text", { inputMode: "decimal" })}
    <label className="field" htmlFor={`tiefe-unit-${photoId}-${kandidatId || markerId}`}>
      <span>{t("depthUnitLabel")}</span>
      {/* Die Einheit ist eine ausdrückliche Auswahl und keine Annahme.
          Genau diese Verwechslung — mm gegen µm — trug dieses Projekt
          einmal durch die ganze Planung. */}
      <select id={`tiefe-unit-${photoId}-${kandidatId || markerId}`} name="unit"
        value={werte.unit} onChange={e => setzen("unit", e.target.value)}>
        <option value={DEPTH_UNIT}>{DEPTH_UNIT}</option>
      </select>
    </label>
    {feld("uncertaintyUm", t("depthUncertaintyLabel"), "text", { inputMode: "decimal" })}
    {feld("method", t("depthMethodLabel"))}
    {feld("measuredAt", t("depthMeasuredAtLabel"))}
    {feld("measuredBy", t("depthMeasuredByLabel"))}

    <label className="field" htmlFor={`tiefe-source-${photoId}-${kandidatId || markerId}`}>
      <span>{t("depthSourceLabel")}</span>
      <select id={`tiefe-source-${photoId}-${kandidatId || markerId}`} name="source"
        value={werte.source} onChange={e => setzen("source", e.target.value)}>
        <option value={DEPTH_MEASUREMENT_SOURCE.INDEPENDENT}>
          {t("depthSourceIndependent")}
        </option>
        <option value={DEPTH_MEASUREMENT_SOURCE.MODEL_ESTIMATE}>
          {t("depthSourceModel")}
        </option>
      </select>
    </label>

    {/* Das Urteil VOR dem Übernehmen. Es ist eine Vorschau und wird beim
        Anzeigen des Datensatzes neu gerechnet, nie mitgespeichert. */}
    <p className="screening-state"><strong>{vorschau.titel}</strong></p>
    {vorschau.hinweis && <p className="field-hint">{vorschau.hinweis}</p>}

    <button type="submit" disabled={!uebernehmbar}>{t("depthEntrySubmit")}</button>
    {!uebernehmbar && <p className="field-hint">{t("depthEntryIncomplete")}</p>}
  </form>;
}

/**
 * Der ÜBERSEHENE Befund — die Stelle, die der Detektor NICHT angeboten hat.
 *
 * Ohne diesen Weg misst eine Kampagne nur die Schäden, die der Detektor
 * ohnehin gefunden hat; der Fehler „Riefe gar nicht markiert" bliebe
 * unerfassbar, und jede daraus abgeleitete Trefferquote wäre geschönt.
 *
 * Die Komponente hängt bewusst NICHT am Screening: sie steht auch dann da,
 * wenn der Detektor auf diesem Foto null Kandidaten hat. Genau das ist der
 * interessante Fall.
 */
/* Die Beurteilung eines gemeldeten Schadensverdachts.
   Sie LOESCHT den Verdacht nicht, sie beantwortet ihn: Grund und
   Beurteilung stehen nebeneinander im Datensatz. Sonst waere spaeter nicht
   mehr zu sehen, worauf sich die Antwort bezog. */
export function VerdachtKlaerungPanel({ verdachte = [], onBeurteilen = null, t }) {
  const [entwurf, setEntwurf] = useState({});
  const offen = offeneSchadensverdachte(verdachte);
  if (!(verdachte || []).length) return null;
  const schluessel = v => `${v.photoId}:${v.markerId}`;
  const lies = (v, feld, standard) => entwurf[schluessel(v)]?.[feld] ?? standard;
  const setze = (v, feld, wert) => setEntwurf(alt => ({
    ...alt, [schluessel(v)]: { ...alt[schluessel(v)], [feld]: wert } }));

  return <section className="panel verdacht-panel">
    <h3>{t("verdachtKlaerungHeading")}</h3>
    {offen.length > 0 && <div className="alert alert-warning" role="status">
      <AlertTriangle size={17} aria-hidden="true"/>{t("verdachtSperre")}
    </div>}
    <ul className="verdacht-liste">
      {verdachte.map(v => {
        const istOffen = offen.includes(v);
        const ergebnis = lies(v, "ergebnis", VERDACHT_KLAERUNG.SCHADEN_BESTAETIGT);
        const begruendung = lies(v, "begruendung", "");
        const id = `${v.photoId}-${v.markerId}`;
        return <li key={id}>
          <p><strong>{v.markerId}</strong>{" · "}
            <span className={istOffen ? "verdacht-offen" : "verdacht-geklaert"}>
              {istOffen ? t("verdachtOffen") : t("verdachtGeklaert")}</span></p>
          <p><small>{v.reason}</small></p>
          {!istOffen && <p><small>{v.klaerung.ergebnis} · {v.klaerung.begruendung}
            {" · "}{v.klaerung.username}</small></p>}
          {istOffen && onBeurteilen && <>
            <label className="field" htmlFor={`verdacht-ergebnis-${id}`}>
              {t("verdachtKlaerungErgebnis")}
              <select id={`verdacht-ergebnis-${id}`} value={ergebnis}
                onChange={event => setze(v, "ergebnis", event.target.value)}>
                {Object.values(VERDACHT_KLAERUNG).map(wert =>
                  <option key={wert} value={wert}>{t(`verdachtErgebnis_${wert}`)}</option>)}
              </select>
            </label>
            <Field label={t("verdachtKlaerungBegruendung")} id={`verdacht-grund-${id}`}
              required hint={`${begruendung.trim().length}/10`}>
              <textarea id={`verdacht-grund-${id}`} rows={3} maxLength={500}
                value={begruendung}
                onChange={event => setze(v, "begruendung", event.target.value)}/>
            </Field>
            <Button icon={Check} variant="primary"
              disabled={begruendung.trim().length < 10}
              onClick={() => onBeurteilen({ photoId: v.photoId, markerId: v.markerId,
                ergebnis, begruendung: begruendung.trim() })}>
              {t("verdachtKlaerungSpeichern")}
            </Button>
          </>}
        </li>;
      })}
    </ul>
  </section>;
}

/* Ein Schadensverdacht melden. Bewusst KEIN Messformular daneben: der
   Verdacht ist der Weg ohne Messung, und ein Eingabefeld fuer eine Tiefe
   waere die Einladung, die Zahl doch zu schaetzen. */
function VerdachtForm({ photoId, markerId, benutzer, onVerdacht, t }) {
  const [grund, setGrund] = useState("");
  const gueltig = grund.trim().length >= 10 && Boolean(benutzer?.username);
  return <div className="panel verdacht-form">
    <Field label={t("verdachtBegruendung")} id={`verdacht-${photoId}-${markerId}`}
      required hint={`${grund.trim().length}/10`}>
      <textarea id={`verdacht-${photoId}-${markerId}`} rows={3} maxLength={500}
        value={grund} onChange={event => setGrund(event.target.value)}/>
    </Field>
    <Button icon={AlertTriangle} variant="warning" disabled={!gueltig}
      onClick={() => onVerdacht({ photoId, markerId, reason: grund.trim() })}>
      {t("verdachtSpeichern")}
    </Button>
  </div>;
}

export function UebersehenePanel({ fotos = [], messungen = [], onMessung,
  verdachte = [], onVerdacht = null, benutzer = null, t }) {
  const [offen, setOffen] = useState(null);
  const [verdachtOffen, setVerdachtOffen] = useState(null);
  const verdachtZu = (photoId, markerId) => (verdachte || [])
    .find(v => v?.photoId === photoId && v?.markerId === markerId) || null;
  /* BEFUND der Gegenpruefung an rc.4.40, zutreffend: ein Marker AUSSERHALB
     der Prueffläche blieb hier waehlbar. Eine dort eingetragene Messung
     liess sich speichern, und die Bilanz zaehlte anschliessend eine
     uebersehene Grenzueberschreitung — an einer Stelle, die ausdruecklich
     nicht untersucht wurde.

     "Ausserhalb des Prueflbereichs" ist eine eigene Aussage. Solche Marker
     werden weiter ANGEZEIGT — sie verschwinden zu lassen waere der
     naechste stille Fehler —, aber ohne Eingabeweg und getrennt
     ausgewiesen. */
  const alleMarker = (fotos || []).flatMap(foto => {
    const flaeche = foto?.result?.inspectionArea || foto?.rawResult?.pruefflaeche || null;
    return (foto?.markers || []).map(m => ({
      photoId: foto.id, markerId: m.id, x: m.x, y: m.y,
      ausserhalb: flaeche ? !markerInFlaeche(m, flaeche) : false,
    }));
  });
  const marker = alleMarker.filter(m => !m.ausserhalb);
  const ausserhalb = alleMarker.filter(m => m.ausserhalb);
  if (!alleMarker.length) return null;
  const gemessen = (photoId, markerId) => (messungen || [])
    .find(m => m?.photoId === photoId && m?.markerId === markerId) || null;

  return <section className="panel uebersehen-panel">
    <h3>{t("missedHeading")}</h3>
    <p className="field-hint">{t("missedHint")}</p>
    <p className="field-hint">{t("verdachtHint")}</p>
    {ausserhalb.length > 0 && <div className="alert alert-warning">
      <AlertTriangle size={17} aria-hidden="true"/>
      <div><strong>{t("markerOutsideArea")}</strong>
        <ul>{ausserhalb.map(m => <li key={`${m.photoId}-${m.markerId}`}>
          {m.markerId} · {t("markerOutsideAreaHint")}</li>)}</ul></div>
    </div>}
    <ul className="uebersehen-liste">
      {marker.map(m => {
        const vorhanden = gemessen(m.photoId, m.markerId);
        const gewaehlt = offen === `${m.photoId}:${m.markerId}`;
        return <li key={`${m.photoId}:${m.markerId}`}>
          <button type="button" className="screening-waehlen"
            aria-pressed={gewaehlt}
            onClick={() => setOffen(gewaehlt ? null : `${m.photoId}:${m.markerId}`)}>
            {m.markerId} · {Math.round(m.x * 100)} % x · {Math.round(m.y * 100)} % y
          </button>
          {vorhanden && <DepthPanel messung={vorhanden} t={t}/>}
          {!vorhanden && gewaehlt && onMessung && <DepthMeasurementForm
            photoId={m.photoId} markerId={m.markerId} user={benutzer}
            onMessung={onMessung} t={t}/>}
          {/* BEFUND des Geraetelaufs mit rc.4.43: eine gesehene
              Ausbruchstelle liess sich ueberhaupt nicht in den Datensatz
              bringen. Eine Tiefenmessung war der einzige Weg — und genau
              die gibt es hier nicht, weil nichts gemessen wurde. */}
          {(() => {
            const v = verdachtZu(m.photoId, m.markerId);
            const schluessel = `${m.photoId}:${m.markerId}`;
            if (v) {
              const istOffen = !v.klaerung?.ergebnis;
              return <p className={istOffen ? "verdacht-offen" : "verdacht-geklaert"}>
                <strong>{t("verdachtHeading")}</strong>{" · "}
                {istOffen ? t("verdachtOffen") : t("verdachtGeklaert")}
                {v.reason ? <><br/><small>{v.reason}</small></> : null}
              </p>;
            }
            if (!onVerdacht) return null;
            return <>
              <Button icon={AlertTriangle}
                onClick={() => setVerdachtOffen(
                  verdachtOffen === schluessel ? null : schluessel)}>
                {t("verdachtMelden")}
              </Button>
              {verdachtOffen === schluessel && <VerdachtForm
                photoId={m.photoId} markerId={m.markerId} benutzer={benutzer}
                onVerdacht={eintrag => { onVerdacht(eintrag); setVerdachtOffen(null); }}
                t={t}/>}
            </>;
          })()}
        </li>;
      })}
    </ul>
  </section>;
}

export function DepthPanel({ messung, t }) {
  const a = tiefenAnzeige(messung, t);
  return <section className="panel depth-panel">
    <h3>{t("depthHeading")}</h3>
    <p className="field-hint">{t("depthLimitLine")}</p>
    <p className="screening-state"><strong>{a.titel}</strong></p>
    {a.hinweis && <p className="field-hint">{a.hinweis}</p>}
    {a.zeilen.length > 0 && <dl className="depth-werte">
      {a.zeilen.map(([name, inhalt]) => <div key={name}>
        <dt>{name}</dt><dd>{inhalt}</dd>
      </div>)}
    </dl>}
  </section>;
}

export function ScreeningPanel({ screening, t, herkunft = "LIVE", onAuswahl = null,
  ausgewaehlt = null, fotos = [], onMessung = null, messungen = [], benutzer = null }) {
  /* Welcher Kandidat gerade im Bild gezeigt wird. Die Auswahl gehoert
     hierher und nicht nach aussen: Tabelle und Markierung sind eine
     Einheit, und zwei Zustaende fuer dasselbe laufen auseinander. */
  const [gewaehlt, setGewaehlt] = useState(null);
  /* Wie viele Kandidaten je Foto gerade gezeigt werden. Je Foto getrennt:
     ein gemeinsamer Zaehler laedt bei zehn Fotos neunmal zu viel. */
  const [mehr, setMehr] = useState({});
  /* Zwei Rangfolgen, umschaltbar: mit und ohne Richtungsabwertung.

     Die geschaetzte Vorzugsrichtung ist nicht kalibriert. Sie darf die
     einzige sichtbare Reihenfolge nicht bestimmen — sonst schiebt eine
     moeglicherweise unzuverlaessige Richtungsschaetzung einen echten
     Schaden nach hinten, ohne dass es jemand nachrechnen kann. Beide
     Bewertungen stehen deshalb nebeneinander in der Tabelle; die
     Umschaltung aendert nur die Reihenfolge der Zeilen, nie einen Wert
     und nie ein Urteil. */
  /* Voreingestellt ist die UNGERICHTETE Rangfolge. Sie wertet keinen
     Kandidaten wegen einer nicht kalibrierten Richtungsschaetzung ab und
     ist damit die konservative Wahl. Gemessen am realen Teil: die
     Richtungsstaerke lag dort bei 0,049 und damit unter dem Wert einer
     Flaeche voellig ohne Vorzugsrichtung (0,056 bei 36 Faechern, SC-21) -
     trotzdem wurden 19 von 66 Kandidaten deswegen niedriger bewertet.

     Das ist KEINE Schaltschwelle: es wird nicht ab einem Wert
     umgeschaltet, die Voreinstellung ist schlicht die vorsichtigere. */
  const [nachUngerichtet, setNachUngerichtet] = useState(true);

  /* ── Drei Zustaende, die NICHT dasselbe bedeuten ─────────────────────
     Bis rc.4.27 gab die Anzeige in allen dreien dasselbe zurueck: nichts.
     Ein leerer Bereich liest sich wie Entwarnung, und genau das ist er
     nicht. Keiner der Zustaende darf "keine Kratzer" heissen — das
     Screening ist eine Aufmerksamkeitshilfe, kein Nachweis der
     Abwesenheit.

     undefined  es rechnet noch
     null       es gibt keines: live gescheitert, im Datensatz nie gespeichert
     0 Treffer  es lief und fand nichts                                  */
  const rahmen = (titel, ...absaetze) => <section className="panel screening-panel">
    <h3><Search size={18}/> {t("screeningCandidates")}</h3>
    <p className="screening-state"><strong>{titel}</strong></p>
    {absaetze.filter(Boolean).map((text, i) =>
      <p key={i} className="field-hint">{text}</p>)}
  </section>;

  if (screening === undefined) return rahmen(t("screeningRunning"));
  if (!screening || !(screening.photos || []).length) {
    return herkunft === "DATENSATZ"
      /* Ein alter Datensatz ohne Screening-Daten wird NICHT nachgerechnet.
         Ein nachtraeglich erzeugtes Ergebnis waere kein Originalbefund —
         es sieht nur so aus. */
      ? rahmen(t("screeningNotStored"), t("screeningNotRecomputed"), t("screeningNoProof"))
      : rahmen(t("screeningUnavailable"), t("screeningNoProof"));
  }
  const gesamt = screening.photos.reduce((summe, f) => summe + (f.candidateCount || 0), 0);
  if (!gesamt) return rahmen(t("screeningNoCandidates"), t("screeningNoProof"));
  const schluessel = nachUngerichtet ? "relevanceScoreUngerichtet" : "relevanceScore";

  /* Fehlend ist nicht Null. `?? 0` machte aus einem nicht gemessenen Wert
     eine gemessene Null — eine Behauptung, die niemand aufgestellt hat.
     Eine ECHTE Null bleibt dagegen sichtbar Null. */
  const zahl = (wert, stellen, einheit = "") => Number.isFinite(wert)
    ? `${wert.toFixed(stellen)}${einheit}`
    : t("screeningNotAvailable");

  /* Die aktive Kennung je Foto: der von aussen gesetzte Wert, sonst der
     zuletzt angetippte. */
  const aktiveKennung = photoId => ausgewaehlt
    ?? (gewaehlt?.photoId === photoId ? gewaehlt.kandidatId : null);
  const bildZu = photoId => fotos.find(f => f?.id === photoId) || null;
  /* BEFUND der Gegenpruefung an rc.4.40, zutreffend: das Screening rechnet
     seit rc.4.40 auf dem ZUSCHNITT, gezeichnet wurde aber weiter auf dem
     vollstaendigen Originalfoto. Ein Kandidat zeigte damit auf die falsche
     Stelle — in der gemessenen Probe auf 150/200 statt 360/300. Das
     betrifft Ergebnisansicht und wiedergeoeffneten Bericht, und eine daran
     gebundene Tiefenmessung waere an der falschen Stelle vorgenommen
     worden.

     Gezeichnet wird deshalb auf dem Bild, auf dem gerechnet wurde.
     `annotatedImage` IST der Zuschnitt (mit Overlay); er liegt im
     Datensatz und im Live-Ergebnis vor, also braucht es kein zweites Bild.

     Fuer Datensaetze OHNE Prueffläche — vor rc.4.40 — ist das Originalfoto
     weiterhin richtig: dort wurde ohne Begrenzung gerechnet. Fehlt beides,
     wird NICHT gezeichnet: ein Kasten auf einem Bild, zu dem er nicht
     gehoert, ist schlimmer als kein Kasten. */
  const zeichenBild = photoId => kandidatenBild(bildZu(photoId));
  return <section className="panel screening-panel">
    <h3><Search size={18}/> {t("screeningCandidates")}</h3>
    <p className="field-hint">{t("screeningNoDepth")}</p>
    {/* Die Grenze steht ueber der Tabelle, damit die Empfehlungsspalte
        nicht wie ein Urteil gegen sie gelesen wird. */}
    <p className="field-hint">{t("depthLimitLine")} {t("depthCheckRecommendedHint")}</p>
    {/* Der Bezug der beiden Groessenspalten. Er steht nicht nur in den
        Spaltenkoepfen, weil ein Spaltenkopf beim Querscrollen der Tabelle
        aus dem Blick geraet — die Zahl aber nicht. */}
    <p className="field-hint">{t("screeningRelHint")}</p>
    <p className="field-hint">{t("screeningRankHint")}</p>
    <label className="field">
      <span>{t("screeningSortBy")}</span>
      <select value={nachUngerichtet ? "plain" : "directed"}
        onChange={e => setNachUngerichtet(e.target.value === "plain")}>
        <option value="directed">{t("screeningSortDirected")}</option>
        <option value="plain">{t("screeningSortPlain")}</option>
      </select>
    </label>
    {screening.photos.map((foto, index) => {
      /* BEFUND der Gegenpruefung nach dem Geraetelauf mit rc.4.43: die
         Vorauswahl begrenzte nicht nur die Zeichnung, sondern alles. Eine
         kompakte Ausbruchstelle stand im Nachlauf auf Rang 22 von 493 und
         war damit weder in der Tabelle noch im Bild erreichbar.

         Ab jetzt ist die Vorauswahl nur der ERSTE Schritt: sie bleibt die
         uebersichtliche Voreinstellung, und weitere Kandidaten lassen sich
         nachladen. Datensaetze vor diesem Stand tragen keine vollstaendige
         Liste — dann bleibt es bei der Vorauswahl, und es wird nichts
         erfunden. */
      const bestand = (foto.alleKandidaten?.length ? foto.alleKandidaten : foto.candidates) || [];
      const grundmenge = (foto.candidates || []).length || 10;
      const sichtbar = mehr[foto.photoId] ?? grundmenge;
      const alleSortiert = [...bestand]
        .sort((a, b) => (b?.[schluessel] ?? 0) - (a?.[schluessel] ?? 0));
      const sortiert = alleSortiert.slice(0, sichtbar);
      const nachladbar = Math.max(0, alleSortiert.length - sichtbar);
      return <div key={foto.photoId || index}>
        <p className="muted">
          {t("photo")} {index + 1}: {foto.candidateCount} {t("screeningCount")}
          {` · ${sortiert.length} ${t("kandidatenVonGesamt")} ${alleSortiert.length}`}
          {foto.suppressedCount
            ? ` · ${foto.suppressedCount} ${t("screeningSuppressed")}` : ""}
        </p>
        {/* Vorzugsrichtung, Rohwert und Faecherzahl stehen IMMER da, auch
            wenn ein Wert fehlt. Eine weggelassene Zeile ist von einer
            gemessenen Null nicht zu unterscheiden.

            Der Rohwert traegt kein Prozentzeichen: 0,141 ist kein
            Sicherheitsgrad von 14,1 Prozent. Die Faecherzahl steht
            daneben, weil der Wert nur bei gleicher Faecherzahl
            vergleichbar ist (SC-21). */}
        <p className="muted">
          {t("screeningGrind")}: {zahl(foto.grindDirectionDeg, 1, "°")}
          {" · "}{t("screeningStrength")}: {zahl(foto.grindStrength, 3)}
          {" · "}{Number.isInteger(foto.orientationBins)
            ? `${foto.orientationBins} ${t("screeningBins")}`
            : `${t("screeningBins")}: ${t("screeningNotAvailable")}`}
          {" · "}{t("screeningUncalibrated")}
        </p>
        <div className="table-scroll">
          <table className="screening-table">
            <thead><tr>
              {/* Drei verschiedene Dinge, drei Spalten. Position wird bei
                  jedem Sortierwechsel neu vergeben, die Kennung nie, und
                  "Rang gerichtet" ist der GESPEICHERTE Platz aus der
                  Rangfolge mit Richtungsabwertung. */}
              <th>{t("screeningPosition")}</th>
              <th>{t("screeningKandidat")}</th>
              <th>{t("screeningRank")}</th>
              <th>{t("screeningLength")}</th>
              <th>{t("screeningWidth")}</th>
              <th>{t("screeningAngle")}</th>
              <th>{t("screeningEdge")}</th>
              <th>{t("screeningScore")}</th>
              <th>{t("screeningScorePlain")}</th>
              {/* Was der Kontrast darf: eine Kontrolle EMPFEHLEN. Die
                  Spalte trägt bewusst keinen Wert und keine Einheit —
                  sie ist ein Verweis auf ein Messmittel, kein Befund. */}
              <th>{t("depthHeading")}</th>
            </tr></thead>
            <tbody>
              {sortiert.map((k, platz) => <tr
                key={k.kandidatId || k.rank}
                className={[
                  k.alignedWithGrind ? "screening-grind" : "",
                  k.kandidatId && k.kandidatId === aktiveKennung(foto.photoId)
                    ? "screening-gewaehlt" : "",
                ].filter(Boolean).join(" ")}>
                {/* Laufende Position in der AKTUELLEN Sortierung. Sie wird
                    bei jedem Wechsel neu vergeben — genau das ist ihr
                    Zweck. */}
                <td>{platz + 1}</td>
                {/* Die stabile Kennung. Sie ist zugleich der Knopf, der
                    die Stelle im Bild zeigt — ein nativer Button, keine
                    anklickbare Zelle. */}
                <td>{onAuswahl && k.kandidatId
                  ? <button type="button" className="screening-waehlen"
                    aria-pressed={k.kandidatId === aktiveKennung(foto.photoId)}
                    aria-label={`${t("screeningWaehlen")}: ${k.kandidatId}`}
                    onClick={() => {
                      setGewaehlt({ photoId: foto.photoId, kandidatId: k.kandidatId });
                      onAuswahl(foto.photoId, k.kandidatId);
                    }}>
                    {k.kandidatId}
                  </button>
                  : (k.kandidatId || t("screeningNotAvailable"))}</td>
                {/* Der GESPEICHERTE Platz in der gerichteten Rangfolge.
                    Er aendert sich beim Umschalten nicht. */}
                <td>{Number.isFinite(k.rank) ? k.rank : t("screeningNotAvailable")}
                  {k.alignedWithGrind
                    ? <><br/><small>{t("screeningEntlangSchliff")}</small></> : null}</td>
                {/* Dimensionslose Rohwerte, kein Prozent. Der Bezug steht
                    im Spaltenkopf und in der Erklaerung darueber. */}
                <td>{zahl(k.lengthRel, 4)}</td>
                <td>{zahl(k.widthRel, 4)}</td>
                <td>{zahl(k.grindDeltaDeg, 1, "°")}</td>
                <td>{zahl(k.edgeStrength, 2)}</td>
                <td>{zahl(k.relevanceScore, 4)}</td>
                <td>{zahl(k.relevanceScoreUngerichtet, 4)}</td>
                {/* Kein Hinweis heisst NICHT "nicht tief": die
                    Kantenstaerke ist auf das Maximum DESSELBEN Bildes
                    normiert, ihre Abwesenheit belegt nichts. Deshalb steht
                    in der Gegenrichtung "nicht gemessen" und nicht etwa
                    ein Haken. */}
                <td>{opticalDepthHint(k).hint === OPTICAL_HINT.OPTICAL_DEPTH_CHECK_RECOMMENDED
                  ? <strong className="depth-empfehlung">{t("depthCheckRecommended")}</strong>
                  : <span className="muted">{t("depthNotMeasured")}</span>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {/* Nachladen. Die Vorauswahl bleibt die uebersichtliche
            Voreinstellung; sie ist nur nicht mehr die Grenze dessen, was
            ueberhaupt erreichbar ist. */}
        {nachladbar > 0
          ? <Button icon={ChevronRight} onClick={() => setMehr(vorher => ({
            ...vorher, [foto.photoId]: sichtbar + 50 }))}>
            {`${t("kandidatenMehr")} (${nachladbar})`}
          </Button>
          : alleSortiert.length > grundmenge
            ? <p className="field-hint">{t("kandidatenAlle")}</p> : null}
        {/* Die Stelle im Bild. Sie beantwortet die Frage, die eine
            Zahlentabelle allein nicht beantworten kann: WO liegt der
            Kandidat mit dieser Relevanz. */}
        {zeichenBild(foto.photoId).quelle
          ? <ScreeningMarkierung
            quelle={zeichenBild(foto.photoId).quelle}
            fotoScreening={foto}
            ausgewaehlt={aktiveKennung(foto.photoId)}
            t={t}/>
          : bildZu(foto.photoId) && <p className="field-hint">
            {t("screeningNoCrop")} ({zeichenBild(foto.photoId).grund})</p>}
        {/* Die Eingabemaske erscheint erst, wenn ein Kandidat gewählt ist.
            Sie ist damit zwangsläufig an DIESEN Befund gebunden — und die
            Bindung entsteht durch das Antippen im Bild, nicht durch eine
            Auswahl in der Maske. */}
        {onMessung && aktiveKennung(foto.photoId) && <DepthMeasurementForm
          photoId={foto.photoId}
          kandidatId={aktiveKennung(foto.photoId)}
          user={benutzer}
          onMessung={onMessung}
          t={t}/>}
        {/* Bereits eingetragene Messungen zu diesem Foto. Das Urteil wird
            hier GERECHNET, nicht aus dem Datensatz gelesen. */}
        {(messungen || [])
          .filter(m => m?.photoId === foto.photoId)
          .map((m, i) => <DepthPanel key={m.kandidatId || i} messung={m} t={t}/>)}
      </div>;
    })}
    {screening.configHash && <p className="muted record-hash">
      {t("screeningConfig")}: {screening.configQuelle || "—"} · {screening.configHash}
    </p>}
  </section>;
}

/**
 * Die Anzeigeebenen eines GESPEICHERTEN Datensatzes.
 *
 * Befund der Gegenpruefung an rc.4.38, zutreffend: der Ebenenbestand
 * ueberlebte das Speichern und stand im PDF — aber der wiedergeoeffnete
 * Pruefbericht zeigte ihn nicht. Fuer den Leser des Berichts ist das
 * dasselbe, als waere er verloren: "vor dem Speichern war mehr zu sehen".
 *
 * Read-only, und das ist kein Versaeumnis. Der Datensatz traegt das
 * fertige Overlay-Bild, nicht die Masken — es gibt nichts umzuschalten.
 * Was er traegt, ist die Liste dessen, was gerechnet und was davon
 * gezeichnet wurde, und genau die steht hier.
 *
 * Es wird NICHTS nachgerechnet. Fehlt die Liste, war zur Unterschrift
 * keine da; ein nachtraeglich erzeugtes Ergebnis waere kein
 * Originalbefund — dieselbe Regel wie beim Screening im Bericht.
 */
function EbenenBericht({ photos = [], language, t }) {
  const de = language !== "en";
  const mitEbenen = photos
    .map((foto, index) => ({ index, ebenen: foto?.result?.overlayLayers || [] }))
    .filter(eintrag => eintrag.ebenen.length);
  if (!mitEbenen.length) return null;
  return <section className="panel report-layers">
    <h3>{t("layers")}</h3>
    <p className="layer-note">{t("layersStoredNote")}</p>
    {mitEbenen.map(eintrag => <div key={eintrag.index}>
      <strong>{t("photo")} {eintrag.index + 1}</strong>
      <ul className="layer-list">
        {eintrag.ebenen.map(ebene => <li key={ebene.id}>
          <small className="layer-origin">{ebenenText(ebene, de ? "de" : "en")}</small>
        </li>)}
      </ul>
    </div>)}
  </section>;
}

/**
 * Der Wischtest eines GESPEICHERTEN Datensatzes — neu oder alt.
 *
 * Zweiter Befund der Gegenpruefung an rc.4.38: ein Wischtest aus einer
 * frueheren Fassung hat kein `comparison`, und die Anzeige meldete
 * daraufhin "Kein Vergleich moeglich: die Vorher-/Nachher-Zuordnung
 * fehlt". Die Zuordnung fehlte nicht — Fotos und damalige Werte stehen
 * im Datensatz. Nur die getrennte Auswertung gab es damals nicht.
 *
 * Welcher Fall vorliegt, entscheidet `wischAnsicht` in swabComparison.js;
 * die Oberflaeche zeigt nur an. Der Datensatz wird dabei nicht angefasst.
 */
function SwabBericht({ swabTest, language, t, children }) {
  const de = language !== "en";
  const ansicht = wischAnsicht(swabTest);
  const kriterien = Object.values(ansicht.kriterien || {});
  return <section className="panel"><h3>{t("swab")}</h3>
    {ansicht.format === WISCH_FORMAT.ALTFORMAT
      && <p className="swab-legacy"><strong>{t("swabLegacy")}</strong></p>}
    <p>{wischText(ansicht, de ? "de" : "en")}</p>
    {kriterien.length > 0 && <ul className="swab-criteria">
      {kriterien.map(eintrag => <li key={eintrag.kriterium}>
        <span className="swab-criterion-name">{t(eintrag.kriterium)}</span>
        <small>{wischKriteriumText(eintrag, de ? "de" : "en")}</small></li>)}
    </ul>}
    {wischEinschraenkungsTexte(ansicht, de ? "de" : "en")
      .map(text => <small key={text} className="swab-limit">{text}</small>)}
    {children}
  </section>;
}

export function RecordDetail({ record, language, onBack, t, user = null, onRelease = null,
  onBeurteilen = null, abgeloest = false }) {
  /* Die nachgereichte Freigabe ist nur moeglich, wenn der Datensatz wartet,
     der angemeldete Benutzer QA Manager ist UND nicht selbst geprueft hat.
     Die eigentliche Sperre sitzt in evaluateTransition und an der
     Speichergrenze — hier wird sie nur sichtbar gemacht. */
  const wartend = record.state === "PENDING_QA";
  /* Ein bereits abgeloester Vorgang traegt keine Entscheidung mehr. Ohne
     diese Unterscheidung stuenden nach einer Beurteilung ZWEI wartende
     Datensaetze im Verlauf, und der aeltere haette einen Knopf, der an der
     Speichergrenze zwingend scheitert ("genau EIN Entscheid je Revision").
     Dieselbe Krankheit wie BEFUND D, nur eine Ebene weiter. */
  const entscheidbar = wartend && !abgeloest;
  const darfFreigeben = entscheidbar && user?.role === "QA Manager"
    && user.username !== record.performedBy?.username;
  /* BEFUND D: die QA muss den gemeldeten Schadensverdacht auch NACH dem
     Wiederoeffnen beantworten koennen. Vorher gab es das Klaerungspanel
     nur im Ergebnisbildschirm des Pruefers; danach sperrte der Verdacht
     PASS und Override, und es blieb allein die Sperrung. */
  const darfBeurteilen = darfFreigeben && typeof onBeurteilen === "function"
    && offeneSchadensverdachte(record.manualFindings).length > 0;
  /* Welche Entscheide sind fachlich ueberhaupt erreichbar? Die Antwort
     kommt aus lifecycle.js, damit hier keine zweite Fassung derselben
     Regel entsteht. Ohne das bot die Oberflaeche "Durch QA freigeben"
     auch dann an, wenn weder PASS noch Override durchgehen konnten —
     der Fehlschlag kam erst nach Anmeldung, Begruendung und Signatur.
     Befund aus dem Bedienlauf vom 11.09.2026. */
  const moeglich = qaDecisionOptions(record);
  /* Nur ein nachweislicher Altbestand darf den Rohbefund als massgebliche
     Aussage behalten; erkannt am Datenformat (F8/F9), nicht daran, dass
     eine Pruefpunktliste fehlt. */
  const altbestand = istAltdatensatz(record);
  /* BEFUND aus U29: der Datensatz traegt die Pruefpunkte ZWEIMAL — einmal
     unter `checkpoints`, einmal in `aggregate.checkpoints`. Der Erzeuger
     schreibt beide aus derselben Quelle, sie koennen also nur durch einen
     fremden Erzeuger oder eine spaetere Aenderung auseinanderlaufen. Die
     Anzeige bevorzugte bis hier still die erste Liste: daneben stand dann
     eine gruene Urteilskarte neben einer Fotokachel mit "?".

     Statt eine der beiden Kopien zur Wahrheit zu erklaeren, gilt Regel 3 —
     worst result wins. Sind sie gleich, aendert das nichts; laufen sie
     auseinander, kann die guenstigere Fassung die schlechtere nie
     ueberdecken. */
  const berichtPunkte = aggregateCheckpoints([
    record.checkpoints, record.aggregate?.checkpoints,
  ]);
  return <section className="screen"><ScreenHeader title={t("printReport")} subtitle={record.id} onBack={onBack} t={t}/>
    <div className={`status-banner ${record.finalDecision === "FAIL" ? "status-fail" : (record.finalDecision === "OVERRIDE" || !record.finalDecision) ? "status-warning" : "status-pass"}`}><FileSignature size={27}/><div><span>{t("overall")}</span><strong>{record.finalDecision || t("pendingQa")}</strong><small>{record.signature?.meaning}</small></div></div>
    {wartend && abgeloest && <div className="alert alert-warning" role="status">
      <AlertTriangle size={17}/>{t("supersededHint")}</div>}
    {entscheidbar && !darfFreigeben && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>{t("pendingQaHint")}</div>}
    {/* Die gemeldeten Stellen gehoeren in den Bericht — beantwortete
        ebenso wie offene. Bis rc.4.45 verschwand das Panel, sobald nichts
        mehr offen war; die dokumentierte Beurteilung war damit genau dort
        unsichtbar, wo sie gelesen wird. Ob jemand ANTWORTEN darf, ist eine
        zweite Frage: ohne `onBeurteilen` steht die Liste nur da.

        Sie steht VOR den Entscheidungsknoepfen: die Antwort ist der
        Schritt, der ueberhaupt erst eine Entscheidung ermoeglicht. */}
    {(record.manualFindings || []).length > 0 && <VerdachtKlaerungPanel
      verdachte={record.manualFindings}
      onBeurteilen={darfBeurteilen ? onBeurteilen : null} t={t}/>}
    {darfFreigeben && !moeglich.release.allowed
      && <div className="alert alert-warning" role="status"><AlertTriangle size={17}/>
        {t("releaseImpossible")} {t(`releaseImpossible_${moeglich.release.code}`)}</div>}
    {darfFreigeben && <div className="decision-actions">
      {moeglich.release.allowed
        && <Button icon={ShieldCheck} variant="primary" onClick={() => onRelease(record, "PASS")}>{t("releaseNow")}</Button>}
      <Button icon={Lock} variant="danger" onClick={() => onRelease(record, "FAIL")}>{t("blockNow")}</Button>
    </div>}
    <div className="panel record-meta"><p><strong>Equipment:</strong> {record.eqName}</p><p><strong>Zone:</strong> {record.zoneName}</p><p><strong>User:</strong> {record.user.displayName} ({record.user.role})</p><p><strong>Timestamp:</strong> {record.signedAt}</p><p className="record-hash"><strong>SHA-256:</strong> {record.recordHash}</p></div>
    <div className="report-photo-grid">{(record.photos || []).map((photo, index) => <figure key={photo.id}><img src={photo.annotatedImage || photo.image} alt={`${t("photo")} ${index + 1}`}/><figcaption>{t("photo")} {index + 1}: T {kriteriumKurz(photo.result.checkpoints, "dry", photo.result.dry.pass, altbestand)} · S {kriteriumKurz(photo.result.checkpoints, "clean", photo.result.clean.pass, altbestand)} · I {kriteriumKurz(photo.result.checkpoints, "intact", photo.result.intact.pass, altbestand)}</figcaption></figure>)}</div>
    {/* herkunft DATENSATZ: fehlt hier ein Screening, wurde keines
        gespeichert — es ist nicht "gerade nicht verfuegbar". Und es wird
        auch nicht nachgerechnet: ein nachtraeglich erzeugtes Ergebnis
        waere kein Originalbefund. */}
    <ScreeningPanel screening={record.screening} t={t} herkunft="DATENSATZ" fotos={record.photos || []}/>
    {/* Der Geltungsbereich je Foto: worauf bezieht sich das Urteil?
        Gelesen wird der GESPEICHERTE Eintrag, nicht neu abgeleitet. */}
    {(record.photos || []).some(f => f?.result?.inspectionArea)
      && <section className="panel"><h3>{t("inspectionArea")}</h3>
        {(record.photos || []).map((foto, index) => foto?.result?.inspectionArea
          ? <p key={foto.id ?? index} className="geltungsbereich">
            <strong>{t("photo")} {index + 1}:</strong>{" "}
            {geltungstext(foto.result.inspectionArea, language === "en" ? "en" : "de")}
          </p> : null)}
      </section>}
    <EbenenBericht photos={record.photos || []} language={language} t={t}/>
    <CheckpointList checkpoints={record.aggregate.checkpoints} language={language} t={t}/>
    <VerdictCard criterion="dry" verdict={record.aggregate.dry} checkpoints={berichtPunkte} altbestand={altbestand} language={language} t={t}/><VerdictCard criterion="clean" verdict={record.aggregate.clean} checkpoints={berichtPunkte} altbestand={altbestand} language={language} t={t}/><VerdictCard criterion="intact" verdict={record.aggregate.intact} checkpoints={berichtPunkte} altbestand={altbestand} language={language} t={t}/>
    {record.comment && <div className="panel"><strong>{t("comment")}</strong><p>{record.comment}</p></div>}{record.overrideReason && <div className="alert alert-warning"><AlertTriangle size={17}/>{record.overrideReason}</div>}
    {record.swabTest && <SwabBericht swabTest={record.swabTest} language={language} t={t}>
      <div className="reference-comparison">{(record.swabTest.photos || []).map((photo, index) => <figure key={photo.id}><img src={photo.annotatedImage || photo.image} alt={`${t("swab")} ${index + 1}`}/><figcaption>{index === 0 ? "Vorher / Before" : "Nachher / After"}</figcaption></figure>)}</div>
    </SwabBericht>}
    {record.signature && <div className="signature-record">
      {/* Pruefer und Genehmiger getrennt: bei nachgereichter Freigabe ist
          record.user der Genehmiger, nicht der Pruefer. */}
      <span><strong>{record.signature.meaning}</strong><br/>
        {t("performedByLabel")}: {record.performedBy?.username || record.user.displayName} · {record.performedBy?.role || record.user.role}<br/>
        {record.approvedBy?.username && <>{t("approvedByLabel")}: {record.approvedBy.username} · {record.approvedBy.role}<br/></>}
        {record.signedAt}<br/>
        <small>{(record.signature.components || []).join(" + ")}</small></span>
      {record.signature.image && <img src={record.signature.image} alt={t("signature")}/>}
    </div>}
    <Button icon={FileText} variant="primary" onClick={() => exportInspectionPdf(record, language)}>{t("exportPdf")}</Button>
  </section>;
}

function bytes(value) {
  if (!Number.isFinite(value)) return "–";
  const units = ["B", "KB", "MB", "GB"]; let number = value; let index = 0;
  while (number >= 1024 && index < units.length - 1) { number /= 1024; index++; }
  return `${number.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function SettingsDialog({ user, language, setLanguage, issues, auditStatus, selfTest, storageInfo, pwaReady, onExport, onIssueAction, onLogout, onClose, t }) {
  return <div className="modal-backdrop modal-scroll" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-card settings-card">
    <div className="modal-title"><h2 id="settings-title"><Settings size={21}/> {t("settings")}</h2><IconButton label={t("close")} icon={X} onClick={onClose}/></div>
    <section className="panel settings-section"><h3><Languages size={18}/> {t("language")}</h3><div className="segmented"><button type="button" className={language === "de" ? "active" : ""} onClick={() => setLanguage("de")}>DE</button><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button></div></section>
    <section className="panel settings-section"><h3><ShieldCheck size={18}/> System</h3>
      <div className={selfTest.ok ? "check-row ok" : "check-row fail"}>{selfTest.ok ? <CheckCircle size={17}/> : <XCircle size={17}/>}<span>{t("selfTest")}</span><strong>{selfTest.ok ? t("ready") : t("notReady")}</strong></div>
      <div className={auditStatus?.ok ? "check-row ok" : auditStatus ? "check-row fail" : "check-row"}>{auditStatus?.ok ? <CheckCircle size={17}/> : auditStatus ? <XCircle size={17}/> : <ShieldCheck size={17}/>}<span>{auditStatus?.ok ? t("auditOk") : auditStatus ? t("auditBroken") : t("checking")}</span><strong>{auditStatus?.count ?? "…"}</strong></div>
      <div className={pwaReady ? "check-row ok" : "check-row"}><Download size={17}/><span>{pwaReady ? t("offlineReady") : t("offlinePending")}</span></div>
      <div className="check-row ok"><ShieldCheck size={17}/><span>Lokale Analyse</span><strong>aktiv · offline</strong></div>
      <div className="check-row"><Globe2 size={17}/><span>Firmen-KI</span><strong>nicht konfiguriert</strong></div>
      <div className="check-row"><Globe2 size={17}/><span>{t("storage")}</span><strong>{storageInfo ? `${bytes(storageInfo.usage)} / ${bytes(storageInfo.quota)}` : "–"}</strong></div>
    </section>
    {(user.role === "QA Manager" || user.role === "Administrator") && <section className="panel settings-section"><h3><ShieldCheck size={18}/> Known Issues</h3>{issues.length === 0 ? <p className="muted">–</p> : issues.map(issue => <div className="issue-row" key={issue.id}><span><strong>{issue.eqName} · {issue.zoneName}</strong><small>{issue.issueType} · {issue.status} · {issue.validUntilLabel}</small></span>{issue.status === "active" && user.role === "QA Manager" && <span className="issue-actions"><button type="button" onClick={() => onIssueAction(issue, "extend")}>{t("extend")}</button><button type="button" onClick={() => onIssueAction(issue, "close")}>{t("close")}</button></span>}</div>)}</section>}
    <a className="button button-secondary" href="/VisuClean_QR_Etiketten_A4.html" target="_blank" rel="noreferrer"><QrCode size={17}/>{t("printLabels")}</a>
    <Button icon={Download} onClick={onExport}>{t("exportJson")}</Button><Button icon={LogOut} variant="danger" onClick={onLogout}>{t("logout")}</Button>
    <p className="demo-disclaimer">{t("demonstrator")}</p>
  </div></div>;
}

function HomeScreen({ user, recordCount, auditStatus, selfTest, pwaReady, onStart, onHistory, onSettings, t }) {
  const canReference = user.role === "QA Manager" || user.role === "Administrator";
  return <section className="screen home-screen"><header className="app-header"><div className="app-brand"><span><Eye size={20}/></span><div><strong>VisuClean</strong><small>v{APP_VERSION}</small></div></div><div><button type="button" className="header-history" onClick={onHistory} aria-label={t("history")}><ClipboardList size={17}/><span>{recordCount}</span></button><IconButton label={t("settings")} icon={Settings} onClick={onSettings}/></div></header>
    <div className="hero"><div className="hero-icon"><Eye size={31}/></div><h1>{t("homeTitle")}</h1><p>{t("homeText")}</p><div className="hero-criteria"><span>{t("dry")}</span><span>{t("clean")}</span><span>{t("intact")}</span></div></div>
    {!auditStatus && <div className="alert alert-warning" role="status"><ShieldCheck size={18}/>{t("checking")}</div>}
    {(auditStatus && !auditStatus.ok || !selfTest.ok) && <div className="alert alert-error"><AlertTriangle size={18}/>{auditStatus && !auditStatus.ok ? t("auditBroken") : `${t("selfTest")}: ${t("notReady")}`}</div>}
    <Button icon={Camera} variant="primary" className="button-large" disabled={!auditStatus?.ok || !selfTest.ok} onClick={() => onStart("inspect")}>{t("newInspection")}</Button>
    <div className="home-grid"><button type="button" disabled={!canReference} onClick={() => onStart("reference")}><ImagePlus size={21}/><strong>{t("reference")}</strong><small>{canReference ? "Soll / Ist" : "QA / Admin"}</small></button><button type="button" onClick={() => onStart("light")}><Sun size={21}/><strong>{t("lightCheck")}</strong><small>15% / 30%</small></button><button type="button" onClick={() => onStart("swab")}><Lightbulb size={21}/><strong>{t("swab")}</strong><small>Decision aid</small></button><button type="button" onClick={onHistory}><ClipboardList size={21}/><strong>{t("history")}</strong><small>{recordCount}</small></button></div>
    <div className="system-strip"><span className={selfTest.ok ? "ok" : "fail"}>{selfTest.ok ? <CheckCircle size={15}/> : <XCircle size={15}/>} {t("selfTest")}: {selfTest.ok ? t("ready") : t("notReady")}</span><span className={pwaReady ? "ok" : ""}><Download size={15}/> {pwaReady ? t("offlineReady") : t("offlinePending")}</span></div>
    <p className="demo-disclaimer">{t("demonstrator")}</p>
  </section>;
}

export function stripResult(result) {
  if (!result) return null;
  const verdict = value => {
    if (!value) return null;
    const copy = { ...value };
    delete copy.originalVerdict;
    return copy;
  };
  const cleanResult = {
    dry: verdict(result.dry),
    clean: verdict(result.clean),
    intact: verdict(result.intact),
    lm: result.lm,
    hints: [...(result.hints || [])],
  };
  if (result.metrics) cleanResult.metrics = { ...result.metrics };
  /* Die Pruefpunkte gehoeren in den signierten Datensatz: Status, Grund,
     naechste Handlung und Messwerte je Punkt. Ohne sie waere im Protokoll
     spaeter nicht mehr nachvollziehbar, WARUM etwas offen blieb. */
  if (Array.isArray(result.checkpoints) && result.checkpoints.length)
    cleanResult.checkpoints = result.checkpoints.map(point => ({ ...point }));
  /* Der Ebenenbestand gehoert in den signierten Datensatz — als ABGELEITETE
     LISTE, nicht als Rohzahl.
     Der Unterschied ist der ganze Punkt: wuerde das Protokoll die Liste
     spaeter aus einem Bestand neu ableiten, koennte eine geaenderte
     Konfiguration oder ein geaendertes Register still eine andere Aussage
     erzeugen als der Bildschirm bei der Aufnahme. Festgehalten wird
     deshalb, was damals galt: welche Maske wie viele Pixel hatte, welche
     das Urteil trug und welche berechnet, aber nicht eingeblendet war.
     Die Masken selbst wandern nicht mit; fuer die Nachvollziehbarkeit
     genuegt die Zahl mit ihrer Bezugsgroesse. */
  if (Array.isArray(result._ov?.ebenen) && result._ov.ebenen.length)
    cleanResult.overlayLayers = result._ov.ebenen.map(ebene => ({ ...ebene }));
  /* Welcher Ausschnitt bewertet wurde. Ohne diesen Eintrag ist im
     unterschriebenen Bericht nicht nachvollziehbar, worauf sich das
     Urteil bezieht — und ein Befund ohne seinen Geltungsbereich liest
     sich wie eine Aussage ueber das ganze Teil. */
  if (result.pruefflaeche) cleanResult.inspectionArea = { ...result.pruefflaeche };
  return cleanResult;
}

function publicUser(user) {
  return { username: user.username, role: user.role, displayName: user.displayName };
}

function downloadObject(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ReferencePreview({ reference, current, t }) {
  if (!reference?.image) return <div className="reference-empty"><ImagePlus size={20}/><span>{t("reference")}: –</span></div>;
  return <section className="reference-comparison" aria-label={t("reference")}>
    <figure><img src={reference.image} alt={`${t("reference")} · Soll`}/><figcaption>{t("reference")} · Soll</figcaption></figure>
    {current && <figure><img src={current} alt={`${t("photo")} · Ist`}/><figcaption>{t("photo")} · Ist</figcaption></figure>}
  </section>;
}

/**
 * Der Vorher-/Nachher-Vergleich des Wischtests.
 *
 * Bis rc.4.37 stand hier die Summe der Befundstaerken von Trocken, Sauber
 * und Intakt, und eine sinkende Summe hiess "Rueckstand moeglich". Damit
 * genuegte NACHTROCKNEN, um eine Reinigungswirkung auszuweisen, die es
 * nicht gab — gemessen in schmutztest S3-1: die alte Regel meldete
 * "Rueckstand moeglich" (95 → 35), obwohl der Sauberkeitswert unveraendert
 * bei 35 stand. Ebenso reichte ein anderer Kratzerwert, und der aendert
 * sich schon bei anderem Streiflicht (S3-2).
 *
 * Verglichen wird jetzt je Kriterium, und die Gesamtaussage haengt
 * ausschliesslich am Sauberkeitskriterium. Die Regel steht in
 * swabComparison.js: sie ist rein, und sie ist pruefbar, ohne einen
 * Bildschirm zu rendern.
 */
function SwabResult({ photos, language, onDone, t }) {
  const before = photos[0]?.result;
  const after = photos[1]?.result;
  const de = language !== "en";
  /* ausschnittBelegt/lichtBelegt bleiben ungesetzt: die App stellt weder
     gleichen Ausschnitt noch gleiches Licht zwischen den beiden Aufnahmen
     fest. Nicht festgestellt ist nicht festgestellt gleich. */
  const vergleich = vergleicheWischtest(before, after);
  return <section className="screen"><ScreenHeader title={t("swab")} subtitle="Vorher / Nachher" onBack={onDone} t={t}/>
    <div className="reference-comparison">{photos.map((photo, index) => <figure key={photo.id}><img src={photo.annotatedImage || photo.image} alt={`${t("photo")} ${index + 1}`}/><figcaption>{index === 0 ? "Vorher / Before" : "Nachher / After"}</figcaption></figure>)}</div>
    <div className="panel swab-result"><h2>{de ? "Entscheidungshilfe für den Operator" : "Operator decision aid"}</h2>
      <p>{de ? "Der Demonstrator wendet keinen validierten quantitativen Schwellenwert an." : "The demonstrator does not apply a validated quantitative threshold."}</p>
      <p className="swab-statement">{wischText(vergleich, de ? "de" : "en")}</p>
      <ul className="swab-criteria">
        {Object.values(vergleich.kriterien).map(eintrag => <li key={eintrag.kriterium}>
          <span className="swab-criterion-name">{t(eintrag.kriterium)}</span>
          <strong>{eintrag.vorher === null || eintrag.nachher === null
            ? (de ? "kein Vergleich möglich" : "no comparison possible")
            : `${eintrag.vorher} → ${eintrag.nachher}`}</strong>
          <small>{wischKriteriumText(eintrag, de ? "de" : "en")}</small>
        </li>)}
      </ul>
      {wischEinschraenkungsTexte(vergleich, de ? "de" : "en").length > 0
        && <div className="alert alert-warning"><AlertTriangle size={17} aria-hidden="true"/>
          <div><strong>{de ? "Vergleichbarkeit" : "Comparability"}</strong>
            <ul>{wischEinschraenkungsTexte(vergleich, de ? "de" : "en")
              .map(text => <li key={text}>{text}</li>)}</ul></div></div>}
    </div>
    {after && <><VerdictCard criterion="clean" verdict={after.clean} checkpoints={after.checkpoints} language={language} t={t}/><VerdictCard criterion="intact" verdict={after.intact} checkpoints={after.checkpoints} language={language} t={t}/></>}
    <Button icon={Home} variant="primary" onClick={onDone}>{t("home")}</Button>
  </section>;
}

/* Wie viele Kandidaten JE RANGFOLGE ins Protokoll wandern. Gespeichert
   wird die Vereinigung beider Spitzen, also hoechstens das Doppelte —
   siehe waehleProtokollKandidaten und SC-22. Die Anzeige zeigt dieselbe
   Auswahl; die Gesamtzahl steht daneben, damit die Kuerzung sichtbar ist
   und nicht wie Vollstaendigkeit aussieht. */
const SCREENING_PROTOKOLL_SPITZE = 10;

/**
 * Die Screening-Uebersicht, wie Bildschirm, Datensatz und Protokoll sie
 * gleichermassen sehen.
 *
 * Bis rc.4.26 entstand sie ausschliesslich beim Bauen des Datensatzes —
 * also erst NACH der Unterschrift. Der Ergebnis-Bildschirm, auf dem noch
 * jemand nachsehen oder ablehnen koennte, zeigte sie nie (U27).
 *
 * Fuer den Bildschirm eine zweite, eigene Fassung zu bauen waere derselbe
 * Fehler wie zwei getrennte Overlay-Erzeugungen: die Fassungen laufen
 * auseinander, und der Unterschied faellt niemandem auf. Deshalb genau
 * eine Quelle — auch die Kuerzung auf die Spitze ist dieselbe, sonst
 * zeigte der Bildschirm mehr, als spaeter im Protokoll steht.
 */
export function screeningUebersicht(analyzedPhotos, screeningConfig) {
  const fotos = (analyzedPhotos || []).filter(foto => foto?.screening);
  if (!fotos.length) return null;
  return {
    configHash: screeningConfig?.configHash || null,
    configQuelle: screeningConfig?.quelle || null,
    photos: fotos.map(foto => ({
      photoId: foto.id,
      candidateCount: foto.screening.candidates.length,
      suppressedCount: foto.screening.suppressedCount,
      grindDirectionDeg: foto.screening.grindDirectionDeg,
      /* Rohwert und Faecherzahl gehoeren zusammen: die Richtungsstaerke
         ist nur bei gleicher Faecherzahl vergleichbar (gemessen in
         SC-21). Das Histogramm bleibt bewusst draussen — es gehoert in
         die Werkbank, nicht in den GMP-Datensatz. */
      grindStrength: foto.screening.grindStrength,
      orientationBins: foto.screening.orientationBins,
      /* Bezugsgroesse der Bounding Boxes — siehe scratchScreening.js.
         Ohne sie ist keine Kandidatenstelle im Foto auffindbar. */
      bildBreite: foto.screening.bildBreite,
      bildHoehe: foto.screening.bildHoehe,
      candidates: waehleProtokollKandidaten(
        foto.screening.candidates, SCREENING_PROTOKOLL_SPITZE),
      /* Die VOLLSTAENDIGE Liste daneben. Die Vorauswahl bleibt, was sie
         war — Anzeige und PDF haengen an ihr. Aber sie begrenzt nicht mehr,
         was der Datensatz ueberhaupt weiss.

         Der Rang wird hier vergeben, nicht spaeter abgeleitet: die
         Listenreihenfolge IST die gerichtete Rangfolge, und wer sie
         spaeter aus gerundeten Bewertungen rekonstruiert, bekommt bei
         gleichen Werten eine andere Ordnung. */
      alleKandidaten: foto.screening.candidates.map((k, i) => ({
        ...k, rank: Number.isFinite(k?.rank) ? k.rank : i + 1,
      })),
    })),
  };
}

export default function VisuClean({ initialUser = null } = {}) {
  const [language, setLanguageState] = useState(() => localStorage.getItem("visuclean-language") || "de");
  const [user, setUser] = useState(initialUser);
  const [screen, setScreen] = useState("home");
  /* Gemeldete Schadensverdachte dieser Pruefung. Sie wandern unveraendert
     in `manualFindings` des Datensatzes und halten die Freigabe zurueck,
     bis sie dokumentiert beurteilt sind. */
  const [schadensverdachte, setSchadensverdachte] = useState([]);
  const [mode, setMode] = useState("inspect");
  const [equipment, setEquipment] = useState(null);
  const [zone, setZone] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [analyzedPhotos, setAnalyzedPhotos] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [systemDecision, setSystemDecision] = useState(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  /* Konfiguration des Screenings. null = noch nicht geladen; bis dahin
     greifen die paketgebundenen Stellwerte. In rc.4.19 existierten Datei
     und Parser, wurden aber nie benutzt - die Zusage "ohne Release
     nachjustierbar" war damit unerfuellt. Befund der Gegenpruefung. */
  const [screeningConfig, setScreeningConfig] = useState(null);
  /* P3 · die geführte Aufnahmesequenz der laufenden Prüfung.
     null heisst: kein geführter Ablauf. Das Feuchte-Tor aus rc.4.26
     bleibt dann zu, und der Feuchtepunkt ist manuell zu bestätigen — das
     ist die gewollte Wirkung, kein Mangel. */
  const [feuchteSequenz, setFeuchteSequenz] = useState(null);
  /* Eingetragene Tiefenmessungen der laufenden Pruefung. Eine Messung
     ersetzt eine frueher eingetragene zur SELBEN BINDUNG — der erste
     Versuch verschwindet damit, was hier richtig ist: anders als bei
     einer Aufnahmesequenz gibt es keinen Grund, eine korrigierte Zahl
     daneben stehen zu lassen.

     Die Regel steht in depthLimit.js und nicht hier. Sie stand hier, und
     sie verglich `photoId + kandidatId`; bei manuellen Markierungen ist
     `kandidatId` immer `null`, sodass die zweite Markierung die erste
     ueberschrieb (Befund vom 16.09.2026). Als Datenregel ist sie
     pruefbar, ohne ein Formular zu rendern — T33. */
  const [depthMeasurements, setDepthMeasurements] = useState([]);
  const tiefenMessung = messung =>
    setDepthMeasurements(alt => ersetzeMessung(alt, messung));
  /* Eine gesehene Stelle melden — ohne Detektortreffer, ohne Messung.
     Der Eintrag entsteht in genau der Form, die validateManualFinding
     verlangt; die Speichergrenze weist sonst den ganzen Datensatz ab, und
     der Pruefer erfuehre das erst nach der Signatur.

     Je Marker genau EIN Verdacht: ein zweiter Klick ueberschreibt den
     Grund, statt eine zweite Meldung fuer dieselbe Stelle anzulegen. */
  const meldeSchadensverdacht = ({ photoId, markerId, reason }) =>
    setSchadensverdachte(alt => {
      const eintrag = {
        kind: MANUAL_FINDING.MANUAL_DAMAGE_SUSPECTED,
        username: user.username, role: user.role,
        at: new Date().toISOString(),
        reason: String(reason || "").trim(),
        photoId, markerId, klaerung: null,
      };
      const ohne = alt.filter(v => !(v.photoId === photoId && v.markerId === markerId));
      return [...ohne, eintrag];
    });
  /* Die Beurteilung. Sie loescht den Verdacht NICHT — sie beantwortet ihn.
     Der Verdacht bleibt mitsamt seiner urspruenglichen Begruendung im
     Datensatz, sonst waere spaeter nicht mehr zu sehen, worauf sich die
     Beurteilung bezog. */
  const beurteileSchadensverdacht = ({ photoId, markerId, ergebnis, begruendung }) =>
    setSchadensverdachte(alt => alt.map(v =>
      v.photoId === photoId && v.markerId === markerId
        ? { ...v, klaerung: {
          at: new Date().toISOString(), username: user.username, role: user.role,
          ergebnis, begruendung: String(begruendung || "").trim(),
        } }
        : v));
  useEffect(() => {
    let lebt = true;
    /* Same-Origin, vom Service Worker zwischengespeichert. Schlaegt der
       Abruf fehl, greifen die paketgebundenen Werte - mit Begruendung in
       quelle, nie stillschweigend. */
    /* Genau EIN paketeigener, relativer Pfad. Der Vergleich ist keine
       Formalie: er macht fuer Mensch und Wache sichtbar, dass hier nichts
       anderes abgerufen werden kann. Es verlaesst kein Bild und kein
       Datensatz das Geraet — abgerufen wird eine Datei, die ohnehin im
       Paket liegt und vom Service Worker zwischengespeichert ist. */
    ladeScreeningConfig(pfad => {
      if (pfad !== CONFIG_PFAD) throw new Error("SCREENING_CONFIG_PFAD_UNERLAUBT");
      return fetch(CONFIG_PFAD, { cache: "no-cache" });
    })
      .then(geladen => { if (lebt) setScreeningConfig(geladen); })
      .catch(() => { if (lebt) setScreeningConfig(null); });
    return () => { lebt = false; };
  }, []);
  const [comment, setComment] = useState("");
  const [records, setRecords] = useState([]);
  const [issues, setIssues] = useState([]);
  const [references, setReferences] = useState([]);
  const [auditStatus, setAuditStatus] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);
  const [pwaReady, setPwaReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [knownIssuePhoto, setKnownIssuePhoto] = useState(null);
  const [knownIssueAssignments, setKnownIssueAssignments] = useState([]);
  const [spaeterFreigeben, setSpaeterFreigeben] = useState(false);
  const [issueAction, setIssueAction] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  /* RC4.2: dokumentierte Massnahmen und die schwebende QA-Genehmigung.
     performedBy und approvedBy sind zwei getrennte Handlungen; zwischen
     ihnen haelt pendingApproval den Stand des Pruefers fest. */
  const [retakes, setRetakes] = useState([]);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [swabOrigin, setSwabOrigin] = useState(null);
  const [swabData, setSwabData] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fusionScore, setFusionScore] = useState(null);
  const selfTest = useMemo(() => runEngineSelfTest(), []);
  const t = useMemo(() => translator(language), [language]);

  const setLanguage = useCallback(value => {
    localStorage.setItem("visuclean-language", value);
    document.documentElement.lang = value;
    setLanguageState(value);
  }, []);

  const refreshData = useCallback(async () => {
    const [nextRecords, nextIssues, nextReferences, nextAudit, nextStorage] = await Promise.all([
      loadInspections(), loadIssues(), loadReferences(), verifyStoredAudit(), storageEstimate(),
    ]);
    setRecords(nextRecords); setIssues(nextIssues); setReferences(nextReferences);
    setAuditStatus(nextAudit); setStorageInfo(nextStorage);
    return { nextRecords, nextIssues, nextReferences, nextAudit };
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    refreshData().catch(caught => {
      if (!active) return;
      setAuditStatus({ ok: false, count: 0, reason: caught.message });
      setError(caught.message);
    });
    return () => { active = false; };
  }, [refreshData, user]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(() => setPwaReady(true)).catch(() => setPwaReady(false));
  }, []);

  const resetFlow = useCallback(() => {
    setEquipment(null); setZone(null); setPhotos([]); setAnalyzedPhotos([]); setAggregate(null);
    setSystemDecision(null); setComment(""); setPendingDecision(null); setOverrideReason(""); setError("");
    setSwabOrigin(null); setSwabData(null); setRetakes([]); setPendingApproval(null); setFusionScore(null);
    setKnownIssueAssignments([]); setSpaeterFreigeben(false); setFeuchteSequenz(null);
    /* BEFUND der Gegenpruefung an rc.4.44: gemeldete Schadensverdachte und
       eingetragene Tiefenmessungen ueberlebten den Vorgangswechsel. Die
       naechste Pruefung startete mit der Meldung und der QA-Pflicht der
       vorigen — an einem Foto und einem Marker, die es dort gar nicht mehr
       gibt. Beide gehoeren AN DEN VORGANG, nicht an die Sitzung.
       Gespeicherte Datensaetze bleiben davon unberuehrt. */
    setSchadensverdachte([]); setDepthMeasurements([]);
  }, []);

  /* ── P3 · geführte Aufnahme starten und fortschreiben ────────────────
     Die Sequenz gehoert an die ZONE. Ein Wechsel der Zone wirft sie weg —
     sonst truege eine Serie aus drei Aufnahmen der Matrizenteller den
     Namen einer anderen Stelle. */
  const starteSequenz = useCallback(() => {
    setPhotos([]);
    setFeuchteSequenz(leereSequenz(zone?.id ?? null));
  }, [zone]);

  /* Eine Aufnahme wird der Sequenz zugeschlagen. Der Fehlerfall ist
     sichtbar: eine abgewiesene Aufnahme verschwindet nicht stillschweigend
     aus der Sequenz, sie kommt gar nicht erst hinein, und der Prüfer sieht
     die Position weiter offen. */
  const sequenzAufnahme = useCallback((photoId, position) => {
    setFeuchteSequenz(bisher => {
      const { sequenz: naechste } = schrittHinzufuegen(bisher, {
        lichtposition: position, photoId, zoneId: zone?.id ?? null,
        aufgenommenAm: new Date().toISOString(),
      });
      return naechste;
    });
  }, [zone]);

  /* Wird ein Foto entfernt, faellt es auch aus der Sequenz. Sonst zeigte
     die Sequenz auf ein Bild, das es nicht mehr gibt, und
     `wiederholbarkeit()` meldete spaeter AUFNAHME_<Position>. */
  useEffect(() => {
    if (!feuchteSequenz) return;
    const vorhanden = new Set(photos.map(p => p.id));
    const verwaist = (feuchteSequenz.captures || []).filter(c => !vorhanden.has(c.photoId));
    if (!verwaist.length) return;
    setFeuchteSequenz(bisher => verwaist.reduce(
      (seq, c) => schrittEntfernen(seq, c.photoId), bisher));
  }, [photos, feuchteSequenz]);

  const goHome = useCallback(() => { resetFlow(); setScreen("home"); }, [resetFlow]);
  const start = selectedMode => {
    resetFlow(); setMode(selectedMode);
    if (selectedMode === "light") {
      setEquipment({ id: "system", code: "VC-SYSTEM", de: "Systemcheck", en: "System check", zones: [] });
      setZone({ id: "light", de: "Belichtungsprüfung", en: "Exposure check" }); setScreen("capture");
    } else if (selectedMode === "swab") {
      setEquipment({ id: "swab", code: "VC-SWAB", de: "Wischtest", en: "Swab test", zones: [] });
      setZone({ id: "comparison", de: "Vorher / Nachher", en: "Before / after" }); setScreen("capture");
    } else setScreen("equipment");
  };

  const selectEquipment = (selectedEquipment, selectedZone = null) => {
    setEquipment(selectedEquipment);
    if (selectedZone) { setZone(selectedZone); setScreen("capture"); }
    else setScreen("zone");
  };
  const selectZone = selectedZone => { setZone(selectedZone); setScreen("capture"); };

  const currentReference = equipment && zone ? references.find(item => item.eqId === equipment.id && item.zoneId === zone.id) : null;

  const analyze = async () => {
    if (!photos.length) return;
    setScreen("analysis"); setAnalysisStep(0); setError("");
    try {
      const processed = [];
      const fusionGroupId = photos.length > 1 ? newId("fusion") : null;
      for (let index = 0; index < photos.length; index++) {
        setAnalysisStep(index);
        const photo = photos[index];
        /* Die Prüffläche dieses Fotos. Fehlt sie, gilt die Voreinstellung —
           und sie wird als Voreinstellung ausgewiesen, nicht als Auswahl. */
        const flaeche = normalisiereFlaeche(photo.pruefflaeche ?? FLAECHE_VORGABE);
        const flaechenQuelle = photo.pruefflaeche
          ? (photo.flaechenQuelle ?? FLAECHE_QUELLE.GEWAEHLT) : FLAECHE_QUELLE.VORGABE;
        const rawResult = await analyzeImage(photo.image, screeningConfig?.options,
          feuchteSequenz, flaeche, flaechenQuelle);
        const applied = mode === "inspect" ? applyKnownIssues(rawResult, equipment.id, zone.id, issues) : { res: rawResult, info: null };
        /* Marker liegen in FOTO-Anteilen, Masken und Overlay ab jetzt im
           ZUSCHNITT. Ohne Umrechnung zeigte ein Marker auf eine andere
           physische Stelle. Ein Marker ausserhalb der Prüffläche wird NICHT
           an den Rand geklemmt — er wird als ausserhalb ausgewiesen, weil
           an seiner Stelle nichts bewertet wurde. Die Reihenfolge bleibt
           1:1 zu photo.markers, sonst wandern die Nummern. */
        const markerAssessments = (photo.markers || []).map(marker => {
          const abgebildet = markerAufFlaeche(marker, flaeche);
          return abgebildet
            ? assessMarker(rawResult, abgebildet)
            : { code: "OUTSIDE_AREA", severity: 0, ausserhalb: true };
        });
        /* Gezeichnet wird auf dem ZUSCHNITT, nicht auf dem vollen Foto:
           ein Overlay über dem Original läge um den Zuschnittversatz
           daneben. Die Nummer reist am Marker mit, damit die Beschriftung
           dieselbe bleibt, auch wenn ein Marker nicht gezeichnet wird. */
        const gezeichneteMarker = (photo.markers || [])
          .map((marker, nummer) => {
            const abgebildet = markerAufFlaeche(marker, flaeche);
            return abgebildet ? { ...abgebildet, nummer: nummer + 1 } : null;
          })
          .filter(Boolean);
        const rendered = await annotatedImage(
          rawResult.zuschnittBild, rawResult._ov, gezeichneteMarker);
        const toleriert = { ...applied.res, checkpoints: applyToleratedScratch(rawResult.checkpoints, applied.info) };
        const profile = captureProfile({
          ...rawResult.captureProfile,
          fusionGroupId,
          sequenceIndex: index,
          brightness: rawResult.captureProfile?.brightness,
          labelShape: rawResult.captureProfile?.labelShape,
          residualPx: rawResult.captureProfile?.residualPx,
          registered: rawResult.captureProfile?.registered,
        });
        /* Kratzer-Screening je Einzelbild - nicht nur im Mehrwinkelpfad.
           Bis rc.4.19 lief es ausschliesslich in der Fusion und war damit
           bei einer Einzelaufnahme gar nicht vorhanden. Es fuegt nur
           Kandidaten hinzu und sortiert; das Kernurteil in `toleriert`
           bleibt unberuehrt (SC-01/SC-02). */
        const screening = rawResult._screeningHochaufloesend
          || (rawResult._imageData
            ? screenScratches(
              rawResult._imageData.data,
              rawResult._imageData.width,
              rawResult._imageData.height,
              screeningConfig?.options)
            : null);
        processed.push({
          ...photo, rawResult, result: toleriert, knownIssueInfo: applied.info,
          markerAssessments, annotatedImage: rendered, captureProfile: profile,
          screening, gezeichneteMarker,
        });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      /* Mehrwinkel-Fusion: Zugabe, kein Ersatz fuer Einzelbild. detect=null
         auf rc.4.5-Basis (screenScratches kommt erst mit rc.4.6). */
      let scored = null;
      if (processed.length >= 2) {
        const planeSize = 128;
        const frames = processed.map((photo, sequenceIndex) => {
          const reg = photo.rawResult._registration;
          const src = photo.rawResult._imageData;
          /* Die Ebenenannahme wird VOR der Entzerrung geprueft, nicht
             danach. Auf einer gekruemmten Flaeche gilt eine Homographie
             nicht — und das Residuum am ebenen Etikett belegt nichts
             ueber die Flaeche daneben (siehe registration.js). */
          const ebene = rectificationAllowed(zone);
          const registered = ebene.allowed
            && photo.captureProfile?.registered === true && reg && src;
          let data = null, width = 0, height = 0;
          let grund = ebene.allowed ? null : ebene.reason;
          let abdeckung = null, wiederResiduum = null;
          if (registered) {
            /* Wie viel des 3x-Prueffelds stammt ueberhaupt aus dem Foto?
               Ausserhalb klemmt warpToPlane auf den Randpixel — das waere
               Flaeche, die nie fotografiert wurde. */
            abdeckung = warpCoverage(reg.homography, src.width, src.height, planeSize);
            const warped = warpToPlane(src, reg.homography, planeSize);
            if (!warped) {
              grund = "WARP_FAILED";
            } else if (abdeckung < WARP_COVERAGE_MIN) {
              grund = "FIELD_COVERAGE_TOO_LOW";
            } else {
              /* Unabhaengige Registrierungskontrolle: das Etikett wird im
                 ENTZERRTEN Bild noch einmal gesucht. `registrationQuality`
                 projiziert dieselben vier Punkte zurueck, aus denen die
                 Homographie geloest wurde, und liegt bauartbedingt nahe
                 null — als Nachweis taugt es nicht. Befund der
                 Gegenpruefung an rc.4.7, zutreffend. */
              const kontrolle = verifyByRedetect(warped, reg.homography, bild => {
                const gefunden = jsQR(bild.data, bild.width, bild.height,
                  { inversionAttempts: "attemptBoth" });
                return gefunden?.location ? {
                  topLeftCorner: gefunden.location.topLeftCorner,
                  topRightCorner: gefunden.location.topRightCorner,
                  bottomRightCorner: gefunden.location.bottomRightCorner,
                  bottomLeftCorner: gefunden.location.bottomLeftCorner,
                } : null;
              });
              wiederResiduum = Number.isFinite(kontrolle.redetectResidualPx)
                ? kontrolle.redetectResidualPx : null;
              if (kontrolle.status !== "CHECKED") {
                grund = "REDETECT_LABEL_NOT_FOUND";
              } else if (kontrolle.redetectResidualPx > REGISTRATION_RESIDUAL_MAX_PX) {
                grund = "REDETECT_RESIDUAL_TOO_HIGH";
              } else {
                data = warped.data; width = warped.width; height = warped.height;
              }
            }
          }
          return {
            sequenceIndex,
            data, width, height,
            registered: Boolean(data),
            fieldCoverage: abdeckung,
            redetectResidualPx: wiederResiduum,
            residualPx: photo.captureProfile?.residualPx,
            labelShape: photo.captureProfile?.labelShape,
            excludeReason: grund
              || (registered ? undefined : (reg ? "REGISTRATION_FAILED" : "LABEL_NOT_DETECTED")),
          };
        });
        /* Nicht ebene Flaechen: die Homographie aus vier Etikettenecken
           gilt nur, wenn die Pruefflaeche in derselben Ebene liegt wie das
           Etikett. Bei Rohren, Kesseln und Konen ist sie fachlich
           ungueltig. Solche Aufnahmen werden von der Fusion ausgenommen —
           als Einzelbilder bleiben sie vollstaendig erhalten und werden
           normal bewertet. Die Eigenschaft ist deklariert, nicht gemessen. */
        const fusion = fuseAngles(zone.planar === false ? [] : frames);
        /* Nahtstelle: der Detektor ist ein PARAMETER, kein Import in
           multiAngle.js — sonst haengt die Fusion am Screening (MA-ISO).
           Bis rc.4.16 stand hier null: die Fusion lief, bekam aber nie
           Kandidaten und meldete NO_DETECTOR. Seit rc.4.17 speist
           screenScratches sie.

           Das Screening fuegt nur hinzu und sortiert. Es kann kein Urteil
           aendern und kein PASS erzeugen — SC-01 und SC-02 sichern das. */
        const detect = (bild, optionen) => ({
          candidates: screenScratches(bild.data, bild.width, bild.height,
            { ...(screeningConfig?.options || {}), ...(optionen || {}) }).candidates,
        });
        /* Abdeckung und unabhaengiges Residuum je Aufnahme festhalten —
           sie gehoeren in den Datensatz, nicht nur in die Rechnung. */
        const aufnahmen = frames.map(f => ({
          sequenceIndex: f.sequenceIndex,
          fieldCoverage: f.fieldCoverage ?? null,
          redetectResidualPx: f.redetectResidualPx ?? null,
        }));
        /* Auf einer nicht ebenen Zone wurde keine Aufnahme entzerrt; die
           Fusion hat damit nichts zu verrechnen. Der Status sagt das,
           statt ein Ergebnis auszuweisen, das aus gesperrten Bildern
           stammt. Der Oberflaechentext ("die Mehrwinkelauswertung
           entfaellt hier") trifft damit wieder zu. */
        const ebeneZone = rectificationAllowed(zone);
        scored = ebeneZone.allowed
          ? scoreByPersistence(fusion, detect)
          : { ...scoreByPersistence(fusion, detect), status: ebeneZone.reason };
        scored = { ...scored, captures: aufnahmen };
      }
      setFusionScore(scored);
      const nextAggregate = aggregateResults(processed.map(photo => photo.result));
      const nextDecision = deriveSystemDecision(nextAggregate);
      setAnalyzedPhotos(processed); setAggregate(nextAggregate); setSystemDecision(nextDecision);
      if (mode === "reference") {
        const reference = {
          id: `${equipment.id}:${zone.id}`, schema: 1, eqId: equipment.id, zoneId: zone.id,
          eqName: equipmentName(equipment, language), zoneName: zoneName(zone, language),
          image: processed[0].image, annotatedImage: processed[0].annotatedImage,
          result: stripResult(processed[0].result), markers: processed[0].markers,
          createdAt: new Date().toISOString(), createdBy: publicUser(user),
        };
        reference.recordHash = await recordDigest(reference);
        await saveReference(reference, user);
        await refreshData();
      }
      setScreen(mode === "swab" ? "swabResult" : "result");
    } catch (caught) {
      setError(caught.message || String(caught)); setScreen("capture");
    }
  };

  const reapplyIssues = useCallback(nextIssues => {
    if (!analyzedPhotos.length || !equipment || !zone) return;
    const nextPhotos = analyzedPhotos.map(photo => {
      const applied = applyKnownIssues(photo.rawResult, equipment.id, zone.id, nextIssues);
      const toleriert = { ...applied.res, checkpoints: applyToleratedScratch(photo.rawResult.checkpoints, applied.info) };
      return { ...photo, result: toleriert, knownIssueInfo: applied.info };
    });
    const nextAggregate = aggregateResults(nextPhotos.map(photo => photo.result));
    setAnalyzedPhotos(nextPhotos); setAggregate(nextAggregate); setSystemDecision(deriveSystemDecision(nextAggregate));
  }, [analyzedPhotos, equipment, zone]);

  const createIssue = async issue => {
    try {
      setBusy(true); await saveIssue(issue, user); const data = await refreshData(); reapplyIssues(data.nextIssues); setKnownIssuePhoto(null);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  const saveIssueAction = async (issue, action) => {
    try {
      setBusy(true); await saveIssue(issue, user, action); const data = await refreshData(); reapplyIssues(data.nextIssues); setIssueAction(null);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  /* Eine Massnahme wird nur angenommen, wenn sie vollstaendig dokumentiert
     ist. Die Pruefung liegt in decision.js, nicht hier — die Oberflaeche
     darf keine Sicherheitsgrenze sein. */
  const ergaenzeMassnahme = eintrag => {
    const vollstaendig = { ...eintrag, eqId: equipment.id, zoneId: zone.id };
    const pruefung = validateRetakeRecord(vollstaendig);
    if (!pruefung.valid) { setError(pruefung.error); return; }
    setRetakes(liste => [...liste, vollstaendig]);
    setError("");
  };

  /* Die Zuordnung wird mit derselben Funktion geprueft, die auch die
     Speichergrenze benutzt — keine zweite, laxere Regel in der Oberflaeche. */
  const ordneKnownIssueZu = eintrag => {
    const pruefung = validateKnownIssueAssignment(eintrag);
    if (!pruefung.valid) { setError(pruefung.error); return; }
    setKnownIssueAssignments(liste =>
      liste.some(item => item.issueId === eintrag.issueId) ? liste : [...liste, eintrag]);
    setError("");
  };

  /* Eine Quelle fuer die QA-Pflicht, in Oberflaeche UND Erzeuger. */
  const qaAusloeser = collectQaTriggers({
    /* BEFUND des Geraetelaufs mit rc.4.43: hier stand fest `[]`. Der
       Vertrag kannte manuelle Feststellungen, die Oberflaeche reichte aber
       nie eine weiter — eine gesehene Stelle ohne Detektortreffer kam
       damit ueberhaupt nicht in den Datensatz. */
    retakes, manualFindings: schadensverdachte, knownIssueAssignments,
  });

  const chooseDecision = decision => { setPendingDecision(decision); setScreen("signature"); };

  /* Nachgereichte Freigabe, zweite Haelfte: der gespeicherte wartende
     Datensatz wird geladen, die QA authentifiziert sich neu und signiert,
     und daraus entsteht eine EIGENE Freigaberevision, die auf den
     recordHash des wartenden Datensatzes zeigt.

     Der wartende Datensatz wird nicht angefasst (Regel 6, append-only).
     Die Freigabe ist eine ABLEITUNG: alle inhaltlichen Felder werden
     unveraendert uebernommen, die Speichergrenze prueft das nach. */
  const [nachfreigabe, setNachfreigabe] = useState(null);
  /* Die QA entscheidet, wie sie abschliesst — nicht immer positiv. Befund
     der Gegenpruefung an rc.4.8: der nachgereichte Weg erzeugte
     ausnahmslos einen positiven Abschluss. */
  const [nachfreigabeEntscheidung, setNachfreigabeEntscheidung] = useState("PASS");
  /* Die Begruendung der QA ist ihr eigenes Feld — der Prueferkommentar
     bleibt durch die Inhaltsbindung unantastbar. */
  const [nachfreigabeBegruendung, setNachfreigabeBegruendung] = useState("");
  const starteNachfreigabe = (record, entscheidung = "PASS") => {
    setNachfreigabe(record); setNachfreigabeEntscheidung(entscheidung);
    setNachfreigabeBegruendung(""); setScreen("nachfreigabe");
  };

  /* ── BEFUND D · Die Beurteilung im wiedergeoeffneten Bericht ───────────
     Der gemeldete Schadensverdacht sperrt PASS und Override. Konnte die QA
     ihn nach der Uebergabe nicht beantworten, blieb nur die Sperrung — der
     Vorgang war eingemauert.

     Die Antwort ist eine ERGAENZUNG (Leitplanke 6): ein neuer, an die
     gepruefte Revision gebundener Datensatz, der die Meldung mitsamt ihrer
     urspruenglichen Begruendung behaelt. Und sie ist keine Freigabe: der
     Vorgang wartet danach weiter, mit eigener Unterschrift und eigener
     Bedeutung (§11.50). */
  const [pendingKlaerung, setPendingKlaerung] = useState(null);
  const starteKlaerung = (record, klaerung) => {
    setPendingKlaerung({ record, klaerung }); setError(""); setScreen("klaerung");
  };

  const erteileKlaerung = async signature => {
    if (!pendingKlaerung) return;
    setBusy(true); setError("");
    try {
      const jetzt = new Date().toISOString();
      /* DERSELBE Erzeuger, den Q5 bis Q13 fahren — kein Nachbau hier. */
      const ergaenzung = buildClarificationRecord({
        pending: pendingKlaerung.record, actor: user, signature, now: jetzt,
        newId: newId("inspection"), appVersion: APP_VERSION,
        klaerungen: [pendingKlaerung.klaerung],
      });
      if (!ergaenzung) throw new Error("Diese Beurteilung ist so nicht moeglich");
      await schreibe(ergaenzung, user);
      setPendingKlaerung(null);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  const erteileNachfreigabe = async ({ approver, signature }) => {
    if (!nachfreigabe) return;
    setBusy(true); setError("");
    try {
      const jetzt = new Date().toISOString();
      /* DERSELBE Erzeuger, den der Ablauftest fahrt — kein Nachbau hier. */
      const freigabe = buildApprovalRecord({
        pending: nachfreigabe, approver, signature, now: jetzt,
        decision: nachfreigabeEntscheidung, newId: newId("inspection"),
        appVersion: APP_VERSION, approvalComment: nachfreigabeBegruendung,
      });
      if (!freigabe) throw new Error("Dieser Datensatz wartet nicht auf eine Freigabe");
      await schreibe(freigabe, approver);
      setNachfreigabe(null);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  /* Der Pruefer schliesst ab und uebergibt an die QA — ohne dass jemand
     anwesend sein muss. finalize erkennt das an spaeterFreigeben. */
  /* Die BEDEUTUNG der Operator-Unterschrift muss die tatsaechliche Handlung
     nennen — vor dem Unterschreiben, nicht danach.

     Bis rc.4.10 zeigte der Bildschirm "Sperrung" oder "Freigabe", und
     gespeichert wurde anschliessend "Pruefung erfasst, Freigabe
     ausstehend". Wer unterschreibt, bestaetigt damit etwas anderes als das,
     was im Datensatz steht — unter §11.50 ist genau die Bedeutung der
     Unterschrift der Punkt. Befund der Gegenpruefung an rc.4.10. */
  const unterschriftBedeutung = (() => {
    if (!pendingDecision) return signatureMeaning(pendingDecision);
    const zustand = deriveState({
      finalDecision: pendingDecision, hasDeviation: qaAusloeser.length > 0,
    });
    return (spaeterFreigeben || needsQaApproval(zustand))
      ? SIGNATURE_MEANING[LIFECYCLE_STATE.PENDING_QA]
      : signatureMeaning(pendingDecision);
  })();

  const spaeterAnQa = decision => {
    setSpaeterFreigeben(true); setPendingDecision(decision); setScreen("signature");
  };
  const acceptOverride = reason => { setOverrideReason(reason); setOverrideOpen(false); chooseDecision("OVERRIDE"); };

  /* Baut den Datensatz ueber den GEMEINSAMEN Erzeuger. Bis RC4.1 entstand
     hier ein zweiter, abweichender Datensatz — er trug schema 2, waehrend
     die Persistenz schemaVersion 3 verlangte, und Speichern war unmoeglich.
     speicherpfadtest.mjs haelt beide Haelften jetzt zusammen. */
  const baueDatensatz = (signature, performedBy, approvedBy, actor, now, zusatz = {}) => signInspection({
    id: newId("inspection"), appVersion: APP_VERSION, now, signedBy: actor.username,
    user: publicUser(actor), eqId: equipment.id, eqName: equipmentName(equipment, language),
    zoneId: zone.id, zoneName: zoneName(zone, language),
    photos: analyzedPhotos.map(photo => ({
      id: photo.id, image: photo.image, annotatedImage: photo.annotatedImage,
      markers: photo.markers, markerAssessments: photo.markerAssessments,
      result: stripResult(photo.result),
      captureProfile: photo.captureProfile,
      knownIssueInfo: photo.knownIssueInfo ? {
        status: photo.knownIssueInfo.status,
        issues: (photo.knownIssueInfo.issues || []).map(issue => ({
          id: issue.id, issueType: issue.issueType, status: issue.status, knownSince: issue.knownSince,
          validUntil: issue.validUntil, createdBy: issue.createdBy, createdAt: issue.createdAt,
        })),
        matchedZones: photo.knownIssueInfo.matchedZones || 0,
      } : null,
    })),
    aggregate: stripResult(aggregate), originalSystemDecision: systemDecision,
    finalDecision: pendingDecision,
    performedBy, approvedBy, reauthenticated: true,
    comment: comment.trim(), overrideReason: overrideReason || null,
    swabTest: swabData, referenceId: currentReference?.id || null,
    /* BEFUND der Gegenpruefung an rc.4.44, ueber den vollstaendigen
       Bedien- und Speicherweg reproduziert: hier fehlten die gemeldeten
       Schadensverdachte. Zwei ueber die Oberflaeche angelegte Meldungen
       waren nach Unterschrift und Speicherung im Export verschwunden —
       null Meldungen, null QA-Trigger.

       Die Uebergabe an `collectQaTriggers` weiter oben sieht gleich aus
       und ist es nicht: sie fuellt den QA-ZAEHLER der Oberflaeche, nicht
       den Datensatz. Meine Strukturwache X1 hat genau diese Stelle
       getroffen und deshalb Gruen gemeldet — eine Wache am falschen Ort
       ist schlimmer als keine.

       Ab jetzt prueft werkbank/bedienlauf.mjs den echten Weg im Browser:
       melden, unterschreiben, speichern, neu laden, exportieren. */
    manualFindings: schadensverdachte,
    signature, retakes, knownIssueAssignments, ...zusatz,
    fusionSummary: fusionScore ? {
      status: fusionScore.status,
      usedCount: fusionScore.fuse?.usedCount,
      poseSpread: fusionScore.fuse?.poseSpread,
      meaningful: fusionScore.fuse?.meaningful,
      excluded: fusionScore.fuse?.excluded,
      captures: fusionScore.captures || [],
    } : null,
    /* Kratzer-Screening je Aufnahme, gebunden an die Konfiguration, mit
       der es gerechnet hat. Gespeichert wird die sortierte Spitze plus
       die vollen Zahlen — alle Kandidaten sprengen Datensatz und PDF
       (gemessen: 799 Zeilen fuer drei Aufnahmen), die Gesamtzahl bleibt
       aber sichtbar, damit nichts verschwiegen wird. */
    screening: screeningUebersicht(analyzedPhotos, screeningConfig),
    feuchteSequenz,
    depthMeasurements,
  });

  const schreibe = async (record, actor) => {
    record.recordHash = await recordDigest(record);
    await saveInspection(record, actor);
    const data = await refreshData();
    setSelectedRecord(data.nextRecords.find(item => item.id === record.id) || record);
    resetFlow(); setScreen("history");
  };

  /* Erste Handlung: der Pruefer zeichnet. Traegt der Fall eine
     Qualitaetsabweichung, endet er hier NICHT — er geht in die getrennte
     QA-Genehmigung. */
  const finalize = async signature => {
    if (!auditStatus?.ok || !pendingDecision) return;
    setBusy(true); setError("");
    try {
      const jetzt = new Date().toISOString();
      const performedBy = { username: user.username, role: user.role, at: jetzt };
      /* DIESELBE Quelle wie der Erzeuger und die Speichergrenze.

         Bis rc.4.8 stand hier `hasDeviation: retakes.length > 0`. Das ist
         etwas anderes als `collectQaTriggers`: eine Handlung wie
         WIPED_AND_DRIED ist KEINE Abweichung, eine Known-Issue-Zuordnung
         ohne Retake dagegen schon. Der hier abgeleitete Zustand konnte
         deshalb vom tatsaechlichen Zustand des Datensatzes abweichen — und
         mit ihm die Signaturbedeutung. Befund der Gegenpruefung an rc.4.8,
         zutreffend. */
      const zustand = deriveState({
        finalDecision: pendingDecision,
        hasDeviation: qaAusloeser.length > 0,
      });

      /* Nachgereichte Freigabe: der Pruefer schliesst ab, ohne dass eine QA
         anwesend ist. Der Datensatz wird als PENDING_QA GESPEICHERT — ohne
         Ergebnis und ohne Genehmiger — und spaeter von einer anderen Person
         mit Rolle QA Manager freigegeben.

         Bis rc.4.7 hielt `pendingApproval` den Stand nur im ARBEITSSPEICHER:
         war keine QA da, ging die Pruefung verloren. Genau daraus entsteht
         in der Praxis der Druck, Konten zu teilen. Die Gegenpruefung hat zu
         Recht beanstandet, dass der Zustand zwar speicherbar, aber im
         Bildschirmfluss nicht erreichbar war. */
      /* Eine AUSDRUECKLICH gewaehlte Uebergabe erzeugt immer PENDING_QA.
         Bis rc.4.9 stand hier zusaetzlich `needsQaApproval(zustand)` — das
         liefert bei FINAL_FAIL false, und der Pruefer schloss allein ab,
         obwohl er uebergeben wollte. Befund der Gegenpruefung an rc.4.9,
         zutreffend. */
      /* JEDER QA-pflichtige Abschluss laeuft ueber den wartenden Datensatz.

         Bis rc.4.9 gab es zwei Wege: den nachgereichten ueber PENDING_QA
         und einen Sofortpfad, der die Freigabe in einem Zug schrieb. Nur
         der nachgereichte war an die gepruefte Revision gebunden — der
         Sofortpfad kam an der Inhaltsbindung vorbei, und die Gegenpruefung
         an rc.4.9 hat genau das ausgenutzt.

         Es gibt jetzt nur noch EINEN Weg. Ist die QA anwesend, folgt der
         zweite Schritt unmittelbar auf den gespeicherten Datensatz. */
      if (spaeterFreigeben || needsQaApproval(zustand)) {
        const wartend = baueDatensatz(
          { ...signature, meaning: SIGNATURE_MEANING[LIFECYCLE_STATE.PENDING_QA] },
          performedBy, null, user, jetzt, { awaitingQa: true });
        wartend.recordHash = await recordDigest(wartend);
        await saveInspection(wartend, user);
        const daten = await refreshData();
        const gespeichert = daten.nextRecords.find(item => item.id === wartend.id) || wartend;
        const wollteUebergeben = spaeterFreigeben;
        setSpaeterFreigeben(false);
        if (wollteUebergeben) {
          setSelectedRecord(gespeichert); setScreen("record");
          return;
        }
        starteNachfreigabe(gespeichert, pendingDecision);
        return;
      }
      await schreibe(baueDatensatz(signature, performedBy, null, user, jetzt), user);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  /* Zweite Handlung: die QA-Genehmigung durch eine ANDERE Person. Der
     Vier-Augen-Fall wird nicht hier entschieden, sondern in
     evaluateTransition — die Oberflaeche macht ihn nur erreichbar. */
  const approve = async ({ approver, signature }) => {
    if (!pendingApproval) return;
    setBusy(true); setError("");
    try {
      const jetzt = new Date().toISOString();
      const approvedBy = { username: approver.username, role: approver.role, at: jetzt };
      const record = baueDatensatz(signature, pendingApproval.performedBy, approvedBy, approver, jetzt);
      record.performedBy = { ...pendingApproval.performedBy, signature: pendingApproval.performedSignature };
      await schreibe(record, approver);
    } catch (caught) { setError(caught.message || String(caught)); }
    finally { setBusy(false); }
  };

  const exportData = async () => {
    try { downloadObject(await exportReadableData(), `visuclean-export-${localDateString(new Date())}.json`); }
    catch (caught) { setError(caught.message || String(caught)); }
  };

  const logout = () => { setSettingsOpen(false); resetFlow(); setUser(null); setScreen("home"); };
  const startSwabFromResult = () => {
    setSwabOrigin({ photos: analyzedPhotos, aggregate, systemDecision, comment });
    setSwabData(null); setMode("swab"); setPhotos([]); setAnalyzedPhotos([]); setAggregate(null); setSystemDecision(null); setScreen("capture");
  };
  const finishSwab = () => {
    if (!swabOrigin) { goHome(); return; }
    /* Die Summenregel stand hier ein ZWEITES Mal, wortgleich zu SwabResult.
       Zwei Kopien derselben Regel sind zwei Gelegenheiten, dass Bildschirm
       und Datensatz auseinanderlaufen. Jetzt beide aus swabComparison.js.

       ausschnittBelegt/lichtBelegt bleiben ungesetzt: die App stellt weder
       gleichen Ausschnitt noch gleiches Licht zwischen den beiden
       Aufnahmen fest, und was sie nicht feststellt, behauptet sie nicht. */
    const vergleich = vergleicheWischtest(
      analyzedPhotos[0]?.result, analyzedPhotos[1]?.result);
    setSwabData({
      performedAt: new Date().toISOString(),
      /* Je Kriterium, nicht als Summe: der gespeicherte Datensatz traegt
         dieselbe Trennung wie der Bildschirm. */
      comparison: {
        aussage: vergleich.aussage,
        kriterien: Object.fromEntries(Object.entries(vergleich.kriterien)
          .map(([schluessel, eintrag]) => [schluessel, { ...eintrag }])),
        einschraenkungen: [...vergleich.einschraenkungen],
      },
      photos: analyzedPhotos.map(photo => ({ id: photo.id, image: photo.image, annotatedImage: photo.annotatedImage, result: stripResult(photo.result), markers: photo.markers, markerAssessments: photo.markerAssessments })),
    });
    setMode("inspect"); setAnalyzedPhotos(swabOrigin.photos); setAggregate(swabOrigin.aggregate);
    setSystemDecision(swabOrigin.systemDecision); setComment(swabOrigin.comment); setSwabOrigin(null); setScreen("result");
  };
  if (!user) return <LoginScreen language={language} setLanguage={setLanguage} onLogin={setUser}/>;

  const captureMinimum = mode === "swab" ? 2 : 1;
  const captureMaximum = mode === "inspect" ? 10 : mode === "swab" ? 2 : 1;
  const captureTitle = mode === "reference" ? t("reference") : mode === "light" ? t("lightCheck") : mode === "swab" ? t("swab") : t("photos");
  let content;
  if (screen === "home") content = <HomeScreen user={user} recordCount={records.length} auditStatus={auditStatus} selfTest={selfTest} pwaReady={pwaReady} onStart={start} onHistory={() => setScreen("history")} onSettings={() => setSettingsOpen(true)} t={t}/>;
  else if (screen === "equipment") content = <EquipmentSelect language={language} onSelect={selectEquipment} onBack={goHome} t={t}/>;
  else if (screen === "zone") content = <ZoneSelect equipment={equipment} language={language} records={records} onSelect={selectZone} onBack={() => setScreen("equipment")} t={t}/>;
  else if (screen === "capture") content = <MultiCapture photos={photos} setPhotos={setPhotos} title={captureTitle} subtitle={`${equipmentName(equipment, language)} · ${zoneName(zone, language)}`} reference={mode === "inspect" ? currentReference : undefined} onBack={mode === "light" || mode === "swab" ? goHome : () => setScreen("zone")} onAnalyze={analyze} minPhotos={captureMinimum} maxPhotos={captureMaximum} t={t} sequenz={feuchteSequenz} zoneId={zone?.id ?? null} onSequenz={sequenzAufnahme} onSequenzStart={mode === "inspect" && zone ? starteSequenz : null}/>;
  else if (screen === "analysis") content = <AnalysisProgress current={analysisStep} total={photos.length} t={t}/>;
  else if (screen === "swabResult") content = <SwabResult photos={analyzedPhotos} language={language} onDone={finishSwab} t={t}/>;
  else if (screen === "result") content = <ResultScreen mode={mode} equipment={equipment} zone={zone} photos={analyzedPhotos} aggregate={aggregate} systemDecision={systemDecision} reference={currentReference} swabData={swabData} language={language} user={user} comment={comment} setComment={setComment} onDecision={chooseDecision} onOverride={() => setOverrideOpen(true)} onKnownIssue={setKnownIssuePhoto} onSwab={startSwabFromResult} onDone={goHome} retakes={retakes} onAddRetake={ergaenzeMassnahme} fusionScore={fusionScore} knownIssueAssignments={knownIssueAssignments} onAssignKnownIssue={ordneKnownIssueZu} onDeferQa={spaeterAnQa} qaTriggerAnzahl={qaAusloeser.length} screening={screeningUebersicht(analyzedPhotos, screeningConfig)} depthMeasurements={depthMeasurements} onDepthMeasurement={tiefenMessung} schadensverdachte={schadensverdachte} onSchadensverdacht={meldeSchadensverdacht} onBeurteilenVerdacht={beurteileSchadensverdacht} t={t}/>;
  else if (screen === "nachfreigabe" && nachfreigabe) content = <QaApprovalScreen
    performedBy={nachfreigabe.performedBy}
    context={`${nachfreigabe.eqName} · ${nachfreigabe.zoneName}`}
    /* Die ANGEZEIGTE Bedeutung muss der gewaehlten Entscheidung folgen.
       Bis rc.4.9 stand hier fest "PASS": wer "Sperren" waehlte, sah
       "Freigabe nach Massnahme" auf dem Unterschriftsbildschirm und
       speicherte dann eine Sperrung. Befund der Gegenpruefung, zutreffend. */
    meaning={SIGNATURE_MEANING[deriveState({
      finalDecision: nachfreigabeEntscheidung,
      hasDeviation: (nachfreigabe.qaTriggers || []).length > 0,
    })]}
    begruendungPflicht={nachfreigabeEntscheidung === "FAIL"}
    begruendung={nachfreigabeBegruendung}
    setBegruendung={setNachfreigabeBegruendung}
    onCancel={() => { setNachfreigabe(null); setScreen("record"); }}
    onConfirm={erteileNachfreigabe} t={t} busy={busy}/>;
  else if (screen === "qaApproval") content = <QaApprovalScreen
    performedBy={pendingApproval?.performedBy}
    context={`${equipmentName(equipment, language)} · ${zoneName(zone, language)}`}
    meaning={SIGNATURE_MEANING[pendingApproval?.state] || signatureMeaning(pendingDecision)}
    onCancel={() => { setPendingApproval(null); setScreen("result"); }}
    onConfirm={approve} t={t} busy={busy}/>;
  else if (screen === "signature") content = <SignatureConfirm user={user} meaning={unterschriftBedeutung} context={`${equipmentName(equipment, language)} · ${zoneName(zone, language)}`} onCancel={() => setScreen("result")} onConfirm={finalize} t={t} busy={busy}/>;
  else if (screen === "record" && selectedRecord) content = <RecordDetail record={selectedRecord} language={language} user={user} onRelease={starteNachfreigabe} onBeurteilen={klaerung => starteKlaerung(selectedRecord, klaerung)} abgeloest={records.some(item => item.supersedesId === selectedRecord.id)} onBack={() => setScreen("history")} t={t}/>;
  else if (screen === "klaerung" && pendingKlaerung) content = <SignatureConfirm
    user={user} meaning={KLAERUNG_MEANING}
    context={`${pendingKlaerung.record.eqName} · ${pendingKlaerung.record.zoneName}`}
    onCancel={() => { setPendingKlaerung(null); setScreen("record"); }}
    onConfirm={erteileKlaerung} t={t} busy={busy}/>;
  else content = <HistoryScreen records={records} language={language} onSelect={record => { setSelectedRecord(record); setScreen("record"); }} onExport={selected => exportInspectionCollectionPdf(selected, language)} onBack={goHome} t={t}/>;

  return <main className="app-shell">
    {content}
    {error && <div className="global-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><IconButton label={t("close")} icon={X} onClick={() => setError("")}/></div>}
    {settingsOpen && <SettingsDialog user={user} language={language} setLanguage={setLanguage} issues={issues} auditStatus={auditStatus} selfTest={selfTest} storageInfo={storageInfo} pwaReady={pwaReady} onExport={exportData} onIssueAction={(issue, action) => setIssueAction({ issue, action })} onLogout={logout} onClose={() => setSettingsOpen(false)} t={t}/>}
    {overrideOpen && <OverrideDialog systemDecision={systemDecision} language={language} onCancel={() => setOverrideOpen(false)} onContinue={acceptOverride} t={t}/>}
    {knownIssuePhoto && <KnownIssueDialog photo={knownIssuePhoto} equipment={equipment} zone={zone} user={user} language={language} onCancel={() => setKnownIssuePhoto(null)} onSave={createIssue} t={t}/>}
    {issueAction && <IssueActionDialog issue={issueAction.issue} action={issueAction.action} user={user} language={language} onCancel={() => setIssueAction(null)} onSave={saveIssueAction} t={t}/>}
  </main>;
}
