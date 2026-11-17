// Horas extras: el libro con fórmulas compartidas de Excel se puede guardar después de escribirle la H. REAL encima.
// Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { sinFormulasCompartidas } from '../src/horas/libro.js';

// Libro como los que guarda Excel: K8 tiene la fórmula y K9:K11 la comparten
async function libroCompartido() {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Hoja1');
    for (var r = 8; r <= 11; r++) { ws.getCell('I' + r).value = 0.5; ws.getCell('J' + r).value = 0.6; }
    ws.getCell('K8').value = { formula: 'J8-I8', result: 0.1 };
    for (r = 9; r <= 11; r++) ws.getCell('K' + r).value = { sharedFormula: 'K8', result: 0.1 };
    var wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(await wb.xlsx.writeBuffer());
    return wb2;
}

test('horas: sin arreglar, escribir encima de la fórmula maestra no deja guardar (el error que se veía)', async () => {
    var wb = await libroCompartido(), ws = wb.worksheets[0];
    assert.equal(ws.getCell('K9').value.sharedFormula, 'K8');
    ws.getCell('K8').value = new Date(Date.UTC(1899, 11, 30, 14, 0));
    await assert.rejects(wb.xlsx.writeBuffer(), /Shared Formula master/);
});

test('horas: con las fórmulas compartidas cambiadas por las de cada fila sí se guarda y cada fila queda con la suya', async () => {
    var wb = await libroCompartido(), ws = wb.worksheets[0];
    assert.equal(sinFormulasCompartidas(ws), 4);
    assert.equal(ws.getCell('K10').value.formula, 'J10-I10');
    ws.getCell('K8').value = new Date(Date.UTC(1899, 11, 30, 14, 0));
    ws.getCell('K9').value = { formula: 'IF(J9="","",J9-I9)' };
    var otra = new ExcelJS.Workbook();
    await otra.xlsx.load(await wb.xlsx.writeBuffer());
    var h = otra.worksheets[0];
    assert.ok(h.getCell('K8').value instanceof Date);
    assert.equal(h.getCell('K9').value.formula, 'IF(J9="","",J9-I9)');
    assert.equal(h.getCell('K11').value.formula, 'J11-I11');
    // Un libro sin fórmulas compartidas no cambia
    assert.equal(sinFormulasCompartidas(h), 0);
});
