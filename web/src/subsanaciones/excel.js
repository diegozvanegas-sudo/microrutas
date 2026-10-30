// Excel con el formato de interventoría.
// Una hoja por tipo de visita, con lo que esté filtrado. Encabezados verdes (datos) y azules (ítems);
// NO pendiente en amarillo, NO ya subsanado en verde, y la observación con el mismo color. Letra tamaño 11.
// La vista previa (htmlHoja) sale de lo mismo que el archivo, así se ve igual antes de descargarlo.
// ExcelJS (permite colores) se carga solo al descargar.
import { esc, valorItem, claveFecha, hoy } from './util.js';
import { deLote, esOp, itemsEnNo, itemsSubsanados, loteNoRevisable, textoObservacion } from './estado.js';

var XL = { verde: 'FF00B050', azul: 'FF9BC2E6', amarillo: 'FFFFFF00', verdeNo: 'FF00FF00', gris: 'FFD9D9D9', rojo: 'FFFF0000', azulObs: 'FF4A86E8' };
var LETRA = 11, ALTO_CAB = 60;   // alto del encabezado en puntos, para que quepan los nombres largos de los ítems

// Contenido y colores de una hoja: { nombre, cab, anchos, fondoCab, filas: [{ v, fondo, ajustar }] }
function armarHoja(nombre, lista, its, op) {
    var inicio = ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'ZONA', 'CUADRILLA'].concat(op ? [] : ['FECHA DE EJECUCIÓN'], ['FECHA DE LA VISITA', 'INTERVENTOR']);
    var fin = [op ? 'OBSERVACIONES' : 'OBSERVACIONES NOVEDADES', op ? 'CANTIDAD DE NOVEDADES' : 'CANTIDAD DE NOVEDADES POR MICRORRUTA'];
    // Seguimiento de la subsanación (no está en el Excel original): al final, en gris
    var extra = ['ESTADO', 'FECHA SUBSANACIÓN', 'OBSERVACIÓN SUBSANACIÓN', 'EVIDENCIA', 'ID'];
    var cab = inicio.concat(its, fin, extra);
    var hoja = {
        nombre: nombre, cab: cab,
        anchos: cab.map(function (c) { return c === fin[0] ? 46 : c === 'OBSERVACIÓN SUBSANACIÓN' || c === 'EVIDENCIA' ? 30 : its.indexOf(c) !== -1 ? 13 : c === 'MICRORRUTA' ? 12 : 11; }),
        // En el formato de operación la columna OBSERVACIONES va en azul oscuro
        fondoCab: cab.map(function (c) { return its.indexOf(c) !== -1 ? XL.azul : extra.indexOf(c) !== -1 ? XL.gris : op && c === fin[0] ? XL.azulObs : XL.verde; }),
        filas: []
    };
    // Del más antiguo al más reciente, como se lleva el Excel
    lista.slice().sort(function (a, b) { return claveFecha(a['FECHA DE LA VISITA']).localeCompare(claveFecha(b['FECHA DE LA VISITA'])); }).forEach(function (r) {
        var subs = itemsSubsanados(r), enNo = itemsEnNo(r);
        hoja.filas.push({
            v: cab.map(function (c) {
                if (its.indexOf(c) !== -1) return subs.indexOf(c) !== -1 ? 'NO' : valorItem(r[c]) || String(r[c] || '');
                if (c === fin[0]) return textoObservacion(r);
                if (c === fin[1]) return enNo.length + subs.length;
                return String(r[c] || '');
            }),
            fondo: cab.map(function (c) {
                if (its.indexOf(c) !== -1) return enNo.indexOf(c) !== -1 ? XL.amarillo : subs.indexOf(c) !== -1 ? XL.verdeNo : null;
                if (c === fin[0]) return loteNoRevisable(r) ? XL.rojo : r.ESTADO === 'PENDIENTE' ? XL.amarillo : r.ESTADO === 'SUBSANADO' ? XL.verdeNo : null;
                return null;
            }),
            ajustar: cab.map(function (c) { return c === fin[0] || c === 'OBSERVACIÓN SUBSANACIÓN'; })
        });
    });
    return hoja;
}

