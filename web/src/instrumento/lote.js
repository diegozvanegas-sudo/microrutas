// 🧾 Instrumentos · «Varias de una vez» (formulario de domingos): del reporte pegado a una fila por ruta o vehículo, y cada
// foto del día a la ruta que pasa más cerca (trazos de la capa Barrido dom/fest del mapa). Sin pantalla, para npm test.
import { vacioDom, zonaDom, contratistaDe } from './comun.js';

// Reporte de WhatsApp → filas. Entiende «Zona 3» como encabezado, «- Z3R17DOM (Parque Boston)» como ruta con nota y
// «Placa KTN355: realizando actividad C683 (recolección)» como vehículo de RyT. Una ruta repetida con otra nota es otra fila
export function leerReporte(texto) {
    var filas = [], zona = '', vistos = {};
    String(texto || '').split(/\r?\n/).forEach(function (l) {
        l = l.trim();
        var z = /^zona\s*(\d+)\b/i.exec(l.replace(/^[-*•\s]+/, ''));
        if (z && !/Z\d+R/i.test(l)) { zona = z[1]; return; }
        var v = /placa\s*([A-Z]{3}\s?\d{3}[A-Z]?)\b.*?(?:actividad|control)\s*([A-Z]?\d{2,7})/i.exec(l);
        if (v) {
            var placa = v[1].replace(/\s/g, '').toUpperCase(), act = v[2].toUpperCase();
            filas.push({ id: 'v-' + placa, tipo: 'ryt', ruta: act, nota: 'Placa ' + placa, zona: '' });
            return;
        }
        var r = /\b(Z(\d+)R\d+[A-Z]*(?:_[A-Z]+)?)\b\s*(?:\(([^)]*)\))?/i.exec(l);
        if (!r) return;
        var ruta = r[1].toUpperCase(), nota = (r[3] || '').trim(), id = ruta + (nota ? '|' + nota.toLowerCase() : '');
        if (vistos[id]) return;
        vistos[id] = 1;
        filas.push({ id: id, tipo: 'lv', ruta: ruta, nota: nota, zona: r[2] || zona });
    });
    return filas;
}

// Datos del formulario de una fila: lo común (inspector, fecha, verificación, respuestas) + lo de la fila
export function datosDeFila(f, base, pref) {
    var d = Object.assign(vacioDom(base.fecha, pref), base, { ruta: f.ruta, fotos: f.enlace || base.fotos || '' });
    d.zona = f.zona ? zonaDom(f.zona, f.turno || 'Mañana') : '';
    d.instrumento = f.tipo === 'ryt' ? 'Recolección y Transporte' : 'Limpieza vial';
    d.contratista = contratistaDe(d.zona, pref) || base.contratista || '';
    return Object.assign(d, f.cambios || {});
}

// ---------- Fotos → ruta ----------
var LAT0 = 6.25, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
function aM(lat, lon) { return [lon * KX, lat * KY]; }
// Geometría compacta de la capa (enteros ×1e6, el primero absoluto y luego diferencias) → tramos en metros
export function tramosDe(item) {
    return (item.g || []).map(function (plano) {
        var x = 0, y = 0, pts = [];
        for (var i = 0; i + 1 < plano.length; i += 2) { x += plano[i]; y += plano[i + 1]; pts.push(aM(y / 1e6, x / 1e6)); }
        return pts;
    });
}
function distTramo(p, pts) {
    var mejor = Infinity;
    for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
        var t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
        var d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        if (d < mejor) mejor = d;
    }
    if (pts.length === 1) mejor = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
    return mejor;
}
// Metros de un punto (lat, lon) a la ruta
export function distanciaRuta(lat, lon, tramos) {
    var p = aM(lat, lon), d = Infinity;
    tramos.forEach(function (t) { d = Math.min(d, distTramo(p, t)); });
    return d;
}
export var CERCA_RUTA = 120; // el GPS se corre y la foto se toma desde el andén de enfrente o la esquina

// La fila de la ruta más cercana a la foto (solo entre las filas del reporte). geo: { RUTA: tramos }.
// Si dos filas tienen la misma ruta (Z3R17DOM y Z3R17DOM (Parque Boston)) va a la primera: se mueve a mano si es de la otra
export function filaDeFoto(gps, filas, geo) {
    if (!gps) return { fila: null, motivo: 'sin GPS' };
    var mejor = null, d = Infinity;
    filas.forEach(function (f) {
        var t = geo[f.ruta];
        if (!t) return;
        var x = distanciaRuta(gps.lat, gps.lon, t);
        if (x < d) { d = x; mejor = f; }
    });
    if (!mejor) return { fila: null, motivo: 'ninguna ruta del reporte está en el mapa' };
    if (d > CERCA_RUTA) return { fila: null, motivo: 'a ' + Math.round(d) + ' m de la ruta más cercana (' + mejor.ruta + ')', cerca: mejor.id };
    return { fila: mejor.id, dist: Math.round(d) };
}

// Nombre del PDF de una fila: Z3R17DOM_Parque-Boston_22-11-2026.pdf
export function nombrePdf(f, fecha) {
    var p = String(fecha || '').split('-');
    var limpio = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
    return [f.ruta, f.nota ? limpio(f.nota) : '', p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : ''].filter(Boolean).join('_') + '.pdf';
}

// Enlaces pegados de una vez (Drive → seleccionar varios → Copiar enlaces): uno por línea, en el orden de la lista
export function repartirEnlaces(texto, filas) {
    var enlaces = String(texto || '').split(/[\s,]+/).filter(function (u) { return /^https?:\/\/\S+$/i.test(u); });
    var out = {};
    filas.forEach(function (f, i) { if (enlaces[i]) out[f.id] = enlaces[i]; });
    return { enlaces: out, sobran: Math.max(0, enlaces.length - filas.length), faltan: Math.max(0, filas.length - enlaces.length) };
}
