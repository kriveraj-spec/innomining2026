// Pruebas del backend sobre PostgreSQL REAL (migración de Supabase) + Edge Functions + Brevo simulado.
// Uso: node tests/db.test.mjs
import assert from 'node:assert/strict';
import { iniciar, baseNueva, ANON_KEY } from './local-supabase.mjs';
import { iniciarBrevoFalso } from './fake-brevo.mjs';

const resultados = [];
async function prueba(nombre, fn) {
  try { await fn(); resultados.push(['OK', nombre]); console.log('✔ ' + nombre); }
  catch (e) { resultados.push(['FALLA', nombre]); console.log('✘ ' + nombre + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); }
}
const rechaza = async (p, re) => { try { await p; } catch (e) { if (re && !re.test(e.message)) throw new Error('Mensaje inesperado: ' + e.message); return e; } throw new Error('Se esperaba un error'); };

await baseNueva('im26_db_test');
const brevo = await iniciarBrevoFalso();
const env = { BREVO_API_KEY: '', BREVO_API_BASE: brevo.base, BREVO_SENDER_EMAIL: '', BREVO_SENDER_NAME: '', BREVO_TIMEOUT_MS: '800', BREVO_WEBHOOK_SECRET: 'webhook-secreto' };
const S = await iniciar({ database: 'im26_db_test', env });
const q = (sql, v) => S.pool.query(sql, v).then((r) => r.rows);
const fijarFecha = (iso) => q(`create or replace function public._hoy() returns date language sql stable as $$ select '${iso}'::date $$`);
const fechaReal = () => q(`create or replace function public._hoy() returns date language sql stable as $$ select (now() at time zone 'America/Lima')::date $$`);

await S.crearUsuario('admin@innomining.test', 'Admin-2026!', 'admin', 'Administración');
await S.crearUsuario('laptop@innomining.test', 'Laptop-2026!', 'operador', 'Puesto laptop');
await S.crearUsuario('celular@innomining.test', 'Celular-2026!', 'operador', 'Puesto celular');
const admin = await S.login('admin@innomining.test', 'Admin-2026!');
const laptop = await S.login('laptop@innomining.test', 'Laptop-2026!');
const celular = await S.login('celular@innomining.test', 'Celular-2026!');
const A = (fn, args) => S.llamar(admin, fn, args);

const inscritos = [
  { nombre: 'Ana Lucía Pérez Quispe', email: 'ana.perez@example.com', institucion: 'Universidad Nacional de Ingeniería' },
  { nombre: 'Carlos Mamani Huamán', email: ' Carlos.Mamani@Example.com ', institucion: 'Universidad Nacional de San Agustín' },
  { nombre: 'María José Torres Ríos', email: 'mj.torres@example.com', institucion: 'PUCP' },
  { nombre: 'Jorge Luis Condori', email: 'jorge.condori@example.com', institucion: 'Universidad Nacional del Altiplano' },
  { nombre: 'Lucía Fernández Vega', email: 'lucia.fernandez@example.com', institucion: 'Universidad de Lima' },
  { nombre: 'Pedro Sánchez Rojas', email: 'pedro.sanchez@example', institucion: 'UNMSM' },
  { nombre: 'Rosa Elena Quispe', email: 'rosa.rebota@example.com', institucion: '' },
  { nombre: 'Diego Alonso Ramírez', email: 'diego.ramirez@example.com', institucion: 'UNT' },
  { nombre: 'Ana Pérez (repetida)', email: 'ana.perez@example.com', institucion: 'UNI' },
  { nombre: 'Valeria Ccori Apaza', email: 'valeria.ccori@example.com', institucion: 'UNSAAC' },
  { nombre: '', email: 'solo.correo@example.com', institucion: '' },
  { nombre: '=HYPERLINK("http://x")', email: 'sofia.castillo@example.com', institucion: 'UPCH' }
];

// ===================================================================== Seguridad
await prueba('Seguridad: anónimo no puede llamar funciones ni leer tablas', async () => {
  await rechaza(S.llamar(null, 'listar_participantes'));
  await rechaza(S.llamar(null, 'registrar_ingreso_qr', { p_qr: 'IM26:' + '0'.repeat(32) }));
  const c = await S.pool.connect();
  try {
    await c.query('begin; set local role anon');
    await rechaza(c.query('select * from public.participantes'), /permission denied/);
  } finally { await c.query('rollback'); c.release(); }
});

