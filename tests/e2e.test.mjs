// Prueba de extremo a extremo: web compilada + supabase-js + PostgreSQL real + Edge Functions + Brevo simulado.
// Tres dispositivos a la vez: administrador (laptop), operador de registro (laptop) y operador de escáner (celular con cámara simulada).
// Uso: (cd web && npx vite build) && node tests/e2e.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import qrcode from 'qrcode-generator';
import { iniciar, baseNueva } from './local-supabase.mjs';
import { iniciarBrevoFalso } from './fake-brevo.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = path.join(RAIZ, 'tests', 'capturas');
const CAM = path.join(SHOTS, 'camara.y4m');
fs.mkdirSync(SHOTS, { recursive: true });

function camara(texto) {
  const W = 640, H = 480, q = qrcode(0, 'M');
  q.addData(texto); q.make();
  const n = q.getModuleCount(), cell = Math.floor(360 / (n + 8)), size = n * cell, x0 = (W - size) >> 1, y0 = (H - size) >> 1;
  const Y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) for (let y = 0; y < cell; y++) Y.fill(16, (y0 + r * cell + y) * W + x0 + c * cell, (y0 + r * cell + y) * W + x0 + (c + 1) * cell);
  const UV = Buffer.alloc((W * H) / 2, 128), out = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 10; i++) out.push(Buffer.from('FRAME\n'), Y, UV);
  fs.writeFileSync(CAM, Buffer.concat(out));
}

const pasos = [], errores = [], paginas = [];
async function paso(nombre, fn) {
  try { await fn(); pasos.push(['OK', nombre]); console.log('✔ ' + nombre); }
  catch (e) {
    pasos.push(['FALLA', nombre]); console.log('✘ ' + nombre + '\n   ' + String(e.message).split('\n').slice(0, 4).join('\n   '));
    for (const [i, p] of paginas.entries()) await p.screenshot({ path: path.join(SHOTS, `falla-${pasos.length}-${i}.png`) }).catch(() => {});
  }
}

await baseNueva('im26_e2e');
const brevo = await iniciarBrevoFalso();
const env = { BREVO_API_BASE: brevo.base };
const S = await iniciar({ database: 'im26_e2e', env, webDir: path.join(RAIZ, 'web/dist'), port: 8787 });
const q = (sql, v) => S.pool.query(sql, v).then((r) => r.rows);
await q('update configuracion set brevo_api_base = $1', [brevo.base]); // en producción: https://api.brevo.com/v3
const CODIGO = 'CodigoDePrueba2026abcXYZ';
await S.crearUsuario('comite@innomining2026.app', CODIGO, 'admin', 'Comité organizador');

camara('IM26:' + 'f'.repeat(32));
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + CAM] });
const nueva = async (opts, etiqueta) => {
  const c = await browser.newContext({ acceptDownloads: true, ...opts });
  const p = await c.newPage();
  p.on('pageerror', (e) => errores.push(`${etiqueta}: ${e.message}`));
  paginas.push(p);
  return p;
};
async function entrar(p) {
  await p.goto(`${S.url}/#k=${CODIGO}`); // el link de acceso compartido
  await p.waitForSelector('.dias');       // primero: elegir el día
  await p.click('[data-d="1"]');
  await p.waitForSelector('.modes');      // luego: Organizador o Puerta
  assert.ok(!p.url().includes(CODIGO), 'el código no queda visible en la barra');
}

const adm = await nueva({ viewport: { width: 1360, height: 860 } }, 'admin');

await paso('Acceso sin cuentas: código incorrecto rechazado; el link de acceso entra directo y queda recordado', async () => {
  await adm.goto(S.url + '/');
  await adm.waitForSelector('#l-cod');
  await adm.fill('#l-cod', 'incorrecto'); await adm.click('#login button');
  await adm.waitForSelector('text=Código de acceso incorrecto');
  await adm.screenshot({ path: path.join(SHOTS, '01-acceso.png') });
  await entrar(adm);
  await adm.reload();
  await adm.waitForSelector('.dias'); // queda recordado: entra directo, sin código
  await adm.screenshot({ path: path.join(SHOTS, '02-elegir-dia.png') });
  await adm.click('[data-d="1"]');
  await adm.waitForSelector('.modes');
  assert.match(await adm.textContent('.modes'), /Organizador[\s\S]*Puerta/);
  await adm.screenshot({ path: path.join(SHOTS, '02b-elegir-modo.png') });
  await adm.click('.mode[href="#/registro"]');
  await adm.click('.nav[href="#/resumen"]');
  await adm.waitForSelector('#stats .stat');
});

