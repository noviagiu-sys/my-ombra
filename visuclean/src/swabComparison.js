/* ─── VisuClean · Vorher-/Nachher-Vergleich des Wischtests ─────────────────
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis rc.4.37 stand der Vergleich in zwei Zeilen, zweimal dupliziert:
 *
 *     const score = result => ["dry", "clean", "intact"]
 *       .reduce((sum, key) => sum + (result?.[key]?.severity || 0), 0);
 *     interpretation: beforeScore > afterScore
 *       ? "RESIDUE_POSSIBLE" : "STRUCTURAL_FINDING_POSSIBLE"
 *
 * Damit wurden die Befundstaerken von Trocken, Sauber und Intakt ADDIERT
 * und eine sinkende Summe als "Rueckstand moeglich" ausgegeben. Drei
 * verschiedene Ursachen in einer Zahl:
 *
 *   - Trocknet die Oberflaeche zwischen den beiden Aufnahmen nach, faellt
 *     der Feuchtewert. Die Summe sinkt. Das Ergebnis lautete "Rueckstand
 *     moeglich", obwohl sich am Schmutzbefund nichts geaendert hat.
 *   - Aendert sich der Kratzerwert — und das tut er schon bei anderem
 *     Streiflicht —, sinkt die Summe ebenfalls. Ein Kratzerwert ist keine
 *     Reinigungswirkung.
 *   - Und umgekehrt: steigt die Feuchtigkeit staerker, als der Schmutz
 *     faellt, verschwindet eine echte Abnahme in der Summe.
 *
 * Verglichen wird deshalb JE KRITERIUM und getrennt ausgewiesen.
 *
 * WAS DIESER VERGLEICH NICHT SAGT
 *
 * Er sagt NICHT, was der Stoff war, und er sagt NICHT, dass er entfernt
 * wurde. Er beschreibt eine beobachtete Veraenderung zwischen zwei
 * Aufnahmen — nicht mehr. Der Befundstaerke-Index ist ein algorithmischer
 * Wert, keine physikalische Messgroesse; eine Differenz darin ist keine
 * Stoffmenge.
 *
 * Er erzeugt auch kein PASS. Die Freigabe bleibt eine dokumentierte
 * menschliche Handlung, und der Originalbefund bleibt stehen.
 *
 * VERGLEICHBARKEIT WIRD NICHT BEHAUPTET
 *
 * Zwei Aufnahmen sind nur dann vergleichbar, wenn Ausschnitt und Licht
 * hinreichend gleich sind. Die App misst das nicht. Wo sie es nicht
 * festgestellt hat, sagt sie das — statt eine Vergleichbarkeit zu
 * unterstellen, die niemand geprueft hat.
 */

/** Die drei Kriterien, getrennt und einzeln. */
export const WISCH_KRITERIEN = Object.freeze(["dry", "clean", "intact"]);

/** Richtung der Veraenderung je Kriterium. Beschreibend, nicht wertend. */
export const WISCH_RICHTUNG = Object.freeze({
  GESUNKEN: "GESUNKEN",
  GLEICH: "GLEICH",
  GESTIEGEN: "GESTIEGEN",
  UNBEKANNT: "UNBEKANNT",
});

/** Gesamtaussage des Wischtests. Keine davon ist eine Freigabe. */
export const WISCH_AUSSAGE = Object.freeze({
  /* Der Sauberkeitsbefund ist geringer als vorher. Beschreibung, keine
     Aussage ueber Stoff oder vollstaendige Entfernung. */
  SCHMUTZBEFUND_GERINGER: "SCHMUTZBEFUND_GERINGER",
  /* Der Sauberkeitsbefund ist unveraendert oder groesser. */
  SCHMUTZBEFUND_UNVERAENDERT: "SCHMUTZBEFUND_UNVERAENDERT",
  SCHMUTZBEFUND_GROESSER: "SCHMUTZBEFUND_GROESSER",
  /* Vorher-/Nachher-Zuordnung fehlt oder ist unvollstaendig. Dann gibt es
     nichts zu vergleichen — und das ist die Aussage. */
  NICHT_VERGLEICHBAR: "NICHT_VERGLEICHBAR",
  /* Ein Wischtest aus einer Fassung VOR rc.4.39. Er traegt die damalige
     Summe und die damalige Aussage, aber keine getrennte Auswertung —
     die gab es zum Zeitpunkt der Unterschrift nicht. */
  ALTFORMAT_SUMMENVERGLEICH: "ALTFORMAT_SUMMENVERGLEICH",
});

