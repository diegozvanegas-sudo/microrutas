// 🛣️ Programación por cercanía (optimizar.html): la programación del mes tal como viene contra una armada por sectores,
// para que cada día una cuadrilla haga lotes cercanos entre sí. Solo lógica (sin pantalla).
//
// Cómo se arma la propuesta, por cuadrilla:
//  1. Quincenal = el lote está en Q1 y en Q2; mensual = solo en una de las dos.
//  2. Se hace un recorrido corto por todos sus lotes del mes y se corta en tantos tramos como días trabaja hoy (máximo 12),
//     con la carga (m²) pareja: el quincenal pesa su área (va en las dos quincenas) y el mensual la mitad.
//  3. Cada tramo es un día fijo de la semana: un quincenal va ese mismo día en Q1 y en Q2 (14 días exactos entre las dos
//     pasadas) y un mensual sigue en SU quincena (no se pasa a la otra), solo cambia de día.
//  4. Si un día queda muy cargado, sus mensuales pasan al día más cercano que tenga espacio.
// Distancias en línea recta entre el centro de cada lote (no por calle, no incluye la ida desde la base).
import { fechaPlan } from '../subsanaciones/programacion.js';

export var TOPE = 1.25;        // carga máxima de un día: 125 % del promedio (o el lote más grande, si pesa más)
export var LARGO = 3;          // km: un día «disperso» tiene más que esto entre lotes
var R = 6371;

