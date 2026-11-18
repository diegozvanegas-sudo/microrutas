// Reportes de árboles en «Posibles hallazgos»: formato fijo para WhatsApp, solo se llena la dirección. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALLAZGOS, buscarHallazgos, mensajeHallazgo, hallazgoEnLinea, hallazgosArbol } from '../src/subsanaciones/hallazgos.js';

const porTitulo = (t) => HALLAZGOS.findIndex((h) => h.t === '🌳 ' + t);

test('árboles: el formato del usuario sale igual, con la dirección puesta', () => {
    assert.equal(mensajeHallazgo(porTitulo('Árbol muerto en pie'), ' Cra 50 # 30-20 '),
        '* Especie: N/A\n* Código: SAU N/A\n* Novedad: Árbol muerto en pie\n* Dirección: Cra 50 # 30-20');
    assert.equal(mensajeHallazgo(porTitulo('Rama fracturada'), ''),
        '* Especie: N/A\n* Código: SAU N/A\n* Novedad: Árbol presenta una rama fracturada y requiere intervención\n* Dirección: ');
});

test('árboles: están los pedidos y todos tienen el formato con {dir}', () => {
    const arb = hallazgosArbol();
    assert.ok(arb.length >= 10);
    ['Árbol muerto en pie', 'Árbol volcado vivo', 'Árbol caído', 'Rama fracturada'].forEach((t) => assert.ok(arb.includes(porTitulo(t)), t));
    arb.forEach((i) => assert.match(HALLAZGOS[i].m, /^\* Especie: N\/A\n\* Código: SAU N\/A\n\* Novedad: .+\n\* Dirección: \{dir\}$/));
    const titulos = HALLAZGOS.map((h) => h.t);
    assert.equal(new Set(titulos).size, titulos.length);
});

test('árboles: los demás mensajes no cambian con la dirección', () => {
    assert.equal(mensajeHallazgo(0, 'Cra 50'), HALLAZGOS[0].m);
    assert.equal(hallazgoEnLinea(0, 'Cra 50'), HALLAZGOS[0].m);
});

test('árboles: en la observación va en una línea', () => {
    assert.equal(hallazgoEnLinea(porTitulo('Árbol volcado vivo'), 'Cra 50'), 'Reporte de árbol: Árbol volcado vivo, en Cra 50.');
    assert.equal(hallazgoEnLinea(porTitulo('Árbol caído'), ''), 'Reporte de árbol: Árbol caído.');
});

test('árboles: se encuentran por palabra', () => {
    const t = (q) => buscarHallazgos(q, true).map((i) => HALLAZGOS[i].t);
    assert.equal(t('muerto en pie')[0], '🌳 Árbol muerto en pie');
    assert.equal(t('volcado')[0], '🌳 Árbol volcado vivo');
    assert.equal(t('rama fracturada')[0], '🌳 Rama fracturada');
    assert.ok(t('cables').includes('🌳 Ramas sobre redes eléctricas'));
});
