// Pantalla inicial: 1) elegir Día 1, 2 o 3; 2) elegir Organizador o Puerta.
import { rpc, $, getDia, setDia, setModo } from '../lib/core.js';

let root, ctx, paso = 'dia';

export async function render(r, c) {
  root = r; ctx = c; paso = 'dia';
  pintar();
}

function pintar() {
  const dia = getDia();
  const cab = `<div class="brand" style="padding:0 0 26px;text-align:center;font-size:18px">INNOMINING <span>2026</span></div>`;
  if (paso === 'dia') {
    root.innerHTML = `<div class="center" style="background:#fff"><div style="width:100%;max-width:760px">${cab}
      <h1 style="text-align:center;margin-bottom:8px">¿Qué día del congreso es?</h1>
      <p class="muted" style="text-align:center;margin-bottom:28px">Los ingresos se registrarán en el día que elijas.</p>
      <div class="dias">${[1, 2, 3].map((d) => `<button class="dia${d === dia ? ' on' : ''}" data-d="${d}"><span>Día</span><b>${d}</b></button>`).join('')}</div>
    </div></div>`;
    root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { setDia(Number(b.dataset.d)); paso = 'modo'; pintar(); }));
    return;
  }
  root.innerHTML = `<div class="center" style="background:#fff"><div style="width:100%;max-width:760px">${cab}
    <p style="text-align:center;margin-bottom:10px"><span class="chip acc" style="font-size:15px;padding:4px 14px">Día ${dia}</span> <button class="link small" id="cambiar">cambiar día</button></p>
    <h1 style="text-align:center;margin-bottom:8px">¿Dónde vas a trabajar?</h1>
    <p class="muted" style="text-align:center;margin-bottom:28px" id="hoy">&nbsp;</p>
    <div class="modes">
      <a class="mode" href="#/registro">${ctx.icono('laptop')}<h2>Organizador</h2>
        <p>Laptop. Registrar a quienes llegan sin inscripción o sin su QR, ver participantes, enviar los QR y exportar.</p></a>
      <a class="mode" href="#/escaner" data-modo="entrada">${ctx.icono('celular')}<h2>Puerta · Entrada</h2>
        <p>Celular. Escanear los QR cuando los participantes llegan.</p></a>
      <a class="mode salida" href="#/escaner" data-modo="salida">${ctx.icono('celular')}<h2>Puerta · Salida</h2>
        <p>Celular. Al final del día (desde las 12:00 aprox.), volver a escanear los QR para la segunda toma de asistencia.</p></a>
    </div>
  </div></div>`;
  $('#cambiar', root).onclick = () => { paso = 'dia'; pintar(); };
  root.querySelectorAll('[data-modo]').forEach((a) => (a.onclick = () => setModo(a.dataset.modo)));
  refrescar();
}

export async function refrescar() {
  if (paso !== 'modo') return;
  try {
    const r = await rpc('ultimos_ingresos', { p_dia: getDia() });
    const el = $('#hoy', root);
    if (el) el.textContent = `Día ${r.dia}: ${r.ingresos} de ${r.total} participantes ingresaron`;
  } catch (_) { /* se reintenta luego */ }
}
