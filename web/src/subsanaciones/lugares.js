// Libreta de nombres que usa la gente (tabla «lugares» de Supabase, migración 0021): la comparte todo el equipo.
//   var libreta = crearLibreta(supabase);
//   libreta.leer()                 -> [{ id, nombre, lote, microrruta, lat, lon, nota, mio }]
//   libreta.guardar({ nombre, lote, microrruta, lat, lon })   (el mismo nombre se reemplaza)
//   libreta.borrar(id)
import { claveLugar } from './ubicardir.js';

// La tabla no existe todavía (falta aplicar la migración): la herramienta sigue sirviendo sin libreta
export function faltaTabla(error) {
    var e = error || {};
    return e.code === '42P01' || e.code === 'PGRST205' || /relation .*lugares.* does not exist|could not find the table/i.test(e.message || '');
}
export var SIN_ACTIVAR = 'La libreta todavía no está activada: falta aplicar la migración 0021_lugares.sql en Supabase.';

// Lo que se va a guardar, ya revisado. Devuelve { fila } o { error } con el motivo en palabras
export function prepararLugar(d) {
    var nombre = String(d.nombre || '').replace(/\s+/g, ' ').trim(), clave = claveLugar(nombre);
    if (nombre.length < 3 || clave.length < 4) return { error: 'Escriba el nombre como lo dice la gente (por ejemplo «La Cañada»).' };
    if (nombre.length > 80) return { error: 'El nombre es muy largo: deje solo el nombre del sitio (máximo 80 letras).' };
    var lote = String(d.lote || '').trim() || null, mr = String(d.microrruta || '').trim().toUpperCase() || null;
    var lat = d.lat == null || d.lat === '' ? null : Number(d.lat), lon = d.lon == null || d.lon === '' ? null : Number(d.lon);
    if (lat != null && lon != null && (!isFinite(lat) || !isFinite(lon))) { lat = null; lon = null; }
    if (lat == null || lon == null) { lat = null; lon = null; }
    if (!lote && !mr && lat == null) return { error: 'Falta decir a qué lote corresponde ese nombre.' };
    return { fila: { nombre: nombre, clave: clave, lote: lote, microrruta: mr, lat: lat, lon: lon } };
}

export function crearLibreta(supabase) {
    function tabla() {
        if (!supabase) throw new Error('La libreta necesita la base de datos (falta configurarla).');
        return supabase.from('lugares');
    }
    function fallo(error) {
        if (faltaTabla(error)) return new Error(SIN_ACTIVAR);
        if (error && (error.code === '42501' || /row-level security/i.test(error.message || '')))
            return new Error('Ese nombre ya lo guardó otra persona: solo ella o un administrador lo pueden cambiar o borrar.');
        return new Error('No se pudo: ' + ((error && error.message) || 'revise la conexión') + '.');
    }
    return {
        leer: async function () {
            var s = await supabase.auth.getSession(), yo = s.data && s.data.session ? s.data.session.user.id : '';
            var res = await tabla().select('id, nombre, lote, microrruta, lat, lon, nota, usuario').order('nombre');
            if (res.error) throw fallo(res.error);
            return res.data.map(function (l) { l.mio = l.usuario === yo; return l; });
        },
        guardar: async function (d) {
            var p = prepararLugar(d);
            if (p.error) throw new Error(p.error);
            var res = await tabla().upsert(p.fila, { onConflict: 'clave' });
            if (res.error) throw fallo(res.error);
            return p.fila;
        },
        borrar: async function (id) {
            var res = await tabla().delete().eq('id', id);
            if (res.error) throw fallo(res.error);
        }
    };
}
