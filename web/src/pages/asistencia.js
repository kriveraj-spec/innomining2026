// Asistencia por día: quién ingresó (separado de la lista de inscritos).
import { rpc, $, h, toast, norm, descargar, getDia, chipOrigen } from '../lib/core.js';

let root, dia, datos = null;

export async function render(r) {
  root = r;
  dia = getDia() || 1;
  root.innerHTML = `
    <div class="page-head"><div><h1>Asistencia</h1><p>Entrada y salida de cada día. Recibir el QR por correo no cuenta como asistencia.</p></div>
      <button class="btn" id="csv">Exportar este día (CSV)</button></div>
    <div class="tabs-dia" id="tabs">${[1, 2, 3].map((d) => `<button data-d="${d}">Día ${d}</button>`).join('')}</div>
    <div class="stats" id="st" style="margin:16px 0"></div>
    <div class="toolbar"><input id="q" type="search" placeholder="Buscar por nombre, correo o código"></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Entrada</th><th>Salida</th><th>Participante</th><th class="hide-m">Código</th><th>Inscripción</th><th class="hide-m">Registro</th></tr></thead>
      <tbody id="tb"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table></div>`;
  $('#tabs', root).addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) { dia = Number(b.dataset.d); refrescar(); } });
  $('#q', root).addEventListener('input', pintar);
  $('#csv', root).onclick = exportar;
  await refrescar();
}

export async function refrescar() {
  try { datos = await rpc('listar_asistencia', { p_dia: dia }); pintar(); }
  catch (e) { toast(e.message, true); }
}

function pintar() {
  if (!datos) return;
  root.querySelectorAll('#tabs [data-d]').forEach((b) => b.classList.toggle('on', Number(b.dataset.d) === dia));
  const f = datos.filas, ent = f.filter((x) => x.hora), previos = ent.filter((x) => x.origen === 'previo').length;
  const sal = f.filter((x) => x.salida).length, ambas = f.filter((x) => x.hora && x.salida).length;
  $('#st', root).innerHTML = [
    [`Entradas Día ${dia}`, `${ent.length} <span class="muted" style="font-size:16px;font-weight:400">de ${datos.total_inscritos}</span>`],
    ['Salidas', sal], ['Entrada y salida', ambas], ['Preinscritos', previos], ['Inscritos en puerta', ent.length - previos]
  ].map(([t, n]) => `<div class="stat"><b>${n}</b><span>${t}</span></div>`).join('');
  const q = norm($('#q', root).value.trim());
  const rows = q ? f.filter((x) => norm(`${x.nombre} ${x.email} ${x.codigo}`).includes(q)) : f;
  $('#tb', root).innerHTML = rows.length ? rows.map((x) => `<tr>
      <td class="mono">${x.hora ? h(x.hora) : '<span class="muted">—</span>'}</td>
      <td class="mono">${x.salida ? h(x.salida) : '<span class="muted">—</span>'}</td>
      <td><div>${h(x.nombre)}</div><div class="sub">${h(x.email)}</div></td>
      <td class="hide-m mono small">${h(x.codigo)}</td>
      <td>${x.origen === 'presencial' ? '<span class="chip info">En puerta</span>' : '<span class="chip">Preinscrito</span>'}</td>
      <td class="hide-m small muted">${x.metodo === 'escaneo' ? 'Escaneo de QR' : 'Laptop'}${x.operador ? ' · ' + h(x.operador) : ''}</td></tr>`).join('')
    : `<tr><td colspan="6" class="empty">${f.length ? 'Nadie coincide con la búsqueda.' : `Aún no hay ingresos en el Día ${dia}.`}</td></tr>`;
}

function csv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportar() {
  if (!datos) return;
  const cols = ['dia', 'fecha', 'entrada', 'salida', 'id', 'codigo', 'nombre', 'email', 'institucion', 'inscripcion', 'registro'];
  const filas = datos.filas.map((x) => [dia, x.fecha, x.hora || '', x.salida || '', x.id, x.codigo, x.nombre, x.email, x.institucion,
    x.origen === 'presencial' ? 'En puerta' : 'Preinscrito', x.metodo ? (x.metodo === 'escaneo' ? 'Escaneo QR' : 'Laptop') : ''].map(csv).join(','));
  descargar(new Blob([String.fromCharCode(0xfeff) + [cols.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' }), `asistencia_dia${dia}.csv`);
}
