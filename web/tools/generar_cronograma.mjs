// Dibuja los corredores de los cronogramas de recorrido sobre las calles de OpenStreetMap.
// Lee datos/contrato/cronogramas.json (privado, fuera del repositorio): cada sector con «trazo» { via, desde?, hasta? } se
// busca por nombre de calle (también el nombre alterno de OSM: Palacé = Carrera 50, Ayacucho = Calle 49…), se recorta al
// polígono de su zona (public/data/rapido/capa_zonas.js) y, si tiene «desde» o «hasta», a la calle que lo cruza.
// Escribe en el mismo archivo trazo.g (líneas [[lat, lon]…]), trazo.estado ('calles' o 'aprox'), trazo.nota y trazo.m (metros).
// Lo que no se puede ubicar con seguridad queda 'aprox' con la razón: se revisa en el mapa antes de usarlo.
// Uso: node tools/generar_cronograma.mjs        (después: npm run guia -- --doc CRONOGRAMAS, en la carpeta del proyecto)
// Las calles salen de tools/.cache_osm_vias.json (la descarga tools/ajustar_a_calles.py).
import fs from 'node:fs';

const AQUI = new URL('./', import.meta.url);
const ARCHIVO = new URL('../../datos/contrato/cronogramas.json', AQUI);
const VIAS = new URL('.cache_osm_vias.json', AQUI);
const ZONAS = new URL('../public/data/rapido/capa_zonas.js', AQUI);

// «Avenida del Ferrocarril» = «avenida ferrocarril»
export function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(del|de la|de los|de)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
export function decodificar(plano) {
    var out = [], x = 0, y = 0;
    for (var i = 0; i < plano.length; i += 2) { x += plano[i]; y += plano[i + 1]; out.push([y / 1e6, x / 1e6]); }
    return out;
}
// Metros planos alrededor de Medellín (suficiente para distancias de cuadras)
var LAT0 = 6.25, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110540;
var aXY = function (p) { return [p[1] * KX, p[0] * KY]; };
var dist = function (a, b) { var A = aXY(a), B = aXY(b); return Math.hypot(A[0] - B[0], A[1] - B[1]); };
export function dentro(p, anillo) {
    var x = p[1], y = p[0], si = false;
    for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        var xi = anillo[i][1], yi = anillo[i][0], xj = anillo[j][1], yj = anillo[j][0];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) si = !si;
    }
    return si;
}
// Cruce de dos segmentos (o punto más cercano si están a menos de 'tol' metros)
function cruce(a, b, c, d, tol) {
    var A = aXY(a), B = aXY(b), C = aXY(c), D = aXY(d);
    var r = [B[0] - A[0], B[1] - A[1]], s = [D[0] - C[0], D[1] - C[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) > 1e-9) {
        var t = ((C[0] - A[0]) * s[1] - (C[1] - A[1]) * s[0]) / den, u = ((C[0] - A[0]) * r[1] - (C[1] - A[1]) * r[0]) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    var mejor = null, md = tol;
    [[a, c, d], [b, c, d], [c, a, b], [d, a, b]].forEach(function (q) { var p = proyectar(q[0], q[1], q[2]), m = dist(q[0], p); if (m < md) { md = m; mejor = q[0]; } });
    return mejor;
}
function proyectar(p, a, b) {
    var P = aXY(p), A = aXY(a), B = aXY(b), dx = B[0] - A[0], dy = B[1] - A[1], l = dx * dx + dy * dy;
    var t = l ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l)) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export function largo(linea) { var m = 0; for (var i = 1; i < linea.length; i++) m += dist(linea[i - 1], linea[i]); return m; }
