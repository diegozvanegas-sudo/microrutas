import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fijarItems } from '../src/subsanaciones/estado.js';
import { textoNovedadesDia, FORMATOS_DIA, REQUERIMIENTOS } from '../src/subsanaciones/whatsapp.js';

const DIA = [{ ID: 'SUB-1', CUADRILLA: '4', MICRORRUTA: 'Z1CC0083', LOTE: '92', ESTADO: 'PENDIENTE', CORTE: 'NO', 'OBSERVACIONES NOVEDADES': 'Sectores sin intervenir',
    'FECHA DE LA VISITA': '11/11/2026', 'FECHA DE REGISTRO': '11/11/2026 9:00:00' }];

test('Resumen del día: sin opciones sale igual que antes (formal, con plazo y requerimientos)', () => {
    fijarItems(['CORTE'], ['PMT']);
    const t = textoNovedadesDia(DIA, '11/11/2026', { 4: '@~Encargado' }, { hora: 9 });
    assert.equal(t, textoNovedadesDia(DIA, '11/11/2026', { 4: '@~Encargado' }, { formato: 'formal', plazo: true, hora: 9 }));
    assert.match(t, /^¡Buenos días!\n\nNOVEDADES POSOPERACION\nFecha: 11\/11\/2026\nCuadrilla: 4\n@~Encargado\n\nZ1CC0083 \(92\):\n\n\* Corte \(Plazo: 5 días\)\n\* Sectores sin intervenir \(Plazo: 5 días\)/);
    assert.ok(t.endsWith(REQUERIMIENTOS));
});

test('Resumen del día: se puede quitar el plazo y cambiar el mensaje', () => {
    fijarItems(['CORTE'], ['PMT']);
    const sin = textoNovedadesDia(DIA, '11/11/2026', {}, { plazo: false, hora: 15 });
    assert.doesNotMatch(sin, /Plazo/);
    assert.match(sin, /\* Corte\n\* Sectores sin intervenir\n/);
    const corto = textoNovedadesDia(DIA, '11/11/2026', {}, { formato: 'corto', hora: 15 });
    assert.match(corto, /^¡Buenas tardes!\n\nNOVEDADES POSOPERACION/);
    assert.doesNotMatch(corto, /REQUERIMIENTOS/);
    const req = textoNovedadesDia(DIA, '11/11/2026', {}, { formato: 'requerimiento' });
    assert.match(req, /SOLICITUD DE SUBSANACIÓN[\s\S]*realizadas el 11\/11\/2026[\s\S]*dentro del plazo indicado/);
    assert.match(textoNovedadesDia(DIA, '11/11/2026', {}, { formato: 'requerimiento', plazo: false }), /a la mayor brevedad/);
    const rei = textoNovedadesDia(DIA, '11/11/2026', {}, { formato: 'reiteracion' });
    assert.match(rei, /REITERACIÓN DE NOVEDADES[\s\S]*descuento correspondiente/);
    assert.ok(FORMATOS_DIA.conteo && FORMATOS_DIA.formal);
    // Un formato desconocido (o «conteo», que lo arma textoDia) cae en el formal
    assert.equal(textoNovedadesDia(DIA, '11/11/2026', {}, { formato: 'conteo', hora: 9 }), textoNovedadesDia(DIA, '11/11/2026', {}, { hora: 9 }));
});
