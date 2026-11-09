import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodificar, dentro, distanciaBorde, buscarLote, crearUbicador, rotuloLote, leerDatos, CERCA } from '../src/subsanaciones/lotegps.js';

const BASE = new URL('../public/data/', import.meta.url);
const traer = (ruta) => readFile(new URL(ruta, BASE), 'utf8');
const ubicar = crearUbicador('rapido/', traer);

// Cuadrado de ~111 m con un hueco en el centro
const CUAD = [[6.2, -75.6], [6.2, -75.599], [6.201, -75.599], [6.201, -75.6]];
const HUECO = [[6.2004, -75.5996], [6.2004, -75.5994], [6.2006, -75.5994], [6.2006, -75.5996]];

test('decodificar: primer par absoluto y luego diferencias', () => {
    assert.deepEqual(decodificar([-75612798, 6280361, -74, 0, -75, 18]), [[6.280361, -75.612798], [6.280361, -75.612872], [6.280379, -75.612947]]);
});
test('dentro: respeta los huecos', () => {
    assert.equal(dentro(6.2002, -75.5998, [CUAD]), true);
    assert.equal(dentro(6.2005, -75.5995, [CUAD]), true);
    assert.equal(dentro(6.2005, -75.5995, [CUAD, HUECO]), false);
    assert.equal(dentro(6.2011, -75.5995, [CUAD]), false);
});
test('distanciaBorde en metros', () => {
    // 0,0001° de latitud ≈ 11 m
    const d = distanciaBorde(6.2011, -75.5995, [CUAD]);
    assert.ok(d > 10 && d < 12.5, String(d));
    assert.ok(distanciaBorde(6.2005, -75.5995, [CUAD]) > 50);
});
test('buscarLote: dentro, cerca o nada', () => {
    const lotes = [{ lote: '7', mr: 'Z1CC0007', cuad: '4', anillos: [CUAD], caja: [6.2, -75.6, 6.201, -75.599] }];
    assert.deepEqual(buscarLote(6.2005, -75.5995, lotes), { lote: '7', mr: 'Z1CC0007', cuad: '4', dist: 0 });
    assert.equal(buscarLote(6.2011, -75.5995, lotes).dist, 11);
    assert.equal(buscarLote(6.2015, -75.5995, lotes), null); // ~55 m
});
test('rotuloLote', () => {
    assert.equal(rotuloLote({ mr: 'Z1CC0100', lote: '110' }), 'Z1CC0100 · Lote 110');
    assert.equal(rotuloLote({ mr: 'Z2CC0339', lote: '' }), 'Z2CC0339');
    assert.equal(rotuloLote(null), '');
});

test('con los datos reales: el ejemplo Z1CC0100 lote 110', async () => {
    const centros = leerDatos(await traer('centros_lotes.js'));
    const [lat, lon] = centros['110'];
    const x = await ubicar(lat, lon);
    assert.equal(x.mr, 'Z1CC0100');
    assert.equal(x.lote, '110');
    assert.equal(x.dist, 0);
});
test('con los datos reales: el punto interior de cada lote cae en su lote', async () => {
    const centros = leerDatos(await traer('centros_lotes.js')), malos = [];
    const ids = Object.keys(centros);
    for (const id of ids) {
        const x = await ubicar(centros[id][0], centros[id][1]);
        // El id es el número de lote o, si no tiene, la microrruta
        if (!x || (x.lote !== id && x.mr !== id)) malos.push(id + ' → ' + (x ? rotuloLote(x) + ' a ' + x.dist + ' m' : 'nada'));
    }
    // Lotes que se montan unos sobre otros pueden dar el vecino: se tolera muy poco
    assert.ok(malos.length <= ids.length * 0.02, malos.length + ' de ' + ids.length + ':\n' + malos.slice(0, 30).join('\n'));
});
test('con los datos reales: lejos de todo no hay lote', async () => {
    assert.equal(await ubicar(4.711, -74.0721), null); // Bogotá
    assert.equal(await ubicar(0, 0), null);
});
test('CERCA es la tolerancia del GPS del celular', () => { assert.equal(CERCA, 30); });
