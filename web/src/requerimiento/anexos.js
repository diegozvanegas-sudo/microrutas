// Anexos de las visitas: el pantallazo de cuando se envió la novedad al contratista y la captura del reporte de la
// cuadrilla. Van al almacenamiento privado «anexos-visitas» de Supabase (migración 0023), en una carpeta por visita, y
// entran solos como evidencia cuando se arma el requerimiento de esa visita.
//
//   var anexos = crearAnexos(supabase);
//   anexos.listar(['SUB-00042', …])        -> { 'SUB-00042': [{ nombre, ruta }] }
//   anexos.subir('SUB-00042', blob, 'pantallazo.jpg') -> { nombre, ruta }
//   anexos.bajar(ruta) -> Blob        anexos.borrar(ruta)
export var BUCKET = 'anexos-visitas';
export var SIN_ACTIVAR = 'Para guardar los pantallazos falta aplicar la migración 0023_anexos_visitas.sql en Supabase.';

// Nombre de archivo que acepta el almacenamiento: sin tildes, espacios ni signos, con la hora adelante para que no se pisen
export function nombreSeguro(nombre, ahora) {
    var limpio = String(nombre || 'anexo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{2,5}$/i, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'anexo';
    return (ahora || Date.now()).toString(36) + '-' + limpio + '.jpg';
}
// Carpeta de la visita: su ID tal cual, sin nada que rompa la ruta
export function carpeta(id) { return String(id || '').replace(/[^a-zA-Z0-9_-]+/g, '_'); }
// «lz3k9a-pantallazo-envio.jpg» → «pantallazo envio»
export function nombreVisible(archivo) { return String(archivo || '').replace(/^[a-z0-9]+-/, '').replace(/\.jpg$/i, '').replace(/-/g, ' '); }

function fallo(error) {
    var m = (error && error.message) || '';
    if (/bucket not found|not found/i.test(m)) return new Error(SIN_ACTIVAR);
    if (/row-level security|unauthorized|not authorized/i.test(m)) return new Error('Solo quien subió el anexo o un administrador lo pueden borrar.');
    if (/exceeded|too large|maximum allowed size/i.test(m)) return new Error('La imagen pesa demasiado (máximo 5 MB).');
    return new Error('No se pudo: ' + (m || 'revise la conexión') + '.');
}

export function crearAnexos(supabase) {
    function caja() {
        if (!supabase) throw new Error('Los anexos necesitan la base de datos.');
        return supabase.storage.from(BUCKET);
    }
    return {
        // De a 8 visitas a la vez. Si el almacenamiento no existe todavía, lanza SIN_ACTIVAR
        listar: async function (ids) {
            var out = {}, cola = (ids || []).filter(Boolean);
            for (var i = 0; i < cola.length; i += 8) {
                var res = await Promise.all(cola.slice(i, i + 8).map(function (id) { return caja().list(carpeta(id), { limit: 50, sortBy: { column: 'name', order: 'asc' } }); }));
                res.forEach(function (r, k) {
                    if (r.error) throw fallo(r.error);
                    var id = cola[i + k];
                    out[id] = (r.data || []).filter(function (f) { return f.name && f.id !== null && !/^\./.test(f.name); })
                        .map(function (f) { return { nombre: nombreVisible(f.name), ruta: carpeta(id) + '/' + f.name }; });
                });
            }
            return out;
        },
        subir: async function (id, blob, nombre) {
            var archivo = nombreSeguro(nombre), ruta = carpeta(id) + '/' + archivo;
            var res = await caja().upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
            if (res.error) throw fallo(res.error);
            return { nombre: nombreVisible(archivo), ruta: ruta };
        },
        bajar: async function (ruta) {
            var res = await caja().download(ruta);
            if (res.error) throw fallo(res.error);
            return res.data;
        },
        borrar: async function (ruta) {
            var res = await caja().remove([ruta]);
            if (res.error) throw fallo(res.error);
            if (res.data && !res.data.length) throw new Error('Solo quien subió el anexo o un administrador lo pueden borrar.');
        }
    };
}
