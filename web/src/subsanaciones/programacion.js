// Programación mensual del contratista (Excel «AAAA_MM_Mes_Programacion_CW394406.xlsx»): qué lote le toca hoy a cada cuadrilla,
// dónde va según lo marcado con X, qué quedó atrasado y las operaciones especiales de la semana.
// Hojas: PROGRAMACION (base), Q1 y Q2 (cada quincena, con EJECUCIÓN = X y FECHA), OP_ESPECIALES, SIF_CC y SIF_ESP.
// Se leen todas las filas, también las que el filtro del Excel deja ocultas.
// Semana y día del Excel → calendario: la semana 1 es la semana (lunes a sábado) del primer día hábil del mes;
// el día 1 es el lunes … el día 6 el sábado. Las semanas 1 y 2 son la Q1; la 3 en adelante, la Q2.
import { norm } from './util.js';

// Valor de una celda de ExcelJS como texto, número o fecha (aaaa-mm-dd)
export function valorCelda(v) {
    if (v == null) return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
        if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
        if ('result' in v) return valorCelda(v.result);
        if (v.text != null) return String(v.text);
        if (v.error) return '';
    }
    return v;
}
// Hoja de ExcelJS → filas de valores (todas, ocultas o no)
export function filasHoja(ws) {
    var out = [];
    ws.eachRow({ includeEmpty: true }, function (row) {
        var f = [];
        for (var c = 1; c <= ws.columnCount; c++) f.push(valorCelda(row.getCell(c).value));
        out.push(f);
    });
    return out;
}

