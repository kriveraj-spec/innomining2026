// Lectura de Excel/CSV y detección de columnas.
import readXlsxFile from 'read-excel-file';
import { norm } from './core.js';

const BOM = String.fromCharCode(0xfeff);
const REPL = String.fromCharCode(0xfffd);

/** CSV con comillas; detecta , ; o tabulación. */
export function parseCsv(texto) {
  const t = (texto.charAt(0) === BOM ? texto.slice(1) : texto);
  const linea = t.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = [';', ',', '\t'].map((s) => [s, linea.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') q = false;
      else campo += c;
    } else if (c === '"') q = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((r) => r.some((x) => String(x).trim()));
}

export async function leerArchivo(file) {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const rows = await readXlsxFile(file);
    return rows.map((r) => r.map((v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v))));
  }
  if (/\.xls$/i.test(file.name)) throw new Error('El formato .xls antiguo no es compatible. Guárdelo como .xlsx o .csv.');
  const buf = await file.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes(REPL)) txt = new TextDecoder('windows-1252').decode(buf); // CSV de Excel en español
  return parseCsv(txt);
}

/** Propone columnas: devuelve { encabezado: bool, columnas: [...], email, nombre, apellido, institucion } (índices o -1). */
export function detectar(filas) {
  const prim = (filas[0] || []).map((c) => norm(String(c).trim()));
  const encabezado = !prim.some((c) => c.includes('@'));
  const ncol = Math.max(...filas.slice(0, 50).map((r) => r.length), 0);
  const m = { encabezado, email: -1, nombre: -1, apellido: -1, institucion: -1 };
  if (encabezado) {
    prim.forEach((c, i) => {
      if (m.email < 0 && /correo|e-?mail|mail/.test(c)) m.email = i;
      else if (m.nombre < 0 && /nombre|name/.test(c) && !/usuario|institu|universidad|evento|empresa/.test(c)) m.nombre = i;
      else if (m.apellido < 0 && /apellido/.test(c)) m.apellido = i;
      else if (m.institucion < 0 && /universidad|institu|organizac|empresa|entidad|centro/.test(c)) m.institucion = i;
    });
    if (m.nombre >= 0 && /apellido/.test(prim[m.nombre])) m.apellido = -1; // «Nombres y apellidos» ya es completo
  }
  if (m.email < 0) {
    const cuenta = Array(ncol).fill(0);
    filas.slice(encabezado ? 1 : 0, 50).forEach((r) => r.forEach((c, i) => { if (/\S+@\S+\.\S+/.test(String(c))) cuenta[i]++; }));
    const best = Math.max(...cuenta);
    if (best > 0) m.email = cuenta.indexOf(best);
  }
  if (!encabezado && m.nombre < 0) {
    for (let i = 0; i < ncol; i++) {
      if (i === m.email) continue;
      if (m.nombre < 0) m.nombre = i; else if (m.institucion < 0) { m.institucion = i; break; }
    }
  }
  m.columnas = Array.from({ length: ncol }, (_, i) => (encabezado ? String(filas[0][i] || '').trim() || `Columna ${i + 1}` : `Columna ${i + 1}`));
  return m;
}

export function aplicar(filas, m) {
  return filas.slice(m.encabezado ? 1 : 0).map((r) => {
    let nombre = m.nombre >= 0 ? String(r[m.nombre] || '').trim() : '';
    if (m.apellido >= 0 && r[m.apellido]) nombre = `${nombre} ${String(r[m.apellido]).trim()}`.trim();
    return { nombre, email: m.email >= 0 ? String(r[m.email] || '') : '', institucion: m.institucion >= 0 ? String(r[m.institucion] || '') : '' };
  });
}
