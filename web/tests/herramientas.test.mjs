// Pruebas de Unir PDF y Buscar en todo. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPaginas, medidaNueva, textoTamano, armarPdf } from '../src/herramientas/pdf.js';
import { filtroContiene, esNumeroLote, sinCeros } from '../src/herramientas/buscar.js';
import { PDFDocument } from 'pdf-lib';

test('páginas: rangos, orden y errores', () => {
    assert.deepEqual(leerPaginas('', 3), [0, 1, 2]);
    assert.deepEqual(leerPaginas('1-3, 5', 5), [0, 1, 2, 4]);
    assert.deepEqual(leerPaginas('3-1 2', 3), [2, 1, 0, 1]);
    assert.equal(leerPaginas('6', 5), null);
    assert.equal(leerPaginas('0', 5), null);
    assert.equal(leerPaginas('a', 5), null);
});
test('medida: reduce sin agrandar', () => {
    assert.deepEqual(medidaNueva(4000, 2000, 1000), [1000, 500]);
    assert.deepEqual(medidaNueva(800, 600, 1000), [800, 600]);
});
test('tamaño', () => {
    assert.equal(textoTamano(2048), '2 KB');
    assert.equal(textoTamano(1572864), '1,5 MB');
});
const pdf = async (n) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([100 + i, 100]); return d.save(); };
test('unir: respeta el orden de archivos y páginas', async () => {
    const hecho = (b) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
    const r = await armarPdf([{ archivo: hecho(await pdf(1)), paginas: [0] }, { archivo: hecho(await pdf(3)), paginas: [2, 0] }], 'no');
    const d = await PDFDocument.load(r.bytes);
    assert.deepEqual(d.getPages().map(p => p.getWidth()), [100, 102, 100]);
});
test('buscar: lo escrito no cambia la consulta', () => {
    assert.equal(filtroContiene(['a', 'b'], 'Z7R'), 'a.ilike."%Z7R%",b.ilike."%Z7R%"');
    assert.equal(filtroContiene(['a'], 'x,"y"'), 'a.ilike."%x,\\"y\\"%"');
    assert.equal(filtroContiene(['a'], '50%'), 'a.ilike."%50\\\\%%"');
    assert.ok(esNumeroLote(' 45 '));
    assert.ok(!esNumeroLote('Z7'));
    assert.equal(sinCeros('045'), '45');
});
