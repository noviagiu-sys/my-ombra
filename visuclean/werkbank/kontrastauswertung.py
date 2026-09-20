#!/usr/bin/env python3
"""
VisuClean · Werkbank — Auswertung Kontrast gegen Riefentiefe
============================================================

WAS DAS IST UND WAS NICHT

Ein Messwerkzeug auf dem PC, kein Bestandteil der App. Es prueft, ob ein
gemessener Bildkontrast mit einer UNABHAENGIG gemessenen Riefentiefe
zusammenhaengt — und wie gut eine Kontrastschwelle tiefe von flachen
Riefen trennt.

Es beantwortet die Frage NICHT. Es rechnet nur nach, was in den Daten
steht. Solange keine realen Aufnahmen mit unabhaengiger Tiefenmessung
vorliegen, ist jede Zahl aus diesem Skript eine Logikpruefung an
Beispieldaten.

AUSDRUECKLICH KEIN NACHWEIS

  * Aus Kontrast folgt keine Tiefe in Mikrometern.
  * Die Referenzgrenze 1,0 um ist KEINE Kontrastschwelle.
  * Eine Schwelle aus diesem Skript ist KEINE App-Schwelle.
  * Ergebnisse fuer Riefen belegen nichts ueber Krater.

WAS DAS SKRIPT VERWEIGERT

  * fehlende Werte durch 0 zu ersetzen — sie werden gezaehlt und benannt;
  * eine Korrelation aus weniger als drei vollstaendigen Paaren;
  * eine Kennzahl mit leerem Nenner (dann: "nicht berechenbar");
  * Riefen und Krater stillschweigend zusammenzuwerfen;
  * eine Behauptung auszugeben, die den eigenen Zahlen widerspricht.

AUFRUF

  Korrelation und Konfusionsmatrix aus einer Kandidatentabelle:
    python3 kontrastauswertung.py --daten k.csv --schwelle 17.0 --tiefgrenze vorgabe

  'vorgabe' setzt die belegte Grenze aus der Vorgabe (1,0 um
  Kratz-/Riefentiefe). Eine Zahl statt 'spez' gilt als frei gewaehlt und
  wird in der Ausgabe so ausgewiesen — damit ein Probelauf spaeter nicht
  wie eine Pruefung gegen die hinterlegte Vorgabe aussieht.

  Gesamtweg vom Foto bis zum angezeigten Befund:
    python3 kontrastauswertung.py --referenz r.csv --kandidaten k.csv \\
        --schwelle 17.0 --tiefgrenze vorgabe

  Trennung Entwicklungs-/Testdaten pruefen:
    python3 kontrastauswertung.py --gruppen-pruefen entwicklung.csv test.csv

  Eine Behauptung gegen die Zahlen pruefen:
    python3 kontrastauswertung.py --daten k.csv --schwelle 17.0 \\
        --tiefgrenze 1.0 --behauptung "kein tiefer Kratzer uebersehen"

Nur Standardbibliothek. Kein numpy, kein pandas, keine Installation.
"""

import argparse
import csv
import math
import sys
from pathlib import Path

# ── Spaltenvertrag ────────────────────────────────────────────────────────
# Minimalform (Logikpruefung, wie im Auftrag als Formatbeispiel genannt):
#     id,kontrast,tiefe_um
# Vollform fuer reale Messungen — siehe KONTRAST_RIEFENTIEFE.md.
# Zwingend ist nur der Messwert. `tiefe_um` darf ganz fehlen: Kontraste
# werden erfasst, BEVOR die unabhaengige Tiefenmessung vorliegt. Fehlt die
# Spalte, gilt jede Zeile als "Referenztiefe nicht gemessen" — sie gilt
# nicht als 0 und nicht als flach.
PFLICHT_MINIMAL = ("kontrast",)

# ── Referenzgrenze ────────────────────────────────────────────────────────
# Die einzige Zahl in diesem Projekt, die von aussen belegt ist: die
# Vorgabe nennt eine zulaessige Kratz-/Riefentiefe von 1,0 um
# (Korrektur des Auftraggebers vom 15.09.2026 — zuvor war von Millimetern
# die Rede).
#
# WAS SIE IST:    eine Referenzgrenze fuer eine unabhaengig GEMESSENE Tiefe.
# WAS SIE NICHT IST: eine Kontrastschwelle. Aus einem Bildkontrast folgt
#                 keine Tiefe, und 1,0 um liegt weit unterhalb dessen, was
#                 eine Handyaufnahme aufloest. Wer diese Zahl als --schwelle
#                 einsetzt, vergleicht Mikrometer mit Gradientenbetraegen.
VORGABE_TIEFGRENZE_UM = 1.0
HERKUNFT_VORGABE = "VORGABE"
HERKUNFT_FREI = "frei gewaehlt"
VORGABE_TEXT = ("Vorgabegrenze, Kratz-/Riefentiefe, "
                      "bestaetigt 15.09.2026")

