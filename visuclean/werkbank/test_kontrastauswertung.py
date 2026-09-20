#!/usr/bin/env python3
"""
VisuClean · Werkbank — Verhaltenstests der Kontrastauswertung
=============================================================

Aufruf:  python3 -m unittest discover -s werkbank -p "test_*.py" -v
   oder:  python3 werkbank/test_kontrastauswertung.py

Nur Standardbibliothek.

WAS HIER GEPRUEFT WIRD, UND WARUM GENAU DAS

Die gefaehrlichen Fehler eines Auswerteskripts sind nicht Abstuerze — die
faellt jeder sofort auf. Gefaehrlich ist, wenn es eine Zahl ausgibt, die
gut aussieht und nichts bedeutet:

  * ein fehlender Wert, der als 0 durchgeht;
  * eine Korrelation aus zwei Punkten (immer r = ±1);
  * eine Kennzahl mit leerem Nenner, ausgegeben als 0;
  * eine uebersehene Riefe, die keine Zeile erzeugt und deshalb nicht
    gezaehlt wird;
  * dasselbe Teil in Entwicklungs- und Testdaten;
  * ein Satz im Bericht, der den eigenen Zahlen widerspricht.

Jeder dieser Faelle hat hier eine eigene Pruefung.
"""

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kontrastauswertung as ka  # noqa: E402

BEISPIELE = Path(__file__).resolve().parent / "beispieldaten"


def lauf(argv):
    """Skript aufrufen und (Exitcode, Ausgabe) zurueckgeben."""
    puffer = io.StringIO()
    with redirect_stdout(puffer), redirect_stderr(puffer):
        code = ka.main(argv)
    return code, puffer.getvalue()


class FehlendIstNichtNull(unittest.TestCase):
    """Der wichtigste Vertrag: ein nicht gemessener Wert ist keine Null."""

    def test_leere_und_unsinnige_werte_werden_none(self):
        for roh in ["", "   ", "-", "NA", "n/a", "NULL", "None", "nan",
                    "keine", "abc", None]:
            self.assertIsNone(ka.zahl_oder_none(roh), f"{roh!r} muesste None sein")

    def test_echte_null_bleibt_null(self):
        self.assertEqual(ka.zahl_oder_none("0"), 0.0)
        self.assertEqual(ka.zahl_oder_none("0.0"), 0.0)
        self.assertEqual(ka.zahl_oder_none("0,0"), 0.0, "Komma als Dezimaltrenner")

    def test_unendlich_wird_abgewiesen(self):
        self.assertIsNone(ka.zahl_oder_none("inf"))
        self.assertIsNone(ka.zahl_oder_none("-Infinity"))

    def test_unvollstaendige_zeilen_stehen_ausserhalb_der_matrix(self):
        zeilen = [
            {"kontrast": "20", "tiefe_um": "2.0"},    # TP
            {"kontrast": "", "tiefe_um": "2.0"},      # unvollstaendig
            {"kontrast": "20", "tiefe_um": ""},       # unvollstaendig
        ]
        m = ka.konfusion(zeilen, schwelle=17.0, tiefgrenze=1.0)
        self.assertEqual((m["TP"], m["FP"], m["TN"], m["FN"]), (1, 0, 0, 0))
        # Getrennt gezaehlt: eine fehlende REFERENZTIEFE ist etwas anderes
        # als ein fehlender Messwert. Ein gemeinsamer Topf haette verdeckt,
        # ob die Messung oder die Referenz fehlt.
        self.assertEqual(m["kontrast_nicht_gemessen"], 1)
        self.assertEqual(m["tiefe_nicht_gemessen"], 1)


