// Sorteo con ruleta: filtra por % de asistencia y gira entre los que califican.
// Día 1 y 2: entrada + salida = día completo; solo una = medio día. Día 3: con entrada o salida = completo.
import { rpc, $, h, toast, norm, descargar } from '../lib/core.js';
import logoUrl from '../assets/innomining-logo.png';

let root, datos = null, timer = 0, girando = false, rot = 0, lista = [], rueda = [], audio = null;
const PREMIOS = [
  { n: 'Beca 70% Michigan English Center (10 meses, transferible)', c: 4 },
  { n: '1 mes de prueba Michigan English Center', c: 1 },
  { n: 'Membresía ISE Academy', c: 8 },
];
const COLORES = ['#7d1a3a', '#1e2d6b', '#c8962e', '#5a1430', '#2b3f8f', '#a8324f', '#14214f', '#d9a441'];
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } };

export async function render(r) {
  root = r;
  const g = LS('im26-umbral'); const umbral = g === null || g === '' ? 60 : Number(g);
  root.innerHTML = `
    <div class="page-head"><div><h1>Sorteo</h1><p>Ruleta entre quienes cumplen el porcentaje de asistencia. Se actualiza sola con los QR que se escanean hoy.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="csv">Exportar ganadores</button><button class="btn primary" id="full">Pantalla completa</button></div></div>
    <div class="sorteo">
      <div class="ruleta-box" id="box">
        <img class="ruleta-logo" src="${logoUrl}" alt="InnoMining">
        <div class="ruleta-cab"><div class="rc-t">INNOMINING <span>2026</span> · Gran sorteo</div><div class="rc-p" id="premio-vivo"></div></div>
        <div class="ruleta-wrap">
          <div class="puntero"></div>
          <canvas id="cv" width="1000" height="1000"></canvas>
          <button class="centro" id="girar">GIRAR</button>
        </div>
        <div class="ticker" id="ticker">&nbsp;</div>
        <div class="rc-n" id="n-ruleta"></div>
        <canvas id="confeti" class="confeti"></canvas>
        <div class="ganador" id="gan" hidden></div>
      </div>
      <div class="panel-s">
        <div class="card">
          <h3>Premio que se sortea</h3>
          <div class="premios" id="premios"></div>
          <input id="premio" placeholder="O escribe otro premio" value="${h(LS('im26-premio') || PREMIOS[0].n)}">
        </div>
        <div class="card">
          <h3>Asistencia mínima: <b id="u-txt">${umbral}%</b></h3>
          <input type="range" id="umbral" min="0" max="100" step="1" value="${umbral}">
          <div class="cortes">${[33, 50, 60, 66, 83, 100].map((u) => `<button class="btn sm" data-u="${u}">${u}%</button>`).join('')}</div>
          <p class="small muted" id="u-info" style="margin-top:10px"></p>
          <p class="small muted" style="margin-top:6px">Día 1 y 2: entrada + salida = día completo; solo una = medio día. Día 3: estar registrado (entrada o salida) = día completo. Cada día vale 1/3.</p>
        </div>
        <div class="card"><h3>Ganadores</h3><ul class="gan-lista" id="ganadores"></ul></div>
      </div>
    </div>
    <h2 style="margin:28px 0 10px;font-size:18px">Participantes por asistencia <span class="small muted" id="act"></span></h2>
    <div class="toolbar"><input id="q" type="search" placeholder="Buscar por nombre o código"></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Participante</th><th>Día 1</th><th>Día 2</th><th>Día 3</th><th>%</th><th>Sorteo</th></tr></thead>
      <tbody id="tb"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table></div>`;

  $('#umbral', root).addEventListener('input', (e) => { LS('im26-umbral', e.target.value); pintar(); });
  root.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => { $('#umbral', root).value = b.dataset.u; LS('im26-umbral', b.dataset.u); pintar(); }));
  $('#premio', root).addEventListener('input', (e) => { LS('im26-premio', e.target.value); pintarPremios(); });
  $('#premios', root).addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; $('#premio', root).value = b.dataset.p; LS('im26-premio', b.dataset.p); pintarPremios(); });
  $('#q', root).addEventListener('input', pintarTabla);
  $('#girar', root).onclick = girar;
  $('#full', root).onclick = () => { const b = $('#box', root); (document.fullscreenElement ? document.exitFullscreen() : b.requestFullscreen && b.requestFullscreen()).catch?.(() => {}); };
  $('#csv', root).onclick = exportar;
  $('#ganadores', root).addEventListener('click', quitar);
  window.addEventListener('resize', dibujar);
  await refrescar();
  timer = setInterval(() => { if (!girando && $('#gan', root)?.hidden) refrescar(true); }, 12000);
}

