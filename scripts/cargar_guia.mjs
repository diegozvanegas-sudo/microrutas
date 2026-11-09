// Carga la guía de revisión en campo del corte de césped (datos/contrato/guia_campo.json, fuera del repositorio porque
// sale del contrato) en public.convenio_secciones como el documento GUIA-CAMPO. Solo toca las filas de ese documento:
// los convenios y el PPSA quedan como están. No aplica migraciones (la tabla es de 0014_convenios.sql).
// Uso: npm run guia            (carga)
//      npm run guia -- --ver   (solo revisa el archivo y dice qué cargaría, sin conectarse)
import fs from 'node:fs';
import { conectar } from './db.mjs';

const DOC = 'GUIA-CAMPO';
const TIPOS = ['lista', 'cifras', 'tabla', 'alerta', 'chequeo', 'pasos'];
const archivo = new URL('../datos/contrato/guia_campo.json', import.meta.url);
if (!fs.existsSync(archivo)) throw new Error('No existe datos/contrato/guia_campo.json');
const guia = JSON.parse(fs.readFileSync(archivo, 'utf8'));

// Revisión del archivo antes de tocar la base
const filas = [{ id: '_documento', orden: 0, icono: '🧭', titulo: guia.nombre, tipo: 'meta', items: [{ t: 'Guía actualizada el ' + guia.actualizado }] },
  ...guia.secciones.map((s, i) => ({ ...s, orden: s.orden ?? i + 1, tipo: s.tipo || 'lista' }))];
const ids = new Set();
for (const s of filas) {
  if (!s.id || ids.has(s.id)) throw new Error('Sección sin id o repetida: ' + s.id);
  ids.add(s.id);
  if (s.tipo !== 'meta' && !TIPOS.includes(s.tipo)) throw new Error('Tipo desconocido en ' + s.id + ': ' + s.tipo);
  if (!Array.isArray(s.items) || !s.items.length) throw new Error('Sección sin puntos: ' + s.id);
  for (const it of s.items) if (!it.t) throw new Error('Punto sin texto en ' + s.id);
}
const puntos = filas.reduce((n, s) => n + s.items.length, 0);
if (process.argv.includes('--ver')) {
  console.log('Revisado: ' + (filas.length - 1) + ' secciones, ' + puntos + ' puntos. No se cargó nada.');
  for (const s of filas.slice(1)) console.log('  ' + s.orden + '. ' + s.icono + ' ' + s.titulo + ' (' + s.tipo + ', ' + s.items.length + ')');
  process.exit(0);
}

const db = await conectar();
try {
  await db.query('begin');
  for (const s of filas) {
    await db.query(
      `insert into public.convenio_secciones (documento, id, orden, icono, titulo, tipo, items, actualizado) values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (documento, id) do update set orden = excluded.orden, icono = excluded.icono, titulo = excluded.titulo, tipo = excluded.tipo, items = excluded.items, actualizado = now()`,
      [DOC, s.id, s.orden, s.icono || '', s.titulo, s.tipo, JSON.stringify(s.items)]);
  }
  // Secciones de la guía que ya no están en el archivo (solo de este documento)
  await db.query('delete from public.convenio_secciones where documento = $1 and not (id = any($2))', [DOC, [...ids]]);
  await db.query('commit');
  console.log('Guía de campo cargada: ' + (filas.length - 1) + ' secciones, ' + puntos + ' puntos.');
} catch (err) {
  await db.query('rollback').catch(() => {});
  throw err;
} finally {
  await db.end();
}
