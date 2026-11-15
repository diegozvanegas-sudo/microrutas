// 📍 Ubicar direcciones: de un mensaje pegado (WhatsApp, PQR, correo) salen las direcciones, se ubican con el mismo motor
// del mapa rápido (public/js/direcciones.js + data/rapido/cruces.js) y se dice qué lotes quedan cerca de cada una.
// Aquí va solo la lógica (sin pantalla): la usan la ventana de Subsanaciones (ubicar_ui.js) y el bot de WhatsApp.
//
//   partirMensaje(texto)            -> [{ n, texto, tipo: 'direccion' | 'via' | 'texto', dir, via }]
//   ubicarItems(items, deps)        -> los mismos items con { punto, aprox, lotes, lugares, tramos, error }
//   lotesCerca(lat, lon, lotes)     -> [{ lote, mr, cuad, dist }] del más cercano al más lejano
//   buscarLugares(texto, libreta)   -> nombres de la libreta que aparecen en el texto
import { dentro, distanciaBorde, prepararLotes, leerDatos } from './lotegps.js';

// Radio para decir «este lote queda cerca» de una dirección. Las direcciones quedan sobre la calle y los lotes son la
// zona verde de al lado, así que casi nunca caen dentro: 80 m alcanza para la manzana y no trae lotes de otro barrio
export var RADIO = 80;
export var MAX_LOTES = 5;

var M_LAT = 110574;
function mLon(lat) { return 111320 * Math.cos(lat * Math.PI / 180); }
export function metros(a, b) { return Math.hypot((b.lng - a.lng) * mLon(a.lat), (b.lat - a.lat) * M_LAT); }

// Sin tildes y en minúsculas, para comparar
export function plano(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// ---------- Partir el mensaje ----------
// Lo que WhatsApp agrega al copiar o reenviar: «[13:57, 14/11/2026] Nombre: », «14/11/26, 1:57 p. m. - Nombre: », «Reenviado», la hora suelta
function limpiarRenglon(r) {
    return String(r || '')
        .replace(/^\s*\[\d{1,2}:\d{2}[^\]]*\]\s*[^:]{1,40}:\s*/, '')
        .replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}[^-]{0,12}-\s*[^:]{1,40}:\s*/, '')
        .replace(/\s+\d{1,2}:\d{2}(\s*[ap]\.?\s*m\.?)?\s*$/i, '')
        .replace(/[‎‏‪-‮]/g, '')
        .trim();
}
function esRelleno(r) {
    return !r || /^(↪\s*)?(reenviado|forwarded|reenviado muchas veces)$/i.test(r) || /^\d{1,2}:\d{2}(\s*[ap]\.?\s*m\.?)?$/i.test(r) || !/[a-z0-9]/i.test(r);
}
// Donde empieza una vía con su número: «cra 85», «CL76AD», «calle 76cc», «Kr. 43»
var RE_VIA = /(^|[^a-z0-9])((?:calle|cll|clle|cl|carrera|cra|kra|crr|cr|kr|diagonal|diag|dg|transversal|transv|trv|tv|circular|circ|cir|cq)\.?\s*\d)/;
var TIPO_VIA = { cal: 'calle', cll: 'calle', cl: 'calle', car: 'carrera', cra: 'carrera', kra: 'carrera', crr: 'carrera', cr: 'carrera', kr: 'carrera',
    dia: 'diagonal', dg: 'diagonal', tra: 'transversal', trv: 'transversal', tv: 'transversal', cir: 'circular', cq: 'circular' };
// «calle 76cc», «carrera 85 sur» → { tipo, n, l, sur } (la vía sola, sin cruce ni placa)
export function leerVia(t) {
    var m = /^([a-z]+)\.?\s*(\d{1,3})\s*([a-h]{1,2})?(?![a-z0-9])\s*(sur|este)?/.exec(plano(t));
    if (!m) return null;
    var tipo = TIPO_VIA[m[1]] || TIPO_VIA[m[1].slice(0, 3)];
    return tipo ? { tipo: tipo, n: +m[2], l: (m[3] || '').toUpperCase(), sur: (m[4] || '').toUpperCase() } : null;
}
export function textoVia(v) { return v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1) + ' ' + v.n + v.l + (v.sur ? ' ' + v.sur.charAt(0) + v.sur.slice(1).toLowerCase() : ''); }

