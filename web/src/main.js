import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './style.css';
import { sb, rpc, $, $$, h, toast, hayModal, configurado, getDia } from './lib/core.js';
import * as inicio from './pages/inicio.js';
import * as resumen from './pages/resumen.js';
import * as asistencia from './pages/asistencia.js';
import * as registro from './pages/registro.js';
import * as escaner from './pages/escaner.js';
import * as participantes from './pages/participantes.js';
import * as correos from './pages/correos.js';
import * as configuracion from './pages/configuracion.js';
import * as sorteo from './pages/sorteo.js';

const I = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  resumen: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
  asistencia: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  registro: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  escaner: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  participantes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  correos: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  configuracion: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  sorteo: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4M12 12 5.6 18.4M12 12H3"/><path d="M10 1h4"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  celular: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>'
};
export const icono = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

const RUTAS = {
  inicio: { mod: inicio, titulo: 'Inicio', completa: true },
  resumen: { mod: resumen, titulo: 'Resumen', admin: true },
  registro: { mod: registro, titulo: 'Registro presencial' },
  escaner: { mod: escaner, titulo: 'Escáner', completa: true },
  participantes: { mod: participantes, titulo: 'Inscritos', admin: true },
  asistencia: { mod: asistencia, titulo: 'Asistencia', admin: true },
  correos: { mod: correos, titulo: 'Correos', admin: true },
  sorteo: { mod: sorteo, titulo: 'Sorteo', admin: true },
  configuracion: { mod: configuracion, titulo: 'Configuración', admin: true }
};

const app = $('#app');
const ctx = { perfil: null, icono };
let actual = null;

// Acceso sin cuentas: el link compartido trae un código (#k=…) que se guarda en el dispositivo.
// Internamente se usa una sola cuenta del comité; nadie escribe usuario ni contraseña.
const CUENTA = 'comite@innomining2026.app';
const CLAVE_LOCAL = 'im26-acceso';
const leerCodigo = () => { try { return localStorage.getItem(CLAVE_LOCAL); } catch (_) { return null; } };
const guardarCodigo = (k) => { try { localStorage.setItem(CLAVE_LOCAL, k); } catch (_) { /* sin almacenamiento */ } };

async function entrarConCodigo(k) {
  const { error } = await sb.auth.signInWithPassword({ email: CUENTA, password: k });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Código de acceso incorrecto.' : 'No se pudo conectar: ' + error.message);
  guardarCodigo(k);
}

function pantallaLogin(msg = '') {
  actual = null;
  app.innerHTML = `<div class="center"><form class="login" id="login" novalidate>
    <div class="brand" style="padding:0">INNOMINING <span>2026</span></div>
    <h1>Acceso del comité</h1>
    <p class="muted small" style="margin:-8px 0 18px">Abra el enlace de acceso que le compartieron, o pegue aquí el código.</p>
    <label class="field"><span>Código de acceso</span><input id="l-cod" type="password" autocomplete="off" required></label>
    <button class="btn primary big block" type="submit">Entrar</button>
    <p class="error" id="l-err" style="margin-top:12px">${h(msg)}</p>
  </form></div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('button', e.target); b.disabled = true; b.textContent = 'Entrando…'; $('#l-err').textContent = '';
    try { await entrarConCodigo($('#l-cod').value.trim()); await arrancar(); }
    catch (err) { $('#l-err').textContent = err.message; b.disabled = false; b.textContent = 'Entrar'; }
  });
}

async function arrancar() {
  try {
    ctx.perfil = await rpc('mi_perfil');
  } catch (e) {
    return pantallaLogin(e.code === '42501' ? 'El acceso no está habilitado. Ejecute instalar.sql en Supabase.' : e.message);
  }
  if (!location.hash) location.hash = '#/inicio';
  navegar();
}

function shell(ruta) {
  const admin = ctx.perfil.rol === 'admin';
  const item = (k) => `<a class="nav${k === ruta ? ' on' : ''}" href="#/${k}">${icono(k)}${RUTAS[k].titulo}</a>`;
  app.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="brand">INNOMINING <span>2026</span></div>
      <div style="padding:0 10px 10px"><span class="chip acc" style="font-size:14px;padding:4px 12px">Día ${getDia()}</span></div>
      <a class="nav" href="#/inicio" style="color:var(--muted);font-size:14px">← Cambiar día o modo</a>
      <div class="label">Ingreso al evento</div>
      ${item('registro')}${item('escaner')}
      ${admin ? `<div class="label">Administración</div>${item('resumen')}${item('participantes')}${item('asistencia')}${item('sorteo')}${item('correos')}${item('configuracion')}` : ''}
      <div class="who"><b>${h(ctx.perfil.nombre)}</b><span class="small muted">Datos sincronizados entre todos los dispositivos</span></div>
    </aside>
    <div>
      <div class="topbar"><button class="btn ghost sm" id="menu" aria-label="Menú">${icono('menu').replace('<svg', '<svg width="20" height="20"')}</button><b>${RUTAS[ruta].titulo}</b><span class="chip acc">Día ${getDia()}</span></div>
      <main class="page" id="main"></main>
    </div>
  </div>`;
  $('#menu').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
  document.addEventListener('click', (e) => { const s = $('#side'); if (s && s.classList.contains('open') && !e.target.closest('#side')) s.classList.remove('open'); }, { once: true });
  return $('#main');
}

