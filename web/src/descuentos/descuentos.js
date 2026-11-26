// 💸 Descuentos: lógica sin pantalla. Un descuento (documento) tiene un tipo, la fecha de la verificación, el sector, los
// campos del tipo, sus textos y una o varias filas, cada una con su microrruta, lote, área base, el área dibujada a
// descontar y el área que queda.
//
// Descuento: { id, tipo, fecha, sector, campos: { causa, lugar… }, textos: { titulo, intro, conclusion, localizacion, sitio },
//   filas: [{ mr, lote, cuad, areaBase, areaDescontar, manual (true si el área se escribió a mano), todo (true: se descuenta todo el lote, p. ej. cerrado), dibujo: [[lat, lon], …] }],
//   estado: 'borrador' | 'emitido', creado, actualizado }
import { tipo, rellenar, faltantes } from './tipos.js';

var M_LAT = 110574;

// Área (m²) de un polígono [[lat, lon], …] (proyección plana local: sirve para lotes, no para un municipio entero)
export function areaM2(puntos) {
    if (!puntos || puntos.length < 3) return 0;
    var lat0 = puntos.reduce(function (s, p) { return s + p[0]; }, 0) / puntos.length, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    var a = 0;
    for (var i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
        var xi = puntos[i][1] * mLon, yi = puntos[i][0] * M_LAT, xj = puntos[j][1] * mLon, yj = puntos[j][0] * M_LAT;
        a += (xj - xi) * (yj + yi);
    }
    return Math.abs(a / 2);
}
// Área de varios anillos (partes de un lote): suma de cada parte
export function areaAnillos(anillos) { return (anillos || []).reduce(function (s, r) { return s + areaM2(r); }, 0); }

// Número con puntos de miles, como en el documento (3.072)
export function m2(n) { return Math.round(Number(n) || 0).toLocaleString('es-CO'); }

// Área a descontar de una fila: la escrita a mano, todo el lote (el área base) o la del dibujo
export function areaFila(f) { return f.manual ? Math.max(0, Number(f.areaDescontar) || 0) : f.todo ? Math.max(0, Math.round(Number(f.areaBase) || 0)) : Math.round(areaM2(f.dibujo)); }
export function areaActualizada(f) { return Math.max(0, Math.round((Number(f.areaBase) || 0) - areaFila(f))); }

// «Z6CC0153 - 1027», «A y B», «A, B y C»
export function textoLotes(filas) {
    var l = (filas || []).filter(function (f) { return f.mr; }).map(function (f) { return f.mr + (f.lote && !/^N\/?A$/i.test(f.lote) ? ' - ' + f.lote : ''); });
    return l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
}

// Lo escrito («Z6CC0153 1027», «1027», «z6cc153», «Z6CC0153-1027») → { mr, lote } con lo que haya en los datos de lotes.
// lotes: { 'Z6CC0153': { lote: '1027', area, cuad, d } } (direcciones_lotes.js). → { mr, lote, cuad, areaBase, dir } o null
export function buscarLote(texto, lotes) {
    var t = String(texto || '').toUpperCase().trim(), m = t.match(/Z\s*(\d+)\s*CC\s*(\d+)/), num = t.replace(/Z\s*\d+\s*CC\s*\d+/, '').match(/\d+/);
    var mr = m ? 'Z' + Number(m[1]) + 'CC' + ('000' + Number(m[2])).slice(-4) : '';
    var dato = function (k) { var x = lotes[k]; return x ? { mr: k, lote: String(x.lote || ''), cuad: String(x.cuad || ''), areaBase: Number(x.area) || 0, dir: x.d || '' } : null; };
    if (mr) return dato(mr) || null;
    if (!num) return null;
    var n = String(Number(num[0]));
    var k = Object.keys(lotes).filter(function (key) { return String(lotes[key].lote) === n; })[0];
    return k ? dato(k) : null;
}

// Sector del lote según las comunas y corregimientos del mapa (capa_comunas.js): «el corregimiento …» o «la comuna …»
var CORREGIMIENTOS = ['palmitas', 'san cristobal', 'altavista', 'santa elena', 'san antonio de prado'];
function sinTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
export function textoSector(nombre) {
    if (!nombre) return '';
    return (CORREGIMIENTOS.indexOf(sinTildes(nombre)) !== -1 ? 'el corregimiento ' : 'la comuna ') + nombre;
}
function dentro(lat, lon, anillo) {
    var adentro = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        var yi = anillo[i][0], xi = anillo[i][1], yj = anillo[j][0], xj = anillo[j][1];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) adentro = !adentro;
    }
    return adentro;
}
// comunas: [{ n, anillos: [[[lat, lon], …]] }] → nombre de la comuna o corregimiento donde cae el punto ('' si ninguna)
export function comunaDe(lat, lon, comunas) {
    var c = (comunas || []).filter(function (x) { return x.n && x.anillos.some(function (r) { return dentro(lat, lon, r); }); })[0];
    return c ? c.n : '';
}
// Punto medio de unos anillos (para saber en qué comuna cae un lote)
export function centroAnillos(anillos) {
    var n = 0, la = 0, lo = 0;
    (anillos || []).forEach(function (r) { r.forEach(function (p) { la += p[0]; lo += p[1]; n++; }); });
    return n ? [la / n, lo / n] : null;
}

