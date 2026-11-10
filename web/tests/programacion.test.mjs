import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lunesSemana1, fechaPlan, semanaDia, quincenaDe, fechaDe, valorCelda, leerLotes, leerEspeciales, leerSif, leerProgramacion, estadoDelDia, especialesDeSemana, textoDelDia } from '../src/subsanaciones/programacion.js';

const CAB = ['CUADRILLA', 'MICRORRUTA', 'LOTE', 'DESCRIPCION', 'DIRECCION', 'AREA m2', 'FRECUENCIA', 'SEMANA DE EJECUCION', 'DIA DE EJECUCION', 'EJECUCIÓN', 'FECHA', 'OBSERVACIÓN', '', '', 'AVANCE PROGRAMACIÓN CLUS Q1', ''];
const L = (cuad, mr, lote, sem, dia, ej = '', fecha = '', obs = '') => [cuad, mr, lote, 'desc', 'Cr 1 # 2-3', 1000, 2, sem, dia, ej, fecha, obs, '', '', '', ''];

test('calendario: semana 1 es la del primer día hábil del mes', () => {
    assert.equal(lunesSemana1('2026-11'), '2026-11-02');   // el 1 es domingo
    assert.equal(lunesSemana1('2026-10'), '2026-09-28');   // el 1 es jueves: la semana empieza el lunes anterior
    assert.equal(lunesSemana1('2026-06'), '2026-06-01');   // el 1 es lunes
    assert.equal(lunesSemana1('2026-08'), '2026-07-27');   // el 1 es sábado
});
test('calendario: semana y día ↔ fecha', () => {
    assert.equal(fechaPlan('2026-11', 1, 1), '2026-11-02');
    assert.equal(fechaPlan('2026-11', 2, 1), '2026-11-09');
    assert.equal(fechaPlan('2026-11', 2, 6), '2026-11-14');
    assert.equal(fechaPlan('2026-11', 4, 6), '2026-11-28');
    assert.deepEqual(semanaDia('2026-11', '2026-11-09'), { semana: 2, dia: 1 });
    assert.deepEqual(semanaDia('2026-11', '2026-11-07'), { semana: 1, dia: 6 });
    assert.deepEqual(semanaDia('2026-11', '2026-11-08'), { semana: 1, dia: null });   // domingo
    assert.deepEqual(semanaDia('2026-11', '2026-11-30'), { semana: 5, dia: 1 });
    assert.equal(semanaDia('2026-11', '2026-10-30'), null);
    assert.equal(quincenaDe(2), 1);
    assert.equal(quincenaDe(3), 2);
    assert.equal(quincenaDe(5), 2);
});
test('fechas y celdas como las entrega ExcelJS', () => {
    assert.equal(fechaDe('2026-11-03'), '2026-11-03');
    assert.equal(fechaDe('5/11/2026 - 06/11/2026'), '2026-11-05');
    assert.equal(fechaDe('X'), '');
    assert.equal(valorCelda(new Date(Date.UTC(2026, 10, 3))), '2026-11-03');
    assert.equal(valorCelda({ formula: 'A1', result: 7 }), 7);
    assert.equal(valorCelda({ richText: [{ text: 'Z1' }, { text: 'CC0001' }] }), 'Z1CC0001');
    assert.equal(valorCelda(null), '');
});

const Q1 = [CAB,
    L(1, 'Z2CC0327', 1105, 1, 1, 'X', '2026-11-03'),
    L(1, 'Z2CC0336', 1168, 1, 1),
    L(1, 'Z2CC0328', 1113, 1, 2, 'X', '2026-11-04'),
    L(1, 'Z2CC0252', 472, 1, 4),
    L(1, 'Z2CC0268', 488, 2, 1),
    L(1, 'Z2CC0273', 493, 2, 1),
    L(1, 'Z2CC0999', 'NA', null, null),
    L(3, 'Z2CC0282', 502, 2, 1, 'X', '2026-11-06'),
    L(3, 'Z2CC0085', 282, 2, 2),
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL DE MICRORRUTAS', 9],
    L(2, 'Z2CC0079', 276, 2, 1)];

