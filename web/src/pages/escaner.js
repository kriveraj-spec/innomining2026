// Puesto celular: cámara + validación en el servidor.
import { rpc, $, h, getDia } from '../lib/core.js';

let root, jsQR = null;
const S = { stream: null, facing: 'environment', ocupado: false, ultimo: '', ultimoEn: 0, timer: 0, ocultar: 0, cv: document.createElement('canvas'), wake: null };

export async function render(r) {
  root = r;
  root.innerHTML = `<div class="scan-page">
    <div class="scan-top"><a href="#/inicio">← Salir</a><span class="count">Día ${getDia()} · <b id="n">–</b> ingresaron</span></div>
    <div class="cam">
      <video id="v" playsinline muted></video>
      <div class="frame"></div>
      <div class="res" id="res" hidden></div>
      <div class="idle" id="idle"><button class="btn primary big" id="go" style="background:#fff;color:#16161d">Iniciar cámara</button><p id="msg"></p></div>
    </div>
    <div class="scan-bottom"><button class="btn" id="sw">Cambiar cámara</button><button class="btn" id="stop">Pausar</button></div>
  </div>`;
  $('#go', root).onclick = iniciar;
  $('#sw', root).onclick = () => { S.facing = S.facing === 'environment' ? 'user' : 'environment'; iniciar(); };
  $('#stop', root).onclick = detener;
  $('#res', root).onclick = () => { if (!$('#res', root).classList.contains('wait')) ocultar(); };
  refrescar();
  iniciar(); // intenta abrir la cámara directamente
}

export function salir() { detener(); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') detener(); });

export async function refrescar() {
  try { const r = await rpc('ultimos_ingresos', { p_dia: getDia() }); const n = $('#n', root); if (n) n.textContent = r.ingresos; } catch (_) { /* reintento automático */ }
}

async function iniciar() {
  const msg = $('#msg', root);
  if (!msg) return;
  msg.textContent = 'Abriendo cámara…';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.textContent = 'Este navegador no permite usar la cámara. Abra la página con https en Chrome (Android) o Safari (iPhone).';
    return;
  }
  try {
    if (!jsQR) jsQR = (await import('jsqr')).default;
    detener();
    S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    const v = $('#v', root);
    v.srcObject = S.stream;
    await v.play();
    $('#idle', root).hidden = true;
    S.ocupado = false;
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => (S.wake = w)).catch(() => {});
    bucle();
  } catch (e) {
    $('#idle', root).hidden = false;
    msg.textContent = e && e.name === 'NotAllowedError'
      ? 'Permiso de cámara denegado. Actívelo en la configuración del navegador y toque «Iniciar cámara».'
      : 'No se pudo abrir la cámara: ' + ((e && e.message) || e);
  }
}

function detener() {
  clearTimeout(S.timer);
  if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
  S.stream = null;
  if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
  const v = root && $('#v', root); if (v) v.srcObject = null;
  const i = root && $('#idle', root); if (i) { i.hidden = false; $('#msg', root).textContent = ''; }
}

function bucle() {
  if (!S.stream) return;
  const v = $('#v', root);
  if (v && !S.ocupado && v.readyState >= 2 && v.videoWidth) {
    const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * k), hh = Math.round(v.videoHeight * k);
    S.cv.width = w; S.cv.height = hh;
    const g = S.cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, w, hh);
    const code = jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: 'dontInvert' });
    if (code && code.data) leido(code.data);
  }
  S.timer = setTimeout(bucle, 140);
}

function mostrar(cls, html, ms) {
  const el = $('#res', root);
  if (!el) return;
  el.className = 'res ' + cls; el.innerHTML = html; el.hidden = false;
  clearTimeout(S.ocultar);
  if (ms) S.ocultar = setTimeout(ocultar, ms);
}
function ocultar() { const el = $('#res', root); if (el) el.hidden = true; S.ocupado = false; }

async function leido(texto) {
  const ahora = Date.now();
  if (texto === S.ultimo && ahora - S.ultimoEn < 6000) return; // evita lecturas repetidas accidentales
  S.ultimo = texto; S.ultimoEn = ahora; S.ocupado = true;
  mostrar('wait', '<div class="t1">VALIDANDO…</div>');
  try {
    const r = await rpc('registrar_ingreso_qr', { p_qr: texto, p_dia: getDia() });
    if (r.estado === 'ok') {
      navigator.vibrate && navigator.vibrate(120);
      mostrar('ok', `<div class="t1">✓ INGRESO REGISTRADO</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia} · ${h(r.fecha)} · ${h(r.hora)}</div><div class="t4">Toque para continuar</div>`, 2500);
      refrescar();
    } else if (r.estado === 'ya') {
      navigator.vibrate && navigator.vibrate([80, 60, 80]);
      mostrar('ya', `<div class="t1">INGRESO YA REGISTRADO</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia}: ingresó a las ${h(r.hora)}</div><div class="t4">No se registró de nuevo · Toque para continuar</div>`, 4000);
    } else {
      navigator.vibrate && navigator.vibrate([200, 80, 200]);
      mostrar('bad', `<div class="t1">⚠ QR NO VÁLIDO</div><div class="t3" style="margin-top:12px">${h(r.msg)}</div><div class="t4">No se registró el ingreso · Toque para continuar</div>`, 4500);
    }
  } catch (e) {
    S.ultimo = ''; // permite volver a leer el mismo código
    mostrar('bad', `<div class="t1">NO SE REGISTRÓ</div><div class="t3" style="margin-top:12px">${h(e.message)}</div><div class="t4">Toque y vuelva a escanear</div>`);
  }
}
