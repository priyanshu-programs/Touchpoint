import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const sourcePath = "public/Images/touchpoint-logo-transparent.svg";
const squarePath = "public/Images/touchpoint-mark.svg";
const iconPath = "src/app/icon.svg";
const applePath = "src/app/apple-icon.png";
const faviconPath = "src/app/favicon.ico";

const TILE = "#171717";
// The mark's 271.7 x 258.2 bounds centred in a 316 square, with an even margin.
const VIEWBOX = "9.85 -3.4 316 316";
const CORNER = 70;

const source = await readFile(sourcePath, "utf8");
const art = source
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<title[\s\S]*?<\/title>/g, "")
  .replace(/<desc[\s\S]*?<\/desc>/g, "")
  .replace(/>\s+</g, "><")
  .trim();

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}">${art}</svg>\n`;
const icon = (radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="316" height="316"><rect x="9.85" y="-3.4" width="316" height="316" rx="${radius}" fill="${TILE}"/>${art}</svg>\n`;

const png = (svg, size) =>
  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

// An ICO may hold PNGs directly; each directory entry is 16 bytes of little-endian fields.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  for (const [index, { size, data }] of images.entries()) {
    const at = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, at);
    entries.writeUInt8(size >= 256 ? 0 : size, at + 1);
    entries.writeUInt8(0, at + 2);
    entries.writeUInt8(0, at + 3);
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  }

  return Buffer.concat([header, entries, ...images.map(({ data }) => data)]);
}

const favicon = ico(
  await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await png(icon(CORNER), size),
    })),
  ),
);
const apple = await png(icon(0), 180);

await writeFile(squarePath, square);
await writeFile(iconPath, icon(CORNER));
await writeFile(applePath, apple);
await writeFile(faviconPath, favicon);

const outputs = [
  [sourcePath, Buffer.byteLength(source)],
  [squarePath, Buffer.byteLength(square)],
  [iconPath, Buffer.byteLength(icon(CORNER))],
  [applePath, apple.length],
  [faviconPath, favicon.length],
];

for (const [file, bytes] of outputs) {
  console.log(`${file.padEnd(48)} ${String(bytes).padStart(6)} B`);
}
