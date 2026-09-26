import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const colors = {
  background: [7, 12, 20, 255], card: [15, 23, 36, 255], blue: [56, 189, 248, 255], green: [74, 222, 128, 255],
};
const insideCircle = (x, y, cx, cy, radius) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
const paint = (png, x, y, color) => {
  const offset = (y * png.width + x) * 4;
  png.data.set(color, offset);
};
function generate(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    paint(png, x, y, colors.background);
    const nx = (x - size / 2) / size; const ny = (y - size / 2) / size;
    const outer = (nx / .37) ** 2 + (ny / .22) ** 2 <= 1;
    const inner = (nx / .32) ** 2 + (ny / .17) ** 2 <= 1;
    if (outer) paint(png, x, y, inner ? colors.card : colors.blue);
    if (insideCircle(x, y, size / 2, size / 2, size * .16)) paint(png, x, y, colors.blue);
    if (insideCircle(x, y, size / 2, size / 2, size * .07)) paint(png, x, y, colors.background);
    const sx = Math.abs(x - size * .68) / size; const sy = Math.abs(y - size * .27) / size;
    if (sx + sy < .065) paint(png, x, y, colors.green);
  }
  return PNG.sync.write(png, { colorType: 6 });
}

let valid = true;
for (const size of [192, 512]) {
  const target = new URL(`../public/icon-${size}.png`, import.meta.url);
  const buffer = generate(size);
  if (process.argv.includes("--check")) {
    const saved = await readFile(target).catch(() => Buffer.alloc(0));
    if (!saved.equals(buffer)) valid = false;
  } else await writeFile(target, buffer);
}
if (process.argv.includes("--check")) {
  if (!valid) { console.error("PWA-Icons fehlen oder sind nicht reproduzierbar. Fuehre npm run icons aus."); process.exit(1); }
  console.log("PWA-Icons reproduzierbar: 192 + 512");
} else console.log("PWA-Icons erzeugt: 192 + 512");
