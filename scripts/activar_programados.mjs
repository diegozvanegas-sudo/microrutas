// Activa (o apaga) la tarea que cada 5 minutos manda los envíos de WhatsApp programados (migración 0020).
// Crea en Vault el secreto «whatsapp_cron» (si no existe) y programa con pg_cron una llamada a la función «whatsapp»
// con la acción enviarProgramados. Necesita la migración 0020 aplicada y la función publicada (supabase functions deploy whatsapp).
// Uso (en la carpeta del proyecto, con DATABASE_URL de Supabase en .env):
//   node scripts/activar_programados.mjs --ver                       (dice qué haría, sin tocar nada)
//   node scripts/activar_programados.mjs --anon <llave anon pública>  (activa; la llave también se lee de web/.env)
//   node scripts/activar_programados.mjs --apagar                    (quita la tarea)
//   node scripts/activar_programados.mjs --estado                    (últimas corridas de la tarea y envíos pendientes)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { conectar } from './db.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? '' : process.argv[i + 1] || ''; };
const TAREA = 'whatsapp-programados';

// La dirección del proyecto sale del usuario del pooler (postgres.<ref>) o de VITE_SUPABASE_URL
function leerEnvWeb() {
  for (const f of ['web/.env.local', 'web/.env']) {
    const ruta = new URL('../' + f, import.meta.url);
    if (fs.existsSync(ruta)) return Object.fromEntries(fs.readFileSync(ruta, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  }
  return {};
}
const web = leerEnvWeb();
const ref = (process.env.DATABASE_URL || '').match(/postgres\.([a-z0-9]{20})[:@]/)?.[1];
const url = (arg('--url') || web.VITE_SUPABASE_URL || (ref ? 'https://' + ref + '.supabase.co' : '')).replace(/\/+$/, '');
const anon = arg('--anon') || web.VITE_SUPABASE_ANON_KEY || '';

if (process.argv.includes('--ver')) {
  console.log('Tarea «' + TAREA + '»: cada 5 minutos, POST ' + (url || '(falta la dirección del proyecto)') + '/functions/v1/whatsapp { accion: "enviarProgramados" }');
  console.log('Secreto en Vault: whatsapp_cron (se crea si no existe). Llave anon: ' + (anon ? 'sí' : 'falta (use --anon o web/.env)') + '.');
  console.log('No se cambió nada.');
  process.exit(0);
}

const db = await conectar();
try {
  if (process.argv.includes('--estado')) {
    const t = await db.query("select jobid, schedule, active from cron.job where jobname = $1", [TAREA]);
    console.log(t.rows.length ? 'Tarea activa: ' + JSON.stringify(t.rows[0]) : 'La tarea no está activa.');
    if (t.rows.length) {
      const c = await db.query('select status, start_time, return_message from cron.job_run_details where jobid = $1 order by start_time desc limit 5', [t.rows[0].jobid]);
      console.table(c.rows);
    }
    const p = await db.query("select estado, count(*)::int as n, min(enviar_en) as proximo from public.whatsapp_programados group by estado order by estado");
    console.table(p.rows);
    process.exit(0);
  }
  if (process.argv.includes('--apagar')) {
    const r = await db.query('select cron.unschedule(jobid) from cron.job where jobname = $1', [TAREA]);
    console.log(r.rowCount ? 'Tarea apagada: los programados quedan guardados y no se envían.' : 'La tarea no estaba activa.');
    process.exit(0);
  }
  if (!url) throw new Error('Falta la dirección del proyecto: use --url https://<ref>.supabase.co');
  if (!anon) throw new Error('Falta la llave anon pública: use --anon <llave> (Project Settings > API) o póngala en web/.env');
  const hay = await db.query("select 1 from vault.secrets where name = 'whatsapp_cron'");
  if (!hay.rowCount) await db.query("select vault.create_secret($1, 'whatsapp_cron', 'Identifica la tarea de envíos programados de WhatsApp')", [crypto.randomBytes(32).toString('hex')]);
  const cuerpo = `select net.http_post(
      url := '${url}/functions/v1/whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ${anon}',
                 'x-cron-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron')),
      body := '{"accion": "enviarProgramados"}'::jsonb, timeout_milliseconds := 60000)`;
  await db.query('select cron.schedule($1, $2, $3)', [TAREA, '*/5 * * * *', cuerpo]);
  console.log('Listo: la tarea «' + TAREA + '» corre cada 5 minutos. Revísela con: node scripts/activar_programados.mjs --estado');
} finally {
  await db.end();
}