/** Warum ein Vergleich nicht moeglich oder nur eingeschraenkt gueltig ist. */
export const WISCH_EINSCHRAENKUNG = Object.freeze({
  KEINE_ZUORDNUNG: "KEINE_ZUORDNUNG",
  UNVOLLSTAENDIGE_AUFNAHME: "UNVOLLSTAENDIGE_AUFNAHME",
  AUSSCHNITT_NICHT_BELEGT: "AUSSCHNITT_NICHT_BELEGT",
  LICHT_NICHT_BELEGT: "LICHT_NICHT_BELEGT",
  /* Die damalige Summe laesst sich nicht nachtraeglich in drei Kriterien
     zerlegen. Die Einzelwerte wurden nie gespeichert, und aus einer Summe
     ihre Summanden zu raten waere eine Erfindung. */
  SUMME_NICHT_TRENNBAR: "SUMME_NICHT_TRENNBAR",
});

/** Woher die angezeigte Aussage stammt. */
export const WISCH_FORMAT = Object.freeze({
  /* Getrennte Auswertung, ab rc.4.38 gespeichert. */
  GETRENNT: "GETRENNT",
  /* Summenvergleich aus einer frueheren Fassung. */
  ALTFORMAT: "ALTFORMAT",
  /* Weder das eine noch das andere — hier gibt es wirklich nichts. */
  OHNE: "OHNE",
});

const zahlOderNull = wert => (Number.isFinite(wert) ? wert : null);

function richtung(vorher, nachher) {
  if (vorher === null || nachher === null) return WISCH_RICHTUNG.UNBEKANNT;
  if (nachher < vorher) return WISCH_RICHTUNG.GESUNKEN;
  if (nachher > vorher) return WISCH_RICHTUNG.GESTIEGEN;
  return WISCH_RICHTUNG.GLEICH;
}

/**
 * Vergleicht zwei Wischtestaufnahmen JE KRITERIUM.
 *
 * @param {Object} vorher   Ergebnis der ersten Aufnahme ({dry, clean, intact})
 * @param {Object} nachher  Ergebnis der zweiten Aufnahme
 * @param {Object} [kontext] { ausschnittBelegt, lichtBelegt } — jeweils nur
 *        dann true, wenn die Gleichheit tatsaechlich FESTGESTELLT wurde.
 *        Voreinstellung ist false: nicht festgestellt heisst nicht belegt.
 * @returns {Object} Vergleich
 */
export function vergleicheWischtest(vorher, nachher, kontext = {}) {
  const beideDa = Boolean(vorher) && Boolean(nachher);
  const kriterien = {};
  for (const schluessel of WISCH_KRITERIEN) {
    const v = zahlOderNull(vorher?.[schluessel]?.severity);
    const n = zahlOderNull(nachher?.[schluessel]?.severity);
    kriterien[schluessel] = Object.freeze({
      kriterium: schluessel,
      vorher: v, nachher: n,
      differenz: (v === null || n === null) ? null : n - v,
      richtung: richtung(v, n),
      vorherCode: vorher?.[schluessel]?.code ?? null,
      nachherCode: nachher?.[schluessel]?.code ?? null,
    });
  }

  const einschraenkungen = [];
  if (!beideDa) einschraenkungen.push(WISCH_EINSCHRAENKUNG.KEINE_ZUORDNUNG);
  else if (WISCH_KRITERIEN.some(k => kriterien[k].vorher === null || kriterien[k].nachher === null))
    einschraenkungen.push(WISCH_EINSCHRAENKUNG.UNVOLLSTAENDIGE_AUFNAHME);
  /* Nicht festgestellt ist nicht dasselbe wie festgestellt gleich. Die App
     misst weder Ausschnitt noch Licht zwischen den beiden Aufnahmen; wo
     das so ist, steht es hier und nicht im Kleingedruckten. */
  if (kontext.ausschnittBelegt !== true)
    einschraenkungen.push(WISCH_EINSCHRAENKUNG.AUSSCHNITT_NICHT_BELEGT);
  if (kontext.lichtBelegt !== true)
    einschraenkungen.push(WISCH_EINSCHRAENKUNG.LICHT_NICHT_BELEGT);

  /* Die Gesamtaussage haengt AUSSCHLIESSLICH am Sauberkeitskriterium.
     Feuchte und Unversehrtheit werden daneben ausgewiesen, aber sie gehen
     nicht in die Aussage ein — genau das war der Fehler. */
  const sauber = kriterien.clean;
  let aussage;
  if (!beideDa || sauber.vorher === null || sauber.nachher === null) {
    aussage = WISCH_AUSSAGE.NICHT_VERGLEICHBAR;
  } else if (sauber.richtung === WISCH_RICHTUNG.GESUNKEN) {
    aussage = WISCH_AUSSAGE.SCHMUTZBEFUND_GERINGER;
  } else if (sauber.richtung === WISCH_RICHTUNG.GESTIEGEN) {
    aussage = WISCH_AUSSAGE.SCHMUTZBEFUND_GROESSER;
  } else {
    aussage = WISCH_AUSSAGE.SCHMUTZBEFUND_UNVERAENDERT;
  }

  return Object.freeze({
    aussage,
    kriterien: Object.freeze(kriterien),
    einschraenkungen: Object.freeze(einschraenkungen),
    /* Damit niemand die alte Summe zurueckbaut: sie steht hier nicht, und
       sie entsteht auch nicht nebenbei. */
    grantsRelease: false,
  });
}

