// Reportes de árboles en «Posibles hallazgos»: muerto en pie y volcado vivo con formato fijo; lo demás por descripción. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALLAZGOS, buscarHallazgos, mensajeHallazgo, hallazgoEnLinea, hallazgosArbol } from '../src/subsanaciones/hallazgos.js';

const porTitulo = (t) => HALLAZGOS.findIndex((h) => h.t === '🌳 ' + t);

test('árboles: el formato del usuario sale igual, con la dirección puesta', () => {
    assert.equal(mensajeHallazgo(porTitulo('Árbol muerto en pie'), ' Cra 50 # 30-20 '),
        '* Especie: N/A\n* Código: SAU N/A\n* Novedad: Árbol muerto en pie\n* Dirección: Cra 50 # 30-20');
    assert.equal(mensajeHallazgo(porTitulo('Árbol volcado vivo'), ''),
        '* Especie: N/A\n* Código: SAU N/A\n* Novedad: Árbol volcado vivo\n* Dirección: ');
});

test('árboles: el formato fijo es solo para muerto en pie y volcado vivo; lo demás se pide por descripción', () => {
    const conFormato = hallazgosArbol().filter((i) => HALLAZGOS[i].formato).map((i) => HALLAZGOS[i].t);
    assert.deepEqual(conFormato, ['🌳 Árbol muerto en pie', '🌳 Árbol volcado vivo']);
    assert.equal(mensajeHallazgo(porTitulo('Árbol inclinado con riesgo de volcamiento'), 'Cra 50 # 30-20'),
        'Se solicita la evaluación del árbol ubicado en Cra 50 # 30-20: se observa árbol inclinado con riesgo de volcamiento.');
    // Sin dirección se nota qué falta
    assert.equal(mensajeHallazgo(porTitulo('Rama fracturada'), ''),
        'Se solicita la evaluación del árbol ubicado en (dirección): se observa árbol con una rama fracturada.');
    // En la observación de la visita va igual que el mensaje
    assert.equal(hallazgoEnLinea(porTitulo('Rama fracturada'), 'Cra 50'),
        'Se solicita la evaluación del árbol ubicado en Cra 50: se observa árbol con una rama fracturada.');
    hallazgosArbol().filter((i) => !HALLAZGOS[i].formato).forEach((i) => {
        assert.match(HALLAZGOS[i].m, /^Se solicita la evaluación del árbol ubicado en \{dir\}: se observa .+\.$/, HALLAZGOS[i].t);
        assert.doesNotMatch(HALLAZGOS[i].m, /Especie|SAU/, HALLAZGOS[i].t);
    });
});

test('árboles: están los pedidos y todos llevan la dirección {dir}', () => {
    const arb = hallazgosArbol();
    assert.ok(arb.length >= 10);
    ['Árbol muerto en pie', 'Árbol volcado vivo', 'Árbol caído', 'Rama fracturada'].forEach((t) => assert.ok(arb.includes(porTitulo(t)), t));
    arb.forEach((i) => assert.ok(HALLAZGOS[i].m.includes('{dir}'), HALLAZGOS[i].t));
    arb.filter((i) => HALLAZGOS[i].formato).forEach((i) => assert.match(HALLAZGOS[i].m, /^\* Especie: N\/A\n\* Código: SAU N\/A\n\* Novedad: .+\n\* Dirección: \{dir\}$/));
    const titulos = HALLAZGOS.map((h) => h.t);
    assert.equal(new Set(titulos).size, titulos.length);
});

test('árboles: los demás mensajes no cambian con la dirección', () => {
    assert.equal(mensajeHallazgo(0, 'Cra 50'), HALLAZGOS[0].m);
    assert.equal(hallazgoEnLinea(0, 'Cra 50'), HALLAZGOS[0].m);
});

test('árboles: en la observación va en una línea', () => {
    assert.equal(hallazgoEnLinea(porTitulo('Árbol volcado vivo'), 'Cra 50'), 'Reporte de árbol: Árbol volcado vivo, en Cra 50.');
    assert.equal(hallazgoEnLinea(porTitulo('Árbol muerto en pie'), ''), 'Reporte de árbol: Árbol muerto en pie.');
});

test('árboles: se encuentran por palabra', () => {
    const t = (q) => buscarHallazgos(q, true).map((i) => HALLAZGOS[i].t);
    assert.equal(t('muerto en pie')[0], '🌳 Árbol muerto en pie');
    assert.equal(t('volcado')[0], '🌳 Árbol volcado vivo');
    assert.equal(t('rama fracturada')[0], '🌳 Rama fracturada');
    assert.ok(t('cables').includes('🌳 Ramas sobre redes eléctricas'));
});
