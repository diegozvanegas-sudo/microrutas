import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiempos } from '../src/subsanaciones/auditoria.js';

test('auditar ZIP: tiempo, velocidad y cuánto falta', () => {
    const ini = '2026-11-10T10:00:00', ahora = Date.parse('2026-11-10T10:10:00');
    assert.equal(tiempos({ inicio: ini, actual: 300, total: 900 }, ahora), '⏱ Lleva 10 min · 30 fotos/min · faltan ~20 min');
    assert.equal(tiempos({ inicio: ini, actual: 5, total: 900 }, Date.parse('2026-11-10T10:00:10')), '⏱ Lleva 10 s');
    assert.equal(tiempos({ inicio: ini, fin: '2026-11-10T11:30:00', actual: 900, total: 900 }), '⏱ Duró 1 h 30 min · 10 fotos/min');
    assert.equal(tiempos({ inicio: ini, actual: 4, total: 900 }, ahora), '⏱ Lleva 10 min · 0,4 fotos/min · faltan ~37 h 20 min');
    assert.equal(tiempos({ inicio: '' }), '');
});
