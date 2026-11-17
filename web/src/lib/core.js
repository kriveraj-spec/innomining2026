// Conexión con Supabase y utilidades de interfaz.
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL || window.location.origin;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sin-configurar';
export const configurado = !!import.meta.env.VITE_SUPABASE_URL || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

export const sb = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'im26-sesion' } });

function traducir(msg) {
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return 'Sin conexión con el servidor. Revise internet e intente de nuevo.';
  if (/JWT|jwt expired|invalid claim/i.test(msg)) return 'Su sesión expiró. Vuelva a iniciar sesión.';
  return msg;
}

/** Llama a una función SQL (RPC). Lanza Error con mensaje legible. */
export async function rpc(fn, args = {}) {
  let r;
  try { r = await sb.rpc(fn, args); }
  catch (e) { throw new Error(traducir(String(e.message || e))); }
  if (r.error) {
    const e = new Error(traducir(r.error.message));
    e.code = r.error.code;
    if (r.error.code === 'PGRST301' || /JWT/.test(r.error.message)) e.sesion = true;
    throw e;
  }
  return r.data;
}

/** Llama a una Edge Function. */
export async function fn(nombre, body) {
  const { data, error } = await sb.functions.invoke(nombre, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && (j.error || j.msg)) msg = j.error || j.msg; } catch (_) { /* sin cuerpo */ }
    throw new Error(traducir(msg));
  }
  return data;
}

// ---------- DOM
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let tt;
export function toast(msg, bad) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), bad ? 6000 : 3200);
}

export function modal(titulo, html, { wide = false, cerrable = true } = {}) {
  cerrarModal();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="modal-box${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h2></h2>${cerrable ? '<button class="x" data-cerrar aria-label="Cerrar">×</button>' : ''}</div><div class="modal-body">${html}</div></div>`;
  $('h2', m).textContent = titulo;
  m.addEventListener('click', (e) => { if (e.target === m && cerrable) cerrarModal(); if (e.target.closest('[data-cerrar]')) cerrarModal(); });
  document.body.appendChild(m);
  return $('.modal-body', m);
}
export function cerrarModal() { const m = $('#modal'); if (m) m.remove(); }
export const hayModal = () => !!$('#modal');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal [data-cerrar]')) cerrarModal(); });

export function confirmar(titulo, texto, ok = 'Confirmar', peligro = false) {
  return new Promise((res) => {
    const b = modal(titulo, `<p>${texto}</p><div class="actions"><button class="btn" data-no>Cancelar</button><button class="btn ${peligro ? 'danger' : 'primary'}" data-si>${h(ok)}</button></div>`);
    $('[data-si]', b).onclick = () => { cerrarModal(); res(true); };
    $('[data-no]', b).onclick = () => { cerrarModal(); res(false); };
  });
}

export function progreso(titulo) {
  const b = modal(titulo, '<div class="progress"><i></i></div><p class="small" data-t>Iniciando…</p><div data-x></div>', { cerrable: false });
  return {
    set(p, t) { $('.progress i', b).style.width = Math.max(0, Math.min(100, p)) + '%'; $('[data-t]', b).textContent = t; },
    fin(html = '') { $('[data-x]', b).innerHTML = html + '<div class="actions"><button class="btn primary" data-fin>Cerrar</button></div>'; $('[data-fin]', b).onclick = cerrarModal; }
  };
}

export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function hoyArchivo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).replace(/-/g, '');
}

export const ESTADO_CORREO = {
  pendiente: ['', 'Pendiente'], procesando: ['acc', 'Procesando'], aceptado: ['ok', 'Aceptado por Brevo'],
  entregado: ['ok', 'Entregado'], fallido: ['bad', 'Fallido'], incierto: ['warn', 'Por verificar']
};
export function chipCorreo(e) { const x = ESTADO_CORREO[e] || ['', e]; return `<span class="chip ${x[0]}">${x[1]}</span>`; }
export function chipOrigen(o) { return o === 'presencial' ? '<span class="chip info">En puerta</span>' : '<span class="chip">Preinscrito</span>'; }

// Día del congreso elegido en este dispositivo (1, 2 o 3).
export function getDia() { try { const d = Number(localStorage.getItem('im26-dia')); return d >= 1 && d <= 3 ? d : null; } catch (_) { return null; } }
export function setDia(d) { try { localStorage.setItem('im26-dia', String(d)); } catch (_) { /* sin almacenamiento */ } }
