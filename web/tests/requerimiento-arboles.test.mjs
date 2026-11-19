// Requerimiento de afectación a árboles (no subsanable): tabla con lote, fecha de ejecución y número de árboles, descripción
// que se llena sola, y el armado automático solo con las heridas (lo subsanable de la misma visita sigue su plazo).
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoPeriodo, filasArboles, rellenarArboles, arbolesEn, aFilaArboles, leerFilasNovedades, leerPlantillas } from '../src/requerimiento/plantillas.js';
import { candidatas, armarArboles, hayArboles, plantillaPara, yaRequeridas } from '../src/requerimiento/listos.js';
import { armarPdf } from '../src/requerimiento/pdf.js';
import { armarDocx } from '../src/requerimiento/word.js';

// La tabla del requerimiento de muestra (primera quincena de octubre de 2025, 20 árboles)
const MUESTRA = [
    ['Z2CC0082', '279', '2025-10-02', 1], ['Z2CC0091', '288', '2025-10-02', 4], ['Z2CC0203', '404', '2025-10-06', 2],
    ['Z2CC0001', '1167', '2025-10-06', 5], ['Z2CC0205', '408', '2025-10-06', 1], ['Z2CC0178', '376', '2025-10-07', 1],
    ['Z5CC0045', '865', '2025-10-08', 3], ['Z5CC0077', '', '2025-10-08', 1], ['Z2CC0113', '310', '2025-10-12', 2]
].map(([micro, lote, ejec, arboles]) => ({ micro, lote, ejec, fecha: ejec, arboles, tipos: [] }));

test('periodo: quincena, mes, un día o rango entre meses', () => {
    assert.equal(textoPeriodo(['2025-10-02', '2025-10-12']), 'la primera quincena del mes de octubre de 2025');
    assert.equal(textoPeriodo(['2025-10-16', '2025-10-30']), 'la segunda quincena del mes de octubre de 2025');
    assert.equal(textoPeriodo(['2025-10-02', '2025-10-20']), 'el mes de octubre de 2025');
    assert.equal(textoPeriodo(['2025-10-02']), 'el 02/10/2025');
    assert.equal(textoPeriodo(['2025-10-12', '2025-09-28']), 'el periodo comprendido entre el 28/09/2025 y el 12/10/2025');
    assert.equal(textoPeriodo(['', null]), '');
});

test('tabla de árboles: lote NA si no hay, fecha dd/mm/aaaa y total', () => {
    const t = filasArboles(MUESTRA);
    assert.equal(t.filas.length, 9);
    assert.equal(t.total, 20);
    assert.deepEqual(t.filas[7], { micro: 'Z5CC0077', lote: 'NA', ejec: '08/10/2025', arboles: '1' });
    assert.deepEqual(filasArboles([{ micro: 'Z1CC0001' }]), { filas: [{ micro: 'Z1CC0001', lote: 'NA', ejec: '', arboles: '' }], total: 0 });
});

test('descripción: {periodo}, {contrato}, {arboles} y {microrrutas} se llenan con la tabla', () => {
    const t = 'En {periodo} al contrato {contrato}, daños en la base de {arboles} en {microrrutas}.';
    assert.equal(rellenarArboles(t, MUESTRA, 'CW000000'), 'En la primera quincena del mes de octubre de 2025 al contrato CW000000, daños en la base de 20 árboles en 9 microrrutas.');
    assert.equal(rellenarArboles(t, [{ micro: 'Z1CC0001', fecha: '2025-10-02', arboles: 1 }], ''), 'En el 02/10/2025 al contrato [contrato], daños en la base de un árbol en una microrruta.');
    // Sin número de árboles ni fechas: lo que falta queda entre corchetes (sale en los avisos)
    assert.equal(rellenarArboles('{periodo} · {arboles}', [{ micro: 'Z1CC0001' }], 'X'), '[periodo de las verificaciones] · varios árboles');
});

test('pegar la tabla del informe (Excel) y el mensaje de WhatsApp en la tabla de árboles', () => {
    const excel = leerFilasNovedades('Z2CC0082\t279\t02/10/2025\t1\nZ5CC0077\tNA\t08/10/2025\t1\nZ2CC0113\t310\t12/10/2025\t2').map(aFilaArboles);
    assert.deepEqual(excel.map((f) => [f.micro, f.lote, f.ejec, f.arboles]), [['Z2CC0082', '279', '2025-10-02', 1], ['Z5CC0077', '', '2025-10-08', 1], ['Z2CC0113', '310', '2025-10-12', 2]]);
    const wa = leerFilasNovedades('Z2CC0091 (288) 02/10/2025\n• Herida en la base de 4 árboles').map(aFilaArboles)[0];
    assert.deepEqual([wa.lote, wa.arboles, wa.tipos], ['288', 4, ['Herida en la base de 4 árboles']]);
    assert.equal(arbolesEn(['Afectación a árboles', 'se ven 3 individuos con herida']), 3);
    assert.equal(arbolesEn(['Afectación a árboles']), 0);
});

test('leerPlantillas: la plantilla de árboles sale con su tabla aunque no traiga el campo', () => {
    const P = leerPlantillas([{ id: 'arboles', orden: 1, tipo: 'plantilla', titulo: 'Árboles', items: [{ clave: 'asunto', t: 'A' }] },
        { id: 'otra', orden: 2, tipo: 'plantilla', titulo: 'Otra', items: [{ clave: 'tabla', t: 'arboles' }] },
        { id: 'normal', orden: 3, tipo: 'plantilla', titulo: 'Normal', items: [] }]);
    assert.deepEqual(P.plantillas.map((p) => p.tabla), ['arboles', 'arboles', '']);
});

