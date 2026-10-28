// Horas extras (horas.html): cruza el reporte de horas extras con el reporte de cumplimiento por turno.
// Por cada persona del reporte de horas extras busca su cédula en la "Dotación" del cumplimiento, en la misma fecha,
// y toma la HORA REAL de llegada para compararla con la H. EXTRA que reportaron.
// Sin nada de la página ni de ExcelJS, para probarlo con npm test. Los archivos no salen del navegador.

export function plano(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

// Valor de una celda de hora -> minutos del día (o null). ExcelJS entrega las horas como fechas de 1899 en UTC;
// también llegan como fracción de día (0.5 = 12:00) o como texto "22:57" / "6:55 p. m.".
export function minutos(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v.getUTCHours() * 60 + v.getUTCMinutes();
    if (typeof v === 'number') return isFinite(v) ? Math.round((v % 1) * 1440) % 1440 : null;
    if (typeof v === 'object') return minutos(v.result != null ? v.result : v.text != null ? v.text : v.richText ? v.richText.map(function (t) { return t.text; }).join('') : null);
    var m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?/i.exec(String(v));
    if (!m) return null;
    var h = +m[1] % 24;
    if (m[3] && /p/i.test(m[3]) && h < 12) h += 12;
    if (m[3] && /a/i.test(m[3]) && h === 12) h = 0;
    return h * 60 + +m[2];
}
// 1015 -> "16:55"
export function hhmm(min) { return min == null ? '' : ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
// 95 -> "+1:35", -20 -> "−0:20"
export function duracion(min, conSigno) {
    if (min == null) return '';
    var a = Math.abs(min);
    return (conSigno ? (min > 0 ? '+' : min < 0 ? '−' : '') : min < 0 ? '−' : '') + Math.floor(a / 60) + ':' + ('0' + (a % 60)).slice(-2);
}

// Celda de fecha -> 'aaaa-mm-dd'. Fechas de Excel (Date en UTC), "26/10/2026 11:00" o "2026-10-26"
export function fechaIso(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'object') return fechaIso(v.result != null ? v.result : v.text);
    if (typeof v === 'number') return fechaIso(new Date(Math.round((v - 25569) * 864e5)));
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v));
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

export function texto(v) {
    if (v == null) return '';
    if (typeof v === 'object' && !(v instanceof Date)) {
        if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
        if (v.result != null) return String(v.result);
        if (v.text != null) return String(v.text);
    }
    return String(v);
}
// Ruta o código: "0418419", " 0418419 " y 418419 son la misma
export function ruta(v) { return texto(v).replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toUpperCase(); }
export function cedula(v) { return texto(v).replace(/\D/g, ''); }
// Control del vehículo: el número de la columna Camión del cumplimiento ("635 - ABC123" -> "635")
export function control(v) { return ruta(texto(v).split('-')[0]); }

// Fila de encabezados -> { clave: número de columna }. claves: { fecha: ['fecha'], ... } con los nombres planos aceptados
export function columnas(encabezados, claves) {
    var r = {};
    Object.keys(claves).forEach(function (k) {
        for (var i = 0; i < encabezados.length; i++) {
            if (claves[k].indexOf(plano(encabezados[i])) >= 0) { r[k] = i; return; }
        }
    });
    return r;
}
export var COLUMNAS_EXTRAS = {
    fecha: ['fecha'], ruta: ['ruta'], control: ['control'], cargo: ['cargo'], cedula: ['cedula', 'cc', 'documento'], nombre: ['nombre'],
    hi: ['hi', 'horainicio'], hf: ['hf', 'horafin'], extra: ['hextra', 'horaextra', 'hext'], real: ['hreal', 'horareal'],
};
export var COLUMNAS_CUMPLIMIENTO = { fecha: ['fecha'], real: ['horareal'], codigo: ['codigo', 'ruta'], camion: ['camion', 'vehiculo'], dotacion: ['dotacion'] };

// Filas de una hoja (arreglos de valores, como ws.getSheetValues() de ExcelJS) -> { cols, filas: [{ fila, v }] } o null.
// El encabezado es la fila (entre las 10 primeras) que reconoce más columnas; exigidas: las que no pueden faltar.
export function tabla(hoja, claves, exigidas) {
    var mejor = null;
    for (var i = 0; i < Math.min(hoja.length, 10); i++) {
        var cols = columnas(hoja[i] || [], claves), n = Object.keys(cols).length;
        if (!mejor || n > mejor.n) mejor = { i: i, n: n, cols: cols };
    }
    if (!mejor || exigidas.some(function (k) { return mejor.cols[k] == null; })) return null;
    var filas = [];
    for (var j = mejor.i + 1; j < hoja.length; j++) if (hoja[j] && hoja[j].some(function (x) { return x != null && x !== ''; })) filas.push({ fila: j, v: hoja[j] });
    return { cols: mejor.cols, filas: filas, encabezado: mejor.i };
}
// Hoja de horas extras -> filas para cruzar (fila: índice en la hoja, para escribir luego la H. REAL)
export function leerExtras(hoja) {
    var t = tabla(hoja, COLUMNAS_EXTRAS, ['fecha', 'cedula', 'extra']);
    if (!t) return null;
    var c = t.cols, val = function (f, k) { return c[k] == null ? null : f.v[c[k]]; };
    return { cols: c, encabezado: t.encabezado, filas: t.filas.map(function (f) {
        return { fila: f.fila, fecha: fechaIso(val(f, 'fecha')), ruta: ruta(val(f, 'ruta')), rutaVer: texto(val(f, 'ruta')).trim(), control: texto(val(f, 'control')).trim(), cargo: texto(val(f, 'cargo')).trim(),
            cedula: cedula(val(f, 'cedula')), nombre: texto(val(f, 'nombre')).trim(), hi: minutos(val(f, 'hi')), hf: minutos(val(f, 'hf')), extra: minutos(val(f, 'extra')) };
    }).filter(function (e) { return e.cedula || e.nombre; }) };
}
// Hoja del reporte de cumplimiento -> [{ fecha, real, codigo, camion, control, dotacion }]
export function leerCumplimiento(hoja) {
    var t = tabla(hoja, COLUMNAS_CUMPLIMIENTO, ['fecha', 'real', 'dotacion']);
    if (!t) return null;
    var c = t.cols, val = function (f, k) { return c[k] == null ? null : f.v[c[k]]; };
    return t.filas.map(function (f) {
        return { fecha: fechaIso(val(f, 'fecha')), real: minutos(val(f, 'real')), codigo: ruta(val(f, 'codigo')), codigoVer: texto(val(f, 'codigo')).trim(), camion: texto(val(f, 'camion')).trim(), control: control(val(f, 'camion')), dotacion: texto(val(f, 'dotacion')) };
    });
}

