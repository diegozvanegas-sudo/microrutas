// Datos de la ficha del lote para mapa_rapido.html (su código está en la misma página). Junta lo que cada sección deja en
// el equipo y, si hay sesión, lo más nuevo de la base; lo deja en window.FichaLote para que la ficha lo pinte, y avisa
// con el evento «ficha-datos» cuando llega lo de la base (la ficha abierta se vuelve a pintar).
//   Copias del equipo: subsanaciones_cache (visitas), cruce_reportes, descuentos_lista, req_historial, pqr_cache,
//   oz_propuesta_lotes (🛣️ Programación por cercanía) y mapa_auditorias (la última lectura de la base, para sin señal)
//   Base (con sesión): reportes_ejecucion, descuentos y auditorias_zv
import { supabase, configurado } from '../supabase.js';
import { infoLote, chipReporte, htmlAvisos, htmlMas } from './ficha.js';

function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function hoy() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

var base = { reportes: null, descuentos: null, auditorias: null };
function fuentes() {
    var c = leer('subsanaciones_cache', null) || {};
    // Pre-ruta: la de la base (copia en subsanaciones_cache.rutas) y la de este equipo (subsanaciones_rutas)
    var rutas = (c.rutas || []).map(function (r) { return { id: r.lote, fecha: r.fecha, cuad: r.cuadrilla }; });
    leer('subsanaciones_rutas', []).forEach(function (r) { (r.paradas || []).forEach(function (p) { rutas.push({ id: p.id, fecha: p.fecha, cuad: r.cuad }); }); });
    return {
        visitas: c.registros || [], items: c.items || [], itemsOp: c.itemsOperacion || [], rutas: rutas,
        reportes: base.reportes || leer('cruce_reportes', []),
        descuentos: base.descuentos || leer('descuentos_lista', []),
        auditorias: base.auditorias || leer('mapa_auditorias', []),
        requerimientos: leer('req_historial', []),
        pqrs: leer('pqr_cache', []),
        propuesta: leer('oz_propuesta_lotes', null)
    };
}
// La copia del equipo se lee de nuevo en cada ficha (es rápido): así se ve lo recién guardado en otra pestaña
window.FichaLote = {
    info: function (lote) { return infoLote(lote, fuentes(), hoy()); },
    chipReporte: chipReporte, htmlAvisos: htmlAvisos, htmlMas: htmlMas
};
window.dispatchEvent(new Event('ficha-lista'));

// Lo más nuevo de la base (solo si ya hay sesión en este equipo; el mapa no pide entrar)
async function deLaBase() {
    if (!configurado || !supabase) return;
    try {
        var s = await supabase.auth.getSession();
        if (!s.data || !s.data.session) return;
        var desde = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10);
        var r = await Promise.all([
            supabase.from('reportes_ejecucion').select('fecha, cuadrilla, items').gte('fecha', desde),
            supabase.from('descuentos').select('id, tipo, fecha, estado, filas'),
            supabase.from('auditorias_zv').select('quincena, microrruta, lote, novedad, ac, decision, novedad_final, actualizado').order('actualizado', { ascending: false }).limit(5000)
        ]);
        var cambio = false;
        if (!r[0].error) { base.reportes = r[0].data.map(function (x) { return { fecha: x.fecha, cuad: String(x.cuadrilla), items: x.items || [] }; }); cambio = true; }
        if (!r[1].error) { base.descuentos = r[1].data; cambio = true; }
        if (!r[2].error) {
            base.auditorias = r[2].data; cambio = true;
            try { localStorage.setItem('mapa_auditorias', JSON.stringify(r[2].data)); } catch (e) { /* sin espacio: queda en memoria */ }
        }
        if (cambio) window.dispatchEvent(new Event('ficha-datos'));
    } catch (e) { /* sin señal: queda lo del equipo */ }
}
deLaBase();
