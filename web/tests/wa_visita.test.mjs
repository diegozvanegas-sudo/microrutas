import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fijarItems } from '../src/subsanaciones/estado.js';
import { textoVisita, textoWhatsapp, FORMATOS_VISITA, REQUERIMIENTOS } from '../src/subsanaciones/whatsapp.js';

const VISITA = { ID: 'SUB-9', CUADRILLA: '8', MICRORRUTA: 'Z5CC0027', LOTE: '842', ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': '10/11/2026',
    'AFECTACIÓN DE ÁRBOLES': 'NO', 'BORDEOS Y RECUPERACIÓN DE ZONAS DURAS': 'NO', CORTE: 'SI' };

test('WhatsApp de una visita: formato formal igual al que se envía al grupo', () => {
    fijarItems(['CORTE', 'AFECTACIÓN DE ÁRBOLES', 'BORDEOS Y RECUPERACIÓN DE ZONAS DURAS'], ['PMT']);
    const t = textoVisita(VISITA, { formato: 'formal', plazo: false, mencion: '@~PRECOODES!', hora: 9 });
    assert.equal(t, '¡Buenos días!\n\nNOVEDADES POSOPERACION\nFecha: 10/11/2026\nCuadrilla: 8\n@~PRECOODES!\n\nZ5CC0027 (842)\n' +
        '- Afectación de árboles.\n- Bordeos y recuperación de zonas duras.\n\n\n' + REQUERIMIENTOS);
});

test('WhatsApp de una visita: el plazo va o no según la casilla', () => {
    fijarItems(['CORTE', 'AFECTACIÓN DE ÁRBOLES', 'BORDEOS Y RECUPERACIÓN DE ZONAS DURAS'], ['PMT']);
    const con = textoVisita(VISITA, { formato: 'formal', plazo: true, hora: 9 });
    const sin = textoVisita(VISITA, { formato: 'formal', plazo: false, hora: 9 });
    assert.match(con, /\(Plazo: [^)]+\)\./);
    assert.doesNotMatch(sin, /Plazo/);
    // Sin @mención recordada, no queda un renglón vacío
    assert.match(sin, /Cuadrilla: 8\n\nZ5CC0027/);
});

test('WhatsApp de una visita: corto como siempre y los otros formatos', () => {
    fijarItems(['CORTE', 'AFECTACIÓN DE ÁRBOLES', 'BORDEOS Y RECUPERACIÓN DE ZONAS DURAS'], ['PMT']);
    assert.equal(textoWhatsapp(VISITA), textoVisita(VISITA, { formato: 'corto', plazo: true }));
    assert.match(textoVisita(VISITA, { formato: 'corto', plazo: false, hora: 15 }), /^Buenas tardes\n\nNovedad C8\n\nZ5CC0027 \(842\)\n- Afectación de árboles\.\n/);
    const req = textoVisita(VISITA, { formato: 'requerimiento', plazo: true, mencion: '@~PRECOODES!', hora: 9 });
    assert.match(req, /^¡Buenos días!\n\nSOLICITUD DE SUBSANACIÓN\nCuadrilla: 8\n@~PRECOODES!/);
    assert.match(req, /visita de verificación posoperación realizada el 10\/11\/2026 a la microrruta Z5CC0027 \(lote 842\)/);
    assert.match(req, /dentro del plazo indicado para cada novedad/);
    assert.match(textoVisita(VISITA, { formato: 'requerimiento', plazo: false }), /a la mayor brevedad/);
    const rei = textoVisita(VISITA, { formato: 'reiteracion', plazo: true });
    assert.match(rei, /REITERACIÓN DE NOVEDAD/);
    assert.match(rei, /continúa sin subsanar/);
    assert.match(rei, /descuento correspondiente en la factura/);
    assert.equal(Object.keys(FORMATOS_VISITA).length, 4);
    // En operación y con lote NA
    const op = textoVisita({ ...VISITA, ID: 'OPE-1', LOTE: 'NA', PMT: 'NO' }, { formato: 'formal', plazo: false, hora: 9 });
    assert.match(op, /NOVEDADES EN OPERACION/);
    assert.match(op, /\nZ5CC0027\n- /);
});
