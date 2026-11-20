// 🌾 Espartillos (espartillos.html): la lista de espartillos por zona, armada en el momento con lo que tiene la app.
// Sin nada de la página, para probarlo con npm test.
//
// De dónde sale cada dato:
//   - Los espartillos (código, dirección, descripción, área y dibujo): capa Espartillos del mapa rápido (data/rapido/capa_espartillos.js).
//     Un código viene en varias piezas: se juntan y se suman sus áreas.
//   - La zona: la de la programación del mes (hoja SIF_ESP, columna ZONA) si el espartillo está programado; si no, la zona EMV
//     (capa Zonas EMV) donde cae su pieza más grande. Guayabal y parte de Belén no están en esa capa: «Sin zona EMV».
//   - La comuna: capa Comunas, por las piezas.
//   - La ejecución Q1/Q2: la programación del mes guardada en este equipo (la misma de 📅 Programación del día y 📊 Cruce).
import { decodificar } from '../subsanaciones/lotegps.js';

export var SIN_ZONA = 'Sin zona EMV';

// Capa en el formato del mapa rápido: g = [polígono [anillo plano]] → [polígono [anillo [lat, lon]]]
export function poligonosDe(g) { return (g || []).map(function (pol) { return pol.map(decodificar); }); }

function dentroAnillo(lat, lon, r) {
    var a = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) a = !a;
    }
    return a;
}
// Dentro de alguno de los polígonos (los huecos quedan fuera)
export function dentro(lat, lon, polys) {
    return polys.some(function (pol) { var a = false; pol.forEach(function (r) { if (dentroAnillo(lat, lon, r)) a = !a; }); return a; });
}
// Centro (por área) del anillo exterior; si cae fuera (forma de U), el primer vértice
function centro(pol) {
    var r = pol[0] || [], A = 0, cy = 0, cx = 0;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var f = r[j][1] * r[i][0] - r[i][1] * r[j][0];
        A += f; cx += (r[j][1] + r[i][1]) * f; cy += (r[j][0] + r[i][0]) * f;
    }
    if (!A) return { area: 0, p: r[0] };
    var p = [cy / (3 * A), cx / (3 * A)];
    return { area: Math.abs(A / 2), p: dentro(p[0], p[1], [pol]) ? p : r[0] };
}
function metros(a, b) { return Math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 110600); }

// «6», «Zona 6», «ZONA 6 » → «Zona 6»; lo demás tal cual
export function nombreZona(z) {
    var s = String(z == null ? '' : z).trim();
    var m = s.match(/^(?:zona\s*)?(\d+)$/i);
    return m ? 'Zona ' + Number(m[1]) : s;
}
export function ordenZona(z) {
    var m = /^Zona (\d+)$/.exec(z);
    return m ? Number(m[1]) : z === SIN_ZONA ? 999 : z ? 100 : 1000;
}
function ordenCodigo(a, b) { return String(a).localeCompare(String(b), 'es', { numeric: true }); }

// ¿Ejecutado? La programación marca con X o con la fecha
function hecho(v) { return !!String(v || '').trim(); }

