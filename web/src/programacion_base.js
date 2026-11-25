// Programación del mes en la base (tabla «programaciones», migración 0030) para todos los equipos, y siempre una copia en
// este equipo (localStorage «programacion_cache», la que ya leen todas las secciones). Sin señal o sin la tabla, sirve con la
// copia y lo dice; lo que quedó solo en el equipo se sube al volver.
//
//   var base = crearProgBase(supabase);
//   base.sincronizar()               -> { datos, cambio, aviso }   baja la del mes si en la base hay una más nueva
//   base.guardar(datos, { forzar })  -> { ok, conflicto, datos, aviso }
//        forzar: un Excel nuevo reemplaza el mes. Sin forzar (marcar hecho, editar un lote): si otro equipo cambió el mes
//        entretanto, no se pisa: vuelve conflicto con la versión de la base
//   base.historial()                 -> [{ mes, archivo, hechos }] | null   (para la 🔮 predicción)
//   base.agregarMes(prog, archivo)   -> { estado: 'nuevo' | 'actualizado' | 'ya' | 'equipo', aviso }   (meses anteriores)
//
// datos = { archivo, cargado, prog, version, pendiente, forzar } (version: la de la base que tiene este equipo)

export var PROG_CACHE = 'programacion_cache';
export var SIN_TABLA = 'La programación quedó solo en este equipo: falta aplicar la migración 0030_programaciones.sql en Supabase para verla en los demás.';
var SIN_SENAL = 'Sin conexión con la base: la programación quedó en este equipo y se sube cuando vuelva la señal.';

export function leerLocal() { try { return JSON.parse(localStorage.getItem(PROG_CACHE)) || null; } catch (e) { return null; } }
export function guardarLocal(d) { try { localStorage.setItem(PROG_CACHE, JSON.stringify(d)); return true; } catch (e) { return false; } }

function faltaTabla(e) {
    e = e || {};
    return e.code === '42P01' || e.code === 'PGRST205' || /relation .*programaciones.* does not exist|could not find the table/i.test(e.message || '');
}
function hoyMes() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

// Lo hecho en corto, por quincena: [[mr, lote, q, fecha], …]
export function hechosCompactos(prog) {
    var out = [];
    [[1, prog.q1 || []], [2, prog.q2 || []]].forEach(function (p) {
        p[1].forEach(function (x) { if (x.hecho && /^\d{4}-\d\d-\d\d$/.test(x.fecha || '')) out.push([x.mr, x.lote, p[0], x.fecha]); });
    });
    return out;
}
function contar(prog) { return (prog.q1 || []).length + (prog.q2 || []).length; }

