// Cliente mínimo de la API transaccional de Brevo (v3). Solo se usa en el backend.

export const BREVO_BASE = 'https://api.brevo.com/v3';

/** Acepta la clave REST (xkeysib-…) o la versión "MCP" de Brevo (base64 de {"api_key": "xkeysib-…"}). */
export function normalizarClave(k) {
  const v = String(k || '').trim();
  if (!v || v.startsWith('xkeysib-')) return v;
  try {
    const j = JSON.parse(atob(v));
    if (j && typeof j.api_key === 'string') return j.api_key.trim();
  } catch (_) { /* no era base64 */ }
  return v;
}

async function llamar(cfg, method, path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs || 20000);
  try {
    const res = await cfg.fetch(cfg.base + path, {
      method,
      headers: { 'api-key': cfg.key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function mensaje(r) {
  return `Brevo ${r.status}: ${r.data.message || r.data.code || 'error'}`;
}

/**
 * Envía un correo. Clasifica el resultado para no perder pendientes ni duplicar:
 *  aceptado  → Brevo devolvió messageId (aceptado, NO necesariamente entregado)
 *  fallido   → rechazo definitivo para ESTE destinatario (p. ej. correo inválido)
 *  temporal  → problema de cuota/configuración/servidor: vuelve a pendiente, se detiene el lote
 *  incierto  → no hubo respuesta (Brevo pudo haberlo aceptado): no se reintenta solo
 */
export async function enviar(cfg, payload) {
  let r;
  try {
    r = await llamar(cfg, 'POST', '/smtp/email', payload);
  } catch (e) {
    const t = e && e.name === 'AbortError' ? 'tiempo de espera agotado' : String((e && e.message) || e);
    return { resultado: 'incierto', error: `Sin respuesta de Brevo (${t}). Verifique antes de reenviar.`, detener: true };
  }
  if (r.status >= 200 && r.status < 300) {
    return { resultado: 'aceptado', messageId: r.data.messageId || (r.data.messageIds || [])[0] || null };
  }
  const msg = mensaje(r);
  if (r.status === 401 || r.status === 403) {
    return { resultado: 'temporal', detener: true, config: true,
      error: `${msg}. Revise la clave de Brevo y, en Brevo → Seguridad → IP autorizadas, desactive el bloqueo de IP desconocidas.` };
  }
  if (r.status === 402 || r.status === 429) return { resultado: 'temporal', detener: true, cuota: true, error: `${msg}. Cuota o créditos de Brevo agotados.` };
  if (r.status >= 500) return { resultado: 'temporal', detener: true, error: `${msg}. Brevo no disponible.` };
  if (/sender|from/i.test(msg)) {
    return { resultado: 'temporal', detener: true, config: true, error: `${msg}. El remitente no es válido o no está verificado en Brevo.` };
  }
  return { resultado: 'fallido', error: msg };
}

export async function cuenta(cfg) {
  return llamar(cfg, 'GET', '/account');
}

export async function remitentes(cfg) {
  return llamar(cfg, 'GET', '/senders');
}

/** Busca en Brevo un envío por destinatario y etiqueta (para resolver envíos "inciertos"). */
export async function buscarEnvio(cfg, email, etiqueta, desde) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const hasta = new Date(Date.now() + 86400000);
  const q = `?email=${encodeURIComponent(email)}&startDate=${fmt(desde)}&endDate=${fmt(hasta)}&limit=100&sort=desc`;
  const r = await llamar(cfg, 'GET', '/smtp/emails' + q);
  if (r.status !== 200) return { error: mensaje(r) };
  const hit = (r.data.transactionalEmails || []).find((e) => (e.tags || []).includes(etiqueta));
  return { encontrado: !!hit, messageId: hit ? hit.messageId : null };
}
