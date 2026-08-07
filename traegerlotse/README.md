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

## Test-Träger „Spülmaschine“

Für einen völlig neutralen Test (ohne jedes Firmeneigentum) ist der Träger
**„Spülmaschine (Test)“** voreingestellt: Haushaltsgeschirr wie Topf, Pfanne,
Teller, Deckel, Tasse, Glas, Besteck. Genau wie bei einem echten Träger zeigt
die App die richtige Position und Reihenfolge — nur eben mit Küchenutensilien.

## QR-Etiketten erzeugen & drucken

In der App gibt es den Abschnitt **„QR-Etiketten drucken“**:

1. **„Etiketten erzeugen“** tippen — für jedes Teil des aktuellen Trägers wird
   ein QR-Code erstellt (Name + Code darunter).
2. **„Drucken“** tippen — es wird nur das Etiketten-Blatt gedruckt. Jedes
   Etikett auf das passende Teil kleben, fertig zum Scannen.

Der QR-Generator lädt eine kleine Bibliothek beim ersten Erzeugen aus dem Netz
(`qrcode-generator` via jsDelivr). Auf Replit/Vercel ist das gegeben; komplett
offline werden statt der QR-Bilder die Code-Texte angezeigt.

## Kamera-Overlay

Kamera starten und **„Overlay“** einschalten: Die Träger-Karte liegt dann
halbtransparent über dem Live-Bild — Handy über den echten Träger halten und
grob ausrichten, um Positionen und den nächsten Schritt direkt am Objekt zu
sehen. (Ausrichtungshilfe, keine perspektivisch getrackte AR.)

## QR-Codes zum Testen (manuell)

Alternativ mit einem beliebigen QR-Generator Codes mit genau diesem Inhalt
erzeugen (siehe auch „Etiketten / QR-Inhalte“ in der App):

```
Spülmaschine (Test):  TOPF  PFANNE  SCHUESSEL  TELLER-GR  TELLER-KL
                      DECKEL  TASSE  GLAS  BESTECK
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

**Silhouetten (`type`):**
Haushalt — `plate`, `pot`, `lid`, `pan`, `bowl`, `cup`, `glass`, `cutlery`.
Chirurgie — `scis`, `sciscurve`, `clamp`, `needle`, `forceps`, `scalpel`,
`hook`, `rod`.

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
