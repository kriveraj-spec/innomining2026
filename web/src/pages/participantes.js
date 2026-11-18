// Administración de participantes: importar, buscar, editar, QR, ZIP, exportar y envío a seleccionados.
import { rpc, $, $$, h, toast, modal, cerrarModal, confirmar, progreso, descargar, hoyArchivo, plural, norm, chipCorreo, chipOrigen, getDia } from '../lib/core.js';
import { credencial, aBlob, nombreArchivo } from '../lib/qr.js';
import { leerArchivo, detectar, aplicar } from '../lib/archivo.js';
import { enviarConProgreso, vistaPrevia } from './correos.js';

let root, lista = [], sel = new Set(), grupo = 'todos';

export async function render(r) {
  root = r;
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Inscritos <span class="muted num" id="n" style="font-weight:400"></span></h1><p>Todas las personas con QR: preinscritas (su lista) y las que se inscriben en la puerta.</p></div>
      <div class="row">
        <button class="btn" id="b-imp">Importar</button>
        <button class="btn" id="b-add">Agregar</button>
        <button class="btn primary" id="b-qr">Generar QR pendientes</button>
      </div>
    </div>
    <div class="tabs-dia" id="grupos" style="margin-bottom:14px">
      <button data-g="todos">Todos<b id="g-todos"></b></button><button data-g="previo">Preinscritos<b id="g-previo"></b></button><button data-g="presencial">Inscritos en puerta<b id="g-presencial"></b></button>
    </div>
    <div class="toolbar">
      <input id="q" type="search" placeholder="Buscar por nombre, correo o código">
      <select id="f" aria-label="Filtro">
        <option value="">Todos</option>
        <option value="sinqr">QR pendiente</option>
        <option value="cpend">Correo pendiente</option>
        <option value="cmal">Correo fallido o por verificar</option>
        <option value="hoy">Ingresaron (Día ${getDia()})</option>
        <option value="nohoy">No ingresaron (Día ${getDia()})</option>
      </select>
      <button class="btn" id="b-zip">Descargar QR (ZIP)</button>
      <button class="btn" id="b-csv">Exportar CSV</button>
    </div>
    <div class="selbar" id="selbar" hidden><b id="sel-n"></b><button class="btn sm primary" id="sel-env">Enviar QR por correo</button><button class="btn sm ghost" id="sel-x">Quitar selección</button></div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th style="width:36px"><input type="checkbox" id="todos" aria-label="Seleccionar todos"></th><th>Participante</th><th class="hide-m">Código</th><th class="hide-m">Inscripción</th><th class="hide-m">QR</th><th>Correo</th><th>Día ${getDia()}</th></tr></thead>
      <tbody id="tb"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody>
    </table></div>
    <p class="small muted" id="pie" style="margin-top:10px"></p>`;
  $('#q', root).addEventListener('input', pintar);
  $('#grupos', root).addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { grupo = b.dataset.g; pintar(); } });
  $('#f', root).addEventListener('change', pintar);
  $('#b-imp', root).onclick = importar;
  $('#b-add', root).onclick = () => editar(null);
  $('#b-qr', root).onclick = generarQr;
  $('#b-zip', root).onclick = zip;
  $('#b-csv', root).onclick = exportar;
  $('#todos', root).onchange = (e) => { filtrados().forEach((p) => (e.target.checked ? sel.add(p.id) : sel.delete(p.id))); pintar(); };
  $('#sel-x', root).onclick = () => { sel.clear(); pintar(); };
  $('#sel-env', root).onclick = enviarSeleccion;
  $('#tb', root).addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (e.target.matches('input[type=checkbox]')) { e.target.checked ? sel.add(tr.dataset.id) : sel.delete(tr.dataset.id); tr.classList.toggle('sel', e.target.checked); barra(); return; }
    if (e.target.closest('td.chk')) return;
    detalle(lista.find((p) => p.id === tr.dataset.id));
  });
  await refrescar();
}

export async function refrescar() {
  lista = await rpc('listar_participantes');
  const ids = new Set(lista.map((p) => p.id));
  [...sel].forEach((id) => { if (!ids.has(id)) sel.delete(id); });
  pintar();
}

function filtrados() {
  const q = norm($('#q', root).value.trim()), f = $('#f', root).value;
  return lista.filter((p) => {
    if (grupo !== 'todos' && p.origen !== grupo) return false;
    if (f === 'sinqr' && p.qr_token) return false;
    if (f === 'cpend' && p.correo_estado !== 'pendiente') return false;
    if (f === 'cmal' && !['fallido', 'incierto'].includes(p.correo_estado)) return false;
    const dia = (p.ingreso_dias || {})[getDia()];
    if (f === 'hoy' && !dia) return false;
    if (f === 'nohoy' && dia) return false;
    return !q || norm(`${p.nombre} ${p.email} ${p.codigo} ${p.institucion}`).includes(q);
  });
}

function pintar() {
  const rows = filtrados();
  const pend = lista.filter((p) => !p.qr_token).length;
  $('#n', root).textContent = lista.length;
  root.querySelectorAll('#grupos [data-g]').forEach((b) => b.classList.toggle('on', b.dataset.g === grupo));
  $('#g-todos', root).textContent = lista.length;
  $('#g-previo', root).textContent = lista.filter((p) => p.origen === 'previo').length;
  $('#g-presencial', root).textContent = lista.filter((p) => p.origen === 'presencial').length;
  $('#b-qr', root).textContent = pend ? `Generar QR pendientes (${pend})` : 'QR al día';
  $('#b-qr', root).disabled = !pend;
  $('#tb', root).innerHTML = rows.length ? rows.map((p) => `<tr class="click${sel.has(p.id) ? ' sel' : ''}" data-id="${h(p.id)}">
      <td class="chk"><input type="checkbox"${sel.has(p.id) ? ' checked' : ''} aria-label="Seleccionar"></td>
      <td><div>${p.nombre ? h(p.nombre) : '<span class="muted">(sin nombre)</span>'}</div><div class="sub">${h(p.email)}</div></td>
      <td class="hide-m mono small">${h(p.codigo)}</td>
      <td class="hide-m">${chipOrigen(p.origen)}</td>
      <td class="hide-m">${p.qr_token ? '<span class="chip ok">Generado</span>' : '<span class="chip warn">Pendiente</span>'}</td>
      <td>${chipCorreo(p.correo_estado)}</td>
      <td>${(p.ingreso_dias || {})[getDia()] ? `<span class="chip ok">${h(p.ingreso_dias[getDia()].slice(0, 5))}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')
    : `<tr><td colspan="7" class="empty">${lista.length ? 'Ningún participante coincide.' : 'Aún no hay participantes. Use «Importar» para cargar el Excel o CSV de inscritos.'}</td></tr>`;
  $('#pie', root).textContent = rows.length !== lista.length ? `Mostrando ${rows.length} de ${lista.length}` : '';
  $('#todos', root).checked = rows.length > 0 && rows.every((p) => sel.has(p.id));
  barra();
}

function barra() {
  $('#selbar', root).hidden = !sel.size;
  $('#sel-n', root).textContent = plural(sel.size, 'seleccionado', 'seleccionados');
}

// ---------------------------------------------------------------- Detalle
function detalle(p) {
  const b = modal(p.nombre || p.email, `
    <div class="grid2" style="gap:24px">
      <div class="qrbox" id="d-qr">${p.qr_token ? '' : '<p class="muted small">QR pendiente de generar.</p>'}</div>
      <div>
        <dl class="kv">
          <dt>Código</dt><dd class="mono">${h(p.codigo)}</dd>
          <dt>Correo</dt><dd>${h(p.email)}</dd>
          <dt>Institución</dt><dd>${h(p.institucion || '—')}</dd>
          <dt>Origen</dt><dd>${chipOrigen(p.origen)}</dd>
          <dt>Envío</dt><dd>${chipCorreo(p.correo_estado)}${p.correo_fecha ? ` <span class="small muted">${h(p.correo_fecha)}</span>` : ''}${p.correo_error ? `<div class="small" style="color:var(--bad);margin-top:4px">${h(p.correo_error)}</div>` : ''}</dd>
          <dt>Asistencias</dt><dd>${p.asistencias.length ? p.asistencias.map((a) => `<b>Día ${a.dia}</b> · ${h(a.fecha)} ${h(a.hora)} <span class="small muted">(${h(a.metodo)})</span>${a.salida ? ` · salida ${h(a.salida)}` : ''}`).join('<br>') : '<span class="muted">Sin ingresos</span>'}</dd>
        </dl>
      </div>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn" data-a="editar">Editar</button>
      ${p.qr_token ? '<button class="btn" data-a="png">Descargar PNG</button>' : ''}
      ${p.qr_token ? `<button class="btn" data-a="enviar">${['aceptado', 'entregado'].includes(p.correo_estado) ? 'Reenviar QR' : 'Enviar QR'}</button>` : ''}
      <button class="btn ghost" data-a="prev">Ver correo</button>
      ${p.qr_token ? '<button class="btn danger" data-a="anular">Anular QR</button>' : ''}
      ${p.asistencias.length ? '' : '<button class="btn danger ghost" data-a="eliminar">Eliminar</button>'}
    </div>`, { wide: true });
  let canvas = null;
  if (p.qr_token) { canvas = credencial(p); $('#d-qr', b).appendChild(canvas); }
  b.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    if (k === 'editar') editar(p);
    if (k === 'png') descargar(await aBlob(canvas), nombreArchivo(p));
    if (k === 'prev') vistaPrevia(p.id);
    if (k === 'enviar') {
      const reenvio = ['aceptado', 'entregado', 'incierto'].includes(p.correo_estado);
      if (reenvio && !(await confirmar('Reenviar QR', `Ya figura como <b>${h(p.correo_estado)}</b>. ¿Enviar de nuevo a ${h(p.email)}?`, 'Reenviar'))) return;
      cerrarModal();
      await enviarConProgreso({ modo: 'ids', ids: [p.id], forzar: reenvio, total: 1 });
      refrescar();
    }
    if (k === 'anular') {
      if (!(await confirmar('Anular QR', `El QR actual de <b>${h(p.nombre || p.email)}</b> dejará de funcionar y se generará uno nuevo (quedará pendiente de envío). Úselo solo si el código se compartió o se comprometió.`, 'Anular y generar nuevo', true))) return;
      try { await rpc('anular_qr', { p_id: p.id, p_motivo: 'Anulado desde el panel' }); toast('QR anulado y reemplazado'); await refrescar(); detalle(lista.find((x) => x.id === p.id)); }
      catch (err) { toast(err.message, true); }
    }
    if (k === 'eliminar') {
      if (!(await confirmar('Eliminar participante', `¿Eliminar a <b>${h(p.nombre || p.email)}</b>? Esta acción no se puede deshacer.`, 'Eliminar', true))) return;
      try { await rpc('eliminar_participante', { p_id: p.id }); toast('Participante eliminado'); refrescar(); }
      catch (err) { toast(err.message, true); }
    }
  });
}

function editar(p) {
  const nuevo = !p;
  p = p || { nombre: '', email: '', institucion: '' };
  const b = modal(nuevo ? 'Agregar participante' : `Editar · ${p.codigo}`, `<form id="e" novalidate>
    <label class="field"><span>Nombre completo</span><input id="e-n" value="${h(p.nombre)}" maxlength="150"></label>
    <label class="field"><span>Correo electrónico</span><input id="e-e" type="email" value="${h(p.email)}" maxlength="254"></label>
    <label class="field"><span>Universidad <i>(opcional)</i></span><input id="e-i" value="${h(p.institucion)}" maxlength="150"></label>
    ${nuevo ? '' : '<p class="small muted">El identificador y el QR se conservan. Si cambia el correo, el envío vuelve a «pendiente».</p>'}
    <p class="error" id="e-err"></p>
    <div class="actions"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#e', b).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      if (nuevo) await rpc('agregar_participante', { p_nombre: $('#e-n', b).value, p_email: $('#e-e', b).value, p_institucion: $('#e-i', b).value });
      else await rpc('actualizar_participante', { p_id: p.id, p_nombre: $('#e-n', b).value, p_email: $('#e-e', b).value, p_institucion: $('#e-i', b).value });
      cerrarModal(); toast(nuevo ? 'Participante agregado' : 'Cambios guardados'); refrescar();
    } catch (err) { $('#e-err', b).textContent = err.message; }
  });
}

