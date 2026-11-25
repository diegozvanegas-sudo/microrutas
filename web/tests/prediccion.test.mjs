import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habilesEntre, sumarHabiles, mesDeFechas, historialVacio, agregarExcel, agregarVisitas, muestrasHistorial, atrasoCuadrilla, predecirDia, predecirLote, mesSiguiente, mesAnterior } from '../src/subsanaciones/prediccion.js';
import { fechaPlan } from '../src/subsanaciones/programacion.js';

// Noviembre 2026: la semana 1 empieza el lunes 2. C1 tiene un lote por día hábil de las semanas 1 y 2 (Q1)
function fila(cuad, n, semana, dia, extra) { return Object.assign({ cuad: cuad, mr: 'Z1CC' + String(n).padStart(4, '0'), lote: String(n), dir: '', semana: semana, dia: dia, hecho: false, fecha: '', fila: n }, extra || {}); }
function plan(mes, hechoCon) {
    var q1 = [], q2 = [], n = 1;
    for (var s = 1; s <= 4; s++) for (var d = 1; d <= 6; d++) {
        var x = fila('1', n++, s, d);
        if (hechoCon) { var f = hechoCon(mes, x); if (f) { x.hecho = true; x.fecha = f; } }
        (s <= 2 ? q1 : q2).push(x);
    }
    return { mes: mes, q1: q1, q2: q2 };
}

test('días hábiles: lunes a sábado, el domingo no cuenta', () => {
    assert.equal(habilesEntre('2026-11-07', '2026-11-09'), 1);   // sábado → lunes
    assert.equal(habilesEntre('2026-11-02', '2026-11-07'), 5);
    assert.equal(habilesEntre('2026-11-09', '2026-11-02'), -6);
    assert.equal(sumarHabiles('2026-11-07', 1), '2026-11-09');
    assert.equal(sumarHabiles('2026-11-09', -1), '2026-11-07');
    assert.equal(sumarHabiles('2026-11-08', 0), '2026-11-09');    // domingo → lunes
    assert.equal(mesSiguiente('2026-12'), '2027-01');
    assert.equal(mesAnterior('2026-01'), '2025-12');
});

test('mes de un Excel: por las fechas, aunque el nombre diga otro', () => {
    const oct = plan('2026-10', (m, x) => sumarHabiles(fechaPlan(m, x.semana, x.dia), 2));
    assert.equal(mesDeFechas(Object.assign({}, oct, { mes: '2026-09' })), '2026-10');
    assert.equal(mesDeFechas(plan('2026-11')), '2026-11');   // sin fechas: el del nombre
});

test('historial: el atraso de los meses anteriores corre el plan', () => {
    const hist = historialVacio();
    // En octubre C1 iba 3 días hábiles atrasada
    const r = agregarExcel(hist, plan('2026-10', (m, x) => sumarHabiles(fechaPlan(m, x.semana, x.dia), 3)), 'oct.xlsx');
    assert.deepEqual([r.mes, r.n, r.corrido], ['2026-10', 24, false]);
    const nov = plan('2026-11'), mu = muestrasHistorial(nov, hist, nov.mes);
    const at = atrasoCuadrilla('1', nov, mu, '2026-11-02', () => '', 1);
    assert.deepEqual([at.dias, at.fuente, at.meses], [3, 'historial', ['2026-10']]);
    // El jueves 5/11 probablemente va en lo del plan del lunes 2 (semana 1, día 1)
    const pd = predecirDia(nov, mu, '2026-11-05');
    const c1 = pd.cuadrillas[0];
    assert.equal(c1.plan.fecha, '2026-11-02');
    assert.deepEqual(c1.lotes.map(x => x.lote), ['1']);
    // Volver a subir el mismo mes lo reemplaza (no lo duplica)
    agregarExcel(hist, plan('2026-10', (m, x) => sumarHabiles(fechaPlan(m, x.semana, x.dia), 3)), 'oct (1).xlsx');
    assert.equal(Object.values(hist.lotes).reduce((a, L) => a + L.length, 0), 24);
});

