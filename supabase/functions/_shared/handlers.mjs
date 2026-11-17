// Lógica de las Edge Functions, independiente del entorno (Supabase/Deno o pruebas en Node).
// deps = { env(k), rpc(fn, args) [service_role], user(jwt) -> {id,email}|null, fetch }
import { ASUNTO, correoHtml, correoTexto } from './plantilla.mjs';
import { BREVO_BASE, normalizarClave, enviar, cuenta, remitentes, buscarEnvio } from './brevo.mjs';
import { QR_PREFIX, qrPng, base64 } from './png.mjs';

const LOTE = 10;   // correos por invocación (cada llamada termina en pocos segundos)
const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9_-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env('ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };
}
function json(env, status, data) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(env), 'Content-Type': 'application/json; charset=utf-8' } });
}

async function config(env, fetchImpl, rpc) {
  const supa = (env('SUPABASE_URL') || '').replace(/\/$/, '');
  // Prioridad: secretos de Supabase (variables de entorno); si no, lo guardado desde el panel (Vault).
  let db = {};
  if (!env('BREVO_API_KEY') || !env('BREVO_SENDER_EMAIL')) {
    try { db = (await rpc('srv_config_brevo', {})) || {}; } catch (_) { db = {}; }
  }
  return {
    brevo: { base: env('BREVO_API_BASE') || BREVO_BASE, key: normalizarClave(env('BREVO_API_KEY') || db.clave), fetch: fetchImpl, timeoutMs: Number(env('BREVO_TIMEOUT_MS')) || 20000 },
    remitente: { email: (env('BREVO_SENDER_EMAIL') || db.remitente || '').trim(), name: (env('BREVO_SENDER_NAME') || db.nombre || 'INNOMINING 2026').trim() },
    replyTo: (env('BREVO_REPLY_TO') || '').trim(),
    qrUrl: env('PUBLIC_QR_URL') || `${supa}/functions/v1/qr`
  };
}

function faltantes(c) {
  const f = [];
  if (!c.brevo.key) f.push('la clave de Brevo');
  if (!c.remitente.email) f.push('el correo remitente');
  return f;
}

async function payloadAcreditacion(c, x, envioId) {
  const png = await qrPng(QR_PREFIX + x.qr_token, 10);
  const d = { nombre: x.nombre, codigo: x.codigo, imgSrc: `${c.qrUrl}?t=${x.qr_token}` };
  const p = {
    sender: c.remitente,
    to: [x.nombre ? { email: x.email, name: x.nombre } : { email: x.email }],
    subject: ASUNTO,
    htmlContent: correoHtml(d),
    textContent: correoTexto(d),
    attachment: [{ content: base64(png), name: `${x.codigo}_INNOMINING2026.png` }],
    tags: ['innomining2026', `envio-${envioId}`],
    headers: { 'X-Mailin-custom': `envio:${envioId}` }
  };
  if (c.replyTo) p.replyTo = { email: c.replyTo };
  return p;
}

