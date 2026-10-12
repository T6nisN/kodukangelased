// Generates the PWA PNG icons (house + star on a purple tile) with no dependencies.
// Run: npm run icons   → public/pwa-192.png, public/pwa-512.png, public/apple-touch-icon.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Shapes in a 0..1 unit square. Returns RGBA for a point.
const PURPLE_TOP = [139, 109, 255], PURPLE_BOTTOM = [93, 58, 240];
const WHITE = [255, 255, 255], SUN = [255, 200, 61], DOOR = [255, 107, 139];

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const star = (cx, cy, R, r) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  });

const ROOF = [[0.5, 0.2], [0.82, 0.48], [0.18, 0.48]];
const BODY = [[0.27, 0.46], [0.73, 0.46], [0.73, 0.8], [0.27, 0.8]];
const DOOR_RECT = [[0.44, 0.6], [0.56, 0.6], [0.56, 0.8], [0.44, 0.8]];
const STAR = star(0.5, 0.39, 0.075, 0.032);

function sample(x, y, rounded) {
  if (rounded) {
    // Rounded tile (radius 0.22) with transparent corners.
    const r = 0.22;
    const dx = Math.max(r - x, 0, x - (1 - r)), dy = Math.max(r - y, 0, y - (1 - r));
    if (dx * dx + dy * dy > r * r) return null;
  }
  if (inPolygon(x, y, STAR)) return SUN;
  if (inPolygon(x, y, DOOR_RECT)) return DOOR;
  if (inPolygon(x, y, ROOF) || inPolygon(x, y, BODY)) return WHITE;
  return PURPLE_TOP.map((c, i) => Math.round(c + (PURPLE_BOTTOM[i] - c) * y));
}

function png(size, { rounded }) {
  const SS = 4; // 4×4 supersampling for smooth edges
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, rounded);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Full-bleed squares: the OS applies its own mask (maskable / iOS).
writeFileSync('public/pwa-192.png', png(192, { rounded: false }));
writeFileSync('public/pwa-512.png', png(512, { rounded: false }));
writeFileSync('public/apple-touch-icon.png', png(180, { rounded: false }));
console.log('Icons written to public/');
