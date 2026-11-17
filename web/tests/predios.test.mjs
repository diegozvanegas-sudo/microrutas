// Mapa rápido · predios del catastro (public/js/predios.js): CBML, cruce con bienes del municipio y texto del reporte.
// Datos inventados y sin red. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

globalThis.window = globalThis;
createRequire(import.meta.url)('../public/js/predios.js');
const P = globalThis.predios;

// Cuadrado de lado «m» metros con la esquina suroeste en (x0, y0) en grados, como GeoJSON [lng, lat]
const LAT = 6.285, FX = 111320 * Math.cos(LAT * Math.PI / 180), FY = 110574;
const cuadro = (x0m, y0m, ancho, alto = ancho) => {
    const g = (x, y) => [-75.597 + x / FX, LAT + y / FY];
    return [[g(x0m, y0m), g(x0m + ancho, y0m), g(x0m + ancho, y0m + alto), g(x0m, y0m + alto), g(x0m, y0m)]];
};
const feature = (polys, props) => ({ type: 'Feature', properties: props, geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => p) } });

test('predios: el CBML se reconoce escrito de varias formas y no se confunde con un lote', () => {
    assert.equal(P.normalizarCbml('07240010011'), '07240010011');
    assert.equal(P.normalizarCbml('CBML 0724-001-0011'), '07240010011');
    assert.equal(P.normalizarCbml(' 0724 001 0011 '), '07240010011');
    assert.equal(P.normalizarCbml('491'), null);
    assert.equal(P.normalizarCbml('072400100111'), null);
});

test('predios: área en m² del polígono, con hueco', () => {
    assert.ok(Math.abs(P.areaM2([cuadro(0, 0, 100)]) - 10000) < 5);
    const conHueco = [[cuadro(0, 0, 100)[0], cuadro(25, 25, 50)[0].slice().reverse()]];
    assert.ok(Math.abs(P.areaM2(conHueco) - 7500) < 5);
});

test('predios: zona verde repartida entre bien del municipio, predio no municipal y vía', () => {
    // Zona verde de 100 × 100 m. El predio A (no municipal) cubre la franja izquierda de 20 m; el predio B, el resto,
    // pero tiene encima un bien del municipio en su mitad de arriba. La franja derecha de 20 m queda fuera de todo predio (vía)
    const zona = [cuadro(0, 0, 100)];
    const lotes = [
        feature([cuadro(-10, -10, 30, 120)], { cbml: '07240010011', area_lote: 32869 }),
        feature([cuadro(20, -10, 60, 120)], { cbml: '07240010007', area_lote: 9000 }),
    ];
    const bienes = [feature([cuadro(20, 50, 60, 60)], { cbml: '07240010007', observaciones: 'Lote A ZV' })];
    const r = P.analizar(zona, lotes, bienes);
    const cerca = (v, esperado, tol) => assert.ok(Math.abs(v - esperado) <= tol, v + ' ≠ ' + esperado);
    cerca(r.total, 10000, 150);
    cerca(r.noMunicipal, 2000 + 3000, 200);   // A completo (20 × 100) + B sin bien (60 × 50)
    cerca(r.municipal, 3000, 150);
    cerca(r.via, 2000, 150);
    assert.deepEqual(r.predios.map((p) => p.cbml), ['07240010007', '07240010011']);
    const txt = P.textoReporte('Z2CC0271 (lote 491)', r);
    assert.match(txt, /los predios CBML 07240010007 \([\d.]+ m²\), 07240010011 \([\d.]+ m²\), que no figuran como bien inmueble del municipio/);
    assert.match(txt, /\(\d+ %\)/);
});

test('predios: los pedacitos de borde no entran al reporte', () => {
    // Zona de 40 × 40 (malla de ~1 m): un predio grande adentro (20 × 40) y uno vecino que solo la roza 1 m (40 m² < 50)
    const zona = [cuadro(0, 0, 40)];
    const lotes = [feature([cuadro(0, 0, 20, 40)], { cbml: '07240010011' }), feature([cuadro(39, 0, 20, 40)], { cbml: '07240010099' })];
    const r = P.analizar(zona, lotes, []);
    assert.deepEqual(r.dudosos.map((p) => p.cbml), ['07240010011']);
    assert.ok(r.bordes > 0 && r.bordes < 200, String(r.bordes));
    const txt = P.textoReporte('Lote 1', r);
    assert.match(txt, /el predio CBML 07240010011, que no figura/);
    assert.doesNotMatch(txt, /07240010099/);
});

test('predios: si todo es del municipio o vía, el texto lo dice sin pedir evaluación', () => {
    const zona = [cuadro(0, 0, 50)];
    const r = P.analizar(zona, [], []);
    assert.equal(r.noMunicipal, 0);
    assert.match(P.textoReporte('Lote 1', r), /bienes del municipio o vía pública/);
});

test('predios: la consulta pide todas las páginas y avisa si quedó incompleta', async () => {
    let llamadas = 0;
    const fetchFalso = (u) => {
        llamadas++;
        const offset = +new URL(u).searchParams.get('resultOffset');
        const features = offset < 2000 ? Array.from({ length: 1000 }, () => feature([cuadro(0, 0, 1)], { cbml: 'x' })) : [feature([cuadro(0, 0, 1)], { cbml: 'y' })];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ features, exceededTransferLimit: offset < 2000 }) });
    };
    const todos = await P.consultar('lotes', { where: '1=1' }, fetchFalso);
    assert.equal(todos.length, 2001);
    assert.equal(llamadas, 3);
    assert.ok(!todos.incompleto);
    await assert.rejects(P.consultar('lotes', {}, () => Promise.resolve({ ok: false, status: 403 })), (e) => /403/.test(e.message) && e.red === true);
    // Sin conexión o servidor que corta: también se marca como falla de red (la página dice «no se pudo consultar»)
    await assert.rejects(P.consultar('lotes', {}, () => Promise.reject(new TypeError('Failed to fetch'))), (e) => e.red === true);
});