// Datos para los huecos de los textos
export function datosTexto(d) {
    var f = String(d.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return Object.assign({}, d.campos || {}, { lotes: textoLotes(d.filas), sector: d.sector || '', fecha: f ? f[3] + '/' + f[2] + '/' + f[1] : '' });
}
// Textos del tipo con los huecos llenos (lo que se muestra al elegir el tipo o al tocar «Volver a armar los textos»)
export function textosDeTipo(clave, d) {
    var t = tipo(clave), datos = datosTexto(d), out = {};
    ['titulo', 'intro', 'conclusion', 'localizacion', 'sitio'].forEach(function (k) { out[k] = rellenar(t[k], datos); });
    return out;
}

// Qué falta para generar el documento → [textos] (vacío si está listo)
export function revisar(d) {
    var falta = [];
    if (!d.filas || !d.filas.length) falta.push('agregar al menos un lote');
    (d.filas || []).forEach(function (f) {
        var nombre = f.mr + (f.lote ? ' - ' + f.lote : '');
        var a = areaFila(f);
        if (!a) falta.push('el área a descontar de ' + nombre + ' (dibújela en el mapa o escríbala)');
        else if (f.areaBase && a > f.areaBase) falta.push('el área a descontar de ' + nombre + ' (' + m2(a) + ' m²) es mayor que su área base (' + m2(f.areaBase) + ' m²)');
        if (!f.areaBase) falta.push('el área base de ' + nombre);
    });
    var t = d.textos || {}, huecos = [];
    if (!String(t.titulo || '').trim() || !String(t.intro || '').trim()) falta.push('el título y el texto del documento (toque «Volver a armar los textos»)');
    ['titulo', 'intro', 'conclusion', 'localizacion', 'sitio'].forEach(function (k) { faltantes(t[k]).forEach(function (h) { if (huecos.indexOf(h) === -1) huecos.push(h); }); });
    if (huecos.length) falta.push('llenar en los textos: ' + huecos.join(', '));
    return falta;
}

// Totales del documento (m²)
export function totales(filas) {
    return (filas || []).reduce(function (t, f) { t.base += Number(f.areaBase) || 0; t.descontar += areaFila(f); t.actualizada += areaActualizada(f); return t; }, { base: 0, descontar: 0, actualizada: 0 });
}
// Nombre del PDF: «Descuento cerramiento Z6CC0153-1027 2026-11-13.pdf»
export function nombreArchivo(d) {
    var l = (d.filas || []).map(function (f) { return f.mr + (f.lote ? '-' + f.lote : ''); });
    return ('Descuento ' + tipo(d.tipo).nombre.toLowerCase() + ' ' + (l.length > 3 ? l.slice(0, 3).join(' ') + ' y ' + (l.length - 3) + ' más' : l.join(' ')) + ' ' + (d.fecha || ''))
        .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
}
// Pie de las fotos: «Registro fotográfico de la microrruta Z6CC0153 - 1027» (con la fila a la que pertenece la foto)
export function pieFotos(f) { return 'Registro fotográfico de la microrruta ' + f.mr + (f.lote && !/^N\/?A$/i.test(f.lote) ? ' - ' + f.lote : ''); }

// Excel del historial: una fila por lote descontado, ordenadas por fecha
// → [[fecha dd/mm/aaaa, tipo, microrruta, lote, cuadrilla, base, a descontar, actualizada, sector, estado, cómo se midió]]
export function filasHistorial(lista) {
    var out = [];
    (lista || []).slice().sort(function (a, b) { return String(a.fecha || '').localeCompare(String(b.fecha || '')); }).forEach(function (x) {
        var f8 = String(x.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        (x.filas || []).forEach(function (f) {
            out.push([f8 ? f8[3] + '/' + f8[2] + '/' + f8[1] : '', tipo(x.tipo).nombre, f.mr, /^\d+$/.test(f.lote || '') ? Number(f.lote) : f.lote || '', f.cuad || '',
                Math.round(Number(f.areaBase) || 0), areaFila(f), areaActualizada(f), x.sector || '', x.estado === 'emitido' ? 'Emitido' : 'Borrador', f.manual ? 'A mano' : f.todo ? 'Todo el lote' : 'Dibujo en el mapa']);
        });
    });
    return out;
}

// Fila de la base de datos (public.descuentos, 0027) ↔ descuento
export function aFila(d) {
    var t = totales(d.filas);
    return { id: d.id, tipo: d.tipo, fecha: d.fecha || null, sector: d.sector || '', campos: d.campos || {}, textos: d.textos || {},
        filas: (d.filas || []).map(function (f) { return { mr: f.mr, lote: f.lote, cuad: f.cuad || '', areaBase: Number(f.areaBase) || 0, areaDescontar: areaFila(f), manual: !!f.manual, todo: !!f.todo, dibujo: f.dibujo || [] }; }),
        area_descontar: t.descontar, estado: d.estado || 'borrador', actualizado: new Date().toISOString() };
}
export function deFila(r) {
    return { id: r.id, tipo: r.tipo, fecha: r.fecha || '', sector: r.sector || '', campos: r.campos || {}, textos: r.textos || {}, filas: r.filas || [],
        estado: r.estado || 'borrador', creado: r.creado || '', actualizado: r.actualizado || '', usuario: r.usuario || null };
}
export function nuevoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}