test('leerLotes: solo filas con microrruta; lote NA y sin semana', () => {
    const l = leerLotes(Q1);
    assert.equal(l.length, 10);
    assert.deepEqual(l.map(x => x.lote), ['1105', '1168', '1113', '472', '488', '493', 'NA', '502', '282', '276']);
    assert.equal(l[0].hecho, true);
    assert.equal(l[0].fecha, '2026-11-03');
    assert.equal(l[1].hecho, false);
    assert.equal(l[6].semana, null);
    assert.equal(l[0].cuad, '1');
});
test('estadoDelDia: lo de hoy, lo atrasado, dónde va y lo adelantado', () => {
    const prog = { mes: '2026-11', q1: leerLotes(Q1), q2: [], especiales: [] };
    const e = estadoDelDia(prog, '2026-11-09');
    assert.equal(e.semana, 2); assert.equal(e.dia, 1); assert.equal(e.quincena, 1);
    const [c1, c2, c3] = e.cuadrillas;
    assert.deepEqual(e.cuadrillas.map(c => c.cuad), ['1', '2', '3']);
    assert.deepEqual(c1.hoy.map(x => x.lote), ['488', '493']);
    assert.deepEqual(c1.atrasados.map(x => x.lote), ['1168', '472']);   // el lote sin semana no cuenta
    assert.equal(c1.sinFecha, 1);
    assert.equal(c1.ultimo.fecha, '2026-11-04');
    assert.deepEqual(c1.siguen.map(x => x.lote), ['472', '488', '493']);
    assert.equal(c1.hechos, 2);
    assert.deepEqual(c2.siguen, []);                                   // sin nada marcado no se dice "va en"
    assert.equal(c2.atrasados.length, 0);
    assert.deepEqual(c3.hoy.map(x => x.lote), ['502']);
    assert.equal(c3.siguen[0].lote, '282');
});
test('estadoDelDia: las visitas de la app cuentan como hechas aunque no tengan X', () => {
    const prog = { mes: '2026-11', q1: leerLotes(Q1), q2: [], especiales: [] };
    const e = estadoDelDia(prog, '2026-11-09', x => x.lote === '1168');
    const c1 = e.cuadrillas[0];
    assert.equal(c1.hechos, 3);
    assert.equal(c1.soloApp, 1);
    assert.deepEqual(c1.atrasados.map(x => x.lote), ['472']);
});
test('estadoDelDia: domingo y segunda quincena', () => {
    const q2 = leerLotes([CAB, L(1, 'Z2CC0327', 1105, 3, 1), L(1, 'Z2CC0328', 1113, 3, 2, 'X', '2026-11-17')]);
    const prog = { mes: '2026-11', q1: leerLotes(Q1), q2, especiales: [] };
    const d = estadoDelDia(prog, '2026-11-08');
    assert.equal(d.domingo, true);
    assert.deepEqual(d.cuadrillas[0].atrasados.map(x => x.lote), ['1168', '472']);   // todo lo de la semana 1
    const e = estadoDelDia(prog, '2026-11-18');
    assert.equal(e.quincena, 2);
    assert.equal(e.cuadrillas.length, 1);
    assert.deepEqual(e.cuadrillas[0].atrasados.map(x => x.lote), ['1105']);
    assert.equal(e.cuadrillas[0].hechos, 1);
});

const ESP = [['CÓDIGO RUTA', 'ZONA', 'ESCENARIO', 'FRECUENCIA', 'DIRECCIÓN', 'ÁREA (m2)', 'FECHA PRÓXIMA INTERVENCIÓN', 'OBSERVACIONES', 'EJECUCIÓN', 'CUADRILLA'],
    ['ISVIMED', 2, 'COLINAS', '', 'Cr 102C', 15437, '2026-11-03', '', '2026-11-03', 'SIF'],
    ['La Granja', '', 'La Granja', 'Mensual', 'Vía al Mar Km 7', 8101, '2026-11-10', 'Programar el mismo día\nque Tejiendo Amor', '', ''],
    ['Juan Pablo II', '', '', 'Mensual', 'Cr 70', 51750, '2026-11-11', '', '', ''],
    ['Otra', '', '', '', '', 1, '2026-11-20', '', '', '']];