/**
 * Die Anzeige eines GESPEICHERTEN Wischtests — neu oder alt.
 *
 * WARUM ES DIESE FUNKTION GIBT
 *
 * rc.4.38 las ausschliesslich `swabTest.comparison`. Ein Wischtest aus
 * einer frueheren Fassung hat dieses Feld nicht, und die Anzeige meldete
 * daraufhin "Kein Vergleich moeglich: die Vorher-/Nachher-Zuordnung
 * fehlt". Die Zuordnung fehlte nicht — die beiden Fotos und die damaligen
 * Werte stehen im Datensatz. Es fehlte nur die getrennte Auswertung, und
 * die gab es zum Zeitpunkt der Unterschrift noch nicht.
 *
 * Ein signierter Bericht, der ueber seine eigenen Daten etwas Falsches
 * sagt, ist schlimmer als einer, der weniger sagt.
 *
 * WAS SIE NICHT TUT
 *
 * Sie rechnet nichts nach und sie erfindet keine Einzelwerte. Die damalige
 * Summe laesst sich nicht in drei Kriterien zerlegen — die Summanden
 * wurden nie gespeichert. Der Altfall traegt deshalb KEINE Kriterienzeilen,
 * sondern die Summe, die damalige Aussage und den ausdruecklichen Hinweis,
 * dass beides nicht trennbar ist.
 *
 * Sie veraendert den Datensatz nicht. Die Rueckgabe ist eine Ansicht.
 *
 * @param {Object} swabTest  record.swabTest
 * @returns {Object} Ansicht mit `format`, `aussage`, `kriterien`,
 *          `einschraenkungen` und bei Altformat zusaetzlich `altwerte`
 */
export function wischAnsicht(swabTest) {
  const gemeinsam = [
    WISCH_EINSCHRAENKUNG.AUSSCHNITT_NICHT_BELEGT,
    WISCH_EINSCHRAENKUNG.LICHT_NICHT_BELEGT,
  ];

  /* Neu: die getrennte Auswertung liegt gespeichert vor. Sie wird
     UNVERAENDERT durchgereicht, nicht neu abgeleitet. */
  const vergleich = swabTest?.comparison;
  if (vergleich?.aussage) {
    return Object.freeze({
      format: WISCH_FORMAT.GETRENNT,
      aussage: vergleich.aussage,
      kriterien: Object.freeze({ ...(vergleich.kriterien || {}) }),
      einschraenkungen: Object.freeze([...(vergleich.einschraenkungen || [])]),
      altwerte: null,
    });
  }

  /* Alt: Summe vorhanden. "Fehlend ist nicht Null" — nur endliche Zahlen
     gelten als vorhanden, eine fehlende Summe ist keine 0. */
  const v = Number.isFinite(swabTest?.beforeScore) ? swabTest.beforeScore : null;
  const n = Number.isFinite(swabTest?.afterScore) ? swabTest.afterScore : null;
  if (v !== null && n !== null) {
    return Object.freeze({
      format: WISCH_FORMAT.ALTFORMAT,
      aussage: WISCH_AUSSAGE.ALTFORMAT_SUMMENVERGLEICH,
      kriterien: Object.freeze({}),
      einschraenkungen: Object.freeze([
        WISCH_EINSCHRAENKUNG.SUMME_NICHT_TRENNBAR, ...gemeinsam]),
      altwerte: Object.freeze({
        vorher: v, nachher: n,
        interpretation: swabTest?.interpretation ?? null,
      }),
    });
  }

  /* Weder noch. Dann stimmt "kein Vergleich" auch wirklich. */
  return Object.freeze({
    format: WISCH_FORMAT.OHNE,
    aussage: WISCH_AUSSAGE.NICHT_VERGLEICHBAR,
    kriterien: Object.freeze({}),
    einschraenkungen: Object.freeze([
      WISCH_EINSCHRAENKUNG.KEINE_ZUORDNUNG, ...gemeinsam]),
    altwerte: null,
  });
}

