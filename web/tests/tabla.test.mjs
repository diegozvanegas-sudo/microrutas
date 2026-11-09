import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerTabla, partirTsv, diasDe } from '../src/subsanaciones/tabla.js';
import { fijarItems, itemsEnNo, itemsSubsanados } from '../src/subsanaciones/estado.js';
import { textoResumen, textoNovedadesDia, textoDia } from '../src/subsanaciones/whatsapp.js';
import { hojasExcel } from '../src/subsanaciones/excel.js';

const EJI = ['LIMPIEZA PREVIA', 'AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'PLATEO', 'CORTE DE CESPED: DISPAREJO/ALTURA', 'BORDEO',
    'RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'SECTORES SIN INTERVENIR'];
const OPI = ['IMPLEMENTACIÓN Y ESTADO DEL PMT', 'VALLA INFORMATIVA', 'MALLA(S) DE PROTECCIÓN', 'DEMARCACIÓN DEL ÁREA DE TRABAJO',
    'CARNET', 'ESTADO DE DOTACIÓN', 'EPP', 'HERRAMIENTAS', 'ROTULACIÓN DE RECIPIENTES', 'MANEJO DE COMBUSTIBLE'];
fijarItems(EJI, OPI);
const tsv = (filas) => filas.map(f => f.join('\t')).join('\r\n');

// Como sale al copiar del Excel de la imagen (encabezados con el texto cortado como en la celda)
const CAB_EJ = ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'CLASIFICACION', 'ZONA', 'CUADRILLA', 'FECHA DE EJECUCIÓN', 'FECHA DE LA VISITA', 'INTERVENTOR',
    'LIMPIEZA PREVIA', 'AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'PLATEO', 'CORTE DE CESPED: DISPAREJO/ALTURA', 'BORDEO',
    'RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'SECTORES SIN INTERVENIR', 'OBSERVACIONES NOVEDADES'];
const FILAS_EJ = [
    ['Z1CC0051', '53', '3.500', 'CLUS', '1', '4', '28/10/2026', '31/10/2026', 'DZ', 'SI', 'SI', 'NO', 'SI', 'SI', 'SI', 'SI', 'SI', 'NO', 'PENDIENTE POR SUBSANAR'],
    ['Z1CC0046', '46', '706', 'CLUS', '1', '4', '29/10/2026', '31/10/2026', 'DZ', 'SI', 'SI', 'NO', 'NO', 'SI', 'SI', 'SI', 'SI', 'NO', 'PENDIENTE POR SUBSANAR'],
    ['Z2CC0115', '312', '12.000', 'CLUS', '2', '2', '3/11/2026', '04/11/2026', 'Dz', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'NO', 'NO', 'PENDIENTE POR SUBSANAR'],
    ['Z2CC0100', '297', '11.532', 'CLUS', '2', '2', '06/11/2026', '09/11/2026', 'DZ', 'SI', 'SI', 'NO', 'SI', 'NO', 'SI', 'SI', 'SI', 'NO', 'PENDIENTE POR SUBSANAR'],
];

test('partirTsv: tabulaciones, comillas con salto de línea y renglones vacíos', () => {
    assert.deepEqual(partirTsv('a\tb\r\n\r\n"x\ny"\t"di ""hola"""\n\t\n'), [['a', 'b'], ['x y', 'di "hola"']]);
});

test('lote ejecutado copiado con encabezado', () => {
    const r = leerTabla(tsv([CAB_EJ, ...FILAS_EJ, ['', '', '']]), EJI, OPI);
    assert.equal(r.encabezado, true);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.visitas.length, 4);
    const v = r.visitas[0];
    assert.equal(v.TIPO, 'EJECUCIÓN');
    assert.equal(v.MICRORRUTA, 'Z1CC0051');
    assert.equal(v.LOTE, '53');
    assert.equal(v.CUADRILLA, '4');
    assert.equal(v['FECHA DE LA VISITA'], '31/10/2026');
    assert.equal(v.ESTADO, 'PENDIENTE');
    assert.equal(v['OBSERVACIONES NOVEDADES'], '');
    assert.deepEqual(itemsEnNo(v), ['LIMPIEZA MANUAL ÁRBOLES', 'SECTORES SIN INTERVENIR']);
    assert.equal(r.visitas[2]['FECHA DE EJECUCIÓN'], '03/11/2026'); // 3/11/2026 con cero
});
test('encabezado en otro orden o cortado: cada columna por su nombre', () => {
    const cab = ['LOTE', 'MICRORUTA', 'FECHA DE LA VISITA', 'CUADRILLA', 'CORTE DE CESPED', 'PLATEO', 'OBSERVACIONES'];
    const r = leerTabla(tsv([cab, ['53', 'z1cc0051', '31/10/2026', '4', 'NO', 'SI', '']]), EJI, OPI);
    assert.equal(r.visitas[0].MICRORRUTA, 'Z1CC0051');
    assert.equal(r.visitas[0].LOTE, '53');
    assert.deepEqual(itemsEnNo(r.visitas[0]), ['CORTE DE CESPED: DISPAREJO/ALTURA']);
});
test('lote ejecutado sin encabezado: el orden del formato', () => {
    const r = leerTabla(tsv(FILAS_EJ), EJI, OPI);
    assert.equal(r.encabezado, false);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.visitas.length, 4);
    assert.ok(r.visitas.every(v => v.TIPO === 'EJECUCIÓN' && v.ESTADO === 'PENDIENTE'));
    assert.deepEqual(itemsEnNo(r.visitas[3]), ['LIMPIEZA MANUAL ÁRBOLES', 'CORTE DE CESPED: DISPAREJO/ALTURA', 'SECTORES SIN INTERVENIR']);
});
test('sin encabezado y con las columnas finales del formato nuevo', () => {
    const f = [...FILAS_EJ[0], '', '2', 'Pendiente'];
    const r = leerTabla(tsv([f]), EJI, OPI);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.visitas[0].ESTADO, 'PENDIENTE');
});

