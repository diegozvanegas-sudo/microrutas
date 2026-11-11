// Puente entre la aplicación y Evolution API (carpeta evolution-api/). La clave de Evolution queda aquí, en los secretos
// de Supabase, y nunca en la página (el repositorio es público). Solo responde a usuarios con sesión; conectar y
// desconectar el número, solo el administrador.
//   supabase secrets set EVOLUTION_URL=https://whatsapp.midominio.com EVOLUTION_API_KEY=... EVOLUTION_INSTANCIA=microrutas
//   supabase functions deploy whatsapp
// Se llama con supabase.functions.invoke('whatsapp', { body: { accion: 'enviarTexto', para, texto } }) (web/src/whatsapp/cliente.js)
// La acción enviarProgramados la llama la tarea de la base cada 5 minutos (migración 0020 y scripts/activar_programados.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_EVO = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, '');
const LLAVE = Deno.env.get('EVOLUTION_API_KEY') || '';
const INSTANCIA = Deno.env.get('EVOLUTION_INSTANCIA') || 'microrutas';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SOLO_ADMIN = new Set(['conectar', 'desconectar']);

function json(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

class ErrorEvo extends Error {
  constructor(public status: number, mensaje: string) { super(mensaje); }
}
async function evo(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(URL_EVO + ruta, {
    method: metodo,
    headers: { apikey: LLAVE, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos: any = texto;
  try { datos = JSON.parse(texto); } catch { /* texto plano */ }
  if (!r.ok) throw new ErrorEvo(r.status, 'Evolution respondió ' + r.status + ': ' + (typeof datos === 'string' ? datos : JSON.stringify(datos)).slice(0, 300));
  return datos;
}

// Teléfono (57300…) o grupo (…@g.us)
function destino(para: unknown) {
  const p = String(para || '').trim();
  if (/^[\d-]+@g\.us$/.test(p)) return p;
  const tel = p.replace(/\D/g, '');
  if (tel.length >= 10) return tel.length === 10 ? '57' + tel : tel;   // 10 dígitos: celular de Colombia
  throw new ErrorEvo(400, 'Destino no válido: use un número de celular o el ID de un grupo (…@g.us).');
}

async function estado() {
  try {
    const d = await evo('GET', '/instance/connectionState/' + INSTANCIA);
    return { estado: d?.instance?.state || d?.state || 'desconocido' };
  } catch (e) {
    if (e instanceof ErrorEvo && e.status === 404) return { estado: 'sin_instancia' };
    throw e;
  }
}

async function conectar(numero?: string) {
  // La instancia se crea la primera vez; después solo se pide un QR nuevo
  if ((await estado()).estado === 'sin_instancia') {
    await evo('POST', '/instance/create', { instanceName: INSTANCIA, integration: 'WHATSAPP-BAILEYS', qrcode: true });
  }
  const tel = String(numero || '').replace(/\D/g, '');
  const d = await evo('GET', '/instance/connect/' + INSTANCIA + (tel ? '?number=' + (tel.length === 10 ? '57' + tel : tel) : ''));
  return { qr: d?.base64 || d?.qrcode?.base64 || '', codigo: d?.pairingCode || '', estado: d?.instance?.state || '' };
}

function tipoMedio(mime: string) {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  if (/^audio\//.test(mime)) return 'audio';
  return 'document';
}

// ---------- Envíos programados (tabla whatsapp_programados, migración 0020) ----------
// Los llama la tarea de la base cada 5 minutos (scripts/activar_programados.mjs) con el encabezado x-cron-secreto.
// Toma los que ya tocan, los manda y deja el resultado. Si falla, se reintenta en 10 minutos hasta 3 veces.
const REINTENTOS = 3;
function aBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function enviarProgramados() {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const tomados = await admin.rpc('whatsapp_tomar_pendientes', { cuantos: 20 });
  if (tomados.error) throw new Error('No se pudieron leer los envíos: ' + tomados.error.message);
  const filas = (tomados.data || []) as any[];
  const resultado = { enviados: 0, errores: 0, reintentos: 0 };
  for (const f of filas) {
    try {
      const para = destino(f.para);
      if (f.archivo_ruta) {
        const bajado = await admin.storage.from('whatsapp-programados').download(f.archivo_ruta);
        if (bajado.error || !bajado.data) throw new Error('No se encontró el archivo adjunto (' + (f.archivo_nombre || f.archivo_ruta) + ').');
        const mime = String(f.archivo_mime || bajado.data.type || 'application/octet-stream');
        await evo('POST', '/message/sendMedia/' + INSTANCIA, {
          number: para, mediatype: tipoMedio(mime), mimetype: mime, media: aBase64(new Uint8Array(await bajado.data.arrayBuffer())),
          fileName: String(f.archivo_nombre || 'archivo'), caption: String(f.texto || ''),
        });
      } else {
        await evo('POST', '/message/sendText/' + INSTANCIA, { number: para, text: String(f.texto || '') });
      }
      await admin.from('whatsapp_programados').update({ estado: 'enviado', enviado_en: new Date().toISOString(), error: '' }).eq('id', f.id);
      // El archivo ya no hace falta (y puede traer datos personales)
      if (f.archivo_ruta) await admin.storage.from('whatsapp-programados').remove([f.archivo_ruta]);
      resultado.enviados++;
    } catch (e) {
      const mensaje = (e as Error).message.slice(0, 500);
      // Destino mal escrito: no sirve reintentar
      const definitivo = (e instanceof ErrorEvo && e.status === 400) || f.intentos >= REINTENTOS;
      await admin.from('whatsapp_programados').update(definitivo ? { estado: 'error', error: mensaje }
        : { estado: 'pendiente', error: mensaje + ' (se reintenta)', enviar_en: new Date(Date.now() + 10 * 60000).toISOString() }).eq('id', f.id);
      if (definitivo) resultado.errores++; else resultado.reintentos++;
    }
  }
  return resultado;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const p = await req.json().catch(() => ({}));
  // La tarea programada no tiene sesión: se identifica con el secreto guardado en Vault
  if (p.accion === 'enviarProgramados') {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const ok = await admin.rpc('whatsapp_cron_ok', { secreto: req.headers.get('x-cron-secreto') || '' });
    if (ok.data !== true) return json({ error: 'No autorizado.' }, 401);
    if (!URL_EVO || !LLAVE) return json({ error: 'Falta configurar EVOLUTION_URL y EVOLUTION_API_KEY en los secretos de Supabase.' }, 500);
    try { return json(await enviarProgramados()); } catch (e) { return json({ error: (e as Error).message }, 502); }
  }
  if (!URL_EVO || !LLAVE) return json({ error: 'Falta configurar EVOLUTION_URL y EVOLUTION_API_KEY en los secretos de Supabase.' }, 500);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const yo = await sb.auth.getUser();
  if (yo.error || !yo.data.user) return json({ error: 'Inicie sesión.' }, 401);

  if (SOLO_ADMIN.has(p.accion)) {
    const admin = await sb.rpc('es_admin');
    if (admin.data !== true) return json({ error: 'Solo el administrador puede conectar o desconectar el número.' }, 403);
  }

  try {
    switch (p.accion) {
      case 'estado':
        return json(await estado());
      case 'conectar':
        return json(await conectar(p.numero));
      case 'desconectar':
        await evo('DELETE', '/instance/logout/' + INSTANCIA);
        return json({ ok: true });
      case 'grupos': {
        const d = await evo('GET', '/group/fetchAllGroups/' + INSTANCIA + '?getParticipants=false');
        const grupos = (Array.isArray(d) ? d : []).map((g: any) => ({ id: g.id, nombre: g.subject || g.id, miembros: g.size || 0 }))
          .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, 'es'));
        return json({ grupos });
      }
      case 'enviarTexto': {
        const texto = String(p.texto || '').trim();
        if (!texto) return json({ error: 'El mensaje está vacío.' }, 400);
        const d = await evo('POST', '/message/sendText/' + INSTANCIA, { number: destino(p.para), text: texto });
        return json({ ok: true, id: d?.key?.id || '' });
      }
      case 'enviarArchivo': {
        // base64 sin el prefijo data:…;base64,
        const base64 = String(p.base64 || '').replace(/^data:[^,]*,/, '');
        if (!base64) return json({ error: 'Falta el archivo.' }, 400);
        const mime = String(p.mime || 'application/octet-stream');
        const d = await evo('POST', '/message/sendMedia/' + INSTANCIA, {
          number: destino(p.para), mediatype: tipoMedio(mime), mimetype: mime, media: base64,
          fileName: String(p.nombre || 'archivo'), caption: String(p.texto || ''),
        });
        return json({ ok: true, id: d?.key?.id || '' });
      }
      default:
        return json({ error: 'Acción desconocida: ' + p.accion }, 400);
    }
  } catch (e) {
    const status = e instanceof ErrorEvo && e.status < 500 ? e.status : 502;
    return json({ error: (e as Error).message }, status);
  }
});
