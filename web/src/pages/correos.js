// Envío de acreditaciones por Brevo (la clave vive solo en la Edge Function).
import { rpc, fn, $, h, toast, modal, cerrarModal, confirmar, progreso, chipCorreo, plural } from '../lib/core.js';
import { correoHtml, ASUNTO } from '../../../supabase/functions/_shared/plantilla.mjs';
import { qrDataUrl } from '../lib/qr.js';

let root;

export async function render(r) {
  root = r;
  root.innerHTML = `
    <div class="page-head"><div><h1>Correos</h1><p>Envío de los QR de acreditación mediante Brevo.</p></div>
      <button class="btn" id="b-prev">Vista previa del correo</button></div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><h2>Conexión con Brevo</h2><button class="btn sm" id="b-estado">Verificar configuración</button></div>
      <div id="estado" class="small muted" style="margin-top:10px">Presione «Verificar configuración» para comprobar la clave, la cuenta y el remitente.</div>
    </div>
    <div class="card">
      <h2 style="margin-bottom:14px">Envíos</h2>
      <div class="stats" id="st"></div>
      <div class="row" style="margin-top:18px">
        <button class="btn primary" id="b-pend">Enviar QR pendientes</button>
        <button class="btn" id="b-fall">Reintentar fallidos</button>
        <button class="btn" id="b-prueba">Enviar correo de prueba</button>
      </div>
      <p class="small muted" style="margin-top:14px">«Aceptado por Brevo» significa que Brevo recibió el envío; no confirma que llegó a la bandeja. «Entregado» aparece solo si Brevo lo confirma (webhook). Para enviar a personas concretas, selecciónelas en <a href="#/participantes">Participantes</a>.</p>
    </div>
    <div class="card" id="c-inc" hidden>
      <h2>Por verificar</h2>
      <p class="small muted" style="margin:4px 0 10px">Brevo no respondió a tiempo: pudo haberse enviado. Verifique antes de reenviar para no duplicar.</p>
      <ul class="list" id="inc"></ul>
    </div>
    <div class="card"><h2 style="margin-bottom:12px">Historial</h2><div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Destinatario</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="hist"></tbody></table></div></div>`;
  $('#b-estado', root).onclick = verificarBrevo;
  $('#b-pend', root).onclick = () => preguntarYEnviar('pendientes');
  $('#b-fall', root).onclick = () => preguntarYEnviar('fallidos');
  $('#b-prueba', root).onclick = correoPrueba;
  $('#b-prev', root).onclick = () => vistaPrevia();
  $('#inc', root).addEventListener('click', verificarIncierto);
  await refrescar();
}

