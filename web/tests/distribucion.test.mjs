// Pruebas de la distribución de horas extras en OD, ON, FD y FN (festivos de Colombia, cambio de día a medianoche).
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribuir, esFestivo, festivos } from '../src/horas/distribucion.js';

const h = (hh, mm) => hh * 60 + (mm || 0);
const sin = (d) => [d.od, d.on, d.fd, d.fn, d.total];

test('distribución: festivos de Colombia 2026 y domingos', () => {
    assert.deepEqual(Object.keys(festivos(2026)).sort(), ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
        '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02',
        '2026-11-16', '2026-12-08', '2026-12-25']);
    assert.equal(esFestivo('2026-11-01'), true);    // domingo
    assert.equal(esFestivo('2026-11-02'), true);    // Todos los Santos, pasa al lunes
    assert.equal(esFestivo('2026-10-26'), false);
});

test('distribución: menos de 36 minutos no hay extra; desde 36 se cuenta exacto', () => {
    // Lunes 26/10/2026, turno 8:00 a 16:00
    assert.deepEqual(sin(distribuir('2026-10-26', h(8), h(16), h(16, 35))), [0, 0, 0, 0, 0]);
    assert.deepEqual(sin(distribuir('2026-10-26', h(8), h(16), h(16, 36))), [36, 0, 0, 0, 36]);
    assert.deepEqual(sin(distribuir('2026-10-26', h(8), h(16), h(18, 47))), [167, 0, 0, 0, 167]);
    // Llegó antes de la H.F o falta un dato
    assert.deepEqual(sin(distribuir('2026-10-26', h(8), h(16), h(15))), [0, 0, 0, 0, 0]);
    assert.equal(distribuir('2026-10-26', h(8), null, h(18)), null);
});

test('distribución: diurna hasta las 19:00 y nocturna desde las 19:00 hasta las 6:00', () => {
    // 10:00 a 18:00, llegó 20:30: 1:00 OD y 1:30 ON
    assert.deepEqual(sin(distribuir('2026-10-26', h(10), h(18), h(20, 30))), [60, 90, 0, 0, 150]);
    // Turno de noche 21:00 a 5:00 (pasa al martes), llegó 6:55: 1:00 ON y 0:55 OD
    assert.deepEqual(sin(distribuir('2026-10-26', h(21), h(5), h(6, 55))), [55, 60, 0, 0, 115]);
});

test('distribución: domingos y festivos, y el cambio de día a medianoche', () => {
    // Sábado 31/10 → domingo 1/11: 23:00 a 1:30 → 1:00 ON (sábado) y 1:30 FN (domingo)
    assert.deepEqual(sin(distribuir('2026-10-31', h(15), h(23), h(1, 30))), [0, 60, 0, 90, 150]);
    // Domingo 1/11 de día: FD y FN
    assert.deepEqual(sin(distribuir('2026-11-01', h(10), h(18), h(20))), [0, 0, 60, 60, 120]);
    // Domingo 8/11 → lunes 9/11 (no festivo): 23:00 a 1:00 → 1:00 FN y 1:00 ON
    assert.deepEqual(sin(distribuir('2026-11-08', h(15), h(23), h(1))), [0, 60, 0, 60, 120]);
    // Domingo 1/11 → lunes 2/11 festivo: todo sigue festivo
    assert.deepEqual(sin(distribuir('2026-11-01', h(21), h(5), h(7))), [0, 0, 60, 60, 120]);
});