await prueba('Seguridad: operador no accede a funciones de administración ni a las tablas', async () => {
  await rechaza(S.llamar(laptop, 'listar_participantes'), /administrador/);
  await rechaza(S.llamar(laptop, 'confirmar_importacion', { p_filas: inscritos }), /administrador/);
  await rechaza(S.llamar(laptop, 'srv_reservar_envios', { p_operador: null, p_modo: 'pendientes', p_ids: null, p_forzar: false, p_limite: 5 }));
  const sub = (await q("select id from public.operadores where email = 'laptop@innomining.test'"))[0].id;
  const c = await S.pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('role','authenticated',true), set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub, role: 'authenticated' })]);
    assert.equal((await c.query('select count(*)::int n from public.participantes')).rows[0].n, 0, 'RLS: operador no lee la tabla');
    await rechaza(c.query("insert into public.asistencias (participante_id, fecha, metodo) values (gen_random_uuid(), current_date, 'escaneo')"), /permission denied/);
  } finally { await c.query('rollback'); c.release(); }
});

await prueba('Seguridad: el endpoint de envío exige sesión de administrador', async () => {
  assert.equal((await S.funcion(ANON_KEY, 'enviar-qr', { accion: 'estado' })).status, 401);
  assert.equal((await S.funcion(laptop, 'enviar-qr', { accion: 'estado' })).status, 403);
});

// ===================================================================== 1-2 Importación
let lista;
await prueba('1. Importación: previsualiza sin guardar y clasifica nuevos / duplicados / inválidos', async () => {
  const pv = await A('previsualizar_importacion', { p_filas: inscritos });
  assert.deepEqual([pv.resumen.nuevo, pv.resumen.duplicado, pv.resumen.invalido], [10, 1, 1]);
  assert.equal(pv.filas[1].email, 'carlos.mamani@example.com', 'correo normalizado');
  assert.equal((await q('select count(*)::int n from participantes'))[0].n, 0);
});

await prueba('1. Importación: confirma y guarda permanentemente; fórmulas neutralizadas', async () => {
  const r = await A('confirmar_importacion', { p_filas: inscritos });
  assert.equal(r.insertados, 10);
  lista = await A('listar_participantes');
  assert.equal(lista.length, 10);
  assert.ok(lista.every((p) => p.origen === 'previo' && /^IM26-[A-Z2-9]{5}$/.test(p.codigo) && p.correo_estado === 'pendiente'));
  assert.ok(!lista.find((p) => p.email === 'sofia.castillo@example.com').nombre.startsWith('='));
});

await prueba('2. Reimportación: no duplica; avisa diferencias de nombre y solo completa vacíos', async () => {
  const filas = [
    { nombre: 'Gabriel Ortiz Lazo', email: 'SOLO.correo@example.com', institucion: 'UNP' },
    { nombre: 'Ana P. Quispe', email: 'ana.perez@example.com', institucion: 'UNI' },
    { nombre: 'Elena Vargas Soto', email: 'elena.vargas@example.com', institucion: 'UNAM' }
  ];
  const pv = await A('previsualizar_importacion', { p_filas: filas });
  assert.deepEqual(pv.filas.map((f) => f.estado), ['existente', 'diferencia', 'nuevo']);
  const r = await A('confirmar_importacion', { p_filas: filas });
  assert.deepEqual([r.insertados, r.actualizados], [1, 1]);
  const t = await q("select nombre, email from participantes where email in ('solo.correo@example.com','ana.perez@example.com') order by email");
  assert.deepEqual(t.map((x) => x.nombre), ['Ana Lucía Pérez Quispe', 'Gabriel Ortiz Lazo']);
  assert.equal((await q('select count(*)::int n from participantes'))[0].n, 11);
  await rechaza(A('agregar_participante', { p_nombre: 'X', p_email: 'ANA.PEREZ@example.com', p_institucion: '' }), /ya está registrado/);
});

