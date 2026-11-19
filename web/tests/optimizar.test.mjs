// Pruebas de 🛣️ Programación por cercanía (src/optimizar/optimizar.js y excel.js), con lotes inventados.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { km, largo, ruta, partir, centroLote, centrosDeLotes, ubicar, analizar, textoResumen, nombreDia } from '../src/optimizar/optimizar.js';
import { libroPropuesta } from '../src/optimizar/excel.js';

// Punto a «metros» al norte y al este de un origen en Medellín
var O = { lat: 6.25, lon: -75.58 };
function p(norte, este) { return { lat: O.lat + norte / 110574, lon: O.lon + este / (111320 * Math.cos(O.lat * Math.PI / 180)) }; }

test('km: distancia en línea recta', () => {
    // La Tierra como esfera: hasta ~0,6 % de diferencia con los metros por grado usados en p()
    assert.ok(Math.abs(km(p(0, 0), p(1000, 0)) - 1) < 0.01);
    assert.ok(Math.abs(km(p(0, 0), p(0, 3000)) - 3) < 0.02);
});

test('ruta: ordena puntos revueltos en una línea y no queda peor que el orden dado', () => {
    var L = [0, 5, 1, 4, 2, 3].map(function (i) { return Object.assign(p(0, i * 500), { id: i }); });
    var r = ruta(L);
    assert.equal(r.length, 6);
    assert.ok(Math.abs(largo(r) - 2.5) < 0.02, 'el camino corto por la línea mide 2,5 km');
    assert.ok(largo(r) <= largo(L));
    assert.deepEqual(r.map(function (x) { return x.id; }).join(''), r[0].id === 0 ? '012345' : '543210');
    assert.deepEqual(ruta([]), []);
    assert.equal(ruta([p(0, 0)]).length, 1);
});

test('partir: el número de días pedido, todos con algo y cortando donde hay más distancia', () => {
    // Dos grupos de 3 lotes separados 5 km: en 2 días queda un grupo por día
    var t = [p(0, 0), p(0, 100), p(0, 200), p(0, 5200), p(0, 5300), p(0, 5400)];
    var s = partir(t, [1, 1, 1, 1, 1, 1], 2);
    assert.deepEqual(s.map(function (x) { return x.length; }), [3, 3]);
    // Más días que lotes: un lote por día
    assert.equal(partir(t.slice(0, 2), [1, 1], 5).length, 2);
    // Un lote muy pesado va solo
    var c = partir([p(0, 0), p(0, 10), p(0, 20)], [100, 1, 1], 2);
    assert.deepEqual(c.map(function (x) { return x.length; }), [1, 2]);
});

test('centroLote y centrosDeLotes: un lote en varios pedazos junta todos (por área) y una microrruta de un solo lote se encuentra por su código', () => {
    // Cuadrado de 1e-3° (lon −75.58, lat 6.25) en el formato del mapa rápido: [lon·1e6, lat·1e6, Δ…]
    var cuadro = function (lon, lat) { return [[[lon, lat, 1000, 0, 0, 1000, -1000, 0, 0, -1000]]]; };
    var c = centroLote({ g: cuadro(-75580000, 6250000) });
    assert.ok(Math.abs(c.lat - 6.2505) < 1e-9 && Math.abs(c.lon + 75.5795) < 1e-9);
    var centros = centrosDeLotes([{ lotes: [
        { m: 'Z1CC0001', l: '10', g: cuadro(-75580000, 6250000) },
        { m: 'Z1CC0001', l: '10', g: cuadro(-75570000, 6250000) },
        { m: 'z2cc0002', l: 'NA', g: cuadro(-75600000, 6260000) }
    ] }]);
    assert.ok(Math.abs(centros['Z1CC0001|10'].lon + 75.5745) < 1e-9, 'el centro queda entre los dos pedazos');
    assert.ok(ubicar({ mr: 'Z2CC0002', lote: 'N/A' }, centros));
    assert.ok(ubicar({ mr: 'Z2CC0002', lote: '999' }, centros), 'microrruta de un solo lote');
    assert.equal(ubicar({ mr: 'Z9CC0009', lote: '1' }, centros), null);
});

