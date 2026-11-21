// Vista 3D del lote en Google Earth (ficha de mapa_rapido.html): enlace inclinado y KML con contorno y vuelo. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encuadre, urlEarth, kmlLote } from '../src/mapa/earth.js';

// Lote de unos 110 × 110 m en Medellín, con un hueco
const anillo = [[6.2500, -75.5600], [6.2510, -75.5600], [6.2510, -75.5590], [6.2500, -75.5590]];
const hueco = [[6.2504, -75.5596], [6.2506, -75.5596], [6.2506, -75.5594]];

test('encuadre: centro de la caja y distancia de cámara con márgenes (250 a 3.000 m)', () => {
    const e = encuadre([[anillo]]);
    assert.deepEqual(e.centro.map((x) => +x.toFixed(4)), [6.2505, -75.5595]);
    assert.ok(e.rango >= 250 && e.rango < 400, 'rango ' + e.rango);
    assert.equal(encuadre([[[[6.25, -75.56], [6.2501, -75.56], [6.25, -75.5599]]]]).rango, 250);
    assert.equal(encuadre([[[[6.1, -75.7], [6.4, -75.7], [6.4, -75.4]]]]).rango, 3000);
    assert.equal(encuadre([]), null);
});

test('urlEarth: Google Earth web mirando el centro, inclinado a 60°', () => {
    assert.equal(urlEarth([6.2505, -75.5595], 320.4), 'https://earth.google.com/web/@6.250500,-75.559500,1500a,320d,35y,0h,60t,0r');
});

test('kmlLote: un polígono cerrado (lng,lat), con hueco, vista inicial y vuelo de una vuelta', () => {
    const k = kmlLote({ nombre: 'Lote 491 <A&B>', descripcion: 'Z2CC0271', poligonos: [[anillo, hueco]] });
    assert.match(k, /^<\?xml/);
    assert.match(k, /<name>Lote 491 &lt;A&amp;B&gt;<\/name>/);
    assert.match(k, /<coordinates>-75\.5600000,6\.2500000,0 .* -75\.5600000,6\.2500000,0<\/coordinates>/);
    assert.equal((k.match(/<innerBoundaryIs>/g) || []).length, 1);
    assert.equal((k.match(/<gx:FlyTo>/g) || []).length, 14);
    assert.match(k, /<heading>360<\/heading>/);
    assert.match(k, /<altitudeMode>clampToGround<\/altitudeMode>/);
    assert.doesNotMatch(k, /MultiGeometry/);
});

test('kmlLote: varios polígonos van en MultiGeometry; sin polígonos no arma nada', () => {
    const otro = anillo.map((p) => [p[0] + 0.002, p[1]]);
    const k = kmlLote({ nombre: 'Lote 1', poligonos: [[anillo], [otro]] });
    assert.equal((k.match(/<Polygon>/g) || []).length, 2);
    assert.match(k, /<MultiGeometry>/);
    assert.equal(kmlLote({ nombre: 'x', poligonos: [] }), '');
});

test('urlEarth: con la altura del terreno la pone 30 m arriba (si queda debajo, Earth pega la cámara al suelo)', () => {
    assert.equal(urlEarth([6.286397, -75.598672], 351, 1785), 'https://earth.google.com/web/@6.286397,-75.598672,1815a,351d,35y,0h,60t,0r');
    assert.match(urlEarth([6.28, -75.59], 351, null), /,1500a,/);
    assert.match(urlEarth([6.28, -75.59], 351, NaN), /,1500a,/);
});

test('alturaTerreno: lee la respuesta de Open-Meteo y sin respuesta devuelve null', async () => {
    const { alturaTerreno } = await import('../src/mapa/earth.js');
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async (u) => { assert.match(u, /latitude=6\.28640&longitude=-75\.59867/); return { ok: true, json: async () => ({ elevation: [1785] }) }; };
        assert.equal(await alturaTerreno([6.286397, -75.598672]), 1785);
        globalThis.fetch = async () => { throw new Error('sin señal'); };
        assert.equal(await alturaTerreno([6.28, -75.59]), null);
        globalThis.fetch = async () => ({ ok: false });
        assert.equal(await alturaTerreno([6.28, -75.59]), null);
    } finally { globalThis.fetch = original; }
});