export function km(a, b) {
    var r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function largo(r) { var s = 0; for (var i = 0; i + 1 < r.length; i++) s += km(r[i], r[i + 1]); return s; }

// Orden corto para visitar los puntos (camino abierto): vecino más cercano desde varios inicios y luego 2-opt
export function ruta(L) {
    var n = L.length;
    if (n <= 2) return L.slice();
    var D = L.map(function (a) { return L.map(function (b) { return km(a, b); }); }), mejor = null, mejorL = Infinity;
    for (var s = 0; s < Math.min(n, 15); s++) {
        var r = [s], libre = L.map(function () { return true; });
        libre[s] = false;
        for (var k = 1; k < n; k++) {
            var u = r[r.length - 1], j = -1;
            for (var c = 0; c < n; c++) if (libre[c] && (j === -1 || D[u][c] < D[u][j])) j = c;
            r.push(j); libre[j] = false;
        }
        for (var mejora = true, vueltas = 0; mejora && vueltas < 60; vueltas++) {
            mejora = false;
            for (var i = 0; i < n - 1; i++) {
                for (var m = i + 1; m < n; m++) {
                    var a = i > 0 ? r[i - 1] : -1, b = r[i], cc = r[m], d = m + 1 < n ? r[m + 1] : -1;
                    var antes = (a >= 0 ? D[a][b] : 0) + (d >= 0 ? D[cc][d] : 0), despues = (a >= 0 ? D[a][cc] : 0) + (d >= 0 ? D[b][d] : 0);
                    if (despues + 1e-9 < antes) { reversa(r, i, m); mejora = true; }
                }
            }
        }
        var l = 0;
        for (var q = 0; q + 1 < n; q++) l += D[r[q]][r[q + 1]];
        if (l < mejorL) { mejorL = l; mejor = r; }
    }
    return mejor.map(function (i) { return L[i]; });
}
function reversa(r, i, j) { while (i < j) { var t = r[i]; r[i] = r[j]; r[j] = t; i++; j--; } }

// Corta un recorrido en nd tramos seguidos, todos con algo, ninguno por encima del tope de carga ni por debajo del
// mínimo (así un lote lejano no queda solo en un día casi vacío), y con el menor recorrido dentro de los tramos
// (programación dinámica). pesos[i] es la carga del punto i. Si no se puede, se aflojan el tope y el mínimo. → [[puntos], …]
export var MINIMO = 0.5;       // carga mínima de un sector al cortar el recorrido: 50 % del promedio
// Después de separar las quincenas, un día con menos del 15 % de la carga promedio recibe mensuales cercanos. Más alto
// cuesta mucho recorrido (con datos de nov. 2026: 15 % → 17 % menos km; 35 % → 13 %; 50 % → 6 %)
export var LIVIANO = 0.15;
export function partir(t, pesos, nd) {
    var n = t.length;
    nd = Math.max(1, Math.min(nd, n));
    if (!n) return [];
    var W = pesos.reduce(function (s, x) { return s + x; }, 0), cap = Math.max(W / nd * TOPE, Math.max.apply(null, pesos)), min = W / nd * MINIMO;
    var pre = [0], pe = [0];
    pesos.forEach(function (x) { pre.push(pre[pre.length - 1] + x); });
    for (var e = 0; e + 1 < n; e++) pe.push(pe[pe.length - 1] + km(t[e], t[e + 1]));
    for (var intento = 0; intento < 60; intento++, cap *= 1.05, min *= 0.85) {
        var dp = [], bk = [];
        for (var s = 0; s <= nd; s++) { dp.push(new Array(n + 1).fill(Infinity)); bk.push(new Array(n + 1).fill(0)); }
        dp[0][0] = 0;
        for (s = 1; s <= nd; s++) {
            for (var j = s; j <= n; j++) {
                for (var i = j - 1; i >= s - 1; i--) {
                    if (pre[j] - pre[i] > cap + 1e-6) break;
                    if (pre[j] - pre[i] < min - 1e-6 || dp[s - 1][i] === Infinity) continue;
                    var c = dp[s - 1][i] + (pe[j - 1] - pe[i]);
                    if (c < dp[s][j]) { dp[s][j] = c; bk[s][j] = i; }
                }
            }
        }
        if (dp[nd][n] < Infinity) {
            var out = [];
            for (s = nd, j = n; s > 0; s--) { var ii = bk[s][j]; out.unshift(t.slice(ii, j)); j = ii; }
            return out;
        }
    }
    return [t.slice()];
}

function centro(L) {
    return { lat: L.reduce(function (s, x) { return s + x.lat; }, 0) / L.length, lon: L.reduce(function (s, x) { return s + x.lon; }, 0) / L.length };
}
function area(L) { return L.reduce(function (s, x) { return s + (x.area || 0); }, 0); }

// ---------- Centros de los lotes ----------
// Mismo formato que decodificar() de lotegps.js: [lon·1e6, lat·1e6, Δlon, Δlat, …] → [[lon, lat], …]
function anillo(plano) {
    var out = [], x = 0, y = 0;
    for (var i = 0; i < plano.length; i += 2) { x += plano[i]; y += plano[i + 1]; out.push([x / 1e6, y / 1e6]); }
    return out;
}
// Centro de un lote del mapa rápido ({ g: [polígono [anillo exterior, huecos…]] }): promedio de los centros de sus
// partes, pesado por el área de cada una (en valor absoluto, para que partes con el sentido contrario no se anulen)
export function centroLote(p) {
    var sx = 0, sy = 0, sw = 0;
    (p.g || []).forEach(function (pol) {
        var r = anillo(pol[0] || []);
        if (!r.length) return;
        // Coordenadas contadas desde la primera esquina: con −75,58 × 6,25 directo se pierde precisión en los lotes chicos
        var x0 = r[0][0], y0 = r[0][1], a = 0, cx = 0, cy = 0;
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
            var xi = r[i][0] - x0, yi = r[i][1] - y0, xj = r[j][0] - x0, yj = r[j][1] - y0, k = xj * yi - xi * yj;
            a += k; cx += (xj + xi) * k; cy += (yj + yi) * k;
        }
        a /= 2;
        var w = Math.abs(a), px, py;
        if (w < 1e-14) {
            px = r.reduce(function (s, q) { return s + q[0]; }, 0) / r.length; py = r.reduce(function (s, q) { return s + q[1]; }, 0) / r.length; w = 1e-14;
        } else { px = x0 + cx / (6 * a); py = y0 + cy / (6 * a); }
        sx += px * w; sy += py * w; sw += w;
    });
    return sw ? { lat: sy / sw, lon: sx / sw, peso: sw } : null;
}
// Lotes de los archivos lotes_N.js → { 'Z2CC0068|265': { lat, lon }, 'Z2CC0068': … (si la microrruta tiene un solo lote) }.
// Un lote puede venir en varios pedazos (varias filas con la misma microrruta y lote): su centro junta todos, por área
export function centrosDeLotes(listas) {
    var suma = {}, lotesMr = {};
    listas.forEach(function (datos) {
        (datos.lotes || []).forEach(function (p) {
            var c = centroLote(p);
            if (!c || !(Math.abs(c.lat) <= 90)) return;
            var mr = String(p.m || '').toUpperCase(), k = mr + '|' + (p.l != null ? String(p.l) : '');
            var s = suma[k] = suma[k] || { la: 0, lo: 0, w: 0 };
            s.la += c.lat * c.peso; s.lo += c.lon * c.peso; s.w += c.peso;
            (lotesMr[mr] = lotesMr[mr] || {})[k] = true;
        });
    });
    var out = {};
    Object.keys(suma).forEach(function (k) { out[k] = { lat: suma[k].la / suma[k].w, lon: suma[k].lo / suma[k].w }; });
    Object.keys(lotesMr).forEach(function (mr) { var ks = Object.keys(lotesMr[mr]); if (ks.length === 1) out[mr] = out[ks[0]]; });
    return out;
}
// Centro de un lote de la programación (por microrruta y lote; si el lote no coincide y la microrruta tiene uno solo, ese)
export function ubicar(x, centros) {
    var lote = /^N\/?A$/i.test(x.lote || '') ? 'NA' : x.lote;
    return centros[x.mr + '|' + lote] || centros[x.mr] || null;
}

