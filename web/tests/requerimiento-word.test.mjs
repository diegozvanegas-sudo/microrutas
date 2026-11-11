// Requerimientos: tabla de microrrutas, evidencias por grupo y Word (.docx). Datos inventados, no los del contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPlantillas, leerFilasNovedades, fechaIso, gruposEvidencia } from '../src/requerimiento/plantillas.js';
import { armarPdf, filasNovedad, gruposPdf } from '../src/requerimiento/pdf.js';
import { armarDocx, medidasImagen, xml } from '../src/requerimiento/word.js';

// PNG de 1×1 y de 2×3 px (válidos) y cabecera JPG mínima con su SOF0 (3×2 px)
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const PNG23 = new Uint8Array(PNG); PNG23[19] = 2; PNG23[23] = 3;   // solo para leer medidas
const JPG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

test('fechaIso: formatos de Excel y de WhatsApp', () => {
    assert.equal(fechaIso('16/10/2026'), '2026-10-16');
    assert.equal(fechaIso('5-9-26'), '2026-09-05');
    assert.equal(fechaIso('15_10_2026'), '2026-10-15');
    assert.equal(fechaIso('2026-10-16'), '2026-10-16');
    assert.equal(fechaIso('31/13/2026'), '');
    assert.equal(fechaIso('hola'), '');
});
test('leerFilasNovedades: columnas de Excel, punto y coma y mensaje de WhatsApp con viñetas', () => {
    const f = leerFilasNovedades([
        'MICRORRUTA\tFECHA\tTIPOS',                                   // encabezado: sin código, se ignora
        'Z4CC0159\t16/10/2026\tLimpieza previa; Barrido.',
        'Buenos días', 'Novedad C7',
        'z7 cc 0058 (603)', '• Barrido de zona verde.', '• corte disparejo.', '• Barrido de zona verde.', '17/10/2026',
        'Z4CC0184 22/10/2026 - Sectores sin intervenir',
        '', 'Hoy 15_10_2026'
    ].join('\n'));
    assert.equal(f.length, 3);
    assert.deepEqual(f[0], { micro: 'Z4CC0159', fecha: '2026-10-16', tipos: ['Limpieza previa', 'Barrido'] });
    assert.deepEqual(f[1], { micro: 'Z7CC0058', fecha: '2026-10-17', tipos: ['Barrido de zona verde', 'Corte disparejo'] });
    assert.deepEqual(f[2], { micro: 'Z4CC0184', fecha: '2026-10-22', tipos: ['Sectores sin intervenir'] });   // «Hoy …» no cambia la fecha ya puesta
    assert.deepEqual(leerFilasNovedades('sin códigos\notra línea'), []);
});
test('filasNovedad y grupos: viñetas, fechas y compatibilidad con lo guardado antes', () => {
    assert.deepEqual(filasNovedad([{ micro: 'Z1CC0001', fecha: '2026-10-16', tipos: ['Barrido', 'Bordeo.', ''] }, { micro: '', tipos: [] }]),
        [{ micro: 'Z1CC0001', fecha: '16/10/2026', tipos: ['• Barrido.', '• Bordeo.'] }]);
    assert.deepEqual(gruposEvidencia({ evidenciasTexto: 'Fotos\n\n Correos ' }), [{ titulo: 'Fotos', texto: '' }, { titulo: 'Correos', texto: '' }]);
    assert.deepEqual(gruposEvidencia({ evidencias: [{ titulo: 'A' }] }), [{ titulo: 'A', texto: '' }]);
    const viejo = gruposPdf({ evidenciasTexto: ['Fotos'], evidencias: [{ bytes: PNG, tipo: 'png' }] });
    assert.equal(viejo.length, 2); assert.equal(viejo[1].fotos.length, 1);
    assert.equal(gruposPdf({ gruposEvidencia: [{ titulo: '', texto: '', fotos: [] }, { titulo: 'B', fotos: [] }] }).length, 1);   // las vacías no salen
});
test('leerPlantillas: constancia y títulos de evidencia de la plantilla', () => {
    const r = leerPlantillas([{ id: 'p', orden: 1, tipo: 'plantilla', titulo: 'Pos', items: [{ clave: 'constancia', t: 'Constancia.' }, { clave: 'evidencias', t: 'Uno\nDos' }] }]);
    assert.equal(r.plantillas[0].constancia, 'Constancia.');
    assert.equal(r.plantillas[0].evidencias, 'Uno\nDos');
});
test('medidasImagen y xml', () => {
    assert.deepEqual(medidasImagen(PNG), { w: 1, h: 1 });
    assert.deepEqual(medidasImagen(PNG23), { w: 2, h: 3 });
    assert.deepEqual(medidasImagen(JPG), { w: 3, h: 2 });
    assert.equal(medidasImagen(new Uint8Array(30)), null);
    assert.equal(xml('a<b & "c"\u0001'), 'a&lt;b &amp; &quot;c&quot;');
});

