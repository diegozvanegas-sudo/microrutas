// Pruebas de drive.js (lo que no habla con Google). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreCarpeta, nombreDia, carpetaPrincipal, conectado, PRINCIPAL } from '../src/drive.js';
test('carpeta principal y una por día; sin sesión al arrancar', () => {
    assert.equal(carpetaPrincipal(), PRINCIPAL);
    assert.equal(nombreDia('2026-11-23'), '23-11-2026');
    assert.equal(nombreCarpeta('2026-11-23'), 'Instrumentos interventoría › 23-11-2026');
    assert.equal(conectado(), false);
});
