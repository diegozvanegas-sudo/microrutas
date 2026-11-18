// «📋 Copiar resumen» → Reiteración: todas las pendientes filtradas (de días distintos), cada lote con su visita. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoReiteracion, FORMATOS_PEND } from '../src/subsanaciones/whatsapp.js';
import { fijarItems } from '../src/subsanaciones/estado.js';

const EJI = ['PLATEO', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'SECTORES SIN INTERVENIR'];
fijarItems(EJI, ['EPP']);
const v = (mr, lote, cuad, fv, enNo, extra) => Object.assign({ ID: mr, TIPO: 'EJECUCIÓN', MICRORRUTA: mr, LOTE: lote, CUADRILLA: cuad, 'FECHA DE LA VISITA': fv, ESTADO: 'PENDIENTE' },
    Object.fromEntries(EJI.map((i) => [i, enNo.includes(i) ? 'NO' : 'SI'])), extra);

test('reiteración: todas las pendientes de días distintos, por cuadrilla, de la más vieja a la más nueva', () => {
    const t = textoReiteracion([
        v('Z1CC0092', '102', '4', '13/11/2026', ['BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS']),
        v('Z1CC0051', '53', '4', '31/10/2026', ['PLATEO', 'SECTORES SIN INTERVENIR']),
        v('Z2CC0104', '301', '2', '12/11/2026', ['SECTORES SIN INTERVENIR']),
        v('Z1CC0139', 'NA', '4', '11/11/2026', ['SECTORES SIN INTERVENIR']),
        v('Z1CC0043', '43', '4', '18/11/2026', [], { ESTADO: 'SIN NOVEDAD' }),
    ], { '4': '@~Supervisor C4' }, { hora: 15, hoy: '18/11/2026' });
    assert.equal(t, '¡Buenas tardes!\n\nREITERACIÓN DE NOVEDADES\n\n' +
        'Se reiteran las novedades reportadas entre el 31/10/2026 y el 13/11/2026 en 4 lotes, las cuales al 18/11/2026 continúan sin subsanar:\n\n' +
        'NOVEDADES POSOPERACION\nCuadrilla: 2\n\nZ2CC0104 (301) · visita 12/11/2026:\n\n* Sectores sin intervenir (Plazo: 5 días)\n\n\n' +
        'NOVEDADES POSOPERACION\nCuadrilla: 4\n@~Supervisor C4\n\n' +
        'Z1CC0051 (53) · visita 31/10/2026:\n\n* Plateo (Plazo: 5 días)\n* Sectores sin intervenir (Plazo: 5 días)\n\n' +
        'Z1CC0139 · visita 11/11/2026:\n\n* Sectores sin intervenir (Plazo: 5 días)\n\n' +
        'Z1CC0092 (102) · visita 13/11/2026:\n\n* Barrido: barrido del lote y limpieza de zonas duras (Plazo: el mismo día)\n\n' +
        'Se solicita atenderlas de manera prioritaria y enviar el registro fotográfico de la corrección. De no subsanarse dentro del plazo establecido, ' +
        'se procederá con el descuento correspondiente en la factura, conforme a lo establecido en el contrato.\n\nQuedamos atentos.\nInterventoría del Área de Servicios de Aseo');
});

test('reiteración: un solo día, sin plazo, y nada si no hay pendientes', () => {
    const t = textoReiteracion([v('Z1CC0022', '22', '4', '14/11/2026', ['SECTORES SIN INTERVENIR'])], {}, { hora: 9, hoy: '18/11/2026', plazo: false });
    assert.match(t, /^¡Buenos días!/);
    assert.match(t, /reportadas el 14\/11\/2026 en 1 lote,/);
    assert.match(t, /\* Sectores sin intervenir\n/);
    assert.doesNotMatch(t, /Plazo|dentro del plazo/);
    assert.equal(textoReiteracion([v('Z1', '1', '4', '14/11/2026', [], { ESTADO: 'SUBSANADO' })], {}, {}), '');
    assert.deepEqual(Object.keys(FORMATOS_PEND), ['reiteracion', 'resumen']);
});