// ===================================================================== 3 / 5 QR
await prueba('3. Generación masiva de QR: tokens únicos de 128 bits; no regenera existentes', async () => {
  const a = await A('generar_qr_pendientes', { p_limite: 4 });
  assert.deepEqual([a.generados, a.pendientes], [4, 7]);
  const b = await A('generar_qr_pendientes', { p_limite: 500 });
  assert.deepEqual([b.generados, b.pendientes], [7, 0]);
  assert.equal((await A('generar_qr_pendientes', {})).generados, 0);
  const t = await q('select qr_token from participantes');
  assert.ok(t.every((x) => /^[0-9a-f]{32}$/.test(x.qr_token)));
  assert.equal(new Set(t.map((x) => x.qr_token)).size, t.length);
});

await prueba('3. Dos administradores generan QR a la vez: ningún token se pisa', async () => {
  await A('confirmar_importacion', { p_filas: Array.from({ length: 300 }, (_, i) => ({ nombre: 'Carga ' + i, email: `carga${i}@example.com` })) });
  const [x, y] = await Promise.all([A('generar_qr_pendientes', { p_limite: 300 }), A('generar_qr_pendientes', { p_limite: 300 })]);
  assert.equal(x.generados + y.generados, 300);
  assert.equal((await q('select count(distinct qr_token)::int n, count(*)::int t from participantes'))[0].n, 311);
  await q("delete from participantes where email like 'carga%'");
});

await prueba('5. Editar nombre y correo conserva el mismo id y el mismo QR', async () => {
  const p = (await q("select * from participantes where email = 'jorge.condori@example.com'"))[0];
  await A('actualizar_participante', { p_id: p.id, p_nombre: 'Jorge Luis Condori Mamani', p_email: 'jorge.condori2@example.com', p_institucion: 'UNA' });
  const n = (await q('select * from participantes where id = $1', [p.id]))[0];
  assert.equal(n.qr_token, p.qr_token);
  assert.equal(n.email, 'jorge.condori2@example.com');
  await rechaza(A('actualizar_participante', { p_id: p.id, p_nombre: 'x', p_email: 'ana.perez@example.com', p_institucion: '' }), /ya pertenece/);
});

// ===================================================================== 8 / 11 Escaneo
const tok = async (email) => 'IM26:' + (await q('select qr_token from participantes where email = $1', [email]))[0].qr_token;
let anaHora;
await prueba('8. Escaneo desde celular: INGRESO REGISTRADO con hora del servidor (Lima)', async () => {
  const r = await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: await tok('ana.perez@example.com') });
  assert.equal(r.estado, 'ok');
  assert.equal(r.nombre, 'Ana Lucía Pérez Quispe');
  assert.match(r.hora, /^\d\d:\d\d:\d\d$/);
  anaHora = r.hora;
  const a = (await q("select * from asistencias a join participantes p on p.id = a.participante_id where p.email = 'ana.perez@example.com'"))[0];
  assert.equal(a.metodo, 'escaneo');
});

await prueba('11. Lectura repetida: INGRESO YA REGISTRADO con la hora original, sin nueva asistencia', async () => {
  const r = await S.llamar(laptop, 'registrar_ingreso_qr', { p_qr: await tok('ana.perez@example.com') });
  assert.deepEqual([r.estado, r.hora], ['ya', anaHora]);
  assert.equal((await q("select count(*)::int n from asistencias a join participantes p on p.id=a.participante_id where p.email='ana.perez@example.com'"))[0].n, 1);
});

await prueba('11. 20 escaneos simultáneos del mismo QR desde 2 operadores → 1 sola asistencia', async () => {
  const t = await tok('lucia.fernandez@example.com');
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => S.llamar(i % 2 ? celular : laptop, 'registrar_ingreso_qr', { p_qr: t })));
  assert.equal(rs.filter((r) => r.estado === 'ok').length, 1);
  assert.equal(rs.filter((r) => r.estado === 'ya').length, 19);
  assert.equal(new Set(rs.map((r) => r.hora)).size, 1, 'todos ven la misma hora original');
});