// Formato de operación (la primera imagen)
const FILAS_OP = [
    ['Z2CC0171', '369', '14.482', 'CLUS', '2', '2', '27/10/2026', 'DZ', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'SIN NOVEDAD', 'NA', '0', 'NA'],
    ['Z3CC0062', '191', '11.892', 'CLUS', '3', '5', '19/10/2026', 'SMR', 'SI', 'SI', 'NO', 'NO', 'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 'NOVEDAD SUBSANADA INMEDIATAMENTE', '19/10/2026', '2', '0'],
    ['Z3CC0066', '195', '6.191', 'CLUS', '3', '5', '28/10/2026', 'SMR', 'SI', 'SI', 'SI', 'SI', 'NO', 'SI', 'SI', 'NO', 'SI', 'SI', 'NOVEDAD SUBSANADA EL 29/10/2026', '29/10/2026', '2', '1'],
    ['Z1CC0083', '92', '3.500', 'CLUS', '1', '4', '09/11/2026', 'DZ', 'SI', 'SI', 'SI', 'SI', 'SI', 'NO', 'SI', 'SI', 'SI', 'SI', 'PENDIENTE POR SUBSANAR', '', '1', ''],
];
test('operación sin encabezado: estados por la observación', () => {
    const r = leerTabla(tsv(FILAS_OP), EJI, OPI);
    assert.deepEqual(r.avisos, []);
    const [a, b, c, d] = r.visitas;
    assert.ok(r.visitas.every(v => v.TIPO === 'OPERACIÓN'));
    assert.equal(a.ESTADO, 'SIN NOVEDAD');
    assert.equal(b.ESTADO, 'SUBSANADO');
    assert.equal(b['FECHA SUBSANACIÓN'], '19/10/2026');
    assert.deepEqual(itemsSubsanados(b), ['MALLA(S) DE PROTECCIÓN', 'DEMARCACIÓN DEL ÁREA DE TRABAJO']);
    assert.deepEqual(itemsEnNo(b), []);
    assert.equal(b['OBSERVACIONES NOVEDADES'], '');
    assert.equal(c['FECHA SUBSANACIÓN'], '29/10/2026');
    assert.deepEqual(itemsSubsanados(c), ['CARNET', 'HERRAMIENTAS']);
    assert.equal(d.ESTADO, 'PENDIENTE');
    assert.deepEqual(itemsEnNo(d), ['ESTADO DE DOTACIÓN']);
});
test('operación con encabezado del formato nuevo', () => {
    const cab = ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'CLASIFICACION', 'ZONA', 'CUADRILLA', 'FECHA DE LA VISITA', 'INTERVENTOR', ...OPI,
        'OBSERVACIONES', 'FECHA DE CORRECCION', 'CANTIDAD DE NOVEDADES', 'DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)'];
    const r = leerTabla(tsv([cab, ...FILAS_OP]), EJI, OPI);
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.visitas.map(v => v.ESTADO), ['SIN NOVEDAD', 'SUBSANADO', 'SUBSANADO', 'PENDIENTE']);
    // Al volver a sacar el Excel queda igual que la tabla pegada
    const h = hojasExcel(r.visitas, EJI, OPI)[0], col = (n) => h.cab.indexOf(n);
    const b = h.filas.find(f => f.v[0] === 'Z3CC0062');
    assert.equal(b.v[col('OBSERVACIONES')], 'NOVEDAD SUBSANADA INMEDIATAMENTE');
    assert.equal(b.v[col('CANTIDAD DE NOVEDADES')], 2);
    assert.equal(b.v[col('MALLA(S) DE PROTECCIÓN')], 'NO');
});
test('lote cerrado, no realizado y nota después del estado', () => {
    const base = FILAS_EJ[0].slice(0, 9), si = Array(9).fill('SI');
    const r = leerTabla(tsv([
        [...base, ...Array(9).fill('NA'), 'LOTE CERRADO'],
        [...base, ...si, 'LOTE NO REALIZADO'],
        [...base, ...si.slice(0, 8), 'NO', 'PENDIENTE POR SUBSANAR - falta el costado norte'],
    ]), EJI, OPI);
    assert.equal(r.visitas[0].ESTADO, 'CERRADO');
    assert.equal(r.visitas[1].ESTADO, 'PENDIENTE');
    assert.equal(r.visitas[1]['OBSERVACIONES NOVEDADES'], 'LOTE NO REALIZADO');
    assert.equal(r.visitas[2]['OBSERVACIONES NOVEDADES'], 'falta el costado norte');
});
test('avisa lo que no se entiende', () => {
    const malo = [...FILAS_EJ[0]];
    malo[7] = '31/13/2026'; malo[10] = 'TAL VEZ';
    const r = leerTabla(tsv([malo, FILAS_EJ[1].slice(0, 12)]), EJI, OPI);
    assert.equal(r.visitas.length, 2);
    assert.ok(r.avisos.some(a => /no es una fecha/.test(a)), r.avisos.join('\n'));
    assert.ok(r.avisos.some(a => /TAL VEZ/.test(a)), r.avisos.join('\n'));
    assert.ok(r.avisos.some(a => /columnas/.test(a)), r.avisos.join('\n'));
});

