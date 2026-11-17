// PNG del código QR sin dependencias (funciona igual en Deno/Supabase y en Node 18+).
import qrcode from './qrcode.mjs';

export const QR_PREFIX = 'IM26:';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }

function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t); body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

async function deflate(bytes) {
  const cs = new CompressionStream('deflate'); // formato zlib, el que exige PNG
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Matriz del QR (corrección M). */
export function qrMatrix(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}

/** PNG en escala de grises: módulos de `scale` px y margen de 4 módulos. */
export async function qrPng(text, scale = 10) {
  const { n, dark } = qrMatrix(text);
  const size = (n + 8) * scale;
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1);
    raw[row] = 0; // filtro "ninguno"
    const r = Math.floor(y / scale) - 4;
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / scale) - 4;
      raw[row + 1 + x] = r >= 0 && c >= 0 && r < n && c < n && dark(r, c) ? 0 : 255;
    }
  }
  const ihdr = new Uint8Array([...u32(size), ...u32(size), 8, 0, 0, 0, 0]); // 8 bits, escala de grises
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