await prueba('QR inválido, ajeno y anulado: no registran ingreso', async () => {
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: 'https://otro.com' })).estado, 'invalido');
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: 'IM26:' + 'a'.repeat(32) })).estado, 'invalido');
  const p = (await q("select * from participantes where email = 'diego.ramirez@example.com'"))[0];
  const viejo = 'IM26:' + p.qr_token;
  const n = await A('anular_qr', { p_id: p.id, p_motivo: 'Compartido en redes' });
  assert.notEqual(n.qr_token, p.qr_token);
  const r = await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: viejo });
  assert.equal(r.estado, 'anulado');
  assert.equal((await q('select count(*)::int n from asistencias where participante_id = $1', [p.id]))[0].n, 0);
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: 'IM26:' + n.qr_token })).estado, 'ok');
});

// ===================================================================== 7 Registro presencial
await prueba('7. Registro presencial: crea participante + QR + asistencia en una operación; correo pendiente', async () => {
  const r = await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Hugo Salas Ccama', p_email: 'Hugo.Salas@Example.com', p_institucion: 'UNJBG', p_confirmar: false });
  assert.equal(r.estado, 'nuevo');
  const p = (await q("select * from participantes where email = 'hugo.salas@example.com'"))[0];
  assert.equal(p.origen, 'presencial');
  assert.match(p.qr_token, /^[0-9a-f]{32}$/);
  assert.equal(p.correo_estado, 'pendiente', 'no depende del correo para acreditar');
  const a = (await q('select a.*, o.email from asistencias a join operadores o on o.id = a.operador_id where participante_id = $1', [p.id]))[0];
  assert.deepEqual([a.metodo, a.email], ['presencial', 'laptop@innomining.test']);
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: 'IM26:' + p.qr_token })).estado, 'ya', 'no necesita pasar por el escáner');
});

await prueba('7. Correo ya inscrito: no duplica; pide confirmar; luego registra; luego "ya registrado"', async () => {
  const a = await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Valeria C.', p_email: 'valeria.ccori@example.com', p_institucion: '', p_confirmar: false });
  assert.deepEqual([a.estado, a.nombre], ['existe', 'Valeria Ccori Apaza']);
  assert.equal((await q("select count(*)::int n from asistencias a join participantes p on p.id=a.participante_id where p.email='valeria.ccori@example.com'"))[0].n, 0);
  const b = await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Valeria C.', p_email: 'valeria.ccori@example.com', p_institucion: '', p_confirmar: true });
  assert.equal(b.estado, 'ok');
  const c = await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Valeria C.', p_email: 'valeria.ccori@example.com', p_institucion: '', p_confirmar: true });
  assert.equal(c.estado, 'ya');
  assert.equal((await q("select count(*)::int n from participantes where email='valeria.ccori@example.com'"))[0].n, 1);
});

await prueba('7. Dos puestos registran a la misma persona nueva a la vez → 1 participante, 1 asistencia', async () => {
  const d = { p_nombre: 'Iván Torres', p_email: 'ivan.torres@example.com', p_institucion: 'UNI', p_confirmar: true };
  const rs = await Promise.all([S.llamar(laptop, 'registrar_presencial', d), S.llamar(celular, 'registrar_presencial', d), S.llamar(admin, 'registrar_presencial', d)]);
  assert.deepEqual(rs.map((r) => r.estado).sort(), ['nuevo', 'ya', 'ya']);
  assert.equal((await q("select count(*)::int n from participantes where email='ivan.torres@example.com'"))[0].n, 1);
  assert.equal((await q("select count(*)::int n from asistencias a join participantes p on p.id=a.participante_id where p.email='ivan.torres@example.com'"))[0].n, 1);
});

await prueba('7. Validaciones del registro presencial', async () => {
  await rechaza(S.llamar(laptop, 'registrar_presencial', { p_nombre: '', p_email: 'x@example.com', p_institucion: '', p_confirmar: false }), /obligatorio/);
  await rechaza(S.llamar(laptop, 'registrar_presencial', { p_nombre: 'X', p_email: 'x@ex', p_institucion: '', p_confirmar: false }), /no válido/);
});