// ---------- Análisis ----------
function claveDia(x) { return x.semana * 10 + x.dia; }
// Días (semana 1-2, día 1-6) en que trabaja la cuadrilla en el mes: los de Q1 y los de Q2 llevados a la semana 1-2
function franjas(A, B) {
    var v = {};
    A.forEach(function (x) { if (x.dia >= 1 && x.dia <= 6 && (x.semana === 1 || x.semana === 2)) v[claveDia(x)] = { semana: x.semana, dia: x.dia }; });
    B.forEach(function (x) { if (x.dia >= 1 && x.dia <= 6 && (x.semana === 3 || x.semana === 4)) v[(x.semana - 2) * 10 + x.dia] = { semana: x.semana - 2, dia: x.dia }; });
    var f = Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    if (!f.length) for (var s = 1; s <= 2; s++) for (var d = 1; d <= 6; d++) f.push({ semana: s, dia: d });
    return f;
}
function dia(prog, semana, d, lotes) {
    var r = ruta(lotes);
    return { semana: semana, dia: d, fecha: prog.mes ? fechaPlan(prog.mes, semana, d) : '', lotes: r, km: largo(r), area: area(r) };
}
function diasDeHoy(prog, Q) {
    var g = {};
    Q.forEach(function (x) { if (x.lat != null && x.semana != null && x.dia != null) (g[claveDia(x)] = g[claveDia(x)] || []).push(x); });
    return Object.keys(g).sort(function (a, b) { return a - b; }).map(function (k) { return dia(prog, g[k][0].semana, g[k][0].dia, g[k]); });
}
function sumaKm(dias) { return dias.reduce(function (s, d) { return s + d.km; }, 0); }
function difDias(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }

