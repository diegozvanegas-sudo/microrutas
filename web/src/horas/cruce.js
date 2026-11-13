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
    var t = String(v), m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t), dd = function (x) { return ('0' + x).slice(-2); };
    if (m) return m[1] + '-' + dd(m[2]) + '-' + dd(m[3]);
    // 26/10/2026, 26-10-2026, 26.10.26
    m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(t);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + dd(m[2]) + '-' + dd(m[1]);
    // 26 de octubre de 2026, 26-oct-2026, 26 oct. 2026
    m = /(\d{1,2})[\s/.-]*(?:de\s+)?([a-zA-ZáéíóúÁÉÍÓÚ]{3,})\.?[\s/.-]*(?:del?\s+)?(\d{4})/.exec(t);
    var mes = m ? MESES.indexOf(plano(m[2]).slice(0, 3).replace('set', 'sep')) : -1;
    return mes >= 0 ? m[3] + '-' + dd(mes + 1) + '-' + dd(m[1]) : '';
}
var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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
// Todos los controles de la celda: "564 - WMQ310, 572 - WMQ316" -> ['564', '572']; "564-572" -> ['564', '572'] (las placas no cuentan)
export function controles(v) {
    return texto(v).split(/[,;/-]/).map(function (x) { return x.trim(); }).filter(function (x) { return /^\d+$/.test(x); })
        .map(ruta).filter(function (x, i, a) { return a.indexOf(x) === i; });
}
// ¿Comparten algún control? (si alguno de los dos no trae, no se puede decir que sean distintos)
export function mismoControl(a, b) {
    var x = controles(a), y = controles(b);
    return !x.length || !y.length || x.some(function (k) { return y.indexOf(k) >= 0; });
}

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
    fecha: ['fecha'], ruta: ['ruta'], control: ['control'], cargo: ['cargo'], cedula: ['cedula', 'cc', 'documento'], nombre: ['nombre', 'nombres'], apellido: ['apellido', 'apellidos'],
    hi: ['hi', 'horainicio'], hf: ['hf', 'horafin'], extra: ['hextra', 'horaextra', 'hext'], real: ['hreal', 'horareal'],
    // Distribución de las horas extras (distribucion.js): ordinaria y festiva, diurna y nocturna
    od: ['od'], on: ['on'], fd: ['fd'], fn: ['fn'],
    // TOTAL = H. REAL − H.F (el primero; el de la distribución va después de FN)
    total: ['total'],
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
    // El TOTAL de la distribución: el que va después de FN (el primero es H. REAL − H.F)
    if (c.fn != null) {
        var cab = hoja[t.encabezado] || [];
        for (var i = c.fn + 1; i < cab.length; i++) if (plano(cab[i]) === 'total') { c.totalDist = i; break; }
    }
    return { cols: c, encabezado: t.encabezado, filas: t.filas.map(function (f) {
        return { fila: f.fila, fecha: fechaIso(val(f, 'fecha')), ruta: ruta(val(f, 'ruta')), rutaVer: texto(val(f, 'ruta')).trim(), control: texto(val(f, 'control')).trim(), cargo: texto(val(f, 'cargo')).trim(),
            cedula: cedula(val(f, 'cedula')), nombre: [texto(val(f, 'apellido')).trim(), texto(val(f, 'nombre')).trim()].filter(Boolean).join(' '), hi: minutos(val(f, 'hi')), hf: minutos(val(f, 'hf')), extra: minutos(val(f, 'extra')) };
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

// Personas de la dotación ("11111111 PEREZ RUIZ, ANA - 22222222 - GOMEZ DIAZ, LUIS") -> palabras de cada nombre
function palabras(s) { return texto(s).split(/[^A-Za-zÀ-ÿ]+/).map(plano).filter(function (w) { return w.length >= 3; }); }
export function nombresDotacion(dot) {
    return texto(dot).split(/\s-\s|(?=\b\d{5,}\b)/).map(palabras).filter(function (p) { return p.length; });
}
// El nombre del reporte es una persona de la dotación: comparten al menos dos palabras y todas las del nombre más corto
// ("LOPEZ ANIBAL" = "LOPEZ GOMEZ, ANIBAL"; el orden no importa)
export function estaPorNombre(nombre, dot) {
    var a = palabras(nombre);
    if (a.length < 2) return false;
    return nombresDotacion(dot).some(function (b) {
        var comunes = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
        return comunes >= 2 && comunes >= Math.min(a.length, b.length);
    });
}

// Fechas del reporte de horas extras que no trae ningún cumplimiento cargado (casi siempre: se cargó el de otro día)
export function fechasSinCumplimiento(extras, cumplimiento) {
    var hay = {};
    cumplimiento.forEach(function (c) { hay[c.fecha] = true; });
    var faltan = extras.map(function (e) { return e.fecha; }).filter(function (f, i, a) { return a.indexOf(f) === i && !hay[f]; }).sort();
    return { faltan: faltan, trae: Object.keys(hay).filter(Boolean).sort() };
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
        // Sin la cédula (mal escrita o sin ella en la dotación): el nombre en la dotación ese día
        if (!candidatos.length && e.nombre) {
            candidatos = delDia.filter(function (c) { return estaPorNombre(e.nombre, c.dotacion); });
            if (candidatos.length) como = 'nombre';
        }
        // Ni cédula ni nombre: la misma ruta ese día y, si no, el mismo control (camión), para revisar
        if (!candidatos.length && e.ruta) {
            candidatos = delDia.filter(function (c) { return c.codigo === e.ruta; });
            if (candidatos.length) como = 'ruta';
        }
        if (!candidatos.length && e.control) {
            // Un camión hace varios turnos el mismo día: solo el que llegó cerca del fin de este turno
            // (entre 4 horas antes y 6 después de la H.F); sin H.I o H.F no se puede saber cuál es
            candidatos = e.hi == null || e.hf == null ? [] : delDia.filter(function (c) {
                var d = c.real == null ? null : desde(e.hi, c.real) - desde(e.hi, e.hf);
                return controles(c.camion).length && mismoControl(c.camion, e.control) && d != null && d >= -240 && d <= 360;
            });
            if (candidatos.length) como = 'control';
        }
        // No está ese día: ¿está otro día? (solo para avisar; esa hora no se usa)
        var otrosDias = [];
        if (!candidatos.length) {
            otrosDias = cumplimiento.filter(function (c) {
                return c.fecha !== e.fecha && (e.cedula.length >= 5 && new RegExp('(^|[^0-9])' + e.cedula + '([^0-9]|$)').test(c.dotacion) || !!e.nombre && estaPorNombre(e.nombre, c.dotacion));
            }).map(function (c) { return c.fecha; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
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
            real: real, como: como, estado: estado, candidatos: candidatos, varias: conHora.length > 1, otrosDias: otrosDias,
            rutaReal: ref ? ref.codigoVer || ref.codigo : '', controlReal: ref ? ref.camion : '',
            // Ruta o control distintos a los del cumplimiento (si alguno de los dos no lo trae, no se marca)
            difRuta: !!ref && !!e.ruta && !!ref.codigo && ref.codigo !== e.ruta,
            difControl: !!ref && !mismoControl(ref.camion, e.control),
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
        if (f.como === 'ruta' || f.como === 'control' || f.como === 'nombre') r.porRuta++;
        if (f.real != null && f.extraReportada != null && f.usar !== false) { r.minReportados += f.extraReportada; r.minReales += f.extraReal; }
    });
    return r;
}

// Conductor o tripulante sin hora real propia (su fila no trae HORA REAL o no está en la dotación): toma la de un compañero de su
// misma ruta ese día (y del mismo control si los dos lo traen), marcada como «conductor» o «companero» para revisarla
export function esConductor(f) { return plano(f.cargo).indexOf('conductor') >= 0; }
export function completarTripulantes(filas, tolerancia) {
    tolerancia = tolerancia == null ? 5 : tolerancia;
    // Compañeros con hora propia (por cédula o nombre); primero el conductor y, si no hay, otro tripulante
    var conHora = filas.filter(function (f) { return f.real != null && (f.como === 'cedula' || f.como === 'nombre'); });
    return filas.map(function (f) {
        if (f.real != null) return f;
        var c = conHora.filter(function (k) {
            return k !== f && k.fecha === f.fecha && k.ruta && k.ruta === f.ruta && mismoControl(k.control, f.control);
        }).sort(function (a, b) { return esConductor(b) - esConductor(a); })[0];
        if (!c) return f;
        var dif = diferencia(f.hi, f.extra, c.real);
        // La hora sale de la fila del compañero: la ruta y el control se comparan con esa misma fila
        return Object.assign({}, f, {
            rutaReal: c.rutaReal, controlReal: c.controlReal, difRuta: c.difRuta, difControl: !!c.controlReal && !mismoControl(c.controlReal, f.control),
            real: c.real, como: esConductor(c) ? 'conductor' : 'companero', conductor: c.nombre, diferencia: dif, extraReal: extra(f.hi, f.hf, c.real),
            estado: Math.abs(dif) <= tolerancia ? 'ok' : dif < 0 ? 'mas' : 'menos'
        });
    });
}

// Tripulante que el cumplimiento pone ese día en la dotación de otra ruta o de otro camión (los tripulantes salen en varias
// dotaciones el mismo día): se compara con la fila del cumplimiento de SU CONDUCTOR, el del mismo turno del reporte (misma
// fecha, misma ruta y mismo control), y toma la hora real de ese turno. Solo si así cuadra mejor que con su propia fila
// (menos casillas distintas). Queda en otraFila dónde lo ponía el cumplimiento, para avisarlo.
function distintas(f) { return (f.difRuta ? 1 : 0) + (f.difControl ? 1 : 0); }
export function tripulanteConSuConductor(filas, tolerancia) {
    tolerancia = tolerancia == null ? 5 : tolerancia;
    var conductores = filas.filter(function (f) { return esConductor(f) && (f.como === 'cedula' || f.como === 'nombre') && f.candidatos && f.candidatos.length; });
    return filas.map(function (f) {
        if (esConductor(f) || !distintas(f) || ['cedula', 'nombre'].indexOf(f.como) < 0) return f;
        var c = conductores.filter(function (k) { return k.fecha === f.fecha && !!k.ruta && k.ruta === f.ruta && mismoControl(k.control, f.control); })[0];
        if (!c) return f;
        var conEl = { difRuta: c.difRuta, difControl: !mismoControl(c.controlReal, f.control) };
        if (distintas(conEl) >= distintas(f)) return f;
        var dif = diferencia(f.hi, f.extra, c.real);
        return Object.assign({}, f, conEl, {
            real: c.real, como: 'conductor', conductor: c.nombre, porTurno: true, varias: false,
            otraFila: { ruta: f.rutaReal, control: f.controlReal },
            rutaReal: c.rutaReal, controlReal: c.controlReal,
            diferencia: dif, extraReal: extra(f.hi, f.hf, c.real),
            estado: c.real == null ? 'sinhora' : Math.abs(dif) <= tolerancia ? 'ok' : dif < 0 ? 'mas' : 'menos'
        });
    });
}