// Un renglón por dirección. leerDireccion: el de public/js/direcciones.js (window.leerDireccion)
// tipo 'direccion': vía + cruce (+ placa) · 'via': solo la vía («toda la calle 76CC») · 'texto': no trae dirección
export function partirMensaje(texto, leerDireccion) {
    var out = [];
    String(texto || '').split(/\r?\n/).map(limpiarRenglon).forEach(function (r) {
        if (esRelleno(r)) return;
        var item = { n: out.length + 1, texto: r, tipo: 'texto', dir: null, via: null };
        var p = plano(r), desde = 0, m;
        // Puede haber dos vías en el renglón («escalas de la calle 76C frente a la cra 85 # 76C-18»): gana la que sea dirección completa
        while ((m = RE_VIA.exec(p.slice(desde)))) {
            var ini = desde + m.index + m[1].length, resto = p.slice(ini), d = leerDireccion(resto);
            if (d && !d.incompleta) { item.tipo = 'direccion'; item.dir = d; item.via = null; break; }
            if (!item.via) { var v = leerVia(resto); if (v) { item.tipo = 'via'; item.via = v; } }
            desde = ini + 2;
        }
        out.push(item);
    });
    return out;
}

// ---------- Lotes cerca de un punto ----------
// lotes: los de prepararLotes (lotegps.js). Dentro = 0 m. Los demás, hasta `radio` metros del borde
export function lotesCerca(lat, lon, lotes, radio, max) {
    radio = radio == null ? RADIO : radio;
    var h = radio / M_LAT * 1.3, out = [];
    lotes.forEach(function (l) {
        var c = l.caja;
        if (lat < c[0] - h || lat > c[2] + h || lon < c[1] - h || lon > c[3] + h) return;
        var d = dentro(lat, lon, l.anillos) ? 0 : Math.round(distanciaBorde(lat, lon, l.anillos));
        if (d <= radio) out.push({ lote: l.lote, mr: l.mr, cuad: l.cuad, dist: d });
    });
    return unirLotes(out).slice(0, max || MAX_LOTES);
}
// Un lote puede venir en varios pedazos (y de varios puntos): queda una vez, con su menor distancia
export function unirLotes(lista) {
    var por = {};
    lista.forEach(function (x) { var k = x.mr + '|' + x.lote; if (!por[k] || x.dist < por[k].dist) por[k] = x; });
    return Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return a.dist - b.dist; });
}
// Descarga solo las cuadrillas cuyo recuadro queda cerca del punto. → función (lat, lon) → lotes preparados
export function crearCargadorLotes(base, traer) {
    base = base || 'data/rapido/';
    traer = traer || function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('No se pudo descargar ' + url); return r.text(); }); };
    var indice = null, cuadrillas = {};
    function cargarIndice() { return indice || (indice = traer(base + 'indice.js').then(leerDatos)); }
    function cargarCuadrilla(c) { return cuadrillas[c] || (cuadrillas[c] = traer(base + 'lotes_' + c + '.js').then(function (t) { return prepararLotes(leerDatos(t)); })); }
    var cargar = async function (lat, lon) {
        var idx = await cargarIndice(), h = 0.003, todos = [];
        var cs = Object.keys(idx.cuadrillas || {}).filter(function (c) {
            var b = idx.cuadrillas[c].b;
            return b && lat >= b[0][0] - h && lat <= b[1][0] + h && lon >= b[0][1] - h && lon <= b[1][1] + h;
        });
        for (var i = 0; i < cs.length; i++) todos = todos.concat(await cargarCuadrilla(cs[i]));
        return todos;
    };
    cargar.indice = cargarIndice;
    return cargar;
}
// Zona donde buscar las direcciones: los recuadros de las cuadrillas, con margen (como en el mapa rápido)
export function zonaDeIndice(idx) {
    var cajas = Object.keys(idx.cuadrillas || {}).map(function (k) { return idx.cuadrillas[k].b; }).filter(Boolean);
    var s = Math.min.apply(null, cajas.map(function (b) { return b[0][0]; })), o = Math.min.apply(null, cajas.map(function (b) { return b[0][1]; }));
    var n = Math.max.apply(null, cajas.map(function (b) { return b[1][0]; })), e = Math.max.apply(null, cajas.map(function (b) { return b[1][1]; }));
    var my = (n - s) * 0.1, mx = (e - o) * 0.1;
    return {
        caja: [s - my, o - mx, n + my, e + mx],
        preferir: function (p) { return cajas.some(function (b) { return p.lat >= b[0][0] && p.lat <= b[1][0] && p.lng >= b[0][1] && p.lng <= b[1][1]; }); }
    };
}