// prog: leerProgramacion(); centros: centrosDeLotes(). → { cuadrillas: [...], total: {...}, sinUbicar: [lotes] }
// Cada cuadrilla: { cuad, nd, quincenales, mensuales, hoy: {1: [días], 2: [días]}, propuesta: {1, 2}, km: { hoy1, hoy2, prop1, prop2 },
//   largos: { hoy, prop }, cargaMax: { hoy, prop }, separacion: [días entre pasadas de cada quincenal hoy], cambian: {1, 2} }
// Día: { semana, dia, fecha, lotes (en orden de visita), km, area }. Cada lote lleva .cambia (true si la propuesta le cambia el día).
export function analizar(prog, centros) {
    var sinUbicar = [], porCuad = {};
    [1, 2].forEach(function (q) {
        var vistos = {};
        (q === 1 ? prog.q1 : prog.q2).forEach(function (x0) {
            var x = Object.assign({}, x0), c = ubicar(x, centros);
            // La misma microrruta y lote dos veces en una quincena: cada una es una pasada aparte
            var base = x.cuad + '|' + x.mr + '|' + x.lote;
            vistos[base] = (vistos[base] || 0) + 1;
            x.k = base + '#' + vistos[base]; x.q = q;
            if (c) { x.lat = c.lat; x.lon = c.lon; } else sinUbicar.push(x);
            var g = porCuad[x.cuad] = porCuad[x.cuad] || { 1: [], 2: [] };
            g[q].push(x);
        });
    });
    var cuads = Object.keys(porCuad).sort(function (a, b) { return (Number(a) || 999) - (Number(b) || 999) || a.localeCompare(b); });
    var cuadrillas = cuads.map(function (c) {
        var A = porCuad[c][1], B = porCuad[c][2];
        var ka = {}, kb = {};
        A.forEach(function (x) { ka[x.k] = x; }); B.forEach(function (x) { kb[x.k] = x; });
        var quin = {};
        A.forEach(function (x) { if (kb[x.k]) quin[x.k] = true; });
        var hoy = { 1: diasDeHoy(prog, A), 2: diasDeHoy(prog, B) };
        // Separación hoy entre las dos pasadas de cada quincenal
        var separacion = [];
        A.forEach(function (x) {
            var y = kb[x.k];
            if (quin[x.k] && x.semana != null && x.dia != null && y.semana != null && y.dia != null && prog.mes)
                separacion.push(difDias(fechaPlan(prog.mes, x.semana, x.dia), fechaPlan(prog.mes, y.semana, y.dia)));
        });
        // Propuesta: un recorrido por todo el mes (cada quincenal una sola vez) cortado en sectores
        var fr = franjas(A, B), ubic = function (x) { return x.lat != null; };
        var mes = A.filter(ubic).concat(B.filter(function (x) { return ubic(x) && !quin[x.k]; }));
        var t = ruta(mes), nd = Math.min(fr.length, t.length || 1);
        var sect = partir(t, t.map(function (x) { return quin[x.k] ? x.area || 0 : (x.area || 0) / 2; }), nd);
        var D = { 1: [], 2: [] };
        sect.forEach(function (Ls) {
            D[1].push(Ls.filter(function (x) { return quin[x.k] || x.q === 1; }).map(function (x) { return quin[x.k] ? ka[x.k] : x; }));
            D[2].push(Ls.filter(function (x) { return quin[x.k] || x.q === 2; }).map(function (x) { return quin[x.k] ? kb[x.k] : x; }));
        });
        // Días muy cargados: sus mensuales pasan al día más cercano con espacio (los quincenales no se mueven)
        [1, 2].forEach(function (q) {
            var Q = (q === 1 ? A : B).filter(ubic);
            if (!Q.length) return;
            var cap = Math.max(area(Q) / D[q].length * TOPE, Math.max.apply(null, Q.map(function (x) { return x.area || 0; })));
            for (var vez = 0; vez < 500; vez++) {
                var ld = D[q].map(area), i = ld.indexOf(Math.max.apply(null, ld));
                if (ld[i] <= cap) break;
                var mejor = null;
                D[q][i].forEach(function (x) {
                    if (quin[x.k]) return;
                    D[q].forEach(function (L, j) {
                        if (j === i || !L.length || ld[j] + (x.area || 0) > cap) return;
                        var d = km(x, centro(L));
                        if (!mejor || d < mejor.d) mejor = { d: d, x: x, j: j };
                    });
                });
                if (!mejor) break;
                D[q][i].splice(D[q][i].indexOf(mejor.x), 1); D[q][mejor.j].push(mejor.x);
            }
            // Días muy livianos (p. ej. el sector solo tenía mensuales de la otra quincena): reciben el mensual más cercano
            // de otro día, sin que ese quede liviano ni este pase del tope
            var min = area(Q) / D[q].length * LIVIANO;
            for (vez = 0; vez < 500; vez++) {
                ld = D[q].map(area);
                var i2 = ld.indexOf(Math.min.apply(null, ld));
                if (ld[i2] >= min) break;
                var destino = D[q][i2].length ? centro(D[q][i2]) : null, mejor2 = null;
                D[q].forEach(function (L, j) {
                    if (j === i2) return;
                    L.forEach(function (x) {
                        if (quin[x.k] || ld[j] - (x.area || 0) < min || ld[i2] + (x.area || 0) > cap) return;
                        var d = destino ? km(x, destino) : 0;
                        if (!mejor2 || d < mejor2.d) mejor2 = { d: d, x: x, j: j };
                    });
                });
                if (!mejor2) break;
                D[q][mejor2.j].splice(D[q][mejor2.j].indexOf(mejor2.x), 1); D[q][i2].push(mejor2.x);
            }
        });
        var propuesta = { 1: [], 2: [] }, cambian = { 1: 0, 2: 0 };
        [1, 2].forEach(function (q) {
            D[q].forEach(function (L, i) {
                if (!L.length) return;
                var f = fr[i], sem = f.semana + (q === 2 ? 2 : 0), d = dia(prog, sem, f.dia, L);
                d.lotes = d.lotes.map(function (x) {
                    var cambia = x.semana !== sem || x.dia !== f.dia;
                    if (cambia) cambian[q]++;
                    return Object.assign({}, x, { antes: { semana: x.semana, dia: x.dia }, semana: sem, dia: f.dia, cambia: cambia });
                });
                propuesta[q].push(d);
            });
        });
        var todos = function (o) { return o[1].concat(o[2]); };
        return {
            cuad: c, nd: nd, quincenales: Object.keys(quin).length, mensuales: A.length + B.length - 2 * Object.keys(quin).length,
            lotes: { 1: A.length, 2: B.length }, hoy: hoy, propuesta: propuesta, separacion: separacion, cambian: cambian,
            km: { hoy1: sumaKm(hoy[1]), hoy2: sumaKm(hoy[2]), prop1: sumaKm(propuesta[1]), prop2: sumaKm(propuesta[2]) },
            largos: { hoy: todos(hoy).filter(function (d) { return d.km > LARGO; }).length, prop: todos(propuesta).filter(function (d) { return d.km > LARGO; }).length },
            cargaMax: { hoy: Math.max.apply(null, todos(hoy).map(function (d) { return d.area; }).concat(0)), prop: Math.max.apply(null, todos(propuesta).map(function (d) { return d.area; }).concat(0)) },
            sinDia: A.concat(B).filter(function (x) { return x.semana == null || x.dia == null; }).length,
            // Los que el Excel deja sin semana o día (ubicados): en el mapa de hoy van aparte, sin recorrido
            sinDiaLotes: { 1: A.filter(function (x) { return ubic(x) && (x.semana == null || x.dia == null); }), 2: B.filter(function (x) { return ubic(x) && (x.semana == null || x.dia == null); }) }
        };
    });
    var suma = function (f) { return cuadrillas.reduce(function (s, c) { return s + f(c); }, 0); };
    var sep = [].concat.apply([], cuadrillas.map(function (c) { return c.separacion; }));
    var total = {
        hoy: suma(function (c) { return c.km.hoy1 + c.km.hoy2; }), prop: suma(function (c) { return c.km.prop1 + c.km.prop2; }),
        largosHoy: suma(function (c) { return c.largos.hoy; }), largosProp: suma(function (c) { return c.largos.prop; }),
        quincenales: suma(function (c) { return c.quincenales; }), malEspaciados: sep.filter(function (d) { return d < 13 || d > 15; }).length,
        sepMin: sep.length ? Math.min.apply(null, sep) : null, sepMax: sep.length ? Math.max.apply(null, sep) : null,
        cambian: suma(function (c) { return c.cambian[1] + c.cambian[2]; }), lotes: suma(function (c) { return c.lotes[1] + c.lotes[2]; }),
        sinDia: suma(function (c) { return c.sinDia; })
    };
    total.ahorro = total.hoy ? Math.round(100 * (1 - total.prop / total.hoy)) : 0;
    return { cuadrillas: cuadrillas, total: total, sinUbicar: sinUbicar };
}