// Programación inventada: una cuadrilla, 4 días por quincena (lunes y martes de las semanas 1 y 2), dos barrios a 4 km.
// Hoy cada día mezcla los dos barrios; los lotes 1-4 son quincenales y el resto mensuales.
function programacion() {
    var barrio = function (i) { return i % 2 ? p(4000, i * 60) : p(0, i * 60); };
    var centros = {}, q1 = [], q2 = [];
    for (var i = 1; i <= 12; i++) { var c = barrio(i); centros['Z1CC00' + (10 + i) + '|' + i] = c; }
    var lote = function (i, semana, dia, frec) { return { fila: i + 1, cuad: '1', mr: 'Z1CC00' + (10 + i), lote: String(i), dir: 'Calle ' + i, area: 1000, frec: frec, semana: semana, dia: dia, hecho: false, fecha: '', obs: '' }; };
    var dias = [[1, 1], [1, 2], [2, 1], [2, 2]];
    [1, 2, 3, 4].forEach(function (i, k) { q1.push(lote(i, dias[k][0], dias[k][1], 2)); q2.push(lote(i, dias[(k + 2) % 4][0] + 2, dias[(k + 2) % 4][1], 2)); });
    [5, 6, 7, 8].forEach(function (i, k) { q1.push(lote(i, dias[k][0], dias[k][1], 1)); });
    [9, 10, 11, 12].forEach(function (i, k) { q2.push(lote(i, dias[k][0] + 2, dias[k][1], 1)); });
    q1.push(Object.assign(lote(13, null, null, 1), { mr: 'Z1CC0099', lote: '99' }));   // no está en el mapa
    return { prog: { mes: '2026-11', q1: q1, q2: q2, especiales: [], sif: {} }, centros: centros };
}

test('analizar: menos km, quincenales a 14 días, mensuales en su quincena y ningún lote perdido', () => {
    var d = programacion(), res = analizar(d.prog, d.centros), c = res.cuadrillas[0];
    assert.equal(res.cuadrillas.length, 1);
    assert.equal(c.nd, 4);
    assert.equal(c.quincenales, 4);
    assert.deepEqual(res.sinUbicar.map(function (x) { return x.mr; }), ['Z1CC0099']);
    assert.ok(res.total.prop < res.total.hoy / 2, 'hoy cada día cruza 4 km entre barrios; la propuesta no: ' + res.total.hoy + ' → ' + res.total.prop);
    // Cada lote ubicado aparece una sola vez en su quincena
    [1, 2].forEach(function (q) {
        var ids = [].concat.apply([], c.propuesta[q].map(function (dd) { return dd.lotes.map(function (x) { return x.lote; }); })).sort();
        var esperado = (q === 1 ? d.prog.q1 : d.prog.q2).filter(function (x) { return x.mr !== 'Z1CC0099'; }).map(function (x) { return x.lote; }).sort();
        assert.deepEqual(ids, esperado);
    });
    // Quincenal: mismo día de la semana, 14 días después
    var fecha = {};
    [1, 2].forEach(function (q) { c.propuesta[q].forEach(function (dd) { dd.lotes.forEach(function (x) { (fecha[x.lote] = fecha[x.lote] || {})[q] = dd.fecha; }); }); });
    ['1', '2', '3', '4'].forEach(function (l) { assert.equal((new Date(fecha[l][2]) - new Date(fecha[l][1])) / 864e5, 14, 'lote ' + l); });
    // Hoy los quincenales quedan a 7 o 21 días: todos mal espaciados
    assert.equal(res.total.malEspaciados, 4);
    assert.ok(c.propuesta[1].every(function (dd) { return dd.semana <= 2; }) && c.propuesta[2].every(function (dd) { return dd.semana >= 3; }));
    // Los días de la propuesta son los mismos que trabaja hoy (lunes y martes)
    assert.ok(c.propuesta[1].concat(c.propuesta[2]).every(function (dd) { return dd.dia === 1 || dd.dia === 2; }));
    assert.match(textoResumen(res, '2026-11'), /PROGRAMACIÓN POR CERCANÍA · 2026-11[\s\S]*Cuadrilla 1: /);
    assert.equal(nombreDia({ dia: 1, fecha: '2026-11-02' }), 'lun 02/11');
});