/**
 * Immer nein.
 *
 * Aus einem Wischvergleich entsteht kein PASS. Er ist eine
 * Entscheidungshilfe fuer den Operator; die Freigabe bleibt eine
 * dokumentierte menschliche Handlung, und der Originalbefund bleibt
 * stehen. Eine Funktion, die hier jemals `true` lieferte, waere der Punkt,
 * an dem aus "wirkt weniger" ein "ist sauber" wuerde.
 */
export function wischGibtFrei() {
  return false;
}

const TEXTE = Object.freeze({
  [WISCH_AUSSAGE.SCHMUTZBEFUND_GERINGER]: {
    de: "Der Sauberkeitsbefund ist nach dem Wischen geringer als vorher."
      + " Beobachtete Veraenderung zwischen zwei Aufnahmen - kein Beleg fuer"
      + " die Art des Stoffes und kein Beleg, dass er vollstaendig entfernt ist.",
    en: "The cleanliness finding is lower after wiping than before. An observed"
      + " change between two images - no evidence of the type of substance and"
      + " no evidence that it has been fully removed.",
  },
  [WISCH_AUSSAGE.SCHMUTZBEFUND_UNVERAENDERT]: {
    de: "Der Sauberkeitsbefund ist unveraendert. Eine Abnahme wurde nicht"
      + " beobachtet; ein Strukturbefund oder Korrosion bleibt moeglich.",
    en: "The cleanliness finding is unchanged. No decrease was observed;"
      + " a structural finding or corrosion remains possible.",
  },
  [WISCH_AUSSAGE.SCHMUTZBEFUND_GROESSER]: {
    de: "Der Sauberkeitsbefund ist groesser als vorher. Ursache offen -"
      + " Verteilung des Rueckstands, veraenderte Aufnahmebedingungen oder"
      + " ein Strukturbefund kommen in Frage.",
    en: "The cleanliness finding is higher than before. Cause open - spreading"
      + " of residue, changed capture conditions or a structural finding are"
      + " possible.",
  },
  [WISCH_AUSSAGE.NICHT_VERGLEICHBAR]: {
    de: "Kein Vergleich moeglich: die Vorher-/Nachher-Zuordnung fehlt oder ist"
      + " unvollstaendig. Es wird keine Veraenderung ausgewiesen.",
    en: "No comparison possible: the before/after assignment is missing or"
      + " incomplete. No change is reported.",
  },
});

const EINSCHRAENKUNGSTEXTE = Object.freeze({
  [WISCH_EINSCHRAENKUNG.KEINE_ZUORDNUNG]: {
    de: "Vorher-/Nachher-Zuordnung fehlt.",
    en: "Before/after assignment missing.",
  },
  [WISCH_EINSCHRAENKUNG.UNVOLLSTAENDIGE_AUFNAHME]: {
    de: "Mindestens ein Kriterium liegt in einer der beiden Aufnahmen nicht vor.",
    en: "At least one criterion is absent from one of the two images.",
  },
  [WISCH_EINSCHRAENKUNG.AUSSCHNITT_NICHT_BELEGT]: {
    de: "Gleicher Bildausschnitt ist nicht festgestellt - ein abweichender"
      + " Ausschnitt kann die Werte allein verschieben.",
    en: "Identical framing is not established - a different crop alone can"
      + " shift the values.",
  },
  [WISCH_EINSCHRAENKUNG.LICHT_NICHT_BELEGT]: {
    de: "Gleiche Beleuchtung ist nicht festgestellt - veraendertes Licht kann"
      + " die Werte allein verschieben.",
    en: "Identical lighting is not established - changed light alone can shift"
      + " the values.",
  },
  [WISCH_EINSCHRAENKUNG.SUMME_NICHT_TRENNBAR]: {
    de: "Die damalige Summe ist nicht nachtraeglich in Trocken, Sauber und"
      + " Intakt zerlegbar - die Einzelwerte wurden nie gespeichert. Sie"
      + " werden hier auch nicht geschaetzt.",
    en: "The historical sum cannot be split into dry, clean and intact after"
      + " the fact - the individual values were never stored. They are not"
      + " estimated here either.",
  },
});

