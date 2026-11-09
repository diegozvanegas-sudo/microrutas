// Carga los documentos privados de zonas verdes (salen del contrato, por eso están en datos/contrato/, fuera del repositorio)
// en public.convenio_secciones, cada uno con su código:
//   GUIA-CAMPO      ← datos/contrato/guia_campo.json       (guía de revisión en campo, página Contrato)
//   REQ-PLANTILLAS  ← datos/contrato/requerimientos.json   (plantillas, ANS y datos fijos de requerimiento.html)
// Solo toca las filas de esos documentos: los convenios y el PPSA quedan como están. No aplica migraciones
// (la tabla es de 0014_convenios.sql). Se carga cada archivo que exista.
// Uso: npm run guia                 (carga)
//      npm run guia -- --ver        (solo revisa los archivos y dice qué cargaría, sin conectarse)
//      npm run guia -- --doc REQ-PLANTILLAS   (solo ese documento)
import fs from 'node:fs';
import { conectar } from './db.mjs';

const DOCS = [
  { doc: 'GUIA-CAMPO', archivo: 'guia_campo.json', icono: '🧭', prefijo: 'Guía actualizada el ' },
  { doc: 'REQ-PLANTILLAS', archivo: 'requerimientos.json', icono: '📨', prefijo: 'Plantillas actualizadas el ' },
];
const TIPOS = ['lista', 'cifras', 'tabla', 'alerta', 'chequeo', 'pasos', 'plantilla', 'config'];
const soloDoc = (() => { const i = process.argv.indexOf('--doc'); return i !== -1 ? process.argv[i + 1] : ''; })();

// Revisión de cada archivo antes de tocar la base
const cargas = [];
for (const d of DOCS) {
  if (soloDoc && d.doc !== soloDoc) continue;
  const archivo = new URL('../datos/contrato/' + d.archivo, import.meta.url);
  if (!fs.existsSync(archivo)) { console.log('(No existe datos/contrato/' + d.archivo + ': ' + d.doc + ' no se carga)'); continue; }
  const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const filas = [{ id: '_documento', orden: 0, icono: d.icono, titulo: datos.nombre, tipo: 'meta', items: [{ t: d.prefijo + datos.actualizado }] },
    ...datos.secciones.map((s, i) => ({ ...s, orden: s.orden ?? i + 1, tipo: s.tipo || 'lista' }))];
  const ids = new Set();
  for (const s of filas) {
    if (!s.id || ids.has(s.id)) throw new Error(d.doc + ': sección sin id o repetida: ' + s.id);
    ids.add(s.id);
    if (s.tipo !== 'meta' && !TIPOS.includes(s.tipo)) throw new Error(d.doc + ': tipo desconocido en ' + s.id + ': ' + s.tipo);
    if (!Array.isArray(s.items) || !s.items.length) throw new Error(d.doc + ': sección sin puntos: ' + s.id);
    // En las plantillas un campo puede ir vacío a propósito (p. ej. el asunto de «Otro»)
    for (const it of s.items) if (typeof it.t !== 'string' || (!it.t && s.tipo !== 'plantilla')) throw new Error(d.doc + ': punto sin texto en ' + s.id);
  }
  cargas.push({ ...d, filas, ids, puntos: filas.reduce((n, s) => n + s.items.length, 0) });
}
if (!cargas.length) throw new Error('No hay nada para cargar en datos/contrato/.');

if (process.argv.includes('--ver')) {
  for (const c of cargas) {
    console.log(c.doc + ' (' + c.archivo + '): ' + (c.filas.length - 1) + ' secciones, ' + c.puntos + ' puntos.');
    for (const s of c.filas.slice(1)) console.log('  ' + s.orden + '. ' + s.icono + ' ' + s.titulo + ' (' + s.tipo + ', ' + s.items.length + ')');
  }
  console.log('No se cargó nada.');
  process.exit(0);
}

const db = await conectar();
try {
  await db.query('begin');
  for (const c of cargas) {
    for (const s of c.filas) {
      await db.query(
        `insert into public.convenio_secciones (documento, id, orden, icono, titulo, tipo, items, actualizado) values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (documento, id) do update set orden = excluded.orden, icono = excluded.icono, titulo = excluded.titulo, tipo = excluded.tipo, items = excluded.items, actualizado = now()`,
        [c.doc, s.id, s.orden, s.icono || '', s.titulo, s.tipo, JSON.stringify(s.items)]);
    }
    // Secciones que ya no están en el archivo (solo de este documento)
    await db.query('delete from public.convenio_secciones where documento = $1 and not (id = any($2))', [c.doc, [...c.ids]]);
  }
  await db.query('commit');
  for (const c of cargas) console.log(c.doc + ' cargado: ' + (c.filas.length - 1) + ' secciones, ' + c.puntos + ' puntos.');
} catch (err) {
  await db.query('rollback').catch(() => {});
  throw err;
} finally {
  await db.end();
}