/** POST /functions/v1/enviar-qr   { accion: 'estado' | 'prueba' | 'enviar' | 'verificar', ... } */
export async function handleEnviar(req, deps) {
  const env = deps.env;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(env) });
  if (req.method !== 'POST') return json(env, 405, { error: 'Método no permitido' });

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = jwt ? await deps.user(jwt) : null;
  if (!user) return json(env, 401, { error: 'Sesión no válida. Inicie sesión nuevamente.' });
  const rol = await deps.rpc('srv_rol', { p_id: user.id });
  if (rol !== 'admin') return json(env, 403, { error: 'Esta acción requiere una cuenta de administrador.' });

  let body = {};
  try { body = await req.json(); } catch (_) { /* vacío */ }
  const c = await config(env, deps.fetch, deps.rpc);

  try {
    if (body.accion === 'estado') return json(env, 200, await estado(c));

    const f = faltantes(c);
    if (f.length) return json(env, 400, { error: `Falta configurar ${f.join(' y ')} en Configuración → Correo (Brevo).` });

    if (body.accion === 'prueba') {
      const to = String(body.destinatario || '').trim().toLowerCase();
      if (!EMAIL_RE.test(to)) return json(env, 400, { error: 'Correo de prueba no válido.' });
      const demo = { nombre: 'Participante de prueba', email: to, codigo: 'IM26-PRUEBA', qr_token: 'PRUEBA' };
      const p = await payloadAcreditacion(c, demo, 'prueba');
      p.subject = '[PRUEBA] ' + ASUNTO;
      p.htmlContent = p.htmlContent.replace(`${c.qrUrl}?t=PRUEBA`, `${c.qrUrl}?demo=1`);
      const r = await enviar(c.brevo, p);
      await deps.rpc('srv_registrar_prueba', { p_operador: user.id, p_destinatario: to, p_resultado: r.resultado, p_message_id: r.messageId || null, p_error: r.error || null });
      return json(env, 200, { resultado: r.resultado, messageId: r.messageId || null, error: r.error || null });
    }

    if (body.accion === 'enviar') return json(env, 200, await enviarLote(c, deps, user, body));

    if (body.accion === 'verificar') {
      const inc = await deps.rpc('srv_envio_incierto', { p_participante: body.participante_id });
      if (!inc) return json(env, 200, { resultado: 'sin_pendientes' });
      const desde = new Date(new Date(inc.creado_en).getTime() - 86400000);
      const b = await buscarEnvio(c.brevo, inc.email, `envio-${inc.envio_id}`, desde);
      if (b.error) return json(env, 502, { error: b.error });
      if (b.encontrado) {
        await deps.rpc('srv_finalizar_envio', { p_envio: inc.envio_id, p_resultado: 'aceptado', p_message_id: b.messageId, p_error: null });
        return json(env, 200, { resultado: 'aceptado', messageId: b.messageId });
      }
      await deps.rpc('srv_finalizar_envio', { p_envio: inc.envio_id, p_resultado: 'temporal', p_message_id: null, p_error: 'Brevo no registra este envío; quedó pendiente.' });
      return json(env, 200, { resultado: 'no_encontrado' });
    }

    return json(env, 400, { error: 'Acción no válida.' });
  } catch (e) {
    console.error('enviar-qr', e);
    return json(env, 500, { error: 'Error interno: ' + String((e && e.message) || e).slice(0, 200) });
  }
}

async function estado(c) {
  const out = { faltantes: faltantes(c), remitente: c.remitente.email || null, cuenta: null, remitente_verificado: null, problemas: [] };
  if (!c.brevo.key) { out.problemas.push('Falta la clave de Brevo: péguela en Configuración → Correo (Brevo).'); return out; }
  let a, s;
  try { [a, s] = await Promise.all([cuenta(c.brevo), remitentes(c.brevo)]); }
  catch (e) { out.problemas.push('No se pudo conectar con Brevo: ' + String((e && e.message) || e)); return out; }
  if (a.status !== 200) {
    out.problemas.push(`Brevo rechazó la clave (${a.status}: ${a.data.message || a.data.code || ''}). Si la clave es correcta, desactive el bloqueo de IP en Brevo → Seguridad → IP autorizadas.`);
    return out;
  }
  out.cuenta = { email: a.data.email, empresa: a.data.companyName,
    planes: (a.data.plan || []).map((p) => ({ tipo: p.type, creditos: p.credits, tipoCreditos: p.creditsType })),
    relay: a.data.relay ? !!a.data.relay.enabled : null };
  const lista = (s.data && s.data.senders) || [];
  const r = lista.find((x) => String(x.email).toLowerCase() === c.remitente.email.toLowerCase());
  out.remitentes = lista.map((x) => ({ email: x.email, nombre: x.name, activo: !!x.active }));
  if (!c.remitente.email) out.problemas.push('Falta el correo remitente en Configuración → Correo (Brevo).');
  else if (!r) out.problemas.push(`El remitente ${c.remitente.email} no existe en Brevo. Agréguelo en Brevo → Remitentes, dominio, IP.`);
  else if (!r.active) out.problemas.push(`El remitente ${c.remitente.email} existe pero NO está verificado/activo en Brevo.`);
  out.remitente_verificado = !!(r && r.active);
  return out;
}

