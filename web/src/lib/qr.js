// Credencial con QR (PNG generado en el navegador; mismo contenido que el QR del correo).
import qrcode from 'qrcode-generator';

export const QR_PREFIX = 'IM26:';

export function credencial(p) {
  const W = 600, H = 760, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const F = 'Inter, Arial, sans-serif';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e7e7ec'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  g.fillStyle = '#4f46e5'; g.fillRect(0, 0, W, 8);
  g.textAlign = 'center';
  g.fillStyle = '#4f46e5'; g.font = `600 14px ${F}`; g.fillText('ACREDITACIÓN', W / 2, 58);
  g.fillStyle = '#16161d'; g.font = `700 32px ${F}`; g.fillText('INNOMINING 2026', W / 2, 96);

  const q = qrcode(0, 'M'); q.addData(QR_PREFIX + p.qr_token); q.make();
  const n = q.getModuleCount(), cell = Math.floor(380 / (n + 2)), size = cell * n;
  const x0 = Math.round((W - size) / 2), y0 = 130 + Math.round((380 - size) / 2);
  g.fillStyle = '#16161d';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(x0 + k * cell, y0 + r * cell, cell, cell);

  g.fillStyle = '#16161d'; g.font = `600 26px ${F}`;
  let y = 580;
  for (const l of envolver(g, p.nombre || p.email || '', W - 80).slice(0, 2)) { g.fillText(l, W / 2, y); y += 34; }
  g.fillStyle = '#7a7a88'; g.font = '500 18px ui-monospace, Menlo, Consolas, monospace'; g.fillText(p.codigo, W / 2, y + 4);
  g.font = `400 13px ${F}`; g.fillText('Presenta este código al ingresar. Es personal.', W / 2, H - 28);
  return c;
}

function envolver(g, texto, max) {
  const out = []; let cur = '';
  for (const w of String(texto).split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

export const aBlob = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));

export function nombreArchivo(p) {
  const s = String(p.nombre || p.email || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `${p.codigo}_${s || 'participante'}.png`;
}

/** Data URL del QR simple (para la vista previa del correo). */
export function qrDataUrl(token) {
  const q = qrcode(0, 'M'); q.addData(QR_PREFIX + token); q.make();
  return q.createDataURL(8, 4);
}

/** PNG del QR (con margen) para el correo: se sube a Storage y también va adjunto. */
export function qrPngBlob(token, escala = 10) {
  const q = qrcode(0, 'M'); q.addData(QR_PREFIX + token); q.make();
  const n = q.getModuleCount(), m = 4, tam = (n + 2 * m) * escala;
  const c = document.createElement('canvas'); c.width = tam; c.height = tam;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, tam, tam); g.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + m) * escala, (r + m) * escala, escala, escala);
  return aBlob(c);
}

export function blobABase64(b) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(b); });
}
