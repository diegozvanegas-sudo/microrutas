// 🔮 Predicción de la programación: a qué lotes va probablemente cada cuadrilla un día, y qué día va probablemente a un lote.
// El plan (semana y día de cada lote) es el mismo todos los meses; lo que cambia es cuánto se atrasa cada cuadrilla.
// Probable = día del plan + el atraso de la cuadrilla en días hábiles (lunes a sábado):
//   · el de este mes (los últimos lotes marcados con su fecha), si ya hay suficientes;
//   · si no, el de los meses anteriores en esa misma semana del mes (historial) o en todo el mes.
// Historial (queda en el equipo): por lote, en qué fecha se hizo cada mes y quincena. Sale de los Excel de meses anteriores y
// de las visitas registradas en la app. Solo la lógica; la ventana está en app.js.
import { fechaPlan, semanaDia, quincenaDe, lunesSemana1 } from './programacion.js';

function utc(s) { return new Date(s + 'T00:00:00Z'); }
function iso(d) { return d.toISOString().slice(0, 10); }
function sumar(s, n) { var d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function domingo(f) { return utc(f).getUTCDay() === 0; }

// Días hábiles (lunes a sábado) para ir de a hasta b: positivo si b es después. Un domingo cuenta como el sábado anterior
export function habilesEntre(a, b) {
    if (!a || !b || a === b) return 0;
    var signo = b > a ? 1 : -1, n = 0, f = a;
    for (var i = 0; i < 400 && f !== b; i++) { f = sumar(f, signo); if (!domingo(f)) n += signo; }
    return n;
}
// Mover n días hábiles (n puede ser negativo); desde un domingo, 0 hábiles = el lunes siguiente
export function sumarHabiles(f, n) {
    var paso = n < 0 ? -1 : 1, falta = Math.abs(n);
    if (!n) { while (domingo(f)) f = sumar(f, 1); return f; }
    while (falta > 0) { f = sumar(f, paso); if (!domingo(f)) falta--; }
    return f;
}
export function mesSiguiente(mes) { var d = utc(mes + '-01'); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d).slice(0, 7); }
export function mesAnterior(mes) { var d = utc(mes + '-01'); d.setUTCMonth(d.getUTCMonth() - 1); return iso(d).slice(0, 7); }

// Mes de verdad de un Excel: el de la mitad de las fechas de ejecución (un archivo puede llamarse «09_Octubre» y traer octubre)
export function mesDeFechas(prog) {
    var fs = prog.q1.concat(prog.q2 || []).filter(function (x) { return x.hecho && x.fecha; }).map(function (x) { return x.fecha; }).sort();
    return fs.length >= 10 ? fs[Math.floor(fs.length / 2)].slice(0, 7) : prog.mes;
}
export function claveLote(x) { return x.mr + '|' + x.lote; }

// Historial vacío: { meses: { 'aaaa-mm': { origen, n } }, lotes: { 'MR|lote': [[mes, q, fecha], …] } }
export function historialVacio() { return { meses: {}, lotes: {} }; }
// Un mes de un Excel al historial (reemplaza ese mes si ya estaba). → { mes, n, corrido: true si el nombre decía otro mes }
export function agregarExcel(hist, prog, origen) {
    var mes = mesDeFechas(prog), n = 0;
    Object.keys(hist.lotes).forEach(function (k) {
        hist.lotes[k] = hist.lotes[k].filter(function (e) { return e[0] !== mes; });
        if (!hist.lotes[k].length) delete hist.lotes[k];
    });
    [[1, prog.q1], [2, prog.q2 || []]].forEach(function (p) {
        p[1].forEach(function (x) {
            if (!x.hecho || !x.fecha || x.fecha.slice(0, 7) < mes.slice(0, 7) && habilesEntre(x.fecha, lunesSemana1(mes)) > 6) return;
            (hist.lotes[claveLote(x)] = hist.lotes[claveLote(x)] || []).push([mes, p[0], x.fecha]);
            n++;
        });
    });
    hist.meses[mes] = { origen: 'excel', archivo: String(origen || ''), n: n };
    return { mes: mes, n: n, corrido: mes !== prog.mes };
}
// Visitas de la app (fecha de ejecución por lote) para los meses que no tienen Excel en el historial.
// visitas: [{ mr, lote, fecha }]; prog: el plan (para saber la quincena de cada lote)
export function agregarVisitas(hist, prog, visitas) {
    var plan = indicePlan(prog), n = 0, meses = {};
    visitas.forEach(function (v) {
        var mes = String(v.fecha || '').slice(0, 7);
        if (!mes || (hist.meses[mes] && hist.meses[mes].origen === 'excel')) return;
        var sd = semanaDia(mes, v.fecha);
        if (!sd) return;
        var q = quincenaDe(sd.semana), k = (v.mr || '') + '|' + (v.lote || ''), x = plan[k + '|' + q] || plan[k + '|1'];
        if (!x) {   // la visita tiene solo la microrruta o solo el lote
            var otra = Object.keys(plan).find(function (c) { var p = plan[c]; return (v.mr && p.mr === v.mr || v.lote && p.lote === v.lote) && c.slice(-1) === String(q); });
            x = otra && plan[otra];
        }
        if (!x) return;
        var L = hist.lotes[claveLote(x)] = hist.lotes[claveLote(x)] || [];
        if (L.some(function (e) { return e[0] === mes && e[1] === q; })) return;
        L.push([mes, q, v.fecha]);
        meses[mes] = (meses[mes] || 0) + 1; n++;
    });
    Object.keys(meses).forEach(function (m) { hist.meses[m] = { origen: 'app', n: (hist.meses[m] && hist.meses[m].origen === 'app' ? hist.meses[m].n : 0) + meses[m] }; });
    return n;
}