const REQ = {
    radicado: '', contratista: 'CONTRATISTA S.A.', contrato: 'CW1', servicio: 'Corte de césped', zonas: ['Zona 4'], asunto: 'Novedades sin corrección & otras <x>',
    ruta: 'Cuadrilla 6 y 7', fechaEvento: '15/10/2026 - 21/10/2026', fechaRequerimiento: '29/10/2026', descripcion: 'Párrafo uno.\n\nPárrafo dos.',
    novedades: Array.from({ length: 30 }, (_, i) => ({ micro: 'Z4CC0' + (100 + i), fecha: '2026-10-16', tipos: ['Limpieza previa', 'Barrido'] })),
    constancia: 'La Interventoría deja constancia.',
    gruposEvidencia: [{ titulo: 'Reportes de ejecución.', texto: '', fotos: [{ bytes: PNG, tipo: 'png', pie: '' }, { bytes: PNG, tipo: 'png', pie: 'Lote 1' }, { bytes: PNG, tipo: 'png' }] },
        { titulo: 'Anexos.', texto: 'PDFs de los registros.', fotos: [] }],
    obligaciones: [{ ref: '7.7. Actividades complementarias', t: 'Intro:\n• Limpieza previa: algo.\n• Bordeo: otra.' }], ans: [{ clave: 'ANS 2', t: 'Texto del ANS.' }],
    solicitudes: [{ t: 'Informar', ej: 'Informe' }], soportes: 'Soportes.', plazo: 5, consideracionesRespuesta: 'Resp.', preventivo: 'Prev.',
    firmas: [{ nombre: 'ANA', cargo: 'Coordinadora' }, { nombre: 'LUIS', cargo: 'Inspector', imagen: { bytes: PNG, tipo: 'png' } }, { nombre: 'EVA', cargo: 'Apoyo' }],
    copias: ['Sra. Jefe'], codigo: 'Código X', pie: 'Interventoría'
};
test('pdf: con tabla larga de microrrutas y evidencias por grupo', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(await armarPdf(REQ, { membrete: { bytes: PNG, tipo: 'png' } }));
    assert.ok(doc.getPageCount() >= 3, String(doc.getPageCount()));
});
test('word: paquete .docx completo, con membrete, tabla, fotos, firmas y textos escapados', async () => {
    const JSZip = (await import('jszip')).default;
    const bytes = await armarDocx(REQ, { membrete: { bytes: PNG, tipo: 'png' } });
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
    const z = await JSZip.loadAsync(bytes);
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels', 'word/_rels/header1.xml.rels'])
        assert.ok(z.file(f), 'falta ' + f);
    const doc = await z.file('word/document.xml').async('string');
    assert.ok(doc.includes('Novedades sin corrección &amp; otras &lt;x&gt;'));
    assert.ok(doc.includes('Z4CC0129') && doc.includes('• Barrido.'));
    assert.ok(doc.includes('Evidencia 1. Reportes de ejecución.') && doc.includes('Evidencia 2. Anexos.'));
    assert.ok(doc.includes('Foto 2. Lote 1') && doc.includes('Foto 3'));
    assert.ok(doc.includes('<w:tblHeader/>'));                       // el encabezado de la tabla se repite en cada página
    assert.ok(doc.includes('Cinco (5) días hábiles'));
    assert.ok(doc.includes('EVM-____'));                             // sin radicado queda el espacio resaltado
    // Cada imagen citada en el documento existe en su relación y en la carpeta media: 3 fotos y la firma de LUIS
    const rels = await z.file('word/_rels/document.xml.rels').async('string');
    const ids = [...doc.matchAll(/r:embed="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, 4);
    for (const id of ids) {
        const t = rels.match(new RegExp('Id="' + id + '"[^>]*Target="([^"]+)"'));
        assert.ok(t && z.file('word/' + t[1]), id);
    }
    assert.ok((await z.file('word/header1.xml').async('string')).includes('behindDoc="1"'));
    assert.ok((await z.file('word/footer1.xml').async('string')).includes('NUMPAGES'));
    // Sin etiquetas abiertas: mismo número de <w:p> y </w:p>, de <w:tbl> y </w:tbl>
    assert.equal((doc.match(/<w:p>/g) || []).length, (doc.match(/<\/w:p>/g) || []).length);
    assert.equal((doc.match(/<w:tbl>/g) || []).length, (doc.match(/<\/w:tbl>/g) || []).length);
});
test('word: sin membrete, sin evidencias ni tabla', async () => {
    const JSZip = (await import('jszip')).default;
    const z = await JSZip.loadAsync(await armarDocx({ radicado: 'EVM-1', asunto: 'X' }));
    const doc = await z.file('word/document.xml').async('string');
    assert.ok(doc.includes('Sin evidencias adjuntas.') && !doc.includes('MICRORRUTA'));
    assert.ok(!(await z.file('word/header1.xml').async('string')).includes('<w:drawing>'));
});