await prueba('Situación C: búsqueda (correo enmascarado para operador) y registro de ingreso', async () => {
  const r = await S.llamar(laptop, 'buscar_participantes', { p_q: 'maria jose' });
  assert.equal(r.length, 1);
  assert.match(r[0].email, /^mj•••@example\.com$/);
  assert.equal((await S.llamar(laptop, 'registrar_ingreso_id', { p_id: r[0].id })).estado, 'ok');
  assert.equal((await S.llamar(celular, 'registrar_ingreso_id', { p_id: r[0].id })).estado, 'ya');
  assert.equal((await A('buscar_participantes', { p_q: 'maria jose' }))[0].email, 'mj.torres@example.com', 'admin ve el correo completo');
});

await prueba('Operador corrige solo lo que registró presencialmente; el QR no cambia', async () => {
  const h = (await q("select * from participantes where email = 'hugo.salas@example.com'"))[0];
  const u = await S.llamar(laptop, 'actualizar_participante', { p_id: h.id, p_nombre: 'Hugo Salas Ccama', p_email: 'hugo.salas.c@example.com', p_institucion: 'UNJBG' });
  assert.equal(u.qr_token, null, 'el operador no recibe el token');
  assert.equal((await q('select qr_token from participantes where id = $1', [h.id]))[0].qr_token, h.qr_token);
  const ana = (await q("select id from participantes where email = 'ana.perez@example.com'"))[0];
  await rechaza(S.llamar(laptop, 'actualizar_participante', { p_id: ana.id, p_nombre: 'x', p_email: 'ana.perez@example.com', p_institucion: '' }), /registró presencialmente/);
  await rechaza(S.llamar(celular, 'actualizar_participante', { p_id: h.id, p_nombre: 'x', p_email: 'hugo.salas.c@example.com', p_institucion: '' }), /registró presencialmente/);
});

// ===================================================================== 12 Fechas
await prueba('12. Asistencia independiente por fecha; mismo QR en días distintos', async () => {
  await A('guardar_configuracion', { p_fechas: ['2026-11-18', '2026-11-19', '2026-11-20'], p_permitir_fuera_de_fecha: false, p_limite: 300 });
  const t = await tok('carlos.mamani@example.com');
  await fijarFecha('2026-11-18');
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: t })).estado, 'ok');
  assert.equal((await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: t })).estado, 'ya');
  await fijarFecha('2026-11-19');
  const d2 = await S.llamar(celular, 'registrar_ingreso_qr', { p_qr: t });
  assert.deepEqual([d2.estado, d2.fecha], ['ok', '19/11/2026']);
  const fechas = await q("select to_char(fecha,'YYYY-MM-DD') f from asistencias a join participantes p on p.id=a.participante_id where p.email='carlos.mamani@example.com' order by fecha");
  assert.deepEqual(fechas.map((x) => x.f), ['2026-11-18', '2026-11-19']);
  await fijarFecha('2026-11-25');
  await rechaza(S.llamar(celular, 'registrar_ingreso_qr', { p_qr: t }), /no es una fecha configurada/);
  await rechaza(S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Z', p_email: 'z@example.com', p_institucion: '', p_confirmar: false }), /no es una fecha configurada/);
  await A('guardar_configuracion', { p_fechas: ['2026-11-18', '2026-11-19', '2026-11-20'], p_permitir_fuera_de_fecha: true, p_limite: 300 });
  await fechaReal();
});

// ===================================================================== 6 / 13 / 14 Correo
await prueba('6. Estado de Brevo: detecta clave faltante; con clave valida cuenta y remitente', async () => {
  let r = await S.funcion(admin, 'enviar-qr', { accion: 'estado' });
  assert.ok(r.data.problemas.some((x) => /clave de Brevo/.test(x)));
  // Configuración desde el panel: clave en formato "MCP" (también aceptado), guardada en Vault.
  await rechaza(S.llamar(laptop, 'guardar_brevo', { p_clave: 'x', p_remitente: '', p_nombre: '' }), /administrador/);
  const eb = await A('guardar_brevo', { p_clave: Buffer.from(JSON.stringify({ api_key: brevo.clave })).toString('base64'), p_remitente: brevo.remitente, p_nombre: 'INNOMINING 2026' });
  assert.equal(eb.clave_configurada, true);
  assert.ok(!JSON.stringify(eb).includes(brevo.clave), 'la clave nunca vuelve al navegador');
  r = await S.funcion(admin, 'enviar-qr', { accion: 'estado' });
  assert.equal(r.data.remitente_verificado, true);
  assert.deepEqual(r.data.problemas, []);
  assert.equal(r.data.cuenta.planes[0].creditos, 300);
});

