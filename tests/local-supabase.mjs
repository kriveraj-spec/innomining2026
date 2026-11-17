// Emulador local MÍNIMO de la API de Supabase (Auth + PostgREST RPC + Edge Functions) sobre PostgreSQL real.
// Solo para pruebas automáticas: el frontend usa el cliente oficial supabase-js contra este servidor.
// Las reglas de negocio y permisos se ejecutan en la base de datos real (mismas funciones SQL que en Supabase).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { handleEnviar, handleQr, handleWebhook } from '../supabase/functions/_shared/handlers.mjs';

const SECRET = 'secreto-jwt-solo-pruebas';
const b64u = (b) => Buffer.from(b).toString('base64url');

export function firmar(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
export function verificar(tok) {
  const [h, p, s] = String(tok || '').split('.');
  if (!s) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (ok.length !== s.length || !crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(s))) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  return c.exp && c.exp * 1000 < Date.now() ? null : c;
}

export const ANON_KEY = firmar({ role: 'anon', iss: 'local', exp: Math.floor(Date.now() / 1000) + 86400 * 365 });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function iniciar({ port = 0, database, env = {}, webDir = null } = {}) {
  const pool = new pg.Pool({ host: '127.0.0.1', port: 54329, user: 'postgres', database, max: 20 });
  const refresh = new Map();
  const tipos = new Map();
  async function tiposDe(fn) {
    if (!tipos.has(fn)) {
      const r = await pool.query(`select unnest(proargnames) n, unnest(proargtypes::regtype[]::text[]) t
                                    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and proname = $1`, [fn]);
      tipos.set(fn, Object.fromEntries(r.rows.map((x) => [x.n, x.t])));
    }
    return tipos.get(fn);
  }

  async function rpc(role, claims, fn, args) {
    if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw Object.assign(new Error('función inválida'), { status: 404 });
    const keys = Object.keys(args || {});
    if (keys.some((k) => !/^[a-z_][a-z0-9_]*$/.test(k))) throw Object.assign(new Error('argumento inválido'), { status: 400 });
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [role, JSON.stringify(claims || {})]);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} := $${i + 1}`).join(', ')}) as r`;
      const t = await tiposDe(fn);
      const vals = keys.map((k) => (args[k] !== null && /^jsonb?$/.test(t[k] || '') ? JSON.stringify(args[k]) : args[k]));
      const r = await c.query(sql, vals);
      await c.query('commit');
      return r.rows[0].r;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  // ---- Worker de pg_net: ejecuta las solicitudes encoladas y guarda la respuesta (como Supabase).
  const almacen = new Map();
  let trabajando = false;
  const worker = setInterval(async () => {
    if (trabajando) return; trabajando = true;
    try {
      const { rows } = await pool.query('update net.http_request_queue set procesado = true where id in (select id from net.http_request_queue where not procesado order by id limit 20) returning *');
      await Promise.all(rows.map(async (q) => {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), q.timeout_milliseconds || 5000);
        try {
          const r = await fetch(q.url, { method: 'POST', headers: q.headers, body: JSON.stringify(q.body), signal: ctl.signal });
          await pool.query('insert into net._http_response (id, status_code, content, timed_out) values ($1, $2, $3, false)', [q.id, r.status, await r.text()]);
        } catch (e) {
          await pool.query('insert into net._http_response (id, timed_out, error_msg) values ($1, $2, $3)', [q.id, e.name === 'AbortError', e.name === 'AbortError' ? null : String(e.message)]);
        } finally { clearTimeout(t); }
      }));
    } catch (_) { /* base cerrándose */ } finally { trabajando = false; }
  }, 250);

  const deps = {
    env: (k) => (k in env ? env[k] : ''),
    fetch: (u, i) => fetch(u, i),
    rpc: (fn, args) => rpc('service_role', { role: 'service_role' }, fn, args),
    user: async (jwt) => { const c = verificar(jwt); return c && c.role === 'authenticated' ? { id: c.sub, email: c.email } : null; }
  };

  async function sesion(userRow) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = firmar({ sub: userRow.id, email: userRow.email, role: 'authenticated', aud: 'authenticated', exp });
    const rt = crypto.randomBytes(24).toString('hex');
    refresh.set(rt, userRow);
    return {
      access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt,
      user: { id: userRow.id, aud: 'authenticated', role: 'authenticated', email: userRow.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
    };
  }

  const leer = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });
  const enviarJson = (res, st, d, h = {}) => { res.writeHead(st, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(d)); };

  async function aRespuesta(res, response) {
    const h = {};
    response.headers.forEach((v, k) => (h[k] = v));
    res.writeHead(response.status, h);
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      // ---------- Auth
      if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
        const b = JSON.parse((await leer(req)) || '{}');
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const u = refresh.get(b.refresh_token);
          if (!u) return enviarJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
          refresh.delete(b.refresh_token);
          return enviarJson(res, 200, await sesion(u));
        }
        const r = await pool.query('select id, email from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)', [b.email || '', b.password || '']);
        if (!r.rows[0]) return enviarJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return enviarJson(res, 200, await sesion(r.rows[0]));
      }
      if (url.pathname === '/auth/v1/user') {
        const c = verificar((req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!c || c.role !== 'authenticated') return enviarJson(res, 401, { msg: 'invalid JWT' });
        return enviarJson(res, 200, { id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
      }
      if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }

      // ---------- PostgREST RPC
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
      if (m && req.method === 'POST') {
        const c = verificar((req.headers.authorization || '').replace(/^Bearer /, '')) || { role: 'anon' };
        const role = c.role === 'authenticated' ? 'authenticated' : 'anon';
        try {
          const out = await rpc(role, c, m[1], JSON.parse((await leer(req)) || '{}'));
          return enviarJson(res, 200, out);
        } catch (e) {
          const st = e.code === '42501' ? (role === 'anon' ? 401 : 403) : e.code === '42883' ? 404 : 400;
          return enviarJson(res, st, { code: e.code || 'P0001', message: e.message, details: null, hint: null });
        }
      }

      // ---------- Storage (subida con RLS como el usuario; lectura pública)
      const so = url.pathname.match(/^\/storage\/v1\/object\/(public\/)?([a-z0-9_-]+)\/(.+)$/);
      if (so) {
        const bucket = so[2], nombre = decodeURIComponent(so[3]);
        if (so[1] && req.method === 'GET') {
          const b = almacen.get(bucket + '/' + nombre);
          if (!b) { res.writeHead(404); return res.end(); }
          res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(b);
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks = []; for await (const ch of req) chunks.push(ch);
          let buf = Buffer.concat(chunks);
          const i = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
          if (i > 0) { const fin = buf.lastIndexOf(Buffer.from('\r\n--')); buf = buf.subarray(i, fin > i ? fin : buf.length); }
          const c = verificar((req.headers.authorization || '').replace(/^Bearer /, '')) || { role: 'anon' };
          const cli = await pool.connect();
          try {
            await cli.query('begin');
            await cli.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [c.role === 'authenticated' ? 'authenticated' : 'anon', JSON.stringify(c)]);
            await cli.query('insert into storage.objects (bucket_id, name) values ($1, $2) on conflict (bucket_id, name) do update set name = excluded.name', [bucket, nombre]);
            await cli.query('commit');
          } catch (e) {
            await cli.query('rollback').catch(() => {}); cli.release();
            return enviarJson(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
          }
          cli.release();
          almacen.set(bucket + '/' + nombre, buf);
          return enviarJson(res, 200, { Key: `${bucket}/${nombre}` });
        }
      }

      // ---------- Edge Functions
      const f = url.pathname.match(/^\/functions\/v1\/([a-z-]+)$/);
      if (f) {
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await leer(req);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const request = new Request('http://local' + req.url, { method: req.method, headers, body });
        if (f[1] === 'enviar-qr') {
          // verify_jwt = true en Supabase: rechaza llamadas sin JWT válido antes de llegar a la función
          const c = verificar((req.headers.authorization || '').replace(/^Bearer /, ''));
          if (!c) return enviarJson(res, 401, { msg: 'Invalid JWT' });
          return aRespuesta(res, await handleEnviar(request, deps));
        }
        if (f[1] === 'qr') return aRespuesta(res, await handleQr(request, deps));
        if (f[1] === 'brevo-webhook') return aRespuesta(res, await handleWebhook(request, deps));
        return enviarJson(res, 404, { error: 'función no encontrada' });
      }

      // ---------- Archivos estáticos (build del frontend)
      if (webDir && req.method === 'GET') {
        let p = path.normalize(path.join(webDir, decodeURIComponent(url.pathname)));
        if (!p.startsWith(webDir)) { res.writeHead(403); return res.end(); }
        if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(webDir, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        return res.end(fs.readFileSync(p));
      }
      res.writeHead(404); res.end();
    } catch (e) {
      console.error('emulador', e);
      enviarJson(res, 500, { message: String(e.message || e) });
    }
  });

  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  env.SUPABASE_URL = env.SUPABASE_URL || base;

  return {
    url: base, pool, deps,
    async crearUsuario(email, password, rol, nombre = '') {
      await pool.query("insert into auth.users (email, encrypted_password) values ($1, extensions.crypt($2, extensions.gen_salt('bf'))) on conflict (email) do nothing", [email, password]);
      await pool.query('select public.registrar_operador($1, $2, $3)', [email, rol, nombre]);
    },
    async login(email, password) {
      const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', body: JSON.stringify({ email, password }) });
      return (await r.json()).access_token;
    },
    async llamar(token, fn, args = {}) {
      const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { authorization: `Bearer ${token || ANON_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
      const d = await r.json();
      if (r.status >= 400) { const e = new Error(d.message); e.status = r.status; e.code = d.code; throw e; }
      return d;
    },
    async funcion(token, nombre, body) {
      const r = await fetch(`${base}/functions/v1/${nombre}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, data: await r.json() };
    },
    almacen,
    async cerrar() { clearInterval(worker); await new Promise((ok) => server.close(ok)); await pool.end(); }
  };
}

/** Crea una base nueva y aplica el stub + la migración real. */
export async function baseNueva(nombre) {
  const admin = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database: 'postgres' });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const c = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database: nombre });
  await c.connect();
  const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  await c.query(fs.readFileSync(path.join(raiz, 'tests/supabase-stub.sql'), 'utf8'));
  for (const f of fs.readdirSync(path.join(raiz, 'supabase/migrations')).sort()) {
    await c.query(fs.readFileSync(path.join(raiz, 'supabase/migrations', f), 'utf8').replace('create extension if not exists pg_net;', '-- pg_net: stub local'));
  }
  await c.end();
}