test('analizar: con un lote muy pesado, el día más cargado de la propuesta no pasa del más cargado de hoy', () => {
    var d = programacion();
    d.prog.q1.forEach(function (x) { if (x.lote === '5') x.area = 2500; });
    var c = analizar(d.prog, d.centros).cuadrillas[0];
    assert.equal(c.cargaMax.hoy, 3500);
    assert.ok(c.cargaMax.prop <= c.cargaMax.hoy, 'propuesta ' + c.cargaMax.prop);
});

test('analizar: los días muy cargados pasan sus mensuales al día más cercano con espacio', () => {
    // 6 lotes mensuales en Q1, todos en el mismo punto salvo uno lejano; 3 días. El recorrido los juntaría, el tope los reparte
    var centros = {}, q1 = [];
    for (var i = 1; i <= 6; i++) {
        centros['Z1CC00' + (10 + i) + '|' + i] = i === 6 ? p(9000, 0) : p(i, 0);
        q1.push({ fila: i, cuad: '1', mr: 'Z1CC00' + (10 + i), lote: String(i), dir: '', area: 1000, frec: 1, semana: 1, dia: i <= 3 ? i : 1, hecho: false, fecha: '', obs: '' });
    }
    var c = analizar({ mes: '2026-11', q1: q1, q2: [] }, centros).cuadrillas[0];
    assert.equal(c.propuesta[1].length, 3);
    c.propuesta[1].forEach(function (dd) { assert.ok(dd.area <= 2500, 'carga ' + dd.area); });
});

test('analizar: un día que en su quincena queda casi vacío recibe un mensual cercano', () => {
    // Barrio X (norte) y barrio Y (sur), un quincenal chico en cada uno. Los mensuales de Q1 están en Y y los de Q2 en X:
    // sin el arreglo, la Q2 tendría un día solo con el quincenal chico de Y
    var centros = {}, q1 = [], q2 = [], n = 0;
    var lote = function (pos, area, frec, semana, dia) {
        n++; centros['Z1CC00' + (10 + n) + '|' + n] = pos;
        return { fila: n, cuad: '1', mr: 'Z1CC00' + (10 + n), lote: String(n), dir: '', area: area, frec: frec, semana: semana, dia: dia, hecho: false, fecha: '', obs: '' };
    };
    var qx = lote(p(5000, 0), 100, 2, 1, 1), qy = lote(p(0, 0), 100, 2, 1, 2);
    q1.push(qx, qy); q2.push(Object.assign({}, qx, { semana: 3 }), Object.assign({}, qy, { semana: 3 }));
    for (var i = 0; i < 4; i++) q1.push(lote(p(i * 50, 100), 1000, 1, 1, 1 + i % 2));
    for (i = 0; i < 4; i++) q2.push(lote(p(5000 + i * 50, 100), 1000, 1, 3, 1 + i % 2));
    var c = analizar({ mes: '2026-11', q1: q1, q2: q2 }, centros).cuadrillas[0];
    var prom = c.propuesta[2].reduce(function (s, d) { return s + d.area; }, 0) / c.propuesta[2].length;
    c.propuesta[2].forEach(function (d) { assert.ok(d.area >= prom * 0.15, 'día de ' + d.area + ' m² (promedio ' + prom + ')'); });
});

test('excel: comparativo, una hoja por quincena con todas las filas y la de sin ubicar', async () => {
    var d = programacion(), res = analizar(d.prog, d.centros);
    var wb = libroPropuesta(ExcelJS, res, { mes: '2026-11', archivo: 'prueba.xlsx' });
    var otro = new ExcelJS.Workbook();
    await otro.xlsx.load(await wb.xlsx.writeBuffer());
    assert.deepEqual(otro.worksheets.map(function (w) { return w.name; }), ['Comparativo', 'Propuesta Q1', 'Propuesta Q2', 'Días más dispersos hoy', 'Sin ubicar']);
    assert.equal(otro.getWorksheet('Propuesta Q1').rowCount, 1 + 8);
    assert.equal(otro.getWorksheet('Propuesta Q2').rowCount, 1 + 8);
    var f = otro.getWorksheet('Propuesta Q2').getRow(2).values;
    assert.equal(f[1], 1);                  // cuadrilla
    assert.ok(f[7] === 3 || f[7] === 4);   // semana de la Q2
    assert.equal(otro.getWorksheet('Sin ubicar').getRow(2).getCell(3).value, 'Z1CC0099');
});
