// Excel de 🌾 Espartillos: lo que se ve en la lista (con los filtros elegidos), un resumen por zona y una hoja por zona.
// ExcelJS se descarga solo al pulsar «Descargar Excel».
import { enlaces, SIN_ZONA } from './espartillos.js';

var VERDE = 'FF0F766E';

function cabecera(ws) {
    ws.getRow(1).eachCell(function (c) {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
        c.alignment = { wrapText: true, vertical: 'middle' };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
}
function si(v, f) { return v ? 'SI' + (f ? ' (' + f + ')' : '') : 'NO'; }

export async function excelEspartillos(filas, resumen, o) {
    var { default: ExcelJS } = await import('exceljs');
    o = o || {};
    var wb = new ExcelJS.Workbook();
    var res = wb.addWorksheet('RESUMEN POR ZONA');
    var colsRes = [{ header: 'ZONA', key: 'zona', width: 24 }, { header: 'ESPARTILLOS', key: 'codigos', width: 13 }, { header: 'ÁREA (m²)', key: 'area', width: 14 }];
    if (o.conProgramacion) colsRes.push({ header: 'PROGRAMADOS', key: 'programados', width: 13 }, { header: 'EJECUTADOS Q1', key: 'q1', width: 13 }, { header: 'EJECUTADOS Q2', key: 'q2', width: 13 });
    res.columns = colsRes;
    resumen.forEach(function (r) { res.addRow(r); });
    var tot = resumen.reduce(function (a, r) { a.codigos += r.codigos; a.area += r.area; a.programados += r.programados; a.q1 += r.q1; a.q2 += r.q2; return a; }, { zona: 'TOTAL', codigos: 0, area: 0, programados: 0, q1: 0, q2: 0 });
    res.addRow(tot).font = { bold: true };
    res.getColumn('area').numFmt = '#,##0';
    cabecera(res);
    res.addRow([]);
    res.addRow(['Armado el ' + new Date().toLocaleString('es-CO') + ' con la capa Espartillos del mapa' + (o.mes ? ' y la programación de ' + o.mes : ' (sin programación del mes)') + '.']);
    if (o.filtros && o.filtros.length) res.addRow(['Filtros: ' + o.filtros.join(' · ')]);
    res.addRow(['Zona: la de la programación del mes si el espartillo está programado; si no, la zona EMV donde cae su pedazo más grande.']);
    res.addRow(['«' + SIN_ZONA + '»: Guayabal y parte de Belén no están en la capa Zonas EMV; la zona más cercana va solo como referencia.']);

    var cols = [{ header: 'ZONA', key: 'zona', width: 16 }, { header: 'ZONA SEGÚN', key: 'zonaDe', width: 13 }, { header: 'TAMBIÉN EN', key: 'tambien', width: 13 },
        { header: 'COMUNA', key: 'comuna', width: 20 }, { header: 'CÓDIGO', key: 'codigo', width: 16 }, { header: 'DIRECCIÓN', key: 'dir', width: 50 },
        { header: 'DESCRIPCIÓN', key: 'desc', width: 70 }, { header: 'ÁREA (m²)', key: 'area', width: 11 }, { header: 'PIEZAS', key: 'piezas', width: 8 }];
    if (o.conProgramacion) cols.push({ header: 'PROGRAMADO EN ' + (o.mes || 'EL MES'), key: 'prog', width: 14 }, { header: 'EJECUTADO Q1', key: 'q1', width: 15 }, { header: 'EJECUTADO Q2', key: 'q2', width: 15 }, { header: 'OBS. PROGRAMACIÓN', key: 'pobs', width: 30 });
    cols.push({ header: 'VER EN EL MAPA', key: 'mapa', width: 15 }, { header: 'ZONA MÁS CERCANA (SI NO TIENE)', key: 'cerca', width: 20 }, { header: 'POR REVISAR', key: 'obs', width: 45 });
    var hoja = function (nombre, lista) {
        var ws = wb.addWorksheet(nombre.slice(0, 31));
        ws.columns = cols;
        lista.forEach(function (x) {
            var e = enlaces(x), p = x.prog;
            var r = ws.addRow({
                zona: x.zona, zonaDe: x.zonaDe, tambien: x.tambien.join(', '), comuna: x.comuna, codigo: x.codigo, dir: x.dir, desc: x.desc, area: x.area, piezas: x.piezas,
                prog: p ? 'SI' : 'NO', q1: p ? si(p.q1, p.fecha1) : '', q2: p ? si(p.q2, p.fecha2) : '', pobs: p ? p.obs : '',
                mapa: e.google ? { text: 'Google Maps', hyperlink: e.google } : '', cerca: x.cerca ? x.cerca.zona + ' (≈' + x.cerca.m + ' m)' : '', obs: x.obs.join(' | ')
            });
            r.alignment = { wrapText: true, vertical: 'top' };
            if (e.google) r.getCell('mapa').font = { color: { argb: 'FF0563C1' }, underline: true };
        });
        ws.getColumn('area').numFmt = '#,##0';
        cabecera(ws);
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    };
    hoja('TODOS', filas);
    resumen.forEach(function (r) { hoja(r.zona.toUpperCase(), filas.filter(function (x) { return x.zona === r.zona; })); });
    var buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