class KorrelationNurAusDaten(unittest.TestCase):
    """r wird gerechnet, nie gesetzt — und bei duenner Lage verweigert."""

    def test_zwei_punkte_sind_keine_korrelation(self):
        r, grund = ka.pearson([(1.0, 1.0), (2.0, 2.0)])
        self.assertIsNone(r)
        self.assertIn(ka.NICHT_BERECHENBAR, grund)

    def test_ohne_streuung_nicht_definiert(self):
        r, grund = ka.pearson([(5.0, 1.0), (5.0, 2.0), (5.0, 3.0)])
        self.assertIsNone(r, "konstanter Kontrast hat keine Korrelation, auch nicht 0")
        self.assertIn("Streuung", grund)

    def test_bekanntes_ergebnis(self):
        # Exakt linear: r = 1.
        paare = [(1.0, 2.0), (2.0, 4.0), (3.0, 6.0), (4.0, 8.0)]
        r, grund = ka.pearson(paare)
        self.assertIsNone(grund)
        self.assertAlmostEqual(r, 1.0, places=12)
        # Exakt gegenlaeufig: r = -1.
        r2, _ = ka.pearson([(1.0, 8.0), (2.0, 6.0), (3.0, 4.0), (4.0, 2.0)])
        self.assertAlmostEqual(r2, -1.0, places=12)

    def test_dummy_korrelation_taucht_nicht_als_ergebnis_auf(self):
        """0,93 aus dem Auftrag ist eine Annahme, kein Messergebnis.

        Wenn irgendwo im Skript 0.93 als Konstante staende, wuerde sie hier
        in der Ausgabe der Beispieldaten auftauchen."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn("Pearson r", ausgabe)
        self.assertNotIn("0.9300", ausgabe)
        self.assertNotIn("Pearson r                     0.93", ausgabe)


class KennzahlenOhneStillesNull(unittest.TestCase):

    def test_leerer_nenner_ist_nicht_berechenbar(self):
        m = {"TP": 0, "FP": 0, "TN": 0, "FN": 0,
             "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0}
        k = ka.kennzahlen(m)
        for name, wert in k.items():
            self.assertIsNone(wert, f"{name} muesste 'nicht berechenbar' sein, nicht 0")

    def test_ausgabe_schreibt_nicht_berechenbar(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "leer.csv"
            p.write_text("id,kontrast,tiefe_um\n", encoding="utf-8")
            code, ausgabe = lauf(["--daten", str(p), "--schwelle", "17.0",
                                  "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn(ka.NICHT_BERECHENBAR, ausgabe)
        self.assertNotIn("Precision    0.000", ausgabe)

    def test_dummy_zahlen_werden_reproduziert(self):
        """TP=146 FP=5 TN=43 FN=6 -> Precision 0,967 / Recall 0,961."""
        m = {"TP": 146, "FP": 5, "TN": 43, "FN": 6,
             "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0}
        k = ka.kennzahlen(m)
        self.assertAlmostEqual(round(k["Precision"], 3), 0.967)
        self.assertAlmostEqual(round(k["Recall"], 3), 0.961)

    def test_beispieldatei_ergibt_dieselbe_matrix(self):
        """TP 146 / FP 5 / TN 43 / FN 6 — mit dem geklaerten Operator.

        Drei Zeilen liegen mit 1,00 um genau auf der Grenze. Sie zaehlen
        als tief, weil die Vorgabe "< 1,0" sagt: 1,000 ist nicht mehr
        zulaessig. Waere der Operator "<=", stuenden hier TP 143.

        Diese drei Zeilen sind der Grund, warum der Operator im Code steht
        und nicht in einem Vergleichszeichen verschwindet.
        """
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "vorgabe"])
        self.assertEqual(code, 0)
        self.assertIn("TP 146   FP 5   TN 43   FN 6", ausgabe)
        self.assertIn("Precision    0.967", ausgabe)
        self.assertIn("Recall       0.961", ausgabe)
        self.assertIn("Grenzoperator      <", ausgabe)


class FehlerhafteEingaben(unittest.TestCase):

    def test_fehlende_datei(self):
        code, ausgabe = lauf(["--daten", "/gibt/es/nicht.csv",
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 1)
        self.assertIn("nicht gefunden", ausgabe)

    def test_leere_datei(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "fehler_leer.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 1)
        self.assertIn("Kopfzeile", ausgabe)

    def test_fehlende_pflichtspalte_wird_benannt(self):
        """Ohne `kontrast` gibt es nichts zu messen — das wird abgewiesen."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "fehler_ohne_kontrast.csv")])
        self.assertEqual(code, 1)
        self.assertIn("kontrast", ausgabe, "die fehlende Spalte muss benannt werden")

    def test_fehlende_tiefenspalte_ist_kein_fehler_mehr(self):
        """`tiefe_um` darf fehlen: Kontraste werden erfasst, BEVOR die
        unabhaengige Tiefenmessung vorliegt. Die Zeilen gelten dann als
        "Referenztiefe nicht gemessen" — nicht als flach und nicht als 0."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "fehler_spalte_fehlt.csv")])
        self.assertEqual(code, 0)
        self.assertIn("Referenztiefe nicht gemessen  1", ausgabe)

    def test_tiefgrenze_ist_pflicht_fuer_die_einteilung(self):
        """Ab welcher Tiefe ein Befund 'tief' heisst, ist eine Festlegung.

        Eine Voreinstellung waere eine erfundene Schwelle. Verlangt wird
        sie aber NUR dort, wo eingeteilt wird."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0"])
        self.assertEqual(code, 1)
        self.assertIn("tiefgrenze", ausgabe.lower())

    def test_kaputte_werte_landen_im_zaehler_nicht_in_der_matrix(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "fehler_werte.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        # Zwei Zeilen ohne Tiefe, zwei ohne Kontrast — getrennt ausgewiesen.
        self.assertIn("Referenztiefe nicht gemessen  2", ausgabe)
        self.assertIn("Kontrast nicht gemessen       2", ausgabe)

    def test_referenz_ohne_kandidaten_wird_abgewiesen(self):
        code, ausgabe = lauf(["--referenz", str(BEISPIELE / "dummy_referenz.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 1)
        self.assertIn("gehoeren zusammen", ausgabe)


class GesamtwegZaehltUebersehene(unittest.TestCase):
    """Der Kern von Punkt 5: was nie gefunden wurde, hat keine Zeile."""

    def test_uebersehene_riefe_ohne_kandidatenzeile_ist_ein_fehler(self):
        code, ausgabe = lauf([
            "--referenz", str(BEISPIELE / "dummy_referenz.csv"),
            "--kandidaten", str(BEISPIELE / "dummy_kandidaten_gesamtweg.csv"),
            "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn("FN 1", ausgabe)
        self.assertIn("F003", ausgabe, "die uebersehene tiefe Riefe muss benannt werden")

    def test_kandidatenbewertung_und_gesamtweg_unterscheiden_sich(self):
        """Wer nur Kandidaten bewertet, bekommt eine bessere Zahl.

        Genau deshalb muessen beide Ergebnisse getrennt berichtet werden."""
        nur_kandidaten = ka.konfusion(
            ka.lies_tabelle(BEISPIELE / "dummy_kandidaten_gesamtweg.csv")[1],
            schwelle=17.0, tiefgrenze=1.0)
        # Ohne tiefe_um-Spalte ist in der Kandidatendatei nichts bewertbar:
        self.assertEqual(nur_kandidaten["TP"] + nur_kandidaten["FN"], 0)
        ref = ka.lies_tabelle(BEISPIELE / "dummy_referenz.csv")[1]
        kand = ka.lies_tabelle(BEISPIELE / "dummy_kandidaten_gesamtweg.csv")[1]
        m, uebersehen = ka.gesamtweg(ref, kand, 17.0, 1.0)
        self.assertGreater(m["FN"], 0)
        self.assertIn("F003", uebersehen)

    def test_referenz_vom_detektor_wird_abgewiesen(self):
        ref = [{"befund_id": "F1", "tiefe_um": "2.0", "referenz_quelle": "DETEKTOR"}]
        with self.assertRaises(ka.Datenfehler) as fehler:
            ka.gesamtweg(ref, [], 17.0, 1.0)
        self.assertIn("Detektor", str(fehler.exception))


class Gruppentrennung(unittest.TestCase):

    def test_dasselbe_teil_in_beiden_dateien_faellt_auf(self):
        code, ausgabe = lauf(["--gruppen-pruefen",
                              str(BEISPIELE / "dummy_entwicklung.csv"),
                              str(BEISPIELE / "dummy_test.csv")])
        self.assertEqual(code, 2)
        self.assertIn("UEBERSCHNEIDUNG", ausgabe)
        self.assertIn("T-101", ausgabe)

    def test_ohne_teil_id_keine_stille_freigabe(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "ohne.csv"
            p.write_text("id,kontrast\nK1,20\n", encoding="utf-8")
            code, ausgabe = lauf(["--gruppen-pruefen", str(p)])
        self.assertEqual(code, 1)
        self.assertIn("teil_id", ausgabe)


class BefundartenGetrennt(unittest.TestCase):
    """Ein Ergebnis fuer Riefen belegt nichts ueber Krater."""

    def test_riefen_und_krater_werden_getrennt_ausgewiesen(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "gemischt.csv"
            p.write_text(
                "id,befundart,kontrast,tiefe_um\n"
                "K1,RIEFE,20,2.0\nK2,RIEFE,5,0.2\nK3,RIEFE,21,2.1\n"
                "K4,KRATER,20,0.2\nK5,KRATER,4,2.0\nK6,KRATER,22,0.3\n",
                encoding="utf-8")
            code, ausgabe = lauf(["--daten", str(p), "--schwelle", "17.0",
                                  "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn("Befundart RIEFE", ausgabe)
        self.assertIn("Befundart KRATER", ausgabe)

    def test_poolen_nur_mit_warnung(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0",
                              "--gepoolt"])
        self.assertEqual(code, 0)
        self.assertIn("WARNUNG", ausgabe)
        self.assertIn("belegt nichts ueber Krater", ausgabe)


class WiderspruechlicheAussagen(unittest.TestCase):
    """Ein Bericht darf seinen eigenen Zahlen nicht widersprechen."""

    MATRIX = {"TP": 146, "FP": 5, "TN": 43, "FN": 6,
              "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0}

    def test_kein_tiefer_kratzer_uebersehen_ist_bei_fn_falsch(self):
        haltbar, grund = ka.pruefe_behauptung("kein tiefer Kratzer uebersehen", self.MATRIX)
        self.assertFalse(haltbar)
        self.assertIn("WIDERSPRUCH", grund)
        self.assertIn("FN=6", grund)

    def test_derselbe_satz_ist_bei_fn_null_haltbar(self):
        ohne = dict(self.MATRIX, FN=0)
        haltbar, _ = ka.pruefe_behauptung("kein tiefer Kratzer uebersehen", ohne)
        self.assertTrue(haltbar)

    def test_fehlalarmfreiheit_wird_getrennt_geprueft(self):
        haltbar, grund = ka.pruefe_behauptung("keine Fehlalarme", self.MATRIX)
        self.assertFalse(haltbar)
        self.assertIn("FP", grund)

    def test_unbekannter_satz_wird_nicht_bestaetigt(self):
        haltbar, grund = ka.pruefe_behauptung("die Kamera war sauber", self.MATRIX)
        self.assertIsNone(haltbar, "ein ungeprueftes Muster darf nicht als wahr gelten")
        self.assertIn("nicht geprueft", grund)

    def test_skript_bricht_bei_widerspruch_ab(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0",
                              "--behauptung", "kein tiefer Kratzer uebersehen"])
        self.assertEqual(code, 2, "ein Widerspruch muss den Lauf scheitern lassen")
        self.assertIn("WIDERSPRUCH", ausgabe)


class OhneTiefgrenze(unittest.TestCase):
    """Die Tiefgrenze ist NUR fuer die Einteilung noetig.

    Der Auftraggeber kann derzeit keine fachlich begruendete Tiefgrenze
    nennen — und eine zu erfinden waere schlimmer als keine zu haben.
    Erfassen und kontinuierlich auswerten muss deshalb ohne sie gehen.
    """

    def test_kontrast_ohne_tiefenspalte_wird_erfasst(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_nur_kontrast.csv")])
        self.assertEqual(code, 0)
        self.assertIn("Kontrast von/bis              51.6 … 92.6", ausgabe)
        self.assertIn("Referenztiefe nicht gemessen  3", ausgabe)
        self.assertIn("Tiefe von/bis (um)            nicht gemessen", ausgabe)

    def test_kontinuierliche_auswertung_ohne_klassengrenze(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv")])
        self.assertEqual(code, 0)
        self.assertIn("Kontinuierliche Auswertung", ausgabe)
        self.assertIn("Pearson r", ausgabe)
        self.assertIn("Spearman rho", ausgabe)
        self.assertNotIn("TP ", ausgabe, "ohne Klassengrenze wird nichts eingeteilt")

    def test_keine_umrechnung_in_mikrometer(self):
        """Eine Ausgleichsgerade laese sich als Umrechnung lesen.

        Aus Kontrast folgt keine Tiefe — also darf auch keine Formel
        dastehen, die so aussieht."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv")])
        self.assertEqual(code, 0)
        for verboten in ["Steigung", "Achsenabschnitt", "Regression", "y = ", "um ="]:
            self.assertNotIn(verboten, ausgabe)
        self.assertIn("aus Kontrast folgt keine Tiefe", ausgabe)

    def test_schwelle_ohne_tiefgrenze_wird_abgewiesen(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--schwelle", "17.0"])
        self.assertEqual(code, 1)
        self.assertIn("Klassengrenze", ausgabe)

    def test_spearman_kennt_bindungen(self):
        """Gleiche Werte bekommen den mittleren Rang.

        Sonst haengt das Ergebnis von der Zeilenreihenfolge in der Datei
        ab — und zwei Laeufe ueber dieselben Daten gaeben verschiedene
        Zahlen."""
        a = [(1.0, 1.0), (2.0, 2.0), (2.0, 3.0), (3.0, 4.0)]
        b = [(2.0, 3.0), (1.0, 1.0), (3.0, 4.0), (2.0, 2.0)]
        rho_a, _ = ka.spearman(a)
        rho_b, _ = ka.spearman(b)
        self.assertIsNotNone(rho_a)
        self.assertAlmostEqual(rho_a, rho_b, places=12)

    def test_spearman_erkennt_monotonen_nichtlinearen_zusammenhang(self):
        """Genau dafuer steht sie neben Pearson."""
        paare = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0), (4.0, 16.0), (5.0, 25.0)]
        rho, _ = ka.spearman(paare)
        r, _ = ka.pearson(paare)
        self.assertAlmostEqual(rho, 1.0, places=12)
        self.assertLess(r, 1.0, "Pearson sieht die Kruemmung, Spearman nicht")


class NichtGemessenIstEigeneKategorie(unittest.TestCase):
    """Fehlende Referenztiefen werden ausdruecklich so gefuehrt."""

    def test_fehlende_tiefe_und_fehlender_kontrast_getrennt(self):
        zeilen = [
            {"kontrast": "20", "tiefe_um": "2.0"},
            {"kontrast": "20", "tiefe_um": ""},
            {"kontrast": "20"},
            {"kontrast": "", "tiefe_um": "2.0"},
        ]
        m = ka.konfusion(zeilen, schwelle=17.0, tiefgrenze=1.0)
        self.assertEqual(m["tiefe_nicht_gemessen"], 2, "fehlend UND Spalte fehlt")
        self.assertEqual(m["kontrast_nicht_gemessen"], 1)
        self.assertEqual(m["TP"], 1)

    def test_wortlaut_nicht_gemessen_steht_in_der_ausgabe(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "fehler_werte.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn("nicht gemessen", ausgabe)
        self.assertNotIn("unvollstaendige Zeilen", ausgabe,
                         "der alte Sammelbegriff verdeckte, was genau fehlt")


class VorgabegrenzeIstBelegt(unittest.TestCase):
    """1,0 um stammt aus der Vorgabe, nicht aus dem Werkzeug.

    Der Unterschied zu jeder anderen Zahl in diesem Projekt: sie ist von
    aussen belegt. Genau deshalb muss jede Ausgabe sagen, ob die verwendete
    Grenze DIESE ist oder eine frei gewaehlte — sonst liest sich ein
    Probelauf mit 5 um spaeter wie eine Pruefung gegen die Vorgabe.
    """

    def test_grenze_ist_ein_komma_null_mikrometer(self):
        self.assertEqual(ka.VORGABE_TIEFGRENZE_UM, 1.0)

    def test_vorgabe_als_argument_setzt_die_belegte_grenze(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "vorgabe"])
        self.assertEqual(code, 0)
        self.assertIn("1 um", ausgabe)
        self.assertIn("VORGABE", ausgabe)

    def test_frei_gewaehlte_grenze_wird_als_solche_ausgewiesen(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "5.0"])
        self.assertEqual(code, 0)
        self.assertIn("frei gewaehlt", ausgabe)
        self.assertNotIn("VORGABE", ausgabe,
                         "eine frei gewaehlte Grenze darf nicht wie die "
                         "hinterlegte Vorgabe aussehen")

    def test_die_grenze_ist_keine_kontrastschwelle(self):
        """Die Trennlinie des Auftrags: Referenzgrenze ja, Bildschwelle nein."""
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--tiefgrenze", "vorgabe"])
        self.assertEqual(code, 0)
        self.assertIn("Keine --schwelle angegeben", ausgabe)
        self.assertNotIn("TP ", ausgabe)


class GrenzoperatorGeklaert(unittest.TestCase):
    """Die Vorgabe sagt "< 1,0 um" — 1,000 ist bereits tief.

    Der Operator gehoert zur Grenze. Solange er offen war, standen drei
    Zeilen der Dummy-Datei im Grenzfall; mit dem nachgereichten "<" zaehlen
    sie wieder als tief. Drei von 146 Treffern an einem Zeichen.
    """

    def test_genau_auf_der_grenze_mit_unsicherheit_bleibt_grenzfall(self):
        # 1,00 +/- 0,10 reicht von 0,90 bis 1,10 und schneidet die Grenze.
        self.assertEqual(ka.tiefenklasse(1.0, 1.0, 0.1), "GRENZFALL")

    def test_genau_auf_der_grenze_ohne_unsicherheit_ist_tief(self):
        self.assertEqual(ka.tiefenklasse(1.0, 1.0, None), "TIEF")
        self.assertEqual(ka.tiefenklasse(0.999, 1.0, None), "NICHT_TIEF")
        self.assertEqual(ka.tiefenklasse(1.001, 1.0, None), "TIEF")

    def test_intervall_ueberlappt_die_grenze(self):
        # 1,20 +/- 0,30 reicht bis 0,90 — der Befund kann unter der Grenze
        # liegen. Eine Einteilung waere geraten.
        self.assertEqual(ka.tiefenklasse(1.2, 1.0, 0.3), "GRENZFALL")

    def test_klar_darueber_bleibt_tief(self):
        self.assertEqual(ka.tiefenklasse(2.0, 1.0, 0.1), "TIEF")

    def test_klar_darunter_bleibt_nicht_tief(self):
        self.assertEqual(ka.tiefenklasse(0.4, 1.0, 0.05), "NICHT_TIEF")

    def test_fehlende_unsicherheit_ist_nicht_null(self):
        """Ohne angegebene Unsicherheit wird eingeteilt, aber gekennzeichnet.

        Nicht verschweigen und nicht als +/- 0 lesen: das Werkzeug erfasst
        Daten, die es vor der unabhaengigen Messung schon gibt. Die
        Entscheidungsgrenze in der App ist strenger — dort fehlt ohne
        Unsicherheit die Entscheidung ganz.
        """
        self.assertEqual(ka.tiefenklasse(2.0, 1.0, None), "TIEF")
        self.assertIsNone(ka.tiefenklasse(None, 1.0, 0.1))


class GrenzfaelleStehenAusserhalbDerMatrix(unittest.TestCase):

    def test_zaehler_der_beispieldatei(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "vorgabe"])
        self.assertEqual(code, 0)
        # G1 TP, G2 TN, G3 und G4 Grenzfall, G5 TP (ohne Methode), G6 TP
        # (ohne Unsicherheit), G7 FN.
        self.assertIn("TP 3   FP 0   TN 1   FN 1", ausgabe)
        self.assertIn("Grenzfall (nicht eingeteilt): 2", ausgabe)

    def test_grenzfaelle_werden_nicht_als_negativ_verbucht(self):
        m = ka.konfusion(
            [{"kontrast": "20.0", "tiefe_um": "1.00",
              "tiefe_methode": "TASTSCHNITT", "tiefe_unsicherheit_um": "0.10"}],
            17.0, 1.0)
        self.assertEqual(m["grenzfall"], 1)
        self.assertEqual((m["TP"], m["FP"], m["TN"], m["FN"]), (0, 0, 0, 0))

    def test_tiefe_ohne_methode_wird_gezaehlt_und_benannt(self):
        """Das Werkzeug teilt ein und sagt, was fehlt.

        Die harte Grenze liegt nicht hier, sondern im Entscheidungspfad der
        App: dort gibt es ohne benanntes Messmittel keine Entscheidung
        (MEASUREMENT_INCOMPLETE, geprueft in tiefentest.mjs).
        """
        m = ka.konfusion(
            [{"kontrast": "30.0", "tiefe_um": "3.00",
              "tiefe_methode": "", "tiefe_unsicherheit_um": "0.10"}],
            17.0, 1.0)
        self.assertEqual(m["ohne_methode"], 1)
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "vorgabe"])
        self.assertIn("ohne benanntes Messmittel", ausgabe)

    def test_fehlende_unsicherheit_wird_gezaehlt_und_benannt(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_grenzfaelle.csv"),
                              "--schwelle", "17.0", "--tiefgrenze", "vorgabe"])
        self.assertIn("ohne angegebene Messunsicherheit", ausgabe)


class BehauptungKenntGrenzfaelle(unittest.TestCase):
    """FN = 0 belegt nichts, solange Grenzfaelle unentschieden sind.

    Die alte Pruefung sah nur auf FN. Mit Grenzfaellen entsteht genau die
    Luecke, die der urspruengliche Dummy-Fall vorgefuehrt hat: eine Aussage,
    die von den Zahlen scheinbar getragen wird und es nicht ist.
    """

    def test_nichts_uebersehen_ist_mit_grenzfaellen_nicht_haltbar(self):
        m = {"TP": 5, "FP": 0, "TN": 3, "FN": 0, "grenzfall": 2,
             "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0,
             "methode_fehlt": 0, "ohne_unsicherheit": 0}
        haltbar, grund = ka.pruefe_behauptung("kein tiefer Kratzer uebersehen", m)
        self.assertIs(haltbar, False)
        self.assertIn("Grenzfall", grund)

    def test_ohne_grenzfaelle_bleibt_der_satz_haltbar(self):
        m = {"TP": 5, "FP": 0, "TN": 3, "FN": 0, "grenzfall": 0,
             "tiefe_nicht_gemessen": 0, "kontrast_nicht_gemessen": 0,
             "methode_fehlt": 0, "ohne_unsicherheit": 0}
        haltbar, _ = ka.pruefe_behauptung("kein tiefer Kratzer uebersehen", m)
        self.assertIs(haltbar, True)


class KeineVersteckteAppSchwelle(unittest.TestCase):
    """17,0 ist ein Beispielwert, keine Voreinstellung."""

    def test_ohne_schwelle_keine_matrix(self):
        code, ausgabe = lauf(["--daten", str(BEISPIELE / "dummy_kandidaten.csv"),
                              "--tiefgrenze", "1.0"])
        self.assertEqual(code, 0)
        self.assertIn("Keine --schwelle angegeben", ausgabe)
        self.assertNotIn("TP ", ausgabe)

    def test_quelltext_enthaelt_keine_voreingestellte_schwelle(self):
        quelle = (Path(__file__).resolve().parent / "kontrastauswertung.py").read_text(
            encoding="utf-8")
        # Kommentare und Dokumentation entfernen, damit ein erklaerender
        # Text nicht faelschlich als Voreinstellung gilt (dieselbe Falle wie
        # bei A28 in assessmenttest.mjs).
        ohne_doku = []
        in_doku = False
        for zeile in quelle.splitlines():
            if zeile.strip().startswith('"""') or zeile.strip().startswith("'''"):
                in_doku = not in_doku
                continue
            if in_doku or zeile.strip().startswith("#"):
                continue
            ohne_doku.append(zeile.split("#")[0])
        code = "\n".join(ohne_doku)
        self.assertNotIn("default=17", code)
        self.assertNotIn("= 17.0", code)


if __name__ == "__main__":
    unittest.main(verbosity=2)
