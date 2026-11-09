import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPlantillas, numerosAns, firma, rellenar, pendientes, fechaEvento } from '../src/requerimiento/plantillas.js';
import { armarPdf, partir, limpiar, enLetras } from '../src/requerimiento/pdf.js';

// Filas como las devuelve convenio_secciones (datos inventados, no los del contrato)
const FILAS = [
    { id: '_documento', orden: 0, tipo: 'meta', titulo: 'Plantillas', items: [{ t: 'x' }] },
    { id: '_config', orden: 1, tipo: 'config', titulo: 'Datos', items: [{ clave: 'contratista', t: 'CONTRATISTA S.A.' }, { clave: 'firma', t: 'ANA PÉREZ|Coordinadora' }, { clave: 'firma', t: 'LUIS GÓMEZ|Inspector' }, { clave: 'copia', t: 'Sra. Jefe' }] },
    { id: 'ans', orden: 2, tipo: 'tabla', titulo: 'ANS', items: [{ clave: 'ANS 2', t: 'Texto del ANS 2.' }, { clave: 'ANS 12', t: 'Texto del ANS 12.' }] },
    { id: 'p1', orden: 3, tipo: 'plantilla', titulo: 'Barrido', icono: '🧹', items: [
        { clave: 'tipo', t: 'Hallazgo' }, { clave: 'asunto', t: 'Asunto uno' }, { clave: 'descripcion', t: 'En [microrruta y lote] el [fecha].' },
        { clave: 'obligacion', ref: '7.3. Personal', t: 'Cita A' }, { clave: 'obligacion', ref: '7.7. Actividades complementarias', t: 'Cita B' },
        { clave: 'ans', t: '2, 12 y 2' }, { clave: 'solicitud', t: 'Informar causas', ej: 'Informe' }, { clave: 'plazo', t: '5' }] },
    { id: 'p2', orden: 4, tipo: 'plantilla', titulo: 'Otro', items: [{ clave: 'asunto', t: '' }, { clave: 'obligacion', ref: '7.3. Personal', t: 'Cita A' }, { clave: 'plazo', t: '2' }] },
];

test('leerPlantillas: datos fijos, ANS, plantillas y catálogo de obligaciones', () => {
    const r = leerPlantillas(FILAS);
    assert.equal(r.config.contratista[0], 'CONTRATISTA S.A.');
    assert.equal(r.config.firma.length, 2);
    assert.deepEqual(Object.keys(r.ans), ['2', '12']);
    assert.equal(r.plantillas.length, 2);
    const p = r.plantillas[0];
    assert.equal(p.nombre, 'Barrido');
    assert.deepEqual(p.ans, ['2', '12']);
    assert.equal(p.plazo, 5);
    assert.equal(p.obligaciones.length, 2);
    assert.deepEqual(p.solicitudes, [{ t: 'Informar causas', ej: 'Informe' }]);
    assert.equal(r.plantillas[1].asunto, '');
    assert.equal(r.catalogo.length, 2);   // la cita repetida en otra plantilla no se duplica
});
test('utilidades', () => {
    assert.deepEqual(numerosAns('ANS 3, 12 y 29'), ['3', '12', '29']);
    assert.deepEqual(firma('ANA PÉREZ | Coordinadora'), { nombre: 'ANA PÉREZ', cargo: 'Coordinadora' });
    assert.deepEqual(firma('SOLO NOMBRE'), { nombre: 'SOLO NOMBRE', cargo: '' });
    assert.equal(rellenar('Req {radicado} · {asunto} {otro}', { radicado: 'EVM-1', asunto: 'X' }), 'Req EVM-1 · X {otro}');
    assert.deepEqual(pendientes(['En [microrruta y lote] el [fecha].', 'sin nada', '[fecha] otra vez', '[ab]']), ['[microrruta y lote]', '[fecha]']);
    assert.equal(fechaEvento('2026-08-12', ''), '12/08/2026');
    assert.equal(fechaEvento('2026-09-01', '2026-09-02'), '01/09/2026 - 02/09/2026');
    assert.equal(fechaEvento('2026-09-01', '2026-09-01'), '01/09/2026');
    assert.equal(fechaEvento('', ''), '');
});
test('pdf: letras, limpieza y renglones', async () => {
    assert.equal(enLetras(5), 'Cinco (5)');
    assert.equal(enLetras(2), 'Dos (2)');
    assert.equal(enLetras(40), '40');
    assert.equal(limpiar('➢ uno – “dos” ≤ 3\t😀'), '• uno – “dos” <= 3 ');
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const l = partir('uno dos tres cuatro cinco seis siete ocho nueve diez\nsegundo párrafo', f, 10, 100);
    assert.ok(l.length >= 3);
    assert.equal(l[l.length - 1], 'segundo párrafo');
    l.forEach(x => assert.ok(f.widthOfTextAtSize(x, 10) <= 100, x));
    assert.ok(partir('https://muy-largo-sin-espacios.example.com/abcdefghijklmnopqrstuvwxyz0123456789', f, 10, 80).every(x => f.widthOfTextAtSize(x, 10) <= 80));
});
test('pdf: arma el documento completo, también largo y sin membrete', async () => {
    const r = leerPlantillas(FILAS), p = r.plantillas[0];
    const req = { radicado: 'EVM-1', contratista: 'CONTRATISTA S.A.', contrato: 'CW1', servicio: 'Corte de césped', zonas: ['Zona 1', 'Zona 2'], asunto: p.asunto,
        ruta: 'Cuadrilla 4', fechaEvento: '12/08/2026', fechaRequerimiento: '13/08/2026', descripcion: 'Texto largo. '.repeat(400),
        evidenciasTexto: ['Fotos'], evidencias: [], obligaciones: p.obligaciones, ans: p.ans.map(n => ({ clave: 'ANS ' + n, t: r.ans[n] })),
        solicitudes: p.solicitudes, plazo: 5, firmas: r.config.firma.map(firma), copias: r.config.copia, codigo: 'Código X', pie: 'Interventoría' };
    const bytes = await armarPdf(req);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF');
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 3, String(doc.getPageCount()));
    assert.ok(doc.getPages().every(pg => pg.getWidth() === 612 && pg.getHeight() === 792));
});