export function salir() { clearInterval(timer); window.removeEventListener('resize', dibujar); }

export async function refrescar(silencioso) {
  if (girando) return;
  try { datos = await rpc('sorteo_datos'); pintar(); }
  catch (e) { if (!silencioso) toast(e.message, true); }
}

const umbral = () => Number($('#umbral', root).value);
const premioActual = () => $('#premio', root).value.trim();

function pintar() {
  if (!datos || !root.isConnected) return;
  const u = umbral();
  $('#u-txt', root).textContent = u + '%';
  root.querySelectorAll('[data-u]').forEach((b) => b.classList.toggle('on', Number(b.dataset.u) === u));
  const califican = datos.participantes.filter((p) => p.pct >= u - 0.05);
  lista = califican.filter((p) => !p.sorteo);
  const yaGan = califican.filter((p) => p.sorteo === 'ganador').length;
  $('#u-info', root).innerHTML = `<b>${califican.length}</b> califican · <b>${lista.length}</b> en la ruleta${yaGan ? ` · ${yaGan} ya ganaron` : ''} · de ${datos.participantes.length} con alguna asistencia`;
  rueda = lista.slice();
  $('#n-ruleta', root).textContent = `${lista.length} participantes en la ruleta · asistencia mínima ${u}%`;
  $('#act', root).textContent = `· actualizado ${datos.actualizado.slice(0, 5)}`;
  $('#girar', root).disabled = !lista.length;
  pintarPremios(); pintarGanadores(); pintarTabla(); dibujar();
}

function pintarPremios() {
  const cuenta = (n) => datos ? datos.ganadores.filter((g) => g.estado === 'ganador' && g.premio === n).length : 0;
  const act = premioActual();
  $('#premios', root).innerHTML = PREMIOS.map((p) => `<button class="pr${p.n === act ? ' on' : ''}" data-p="${h(p.n)}"><b>${h(p.n)}</b><span>${cuenta(p.n)} de ${p.c} entregados</span></button>`).join('');
  $('#premio-vivo', root).textContent = act || 'Premio';
}

function pintarGanadores() {
  const g = datos.ganadores;
  $('#ganadores', root).innerHTML = g.length ? g.map((x) => `<li class="${x.estado}">
      <div><b>${h(x.nombre)}</b><span>${x.estado === 'ganador' ? h(x.premio || 'Premio') : 'No estaba presente'} · ${h(x.codigo)} · ${h(x.hora.slice(0, 5))}</span></div>
      <button class="btn sm ghost" data-quitar="${h(x.id)}" title="Deshacer">✕</button></li>`).join('')
    : '<li class="muted small">Aún no hay ganadores.</li>';
}