// Douglas-Peucker en metros
export function simplificar(l, tol) {
    if (l.length < 3) return l;
    var md = 0, k = 0;
    for (var i = 1; i < l.length - 1; i++) { var d = dist(l[i], proyectar(l[i], l[0], l[l.length - 1])); if (d > md) { md = d; k = i; } }
    if (md <= tol) return [l[0], l[l.length - 1]];
    return simplificar(l.slice(0, k + 1), tol).slice(0, -1).concat(simplificar(l.slice(k), tol));
}
// Partes de las líneas que cumplen la condición (cada tramo seguido es una línea)
function filtrar(lineas, ok) {
    var out = [];
    lineas.forEach(function (l) {
        var cur = [];
        l.forEach(function (p) { if (ok(p)) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } });
        if (cur.length > 1) out.push(cur);
    });
    return out;
}
// Vías de OSM por nombre (principal, alterno, oficial o antiguo)
export function indiceVias(elementos) {
    var idx = {};
    elementos.forEach(function (e) {
        if (e.type !== 'way' || !e.tags || !e.geometry) return;
        var linea = e.geometry.map(function (g) { return [g.lat, g.lon]; });
        ['name', 'alt_name', 'official_name', 'old_name', 'short_name'].forEach(function (k) {
            String(e.tags[k] || '').split(';').map(norm).filter(Boolean).forEach(function (n) { (idx[n] = idx[n] || []).push(linea); });
        });
    });
    return idx;
}
// Punto donde la vía (sus líneas) cruza la calle 'nombre': el promedio de los cruces (una avenida tiene dos calzadas)
function puntoCruce(lineas, cruzadas, tol) {
    var pts = [];
    lineas.forEach(function (l) {
        for (var i = 1; i < l.length; i++) cruzadas.forEach(function (c) {
            for (var j = 1; j < c.length; j++) { var p = cruce(l[i - 1], l[i], c[j - 1], c[j], tol || 12); if (p) pts.push(p); }
        });
    });
    if (!pts.length) return null;
    // Si cruza en varios sitios lejanos, el grupo más grande
    var grupos = [];
    pts.forEach(function (p) { var g = grupos.find(function (x) { return dist(x[0], p) < 150; }); if (g) g.push(p); else grupos.push([p]); });
    grupos.sort(function (a, b) { return b.length - a.length; });
    var g = grupos[0];
    return [g.reduce(function (s, p) { return s + p[0]; }, 0) / g.length, g.reduce(function (s, p) { return s + p[1]; }, 0) / g.length];
}
// Dirección local de la vía cerca de un punto
function direccion(lineas, p) {
    var mejor = null, md = Infinity;
    lineas.forEach(function (l) { for (var i = 1; i < l.length; i++) { var q = proyectar(p, l[i - 1], l[i]), d = dist(p, q); if (d < md) { md = d; mejor = [l[i - 1], l[i]]; } } });
    var A = aXY(mejor[0]), B = aXY(mejor[1]), n = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    return [(B[0] - A[0]) / n, (B[1] - A[1]) / n];
}

