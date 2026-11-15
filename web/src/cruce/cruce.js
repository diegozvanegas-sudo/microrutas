// 📊 Cruce programado / realizado: lo que cada cuadrilla tenía que hacer según la quincena y el día (Excel de programación)
// contra lo que reportó como hecho (los «REPORTE MICRORRUTAS EJECUTADAS» de WhatsApp y la X del Excel).
// Aquí va solo la lógica (sin pantalla).
//
//   leerReportes(texto, LOTES)        -> { reportes: [{ fecha, cuad, items: [{ mr, lote }], texto }], avisos: [texto] }
//   unirReportes(guardados, nuevos)   -> lista con un reporte por fecha y cuadrilla (el nuevo reemplaza al viejo)
//   cruzar(prog, reportes, fecha)     -> { mes, fecha, q, rango, filas, fuera, repetidos, cuadrillas, dias, cuenta }
import { fechaPlan, semanaDia, quincenaDe, rangoQuincena } from '../subsanaciones/programacion.js';

// «z1cc125», «Z1CC0125» → Z1CC0125
export function normMr(v) {
    var m = String(v || '').trim().toUpperCase().match(/^Z(\d+)CC0*(\d+)$/);
    return m ? 'Z' + Number(m[1]) + 'CC' + ('000' + Number(m[2])).slice(-4) : '';
}
function utc(s) { return new Date(s + 'T00:00:00Z'); }
export function diasEntre(a, b) { return Math.round((utc(b) - utc(a)) / 864e5); }
export function sumarDias(f, n) { var d = utc(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Días hábiles (lunes a sábado) después de `a` y hasta `b`: el atraso se cuenta en días de trabajo, el domingo no se programa
export function habilesEntre(a, b) {
    var n = 0;
    for (var f = sumarDias(a, 1); f <= b; f = sumarDias(f, 1)) if (utc(f).getUTCDay() !== 0) n++;
    return n;
}
var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function diaCorto(f) { return f ? DIAS[utc(f).getUTCDay()] + ' ' + f.slice(8, 10) + '/' + f.slice(5, 7) : ''; }
function ordenCuad(a, b) { var x = Number(a), y = Number(b); return (isFinite(x) ? x : 999) - (isFinite(y) ? y : 999) || String(a).localeCompare(String(b)); }

// ---------- Leer los reportes pegados ----------
// Un reporte es un mensaje con su fecha, su cuadrilla y las microrrutas («Z1cc0125 (98)»). Se pueden pegar varios seguidos:
// cada «REPORTE MICRORRUTAS EJECUTADAS», «Lotes ejecutados…» o cada fecha nueva abre otro.
var RE_INICIO = /reporte\s+(de\s+)?microrrutas|microrrutas\s+ejecutadas\s+cw|lotes\s+ejecutados/i;
var RE_FECHA = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/;
var RE_CUAD = /cuadrilla\s*(?:n[°º.o]*\s*)?[#:]?\s*(\d{1,2})\b/i;
function fechaDeTexto(t) {
    var m = RE_FECHA.exec(t);
    if (!m) return '';
    var a = m[3].length === 2 ? '20' + m[3] : m[3], f = a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 ? f : '';
}
function partirBloques(texto) {
    var bloques = [], actual = [], tieneFecha = false, tieneMr = false;
    var cerrar = function () { if (actual.join('').trim()) bloques.push(actual.join('\n')); actual = []; tieneFecha = false; tieneMr = false; };
    String(texto || '').split(/\r?\n/).forEach(function (r) {
        var fecha = RE_FECHA.test(r) && !/^\s*\[?\d{1,2}:\d{2}/.test(r) && /fecha|ejecutad/i.test(r);
        // Otro encabezado, u otra fecha cuando el bloque ya tiene la suya y sus microrrutas: empieza un reporte nuevo
        // (o el encabezado «[17:18, 28/10/2026] Nombre:» de otro mensaje copiado de WhatsApp)
        if ((RE_INICIO.test(r) && (tieneMr || tieneFecha)) || (fecha && tieneFecha && tieneMr) || (tieneMr && /^\s*\[\d{1,2}:\d{2}/.test(r))) cerrar();
        if (fecha) tieneFecha = true;
        if (/Z\d+CC\d{2,5}/i.test(r)) tieneMr = true;
        actual.push(r);
    });
    cerrar();
    return bloques;
}
// LOTES: data/direcciones_lotes.js (por microrruta), para saber el número de lote y, si falta la cuadrilla, a cuál pertenece
export function leerReportes(texto, LOTES) {
    LOTES = LOTES || {};
    var porLote = {}, reportes = [], avisos = [];
    Object.keys(LOTES).forEach(function (mr) { var l = String(LOTES[mr].lote || ''); if (l && !/^N\/?A$/i.test(l)) porLote[String(Number(l))] = mr; });
    partirBloques(texto).forEach(function (b) {
        var items = [], vistos = {}, m, re = /\b(Z\d+CC\d{2,5})\b(?:\s*\(\s*(\d{1,5})\s*\))?/gi;
        while ((m = re.exec(b))) {
            var mr = normMr(m[1]);
            if (!mr || vistos[mr]) continue;
            vistos[mr] = 1;
            var deBase = LOTES[mr] && LOTES[mr].lote && !/^N\/?A$/i.test(LOTES[mr].lote) ? String(LOTES[mr].lote) : '';
            items.push({ mr: mr, lote: deBase || (m[2] ? String(+m[2]) : '') });
        }
        // Renglones que son solo un número de lote («532»): mensajes viejos de «Lotes ejecutados…»
        b.split('\n').forEach(function (r) {
            var n = /^\s*(?:lote\s*)?(\d{1,4})\s*$/i.exec(r);
            if (!n) return;
            var lote = String(+n[1]), mr = porLote[lote] || '';
            if (!mr || vistos[mr]) return;
            vistos[mr] = 1;
            items.push({ mr: mr, lote: lote });
        });
        if (!items.length) return;
        // La fecha escrita en el reporte manda; si no la trae, la del encabezado de WhatsApp («[17:18, 28/10/2026] …»)
        var sinHora = b.replace(/^\s*\[\d{1,2}:\d{2}[^\n]*?\]/gm, ''), fecha = fechaDeTexto(sinHora), c = RE_CUAD.exec(b), cuad = c ? String(+c[1]) : '';
        if (!fecha && fechaDeTexto(b)) { fecha = fechaDeTexto(b); avisos.push('Un reporte no traía «Fecha:»: se tomó la del mensaje de WhatsApp (' + fecha.slice(8) + '/' + fecha.slice(5, 7) + ').'); }
        if (!cuad) {
            // Sin «Cuadrilla: 4» en el mensaje: la de la mayoría de sus microrrutas
            var votos = {};
            items.forEach(function (i) { var q = LOTES[i.mr] && LOTES[i.mr].cuad; if (q) votos[q] = (votos[q] || 0) + 1; });
            cuad = Object.keys(votos).sort(function (x, y) { return votos[y] - votos[x]; })[0] || '';
            if (cuad) avisos.push('Un reporte no decía la cuadrilla: se tomó la ' + cuad + ' por sus microrrutas.');
        }
        if (!fecha) { avisos.push('Un reporte de ' + items.length + ' microrrutas' + (cuad ? ' (cuadrilla ' + cuad + ')' : '') + ' no trae la fecha: no se cargó. Escriba «Fecha: dd-mm-aaaa» arriba y péguelo de nuevo.'); return; }
        reportes.push({ fecha: fecha, cuad: cuad, items: items, texto: b.trim().slice(0, 1500) });
    });
    if (!reportes.length && !avisos.length) avisos.push('No se encontró ningún reporte: deben traer la fecha y las microrrutas (Z1CC0125).');
    return { reportes: reportes, avisos: avisos };
}
export function claveReporte(r) { return r.fecha + '|' + r.cuad; }
// Un reporte por fecha y cuadrilla: si llega otro del mismo día y cuadrilla, reemplaza al anterior (corrección del supervisor)
export function unirReportes(guardados, nuevos) {
    var por = {};
    (guardados || []).concat(nuevos || []).forEach(function (r) { por[claveReporte(r)] = r; });
    return Object.keys(por).sort().map(function (k) { return por[k]; });
}

// ---------- El cruce ----------
// Estado de cada lote programado, visto en la fecha de corte:
//   atiempo  se hizo el día que tocaba        tarde    se hizo después        antes   se hizo antes de su día
//   hechosf  tiene la X en el Excel sin fecha
//   atrasado no se ha hecho y ya le tocaba    hoy      le toca en la fecha     pendiente  le toca después
//   sin      el Excel no dice qué día le toca
export var ESTADOS = { atiempo: 'A tiempo', tarde: 'Hecho tarde', antes: 'Adelantado', hechosf: 'Hecho (sin fecha)', atrasado: 'Atrasado', hoy: 'Le toca hoy', pendiente: 'Pendiente', sin: 'Sin día en el Excel' };
export function esHecho(e) { return e === 'atiempo' || e === 'tarde' || e === 'antes' || e === 'hechosf'; }

export function cruzar(prog, reportes, fecha) {
    var sd = semanaDia(prog.mes, fecha) || { semana: 1, dia: 1 }, q = quincenaDe(sd.semana);
    if (q === 2 && !(prog.q2 || []).length) q = 1;
    var rango = rangoQuincena(prog, q);
    // Todos los lotes programados del mes, con su fecha
    var filas = [], porMr = {};
    [[1, prog.q1 || []], [2, prog.q2 || []]].forEach(function (par) {
        par[1].forEach(function (x) {
            var f = { q: par[0], x: x, mr: x.mr, lote: x.lote, cuad: x.cuad, plan: x.semana != null && x.dia != null ? fechaPlan(prog.mes, x.semana, x.dia) : '',
                real: '', fuente: '', excel: x.hecho ? (x.fecha || 'sí') : '', reporte: '', cuadReporte: '', choque: false };
            filas.push(f);
            (porMr[x.mr] = porMr[x.mr] || []).push(f);
        });
    });
    // Cada microrruta reportada se asigna a su fila: la de la quincena del reporte; si no está en esa quincena, a la que
    // siga sin reporte (un lote mensual de Q1 que se hizo en fechas de Q2 = hecho tarde)
    var fuera = [], repetidos = [], otroMes = 0;
    // Solo los reportes del mes de la programación (de su semana 1 a una semana después de la última): los de otro mes no se cruzan
    var ini = fechaPlan(prog.mes, 1, 1), fin = sumarDias(rangoQuincena(prog, 2).hasta, 7);
    (reportes || []).slice().sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).forEach(function (r) {
        if (r.fecha < ini || r.fecha > fin) { otroMes++; return; }
        if (r.fecha > fecha) return;   // el corte: lo reportado después todavía no cuenta
        var srd = semanaDia(prog.mes, r.fecha), qr = srd ? quincenaDe(srd.semana) : 1;
        r.items.forEach(function (it) {
            var cands = porMr[it.mr] || [];
            if (!cands.length) { fuera.push({ mr: it.mr, lote: it.lote, fecha: r.fecha, cuad: r.cuad }); return; }
            var f = cands.filter(function (c) { return c.q === qr; })[0] || cands.filter(function (c) { return !c.reporte; })[0] || cands[cands.length - 1];
            if (f.reporte) { if (f.reporte !== r.fecha) repetidos.push({ mr: it.mr, lote: f.lote, cuad: f.cuad, fechas: [f.reporte, r.fecha] }); return; }
            f.reporte = r.fecha; f.cuadReporte = r.cuad;
        });
    });
    filas.forEach(function (f) {
        var excelFecha = /^\d{4}-/.test(f.excel) && f.excel <= fecha ? f.excel : '';
        f.real = f.reporte || excelFecha;
        f.fuente = f.reporte && f.excel ? 'ambos' : f.reporte ? 'reporte' : f.excel ? 'excel' : '';
        // El reporte dice una fecha y el Excel otra: se deja la del reporte y se avisa
        f.choque = !!(f.reporte && excelFecha && f.reporte !== excelFecha);
        f.otraCuad = !!(f.cuadReporte && f.cuad && f.cuadReporte !== f.cuad);
        if (f.real) { f.dif = f.plan ? diasEntre(f.plan, f.real) : null; f.estado = !f.plan ? 'hechosf' : f.dif === 0 ? 'atiempo' : f.dif > 0 ? 'tarde' : 'antes'; }
        else if (f.excel) { f.dif = null; f.estado = 'hechosf'; }
        else { f.dif = null; f.estado = !f.plan ? 'sin' : f.plan < fecha ? 'atrasado' : f.plan === fecha ? 'hoy' : 'pendiente'; }
    });

    // Por cuadrilla, en la quincena de la fecha
    var deQ = filas.filter(function (f) { return f.q === q; }), porCuad = {};
    deQ.forEach(function (f) { (porCuad[f.cuad] = porCuad[f.cuad] || []).push(f); });
    var porPlan = function (a, b) { return (a.plan === '') - (b.plan === '') || a.plan.localeCompare(b.plan) || a.x.fila - b.x.fila; };
    var cuadrillas = Object.keys(porCuad).sort(ordenCuad).map(function (c) {
        var L = porCuad[c].sort(porPlan), hechos = L.filter(function (f) { return esHecho(f.estado); });
        var debian = L.filter(function (f) { return f.plan && f.plan <= fecha; }), atrasados = L.filter(function (f) { return f.estado === 'atrasado'; });
        var hechosDeDebian = debian.filter(function (f) { return esHecho(f.estado); }).length;
        var adelantados = L.filter(function (f) { return esHecho(f.estado) && f.plan > fecha; });
        // «Dónde va» son dos cosas distintas:
        //   frente: el día de la programación que iba trabajando en su último reporte (el más avanzado de lo que hizo ese día)
        //   vaEn:   el primer día programado que todavía tiene algo sin hacer (lo más viejo que dejó atrás)
        // Una cuadrilla que va en lo del día pero se saltó un lote la primera semana no lleva «dos semanas de atraso»: va al
        // día y dejó lotes atrás. Atrasada es la que tiene el frente en un día que ya pasó (o no ha reportado)
        var falta = L.filter(function (f) { return !esHecho(f.estado) && f.plan; })[0];
        var vaEn = falta ? falta.plan : '';
        var conFecha = hechos.filter(function (f) { return f.real; }), ultima = conFecha.reduce(function (m, f) { return f.real > m ? f.real : m; }, '');
        var frente = conFecha.filter(function (f) { return f.real === ultima && f.plan; }).reduce(function (m, f) { return f.plan > m ? f.plan : m; }, '');
        // El atraso se mide contra lo que ya venció: si todavía no ha reportado el día de corte, ese día no cuenta
        var desde = frente || (vaEn && vaEn < fecha ? sumarDias(vaEn, -1) : ''), ref = ultima === fecha ? fecha : sumarDias(fecha, -1);
        var atraso = atrasados.length && desde && desde < ref ? habilesEntre(desde, ref) : 0;
        return {
            cuad: c, total: L.length, hechos: hechos.length, debian: debian.length, hechosDeDebian: hechosDeDebian,
            cumplimiento: debian.length ? Math.round(100 * hechosDeDebian / debian.length) : null,
            atrasados: atrasados, adelantados: adelantados,
            tocaban: L.filter(function (f) { return f.plan === fecha; }),
            hizo: filas.filter(function (f) { return f.real === fecha && (f.cuadReporte || f.cuad) === c; }).sort(porPlan),
            vaEn: vaEn, frente: frente, atraso: atraso, sinReportar: ultima && ultima < fecha ? habilesEntre(ultima, fecha) : 0,
            situacion: !falta ? 'terminada' : atraso > 0 ? 'atrasada' : atrasados.length ? 'huecos' : adelantados.length ? 'adelantada' : 'aldia',
            ultimo: ultima ? { fecha: ultima, filas: conFecha.filter(function (f) { return f.real === ultima; }) } : null,
            filas: L
        };
    });
    // Calendario de la quincena: por día (lunes a sábado) y cuadrilla
    var dias = [];
    for (var d = rango.desde; d <= rango.hasta; d = sumarDias(d, 1)) if (utc(d).getUTCDay() !== 0) dias.push(d);
    var calendario = cuadrillas.map(function (c) {
        return { cuad: c.cuad, dias: dias.map(function (dia) {
            var prog = c.filas.filter(function (f) { return f.plan === dia; });
            return { fecha: dia, prog: prog.length, hechos: prog.filter(function (f) { return esHecho(f.estado); }).length,
                reportados: filas.filter(function (f) { return f.real === dia && (f.cuadReporte || f.cuad) === c.cuad; }).length };
        }) };
    });
    var cuenta = { total: deQ.length, debian: 0, hechos: 0, hechosDeDebian: 0, atrasado: 0, tarde: 0, antes: 0, atiempo: 0, hoy: 0, pendiente: 0, sin: 0, hechosf: 0 };
    deQ.forEach(function (f) { cuenta[f.estado]++; if (esHecho(f.estado)) cuenta.hechos++; if (f.plan && f.plan <= fecha) { cuenta.debian++; if (esHecho(f.estado)) cuenta.hechosDeDebian++; } });
    cuenta.cumplimiento = cuenta.debian ? Math.round(100 * cuenta.hechosDeDebian / cuenta.debian) : null;
    return { mes: prog.mes, fecha: fecha, q: q, semana: sd.semana, dia: sd.dia, rango: rango, filas: deQ, todas: filas,
        fuera: fuera, repetidos: repetidos, otroMes: otroMes, cuadrillas: cuadrillas, dias: dias, calendario: calendario, cuenta: cuenta,
        choques: deQ.filter(function (f) { return f.choque; }), otraCuad: deQ.filter(function (f) { return f.otraCuad; }) };
}

// ---------- Textos ----------
export function rotulo(f) { return f.lote && !/^N\/?A$/i.test(f.lote) ? f.lote : f.mr; }
// Qué se le pone a un lote hecho: «a tiempo», «2 días tarde (tocaba lun 09/11)», «1 día antes»
export function textoDif(f) {
    if (f.estado === 'atiempo') return 'a tiempo';
    if (f.estado === 'tarde') return f.dif + (f.dif === 1 ? ' día' : ' días') + ' tarde (tocaba ' + diaCorto(f.plan) + ')';
    if (f.estado === 'antes') return -f.dif + (f.dif === -1 ? ' día' : ' días') + ' antes (tocaba ' + diaCorto(f.plan) + ')';
    if (f.estado === 'hechosf') return f.plan ? 'con X en el Excel, sin fecha' : 'sin día en el Excel';
    return '';
}
export function textoSituacion(c, fecha) {
    if (c.situacion === 'terminada') return '✅ Terminó lo programado de la quincena.';
    var n = c.atrasados.length + (c.atrasados.length === 1 ? ' lote' : ' lotes'), viejo = c.atrasados.length > 1 ? ', el más viejo del ' + diaCorto(c.vaEn) : '';
    if (c.situacion === 'atrasada') return (c.frente ? '❌ Va en lo del ' + diaCorto(c.frente) : '❌ Sin reportes: debía ir en lo del ' + diaCorto(fecha)) + ': ' + c.atraso + (c.atraso === 1 ? ' día hábil' : ' días hábiles') +
        ' de atraso · ' + n + ' sin hacer' + viejo + '.' + (c.sinReportar > 1 ? ' No reporta desde el ' + diaCorto(c.ultimo.fecha) + '.' : '');
    if (c.situacion === 'huecos') return '🟠 Va en lo del día, pero dejó ' + n + ' atrás' + viejo + (c.atrasados.length === 1 ? ' (del ' + diaCorto(c.vaEn) + ')' : '') + '.';
    if (c.situacion === 'adelantada') return '⏩ Al día y adelantada: ya hizo ' + c.adelantados.length + (c.adelantados.length === 1 ? ' lote' : ' lotes') + ' de días que vienen.';
    return c.vaEn === fecha ? '🟢 Al día: está en lo de hoy.' : '🟢 Al día: lo que sigue es del ' + diaCorto(c.vaEn) + '.';
}
// Resumen para WhatsApp
export function textoCruce(r) {
    var lin = ['📊 *Cruce programado / realizado · Q' + r.q + '*', 'Corte: ' + diaCorto(r.fecha) + ' · debían ir ' + r.cuenta.debian + ' lotes, van ' + r.cuenta.hechosDeDebian +
        (r.cuenta.cumplimiento != null ? ' (' + r.cuenta.cumplimiento + ' %)' : '') + ' · atrasados ' + r.cuenta.atrasado];
    r.cuadrillas.forEach(function (c) {
        lin.push('');
        lin.push('*Cuadrilla ' + c.cuad + '* · ' + c.hechos + ' de ' + c.total + (c.cumplimiento != null ? ' · cumplimiento ' + c.cumplimiento + ' %' : ''));
        lin.push(textoSituacion(c, r.fecha));
        if (c.tocaban.length) lin.push('Hoy le tocaban: ' + c.tocaban.map(function (f) { return rotulo(f) + (esHecho(f.estado) ? ' ✓' : ' ✗'); }).join(', '));
        if (c.hizo.length) lin.push('Reportó hoy: ' + c.hizo.map(rotulo).join(', '));
        if (c.atrasados.length) lin.push('Sin hacer: ' + c.atrasados.map(function (f) { return rotulo(f) + ' (' + diaCorto(f.plan) + ')'; }).join(', '));
    });
    if (r.fuera.length) { lin.push(''); lin.push('⚠ Reportados que no están en la programación: ' + r.fuera.map(function (f) { return f.mr + ' (' + diaCorto(f.fecha) + ', C' + f.cuad + ')'; }).join(', ')); }
    return lin.join('\n');
}
