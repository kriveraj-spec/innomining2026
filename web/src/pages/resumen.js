import { rpc, $, h, toast } from '../lib/core.js';

let root, ctx;

export async function render(r, c) {
  root = r; ctx = c;
  root.innerHTML = `
    <div class="page-head"><div><h1>Resumen</h1><p>Cifras en vivo de ambos puestos.</p></div><span class="small muted" id="act"></span></div>
    <div id="aviso" style="margin-bottom:16px"></div>
    <div class="stats" id="stats"></div>`;
  await refrescar();
}

export async function refrescar(silencioso) {
  try {
    const s = await rpc('resumen');
    const st = [
      ['Participantes', s.total], ['Inscritos previamente', s.previos], ['Registrados presencialmente', s.presenciales],
      ['QR generados', s.qr_generados], ['Correos aceptados por Brevo', s.correo_aceptado], ['Correos pendientes', s.correo_pendiente],
      ['Correos fallidos', s.correo_fallido + s.correo_incierto], ['Ingresaron hoy', s.ingresos_hoy], ['Sin ingreso hoy', s.sin_ingreso_hoy]
    ];
    $('#stats', root).innerHTML = st.map(([t, n]) => `<div class="stat"><b>${n}</b><span>${t}</span></div>`).join('');
    $('#act', root).textContent = `Hoy ${s.hoy} · actualizado ${s.actualizado.slice(0, 5)}`;
    const av = $('#aviso', root);
    if (s.es_fecha_evento) av.innerHTML = '';
    else if (s.permitir_fuera_de_fecha) av.innerHTML = `<div class="notice warn">Hoy (${h(s.hoy)}) no es una fecha configurada del congreso. Los ingresos se registran igual porque está activo el <b>modo prueba</b>${ctx.perfil.rol === 'admin' ? ' (Configuración)' : ''}.</div>`;
    else av.innerHTML = `<div class="notice bad">Hoy (${h(s.hoy)}) no es una fecha del congreso: no se pueden registrar ingresos. Fechas: ${h(s.fechas_evento.join(', ') || 'sin configurar')}.</div>`;
  } catch (e) { if (!silencioso) toast(e.message, true); }
}
