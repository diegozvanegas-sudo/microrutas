// Afectación a árboles: no se puede subsanar. Al subsanar se queda en NO (prueba del daño, va para descuento) y en
// Requerimientos va de una, sin esperar los 8 días hábiles ni mandar pre aviso. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fijarItems, itemsSubsanables, itemsNoSubsanables, soloNoSubsanable, paraDescuento, esNoSubsanable } from '../src/subsanaciones/estado.js';
import { candidatas, armar } from '../src/requerimiento/listos.js';

const ITEMS = ['AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'CORTE DE CESPED: DISPAREJO/ALTURA', 'BORDEO'];
const visita = (id, fecha, enNo, extra) => Object.assign({ ID: id, TIPO: 'EJECUTADO', MICRORRUTA: 'Z2CC0300', LOTE: '521', CUADRILLA: '2', ZONA: '2',
    'FECHA DE LA VISITA': fecha, ESTADO: 'PENDIENTE', 'OBSERVACIONES NOVEDADES': '' },
    Object.fromEntries(ITEMS.map((i) => [i, enNo.indexOf(i) !== -1 ? 'NO' : 'SI'])), extra);
const itemsNo = (r) => ITEMS.filter((i) => r[i] === 'NO');

test('árboles: la afectación (o herida) a árboles no es subsanable; la limpieza manual de árboles sí', () => {
    assert.equal(esNoSubsanable('AFECTACIÓN A ÁRBOLES'), true);
    assert.equal(esNoSubsanable('HERIDAS A ARBOLES'), true);
    assert.equal(esNoSubsanable('LIMPIEZA MANUAL ÁRBOLES'), false);
    assert.equal(esNoSubsanable('BORDEO'), false);
});

test('árboles: al subsanar solo pasan a SI los demás ítems; si es lo único, no hay nada que subsanar', () => {
    fijarItems(ITEMS, []);
    const mixta = visita('SUB-1', '15/11/2026', ['AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'BORDEO']);
    assert.deepEqual(itemsSubsanables(mixta), ['LIMPIEZA MANUAL ÁRBOLES', 'BORDEO']);
    assert.deepEqual(itemsNoSubsanables(mixta), ['AFECTACIÓN A ÁRBOLES']);
    assert.equal(soloNoSubsanable(mixta), false);
    assert.equal(paraDescuento(mixta), true);
    const sola = visita('SUB-2', '15/11/2026', ['AFECTACIÓN A ÁRBOLES']);
    assert.equal(soloNoSubsanable(sola), true);
    assert.equal(soloNoSubsanable(Object.assign({}, sola, { ESTADO: 'SUBSANADO' })), false);
    // Lo que hace «Subsanar ya»: los subsanables a SI; la afectación sigue en NO y la visita sigue para descuento
    const despues = Object.assign({}, mixta);
    itemsSubsanables(mixta).forEach((i) => { despues[i] = 'SI'; });
    assert.equal(despues['AFECTACIÓN A ÁRBOLES'], 'NO');
    assert.equal(paraDescuento(despues), true);
});

test('árboles: en Requerimientos va de una (sin esperar 8 días ni pre aviso) y el texto lo dice', () => {
    const HOY = '2026-11-17';
    const c = candidatas([
        visita('SUB-1', '17/11/2026', ['AFECTACIÓN A ÁRBOLES', 'BORDEO']),   // hoy mismo
        visita('SUB-2', '10/11/2026', ['BORDEO']),                          // 6 días hábiles: pre aviso
    ], HOY, itemsNo);
    const por = Object.fromEntries(c.map((v) => [v.id, v]));
    assert.deepEqual([por['SUB-1'].noSubsanable, por['SUB-1'].listo, por['SUB-1'].preaviso], [true, true, false]);
    assert.deepEqual([por['SUB-2'].noSubsanable, por['SUB-2'].listo, por['SUB-2'].preaviso], [false, false, true]);
    const d = armar([por['SUB-1']], {}, HOY);
    assert.match(d.evidencias[1].texto, /Z2CC0300 \(521\): novedades enviadas el 17\/11\/2026; incluye afectación a árboles, que no es subsanable\./);
});
