// Datos de la ficha del lote para mapa_rapido.html (su código está en la misma página). Junta lo que cada sección deja en
// el equipo y, si hay sesión, lo más nuevo de la base; lo deja en window.FichaLote para que la ficha lo pinte, y avisa
// con el evento «ficha-datos» cuando llega lo de la base (la ficha abierta se vuelve a pintar).
//   Copias del equipo: subsanaciones_cache (visitas), cruce_reportes, descuentos_lista, req_historial, pqr_cache,
//   oz_propuesta_lotes (🛣️ Programación por cercanía) y mapa_auditorias (la última lectura de la base, para sin señal)
//   Base (con sesión): reportes_ejecucion, descuentos y auditorias_zv
import { supabase, configurado } from '../supabase.js';
import { infoLote, chipReporte, htmlAvisos, htmlMas } from './ficha.js';
import { encuadre, urlEarth, kmlLote, alturaTerreno } from './earth.js';
import { mezclarPuntos } from './especiales.js';
import { mezclarCriticos, claveFija, nuevoIdCritico, textoCritico, deFilaCritico, aFilaCritico } from './criticos.js';
import { crearProgBase } from '../programacion_base.js';
import { enInstalacion } from '../secciones.js';
import { estiloInstalacion } from '../sesion.js';

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
    chipReporte: chipReporte, htmlAvisos: htmlAvisos, htmlMas: htmlMas,
    // 🌎 Vista 3D en Google Earth (enlace y KML con vuelo alrededor del lote)
    encuadre: encuadre, urlEarth: urlEarth, kmlLote: kmlLote, alturaTerreno: alturaTerreno
};
window.dispatchEvent(new Event('ficha-lista'));

// ⚙️ Esta instalación (0031): el mapa no pide sesión, así que lee lo apagado con config_instalacion (abierta a todos) y
// esconde los enlaces y botones a esas secciones (⚠️ ✅ 📋 📝, los de la ficha…). Primero lo último guardado en el equipo,
// para que no se vean un momento; sin señal se queda con eso. Si el mapa mismo está apagado, se tapa con un aviso.
var CLAVE_INST = 'instalacion_apagadas';
function aplicarInstalacion(apagadas) {
    estiloInstalacion(apagadas);
    var tapa = document.getElementById('sp-mapa-apagado');
    if (enInstalacion(apagadas, 'mapa')) { if (tapa) tapa.remove(); return; }
    if (tapa) return;
    tapa = document.createElement('div');
    tapa.id = 'sp-mapa-apagado';
    tapa.setAttribute('role', 'alert');
    tapa.style.cssText = 'position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg,#f4f6f5)';
    tapa.innerHTML = '<div style="max-width:520px;padding:24px 20px;background:#fff;border:1px solid #dfe7e3;border-radius:14px;text-align:center;line-height:1.5">' +
        '<h2 style="margin:0 0 8px;font-size:19px">🔒 El mapa no está disponible aquí</h2>' +
        '<p style="margin:0;color:#5b6b64">Esta sección está apagada en esta instalación de la app. El administrador la puede encender en 👥 Usuarios → ⚙️ Esta instalación.</p></div>';
    document.body.appendChild(tapa);
}
aplicarInstalacion(leer(CLAVE_INST, []));
if (configurado && supabase) {
    supabase.rpc('config_instalacion').then(function (r) {
        if (r.error || !r.data) return;   // base sin 0031 o sin señal: se queda como estaba
        var ap = Array.isArray(r.data.apagadas) ? r.data.apagadas : [];
        try { localStorage.setItem(CLAVE_INST, JSON.stringify(ap)); } catch (e) {}
        aplicarInstalacion(ap);
    }, function () {});
}

// ⭐ Puntos de las operaciones especiales puestos a mano (tabla puntos_especiales, 0029): los mismos en todos los equipos.
// Sin sesión o sin señal responde { ok: false } y el mapa los deja en el equipo como pendientes, para subirlos después.
async function conSesion() {
    if (!configurado || !supabase) return false;
    try { var s = await supabase.auth.getSession(); return !!(s.data && s.data.session); } catch (e) { return false; }
}
window.PuntosEspeciales = {
    mezclar: mezclarPuntos,
    // → { ok, puntos: { CLAVE: { p: [lat, lon], hora } } }
    leer: async function () {
        if (!(await conSesion())) return { ok: false };
        var r = await supabase.from('puntos_especiales').select('clave, lat, lon, actualizado');
        if (r.error) return { ok: false, error: r.error.message };
        var puntos = {};
        r.data.forEach(function (x) { puntos[x.clave] = { p: [x.lat, x.lon], hora: Date.parse(x.actualizado) || 0 }; });
        return { ok: true, puntos: puntos };
    },
    guardar: async function (clave, nombre, lat, lon) {
        if (!(await conSesion())) return { ok: false };
        var s = await supabase.auth.getSession();
        var r = await supabase.from('puntos_especiales').upsert({ clave: clave, nombre: nombre || '', lat: lat, lon: lon, usuario: s.data.session.user.id, actualizado: new Date().toISOString() }, { onConflict: 'clave' });
        return r.error ? { ok: false, error: r.error.message } : { ok: true };
    },
    borrar: async function (clave) {
        if (!(await conSesion())) return { ok: false };
        var r = await supabase.from('puntos_especiales').delete().eq('clave', clave);
        return r.error ? { ok: false, error: r.error.message } : { ok: true };
    }
};
window.dispatchEvent(new Event('especiales-lista'));

// 🗑 Puntos críticos agregados en los recorridos y su descripción (tabla puntos_criticos, 0033): los mismos en todos los
// equipos. Sin sesión o sin señal responde { ok: false } y el mapa los deja pendientes en el equipo
window.PuntosCriticos = {
    mezclar: mezclarCriticos, claveFija: claveFija, nuevoId: nuevoIdCritico, texto: textoCritico,
    // → { ok, filas: { id: fila } }
    leer: async function () {
        if (!(await conSesion())) return { ok: false };
        var r = await supabase.from('puntos_criticos').select('id, nombre, direccion, zona, descripcion, lat, lon, origen, quitado, actualizado');
        if (r.error) return { ok: false, error: r.error.message };
        var filas = {};
        r.data.forEach(function (x) { filas[x.id] = deFilaCritico(x); });
        return { ok: true, filas: filas };
    },
    guardar: async function (p) {
        if (!(await conSesion())) return { ok: false };
        var s = await supabase.auth.getSession();
        var r = await supabase.from('puntos_criticos').upsert(Object.assign(aFilaCritico(p), { usuario: s.data.session.user.id }), { onConflict: 'id' });
        return r.error ? { ok: false, error: r.error.message } : { ok: true };
    }
};
window.dispatchEvent(new Event('criticos-lista'));

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

// La programación del mes (⭐ Especiales y «qué día le toca») sale de la base (programaciones, 0030): si llega una más
// nueva que la del equipo, la página la vuelve a leer
if (configurado && supabase) crearProgBase(supabase).sincronizar().then(function (r) { if (r.cambio) window.dispatchEvent(new Event('programacion-cambio')); });