// ---------- Recorridos enumerados (mapas y Excel) ----------
// Días de una quincena → paradas en orden: [{ dia, x, n (orden en el día), g (orden seguido en la quincena), sig (km al
// siguiente del mismo día, null en el último), total (lotes del día) }]
export function paradas(dias) {
    var out = [], g = 0;
    (dias || []).forEach(function (d) {
        d.lotes.forEach(function (x, i) {
            g++;
            out.push({ dia: d, x: x, n: i + 1, g: g, total: d.lotes.length, sig: i + 1 < d.lotes.length ? km(x, d.lotes[i + 1]) : null });
        });
    });
    return out;
}
// Ángulo en pantalla (grados, 0 = hacia el este, positivo = hacia abajo, como CSS rotate) de la flecha de a hacia b
export function anguloPantalla(a, b) {
    var dx = (b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180), dy = b.lat - a.lat;
    return Math.atan2(-dy, dx) * 180 / Math.PI;
}
// Fechas de los días de hoy y de la propuesta de una quincena, sin repetir y en orden (para un color por fecha)
export function fechasDe(diasHoy, diasProp) {
    var v = {};
    (diasHoy || []).concat(diasProp || []).forEach(function (d) { if (d.fecha) v[d.fecha] = { fecha: d.fecha, semana: d.semana, dia: d.dia }; });
    return Object.keys(v).sort().map(function (k) { return v[k]; });
}
export function metros(km) { return km < 1 ? Math.round(km * 1000) + ' m' : kmTexto(km) + ' km'; }

