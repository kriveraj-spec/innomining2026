import { rpc, $, h, toast } from '../lib/core.js';

let root, cfg, brevo;

export async function render(r) {
  root = r;
  [cfg, brevo] = await Promise.all([rpc('obtener_configuracion'), rpc('estado_brevo')]);
  pintar();
}

function pintar() {
  root.innerHTML = `
    <div class="page-head"><div><h1>Configuración</h1><p>Correo de acreditación y límite de envíos.</p></div></div>
    <div class="card">
      <h2>Datos del congreso en el correo</h2>
      <p class="small muted" style="margin:4px 0 14px">Opcional. Si los completa, aparecen en el correo junto al QR.</p>
      <label class="field"><span>Fecha</span><input id="e-fecha" maxlength="120" placeholder="Ej.: 18, 19 y 20 de noviembre de 2026"></label>
      <label class="field"><span>Lugar</span><input id="e-lugar" maxlength="150" placeholder="Ej.: Auditorio principal, UNSA – Arequipa"></label>
      <div class="row"><button class="btn primary" id="e-guardar">Guardar</button><a class="btn" href="#/correos">Ver vista previa del correo</a></div>
    </div>
    <div class="card">
      <h2>Correo (Brevo)</h2>
      <p class="small muted" style="margin:4px 0 14px">La clave se guarda cifrada en el servidor y nunca se vuelve a mostrar. Antes de enviar: verifique el remitente en Brevo y desactive el bloqueo de IP desconocidas (Brevo → Seguridad → IP autorizadas).</p>
      <p style="margin-bottom:14px" id="b-est"></p>
      <label class="field"><span>Clave API de Brevo <i>(déjelo vacío para conservar la actual)</i></span><input id="b-clave" type="password" autocomplete="off" placeholder="xkeysib-…"></label>
      <label class="field"><span>Correo remitente <i>(verificado en Brevo)</i></span><input id="b-rem" type="email" placeholder="acreditacion@ejemplo.com"></label>
      <label class="field"><span>Nombre del remitente</span><input id="b-nom" maxlength="80"></label>
      <div class="row"><button class="btn primary" id="b-guardar">Guardar datos de Brevo</button><a class="btn" href="#/correos">Ir a Correos para verificar</a></div>
    </div>
    <div class="card">
      <h2>Límite diario de correos</h2>
      <p class="small muted" style="margin:4px 0 14px">El plan gratuito de Brevo permite 300 envíos por día. Al alcanzarlo, los pendientes se conservan para el día siguiente.</p>
      <div class="row"><input type="number" id="limite" min="1" max="100000" style="width:160px"><button class="btn" id="l-guardar">Guardar</button></div>
    </div>`;
  $('#e-fecha', root).value = brevo.evento_fecha || '';
  $('#e-lugar', root).value = brevo.evento_lugar || '';
  $('#e-guardar', root).onclick = async () => {
    try { brevo = await rpc('guardar_info_evento', { p_fecha: $('#e-fecha', root).value, p_lugar: $('#e-lugar', root).value }); toast('Datos del congreso guardados'); pintar(); }
    catch (e) { toast(e.message, true); }
  };
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
  $('#limite', root).value = cfg.limite_diario_correos;
  $('#l-guardar', root).onclick = async () => {
    try {
      cfg = await rpc('guardar_configuracion', { p_fechas: cfg.fechas_evento, p_permitir_fuera_de_fecha: true, p_limite: Number($('#limite', root).value) });
      toast('Límite guardado');
    } catch (e) { toast(e.message, true); }
  };
}