test('lo que va del mes manda sobre el historial (la cuadrilla cambió de ritmo)', () => {
    const hist = historialVacio();
    agregarExcel(hist, plan('2026-10', (m, x) => sumarHabiles(fechaPlan(m, x.semana, x.dia), 5)), 'oct.xlsx');
    // En noviembre va al día: los lotes de la semana 1 se hicieron el día del plan
    const nov = plan('2026-11', (m, x) => x.semana === 1 && x.dia <= 4 ? fechaPlan(m, x.semana, x.dia) : '');
    const mu = muestrasHistorial(nov, hist, nov.mes), hecho = x => x.hecho ? x.fecha : '';
    const at = atrasoCuadrilla('1', nov, mu, '2026-11-06', hecho, 1);
    assert.deepEqual([at.dias, at.fuente, at.n], [0, 'mes', 4]);
    // Con un solo lote del mes se promedia con el historial
    const uno = plan('2026-11', (m, x) => x.semana === 1 && x.dia === 1 ? fechaPlan(m, 1, 1) : '');
    const at1 = atrasoCuadrilla('1', uno, muestrasHistorial(uno, hist, uno.mes), '2026-11-03', hecho, 1);
    assert.deepEqual([at1.dias, at1.fuente], [3, 'mezcla']);   // (0 + 5) / 2 → 3
    // El viernes 6: plan del viernes, y lo anterior ya está hecho; el sábado 7 también va
    const pd = predecirDia(nov, mu, '2026-11-06', hecho);
    assert.deepEqual(pd.cuadrillas[0].lotes.map(x => x.lote), ['5']);
    assert.equal(pd.cuadrillas[0].antes, 0);
});

test('predecir un lote: pendiente, vencido, ya hecho (el mes que viene) y meses anteriores', () => {
    const hist = historialVacio();
    agregarExcel(hist, plan('2026-10', (m, x) => sumarHabiles(fechaPlan(m, x.semana, x.dia), 2)), 'oct.xlsx');
    const nov = plan('2026-11'), mu = muestrasHistorial(nov, hist, nov.mes);
    const x = nov.q2[0];   // semana 3, día 1 → plan lunes 16/11
    const p = predecirLote(nov, mu, hist, x, 2, '2026-11-10');
    assert.deepEqual([p.plan, p.fecha, p.vencido, p.proximoMes], ['2026-11-16', '2026-11-18', false, false]);
    assert.deepEqual(p.anteriores, [{ mes: '2026-10', fecha: sumarHabiles(fechaPlan('2026-10', 3, 1), 2) }]);
    // Ya pasó la fecha probable y no se ha hecho
    const v = predecirLote(nov, mu, hist, x, 2, '2026-11-25');
    assert.deepEqual([v.vencido, v.fecha], [true, '2026-11-25']);
    // Ya hecho: la del mes que viene (diciembre 2026: la semana 1 empieza el lunes 30/11)
    const h = predecirLote(nov, mu, hist, Object.assign({}, x, { hecho: true, fecha: '2026-11-16' }), 2, '2026-11-25');
    assert.equal(h.proximoMes, true);
    assert.equal(h.plan, fechaPlan('2026-12', 3, 1));
    // Sin día en el Excel: no hay predicción
    assert.equal(predecirLote(nov, mu, hist, Object.assign({}, x, { semana: null }), 2, '2026-11-10').fecha, '');
});

test('domingo: no se programa', () => {
    assert.equal(predecirDia(plan('2026-11'), {}, '2026-11-08').domingo, true);
});

test('visitas de la app: completan los meses sin Excel, sin pisar los que tienen Excel', () => {
    const hist = historialVacio(), nov = plan('2026-11');
    agregarExcel(hist, plan('2026-10', (m, x) => fechaPlan(m, x.semana, x.dia)), 'oct.xlsx');
    const n = agregarVisitas(hist, nov, [
        { mr: 'Z1CC0001', lote: '1', fecha: '2026-09-09' },   // septiembre (sin Excel): entra
        { mr: '', lote: '2', fecha: '2026-09-10' },            // solo el lote: se busca en el plan
        { mr: 'Z1CC0001', lote: '1', fecha: '2026-10-20' }     // octubre tiene Excel: no entra
    ]);
    assert.equal(n, 2);
    assert.equal(hist.meses['2026-09'].origen, 'app');
    assert.equal(hist.lotes['Z1CC0001|1'].filter(e => e[0] === '2026-10').length, 1);
});
