// Ficha del lote del mapa rápido (src/mapa/ficha.js): lo que cada sección sabe del lote, con datos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infoLote, chipReporte, htmlAvisos, htmlMas, iso, corto } from '../src/mapa/ficha.js';

function hace(n) { var d = new Date(); d.setDate(d.getDate() - n); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }
function hoyIso() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
var ITEMS = ['PLATEO', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS', 'SECTORES SIN INTERVENIR'];
function visita(id, dias, estado, enNo, mr, lote) {
    var r = { ID: id, MICRORRUTA: mr || 'Z2CC0278', LOTE: lote || '498', 'FECHA DE LA VISITA': hace(dias), ESTADO: estado, 'OBSERVACIONES NOVEDADES': '', TIPO: 'EJECUCIÓN' };
    ITEMS.forEach(function (i) { r[i] = (enNo || []).indexOf(i) !== -1 ? 'NO' : 'SI'; });
    return r;
}
var FUENTES = {
    items: ITEMS, itemsOp: [],
    visitas: [visita('SUB-1', 2, 'PENDIENTE', ['SECTORES SIN INTERVENIR']), visita('SUB-2', 9, 'PENDIENTE', ['BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS']),
        visita('SUB-3', 30, 'SUBSANADO'), visita('SUB-9', 1, 'PENDIENTE', ['PLATEO'], 'Z2CC0001', '1')],
    reportes: [{ fecha: '2026-11-03', cuad: '4', items: [{ mr: 'Z2CC0278', lote: '498' }] }, { fecha: '2026-11-17', cuad: '4', items: [{ mr: 'Z2cc278', lote: '' }] },
        { fecha: '2026-11-18', cuad: '4', items: [{ mr: 'Z2CC0001', lote: '1' }] }],
    descuentos: [{ id: 'd1', tipo: 'cerramiento', fecha: '2026-11-13', estado: 'emitido', filas: [{ mr: 'Z2CC0278', lote: '498', areaBase: 17748, areaDescontar: 176 }] }],
    auditorias: [{ quincena: 'Q1 C4', microrruta: 'Z2CC0278', lote: '498', novedad: 'PENDIENTE; Bordeo sin realizar', ac: 'COMPLETO', decision: null, actualizado: '2026-11-10' },
        { quincena: 'Q2 C4', microrruta: 'Z2CC0278', lote: '498', novedad: 'SN', ac: 'COMPLETO', decision: 'APROBADA', actualizado: '2026-11-18' }],
    requerimientos: [{ radicado: 'EVM-2026-0045', fecha: '2026-11-15', estado: 'Enviado', asunto: 'Sectores sin intervenir', novedades: [{ micro: 'Z2CC0278', lote: '498' }] }],
    pqrs: [{ radicado: '441181', fecha_pqr: '2026-11-12', estado: 'abierto', queja: 'El cerro el volador lote 498 no lo cortan', visita: {} },
        { radicado: '441200', fecha_pqr: '2026-11-12', estado: 'abierto', queja: 'Parque del lote 4980', visita: {} }],
    propuesta: { mes: '2026-11', lotes: { 'Z2CC0278|498': [{ q: 1, fecha: '2026-11-03', n: 2, total: 5, km: 1.24, vecinos: ['497', '502'] }] } }
};

test('ficha: junta lo de cada sección para el lote y nada de otros lotes', () => {
    var i = infoLote({ mr: 'Z2CC0278', lote: '498' }, FUENTES, '2026-11-19');
    assert.deepEqual(i.pendientes.map((p) => p.id), ['SUB-1', 'SUB-2']);
    assert.deepEqual(i.visitas.map((v) => v.id), ['SUB-1', 'SUB-2', 'SUB-3']);
    // Plazos: sectores sin intervenir 5 días (visita hace 2 → quedan 3); barrido el mismo día (hace 9 → vencido)
    assert.equal(i.pendientes[0].plazo.resta, 3);
    assert.ok(i.pendientes[1].plazo.descuento);
    assert.equal(i.pendientes[0].items[0].plazo, 'Plazo: 5 días');
    // El reporte más reciente que lo trae: el del 17 nombra la microrruta sin lote y cuenta (se reporta la microrruta completa);
    // el del 18 es de otra microrruta
    assert.deepEqual(i.reporte, { fecha: '2026-11-17', cuad: '4', dias: 2 });
    assert.equal(i.areaDescontada, 176);
    assert.equal(i.auditoria.quincena, 'Q2 C4');
    assert.deepEqual(i.auditoria.novedades, [], 'la última auditoría (aprobada, SN) no tiene novedad');
    assert.equal(i.requerimientos[0].radicado, 'EVM-2026-0045');
    assert.deepEqual(i.pqrs.map((p) => p.radicado), ['441181'], '«lote 4980» no es el lote 498');
    assert.equal(i.propuesta[0].n, 2);
});

test('ficha: un lote sin número se busca por su microrruta', () => {
    var i = infoLote({ mr: 'Z2CC0278', lote: 'NA' }, Object.assign({}, FUENTES, { visitas: [visita('SUB-7', 3, 'PENDIENTE', ['PLATEO'], 'Z2CC0278', 'NA')] }), '2026-11-19');
    assert.deepEqual(i.pendientes.map((p) => p.id), ['SUB-7']);
    assert.equal(i.reporte.fecha, '2026-11-17');
    var vacio = infoLote({ mr: 'Z9CC0009', lote: '9' }, FUENTES, '2026-11-19');
    assert.equal(vacio.pendientes.length + vacio.descuentos.length + vacio.requerimientos.length + vacio.pqrs.length, 0);
    assert.equal(vacio.reporte, null);
    assert.equal(htmlAvisos(vacio), '');
    assert.equal(htmlMas(vacio), '');
    assert.match(chipReporte(vacio), /Sin reporte de ejecución/);
});

test('ficha: el HTML dice el plazo de cada pendiente y no deja pasar texto sin escapar', () => {
    var f = Object.assign({}, FUENTES, { requerimientos: [{ radicado: '<b>x</b>', fecha: '2026-11-15', estado: 'Enviado', novedades: [{ micro: 'Z2CC0278', lote: '498' }] }] });
    var i = infoLote({ mr: 'Z2CC0278', lote: '498' }, f, '2026-11-19'), h = htmlAvisos(i);
    assert.match(h, /Quedan 3 días/);
    assert.match(h, /Plazo vencido hace \d+ días → descuento/);
    assert.match(h, /Área descontada: 176 m²/);
    assert.match(h, /1 PQR que nombran el lote · 1 abierta/);
    assert.doesNotMatch(h, /<b>x<\/b>/);
    assert.match(htmlMas(i), /Propuesta por cercanía · 2026-11[\s\S]*parada 2 de 5[\s\S]*Con 497, 502/);
    assert.match(chipReporte(i), /Reportado 17\/11 · C4 · hace 2 días/);
    assert.equal(iso('03/11/2026'), '2026-11-03');
    assert.equal(corto('2026-11-03'), '03/11');
    assert.ok(hoyIso().length === 10);
});
