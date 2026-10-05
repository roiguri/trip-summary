// The app's icons as PNGs, drawn from the sun mark (DESIGN.md, "Name and top bar"; "Installable app"):
// rounded for "any" use, full-bleed with the sun inside the central safe zone for "maskable" (Android
// crops it to its own shape), and opaque for iPhones' home screen. Run after changing the mark:
//   node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SUN = (scale, dx, dy) =>
  `<g transform="translate(${dx} ${dy}) scale(${scale})"><path d="M7 22a14 14 0 0 1 28 0" fill="#f2c9a5"/><path d="M12 22a9 9 0 0 1 18 0" fill="#e0a07a"/><path d="M3 24h36" stroke="#dcead6" stroke-width="2.6" stroke-linecap="round"/></g>`;
// The mark is 42x30 (its horizon at y=24): centred on a square, with `inset` of margin each side.
const square = (size, inset, rounded) => {
  const w = size - 2 * inset;
  const scale = w / 42;
  // The visible mark runs from the arc's top (y=8) to the horizon line's bottom (about y=25.3).
  const dy = size / 2 - 16.65 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="#3f5c4b"/>${SUN(scale, inset, dy)}</svg>`;
};
const icons = [
  ['icon-192.png', 192, 26, true],
  ['icon-512.png', 512, 70, true],
  // Maskable: the safe zone is the central 80%, so the sun keeps well inside it.
  ['maskable-512.png', 512, 128, false],
  // iPhone home screen: opaque and square (iOS rounds it).
  ['apple-touch-icon.png', 180, 30, false],
];
for (const [name, size, inset, rounded] of icons)
  await sharp(Buffer.from(square(size, inset, rounded)))
    .png()
    .toFile(`public/icons/${name}`);
// The browser tab's icon, centred the same way.
writeFileSync('app/icon.svg', square(64, 9, true) + '\n');
console.log(`Wrote ${icons.length} icons to public/icons/, and app/icon.svg`);
