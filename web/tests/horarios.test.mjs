// Pruebas de Horarios de rutas: lectura del Excel de horarios (una hoja por zona) y revisión de la H.I y H.F
// del reporte de horas extras (datos inventados, no el archivo real). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hhmm } from '../src/horas/cruce.js';
import { leerHorarios, leerObservacion, horasDe, diasFrecuencia, diaSemana, revisarHorario, textoDias, filaHorario, problemasHorario, compararHorarios } from '../src/horarios/horarios.js';

const hora = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m || 0));
const CAB = [null, 'ITEM', 'Nombre de la Microrruta', 'Macrorruta (nombre o tipo servicio)', 'Frecuencia (veces/semana)', 'Días de la frecuencia', 'HORARIO', 'Turno ', 'OBSERVACIÓN'];

test('horarios: horas, días y observaciones', () => {
    assert.deepEqual(horasDe(hora(6)), [360]);
    assert.deepEqual(horasDe('6:00:00 a. m.- 8:00:00 a. m.'), [360, 480]);
    assert.deepEqual(horasDe('6:00 y 8:00'), [360, 480]);
    assert.deepEqual(diasFrecuencia('1-2-3-4-5-6'), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(diasFrecuencia(7), [7]);
    assert.equal(diaSemana('2026-10-26'), 1);
    assert.equal(diaSemana('2026-11-01'), 7);
    assert.deepEqual(leerObservacion('LOS DIAS JUEVES SALE LA RUTA A LAS 8:00'), { porDia: { 4: 480 }, horas: [] });
    assert.deepEqual(leerObservacion('Miercoles sale a las 6 los sabados a las 8'), { porDia: { 3: 360, 6: 480 }, horas: [] });
    assert.deepEqual(leerObservacion('SAP se despachan a las 5:00'), { porDia: {}, horas: [300] });
    assert.deepEqual(leerObservacion('Pendiente Cambiar PPS Julio 2026'), { porDia: {}, horas: [] });
    assert.equal(textoDias([1, 4]), 'lunes y jueves');
    assert.equal(textoDias([1, 2, 3, 4, 5, 6]), 'lunes a sábado');
});

test('horarios: leer las hojas y revisar la H.I y H.F de cada fila', () => {
    const z1 = [[], CAB,
        [null, 1, 100101, 'Z1LJ', 2, '1-4', hora(6), 1, 'LOS DIAS JUEVES SALE LA RUTA A LAS 8:00'],
        [null, 2, 100201, 'Z1LAS', 6, '1-2-3-4-5-6', hora(21), 3, null]];
    const z2 = [[], CAB, [null, 1, 200301, 'Z2WS', 2, '3-6', '6:00 y 8:00', 1, 'CAMBIA DE HORARIO SEMANAL']];
    const h = leerHorarios([{ nombre: 'ZONA 1', valores: z1 }, { nombre: 'ZONA 2', valores: z2 }, { nombre: 'Vacía', valores: [[]] }]);
    assert.equal(h.n, 3);
    assert.deepEqual([h.rutas['100101'].zona, h.rutas['100101'].horas, h.rutas['100101'].porDia], ['ZONA 1', [360], { 4: 480 }]);

    // Lunes 26/10/2026: sale a las 6:00 → bien; a las 5:00 → H.I y H.F mal
    const bien = revisarHorario({ fecha: '2026-10-26', ruta: '100101', hi: 360, hf: 840 }, h);
    assert.deepEqual([bien.difHi, bien.difHf, bien.fueraDeDia], [false, false, false]);
    const mal = revisarHorario({ fecha: '2026-10-26', ruta: '100101', hi: 300, hf: 780 }, h);
    assert.deepEqual([mal.difHi, mal.difHf, mal.esperadas.map(hhmm)], [true, true, ['06:00']]);
    // Jueves 29/10: ese día sale a las 8:00
    const jueves = revisarHorario({ fecha: '2026-10-29', ruta: '100101', hi: 360, hf: 840 }, h);
    assert.deepEqual([jueves.difHi, jueves.esperadas.map(hhmm)], [true, ['08:00']]);
    // Turno de noche: 21:00 a 5:00
    assert.equal(revisarHorario({ fecha: '2026-10-26', ruta: '100201', hi: 1260, hf: 300 }, h).difHf, false);
    // Varias horas en el HORARIO: cualquiera vale; el lunes no le toca
    const varias = revisarHorario({ fecha: '2026-10-26', ruta: '200301', hi: 480, hf: 960 }, h);
    assert.deepEqual([varias.difHi, varias.difHf, varias.fueraDeDia, varias.dia], [false, false, true, 1]);
    // Ruta que no está en los horarios: no se marca
    assert.deepEqual(revisarHorario({ fecha: '2026-10-26', ruta: '999999', hi: 300, hf: 780 }, h), { horario: null, difHi: false, difHf: false, fueraDeDia: false });
    assert.equal(leerHorarios([{ nombre: 'x', valores: [[], [null, 'otra cosa']] }]), null);
});

test('horarios: una ruta del formulario, sus problemas y la revisión del cargue', () => {
    const f = filaHorario({ ruta: ' 0100101 ', zona: 'ZONA 1', macro: 'Z1LJ', dias: [4, 1, 4], horario: '6:00', turno: '1', obs: 'LOS DIAS JUEVES SALE LA RUTA A LAS 8:00' });
    assert.deepEqual([f.ruta, f.dias, f.horas, f.porDia, f.horarioVer], ['100101', [1, 4], [360], { 4: 480 }, '6:00']);
    assert.equal(filaHorario({ ruta: '' }), null);
    assert.deepEqual(problemasHorario(f), []);
    assert.deepEqual(problemasHorario(filaHorario({ ruta: 1, dias: [1], horario: '', obs: 'el sabado a las 8' })),
        ['sin hora de salida', 'la observación cambia la hora del sábado, que no le toca']);

    // Lo guardado viene de la base: por_dia con claves de texto, sin diferencias por eso
    const antes = { rutas: {
        100101: { ...f, porDia: { '4': 480 } },
        100201: filaHorario({ ruta: 100201, zona: 'ZONA 1', dias: '1-6', horario: '21:00' }),
        100301: filaHorario({ ruta: 100301, zona: 'ZONA 1', dias: '2-5', horario: '6:00' }) } };
    const nuevos = { rutas: {
        100101: f,
        100201: filaHorario({ ruta: 100201, zona: 'ZONA 1', dias: '1-6', horario: '22:00', turno: '3' }),
        200101: filaHorario({ ruta: 200101, zona: 'ZONA 2', dias: '3-6', horario: '6:00' }) } };
    const c = compararHorarios(antes, nuevos);
    assert.equal(c.iguales, 1);
    assert.deepEqual(c.nuevas.map((h) => h.ruta), ['200101']);
    assert.deepEqual(c.quitadas.map((h) => h.ruta), ['100301']);
    assert.deepEqual(c.cambian.map((x) => [x.despues.ruta, x.campos]), [['100201', ['horario', 'turno']]]);
    assert.equal(compararHorarios(null, nuevos).nuevas.length, 3);
});