await prueba('6. Correo de prueba: aceptado por Brevo y registrado', async () => {
  const r = await S.funcion(admin, 'enviar-qr', { accion: 'prueba', destinatario: 'comite@example.com' });
  assert.equal(r.data.resultado, 'aceptado');
  assert.match(r.data.messageId, /@smtp-relay/);
  const m = brevo.st.enviados.at(-1);
  assert.ok(m.subject.startsWith('[PRUEBA]') && m.adjuntos[0].name.endsWith('.png'));
  assert.equal((await q("select estado from envios_correo where tipo = 'prueba'"))[0].estado, 'aceptado');
});

await prueba('6. Envío masivo por lotes a pendientes: aceptados / fallidos, QR incrustado y adjunto', async () => {
  brevo.st.enviados.length = 0;
  let total = { aceptados: 0, fallidos: 0 }, vueltas = 0, r;
  do { r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data; total.aceptados += r.aceptados; total.fallidos += r.fallidos; vueltas++; }
  while (r.reservados > 0 && vueltas < 20);
  const n = (await q('select count(*)::int n from participantes'))[0].n;
  assert.equal(total.aceptados + total.fallidos, n);
  assert.equal(total.fallidos, 1, 'rosa.rebota@ es rechazado por Brevo');
  assert.equal(new Set(brevo.st.enviados.map((e) => e.to)).size, brevo.st.enviados.length, 'sin duplicados');
  const m = brevo.st.enviados.find((e) => e.to === 'ana.perez@example.com');
  const t = (await q("select qr_token from participantes where email = 'ana.perez@example.com'"))[0].qr_token;
  assert.ok(m.html.includes(`/functions/v1/qr?t=${t}`) && m.html.includes('Ana Lucía Pérez Quispe'));
  assert.equal(Buffer.from(m.adjuntos[0].content, 'base64').subarray(1, 4).toString(), 'PNG');
  const est = await q('select correo_estado, count(*)::int n from participantes group by 1 order by 1');
  assert.deepEqual(est.map((x) => x.correo_estado), ['aceptado', 'fallido']);
  const e = (await q("select * from envios_correo where destinatario = 'ana.perez@example.com'"))[0];
  assert.ok(e.brevo_message_id && e.estado === 'aceptado');
});

await prueba('Sin duplicados: "pendientes" no repite; seleccionados ya enviados se omiten salvo reenvío explícito', async () => {
  const antes = brevo.st.enviados.length;
  assert.equal((await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data.reservados, 0);
  const ana = (await q("select id from participantes where email = 'ana.perez@example.com'"))[0].id;
  assert.equal((await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'ids', ids: [ana] })).data.reservados, 0);
  assert.equal((await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'ids', ids: [ana], forzar: true })).data.aceptados, 1);
  assert.equal(brevo.st.enviados.length, antes + 1);
});

await prueba('6. Reintento de fallidos tras corregir el correo', async () => {
  const p = (await q("select * from participantes where email = 'rosa.rebota@example.com'"))[0];
  await A('actualizar_participante', { p_id: p.id, p_nombre: p.nombre, p_email: 'rosa.quispe@example.com', p_institucion: '' });
  assert.equal((await q('select correo_estado from participantes where id=$1', [p.id]))[0].correo_estado, 'pendiente');
  const r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
  assert.equal(r.aceptados, 1);
});

await prueba('13. Envío posterior a presenciales: mismo QR que ya tenían; no se generan nuevos', async () => {
  await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Nora Vilca', p_email: 'nora.vilca@example.com', p_institucion: 'UNSA', p_confirmar: false });
  const p = (await q("select * from participantes where email = 'nora.vilca@example.com'"))[0];
  assert.equal(p.correo_estado, 'pendiente');
  const r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
  assert.equal(r.aceptados, 1);
  const n = (await q('select * from participantes where id = $1', [p.id]))[0];
  assert.equal(n.qr_token, p.qr_token);
  assert.ok(brevo.st.enviados.at(-1).html.includes(p.qr_token));
});