// Las hojas que lleva el Excel con la lista recibida (lote ejecutado y durante la operación)
export function hojasExcel(lista, items, itemsOp) {
    var ej = lista.filter(deLote), op = lista.filter(esOp), hojas = [];
    if (ej.length) hojas.push(armarHoja('Lote ejecutado', ej, items, false));
    if (op.length) hojas.push(armarHoja('Durante la operación', op, itemsOp, true));
    return hojas;
}

function hojaExcel(libro, h) {
    var ws = libro.addWorksheet(h.nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    var borde = { style: 'thin', color: { argb: 'FF808080' } }, bordes = { top: borde, left: borde, bottom: borde, right: borde };
    var relleno = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; };
    ws.addRow(h.cab);
    ws.getRow(1).height = ALTO_CAB;
    ws.getRow(1).eachCell(function (c, i) {
        c.font = { bold: true, size: LETRA };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.fill = relleno(h.fondoCab[i - 1]);
        c.border = bordes;
    });
    h.filas.forEach(function (f) {
        ws.addRow(f.v).eachCell({ includeEmpty: true }, function (cel, i) {
            cel.font = { size: LETRA };
            cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: f.ajustar[i - 1] };
            cel.border = bordes;
            if (f.fondo[i - 1]) cel.fill = relleno(f.fondo[i - 1]);
        });
    });
    ws.columns.forEach(function (col, i) { col.width = h.anchos[i]; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.cab.length } };
}

// Descarga subsanaciones_aaaa-mm-dd.xlsx con la lista recibida
export async function exportarExcel(lista, items, itemsOp) {
    var { default: ExcelJS } = await import('exceljs');
    var libro = new ExcelJS.Workbook();
    hojasExcel(lista, items, itemsOp).forEach(function (h) { hojaExcel(libro, h); });
    var buf = await libro.xlsx.writeBuffer();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'subsanaciones_' + hoy() + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Vista previa de una hoja como la muestra Excel: mismos anchos (1 de ancho ≈ 7 px), colores, bordes y letra 11
function color(argb) { return '#' + argb.slice(2); }
// Las filas de la hoja para pegarlas en otro Excel con sus colores y bordes: { html, texto } (texto: separado por
// tabulaciones, para donde no se pega con formato). Sin el encabezado: solo los datos, como se agregan al Excel que se lleva
export function filasParaCopiar(h) {
    var celda = 'border:.5pt solid windowtext;text-align:center;vertical-align:middle;font:11pt Calibri,sans-serif;';
    var html = '<html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse">' + h.filas.map(function (f) {
        return '<tr>' + f.v.map(function (v, i) {
            return '<td style="' + celda + (f.fondo[i] ? 'background:' + color(f.fondo[i]) + ';' : '') + (f.ajustar[i] ? 'white-space:normal;' : 'white-space:nowrap;') + '">' + esc(v) + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</table></body></html>';
    var texto = h.filas.map(function (f) { return f.v.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\r\n');
    return { html: html, texto: texto };
}
export function htmlHoja(h) {
    var col = '<colgroup><col class="xl-num">' + h.anchos.map(function (w) { return '<col style="width:' + (w * 7 + 5) + 'px">'; }).join('') + '</colgroup>';
    var letras = function (i) { var s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
    return '<table class="xl">' + col +
        '<thead><tr class="xl-letras"><th></th>' + h.cab.map(function (c, i) { return '<th>' + letras(i) + '</th>'; }).join('') + '</tr>' +
        '<tr class="xl-cab" style="height:' + Math.round(ALTO_CAB * 4 / 3) + 'px"><th class="xl-num">1</th>' +
            h.cab.map(function (c, i) { return '<th style="background:' + color(h.fondoCab[i]) + '">' + esc(c) + '</th>'; }).join('') + '</tr></thead>' +
        '<tbody>' + h.filas.map(function (f, n) {
            return '<tr><th class="xl-num">' + (n + 2) + '</th>' + f.v.map(function (v, i) {
                return '<td' + (f.fondo[i] ? ' style="background:' + color(f.fondo[i]) + '"' : '') + (f.ajustar[i] ? ' class="ajustar"' : '') + '>' + esc(v) + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
}