// trazo { via, desde?, hasta?, sentido?: 'norte'|'sur'|'oriente'|'occidente', zona?: false, supuesto?: texto }, anillo de la zona,
// índice de vías → { g, estado, nota, m }. Con zona: false no se recorta al polígono (las zonas del mapa son las del corte de
// césped y no cubren todos los corredores). 'supuesto' explica cómo se interpretó un sitio que no está en OSM (queda 'aprox').
export function trazar(trazo, anillo, idx) {
    var vias = [].concat(trazo.via), notas = [], lineas = [];
    vias.forEach(function (v) { var l = idx[norm(v)]; if (l) lineas = lineas.concat(l); else notas.push('no se encontró la vía «' + v + '» en OSM'); });
    if (anillo && trazo.zona !== false) lineas = filtrar(lineas, function (p) { return dentro(p, anillo); });
    if (!lineas.length) return { g: [], estado: 'aprox', nota: notas.concat('la vía no pasa por la zona').join('; '), m: 0 };
    if (trazo.supuesto) notas.push(trazo.supuesto);
    var limites = ['desde', 'hasta'].filter(function (k) { return trazo[k]; }).map(function (k) {
        var c = idx[norm(trazo[k])], p = c ? puntoCruce(lineas, c) : null;
        // Por puente o deprimido las líneas no se tocan: se busca dónde pasan a menos de 80 m
        if (!p && c && (p = puntoCruce(lineas, c, 80))) notas.push('«' + trazo[k] + '» no cruza a nivel: se tomó donde pasa más cerca');
        // La calle termina antes de llegar a la vía: el punto de la vía más cercano a ella (hasta 400 m)
        if (!p && c) {
            var md = 400;
            c.forEach(function (lc) { lc.forEach(function (q) { lineas.forEach(function (l) { for (var i = 1; i < l.length; i++) { var r = proyectar(q, l[i - 1], l[i]), d = dist(q, r); if (d < md) { md = d; p = r; } } }); }); });
            if (p) notas.push('«' + trazo[k] + '» no llega a la vía: se tomó el punto más cercano (a ' + Math.round(md) + ' m)');
        }
        if (!p) notas.push('no se ubicó «' + trazo[k] + '» (' + k + '); se dejó la vía completa en ese sentido');
        return p;
    }).filter(Boolean);
    if (limites.length === 2) {
        // Entre los dos cruces
        var A = aXY(limites[0]), B = aXY(limites[1]), dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
        lineas = filtrar(lineas, function (p) { var P = aXY(p), t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l2; return t >= -0.01 && t <= 1.01; });
    } else if (limites.length === 1) {
        // Un solo límite: del cruce hacia el lado donde la vía sigue más dentro de la zona (el otro extremo es el borde de la zona)
        var c0 = limites[0], d = direccion(lineas, c0), C = aXY(c0);
        var lado = function (p) { var P = aXY(p); return (P[0] - C[0]) * d[0] + (P[1] - C[1]) * d[1]; };
        var mas = filtrar(lineas, function (p) { return lado(p) >= 0; }), menos = filtrar(lineas, function (p) { return lado(p) <= 0; });
        var lm = mas.reduce(function (s, x) { return s + largo(x); }, 0), ln = menos.reduce(function (s, x) { return s + largo(x); }, 0);
        if (trazo.sentido) {
            // El lado cuyo centro queda hacia el sentido pedido
            var centro = function (ls) { var n = 0, a = 0, o = 0; ls.forEach(function (l) { l.forEach(function (p) { n++; a += p[0]; o += p[1]; }); }); return n ? [a / n, o / n] : c0; };
            var cm = centro(mas), eje = { norte: [0, 1], sur: [0, -1], oriente: [1, 0], occidente: [-1, 0] }[trazo.sentido] || [0, 1];
            var hacia = (cm[1] - c0[1]) * eje[0] + (cm[0] - c0[0]) * eje[1];
            lineas = hacia >= 0 ? mas : menos;
            if (!trazo.desde || !trazo.hasta) notas.push('un solo límite: hacia el ' + trazo.sentido + ' hasta donde termina la vía' + (anillo && trazo.zona !== false ? ' o la zona' : ''));
        } else {
            lineas = lm >= ln ? mas : menos;
            if (!trazo.desde || !trazo.hasta) notas.push('un solo límite: se tomó el lado más largo dentro de la zona');
        }
    } else if (!trazo.desde && !trazo.hasta) notas.push('sin límites en el texto: toda la vía dentro de la zona');
    lineas = lineas.map(function (l) { return simplificar(l, 4).map(function (p) { return [+p[0].toFixed(5), +p[1].toFixed(5)]; }); }).filter(function (l) { return largo(l) > 15; });
    var m = Math.round(lineas.reduce(function (s, x) { return s + largo(x); }, 0));
    var seguro = notas.length === 0 || (notas.length === 1 && /sin límites/.test(notas[0]));
    return { g: lineas, estado: seguro && lineas.length ? 'calles' : 'aprox', nota: notas.join('; '), m: m };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    if (!fs.existsSync(ARCHIVO)) { console.log('No existe datos/contrato/cronogramas.json.'); process.exit(1); }
    if (!fs.existsSync(VIAS)) { console.log('Falta tools/.cache_osm_vias.json: corra primero tools/ajustar_a_calles.py (descarga las calles de OSM).'); process.exit(1); }
    var datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    var idx = indiceVias(JSON.parse(fs.readFileSync(VIAS, 'utf8')).elements);
    var tz = fs.readFileSync(ZONAS, 'utf8'), zonas = JSON.parse(tz.slice(tz.indexOf('{'), tz.lastIndexOf('}') + 1)).items;
    var anilloDe = function (z) { var it = zonas.find(function (x) { return norm(x.n) === norm('Zona ' + z); }); return it ? decodificar(it.g[0][0]) : null; };
    datos.secciones.forEach(function (s) {
        (s.items || []).forEach(function (it) {
            if (!it.trazo) { console.log('  ·  Zona ' + it.zona + ' · ' + it.t + '  → sin trazo (sector, se ve en la lista)'); return; }
            var r = trazar(it.trazo, anilloDe(it.zona), idx);
            Object.assign(it.trazo, r);
            console.log((r.estado === 'calles' ? '  ✓ ' : '  ⚠ ') + 'Zona ' + it.zona + ' · ' + it.t + '  → ' + r.g.length + ' tramos, ' + r.m + ' m' + (r.nota ? ' (' + r.nota + ')' : ''));
        });
    });
    fs.writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2) + '\n');
    console.log('Listo: datos/contrato/cronogramas.json actualizado. Para subirlo: npm run guia -- --doc CRONOGRAMAS');
}