// ---------- Toda una calle ----------
// Los cruces guardados de una vía (crucesCalles: { v: ['calle 76CC', …], c: { 'i,j': [[lat, lng], …] } }), agrupados en
// tramos: el mismo nombre se repite en barrios distintos (la Calle 76C está en Villa Flora y en Curazao)
var SEPARA_TRAMO = 250;
var MISMO = { calle: ['calle', 'diagonal'], diagonal: ['calle', 'diagonal'], carrera: ['carrera', 'transversal'], transversal: ['carrera', 'transversal'], circular: ['circular'] };
export function tramosDeVia(ix, via) {
    if (!ix || !via) return [];
    var claves = {};
    MISMO[via.tipo].forEach(function (t) {
        var b = t + ' ' + via.n + via.l;
        if (via.sur) claves[b + ' ' + via.sur] = 1; else { claves[b] = 1; claves[b + ' SUR'] = 1; }
    });
    var mias = {};
    ix.v.forEach(function (k, i) { if (claves[k]) mias[i] = 1; });
    if (!Object.keys(mias).length) return [];
    var puntos = [];
    Object.keys(ix.c).forEach(function (par) {
        var ij = par.split(',');
        if (mias[ij[0]] || mias[ij[1]]) ix.c[par].forEach(function (p) { puntos.push({ lat: p[0], lng: p[1] }); });
    });
    // Se juntan los puntos que están a menos de SEPARA_TRAMO de alguno del grupo
    var tramos = [];
    puntos.forEach(function (p) {
        var toca = tramos.filter(function (t) { return t.some(function (q) { return metros(p, q) < SEPARA_TRAMO; }); });
        if (!toca.length) return tramos.push([p]);
        toca[0].push(p);
        toca.slice(1).forEach(function (t) { Array.prototype.push.apply(toca[0], t); tramos.splice(tramos.indexOf(t), 1); });
    });
    return tramos.map(function (t) { return { puntos: t, centro: centroDe(t) }; });
}
export function centroDe(puntos) {
    var lat = 0, lng = 0;
    puntos.forEach(function (p) { lat += p.lat; lng += p.lng; });
    return { lat: lat / puntos.length, lng: lng / puntos.length };
}

