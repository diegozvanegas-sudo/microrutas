import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordenadasMarca, fechaMarca } from '../src/subsanaciones/marcaagua.js';

// Textos reales que sacó el lector de los sellos de fotos pasadas por WhatsApp (lote 118, 4 nov 2026)
test('coordenadas del sello, limpias', () => {
    assert.deepEqual(coordenadasMarca('4 nov 2026 15:50:22\n6.27938N 75.56534W\nAranjuez'), { lat: 6.27938, lon: -75.56534 });
});
test('coordenadas con el ruido del lector', () => {
    assert.deepEqual(coordenadasMarca('. : — » * ~6,.27899N 75.56525W:'), { lat: 6.27899, lon: -75.56525 });
    assert.deepEqual(coordenadasMarca('oe Ze 6 28044N 75.56533W'), { lat: 6.28044, lon: -75.56533 });
    assert.deepEqual(coordenadasMarca(', 6.27884N /5.56504W'), { lat: 6.27884, lon: -75.56504 });
    assert.deepEqual(coordenadasMarca('6.27884 N 75.56504 W'), { lat: 6.27884, lon: -75.56504 });
    assert.deepEqual(coordenadasMarca('6.27884N 7S.56504W'), { lat: 6.27884, lon: -75.56504 });
});
test('coordenadas con signo', () => {
    assert.deepEqual(coordenadasMarca('6.27938, -75.56534'), { lat: 6.27938, lon: -75.56534 });
});
test('lo que no se lee bien o cae fuera de la zona no se toma', () => {
    assert.equal(coordenadasMarca('he Ky Wop dh 6.25099 N 75.565%'), null);       // longitud cortada
    assert.equal(coordenadasMarca('4.71100N 74.07210W'), null);                     // Bogotá
    assert.equal(coordenadasMarca('# 85-21 Carrera.53a'), null);
    assert.equal(coordenadasMarca(''), null);
});
test('fecha y hora del sello', () => {
    assert.equal(fechaMarca('4 nov 2026 15:50:22'), '2026-11-04 15:50:22');
    assert.equal(fechaMarca('14 NOV. 2026 7:05'), '2026-11-14 07:05:00');
    assert.equal(fechaMarca('_ nov 2026 15: 51: 48'), null);                        // falta el día
    assert.equal(fechaMarca('4 nov 2026 25:61'), null);
    assert.equal(fechaMarca('4 nov 2020 19:04'), null);                               // año mal leído
});
