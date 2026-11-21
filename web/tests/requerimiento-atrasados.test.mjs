// Lotes atrasados del 📊 Cruce en «⏰ Listos para requerimiento»: programados, ya pasó su día y sin reporte de ejecución;
// pasan a requerimiento a los 10 días hábiles del día programado. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atrasados, PLAZO_ATRASO, armar, plantillaPara, EVID_ENVIO } from '../src/requerimiento/listos.js';

// Noviembre 2026: la semana 1 empieza el lunes 2 (mismo armado de las pruebas del Cruce)
const lote = (fila, cuad, n, semana, dia, extra) => Object.assign({ fila, cuad, mr: 'Z1CC' + ('000' + n).slice(-4), lote: String(n), dir: '', area: 0, frec: 1, semana, dia, hecho: false, fecha: '', obs: '' }, extra);
const PROG = {
    mes: '2026-11',
    q1: [lote(2, '4', 1, 1, 1), lote(3, '4', 2, 1, 1), lote(4, '4', 3, 1, 2), lote(5, '4', 4, 1, 2), lote(6, '4', 5, 1, 3), lote(7, '4', 6, 1, 3), lote(8, '4', 7, 1, 4), lote(9, '4', 8, null, null),
        lote(10, '2', 20, 1, 1, { hecho: true, fecha: '2026-11-02' }), lote(11, '2', 22, 1, 3)],
    q2: [lote(2, '4', 1, 3, 1)]
};
const rep = (fecha, cuad, ns) => ({ fecha, cuad, items: ns.map((n) => ({ mr: 'Z1CC' + ('000' + n).slice(-4), lote: String(n) })) });
const REPS = [rep('2026-11-02', '4', [1]), rep('2026-11-03', '4', [2, 3]), rep('2026-11-04', '4', [5, 7])];
const HOY = '2026-11-21';   // sábado

test('atrasados: a los 10 días hábiles del día programado; los recientes quedan en plazo', () => {
    assert.equal(PLAZO_ATRASO, 10);
    const { lista } = atrasados(PROG, REPS, [], HOY);
    const por = Object.fromEntries(lista.map((v) => [v.lote + '-Q' + v.q, v]));
    assert.deepEqual(Object.keys(por).sort(), ['1-Q2', '4-Q1', '6-Q1']);
    // Lote 4: programado el martes 3/11; del 4 al 21 son 15 hábiles (el lunes 16 es festivo)
    assert.equal(por['4-Q1'].fecha, '2026-11-03');
    assert.equal(por['4-Q1'].dias, 15);
    assert.equal(por['4-Q1'].listo, true);
    assert.equal(por['4-Q1'].cumple, '2026-11-14');
    assert.equal(por['4-Q1'].tipo, 'atrasado');
    assert.equal(por['4-Q1'].cuad, '4');
    // Q2: programado el lunes 16/11 (festivo en Colombia, pero así está en el Excel): 5 hábiles, faltan 5
    assert.equal(por['1-Q2'].listo, false);
    assert.equal(por['1-Q2'].faltan, 5);
    assert.equal(por['1-Q2'].preaviso, false);
    assert.match(por['4-Q1'].id, /^ATR-2026-11-Q1-Z1CC0004$/);
});

test('atrasados: la cuadrilla sin reportes en el mes no se cuenta (se avisa); el lote ya visitado tampoco', () => {
    const r = atrasados(PROG, REPS, [{ ID: 'SUB-1', TIPO: 'EJECUCIÓN', MICRORRUTA: 'Z1CC0006', 'FECHA DE LA VISITA': '10/11/2026' }], HOY);
    assert.equal(r.lista.some((v) => v.lote === '6'), false);
    assert.equal(r.lista.some((v) => v.cuad === '2'), false);
    assert.deepEqual(r.sinReportes, [{ cuad: '2', lotes: 1 }]);
    // Una visita de antes del día programado no cuenta
    const r2 = atrasados(PROG, REPS, [{ ID: 'SUB-2', TIPO: 'EJECUCIÓN', MICRORRUTA: 'Z1CC0006', 'FECHA DE LA VISITA': '01/11/2026' }], HOY);
    assert.equal(r2.lista.some((v) => v.lote === '6'), true);
    // Sin programación o sin ningún reporte: nada (y todas las cuadrillas avisadas)
    assert.deepEqual(atrasados(null, REPS, [], HOY), { lista: [], sinReportes: [] });
    const r3 = atrasados(PROG, [], [], HOY);
    assert.equal(r3.lista.length, 0);
    assert.deepEqual(r3.sinReportes.map((c) => c.cuad), ['2', '4']);
});

test('armar con atrasados: «Microrrutas no ejecutadas», la línea de envío y la plantilla de no ejecutadas', () => {
    const v = atrasados(PROG, REPS, [], HOY).lista.filter((x) => x.listo);
    const d = armar(v, { evidencias: [] }, HOY);
    assert.equal(d.asunto, 'Microrrutas no ejecutadas · cuadrilla 4');
    assert.match(d.evidencias.find((e) => e.titulo === EVID_ENVIO).texto, /Z1CC0004 \(4\): programada para el 03\/11\/2026 \(Q1\); 15 días hábiles sin reporte de ejecución\./);
    assert.deepEqual(d.novedades[0].tipos, ['Microrruta programada sin ejecutar']);
    assert.equal(plantillaPara(v, [{ id: 'p1', nombre: 'Microrrutas no ejecutadas', asunto: '' }, { id: 'p2', nombre: 'Posoperación sin corrección', asunto: '' }]), 'p1');
});