const marca = (v) => (v >= 1 ? '<span class="dot ok">●</span>' : v > 0 ? '<span class="dot half">◐</span>' : '<span class="dot no">○</span>');
function pintarTabla() {
  if (!datos) return;
  const q = norm($('#q', root).value.trim()), u = umbral();
  const f = datos.participantes.filter((p) => !q || norm(`${p.nombre} ${p.codigo}`).includes(q));
  $('#tb', root).innerHTML = f.length ? f.slice(0, 400).map((p) => `<tr class="${p.pct >= u - 0.05 ? '' : 'fuera'}">
      <td><div>${h(p.nombre)}</div><div class="sub">${h(p.codigo)}${p.institucion ? ' · ' + h(p.institucion) : ''}</div></td>
      <td>${marca(p.d1)}</td><td>${marca(p.d2)}</td><td>${marca(p.d3)}</td>
      <td class="mono"><b>${Math.round(p.pct)}%</b></td>
      <td>${p.sorteo === 'ganador' ? '<span class="chip ok">Ganó</span>' : p.sorteo === 'ausente' ? '<span class="chip">Ausente</span>' : p.pct >= u - 0.05 ? '<span class="chip info">En ruleta</span>' : '<span class="small muted">No califica</span>'}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Nadie coincide.</td></tr>';
}

// ------------------------------------------------------------------ Ruleta
function dibujar() {
  const cv = $('#cv', root); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, R = W / 2 - 14, n = rueda.length;
  g.clearRect(0, 0, W, W);
  g.save(); g.translate(W / 2, W / 2);
  // aro exterior
  g.beginPath(); g.arc(0, 0, R + 10, 0, Math.PI * 2); g.fillStyle = '#f2c14e'; g.fill();
  g.beginPath(); g.arc(0, 0, R + 3, 0, Math.PI * 2); g.fillStyle = '#121315'; g.fill();
  g.rotate(rot);
  if (!n) {
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = '#2a2b31'; g.fill();
    g.restore(); return;
  }
  const a = (Math.PI * 2) / n;
  const conTexto = n <= 160;
  const fs = Math.max(11, Math.min(34, (R * a) * 0.62));
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, i * a, (i + 1) * a); g.closePath();
    g.fillStyle = COLORES[i % COLORES.length];
    if (n > 1 && i === n - 1 && (n - 1) % COLORES.length === 0) g.fillStyle = COLORES[3];
    g.fill();
    if (n <= 90) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.stroke(); }
    if (conTexto) {
      g.save(); g.rotate(i * a + a / 2); g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      const nom = rueda[i].nombre.split(' ').slice(0, 2).join(' ');
      g.fillText(nom.length > 22 ? nom.slice(0, 21) + '…' : nom, R - 18, 0);
      g.restore();
    }
  }
  // pernos
  for (let i = 0; i < 24; i++) { g.save(); g.rotate((i * Math.PI) / 12 - rot); g.beginPath(); g.arc(R + 6, 0, 3.5, 0, Math.PI * 2); g.fillStyle = '#fff6d8'; g.fill(); g.restore(); }
  g.restore();
}

// Índice bajo el puntero (arriba). El ángulo 0 del canvas está a la derecha; el puntero está en -90°.
function indiceEn(r) {
  const n = rueda.length, a = (Math.PI * 2) / n;
  let t = (-Math.PI / 2 - r) % (Math.PI * 2); if (t < 0) t += Math.PI * 2;
  return Math.floor(t / a) % n;
}

function tick() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), v = audio.createGain();
    o.type = 'square'; o.frequency.value = 1400; v.gain.setValueAtTime(0.06, audio.currentTime); v.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.04);
    o.connect(v); v.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.05);
  } catch (_) { /* sin audio */ }
}
function fanfarria() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime + i * 0.12;
      o.type = 'triangle'; o.frequency.value = f; v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.18, t + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 1.2 : 0.3));
      o.connect(v); v.connect(audio.destination); o.start(t); o.stop(t + 1.3);
    });
  } catch (_) { /* sin audio */ }
}

function agua() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.6);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.25, t + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(v); v.connect(audio.destination); o.start(t); o.stop(t + 0.75);
  } catch (_) { /* sin audio */ }
}

function azar(n) { const x = new Uint32Array(1); crypto.getRandomValues(x); return x[0] % n; }

function girar() {
  if (girando || !lista.length) return;
  if (!rueda.length) rueda = lista.slice();
  if (!premioActual()) { toast('Elige o escribe el premio que se sortea.', true); return; }
  girando = true; $('#girar', root).disabled = true;
  if (audio && audio.state === 'suspended') audio.resume();
  const fijos = rueda.slice(); // la ruleta no cambia mientras gira
  const n = fijos.length, a = (Math.PI * 2) / n;
  const win = azar(n);
  const dentro = (0.15 + Math.random() * 0.7) * a; // no caer justo en el borde
  let destino = -Math.PI / 2 - (win * a + dentro);
  const vueltas = 7 + azar(3);
  destino -= Math.PI * 2 * Math.ceil((destino - rot) / (Math.PI * 2));
  destino += Math.PI * 2 * vueltas;
  const ini = rot, dur = 8000, t0 = performance.now();
  let ultimo = indiceEn(rot);
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const paso = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    rot = ini + (destino - ini) * ease(t);
    dibujar();
    const i = indiceEn(rot);
    if (i !== ultimo) { ultimo = i; tick(); $('#ticker', root).textContent = fijos[i].nombre; }
    if (t < 1) requestAnimationFrame(paso);
    else { girando = false; mostrarGanador(fijos[indiceEn(rot)]); }
  };
  requestAnimationFrame(paso);
}

function mostrarGanador(p) {
  const el = $('#gan', root);
  fanfarria(); confeti();
  el.innerHTML = `<div class="g-in">
    <div class="g-k">🎉 ¡GANADOR!</div>
    <div class="g-p">${h(premioActual())}</div>
    <div class="g-n">${h(p.nombre)}</div>
    <div class="g-d">${h(p.codigo)}${p.institucion ? ' · ' + h(p.institucion) : ''} · asistencia ${Math.round(p.pct)}%</div>
    <div class="g-b">
      <button class="btn big ok" id="g-si">✓ Aceptar</button>
      <button class="btn big agua" id="g-agua">💧 Al agua</button>
    </div>
    <p class="g-nota">«Al agua»: este giro no cuenta y la persona sigue en la ruleta.</p></div>`;
  el.hidden = false;
  const cerrar = async () => { el.hidden = true; $('#girar', root).disabled = false; $('#ticker', root).innerHTML = '&nbsp;'; await refrescar(); };
  $('#g-si', el).onclick = async () => {
    try { await rpc('sorteo_guardar', { p_participante: p.id, p_premio: premioActual(), p_estado: 'ganador' }); toast(`Ganador: ${p.nombre}`); }
    catch (e) { toast(e.message, true); }
    cerrar();
  };
  $('#g-agua', el).onclick = () => { agua(); cerrar(); };
}

async function quitar(e) {
  const b = e.target.closest('[data-quitar]'); if (!b) return;
  if (!confirm('¿Deshacer este resultado? La persona vuelve a la ruleta.')) return;
  try { await rpc('sorteo_quitar', { p_id: b.dataset.quitar }); await refrescar(); } catch (err) { toast(err.message, true); }
}

function confeti() {
  const cv = $('#confeti', root); if (!cv) return;
  const box = $('#box', root); cv.width = box.clientWidth; cv.height = box.clientHeight;
  const g = cv.getContext('2d');
  const ps = Array.from({ length: 220 }, () => ({ x: cv.width / 2, y: cv.height * 0.45, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 20 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: ['#f2c14e', '#ffffff', '#c8243a', '#4f7cff', '#3fb27f'][azar(5)], w: 6 + Math.random() * 8 }));
  const t0 = performance.now();
  const paso = (now) => {
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore(); }
    if (now - t0 < 4500) requestAnimationFrame(paso); else g.clearRect(0, 0, cv.width, cv.height);
  };
  requestAnimationFrame(paso);
}

function csv(v) { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportar() {
  if (!datos) return;
  const cols = ['hora', 'resultado', 'premio', 'codigo', 'nombre', 'email', 'institucion'];
  const filas = datos.ganadores.slice().reverse().map((g) => [g.hora, g.estado === 'ganador' ? 'Ganador' : 'Ausente', g.premio, g.codigo, g.nombre, g.email, g.institucion].map(csv).join(','));
  descargar(new Blob([String.fromCharCode(0xfeff) + [cols.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' }), 'innomining2026_sorteo.csv');
}