await prueba('14. Cuota / Brevo caído (429, 500): se detiene y los pendientes se conservan', async () => {
  await A('confirmar_importacion', { p_filas: [1, 2, 3].map((i) => ({ nombre: 'Tarde ' + i, email: `tarde${i}@example.com` })) });
  for (const modo of ['429', '500']) {
    brevo.st.modo = modo;
    const r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
    assert.equal(r.aceptados, 0);
    assert.ok(r.detenido);
    assert.equal((await q("select count(*)::int n from participantes where email like 'tarde%' and correo_estado = 'pendiente'"))[0].n, 3);
  }
  brevo.st.modo = 'ok';
});

await prueba('14. Límite diario configurable: no envía más del límite y conserva pendientes', async () => {
  const usados = (await A('resumen')).envios_hoy;
  await A('guardar_configuracion', { p_fechas: ['2026-11-18', '2026-11-19', '2026-11-20'], p_permitir_fuera_de_fecha: true, p_limite: usados + 1 });
  const r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
  assert.equal(r.aceptados, 1);
  const r2 = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
  assert.equal(r2.reservados, 0);
  assert.match(r2.detenido, /límite diario/);
  assert.equal((await q("select count(*)::int n from participantes where email like 'tarde%' and correo_estado = 'pendiente'"))[0].n, 2);
  await A('guardar_configuracion', { p_fechas: ['2026-11-18', '2026-11-19', '2026-11-20'], p_permitir_fuera_de_fecha: true, p_limite: 300 });
});

await prueba('14. Sin respuesta de Brevo (aceptó pero no respondió): queda "incierto", no se reintenta solo; verificar lo resuelve', async () => {
  brevo.st.modo = 'timeout'; brevo.st.demoraMs = 2500;
  const r = (await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })).data;
  brevo.st.modo = 'ok';
  assert.equal(r.inciertos, 1);
  const p = (await q("select * from participantes where correo_estado = 'incierto'"))[0];
  assert.ok(p, 'participante en incierto');
  const enviadosA = brevo.st.enviados.filter((e) => e.to === p.email).length;
  await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' });
  assert.equal(brevo.st.enviados.filter((e) => e.to === p.email).length, enviadosA, '"pendientes" no reenvía un incierto');
  const v = (await S.funcion(admin, 'enviar-qr', { accion: 'verificar', participante_id: p.id })).data;
  assert.equal(v.resultado, 'aceptado');
  assert.equal((await q('select correo_estado from participantes where id=$1', [p.id]))[0].correo_estado, 'aceptado');
  await new Promise((ok) => setTimeout(ok, 2000));
});

await prueba('14. Envío colgado (corte a mitad del proceso) pasa a "incierto" después de 5 min', async () => {
  await A('agregar_participante', { p_nombre: 'Corte de red', p_email: 'corte.red@example.com', p_institucion: '' });
  const p = (await q("select id, email from participantes where email = 'corte.red@example.com'"))[0];
  await q("update participantes set correo_estado='procesando' where id=$1", [p.id]);
  await q("insert into envios_correo (participante_id, destinatario, estado, creado_en) values ($1, $2, 'procesando', now() - interval '6 minutes')", [p.id, p.email]);
  await S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' });
  assert.equal((await q('select correo_estado from participantes where id=$1', [p.id]))[0].correo_estado, 'incierto');
  const v = (await S.funcion(admin, 'enviar-qr', { accion: 'verificar', participante_id: p.id })).data;
  assert.equal(v.resultado, 'no_encontrado');
  assert.equal((await q('select correo_estado from participantes where id=$1', [p.id]))[0].correo_estado, 'pendiente', 'queda listo para enviarse');
});

