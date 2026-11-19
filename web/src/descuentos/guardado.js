// Dónde quedan los descuentos: en la base (tabla «descuentos», migración 0027), compartidos por todo el equipo, y siempre
// una copia en este equipo. Si la tabla todavía no existe o no hay señal, sirve con la copia del equipo y lo dice; cuando
// vuelve la base, lo que estaba solo en el equipo se sube. Las fotos y las imágenes no se guardan (son pesadas): el dibujo
// del área sí, así que las imágenes del mapa se vuelven a armar solas al abrir un descuento.
//
//   var g = crearGuardado(supabase, almacen);
//   g.leer()          -> { lista, donde: 'base' | 'equipo', aviso }
//   g.guardar(d)      -> { lista, donde, aviso }
//   g.borrar(id)      -> { lista, donde, aviso }
import { aFila, deFila } from './descuentos.js';

var CLAVE = 'descuentos_lista';
export var SIN_TABLA = 'Los descuentos se guardan solo en este equipo: falta aplicar la migración 0027_descuentos.sql en Supabase para verlos en el celular y en otros computadores.';
export var SIN_BASE = 'Sin conexión con la base: los descuentos quedan en este equipo y se suben cuando vuelva.';

function faltaTabla(e) { return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || '')); }
function porFecha(a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.actualizado || '').localeCompare(String(a.actualizado || '')); }

export function crearGuardado(supabase, almacen) {
    almacen = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    function local() { try { return JSON.parse(almacen.getItem(CLAVE)) || []; } catch (e) { return []; } }
    function aLocal(lista) { try { almacen.setItem(CLAVE, JSON.stringify(lista)); } catch (e) { /* sin espacio: queda en la base */ } return lista.slice().sort(porFecha); }
    function motivo(error) { return faltaTabla(error) ? SIN_TABLA : SIN_BASE; }
    function unir(lista, d) { return lista.filter(function (x) { return x.id !== d.id; }).concat([d]); }

    async function leer() {
        var mios = local();
        if (!supabase) return { lista: aLocal(mios), donde: 'equipo', aviso: 'Sin base de datos: los descuentos quedan en este equipo.' };
        try {
            var res = await supabase.from('descuentos').select('*').order('fecha', { ascending: false });
            if (res.error) return { lista: aLocal(mios), donde: 'equipo', aviso: motivo(res.error) };
            var base = res.data.map(deFila), enBase = {};
            base.forEach(function (d) { enBase[d.id] = 1; });
            // Lo guardado sin base (o sin señal) se sube ahora
            var faltan = mios.filter(function (d) { return d.pendiente && !enBase[d.id]; });
            if (faltan.length) {
                var sub = await supabase.from('descuentos').upsert(faltan.map(aFila), { onConflict: 'id' });
                if (!sub.error) faltan.forEach(function (d) { var c = Object.assign({}, d); delete c.pendiente; base = unir(base, c); });
            }
            return { lista: aLocal(base), donde: 'base', aviso: '' };
        } catch (e) { return { lista: aLocal(mios), donde: 'equipo', aviso: SIN_BASE }; }
    }
    async function guardar(d) {
        var fila = aFila(d), copia = Object.assign(deFila(fila), { creado: d.creado || new Date().toISOString() });
        if (supabase) {
            try {
                var res = await supabase.from('descuentos').upsert(fila, { onConflict: 'id' }).select().single();
                if (!res.error) return { lista: aLocal(unir(local(), deFila(res.data))), donde: 'base', aviso: '' };
                return { lista: aLocal(unir(local(), Object.assign(copia, { pendiente: true }))), donde: 'equipo', aviso: motivo(res.error) };
            } catch (e) { return { lista: aLocal(unir(local(), Object.assign(copia, { pendiente: true }))), donde: 'equipo', aviso: SIN_BASE }; }
        }
        return { lista: aLocal(unir(local(), copia)), donde: 'equipo', aviso: '' };
    }
    async function borrar(id) {
        var resto = local().filter(function (x) { return x.id !== id; });
        if (supabase) {
            try {
                var res = await supabase.from('descuentos').delete().eq('id', id);
                if (res.error && !faltaTabla(res.error)) throw new Error(res.error.message);
            } catch (e) { throw new Error('No se pudo borrar en la base: ' + e.message); }
        }
        return { lista: aLocal(resto), donde: supabase ? 'base' : 'equipo', aviso: '' };
    }
    return { leer: leer, guardar: guardar, borrar: borrar };
}
