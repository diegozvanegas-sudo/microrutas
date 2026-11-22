// Pruebas de drive.js (lo que no habla con Google). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreCarpeta, conectado } from '../src/drive.js';
test('carpeta del día y sin sesión al arrancar', () => {
    assert.equal(nombreCarpeta('2026-11-23'), 'Instrumentos 23-11-2026');
    assert.equal(conectado(), false);
});