# Der Operator ist geklaert: die Vorgabe lautet "< 1,0 um"
# (nachgereicht am 15.09.2026). Zulaessig ist also STRENG kleiner; 1,000 um
# ist bereits ueberschritten.
#
# Wie viel an diesem einen Zeichen haengt, ist hier messbar: in
# dummy_kandidaten.csv liegen drei von 200 Zeilen genau auf 1,00 um. Solange
# der Operator offen war, standen sie im Grenzfall und die Matrix las sich
# TP 143; mit dem geklaerten "<" zaehlen sie als tief und die Matrix liest
# sich wieder TP 146. Drei Treffer an einem Zeichen.
GRENZOPERATOR_GEKLAERT = True
GRENZOPERATOR = "<"

TIEF = "TIEF"
NICHT_TIEF = "NICHT_TIEF"
GRENZFALL = "GRENZFALL"

# Befundarten werden GETRENNT ausgewertet. Ein Ergebnis fuer Riefen belegt
# nichts ueber Krater: andere Geometrie, andere Schattenbildung, andere
# Beziehung zwischen Kantenkontrast und Tiefe.
BEFUNDARTEN = ("RIEFE", "KRATER", "UNBEKANNT")

NICHT_BERECHENBAR = "nicht berechenbar"


class Datenfehler(Exception):
    """Eingabe ist unbrauchbar — nicht stillschweigend reparieren."""


# ── Einlesen ──────────────────────────────────────────────────────────────

def zahl_oder_none(text):
    """Leer, '-', 'NA', 'nan' und Unsinn ergeben None — niemals 0.

    Das ist die wichtigste Zeile des Skripts. `float(x or 0)` haette aus
    einem nicht gemessenen Wert eine gemessene Null gemacht, und eine
    gemessene Null ist eine Behauptung.
    """
    if text is None:
        return None
    s = str(text).strip()
    if s == "" or s.upper() in {"-", "NA", "N/A", "NULL", "NONE", "NAN"}:
        return None
    try:
        wert = float(s.replace(",", "."))
    except ValueError:
        return None
    if math.isnan(wert) or math.isinf(wert):
        return None
    return wert


def lies_tabelle(pfad):
    """CSV einlesen und die Kopfzeile pruefen."""
    p = Path(pfad)
    if not p.is_file():
        raise Datenfehler(f"Datei nicht gefunden: {pfad}")
    with p.open(newline="", encoding="utf-8") as f:
        leser = csv.DictReader(f)
        if leser.fieldnames is None:
            raise Datenfehler(f"{pfad}: leere Datei, keine Kopfzeile")
        kopf = [n.strip() for n in leser.fieldnames]
        zeilen = []
        for nr, roh in enumerate(leser, start=2):
            zeilen.append({(k.strip() if k else k): v for k, v in roh.items()})
    return kopf, zeilen


def pruefe_kopf(kopf, pflicht, pfad):
    fehlend = [s for s in pflicht if s not in kopf]
    if fehlend:
        raise Datenfehler(
            f"{pfad}: Spalten fehlen: {', '.join(fehlend)}. "
            f"Vorhanden: {', '.join(kopf) or '(keine)'}")


def befundart(zeile):
    roh = (zeile.get("befundart") or "").strip().upper()
    return roh if roh in BEFUNDARTEN else "UNBEKANNT"


def lies_tiefgrenze(text):
    """'spez' oder eine Zahl -> (Wert, Herkunft).

    Die Herkunft wird mitgefuehrt und ausgegeben, damit ein Probelauf mit
    einer selbst gewaehlten Grenze spaeter nicht wie eine Pruefung gegen die
    hinterlegte Vorgabe aussieht.
    """
    if text is None:
        return None, None
    s = str(text).strip().lower()
    if s in {"vorgabe", "vorg"}:
        return VORGABE_TIEFGRENZE_UM, HERKUNFT_VORGABE
    wert = zahl_oder_none(text)
    if wert is None:
        raise Datenfehler(
            f"--tiefgrenze: '{text}' ist weder eine Zahl noch 'vorgabe'. "
            f"'vorgabe' setzt die belegte Grenze {VORGABE_TIEFGRENZE_UM:g} um "
            f"({VORGABE_TEXT}).")
    if wert <= 0:
        raise Datenfehler("--tiefgrenze muss groesser als 0 sein")
    return wert, HERKUNFT_FREI


