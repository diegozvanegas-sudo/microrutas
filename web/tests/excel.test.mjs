import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hojasExcel } from '../src/subsanaciones/excel.js';
import { fijarItems } from '../src/subsanaciones/estado.js';

// Hoja "Durante la operación" con el formato de interventoría de nov 2026
const ITS = ['MALLA(S) DE PROTECCIÓN', 'EPP'];
fijarItems([], ITS);
const v = (o) => ({ TIPO: 'OPERACIÓN', MICRORRUTA: 'Z2CC0247', LOTE: '467', 'ÁREA M2': '95.057', ZONA: '4', CUADRILLA: '6', 'FECHA DE LA VISITA': '31/10/2026', INTERVENTOR: 'SMA', 'MALLA(S) DE PROTECCIÓN': 'SI', EPP: 'SI', ...o });
const hoja = (lista) => hojasExcel(lista, [], ITS)[0];
const fila = (r) => { const h = hoja([r]); return Object.fromEntries(h.cab.map((c, i) => [c, { v: h.filas[0].v[i], fondo: h.filas[0].fondo[i] }])); };

test('columnas en el orden del formato, sin las grises de seguimiento', () => {
    assert.deepEqual(hoja([v({ ESTADO: 'SIN NOVEDAD' })]).cab, ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'CLASIFICACION', 'ZONA', 'CUADRILLA', 'FECHA DE LA VISITA', 'INTERVENTOR',
        ...ITS, 'OBSERVACIONES', 'FECHA DE CORRECCION', 'CANTIDAD DE NOVEDADES', 'DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)']);
});
test('sin novedad: NA, 0 y NA', () => {
    const f = fila(v({ ESTADO: 'SIN NOVEDAD' }));
    assert.equal(f.CLASIFICACION.v, 'CLUS');
    assert.equal(f['ÁREA M2'].v, 95057);
    assert.equal(f.OBSERVACIONES.v, 'SIN NOVEDAD');
    assert.equal(f['FECHA DE CORRECCION'].v, 'NA');
    assert.equal(f['CANTIDAD DE NOVEDADES'].v, 0);
    assert.equal(f['DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'].v, 'NA');
});
test('corregido el día de la visita: INMEDIATAMENTE y 0 días', () => {
    const f = fila(v({ ESTADO: 'SUBSANADO', 'ÍTEMS SUBSANADOS': 'MALLA(S) DE PROTECCIÓN|EPP', 'FECHA SUBSANACIÓN': '31/10/2026' }));
    assert.equal(f.OBSERVACIONES.v, 'NOVEDAD SUBSANADA INMEDIATAMENTE');
    assert.equal(f['MALLA(S) DE PROTECCIÓN'].v, 'NO');
    assert.equal(f['MALLA(S) DE PROTECCIÓN'].fondo, 'FF00FF00');
    assert.equal(f['FECHA DE CORRECCION'].v, '31/10/2026');
    assert.equal(f['CANTIDAD DE NOVEDADES'].v, 2);
    assert.equal(f['DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'].v, 0);
});
test('corregido otro día: SUBSANADA EL fecha y los días', () => {
    const f = fila(v({ ESTADO: 'SUBSANADO', 'ÍTEMS SUBSANADOS': 'EPP', 'FECHA SUBSANACIÓN': '02/11/2026' }));
    assert.equal(f.OBSERVACIONES.v, 'NOVEDAD SUBSANADA EL 02/11/2026');
    assert.equal(f['DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'].v, 2);
    assert.equal(f['CANTIDAD DE NOVEDADES'].v, 1);
});
test('pendiente: NO en amarillo y fecha y días en blanco', () => {
    const f = fila(v({ ESTADO: 'PENDIENTE', EPP: 'NO' }));
    assert.equal(f.EPP.fondo, 'FFFFFF00');
    assert.equal(f.OBSERVACIONES.v, 'PENDIENTE POR SUBSANAR');
    assert.equal(f['FECHA DE CORRECCION'].v, '');
    assert.equal(f['DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'].v, '');
    assert.equal(f['DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'].fondo, null);
});