// ---------- Textos ----------
var DIAS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function nombreDia(x) { return x && x.dia ? DIAS[x.dia] + (x.fecha ? ' ' + x.fecha.slice(8, 10) + '/' + x.fecha.slice(5, 7) : '') : 'sin día'; }
export function rotuloLote(x) { return x.lote && !/^N\/?A$/i.test(x.lote) ? x.lote : x.mr; }
export function kmTexto(n) { return (Math.round(n * 10) / 10).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
export function pct(hoy, prop) { return hoy ? Math.round(100 * (1 - prop / hoy)) : 0; }

// Resumen para WhatsApp o correo
export function textoResumen(res, mes) {
    var t = res.total, lin = ['PROGRAMACIÓN POR CERCANÍA · ' + (mes || ''),
        'Recorrido entre lotes del mismo día (línea recta, 11 cuadrillas): hoy ' + kmTexto(t.hoy) + ' km, propuesta ' + kmTexto(t.prop) + ' km (' + t.ahorro + ' % menos).',
        'Días con más de ' + LARGO + ' km entre lotes: hoy ' + t.largosHoy + ', propuesta ' + t.largosProp + '.',
        'Quincenales: ' + t.quincenales + '; hoy ' + t.malEspaciados + ' quedan a menos de 13 o más de 15 días entre pasadas' + (t.sepMin != null ? ' (de ' + t.sepMin + ' a ' + t.sepMax + ' días)' : '') + '; en la propuesta, 14 días siempre.', ''];
    res.cuadrillas.forEach(function (c) {
        var h = c.km.hoy1 + c.km.hoy2, p = c.km.prop1 + c.km.prop2;
        lin.push('Cuadrilla ' + c.cuad + ': ' + kmTexto(h) + ' → ' + kmTexto(p) + ' km (' + pct(h, p) + ' %)');
    });
    return lin.join('\n').replace('11 cuadrillas', res.cuadrillas.length + (res.cuadrillas.length === 1 ? ' cuadrilla' : ' cuadrillas'));
}