def tiefenklasse(tiefe, tiefgrenze, unsicherheit):
    """TIEF / NICHT_TIEF / GRENZFALL — oder None, wenn nicht gemessen.

    Die Vorgabe sagt "< 1,0 um": zulaessig ist streng kleiner, 1,000
    ist bereits tief. Eingeteilt wird erst, wenn das GANZE
    Unsicherheitsintervall auf einer Seite liegt:

      * oben  <  Grenze  -> NICHT_TIEF
      * unten >= Grenze  -> TIEF
      * sonst schneidet das Intervall die Grenze -> GRENZFALL

    Der wahre Wert koennte im dritten Fall auf der anderen Seite liegen;
    eine Einteilung waere geraten.

    Eine fehlende Unsicherheit wird NICHT als +/- 0 gelesen. Der Punktwert
    teilt dann ein, aber der Aufrufer zaehlt diese Zeilen getrennt und die
    Ausgabe benennt sie. In der App ist dieselbe Lage strenger geregelt:
    dort gibt es ohne Unsicherheit ueberhaupt keine Entscheidung.
    """
    if tiefe is None:
        return None
    if unsicherheit is None:
        return NICHT_TIEF if tiefe < tiefgrenze else TIEF
    u = abs(unsicherheit)
    unten, oben = tiefe - u, tiefe + u
    if oben < tiefgrenze:
        return NICHT_TIEF
    if unten >= tiefgrenze:
        return TIEF
    return GRENZFALL


