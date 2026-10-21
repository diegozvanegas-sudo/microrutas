import 'dotenv/config';
import pg from 'pg';

// Abre la conexión de DATABASE_URL (.env). Supabase exige SSL; el PostGIS local no.
export async function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en el archivo .env (ver .env.example)');

  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: local ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query('set search_path = public, extensions');
  return client;
}
