// «Usted está aquí» del mapa rápido: la dirección entre calles (public/js/entre_calles.js) con los cruces guardados reales
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { leerDatos } from '../src/subsanaciones/lotegps.js';
import { traer } from './ayuda_direcciones.mjs';

const ctx = { Math, Object, Promise, String };
ctx.window = ctx;
vm.runInNewContext(await readFile(new URL('../public/js/entre_calles.js', import.meta.url), 'utf8'), ctx);
const ix = leerDatos(await traer('rapido/cruces.js'));
const entre = (lat, lng, via) => ctx.entreCalles(ix, { lat, lng }, via);

test('Calle 85 en Las Granjas: entre Carrera 42 y Carrera 42A (el más cercano primero)', () => {
    const r = entre(6.276650, -75.550473, 'Calle 85');
    assert.equal(r.texto, 'Calle 85 entre Carrera 42 y Carrera 42A');
    assert.equal(r.esquina, false);
});

test('sin señal (sin la vía de OpenStreetMap) sale la vía de los cruces más cercanos', () => {
    assert.equal(entre(6.276650, -75.550473, null).texto, 'Calle 85 entre Carrera 42 y Carrera 42A');
    // con un nombre de vía que no está en los cruces cerca, también
    assert.equal(entre(6.276650, -75.550473, 'Avenida Regional').texto, 'Calle 85 entre Carrera 42 y Carrera 42A');
});

test('pegado al cruce es esquina: «con»', () => {
    const r = entre(6.27651, -75.55028, 'Calle 85');
    assert.equal(r.texto, 'Calle 85 con Carrera 42');
    assert.equal(r.esquina, true);
});

test('sobre la otra vía: Carrera 42 entre Calle 85 y Calle 84', () => {
    const r = entre(6.2760, -75.55036, 'Carrera 42');
    assert.match(r.texto, /^Carrera 42 entre Calle 8[45] y Calle 8[45]$/);
});

test('sin cruces cerca o sin datos: null (se deja la de OpenStreetMap)', () => {
    assert.equal(entre(6.0, -75.0, 'Calle 85'), null);
    assert.equal(ctx.entreCalles(null, { lat: 6.27665, lng: -75.550473 }, 'Calle 85'), null);
});
