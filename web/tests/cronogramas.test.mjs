// Cronogramas de recorrido: días, lectura de la tabla, guía del mapa y trazado sobre calles. Datos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasDe, leerCronogramas, delDia, cuentas, guiaParaMapa, textoDia } from '../src/cronogramas/datos.js';
import { norm, dentro, simplificar, largo, indiceVias, trazar } from '../tools/generar_cronograma.mjs';

test('diasDe: frecuencias escritas a mano', () => {
    assert.deepEqual(diasDe('Lunes y Sábado'), [1, 6]);
    assert.deepEqual(diasDe('Jueves y sabado'), [4, 6]);
    assert.deepEqual(diasDe('Todos los días'), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(diasDe('Lunes a viernes'), [1, 2, 3, 4, 5]);
    assert.deepEqual(diasDe('Viernes a lunes'), [0, 1, 5, 6]);
    assert.deepEqual(diasDe(''), []);
});

const FILAS = [
    { id: 'c1-directrices', orden: 3, tipo: 'lista', titulo: 'Directrices', items: [{ clave: 'Regla', t: 'Texto de la regla.' }] },
    { id: 'c1', orden: 1, tipo: 'tabla', titulo: 'Cronograma uno · por zona', icono: '🛞', items: [
        { clave: 'Zona 1', zona: '1', frecuencia: 'Lunes y Sábado', t: 'Sector A.', trazo: null },
        { clave: 'Zona 1', zona: '1', frecuencia: 'Lunes y Sábado', t: 'Vía B.', trazo: { g: [[[6.2, -75.5], [6.21, -75.5]]], estado: 'calles' } },
        { clave: 'Zona 7', zona: '7', frecuencia: 'Todos los días', t: 'Vía C.', trazo: { g: [[[6.25, -75.56], [6.26, -75.56]]], estado: 'aprox', nota: 'un solo límite' } },
        { clave: 'Zona 7', zona: '7', frecuencia: 'Todos los días', t: 'Por ubicar.', trazo: null, pendiente: 'No se sabe dónde.' }] },
];
test('leerCronogramas: agrupa por zona y frecuencia, con sus directrices', () => {
    const c = leerCronogramas(FILAS);
    assert.equal(c.length, 1);
    assert.equal(c[0].zonas.length, 2);
    assert.deepEqual(c[0].zonas[0].dias, [1, 6]);
    assert.equal(c[0].zonas[1].sectores[1].pendiente, 'No se sabe dónde.');
    assert.deepEqual(c[0].directrices, [{ clave: 'Regla', t: 'Texto de la regla.' }]);
    assert.equal(delDia(c[0], 1).length, 2);
    assert.equal(delDia(c[0], 3).length, 1);
    assert.equal(delDia(c[0], null).length, 2);
    assert.deepEqual(cuentas(c[0]), { total: 4, calles: 1, aprox: 1, sin: 2 });
});
test('guiaParaMapa y texto para WhatsApp', () => {
    const c = leerCronogramas(FILAS), g = guiaParaMapa(c, '2026-11-11');
    assert.equal(g.actualizado, '2026-11-11');
    assert.equal(g.cronogramas[0].lineas.length, 2);            // solo los sectores con línea
    assert.deepEqual(g.cronogramas[0].lineas[1], { z: '7', f: 'Todos los días', d: [0, 1, 2, 3, 4, 5, 6], t: 'Vía C.', e: 'aprox', n: 'un solo límite', g: [[[6.25, -75.56], [6.26, -75.56]]] });
    const t = textoDia(c[0], 3);
    assert.ok(t.includes('Miércoles') && t.includes('*Zona 7*') && !t.includes('Zona 1'));
    assert.ok(textoDia({ titulo: 'X', zonas: [] }, 2).includes('No hay recorridos'));
});

test('trazado: utilidades geométricas', () => {
    assert.equal(norm('Avenida del Ferrocarril'), norm('avenida ferrocarril'));
    assert.equal(norm('Palacé'), 'palace');
    const cuadro = [[0, 0], [0, 1], [1, 1], [1, 0]];
    assert.ok(dentro([0.5, 0.5], cuadro));
    assert.ok(!dentro([1.5, 0.5], cuadro));
    const recta = [[6.2, -75.5], [6.2005, -75.5], [6.201, -75.5]];
    assert.equal(simplificar(recta, 4).length, 2);
    assert.ok(Math.abs(largo(recta) - 110.5) < 1);
});

// Calles de prueba: una vía norte-sur (Carrera 1, alias «Avenida Uno») cruzada por la Calle 10 y la Calle 20
const lat = (k) => 6.2 + k * 0.001;
const vias = [
    { type: 'way', tags: { name: 'Carrera 1', alt_name: 'Avenida Uno' }, geometry: Array.from({ length: 31 }, (_, k) => ({ lat: lat(k), lon: -75.5 })) },
    { type: 'way', tags: { name: 'Calle 10' }, geometry: [{ lat: lat(10), lon: -75.502 }, { lat: lat(10), lon: -75.498 }] },
    { type: 'way', tags: { name: 'Calle 20' }, geometry: [{ lat: lat(20), lon: -75.502 }, { lat: lat(20), lon: -75.498 }] },
];
test('trazar: entre dos cruces, con un solo límite y sentido, y por nombre alterno', () => {
    const idx = indiceVias(vias);
    const entre = trazar({ via: 'Avenida Uno', desde: 'Calle 10', hasta: 'Calle 20' }, null, idx);
    assert.equal(entre.estado, 'calles');
    assert.ok(Math.abs(entre.m - 1105) < 30, String(entre.m));
    const pts = entre.g.flat();
    assert.ok(pts.every(p => p[0] >= lat(10) - 1e-6 && p[0] <= lat(20) + 1e-6));
    const sur = trazar({ via: 'Carrera 1', desde: 'Calle 10', sentido: 'sur' }, null, idx);
    assert.equal(sur.estado, 'aprox');                           // un solo límite: hay que revisarlo
    assert.ok(sur.g.flat().every(p => p[0] <= lat(10) + 1e-6));
    const norte = trazar({ via: 'Carrera 1', desde: 'Calle 10', sentido: 'norte' }, null, idx);
    assert.ok(norte.g.flat().every(p => p[0] >= lat(10) - 1e-6));
    // Recorte a la zona
    const zona = [[lat(0), -75.51], [lat(5), -75.51], [lat(5), -75.49], [lat(0), -75.49]];
    assert.ok(trazar({ via: 'Carrera 1' }, zona, idx).g.flat().every(p => p[0] <= lat(5)));
    const nada = trazar({ via: 'No Existe' }, null, idx);
    assert.equal(nada.estado, 'aprox'); assert.equal(nada.g.length, 0); assert.ok(/no se encontró/.test(nada.nota));
    const supuesto = trazar({ via: 'Carrera 1', desde: 'Calle 10', hasta: 'Calle 20', supuesto: 'la Calle 20 es el puente' }, null, idx);
    assert.equal(supuesto.estado, 'aprox'); assert.ok(supuesto.nota.includes('puente'));
});
