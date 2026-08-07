/* =====================================================================
   Trägerlotse — KONFIGURATION
   ---------------------------------------------------------------------
   Dies ist die EINZIGE Datei, die du anpassen musst, um echte Träger,
   Aussparungen und Instrumente einzutragen. Nur Werte ändern — kein
   sonstiger Code nötig.

   Ein Träger = { id, name, note, pos:{…}, parts:[…] }

     pos["<ID>"] = { cx, cy, shape, w, h }      // Lage & Form der Aussparung
        cx, cy : Mittelpunkt im Trägerbild (Fläche 300 breit × 400 hoch)
        w, h   : Breite / Höhe der Aussparung
        shape  : "slot" | "thin" | "bracket" | "oval"

     parts[]    = { code, name, short, pos, order, type }
        code   : QR-Inhalt = was auf dem Etikett steht (z. B. "KLE-KOC")
        name   : voller Anzeigename
        short  : Kurzname für die Demo-Buttons
        pos    : Schlüssel aus pos{} oben (welche Aussparung)
        order  : Einlege-Reihenfolge (1, 2, 3, …)
        type   : Silhouette des Instruments —
                 "scis" | "sciscurve" | "clamp" | "needle" |
                 "forceps" | "scalpel" | "hook" | "rod"

   ---------------------------------------------------------------------
   DATENSCHUTZ / IP: Alle Werte hier sind FIKTIV (Demo). Echte, evtl.
   vertrauliche Firmendaten trägst du ausschließlich in DIESER Datei auf
   deinem eigenen Rechner/Replit ein — sie werden nirgendwo hochgeladen.
   ===================================================================== */
window.TRAEGER = {
  trays: [

    /* ---------- Träger 1 ---------- */
    {
      id: "grundsieb",
      name: "Grundsieb Chirurgie",
      note: "Demo-Zusammenstellung · fiktiv",
      pos: {
        A1:{cx:70, cy:96, shape:"slot",   w:16, h:100}, B1:{cx:150,cy:96, shape:"slot",   w:16, h:100}, C1:{cx:230,cy:96, shape:"slot",   w:16, h:100},
        A2:{cx:70, cy:210,shape:"bracket",w:46, h:76 }, B2:{cx:150,cy:210,shape:"bracket",w:46, h:76 }, C2:{cx:230,cy:210,shape:"bracket",w:46, h:76 },
        A3:{cx:70, cy:318,shape:"thin",   w:11, h:88 }, B3:{cx:150,cy:318,shape:"thin",   w:11, h:88 }, C3:{cx:230,cy:322,shape:"oval",   w:54, h:38 },
      },
      parts: [
        {code:"KLE-KOC", name:"Klemme Kocher",        short:"Kocher",      pos:"A2", order:1, type:"clamp"},
        {code:"KLE-PEA", name:"Klemme Péan",          short:"Péan",        pos:"B2", order:2, type:"clamp"},
        {code:"NAD-HAL", name:"Nadelhalter",          short:"Nadelhalter", pos:"C2", order:3, type:"needle"},
        {code:"SCH-GER", name:"Schere gerade",        short:"Schere ger.", pos:"A1", order:4, type:"scis"},
        {code:"SCH-GEB", name:"Schere gebogen",       short:"Schere geb.", pos:"B1", order:5, type:"sciscurve"},
        {code:"SKA-GRF", name:"Skalpellgriff",        short:"Skalpell",    pos:"C1", order:6, type:"scalpel"},
        {code:"PIN-ANA", name:"Pinzette anatomisch",  short:"Pinz. anat.", pos:"A3", order:7, type:"forceps"},
        {code:"PIN-CHI", name:"Pinzette chirurgisch", short:"Pinz. chir.", pos:"B3", order:8, type:"forceps"},
        {code:"WUN-HAK", name:"Wundhaken",            short:"Wundhaken",   pos:"C3", order:9, type:"hook"},
      ],
    },

    /* ---------- Träger 2 ---------- */
    {
      id: "lap",
      name: "Sieb Laparoskopie",
      note: "Demo-Zusammenstellung · fiktiv",
      pos: {
        L1:{cx:95, cy:95, shape:"slot",   w:16, h:90}, R1:{cx:205,cy:95, shape:"slot",   w:16, h:90},
        L2:{cx:95, cy:200,shape:"slot",   w:16, h:90}, R2:{cx:205,cy:200,shape:"thin",   w:11, h:90},
        L3:{cx:95, cy:305,shape:"bracket",w:44, h:74}, R3:{cx:205,cy:305,shape:"slot",   w:16, h:90},
      },
      parts: [
        {code:"TRO-11", name:"Trokar 11 mm",          short:"Trokar 11",   pos:"L1", order:1, type:"rod"},
        {code:"TRO-05", name:"Trokar 5 mm",           short:"Trokar 5",    pos:"R1", order:2, type:"rod"},
        {code:"SCH-LAP", name:"Schere laparoskopisch",short:"Schere lap.", pos:"L2", order:3, type:"scis"},
        {code:"FAS-LAP", name:"Fasszange",            short:"Fasszange",   pos:"R2", order:4, type:"forceps"},
        {code:"NAD-LAP", name:"Nadelhalter lap.",     short:"Nadelh. lap.",pos:"L3", order:5, type:"needle"},
        {code:"CLI-APP", name:"Clip-Applikator",      short:"Clip-Appl.",  pos:"R3", order:6, type:"rod"},
      ],
    },

  ]
};
