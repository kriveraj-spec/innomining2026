// Envío de acreditaciones por Brevo (la clave vive solo en la Edge Function).
import { sb, rpc, $, h, toast, modal, cerrarModal, confirmar, progreso, chipCorreo, plural } from '../lib/core.js';
import { correoHtml, correoTexto, ASUNTO } from '../../../supabase/functions/_shared/plantilla.mjs';
import { qrDataUrl, qrPngBlob, blobABase64 } from '../lib/qr.js';

let root;

export async function render(r) {
  root = r;
  root.innerHTML = `
    <div class="page-head"><div><h1>Correos</h1><p>Envío de los QR de acreditación mediante Brevo.</p></div>
      <button class="btn" id="b-prev">Vista previa del correo</button></div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><h2>Conexión con Brevo</h2><a class="btn sm" href="#/configuracion">Configurar</a></div>
      <div id="estado" class="small muted" style="margin-top:10px">Comprobando…</div>
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
      <p class="small muted" style="margin:4px 0 10px">Brevo no respondió a tiempo: pudo haberse enviado. Revise en Brevo (Transaccional → Registros) antes de reenviar, para no duplicar.</p>
      <ul class="list" id="inc"></ul>
    </div>
    <div class="card"><h2 style="margin-bottom:12px">Historial</h2><div class="table-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Destinatario</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="hist"></tbody></table></div></div>`;
  $('#b-pend', root).onclick = () => preguntarYEnviar('pendientes');
  $('#b-fall', root).onclick = () => preguntarYEnviar('fallidos');
  $('#b-prueba', root).onclick = correoPrueba;
  $('#b-prev', root).onclick = () => vistaPrevia();
  $('#inc', root).addEventListener('click', reenviarIncierto);
  await refrescar();
  estadoBrevo();
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
  $('#inc', root).innerHTML = inc.map((p) => `<li><div><div>${h(p.nombre || p.email)}</div><div class="small muted">${h(p.email)}</div></div><button class="btn sm" data-ver="${h(p.id)}">Reenviar</button></li>`).join('');
  $('#hist', root).innerHTML = hist.length ? hist.map((e) => `<tr><td class="mono small">${h(e.fecha)}</td><td>${h(e.destinatario)}${e.tipo === 'prueba' ? ' <span class="chip">prueba</span>' : ''}</td>
    <td>${chipCorreo(e.estado === 'devuelto' ? 'fallido' : e.estado)}</td><td class="small muted">${h(e.error || e.brevo_message_id || '')}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Aún no hay envíos.</td></tr>';
}

let brevoOk = false;
async function estadoBrevo() {
  const box = $('#estado', root);
  try {
    const e = await rpc('estado_brevo');
    brevoOk = e.clave_configurada && !!e.remitente;
    box.innerHTML = brevoOk
      ? `<div class="notice ok">Clave guardada (…${h(e.clave_fin)}) · Remitente: <b>${h(e.remitente)}</b>. Pruebe con «Enviar correo de prueba» a su propio correo.</div>`
      : `<div class="notice warn">Falta ${!e.clave_configurada ? 'la clave de Brevo' : ''}${!e.clave_configurada && !e.remitente ? ' y ' : ''}${!e.remitente ? 'el correo remitente' : ''}. Configúrelo en <a href="#/configuracion">Configuración → Correo (Brevo)</a>.</div>`;
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

let info = null;
async function datosEvento() { if (!info) { const e = await rpc('estado_brevo'); info = { fecha: e.evento_fecha, lugar: e.evento_lugar }; } return info; }

/** Prepara el contenido de un correo: sube el PNG del QR a Storage y arma el HTML con la plantilla. */
async function contenido(x) {
  const ev = await datosEvento();
  const png = await qrPngBlob(x.qr_token);
  const ruta = `${x.qr_token}.png`;
  const { error } = await sb.storage.from('qr').upload(ruta, png, { upsert: true, contentType: 'image/png', cacheControl: '86400' });
  if (error) throw new Error('No se pudo subir la imagen del QR: ' + error.message);
  const imgSrc = sb.storage.from('qr').getPublicUrl(ruta).data.publicUrl;
  const d = { nombre: x.nombre, codigo: x.codigo, imgSrc, fecha: ev.fecha, lugar: ev.lugar };
  return { p_html: correoHtml(d), p_texto: correoTexto(d), p_png_b64: await blobABase64(png) };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Envía por lotes desde la página: reserva → despacha (Brevo vía la base) → lee resultados. Reutilizado desde Inscritos. */
export async function enviarConProgreso({ modo, ids = [], forzar = false, total }) {
  info = null;
  const pb = progreso('Enviando acreditaciones');
  const acc = { aceptados: 0, fallidos: 0, inciertos: 0, devueltos: 0, errores: [] };
  const cola = [...ids];
  let fin = 'Envío terminado.', parar = null;
  const txt = () => `${acc.aceptados} aceptados · ${acc.fallidos} fallidos${acc.inciertos ? ` · ${acc.inciertos} por verificar` : ''}`;
  const sumar = (r) => {
    acc.aceptados += r.aceptados; acc.fallidos += r.fallidos; acc.inciertos += r.inciertos; acc.devueltos += r.devueltos;
    acc.errores.push(...(r.errores || []));
    if (r.detenido && !parar) parar = r.detenido;
    pb.set((100 * (acc.aceptados + acc.fallidos + acc.inciertos)) / Math.max(total || 1, 1), txt());
  };
  try {
    for (let vuelta = 0; vuelta < 1000 && !parar; vuelta++) {
      const lote_ids = modo === 'ids' ? cola.splice(0, 5) : null;
      if (modo === 'ids' && !lote_ids.length) break;
      const r = await rpc('preparar_envios', { p_modo: modo, p_ids: lote_ids, p_forzar: forzar, p_limite: 5 });
      const lote = r.lote || [];
      if (!lote.length) { if (r.cupo <= 0) parar = `Se alcanzó el límite diario configurado (${r.limite} correos). Los pendientes se conservan para mañana.`; if (modo !== 'ids') break; continue; }
      for (const x of lote) await rpc('despachar_envio', { p_envio: x.envio_id, ...(await contenido(x)) });
      pb.set((100 * (acc.aceptados + acc.fallidos)) / Math.max(total || 1, 1), `${txt()} · enviando lote…`);
      await espera(1500);
      sumar(await rpc('procesar_envios'));
    }
    for (let i = 0; i < 40; i++) { const r = await rpc('procesar_envios'); sumar(r); if (!r.en_curso) break; await espera(1500); }
    if (parar) fin = 'Se detuvo: ' + parar;
  } catch (e) {
    fin = 'Se interrumpió: ' + e.message + ' Puede volver a enviar: los ya aceptados no se repiten.';
  }
  pb.set(100, txt());
  pb.fin(`<p style="margin-top:10px">${h(fin)}</p>` + (acc.errores.length ? `<div class="table-wrap" style="margin-top:12px;max-height:30vh"><table class="t"><thead><tr><th>Código</th><th>Correo</th><th>Error</th></tr></thead><tbody>${acc.errores.map((e) => `<tr><td class="mono">${h(e.codigo || '')}</td><td>${h(e.email)}</td><td class="small">${h(e.error)}</td></tr>`).join('')}</tbody></table></div>` : ''));
  return acc;
}

async function correoPrueba() {
  const b = modal('Correo de prueba', `<p class="small muted" style="margin-bottom:14px">Envía la plantilla con un QR de ejemplo (no sirve para ingresar) para comprobar Brevo y ver cómo llega el correo.</p>
    <label class="field"><span>Enviar a</span><input id="p-email" type="email" placeholder="su.correo@gmail.com"></label>
    <p class="error" id="p-err"></p><div class="actions"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" id="p-ok">Enviar prueba</button></div>`);
  $('#p-ok', b).onclick = async () => {
    const btn = $('#p-ok', b); btn.disabled = true; btn.textContent = 'Enviando…'; $('#p-err', b).textContent = '';
    try {
      info = null;
      const c = await contenido({ qr_token: 'prueba' + '0'.repeat(26), nombre: 'Participante de prueba', codigo: 'IM26-PRUEBA' });
      await rpc('enviar_prueba', { p_destinatario: $('#p-email', b).value, ...c });
      let res = null;
      for (let i = 0; i < 20 && !res; i++) { await espera(1500); res = (await rpc('procesar_envios')).prueba; }
      if (res && res.resultado === 'aceptado') { cerrarModal(); toast('Brevo aceptó el correo de prueba. Revise la bandeja (y spam).'); refrescar(); return; }
      $('#p-err', b).textContent = res ? (res.error || 'Brevo no aceptó el correo.') : 'Brevo aún no responde. Revise el Historial en un minuto.';
    } catch (e) { $('#p-err', b).textContent = e.message; }
    btn.disabled = false; btn.textContent = 'Enviar prueba';
  };
}

export async function vistaPrevia(id) {
  const d = await rpc('datos_vista_previa', { p_id: id || null });
  const b = modal('Vista previa del correo', `<p class="small"><span class="muted">Para:</span> ${h(d.email)}<br><span class="muted">Asunto:</span> <b>${h(ASUNTO)}</b></p>
    <iframe class="mail-frame" sandbox title="Vista previa" style="margin-top:12px"></iframe>
    <p class="small muted" style="margin-top:8px">El correo real incluye además el QR como archivo PNG adjunto.</p>`, { wide: true });
  $('iframe', b).srcdoc = correoHtml({ nombre: d.nombre, codigo: d.codigo, imgSrc: qrDataUrl(d.qr_token), fecha: d.evento_fecha, lugar: d.evento_lugar });
}

async function reenviarIncierto(e) {
  const b = e.target.closest('[data-ver]'); if (!b) return;
  if (!(await confirmar('Reenviar', 'Si Brevo sí lo envió, la persona recibirá el correo dos veces. ¿Reenviar de todas formas?', 'Reenviar'))) return;
  await enviarConProgreso({ modo: 'ids', ids: [b.dataset.ver], forzar: true, total: 1 });
  refrescar();
}
