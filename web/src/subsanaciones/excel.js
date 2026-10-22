// Excel con el formato de interventoría.
// Una hoja por tipo de visita, con lo que esté filtrado. Encabezados verdes (datos) y azules (ítems);
// NO pendiente en amarillo, NO ya subsanado en verde, y la observación con el mismo color.
// ExcelJS (permite colores) se carga solo al pedirlo.
import { valorItem, claveFecha, hoy } from './util.js';
import { deLote, esOp, itemsEnNo, itemsSubsanados, loteNoRevisable, textoObservacion } from './estado.js';

var XL = { verde: 'FF00B050', azul: 'FF9BC2E6', amarillo: 'FFFFFF00', verdeNo: 'FF00FF00', gris: 'FFD9D9D9', rojo: 'FFFF0000', azulObs: 'FF4A86E8' };

function hojaExcel(libro, nombre, lista, its, op) {
    var inicio = ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'ZONA', 'CUADRILLA'].concat(op ? [] : ['FECHA DE EJECUCIÓN'], ['FECHA DE LA VISITA', 'INTERVENTOR']);
    var fin = [op ? 'OBSERVACIONES' : 'OBSERVACIONES NOVEDADES', op ? 'CANTIDAD DE NOVEDADES' : 'CANTIDAD DE NOVEDADES POR MICRORRUTA'];
    // Seguimiento de la subsanación (no está en el Excel original): al final, en gris
    var extra = ['ESTADO', 'FECHA SUBSANACIÓN', 'OBSERVACIÓN SUBSANACIÓN', 'EVIDENCIA', 'ID'];
    var cab = inicio.concat(its, fin, extra);
    var ws = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    var borde = { style: 'thin', color: { argb: 'FF808080' } }, bordes = { top: borde, left: borde, bottom: borde, right: borde };
    var relleno = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; };
    ws.addRow(cab);
    ws.getRow(1).height = 48;
    ws.getRow(1).eachCell(function (c, i) {
        var nombreCol = cab[i - 1];
        c.font = { bold: true, size: 9 };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        // En el formato de operación la columna OBSERVACIONES va en azul oscuro
        c.fill = relleno(its.indexOf(nombreCol) !== -1 ? XL.azul : extra.indexOf(nombreCol) !== -1 ? XL.gris : op && nombreCol === fin[0] ? XL.azulObs : XL.verde);
        c.border = bordes;
    });
    // Del más antiguo al más reciente, como se lleva el Excel
    lista.slice().sort(function (a, b) { return claveFecha(a['FECHA DE LA VISITA']).localeCompare(claveFecha(b['FECHA DE LA VISITA'])); }).forEach(function (r) {
        var subs = itemsSubsanados(r), enNo = itemsEnNo(r);
        var valores = cab.map(function (c) {
            if (its.indexOf(c) !== -1) return subs.indexOf(c) !== -1 ? 'NO' : valorItem(r[c]) || String(r[c] || '');
            if (c === fin[0]) return textoObservacion(r);
            if (c === fin[1]) return enNo.length + subs.length;
            return String(r[c] || '');
        });
        var fila = ws.addRow(valores);
        fila.eachCell({ includeEmpty: true }, function (cel, i) {
            var c = cab[i - 1];
            cel.font = { size: 9 };
            cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: c === fin[0] || c === 'OBSERVACIÓN SUBSANACIÓN' };
            cel.border = bordes;
            if (its.indexOf(c) !== -1) {
                if (enNo.indexOf(c) !== -1) cel.fill = relleno(XL.amarillo);
                else if (subs.indexOf(c) !== -1) cel.fill = relleno(XL.verdeNo);
            }
            if (c === fin[0]) {
                if (loteNoRevisable(r)) cel.fill = relleno(XL.rojo);
                else if (r.ESTADO === 'PENDIENTE') cel.fill = relleno(XL.amarillo);
                else if (r.ESTADO === 'SUBSANADO') cel.fill = relleno(XL.verdeNo);
            }
        });
    });
    ws.columns.forEach(function (col, i) {
        var c = cab[i];
        col.width = c === fin[0] ? 46 : c === 'OBSERVACIÓN SUBSANACIÓN' || c === 'EVIDENCIA' ? 30 : its.indexOf(c) !== -1 ? 13 : c === 'MICRORRUTA' ? 12 : 11;
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cab.length } };
}

// Descarga subsanaciones_aaaa-mm-dd.xlsx con la lista recibida
export async function exportarExcel(lista, items, itemsOp) {
    var { default: ExcelJS } = await import('exceljs');
    var libro = new ExcelJS.Workbook();
    var ej = lista.filter(deLote), op = lista.filter(esOp);
    if (ej.length) hojaExcel(libro, 'Lote ejecutado', ej, items, false);
    if (op.length) hojaExcel(libro, 'Durante la operación', op, itemsOp, true);
    var buf = await libro.xlsx.writeBuffer();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'subsanaciones_' + hoy() + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
