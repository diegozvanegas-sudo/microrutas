import { test } from 'node:test';
import assert from 'node:assert/strict';
import { direccionOSM, opcionesDonde, lotesCercanos, posDeUrl, textoCoord } from '../src/subsanaciones/dondeestoy.js';

test('direccionOSM: vía con número y barrio; sin dirección da null', () => {
    assert.deepEqual(direccionOSM({ address: { road: 'Calle 97', house_number: '73-20', neighbourhood: 'Castilla' } }),
        { via: 'Calle 97 #73-20', numero: true, barrio: 'Castilla', dir: 'Calle 97 #73-20, Castilla' });
    assert.equal(direccionOSM({ address: { road: 'Carrera 50' } }).dir, 'Carrera 50');
    assert.equal(direccionOSM({ address: {} }), null);
    assert.equal(direccionOSM(null), null);
});

test('opcionesDonde: con número de casa primero la de OpenStreetMap', () => {
    const ops = opcionesDonde({
        lat: 6.25, lon: -75.56,
        osm: { via: 'Calle 97 #73-20', numero: true, barrio: 'Castilla', dir: 'Calle 97 #73-20, Castilla' },
        lote: { lote: '118', mr: 'Z1CC0108', d: 'Cra 73 x Cl 97', dist: 0 },
        cercanos: [{ lote: '118', mr: 'Z1CC0108', d: 'Cra 73 x Cl 97', dist: 0 }, { lote: '120', mr: 'Z1CC0110', d: 'Cl 98', dist: 84.4 }]
    });
    assert.equal(ops[0].texto, 'Calle 97 #73-20, Castilla');
    assert.equal(ops[1].texto, 'Cra 73 x Cl 97 (Lote 118)');
    assert.ok(ops.some(o => o.texto === 'Calle 97 #73-20, Castilla (6.250000, -75.560000)'));
    assert.ok(ops.some(o => o.texto === '6.250000, -75.560000'));
    // El lote donde está no se repite entre los cercanos
    assert.equal(ops.filter(o => o.texto.includes('Lote 118')).length, 1);
    assert.equal(ops[ops.length - 1].texto, 'Cl 98 (Lote 120)');
    assert.match(ops[ops.length - 1].etiqueta, /a 84 m/);
    assert.equal(new Set(ops.map(o => o.texto)).size, ops.length);
});

test('opcionesDonde: sin número de casa primero el lote; sin nada, las coordenadas', () => {
    const ops = opcionesDonde({ lat: 6.2, lon: -75.5, osm: { via: 'Carrera 50', numero: false, barrio: '', dir: 'Carrera 50' }, lote: { lote: '', mr: 'Z2CC0001', d: '', dist: 12 } });
    assert.equal(ops[0].texto, 'Z2CC0001');
    assert.match(ops[0].etiqueta, /a 12 m/);
    assert.equal(ops[1].texto, 'Carrera 50');
    const solo = opcionesDonde({ lat: 6.2, lon: -75.5, osm: null, lote: null, cercanos: [] });
    assert.deepEqual(solo.map(o => o.texto), ['6.200000, -75.500000']);
});

test('lotesCercanos: ordena, corta por radio y por cantidad', () => {
    const d = { a: 300, b: 50, c: 120, e: Infinity };
    assert.deepEqual(lotesCercanos(Object.keys(d), k => d[k], 2, 250).map(x => x.id), ['b', 'c']);
    assert.deepEqual(lotesCercanos(Object.keys(d), k => d[k], 5, 40), []);
});

test('posDeUrl y textoCoord', () => {
    assert.deepEqual(posDeUrl(new URLSearchParams('lat=6.25&lng=-75.56&prec=8')), { lat: 6.25, lon: -75.56, prec: 8 });
    assert.equal(posDeUrl(new URLSearchParams('herramienta=hallazgos')), null);
    assert.equal(posDeUrl(new URLSearchParams('lat=abc&lng=1')), null);
    assert.equal(posDeUrl(new URLSearchParams('lat=6.2&lng=-75.5')).prec, null);
    assert.equal(textoCoord(6.2, -75.5), '6.200000, -75.500000');
});
