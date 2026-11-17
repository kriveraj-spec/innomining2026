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
      ['Participantes', s.total], ['Inscritos previamente', s.previos], ['Registrados en puerta', s.presenciales],
      ['Ingresos Día 1', s.ingresos_dia[0]], ['Ingresos Día 2', s.ingresos_dia[1]], ['Ingresos Día 3', s.ingresos_dia[2]],
      ['Aún sin ningún ingreso', s.nunca_ingresaron], ['QR generados', s.qr_generados],
      ['Correos aceptados por Brevo', s.correo_aceptado], ['Correos pendientes', s.correo_pendiente], ['Correos fallidos', s.correo_fallido + s.correo_incierto]
    ];
    $('#stats', root).innerHTML = st.map(([t, n]) => `<div class="stat"><b>${n}</b><span>${t}</span></div>`).join('');
    $('#act', root).textContent = `Actualizado ${s.actualizado.slice(0, 5)}`;
  } catch (e) { if (!silencioso) toast(e.message, true); }
}
