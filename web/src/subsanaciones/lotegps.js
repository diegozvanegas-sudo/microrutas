// En qué lote cae una foto según su GPS, con los polígonos del mapa rápido (data/rapido/lotes_N.js, uno por cuadrilla).
// Solo se descargan las cuadrillas cuyo recuadro (data/rapido/indice.js) queda cerca del punto, y quedan guardadas mientras
// la página esté abierta.
//
// Resultado: { lote, mr, cuad, dist } con dist = 0 si la foto está dentro del lote, o los metros al borde del lote más
// cercano si está afuera pero a menos de CERCA metros (el GPS del celular se corre 5 a 20 m). null si no hay lote cerca.

export var CERCA = 30;

// Mismo formato que decodificar() en mapa_rapido.html: [lon·1e6, lat·1e6, Δlon, Δlat, …] → [[lat, lon], …]
export function decodificar(plano) {
    var out = [], x = 0, y = 0;
    for (var i = 0; i < plano.length; i += 2) { x += plano[i]; y += plano[i + 1]; out.push([y / 1e6, x / 1e6]); }
    return out;
}

// Par o impar de cruces con todos los anillos del lote: así los huecos quedan fuera y las partes sueltas dentro
export function dentro(lat, lon, anillos) {
    var adentro = false;
    anillos.forEach(function (r) {
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
            var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) adentro = !adentro;
        }
    });
    return adentro;
}

// Metros del punto al borde más cercano (proyección plana local: sirve para distancias cortas)
var M_LAT = 110574;
export function distanciaBorde(lat, lon, anillos) {
    var mLon = 111320 * Math.cos(lat * Math.PI / 180), mejor = Infinity;
    anillos.forEach(function (r) {
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
            var ax = (r[j][1] - lon) * mLon, ay = (r[j][0] - lat) * M_LAT, bx = (r[i][1] - lon) * mLon, by = (r[i][0] - lat) * M_LAT;
            var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
            var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
            if (d < mejor) mejor = d;
        }
    });
    return mejor;
}

// Lotes de un archivo lotes_N.js ya leído → [{ lote, mr, cuad, anillos, caja: [latMin, lonMin, latMax, lonMax] }]
export function prepararLotes(datos) {
    return (datos.lotes || []).map(function (p) {
        var anillos = [];
        (p.g || []).forEach(function (pol) { pol.forEach(function (r) { anillos.push(decodificar(r)); }); });
        var caja = [90, 180, -90, -180];
        anillos.forEach(function (r) { r.forEach(function (q) { caja = [Math.min(caja[0], q[0]), Math.min(caja[1], q[1]), Math.max(caja[2], q[0]), Math.max(caja[3], q[1])]; }); });
        return { lote: p.l && p.l !== 'NA' ? String(p.l) : '', mr: String(p.m || '').toUpperCase(), cuad: p.c != null ? String(p.c) : '', anillos: anillos, caja: caja };
    });
}

// Holgura de las cajas en grados (~CERCA metros) para no descartar un lote que está a pocos metros
var HOLGURA = CERCA / M_LAT;
function enCaja(lat, lon, c, h) { return lat >= c[0] - h && lat <= c[2] + h && lon >= c[1] - h && lon <= c[3] + h; }

// Busca en una lista de lotes ya preparados: primero dentro; si no, el más cercano a menos de CERCA metros
export function buscarLote(lat, lon, lotes) {
    var cerca = null;
    for (var i = 0; i < lotes.length; i++) {
        var l = lotes[i];
        if (!enCaja(lat, lon, l.caja, HOLGURA)) continue;
        if (dentro(lat, lon, l.anillos)) return { lote: l.lote, mr: l.mr, cuad: l.cuad, dist: 0 };
        var d = distanciaBorde(lat, lon, l.anillos);
        if (d <= CERCA && (!cerca || d < cerca.dist)) cerca = { lote: l.lote, mr: l.mr, cuad: l.cuad, dist: Math.round(d) };
    }
    return cerca;
}

// "Z1CC0100 · Lote 110" (o solo la microrruta si el lote no tiene número)
export function rotuloLote(x) { return x ? x.mr + (x.lote ? ' · Lote ' + x.lote : '') : ''; }

// Texto de un archivo de datos ("cargarLotes("1",{…});" o "var indiceRapido = {…};") → el objeto
export function leerDatos(texto) { return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)); }

// Ubicador con las descargas guardadas. base: carpeta de los datos (por defecto data/rapido/)
export function crearUbicador(base, traer) {
    base = base || 'data/rapido/';
    traer = traer || function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('No se pudo descargar ' + url); return r.text(); }); };
    var indice = null, cuadrillas = {};
    function cargarIndice() { return indice || (indice = traer(base + 'indice.js').then(leerDatos)); }
    function cargarCuadrilla(c) { return cuadrillas[c] || (cuadrillas[c] = traer(base + 'lotes_' + c + '.js').then(function (t) { return prepararLotes(leerDatos(t)); })); }
    return async function ubicar(lat, lon) {
        var idx = await cargarIndice(), cs = Object.keys(idx.cuadrillas || {}).filter(function (c) {
            var b = idx.cuadrillas[c].b;
            return b && enCaja(lat, lon, [b[0][0], b[0][1], b[1][0], b[1][1]], HOLGURA);
        });
        var mejor = null;
        for (var i = 0; i < cs.length; i++) {
            var x = buscarLote(lat, lon, await cargarCuadrilla(cs[i]));
            if (x && x.dist === 0) return x;
            if (x && (!mejor || x.dist < mejor.dist)) mejor = x;
        }
        return mejor;
    };
}
