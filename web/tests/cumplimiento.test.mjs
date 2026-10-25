import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumplimiento, ejecuciones } from '../src/subsanaciones/cumplimiento.js';

const LOTES = {
    Z1CC0001: { lote: '1', frec: 'Mensual', cuad: '4' },
    Z1CC0002: { lote: '2', frec: 'Quincenal', cuad: '4' },
    Z2CC0003: { lote: '3', frec: 'Mensual', cuad: '2' }
};
const v = (o) => ({ ID: 'X', TIPO: 'EJECUCIÓN', ...o });

test('cuenta ejecuciones por lote o microrruta, sin operación ni lotes cerrados', () => {
    const ej = ejecuciones([
        v({ LOTE: '1', 'FECHA DE EJECUCIÓN': '20/10/2026', 'FECHA DE LA VISITA': '21/10/2026' }),
        v({ LOTE: '1', 'FECHA DE EJECUCIÓN': '20/10/2026' }), // misma ejecución, otra visita
        v({ MICRORRUTA: 'z1cc0002', LOTE: 'NA', 'FECHA DE LA VISITA': '05/10/2026' }),
        v({ LOTE: '3', 'FECHA DE EJECUCIÓN': '10/10/2026', 'OBSERVACIONES NOVEDADES': 'LOTE CERRADO' }),
        { ID: 'OPE-1', TIPO: 'OPERACIÓN', LOTE: '3', 'FECHA DE LA VISITA': '10/10/2026' }
    ], LOTES);
    assert.deepEqual(ej, { Z1CC0001: ['2026-10-20'], Z1CC0002: ['2026-10-05'] });
});

test('programadas según la frecuencia y estado al día por cuadrilla', () => {
    const r = cumplimiento([
        v({ LOTE: '1', 'FECHA DE EJECUCIÓN': '20/10/2026' }),
        v({ LOTE: '2', 'FECHA DE EJECUCIÓN': '01/10/2026' }),
        v({ LOTE: '2', 'FECHA DE EJECUCIÓN': '02/10/2026' }),
        v({ LOTE: '2', 'FECHA DE EJECUCIÓN': '03/10/2026' }) // la tercera no suma: quincenal pide 2
    ], LOTES, '2026-10', '2026-10-25');
    const c4 = r.filas.find((f) => f.cuad === '4'), c2 = r.filas.find((f) => f.cuad === '2');
    assert.deepEqual([c4.programadas, c4.ejecutadas, c4.aldia, c4.vencidos], [3, 3, 1, 1]);
    assert.deepEqual([c2.programadas, c2.ejecutadas, c2.sin], [1, 0, 1]);
    assert.equal(r.filas[0].cuad, '2');
    assert.deepEqual([r.total.programadas, r.total.ejecutadas], [4, 3]);
});