// capas: { espartillos, zonas, comunas } (lo que trae cargarCapa); sif: prog.sif.esp de la programación guardada (o null)
// → { filas, zonas: [nombre], comunas: [nombre], mes, conProgramacion, programadosSinDibujo }
export function armarLista(capas, sif) {
    var zonas = ((capas.zonas || {}).items || []).map(function (z) { return { n: z.n, p: poligonosDe(z.g) }; });
    var comunas = ((capas.comunas || {}).items || []).map(function (z) { return { n: z.n, p: poligonosDe(z.g) }; });
    var donde = function (lista, p) { for (var i = 0; i < lista.length; i++) if (dentro(p[0], p[1], lista[i].p)) return lista[i].n; return ''; };
    var grupos = {}, orden = [];
    ((capas.espartillos || {}).items || []).forEach(function (it) {
        var k = String(it.o || '').trim() || '(sin código)';
        var g = grupos[k];
        if (!g) { g = grupos[k] = { codigo: k, desc: it.s || '', dir: it.d || '', area: 0, piezas: 0, porZona: {}, comunas: {}, mayor: -1, p: null }; orden.push(k); }
        var polys = poligonosDe(it.g), mejor = { area: -1, p: null };
        polys.forEach(function (pol) { var c = centro(pol); if (c.area > mejor.area) mejor = c; });
        if (!mejor.p) return;
        var a = Number(it.a) || 0, z = donde(zonas, mejor.p) || SIN_ZONA, c = donde(comunas, mejor.p);
        g.area += a; g.piezas++;
        g.porZona[z] = (g.porZona[z] || 0) + a;
        if (c) g.comunas[c] = true;
        if (a > g.mayor) { g.mayor = a; g.p = mejor.p; }
        if (!g.dir && it.d) g.dir = it.d;
    });
    // Programación del mes, por código
    var prog = {};
    ((sif && sif.rutas) || []).forEach(function (r) { if (r.codigo) prog[String(r.codigo).trim()] = r; });
    var cercana = function (p) {
        var mejor = ['', Infinity];
        zonas.forEach(function (z) { z.p.forEach(function (pol) { pol.forEach(function (r) { r.forEach(function (q) { var d = metros(p, q); if (d < mejor[1]) mejor = [z.n, d]; }); }); }); });
        return mejor[0] ? { zona: mejor[0], m: Math.round(mejor[1] / 50) * 50 } : null;
    };
    // Dirección repetida en códigos de otra comuna (en la capa hay direcciones copiadas de otro código)
    var porDir = {};
    orden.forEach(function (k) { var d = grupos[k].dir; if (d) (porDir[d] = porDir[d] || []).push(k); });
    var filas = orden.map(function (k) {
        var g = grupos[k], zs = Object.keys(g.porZona).sort(function (a, b) { return g.porZona[b] - g.porZona[a]; });
        var zMapa = zs[0] || SIN_ZONA, r = prog[k] || null, zProg = r ? nombreZona(r.zona) : '';
        var zona = zProg || zMapa, obs = [];
        if (zProg && zMapa !== SIN_ZONA && zProg !== zMapa) obs.push('En la programación es ' + zProg + ' y en el mapa cae en ' + zMapa);
        var otros = (porDir[g.dir] || []).filter(function (c) { return c !== k && c.slice(0, 2) !== k.slice(0, 2); });
        if (otros.length) obs.push('La dirección es igual a la de ' + otros.join(', ') + ' (otra comuna): revisar el dibujo o la dirección');
        var cerca = zona === SIN_ZONA && g.p ? cercana(g.p) : null;
        return {
            codigo: k, zona: zona, zonaDe: zProg ? 'programación' : zona === SIN_ZONA ? '' : 'mapa',
            tambien: zs.slice(1).filter(function (z) { return z !== SIN_ZONA && z !== zona; }),
            comuna: Object.keys(g.comunas).sort().join(', '), dir: g.dir, desc: g.desc, area: Math.round(g.area), piezas: g.piezas,
            lat: g.p ? +g.p[0].toFixed(6) : null, lon: g.p ? +g.p[1].toFixed(6) : null, cerca: cerca,
            prog: r ? { q1: hecho(r.q1), fecha1: r.fecha1 || '', q2: hecho(r.q2), fecha2: r.fecha2 || '', obs: r.obs || '' } : null,
            obs: obs, dibujo: true
        };
    });
    // Programados que no están en la capa del mapa: también salen (sin dibujo)
    var sinDibujo = Object.keys(prog).filter(function (k) { return !grupos[k]; });
    sinDibujo.forEach(function (k) {
        var r = prog[k];
        filas.push({ codigo: k, zona: nombreZona(r.zona) || SIN_ZONA, zonaDe: r.zona ? 'programación' : '', tambien: [], comuna: '', dir: '', desc: '', area: 0, piezas: 0,
            lat: null, lon: null, cerca: null, prog: { q1: hecho(r.q1), fecha1: r.fecha1 || '', q2: hecho(r.q2), fecha2: r.fecha2 || '', obs: r.obs || '' },
            obs: ['Está en la programación pero no en la capa Espartillos del mapa'], dibujo: false });
    });
    filas.sort(function (a, b) { return ordenZona(a.zona) - ordenZona(b.zona) || a.zona.localeCompare(b.zona) || ordenCodigo(a.codigo, b.codigo); });
    var nombres = {}, coms = {};
    filas.forEach(function (f) { nombres[f.zona] = true; f.comuna.split(', ').filter(Boolean).forEach(function (c) { coms[c] = true; }); });
    return {
        filas: filas,
        zonas: Object.keys(nombres).sort(function (a, b) { return ordenZona(a) - ordenZona(b) || a.localeCompare(b); }),
        comunas: Object.keys(coms).sort(function (a, b) { return a.localeCompare(b, 'es'); }),
        conProgramacion: !!(sif && sif.rutas),
        programadosSinDibujo: sinDibujo.length
    };
}

// estado: '' (todos) | 'programados' | 'ejecutados' (en alguna quincena) | 'pendientes' (programados sin ejecución) | 'revisar'
export function filtrar(filas, f) {
    f = f || {};
    var t = String(f.texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    return filas.filter(function (x) {
        if (f.zona && x.zona !== f.zona) return false;
        if (f.comuna && x.comuna.split(', ').indexOf(f.comuna) === -1) return false;
        if (f.estado === 'programados' && !x.prog) return false;
        if (f.estado === 'ejecutados' && !(x.prog && (x.prog.q1 || x.prog.q2))) return false;
        if (f.estado === 'pendientes' && !(x.prog && !x.prog.q1 && !x.prog.q2)) return false;
        if (f.estado === 'revisar' && !x.obs.length && x.zona !== SIN_ZONA) return false;
        if (t) {
            var todo = [x.codigo, x.zona, x.comuna, x.dir, x.desc].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (t.split(/\s+/).some(function (p) { return todo.indexOf(p) === -1; })) return false;
        }
        return true;
    });
}

// Por zona: códigos, m², programados, ejecutados Q1 y Q2
export function resumenPorZona(filas) {
    var por = {};
    filas.forEach(function (x) {
        var r = por[x.zona] = por[x.zona] || { zona: x.zona, codigos: 0, area: 0, programados: 0, q1: 0, q2: 0, revisar: 0 };
        r.codigos++; r.area += x.area;
        if (x.prog) { r.programados++; r.q1 += x.prog.q1 ? 1 : 0; r.q2 += x.prog.q2 ? 1 : 0; }
        if (x.obs.length || x.zona === SIN_ZONA) r.revisar++;
    });
    return Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return ordenZona(a.zona) - ordenZona(b.zona) || a.zona.localeCompare(b.zona); });
}

export function enlaces(x) {
    if (x.lat == null) return { mapa: '', google: '' };
    return { mapa: 'mapa_rapido.html?ll=' + x.lat + ',' + x.lon, google: 'https://www.google.com/maps?q=' + x.lat + ',' + x.lon };
}