await paso('1-2. Importar CSV: asignar columnas, revisar, corregir inválido y confirmar', async () => {
  await adm.click('.nav[href="#/participantes"]');
  await adm.waitForSelector('text=Aún no hay participantes');
  await adm.click('#b-imp');
  await adm.setInputFiles('#modal input[type=file]', path.join(RAIZ, 'samples/participantes_prueba.csv'));
  await adm.waitForSelector('#m-ok');
  assert.equal(await adm.$eval('#m-email', (s) => s.options[s.selectedIndex].text), 'email');
  await adm.screenshot({ path: path.join(SHOTS, '03-asignar-columnas.png') });
  await adm.click('#m-ok');
  await adm.waitForSelector('#r-ok');
  const chips = await adm.textContent('#modal .row');
  assert.match(chips, /12 nuevos/); assert.match(chips, /1 duplicados/); assert.match(chips, /1 por corregir/);
  await adm.screenshot({ path: path.join(SHOTS, '04-revision.png') });
  await adm.fill('tr:has-text("Correo no válido") input[data-k=email]', 'pedro.sanchez@example.com');
  await adm.click('#r-reval');
  await adm.waitForFunction(() => /13 nuevos/.test((document.querySelector('#modal .row') || {}).textContent || ''));
  await adm.click('#r-ok');
  await adm.waitForSelector('text=Importación completada');
  await adm.click('#modal [data-cerrar]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 13);
  assert.equal((await q('select count(*)::int n from participantes'))[0].n, 13, 'guardado en la base');
});

await paso('Reimportar exportación tipo Google Forms: no duplica, avisa diferencias', async () => {
  await adm.click('#b-imp');
  await adm.setInputFiles('#modal input[type=file]', path.join(RAIZ, 'samples/reimportacion_prueba.csv'));
  await adm.waitForSelector('#m-ok');
  assert.equal(await adm.$eval('#m-email', (s) => s.options[s.selectedIndex].text), 'Dirección de correo electrónico');
  await adm.click('#m-ok');
  await adm.waitForSelector('#r-ok');
  assert.match(await adm.textContent('#modal .row'), /1 nuevos/);
  await adm.click('#r-ok');
  await adm.waitForSelector('text=Importación completada');
  await adm.click('#modal [data-cerrar]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 14);
});

await paso('3. Generar QR pendientes (masivo) y 4. descargar ZIP con todas las credenciales', async () => {
  await adm.click('#b-qr'); await adm.click('#modal [data-si]');
  await adm.waitForSelector('text=Listo: 14 QR generados');
  await adm.click('[data-fin]');
  await adm.waitForSelector('#b-qr:has-text("QR al día")');
  const [dl] = await Promise.all([adm.waitForEvent('download', { timeout: 60000 }), adm.click('#b-zip')]);
  const z = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  assert.equal(Object.keys(z.files).filter((f) => f.endsWith('.png')).length, 14);
  assert.ok(z.files['indice.csv']);
  await adm.click('[data-fin]');
  await adm.screenshot({ path: path.join(SHOTS, '05-participantes.png') });
});

let tokAna;
await paso('4. Ver credencial individual y descargar PNG', async () => {
  await adm.fill('#q', 'ana lucia');
  await adm.click('#tb tr[data-id]');
  await adm.waitForSelector('#d-qr canvas');
  await adm.screenshot({ path: path.join(SHOTS, '06-detalle.png') });
  const [dl] = await Promise.all([adm.waitForEvent('download'), adm.click('[data-a=png]')]);
  assert.match(dl.suggestedFilename(), /^IM26-[A-Z2-9]{5}_ana_lucia_perez_quispe\.png$/);
  await adm.click('#modal [data-cerrar]');
  await adm.fill('#q', '');
  tokAna = (await q("select qr_token from participantes where email = 'ana.perez@example.com'"))[0].qr_token;
});

await paso('Configuración: guardar clave y remitente de Brevo desde el panel', async () => {
  await adm.click('.nav[href="#/configuracion"]');
  await adm.waitForSelector('text=Sin clave de Brevo');
  await adm.fill('#b-clave', brevo.clave); await adm.fill('#b-rem', brevo.remitente);
  await adm.click('#b-guardar');
  await adm.waitForSelector('text=Clave guardada');
  assert.equal(await adm.inputValue('#b-clave'), '');
});

await paso('6. Correos: verificar Brevo, vista previa institucional, prueba y envío a pendientes', async () => {
  await adm.click('.nav[href="#/correos"]');
  await adm.waitForSelector('#estado .notice.ok');
  await adm.click('#b-prev');
  await adm.frameLocator('iframe.mail-frame').locator('text=Te compartimos tu código QR personal').waitFor();
  await adm.screenshot({ path: path.join(SHOTS, '07-vista-previa-correo.png') });
  await adm.click('#modal [data-cerrar]');
  await adm.click('#b-prueba'); await adm.fill('#p-email', 'comite@example.com'); await adm.click('#p-ok');
  await adm.waitForSelector('text=Brevo aceptó el correo de prueba');
  brevo.st.enviados.length = 0;
  await adm.click('#b-pend'); await adm.click('#modal [data-si]');
  await adm.waitForSelector('text=Envío terminado', { timeout: 30000 });
  assert.equal(brevo.st.enviados.length, 14);
  assert.equal(new Set(brevo.st.enviados.map((e) => e.to)).size, 14);
  const mAna = brevo.st.enviados.find((e) => e.to === 'ana.perez@example.com');
  assert.ok(mAna.html.includes(`/storage/v1/object/public/qr/${tokAna}.png`), 'imagen del QR desde Storage');
  assert.ok(S.almacen.has(`qr/${tokAna}.png`), 'PNG subido a Storage');
  assert.equal(Buffer.from(mAna.adjuntos[0].content, 'base64').subarray(1, 4).toString(), 'PNG');
  const img = await fetch(`${S.url}/storage/v1/object/public/qr/${tokAna}.png`);
  assert.equal(img.status, 200);
  await adm.click('[data-fin]');
  await adm.waitForSelector('#b-pend:has-text("(0)")');
  await adm.screenshot({ path: path.join(SHOTS, '08-correos.png') });
});

// ---------------------------------------------------------------- Puestos simultáneos
camara('IM26:' + tokAna);
const cel = await nueva({ ...devices['Pixel 7'] }, 'celular');
await cel.context().grantPermissions(['camera'], { origin: S.url });
const lap = await nueva({ viewport: { width: 1280, height: 800 } }, 'laptop');

await paso('Laptop: entra con el mismo link y elige Organizador', async () => { await entrar(lap); await lap.click('.mode[href="#/registro"]'); await lap.waitForSelector('#f-nombre'); });

await paso('8. Celular: modo escáner abre la cámara y registra el ingreso del QR', async () => {
  await entrar(cel);
  await cel.screenshot({ path: path.join(SHOTS, '09-celular-inicio.png') });
  await cel.click('.mode[data-modo="entrada"]');
  await cel.waitForSelector('#res.ok', { timeout: 20000 });
  const t = await cel.textContent('#res');
  assert.match(t, /INGRESO REGISTRADO/); assert.match(t, /Ana Lucía Pérez Quispe/);
  await cel.screenshot({ path: path.join(SHOTS, '10-escaner-ok.png') });
});

await paso('11. Mismo QR otra vez: INGRESO YA REGISTRADO sin duplicar', async () => {
  await cel.waitForSelector('#res.ya', { timeout: 20000 });
  await cel.screenshot({ path: path.join(SHOTS, '11-escaner-ya.png') });
  assert.equal((await q("select count(*)::int n from asistencias a join participantes p on p.id=a.participante_id where p.email='ana.perez@example.com'"))[0].n, 1);
});

await paso('7. Laptop: registra a un no inscrito en un paso; queda acreditado y su QR pendiente de envío', async () => {
  await lap.fill('#f-nombre', 'Hugo Salas Ccama');
  await lap.fill('#f-email', 'hugo.salas@example.com');
  await lap.fill('#f-inst', 'Universidad Nacional Jorge Basadre');
  await lap.click('#f-btn');
  await lap.waitForSelector('#res .result.ok');
  assert.match(await lap.textContent('#res'), /pendiente de envío/);
  assert.equal(await lap.inputValue('#f-nombre'), '', 'formulario listo para el siguiente');
  await lap.waitForSelector('#feed li:has-text("Hugo Salas")');
  await lap.screenshot({ path: path.join(SHOTS, '12-registro-presencial.png') });
  const p = (await q("select * from participantes where email='hugo.salas@example.com'"))[0];
  assert.ok(p.qr_token && p.origen === 'presencial' && p.correo_estado === 'pendiente');
});

await paso('Situación C (laptop): correo ya inscrito → confirma sin duplicar; búsqueda registra a otro', async () => {
  await lap.fill('#f-nombre', 'Diego R'); await lap.fill('#f-email', 'diego.ramirez@example.com');
  await lap.click('#f-btn');
  await lap.waitForSelector('text=ESTE CORREO YA ESTÁ REGISTRADO');
  await lap.click('[data-confirmar]');
  await lap.waitForSelector('#res .result.ok');
  await lap.fill('#q', 'valeria');
  await lap.click('#qres [data-id]');
  await lap.waitForSelector('#qres .chip.ok');
  assert.equal((await q("select count(*)::int n from participantes where email in ('diego.ramirez@example.com','valeria.ccori@example.com')"))[0].n, 2);
});

await paso('14. Sin conexión en la laptop: avisa que NO se registró; al volver, registra sin duplicar', async () => {
  await lap.context().setOffline(true);
  await lap.fill('#f-nombre', 'Nora Vilca'); await lap.fill('#f-email', 'nora.vilca@example.com');
  await lap.click('#f-btn');
  await lap.waitForSelector('#res .result.bad');
  assert.match(await lap.textContent('#res'), /Sin conexión/);
  await lap.context().setOffline(false);
  await lap.click('#f-btn');
  await lap.waitForSelector('#res .result.ok');
  assert.equal((await q("select count(*)::int n from participantes where email='nora.vilca@example.com'"))[0].n, 1);
});

await paso('10. Sincronización: el panel del admin muestra los ingresos de ambos puestos sin recargar', async () => {
  await adm.click('.nav[href="#/resumen"]');
  await adm.waitForFunction(() => {
    const s = [...document.querySelectorAll('#stats .stat')].find((x) => /Ingresos Día 1/.test(x.textContent));
    return s && s.querySelector('b').textContent === '5';
  }, null, { timeout: 15000 });
  await adm.screenshot({ path: path.join(SHOTS, '13-inicio-sincronizado.png') });
});

await paso('13. Envío posterior a presenciales: seleccionar y enviar; llega el MISMO QR', async () => {
  await adm.click('.nav[href="#/participantes"]');
  await adm.click('#grupos [data-g="presencial"]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 2);
  await adm.check('#todos');
  await adm.click('#sel-env'); await adm.click('#s-ok');
  await adm.waitForSelector('text=Envío terminado');
  const t = (await q("select qr_token from participantes where email='hugo.salas@example.com'"))[0].qr_token;
  const m = brevo.st.enviados.find((e) => e.to === 'hugo.salas@example.com');
  assert.ok(m && m.html.includes(t), 'mismo QR');
  await adm.click('[data-fin]');
});

await paso('Inscritos (pestañas Preinscritos / En puerta) y Asistencia por día separadas', async () => {
  await adm.click('.nav[href="#/participantes"]');
  await adm.click('#grupos [data-g="presencial"]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 2);
  await adm.click('#grupos [data-g="previo"]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 14);
  await adm.screenshot({ path: path.join(SHOTS, '05b-inscritos.png') });
  await adm.click('#grupos [data-g="todos"]');
  await adm.click('.nav[href="#/asistencia"]');
  await adm.waitForFunction(() => /Entradas Día 1/.test(document.querySelector('#st')?.textContent || ''));
  const n1 = await adm.$$eval('#tb tr', (r) => r.length);
  assert.equal(n1, 5);
  await adm.click('#tabs [data-d="2"]');
  await adm.waitForFunction(() => /Entradas Día 2/.test(document.querySelector('#st').textContent));
  await adm.click('#tabs [data-d="1"]');
  await adm.waitForSelector('#tb tr:has-text("En puerta")');
  await adm.screenshot({ path: path.join(SHOTS, '13b-asistencia.png') });
});

await paso('9. Persistencia: tras recargar todo sigue en la base central', async () => {
  await adm.reload();
  await adm.click('.nav[href="#/participantes"]');
  await adm.waitForSelector('#tb tr[data-id]');
  await adm.waitForFunction(() => document.querySelectorAll('#tb tr[data-id]').length === 16);
});

await paso('15. Exportar CSV con id, correo normalizado, origen y asistencia por fecha', async () => {
  const [dl] = await Promise.all([adm.waitForEvent('download'), adm.click('#b-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const lineas = csv.trim().split('\n');
  assert.match(lineas[0], /^.?id,codigo,nombre,email,institucion,origen,qr,correo,ingreso_dia1,ingreso_dia2,ingreso_dia3,salida_dia1,salida_dia2,salida_dia3$/);
  assert.equal(lineas.length, 17);
  assert.ok(lineas.some((l) => l.includes('hugo.salas@example.com') && l.includes('Registro presencial')));
  fs.copyFileSync(await dl.path(), path.join(SHOTS, 'exportacion.csv'));
});

await paso('Configuración: fecha y lugar aparecen en la vista previa del correo', async () => {
  await adm.click('.nav[href="#/configuracion"]');
  await adm.fill('#e-fecha', '18, 19 y 20 de noviembre de 2026');
  await adm.fill('#e-lugar', 'Auditorio principal UNSA');
  await adm.click('#e-guardar');
  await adm.waitForSelector('text=Datos del congreso guardados');
  await adm.screenshot({ path: path.join(SHOTS, '14-configuracion.png') });
  await adm.click('.nav[href="#/correos"]');
  await adm.click('#b-prev');
  await adm.frameLocator('iframe.mail-frame').locator('text=Auditorio principal UNSA').waitFor();
  await adm.screenshot({ path: path.join(SHOTS, '07b-correo-con-evento.png') });
  await adm.click('#modal [data-cerrar]');
});

await paso('Día 2: el mismo QR registra un ingreso nuevo; Día 1 conserva el suyo', async () => {
  await cel.goto(S.url + '/#/inicio');
  await cel.waitForSelector('.dias');
  await cel.click('[data-d="2"]');
  await cel.click('.mode[data-modo="entrada"]');
  await cel.waitForSelector('#res.ok', { timeout: 20000 });
  assert.match(await cel.textContent('#res'), /Día 2/);
  const dias = await q("select dia from asistencias a join participantes p on p.id=a.participante_id where p.email='ana.perez@example.com' order by dia");
  assert.deepEqual(dias.map((x) => x.dia), [1, 2]);
});

await paso('Salida (Día 2): modo Salida escanea el QR, registra la 2.ª toma y Asistencia muestra entrada y salida', async () => {
  await cel.goto(S.url + '/#/inicio');
  await cel.waitForSelector('.dias');
  await cel.click('[data-d="2"]');
  await cel.click('.mode[data-modo="salida"]');
  await cel.waitForSelector('.scan-page.salida');
  await cel.waitForSelector('#res.ok', { timeout: 20000 });
  const t = await cel.textContent('#res');
  assert.match(t, /SALIDA REGISTRADA/); assert.match(t, /Ana Lucía Pérez Quispe/); assert.match(t, /Entró/);
  await cel.screenshot({ path: path.join(SHOTS, '14b-escaner-salida.png') });
  await cel.waitForSelector('#res.ya', { timeout: 20000 });
  assert.match(await cel.textContent('#res'), /SALIDA YA REGISTRADA/);
  const sal = await q("select dia from salidas s join participantes p on p.id=s.participante_id where p.email='ana.perez@example.com'");
  assert.deepEqual(sal.map((x) => x.dia), [2]);
  assert.equal((await q("select count(*)::int n from asistencias a join participantes p on p.id=a.participante_id where p.email='ana.perez@example.com'"))[0].n, 2, 'la salida no crea entradas');
  await lap.goto(S.url + '/#/asistencia');
  await lap.click('#tabs [data-d="2"]');
  await lap.waitForFunction(() => /Entradas Día 2/.test(document.querySelector('#st')?.textContent || '') && /Ana Lucía/.test(document.querySelector('#tb')?.textContent || ''));
  const fila = await lap.textContent('#tb tr:has-text("Ana Lucía")');
  assert.match(fila, /\d\d:\d\d:\d\d[\s\S]*\d\d:\d\d:\d\d/, 'muestra hora de entrada y de salida');
  await lap.screenshot({ path: path.join(SHOTS, '14c-asistencia-salida.png') });
  await cel.click('#modo');
  await cel.waitForSelector('.scan-page:not(.salida)');
});

await paso('Celular: vista móvil sin desplazamiento horizontal', async () => {
  const m = await nueva({ ...devices['iPhone 13'] }, 'movil');
  await entrar(m);
  await m.goto(S.url + '/#/participantes');
  await m.waitForSelector('#tb tr[data-id]');
  assert.ok((await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await m.screenshot({ path: path.join(SHOTS, '15-movil-participantes.png') });
  await m.goto(S.url + '/#/registro');
  await m.waitForSelector('#f-nombre');
  await m.screenshot({ path: path.join(SHOTS, '16-movil-registro.png') });
});

await paso('Sin errores de JavaScript en ningún dispositivo', async () => { assert.deepEqual(errores, []); });

await browser.close(); await S.cerrar(); await brevo.cerrar();
const f = pasos.filter((p) => p[0] !== 'OK').length;
console.log(`\n${pasos.length - f}/${pasos.length} pasos superados`);
process.exit(f ? 1 : 0);