function num(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) && String(v).trim() !== '' ? n : null; }
function entero(v) { var n = num(v); return n == null ? null : Math.round(n); }
// "2026-11-03", "03/11/2026", "05/11/2026 - 06/11/2026" (se toma la primera) → aaaa-mm-dd
export function fechaDe(v) {
    var s = String(v == null ? '' : v).trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function iso(d) { return d.toISOString().slice(0, 10); }
function utc(s) { return new Date(s + 'T00:00:00Z'); }
function sumar(s, n) { var d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

// Lunes de la semana 1 del mes (aaaa-mm): la semana del primer día de lunes a sábado
export function lunesSemana1(mes) {
    var d = utc(mes + '-01');
    while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);   // el 1 en domingo: empieza el lunes 2
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return iso(d);
}
// Fecha (aaaa-mm-dd) de la semana y el día del Excel
export function fechaPlan(mes, semana, dia) { return sumar(lunesSemana1(mes), (semana - 1) * 7 + (dia - 1)); }
// Semana y día del Excel de una fecha; domingo = null (no se programa)
export function semanaDia(mes, fecha) {
    var dias = Math.round((utc(fecha) - utc(lunesSemana1(mes))) / 864e5);
    if (dias < 0) return null;
    var dia = dias % 7 + 1;
    return dia === 7 ? { semana: Math.floor(dias / 7) + 1, dia: null } : { semana: Math.floor(dias / 7) + 1, dia: dia };
}
export function quincenaDe(semana) { return semana <= 2 ? 1 : 2; }
var DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function nombreDia(d) { return DIAS[d] || ''; }

// Columnas por nombre del encabezado (sin tildes ni mayúsculas)
function columnas(cab, nombres) {
    var c = {};
    Object.keys(nombres).forEach(function (k) {
        var i = cab.findIndex(function (h) { return nombres[k].some(function (n) { return norm(h) === n || norm(h).indexOf(n) === 0; }); });
        if (i !== -1) c[k] = i;
    });
    return c;
}
var COLS_Q = { cuad: ['CUADRILLA'], mr: ['MICRORRUTA'], lote: ['LOTE'], desc: ['DESCRIPCION'], dir: ['DIRECCION'], area: ['AREA M2', 'AREA'],
    frec: ['FRECUENCIA'], sem: ['SEMANA DE EJECUCION'], dia: ['DIA DE EJECUCION'], ej: ['EJECUCION'], fecha: ['FECHA'], obs: ['OBSERVACION'] };

// Lotes de una hoja de quincena (o de PROGRAMACION): [{ fila, cuad, mr, lote, dir, area, frec, semana, dia, hecho, fecha, obs }]
export function leerLotes(filas) {
    var iCab = filas.findIndex(function (f) { return f.some(function (h) { return norm(h) === 'MICRORRUTA'; }); });
    if (iCab === -1) return [];
    var c = columnas(filas[iCab], COLS_Q), out = [];
    filas.slice(iCab + 1).forEach(function (f, k) {
        var mr = String(f[c.mr] || '').trim().toUpperCase();
        if (!/^Z\d+CC\d+$/.test(mr)) return;
        var lote = f[c.lote], cuad = entero(f[c.cuad]);
        out.push({
            fila: iCab + k + 2, cuad: cuad == null ? String(f[c.cuad] || '').trim() : String(cuad), mr: mr,
            lote: num(lote) != null ? String(entero(lote)) : String(lote || '').trim(),
            dir: String(f[c.dir] || '').replace(/\s+/g, ' ').trim(), area: num(f[c.area]) || 0, frec: entero(f[c.frec]),
            semana: entero(f[c.sem]), dia: entero(f[c.dia]),
            hecho: c.ej != null && String(f[c.ej] || '').trim() !== '', fecha: c.fecha != null ? fechaDe(f[c.fecha]) : '',
            obs: c.obs != null ? String(f[c.obs] || '').trim() : ''
        });
    });
    return out;
}

// Operaciones especiales: [{ ruta, escenario, dir, area, proxima, ejecutado, cuadrilla, obs }]
export function leerEspeciales(filas) {
    var iCab = filas.findIndex(function (f) { return f.some(function (h) { return /^CODIGO RUTA/.test(norm(h)); }); });
    if (iCab === -1) return [];
    var c = columnas(filas[iCab], { ruta: ['CODIGO RUTA'], esc: ['ESCENARIO'], dir: ['DIRECCION'], area: ['AREA'], prox: ['FECHA PROXIMA'], obs: ['OBSERVACIONES'], ej: ['EJECUCION'], cuad: ['CUADRILLA'] });
    return filas.slice(iCab + 1).filter(function (f) { return String(f[c.ruta] || '').trim(); }).map(function (f) {
        return { ruta: String(f[c.ruta]).trim(), escenario: String(f[c.esc] || '').trim(), dir: String(f[c.dir] || '').trim(), area: num(f[c.area]) || 0,
            proxima: fechaDe(f[c.prox]), ejecutado: fechaDe(f[c.ej]) || (String(f[c.ej] || '').trim() ? 'sí' : ''), cuadrilla: String(f[c.cuad] || '').trim(),
            obs: String(f[c.obs] || '').replace(/\s+/g, ' ').trim() };
    });
}
// Rutas SIF (corte y espartillo): cuántas hay y cuántas tienen ejecución en cada quincena
export function leerSif(filas) {
    var iCab = filas.findIndex(function (f) { return f.some(function (h) { return /^CODIFICACION/.test(norm(h)); }); });
    if (iCab === -1) return null;
    var cab = filas[iCab].map(norm), q1 = cab.findIndex(function (h) { return /^EJECUCION Q1/.test(h); }), q2 = cab.findIndex(function (h) { return /^EJECUCION Q2/.test(h); });
    var ej = cab.reduce(function (a, h, i) { if (h === 'EJECUCION' || /^EJECUCION/.test(h)) a.push(i); return a; }, []);
    if (q1 === -1) q1 = ej[0]; if (q2 === -1) q2 = ej[1];
    var rutas = filas.slice(iCab + 1).filter(function (f) { return /_/.test(String(f[0] || '')); });
    var cuenta = function (i) { return i == null || i === -1 ? null : rutas.filter(function (f) { return String(f[i] || '').trim(); }).length; };
    return { total: rutas.length, q1: cuenta(q1), q2: cuenta(q2) };
}

// Libro completo: { hojas: { nombre: filas } , archivo } → { mes, q1, q2, especiales, sif: { cc, esp } }
// El mes sale del nombre del archivo (2026_11_…) o, si no, de las fechas de Q1
export function leerProgramacion(hojas, archivo) {
    var porNombre = {};
    Object.keys(hojas).forEach(function (n) { porNombre[norm(n).replace(/\s+/g, '_')] = hojas[n]; });
    var q1 = leerLotes(porNombre.Q1 || porNombre.PROGRAMACION || []), q2 = leerLotes(porNombre.Q2 || []);
    var m = String(archivo || '').match(/(20\d\d)[_\-. ](\d{1,2})/), mes = m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
    if (!mes) {
        var fs = q1.concat(q2).map(function (x) { return x.fecha; }).filter(Boolean).sort();
        mes = fs.length ? fs[Math.floor(fs.length / 2)].slice(0, 7) : '';
    }
    return {
        mes: mes, q1: q1, q2: q2, especiales: leerEspeciales(porNombre.OP_ESPECIALES || []),
        sif: { cc: leerSif(porNombre.SIF_CC || []), esp: leerSif(porNombre.SIF_ESP || []) }
    };
}

function ordenCuad(a, b) { var x = Number(a), y = Number(b); return (isFinite(x) ? x : 999) - (isFinite(y) ? y : 999) || String(a).localeCompare(String(b)); }

// Estado de cada cuadrilla en una fecha (aaaa-mm-dd). enApp(lote) → true si la app tiene visita de ese lote en la quincena.
// → { fecha, semana, dia, quincena, domingo, cuadrillas: [{ cuad, total, hechos, hoy, atrasados, siguen, ultimo, adelantada, obs }] }
export function estadoDelDia(prog, fecha, enApp) {
    var sd = semanaDia(prog.mes, fecha) || { semana: 1, dia: 1 }, q = quincenaDe(sd.semana), lotes = q === 1 ? prog.q1 : (prog.q2.length ? prog.q2 : prog.q1);
    enApp = enApp || function () { return false; };
    var dia = sd.dia || 7;   // domingo: cuenta como fin de semana (todo lo de la semana ya debía estar)
    var porCuad = {};
    lotes.forEach(function (x) { (porCuad[x.cuad] = porCuad[x.cuad] || []).push(x); });
    var cuadrillas = Object.keys(porCuad).sort(ordenCuad).map(function (c) {
        var L = porCuad[c], hecho = function (x) { return x.hecho || enApp(x); };
        // Lotes sin semana o día en el Excel no cuentan como atrasados (no se sabe cuándo tocaban)
        var antes = function (x) { return x.semana != null && x.dia != null && (x.semana < sd.semana || (x.semana === sd.semana && x.dia < dia)); };
        var hechos = L.filter(hecho), conFecha = L.filter(function (x) { return x.hecho && x.fecha; });
        var ultimaFecha = conFecha.reduce(function (m, x) { return x.fecha > m ? x.fecha : m; }, '');
        var delUltimo = conFecha.filter(function (x) { return x.fecha === ultimaFecha; });
        var desde = delUltimo.length ? Math.max.apply(null, delUltimo.map(function (x) { return x.fila; })) : 0;
        return {
            cuad: c, total: L.length, hechos: hechos.length,
            marcados: L.filter(function (x) { return x.hecho; }).length, soloApp: L.filter(function (x) { return !x.hecho && enApp(x); }).length,
            hoy: L.filter(function (x) { return x.semana === sd.semana && x.dia === sd.dia; }),
            atrasados: L.filter(function (x) { return antes(x) && !hecho(x); }),
            debian: L.filter(antes).length,
            siguen: desde ? L.filter(function (x) { return x.fila > desde && !hecho(x); }).slice(0, 3) : [],
            sinFecha: L.filter(function (x) { return x.semana == null || x.dia == null; }).length,
            ultimo: ultimaFecha ? { fecha: ultimaFecha, lotes: delUltimo } : null,
            adelantados: L.filter(function (x) { return hecho(x) && !antes(x) && !(x.semana === sd.semana && x.dia === sd.dia); }).length,
            obs: L.filter(function (x) { return x.obs; })
        };
    });
    return { fecha: fecha, semana: sd.semana, dia: sd.dia, quincena: q, domingo: !sd.dia, cuadrillas: cuadrillas };
}
// Operaciones especiales de la semana de la fecha (lunes a domingo), sin las ya ejecutadas antes
export function especialesDeSemana(prog, fecha) {
    var d = utc(fecha), lunes = sumar(fecha, -((d.getUTCDay() + 6) % 7)), domingo = sumar(lunes, 6);
    return prog.especiales.filter(function (e) { return e.proxima && e.proxima >= lunes && e.proxima <= domingo; })
        .sort(function (a, b) { return a.proxima.localeCompare(b.proxima); });
}

function dd(f) { return f ? f.slice(8, 10) + '/' + f.slice(5, 7) : ''; }
function nombreLote(x) { return x.mr + (x.lote && !/^N\/?A$/i.test(x.lote) ? ' lote ' + x.lote : ''); }
// Texto para WhatsApp con lo de hoy por cuadrilla
export function textoDelDia(est, especiales) {
    var f = est.fecha, lin = ['PROGRAMACIÓN CORTE DE CÉSPED · ' + f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4),
        'Semana ' + est.semana + (est.dia ? ', día ' + est.dia + ' (' + nombreDia(est.dia) + ')' : ' (domingo)') + ' · Q' + est.quincena, ''];
    est.cuadrillas.forEach(function (c) {
        lin.push('Cuadrilla ' + c.cuad + ' · ' + c.hechos + ' de ' + c.total + ' hechos' + (c.atrasados.length ? ' · ' + c.atrasados.length + ' atrasados' : ' · al día'));
        if (c.hoy.length) lin.push('  Hoy: ' + c.hoy.map(nombreLote).join(', '));
        if (c.siguen.length) lin.push('  Va en: ' + nombreLote(c.siguen[0]) + (c.ultimo ? ' (último marcado ' + dd(c.ultimo.fecha) + ')' : ''));
    });
    if (especiales && especiales.length) {
        lin.push('', 'Operaciones especiales de la semana');
        especiales.forEach(function (e) { lin.push('  ' + dd(e.proxima) + ' ' + e.ruta + (e.ejecutado ? ' (ejecutado ' + (e.ejecutado.length > 3 ? dd(e.ejecutado) : '') + ')' : '')); });
    }
    return lin.join('\n');
}

