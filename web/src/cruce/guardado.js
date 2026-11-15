// Dónde quedan los reportes de ejecución: en la base (tabla «reportes_ejecucion», migración 0022), compartidos por todo el
// equipo, y siempre una copia en este equipo. Si la tabla todavía no existe o no hay señal, sirve con la copia del equipo
// y lo dice; cuando vuelve la base, lo que estaba solo en el equipo se sube.
//
//   var g = crearGuardado(supabase, almacen);
//   g.leer()            -> { reportes, donde: 'base' | 'equipo', aviso }
//   g.guardar(nuevos)   -> { reportes, donde, aviso }
//   g.borrar(reporte)   -> { reportes, donde, aviso }
import { unirReportes, claveReporte } from './cruce.js';

var CLAVE = 'cruce_reportes';
export var SIN_TABLA = 'Los reportes se guardan solo en este equipo: falta aplicar la migración 0022_reportes_ejecucion.sql en Supabase para verlos también en el celular y el computador.';
export var SIN_BASE = 'Sin conexión con la base: los reportes quedan en este equipo y se suben cuando vuelva.';

function faltaTabla(e) { return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || '')); }
function aFila(r) { return { fecha: r.fecha, cuadrilla: r.cuad, items: r.items, texto: r.texto || '' }; }
function deFila(f) { return { fecha: f.fecha, cuad: String(f.cuadrilla), items: f.items || [], texto: f.texto || '' }; }

export function crearGuardado(supabase, almacen) {
    almacen = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    function local() { try { return JSON.parse(almacen.getItem(CLAVE)) || []; } catch (e) { return []; } }
    function aLocal(lista) { try { almacen.setItem(CLAVE, JSON.stringify(lista)); } catch (e) { /* sin espacio: queda en la base */ } return lista; }
    function motivo(error) { return faltaTabla(error) ? SIN_TABLA : SIN_BASE; }

    async function leer() {
        var mios = local();
        if (!supabase) return { reportes: mios, donde: 'equipo', aviso: 'Sin base de datos: los reportes quedan en este equipo.' };
        try {
            var res = await supabase.from('reportes_ejecucion').select('fecha, cuadrilla, items, texto').order('fecha');
            if (res.error) return { reportes: mios, donde: 'equipo', aviso: motivo(res.error) };
            var base = res.data.map(deFila), enBase = {};
            base.forEach(function (r) { enBase[claveReporte(r)] = 1; });
            // Lo que se pegó sin base (o sin señal) se sube ahora
            var faltan = mios.filter(function (r) { return !enBase[claveReporte(r)] && r.pendiente; });
            if (faltan.length) {
                var sub = await supabase.from('reportes_ejecucion').upsert(faltan.map(aFila), { onConflict: 'fecha,cuadrilla' });
                if (!sub.error) base = unirReportes(base, faltan.map(function (r) { var c = Object.assign({}, r); delete c.pendiente; return c; }));
            }
            return { reportes: aLocal(base), donde: 'base', aviso: '' };
        } catch (e) { return { reportes: mios, donde: 'equipo', aviso: SIN_BASE }; }
    }
    async function guardar(nuevos) {
        var conMarca = nuevos.map(function (r) { return Object.assign({}, r, { pendiente: true }); });
        if (supabase) {
            try {
                var res = await supabase.from('reportes_ejecucion').upsert(nuevos.map(aFila), { onConflict: 'fecha,cuadrilla' });
                if (!res.error) return { reportes: aLocal(unirReportes(local(), nuevos)), donde: 'base', aviso: '' };
                return { reportes: aLocal(unirReportes(local(), conMarca)), donde: 'equipo', aviso: motivo(res.error) };
            } catch (e) { return { reportes: aLocal(unirReportes(local(), conMarca)), donde: 'equipo', aviso: SIN_BASE }; }
        }
        return { reportes: aLocal(unirReportes(local(), conMarca)), donde: 'equipo', aviso: '' };
    }
    async function borrar(r) {
        var k = claveReporte(r), aviso = '', donde = supabase ? 'base' : 'equipo';
        if (supabase) {
            try {
                var res = await supabase.from('reportes_ejecucion').delete().eq('fecha', r.fecha).eq('cuadrilla', r.cuad).select('fecha');
                if (res.error) { donde = 'equipo'; aviso = motivo(res.error); }
                else if (!res.data.length && !r.pendiente) throw new Error('Ese reporte lo cargó otra persona: solo ella o un administrador lo pueden borrar.');
            } catch (e) { if (/otra persona/.test(e.message)) throw e; donde = 'equipo'; aviso = SIN_BASE; }
        }
        return { reportes: aLocal(local().filter(function (x) { return claveReporte(x) !== k; })), donde: donde, aviso: aviso };
    }
    return { leer: leer, guardar: guardar, borrar: borrar };
}
