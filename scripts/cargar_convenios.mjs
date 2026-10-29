// Carga el resumen de los convenios (datos/contrato/convenios.json, fuera del repositorio) en public.convenio_secciones.
// Aplica antes supabase/migrations/0014_convenios.sql (se puede repetir). Uso: npm run convenios
import fs from 'node:fs';
import { conectar } from './db.mjs';

const archivo = new URL('../datos/contrato/convenios.json', import.meta.url);
if (!fs.existsSync(archivo)) throw new Error('No existe datos/contrato/convenios.json');
const convenios = JSON.parse(fs.readFileSync(archivo, 'utf8'));

const db = await conectar();
try {
  await db.query(fs.readFileSync(new URL('../supabase/migrations/0014_convenios.sql', import.meta.url), 'utf8'));
  await db.query('begin');
  const claves = [];
  for (const doc of convenios.documentos) {
    // Fila 0 de cada documento: nombre y fecha del resumen
    const filas = [{ id: '_documento', orden: 0, icono: '📜', titulo: doc.nombre, tipo: 'meta', items: [{ t: 'Resumen actualizado el ' + convenios.actualizado }] },
      ...doc.secciones.map((s) => ({ ...s, tipo: s.tipo || 'lista' }))];
    for (const s of filas) {
      await db.query(
        `insert into public.convenio_secciones (documento, id, orden, icono, titulo, tipo, items, actualizado) values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (documento, id) do update set orden = excluded.orden, icono = excluded.icono, titulo = excluded.titulo, tipo = excluded.tipo, items = excluded.items, actualizado = now()`,
        [doc.codigo, s.id, s.orden, s.icono || '', s.titulo, s.tipo, JSON.stringify(s.items)]);
      claves.push(doc.codigo + '|' + s.id);
    }
  }
  // Lo que ya no está en el resumen se quita
  await db.query("delete from public.convenio_secciones where not ((documento || '|' || id) = any($1))", [claves]);
  await db.query('commit');
  await db.query("notify pgrst, 'reload schema'");
  console.log('Convenios cargados: ' + convenios.documentos.length + ' documentos, ' + claves.length + ' secciones.');
} catch (err) {
  await db.query('rollback').catch(() => {});
  throw err;
} finally {
  await db.end();
}
