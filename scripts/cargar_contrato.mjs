// Carga el resumen del contrato (datos/contrato/resumen.json, fuera del repositorio) en public.contrato_secciones.
// Crea la tabla si no existe (supabase/migrations/0003_contrato.sql). Uso: npm run contrato
import fs from 'node:fs';
import { conectar } from './db.mjs';

const archivo = new URL('../datos/contrato/resumen.json', import.meta.url);
if (!fs.existsSync(archivo)) throw new Error('No existe datos/contrato/resumen.json');
const resumen = JSON.parse(fs.readFileSync(archivo, 'utf8'));

const db = await conectar();
try {
  await db.query(fs.readFileSync(new URL('../supabase/migrations/0003_contrato.sql', import.meta.url), 'utf8'));
  await db.query('begin');
  // Fila 0: de qué documento sale el resumen
  const filas = [{ id: '_documento', orden: 0, icono: '📜', titulo: resumen.documento, tipo: 'meta', items: [{ t: 'Resumen actualizado el ' + resumen.actualizado }] },
    ...resumen.secciones.map((s) => ({ ...s, tipo: s.tipo || 'lista' }))];
  for (const s of filas) {
    await db.query(
      `insert into public.contrato_secciones (id, orden, icono, titulo, tipo, items, actualizado) values ($1, $2, $3, $4, $5, $6, now())
       on conflict (id) do update set orden = excluded.orden, icono = excluded.icono, titulo = excluded.titulo, tipo = excluded.tipo, items = excluded.items, actualizado = now()`,
      [s.id, s.orden, s.icono || '', s.titulo, s.tipo, JSON.stringify(s.items)]);
  }
  // Lo que ya no está en el resumen se quita
  await db.query('delete from public.contrato_secciones where not (id = any($1))', [filas.map((s) => s.id)]);
  await db.query('commit');
  await db.query("notify pgrst, 'reload schema'");
  console.log('Contrato cargado: ' + resumen.secciones.length + ' secciones, ' + resumen.secciones.reduce((n, s) => n + s.items.length, 0) + ' puntos.');
} catch (err) {
  await db.query('rollback').catch(() => {});
  throw err;
} finally {
  await db.end();
}