function navegar() {
  if (!ctx.perfil) return;
  if (actual && actual.salir) actual.salir();
  let ruta = (location.hash.match(/^#\/([a-z]+)/) || [])[1] || 'inicio';
  if (!RUTAS[ruta] || (RUTAS[ruta].admin && ctx.perfil.rol !== 'admin')) ruta = 'inicio';
  if (ruta !== 'inicio' && !getDia()) ruta = 'inicio'; // primero se elige el día
  const r = RUTAS[ruta];
  actual = r.mod;
  document.title = `${r.titulo} · INNOMINING 2026`;
  const root = r.completa ? app : shell(ruta);
  if (r.completa) app.innerHTML = '';
  window.scrollTo(0, 0);
  Promise.resolve(r.mod.render(root, ctx)).catch((e) => toast(e.message, true));
}

window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#k=([A-Za-z0-9_-]{8,})/);
  if (!m) return navegar();
  history.replaceState(null, '', location.pathname + location.search + '#/inicio');
  entrarConCodigo(m[1]).then(arrancar).catch((e) => pantallaLogin(e.message));
});

// Sincronización entre puestos: refresca la vista actual cada 10 s (si está visible y sin un diálogo abierto).
setInterval(() => {
  if (document.visibilityState === 'visible' && !hayModal() && actual && actual.refrescar) actual.refrescar(true);
}, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && actual && actual.refrescar && !hayModal()) actual.refrescar(true);
});

// Si la sesión expira, vuelve a entrar sola con el código guardado.
sb.auth.onAuthStateChange((ev) => {
  if (ev !== 'SIGNED_OUT' || !ctx.perfil) return;
  const k = leerCodigo();
  ctx.perfil = null;
  if (k) entrarConCodigo(k).then(arrancar).catch((e) => pantallaLogin(e.message));
  else pantallaLogin();
});

(async () => {
  if (!configurado) {
    app.innerHTML = '<div class="center"><div class="login"><h1>Falta configuración</h1><p>Defina VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY al compilar la web (ver README).</p></div></div>';
    return;
  }
  const m = location.hash.match(/^#k=([A-Za-z0-9_-]{8,})/);
  if (m) history.replaceState(null, '', location.pathname + location.search + '#/inicio'); // el código no queda visible
  const { data } = await sb.auth.getSession();
  if (data.session && !m) return arrancar();
  const k = m ? m[1] : leerCodigo();
  if (!k) return pantallaLogin();
  try { await entrarConCodigo(k); await arrancar(); } catch (e) { pantallaLogin(e.message); }
})();
