// Pruebas de la sesión guardada: entre varias copias se usa la más reciente.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sesionMasReciente } from '../src/almacen.js';

const vieja = JSON.stringify({ refresh_token: 'a', expires_at: 100 });
const nueva = JSON.stringify({ refresh_token: 'b', expires_at: 200 });

test('sesión: gana la que vence más tarde, venga de donde venga', () => {
    assert.equal(sesionMasReciente([vieja, nueva]), nueva);
    assert.equal(sesionMasReciente([nueva, vieja]), nueva);
    assert.equal(sesionMasReciente([undefined, null, vieja, nueva, null]), nueva);
});
test('sesión: sin copias no hay nada', () => {
    assert.equal(sesionMasReciente([undefined, null]), null);
});
test('sesión: los valores que no son JSON se devuelven igual', () => {
    assert.equal(sesionMasReciente([null, 'verificador-pkce']), 'verificador-pkce');
});