// Texto que saca el lector de imágenes del pantallazo (sin tabulaciones, con letras confundidas)
const OCR = `MICRORRUTA LOTE AREA M2 CLASIFICACION ZONA CUADRILLA FECHA DE FECHA DE INTERVENTOR
Z1CC0051 53 3.500 CLUS 1 4 28/10/2026 31/10/2026 DZ SI SI NO SI SI SI SI SI NO PENDIENTE POR SUBSANAR
Z1CC0119 129 340 CLUS 1 4 29/10/2026 31/10/2026 DZ Sl SI SI SI N0 SI NO NO SI PENDIENTE POR SUBSANAR
Z2CC0091 288 36.823 CLUS 2 2 3/11/2026 04/11/2026 DZ SI SI SI SI SI SI NO NO NO PENDIENTE POR SUBSANAR
Z3CC0066 195 6.191 CLUS 3 5 28/10/2026 SMR SI SI SI SI NO SI SI NO SI SI NOVEDAD SUBSANADA EL 29/10/2026 29/10/2026 2 1
Z2CC0171 369 14.482 CLUS 2 2 27/10/2026 DZ SI SI SI SI SI SI SI SI SI SI SIN NOVEDAD NA 0 NA`;
test('texto de imagen: renglón por renglón', () => {
    const r = leerTabla(OCR, EJI, OPI);
    assert.equal(r.imagen, true);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.visitas.length, 5);
    const [a, b, c, d, e] = r.visitas;
    assert.equal(a.TIPO, 'EJECUCIÓN');
    assert.equal(a['ÁREA M2'], '3.500');
    assert.equal(a.INTERVENTOR, 'DZ');
    assert.deepEqual(itemsEnNo(a), ['LIMPIEZA MANUAL ÁRBOLES', 'SECTORES SIN INTERVENIR']);
    assert.deepEqual(itemsEnNo(b), ['CORTE DE CESPED: DISPAREJO/ALTURA', 'RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS', 'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS']);
    assert.equal(c['FECHA DE EJECUCIÓN'], '03/11/2026');
    assert.equal(d.TIPO, 'OPERACIÓN');
    assert.equal(d.ESTADO, 'SUBSANADO');
    assert.equal(d['FECHA SUBSANACIÓN'], '29/10/2026');
    assert.equal(e.ESTADO, 'SIN NOVEDAD');
    assert.equal(e['OBSERVACIONES NOVEDADES'], '');
});
test('texto de imagen con un ítem perdido avisa', () => {
    const r = leerTabla('Z1CC0051 53 3.500 CLUS 1 4 28/10/2026 31/10/2026 DZ SI SI NO SI SI SI SI NO PENDIENTE POR SUBSANAR', EJI, OPI);
    assert.equal(r.visitas.length, 1);
    assert.match(r.avisos[0], /se leyeron 8 ítems/);
});
test('texto sin ninguna microrruta no da visitas', () => {
    assert.deepEqual(leerTabla('hola\nesto no es una tabla', EJI, OPI).visitas, []);
    assert.deepEqual(leerTabla('', EJI, OPI).visitas, []);
});

test('con lo leído salen los informes de siempre', () => {
    const v = leerTabla(tsv([CAB_EJ, ...FILAS_EJ]), EJI, OPI).visitas;
    assert.deepEqual(diasDe(v), ['2026-11-09', '2026-11-04', '2026-10-31']);
    const res = textoResumen(v);
    assert.match(res, /Novedades posoperación cuadrilla 4/);
    assert.match(res, /Z1CC0051 lote 53\n\n\* Limpieza manual árboles \(Plazo: 5 días\)/);
    const dia = textoNovedadesDia(v.filter(r => r['FECHA DE LA VISITA'] === '31/10/2026'), '31/10/2026', {});
    assert.match(dia, /NOVEDADES POSOPERACION\nFecha: 31\/10\/2026\nCuadrilla: 4/);
    assert.match(dia, /REQUERIMIENTOS/);
    assert.match(textoDia(v, '31/10/2026'), /lotes revisados/);
});
