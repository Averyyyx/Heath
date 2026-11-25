'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.join(__dirname, '..');
const resources = path.join(root, 'resources');
const sizes = [16, 32, 48, 64, 128, 256, 512];

function makeIco(pngs) {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length + icoSizes.length * 16;
  const entries = [], images = [];
  for (const size of icoSizes) {
    const png = pngs.get(size), entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry); images.push(png); offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}
function badgeSvg(count, size) {
  const radius = size === 32 ? 7.5 : 7, cx = size - radius - 1, cy = size - radius - 1;
  const fontSize = size === 32 ? 10 : 9;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#D33F3F" stroke="#FBF6EE" stroke-width="1"/>
    <text x="${cx}" y="${cy + fontSize * .34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${count}</text>
  </svg>`);
}
async function buildIcons() {
  fs.mkdirSync(resources, { recursive: true });
  const source = path.join(resources, 'brand', 'hearth-mark.svg');
  if (!fs.existsSync(source)) throw new Error(`Missing Hearth logo: ${source}`);
  const pngs = new Map();
  for (const size of sizes) {
    const buffer = await sharp(source).resize(size, size).png().toBuffer();
    fs.writeFileSync(path.join(resources, `icon-${size}.png`), buffer);
    pngs.set(size, buffer);
  }
  fs.writeFileSync(path.join(resources, 'icon.ico'), makeIco(pngs));
  fs.writeFileSync(path.join(resources, 'tray-32.png'), pngs.get(32));
  for (let count = 1; count <= 9; count += 1) {
    const tray = await sharp(pngs.get(32)).composite([{ input: badgeSvg(count, 32) }]).png().toBuffer();
    fs.writeFileSync(path.join(resources, `tray-${count}-32.png`), tray);
    const overlay = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: badgeSvg(count, 16) }]).png().toBuffer();
    fs.writeFileSync(path.join(resources, `taskbar-badge-${count}.png`), overlay);
  }
  console.log('Generated Hearth PNG, ICO, tray, and taskbar icons.');
}
buildIcons().catch((error) => { console.error(error); process.exitCode = 1; });
