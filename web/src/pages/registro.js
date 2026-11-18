// Puesto laptop: registro presencial en un paso + búsqueda de inscritos sin QR.
import { rpc, $, h, toast, modal, cerrarModal, getDia } from '../lib/core.js';

let root, ultimo = null, tBusca;

export async function render(r) {
  root = r;
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Registro presencial</h1><p>Para quienes llegan sin inscripción o sin su QR.</p></div>
      <span class="chip acc" id="cnt">Día ${getDia()}</span>
    </div>
    <div class="grid2">
      <div class="card">
        <h2 style="margin-bottom:18px">+ Registrar participante</h2>
        <form id="f" novalidate autocomplete="off">
          <label class="field"><span>Nombre completo</span><input id="f-nombre" maxlength="150" required></label>
          <label class="field"><span>Correo electrónico</span><input id="f-email" type="email" inputmode="email" maxlength="254" required></label>
          <label class="field"><span>Universidad <i>(opcional)</i></span><input id="f-inst" maxlength="150"></label>
          <button class="btn primary big block" id="f-btn" type="submit">Registrar e ingresar</button>
        </form>
        <div id="res" aria-live="polite"></div>
      </div>
      <div>
        <div class="card">
          <h2>¿Ya está inscrito y no tiene su QR?</h2>
          <p class="small muted" style="margin:4px 0 14px">Busque por nombre, correo o código y registre su ingreso.</p>
          <input id="q" type="search" placeholder="Mínimo 3 letras">
          <ul class="list" id="qres" style="margin-top:8px"></ul>
        </div>
        <div class="card">
          <h2 style="margin-bottom:6px">Últimos ingresos · Día ${getDia()}</h2>
          <ul class="list" id="feed"><li class="muted">Cargando…</li></ul>
        </div>
      </div>
    </div>`;
  $('#f', root).addEventListener('submit', (e) => { e.preventDefault(); registrar(false); });
  $('#q', root).addEventListener('input', () => {
    clearTimeout(tBusca);
    const q = $('#q', root).value.trim();
    if (q.length < 3) { $('#qres', root).innerHTML = ''; return; }
    tBusca = setTimeout(() => buscar(q), 300);
  });
  $('#qres', root).addEventListener('click', ingresoPorId);
  $('#res', root).addEventListener('click', clicResultado);
  setTimeout(() => $('#f-nombre', root).focus(), 30);
  await refrescar();
}

export async function refrescar() {
  try {
    const r = await rpc('ultimos_ingresos', { p_dia: getDia() });
    $('#cnt', root).textContent = `Día ${r.dia} · ${r.ingresos} de ${r.total} ingresaron`;
    $('#feed', root).innerHTML = r.ultimos.length ? r.ultimos.map((x) => `<li><div><div>${h(x.nombre)}</div><div class="small muted">${h(x.codigo)} · ${x.metodo === 'escaneo' ? 'escaneo' : 'registro presencial'} · ${h(x.operador || '')}</div></div><span class="mono small">${h(x.hora)}</span></li>`).join('')
      : '<li class="muted">Aún no hay ingresos en este día.</li>';
  } catch (_) { /* se reintenta en el siguiente ciclo */ }
}

function datos() {
  return { p_nombre: $('#f-nombre', root).value, p_email: $('#f-email', root).value, p_institucion: $('#f-inst', root).value };
}

function mostrar(cls, t1, t2, t3, botones = '') {
  $('#res', root).innerHTML = `<div class="result ${cls}"><div class="t1">${t1}</div>${t2 ? `<div class="t2">${h(t2)}</div>` : ''}<div class="t3">${t3}</div>${botones ? `<div class="row">${botones}</div>` : ''}</div>`;
}

function limpiar() { $('#f', root).reset(); $('#f-nombre', root).focus(); }

async function registrar(confirmar, d) {
  d = d || datos();
  if (!d.p_nombre.trim()) { $('#f-nombre', root).focus(); return mostrar('bad', 'FALTA EL NOMBRE', '', 'El nombre completo es obligatorio.'); }
  if (!d.p_email.trim()) { $('#f-email', root).focus(); return mostrar('bad', 'FALTA EL CORREO', '', 'El correo es necesario para enviarle su QR.'); }
  const b = $('#f-btn', root); b.disabled = true; b.textContent = 'Registrando…';
  try {
    const r = await rpc('registrar_presencial', { ...d, p_confirmar: confirmar, p_dia: getDia() });
    if (r.estado === 'nuevo' || r.estado === 'ok') {
      ultimo = r;
      mostrar('ok', '✓ INGRESO REGISTRADO', r.nombre,
        `Día ${r.dia} · ${h(r.codigo)} · ${h(r.fecha)} · ${h(r.hora)}<br>${r.estado === 'nuevo'
          ? 'Nuevo participante. Su QR quedó guardado y <b>pendiente de envío</b> por correo.'
          : 'Inscripción previa: ingreso confirmado. Usará su mismo QR.'}`,
        r.estado === 'nuevo' ? '<button class="btn sm" data-corregir>Corregir datos</button>' : '');
      limpiar(); refrescar();
    } else if (r.estado === 'ya') {
      mostrar('ya', `INGRESO YA REGISTRADO EN EL DÍA ${r.dia}`, r.nombre, `${h(r.codigo)} · ingresó a las <b>${h(r.hora)}</b> (${h(r.metodo)}${r.operador ? ', ' + h(r.operador) : ''}). No se creó otro registro.`);
      limpiar();
    } else if (r.estado === 'existe') {
      mostrar('ya', 'ESTE CORREO YA ESTÁ REGISTRADO', r.nombre,
        `${h(r.codigo)}${r.institucion ? ' · ' + h(r.institucion) : ''} · ${r.origen === 'previo' ? 'inscripción previa' : 'registro presencial'}<br>Verifique que sea la misma persona. No se creará un duplicado.`,
        '<button class="btn primary sm" data-confirmar>Registrar ingreso</button><button class="btn sm" data-otro>No es esta persona</button>');
      $('#res [data-confirmar]', root).onclick = () => registrar(true, d);
      $('#res [data-otro]', root).onclick = () => { $('#res', root).innerHTML = ''; $('#f-email', root).select(); };
    }
  } catch (e) {
    mostrar('bad', 'NO SE REGISTRÓ', '', h(e.message));
  } finally { b.disabled = false; b.textContent = 'Registrar e ingresar'; }
}

function clicResultado(e) {
  if (!e.target.closest('[data-corregir]') || !ultimo) return;
  const r = ultimo;
  const b = modal(`Corregir · ${r.codigo}`, `<form id="c" novalidate>
    <label class="field"><span>Nombre completo</span><input id="c-n" value="${h(r.nombre)}" maxlength="150"></label>
    <label class="field"><span>Correo electrónico</span><input id="c-e" type="email" maxlength="254" placeholder="Escriba el correo correcto"></label>
    <label class="field"><span>Universidad <i>(opcional)</i></span><input id="c-i" value="${h(r.institucion)}" maxlength="150"></label>
    <p class="error" id="c-err"></p>
    <div class="actions"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('#c', b).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const u = await rpc('actualizar_participante', { p_id: r.id, p_nombre: $('#c-n', b).value, p_email: $('#c-e', b).value, p_institucion: $('#c-i', b).value });
      ultimo = { ...r, nombre: u.nombre, institucion: u.institucion };
      cerrarModal(); toast('Datos corregidos. El QR no cambia.'); refrescar();
    } catch (err) { $('#c-err', b).textContent = err.message; }
  });
}