/* Die damaligen Aussage-Codes, im Wortlaut ihrer Zeit. Sie werden
   WIEDERGEGEBEN, nicht neu bewertet: was damals unterschrieben wurde,
   bleibt stehen. */
const ALT_INTERPRETATION = Object.freeze({
  RESIDUE_POSSIBLE: {
    de: "Rueckstand moeglich", en: "residue possible",
  },
  STRUCTURAL_FINDING_POSSIBLE: {
    de: "Strukturschaden oder Korrosion moeglich",
    en: "structural damage or corrosion possible",
  },
});

/** Die Gesamtaussage im Klartext. */
export function wischText(vergleich, sprache = "de") {
  const de = sprache !== "en";
  /* Der Altfall traegt seine Zahlen IM SATZ. Ein Hinweis "Summenvergleich"
     ohne die Werte waere fuer den Leser des Berichts wertlos — er will
     wissen, was damals dastand. */
  if (vergleich?.aussage === WISCH_AUSSAGE.ALTFORMAT_SUMMENVERGLEICH) {
    const a = vergleich.altwerte || {};
    const damals = ALT_INTERPRETATION[a.interpretation]?.[de ? "de" : "en"] ?? null;
    return de
      ? `Damaliger Summenvergleich, keine getrennte Kriterienauswertung:`
        + ` ${a.vorher} -> ${a.nachher}`
        + (damals ? ` · damalige Aussage "${damals}" (${a.interpretation})` : "")
        + ". Die Summe vermischt Trocken, Sauber und Intakt; sie ist"
        + " nachtraeglich nicht trennbar. Die Aufnahmen und die damaligen"
        + " Werte liegen unveraendert vor."
      : `Historical sum comparison, no per-criterion evaluation:`
        + ` ${a.vorher} -> ${a.nachher}`
        + (damals ? ` · statement at the time "${damals}" (${a.interpretation})` : "")
        + ". The sum mixes dry, clean and intact; it cannot be split after"
        + " the fact. The images and the values of the time are unchanged.";
  }
  return TEXTE[vergleich?.aussage]?.[de ? "de" : "en"]
    ?? TEXTE[WISCH_AUSSAGE.NICHT_VERGLEICHBAR][de ? "de" : "en"];
}

/** Die Einschraenkungen im Klartext. */
export function wischEinschraenkungsTexte(vergleich, sprache = "de") {
  const de = sprache !== "en";
  return (vergleich?.einschraenkungen || [])
    .map(code => EINSCHRAENKUNGSTEXTE[code]?.[de ? "de" : "en"])
    .filter(Boolean);
}

/** Eine Kriterienzeile im Klartext, mit Rohwerten und ihrem Bezug. */
export function wischKriteriumText(eintrag, sprache = "de") {
  const de = sprache !== "en";
  const name = { dry: de ? "Trocken" : "Dry", clean: de ? "Sauber" : "Clean",
    intact: de ? "Intakt" : "Intact" }[eintrag?.kriterium] || eintrag?.kriterium;
  if (eintrag?.vorher === null || eintrag?.nachher === null) {
    return `${name}: ${de ? "kein Vergleich moeglich" : "no comparison possible"}`;
  }
  const richtungText = {
    [WISCH_RICHTUNG.GESUNKEN]: de ? "geringer" : "lower",
    [WISCH_RICHTUNG.GLEICH]: de ? "unveraendert" : "unchanged",
    [WISCH_RICHTUNG.GESTIEGEN]: de ? "groesser" : "higher",
  }[eintrag.richtung] || (de ? "unbekannt" : "unknown");
  return `${name}: ${eintrag.vorher} -> ${eintrag.nachher} (${richtungText})`
    + ` · ${de ? "Befundstaerke-Index, algorithmisch, keine Messgroesse"
      : "finding index, algorithmic, not a measurement"}`;
}
