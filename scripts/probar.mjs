// Prueba rápida: qué lote hay en un punto y cuáles quedan cerca.
// Uso: npm run probar -- 6.2844 -75.5980
import { conectar } from './db.mjs';

const lat = Number(process.argv[2] ?? 6.207655);
const lon = Number(process.argv[3] ?? -75.564977);

const db = await conectar();
try {
  const dentro = await db.query('select fid, no_lote, microrruta, zona, cuadrilla, frecuencia, comuna, direccion from lote_en_punto($1, $2)', [lat, lon]);
  console.log(`Punto ${lat}, ${lon}`);
  console.log(dentro.rows.length ? 'Cae dentro de:' : 'No cae dentro de ningún lote.');
  if (dentro.rows.length) console.table(dentro.rows);

  const cerca = await db.query('select * from lotes_cercanos($1, $2, 3, 500)', [lat, lon]);
  console.log('Más cercanos (hasta 500 m):');
  console.table(cerca.rows);
} finally {
  await db.end();
}
