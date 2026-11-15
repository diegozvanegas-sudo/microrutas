import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreSeguro, nombreVisible, carpeta, crearAnexos, SIN_ACTIVAR } from '../src/requerimiento/anexos.js';
import { PLAZO_REQ, habiles, fechaListo, aIso, candidatas, porCuadrilla, yaRequeridas, armar, plantillaPara, rotuloVisita, EVID_ENVIO } from '../src/requerimiento/listos.js';

const visita = (id, mr, lote, cuad, fecha, estado, extra) => Object.assign({ ID: id, MICRORRUTA: mr, LOTE: lote, CUADRILLA: cuad, ZONA: 'Zona 1',
    'FECHA DE LA VISITA': fecha, ESTADO: estado, 'OBSERVACIONES NOVEDADES': '', BORDEO: 'SI' }, extra);
const itemsNo = (r) => ['BORDEO', 'RECOLECCIÓN'].filter((i) => r[i] === 'NO');
const HOY = '2026-11-14';   // sábado

test('habiles: de lunes a sábado, el domingo no cuenta', () => {
    assert.equal(PLAZO_REQ, 8);
    assert.equal(habiles('2026-11-05', '2026-11-14'), 8);   // jueves 5 → vie, sáb, lun, mar, mié, jue, vie, sáb
    assert.equal(habiles('2026-11-06', '2026-11-14'), 7);
    assert.equal(habiles('2026-11-14', '2026-11-14'), 0);
    assert.equal(fechaListo('2026-11-05'), '2026-11-14');
    assert.equal(fechaListo('2026-11-07'), '2026-11-17');   // sábado 7 → martes 17
    assert.equal(aIso('05/11/2026'), '2026-11-05');
});

test('candidatas: pendientes de posoperación con sus días hábiles; a los 8 quedan listas', () => {
    const regs = [
        visita('SUB-1', 'Z1CC0125', '98', 'C6', '05/11/2026', 'PENDIENTE', { BORDEO: 'NO', 'OBSERVACIONES NOVEDADES': 'PENDIENTE POR SUBSANAR - césped disparejo' }),
        visita('SUB-2', 'Z1CC0051', '53', '7', '06/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-3', 'Z1CC0048', '48', '6', '03/11/2026', 'SUBSANADO', { BORDEO: 'SI' }),
        visita('SUB-4', 'Z1CC0049', '49', '6', '02/11/2026', 'SIN NOVEDAD'),
        visita('OPE-5', 'Z1CC0050', '50', '6', '02/11/2026', 'PENDIENTE', { TIPO: 'OPERACIÓN' }),
        visita('SUB-6', 'Z1CC0136', 'NA', '6', '20/11/2026', 'PENDIENTE', { BORDEO: 'NO' })   // fecha futura mal digitada: no entra
    ];
    const c = candidatas(regs, HOY, itemsNo);
    assert.deepEqual(c.map((v) => v.id), ['SUB-1', 'SUB-2']);
    assert.deepEqual([c[0].dias, c[0].listo, c[0].faltan], [8, true, 0]);
    assert.deepEqual([c[1].dias, c[1].listo, c[1].faltan, c[1].cumple], [7, false, 1, '2026-11-16']);
    assert.equal(c[0].cuad, '6');
    assert.equal(c[0].zona, '1');
    assert.deepEqual(c[0].novedades, ['BORDEO', 'césped disparejo']);
    assert.equal(rotuloVisita(c[0]), 'Z1CC0125 (98)');
});

test('candidatas: lote no realizado cuenta mientras no haya una visita posterior de ese lote', () => {
    const noReal = visita('SUB-7', 'Z2CC0188', '386', '2', '02/11/2026', 'SIN NOVEDAD', { 'OBSERVACIONES NOVEDADES': 'Lote no realizado' });
    let c = candidatas([noReal], HOY, itemsNo);
    assert.deepEqual([c[0].tipo, c[0].listo, c[0].dias], ['norealizado', true, 11]);
    assert.deepEqual(c[0].novedades, ['Lote no realizado']);
    // Ya volvieron y lo revisaron: el «no realizado» viejo deja de contar
    c = candidatas([noReal, visita('SUB-8', 'Z2CC0188', '386', '2', '10/11/2026', 'SIN NOVEDAD')], HOY, itemsNo);
    assert.equal(c.length, 0);
});

