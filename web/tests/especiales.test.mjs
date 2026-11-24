import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarPuntos } from '../src/mapa/especiales.js';

const A = [6.27, -75.57], B = [6.28, -75.58];

test('puntos especiales: sin nada pendiente en el equipo, quedan los de la base', () => {
    const m = mezclarPuntos({ VIEJO: { p: A, hora: 1 } }, { CARACOL: { p: B, hora: 5 } });
    // VIEJO ya no está en la base y no estaba pendiente: alguien lo quitó
    assert.deepEqual(m.puntos, { CARACOL: { p: B, hora: 5 } });
    assert.deepEqual([m.subir, m.borrar], [[], []]);
});

test('puntos especiales: un cambio de este equipo sin subir gana si es más nuevo y se sube', () => {
    const m = mezclarPuntos({ CARACOL: { p: A, hora: 9, pendiente: true } }, { CARACOL: { p: B, hora: 5 } });
    assert.deepEqual(m.puntos.CARACOL, { p: A, hora: 9, pendiente: true });
    assert.deepEqual(m.subir, ['CARACOL']);
});

test('puntos especiales: si en la base hay algo más nuevo, se descarta lo pendiente de aquí', () => {
    const m = mezclarPuntos({ CARACOL: { p: A, hora: 3, pendiente: true } }, { CARACOL: { p: B, hora: 5 } });
    assert.deepEqual(m.puntos.CARACOL, { p: B, hora: 5 });
    assert.deepEqual(m.subir, []);
});

test('puntos especiales: un punto nuevo hecho sin señal se sube', () => {
    const m = mezclarPuntos({ PLANTA: { p: A, hora: 2, pendiente: true } }, {});
    assert.deepEqual(m.subir, ['PLANTA']);
    assert.ok(m.puntos.PLANTA.pendiente);
});

test('puntos especiales: lo quitado sin señal se quita de la base (y si ya no estaba, no hay nada que hacer)', () => {
    const m = mezclarPuntos({ CARACOL: { borrado: true, pendiente: true, hora: 9 }, OTRO: { borrado: true, pendiente: true, hora: 9 } },
        { CARACOL: { p: B, hora: 5 } });
    assert.deepEqual(m.puntos, {});
    assert.deepEqual(m.borrar, ['CARACOL']);
    assert.deepEqual(m.subir, []);
});

test('puntos especiales: sin datos no falla', () => {
    assert.deepEqual(mezclarPuntos(null, undefined), { puntos: {}, subir: [], borrar: [] });
});
