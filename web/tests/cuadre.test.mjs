// ✓ Cuadrar pendientes: las filas pegadas del Excel son las únicas pendientes; las demás pendientes de la base se
// subsanan. Con las filas del pantallazo del usuario (18/11/2026). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuadrar, fechaSubsanacion } from '../src/subsanaciones/cuadre.js';
import { leerTabla } from '../src/subsanaciones/tabla.js';
import { fijarItems } from '../src/subsanaciones/estado.js';

const EJI = ['LIMPIEZA PREVIA', 'AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'PLATEO', 'CORTE DE CESPED: DISPAREJO/ALTURA', 'BORDEO',
    'RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'SECTORES SIN INTERVENIR'];
const OPI = ['IMPLEMENTACIÓN Y ESTADO DEL PMT', 'VALLA INFORMATIVA', 'MALLA(S) DE PROTECCIÓN'];
fijarItems(EJI, OPI);

const S9 = Array(9).fill('SI'), NA9 = Array(9).fill('N/A');
const fila = (mr, lote, area, z, c, fe, fv, int, its, obs) => [mr, lote, area, 'CLUS', z, c, fe, fv, int, ...its, obs].join('\t');
// Las filas del pantallazo, como salen al copiarlas del Excel (sin encabezado)
const PANTALLAZO = [
    fila('Z2CC0216', '434', '9.365', '2', '1', '14/11/2026', '18/11/2026', 'JDJG', S9, 'NA'),
    fila('Z2CC0067', '264', '25.538', '2', '1', '14/11/2026', '18/11/2026', 'JDJG', S9, 'NA'),
    fila('Z1CC0043', '43', '2.649', '1', '4', '15/11/2026', '18/11/2026', 'DZ', S9, 'SIN NOVEDAD'),
    fila('Z1CC0042', '42', '525', '1', '4', '15/11/2026', '18/11/2026', 'DZ', NA9, 'LOTE CERRADO'),
    fila('Z1CC0041', '41', '751', '1', '4', '15/11/2026', '18/11/2026', 'DZ', NA9, 'LOTE CERRADO'),
    fila('Z1CC0039', '39', '220', '1', '4', '15/11/2026', '18/11/2026', 'DZ', S9, 'SIN NOVEDAD'),
    fila('Z1CC0103', '113', '2.200', '1', '4', '15/11/2026', '18/11/2026', 'DZ', ['SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'NO', 'SI', 'SI'], 'PENDIENTE POR SUBSANAR'),
].join('\r\n');

const visita = (id, mr, lote, fv, enNo, extra) => Object.assign({ ID: id, TIPO: 'EJECUCIÓN', MICRORRUTA: mr, LOTE: lote, CUADRILLA: '4', 'FECHA DE LA VISITA': fv, ESTADO: enNo.length ? 'PENDIENTE' : 'SIN NOVEDAD' },
    Object.fromEntries(EJI.map((i) => [i, enNo.includes(i) ? 'NO' : 'SI'])), extra);
const BASE = [
    visita('SUB-1', 'Z1CC0103', '113', '18/11/2026', ['RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS']),     // está en la tabla: sigue pendiente
    visita('SUB-2', 'Z1CC0103', '113', '10/11/2026', ['BORDEO']),                                    // otra visita del mismo lote: se subsana
    visita('SUB-3', 'Z1CC0051', '53', '31/10/2026', ['PLATEO', 'SECTORES SIN INTERVENIR']),          // no está: se subsana
    visita('SUB-4', 'Z1CC0046', '46', '05/11/2026', ['AFECTACIÓN A ÁRBOLES']),                       // solo árboles: no se puede
    visita('SUB-5', 'Z2CC0100', '297', '09/11/2026', ['AFECTACIÓN A ÁRBOLES', 'BORDEO']),            // se subsana el bordeo, árboles queda en NO
    visita('SUB-6', 'Z1CC0020', '20', '19/11/2026', ['BORDEO']),                                     // después del último día de la tabla
    visita('SUB-7', 'Z1CC0043', '43', '18/11/2026', []),                                             // sin novedad: no se toca
    visita('OPE-1', 'Z1CC0051', '53', '31/10/2026', [], { TIPO: 'OPERACIÓN', ESTADO: 'PENDIENTE', 'IMPLEMENTACIÓN Y ESTADO DEL PMT': 'NO' }), // operación: no es la fila de lote
];
const ids = (l) => l.map((r) => r.ID).sort();

test('cuadrar: con el pantallazo del usuario solo queda pendiente el lote 113 del 18/11', () => {
    const t = leerTabla(PANTALLAZO, EJI, OPI);
    assert.equal(t.visitas.length, 7);
    const res = cuadrar(BASE, t.visitas, { hastaTabla: true });
    assert.deepEqual(res.pendTabla.map((f) => f.MICRORRUTA), ['Z1CC0103']);
    assert.equal(res.ultimoDia, '20261118');
    assert.deepEqual(ids(res.quedan), ['SUB-1']);
    assert.deepEqual(ids(res.aSubsanar), ['OPE-1', 'SUB-2', 'SUB-3', 'SUB-5']);
    assert.deepEqual(ids(res.conArboles), ['SUB-5']);
    assert.deepEqual(ids(res.arboles), ['SUB-4']);
    assert.deepEqual(ids(res.nuevas), ['SUB-6']);
    assert.deepEqual(res.noEstan, []);
});

test('cuadrar: sin el freno de fecha también se subsanan las más nuevas', () => {
    const res = cuadrar(BASE, leerTabla(PANTALLAZO, EJI, OPI).visitas, { hastaTabla: false });
    assert.ok(ids(res.aSubsanar).includes('SUB-6'));
    assert.deepEqual(res.nuevas, []);
});

test('cuadrar: una pendiente de la tabla que en la base ya está subsanada (o no existe) se avisa', () => {
    const base = [visita('SUB-1', 'Z1CC0103', '113', '18/11/2026', [], { ESTADO: 'SUBSANADO' })];
    const res = cuadrar(base, leerTabla(PANTALLAZO, EJI, OPI).visitas, { hastaTabla: true });
    assert.equal(res.noEstan.length, 1);
    assert.equal(res.noEstan[0].base.ID, 'SUB-1');
    assert.equal(cuadrar([], leerTabla(PANTALLAZO, EJI, OPI).visitas, {}).noEstan[0].base, null);
});

test('cuadrar: sin fecha en la fila se cuadra solo por microrruta', () => {
    const res = cuadrar(BASE, [{ MICRORRUTA: 'z1cc0051', TIPO: 'EJECUCIÓN', ESTADO: 'PENDIENTE' }], {});
    assert.deepEqual(ids(res.quedan), ['SUB-3']);
});

test('fecha de subsanación: la elegida (ayer), pero nunca antes de la visita', () => {
    assert.equal(fechaSubsanacion({ 'FECHA DE LA VISITA': '10/11/2026' }, '2026-11-17'), '17/11/2026');
    assert.equal(fechaSubsanacion({ 'FECHA DE LA VISITA': '18/11/2026' }, '2026-11-17'), '18/11/2026');
    assert.equal(fechaSubsanacion({ 'FECHA DE LA VISITA': '' }, '2026-11-17'), '17/11/2026');
});

test('cuadrar: lista escrita de microrrutas (sin SI / NO): esas quedan pendientes, por microrruta', () => {
    const t = leerTabla('Z1CC0103\nZ1CC0051\n', EJI, OPI);
    const res = cuadrar(BASE, t.visitas, { hastaTabla: true, suelto: !!t.imagen, hoy: '2026-11-18' });
    assert.deepEqual(ids(res.quedan), ['OPE-1', 'SUB-1', 'SUB-2', 'SUB-3']);
    assert.deepEqual(ids(res.aSubsanar), ['SUB-5']);
});

test('cuadrar: de una imagen, la fila mal leída (año 2006, sin ítems) no deja subsanar la pendiente', () => {
    // Así leyó el lector el pantallazo real: año cambiado y los SI / NO ilegibles
    const t = leerTabla('Z1CC0103 2200 | ws | 1 | 4 15/11/2006 | 18/11/2006] oz | sd 9 | pendiente por', EJI, OPI);
    const res = cuadrar(BASE, t.visitas, { hastaTabla: true, suelto: true, hoy: '2026-11-18' });
    assert.ok(ids(res.quedan).includes('SUB-1'));
    assert.equal(res.ultimoDia, '20261118'); // el 2006 no se cree: hasta hoy
    assert.deepEqual(ids(res.nuevas), ['SUB-6']);
});
