import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { APP_VERSION, EQUIPMENT } from "../src/domain.js";

const target = new URL("../public/VisuClean_QR_Etiketten_A4.html", import.meta.url);
const escape = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const cards = await Promise.all(EQUIPMENT.map(async item => {
  const payload = item.id;
  const svg = await QRCode.toString(payload, {
    type: "svg", errorCorrectionLevel: "M", margin: 1,
    color: { dark: "#070c14", light: "#ffffff" },
  });
  return `<article class="label" data-payload="${escape(payload)}">
    <div class="brand">VisuClean <small>v${APP_VERSION}</small></div>
    <div class="qr">${svg}</div>
    <h2>${escape(item.de)}</h2>
    <p>${escape(item.en)}</p>
    <dl><div><dt>ID</dt><dd>${escape(item.id)}</dd></div><div><dt>Code</dt><dd>${escape(item.code)}</dd></div><div><dt>EAN-13</dt><dd>${escape(item.barcode)}</dd></div></dl>
  </article>`;
}));

const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VisuClean QR-Etiketten A4 · v${APP_VERSION}</title>
<style>
@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#07111f;background:#fff;font:10pt Arial,sans-serif}.toolbar{display:flex;justify-content:space-between;align-items:center;height:15mm;border-bottom:.4mm solid #0ea5e9;margin-bottom:3mm}.toolbar h1{font-size:15pt;margin:0}.toolbar p{margin:0;color:#334155}.toolbar button{min-height:10mm;padding:0 5mm;border:.3mm solid #075985;border-radius:2mm;background:#e0f2fe;color:#082f49;font-weight:700}.sheet{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,82mm);gap:2.5mm}.label{border:.3mm dashed #64748b;border-radius:2.5mm;padding:3mm;text-align:center;overflow:hidden;break-inside:avoid}.brand{font-size:12pt;font-weight:800;color:#075985}.brand small{font-weight:600;color:#475569}.qr{height:43mm;margin:1mm auto}.qr svg{width:43mm;height:43mm}.label h2{font-size:11pt;margin:1mm 0 0}.label p{font-size:8pt;color:#475569;margin:.5mm 0 1.5mm}.label dl{margin:0;text-align:left;font-size:7.4pt}.label dl div{display:grid;grid-template-columns:12mm 1fr}.label dt{font-weight:700}.label dd{margin:0;font-family:monospace}@media print{.toolbar button{display:none}.toolbar{height:12mm}.sheet{grid-template-rows:repeat(3,83mm)}}
</style></head><body><header class="toolbar"><div><h1>VisuClean Equipment-QR-Etiketten</h1><p>QR-Payload: equipment_id · Fehlerkorrektur M · 9 Anlagen</p></div><button type="button" onclick="window.print()">Drucken / Print</button></header><main class="sheet">${cards.join("")}</main></body></html>
`;

if (process.argv.includes("--check")) {
  const saved = await readFile(target, "utf8").catch(() => "");
  if (saved !== html) {
    console.error("QR-Etikettenblatt fehlt oder ist nicht reproduzierbar. Fuehre npm run labels aus.");
    process.exit(1);
  }
  console.log("QR-Etikettenblatt reproduzierbar: 9/9");
} else {
  await writeFile(target, html, "utf8");
  console.log(`QR-Etikettenblatt erzeugt: ${fileURLToPath(target)}`);
}