test('operaciones especiales de la semana', () => {
    const esp = leerEspeciales(ESP);
    assert.equal(esp.length, 4);
    assert.equal(esp[1].obs, 'Programar el mismo día que Tejiendo Amor');
    assert.equal(esp[0].ejecutado, '2026-11-03');
    const prog = { mes: '2026-11', q1: [], q2: [], especiales: esp };
    assert.deepEqual(especialesDeSemana(prog, '2026-11-09').map(e => e.ruta), ['La Granja', 'Juan Pablo II']);
    assert.deepEqual(especialesDeSemana(prog, '2026-11-04').map(e => e.ruta), ['ISVIMED']);
});
test('rutas SIF: cuántas tienen ejecución por quincena', () => {
    const sif = leerSif([['CODIFICACIÓN', 'DESCRIPCIÓN', 'DIRECCIÓN', 'ÁREA (m2) BASE', 'FRECUENCIA', 'EJECUCIÓN Q1', 'EJECUCIÓN Q2'],
        ['03_11_CC_0113', '', '', 1011, 'Mensual', 'X', ''], ['04_07_CC_0104', '', '', 402, 'Mensual', '', ''], ['', '', '', '', '', '', '']]);
    assert.deepEqual(sif, { total: 2, q1: 1, q2: 0 });
    // Espartillos: encabezado en la segunda fila y dos columnas EJECUCIÓN
    const esp = leerSif([['ESPARTILLO MECÁNICO'], ['CODIFICACIÓN', 'DESCRIPCIÓN', 'DIRECCIÓN', 'ÁREA (m2)', 'FRECUENCIA', 'ZONA ', 'EJECUCIÓN Q1', 'FECHA', 'OBSERVACIONES', 'EJECUCIÓN Q2'],
        ['15_02_ES_0026', '', '', 15163, 'Quincenal', 6, 'X', '2026-11-02', '', '']]);
    assert.deepEqual(esp, { total: 1, q1: 1, q2: 0 });
});
test('leerProgramacion: hojas por nombre y mes del archivo', () => {
    const p = leerProgramacion({ PROGRAMACION: Q1, Q1, Q2: [CAB], OP_ESPECIALES: ESP }, '2026_11_Noviembre_Programacion_CW394406.xlsx');
    assert.equal(p.mes, '2026-11');
    assert.equal(p.q1.length, 10);
    assert.equal(p.especiales.length, 4);
    // Sin el año en el nombre: el mes sale de las fechas marcadas
    assert.equal(leerProgramacion({ Q1 }, 'programacion.xlsx').mes, '2026-11');
});
test('texto para WhatsApp', () => {
    const prog = leerProgramacion({ Q1, OP_ESPECIALES: ESP }, '2026_11.xlsx');
    const t = textoDelDia(estadoDelDia(prog, '2026-11-09'), especialesDeSemana(prog, '2026-11-09'));
    assert.match(t, /^PROGRAMACIÓN CORTE DE CÉSPED · 09\/11\/2026\nSemana 2, día 1 \(lunes\) · Q1/);
    assert.match(t, /Cuadrilla 1 · 2 de 7 hechos · 2 atrasados\n  Hoy: Z2CC0268 lote 488, Z2CC0273 lote 493\n  Va en: Z2CC0252 lote 472 \(último marcado 04\/11\)/);
    assert.match(t, /Cuadrilla 2 · 0 de 1 hechos · al día\n  Hoy: Z2CC0079 lote 276/);
    assert.match(t, /10\/11 La Granja/);
});

import { estadoLote, lotesDeQuincena, zonaDe } from '../src/subsanaciones/programacion.js';
test('estado de cada lote en la fecha', () => {
    const prog = { mes: '2026-11', q1: leerLotes(Q1), q2: [], especiales: [] };
    const est = (lote, enApp) => estadoLote(prog.q1.find(x => x.lote === lote), prog, '2026-11-09', enApp);
    assert.equal(est('1105'), 'hecho');
    assert.equal(est('1168'), 'atrasado');
    assert.equal(est('1168', x => x.lote === '1168'), 'app');
    assert.equal(est('488'), 'hoy');
    assert.equal(est('282'), 'pendiente');
    assert.equal(est('NA'), 'sin');
    assert.equal(lotesDeQuincena(prog, '2026-11-20'), prog.q1);   // sin Q2 se sigue con la Q1
    assert.equal(zonaDe('Z1CC0100'), '1');
    assert.equal(zonaDe('Z6CC0212'), '6');
    assert.equal(zonaDe('x'), '');
});

test('operación especial: mapa rápido si la dirección es de nomenclatura, Google Maps siempre', async () => {
    const { enlacesEspecial } = await import('../src/subsanaciones/programacion.js');
    const urb = enlacesEspecial({ ruta: 'Centro Integrado San Cristóbal', dir: 'Calle 64 N 127-32' });
    assert.equal(urb.mapa, 'mapa_rapido.html?q=' + encodeURIComponent('Calle 64 N 127-32'));
    assert.match(decodeURIComponent(urb.google), /Centro Integrado San Cristóbal, Calle 64 N 127-32, Medellín/);
    assert.ok(enlacesEspecial({ ruta: 'Juan Pablo II', dir: 'Carrera 70 con Calle 18' }).mapa);
    const rural = enlacesEspecial({ ruta: 'Sede de San Cristóbal "La Granja"', dir: 'Vía al Mar Km 7' });
    assert.equal(rural.mapa, '');
    assert.match(decodeURIComponent(rural.google), /La Granja", Vía al Mar Km 7, Medellín/);
    assert.deepEqual(enlacesEspecial({ ruta: '', dir: '' }), { mapa: '', google: '' });
});
