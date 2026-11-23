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
test('otra carpeta principal (Subsanaciones)', () => {
    assert.equal(nombreCarpeta('2026-11-23', 'Subsanaciones'), 'Subsanaciones › 23-11-2026');
});
test('emparejar archivos por nombre (reutilizable): claves, requiere, evita y PDF primero', async () => {
    const { palabrasArchivo, emparejarArchivos } = await import('../src/drive.js');
    assert.deepEqual(palabrasArchivo('Z3R17DOM_Parque-Boston_22-11-2026.pdf'), ['Z3R17DOM', 'PARQUE', 'BOSTON', '22', '11', '2026']);
    assert.deepEqual(palabrasArchivo('Parque Boston'), ['PARQUE', 'BOSTON'], 'sin extensión no se corta nada');
    const a = [{ nombre: 'Lote 118 subsanacion.pdf', enlace: 'u1' }, { nombre: 'Lote 118 visita.jpg', enlace: 'u2' }, { nombre: 'Lote 120.pdf', enlace: 'u3' }];
    const r = emparejarArchivos(a, [{ id: 's118', claves: ['118'], requiere: ['SUBSANACION'] }, { id: 'v118', claves: ['118'], evita: [['SUBSANACION']] }, { id: 'x', claves: ['999'] }]);
    assert.deepEqual(r.enlaces, { s118: 'u1', v118: 'u2' });
    assert.deepEqual(r.sinArchivo, ['x']); assert.deepEqual(r.sobran, ['Lote 120.pdf']);
});