let resumenActual = null;
export async function refrescar() {
  const [s, hist, lista] = await Promise.all([rpc('resumen'), rpc('historial_envios', { p_limite: 60 }), rpc('listar_participantes')]);
  resumenActual = s;
  $('#st', root).innerHTML = [
    ['Pendientes', s.correo_pendiente], ['Aceptados por Brevo', s.correo_aceptado], ['Entregados (confirmados)', s.correo_entregado],
    ['Fallidos', s.correo_fallido], ['Por verificar', s.correo_incierto], [`Enviados hoy / límite`, `${s.envios_hoy} / ${s.limite_diario}`]
  ].map(([t, n]) => `<div class="stat"><b>${n}</b><span>${t}</span></div>`).join('');
  $('#b-pend', root).textContent = `Enviar QR pendientes (${s.correo_pendiente})`;
  $('#b-pend', root).disabled = !s.correo_pendiente;
  $('#b-fall', root).textContent = `Reintentar fallidos (${s.correo_fallido})`;
  $('#b-fall', root).disabled = !s.correo_fallido;
  const inc = lista.filter((p) => p.correo_estado === 'incierto');
  $('#c-inc', root).hidden = !inc.length;
  $('#inc', root).innerHTML = inc.map((p) => `<li><div><div>${h(p.nombre || p.email)}</div><div class="small muted">${h(p.email)}</div></div><button class="btn sm" data-ver="${h(p.id)}">Verificar en Brevo</button></li>`).join('');
  $('#hist', root).innerHTML = hist.length ? hist.map((e) => `<tr><td class="mono small">${h(e.fecha)}</td><td>${h(e.destinatario)}${e.tipo === 'prueba' ? ' <span class="chip">prueba</span>' : ''}</td>
    <td>${chipCorreo(e.estado === 'devuelto' ? 'fallido' : e.estado)}</td><td class="small muted">${h(e.error || e.brevo_message_id || '')}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Aún no hay envíos.</td></tr>';
}

async function verificarBrevo() {
  const box = $('#estado', root);
  box.innerHTML = 'Consultando Brevo…';
  try {
    const e = await fn('enviar-qr', { accion: 'estado' });
    let html = '';
    if (e.cuenta) {
      html += `<dl class="kv" style="margin-bottom:12px"><dt>Cuenta</dt><dd>${h(e.cuenta.email)}${e.cuenta.empresa ? ' · ' + h(e.cuenta.empresa) : ''}</dd>
        <dt>Plan</dt><dd>${e.cuenta.planes.map((p) => `${h(p.tipo)} · ${h(p.creditos)} ${h(p.tipoCreditos || '')}`).join('<br>')}</dd>
        <dt>Remitente</dt><dd>${h(e.remitente || '—')} ${e.remitente_verificado ? '<span class="chip ok">verificado</span>' : '<span class="chip bad">no verificado</span>'}</dd></dl>`;
    }
    html += e.problemas.length ? `<div class="notice bad">${e.problemas.map(h).join('<br>')}</div>` : '<div class="notice ok">Todo listo: la clave funciona y el remitente está verificado.</div>';
    box.innerHTML = html;
  } catch (err) { box.innerHTML = `<div class="notice bad">${h(err.message)}</div>`; }
}

async function preguntarYEnviar(modo) {
  const s = resumenActual || (await rpc('resumen'));
  const n = modo === 'pendientes' ? s.correo_pendiente : s.correo_fallido;
  const cupo = Math.max(0, s.limite_diario - s.envios_hoy);
  const ok = await confirmar('Enviar acreditaciones',
    `Se enviará el QR a <b>${plural(n, 'participante', 'participantes')}</b> (${modo === 'pendientes' ? 'pendientes' : 'reintento de fallidos'}).<br>
     Cupo disponible hoy: <b>${cupo}</b> de ${s.limite_diario}.${n > cupo ? ' El resto quedará pendiente para otro día.' : ''}<br>
     Nunca se reenvía a quien ya figura como aceptado.`, `Enviar ${Math.min(n, cupo)}`);
  if (ok) { await enviarConProgreso({ modo, total: Math.min(n, cupo) }); refrescar(); }
}

/** Envía por lotes llamando a la Edge Function hasta terminar. Reutilizado desde Participantes. */
export async function enviarConProgreso({ modo, ids = [], forzar = false, total }) {
  const pb = progreso('Enviando acreditaciones');
  const acc = { aceptados: 0, fallidos: 0, inciertos: 0, devueltos: 0, errores: [] };
  const cola = [...ids];
  let fin = 'Envío terminado.';
  const txt = () => `${acc.aceptados} aceptados · ${acc.fallidos} fallidos${acc.inciertos ? ` · ${acc.inciertos} por verificar` : ''}`;
  try {
    for (let vuelta = 0; vuelta < 500; vuelta++) {
      const lote = modo === 'ids' ? cola.splice(0, 10) : null;
      if (modo === 'ids' && !lote.length) break;
      const r = await fn('enviar-qr', { accion: 'enviar', modo, ids: lote, forzar });
      acc.aceptados += r.aceptados; acc.fallidos += r.fallidos; acc.inciertos += r.inciertos; acc.devueltos += r.devueltos;
      acc.errores.push(...r.errores);
      pb.set((100 * (acc.aceptados + acc.fallidos + acc.inciertos)) / Math.max(total || 1, 1), txt());
      if (r.detenido) { fin = 'Se detuvo: ' + r.detenido; break; }
      if (modo !== 'ids' && r.reservados === 0) break;
    }
  } catch (e) {
    fin = 'Se interrumpió: ' + e.message + ' Puede volver a enviar: los ya aceptados no se repiten.';
  }
  pb.set(100, txt());
  pb.fin(`<p style="margin-top:10px">${h(fin)}</p>` + (acc.errores.length ? `<div class="table-wrap" style="margin-top:12px;max-height:30vh"><table class="t"><thead><tr><th>Código</th><th>Correo</th><th>Error</th></tr></thead><tbody>${acc.errores.map((e) => `<tr><td class="mono">${h(e.codigo)}</td><td>${h(e.email)}</td><td class="small">${h(e.error)}</td></tr>`).join('')}</tbody></table></div>` : ''));
  return acc;
}

async function correoPrueba() {
  const b = modal('Correo de prueba', `<p class="small muted" style="margin-bottom:14px">Envía la plantilla con un QR de ejemplo (no válido para ingresar) para comprobar Brevo y cómo se ve el correo.</p>
    <label class="field"><span>Enviar a</span><input id="p-email" type="email" placeholder="comite@ejemplo.com"></label>
    <p class="error" id="p-err"></p><div class="actions"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" id="p-ok">Enviar prueba</button></div>`);
  $('#p-ok', b).onclick = async () => {
    const btn = $('#p-ok', b); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await fn('enviar-qr', { accion: 'prueba', destinatario: $('#p-email', b).value });
      if (r.resultado === 'aceptado') { cerrarModal(); toast('Brevo aceptó el correo de prueba. Revise la bandeja (y spam).'); refrescar(); }
      else { $('#p-err', b).textContent = r.error || 'No se pudo enviar.'; btn.disabled = false; btn.textContent = 'Enviar prueba'; }
    } catch (e) { $('#p-err', b).textContent = e.message; btn.disabled = false; btn.textContent = 'Enviar prueba'; }
  };
}

export async function vistaPrevia(id) {
  const d = await rpc('datos_vista_previa', { p_id: id || null });
  const b = modal('Vista previa del correo', `<p class="small"><span class="muted">Para:</span> ${h(d.email)}<br><span class="muted">Asunto:</span> <b>${h(ASUNTO)}</b></p>
    <iframe class="mail-frame" sandbox title="Vista previa" style="margin-top:12px"></iframe>
    <p class="small muted" style="margin-top:8px">El correo real incluye además el QR como archivo PNG adjunto.</p>`, { wide: true });
  $('iframe', b).srcdoc = correoHtml({ nombre: d.nombre, codigo: d.codigo, imgSrc: qrDataUrl(d.qr_token) });
}

async function verificarIncierto(e) {
  const b = e.target.closest('[data-ver]'); if (!b) return;
  b.disabled = true; b.textContent = 'Consultando…';
  try {
    const r = await fn('enviar-qr', { accion: 'verificar', participante_id: b.dataset.ver });
    toast(r.resultado === 'aceptado' ? 'Brevo sí registró el envío: marcado como aceptado.' : 'Brevo no lo registra: quedó pendiente para reenviar.');
    refrescar();
  } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Verificar en Brevo'; }
}