// ---------------------------------------------------------------- QR
async function generarQr() {
  const pend = lista.filter((p) => !p.qr_token).length;
  if (!(await confirmar('Generar QR pendientes', `Se generará el QR de <b>${plural(pend, 'participante', 'participantes')}</b>. Los QR existentes no cambian.`, 'Generar'))) return;
  const pb = progreso('Generando QR');
  let total = 0;
  try {
    for (;;) {
      const r = await rpc('generar_qr_pendientes', { p_limite: 200 });
      total += r.generados;
      pb.set((100 * total) / Math.max(pend, 1), `${total} de ${pend} generados`);
      if (!r.pendientes || !r.generados) break;
    }
    pb.fin(`<p>Listo: ${plural(total, 'QR generado', 'QR generados')}.</p>`);
  } catch (e) { pb.fin(`<p class="error">${h(e.message)} Puede volver a intentarlo: continuará con los pendientes.</p>`); }
  refrescar();
}

async function zip() {
  const items = lista.filter((p) => p.qr_token);
  if (!items.length) return toast('Aún no hay QR generados.', true);
  const pb = progreso('Preparando ZIP');
  try {
    const JSZip = (await import('jszip')).default;
    const z = new JSZip();
    const idx = ['codigo,nombre,email,archivo'];
    for (let i = 0; i < items.length; i++) {
      const p = items[i], nom = nombreArchivo(p);
      z.file(nom, await aBlob(credencial(p)));
      idx.push([p.codigo, p.nombre, p.email, nom].map(csv).join(','));
      if (i % 10 === 0) pb.set((80 * i) / items.length, `Credencial ${i + 1} de ${items.length}`);
    }
    z.file('indice.csv', String.fromCharCode(0xfeff) + idx.join('\n'));
    const blob = await z.generateAsync({ type: 'blob' }, (m) => pb.set(80 + m.percent * 0.2, 'Comprimiendo…'));
    descargar(blob, `innomining2026_qr_${hoyArchivo()}.zip`);
    pb.set(100, `Listo: ${items.length} credenciales.`); pb.fin();
  } catch (e) { pb.fin(`<p class="error">${h(e.message)}</p>`); }
}

