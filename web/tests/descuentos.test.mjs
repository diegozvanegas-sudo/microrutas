// Pruebas de 💸 Descuentos (src/descuentos): áreas, textos por tipo, lo que falta, historial, encuadre de las imágenes y PDF.
// El caso es el documento real «DESCUENTO POR CERRAMIENTO MICRORRUTA Z6CC0153 - 1027» (3.072 − 176 = 2.896 m²).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { TIPOS, tipo, rellenar, faltantes } from '../src/descuentos/tipos.js';
import { areaM2, areaFila, areaActualizada, m2, textoLotes, buscarLote, textoSector, comunaDe, textosDeTipo, revisar, totales,
    nombreArchivo, pieFotos, filasHistorial, aFila, deFila, nuevoId } from '../src/descuentos/descuentos.js';
import { aPixel, recuadro, encuadre, cuadros, urlCuadro, posEtiqueta } from '../src/descuentos/imagen.js';
import { crearGuardado } from '../src/descuentos/guardado.js';
import { armarPdfDescuento } from '../src/descuentos/pdf.js';
import { armarDocxDescuento } from '../src/descuentos/word.js';
import { prepararFormatoDescuento, membreteDeFormato } from '../src/descuentos/formato.js';

// Rectángulo de «norte» × «este» metros con esquina en San Antonio de Prado
var O = [6.1819, -75.649];
function rect(norte, este) {
    var dl = norte / 110574, dn = este / (111320 * Math.cos(O[0] * Math.PI / 180));
    return [[O[0], O[1]], [O[0], O[1] + dn], [O[0] + dl, O[1] + dn], [O[0] + dl, O[1]]];
}
var LOTES = { Z6CC0153: { lote: '1027', area: 3072, cuad: '11', d: 'Cl 10, nº 3-19 y cr 67 # 42sur 82' }, Z6CC0154: { lote: '1030', area: 900, cuad: '11', d: '' } };
function docEjemplo() {
    var d = { id: 'x1', tipo: 'cerramiento', fecha: '2026-11-13', sector: 'el corregimiento San Antonio de Prado',
        campos: { causa: 'un conjunto residencial privado', lugar: 'la Urbanización Plaza del Sol' }, textos: {},
        filas: [{ mr: 'Z6CC0153', lote: '1027', cuad: '11', areaBase: 3072, manual: false, dibujo: rect(11, 16) }], estado: 'borrador' };
    d.textos = textosDeTipo(d.tipo, d);
    return d;
}

test('descuentos: área del dibujo en m² y área que queda', () => {
    assert.ok(Math.abs(areaM2(rect(100, 100)) - 10000) < 15, 'un cuadrado de 100 m mide 10.000 m²');
    assert.ok(Math.abs(areaM2(rect(11, 16)) - 176) < 1);
    assert.equal(areaM2([[6, -75], [6.1, -75]]), 0, 'con menos de 3 puntos no hay área');
    var f = docEjemplo().filas[0];
    assert.equal(areaFila(f), 176);
    assert.equal(areaActualizada(f), 2896);
    // Escrita a mano manda sobre el dibujo
    assert.equal(areaFila(Object.assign({}, f, { manual: true, areaDescontar: 200 })), 200);
    assert.equal(m2(3072), '3.072');
});

test('descuentos: los textos del cerramiento salen como el documento real', () => {
    var t = docEjemplo().textos;
    assert.equal(t.titulo, 'DESCUENTO POR CERRAMIENTO MICRORRUTA Z6CC0153 - 1027');
    assert.equal(t.intro, 'La interventoría del servicio de corte de césped realizó la verificación de la micro ruta Z6CC0153 - 1027, ubicada en el corregimiento San Antonio de Prado, y se evidenció un cerramiento por un conjunto residencial privado, que impide el libre acceso a una parte del área de intervención.');
    assert.equal(t.conclusion, 'Por estas razones, se concluye que no es posible intervenir el tramo indicado.');
    assert.match(t.sitio, /^Lote ubicado en el interior de la Urbanización Plaza del Sol\./);
    // Todos los tipos llenan sus huecos con sus campos; lo que falta se marca
    TIPOS.forEach(function (tp) {
        var campos = {};
        tp.campos.forEach(function (c) { campos[c.clave] = c.ejemplo; });
        var x = textosDeTipo(tp.clave, { filas: [{ mr: 'Z1CC0001', lote: '1' }], campos: campos, sector: 'la comuna Robledo' });
        Object.keys(x).forEach(function (k) { assert.deepEqual(faltantes(x[k]), [], tp.clave + '.' + k); });
    });
    assert.equal(rellenar('en {lugar}', {}), 'en [falta: lugar]');
    assert.deepEqual(faltantes('a [falta: causa] b [falta: lugar] [falta: causa]'), ['causa', 'lugar']);
    assert.equal(tipo('no-existe').clave, 'cerramiento');
});

