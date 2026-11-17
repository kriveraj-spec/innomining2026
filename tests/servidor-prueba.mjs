// Servidor de prueba local con datos ficticios (PostgreSQL real + Brevo simulado). Uso: node tests/servidor-prueba.mjs [puerto]
import path from 'node:path';
import { iniciar, baseNueva } from './local-supabase.mjs';
import { iniciarBrevoFalso } from './fake-brevo.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
await baseNueva('im26_prueba');
const brevo = await iniciarBrevoFalso();
const env = { BREVO_API_KEY: brevo.clave, BREVO_API_BASE: brevo.base, BREVO_SENDER_EMAIL: brevo.remitente, BREVO_SENDER_NAME: 'INNOMINING 2026' };
const S = await iniciar({ database: 'im26_prueba', env, webDir: path.join(RAIZ, 'web/dist'), port: Number(process.argv[2] || 8080) });
await S.crearUsuario('admin@innomining.test', 'admin2026', 'admin', 'Administrador');
await S.crearUsuario('laptop@innomining.test', 'laptop2026', 'operador', 'Puesto laptop');
await S.crearUsuario('celular@innomining.test', 'celular2026', 'operador', 'Puesto celular');
const tk = await S.login('admin@innomining.test', 'admin2026');
const nombres = [['Ana Lucía Pérez Quispe', 'UNI'], ['Carlos Mamani Huamán', 'UNSA'], ['María José Torres Ríos', 'PUCP'], ['Jorge Luis Condori', 'UNA Puno'],
  ['Lucía Fernández Vega', 'Universidad de Lima'], ['Pedro Sánchez Rojas', 'UNMSM'], ['Rosa Elena Quispe', ''], ['Diego Alonso Ramírez', 'UNT'],
  ['Valeria Ccori Apaza', 'UNSAAC'], ['Miguel Ángel Huanca', 'Universidad Continental']];
await S.llamar(tk, 'confirmar_importacion', { p_filas: nombres.map(([n, i]) => ({ nombre: n, email: n.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.' + n.split(' ').at(-2).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@example.com', institucion: i })) });
await S.llamar(tk, 'generar_qr_pendientes', { p_limite: 8 });
console.log(`Listo en ${S.url}  · admin@innomining.test / admin2026 · laptop@innomining.test / laptop2026 · celular@innomining.test / celular2026`);
