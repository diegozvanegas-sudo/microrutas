// Anexos de las visitas: imágenes (recortes o pantallazos) que entran solas como evidencia cuando se arma el requerimiento.
// Van al almacenamiento privado «anexos-visitas» de Supabase (migración 0023), en una carpeta por visita. Cada una tiene su tipo:
//   reporte   el reporte de la cuadrilla de que ya ejecutó  → evidencia «Reportes de ejecución de las microrrutas»
//   envio     el envío de la novedad al contratista         → evidencia «Envío de las novedades…»
//   preaviso  el pre aviso de los 5 días hábiles            → evidencia «Envío de las novedades…»
// Se borran al mes de subidas (DIAS_GUARDA), salvo las de visitas que siguen esperando requerimiento.
//
//   var anexos = crearAnexos(supabase);
//   anexos.listar(['SUB-00042', …])        -> { 'SUB-00042': [{ nombre, ruta, tipo, fecha }] }
//   anexos.subir('SUB-00042', blob, 'recorte.jpg', 'reporte') -> { nombre, ruta, tipo, fecha }
//   anexos.bajar(ruta) -> Blob        anexos.borrar(ruta)        anexos.limpiar(protegidas) -> { borrados, sinPermiso }
export var BUCKET = 'anexos-visitas';
export var SIN_ACTIVAR = 'Para guardar los pantallazos falta aplicar la migración 0023_anexos_visitas.sql en Supabase.';
export var TIPOS = { reporte: '📋 Reporte de ejecución', envio: '📤 Envío de la novedad', preaviso: '⚠️ Pre aviso' };
export var DIAS_GUARDA = 30;

// Nombre de archivo que acepta el almacenamiento: sin tildes, espacios ni signos, con la hora adelante para que no se pisen
// y el tipo después («lz3k9a-reporte_recorte.jpg»). Sin tipo queda como los de antes («lz3k9a-recorte.jpg»)
export function nombreSeguro(nombre, ahora, tipo) {
    var limpio = String(nombre || 'anexo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]{2,5}$/i, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'anexo';
    return (ahora || Date.now()).toString(36) + '-' + (TIPOS[tipo] ? tipo + '_' : '') + limpio + '.jpg';
}
// Carpeta de la visita: su ID tal cual, sin nada que rompa la ruta
export function carpeta(id) { return String(id || '').replace(/[^a-zA-Z0-9_-]+/g, '_'); }
// Carpeta del reporte de la cuadrilla (el pantallazo del mensaje «microrrutas ejecutadas», que se guarda al crear la
// pre-ruta en Subsanaciones): una por fecha de ejecución y cuadrilla, la comparten todas las visitas de esa ejecución.
// ('2026-11-15', '2') → 'REP-2026-11-15-C2'; sin fecha → ''
export function carpetaReporte(fechaIso, cuad) {
    var f = String(fechaIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return '';
    return carpeta('REP-' + f + '-C' + (String(cuad || '').trim().replace(/^C\s*/i, '') || '0'));
}
// Tipo del archivo por su nombre; los de antes (sin tipo) eran el envío o la captura del reporte: cuentan como envío
export function tipoDe(archivo) { var m = /^[a-z0-9]+-(reporte|envio|preaviso)_/.exec(String(archivo || '')); return m ? m[1] : 'envio'; }
// «lz3k9a-reporte_pantallazo-envio.jpg» → «pantallazo envio»
export function nombreVisible(archivo) { return String(archivo || '').replace(/^[a-z0-9]+-((reporte|envio|preaviso)_)?/, '').replace(/\.jpg$/i, '').replace(/-/g, ' '); }
// Fecha en que se subió: la del almacenamiento o, si no viene, la hora del nombre
export function fechaDe(f) {
    var t = f && (f.created_at || f.updated_at);
    if (t) return new Date(t).toISOString();
    var m = /^([a-z0-9]+)-/.exec((f && f.name) || ''), n = m ? parseInt(m[1], 36) : NaN;
    return isFinite(n) && n > 1e12 ? new Date(n).toISOString() : '';
}
// Día en que se borra (aaaa-mm-dd)
export function seBorra(fecha) { if (!fecha) return ''; var d = new Date(fecha); d.setDate(d.getDate() + DIAS_GUARDA); return d.toISOString().slice(0, 10); }
// Cuáles ya cumplieron el mes. porVisita: { id: [anexo] }; protegidas: { id: true } (visitas que siguen esperando requerimiento)
export function paraBorrar(porVisita, ahora, protegidas) {
    var limite = (ahora || Date.now()) - DIAS_GUARDA * 864e5, out = [];
    Object.keys(porVisita || {}).forEach(function (id) {
        if (protegidas && protegidas[id]) return;
        (porVisita[id] || []).forEach(function (a) { if (a.fecha && Date.parse(a.fecha) < limite) out.push(a.ruta); });
    });
    return out;
}

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
    function anexo(id, f) { return { nombre: nombreVisible(f.name), ruta: carpeta(id) + '/' + f.name, tipo: tipoDe(f.name), fecha: fechaDe(f) }; }
    var api = {
        // De a 8 visitas a la vez. Si el almacenamiento no existe todavía, lanza SIN_ACTIVAR
        listar: async function (ids) {
            var out = {}, cola = (ids || []).filter(Boolean);
            for (var i = 0; i < cola.length; i += 8) {
                var res = await Promise.all(cola.slice(i, i + 8).map(function (id) { return caja().list(carpeta(id), { limit: 100, sortBy: { column: 'name', order: 'asc' } }); }));
                res.forEach(function (r, k) {
                    if (r.error) throw fallo(r.error);
                    var id = cola[i + k];
                    out[id] = (r.data || []).filter(function (f) { return f.name && f.id !== null && !/^\./.test(f.name); }).map(function (f) { return anexo(id, f); });
                });
            }
            return out;
        },
        subir: async function (id, blob, nombre, tipo) {
            var archivo = nombreSeguro(nombre, null, tipo), ruta = carpeta(id) + '/' + archivo;
            var res = await caja().upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
            if (res.error) throw fallo(res.error);
            return { nombre: nombreVisible(archivo), ruta: ruta, tipo: tipoDe(archivo), fecha: new Date().toISOString() };
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
        },
        // Borra lo que ya cumplió el mes. El almacenamiento solo deja borrar a quien lo subió o al administrador: lo de otros
        // queda hasta que esa persona (o el administrador) abra Requerimientos. Devuelve cuántos borró y cuántos no pudo
        limpiar: async function (protegidas, ahora) {
            var raiz = await caja().list('', { limit: 1000 });
            if (raiz.error) throw fallo(raiz.error);
            var ids = (raiz.data || []).filter(function (f) { return f.id === null && f.name; }).map(function (f) { return f.name; });
            var rutas = paraBorrar(await api.listar(ids), ahora, protegidas), borrados = 0;
            for (var i = 0; i < rutas.length; i += 50) {
                var r = await caja().remove(rutas.slice(i, i + 50));
                if (r.error) throw fallo(r.error);
                borrados += (r.data || []).length;
            }
            return { borrados: borrados, sinPermiso: rutas.length - borrados };
        }
    };
    return api;
}
