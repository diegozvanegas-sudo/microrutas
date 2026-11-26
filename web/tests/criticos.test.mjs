import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveFija, nuevoIdCritico, mezclarCriticos, deFilaCritico, aFilaCritico, textoCritico, MAX_DESCRIPCION } from '../src/mapa/criticos.js';

var fijos = [
    { id: claveFija([-75559498, 6293301]), n: 'Calle 100A con carrera 51', z: 'Zona 1', lat: 6.293301, lon: -75.559498 },
    { id: claveFija([-75549763, 6286639]), n: 'Parque Guadalupe', z: 'Zona 1', d: 'Calle 95A carrera 42B', lat: 6.286639, lon: -75.549763 }
];

test('puntos críticos: ids de los fijos (por coordenadas del archivo) y de los nuevos', () => {
    assert.equal(fijos[0].id, 'f:-75559498,6293301');
    var a = nuevoIdCritico(1700000000000), b = nuevoIdCritico(1700000000000);
    assert.match(a, /^c:[a-z0-9]+$/);
    assert.notEqual(a, b);
});

test('puntos críticos: sin nada más salen los del archivo', () => {
    var l = mezclarCriticos(fijos, {}, {});
    assert.equal(l.length, 2);
    assert.deepEqual(l[1], { id: fijos[1].id, nombre: 'Parque Guadalupe', direccion: 'Calle 95A carrera 42B', zona: 'Zona 1', descripcion: '', lat: 6.286639, lon: -75.549763, origen: 'fijo', hora: 0 });
});

test('puntos críticos: descripción a un fijo (no se mueve), uno nuevo de campo y uno quitado', () => {
    var base = {};
    base[fijos[0].id] = { id: fijos[0].id, descripcion: 'Bolsas y escombros los lunes', lat: 1, lon: 1, origen: 'fijo', hora: 10 };
    base['c:abc'] = { id: 'c:abc', nombre: 'Calle 84 con carrera 38', zona: 'Zona 1', lat: 6.27, lon: -75.55, origen: 'campo', hora: 10 };
    base[fijos[1].id] = { id: fijos[1].id, quitado: true, hora: 10 };
    var l = mezclarCriticos(fijos, base, {});
    assert.equal(l.length, 2);
    var f = l.filter(function (p) { return p.id === fijos[0].id; })[0];
    assert.equal(f.descripcion, 'Bolsas y escombros los lunes');
    assert.equal(f.lat, 6.293301);   // el fijo sigue donde está en el archivo
    assert.equal(f.origen, 'fijo');
    var c = l.filter(function (p) { return p.id === 'c:abc'; })[0];
    assert.equal(c.origen, 'campo');
    assert.equal(c.pendiente, false);
});

test('puntos críticos: lo del equipo manda si es más nuevo; lo viejo del equipo no tapa la base', () => {
    var base = { 'c:1': { id: 'c:1', nombre: 'Base', lat: 6.2, lon: -75.5, origen: 'campo', hora: 50 } };
    var nuevo = mezclarCriticos([], base, { 'c:1': { id: 'c:1', nombre: 'Equipo', lat: 6.2, lon: -75.5, origen: 'campo', hora: 60 } });
    assert.equal(nuevo[0].nombre, 'Equipo');
    assert.equal(nuevo[0].pendiente, true);
    var viejo = mezclarCriticos([], base, { 'c:1': { id: 'c:1', nombre: 'Equipo', lat: 6.2, lon: -75.5, origen: 'campo', hora: 40 } });
    assert.equal(viejo[0].nombre, 'Base');
    // Corrección de un fijo que ya no está en el archivo: no aparece suelta
    assert.equal(mezclarCriticos([], { 'f:1,2': { id: 'f:1,2', descripcion: 'x', lat: 1, lon: 2 } }, {}).length, 0);
});

test('puntos críticos: ida y vuelta por la base y texto para WhatsApp', () => {
    var p = { id: 'c:9', nombre: '  Calle 84 con carrera 38 ', direccion: 'Calle 84 #38-10, Manrique', zona: 'Zona 1', descripcion: 'x'.repeat(1200), lat: 6.27, lon: -75.55, origen: 'campo', hora: 1700000000000 };
    var fila = aFilaCritico(p);
    assert.equal(fila.nombre, 'Calle 84 con carrera 38');
    assert.equal(fila.descripcion.length, MAX_DESCRIPCION);
    assert.equal(fila.actualizado, new Date(1700000000000).toISOString());
    var vuelta = deFilaCritico(fila);
    assert.equal(vuelta.hora, 1700000000000);
    assert.equal(vuelta.origen, 'campo');
    var t = textoCritico({ nombre: 'Parque Guadalupe', direccion: 'Calle 95A carrera 42B', zona: 'Zona 1', descripcion: 'Escombros', lat: 6.286639, lon: -75.549763 }, 'https://maps');
    assert.equal(t, '🗑 Punto crítico: Parque Guadalupe\n📍 Calle 95A carrera 42B\nZona 1\n📝 Escombros\n6.286639, -75.549763\nhttps://maps');
});
