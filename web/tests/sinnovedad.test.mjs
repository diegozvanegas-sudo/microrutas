import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecucionDelMapa, cuadrillaDelMapa } from '../src/subsanaciones/sinnovedad.js';

test('ejecucionDelMapa: fecha del reporte reciente sí; futura, vieja o mal escrita no', () => {
    assert.equal(ejecucionDelMapa('2026-11-25', '2026-11-26'), '2026-11-25');
    assert.equal(ejecucionDelMapa('2026-11-26', '2026-11-26'), '2026-11-26');
    assert.equal(ejecucionDelMapa('2026-11-27', '2026-11-26'), '');      // futura
    assert.equal(ejecucionDelMapa('2026-09-01', '2026-11-26'), '');      // de hace casi 3 meses
    assert.equal(ejecucionDelMapa('2026-02-30', '2026-11-26'), '');      // no existe
    assert.equal(ejecucionDelMapa('25/11/2026', '2026-11-26'), '');
    assert.equal(ejecucionDelMapa('', '2026-11-26'), '');
    assert.equal(ejecucionDelMapa(null, '2026-11-26'), '');
});

test('cuadrillaDelMapa: número de la cuadrilla, con o sin C', () => {
    assert.equal(cuadrillaDelMapa('4'), '4');
    assert.equal(cuadrillaDelMapa('C4'), '4');
    assert.equal(cuadrillaDelMapa('02'), '2');
    assert.equal(cuadrillaDelMapa('cuadrilla 4'), '');
    assert.equal(cuadrillaDelMapa(''), '');
});