// Estado de un lote en una fecha: 'hecho' (X en el Excel), 'app' (visita en la app), 'atrasado', 'hoy', 'pendiente' o 'sin'
// (el Excel no dice semana o día). enApp(lote) como en estadoDelDia
export var ESTADOS_LOTE = { hecho: 'Hecho (X)', app: 'Con visita en la app', atrasado: 'Atrasado', hoy: 'Le toca hoy', pendiente: 'Pendiente', sin: 'Sin día en el Excel' };
export function estadoLote(x, prog, fecha, enApp) {
    if (x.hecho) return 'hecho';
    if (enApp && enApp(x)) return 'app';
    if (x.semana == null || x.dia == null) return 'sin';
    var sd = semanaDia(prog.mes, fecha) || { semana: 1, dia: 1 }, dia = sd.dia || 7;
    if (x.semana === sd.semana && x.dia === sd.dia) return 'hoy';
    return x.semana < sd.semana || (x.semana === sd.semana && x.dia < dia) ? 'atrasado' : 'pendiente';
}
// Lotes de la quincena de la fecha (Q2 si existe y la fecha cae en la semana 3 o después)
export function lotesDeQuincena(prog, fecha) {
    var sd = semanaDia(prog.mes, fecha) || { semana: 1 };
    return quincenaDe(sd.semana) === 1 ? prog.q1 : (prog.q2.length ? prog.q2 : prog.q1);
}
// Zona operativa de la microrruta: Z1CC0100 → '1'
export function zonaDe(mr) { var m = String(mr || '').match(/^Z(\d+)CC/i); return m ? m[1] : ''; }
