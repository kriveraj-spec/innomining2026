// Primera pantalla: elegir dónde se trabajará. Sin cuentas ni contraseñas.
import { rpc, $ } from '../lib/core.js';

let root;

export async function render(r, c) {
  root = r;
  root.innerHTML = `<div class="center" style="background:#fff">
    <div style="width:100%;max-width:760px">
      <div class="brand" style="padding:0 0 26px;text-align:center;font-size:18px">INNOMINING <span>2026</span></div>
      <h1 style="text-align:center;margin-bottom:8px">¿Dónde vas a trabajar?</h1>
      <p class="muted" style="text-align:center;margin-bottom:28px" id="hoy">&nbsp;</p>
      <div class="modes">
        <a class="mode" href="#/registro">${c.icono('laptop')}<h2>Organizador</h2>
          <p>Laptop. Registrar a quienes llegan sin inscripción o sin su QR, ver participantes, enviar los QR y exportar.</p></a>
        <a class="mode" href="#/escaner">${c.icono('celular')}<h2>Puerta</h2>
          <p>Celular. Escanear los QR de los participantes en la entrada.</p></a>
      </div>
    </div>
  </div>`;
  refrescar();
}

export async function refrescar() {
  try {
    const r = await rpc('ultimos_ingresos');
    const el = $('#hoy', root);
    if (el) el.textContent = `Hoy ${r.hoy} · ${r.ingresos_hoy} de ${r.total} participantes ingresaron`;
  } catch (_) { /* se reintenta luego */ }
}
