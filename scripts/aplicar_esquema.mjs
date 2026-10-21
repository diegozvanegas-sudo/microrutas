// Crea las tablas, índices y funciones de supabase/migrations en la base de DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { conectar } from './db.mjs';

const carpeta = new URL('../supabase/migrations/', import.meta.url);
const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();

const db = await conectar();
try {
  for (const f of archivos) {
    process.stdout.write(`Aplicando ${f}... `);
    await db.query(fs.readFileSync(new URL(f, carpeta), 'utf8'));
    console.log('ok');
  }
} finally {
  await db.end();
}
console.log(`Esquema listo (${archivos.length} archivo(s) de ${path.basename(carpeta.pathname)}).`);