// Plan por lote y quincena: 'MR|lote|q' → fila del Excel (la Q2 vacía usa la base de la Q1)
function indicePlan(prog) {
    var out = {};
    prog.q1.forEach(function (x) { out[claveLote(x) + '|1'] = x; });
    (prog.q2 && prog.q2.length ? prog.q2 : prog.q1).forEach(function (x) { out[claveLote(x) + '|2'] = x; });
    return out;
}
function mediana(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.floor(s.length / 2)] : 0; }
function percentil(a, p) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; }

// Atrasos del historial (meses distintos de excluir): { cuad: [{ mes, semana, d }] } con d en días hábiles (real − plan)
export function muestrasHistorial(prog, hist, excluir) {
    var plan = indicePlan(prog), out = {};
    Object.keys(hist.lotes).forEach(function (k) {
        hist.lotes[k].forEach(function (e) {
            var x = plan[k + '|' + e[1]];
            if (e[0] === excluir || !x || x.semana == null || x.dia == null) return;
            (out[x.cuad] = out[x.cuad] || []).push({ mes: e[0], semana: x.semana, d: habilesEntre(fechaPlan(e[0], x.semana, x.dia), e[2]) });
        });
    });
    return out;
}

// Atraso probable de una cuadrilla en una fecha (días hábiles). hecho(x) → fecha real de las filas de este mes ('' si no;
// true si se hizo sin fecha: cuenta como hecho pero no sirve para medir el atraso).
// → { dias, fuente: 'mes' | 'historial' | 'sin', n, desde, hasta (rango donde cae el 80 %), meses: [...] }
// Lo de este mes manda: con 3 o más lotes marcados se usa solo eso; con 1 o 2 se promedia con el historial (cada mes la
// cuadrilla puede cambiar de ritmo: en las pruebas, agosto iba +7, octubre +5 y noviembre al día). Puede ser negativo (adelantada)
var MIN_MES = 3;
export function atrasoCuadrilla(cuad, prog, muestras, fecha, hecho, semana) {
    var mes = prog.mes, recientes = [];
    if (fecha.slice(0, 7) === mes) {
        recientes = prog.q1.concat(prog.q2 || []).filter(function (x) { return x.cuad === cuad && x.semana != null && x.dia != null; })
            .map(function (x) { var f = hecho(x); return typeof f === 'string' && /^\d{4}-\d\d-\d\d$/.test(f) && f <= fecha ? { f: f, d: habilesEntre(fechaPlan(mes, x.semana, x.dia), f) } : null; })
            .filter(Boolean).sort(function (a, b) { return a.f < b.f ? 1 : -1; }).slice(0, 12).map(function (m) { return m.d; });
        if (recientes.length >= MIN_MES) return { dias: mediana(recientes), fuente: 'mes', n: recientes.length, desde: percentil(recientes, .1), hasta: percentil(recientes, .9), meses: [mes] };
    }
    var todas = muestras[cuad] || [], misma = todas.filter(function (m) { return m.semana === semana; });
    var usar = misma.length >= 5 ? misma : todas, ds = usar.map(function (m) { return m.d; });
    var meses = usar.map(function (m) { return m.mes; }).filter(function (m, i, a) { return a.indexOf(m) === i; }).sort();
    if (ds.length < 3) {
        if (!recientes.length) return { dias: 0, fuente: 'sin', n: 0, desde: 0, hasta: 0, meses: [] };
        return { dias: mediana(recientes), fuente: 'mes', n: recientes.length, desde: Math.min.apply(null, recientes), hasta: Math.max.apply(null, recientes), meses: [mes] };
    }
    var h = mediana(ds);
    if (recientes.length) {
        var suma = recientes.reduce(function (a, b) { return a + b; }, 0);
        return { dias: Math.round((suma + h) / (recientes.length + 1)), fuente: 'mezcla', n: recientes.length + ds.length,
            desde: Math.min(percentil(ds, .1), Math.min.apply(null, recientes)), hasta: Math.max(percentil(ds, .9), Math.max.apply(null, recientes)), meses: meses.concat([mes]) };
    }
    return { dias: h, fuente: 'historial', n: ds.length, desde: percentil(ds, .1), hasta: percentil(ds, .9), meses: meses };
}

