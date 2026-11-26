import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carpetaFila, nombreNuevo, metaDeMedios, rutasDe, sobrantes, contarFotos, crearFotosDescuento } from '../src/descuentos/fotosguardadas.js';
import { aFila, deFila } from '../src/descuentos/descuentos.js';

test('fotos de descuentos: carpeta por lote y nombres únicos sin tildes ni espacios', () => {
    assert.equal(carpetaFila('9b2c-11', { mr: 'Z1CC0055', lote: '61' }), '9b2c-11/z1cc0055-61');
    assert.equal(carpetaFila('x', { mr: 'Z1CC0055', lote: '' }), 'x/z1cc0055-na');
    var a = nombreNuevo(1700000000000, 0), b = nombreNuevo(1700000000000, 0);
    assert.match(a, /^[a-z0-9]+-0-[a-z0-9]+\.jpg$/);
    assert.notEqual(a, b);
});

test('fotos de descuentos: lo que se guarda en la fila y lo que se borra', () => {
    var md = { fotos: [{ ruta: 'd/l/1.jpg', pie: 'Malla', bytes: new Uint8Array(1) }, { bytes: new Uint8Array(1), pie: 'sin subir' }, { ruta: 'd/l/3.jpg', falta: true }],
        actual: { propia: true, ruta: 'd/l/a.jpg' }, descontar: { propia: false, ruta: 'no' } };
    assert.deepEqual(metaDeMedios(md), { fotos: [{ ruta: 'd/l/1.jpg', pie: 'Malla' }, { ruta: 'd/l/3.jpg', pie: '' }], imgActual: 'd/l/a.jpg', imgDescontar: '' });
    var filas = [{ fotos: [{ ruta: 'a' }, { ruta: 'b' }], imgActual: 'c' }, { fotos: [{ ruta: 'd' }], imgDescontar: 'a' }];
    assert.deepEqual(rutasDe(filas), ['a', 'b', 'c', 'd']);
    assert.equal(contarFotos(filas), 3);
    // Se quitó la foto b y el segundo lote entero
    assert.deepEqual(sobrantes(rutasDe(filas), rutasDe([{ fotos: [{ ruta: 'a' }], imgActual: 'c' }])), ['b', 'd']);
    assert.deepEqual(sobrantes([], ['a']), []);
});

test('fotos de descuentos: la fila de la base guarda rutas y pies, no los bytes', () => {
    var d = { id: 'x', tipo: 'cerramiento', fecha: '2026-11-26', filas: [{ mr: 'Z1CC0055', lote: '61', areaBase: 1254, todo: true, dibujo: [],
        fotos: [{ ruta: 'x/z1cc0055-61/1.jpg', pie: 'Portón', bytes: new Uint8Array(5) }, { pie: 'sin ruta' }], imgActual: 'x/z1cc0055-61/a.jpg' }] };
    var f = aFila(d).filas[0];
    assert.deepEqual(f.fotos, [{ ruta: 'x/z1cc0055-61/1.jpg', pie: 'Portón' }]);
    assert.equal(f.imgActual, 'x/z1cc0055-61/a.jpg');
    assert.equal(f.imgDescontar, '');
    assert.deepEqual(deFila(aFila(d)).filas[0].fotos, f.fotos);
});

test('fotos de descuentos: sin el almacenamiento (falta 0032) el error lo dice en palabras', async () => {
    var falso = { storage: { from: function () { return { upload: async function () { return { error: { message: 'Bucket not found' } }; },
        remove: async function () { return { error: null }; }, download: async function () { return { error: { message: 'x' } }; } }; } } };
    var api = crearFotosDescuento(falso);
    await assert.rejects(api.subir('a/b.jpg', new Uint8Array(1)), /0032_fotos_descuentos\.sql/);
    assert.equal(await api.bajar('a/b.jpg'), null);
    await api.borrar([]);
});