test('descuentos: lotes, búsqueda y sector', () => {
    assert.equal(textoLotes([{ mr: 'Z6CC0153', lote: '1027' }]), 'Z6CC0153 - 1027');
    assert.equal(textoLotes([{ mr: 'A', lote: '1' }, { mr: 'B', lote: '2' }, { mr: 'C', lote: 'NA' }]), 'A - 1, B - 2 y C');
    ['Z6CC0153', 'z6cc153', '1027', 'Z6CC0153 1027', 'Z6CC0153 - 1027', 'lote 1027'].forEach(function (t) {
        var x = buscarLote(t, LOTES);
        assert.ok(x && x.mr === 'Z6CC0153' && x.lote === '1027' && x.areaBase === 3072 && x.cuad === '11', t);
    });
    assert.equal(buscarLote('Z9CC0001', LOTES), null);
    assert.equal(buscarLote('55555', LOTES), null);
    assert.equal(textoSector('San Antonio de Prado'), 'el corregimiento San Antonio de Prado');
    assert.equal(textoSector('San Cristobal'), 'el corregimiento San Cristobal');
    assert.equal(textoSector('Robledo'), 'la comuna Robledo');
    var comunas = [{ n: 'Robledo', anillos: [rect(10, 10).map(function (p) { return [p[0] + 1, p[1]]; })] }, { n: 'San Antonio de Prado', anillos: [rect(500, 500)] }];
    assert.equal(comunaDe(O[0] + 0.0001, O[1] + 0.0001, comunas), 'San Antonio de Prado');
    assert.equal(comunaDe(0, 0, comunas), '');
});

test('descuentos: qué falta antes de generar', () => {
    var d = docEjemplo();
    assert.deepEqual(revisar(d), []);
    d.filas[0].dibujo = [];
    assert.match(revisar(d)[0], /área a descontar de Z6CC0153 - 1027/);
    d.filas[0].dibujo = rect(100, 100);
    assert.match(revisar(d)[0], /es mayor que su área base/);
    var e = docEjemplo(); e.campos = {}; e.textos = textosDeTipo('cerramiento', e);
    assert.match(revisar(e).join(' '), /llenar en los textos: causa, lugar/);
    assert.match(revisar({ filas: [], textos: {} })[0], /al menos un lote/);
    var sinTexto = docEjemplo(); sinTexto.textos = {};
    assert.match(revisar(sinTexto).join(' '), /el título y el texto del documento/);
});

test('descuentos: totales, nombre del PDF, pie de fotos e historial para Excel', () => {
    var d = docEjemplo();
    d.filas.push({ mr: 'Z6CC0154', lote: '1030', cuad: '11', areaBase: 900, manual: true, areaDescontar: 100, dibujo: [] });
    assert.deepEqual(totales(d.filas), { base: 3972, descontar: 276, actualizada: 3696 });
    assert.equal(nombreArchivo(docEjemplo()), 'Descuento cerramiento Z6CC0153-1027 2026-11-13.pdf');
    assert.equal(pieFotos(d.filas[0]), 'Registro fotográfico de la microrruta Z6CC0153 - 1027');
    var h = filasHistorial([d]);
    assert.equal(h.length, 2);
    assert.deepEqual(h[0], ['13/11/2026', 'Cerramiento', 'Z6CC0153', 1027, '11', 3072, 176, 2896, 'el corregimiento San Antonio de Prado', 'Borrador', 'Dibujo en el mapa']);
    assert.equal(h[1][10], 'A mano');
    // Ida y vuelta por la base: se guarda el área calculada y el dibujo
    var r = deFila(aFila(d));
    assert.equal(r.filas[0].areaDescontar, 176);
    assert.equal(r.filas[0].dibujo.length, 4);
    assert.equal(aFila(d).area_descontar, 276);
    assert.match(nuevoId(), /^[0-9a-f-]{36}$/);
});

