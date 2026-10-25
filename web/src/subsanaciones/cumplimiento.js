// Cumplimiento por cuadrilla contra la frecuencia de cada lote (programación de direcciones_lotes.js).
// Un lote cuenta como ejecutado en la fecha de ejecución de su visita (o la de la visita si no la tiene);
// no cuentan las visitas de operación ni las de lote cerrado o no realizado.
import { aInput, norm } from './util.js';
import { esOp, loteNoRevisable } from './estado.js';

export var PERIODO = { MENSUAL: 30, QUINCENAL: 15 };
var VECES_MES = { MENSUAL: 1, QUINCENAL: 2 };

// Microrruta de la programación a la que pertenece la visita (por código o por número de lote)
function mrDe(r, LOTES, porLote) {
    var mr = String(r.MICRORRUTA || '').trim().toUpperCase();
    if (LOTES[mr]) return mr;
    var lote = String(r.LOTE || '').trim();
    return lote && lote !== 'NA' ? porLote[String(+lote || lote)] || null : null;
}

// { mr: ['aaaa-mm-dd', ...] } fechas distintas de ejecución por microrruta
export function ejecuciones(registros, LOTES) {
    var porLote = {};
    Object.keys(LOTES).forEach(function (mr) { var l = String(LOTES[mr].lote || '').trim(); if (l && !porLote[l]) porLote[l] = mr; });
    var out = {};
    registros.forEach(function (r) {
        if (esOp(r) || loteNoRevisable(r)) return;
        var mr = mrDe(r, LOTES, porLote), f = aInput(r['FECHA DE EJECUCIÓN']) || aInput(r['FECHA DE LA VISITA']);
        if (!mr || !f) return;
        var l = out[mr] || (out[mr] = []);
        if (l.indexOf(f) === -1) l.push(f);
    });
    return out;
}

// mes: 'aaaa-mm'; hoyStr: 'aaaa-mm-dd'. Filas por cuadrilla (orden numérico, "sin" al final) y el total.
export function cumplimiento(registros, LOTES, mes, hoyStr) {
    var ej = ejecuciones(registros, LOTES), filas = {}, hoy0 = new Date(hoyStr);
    Object.keys(LOTES).forEach(function (mr) {
        var p = LOTES[mr], frec = norm(p.frec), periodo = PERIODO[frec] || 30, veces = VECES_MES[frec] || 1;
        var c = String(p.cuad || '').trim() || 'sin';
        var f = filas[c] || (filas[c] = { cuad: c, lotes: 0, programadas: 0, ejecutadas: 0, aldia: 0, vencidos: 0, sin: 0 });
        var fechas = ej[mr] || [];
        f.lotes++;
        f.programadas += veces;
        // Más ejecuciones de las que pide la frecuencia no suben el cumplimiento
        f.ejecutadas += Math.min(veces, fechas.filter(function (d) { return d.slice(0, 7) === mes; }).length);
        var ultima = fechas.filter(function (d) { return d <= hoyStr; }).sort().pop();
        if (!ultima) f.sin++;
        else if ((hoy0 - new Date(ultima)) / 864e5 >= periodo) f.vencidos++;
        else f.aldia++;
    });
    var lista = Object.keys(filas).map(function (k) { return filas[k]; }).sort(function (a, b) {
        return a.cuad === 'sin' ? 1 : b.cuad === 'sin' ? -1 : (+a.cuad || 0) - (+b.cuad || 0) || a.cuad.localeCompare(b.cuad);
    });
    var total = lista.reduce(function (t, f) {
        ['lotes', 'programadas', 'ejecutadas', 'aldia', 'vencidos', 'sin'].forEach(function (k) { t[k] += f[k]; });
        return t;
    }, { cuad: 'Total', lotes: 0, programadas: 0, ejecutadas: 0, aldia: 0, vencidos: 0, sin: 0 });
    return { filas: lista, total: total };
}

export function porcentaje(a, b) { return b ? Math.round(100 * a / b) : 0; }