test('porCuadrilla y yaRequeridas', () => {
    const c = candidatas([
        visita('SUB-1', 'Z1CC0125', '98', '6', '05/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-2', 'Z1CC0051', '53', '7', '06/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-9', 'Z1CC0052', '54', '6', '02/11/2026', 'PENDIENTE', { BORDEO: 'NO' })
    ], HOY, itemsNo);
    const g = porCuadrilla(c);
    assert.deepEqual(g.map((x) => [x.cuad, x.visitas.length, x.listas]), [['6', 2, 2], ['7', 1, 0]]);
    assert.equal(g[0].visitas[0].id, 'SUB-9');   // la que más días lleva, primero
    const ya = yaRequeridas([{ id: 'R1', radicado: 'EVM-12', estado: 'Enviado', visitas: ['SUB-1'] }, { id: 'R2', visitas: ['SUB-1', 'SUB-2'] }, { id: 'R3' }]);
    assert.deepEqual(ya['SUB-1'], { id: 'R1', radicado: 'EVM-12', estado: 'Enviado' });
    assert.equal(ya['SUB-2'].estado, 'Borrador');
    assert.equal(ya['SUB-9'], undefined);
});

test('armar: el requerimiento sale con cuadrillas, zonas, fechas, microrrutas y evidencias', () => {
    const c = candidatas([
        visita('SUB-1', 'Z1CC0125', '98', '6', '05/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-2', 'Z3CC0006', '57', '7', '03/11/2026', 'PENDIENTE', { RECOLECCIÓN: 'NO' })
    ], HOY, itemsNo);
    const d = armar(c, { id: 'viejo', tipo: 'Hallazgo', plazo: 5, descripcion: '', obligaciones: [] }, HOY);
    assert.equal(d.id, null);
    assert.equal(d.asunto, 'Novedades en posoperación sin corrección · cuadrillas 6 y 7');
    assert.equal(d.ruta, 'Z3CC0006 (57), Z1CC0125 (98)');
    assert.deepEqual(d.zonas, ['1', '3']);
    assert.deepEqual([d.eventoDesde, d.eventoHasta, d.fecha], ['2026-11-03', '2026-11-05', HOY]);
    assert.deepEqual(d.novedades[0], { micro: 'Z3CC0006', fecha: '2026-11-03', tipos: ['RECOLECCIÓN'] });
    assert.deepEqual(d.visitas, ['SUB-2', 'SUB-1']);
    assert.equal(d.evidencias[1].titulo, EVID_ENVIO);
    assert.match(d.evidencias[1].texto, /Z3CC0006 \(57\): novedades enviadas el 03\/11\/2026, 10 días hábiles sin corrección\./);
    assert.equal(d.plazo, 5);
    const nr = armar(candidatas([visita('SUB-7', 'Z2CC0188', '386', '2', '02/11/2026', 'SIN NOVEDAD', { 'OBSERVACIONES NOVEDADES': 'LOTE NO REALIZADO' })], HOY, itemsNo), {}, HOY);
    assert.equal(nr.asunto, 'Microrrutas no ejecutadas · cuadrilla 2');
    assert.match(nr.evidencias[1].texto, /reportado como no realizado el 02\/11\/2026/);
});

test('anexos: nombres de archivo y carpetas que acepta el almacenamiento; lo que pasa si falta la migración', async () => {
    assert.equal(nombreSeguro('Captura de pantalla 2026-11-05 (envío).PNG', 1000), 'rs-Captura-de-pantalla-2026-11-05-envio.jpg');
    assert.equal(nombreSeguro('', 1000), 'rs-anexo.jpg');
    assert.equal(nombreVisible('rs-Captura-de-pantalla-envio.jpg'), 'Captura de pantalla envio');
    assert.equal(carpeta('SUB-00042'), 'SUB-00042');
    assert.equal(carpeta('../otra visita'), '_otra_visita');
    const con = (r) => crearAnexos({ storage: { from: () => ({ list: async () => r, remove: async () => r }) } });
    assert.deepEqual(await con({ data: [{ name: 'rs-pantallazo.jpg', id: '1' }, { name: '.emptyFolderPlaceholder', id: '2' }] }).listar(['SUB-1']),
        { 'SUB-1': [{ nombre: 'pantallazo', ruta: 'SUB-1/rs-pantallazo.jpg' }] });
    await assert.rejects(con({ error: { message: 'Bucket not found' } }).listar(['SUB-1']), new RegExp('0023_anexos_visitas'));
    await assert.rejects(con({ data: [] }).borrar('SUB-1/x.jpg'), /Solo quien subió/);
    assert.match(SIN_ACTIVAR, /0023/);
});

test('plantillaPara: elige la plantilla del caso si existe', () => {
    const P = [{ id: 'residuos', nombre: 'Residuos a las 8 h', asunto: 'Residuos sin recoger' }, { id: 'posop', nombre: 'Novedades en posoperación sin corrección', asunto: '' }, { id: 'noej', nombre: 'Microrrutas', asunto: 'Lotes no ejecutados en la quincena' }];
    assert.equal(plantillaPara([{ tipo: 'novedad' }], P), 'posop');
    assert.equal(plantillaPara([{ tipo: 'norealizado' }], P), 'noej');
    assert.equal(plantillaPara([{ tipo: 'novedad' }], [P[0]]), '');
});
