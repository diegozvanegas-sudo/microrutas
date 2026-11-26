// Fotos e imágenes elegidas («Usar otra») de cada descuento, guardadas en el almacenamiento PRIVADO «fotos-descuentos» de
// Supabase (migración 0032_fotos_descuentos.sql). En la fila del descuento (tabla descuentos, columna filas) queda solo la
// ruta y el pie de cada foto; los bytes van al almacenamiento:
//   <id del descuento>/<microrruta>-<lote>/<marca>.jpg
//   fila: { …, fotos: [{ ruta, pie }], imgActual: ruta | '', imgDescontar: ruta | '' }
// Las fotos se suben al tocar «Guardar en el historial»; las que se quitaron (o los lotes quitados) se borran del
// almacenamiento después de guardar. Al borrar el descuento se borran todas.

export var BUCKET = 'fotos-descuentos';
export var SIN_ACTIVAR = 'Las fotos no se guardaron: falta aplicar la migración 0032_fotos_descuentos.sql en Supabase. El descuento sí quedó guardado; las fotos siguen aquí mientras no cierre la página.';

function slug(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x';
}
// Carpeta de un lote dentro del descuento
export function carpetaFila(id, f) { return slug(id) + '/' + slug((f && f.mr) || 'lote') + '-' + slug((f && f.lote) || 'na'); }
// Nombre único de una foto nueva
export function nombreNuevo(ahora, n) { return (ahora || Date.now()).toString(36) + '-' + (n || 0) + '-' + Math.random().toString(36).slice(2, 7) + '.jpg'; }

// Lo que se guarda en la fila a partir de lo que hay en pantalla (md = { fotos: [{ ruta, pie, bytes… }], actual, descontar }).
// Solo lo que ya tiene ruta (lo subido o lo traído de la base); lo que no se pudo traer (falta) se conserva tal cual.
export function metaDeMedios(md) {
    md = md || {};
    var img = function (im) { return im && im.propia && im.ruta ? im.ruta : ''; };
    return {
        fotos: (md.fotos || []).filter(function (x) { return x && x.ruta; }).map(function (x) { return { ruta: x.ruta, pie: String(x.pie || '') }; }),
        imgActual: img(md.actual), imgDescontar: img(md.descontar)
    };
}
// Todas las rutas guardadas en las filas de un descuento
export function rutasDe(filas) {
    var out = [];
    (filas || []).forEach(function (f) {
        (f.fotos || []).forEach(function (x) { if (x && x.ruta) out.push(x.ruta); });
        if (f.imgActual) out.push(f.imgActual);
        if (f.imgDescontar) out.push(f.imgDescontar);
    });
    return out.filter(function (r, i) { return out.indexOf(r) === i; });
}
// Rutas que estaban guardadas y ya no están (fotos quitadas, imágenes cambiadas, lotes quitados): se borran
export function sobrantes(antes, ahora) {
    var queda = {};
    (ahora || []).forEach(function (r) { queda[r] = 1; });
    return (antes || []).filter(function (r) { return !queda[r]; });
}
// Cuántas fotos guardadas tiene un descuento
export function contarFotos(filas) { return (filas || []).reduce(function (s, f) { return s + (f.fotos || []).length; }, 0); }

function fallo(error) {
    var m = String((error && (error.message || error.error)) || '');
    if (/bucket not found|not found/i.test(m)) return new Error(SIN_ACTIVAR);
    if (/row-level security|unauthorized|not authorized|permission/i.test(m)) return new Error('Su usuario no tiene permiso para guardar fotos de descuentos.');
    if (/exceeded|too large|maximum allowed size/i.test(m)) return new Error('Una foto pesa demasiado (máximo 5 MB).');
    if (/failed to fetch|network/i.test(m)) return new Error('Sin conexión: las fotos no se subieron. Vuelva a guardar cuando tenga señal.');
    return new Error('Las fotos no se guardaron: ' + (m || 'revise la conexión') + '.');
}

export function crearFotosDescuento(supabase) {
    function caja() { return supabase.storage.from(BUCKET); }
    return {
        // bytes (Uint8Array) → sube la foto en ruta
        subir: async function (ruta, bytes) {
            var r = await caja().upload(ruta, new Blob([bytes], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false });
            if (r.error) throw fallo(r.error);
            return ruta;
        },
        // ruta → Blob (o null si no se pudo)
        bajar: async function (ruta) {
            try { var r = await caja().download(ruta); return r.error ? null : r.data; } catch (e) { return null; }
        },
        // Direcciones firmadas (1 hora) para ver sin descargar: rutas → { ruta: url }
        urls: async function (rutas) {
            var out = {}, lista = (rutas || []).filter(Boolean);
            if (!lista.length) return out;
            var r = await caja().createSignedUrls(lista, 3600);
            if (r.error) throw fallo(r.error);
            (r.data || []).forEach(function (x) { if (x.signedUrl) out[x.path] = x.signedUrl; });
            return out;
        },
        borrar: async function (rutas) {
            var lista = (rutas || []).filter(Boolean);
            for (var i = 0; i < lista.length; i += 100) {
                var r = await caja().remove(lista.slice(i, i + 100));
                if (r.error) throw fallo(r.error);
            }
        }
    };
}
