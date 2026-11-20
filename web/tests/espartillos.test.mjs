import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarLista, filtrar, resumenPorZona, nombreZona, enlaces, SIN_ZONA } from '../src/espartillos/espartillos.js';
import { claveDeEnlace, puede } from '../src/secciones.js';

// Cuadrado en el formato del mapa rápido: [lon·1e6, lat·1e6, Δlon, Δlat…]
function cuadro(lat, lon, lado) {
    var pts = [[lon, lat], [lon + lado, lat], [lon + lado, lat + lado], [lon, lat + lado], [lon, lat]], plano = [], px = 0, py = 0;
    pts.forEach(function (p) { var x = Math.round(p[0] * 1e6), y = Math.round(p[1] * 1e6); plano.push(x - px, y - py); px = x; py = y; });
    return [[plano]];
}
const capas = {
    zonas: { items: [{ n: 'Zona 1', g: cuadro(6.20, -75.60, 0.05) }, { n: 'Zona 2', g: cuadro(6.20, -75.55, 0.05) }] },
    comunas: { items: [{ n: 'Aranjuez', g: cuadro(6.20, -75.60, 0.05) }, { n: 'Robledo', g: cuadro(6.20, -75.55, 0.05) }] },
    espartillos: { items: [
        // 04_07_ES_0002 en dos piezas, la grande en Zona 1 y una pequeña en Zona 2
        { o: '04_07_ES_0002', a: '400', d: 'Calle 67 con carrera 52', s: 'Retiro de espartillo', g: cuadro(6.21, -75.59, 0.002) },
        { o: '04_07_ES_0002', a: '50', d: 'Calle 67 con carrera 52', s: 'Retiro de espartillo', g: cuadro(6.21, -75.54, 0.0005) },
        { o: '07_10_ES_0010', a: '300', d: 'Carrera 80', s: '', g: cuadro(6.22, -75.53, 0.002) },
        // Fuera de las zonas (como Guayabal)
        { o: '15_02_ES_0026', a: '1000', d: 'Calle 30', s: '', g: cuadro(6.30, -75.59, 0.002) },
        // Misma dirección que 04_07_ES_0002 pero de otra comuna
        { o: '16_11_ES_0003', a: '80', d: 'Calle 67 con carrera 52', s: '', g: cuadro(6.23, -75.58, 0.001) }
    ] }
};

test('espartillos: se juntan las piezas por código y la zona es la de la pieza más grande', () => {
    const r = armarLista(capas, null);
    assert.equal(r.filas.length, 4);
    const a = r.filas.find(f => f.codigo === '04_07_ES_0002');
    assert.equal(a.zona, 'Zona 1');
    assert.equal(a.zonaDe, 'mapa');
    assert.deepEqual(a.tambien, ['Zona 2']);
    assert.equal(a.area, 450);
    assert.equal(a.piezas, 2);
    assert.equal(a.comuna, 'Aranjuez, Robledo');
    assert.equal(a.prog, null);
    assert.equal(r.conProgramacion, false);
    // Orden: por zona y código; los sin zona al final
    assert.deepEqual(r.filas.map(f => f.codigo), ['04_07_ES_0002', '16_11_ES_0003', '07_10_ES_0010', '15_02_ES_0026']);
    assert.deepEqual(r.zonas, ['Zona 1', 'Zona 2', SIN_ZONA]);
});

test('espartillos: sin zona EMV lleva la más cercana y la dirección copiada de otra comuna se avisa', () => {
    const r = armarLista(capas, null);
    const g = r.filas.find(f => f.codigo === '15_02_ES_0026');
    assert.equal(g.zona, SIN_ZONA);
    assert.equal(g.cerca.zona, 'Zona 1');
    assert.match(r.filas.find(f => f.codigo === '16_11_ES_0003').obs[0], /igual a la de 04_07_ES_0002/);
    assert.match(r.filas.find(f => f.codigo === '04_07_ES_0002').obs[0], /igual a la de 16_11_ES_0003/);
});

