// ➕ Varios lotes a la vez (Nueva visita, lote ejecutado o durante la operación): se llenan una sola vez la fecha, el
// interventor, los ítems y las observaciones, y se guarda una visita por cada lote elegido, cada una con su microrruta,
// lote, cuadrilla, zona y área de la programación (data/direcciones_lotes.js, LOTES).
// Los lotes se escriben («115, 116, Z1CC0105») o se eligen de la lista por cuadrilla. Aquí va solo la lógica (pruebas en
// tests/varios.test.mjs); la pantalla está en app.js.
import { norm } from './util.js';

// Microrruta de un texto: «Z1CC0105», «z1cc105», «1cc105» o el número de lote («115»). '' si no es de la programación
export function aMicrorruta(texto, LOTES, mrPorLote) {
    var t = String(texto || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return '';
    if (LOTES[t]) return t;
    var m = t.match(/^Z?(\d+)CC0*(\d+)$/);
    if (m) { var mr = 'Z' + Number(m[1]) + 'CC' + ('000' + Number(m[2])).slice(-4); if (LOTES[mr]) return mr; }
    if (/^\d+$/.test(t)) return mrPorLote[String(Number(t))] || mrPorLote[t] || '';
    return '';
}

// Lo escrito (separado por comas, espacios, punto y coma o renglones) → { mrs: [...] sin repetir, malos: [...] }
export function leerLotes(texto, LOTES, mrPorLote) {
    var mrs = [], malos = [];
    String(texto || '').split(/[\s,;]+/).filter(Boolean).forEach(function (p) {
        var mr = aMicrorruta(p, LOTES, mrPorLote);
        if (!mr) { if (malos.indexOf(p) === -1) malos.push(p); return; }
        if (mrs.indexOf(mr) === -1) mrs.push(mr);
    });
    return { mrs: mrs, malos: malos };
}

// Las cuadrillas de la programación, en orden (1, 2, … 10)
export function cuadrillas(LOTES) {
    var c = [];
    Object.keys(LOTES).forEach(function (mr) { var x = String(LOTES[mr].cuad || '').trim(); if (x && c.indexOf(x) === -1) c.push(x); });
    return c.sort(function (a, b) { return (Number(a) || 999) - (Number(b) || 999) || a.localeCompare(b); });
}

// Lotes para la lista: de esa cuadrilla (o todas) y que coincidan con lo buscado (microrruta, lote o dirección)
export function lotesParaElegir(LOTES, cuad, q, max) {
    var nq = norm(q || ''), qmr = nq.replace(/\s+/g, '');
    var res = Object.keys(LOTES).filter(function (mr) {
        var p = LOTES[mr];
        if (cuad && String(p.cuad || '').trim() !== String(cuad)) return false;
        if (!nq) return true;
        var lote = p.lote && p.lote !== 'NA' ? String(p.lote) : '';
        return norm(mr).indexOf(qmr) !== -1 || lote.indexOf(nq) === 0 || (nq.length >= 3 && norm(p.d || '').indexOf(nq) !== -1);
    }).sort();
    return max ? res.slice(0, max) : res;
}

// La visita de un lote: lo común del formulario con los datos de ese lote (lo que no sea del lote queda igual)
export function registroDeLote(comun, mr, LOTES) {
    var p = LOTES[mr] || {}, r = Object.assign({}, comun), z = mr.match(/^Z(\d+)/i);
    r.MICRORRUTA = mr;
    r.LOTE = p.lote && p.lote !== 'NA' ? String(p.lote) : '';
    r.CUADRILLA = p.cuad != null && p.cuad !== '' ? String(p.cuad) : '';
    r.ZONA = z ? z[1] : '';
    r['ÁREA M2'] = p.area ? Number(p.area).toLocaleString('es-CO') : '';
    return r;
}

// Texto corto de un lote para la lista y las fichas: «Z1CC0105 · Lote 115»
export function nombreLote(mr, LOTES) {
    var p = LOTES[mr] || {};
    return mr + (p.lote && p.lote !== 'NA' ? ' · Lote ' + p.lote : '');
}