def leere_matrix():
    return {"TP": 0, "FP": 0, "TN": 0, "FN": 0,
            "grenzfall": 0, "ohne_methode": 0, "ohne_unsicherheit": 0,
            "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0}


def _tiefenangabe(zeile):
    """(Tiefe, Methode, Unsicherheit) aus einer Zeile — ohne Interpretation."""
    return (zahl_oder_none(zeile.get("tiefe_um")),
            (zeile.get("tiefe_methode") or "").strip(),
            zahl_oder_none(zeile.get("tiefe_unsicherheit_um")))


# ── Kennzahlen ────────────────────────────────────────────────────────────

def pearson(paare):
    """Pearson-Korrelation. Weniger als drei Paare: nicht berechenbar.

    Zwei Punkte ergeben immer r = ±1. Das ist keine Korrelation, das ist
    eine Gerade durch zwei Punkte. Ebenso bei Streuung 0 in einer der
    beiden Groessen — dann ist r nicht definiert, nicht 0.
    """
    n = len(paare)
    if n < 3:
        return None, f"{NICHT_BERECHENBAR} (nur {n} vollstaendige Paare, mindestens 3 noetig)"
    mx = sum(x for x, _ in paare) / n
    my = sum(y for _, y in paare) / n
    sxx = sum((x - mx) ** 2 for x, _ in paare)
    syy = sum((y - my) ** 2 for _, y in paare)
    sxy = sum((x - mx) * (y - my) for x, y in paare)
    if sxx == 0 or syy == 0:
        leer = "Kontrast" if sxx == 0 else "Tiefe"
        return None, f"{NICHT_BERECHENBAR} ({leer} hat keine Streuung)"
    return sxy / math.sqrt(sxx * syy), None


def spearman(paare):
    """Rangkorrelation. Sie braucht KEINE Klassengrenze und keine Annahme
    ueber die Form des Zusammenhangs.

    Fuer die Frage "steigt der Kontrast mit der Tiefe" ist sie die
    ehrlichere Zahl als Pearson: sie misst Monotonie, nicht Linearitaet.
    Ein Zusammenhang muss nicht gerade sein, um brauchbar zu sein.
    """
    n = len(paare)
    if n < 3:
        return None, f"{NICHT_BERECHENBAR} (nur {n} vollstaendige Paare, mindestens 3 noetig)"

    def raenge(werte):
        sortiert = sorted(range(len(werte)), key=lambda i: werte[i])
        r = [0.0] * len(werte)
        i = 0
        while i < len(sortiert):
            j = i
            while j + 1 < len(sortiert) and werte[sortiert[j + 1]] == werte[sortiert[i]]:
                j += 1
            # Bindungen bekommen den mittleren Rang — sonst haengt das
            # Ergebnis von der Reihenfolge in der Datei ab.
            mittel = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[sortiert[k]] = mittel
            i = j + 1
        return r

    rx = raenge([x for x, _ in paare])
    ry = raenge([y for _, y in paare])
    return pearson(list(zip(rx, ry)))


def spanne(werte):
    """Kleinster und groesster Wert, oder None bei leerer Liste."""
    if not werte:
        return None
    return (min(werte), max(werte))


def quote(zaehler, nenner):
    """Kennzahl oder ausdruecklich 'nicht berechenbar'. Nie 0 bei Nenner 0."""
    if nenner == 0:
        return None
    return zaehler / nenner


def konfusion(zeilen, schwelle, tiefgrenze):
    """Konfusionsmatrix aus VOLLSTAENDIGEN Zeilen.

    Positive Klasse ist "tiefer Befund": tiefe_um >= tiefgrenze.
    Vorhersage positiv ist: kontrast >= schwelle.

    Unvollstaendige Zeilen gehen NICHT in die Matrix, sondern in einen
    eigenen Zaehler. Eine Matrix, die fehlende Werte als negativ verbucht,
    sieht besser aus als sie ist.
    """
    m = leere_matrix()
    for z in zeilen:
        k = zahl_oder_none(z.get("kontrast"))
        t, methode, unsicherheit = _tiefenangabe(z)
        # Getrennt gezaehlt und getrennt benannt: eine fehlende
        # Referenztiefe ist etwas anderes als ein fehlender Messwert.
        # "unvollstaendig" haette beides zu einem Topf gemacht, und dann
        # waere nicht mehr zu sehen, ob die Messung oder die Referenz fehlt.
        if t is None:
            m["tiefe_nicht_gemessen"] += 1
            continue
        if k is None:
            m["kontrast_nicht_gemessen"] += 1
            continue
        # Methode und Unsicherheit fehlen NICHT stillschweigend: sie werden
        # gezaehlt und in der Ausgabe benannt. Die Zeile wird trotzdem
        # eingeteilt — dieses Werkzeug erfasst Daten, die es vor der
        # unabhaengigen Messung schon gibt, und die Minimalform
        # `id,kontrast,tiefe_um` ist ausdruecklich erlaubt.
        #
        # DIE HARTE GRENZE LIEGT WOANDERS: in der App entscheidet
        # src/depthLimit.js ohne Methode und Unsicherheit ueberhaupt nicht
        # (MEASUREMENT_INCOMPLETE). Forschungswerkzeug und Entscheidungspfad
        # duerfen hier verschieden streng sein — solange beide sagen, was
        # ihnen fehlt.
        if not methode:
            m["ohne_methode"] += 1
        if unsicherheit is None:
            m["ohne_unsicherheit"] += 1
        klasse = tiefenklasse(t, tiefgrenze, unsicherheit)
        if klasse == GRENZFALL:
            m["grenzfall"] += 1
            continue
        ist_tief = klasse == TIEF
        sagt_tief = k >= schwelle
        if ist_tief and sagt_tief:
            m["TP"] += 1
        elif not ist_tief and sagt_tief:
            m["FP"] += 1
        elif not ist_tief and not sagt_tief:
            m["TN"] += 1
        else:
            m["FN"] += 1
    return m


def kennzahlen(m):
    """Precision, Recall, Spezifitaet, Genauigkeit — je einzeln pruefbar."""
    return {
        "Precision": quote(m["TP"], m["TP"] + m["FP"]),
        "Recall": quote(m["TP"], m["TP"] + m["FN"]),
        "Spezifitaet": quote(m["TN"], m["TN"] + m["FP"]),
        "Genauigkeit": quote(m["TP"] + m["TN"], m["TP"] + m["FP"] + m["TN"] + m["FN"]),
    }


# ── Gesamtweg: uebersehene Befunde zaehlen mit ────────────────────────────

def gesamtweg(referenz, kandidaten, schwelle, tiefgrenze):
    """Vom vollstaendigen Foto bis zum angezeigten Befund.

    Der Unterschied zur Kandidatenbewertung ist der entscheidende: eine
    Riefe, die der Detektor GAR NICHT gefunden hat, erzeugt keine
    Kandidatenzeile. Wer nur Kandidaten bewertet, sieht sie nie — und
    bekommt eine Trefferquote, die den halben Weg auslaesst.

    Die Referenzbefunde muessen deshalb UNABHAENGIG vom Detektor erfasst
    sein. Dieses Skript kann das nicht pruefen; es verlangt die Spalte
    `referenz_quelle` und weist "DETEKTOR" ausdruecklich zurueck.
    """
    zuordnung = {}
    for z in kandidaten:
        bid = (z.get("befund_id") or "").strip()
        if bid:
            zuordnung.setdefault(bid, []).append(z)

    m = leere_matrix()
    uebersehen = []

    for r in referenz:
        quelle = (r.get("referenz_quelle") or "").strip().upper()
        if quelle == "DETEKTOR":
            raise Datenfehler(
                "referenz_quelle = DETEKTOR: die Referenzbefunde stammen vom "
                "Detektor selbst. Dann misst die Auswertung den Detektor an "
                "sich selbst und sagt nichts ueber die Wirklichkeit.")
        bid = (r.get("befund_id") or "").strip()
        t, methode, unsicherheit = _tiefenangabe(r)
        if t is None:
            m["tiefe_nicht_gemessen"] += 1
            continue
        if not methode:
            m["ohne_methode"] += 1
        if unsicherheit is None:
            m["ohne_unsicherheit"] += 1
        klasse = tiefenklasse(t, tiefgrenze, unsicherheit)
        if klasse == GRENZFALL:
            # Ein Grenzfall zaehlt auch dann nicht als Treffer, wenn der
            # Detektor ihn gefunden hat — und auch nicht als uebersehen,
            # wenn er ihn nicht gefunden hat. Beides waere eine Aussage
            # ueber eine Einteilung, die es nicht gibt.
            m["grenzfall"] += 1
            continue
        ist_tief = klasse == TIEF
        treffer = zuordnung.get(bid, [])
        if not treffer:
            # Kein Kandidat: der Befund wurde nicht angezeigt.
            if ist_tief:
                m["FN"] += 1
                uebersehen.append(bid or "(ohne befund_id)")
            else:
                m["TN"] += 1
            continue
        k = max((zahl_oder_none(z.get("kontrast")) or float("-inf")) for z in treffer)
        if k == float("-inf"):
            m["kontrast_nicht_gemessen"] += 1
            continue
        sagt_tief = k >= schwelle
        if ist_tief and sagt_tief:
            m["TP"] += 1
        elif not ist_tief and sagt_tief:
            m["FP"] += 1
        elif not ist_tief and not sagt_tief:
            m["TN"] += 1
        else:
            m["FN"] += 1
            uebersehen.append(bid or "(ohne befund_id)")

    # Kandidaten ohne Referenzbefund sind Fehlalarme des Gesamtwegs.
    bekannte = {(r.get("befund_id") or "").strip() for r in referenz}
    for z in kandidaten:
        bid = (z.get("befund_id") or "").strip()
        if bid and bid not in bekannte:
            k = zahl_oder_none(z.get("kontrast"))
            if k is None:
                m["kontrast_nicht_gemessen"] += 1
            elif k >= schwelle:
                m["FP"] += 1

    return m, uebersehen


# ── Gruppentrennung ───────────────────────────────────────────────────────

def gruppen_ueberschneidung(pfade):
    """Mehrere Aufnahmen desselben Teils gehoeren in dieselbe Gruppe.

    Sonst steht dasselbe Teil in Entwicklung und Test, das Modell hat es
    schon gesehen, und die Testzahl ist geschoent — ohne dass es jemandem
    auffaellt.
    """
    mengen = {}
    for p in pfade:
        kopf, zeilen = lies_tabelle(p)
        if "teil_id" not in kopf:
            raise Datenfehler(f"{p}: Spalte teil_id fehlt — ohne sie ist keine "
                              "Gruppentrennung pruefbar")
        mengen[p] = {(z.get("teil_id") or "").strip() for z in zeilen if (z.get("teil_id") or "").strip()}
    doppelt = {}
    namen = list(mengen)
    for i in range(len(namen)):
        for j in range(i + 1, len(namen)):
            gemeinsam = mengen[namen[i]] & mengen[namen[j]]
            if gemeinsam:
                doppelt[(namen[i], namen[j])] = sorted(gemeinsam)
    return mengen, doppelt


# ── Behauptungspruefung ───────────────────────────────────────────────────

# Saetze, die aus einer Konfusionsmatrix NICHT folgen duerfen. Jeder
# Eintrag: (Erkennungsmuster, Bedingung, Begruendung).
BEHAUPTUNGEN = (
    (("kein tiefer", "nichts uebersehen", "keine uebersehen", "nicht uebersehen",
      "kein befund uebersehen", "alle tiefen"),
     lambda m: m["FN"] == 0 and m.get("grenzfall", 0) == 0,
     "FN ist die Zahl der uebersehenen tiefen Befunde; ein Grenzfall ist "
     "nicht eingeteilt und kann deshalb auch nicht als 'nicht uebersehen' "
     "gelten"),
    (("kein fehlalarm", "keine fehlalarme", "keine falsch positiven"),
     lambda m: m["FP"] == 0,
     "FP ist die Zahl der Fehlalarme"),
    (("fehlerfrei", "perfekt", "100 %", "100%"),
     lambda m: m["FN"] == 0 and m["FP"] == 0 and m.get("grenzfall", 0) == 0,
     "FP und FN muessen beide 0 sein, und es darf kein Grenzfall offen sein"),
)


def pruefe_behauptung(text, m):
    """Gibt (haltbar, Begruendung) zurueck. Unbekannte Saetze: None."""
    t = text.strip().lower()
    for muster, bedingung, grund in BEHAUPTUNGEN:
        if any(s in t for s in muster):
            if bedingung(m):
                return True, f"deckt sich mit den Zahlen ({grund})"
            return False, (f"WIDERSPRUCH: {grund} — "
                           f"TP={m['TP']} FP={m['FP']} TN={m['TN']} FN={m['FN']} "
                           f"Grenzfall={m.get('grenzfall', 0)}")
    return None, "kein bekanntes Muster — nicht geprueft, also auch nicht bestaetigt"


# ── Ausgabe ───────────────────────────────────────────────────────────────

def zeige_matrix(titel, m, tiefgrenze, schwelle, herkunft=HERKUNFT_FREI):
    print(f"\n── {titel} ──")
    print(f"  Kontrastschwelle   {schwelle:g}  (Vorhersage 'tief' ab kontrast >= schwelle)")
    zusatz = f" ({VORGABE_TEXT})" if herkunft == HERKUNFT_VORGABE else ""
    print(f"  Tiefgrenze         {tiefgrenze:g} um  — Herkunft: {herkunft}{zusatz}")
    if herkunft != HERKUNFT_VORGABE and tiefgrenze == VORGABE_TIEFGRENZE_UM:
        print("                     Hinweis: dieselbe Zahl wie die belegte "
              "Grenze; als Wert eingegeben, nicht als Quelle benannt.")
    print(f"  Grenzoperator      {GRENZOPERATOR} (Vorgabe) — "
          f"{tiefgrenze:g} um selbst gilt bereits als tief")
    print(f"  TP {m['TP']}   FP {m['FP']}   TN {m['TN']}   FN {m['FN']}")
    if m.get("grenzfall"):
        print(f"  Grenzfall (nicht eingeteilt): {m['grenzfall']} "
              "— Messwert auf der Grenze oder Unsicherheitsintervall "
              "ueberlappt sie")
    if m.get("ohne_methode"):
        print(f"  ohne benanntes Messmittel eingeteilt: {m['ohne_methode']} "
              "— die Herkunft dieser Tiefen ist nicht dokumentiert")
    if m.get("ohne_unsicherheit"):
        print(f"  ohne angegebene Messunsicherheit eingeteilt: "
              f"{m['ohne_unsicherheit']} — ein ueberlappendes Intervall "
              "koennte hier unentdeckt bleiben")
    if m.get("tiefe_nicht_gemessen"):
        print(f"  Referenztiefe nicht gemessen: {m['tiefe_nicht_gemessen']} "
              "(NICHT als 0 gewertet, nicht in der Matrix)")
    if m.get("kontrast_nicht_gemessen"):
        print(f"  Kontrast nicht gemessen: {m['kontrast_nicht_gemessen']} "
              "(NICHT als 0 gewertet, nicht in der Matrix)")
    for name, wert in kennzahlen(m).items():
        print(f"  {name:<12} {NICHT_BERECHENBAR if wert is None else f'{wert:.3f}'}")
    if m["FN"] > 0:
        print(f"  HINWEIS: {m['FN']} tiefe Befunde wurden uebersehen. "
              "Die Aussage 'kein tiefer Kratzer uebersehen' waere falsch.")
    if m.get("grenzfall"):
        print(f"  HINWEIS: {m['grenzfall']} Befunde blieben unentschieden. "
              "Aussagen ueber Vollstaendigkeit tragen erst, wenn der "
              "Grenzoperator geklaert und die Unsicherheit kleiner ist.")


def zeige_kontinuierlich(titel, zeilen):
    """Auswertung OHNE Klassengrenze.

    Sie braucht keine Tiefgrenze und trifft keine Einteilung. Sie sagt,
    wie viele Paare vorliegen, wie sie streuen und ob Kontrast und Tiefe
    miteinander steigen.

    BEWUSST KEINE Ausgleichsgerade: eine Geradengleichung liest sich wie
    eine Umrechnung von Kontrast in Mikrometer. Genau die gibt es nicht,
    und sie soll auch nicht so aussehen.
    """
    paare = []
    tiefe_nicht_gemessen = 0
    kontrast_nicht_gemessen = 0
    for z in zeilen:
        k = zahl_oder_none(z.get("kontrast"))
        t = zahl_oder_none(z.get("tiefe_um"))
        if t is None:
            tiefe_nicht_gemessen += 1
            continue
        if k is None:
            kontrast_nicht_gemessen += 1
            continue
        paare.append((k, t))

    print(f"\n── Kontinuierliche Auswertung — {titel} ──")
    print(f"  Zeilen gesamt                 {len(zeilen)}")
    print(f"  vollstaendige Paare           {len(paare)}")
    print(f"  Referenztiefe nicht gemessen  {tiefe_nicht_gemessen}")
    print(f"  Kontrast nicht gemessen       {kontrast_nicht_gemessen}")

    # Die Wertebereiche stehen ueber ALLEN gemessenen Werten, nicht nur
    # ueber den vollstaendigen Paaren: Kontraste werden erfasst, bevor die
    # Tiefen vorliegen. Sonst meldete das Werkzeug "nicht berechenbar" fuer
    # Zahlen, die es gerade gelesen hat.
    alle_k = [zahl_oder_none(z.get("kontrast")) for z in zeilen]
    alle_t = [zahl_oder_none(z.get("tiefe_um")) for z in zeilen]
    sk = spanne([x for x in alle_k if x is not None])
    st = spanne([x for x in alle_t if x is not None])
    print(f"  Kontrast von/bis              "
          f"{'nicht gemessen' if sk is None else f'{sk[0]:g} … {sk[1]:g}'}")
    print(f"  Tiefe von/bis (um)            "
          f"{'nicht gemessen' if st is None else f'{st[0]:g} … {st[1]:g}'}")

    r, grund_r = pearson(paare)
    rho, grund_s = spearman(paare)
    print(f"  Pearson r                     "
          f"{grund_r if r is None else f'{r:.4f}'}")
    print(f"  Spearman rho                  "
          f"{grund_s if rho is None else f'{rho:.4f}'}")
    if r is not None:
        print("  Keine Ausgleichsgerade und keine Umrechnung in Mikrometer: "
              "aus Kontrast folgt keine Tiefe.")
    return {
        "paare": len(paare),
        "tiefe_nicht_gemessen": tiefe_nicht_gemessen,
        "kontrast_nicht_gemessen": kontrast_nicht_gemessen,
        "r": r, "rho": rho,
    }


# ── Hauptprogramm ─────────────────────────────────────────────────────────

def main(argv=None):
    p = argparse.ArgumentParser(
        description="Auswertung Kontrast gegen Riefentiefe (Messwerkzeug, keine App-Schwelle)")
    p.add_argument("--daten", nargs="+", help="Kandidatentabelle(n) als CSV")
    p.add_argument("--referenz", help="Referenzbefunde, unabhaengig vom Detektor erfasst")
    p.add_argument("--kandidaten", help="Detektorkandidaten fuer den Gesamtweg")
    p.add_argument("--schwelle", type=float, help="Kontrastschwelle")
    p.add_argument("--tiefgrenze",
                   help="Tiefe in um, ab der ein Befund als 'tief' gilt. "
                        f"'vorgabe' setzt die belegte Grenze "
                        f"{VORGABE_TIEFGRENZE_UM:g} um "
                        f"({VORGABE_TEXT}). Eine Zahl gilt als frei "
                        "gewaehlt und wird so ausgewiesen.")
    p.add_argument("--gruppen-pruefen", nargs="+", metavar="CSV",
                   help="prueft, ob dieselbe teil_id in mehreren Dateien steht")
    p.add_argument("--behauptung", help="Satz, der gegen die Zahlen geprueft wird")
    p.add_argument("--gepoolt", action="store_true",
                   help="Riefen und Krater zusammen auswerten (nur mit Warnung)")
    a = p.parse_args(argv)

    print("VisuClean · Werkbank — Kontrast gegen Riefentiefe")
    print("Messwerkzeug. Keine App-Schwelle, keine Tiefenangabe aus Kontrast.")

    try:
        tiefgrenze, herkunft = lies_tiefgrenze(a.tiefgrenze)
        if a.gruppen_pruefen:
            mengen, doppelt = gruppen_ueberschneidung(a.gruppen_pruefen)
            print("\n── Gruppentrennung ──")
            for pfad, teile in mengen.items():
                print(f"  {pfad}: {len(teile)} Teile")
            if doppelt:
                for (x, y), gemeinsam in doppelt.items():
                    print(f"  UEBERSCHNEIDUNG {x} / {y}: {', '.join(gemeinsam)}")
                print("  Mehrere Aufnahmen desselben Teils gehoeren in DIESELBE "
                      "Gruppe. Die Testzahl waere sonst geschoent.")
                return 2
            print("  keine Ueberschneidung")
            if not (a.daten or a.referenz):
                return 0

        if a.referenz or a.kandidaten:
            if not (a.referenz and a.kandidaten):
                raise Datenfehler("--referenz und --kandidaten gehoeren zusammen")
            if a.schwelle is None or tiefgrenze is None:
                raise Datenfehler(
                    "--schwelle und --tiefgrenze sind fuer den Gesamtweg "
                    "zwingend: er teilt in 'tief' und 'nicht tief' ein und "
                    "zaehlt uebersehene tiefe Befunde. Ohne Klassengrenze "
                    "gibt es nichts zu zaehlen.")
            kopf_r, ref = lies_tabelle(a.referenz)
            pruefe_kopf(kopf_r, ("befund_id", "tiefe_um", "referenz_quelle"), a.referenz)
            kopf_k, kand = lies_tabelle(a.kandidaten)
            pruefe_kopf(kopf_k, ("befund_id", "kontrast"), a.kandidaten)
            m, uebersehen = gesamtweg(ref, kand, a.schwelle, tiefgrenze)
            zeige_matrix("Gesamtweg: Foto bis angezeigter Befund", m,
                         tiefgrenze, a.schwelle, herkunft)
            if uebersehen:
                print(f"  uebersehene tiefe Befunde: {', '.join(uebersehen)}")
            if a.behauptung:
                haltbar, grund = pruefe_behauptung(a.behauptung, m)
                print(f"\n── Behauptung ──\n  \"{a.behauptung}\"\n  {grund}")
                if haltbar is False:
                    return 2
            return 0

        if not a.daten:
            raise Datenfehler("Nichts zu tun: --daten, --referenz/--kandidaten "
                              "oder --gruppen-pruefen angeben")
        # Die Tiefgrenze ist NUR fuer die Einteilung "tief / nicht tief"
        # noetig — und dort zwingend. Fuer das blosse Erfassen von
        # Kontrastwerten und fuer die kontinuierliche Auswertung
        # (Korrelation, Wertebereiche) wird sie nicht gebraucht, und eine
        # erfundene Voreinstellung waere schlimmer als keine.
        if a.schwelle is not None and tiefgrenze is None:
            raise Datenfehler(
                "--schwelle ohne --tiefgrenze: eine Konfusionsmatrix verlangt "
                "die Klassengrenze. Ab welcher Tiefe ein Befund als 'tief' "
                "gilt, ist eine fachliche Festlegung und keine Voreinstellung. "
                "Ohne beides laeuft die kontinuierliche Auswertung.")

        alle = []
        for pfad in a.daten:
            kopf, zeilen = lies_tabelle(pfad)
            pruefe_kopf(kopf, PFLICHT_MINIMAL, pfad)
            print(f"\n  gelesen: {pfad} — {len(zeilen)} Zeilen")
            alle.extend(zeilen)

        gruppen = {}
        for z in alle:
            gruppen.setdefault(befundart(z), []).append(z)

        # Kopfzeile ohne Datenzeilen: SCHWEIGEN waere hier der Fehler. Ein
        # Lauf ohne Ausgabe liest sich wie "nichts zu beanstanden", und
        # genau das steht nicht in den Daten. Befund aus dem eigenen
        # Verhaltenstest, nicht aus dem Kopf.
        if not gruppen:
            print("\n════ Keine Datenzeilen ════")
            leer = leere_matrix()
            zeige_kontinuierlich("(keine Daten)", [])
            if a.schwelle is not None and tiefgrenze is not None:
                zeige_matrix("Kandidatenbewertung — (keine Daten)", leer,
                             tiefgrenze, a.schwelle, herkunft)
            print("\n  Die Tabelle hat eine Kopfzeile, aber keine Zeilen. "
                  "Es gibt nichts zu rechnen — das ist kein Ergebnis.")
            return 0

        if a.gepoolt:
            print("\n  WARNUNG: Riefen und Krater werden zusammen ausgewertet. "
                  "Ein Ergebnis fuer Riefen belegt nichts ueber Krater.")
            gruppen = {"GEPOOLT": alle}

        gesamt = None
        for art in sorted(gruppen):
            zeilen = gruppen[art]
            print(f"\n════ Befundart {art} — {len(zeilen)} Zeilen ════")
            zeige_kontinuierlich(art, zeilen)
            if a.schwelle is None:
                print("\n  Keine --schwelle angegeben: keine Konfusionsmatrix. "
                      "Die kontinuierliche Auswertung oben braucht keine "
                      "Klassengrenze.")
                continue
            m = konfusion(zeilen, a.schwelle, tiefgrenze)
            zeige_matrix(f"Kandidatenbewertung — {art}", m, tiefgrenze, a.schwelle, herkunft)
            gesamt = m

        if a.behauptung:
            if gesamt is None:
                print("\n── Behauptung ──\n  ohne Konfusionsmatrix nicht pruefbar")
                return 2
            haltbar, grund = pruefe_behauptung(a.behauptung, gesamt)
            print(f"\n── Behauptung ──\n  \"{a.behauptung}\"\n  {grund}")
            if haltbar is False:
                return 2

        if a.schwelle is None:
            print("\nGrenze: ohne Klassengrenze wurde nichts eingeteilt. Die "
                  "Zahlen oben beschreiben die Daten, sie bewerten keinen "
                  "Detektor.")
        else:
            print("\nGrenze: dieser Lauf sagt nichts ueber die Tauglichkeit der "
                  "Schwelle an realen Teilen. Dafuer fehlen Aufnahmen mit "
                  "unabhaengig gemessener Tiefe.")
        return 0

    except Datenfehler as fehler:
        print(f"\nFEHLER: {fehler}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
