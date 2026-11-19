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

test('descuentos: el PDF se arma con uno y con varios lotes (sin imágenes ni membrete)', async () => {
    var bytes = await armarPdfDescuento(docEjemplo(), {});
    var pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 1);
    var d = docEjemplo();
    for (var i = 0; i < 3; i++) d.filas.push({ mr: 'Z6CC015' + (4 + i), lote: String(1030 + i), areaBase: 900, manual: true, areaDescontar: 50, dibujo: [] });
    pdf = await PDFDocument.load(await armarPdfDescuento(d, {}));
    assert.ok(pdf.getPageCount() >= 3, 'cuatro lotes, cada uno con su cuadro de localización: ' + pdf.getPageCount() + ' páginas');
});