// Qué mes mostrar: el que tiene este equipo mientras siga en la base y no haya llegado el mes en curso; si no, el del mes
// en curso, o el último que no sea del futuro, o el último. filas: [{ mes, version }]
export function elegirActiva(filas, mesLocal, mesHoy) {
    var meses = filas.map(function (f) { return f.mes; }).sort();
    if (!meses.length) return '';
    var hay = function (m) { return meses.indexOf(m) !== -1; };
    if (mesLocal && hay(mesLocal) && !(mesLocal < mesHoy && hay(mesHoy))) return mesLocal;
    if (hay(mesHoy)) return mesHoy;
    var pasados = meses.filter(function (m) { return m <= mesHoy; });
    return pasados.length ? pasados[pasados.length - 1] : meses[meses.length - 1];
}
// ¿Hay que bajar la fila de la base? (no se baja encima de cambios de este equipo que todavía no se subieron)
export function bajarAntes(local, fila) {
    if (!fila) return false;
    if (!local || !local.prog) return true;
    if (local.pendiente) return false;
    if (local.prog.mes !== fila.mes) return true;
    return local.version == null || fila.version > local.version;
}
function fechaCorta(ts) { var d = new Date(ts); return isNaN(d) ? '' : ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
function deFila(f) { return { archivo: f.archivo, cargado: fechaCorta(f.actualizado), prog: f.datos, version: f.version, pendiente: false }; }

export function crearProgBase(supabase) {
    async function uid() {
        if (!supabase) return null;
        try { var s = await supabase.auth.getSession(); return s.data.session ? s.data.session.user.id : null; } catch (e) { return null; }
    }
    function marcarPendiente(d, forzar) {
        d.pendiente = true;
        if (forzar) d.forzar = true;
        guardarLocal(d);
    }
    async function guardar(d, opc) {
        var forzar = !!(opc && opc.forzar) || !!d.forzar;
        marcarPendiente(d, forzar);
        var yo = await uid();
        if (!yo) return { ok: false, datos: d, aviso: supabase ? SIN_SENAL : '' };
        var p = d.prog, fila = { mes: p.mes, archivo: String(d.archivo || '').slice(0, 200), datos: p, hechos: hechosCompactos(p), lotes: contar(p), usuario: yo, actualizado: new Date().toISOString() };
        try {
            var r;
            if (forzar || d.version == null) {
                var v = await supabase.from('programaciones').select('version').eq('mes', p.mes).maybeSingle();
                if (v.error) throw v.error;
                // Sin forzar y sin versión: la copia vieja de este equipo no reemplaza un mes que ya está en la base
                if (!forzar && v.data) return conflicto(p.mes);
                fila.version = (v.data ? v.data.version : 0) + 1;
                r = await supabase.from('programaciones').upsert(fila, { onConflict: 'mes' }).select('version').single();
            } else {
                fila.version = d.version + 1;
                r = await supabase.from('programaciones').update(fila).eq('mes', p.mes).eq('version', d.version).select('version');
                if (!r.error && !r.data.length) return conflicto(p.mes);
                if (!r.error) r = { data: r.data[0] };
            }
            if (r.error) throw r.error;
            d.version = r.data.version; d.pendiente = false; delete d.forzar;
            guardarLocal(d);
            return { ok: true, datos: d, aviso: '' };
        } catch (e) {
            return { ok: false, datos: d, aviso: faltaTabla(e) ? SIN_TABLA : SIN_SENAL };
        }
    }
    async function conflicto(mes) {
        var r = await supabase.from('programaciones').select('mes, archivo, datos, version, actualizado').eq('mes', mes).single();
        if (r.error) return { ok: false, aviso: SIN_SENAL };
        var d = deFila(r.data);
        guardarLocal(d);
        return { ok: false, conflicto: true, datos: d, aviso: 'Otra persona cambió la programación de ' + mes + ' mientras tanto: se cargó la de la base. Su último cambio no se guardó: vuelva a hacerlo.' };
    }
    async function sincronizar() {
        var local = leerLocal();
        if (!(await uid())) return { datos: local, cambio: false, aviso: '' };
        try {
            // Primero lo que quedó solo en este equipo
            if (local && local.pendiente) {
                var g = await guardar(local);
                if (g.conflicto) return { datos: g.datos, cambio: true, aviso: g.aviso };
                if (!g.ok) return { datos: local, cambio: false, aviso: g.aviso };
                local = g.datos;
            }
            var l = await supabase.from('programaciones').select('mes, version');
            if (l.error) throw l.error;
            var mes = elegirActiva(l.data, local && local.prog && local.prog.mes, hoyMes());
            var fila = l.data.find(function (f) { return f.mes === mes; });
            // El primer equipo que abre con la tabla nueva sube la copia que ya tenía (si ese mes no está en la base)
            if (local && local.prog && local.version == null && !l.data.some(function (f) { return f.mes === local.prog.mes; })) {
                var s = await guardar(local, { forzar: true });
                return { datos: s.datos, cambio: false, aviso: s.aviso };
            }
            if (!bajarAntes(local, fila)) return { datos: local, cambio: false, aviso: '' };
            var r = await supabase.from('programaciones').select('mes, archivo, datos, version, actualizado').eq('mes', mes).single();
            if (r.error) throw r.error;
            var d = deFila(r.data);
            guardarLocal(d);
            return { datos: d, cambio: true, aviso: '' };
        } catch (e) {
            return { datos: local, cambio: false, aviso: faltaTabla(e) ? SIN_TABLA : '' };
        }
    }
    async function historial() {
        if (!(await uid())) return null;
        var r = await supabase.from('programaciones').select('mes, archivo, hechos');
        return r.error ? null : r.data;
    }
    // Meses anteriores para la predicción: un mes que no está entra completo; si ya está, solo se le agrega lo hecho
    // cuando este Excel trae más lotes marcados (no reemplaza la programación de ese mes)
    async function agregarMes(prog, archivo) {
        var yo = await uid();
        if (!yo) return { estado: 'equipo', aviso: supabase ? SIN_SENAL : '' };
        try {
            var hechos = hechosCompactos(prog);
            var v = await supabase.from('programaciones').select('version, hechos').eq('mes', prog.mes).maybeSingle();
            if (v.error) throw v.error;
            if (!v.data) {
                var r = await supabase.from('programaciones').insert({ mes: prog.mes, archivo: String(archivo || '').slice(0, 200), datos: prog, hechos: hechos, lotes: contar(prog), usuario: yo });
                if (r.error) throw r.error;
                return { estado: 'nuevo', aviso: '' };
            }
            if ((v.data.hechos || []).length >= hechos.length) return { estado: 'ya', aviso: '' };
            var u = await supabase.from('programaciones').update({ hechos: hechos, usuario: yo, version: v.data.version + 1, actualizado: new Date().toISOString() })
                .eq('mes', prog.mes).eq('version', v.data.version);
            if (u.error) throw u.error;
            return { estado: 'actualizado', aviso: '' };
        } catch (e) {
            return { estado: 'equipo', aviso: faltaTabla(e) ? SIN_TABLA : SIN_SENAL };
        }
    }
    return { sincronizar: sincronizar, guardar: guardar, historial: historial, agregarMes: agregarMes };
}
