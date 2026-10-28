// Horarios de rutas de recolección (horarios.html y el cruce de horas.html): lee el Excel de horarios (una hoja por zona)
// y revisa si la H.I y la H.F del reporte de horas extras son las del horario de la ruta ese día.
// Sin nada de la página ni de ExcelJS, para probarlo con npm test.
import { minutos, hhmm, texto, ruta, tabla } from '../horas/cruce.js';

export var COLUMNAS_HORARIOS = {
    ruta: ['nombredelamicrorruta', 'microrruta', 'ruta'], macro: ['macrorrutanombreotiposervicio', 'macrorruta'],
    dias: ['diasdelafrecuencia', 'dias'], horario: ['horario'], turno: ['turno'], obs: ['observacion', 'observaciones'],
};
// Duración del turno: H.F = H.I + 8 horas
export var TURNO = 480;
export var NOMBRES_DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
var DIAS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sabados: 6, domingo: 7, domingos: 7 };

// "1-2-3-4-5-6" o 7 -> [1, 2, 3, 4, 5, 6] (1 = lunes … 7 = domingo)
export function diasFrecuencia(v) {
    return (texto(v).match(/[1-7]/g) || []).map(Number).filter(function (d, i, a) { return a.indexOf(d) === i; });
}
// 'aaaa-mm-dd' -> 1 (lunes) … 7 (domingo)
export function diaSemana(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? null : d.getUTCDay() || 7;
}

// HORARIO -> horas de salida en minutos. Una hora de Excel, o texto con varias: "6:00 y 8:00", "6:00:00 a. m.- 8:00:00 a. m."
export function horasDe(v) {
    if (v instanceof Date || typeof v === 'number') { var m = minutos(v); return m == null ? [] : [m]; }
    var t = texto(v), r = [], re = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?/gi, x;
    while ((x = re.exec(t))) {
        var h = +x[1] % 24;
        if (x[3] && /p/i.test(x[3]) && h < 12) h += 12;
        if (x[3] && /a/i.test(x[3]) && h === 12) h = 0;
        if (r.indexOf(h * 60 + +x[2]) < 0) r.push(h * 60 + +x[2]);
    }
    return r;
}

// OBSERVACIÓN -> { porDia: { 4: 480 }, horas: [300] }. "LOS DIAS JUEVES SALE LA RUTA A LAS 8:00" cambia la hora del jueves;
// "Miercoles sale a las 6 los sabados a las 8": cada hora es para los días nombrados antes de ella.
// Una hora sin día ("SAP se despachan a las 5:00") también se da por buena cualquier día.
export function leerObservacion(v) {
    var t = texto(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var re = /\b(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b|(\d{1,2}):(\d{2})|\ba\s+las?\s+(\d{1,2})\b|\b(\d{1,2})\s*a\.?\s*m\b/g;
    var r = { porDia: {}, horas: [] }, pendientes = [], x;
    while ((x = re.exec(t))) {
        if (x[1]) { pendientes.push(DIAS[x[1]]); continue; }
        var h = +(x[2] || x[4] || x[5]) % 24, min = h * 60 + (x[3] ? +x[3] : 0);
        if (pendientes.length) pendientes.forEach(function (d) { r.porDia[d] = min; });
        else if (r.horas.indexOf(min) < 0) r.horas.push(min);
        pendientes = [];
    }
    return r;
}

// Hojas del Excel de horarios ([{ nombre, valores }], valores como ws.getSheetValues()) ->
// { rutas: { '415507': { ruta, zona, macro, dias, horas, porDia, turno, obs, horarioVer } }, n } o null si ninguna hoja sirve
export function leerHorarios(hojas) {
    var rutas = {}, n;
    hojas.forEach(function (hoja) {
        var t = tabla(hoja.valores, COLUMNAS_HORARIOS, ['ruta', 'horario']);
        if (!t) return;
        var c = t.cols, val = function (f, k) { return c[k] == null ? null : f.v[c[k]]; };
        t.filas.forEach(function (f) {
            var r = ruta(val(f, 'ruta'));
            if (!r) return;
            var obs = texto(val(f, 'obs')).trim(), extra = leerObservacion(obs), horas = horasDe(val(f, 'horario'));
            extra.horas.forEach(function (h) { if (horas.indexOf(h) < 0) horas.push(h); });
            var h = val(f, 'horario');
            rutas[r] = {
                ruta: r, zona: hoja.nombre, macro: texto(val(f, 'macro')).trim(), dias: diasFrecuencia(val(f, 'dias')),
                horas: horas, porDia: extra.porDia, turno: texto(val(f, 'turno')).trim(), obs: obs,
                horarioVer: h instanceof Date || typeof h === 'number' ? hhmm(minutos(h)) : texto(h).trim(),
            };
        });
    });
    // n: rutas distintas (si una ruta aparece en dos hojas queda la última)
    n = Object.keys(rutas).length;
    return n ? { rutas: rutas, n: n } : null;
}

// Horas de salida válidas para la ruta ese día: la del día si la observación la cambia, si no las del horario
export function horasDelDia(h, dia) {
    return h.porDia[dia] != null ? [h.porDia[dia]] : h.horas;
}

// Una fila del reporte de horas extras ({ fecha, ruta, hi, hf }) frente a los horarios ({ rutas }).
// -> { horario, dia, esperadas, difHi, difHf, fueraDeDia }: difHi/difHf, la hora no es la del horario; fueraDeDia, la ruta no sale ese día
export function revisarHorario(e, horarios) {
    var h = horarios && horarios.rutas[e.ruta];
    if (!h) return { horario: null, difHi: false, difHf: false, fueraDeDia: false };
    var dia = diaSemana(e.fecha), esperadas = horasDelDia(h, dia);
    return {
        horario: h, dia: dia, esperadas: esperadas,
        difHi: e.hi != null && esperadas.length > 0 && esperadas.indexOf(e.hi) < 0,
        difHf: e.hf != null && esperadas.length > 0 && !esperadas.some(function (x) { return (x + TURNO) % 1440 === e.hf; }),
        fueraDeDia: !!dia && h.dias.length > 0 && h.dias.indexOf(dia) < 0,
    };
}

// [1, 4] -> "lunes y jueves"; todos los días de lunes a sábado -> "lunes a sábado"
export function textoDias(dias) {
    if (!dias.length) return '';
    var seguidos = dias.every(function (d, i) { return i === 0 || d === dias[i - 1] + 1; });
    if (seguidos && dias.length > 2) return NOMBRES_DIAS[dias[0]] + ' a ' + NOMBRES_DIAS[dias[dias.length - 1]];
    var n = dias.map(function (d) { return NOMBRES_DIAS[d]; });
    return n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
}
