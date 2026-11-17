import { rpc, $, h, toast } from '../lib/core.js';

let root, cfg, brevo;

export async function render(r) {
  root = r;
  [cfg, brevo] = await Promise.all([rpc('obtener_configuracion'), rpc('estado_brevo')]);
  pintar();
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

function pintar() {
  root.innerHTML = `
    <div class="page-head"><div><h1>Configuración</h1><p>Fechas del congreso, correos y límite diario.</p></div></div>
    <div class="card">
      <h2>Fechas del congreso</h2>
      <p class="small muted" style="margin:4px 0 14px">Cada participante usa el mismo QR todos los días; la asistencia se registra una vez por fecha (hora de Lima).</p>
      <div class="row" id="fechas" style="margin-bottom:12px"></div>
      <div class="row"><input type="date" id="nueva" style="width:auto"><button class="btn sm" id="agregar">Agregar fecha</button></div>
      <label class="check" style="margin-top:18px"><input type="checkbox" id="fuera"> Permitir registrar ingresos en otras fechas (modo prueba)</label>
      <p class="small muted" style="margin-top:6px">Desactívelo antes del evento: así nadie registra asistencia en una fecha equivocada.</p>
    </div>
    <div class="card">
      <h2>Límite diario de correos</h2>
      <p class="small muted" style="margin:4px 0 14px">El plan gratuito de Brevo permite 300 envíos por día. Al alcanzarlo, los pendientes se conservan para el día siguiente.</p>
      <input type="number" id="limite" min="1" max="100000" style="width:160px">
    </div>
    <div class="row"><button class="btn primary" id="guardar">Guardar cambios</button></div>
    <div class="card" style="margin-top:24px">
      <h2>Correo (Brevo)</h2>
      <p class="small muted" style="margin:4px 0 14px">La clave se guarda cifrada en el servidor y nunca se vuelve a mostrar. Antes de enviar: verifique el remitente en Brevo y desactive el bloqueo de IP desconocidas (Brevo → Seguridad → IP autorizadas).</p>
      <p style="margin-bottom:14px" id="b-est"></p>
      <label class="field"><span>Clave API de Brevo <i>(déjelo vacío para conservar la actual)</i></span><input id="b-clave" type="password" autocomplete="off" placeholder="xkeysib-…"></label>
      <label class="field"><span>Correo remitente <i>(verificado en Brevo)</i></span><input id="b-rem" type="email" placeholder="acreditacion@ejemplo.com"></label>
      <label class="field"><span>Nombre del remitente</span><input id="b-nom" maxlength="80"></label>
      <div class="row"><button class="btn primary" id="b-guardar">Guardar datos de Brevo</button><a class="btn" href="#/correos">Ir a Correos para verificar</a></div>
    </div>
    </div>`;
  $('#b-est', root).innerHTML = brevo.clave_configurada
    ? `<span class="chip ok">Clave guardada · termina en ${h(brevo.clave_fin)}</span>` : '<span class="chip warn">Sin clave de Brevo: los correos quedan pendientes</span>';
  $('#b-rem', root).value = brevo.remitente;
  $('#b-nom', root).value = brevo.nombre;
  $('#b-guardar', root).onclick = async () => {
    try {
      brevo = await rpc('guardar_brevo', { p_clave: $('#b-clave', root).value, p_remitente: $('#b-rem', root).value, p_nombre: $('#b-nom', root).value });
      $('#b-clave', root).value = '';
      toast('Datos de Brevo guardados');
      pintar();
    } catch (e) { toast(e.message, true); }
  };
  $('#fuera', root).checked = cfg.permitir_fuera_de_fecha;
  $('#limite', root).value = cfg.limite_diario_correos;
  pintarFechas();
  $('#agregar', root).onclick = () => {
    const v = $('#nueva', root).value;
    if (!v) return;
    if (!cfg.fechas_evento.includes(v)) cfg.fechas_evento = [...cfg.fechas_evento, v].sort();
    pintarFechas();
  };
  $('#fechas', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]'); if (!b) return;
    cfg.fechas_evento = cfg.fechas_evento.filter((f) => f !== b.dataset.quitar);
    pintarFechas();
  });
  $('#guardar', root).onclick = async () => {
    try {
      cfg = await rpc('guardar_configuracion', { p_fechas: cfg.fechas_evento, p_permitir_fuera_de_fecha: $('#fuera', root).checked, p_limite: Number($('#limite', root).value) });
      toast('Configuración guardada');
      pintar();
    } catch (e) { toast(e.message, true); }
  };
}

function pintarFechas() {
  $('#fechas', root).innerHTML = cfg.fechas_evento.length
    ? cfg.fechas_evento.map((f) => `<span class="chip acc">${fmt(f)} <button class="link" data-quitar="${h(f)}" aria-label="Quitar">×</button></span>`).join('')
    : '<span class="small muted">Sin fechas configuradas.</span>';
}
