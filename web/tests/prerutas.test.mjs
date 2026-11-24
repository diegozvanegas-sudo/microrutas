import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarRutas, tocaReleer, revisadosDeRuta } from '../src/subsanaciones/prerutas.js';

const BASE = [
    { cuadrilla: '2', lote: '400', orden: '1' },
    { cuadrilla: '2', lote: '532', orden: '2' },
    { cuadrilla: '4', lote: '842', orden: '1' },
];

test('sin cambios en este equipo, la pre-ruta es la de la base', () => {
    assert.deepEqual(mezclarRutas(BASE, {}, 1000), BASE);
    assert.deepEqual(mezclarRutas(BASE, undefined, 1000), BASE);
});

test('un cambio viejo de este equipo no le gana a la base (lo hecho desde el otro equipo se ve)', () => {
    const cambios = { 2: { t: 500, filas: [{ cuadrilla: '2', lote: '400', orden: '1' }] } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), BASE);
});

test('la cuadrilla cambiada aquí mientras se leía queda como está aquí; las demás, de la base', () => {
    const cambios = { 2: { t: 1500, filas: [{ cuadrilla: '2', lote: '532', orden: '1' }] } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), [
        { cuadrilla: '4', lote: '842', orden: '1' },
        { cuadrilla: '2', lote: '532', orden: '1' },
    ]);
});

test('un cambio que no se pudo subir se conserva aunque sea viejo; una pre-ruta quitada aquí no reaparece', () => {
    const cambios = { 4: { t: 10, filas: [], pendiente: true } };
    assert.deepEqual(mezclarRutas(BASE, cambios, 1000), BASE.slice(0, 2));
});

test('sin cuadrilla ("") también se respeta', () => {
    const base = [{ cuadrilla: '', lote: '77' }, { cuadrilla: '2', lote: '400' }];
    const cambios = { '': { t: 2000, filas: [{ cuadrilla: '', lote: '78' }] } };
    assert.deepEqual(mezclarRutas(base, cambios, 1000), [{ cuadrilla: '2', lote: '400' }, { cuadrilla: '', lote: '78' }]);
});

test('al volver a la página se relee solo si pasó un rato, no se está leyendo y no hay ventana abierta', () => {
    assert.equal(tocaReleer(100000, 50000, false, false), true);
    assert.equal(tocaReleer(100000, 90000, false, false), false);   // hace 10 s
    assert.equal(tocaReleer(100000, 0, true, false), false);        // ya está leyendo
    assert.equal(tocaReleer(100000, 0, false, true), false);        // formulario abierto
    assert.equal(tocaReleer(100000, 95000, false, false, 5000), true);
});

// Revisados que ya salieron de la pre-ruta: se buscan en las visitas para pintarlos en verde en el mapa
const iso = (r, c) => { const m = String(r[c] || '').match(/^(\d+)\/(\d+)\/(\d{4})$/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
const PARADAS = [{ id: '115', fecha: '2026-11-20', creada: '2026-11-21' }, { id: '116', fecha: '2026-11-21', creada: '2026-11-22' }];
const VISITAS = [
    { ID: 'V5', LOTE: '120', MICRORRUTA: 'Z4CC0010', CUADRILLA: '4', 'FECHA DE EJECUCIÓN': '20/11/2026', 'FECHA DE LA VISITA': '21/11/2026', ESTADO: 'SIN NOVEDAD' },
    { ID: 'V4', LOTE: '121', MICRORRUTA: 'Z4CC0011', CUADRILLA: 'C4', 'FECHA DE EJECUCIÓN': '18/11/2026', 'FECHA DE LA VISITA': '23/11/2026', ESTADO: 'PENDIENTE' },
    { ID: 'V3', LOTE: '120', MICRORRUTA: 'Z4CC0010', CUADRILLA: '4', 'FECHA DE EJECUCIÓN': '20/11/2026', 'FECHA DE LA VISITA': '20/11/2026', ESTADO: 'PENDIENTE' },
    { ID: 'V2', LOTE: '300', MICRORRUTA: 'Z2CC0300', CUADRILLA: '2', 'FECHA DE EJECUCIÓN': '20/11/2026', 'FECHA DE LA VISITA': '21/11/2026', ESTADO: 'SIN NOVEDAD' },
    { ID: 'OPE-1', TIPO: 'Durante la operación', LOTE: '122', CUADRILLA: '4', 'FECHA DE LA VISITA': '22/11/2026' },
    { ID: 'V1', LOTE: '90', MICRORRUTA: 'Z4CC0090', CUADRILLA: '4', 'FECHA DE EJECUCIÓN': '10/11/2026', 'FECHA DE LA VISITA': '12/11/2026', ESTADO: 'SIN NOVEDAD' },
    { ID: 'V0', LOTE: '116', MICRORRUTA: 'Z4CC0016', CUADRILLA: '4', 'FECHA DE EJECUCIÓN': '21/11/2026', 'FECHA DE LA VISITA': '22/11/2026', ESTADO: 'SIN NOVEDAD' },
];

test('revisados de la pre-ruta: misma cuadrilla, misma ejecución o visitados desde que se cargó', () => {
    const r = revisadosDeRuta('4', PARADAS, VISITAS, iso, ['115', '116']);
    // 120 con su visita más reciente (V5); 121 por la fecha de visita (con "C4"); sin la de otra cuadrilla, la de
    // operación, la vieja (lote 90) ni el 116 que sigue pendiente en la lista
    assert.deepEqual(r.map(x => [x.lote, x.visita.ID]), [['120', 'V5'], ['121', 'V4']]);
    assert.equal(r[0].mr, 'Z4CC0010');
});

test('revisados de la pre-ruta: sin cuadrilla o sin paradas no hay nada que buscar', () => {
    assert.deepEqual(revisadosDeRuta('', PARADAS, VISITAS, iso, []), []);
    assert.deepEqual(revisadosDeRuta('4', [], VISITAS, iso, []), []);
});

test('revisados de la pre-ruta: lote NA queda por microrruta y se descarta si la microrruta sigue pendiente', () => {
    const v = [{ ID: 'V9', LOTE: 'NA', MICRORRUTA: 'z4cc0500', CUADRILLA: '4', 'FECHA DE EJECUCIÓN': '20/11/2026', 'FECHA DE LA VISITA': '21/11/2026' }];
    assert.deepEqual(revisadosDeRuta('4', PARADAS, v, iso, []).map(x => [x.lote, x.mr]), [['', 'Z4CC0500']]);
    assert.deepEqual(revisadosDeRuta('4', PARADAS, v, iso, ['Z4CC0500']), []);
});