async function enviarLote(c, deps, user, body) {
  const modo = ['pendientes', 'fallidos', 'ids'].includes(body.modo) ? body.modo : 'pendientes';
  const ids = modo === 'ids' ? (Array.isArray(body.ids) ? body.ids.slice(0, LOTE) : []) : null;
  await deps.rpc('srv_liberar_colgados', { p_minutos: 5 });
  const res = await deps.rpc('srv_reservar_envios', {
    p_operador: user.id, p_modo: modo, p_ids: ids, p_forzar: !!body.forzar, p_limite: LOTE
  });
  const lote = res.lote || [];
  const out = { reservados: lote.length, aceptados: 0, fallidos: 0, inciertos: 0, devueltos: 0, errores: [], detenido: null, cupo: res.cupo, limite: res.limite };
  let parar = null;
  for (const x of lote) {
    let r;
    if (parar) r = { resultado: 'temporal', error: 'No se intentó: ' + parar };
    else r = await enviar(c.brevo, await payloadAcreditacion(c, x, x.envio_id));
    await deps.rpc('srv_finalizar_envio', { p_envio: x.envio_id, p_resultado: r.resultado, p_message_id: r.messageId || null, p_error: r.error || null });
    if (r.resultado === 'aceptado') out.aceptados++;
    else if (r.resultado === 'fallido') { out.fallidos++; out.errores.push({ codigo: x.codigo, email: x.email, error: r.error }); }
    else if (r.resultado === 'incierto') { out.inciertos++; out.errores.push({ codigo: x.codigo, email: x.email, error: r.error }); }
    else out.devueltos++;
    if (r.detener && !parar) { parar = r.error; out.detenido = r.error; }
  }
  if (!lote.length && res.cupo <= 0) out.detenido = `Se alcanzó el límite diario configurado (${res.limite} correos). Los pendientes se conservan.`;
  return out;
}

/** GET /functions/v1/qr?t=<token>   Imagen PNG del QR (sin datos personales). Pública, solo tokens activos. */
export async function handleQr(req, deps) {
  const url = new URL(req.url);
  const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
  if (url.searchParams.get('demo') === '1') {
    return new Response(await qrPng('IM26:EJEMPLO-NO-VALIDO', 10), { headers });
  }
  const t = url.searchParams.get('t') || '';
  if (!/^[0-9a-f]{32}$/.test(t)) return new Response('No encontrado', { status: 404 });
  const ok = await deps.rpc('srv_qr_activo', { p_token: t });
  if (!ok) return new Response('No encontrado', { status: 404 });
  return new Response(await qrPng(QR_PREFIX + t, 10), { headers });
}

/** POST /functions/v1/brevo-webhook?secreto=…   Confirma "delivered" y marca rebotes. */
export async function handleWebhook(req, deps) {
  const secreto = deps.env('BREVO_WEBHOOK_SECRET') || '';
  const url = new URL(req.url);
  if (!secreto) return new Response('Webhook no configurado', { status: 503 });
  if (url.searchParams.get('secreto') !== secreto) return new Response('No autorizado', { status: 401 });
  let body;
  try { body = await req.json(); } catch (_) { return new Response('JSON inválido', { status: 400 }); }
  const eventos = Array.isArray(body) ? body : [body];
  let n = 0;
  for (const ev of eventos) {
    const id = ev['message-id'] || ev.messageId || ev.message_id;
    if (!id || !ev.event) continue;
    await deps.rpc('srv_evento_brevo', { p_message_id: id, p_evento: ev.event, p_detalle: ev.reason || null });
    n++;
  }
  return new Response(JSON.stringify({ procesados: n }), { headers: { 'Content-Type': 'application/json' } });
}