// Minutos desde la hora de inicio del turno (los turnos de noche pasan la medianoche: 21:00 → 06:55 son 595 min)
function desde(hi, t) { return hi == null || t == null ? t : (t - hi + 1440) % 1440; }
// Tiempo extra: lo que pasa de la hora final del turno (0 si llegó antes)
export function extra(hi, hf, llegada) {
    if (hf == null || llegada == null) return null;
    return Math.max(0, desde(hi, llegada) - desde(hi, hf));
}
// Diferencia real − reportada, en minutos (negativa: llegó antes de lo que reportaron)
export function diferencia(hi, reportada, real) {
    if (reportada == null || real == null) return null;
    var d = desde(hi, real) - desde(hi, reportada);
    return d > 720 ? d - 1440 : d < -720 ? d + 1440 : d;
}

// Cruce. extras: [{ fila, fecha, ruta, control, cedula, nombre, cargo, hi, hf, extra }] (horas en minutos);
// cumplimiento: [{ fecha, real, codigo, camion, control, dotacion }]. tolerancia: minutos de diferencia que se dan por buenos.
// Devuelve una fila por persona con { real, como: 'cedula'|'ruta'|'', estado, candidatos, diferencia, extraReportada, extraReal,
// difRuta, difControl (no coinciden con el cumplimiento), rutaReal, controlReal }.
// estado: ok · mas (reportaron más tarde de lo real) · menos (reportaron más temprano) · sinhora (está, pero sin HORA REAL) · nada
export function cruzar(extras, cumplimiento, tolerancia) {
    tolerancia = tolerancia == null ? 5 : tolerancia;
    var porFecha = {};
    cumplimiento.forEach(function (c) { (porFecha[c.fecha] || (porFecha[c.fecha] = [])).push(c); });
    return extras.map(function (e) {
        var delDia = porFecha[e.fecha] || [], como = '', candidatos = [];
        if (e.cedula.length >= 5) {
            var re = new RegExp('(^|[^0-9])' + e.cedula + '([^0-9]|$)');
            candidatos = delDia.filter(function (c) { return re.test(c.dotacion); });
            if (candidatos.length) como = 'cedula';
        }
        // Sin la cédula en la dotación (a veces solo traen el nombre): la misma ruta ese día, para revisar
        if (!candidatos.length && e.ruta) {
            candidatos = delDia.filter(function (c) { return c.codigo === e.ruta; });
            if (candidatos.length) como = 'ruta';
        }
        var conHora = candidatos.filter(function (c) { return c.real != null; });
        // Varias el mismo día: primero la de la misma ruta y luego la más tarde
        conHora.sort(function (a, b) {
            return (b.codigo === e.ruta) - (a.codigo === e.ruta) || desde(e.hi, b.real) - desde(e.hi, a.real);
        });
        var elegida = conHora[0] || null, real = elegida ? elegida.real : null;
        // Con qué se comparan la ruta y el control: la elegida o, sin hora real, la primera encontrada
        var ref = elegida || candidatos[0] || null;
        var dif = diferencia(e.hi, e.extra, real);
        var estado = !candidatos.length ? 'nada' : real == null ? 'sinhora' : Math.abs(dif) <= tolerancia ? 'ok' : dif < 0 ? 'mas' : 'menos';
        return Object.assign({}, e, {
            real: real, como: como, estado: estado, candidatos: candidatos, varias: conHora.length > 1,
            rutaReal: ref ? ref.codigoVer || ref.codigo : '', controlReal: ref ? ref.camion : '',
            // Ruta o control distintos a los del cumplimiento (si alguno de los dos no lo trae, no se marca)
            difRuta: !!ref && !!e.ruta && !!ref.codigo && ref.codigo !== e.ruta,
            difControl: !!ref && !!e.control && !!ref.control && ref.control !== ruta(e.control),
            diferencia: dif, extraReportada: extra(e.hi, e.hf, e.extra), extraReal: extra(e.hi, e.hf, real),
        });
    });
}

// Totales del cruce: cuántas por estado y las horas extras reportadas frente a las reales (solo donde hay hora real
// y no se desmarcó con usar: false)
export function resumen(filas) {
    var r = { total: filas.length, ok: 0, mas: 0, menos: 0, sinhora: 0, nada: 0, porRuta: 0, minReportados: 0, minReales: 0 };
    filas.forEach(function (f) {
        r[f.estado]++;
        if (f.como === 'ruta') r.porRuta++;
        if (f.real != null && f.extraReportada != null && f.usar !== false) { r.minReportados += f.extraReportada; r.minReales += f.extraReal; }
    });
    return r;
}
