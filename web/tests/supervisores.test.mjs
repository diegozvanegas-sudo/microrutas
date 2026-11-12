import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fijarItems } from '../src/subsanaciones/estado.js';
import { textoSupervisores, plazosSupervisores } from '../src/subsanaciones/supervisores.js';

const IT = ['CORTE DE CESPED: DISPAREJO/ALTURA', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'AFECTACIÓN DE ÁRBOLES'];
const V = [
    { ID: 'SUB-1', CUADRILLA: '4', MICRORRUTA: 'Z1CC0111', LOTE: '121', ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': '11/11/2026',
        [IT[0]]: 'NO', [IT[1]]: 'NO', 'OBSERVACIONES NOVEDADES': 'LOTE CERRADO' },
    { ID: 'SUB-2', CUADRILLA: '4', MICRORRUTA: 'Z1CC0083', LOTE: '92', ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': '04/11/2026',
        [IT[0]]: 'NO', 'OBSERVACIONES NOVEDADES': 'Sectores sin intervenir' },
    { ID: 'SUB-3', CUADRILLA: '2', MICRORRUTA: 'Z2CC0010', LOTE: '5', ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': '10/11/2026', [IT[2]]: 'NO' },
    { ID: 'SUB-4', CUADRILLA: '2', MICRORRUTA: 'Z2CC0011', LOTE: '6', ESTADO: 'SUBSANADO', 'FECHA DE LA VISITA': '01/11/2026', [IT[0]]: 'NO' },
    { ID: 'SUB-5', CUADRILLA: '3', MICRORRUTA: 'Z3CC0001', LOTE: '7', ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': '01/11/2026', 'OBSERVACIONES NOVEDADES': 'LOTE NO REALIZADO' },
];

test('Plazos a supervisores: fecha límite y días que quedan por novedad', () => {
    fijarItems(IT, ['PMT']);
    const f = plazosSupervisores(V, '2026-11-11');
    // Lote cerrado sin plazo propio, pero sus ítems sí; lote no realizado y subsanadas no entran
    assert.equal(f.length, 5);
    const barrido = f.find(x => /Barrido/.test(x.novedad));
    assert.equal(barrido.limite, '2026-11-11'); assert.equal(barrido.tramo, 'hoy');
    const sectores = f.find(x => /Sectores/.test(x.novedad));
    assert.equal(sectores.limite, '2026-11-09'); assert.equal(sectores.resta, -2); assert.equal(sectores.tramo, 'descuento');
    assert.equal(f.find(x => /árboles/i.test(x.novedad)).noSub, true);
});

test('Plazos a supervisores: mensaje de WhatsApp por cuadrilla y urgencia', () => {
    fijarItems(IT, ['PMT']);
    const t = textoSupervisores(V, '2026-11-11', { 4: '@~Encargado C4' }, { hora: 9 });
    assert.match(t, /^¡Buenos días!\n\nPLAZOS DE SUBSANACIÓN\nCorte: 11\/11\/2026\n\nCuadrilla: 2\n/);
    assert.ok(t.indexOf('Cuadrilla: 2') < t.indexOf('Cuadrilla: 4'));
    assert.match(t, /Cuadrilla: 4\n@~Encargado C4\n4 novedades pendientes · 2 para descuento/);
    // Las dos novedades vencidas del mismo lote van en un renglón
    assert.match(t, /\* Z1CC0083 \(92\): Corte de cesped: disparejo\/altura, Sectores sin intervenir · vencida hace 2 días \(límite 09\/11\/2026\)/);
    assert.match(t, /🟠 Vencen hoy:\n\* Z1CC0111 \(121\): Barrido: barrido del lote y limpieza de zonas duras · vence hoy/);
    assert.match(t, /🟢 A tiempo:\n\* Z1CC0111 \(121\): Corte de cesped: disparejo\/altura · quedan 5 días \(límite 16\/11\/2026\)/);
    assert.match(t, /Z2CC0010 \(5\): Afectación de árboles · no subsanable/);
    assert.doesNotMatch(t, /Z3CC0001|Z2CC0011/);
    assert.equal(textoSupervisores([V[3]], '2026-11-11', {}), '');
});
