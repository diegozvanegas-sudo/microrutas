// Revisión de fotos con IA para el formulario de subsanaciones.
// Recibe las fotos (JPEG en base64, ya reducidas en el celular) y los ítems del formulario;
// devuelve SI / NO / SIN_DATO por ítem y el texto de observaciones.
// Variables en Netlify: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (las mismas de la página).
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MAX_FOTOS = 8;
const MODELO = 'claude-opus-5-5';

const SISTEMA = `Usted es interventor de un contrato de mantenimiento de zonas verdes en Medellín (corte de césped, bordeo, plateo, limpieza y recolección de residuos vegetales en lotes, separadores y parques).
Revisa fotos de un lote para decidir si cada ítem de la lista de verificación cumple o requiere subsanación.

Reglas:
- "SI": las fotos muestran el aspecto del ítem y cumple.
- "NO": las fotos muestran con claridad que el ítem no cumple. Explique en "detalle" qué se ve y dónde (por ejemplo "césped sin cortar junto al andén, costado derecho de la foto 2").
- "SIN_DATO": las fotos no muestran ese aspecto, o no se ve con suficiente claridad para decidir. Ante la duda use SIN_DATO, nunca adivine.
- Revise todos los ítems de la lista, en el mismo orden y con el mismo número.
- "observaciones": novedades que se ven en las fotos y que no corresponden a ningún ítem (escombros, basuras, árboles caídos, daños, riesgos, etc.), en frases cortas separadas por punto. Si no hay ninguna, escriba "SIN NOVEDAD".
- "calidad_fotos": una frase breve solo si las fotos son oscuras, borrosas o no permiten ver el lote; si están bien, cadena vacía.
- Escriba en español, en tono de informe, sin saludos.`;

const ESQUEMA = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    numero: { type: 'integer' },
                    valor: { type: 'string', enum: ['SI', 'NO', 'SIN_DATO'] },
                    detalle: { type: 'string' },
                },
                required: ['numero', 'valor', 'detalle'],
                additionalProperties: false,
            },
        },
        observaciones: { type: 'string' },
        calidad_fotos: { type: 'string' },
    },
    required: ['items', 'observaciones', 'calidad_fotos'],
    additionalProperties: false,
};

function respuesta(status, datos) {
    return new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

// Solo usuarios con sesión en la app: evita que cualquiera gaste la clave de la IA
async function usuario(req) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const url = process.env.VITE_SUPABASE_URL, llave = process.env.VITE_SUPABASE_ANON_KEY;
    if (!token || !url || !llave) return null;
    const { data, error } = await createClient(url, llave).auth.getUser(token);
    return error ? null : data.user;
}

export async function analizar({ fotos, items, tipo, lote }, cliente = new Anthropic()) {
    const lista = items.map((it, i) => `${i + 1}. ${it}`).join('\n');
    const contenido = fotos.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
    contenido.push({
        type: 'text',
        text: `Visita ${tipo === 'OPERACIÓN' ? 'durante la operación' : 'al lote ya ejecutado'}${lote ? ` (${lote})` : ''}. ${fotos.length} foto(s).\n\nÍtems a revisar:\n${lista}`,
    });
    // fallbacks "default": si la IA rechaza la solicitud por error, el servidor la reintenta con otro modelo
    const msg = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
        system: SISTEMA,
        messages: [{ role: 'user', content: contenido }],
    });
    if (msg.stop_reason === 'refusal') throw new Error('La IA no pudo revisar estas fotos.');
    if (msg.stop_reason === 'max_tokens') throw new Error('La respuesta de la IA quedó incompleta.');
    const texto = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const res = JSON.parse(texto);
    // Ítems por número; los que la IA no devolvió quedan SIN_DATO
    const porNumero = new Map(res.items.map((r) => [r.numero, r]));
    return {
        items: items.map((it, i) => {
            const r = porNumero.get(i + 1);
            return { item: it, valor: r ? r.valor : 'SIN_DATO', detalle: r ? r.detalle : '' };
        }),
        observaciones: res.observaciones.trim(),
        calidad_fotos: res.calidad_fotos.trim(),
    };
}

export default async (req) => {
    if (req.method !== 'POST') return respuesta(405, { error: 'Use POST.' });
    if (!process.env.ANTHROPIC_API_KEY) return respuesta(500, { error: 'Falta configurar ANTHROPIC_API_KEY en Netlify.' });
    if (!(await usuario(req))) return respuesta(401, { error: 'Inicie sesión para usar la revisión con fotos.' });
    let datos;
    try { datos = await req.json(); } catch { return respuesta(400, { error: 'Solicitud inválida.' }); }
    const fotos = Array.isArray(datos.fotos) ? datos.fotos.filter((f) => typeof f === 'string' && f) : [];
    const items = Array.isArray(datos.items) ? datos.items.map(String) : [];
    if (!fotos.length) return respuesta(400, { error: 'Adjunte al menos una foto.' });
    if (fotos.length > MAX_FOTOS) return respuesta(400, { error: `Máximo ${MAX_FOTOS} fotos por revisión.` });
    if (!items.length) return respuesta(400, { error: 'El formulario no tiene ítems para revisar.' });
    try {
        return respuesta(200, await analizar({ fotos, items, tipo: datos.tipo, lote: String(datos.lote || '') }));
    } catch (err) {
        console.error('analizar-fotos', err);
        if (err instanceof Anthropic.RateLimitError) return respuesta(429, { error: 'La IA está ocupada. Intente de nuevo en un minuto.' });
        if (err instanceof Anthropic.AuthenticationError) return respuesta(500, { error: 'La clave de la IA no es válida. Revise ANTHROPIC_API_KEY en Netlify.' });
        if (err instanceof Anthropic.APIError) return respuesta(502, { error: 'La IA no respondió (' + err.status + '). Intente de nuevo.' });
        return respuesta(500, { error: err.message || 'No se pudo revisar las fotos.' });
    }
};
