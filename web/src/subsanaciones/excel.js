// Excel con el formato de interventoría.
// Una hoja por tipo de visita, con lo que esté filtrado. Encabezados verdes (datos) y azules (ítems);
// NO pendiente en amarillo, NO ya subsanado en verde, y la observación con el mismo color. Letra tamaño 11.
// La vista previa (htmlHoja) sale de lo mismo que el archivo, así se ve igual antes de descargarlo.
// ExcelJS (permite colores) se carga solo al descargar.
import { esc, valorItem, claveFecha, hoy, aInput } from './util.js';
import { deLote, esOp, itemsEnNo, itemsSubsanados, loteNoRevisable, textoObservacion } from './estado.js';

var XL = { verde: 'FF00B050', azul: 'FF9BC2E6', amarillo: 'FFFFFF00', verdeNo: 'FF00FF00', gris: 'FFD9D9D9', rojo: 'FFFF0000', azulObs: 'FF4A86E8', naranja: 'FFFFD966' };
var LETRA = 11, ALTO_CAB = 60;   // alto del encabezado en puntos, para que quepan los nombres largos de los ítems
// Formato nuevo de interventoría (lote ejecutado, nov 2026): CLASIFICACION, FECHA DE CORRECCION y DÍAS TRANSCURRIDOS.
// La clasificación no se guarda en la visita: todos los lotes del contrato son de la programación CLUS
var CLASIF_CAB = 'CLASIFICACION', CLASIF = 'CLUS', F_CORR = 'FECHA DE CORRECCION', DIAS_T = 'DÍAS TRANSCURRIDOS (VISITA A CORRECCIÓN)';

// Área como número para que Excel la muestre con separador de miles. api.js la entrega como en Colombia
// ("36.823", "3.500,5"): el punto es de miles y la coma de decimales
function numeroArea(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var n = Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : s;
}
// Días de la visita a la corrección; "Pendiente" mientras no se subsana
function diasACorreccion(r) {
    if (r.ESTADO === 'PENDIENTE') return 'Pendiente';
    if (r.ESTADO !== 'SUBSANADO') return '';
    var a = aInput(r['FECHA DE LA VISITA']), b = aInput(r['FECHA SUBSANACIÓN']);
    return a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5)) : '';
}