async function buscar(q) {
  const ul = $('#qres', root);
  ul.innerHTML = '<li class="muted small">Buscando…</li>';
  try {
    const rs = await rpc('buscar_participantes', { p_q: q, p_dia: getDia() });
    ul.innerHTML = rs.length ? rs.map((x) => `<li><div><div>${h(x.nombre)}</div><div class="small muted">${h(x.codigo)} · ${h(x.email)}${x.institucion ? ' · ' + h(x.institucion) : ''}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${x.ingreso_dia ? `<span class="chip ok">Ingresó ${h(x.ingreso_dia.slice(0, 5))}</span>` : `<button class="btn sm primary" data-id="${h(x.id)}">Registrar ingreso</button>`}
      ${x.salida_dia ? `<span class="chip">Salió ${h(x.salida_dia.slice(0, 5))}</span>` : `<button class="btn sm" data-sal="${h(x.id)}">Marcar salida</button>`}</div></li>`).join('')
      : '<li class="muted small">Sin resultados. Si no está inscrito, regístrelo con el formulario.</li>';
  } catch (e) { ul.innerHTML = `<li class="error">${h(e.message)}</li>`; }
}

async function ingresoPorId(e) {
  const bs = e.target.closest('[data-sal]');
  if (bs) {
    bs.disabled = true; bs.textContent = 'Registrando…';
    try {
      const r = await rpc('registrar_salida_id', { p_id: bs.dataset.sal, p_dia: getDia() });
      if (r.estado === 'ok') mostrar('ok', '✓ SALIDA REGISTRADA', r.nombre, `Día ${r.dia} · ${h(r.codigo)} · ${h(r.hora)}${r.entrada ? '' : '<br>No tenía entrada registrada hoy.'}`);
      else mostrar('ya', `SALIDA YA REGISTRADA EN EL DÍA ${r.dia}`, r.nombre, `Salió a las <b>${h(r.hora)}</b>.`);
      buscar($('#q', root).value.trim());
    } catch (err) { toast(err.message, true); bs.disabled = false; bs.textContent = 'Marcar salida'; }
    return;
  }
  const b = e.target.closest('[data-id]'); if (!b) return;
  b.disabled = true; b.textContent = 'Registrando…';
  try {
    const r = await rpc('registrar_ingreso_id', { p_id: b.dataset.id, p_dia: getDia() });
    if (r.estado === 'ok') mostrar('ok', '✓ INGRESO REGISTRADO', r.nombre, `Día ${r.dia} · ${h(r.codigo)} · ${h(r.fecha)} · ${h(r.hora)}<br>Inscrito previamente; conserva su mismo QR.`);
    else mostrar('ya', `INGRESO YA REGISTRADO EN EL DÍA ${r.dia}`, r.nombre, `Ingresó a las <b>${h(r.hora)}</b>.`);
    buscar($('#q', root).value.trim()); refrescar();
  } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Registrar ingreso'; }
}