// ---------------------------------------------------------------- Exportar
function csv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function exportar() {
  try {
    const x = await rpc('exportar_registros');
    const cols = ['id', 'codigo', 'nombre', 'email', 'institucion', 'origen', 'qr', 'correo', 'ingreso_dia1', 'ingreso_dia2', 'ingreso_dia3', 'salida_dia1', 'salida_dia2', 'salida_dia3'];
    const filas = x.filas.map((r) => [r.id, r.codigo, r.nombre, r.email, r.institucion, r.origen, r.qr, r.correo,
      ...[1, 2, 3].map((d) => (r.asistencias && r.asistencias['dia' + d]) || ''),
      ...[1, 2, 3].map((d) => (r.salidas && r.salidas['dia' + d]) || '')].map(csv).join(','));
    descargar(new Blob([String.fromCharCode(0xfeff) + [cols.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8' }), `innomining2026_registros_${hoyArchivo()}.csv`);
    toast(`Exportados ${x.filas.length} participantes`);
  } catch (e) { toast(e.message, true); }
}

async function enviarSeleccion() {
  const ids = [...sel];
  const elegidos = lista.filter((p) => sel.has(p.id));
  const yaEnviados = elegidos.filter((p) => ['aceptado', 'entregado', 'incierto'].includes(p.correo_estado)).length;
  const b = modal('Enviar QR a seleccionados', `<p>Seleccionados: <b>${ids.length}</b>.${yaEnviados ? ` De ellos, <b>${yaEnviados}</b> ya figuran como enviados.` : ''}</p>
    ${yaEnviados ? '<label class="check" style="margin-top:14px"><input type="checkbox" id="s-f"> Reenviar también a quienes ya lo recibieron</label>' : ''}
    <div class="actions"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" id="s-ok">Enviar</button></div>`);
  $('#s-ok', b).onclick = async () => {
    const forzar = !!($('#s-f', b) && $('#s-f', b).checked);
    cerrarModal();
    await enviarConProgreso({ modo: 'ids', ids, forzar, total: forzar ? ids.length : ids.length - yaEnviados });
    sel.clear(); refrescar();
  };
}

// ---------------------------------------------------------------- Importar
async function importar() {
  const b = modal('Importar inscritos', `
    <p class="small muted">Archivo Excel (.xlsx) o CSV, por ejemplo la exportación de Google Forms. Columnas: nombre completo, correo e institución (opcional).</p>
    <label class="drop" id="drop"><b>Seleccione o arrastre el archivo</b><span class="small">.xlsx · .csv</span><input type="file" accept=".xlsx,.xlsm,.csv,.txt" hidden></label>
    <p class="error" id="i-err"></p>
    <p class="small"><button class="link" id="tpl">Descargar plantilla CSV</button></p>`, { wide: true });
  const inp = $('input[type=file]', b), drop = $('#drop', b);
  $('#tpl', b).onclick = () => descargar(new Blob([String.fromCharCode(0xfeff) + 'nombre,email,institucion\n'], { type: 'text/csv' }), 'plantilla_inscritos.csv');
  const leer = async (file) => {
    $('#i-err', b).textContent = 'Leyendo…';
    try {
      const filas = await leerArchivo(file);
      if (!filas.length) throw new Error('El archivo está vacío.');
      columnas(filas);
    } catch (e) { $('#i-err', b).textContent = e.message; }
  };
  inp.onchange = () => inp.files[0] && leer(inp.files[0]);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && leer(e.dataTransfer.files[0]); });
}

function columnas(filas) {
  const m = detectar(filas);
  const opt = (sel_, vacio) => `${vacio ? '<option value="-1">— ninguna —</option>' : ''}${m.columnas.map((c, i) => `<option value="${i}"${i === sel_ ? ' selected' : ''}>${h(c)}</option>`).join('')}`;
  const datos = filas.slice(m.encabezado ? 1 : 0);
  const b = modal('Asignar columnas', `
    <p class="small muted" style="margin-bottom:14px">${plural(datos.length, 'fila', 'filas')} encontradas. Revise qué columna corresponde a cada dato.</p>
    <div class="grid2">
      <label class="field"><span>Correo electrónico</span><select id="m-email">${opt(m.email, false)}</select></label>
      <label class="field"><span>Nombre completo</span><select id="m-nombre">${opt(m.nombre, true)}</select></label>
      <label class="field"><span>Apellidos <i>(si están en otra columna)</i></span><select id="m-apellido">${opt(m.apellido, true)}</select></label>
      <label class="field"><span>Institución <i>(opcional)</i></span><select id="m-inst">${opt(m.institucion, true)}</select></label>
    </div>
    <label class="check"><input type="checkbox" id="m-enc"${m.encabezado ? ' checked' : ''}> La primera fila son títulos</label>
    <div class="table-wrap" style="margin-top:14px"><table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Institución</th></tr></thead><tbody id="m-prev"></tbody></table></div>
    <div class="actions"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" id="m-ok">Revisar datos</button></div>`, { wide: true });
  const leerM = () => ({ encabezado: $('#m-enc', b).checked, email: +$('#m-email', b).value, nombre: +$('#m-nombre', b).value, apellido: +$('#m-apellido', b).value, institucion: +$('#m-inst', b).value });
  const prev = () => { $('#m-prev', b).innerHTML = aplicar(filas, leerM()).slice(0, 5).map((r) => `<tr><td>${h(r.nombre)}</td><td>${h(r.email)}</td><td>${h(r.institucion)}</td></tr>`).join(''); };
  b.addEventListener('change', prev); prev();
  $('#m-ok', b).onclick = () => revisar(aplicar(filas, leerM()));
}

const EST = { nuevo: ['ok', 'Nuevo'], existente: ['', 'Ya registrado'], diferencia: ['warn', 'Revisar'], duplicado: ['warn', 'Duplicado'], invalido: ['bad', 'Corregir'] };

async function revisar(filas) {
  const b = modal('Revisión de datos', '<p class="muted">Validando…</p>', { wide: true });
  let pv;
  try { pv = await rpc('previsualizar_importacion', { p_filas: filas }); } catch (e) { b.innerHTML = `<p class="error">${h(e.message)}</p>`; return; }
  const s = pv.resumen;
  let solo = s.invalido + s.duplicado + s.diferencia > 0;
  const tabla = () => {
    const rows = solo ? pv.filas.filter((r) => r.estado !== 'nuevo' && r.estado !== 'existente') : pv.filas;
    return rows.slice(0, 1000).map((r) => `<tr data-n="${r.n}"><td class="small muted">${r.n}</td><td><span class="chip ${EST[r.estado][0]}">${EST[r.estado][1]}</span></td>
      <td><input data-k="nombre" value="${h(r.nombre)}"></td><td><input data-k="email" value="${h(r.email)}"></td><td><input data-k="institucion" value="${h(r.institucion)}"></td><td class="small muted">${h(r.msg)}</td></tr>`).join('');
  };
  b.innerHTML = `<div class="row" style="margin-bottom:12px">
      <span class="chip ok">${s.nuevo} nuevos</span><span class="chip">${s.existente} ya registrados</span>
      ${s.diferencia ? `<span class="chip warn">${s.diferencia} con nombre distinto</span>` : ''}<span class="chip warn">${s.duplicado} duplicados</span><span class="chip bad">${s.invalido} por corregir</span></div>
    <label class="check" style="margin-bottom:10px"><input type="checkbox" id="r-solo"${solo ? ' checked' : ''}> Mostrar solo filas a revisar</label>
    <div class="table-wrap" style="max-height:46vh;overflow:auto"><table class="t"><thead><tr><th>#</th><th>Estado</th><th>Nombre</th><th>Correo</th><th>Institución</th><th>Nota</th></tr></thead><tbody id="r-tb">${tabla()}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">Nunca se duplica a nadie: los ya registrados conservan su id, nombre y QR; solo se completan datos vacíos.</p>
    <div class="actions"><button class="btn" id="r-reval" style="margin-right:auto">Revalidar cambios</button><button class="btn" data-cerrar>Cancelar</button>
      <button class="btn primary" id="r-ok"${s.nuevo + s.existente + s.diferencia ? '' : ' disabled'}>Importar ${plural(s.nuevo, 'nuevo', 'nuevos')}</button></div>`;
  $('#r-solo', b).onchange = (e) => { solo = e.target.checked; $('#r-tb', b).innerHTML = tabla(); };
  b.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const n = +e.target.closest('tr').dataset.n;
    filas[n - 1][k] = e.target.value; pv.filas[n - 1][k] = e.target.value;
  });
  $('#r-reval', b).onclick = () => revisar(filas);
  $('#r-ok', b).onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Importando…';
    try {
      const r = await rpc('confirmar_importacion', { p_filas: filas });
      modal('Importación completada', `<div class="row"><span class="chip ok">${r.insertados} agregados</span><span class="chip">${r.actualizados} completados</span>
        <span class="chip warn">${r.resumen.duplicado} duplicados omitidos</span><span class="chip bad">${r.resumen.invalido} inválidos omitidos</span></div>
        <p style="margin-top:14px">Siguiente paso: <b>Generar QR pendientes</b> y luego enviarlos desde <a href="#/correos">Correos</a>.</p>
        <div class="actions"><button class="btn primary" data-cerrar>Aceptar</button></div>`);
      refrescar();
    } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = 'Reintentar'; }
  };
}
