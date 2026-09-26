import { APP_VERSION } from "./domain.js";
import { verdictDisplay } from "./i18n.js";
import { ALTBEFUND_HINWEIS, istAltbefund } from "./verdictWording.js";
import { evaluateDepthMeasurement } from "./depthLimit.js";
import { ebenenText } from "./overlayLayers.js";
import { istAltdatensatz, kriteriumKurz } from "./assessment.js";
import { geltungstext } from "./inspectionArea.js";
import { WISCH_FORMAT, wischAnsicht, wischEinschraenkungsTexte,
  wischKriteriumText, wischText } from "./swabComparison.js";
import { jsPDF } from "jspdf";

const safe = value => String(value ?? "").replace(/[\u2013\u2014]/g, "-");

export function exportInspectionPdf(record, language = "de") {
  const de = language !== "en";
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  const ensure = height => {
    if (y + height <= 282) return;
    doc.addPage(); y = 16;
  };

  /* BEFUND der Gegenpruefung vom 16.09.2026, sichtbar bestaetigt: `line()`
     setzte den Wert ohne jeden Umbruch an eine feste Spalte. Alles, was
     nicht bis zum Blattrand reichte, lief darueber hinaus und war auf dem
     gedruckten Protokoll SCHLICHT WEG — gemessen bis 103 mm neben dem
     Papier, bei der Tiefenmessung samt Person, Messmittel und Urteil.
     Der Textstrom enthielt es weiterhin vollstaendig, weshalb kein
     Inhaltstest es je bemerkt hat (jetzt: pdftest P17, geometrisch).

     Der Wert wird deshalb auf die verbleibende Spaltenbreite umbrochen
     und y um die tatsaechliche Zeilenzahl weitergesetzt. Ist die
     Beschriftung breiter als die Spalte, wandert der Wert nach rechts
     statt unter die Beschriftung zu rutschen — aber nie ueber den Rand:
     die Spalte wird auf hoechstens die halbe Satzbreite begrenzt. */
  const ZEILENHOEHE = 4.4;
  const line = (label, value) => {
    const beschriftung = `${label}:`;
    doc.setFont("helvetica", "bold");
    const satzbreite = pageWidth - margin * 2;
    const spalte = Math.min(
      Math.max(38, doc.getTextWidth(beschriftung) + 2), satzbreite / 2);
    const beschriftungsZeilen = doc.splitTextToSize(beschriftung, spalte);
    doc.setFont("helvetica", "normal");
    const wertZeilen = doc.splitTextToSize(safe(value), satzbreite - spalte);
    const hoehe = Math.max(
      6, Math.max(beschriftungsZeilen.length, wertZeilen.length) * ZEILENHOEHE + 1.6);
    ensure(hoehe);
    doc.setFont("helvetica", "bold"); doc.text(beschriftungsZeilen, margin, y);
    doc.setFont("helvetica", "normal"); doc.text(wertZeilen, margin + spalte, y);
    y += hoehe;
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("VisuClean - " + (de ? "Pruefprotokoll" : "Inspection report"), margin, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(de ? `Browser-Demonstrator v${APP_VERSION} - nicht validiertes GMP-Produktivsystem` : `Browser demonstrator v${APP_VERSION} - not a validated GMP production system`, margin, y); y += 8;

  doc.setFontSize(10);
  line(de ? "Equipment" : "Equipment", record.eqName);
  line(de ? "Pruefzone" : "Inspection zone", record.zoneName);
  /* Pruefer ist performedBy, NICHT record.user. Bei nachgereichter Freigabe
     traegt record.user den Genehmiger — ihn hier als Pruefer auszugeben,
     waere eine falsche Zuschreibung im GMP-Protokoll. Befund der
     Gegenpruefung an rc.4.7, zutreffend. */
  line(de ? "Pruefer" : "Inspector",
    record.performedBy?.username
      ? `${record.performedBy.username} (${safe(record.performedBy.role)})`
      : `${record.user.displayName} (${record.user.role})`);
  if (record.approvedBy?.username) {
    line(de ? "Genehmiger" : "Approver",
      `${safe(record.approvedBy.username)} (${safe(record.approvedBy.role)})`);
  }
  /* Die Revisionsverbindung gehoert ins Protokoll: ohne sie ist im PDF
     nicht nachvollziehbar, auf welche gepruefte Revision sich ein
     nachgereichter QA-Entscheid bezieht. Befund der Gegenpruefung an rc.4.8.

     Der Bezug heisst NEUTRAL "QA-Entscheid zu", nicht "Freigabe zu": eine
     Sperrung ist auch ein Entscheid, und das Protokoll trug bis rc.4.14
     ueber einer Sperrung das Wort "Freigabe". Eine falsche Etikettierung
     in einem GMP-Dokument ist inhaltlich unwahr, nicht bloss unschoen.
     Befund aus dem Bedienlauf vom 11.09.2026; belegt durch P6.       */
  /* Aus demselben Grund heisst die BEURTEILUNG auch so und nicht
     "QA-Entscheid": sie beantwortet eine gemeldete Stelle und entscheidet
     nichts. Wer das Protokoll liest, muss beides unterscheiden koennen. */
  if (record.supersedesId) {
    line(de ? (record.clarification ? "Beurteilung zu" : "QA-Entscheid zu")
      : (record.clarification ? "Assessment for" : "QA decision for"),
    safe(record.supersedesId));
    line(de ? "Gepruefte Revision" : "Reviewed revision", safe(record.approvalRevisionHash));
  }
  if (record.approvalComment) {
    line(de ? "Begruendung der QA" : "QA reason", safe(record.approvalComment));
  }
  line(de ? "Zeitpunkt" : "Timestamp", record.signedAt || record.createdAt);
  line(de ? "Systementscheid" : "System decision", `${record.originalSystemDecision?.status || "-"} (${record.originalSystemDecision?.reason || "-"})`);
  line(de ? "Finalentscheid" : "Final decision", record.finalDecision);
  line(de ? "Signaturbedeutung" : "Signature meaning", record.signature?.meaning);

  y += 2;
  const result = record.aggregate;
  for (const [key, label] of [["dry", de ? "Trocken" : "Dry"], ["clean", de ? "Sauber" : "Clean"], ["intact", de ? "Intakt" : "Intact"]]) {
    const verdict = result[key];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(verdict.pass ? 22 : 185, verdict.pass ? 101 : 28, verdict.pass ? 52 : 28);
    doc.text(`${label}: ${verdict.pass ? "PASS" : "FAIL"}`, margin, y);
    doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "normal");
    /* BEFUND rc.4.28: hier stand `verdict.message` roh — also der Text des
       Analyse-Kerns. Auf dem Bildschirm laeuft derselbe Wert durch
       verdictDisplay und wird richtiggestellt; im Protokoll nicht. Das
       PDF behauptete damit "Organische Rueckstaende (braun/gelb)", waehrend
       der Bildschirm daneben "Warme Farbabweichung" zeigte.

       Dieselbe Fehlerklasse wie die Ehrlichkeitskorrektur selbst: eine
       Korrektur, die nur an der Stelle greift, an der sie bemerkt wurde.
       Jetzt dieselbe Quelle wie der Bildschirm. */
    const gezeigt = verdictDisplay(verdict, key, language);
    const message = doc.splitTextToSize(safe(gezeigt.message), pageWidth - margin * 2 - 42);
    doc.text(message, margin + 42, y); y += Math.max(6, message.length * 4.5);
  }

  /* P3 · die gefuehrte Aufnahmesequenz.

     Sie gehoert ins Protokoll, weil sie die Vorbedingung des
     Feuchtepunkts traegt UND weil ohne sie niemand die Aufnahme
     wiederholen kann: Lichtpositionen, Reihenfolge, Foto-Zuordnung und
     die Anleitungsfassung, nach der aufgenommen wurde.

     Eine vollstaendige Sequenz ist KEIN Nachweis, dass die
     Feuchtebeurteilung zutrifft — der Satz steht ausdruecklich dabei. */
  const sequenz = record.feuchteSequenz;
  if (sequenz && (sequenz.captures || []).length) {
    ensure(14 + (sequenz.captures || []).length * 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Gefuehrte Aufnahmesequenz" : "Guided capture sequence", margin, y); y += 5;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
    const lichtname = pos => ({
      NORMAL: de ? "Normale Beleuchtung" : "Normal lighting",
      STREIFLICHT_LINKS: de ? "Streiflicht links" : "Grazing light left",
      STREIFLICHT_RECHTS: de ? "Streiflicht rechts" : "Grazing light right",
    })[pos] || (de ? "Lichtposition nicht erfasst" : "light position not recorded");
    line(de ? "Zone" : "Zone", safe(sequenz.zoneId));
    line(de ? "Anleitungsfassung" : "Instruction version",
      sequenz.anleitungVersion == null
        ? (de ? "nicht erfasst" : "not recorded") : `v${sequenz.anleitungVersion}`);
    line(de ? "Vollstaendig" : "Complete",
      sequenz.vollstaendig ? "ja" : `nein — ${(sequenz.fehlend || []).map(lichtname).join(", ")}`);
    for (const c of sequenz.captures || []) {
      ensure(6);
      line(`  ${de ? "Aufnahme" : "Capture"} ${c.reihenfolge ?? "?"}`,
        `${lichtname(c.lichtposition)} · ${de ? "Foto" : "photo"} ${safe(c.photoId)}`
        + (c.aufgenommenAm ? ` · ${safe(c.aufgenommenAm)}` : ""));
    }
    /* Ersetzte Aufnahmen bleiben sichtbar: wer eine Position wiederholt
       hat, hatte einen Grund, und der erste Versuch gehoert ins
       Protokoll. */
    for (const c of sequenz.ersetzt || []) {
      ensure(6);
      line(`  ${de ? "ersetzt" : "replaced"}`,
        `${lichtname(c.lichtposition)} · ${de ? "Foto" : "photo"} ${safe(c.photoId)}`);
    }
    ensure(8);
    const hz = doc.splitTextToSize(de
      ? "Eine vollstaendige Sequenz ist die Voraussetzung fuer die "
        + "algorithmische Beurteilung des Feuchtepunkts. Sie ist kein Nachweis, "
        + "dass die Beurteilung zutrifft."
      : "A complete sequence is the precondition for assessing the moisture "
        + "checkpoint algorithmically. It is not evidence that the assessment "
        + "is correct.", pageWidth - margin * 2 - 4);
    doc.text(hz, margin + 4, y); y += hz.length * 3.8 + 3;
    doc.setFontSize(9);
  }

  /* Kratzer-Screening. Hinweisliste, kein Urteil — gehoert trotzdem ins
     Protokoll: bis rc.4.19 wurden die Kandidaten berechnet und weder
     gespeichert noch gedruckt, womit ein spaeterer Leser nicht mehr
     nachvollziehen konnte, worauf der Pruefer hingewiesen wurde. Befund
     der unabhaengigen Gegenpruefung, zutreffend.

     Gedruckt wird ausschliesslich Gemessenes. Keine Tiefe, keine
     Harmlosigkeit, keine Entstehungszeit. */
  const screening = record.screening;
  if (screening && (screening.photos || []).some(f => (f.candidateCount || 0) > 0)) {
    ensure(24);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Kratzer-Screening (Hinweis, kein Urteil)"
      : "Scratch screening (advisory, not a verdict)", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    /* Die Ordnung MUSS benannt werden. Eine Liste ohne Angabe ihrer
       Ordnung laedt dazu ein, den ersten Eintrag fuer den schlimmsten
       Befund zu halten. Im PDF gibt es ausserdem keine Umschaltung - was
       hier steht, ist endgueltig. */
    line(de ? "Hinweis" : "Note", de
      ? "Geordnet nach Relevanz ohne Richtungsabwertung. Keine Tiefenangabe, "
        + "keine Aussage zu Harmlosigkeit oder Entstehungszeit."
      : "Ordered by relevance without directional discount. No depth, no "
        + "statement on harmlessness or age.");
    /* Der Bezug der Groessenangaben, einmal und unmissverstaendlich vor
       der Liste. Bis rc.4.26 standen Laenge und Breite als Prozentwert in
       jeder Zeile — ein gedrucktes Protokoll wird Jahre spaeter gelesen,
       und dort waere "23,6 %" dauerhaft als Messwert missverstanden
       worden. Dieselbe Regel wie am Bildschirm (U26/P12). */
    line(de ? "Bezug" : "Reference", de
      ? "Relative Laenge und relative Breite, bezogen auf die kurze Kante "
        + "des analysierten Bildes. Keine physikalische Laenge oder Tiefe."
      : "Relative length and relative width, relative to the short edge of "
        + "the analysed image. Not a physical length or depth.");
    /* Die Vorgabegrenze steht im Protokoll, und zwar MIT ihrem
       Operator. "< 1,0" und "≤ 1,0" sind nicht dasselbe: bei genau
       1,000 µm entscheidet allein dieses Zeichen. Ein Protokoll ohne den
       Operator waere Jahre spaeter nicht nachvollziehbar. */
    line(de ? "Tiefengrenze" : "Depth limit", de
      ? "Zulaessige Kratz-/Riefentiefe < 1,0 um. Die "
        + "Kantenstaerke oben ist ein optischer Aufmerksamkeitswert und "
        + "keine Tiefe — sie kann diese Grenze weder einhalten noch "
        + "verletzen. Eine Aussage zur Tiefe verlangt eine unabhaengige "
        + "Messung mit Messmittel und Messunsicherheit."
      : "Permissible scratch/groove depth < 1.0 um. "
        + "The edge strength above is an optical attention value, not a "
        + "depth - it can neither meet nor violate this limit. A statement "
        + "on depth requires an independent measurement with instrument "
        + "and uncertainty.");
    if (screening.configHash) {
      line(de ? "Konfiguration" : "Configuration",
        `${safe(screening.configQuelle)} · ${safe(screening.configHash)}`);
    }
    /* Eingetragene Tiefenmessungen. Das Urteil wird beim Drucken GERECHNET,
       nicht aus dem Datensatz gelesen — dieselbe Quelle wie am Bildschirm.
       Bei der Ehrlichkeitskorrektur lief genau das einmal auseinander
       (rc.4.28, T7): der Bildschirm zeigte die korrigierte Fassung, das
       Protokoll druckte die alte. */
    for (const m of (record.depthMeasurements || [])) {
      const e = evaluateDepthMeasurement(m);
      const urteil = {
        NOT_MEASURED: de ? "keine Entscheidung" : "no decision",
        WITHIN_DEPTH_LIMIT: de ? "unter der Grenze" : "below the limit",
        DEPTH_LIMIT_EXCEEDED: de ? "Grenze ueberschritten" : "limit exceeded",
        BOUNDARY_UNCERTAIN: de ? "Grenzfall" : "boundary case",
      }[e.decision] || e.decision;
      ensure(6);
      /* Die BINDUNG gehoert ins Protokoll, und zwar welche: eine manuell
         markierte Stelle ist ein vom Detektor NICHT erkannter Befund, und
         genau das ist die Aussage, um die es in der Messkampagne geht. Bis
         rc.4.35 druckte das Protokoll nur kandidatId — eine manuelle
         Messung erschien als "Tiefenmessung —". Befund der Gegenpruefung
         vom 16.09.2026, zutreffend. */
      const bindung = m?.kandidatId
        ? `${de ? "Kandidat" : "candidate"} ${safe(m.kandidatId)}`
        : (m?.markerId
          ? `${de ? "manuell markiert" : "manually marked"} ${safe(m.markerId)}`
          + ` (${de ? "vom Algorithmus nicht erkannt" : "not detected by the algorithm"})`
          : (de ? "ohne Bindung" : "unbound"));
      line(`  ${de ? "Tiefenmessung" : "Depth measurement"}`,
        `${bindung} · ${safe(m?.valueUm)} ${safe(m?.unit)} ± ${safe(m?.uncertaintyUm)} · `
        + `${de ? "Messmittel" : "instrument"} ${safe(m?.method)} · `
        + `${safe(m?.measuredAt)} · ${safe(m?.measuredBy)} · `
        + `${de ? "Herkunft" : "origin"} ${safe(m?.source)} · ${urteil}`);
      /* Die Regelfassung samt ihrer Grenze. Ohne sie waere das Protokoll
         unter einer spaeteren Fassung 2 nicht mehr aus sich heraus
         nachvollziehbar: dieselbe Zahl, anderes Urteil, und nirgends
         stuende, nach welcher Regel geurteilt wurde. */
      ensure(6);
      line(`    ${de ? "Regelfassung" : "Rule version"}`,
        `${de ? "Fassung" : "version"} ${safe(e.ruleVersion)} · `
        + `${de ? "Grenze" : "limit"} ${safe(e.limitOperator)} ${safe(e.limitUm)} um`);
    }
    for (const [index, foto] of (screening.photos || []).entries()) {
      if (!(foto.candidateCount > 0)) continue;
      ensure(14);
      line(`${de ? "Aufnahme" : "Capture"} ${index + 1}`,
        `${foto.candidateCount} ${de ? "Kandidaten" : "candidates"}`
        + (foto.suppressedCount
          ? ` · ${foto.suppressedCount} ${de ? "wegen Richtung niedriger bewertet" : "scored lower because of direction"}`
          : ""));
      /* Vorzugsrichtung, Rohwert und Faecherzahl in einer eigenen Zeile.

         Der Rohwert wird OHNE Prozentzeichen und ohne sprachliche
         Einordnung gedruckt: 0,141 ist keine Sicherheit von 14,1 Prozent,
         und auch "schwach bestimmt" wuerde eine Kalibrierung behaupten,
         die es nicht gibt. Die Faecherzahl steht daneben, weil der Wert
         nur bei gleicher Faecherzahl vergleichbar ist (SC-21). */
      /* Fehlend ist nicht Null: ein nicht gemessener Wert wird benannt,
         nicht als 0 gedruckt und nicht weggelassen. Eine fehlende Zeile
         ist von einer gemessenen Null nicht zu unterscheiden. */
      const fehlt = de ? "nicht verfuegbar" : "not available";
      const zahl = (wert, stellen, einheit = "") => Number.isFinite(wert)
        ? `${wert.toFixed(stellen)}${einheit}` : fehlt;
      {
        ensure(6);
        line(`  ${de ? "Vorzugsrichtung" : "Preferred direction"}`,
          `${zahl(foto.grindDirectionDeg, 1, " Grad")}`
          + ` · ${de ? "Richtungsstaerke" : "directional strength"} `
          + `${zahl(foto.grindStrength, 3)}`
          + ` · ${Number.isInteger(foto.orientationBins)
            ? `${foto.orientationBins} ${de ? "Winkelfaecher" : "angular bins"}`
            : `${de ? "Winkelfaecher" : "angular bins"} ${fehlt}`}`
          + ` · ${de ? "Zuverlaessigkeit nicht kalibriert" : "reliability not calibrated"}`);
      }
      /* Ohne Richtungsabwertung geordnet - dieselbe konservative Wahl wie
         auf dem Bildschirm (U25/P11). Der gespeicherte Rang bleibt in der
         Zeile stehen, damit beide Rangfolgen nachvollziehbar sind. */
      const geordnet = [...(foto.candidates || [])].sort((a, b) =>
        (b?.relevanceScoreUngerichtet ?? b?.relevanceScore ?? 0)
        - (a?.relevanceScoreUngerichtet ?? a?.relevanceScore ?? 0));
      for (const [platz, k] of geordnet.entries()) {
        ensure(6);
        /* Drei verschiedene Angaben, drei Beschriftungen — dieselbe
           Trennung wie am Bildschirm: laufende Position in DIESER
           Reihenfolge, stabile Kennung, gespeicherter gerichteter Rang.
           Bis rc.4.30 stand hier nur "Rang" und meinte den gerichteten
           Platz, waehrend die Liste ungerichtet geordnet war. */
        line(`  ${de ? "Position" : "Position"} ${platz + 1}`,
          `${de ? "Kandidat" : "candidate"} ${safe(k.kandidatId || (de ? "nicht gespeichert" : "not stored"))} · `
          + `${de ? "Rang gerichtet" : "directed rank"} ${Number.isFinite(k.rank) ? k.rank : fehlt} · `
          + `${de ? "Relative Laenge" : "relative length"} ${zahl(k.lengthRel, 4)} · `
          + `${de ? "Relative Breite" : "relative width"} ${zahl(k.widthRel, 4)} · `
          + `${de ? "Winkel zum Schliff" : "angle to grinding"} ${zahl(k.grindDeltaDeg, 1, " Grad")} · `
          + `${de ? "Kantenstaerke" : "edge strength"} ${zahl(k.edgeStrength, 2)} · `
          + `${de ? "Relevanz" : "relevance"} ${zahl(k.relevanceScore, 4)}`
          + ` · ${de ? "ohne Richtungsabwertung" : "without directional discount"} `
          + `${zahl(k.relevanceScoreUngerichtet, 4)}`);
      }
    }
    y += 2;
  }

  /* Mehrwinkelauswertung. Sie veraendert kein Urteil, gehoert aber ins
     Protokoll: welche Aufnahmen ausgeschlossen wurden und warum, ob die
     Winkelvielfalt getragen hat, und ob ueberhaupt ein Detektor eingehaengt
     war. Ohne das ist die Anzeige spaeter nicht nachvollziehbar. */
  /* record.fusionSummary, NICHT result.fusionSummary: `result` ist
     record.aggregate (Zeile oben). Der Block erschien deshalb nie —
     Befund der Gegenpruefung an rc.4.7, zutreffend. */
  const fusion = record.fusionSummary;
  if (fusion) {
    ensure(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Mehrwinkelauswertung (Hinweis, kein Urteil)" : "Multi-angle evaluation (advisory, not a verdict)", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const teile = [
      `${de ? "Status" : "Status"}: ${safe(fusion.status)}`,
      `${de ? "verwendete Aufnahmen" : "captures used"}: ${fusion.usedCount}`,
      `${de ? "Winkelvielfalt" : "angular diversity"}: ${fusion.poseSpread ?? "-"}`
        + ` (${fusion.meaningful ? (de ? "ausreichend" : "sufficient") : (de ? "nicht ausreichend" : "insufficient")})`,
    ];
    for (const zeile of teile) { ensure(6); doc.text(zeile, margin + 4, y); y += 4; }
    for (const aufnahme of (fusion.captures || [])) {
      ensure(6);
      doc.text(`#${aufnahme.sequenceIndex}: `
        + `${de ? "Feldabdeckung" : "field coverage"} ${aufnahme.fieldCoverage ?? "-"}`
        + ` · ${de ? "Wiedererkennung" : "redetect"} ${aufnahme.redetectResidualPx ?? "-"} px`,
      margin + 4, y);
      y += 4;
    }
    for (const aus of (fusion.excluded || [])) {
      ensure(6);
      doc.text(`${de ? "ausgeschlossen" : "excluded"}: #${aus.sequenceIndex} ${safe(aus.reason)}`, margin + 4, y);
      y += 4;
    }
    y += 2;
  }

  /* Pruefpunkte einzeln (RC3). Sie stehen bewusst VOR dem Kommentar: wer
     das Protokoll liest, muss sehen, welcher Punkt offen blieb und warum,
     bevor er die Massnahme des Pruefers liest. */
  const punkte = Array.isArray(result.checkpoints) ? result.checkpoints : [];
  if (punkte.length) {
    ensure(14 + punkte.length * 12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Pruefpunkte" : "Checkpoints", margin, y); y += 5;
    doc.setFontSize(8.5);
    for (const punkt of punkte) {
      ensure(14);
      const offen = punkt.status === "NOT_ASSESSABLE";
      const bestanden = punkt.status === "PASS";
      const text = offen ? (de ? "NICHT BEWERTBAR" : "NOT ASSESSABLE")
        : bestanden ? "PASS" : "FAIL";
      doc.setFont("helvetica", "bold");
      if (offen) doc.setTextColor(180, 95, 6);
      else doc.setTextColor(bestanden ? 22 : 185, bestanden ? 101 : 28, bestanden ? 52 : 28);
      doc.text(`${safe(punkt.label?.[de ? "de" : "en"] || punkt.id)}: ${text}`, margin, y);
      doc.setTextColor(15, 23, 42); doc.setFont("helvetica", "normal");
      y += 4.5;
      const zeilen = doc.splitTextToSize(
        `${safe(punkt.message?.[de ? "de" : "en"])}${punkt.reason ? " - " + safe(punkt.reason) : ""}`,
        pageWidth - margin * 2 - 4);
      doc.text(zeilen, margin + 4, y); y += zeilen.length * 3.8 + 1;
      /* Historischer Befundtext: der Originalbefund steht oben unveraendert
         — er ist Teil eines signierten Datensatzes und wird nicht
         umgeschrieben. Der Hinweis kommt darunter, mit eigener
         Ueberschrift, damit ein Leser Jahre spaeter sieht, was im
         Originaldokument stand und was nachtraeglich erklaert wurde. */
      if (istAltbefund(punkt.code, punkt.message?.[de ? "de" : "en"])) {
        const az = doc.splitTextToSize(
          `${de ? "Nachtraegliche Erlaeuterung" : "Subsequent note"}: `
          + safe(ALTBEFUND_HINWEIS[de ? "de" : "en"]),
          pageWidth - margin * 2 - 4);
        doc.setTextColor(120, 80, 10);
        doc.text(az, margin + 4, y); y += az.length * 3.8 + 1;
        doc.setTextColor(15, 23, 42);
      }
      const handlungen = (punkt.actions || []).map(a => safe(a?.[de ? "de" : "en"])).filter(Boolean);
      if (handlungen.length) {
        const hz = doc.splitTextToSize(`${de ? "Naechste Handlung" : "Next action"}: ${handlungen.join(" | ")}`,
          pageWidth - margin * 2 - 4);
        doc.text(hz, margin + 4, y); y += hz.length * 3.8 + 1;
      }
      if (punkt.manual) {
        const mz = doc.splitTextToSize(
          `${de ? "Manuelle Ersatzpruefung" : "Manual substitute"}: ${safe(punkt.manual.method)} | `
          + `${safe(punkt.manual.user)} | ${safe(punkt.manual.timestamp)} | ${safe(punkt.manual.reason)}`,
          pageWidth - margin * 2 - 4);
        doc.text(mz, margin + 4, y); y += mz.length * 3.8 + 1;
      }
      y += 1.5;
    }
    doc.setFontSize(9);
  }

  /* ── Anzeigeebenen ──────────────────────────────────────────────────
     Der Analyse-Kern rechnet mehrere Masken; das Urteil je Kriterium
     traegt nur eine davon, und nur die wird in das eingebettete
     Overlay-Bild gezeichnet. Bis rc.4.37 stand nirgends, dass eine
     zweite ueberhaupt existierte — der Bericht sah aus, als haette es
     sie nicht gegeben.

     Gedruckt wird deshalb die Anzeigebegrenzung selbst: was gerechnet
     wurde, was davon im Bild steht und was nicht. Das ist KEIN zweites
     Urteil und kein zusaetzliches FAIL; die Zeile sagt das ausdruecklich.

     Gelesen wird der GESPEICHERTE Bestand, nicht eine Neuberechnung. Ein
     Protokoll muss dasselbe sagen wie der Bildschirm bei der Aufnahme,
     auch wenn sich spaeter eine Konfiguration aendert. */
  /* ── Geltungsbereich ────────────────────────────────────────────────
     Bewertet wurde die Prueffläche, nicht das ganze Foto. Steht der Satz
     nicht im Protokoll, liest sich ein Befund wie eine Aussage ueber das
     ganze Teil — und ein PASS erst recht. Gelesen wird der GESPEICHERTE
     Eintrag; nachgerechnet wird nichts. */
  const mitFlaeche = (record.photos || [])
    .map((foto, index) => ({ index, flaeche: foto?.result?.inspectionArea || null }))
    .filter(eintrag => eintrag.flaeche);
  if (mitFlaeche.length) {
    ensure(14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Geltungsbereich der Bewertung" : "Scope of the assessment", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    for (const eintrag of mitFlaeche) {
      const zeilen = doc.splitTextToSize(
        `${de ? "Foto" : "Photo"} ${eintrag.index + 1}: `
        + safe(geltungstext(eintrag.flaeche, de ? "de" : "en")),
        pageWidth - margin * 2);
      ensure(zeilen.length * 3.8 + 3);
      doc.text(zeilen, margin, y); y += zeilen.length * 3.8 + 2;
    }
    doc.setFontSize(9);
  }

  const mitEbenen = (record.photos || [])
    .map((foto, index) => ({ index, ebenen: foto?.result?.overlayLayers || [] }))
    .filter(eintrag => eintrag.ebenen.length);
  if (mitEbenen.length) {
    ensure(16);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(de ? "Anzeigeebenen (Hinweis, kein Urteil)"
      : "Display layers (advisory, not a verdict)", margin, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const vorwort = doc.splitTextToSize(de
      ? "Nur die urteilstragende Ebene ist in das Overlay-Bild gezeichnet. Weitere berechnete"
        + " Masken sind unten genannt, aber nicht eingezeichnet; sie sind Zusatzhinweise und"
        + " erzeugen kein FAIL. Pixelzahlen sind kein Verschmutzungsgrad und keine Stoffmenge."
      : "Only the verdict-bearing layer is drawn into the overlay image. Further computed masks"
        + " are listed below but not drawn; they are advisory and raise no FAIL. Pixel counts are"
        + " not a degree of soiling and not an amount of substance.",
    pageWidth - margin * 2);
    doc.text(vorwort, margin, y); y += vorwort.length * 3.6 + 2;
    doc.setFontSize(8.5);
    for (const eintrag of mitEbenen) {
      ensure(10 + eintrag.ebenen.length * 5);
      doc.setFont("helvetica", "bold");
      doc.text(`${de ? "Foto" : "Photo"} ${eintrag.index + 1}`, margin, y); y += 4;
      doc.setFont("helvetica", "normal");
      for (const ebene of eintrag.ebenen) {
        ensure(8);
        const zeilen = doc.splitTextToSize(
          `- ${safe(ebenenText(ebene, de ? "de" : "en"))}`, pageWidth - margin * 2 - 4);
        doc.text(zeilen, margin + 4, y); y += zeilen.length * 3.8;
      }
      y += 1.5;
    }
    doc.setFontSize(9);
  }

  if (record.comment) {
    ensure(18);
    doc.setFont("helvetica", "bold"); doc.text(de ? "Kommentar:" : "Comment:", margin, y); y += 5;
    doc.setFont("helvetica", "normal");
    const comment = doc.splitTextToSize(safe(record.comment), pageWidth - margin * 2);
    doc.text(comment, margin, y); y += comment.length * 4.5 + 3;
  }

  const photos = record.photos || [];
  /* Der Rueckfall auf den Rohbefund gilt nur fuer nachweisliche
     Altbestaende — erkannt am Datenformat des DATENSATZES, nicht am Fehlen
     der Pruefpunktliste im einzelnen Foto. Ein neuer Datensatz mit Luecke
     bekommt "?" (F8/F9). */
  const altbestand = istAltdatensatz(record);
  const okCount = photos.filter(photo => ["dry", "clean", "intact"].every(kriterium =>
    kriteriumKurz(photo.result.checkpoints, kriterium, photo.result[kriterium].pass, altbestand) === "PASS")).length;
  ensure(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${de ? "Zusammenfassung" : "Summary"}: ${okCount}/${photos.length} OK - ${photos.length - okCount}/${photos.length} FAIL`, margin, y);
  y += 7;
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (index % 2 === 0) ensure(78);
    const cellX = margin + (index % 2) * 91;
    const cellY = y;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(`${de ? "Foto" : "Photo"} ${index + 1}/${photos.length}`, cellX, cellY);
    try {
      doc.addImage(photo.annotatedImage || photo.image, "JPEG", cellX, cellY + 3, 86, 51, undefined, "FAST");
    } catch {
      doc.setFont("helvetica", "normal"); doc.text(de ? "Bild konnte nicht eingebettet werden." : "Image could not be embedded.", cellX, cellY + 10);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
    /* MASSGEBLICH sind die Pruefpunkte, nicht der Rohbefund des Kerns.
       Bis rc.4.44 stand hier "T/D PASS" neben einem nicht bewertbaren
       Feuchtepunkt — im Protokoll, das ein Pruefer als Nachweis liest.
       "?" heisst nicht bewertbar, nicht "vermutlich in Ordnung". */
    const kurz = kriterium => kriteriumKurz(photo.result.checkpoints,
      kriterium, photo.result[kriterium].pass, altbestand);
    doc.text(`T/D ${kurz("dry")}  S/C ${kurz("clean")}  I/I ${kurz("intact")}`, cellX, cellY + 58);
    const findings = (photo.markerAssessments || []).map((item, markerIndex) => `${markerIndex + 1}:${item.code} Index ${item.severity}`).join(" | ");
    doc.text(doc.splitTextToSize(`${de ? "Marker" : "Markers"}: ${findings || "-"}`, 86), cellX, cellY + 63);
    if (index % 2 === 1 || index === photos.length - 1) y += 76;
  }

  if (record.swabTest?.photos?.length === 2) {
    ensure(70);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(de ? "Wischtest - Vorher / Nachher" : "Swab test - before / after", margin, y); y += 5;
    record.swabTest.photos.forEach((photo, index) => {
      const x = margin + index * 91;
      try { doc.addImage(photo.annotatedImage || photo.image, "JPEG", x, y, 86, 51, undefined, "FAST"); } catch { /* Text bleibt erhalten */ }
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(index === 0 ? (de ? "Vorher" : "Before") : (de ? "Nachher" : "After"), x, y + 56);
    });
    y += 61;
    /* Bis rc.4.37 stand hier eine Summe aus Trocken, Sauber und Intakt und
       daneben ein Code, der aus ihrem Sinken "Rueckstand moeglich" machte.
       Gedruckt wird jetzt die Aussage im Klartext, jedes Kriterium
       einzeln, und die nicht festgestellte Vergleichbarkeit dazu. */
    /* DIESELBE Quelle wie der Bildschirm. Bis rc.4.38 las das PDF
       `swabTest.comparison` direkt; ein Wischtest aus einer frueheren
       Fassung hat das Feld nicht, und das Protokoll behauptete daraufhin
       eine fehlende Vorher-/Nachher-Zuordnung, die es gab. Ein Bildschirm,
       der es richtig macht, und ein PDF, das es falsch macht, sind zwei
       Aussagen zu einem Datensatz. */
    const wisch = wischAnsicht(record.swabTest);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    if (wisch.format === WISCH_FORMAT.ALTFORMAT) {
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.text(de ? "Wischtest im Altformat - damaliger Summenvergleich"
        : "Swab test in legacy format - sum comparison of the time", margin, y);
      y += 4.5;
      doc.setFont("helvetica", "normal");
    }
    const aussage = doc.splitTextToSize(
      safe(wischText(wisch, de ? "de" : "en")), pageWidth - margin * 2);
    ensure(aussage.length * 3.8 + 6);
    doc.text(aussage, margin, y); y += aussage.length * 3.8 + 2;
    for (const eintrag of Object.values(wisch.kriterien || {})) {
      ensure(8);
      const zeilen = doc.splitTextToSize(
        `- ${safe(wischKriteriumText(eintrag, de ? "de" : "en"))}`,
        pageWidth - margin * 2 - 4);
      doc.text(zeilen, margin + 4, y); y += zeilen.length * 3.8;
    }
    const grenzen = wischEinschraenkungsTexte(wisch, de ? "de" : "en");
    if (grenzen.length) {
      ensure(6 + grenzen.length * 4);
      doc.setFont("helvetica", "bold");
      doc.text(de ? "Vergleichbarkeit:" : "Comparability:", margin, y + 2); y += 6;
      doc.setFont("helvetica", "normal");
      for (const text of grenzen) {
        ensure(8);
        const zeilen = doc.splitTextToSize(`- ${safe(text)}`, pageWidth - margin * 2 - 4);
        doc.text(zeilen, margin + 4, y); y += zeilen.length * 3.8;
      }
    }
    y += 4;
  }

  const tolerated = photos.flatMap(photo => photo.knownIssueInfo?.issues || []);
  if (tolerated.length) {
    ensure(20);
    doc.setDrawColor(194, 110, 0); doc.setFillColor(255, 247, 224); doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 2, 2, "FD");
    doc.setTextColor(80, 44, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(de ? "Bekannte Auffaelligkeit (QA-toleriert)" : "Known issue (QA tolerated)", margin + 3, y + 6);
    const unique = [...new Map(tolerated.map(issue => [issue.id, issue])).values()];
    const detail = unique.map(issue => `${issue.issueType} | ${issue.status} | ${issue.knownSince}-${issue.validUntil} | ${issue.createdBy}`).join("; ");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(doc.splitTextToSize(detail, pageWidth - margin * 2 - 6), margin + 3, y + 11);
    doc.setTextColor(15, 23, 42); y += 21;
  }

  if (record.overrideReason) {
    ensure(16); doc.setFont("helvetica", "bold"); doc.text(de ? "Override-Begruendung:" : "Override reason:", margin, y); y += 5;
    doc.setFont("helvetica", "normal"); const lines = doc.splitTextToSize(safe(record.overrideReason), pageWidth - margin * 2); doc.text(lines, margin, y); y += lines.length * 4 + 3;
  }

  /* RC4.3 · Signaturmanifestation nach 21 CFR Part 11 §11.50: Name des
     Unterzeichners, Zeitpunkt und BEDEUTUNG der Handlung — im Klartext,
     nicht als Bild. Aeltere Datensaetze tragen noch eine gezeichnete
     Unterschrift; sie wird weiterhin abgebildet, damit ein RC3-Protokoll
     unveraendert lesbar bleibt. */
  ensure(40);
  if (record.signature?.image) {
    try { doc.addImage(record.signature.image, "PNG", margin, y, 58, 22, undefined, "FAST"); } catch { /* Signaturtext bleibt erhalten */ }
  }
  const spalte = record.signature?.image ? margin + 64 : margin;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text(`${record.signature?.meaning || "Signature"}`, spalte, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(`${safe(record.performedBy?.username || record.user.displayName)} (${safe(record.performedBy?.role || record.user.role)})`, spalte, y + 10);
  doc.text(safe(record.signedAt), spalte, y + 15);
  if (record.signature?.method) {
    doc.text(de
      ? `Elektronische Signatur - ${(record.signature.components || []).join(" + ")}`
      : `Electronic signature - ${(record.signature.components || []).join(" + ")}`, spalte, y + 20);
  }
  /* Pruefer und Genehmiger stehen GETRENNT im Protokoll (T-38). */
  if (record.approvedBy) {
    doc.text(de
      ? `Geprueft: ${safe(record.performedBy?.username)} (${safe(record.performedBy?.role)}) - ${safe(record.performedBy?.at)}`
      : `Inspected: ${safe(record.performedBy?.username)} (${safe(record.performedBy?.role)}) - ${safe(record.performedBy?.at)}`,
      margin, y + 27);
    doc.text(de
      ? `Genehmigt: ${safe(record.approvedBy?.username)} (${safe(record.approvedBy?.role)}) - ${safe(record.approvedBy?.at)}`
      : `Approved: ${safe(record.approvedBy?.username)} (${safe(record.approvedBy?.role)}) - ${safe(record.approvedBy?.at)}`,
      margin, y + 32);
    y += 12;
  }
  y += 26;
  const hashLines = doc.splitTextToSize(`SHA-256: ${record.recordHash}`, pageWidth - margin * 2);
  doc.text(hashLines, margin, y);

  doc.save(`VisuClean_${String(record.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
  /* Rueckgabe des Dokuments, damit ein Test seinen INHALT lesen kann. Bis
     rc.4.7 gab es keinen solchen Test, und deshalb blieb unbemerkt, dass
     der Mehrwinkelblock am falschen Objekt haengt und nie erscheint. */
  return doc;
}

export function exportInspectionCollectionPdf(records, language = "de") {
  const de = language !== "en";
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 14;
  let y = 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(`VisuClean - ${de ? "Sammelprotokoll" : "Collection report"}`, margin, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(de ? `Browser-Demonstrator v${APP_VERSION} - nicht validiertes GMP-Produktivsystem` : `Browser demonstrator v${APP_VERSION} - not a validated GMP production system`, margin, y); y += 8;
  const counts = { PASS: 0, FAIL: 0, OVERRIDE: 0 };
  records.forEach(record => { if (counts[record.finalDecision] !== undefined) counts[record.finalDecision]++; });
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(`${records.length} ${de ? "Pruefungen" : "inspections"} | PASS ${counts.PASS} | FAIL ${counts.FAIL} | OVERRIDE ${counts.OVERRIDE}`, margin, y); y += 9;
  records.forEach((record, index) => {
    if (y > 264) { doc.addPage(); y = 16; }
    const image = record.photos?.[0]?.annotatedImage || record.photos?.[0]?.image;
    if (image) {
      try { doc.addImage(image, "JPEG", margin, y, 36, 27, undefined, "FAST"); } catch { /* Metadaten bleiben erhalten */ }
    }
    const x = margin + 41;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(`${index + 1}. ${safe(record.eqName)} - ${safe(record.zoneName)}`, x, y + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`${record.finalDecision || (de ? "Freigabe ausstehend" : "awaiting release")}`
      + ` | ${safe(record.signedAt)} | ${safe(record.performedBy?.username || record.user?.displayName)}`, x, y + 10);
    doc.text(`ID: ${safe(record.id)}`, x, y + 16);
    doc.text(`SHA-256: ${safe(record.recordHash).slice(0, 40)}...`, x, y + 22);
    y += 31;
  });
  doc.save(`VisuClean_Sammelprotokoll_${new Date().toISOString().slice(0, 10)}.pdf`);
  return doc;
}
