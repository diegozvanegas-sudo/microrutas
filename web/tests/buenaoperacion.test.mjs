import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUENAS, buscarBuenas, donde, mensaje, mensajeVarios } from '../src/subsanaciones/buenaoperacion.js';

test('buena operación: cada mensaje tiene título, palabras, mensaje con {donde} y punto corto', () => {
    assert.ok(BUENAS.length >= 40);
    BUENAS.forEach(function (b) {
        assert.ok(b.g && b.t && b.c && b.p, b.t);
        assert.ok(b.m.includes('{donde}'), b.t);
        assert.ok(b.m.endsWith('✅'), b.t);
    });
    const titulos = BUENAS.map(b => b.t);
    assert.equal(new Set(titulos).size, titulos.length);
});

test('buena operación: el ejemplo del usuario sale igual', () => {
    const i = buscarBuenas('señales seguridad vial')[0];
    assert.equal(mensaje(i, 'las palmas (842)'), 'Al momento se evidencia operación del servicio de corte de césped en las palmas (842) implementando señales de seguridad vial en sus frentes de trabajo y telas de protección. ✅');
});

test('buena operación: dónde', () => {
    assert.equal(donde('Las Palmas (842)'), 'en Las Palmas (842)');
    assert.equal(donde('  '), 'en …');
    assert.equal(donde('sobre la Avenida 80'), 'sobre la Avenida 80');
    assert.equal(donde('en el separador de la 33'), 'en el separador de la 33');
});

test('buena operación: buscar por palabra, sin tildes y por raíz', () => {
    const t = q => buscarBuenas(q).map(i => BUENAS[i].t);
    assert.equal(buscarBuenas('').length, BUENAS.length);
    assert.ok(t('mallas').slice(0, 3).includes('Mallas de protección en uso'));
    assert.equal(t('PMT')[0], 'PMT implementado');
    assert.ok(t('platéo').includes('Plateo bien hecho'));
    assert.ok(t('sopladoras').includes('Uso adecuado de sopladoras'));
    assert.ok(t('lluvia').includes('Suspensión segura por lluvia'));
    assert.deepEqual(buscarBuenas('xyzxyz'), []);
});

test('buena operación: varios en un solo mensaje', () => {
    const a = buscarBuenas('señales seguridad vial')[0], b = buscarBuenas('EPP')[0];
    assert.equal(mensajeVarios([], 'x'), '');
    assert.equal(mensajeVarios([a], 'Las Palmas (842)'), mensaje(a, 'Las Palmas (842)'));
    assert.equal(mensajeVarios([a, b], 'Las Palmas (842)'),
        'Al momento se evidencia operación del servicio de corte de césped en Las Palmas (842), con:\n✅ Señales de seguridad vial en los frentes de trabajo y telas de protección\n✅ Personal con EPP completo');
});