const visita = (id, mr, lote, cuad, fecha, extra) => Object.assign({ ID: id, MICRORRUTA: mr, LOTE: lote, CUADRILLA: cuad, ZONA: 'Zona 2',
    'FECHA DE LA VISITA': fecha, 'FECHA DE EJECUCIÓN': fecha, ESTADO: 'PENDIENTE', 'OBSERVACIONES NOVEDADES': '' }, extra);
const itemsNo = (r) => ['AFECTACIÓN A ÁRBOLES', 'BORDEO'].filter((i) => r[i] === 'NO');
const HOY = '2026-11-14';

test('candidatas: la de árboles va de una; si la visita también tiene algo subsanable, eso sigue su plazo aparte', () => {
    const c = candidatas([
        visita('SUB-1', 'Z2CC0082', '279', '3', '12/11/2026', { 'AFECTACIÓN A ÁRBOLES': 'NO', 'OBSERVACIONES NOVEDADES': 'PENDIENTE POR SUBSANAR - herida en la base de 3 árboles' }),
        visita('SUB-2', 'Z2CC0091', '288', '3', '12/11/2026', { 'AFECTACIÓN A ÁRBOLES': 'NO', BORDEO: 'NO' }),
        visita('SUB-3', 'Z2CC0100', '300', '3', '12/11/2026', { BORDEO: 'NO' })
    ], HOY, itemsNo);
    const de = (clave) => c.find((v) => v.clave === clave);
    // Solo árboles: una sola, lista de una y con los árboles leídos de la observación
    assert.deepEqual([de('SUB-1').noSubsanable, de('SUB-1').listo, de('SUB-1').arboles], [true, true, 3]);
    // Árboles + bordeo: se parte en dos
    assert.deepEqual([de('SUB-2|arboles').noSubsanable, de('SUB-2|arboles').listo, de('SUB-2|arboles').novedades], [true, true, ['AFECTACIÓN A ÁRBOLES']]);
    assert.deepEqual([de('SUB-2').noSubsanable, de('SUB-2').listo, de('SUB-2').novedades], [false, false, ['BORDEO']]);
    assert.equal(c.filter((v) => v.id === 'SUB-2').length, 2);
    assert.deepEqual([de('SUB-3').noSubsanable, de('SUB-3').listo], [false, false]);

    // El requerimiento sale solo con las heridas
    const sel = c.filter((v) => v.listo);
    assert.ok(hayArboles(sel));
    const d = armarArboles(c, { evidencias: [] }, HOY);
    assert.equal(d.tabla, 'arboles');
    assert.equal(d.asunto, 'Novedad por afectación a la base de árboles en la operación de corte de césped');
    assert.deepEqual(d.novedades.map((n) => [n.micro, n.lote, n.ejec, n.arboles]), [['Z2CC0082', '279', '2026-11-12', 3], ['Z2CC0091', '288', '2026-11-12', '']]);
    assert.deepEqual(d.visitas, ['SUB-1', 'SUB-2|arboles']);
    assert.ok(!/sin corrección/.test(d.evidencias[1].texto));
    assert.match(d.evidencias[1].texto, /no subsanable/);
    // Hecho el de árboles, la parte subsanable de SUB-2 sigue libre para su propio requerimiento
    const ya = yaRequeridas([{ id: 'R1', radicado: 'EVM-1', visitas: d.visitas }]);
    assert.ok(ya['SUB-2|arboles'] && !ya['SUB-2'] && ya['SUB-1']);
});

test('plantillaPara: con árboles elige la plantilla de árboles', () => {
    const P = [{ id: 'posop', nombre: 'Novedades en posoperación sin corrección', asunto: '' }, { id: 'arb', nombre: 'Afectación a la base de árboles', tabla: 'arboles', asunto: '' }];
    assert.equal(plantillaPara([{ tipo: 'novedad', noSubsanable: true }], P), 'arb');
    assert.equal(plantillaPara([{ tipo: 'novedad' }], P), 'posop');
    assert.equal(plantillaPara([{ tipo: 'novedad', noSubsanable: true }], [P[0]]), '');
});

const REQ = {
    radicado: 'EVM-0001', contratista: 'CONTRATISTA', contrato: 'CW000000', servicio: 'Corte de césped', zonas: ['Zona 2', 'Zona 5'],
    asunto: 'Novedad por afectación a la base de árboles', ruta: 'NA', fechaEvento: '02/10/2025 - 12/10/2025', fechaRequerimiento: '20/10/2025',
    descripcion: rellenarArboles('Durante las verificaciones realizadas en {periodo} al contrato {contrato}, se evidenciaron daños en la base de {arboles}.', MUESTRA, 'CW000000'),
    tabla: 'arboles', novedades: MUESTRA, constancia: '', gruposEvidencia: [], obligaciones: [], ans: [], solicitudes: [{ t: 'Plan de acción', ej: 'Plan' }],
    plazo: 5, firmas: [], copias: []
};

test('pdf y word: la tabla de árboles con su total', async () => {
    const pdf = await armarPdf(REQ, {});
    assert.ok(pdf.length > 1000);
    const docx = await armarDocx(REQ, {});
    const JSZip = (await import('jszip')).default;
    const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml').async('string');
    ['NÚMERO DE ÁRBOLES AFECTADOS', 'FECHA DE EJECUCIÓN', 'TOTAL ÁRBOLES AFECTADOS', 'Z5CC0077', '1167', 'primera quincena del mes de octubre de 2025']
        .forEach((t) => assert.ok(xml.includes(t), t));
    assert.match(xml, /<w:gridSpan w:val="3"\/>/);
    assert.match(xml, />20</);
    assert.ok(!xml.includes('TIPOS DE NOVEDADES'));
});