// ---------- Libreta de nombres que usa la gente ----------
// «La Cañada», «segundo parqueadero de Villa Flora», «sector Convento» → el lote o el punto que alguien ya confirmó
var VACIAS = { de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, en: 1, y: 1, a: 1, al: 1 };
export function claveLugar(nombre) {
    return plano(nombre).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(function (p) { return p && !VACIAS[p]; }).join(' ');
}
// Los lugares cuyo nombre aparece completo en el texto (palabras enteras, sin importar tildes ni «de la»). Primero los nombres más largos
export function buscarLugares(texto, libreta) {
    var t = ' ' + claveLugar(texto) + ' ';
    return (libreta || []).filter(function (l) { var k = claveLugar(l.nombre); return k.length >= 4 && t.indexOf(' ' + k + ' ') !== -1; })
        .sort(function (a, b) { return claveLugar(b.nombre).length - claveLugar(a.nombre).length; });
}
// Nombre que se propone al guardar: el renglón sin la dirección ni signos («segundo parqueadero de villa flora»)
export function nombreSugerido(item) {
    var t = item.texto;
    var m = RE_VIA.exec(plano(t));
    if (m) {
        var antes = t.slice(0, m.index + m[1].length), despues = t.slice(m.index + m[1].length)
            .replace(/^[a-záéíóúñ]+\.?\s*\d{1,3}\s*[a-h]{0,2}(\s*(sur|este))?(\s*(#|n[o°º.]*|con|x)?\s*\d{1,3}\s*[a-h]{0,2}\s*[- ]?\s*[a-h]?\s*\d{0,3})?/i, '');
        t = antes.length > despues.length ? antes : despues;
    }
    return t.replace(/^[\s.,;:·-]+|[\s.,;:·-]+$/g, '').replace(/\s+/g, ' ').slice(0, 80);
}

// ---------- Ubicar todo ----------
// deps: { ubicarDireccion (window.ubicarDireccion), cruces (window.crucesCalles o null), lotesEn (crearCargadorLotes),
//         zona ({ caja, preferir }), libreta ([{ nombre, lote, microrruta, lat, lon }]), avance(i, total) }
export async function ubicarItems(items, deps) {
    var libreta = deps.libreta || [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (deps.avance) deps.avance(i, items.length);
        it.punto = null; it.aprox = ''; it.lotes = []; it.tramos = []; it.error = '';
        it.lugares = buscarLugares(it.texto, libreta);
        if (it.tipo === 'direccion') {
            try {
                var r = await deps.ubicarDireccion(it.dir, deps.zona.caja, deps.zona.preferir);
                if (r) { it.punto = { lat: r.lat, lng: r.lng }; it.aprox = r.aprox || 'aproximada'; }
                else it.error = 'No se encontró ese cruce en el mapa.';
            } catch (e) { it.error = 'No se pudo buscar (sin conexión).'; }
        } else if (it.tipo === 'via') {
            it.tramos = tramosDeVia(deps.cruces, it.via);
            if (!it.tramos.length) it.error = 'Esa vía no está en los cruces guardados.';
        }
    }
    // Una calle sola puede estar en varios barrios: se toma el tramo más cercano a las direcciones exactas del mismo mensaje
    var exactos = items.filter(function (x) { return x.tipo === 'direccion' && x.punto; }).map(function (x) { return x.punto; });
    var ancla = exactos.length ? centroDe(exactos) : null;
    for (var j = 0; j < items.length; j++) {
        var x = items[j];
        if (x.tipo === 'via' && x.tramos.length) {
            var orden = x.tramos.slice().sort(function (a, b) { return ancla ? metros(a.centro, ancla) - metros(b.centro, ancla) : b.puntos.length - a.puntos.length; });
            x.tramo = orden[0];
            x.otrosTramos = orden.length - 1;
            x.sinAncla = !ancla && orden.length > 1;
            // El punto del mapa: el cruce del tramo más cercano a las otras direcciones (o a su centro): queda sobre la calle
            var ref = ancla || x.tramo.centro;
            x.punto = x.tramo.puntos.slice().sort(function (a, b) { return metros(a, ref) - metros(b, ref); })[0];
            x.aprox = 'toda la vía (' + x.tramo.puntos.length + (x.tramo.puntos.length === 1 ? ' cruce' : ' cruces') + ')';
            var junt = [];
            for (var k = 0; k < x.tramo.puntos.length; k++) {
                var q = x.tramo.puntos[k];
                junt = junt.concat(lotesCerca(q.lat, q.lng, await deps.lotesEn(q.lat, q.lng), 60, 50));
            }
            x.lotes = unirLotes(junt).slice(0, MAX_LOTES + 3);
        } else if (x.punto) {
            x.lotes = lotesCerca(x.punto.lat, x.punto.lng, await deps.lotesEn(x.punto.lat, x.punto.lng));
        }
        // La libreta manda: su lote va primero, y si el renglón no tenía dirección, su punto
        x.lugares.slice().reverse().forEach(function (l) {
            var lote = String(l.lote || ''), mr = String(l.microrruta || '').toUpperCase();
            if (lote || mr) {
                x.lotes = x.lotes.filter(function (y) { return !((lote && y.lote === lote) || (mr && y.mr === mr)); });
                x.lotes.unshift({ lote: lote, mr: mr, cuad: '', dist: null, libreta: l.nombre });
            }
            if (!x.punto && l.lat != null && l.lon != null) { x.punto = { lat: +l.lat, lng: +l.lon }; x.aprox = 'de la libreta («' + l.nombre + '»)'; x.error = ''; }
        });
    }
    // Solo se numeran los renglones que dicen algo (dirección, vía o un nombre de la libreta): los saludos quedan sin número
    var n = 0;
    items.forEach(function (y) { y.n = y.tipo !== 'texto' || y.lugares.length ? ++n : null; });
    if (deps.avance) deps.avance(items.length, items.length);
    return items;
}

// ---------- Salidas ----------
export function idLote(x) { return x.lote || x.mr; }
export function rotulo(x) { return x.lote ? 'Lote ' + x.lote : x.mr; }
// Renglón como lo entendió la app: «Carrera 85 # 76C-18», «Calle 76CC (toda la vía)» o el texto
export function titulo(it) { return it.tipo === 'direccion' ? it.dir.texto : it.tipo === 'via' ? textoVia(it.via) + ' (toda la vía)' : it.texto; }
// mapa_rapido.html?lote=386,387&puntos=6.28025,-75.59179,1|… (los lotes de todas y un punto numerado por dirección)
export function urlMapa(items) {
    var lotes = [], vistos = {}, puntos = [];
    items.forEach(function (it) {
        (it.lotes || []).forEach(function (l) { var id = idLote(l); if (id && !vistos[id]) { vistos[id] = 1; lotes.push(id); } });
        if (it.punto && it.n != null) puntos.push(it.punto.lat.toFixed(5) + ',' + it.punto.lng.toFixed(5) + ',' + it.n);
    });
    if (!lotes.length && !puntos.length) return '';
    return 'mapa_rapido.html?' + (lotes.length ? 'lote=' + lotes.map(encodeURIComponent).join(',') : '') +
        (puntos.length ? (lotes.length ? '&' : '') + 'puntos=' + puntos.join('|') : '');
}
// Resumen para pegar en WhatsApp. veredicto(lote) → texto de la programación («❌ le tocaba el…») o ''
export function textoResumen(items, veredicto) {
    var lin = ['📍 *Direcciones ubicadas*'];
    items.forEach(function (it) {
        if (it.n == null) return;
        lin.push('');
        lin.push('*' + it.n + '. ' + titulo(it) + '*' + (it.tipo !== 'texto' && it.texto.length > titulo(it).length + 6 ? '\n_' + it.texto + '_' : ''));
        if (!(it.lotes || []).length) { lin.push(it.error || 'Sin lote a menos de ' + RADIO + ' m.'); return; }
        it.lotes.slice(0, 3).forEach(function (l) {
            var v = veredicto ? veredicto(l) : '';
            lin.push('• ' + rotulo(l) + (l.lote && l.mr ? ' (' + l.mr + ')' : '') + (l.cuad ? ' · C' + l.cuad : '') +
                (l.libreta ? ' · libreta' : l.dist === 0 ? ' · adentro' : l.dist != null ? ' · a ' + l.dist + ' m' : '') + (v ? '\n   ' + v : ''));
        });
    });
    lin.push('');
    lin.push('_Ubicación aproximada (cruce + metros de la placa): confirmar en el mapa._');
    return lin.join('\n');
}