test('descuentos: encuadre y cuadros de la foto satelital', () => {
    var p = aPixel(0, 0, 1);
    assert.deepEqual(p.map(Math.round), [256, 256], 'el centro del mundo a zoom 1');
    var b = recuadro([rect(11, 16)]);
    assert.ok(b.lat1 > b.lat0 && b.lon1 > b.lon0);
    assert.equal(recuadro([]), null);
    var e = encuadre(b, 900, 560, 20);
    assert.equal(e.z, 20, 'un área de 176 m² se ve al zoom más cercano');
    var g = encuadre(recuadro([rect(3000, 3000)]), 900, 560, 20);
    assert.ok(g.z < 18, 'un área grande se aleja');
    var c = cuadros(e, 900, 560);
    assert.ok(c.length >= 12 && c.length <= 20, c.length + ' cuadros');
    assert.ok(c.every(function (x) { return x.dx > -256 && x.dx < 900 && x.dy > -256 && x.dy < 560; }));
    assert.match(urlCuadro(c[0]), /^https:\/\/mt[0-3]\.google\.com\/vt\/lyrs=s&x=\d+&y=\d+&z=20$/);
    // La etiqueta de los m² va encima del área (no la tapa); pegada arriba, va debajo
    var area = [[400, 200], [500, 200], [500, 260], [400, 260]];
    assert.deepEqual(posEtiqueta(area, [450, 230], 34, 560), [450, 173]);
    assert.deepEqual(posEtiqueta([[400, 10], [500, 10], [500, 60], [400, 60]], [450, 30], 34, 560), [450, 87]);
    assert.deepEqual(posEtiqueta([], [1, 2], 34, 560), [1, 2]);
});

test('descuentos: el historial queda en el equipo cuando no hay base', async () => {
    var datos = {}, almacen = { getItem: function (k) { return datos[k] || null; }, setItem: function (k, v) { datos[k] = v; } };
    var g = crearGuardado(null, almacen);
    assert.deepEqual((await g.leer()).lista, []);
    var r = await g.guardar(docEjemplo());
    assert.equal(r.donde, 'equipo');
    assert.equal(r.lista.length, 1);
    var d2 = docEjemplo(); d2.estado = 'emitido';
    r = await g.guardar(d2);
    assert.equal(r.lista.length, 1, 'el mismo id reemplaza');
    assert.equal(r.lista[0].estado, 'emitido');
    r = await g.borrar('x1');
    assert.equal(r.lista.length, 0);
});

