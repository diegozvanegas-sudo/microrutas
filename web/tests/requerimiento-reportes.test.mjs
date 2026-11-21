// Requerimiento automático + reportes de ejecución del contratista (📊 Cruce): a cada visita lista se le busca si el
// contratista la reportó como ejecutada, y la evidencia «Reportes de ejecución» sale llena. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reporteDe, conReportes, candidatas, armar, armarArboles, EVID_REPORTE, EVID_ENVIO } from '../src/requerimiento/listos.js';

const REPORTES = [
    { fecha: '2026-11-03', cuad: '2', items: [{ mr: 'Z2CC0271', lote: '491' }, { mr: 'Z2CC0300', lote: '521' }] },
    { fecha: '2026-11-05', cuad: '2', items: [{ mr: 'z2cc271', lote: '491' }] },          // mal escrito: igual se reconoce
    { fecha: '2026-11-12', cuad: '2', items: [{ mr: 'Z2CC0271', lote: '491' }] },          // después de la visita: no cuenta
    { fecha: '2026-09-01', cuad: '4', items: [{ mr: 'Z4CC0010', lote: '10' }] }            // de otro ciclo (más de 45 días)
];

test('reporteDe: el del día de ejecución manda; si no, el último antes de la visita (hasta 45 días)', () => {
    assert.deepEqual(reporteDe({ mr: 'Z2CC0271', fecha: '2026-11-10', ejec: '2026-11-03' }, REPORTES), { fecha: '2026-11-03', cuad: '2' });
    assert.deepEqual(reporteDe({ mr: 'Z2CC0271', fecha: '2026-11-10', ejec: '' }, REPORTES), { fecha: '2026-11-05', cuad: '2' });
    assert.deepEqual(reporteDe({ mr: 'Z2CC0300', fecha: '2026-11-10' }, REPORTES), { fecha: '2026-11-03', cuad: '2' });
    assert.equal(reporteDe({ mr: 'Z4CC0010', fecha: '2026-11-10' }, REPORTES), null);
    assert.equal(reporteDe({ mr: 'Z9CC0001', fecha: '2026-11-10' }, REPORTES), null);
    assert.equal(reporteDe({ mr: '', fecha: '2026-11-10' }, REPORTES), null);
    assert.equal(reporteDe({ mr: 'Z2CC0271', fecha: '2026-11-10' }, null), null);
});

const visita = (id, mr, lote, fecha, estado, obs) => ({ ID: id, MICRORRUTA: mr, LOTE: lote, CUADRILLA: '2', ZONA: '2', 'FECHA DE LA VISITA': fecha,
    'FECHA DE EJECUCIÓN': '', ESTADO: estado, 'OBSERVACIONES NOVEDADES': obs || '', BORDEO: 'NO' });
const itemsNo = (r) => ['BORDEO'].filter((i) => r[i] === 'NO');

test('armar: la evidencia de reportes sale llena y el no realizado reportado como hecho se dice así', () => {
    const lista = conReportes(candidatas([
        visita('SUB-1', 'Z2CC0271', '491', '2026-11-04', 'PENDIENTE', 'LOTE NO REALIZADO'),
        visita('SUB-2', 'Z2CC0300', '521', '2026-11-04', 'PENDIENTE'),
        visita('SUB-3', 'Z4CC0010', '10', '2026-11-04', 'PENDIENTE')
    ], '2026-11-14', itemsNo), REPORTES);
    assert.equal(lista.length, 3);
    const nr = lista.find((v) => v.id === 'SUB-1');
    assert.equal(nr.tipo, 'norealizado');
    assert.deepEqual(nr.reporte, { fecha: '2026-11-03', cuad: '2' });
    assert.equal(lista.find((v) => v.id === 'SUB-3').reporte, null);

    const d = armar(lista, { evidencias: [] }, '2026-11-14');
    const rep = d.evidencias.find((e) => e.titulo === EVID_REPORTE).texto.split('\n');
    assert.deepEqual(rep, [
        'Z2CC0271 (491): reportado por el contratista como ejecutado el 03/11/2026 (cuadrilla 2); en la visita del 04/11/2026 se encontró no realizado.',
        'Z2CC0300 (521): reportado por el contratista como ejecutado el 03/11/2026 (cuadrilla 2).'
    ]);
    const envio = d.evidencias.find((e) => e.titulo === EVID_ENVIO).texto;
    assert.match(envio, /Z2CC0271 \(491\): reportado como ejecutado y encontrado no realizado el 04\/11\/2026/);
    // Sin reportes cargados todo sale como antes: la evidencia de reportes vacía
    const sin = armar(candidatas([visita('SUB-2', 'Z2CC0300', '521', '2026-11-04', 'PENDIENTE')], '2026-11-14', itemsNo), { evidencias: [] }, '2026-11-14');
    assert.equal(sin.evidencias.find((e) => e.titulo === EVID_REPORTE).texto, '');
});

test('armarArboles: también lleva el reporte de ejecución', () => {
    const v = { id: 'SUB-9', clave: 'SUB-9', noSubsanable: true, mr: 'Z2CC0300', lote: '521', fecha: '2026-11-04', novedades: ['AFECTACIÓN A ÁRBOLES'], reporte: { fecha: '2026-11-03', cuad: '2' } };
    const d = armarArboles([v], { evidencias: [] }, '2026-11-14');
    assert.equal(d.evidencias.find((e) => e.titulo === EVID_REPORTE).texto, 'Z2CC0300 (521): reportado por el contratista como ejecutado el 03/11/2026 (cuadrilla 2).');
});
