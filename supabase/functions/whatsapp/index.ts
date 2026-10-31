// Puente entre la aplicación y Evolution API (carpeta evolution-api/). La clave de Evolution queda aquí, en los secretos
// de Supabase, y nunca en la página (el repositorio es público). Solo responde a usuarios con sesión; conectar y
// desconectar el número, solo el administrador.
//   supabase secrets set EVOLUTION_URL=https://whatsapp.midominio.com EVOLUTION_API_KEY=... EVOLUTION_INSTANCIA=microrutas
//   supabase functions deploy whatsapp
// Se llama con supabase.functions.invoke('whatsapp', { body: { accion: 'enviarTexto', para, texto } }) (web/src/whatsapp/cliente.js)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  if (!URL_EVO || !LLAVE) return json({ error: 'Falta configurar EVOLUTION_URL y EVOLUTION_API_KEY en los secretos de Supabase.' }, 500);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const yo = await sb.auth.getUser();
  if (yo.error || !yo.data.user) return json({ error: 'Inicie sesión.' }, 401);

  const p = await req.json().catch(() => ({}));
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