test('espartillos: la programación del mes manda en la zona y trae la ejecución', () => {
    const sif = { total: 3, q1: 1, q2: 0, rutas: [
        { codigo: '15_02_ES_0026', zona: '6', q1: 'X', fecha1: '2026-11-02', q2: '', fecha2: '', obs: '' },
        { codigo: '07_10_ES_0010', zona: '1', q1: '', fecha1: '', q2: '', fecha2: '', obs: 'lluvia' },
        { codigo: '99_99_ES_9999', zona: '3', q1: '', fecha1: '', q2: '', fecha2: '', obs: '' }
    ] };
    const r = armarLista(capas, sif);
    const g = r.filas.find(f => f.codigo === '15_02_ES_0026');
    assert.equal(g.zona, 'Zona 6');
    assert.equal(g.zonaDe, 'programación');
    assert.equal(g.cerca, null);
    assert.deepEqual(g.prog, { q1: true, fecha1: '2026-11-02', q2: false, fecha2: '', obs: '' });
    // Zona distinta en la programación y en el mapa: se avisa
    assert.match(r.filas.find(f => f.codigo === '07_10_ES_0010').obs[0], /programación es Zona 1 y en el mapa cae en Zona 2/);
    // Programado pero sin dibujo en la capa: también sale
    const s = r.filas.find(f => f.codigo === '99_99_ES_9999');
    assert.equal(s.dibujo, false);
    assert.equal(s.zona, 'Zona 3');
    assert.equal(r.programadosSinDibujo, 1);
    assert.deepEqual(enlaces(s), { mapa: '', google: '' });

    assert.deepEqual(filtrar(r.filas, { estado: 'programados' }).map(f => f.codigo).sort(), ['07_10_ES_0010', '15_02_ES_0026', '99_99_ES_9999']);
    assert.deepEqual(filtrar(r.filas, { estado: 'ejecutados' }).map(f => f.codigo), ['15_02_ES_0026']);
    assert.deepEqual(filtrar(r.filas, { estado: 'pendientes' }).map(f => f.codigo).sort(), ['07_10_ES_0010', '99_99_ES_9999']);
    const z6 = resumenPorZona(r.filas).find(x => x.zona === 'Zona 6');
    assert.deepEqual([z6.codigos, z6.area, z6.programados, z6.q1, z6.q2], [1, 1000, 1, 1, 0]);
});

test('espartillos: filtros por zona, comuna y texto (sin tildes ni mayúsculas)', () => {
    const r = armarLista(capas, null);
    assert.deepEqual(filtrar(r.filas, { zona: 'Zona 1' }).map(f => f.codigo), ['04_07_ES_0002', '16_11_ES_0003']);
    assert.deepEqual(filtrar(r.filas, { comuna: 'Robledo' }).map(f => f.codigo), ['04_07_ES_0002', '07_10_ES_0010']);
    assert.deepEqual(filtrar(r.filas, { texto: 'CARRERA 80' }).map(f => f.codigo), ['07_10_ES_0010']);
    assert.deepEqual(filtrar(r.filas, { texto: 'calle 67 aranjuez' }).map(f => f.codigo), ['04_07_ES_0002', '16_11_ES_0003']);
    assert.deepEqual(filtrar(r.filas, { texto: 'calle 67 robledo' }).map(f => f.codigo), ['04_07_ES_0002']);
    assert.deepEqual(filtrar(r.filas, { estado: 'revisar' }).map(f => f.codigo), ['04_07_ES_0002', '16_11_ES_0003', '15_02_ES_0026']);
    assert.equal(nombreZona(' 6 '), 'Zona 6');
    assert.equal(nombreZona('ZONA 3'), 'Zona 3');
    assert.equal(nombreZona('Santa Elena'), 'Santa Elena');
});

test('espartillos: es una sección del menú, encendida para todos y apagable por usuario', () => {
    assert.equal(claveDeEnlace('espartillos.html'), 'espartillos');
    assert.equal(puede({ admin: false, contrato: false, ocultas: [] }, 'espartillos'), true);
    assert.equal(puede({ admin: false, contrato: false, ocultas: ['espartillos'] }, 'espartillos'), false);
});