// Contenido y colores de una hoja: { nombre, cab, anchos, fondoCab, filas: [{ v, fondo, ajustar }], miles }
function armarHoja(nombre, lista, its, op) {
    var inicio = ['MICRORRUTA', 'LOTE', 'ÁREA M2'].concat(op ? [] : [CLASIF_CAB], ['ZONA', 'CUADRILLA'], op ? [] : ['FECHA DE EJECUCIÓN'], ['FECHA DE LA VISITA', 'INTERVENTOR']);
    var fin = op ? ['OBSERVACIONES', 'CANTIDAD DE NOVEDADES'] : ['OBSERVACIONES NOVEDADES', F_CORR, 'CANTIDAD DE NOVEDADES POR MICRORRUTA', DIAS_T];
    var obs = fin[0], cant = op ? fin[1] : fin[2];
    // Seguimiento de la subsanación (no está en el Excel original): al final, en gris, solo en operación.
    // Lote ejecutado sale exactamente como el formato de interventoría (se pegan las filas en ese Excel)
    var extra = op ? ['ESTADO', 'FECHA SUBSANACIÓN', 'OBSERVACIÓN SUBSANACIÓN', 'EVIDENCIA', 'ID'] : [];
    var cab = inicio.concat(its, fin, extra);
    var hoja = {
        nombre: nombre, cab: cab,
        anchos: cab.map(function (c) { return c === obs ? 46 : c === 'OBSERVACIÓN SUBSANACIÓN' || c === 'EVIDENCIA' ? 30 : c === F_CORR || c === DIAS_T ? 16 : its.indexOf(c) !== -1 ? 13 : c === 'MICRORRUTA' ? 12 : 11; }),
        // En el formato de operación la columna OBSERVACIONES va en azul oscuro; en el de lote ejecutado,
        // OBSERVACIONES NOVEDADES y FECHA DE CORRECCION en verde claro
        fondoCab: cab.map(function (c) { return its.indexOf(c) !== -1 ? XL.azul : extra.indexOf(c) !== -1 ? XL.gris : op && c === obs ? XL.azulObs : !op && (c === obs || c === F_CORR) ? XL.verdeNo : XL.verde; }),
        miles: cab.map(function (c) { return c === 'ÁREA M2'; }),
        filas: []
    };
    // Del más antiguo al más reciente, como se lleva el Excel
    lista.slice().sort(function (a, b) { return claveFecha(a['FECHA DE LA VISITA']).localeCompare(claveFecha(b['FECHA DE LA VISITA'])); }).forEach(function (r) {
        var subs = itemsSubsanados(r), enNo = itemsEnNo(r);
        hoja.filas.push({
            v: cab.map(function (c) {
                if (its.indexOf(c) !== -1) return subs.indexOf(c) !== -1 ? 'NO' : valorItem(r[c]) || String(r[c] || '');
                if (c === obs) return textoObservacion(r);
                if (c === cant) return enNo.length + subs.length;
                if (c === CLASIF_CAB) return CLASIF;
                if (c === F_CORR) return r.ESTADO === 'SUBSANADO' ? String(r['FECHA SUBSANACIÓN'] || '') : '';
                if (c === DIAS_T) return diasACorreccion(r);
                if (c === 'ÁREA M2') return numeroArea(r[c]);
                return String(r[c] || '');
            }),
            fondo: cab.map(function (c) {
                if (its.indexOf(c) !== -1) return enNo.indexOf(c) !== -1 ? XL.amarillo : subs.indexOf(c) !== -1 ? XL.verdeNo : null;
                if (c === obs) return loteNoRevisable(r) ? XL.rojo : r.ESTADO === 'PENDIENTE' ? XL.amarillo : r.ESTADO === 'SUBSANADO' ? XL.verdeNo : null;
                if (c === DIAS_T) return r.ESTADO === 'PENDIENTE' ? XL.naranja : null;
                return null;
            }),
            ajustar: cab.map(function (c) { return c === obs || c === 'OBSERVACIÓN SUBSANACIÓN'; })
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
            if (h.miles && h.miles[i - 1] && typeof cel.value === 'number') cel.numFmt = '#,##0';
        });
    });
    ws.columns.forEach(function (col, i) { col.width = h.anchos[i]; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.cab.length } };
}

// Descarga un archivo .xlsx con las hojas recibidas (el formato de armarHoja; también lo usa el Excel de PQR)
export async function descargarHojas(hojas, nombreArchivo) {
    var { default: ExcelJS } = await import('exceljs');
    var libro = new ExcelJS.Workbook();
    hojas.forEach(function (h) { hojaExcel(libro, h); });
    var buf = await libro.xlsx.writeBuffer();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
// Descarga subsanaciones_aaaa-mm-dd.xlsx con la lista recibida
export function exportarExcel(lista, items, itemsOp) {
    return descargarHojas(hojasExcel(lista, items, itemsOp), 'subsanaciones_' + hoy() + '.xlsx');
}

// Vista previa de una hoja como la muestra Excel: mismos anchos (1 de ancho ≈ 7 px), colores, bordes y letra 11
function color(argb) { return '#' + argb.slice(2); }
// Cómo se ve el valor en Excel (área con punto de miles: 3.500)
function ver(h, i, v) { return h.miles && h.miles[i] && typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: 0 }) : v; }
// Las filas de la hoja para pegarlas en otro Excel con sus colores y bordes: { html, texto } (texto: separado por
// tabulaciones, para donde no se pega con formato). Sin el encabezado: solo los datos, como se agregan al Excel que se lleva
export function filasParaCopiar(h) {
    var celda = 'border:.5pt solid windowtext;text-align:center;vertical-align:middle;font:11pt Calibri,sans-serif;';
    var html = '<html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse">' + h.filas.map(function (f) {
        return '<tr>' + f.v.map(function (v, i) {
            return '<td style="' + celda + (f.fondo[i] ? 'background:' + color(f.fondo[i]) + ';' : '') + (f.ajustar[i] ? 'white-space:normal;' : 'white-space:nowrap;') + '">' + esc(ver(h, i, v)) + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</table></body></html>';
    var texto = h.filas.map(function (f) { return f.v.map(function (v, i) { v = ver(h, i, v); return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\r\n');
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
                return '<td' + (f.fondo[i] ? ' style="background:' + color(f.fondo[i]) + '"' : '') + (f.ajustar[i] ? ' class="ajustar"' : '') + '>' + esc(ver(h, i, v)) + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
}