await prueba('Dos administradores envían a la vez: ningún correo duplicado', async () => {
  await A('confirmar_importacion', { p_filas: Array.from({ length: 25 }, (_, i) => ({ nombre: 'Paralelo ' + i, email: `paralelo${i}@example.com` })) });
  const antes = brevo.st.enviados.length;
  const admin2 = await S.login('admin@innomining.test', 'Admin-2026!');
  for (let k = 0; k < 4; k++) {
    await Promise.all([S.funcion(admin, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' }), S.funcion(admin2, 'enviar-qr', { accion: 'enviar', modo: 'pendientes' })]);
  }
  const nuevos = brevo.st.enviados.slice(antes).map((e) => e.to);
  assert.ok(nuevos.length >= 25);
  assert.equal(new Set(nuevos).size, nuevos.length, 'cada destinatario una sola vez');
});

await prueba('Webhook de Brevo: "delivered" → entregado; rechaza sin secreto', async () => {
  const e = (await q("select * from envios_correo where destinatario = 'mj.torres@example.com' and estado = 'aceptado'"))[0];
  const sin = await fetch(`${S.url}/functions/v1/brevo-webhook`, { method: 'POST', body: JSON.stringify({ event: 'delivered', 'message-id': e.brevo_message_id }) });
  assert.equal(sin.status, 401);
  const ok = await fetch(`${S.url}/functions/v1/brevo-webhook?secreto=webhook-secreto`, { method: 'POST', body: JSON.stringify({ event: 'delivered', 'message-id': e.brevo_message_id }) });
  assert.equal(ok.status, 200);
  assert.equal((await q('select correo_estado from participantes where id=$1', [e.participante_id]))[0].correo_estado, 'entregado');
});

await prueba('Imagen pública del QR: PNG para tokens activos; 404 para anulados o inexistentes', async () => {
  const t = (await q("select qr_token from participantes where email='ana.perez@example.com'"))[0].qr_token;
  const r = await fetch(`${S.url}/functions/v1/qr?t=${t}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  const anulado = (await q('select token from qr_anulados limit 1'))[0].token;
  assert.equal((await fetch(`${S.url}/functions/v1/qr?t=${anulado}`)).status, 404);
  assert.equal((await fetch(`${S.url}/functions/v1/qr?t=xyz`)).status, 404);
});

// ===================================================================== 9 / 10 / 15
await prueba('9. Persistencia: los datos siguen ahí tras reiniciar el servidor (nueva conexión)', async () => {
  const S2 = await iniciar({ database: 'im26_db_test', env });
  const t2 = await S2.login('admin@innomining.test', 'Admin-2026!');
  const r = await S2.llamar(t2, 'resumen');
  assert.ok(r.total >= 15 && r.ingresos_hoy >= 5);
  await S2.cerrar();
});

await prueba('10. Sincronización: lo que registra un puesto lo ve el otro y el panel al instante', async () => {
  const antes = (await S.llamar(celular, 'ultimos_ingresos')).ingresos_hoy;
  await S.llamar(laptop, 'registrar_presencial', { p_nombre: 'Rubén Ccama', p_email: 'ruben.ccama@example.com', p_institucion: '', p_confirmar: false });
  const r = await S.llamar(celular, 'ultimos_ingresos');
  assert.equal(r.ingresos_hoy, antes + 1);
  assert.equal(r.ultimos[0].nombre, 'Rubén Ccama');
  assert.equal((await A('resumen')).ingresos_hoy, antes + 1);
});

await prueba('15. Exportación: id, nombre, correo normalizado, origen y asistencias por fecha', async () => {
  const x = await A('exportar_registros');
  const c = x.filas.find((f) => f.email === 'carlos.mamani@example.com');
  assert.ok(c.id && c.asistencias['18/11/2026'] && c.asistencias['19/11/2026']);
  assert.ok(x.fechas.includes('18/11/2026') && x.fechas.includes('20/11/2026'));
  assert.ok(x.filas.some((f) => f.origen === 'Registro presencial'));
});

await prueba('Panel: indicadores coherentes con la base', async () => {
  const r = await A('resumen');
  const t = (await q('select count(*)::int n from participantes'))[0].n;
  assert.equal(r.total, t);
  assert.equal(r.previos + r.presenciales, t);
  assert.equal(r.ingresos_hoy + r.sin_ingreso_hoy, t);
});

await prueba('Eliminar: bloqueado si tiene asistencias', async () => {
  const ana = (await q("select id from participantes where email='ana.perez@example.com'"))[0].id;
  await rechaza(A('eliminar_participante', { p_id: ana }), /asistencias/);
});

await S.cerrar(); await brevo.cerrar();
const fallas = resultados.filter((r) => r[0] !== 'OK').length;
console.log(`\n${resultados.length - fallas}/${resultados.length} pruebas superadas`);
process.exit(fallas ? 1 : 0);