// Semana y día del plan para una fecha, en el mes de la fecha o al final del mes anterior (si el atraso la corre para atrás)
function planDe(fecha) {
    var mes = fecha.slice(0, 7), sd = fecha >= lunesSemana1(mes) ? semanaDia(mes, fecha) : null;
    if (!sd) { mes = mesAnterior(mes); sd = semanaDia(mes, fecha); }
    return sd && sd.dia ? { mes: mes, semana: sd.semana, dia: sd.dia } : null;
}

// ¿A qué lotes va probablemente cada cuadrilla el día fecha? hecho(x) → fecha real de las filas de este mes ('' si no)
// → { fecha, domingo, cuadrillas: [{ cuad, atraso, plan: { mes, semana, dia, fecha }, lotes: [pendientes], hechos: [ya hechos], antes }] }
export function predecirDia(prog, muestras, fecha, hecho) {
    hecho = hecho || function (x) { return x.hecho ? x.fecha : ''; };
    if (domingo(fecha)) return { fecha: fecha, domingo: true, cuadrillas: [] };
    var cuads = prog.q1.concat(prog.q2 || []).map(function (x) { return x.cuad; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; })
        .sort(function (a, b) { return (Number(a) || 999) - (Number(b) || 999) || String(a).localeCompare(String(b)); });
    var sdHoy = semanaDia(fecha.slice(0, 7), fecha) || { semana: 1 };
    return {
        fecha: fecha, domingo: false,
        cuadrillas: cuads.map(function (c) {
            var at = atrasoCuadrilla(c, prog, muestras, fecha, hecho, sdHoy.semana), pf = sumarHabiles(fecha, -at.dias), p = planDe(pf);
            var out = { cuad: c, atraso: at, plan: p ? { mes: p.mes, semana: p.semana, dia: p.dia, fecha: fechaPlan(p.mes, p.semana, p.dia) } : null, lotes: [], hechos: [], antes: 0 };
            if (!p) return out;
            var q = quincenaDe(p.semana), filas = q === 1 ? prog.q1 : (prog.q2 && prog.q2.length ? prog.q2 : prog.q1), deEsteMes = p.mes === prog.mes;
            filas.forEach(function (x) {
                if (x.cuad !== c || x.semana == null || x.dia == null) return;
                if (x.semana === p.semana && x.dia === p.dia) (deEsteMes && hecho(x) ? out.hechos : out.lotes).push(x);
                // Los de antes en la misma quincena que siguen sin hacer: probablemente los hagan primero
                else if (deEsteMes && !hecho(x) && fechaPlan(p.mes, x.semana, x.dia) < out.plan.fecha && quincenaDe(x.semana) === q) out.antes++;
            });
            return out;
        })
    };
}

// ¿Qué día va probablemente a este lote? x: la fila del Excel (quincena q). hoyF: hoy; hecho(x) → fecha real ('' si no)
// → { fecha, plan, atraso, vencido (ya debía estar hecho), proximoMes (ya se hizo este mes: es la del mes que viene), anteriores }
export function predecirLote(prog, muestras, hist, x, q, hoyF, hecho) {
    hecho = hecho || function (y) { return y.hecho ? y.fecha : ''; };
    var anteriores = ((hist && hist.lotes[claveLote(x)]) || []).filter(function (e) { return e[1] === q; })
        .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).map(function (e) { return { mes: e[0], fecha: e[2] }; });
    if (x.semana == null || x.dia == null) return { fecha: '', plan: '', atraso: null, vencido: false, proximoMes: false, anteriores: anteriores };
    var yaHecho = !!hecho(x), mes = yaHecho ? mesSiguiente(prog.mes) : prog.mes;
    var plan = fechaPlan(mes, x.semana, x.dia);
    var at = atrasoCuadrilla(x.cuad, prog, muestras, yaHecho ? plan : hoyF, hecho, x.semana);
    var f = sumarHabiles(plan, at.dias), vencido = !yaHecho && f < hoyF;
    return { fecha: vencido ? sumarHabiles(hoyF, 0) : f, plan: plan, atraso: at, vencido: vencido, proximoMes: yaHecho, anteriores: anteriores };
}

// Historial desde la base (tabla programaciones: [{ mes, archivo, hechos: [[mr, lote, q, fecha], …] }]), unido con lo que este
// equipo tenga de meses que la base no tiene
export function historialDeFilas(filas, local) {
    var h = historialVacio();
    (filas || []).forEach(function (f) {
        (f.hechos || []).forEach(function (e) { (h.lotes[e[0] + '|' + e[1]] = h.lotes[e[0] + '|' + e[1]] || []).push([f.mes, e[2], e[3]]); });
        h.meses[f.mes] = { origen: 'excel', archivo: f.archivo || '', n: (f.hechos || []).length, base: true };
    });
    if (local) Object.keys(local.meses || {}).forEach(function (m) {
        if (h.meses[m] || local.meses[m].origen === 'app') return;
        h.meses[m] = local.meses[m];
        Object.keys(local.lotes || {}).forEach(function (k) {
            local.lotes[k].forEach(function (e) { if (e[0] === m) (h.lotes[k] = h.lotes[k] || []).push(e); });
        });
    });
    return h;
}
