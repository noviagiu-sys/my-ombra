# Trägerlotse — Waschgutträger-Positionsassistent (Demo)

QR-Code eines Instruments scannen → die App zeigt sofort die richtige
**Aussparung** auf dem Waschgutträger und führt durch die richtige
**Einlege­reihenfolge**. Nicht gescannte Teile sind nur transparent
sichtbar; sobald ein Teil korrekt platziert ist, wird es voll sichtbar.

> **Demo-Hinweis:** Alle Träger und Instrumente in `config.js` sind
> **fiktiv**. Es werden keinerlei Firmendaten oder Fotos verarbeitet.

## Auf Replit starten

1. Dieses Projekt auf Replit importieren/hochladen (Dateien: `index.html`,
   `config.js`, `app.js`, `server.js`, `package.json`, `.replit`).
2. Auf **Run** klicken. Es startet ein einfacher Node-Server (ohne
   Installationsschritt).
3. Die Webview-URL (oben rechts, `…replit.dev`) am **Handy** öffnen.
   Diese URL ist **HTTPS** — nur dann erlaubt der Browser den Kamerazugriff.

Lokal ohne Replit:
```
node server.js        # dann http://localhost:3000 öffnen
# oder ganz ohne Node:  python3 -m http.server 3000
```

## QR-Codes zum Testen

Erzeuge mit einem beliebigen QR-Generator Codes mit genau diesem Inhalt
(siehe auch „Etiketten / QR-Inhalte“ in der App):

```
Grundsieb Chirurgie:  KLE-KOC  KLE-PEA  NAD-HAL  SCH-GER  SCH-GEB
                      SKA-GRF  PIN-ANA  PIN-CHI  WUN-HAK
Sieb Laparoskopie:    TRO-11   TRO-05   SCH-LAP  FAS-LAP  NAD-LAP  CLI-APP
```

Ohne physische Codes: in der App unten die **Demo-Teile** antippen oder den
Code **manuell** eingeben.

## Eigene Träger eintragen (echte Daten)

Bearbeite **nur** `config.js` — sonst nichts. Jeder Träger:

```js
{
  id: "mein-sieb",
  name: "Anzeigename",
  note: "kurze Notiz",
  pos: {
    // Schlüssel: frei wählbare Positions-ID (erscheint als Label)
    P1: { cx: 80, cy: 100, shape: "slot", w: 16, h: 100 },
    // cx,cy = Mittelpunkt in der Zeichenfläche (300 breit × 400 hoch)
    // shape = "slot" | "thin" | "bracket" | "oval"
  },
  parts: [
    {
      code: "ABC-123",     // QR-Inhalt / Etikett
      name: "Instrument",  // voller Name
      short: "Instr.",     // Kurzname (Demo-Button)
      pos: "P1",           // welche Aussparung (Schlüssel aus pos)
      order: 1,            // Einlege-Reihenfolge
      type: "clamp"        // Silhouette (siehe unten)
    }
  ]
}
```

**Instrument-Typen (`type`):** `scis`, `sciscurve`, `clamp`, `needle`,
`forceps`, `scalpel`, `hook`, `rod`.

Weil die echten Daten nur in `config.js` auf **deinem** Replit/Rechner
stehen, verlassen sie dein System nicht.

## Dateien

| Datei          | Zweck                                            |
|----------------|--------------------------------------------------|
| `index.html`   | Oberfläche (Struktur + Styles)                   |
| `config.js`    | **Deine Daten** — Träger, Aussparungen, Teile    |
| `app.js`       | Logik (Zeichnung, Reihenfolge, QR-Scan)          |
| `server.js`    | Kleiner statischer Server (ohne Abhängigkeiten)  |
| `package.json` | Start-Skript                                     |
| `.replit`      | Replit-Run-Konfiguration                         |
