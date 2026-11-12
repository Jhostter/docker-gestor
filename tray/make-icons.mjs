// Generates the monkey mark from src/app/monkey.mjs: the three tray icons (ok / warn / down) as PNG (Linux, macOS) and ICO
// (Windows) with no dependencies, plus the favicon (src/app/icon.svg) and the logo (docs/img/logo.svg):
//   node tray/make-icons.mjs
import { writeFileSync } from "node:fs";
import { BRAND, monkeySvg, roleAt } from "../src/app/monkey.mjs"; // the same drawing as the app logo
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "icons"), N = 32;
const COLORS = { ok: [34, 197, 94], warn: [245, 158, 11], down: [139, 139, 148] };

/** RGBA pixels of the monkey in a status colour, anti-aliased by 4x4 supersampling. Transparent background so it works on light and dark panels. */
function draw([r, g, b]) {
  const px = Buffer.alloc(N * N * 4), S = 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let cover = 0, rs = 0, gs = 0, bs = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const v = roleAt(x + (i + 0.5) / S, y + (j + 0.5) / S);
      if (!v) continue;
      const white = v === "face"; // fur and features take the status colour; the face is white
      cover++; rs += white ? 255 : r; gs += white ? 255 : g; bs += white ? 255 : b;
    }
    const o = (y * N + x) * 4;
    if (cover) { px[o] = rs / cover; px[o + 1] = gs / cover; px[o + 2] = bs / cover; px[o + 3] = Math.round((255 * cover) / (S * S)); }
  }
  return px;
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
function png(px) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** An ICO that embeds the PNG (supported since Windows Vista). */
function ico(pngData) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);                      // type = icon, 1 image
  head[6] = N; head[7] = N; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(pngData.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, pngData]);
}
for (const [name, rgb] of Object.entries(COLORS)) {
  const data = png(draw(rgb));
  writeFileSync(join(OUT, `${name}.png`), data); writeFileSync(join(OUT, `${name}.ico`), ico(data));
  console.log(name, data.length, "bytes");
}
const ROOT = join(OUT, "..", "..");
writeFileSync(join(ROOT, "src", "app", "icon.svg"), monkeySvg(BRAND) + "\n");
writeFileSync(join(ROOT, "docs", "img", "logo.svg"), monkeySvg(BRAND, { size: 128 }) + "\n");
console.log("icon.svg, logo.svg");
