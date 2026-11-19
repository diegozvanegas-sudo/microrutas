// Excel de 🛣️ Programación por cercanía: comparativo por cuadrilla, la propuesta de cada quincena (mismas columnas del
// Excel del contratista, más el orden en el día y el día que tiene hoy) y los días más dispersos de la programación actual.
// libroPropuesta(ExcelJS, res, info) → Workbook (res = analizar(); info = { mes, archivo })
import { kmTexto, pct, nombreDia, LARGO } from './optimizar.js';

var VERDE = 'FF166534';
function cabecera(ws, columnas) {
    ws.columns = columnas.map(function (c) { return { header: c[0], width: c[1] }; });
    var f = ws.getRow(1);
    f.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    f.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    f.alignment = { wrapText: true, vertical: 'middle' };
    f.height = 32;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}
function numLote(l) { return /^\d+$/.test(l || '') ? Number(l) : l; }
function rango(sep) { return sep.length ? Math.min.apply(null, sep) + ' a ' + Math.max.apply(null, sep) : ''; }

export function libroPropuesta(ExcelJS, res, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Microrrutas';
    var ws = wb.addWorksheet('Comparativo');
    cabecera(ws, [['Cuadrilla', 11], ['Días por quincena', 11], ['Km Q1 hoy', 10], ['Km Q1 propuesta', 11], ['Km Q2 hoy', 10], ['Km Q2 propuesta', 11],
        ['Menos km en el mes (%)', 12], ['Días > ' + LARGO + ' km hoy', 11], ['Días > ' + LARGO + ' km propuesta', 12], ['Día más cargado hoy (m²)', 14],
        ['Día más cargado propuesta (m²)', 15], ['Quincenales', 11], ['Días entre pasadas de un quincenal hoy', 16], ['Lotes que cambian de día', 12]]);
    var r1 = function (n) { return Math.round(n * 10) / 10; };
    res.cuadrillas.forEach(function (c) {
        ws.addRow([Number(c.cuad) || c.cuad, c.nd, r1(c.km.hoy1), r1(c.km.prop1), r1(c.km.hoy2), r1(c.km.prop2),
            pct(c.km.hoy1 + c.km.hoy2, c.km.prop1 + c.km.prop2), c.largos.hoy, c.largos.prop, Math.round(c.cargaMax.hoy), Math.round(c.cargaMax.prop),
            c.quincenales, rango(c.separacion), c.cambian[1] + c.cambian[2]]);
    });
    var t = res.total, fila = ws.addRow(['Total', '', null, null, null, null, t.ahorro, t.largosHoy, t.largosProp, null, null, t.quincenales,
        t.sepMin != null ? t.sepMin + ' a ' + t.sepMax : '', t.cambian]);
    fila.font = { bold: true };
    ws.addRow([]);
    [
        'Recorrido hoy: ' + kmTexto(t.hoy) + ' km · propuesta: ' + kmTexto(t.prop) + ' km (' + t.ahorro + ' % menos).',
        'Propuesta: cada cuadrilla trabaja por sectores. Un quincenal va el MISMO día de la semana en Q1 y en Q2 (14 días entre pasadas); los mensuales siguen en su quincena y solo cambian de día.',
        'Km = distancias en línea recta entre el centro de los lotes del mismo día, en el mejor orden. No incluye ir de la base al primer lote ni volver. Por calle suele ser 1,3 a 1,5 veces más.',
        'Carga = m² del día. Se usan los mismos días que trabaja hoy cada cuadrilla, con un tope del 125 % del promedio (o el lote más grande, si pesa más).',
        'Fuente: ' + (info.archivo || 'programación del mes') + (info.mes ? ' (' + info.mes + ')' : '') + ' y los polígonos del mapa.'
    ].forEach(function (x) { ws.addRow([x]); });

    [1, 2].forEach(function (q) {
        var h = wb.addWorksheet('Propuesta Q' + q);
        cabecera(h, [['CUADRILLA', 11], ['MICRORRUTA', 13], ['LOTE', 8], ['DIRECCION', 48], ['AREA m2', 10], ['FRECUENCIA', 11], ['SEMANA DE EJECUCION', 11],
            ['DIA DE EJECUCION', 10], ['FECHA', 11], ['ORDEN EN EL DIA', 9], ['KM DEL DIA (línea recta)', 11], ['SEMANA HOY', 9], ['DIA HOY', 8], ['¿CAMBIA DE DÍA?', 10]]);
        res.cuadrillas.forEach(function (c) {
            c.propuesta[q].forEach(function (d) {
                d.lotes.forEach(function (x, i) {
                    h.addRow([Number(c.cuad) || c.cuad, x.mr, numLote(x.lote), x.dir || '', x.area || 0, x.frec, d.semana, d.dia, d.fecha, i + 1, r1(d.km),
                        x.antes.semana, x.antes.dia, x.cambia ? 'sí' : '']);
                });
            });
        });
    });

    var p = wb.addWorksheet('Días más dispersos hoy');
    cabecera(p, [['Quincena', 9], ['Cuadrilla', 10], ['Día', 13], ['Lotes', 7], ['Km del día (línea recta)', 12], ['Lotes en el orden más corto', 90]]);
    var dias = [];
    res.cuadrillas.forEach(function (c) { [1, 2].forEach(function (q) { c.hoy[q].forEach(function (d) { dias.push({ q: q, c: c.cuad, d: d }); }); }); });
    dias.sort(function (a, b) { return b.d.km - a.d.km; }).slice(0, 40).forEach(function (x) {
        p.addRow(['Q' + x.q, Number(x.c) || x.c, nombreDia(x.d), x.d.lotes.length, r1(x.d.km), x.d.lotes.map(function (y) { return y.mr + '-' + y.lote; }).join(' → ')]);
    });
    if (res.sinUbicar.length) {
        var s = wb.addWorksheet('Sin ubicar');
        cabecera(s, [['Quincena', 9], ['Cuadrilla', 10], ['MICRORRUTA', 13], ['LOTE', 8], ['DIRECCION', 60]]);
        res.sinUbicar.forEach(function (x) { s.addRow(['Q' + x.q, Number(x.cuad) || x.cuad, x.mr, numLote(x.lote), x.dir || '']); });
    }
    return wb;
}