// Un .docx mínimo «de la institución»: membrete de página completa en el encabezado y un cuadro de texto con el código en el pie
async function formatoDePrueba() {
    var JSZip = (await import('jszip')).default, z = new JSZip();
    var png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    var W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
    var rel = (l) => '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + l + '</Relationships>';
    z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', rel('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'));
    z.file('word/document.xml', '<?xml version="1.0"?><w:document ' + W + '><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr><w:t>Texto viejo que se quita</w:t></w:r></w:p>' +
        '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1963" w:right="1325" w:bottom="2473" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
    z.file('word/_rels/document.xml.rels', rel('<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>'));
    z.file('word/header2.xml', '<?xml version="1.0"?><w:hdr ' + W + '><w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="column"><wp:posOffset>-720090</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-449580</wp:posOffset></wp:positionV><wp:extent cx="7772400" cy="10058400"/><a:graphic><a:graphicData><a:blip r:embed="rIdM"/></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>');
    z.file('word/_rels/header2.xml.rels', rel('<Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image6.png"/>'));
    z.file('word/media/image6.png', png);
    z.file('word/footer2.xml', '<?xml version="1.0"?><w:ftr ' + W + '><w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="column"><wp:posOffset>3414713</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-119693</wp:posOffset></wp:positionV><wp:extent cx="1476375" cy="571500"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>' +
        '<w:p><w:r><w:rPr><w:color w:val="0D0D0D"/><w:sz w:val="16"/></w:rPr><w:t>Código: GD-FR-016</w:t></w:r></w:p><w:p><w:r><w:t>Versión: 14</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:ftr>');
    z.file('word/fonts/font1.odttf', Buffer.alloc(5000, 1));
    z.file('word/fontTable.xml', '<?xml version="1.0"?><w:fonts ' + W + '><w:font w:name="Arial"><w:embedRegular r:id="rIdFont"/></w:font></w:fonts>');
    z.file('word/_rels/fontTable.xml.rels', rel('<Relationship Id="rIdFont" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.odttf"/>'));
    return z.generateAsync({ type: 'uint8array' });
}

test('descuentos: el formato Word se guarda liviano y de él salen el membrete y el pie del PDF', async () => {
    var JSZip = (await import('jszip')).default;
    var f = await prepararFormatoDescuento(await formatoDePrueba());
    var z = await JSZip.loadAsync(f.bytes);
    assert.equal(Object.keys(z.files).filter((n) => /^word\/fonts\//.test(n)).length, 0, 'sin letras incrustadas');
    assert.doesNotMatch(await z.file('word/fontTable.xml').async('string'), /embedRegular/);
    assert.doesNotMatch(await z.file('word/document.xml').async('string'), /Texto viejo/, 'sin el contenido del documento');
    assert.deepEqual(f.datos.margenes, { arriba: 1963, abajo: 2473, izq: 1134, der: 1325 });
    var m = await membreteDeFormato(f.bytes);
    assert.ok(m.fondo && m.fondo.tipo === 'png' && Math.abs(m.fondo.x) < 1 && Math.abs(m.fondo.y) < 1 && Math.abs(m.fondo.w - 612) < 1 && Math.abs(m.fondo.h - 792) < 1, JSON.stringify(m.fondo && { x: m.fondo.x, y: m.fondo.y, w: m.fondo.w, h: m.fondo.h }));
    assert.deepEqual(m.textos[0].lineas, ['Código: GD-FR-016', 'Versión: 14']);
    assert.ok(Math.abs(m.textos[0].x - 325.6) < 0.5 && Math.abs(m.textos[0].y - 733.2) < 0.5, m.textos[0].x + ' ' + m.textos[0].y);
    assert.equal(m.fuente, 'Arial');
    assert.equal(m.tam, 12);
    // PDF con ese formato: el código del pie va en cada hoja
    var pdf = await PDFDocument.load(await armarPdfDescuento(docEjemplo(), { formato: m }));
    assert.ok(pdf.getPageCount() >= 1);
    // Word dentro del formato: conserva encabezado y pie y lleva el texto del descuento
    var w = await JSZip.loadAsync(await armarDocxDescuento(docEjemplo(), { formato: f.bytes, fotos: { 0: [{ bytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')), tipo: 'png' }] } }));
    var doc = await w.file('word/document.xml').async('string');
    assert.match(doc, /DESCUENTO POR CERRAMIENTO MICRORRUTA Z6CC0153 - 1027/);
    assert.match(doc, /Registro fotográfico de la microrruta Z6CC0153 - 1027/);
    assert.match(doc, /<w:headerReference w:type="default" r:id="rIdH"\/>/);
    assert.ok(w.file('word/header2.xml') && w.file('word/media/desc-img1.png'));
    assert.match(await w.file('word/_rels/document.xml.rels').async('string'), /rIdDescImg1/);
});

test('descuentos: el Word sin formato también se arma (carta, Arial 12)', async () => {
    var JSZip = (await import('jszip')).default;
    var w = await JSZip.loadAsync(await armarDocxDescuento(docEjemplo(), {}));
    var doc = await w.file('word/document.xml').async('string');
    assert.match(doc, /<w:pgSz w:w="12240" w:h="15840"\/>/);
    assert.match(doc, /ÁREA A DESCONTAR/);
    assert.match(doc, /2\.896/);
});

test('descuentos: el PDF se arma con uno y con varios lotes (sin imágenes ni membrete)', async () => {
    var bytes = await armarPdfDescuento(docEjemplo(), {});
    var pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 1);
    var d = docEjemplo();
    for (var i = 0; i < 3; i++) d.filas.push({ mr: 'Z6CC015' + (4 + i), lote: String(1030 + i), areaBase: 900, manual: true, areaDescontar: 50, dibujo: [] });
    pdf = await PDFDocument.load(await armarPdfDescuento(d, {}));
    assert.ok(pdf.getPageCount() >= 3, 'cuatro lotes, cada uno con su cuadro de localización: ' + pdf.getPageCount() + ' páginas');
});

test('descuentos: todo el lote (cerrado) descuenta el área base completa, sin dibujo', () => {
    var f = { mr: 'Z1CC0055', lote: '61', areaBase: 1254, manual: false, todo: true, dibujo: [] };
    assert.equal(areaFila(f), 1254);
    assert.equal(areaActualizada(f), 0);
    // Escrita a mano sigue mandando
    assert.equal(areaFila(Object.assign({}, f, { manual: true, areaDescontar: 300 })), 300);
    var d = docEjemplo();
    d.filas[0] = Object.assign({}, d.filas[0], { todo: true, dibujo: [] });
    assert.deepEqual(revisar(d), []);
    assert.equal(totales(d.filas).actualizada, 0);
});

test('descuentos: «todo el lote» se guarda en la base y vuelve', () => {
    var d = docEjemplo();
    d.filas[0] = Object.assign({}, d.filas[0], { todo: true, dibujo: [] });
    var r = aFila(d);
    assert.equal(r.filas[0].todo, true);
    assert.equal(r.filas[0].areaDescontar, 3072);
    assert.equal(deFila(r).filas[0].todo, true);
});
