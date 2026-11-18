// Puesto celular: cámara + validación en el servidor.
import { rpc, $, h, getDia, getModo, setModo } from '../lib/core.js';

let root, jsQR = null;
const S = { stream: null, facing: 'environment', ocupado: false, ultimo: '', ultimoEn: 0, timer: 0, ocultar: 0, cv: document.createElement('canvas'), wake: null };

export async function render(r) {
  root = r;
  const sal = getModo() === 'salida';
  root.innerHTML = `<div class="scan-page${sal ? ' salida' : ''}">
    <div class="scan-top"><a href="#/inicio">← Salir</a><span class="modo-tag">${sal ? 'SALIDA' : 'ENTRADA'}</span><span class="count">Día ${getDia()} · <b id="n">–</b> ${sal ? 'salidas' : 'ingresaron'}</span></div>
    <div class="cam">
      <video id="v" playsinline muted></video>
      <div class="frame"></div>
      <div class="res" id="res" hidden></div>
      <div class="idle" id="idle"><button class="btn primary big" id="go" style="background:#fff;color:#16161d">Iniciar cámara</button><p id="msg"></p></div>
    </div>
    <div class="scan-bottom"><button class="btn" id="sw">Cambiar cámara</button><button class="btn" id="modo">Pasar a ${sal ? 'entrada' : 'salida'}</button><button class="btn" id="stop">Pausar</button></div>
    ${sal ? `<div class="scan-buscar">
      <label for="bq">¿No tiene su QR? Búscalo por nombre</label>
      <input id="bq" type="search" autocomplete="off" placeholder="Nombre, apellido, correo o código">
      <ul id="bres"></ul>
    </div>` : ''}
  </div>`;
  $('#go', root).onclick = iniciar;
  $('#sw', root).onclick = () => { S.facing = S.facing === 'environment' ? 'user' : 'environment'; iniciar(); };
  $('#stop', root).onclick = detener;
  if (sal) {
    let t = 0;
    $('#bq', root).addEventListener('input', (e) => { clearTimeout(t); const v = e.target.value.trim(); t = setTimeout(() => buscarSalida(v), 300); });
    $('#bres', root).addEventListener('click', marcarSalida);
  }
  $('#modo', root).onclick = () => { detener(); setModo(sal ? 'entrada' : 'salida'); S.ultimo = ''; render(root); };
  $('#res', root).onclick = () => { if (!$('#res', root).classList.contains('wait')) ocultar(); };
  refrescar();
  iniciar(); // intenta abrir la cámara directamente
}

export function salir() { detener(); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') detener(); });

export async function refrescar() {
  try {
    if (getModo() === 'salida') {
      const r = await rpc('ultimas_salidas', { p_dia: getDia() }); const n = $('#n', root); if (n) n.textContent = `${r.salidas}/${r.entradas}`;
    } else {
      const r = await rpc('ultimos_ingresos', { p_dia: getDia() }); const n = $('#n', root); if (n) n.textContent = r.ingresos;
    }
  } catch (_) { /* reintento automático */ }
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
    if (getModo() === 'salida') return await salida(texto);
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

async function salida(texto) {
  const r = await rpc('registrar_salida_qr', { p_qr: texto, p_dia: getDia() });
  if (r.estado === 'ok') {
    navigator.vibrate && navigator.vibrate(120);
    const nota = r.entrada ? `Entró ${h(r.entrada.slice(0, 5))} · salió ${h(r.hora.slice(0, 5))}` : `Salida ${h(r.hora.slice(0, 5))} · <b>sin entrada registrada hoy</b>`;
    mostrar('ok', `<div class="t1">✓ SALIDA REGISTRADA</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia} · ${nota}</div><div class="t4">Toque para continuar</div>`, 2500);
    refrescar();
  } else if (r.estado === 'ya') {
    navigator.vibrate && navigator.vibrate([80, 60, 80]);
    mostrar('ya', `<div class="t1">SALIDA YA REGISTRADA</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia}: salió a las ${h(r.hora)}</div><div class="t4">No se registró de nuevo · Toque para continuar</div>`, 4000);
  } else {
    navigator.vibrate && navigator.vibrate([200, 80, 200]);
    mostrar('bad', `<div class="t1">⚠ QR NO VÁLIDO</div><div class="t3" style="margin-top:12px">${h(r.msg)}</div><div class="t4">No se registró la salida · Toque para continuar</div>`, 4500);
  }
}

async function buscarSalida(q) {
  const ul = $('#bres', root); if (!ul) return;
  if (q.length < 3) { ul.innerHTML = q ? '<li class="nota">Escriba al menos 3 letras…</li>' : ''; return; }
  ul.innerHTML = '<li class="nota">Buscando…</li>';
  try {
    const rs = await rpc('buscar_participantes', { p_q: q, p_dia: getDia() });
    // primero quienes entraron hoy
    rs.sort((a, b) => (b.ingreso_dia ? 1 : 0) - (a.ingreso_dia ? 1 : 0));
    ul.innerHTML = rs.length ? rs.map((x) => `<li>
        <div class="who"><b>${h(x.nombre)}</b><span>${h(x.codigo)}${x.institucion ? ' · ' + h(x.institucion) : ''}</span>
          <span class="${x.ingreso_dia ? 'si' : 'no'}">${x.ingreso_dia ? 'Entró ' + h(x.ingreso_dia.slice(0, 5)) : 'Sin entrada hoy'}</span></div>
        ${x.salida_dia ? `<span class="hecho">Salió ${h(x.salida_dia.slice(0, 5))}</span>` : `<button class="btn" data-sal="${h(x.id)}">Marcar salida</button>`}
      </li>`).join('') : '<li class="nota">No se encontró. Revise el nombre o búsquelo por correo.</li>';
  } catch (e) { ul.innerHTML = `<li class="nota err">${h(e.message)}</li>`; }
}

async function marcarSalida(e) {
  const b = e.target.closest('[data-sal]'); if (!b) return;
  b.disabled = true; b.textContent = 'Registrando…';
  try {
    const r = await rpc('registrar_salida_id', { p_id: b.dataset.sal, p_dia: getDia() });
    S.ocupado = true;
    if (r.estado === 'ok') {
      navigator.vibrate && navigator.vibrate(120);
      const nota = r.entrada ? `Entró ${h(r.entrada.slice(0, 5))} · salió ${h(r.hora.slice(0, 5))}` : `Salida ${h(r.hora.slice(0, 5))} · <b>sin entrada registrada hoy</b>`;
      mostrar('ok', `<div class="t1">✓ SALIDA REGISTRADA</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia} · ${nota}</div><div class="t4">Toque para continuar</div>`, 2500);
      refrescar();
    } else {
      mostrar('ya', `<div class="t1">SALIDA YA REGISTRADA</div><div class="t2">${h(r.nombre)}</div><div class="t3">Día ${r.dia}: salió a las ${h(r.hora)}</div><div class="t4">Toque para continuar</div>`, 4000);
    }
    const q = $('#bq', root); if (q) { q.value = ''; q.blur(); }
    $('#bres', root).innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { b.disabled = false; b.textContent = 'Marcar salida'; mostrar('bad', `<div class="t1">NO SE REGISTRÓ</div><div class="t3" style="margin-top:12px">${h(err.message)}</div><div class="t4">Toque y vuelva a intentar</div>`); }
}
