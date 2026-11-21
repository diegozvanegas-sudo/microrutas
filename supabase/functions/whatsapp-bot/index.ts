// 🤖 Bot de WhatsApp: Evolution API le manda aquí cada mensaje que recibe el número (webhook «MESSAGES_UPSERT») y esta
// función responde. La lógica (qué entiende y qué contesta) está en web/src/bot/bot.js, con sus pruebas en web/tests.
//   - Chat directo, solo números autorizados (BOT_NUMEROS): ayuda, pendientes [cuadrilla], lote 491, listos, y guardar
//     un «REPORTE MICRORRUTAS EJECUTADAS» pegado.
//   - Grupos autorizados (BOT_GRUPOS_REPORTES): solo se guardan los reportes de ejecución, sin responder en el grupo.
//   - A los demás no se les responde.
// Evolution no tiene sesión de Supabase: entra con el secreto en la dirección (?t=BOT_SECRETO). Por eso esta función se
// publica sin revisar la sesión (verify_jwt = false en supabase/config.toml) y usa la llave de servicio solo para leer
// visitas y lotes y guardar reportes.
//   supabase secrets set BOT_SECRETO=<texto largo al azar> BOT_NUMEROS=573001112233,573009998877 BOT_GRUPOS_REPORTES=1203…@g.us
//   supabase functions deploy whatsapp-bot --no-verify-jwt
// Después, en 💬 WhatsApp (administrador) → «🤖 Activar bot», que le dice a Evolution que mande los mensajes aquí.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mensajeDe, autorizado, grupoAutorizado, comando, AYUDA, NO_ENTENDI, aRegistro, textoPendientes, textoListos, textoLote,
  reportesDe, textoGuardado, hoyColombia } from '../../../web/src/bot/bot.js';

const URL_EVO = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, '');
const LLAVE = Deno.env.get('EVOLUTION_API_KEY') || '';
const INSTANCIA = Deno.env.get('EVOLUTION_INSTANCIA') || 'microrutas';
const SECRETO = Deno.env.get('BOT_SECRETO') || '';
const NUMEROS = Deno.env.get('BOT_NUMEROS') || '';
const GRUPOS = Deno.env.get('BOT_GRUPOS_REPORTES') || '';
const POR_PAGINA = 1000;   // Supabase entrega como máximo 1.000 filas por consulta

function json(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });
}
// Compara sin cortar en la primera diferencia (no deja adivinar el secreto por el tiempo de respuesta)
function igual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function responder(chat: string, texto: string) {
  const r = await fetch(URL_EVO + '/message/sendText/' + INSTANCIA, {
    method: 'POST', headers: { apikey: LLAVE, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: chat, text: texto }),
  });
  if (!r.ok) console.error('Evolution respondió ' + r.status + ': ' + (await r.text()).slice(0, 300));
}
// deno-lint-ignore no-explicit-any
async function todas(consulta: (desde: number, hasta: number) => any) {
  // deno-lint-ignore no-explicit-any
  const filas: any[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const r = await consulta(desde, desde + POR_PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    filas.push(...r.data);
    if (r.data.length < POR_PAGINA) return filas;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!SECRETO) return json({ error: 'Falta configurar BOT_SECRETO en los secretos de Supabase.' }, 500);
  const t = new URL(req.url).searchParams.get('t') || req.headers.get('x-bot-secreto') || '';
  if (!igual(t, SECRETO)) return json({ error: 'No autorizado.' }, 401);

  const m = mensajeDe(await req.json().catch(() => null));
  if (!m) return json({ ok: true, ignorado: 'no es un mensaje de texto recibido' });
  const persona = !m.grupo && autorizado(m.de, NUMEROS), grupo = m.grupo && grupoAutorizado(m.chat, GRUPOS);
  if (!persona && !grupo) return json({ ok: true, ignorado: 'número o grupo no autorizado' });
  const cmd = comando(m.texto);
  if (grupo && cmd.tipo !== 'reporte') return json({ ok: true, ignorado: 'en los grupos solo se guardan reportes' });
  if (!URL_EVO || !LLAVE) return json({ error: 'Falta configurar EVOLUTION_URL y EVOLUTION_API_KEY.' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    let texto = '';
    if (cmd.tipo === 'reporte') {
      // Microrruta → lote y cuadrilla, para los reportes que solo traen el número del lote
      const lotes = await todas((a, b) => admin.from('lotes').select('microrruta, no_lote, cuadrilla').range(a, b));
      const LOTES: Record<string, { lote: string; cuad: string }> = {};
      for (const l of lotes) if (l.microrruta) LOTES[String(l.microrruta).toUpperCase()] = { lote: String(l.no_lote || ''), cuad: String(l.cuadrilla || '') };
      const res = reportesDe(m.texto, LOTES);
      if (res.reportes.length) {
        // Un reporte por fecha y cuadrilla: el nuevo reemplaza al anterior (igual que al pegarlo en 📊 Cruce)
        const sub = await admin.from('reportes_ejecucion').upsert(res.reportes.map((r: { fecha: string; cuad: string; items: unknown; texto: string }) =>
          ({ fecha: r.fecha, cuadrilla: r.cuad, items: r.items, texto: r.texto || '' })), { onConflict: 'fecha,cuadrilla' });
        if (sub.error) throw new Error('No se pudo guardar el reporte: ' + sub.error.message);
      }
      if (grupo) return json({ ok: true, guardados: res.reportes.length });
      texto = textoGuardado(res);
    } else if (cmd.tipo === 'ayuda') texto = AYUDA;
    else if (!cmd.tipo) texto = NO_ENTENDI;
    else {
      const filas = await todas((a, b) => admin.from('visitas').select('id, tipo, microrruta, lote, zona, cuadrilla, fecha_ejecucion, fecha_visita, observaciones, estado, respuestas').order('creado').range(a, b));
      const registros = filas.map(aRegistro), hoy = hoyColombia();
      if (cmd.tipo === 'pendientes') texto = textoPendientes(registros, hoy, cmd.arg);
      else if (cmd.tipo === 'listos') texto = textoListos(registros, hoy);
      else {
        const l = /^Z/.test(cmd.arg) ? await admin.from('lotes').select('microrruta, no_lote, cuadrilla, direccion').eq('microrruta', cmd.arg).limit(1)
          : await admin.from('lotes').select('microrruta, no_lote, cuadrilla, direccion').eq('no_lote', cmd.arg).limit(1);
        texto = textoLote(cmd.arg, registros, l.data || []);
      }
    }
    await responder(m.chat, texto);
    return json({ ok: true, comando: cmd.tipo || 'no entendido' });
  } catch (e) {
    console.error(e);
    if (persona) await responder(m.chat, '⚠️ No pude responder: ' + (e as Error).message.slice(0, 200)).catch(() => {});
    return json({ error: (e as Error).message }, 500);
  }
});
