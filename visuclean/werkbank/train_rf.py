#!/usr/bin/env python3
"""
VisuClean · Werkbank — Random-Forest-Training fuer das Kratzer-Screening
=======================================================================

WAS DAS IST UND WAS NICHT

Dieses Skript laeuft auf dem PC, nicht in der App. Es trainiert den Wald
aus gelabelten Merkmalstabellen und exportiert ihn als reines JSON, das
die Browser-App ohne scikit-learn auswerten kann.

Die App entscheidet weiterhin mit dem deterministischen Kern. Der Wald
SORTIERT nur die Verdachtsstellen um. Ein ungenauer Wald macht die Liste
schlechter sortiert — er kann kein Ergebnis falsch machen. Das ist der
Grund, warum er ohne formale Validierung ueberhaupt mitlaufen darf.

WARUM ER HEUTE NICHT TRAINIERT WERDEN KANN

Es gibt keine gelabelten Bilder und keine Ground Truth aus Tastschnitt-
oder Replika-Messung. Ein Wald, der auf den Ausgaben der eigenen
Regellogik trainiert, lernt die Regeln auswendig und sieht dabei gut aus,
ohne irgendetwas ueber die Wirklichkeit zu wissen. Das Skript weist
deshalb ausdruecklich zurueck, wenn die Labels aus der Regel stammen
(Spalte label_quelle == "REGEL").

ABLAUF

  1. In der App Merkmalstabellen exportieren (exportFeatureTable).
  2. Tabellen zusammenfuehren und von HAND labeln:
       label = 1  hohe Aufmerksamkeit (deutlich sichtbar)
       label = 0  niedrige Aufmerksamkeit (kaum sichtbar)
     KEINE Tiefenaussage - die ist aus einem Foto nicht messbar.
     Dazu label_quelle eintragen, z.B. "TASTSCHNITT" oder "SICHTPRUEFUNG".
  3. Trainieren:      python3 train_rf.py --daten labels.csv --modell modell.json
  4. modell.json in die App geben.

Der Merkmalsvertrag (Reihenfolge!) steht in src/scratchClassifier.js und
wird in das Modell geschrieben. Die App lehnt ein Modell mit abweichender
Reihenfolge ab, statt es still falsch auszuwerten.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

# Muss Zeichen fuer Zeichen zu FEATURE_ORDER in src/scratchClassifier.js passen.
FEATURE_ORDER = [
    "lengthRel",
    "widthRel",
    "elongation",
    "edgeStrength",
    "grindDeltaDeg",
    "relevanceScore",
]

# Labelquellen, die eine echte Beobachtung darstellen. Alles andere wird
# zurueckgewiesen — insbesondere "REGEL".
ZULAESSIGE_QUELLEN = {"TASTSCHNITT", "REPLIKA", "SICHTPRUEFUNG", "MIKROSKOP"}

# Trennzeichen der Messreihe. MUSS mit CSV_TRENNZEICHEN in
# werkbank/messreihe.mjs uebereinstimmen. In rc.4.19 schrieb die eine
# Seite Semikolon und die andere las den Komma-Standard - die gesamte
# Messkette war damit unbenutzbar, und die gruene Suite merkte es nicht,
# weil sie Quelltext las statt die Kette auszufuehren. SC-18 fuehrt sie
# jetzt aus. Semikolon, weil deutsche Tabellenkalkulationen es erwarten
# und Dezimalkommas sonst die Spalten zerreissen.
CSV_TRENNZEICHEN = ";"


def pruefe_spalten(feldnamen) -> None:
    """Prueft NUR den Spaltenvertrag zwischen Messreihe und Training.

    Bewusst getrennt von der Labelpruefung: eine frisch gemessene Tabelle
    ist noch NICHT gelabelt, das ist ihr Normalzustand. In rc.4.19 lagen
    beide Pruefungen zusammen, weshalb der Spaltencheck an leeren Labels
    scheiterte und damit nichts ueber die Kette aussagte.
    """
    felder = list(feldnamen or [])
    fehlend = [s for s in FEATURE_ORDER if s not in felder]
    if fehlend:
        raise SystemExit(f"FEHLER: Spalten fehlen: {', '.join(fehlend)}")
    if "label" not in felder:
        raise SystemExit("FEHLER: Spalte 'label' fehlt.")
    if "label_quelle" not in felder:
        raise SystemExit(
            "FEHLER: Spalte 'label_quelle' fehlt. Ohne Herkunft des Labels "
            "ist nicht pruefbar, ob der Wald auf Beobachtung oder auf der "
            "eigenen Regel trainiert."
        )


def lade_daten(pfad: Path):
    """Liest die gelabelte Tabelle und prueft sie streng."""
    zeilen, labels, quellen = [], [], []
    with pfad.open(newline="", encoding="utf-8") as fh:
        leser = csv.DictReader(fh, delimiter=CSV_TRENNZEICHEN)
        pruefe_spalten(leser.fieldnames)
        for nr, zeile in enumerate(leser, start=2):
            quelle = (zeile.get("label_quelle") or "").strip().upper()
            if quelle == "REGEL":
                raise SystemExit(
                    f"ABBRUCH in Zeile {nr}: label_quelle 'REGEL'.\n"
                    "Ein Wald, der auf den Ausgaben der eigenen Regellogik "
                    "trainiert, lernt die Regel, nicht die Wirklichkeit.\n"
                    "Es braucht beobachtete Labels."
                )
            if quelle not in ZULAESSIGE_QUELLEN:
                raise SystemExit(
                    f"ABBRUCH in Zeile {nr}: label_quelle '{quelle}' unbekannt.\n"
                    f"Zulaessig: {', '.join(sorted(ZULAESSIGE_QUELLEN))}"
                )
            try:
                zeilen.append([float(zeile[s]) for s in FEATURE_ORDER])
                labels.append(int(zeile["label"]))
            except (TypeError, ValueError) as fehler:
                raise SystemExit(f"ABBRUCH in Zeile {nr}: {fehler}")
            quellen.append(quelle)
    return zeilen, labels, quellen


def baum_als_json(baum):
    """sklearn-Baum in das flache Knotenformat der App uebersetzen."""
    t = baum.tree_
    return {
        "feature": [int(f) for f in t.feature],
        "threshold": [float(s) for s in t.threshold],
        "left": [int(i) for i in t.children_left],
        "right": [int(i) for i in t.children_right],
        # value[i] ist [[n_klasse0, n_klasse1]] — auf ein Paar reduzieren.
        "value": [[float(v[0][0]), float(v[0][1])] for v in t.value],
    }


def spaltencheck(pfad: Path) -> int:
    """Fuehrt NUR den Lader aus, ohne scikit-learn.

    Damit laesst sich die Kette JavaScript -> CSV -> Python auch dort
    pruefen, wo scikit-learn nicht installiert ist. Ohne diesen Einstieg
    verdeckt die Meldung "scikit-learn fehlt" jeden Vertragsbruch beim
    Einlesen - genau so blieb der Trennzeichenfehler in rc.4.19
    unentdeckt, obwohl SC-17 gruen war.
    """
    with pfad.open(newline="", encoding="utf-8") as fh:
        leser = csv.DictReader(fh, delimiter=CSV_TRENNZEICHEN)
        pruefe_spalten(leser.fieldnames)
        zeilen = sum(1 for _ in leser)
        gelabelt = 0
    with pfad.open(newline="", encoding="utf-8") as fh:
        for z in csv.DictReader(fh, delimiter=CSV_TRENNZEICHEN):
            if (z.get("label") or "").strip():
                gelabelt += 1
    print(f"SPALTENCHECK OK  zeilen={zeilen}  merkmale={len(FEATURE_ORDER)}"
          f"  gelabelt={gelabelt}")
    if gelabelt == 0:
        print("HINWEIS: keine Zeile ist gelabelt. Der Spaltenvertrag stimmt,"
              " trainiert werden kann damit noch nicht.")
    return 0


def main():
    p = argparse.ArgumentParser(description="Random Forest fuer das Kratzer-Screening")
    p.add_argument("--daten", required=True, type=Path, help="gelabelte CSV")
    p.add_argument("--modell", type=Path, help="Ausgabe: modell.json")
    p.add_argument("--spaltencheck", action="store_true",
                   help="nur den Lader ausfuehren, ohne scikit-learn")
    p.add_argument("--baeume", type=int, default=200)
    p.add_argument("--tiefe", type=int, default=8,
                   help="Maximale Tiefe. Flach halten: erklaerbar schlaegt tief.")
    p.add_argument("--seed", type=int, default=20260911,
                   help="Fester Seed. Zwei Laeufe auf denselben Daten muessen "
                        "dasselbe Modell ergeben.")
    args = p.parse_args()

    if args.spaltencheck:
        return spaltencheck(args.daten)
    if not args.modell:
        raise SystemExit("FEHLER: --modell fehlt (oder --spaltencheck verwenden).")

    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import cross_val_score
    except ImportError:
        raise SystemExit(
            "FEHLER: scikit-learn fehlt.  pip install scikit-learn\n"
            "(nur auf der Werkbank noetig — die App braucht es nicht)"
        )

    X, y, quellen = lade_daten(args.daten)
    if len(X) < 20:
        raise SystemExit(
            f"ABBRUCH: nur {len(X)} gelabelte Kandidaten.\n"
            "Das reicht fuer kein belastbares Modell. Mehr Beispiele labeln."
        )
    if len(set(y)) < 2:
        raise SystemExit("ABBRUCH: nur eine Klasse vorhanden.")

    wald = RandomForestClassifier(
        n_estimators=args.baeume,
        max_depth=args.tiefe,
        random_state=args.seed,
        class_weight="balanced",   # ein uebersehener Kratzer wiegt schwerer
    )

    # Kreuzvalidierung VOR dem Endtraining: eine Zahl, die etwas aussagt.
    werte = cross_val_score(wald, X, y, cv=min(5, len(set(y)) * 2), scoring="f1")
    wald.fit(X, y)

    wichtigkeit = {name: float(w) for name, w in zip(FEATURE_ORDER, wald.feature_importances_)}

    modell = {
        "featureOrder": FEATURE_ORDER,
        # Aufmerksamkeitsstufen, keine Tiefenaussage (siehe scratchClassifier.js).
        "classLabels": ["ATTENTION_LOW", "ATTENTION_HIGH"],
        "trees": [baum_als_json(b) for b in wald.estimators_],
        "featureImportance": wichtigkeit,
        "training": {
            "anzahlBeispiele": len(X),
            "klassenverteilung": {"0": y.count(0), "1": y.count(1)},
            "labelQuellen": sorted(set(quellen)),
            "f1_kreuzvalidiert_mittel": float(werte.mean()),
            "f1_kreuzvalidiert_streuung": float(werte.std()),
            "seed": args.seed,
            "baeume": args.baeume,
            "maxTiefe": args.tiefe,
        },
        "hinweis": (
            "Dieses Modell SORTIERT Verdachtsstellen. Es faellt keine "
            "GMP-Freigabeentscheidung. Die verbindliche Bewertung erfolgt "
            "durch kalibrierte Messung (Ra/Tiefe)."
        ),
    }

    args.modell.write_text(json.dumps(modell, indent=1), encoding="utf-8")

    print(f"Beispiele            {len(X)}  (Klasse 0: {y.count(0)} · Klasse 1: {y.count(1)})")
    print(f"Labelquellen         {', '.join(sorted(set(quellen)))}")
    print(f"F1 kreuzvalidiert    {werte.mean():.3f} ± {werte.std():.3f}")
    print("\nMerkmalsgewichte (Erklaerbarkeit fuer das Audit):")
    for name, w in sorted(wichtigkeit.items(), key=lambda kv: -kv[1]):
        print(f"  {name:<16} {w:.4f}  {'#' * int(round(w * 50))}")
    print(f"\nModell geschrieben:  {args.modell}")
    print("\nDas Modell sortiert. Es entscheidet nicht.")


if __name__ == "__main__":
    sys.exit(main())
