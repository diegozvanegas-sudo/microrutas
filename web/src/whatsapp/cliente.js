// Enviar por WhatsApp desde cualquier página, a través del puente de Supabase (supabase/functions/whatsapp) y Evolution API.
// para: celular (3001234567) o ID de grupo (…@g.us, se ve en whatsapp.html). Si falla, lanza el error con el motivo.
import { supabase } from '../supabase.js';

async function llamar(cuerpo) {
    var res = await supabase.functions.invoke('whatsapp', { body: cuerpo });
    if (res.error) {
        // El puente responde { error } con el motivo; supabase-js lo deja en error.context
        var motivo = '';
        try { motivo = (await res.error.context.json()).error; } catch (e) {}
        throw new Error(motivo || res.error.message);
    }
    return res.data;
}

export function estadoWhatsapp() { return llamar({ accion: 'estado' }); }
export function conectarWhatsapp(numero) { return llamar({ accion: 'conectar', numero: numero || '' }); }
export function desconectarWhatsapp() { return llamar({ accion: 'desconectar' }); }
export function gruposWhatsapp() { return llamar({ accion: 'grupos' }).then(function (d) { return d.grupos || []; }); }
export function enviarTexto(para, texto) { return llamar({ accion: 'enviarTexto', para: para, texto: texto }); }

// archivo: File o Blob (PDF, imagen…); texto: va como pie del archivo
export function enviarArchivo(para, archivo, nombre, texto) {
    return new Promise(function (ok, mal) {
        var lector = new FileReader();
        lector.onload = function () { ok(String(lector.result).replace(/^data:[^,]*,/, '')); };
        lector.onerror = function () { mal(new Error('No se pudo leer el archivo.')); };
        lector.readAsDataURL(archivo);
    }).then(function (base64) {
        return llamar({ accion: 'enviarArchivo', para: para, base64: base64, nombre: nombre || archivo.name || 'archivo', mime: archivo.type || 'application/octet-stream', texto: texto || '' });
    });
}
