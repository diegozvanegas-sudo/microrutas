import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarRutas, tocaReleer } from '../src/subsanaciones/prerutas.js';

const BASE = [
    { cuadrilla: '2', lote: '400', orden: '1' },
    { cuadrilla: '2', lote: '532', orden: '2' },
    { cuadrilla: '4', lote: '842', orden: '1' },
];

test('sin cambios en este equipo, la pre-ruta es la de la base', () => {
    assert.deepEqual(mezclarRutas(BASE, {}, 1000), BASE);
    assert.deepEqual(mezclarRutas(BASE, undefined, 1000), BASE);
});

test('un cambio viejo de este equipo no le gana a la base (lo hecho desde el otro equipo se ve)', () => {
    const cambios = { 2: { t: 500, filas: [{ cuadrilla: '2', lote: '400', orden: '1' }] } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), BASE);
});

test('la cuadrilla cambiada aquí mientras se leía queda como está aquí; las demás, de la base', () => {
    const cambios = { 2: { t: 1500, filas: [{ cuadrilla: '2', lote: '532', orden: '1' }] } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), [
        { cuadrilla: '4', lote: '842', orden: '1' },
        { cuadrilla: '2', lote: '532', orden: '1' },
    ]);
});

test('un cambio que no se pudo subir se conserva aunque sea viejo; una pre-ruta quitada aquí no reaparece', () => {
    const cambios = { 4: { t: 10, filas: [], pendiente: true } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), BASE.slice(0, 2));
});

test('sin cuadrilla ("") también se respeta', () => {
    const base = [{ cuadrilla: '', lote: '77' }, { cuadrilla: '2', lote: '400' }];
    const cambios = { '': { t: 2000, filas: [{ cuadrilla: '', lote: '78' }] } };
    assert.deepEqual(mezclarRutas(base, cambios, 1000), [{ cuadrilla: '2', lote: '400' }, { cuadrilla: '', lote: '78' }]);
});

test('al volver a la página se relee solo si pasó un rato, no se está leyendo y no hay ventana abierta', () => {
    assert.equal(tocaReleer(100000, 50000, false, false), true);
    assert.equal(tocaReleer(100000, 90000, false, false), false);   // hace 10 s
    assert.equal(tocaReleer(100000, 0, true, false), false);        // ya está leyendo
    assert.equal(tocaReleer(100000, 0, false, true), false);        // formulario abierto
    assert.equal(tocaReleer(100000, 95000, false, false, 5000), true);
});
