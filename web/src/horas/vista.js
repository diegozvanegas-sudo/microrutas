// Vista previa del consolidado de horas extras: la hoja del Excel (ya con la H. REAL) en el formato que dibuja
// htmlHoja de Subsanaciones ({ nombre, cab, anchos, fondoCab, filas: [{ v, fondo, ajustar }] }), para verla igual que en Excel.
import { minutos, hhmm } from './cruce.js';

// Sombreado de la H. REAL escrita (en el archivo y en la vista): amarillo, como el de Subsanaciones
export var COLOR_REAL = 'FFFFFF00';
// RUTA o CONTROL que no coinciden con el reporte de cumplimiento: rojo claro
export var COLOR_DISTINTO = 'FFFFC7CE';
// H.I o H.F que no son las del horario de la ruta (horarios.html): naranja claro
export var COLOR_HORARIO = 'FFF8CBAD';

var GRIS = 'FFD9D9D9';
function argb(celda) {
    var f = celda.fill;
    return f && f.type === 'pattern' && f.fgColor && f.fgColor.argb && f.pattern !== 'none' ? f.fgColor.argb : null;
}
// "AB" -> 28
function numCol(letras) { var n = 0; for (var i = 0; i < letras.length; i++) n = n * 26 + letras.charCodeAt(i) - 64; return n; }

// Texto de una celda como lo muestra Excel: fechas dd/mm/aaaa, horas h:mm, y fórmulas de resta entre dos celdas
// (el TOTAL = H. REAL − H.F) calculadas; una hora negativa Excel la muestra como ####
function mostrar(ws, celda) {
    var v = celda.value, fmt = String(celda.numFmt || '');
    if (v && typeof v === 'object' && v.formula) {
        var m = /^\s*([A-Z]+)(\d+)\s*-\s*([A-Z]+)(\d+)\s*$/.exec(v.formula);
        if (m) {
            var a = ws.getRow(+m[2]).getCell(numCol(m[1])).value, b = ws.getRow(+m[4]).getCell(numCol(m[3])).value;
            var ma = a == null || a === '' ? 0 : minutos(a), mb = b == null || b === '' ? 0 : minutos(b);
            if (ma == null || mb == null) return '';
            var d = ma - mb;
            return d < 0 ? '########' : Math.floor(d / 60) + ':' + ('0' + d % 60).slice(-2);
        }
        v = v.result;
    }
    if (v == null) return '';
    if (v instanceof Date) {
        var esHora = /h/i.test(fmt) && !/[dy]/i.test(fmt) || v.getUTCFullYear() < 1901;
        if (esHora) { var t = minutos(v); return /hh/i.test(fmt) ? hhmm(t) : Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }
        return ('0' + v.getUTCDate()).slice(-2) + '/' + ('0' + (v.getUTCMonth() + 1)).slice(-2) + '/' + v.getUTCFullYear();
    }
    if (typeof v === 'object') return v.richText ? v.richText.map(function (t) { return t.text; }).join('') : v.text != null ? String(v.text) : '';
    return String(v);
}

// ws: hoja de ExcelJS ya llena; encabezado: número de la fila de títulos
export function hojaVista(ws, encabezado, nombre) {
    var cabFila = ws.getRow(encabezado), n = 0;
    cabFila.eachCell(function (c, i) { if (String(c.value == null ? '' : c.value).trim()) n = Math.max(n, i); });
    var rango = []; for (var i = 1; i <= n; i++) rango.push(i);
    var hoja = {
        nombre: nombre,
        cab: rango.map(function (i) { return String(cabFila.getCell(i).value == null ? '' : cabFila.getCell(i).value).trim(); }),
        anchos: rango.map(function (i) { return ws.getColumn(i).width || 9; }),
        fondoCab: rango.map(function (i) { return argb(cabFila.getCell(i)) || GRIS; }),
        filas: [],
    };
    for (var r = encabezado + 1; r <= ws.rowCount; r++) {
        var fila = ws.getRow(r);
        var v = rango.map(function (i) { return mostrar(ws, fila.getCell(i)); });
        if (!v.some(Boolean)) continue;
        hoja.filas.push({ v: v, fondo: rango.map(function (i) { return argb(fila.getCell(i)); }), ajustar: rango.map(function () { return false; }) });
    }
    return hoja;
}
