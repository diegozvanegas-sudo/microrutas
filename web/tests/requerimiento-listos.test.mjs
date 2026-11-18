import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreSeguro, nombreVisible, carpeta, crearAnexos, SIN_ACTIVAR, tipoDe, paraBorrar, seBorra, carpetaReporte } from '../src/requerimiento/anexos.js';
import { AVISO, textoPreaviso, PLAZO_REQ, habiles, fechaListo, esHabil, aIso, candidatas, porCuadrilla, yaRequeridas, armar, plantillaPara, rotuloVisita, EVID_ENVIO } from '../src/requerimiento/listos.js';

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
    assert.equal(fechaListo('2026-11-07'), '2026-11-18');   // sábado 7 → miércoles 18 (el lunes 16 es festivo)
    assert.equal(aIso('05/11/2026'), '2026-11-05');
});

test('habiles: los festivos de Colombia no cuentan', () => {
    // Lunes 2/11/2026 (Todos los Santos, corrido) y lunes 16/11/2026 (Independencia de Cartagena, corrido)
    assert.equal(esHabil('2026-11-02'), false);
    assert.equal(esHabil('2026-11-16'), false);
    assert.equal(esHabil('2026-11-15'), false);   // domingo
    assert.equal(esHabil('2026-11-14'), true);    // sábado
    assert.equal(esHabil('2026-11-11'), true);    // el 11 se corrió al lunes 16
    // Visita del sábado 31/10: el lunes 2 no cuenta → del 3 al 7 y del 9 al 11 son 8 → miércoles 11 (antes martes 10)
    assert.equal(habiles('2026-10-31', '2026-11-15'), 11);
    assert.equal(fechaListo('2026-10-31'), '2026-11-11');
    // Visita del miércoles 4/11: 5, 6, 7, 9, 10, 11, 12, 13 → viernes 13 (no hay festivo en medio)
    assert.equal(fechaListo('2026-11-04'), '2026-11-13');
    // Visita del lunes 9/11: el lunes 16 no cuenta → jueves 19 (antes miércoles 18)
    assert.equal(fechaListo('2026-11-09'), '2026-11-19');
    // Fin de año: 25/12 y 1/1 no cuentan
    assert.equal(fechaListo('2026-12-22'), '2027-01-02');
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
    assert.deepEqual([c[1].dias, c[1].listo, c[1].faltan, c[1].cumple], [7, false, 1, '2026-11-17']);   // el lunes 16 es festivo
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

test('armar: el de una visita antes del plazo (📨 Crear requerimiento) no dice «sin corrección»', () => {
    const hoyTxt = HOY.slice(8, 10) + '/' + HOY.slice(5, 7) + '/' + HOY.slice(0, 4);
    const c = candidatas([visita('SUB-9', 'Z2CC0300', '521', '2', hoyTxt, 'PENDIENTE', { 'AFECTACIÓN A ÁRBOLES': 'NO' })], HOY, itemsNo);
    assert.equal(c.length, 1);
    assert.equal(c[0].listo, false);
    const d = armar(c, {}, HOY);
    assert.match(d.evidencias[1].texto, /Z2CC0300 \(521\): novedades enviadas el \d\d\/\d\d\/\d{4} \(0 días hábiles desde la visita\)\./);
    assert.doesNotMatch(d.evidencias[1].texto, /sin corrección/);
    assert.deepEqual(d.visitas, ['SUB-9']);
});

test('anexos: nombres de archivo y carpetas que acepta el almacenamiento; lo que pasa si falta la migración', async () => {
    assert.equal(nombreSeguro('Captura de pantalla 2026-11-05 (envío).PNG', 1000), 'rs-Captura-de-pantalla-2026-11-05-envio.jpg');
    assert.equal(nombreSeguro('', 1000), 'rs-anexo.jpg');
    assert.equal(nombreVisible('rs-Captura-de-pantalla-envio.jpg'), 'Captura de pantalla envio');
    assert.equal(carpeta('SUB-00042'), 'SUB-00042');
    assert.equal(carpeta('../otra visita'), '_otra_visita');
    const con = (r) => crearAnexos({ storage: { from: () => ({ list: async () => r, remove: async () => r }) } });
    assert.deepEqual(await con({ data: [{ name: 'rs-pantallazo.jpg', id: '1' }, { name: '.emptyFolderPlaceholder', id: '2' }] }).listar(['SUB-1']),
        { 'SUB-1': [{ nombre: 'pantallazo', ruta: 'SUB-1/rs-pantallazo.jpg', tipo: 'envio', fecha: '' }] });
    await assert.rejects(con({ error: { message: 'Bucket not found' } }).listar(['SUB-1']), new RegExp('0023_anexos_visitas'));
    await assert.rejects(con({ data: [] }).borrar('SUB-1/x.jpg'), /Solo quien subió/);
    assert.match(SIN_ACTIVAR, /0023/);
});

test('anexos: cada imagen guarda su tipo (reporte, envío, pre aviso) y se borra al mes salvo si la visita espera requerimiento', async () => {
    assert.equal(nombreSeguro('Recorte 2026-11-17.png', 1000, 'reporte'), 'rs-reporte_Recorte-2026-11-17.jpg');
    assert.equal(tipoDe('rs-reporte_Recorte.jpg'), 'reporte');
    assert.equal(tipoDe('rs-preaviso_x.jpg'), 'preaviso');
    assert.equal(tipoDe('rs-pantallazo-viejo.jpg'), 'envio');   // los de antes cuentan como envío
    assert.equal(nombreVisible('rs-reporte_Recorte-de-pantalla.jpg'), 'Recorte de pantalla');
    assert.equal(nombreSeguro('x', 1000, 'otro'), 'rs-x.jpg');   // tipo desconocido: sin tipo
    assert.equal(seBorra('2026-11-01T10:00:00Z'), '2026-12-01');
    const ahora = Date.parse('2026-12-17T12:00:00Z'), viejo = '2026-11-10T00:00:00Z', nuevo = '2026-12-10T00:00:00Z';
    const por = { 'SUB-1': [{ ruta: 'SUB-1/a.jpg', fecha: viejo }, { ruta: 'SUB-1/b.jpg', fecha: nuevo }], 'SUB-2': [{ ruta: 'SUB-2/c.jpg', fecha: viejo }], 'SUB-3': [{ ruta: 'SUB-3/d.jpg', fecha: '' }] };
    assert.deepEqual(paraBorrar(por, ahora, { 'SUB-2': true }), ['SUB-1/a.jpg']);
    // limpiar: lista las carpetas, borra lo vencido y cuenta lo que no dejó borrar (de otra persona)
    const quitados = [];
    const sb = { storage: { from: () => ({
        list: async (dir) => dir === '' ? { data: [{ name: 'SUB-1', id: null }, { name: 'SUB-2', id: null }] } : { data: por[dir].map((a) => ({ name: a.ruta.split('/')[1], id: '1', created_at: a.fecha })) },
        remove: async (rutas) => { quitados.push(...rutas); return { data: rutas.slice(0, 1).map((r) => ({ name: r })) }; }
    }) } };
    assert.deepEqual(await crearAnexos(sb).limpiar({}, ahora), { borrados: 1, sinPermiso: 1 });
    assert.deepEqual(quitados, ['SUB-1/a.jpg', 'SUB-2/c.jpg']);
});

test('anexos: la imagen del reporte de la cuadrilla va en una carpeta por fecha de ejecución y cuadrilla', () => {
    assert.equal(carpetaReporte('2026-11-15', '2'), 'REP-2026-11-15-C2');
    assert.equal(carpetaReporte('2026-11-15', 'C 2'), 'REP-2026-11-15-C2');
    assert.equal(carpetaReporte('2026-11-15', ''), 'REP-2026-11-15-C0');
    assert.equal(carpetaReporte('', '2'), '');
    // La visita sabe su fecha de ejecución para encontrarla
    const c = candidatas([visita('SUB-1', 'Z2CC0300', '521', '2', '06/11/2026', 'PENDIENTE', { BORDEO: 'NO', 'FECHA DE EJECUCIÓN': '05/11/2026' })], HOY, itemsNo);
    assert.equal(carpetaReporte(c[0].ejec, c[0].cuad), 'REP-2026-11-05-C2');
});

test('pre aviso: a los 5 días hábiles sin corregir, con el día en que pasa a requerimiento', () => {
    assert.equal(AVISO, 5);
    // HOY sábado 14/11: el 06/11 (viernes) lleva 6 días hábiles (pre aviso); el 03/11, 10 (ya listo); el 12/11, 2 (en plazo)
    const c = candidatas([
        visita('SUB-1', 'Z2CC0300', '521', '2', '06/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-2', 'Z3CC0006', '57', '2', '03/11/2026', 'PENDIENTE', { BORDEO: 'NO' }),
        visita('SUB-3', 'Z3CC0007', '58', '2', '12/11/2026', 'PENDIENTE', { BORDEO: 'NO' })
    ], HOY, itemsNo);
    const por = Object.fromEntries(c.map((v) => [v.id, v]));
    assert.deepEqual([por['SUB-1'].preaviso, por['SUB-2'].preaviso, por['SUB-3'].preaviso], [true, false, false]);
    assert.equal(por['SUB-2'].listo, true);
    const t = textoPreaviso('2', [por['SUB-1']]);
    assert.match(t, /PRE AVISO · Cuadrilla 2/);
    assert.match(t, /• Lote 521 \(Z2CC0300\) · visita del 06\/11\/2026: BORDEO · pasa a requerimiento el \d\d\/11\/2026/);
    assert.match(t, /5 días hábiles o más sin corregir/);
});

test('plantillaPara: elige la plantilla del caso si existe', () => {
    const P = [{ id: 'residuos', nombre: 'Residuos a las 8 h', asunto: 'Residuos sin recoger' }, { id: 'posop', nombre: 'Novedades en posoperación sin corrección', asunto: '' }, { id: 'noej', nombre: 'Microrrutas', asunto: 'Lotes no ejecutados en la quincena' }];
    assert.equal(plantillaPara([{ tipo: 'novedad' }], P), 'posop');
    assert.equal(plantillaPara([{ tipo: 'norealizado' }], P), 'noej');
    assert.equal(plantillaPara([{ tipo: 'novedad' }], [P[0]]), '');
});
