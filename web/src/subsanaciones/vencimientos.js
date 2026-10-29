// Vencimientos de las pendientes por cuadrilla: cuántas están a tiempo (y cuánto les queda) y cuántas
// ya van para descuento en la factura (y hace cuánto se vencieron). Usa el plazo de cada novedad (estado.js).
import { esOp, plazoVisita, PLAZO_D } from './estado.js';

// Reglas de plazo (las mismas de diasPlazo en estado.js), para mostrarlas junto al resumen
export var REGLAS = [
    { tipo: 'Posoperación (lote ejecutado)', novedad: 'Recolección y barrido', plazo: 'El mismo día de la visita' },
    { tipo: 'Posoperación (lote ejecutado)', novedad: 'Afectación o heridas a árboles', plazo: 'No subsanable: va directo a descuento' },
    { tipo: 'Posoperación (lote ejecutado)', novedad: 'Las demás novedades', plazo: PLAZO_D + ' días' },
    { tipo: 'Operación', novedad: 'Mallas, demarcación del área de trabajo y PMT', plazo: 'Inmediato (el mismo día)' },
    { tipo: 'Operación', novedad: 'Las demás novedades', plazo: PLAZO_D + ' días' },
    { tipo: 'Cualquiera', novedad: 'Lote cerrado o no realizado', plazo: 'Sin plazo: no entra en este resumen' },
];

// Columnas del resumen, de la más tranquila a la más grave
export var TRAMOS = [
    { id: 'hoy', titulo: 'Vence hoy', grupo: 'tiempo' },
    { id: 'manana', titulo: 'Vence mañana', grupo: 'tiempo' },
    { id: 'pronto', titulo: 'Vence en 2 a 5 días', grupo: 'tiempo' },
    { id: 'v1', titulo: 'Vencida hace 1 día', grupo: 'descuento' },
    { id: 'v2', titulo: 'Vencida hace 2 a 3 días', grupo: 'descuento' },
    { id: 'v4', titulo: 'Vencida hace 4 días o más', grupo: 'descuento' },
    { id: 'ns', titulo: 'No subsanable', grupo: 'descuento' },
];

export function tramo(p) {
    if (!p) return null;
    if (!p.descuento) return p.resta === 0 ? 'hoy' : p.resta === 1 ? 'manana' : 'pronto';
    if (!p.vencido) return 'ns';
    return p.vencido === 1 ? 'v1' : p.vencido <= 3 ? 'v2' : 'v4';
}

function cuadrillaDe(r) { return String(r.CUADRILLA || '').trim().replace(/^C\s*/i, ''); }
function vacia(cuad) {
    var f = { cuad: cuad, total: 0, descuento: 0 };
    TRAMOS.forEach(function (t) { f[t.id] = 0; });
    return f;
}

// { filas: [por cuadrilla], total, detalle: [{ r, cuad, tramo, p }] } solo con las pendientes que tienen plazo
export function vencimientos(lista) {
    var porCuad = {}, total = vacia('total'), detalle = [];
    lista.forEach(function (r) {
        if (r.ESTADO !== 'PENDIENTE') return;
        var p = plazoVisita(r), t = tramo(p);
        if (!t) return;
        var cuad = cuadrillaDe(r);
        var f = porCuad[cuad] = porCuad[cuad] || vacia(cuad);
        [f, total].forEach(function (x) { x[t]++; x.total++; if (p.descuento) x.descuento++; });
        detalle.push({ r: r, cuad: cuad, tramo: t, p: p });
    });
    var filas = Object.keys(porCuad).sort(function (a, b) { return (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es', { numeric: true }); })
        .map(function (c) { return porCuad[c]; });
    // Primero las más atrasadas (no subsanables al final de las vencidas), luego las que vencen antes
    var peso = function (x) { return x.p.descuento ? (x.p.vencido ? 1000 + x.p.vencido : 999) : 100 - x.p.resta; };
    detalle.sort(function (a, b) { return peso(b) - peso(a); });
    return { filas: filas, total: total, detalle: detalle };
}

function nombreLote(r) { return [r.LOTE ? 'Lote ' + r.LOTE : '', r.MICRORRUTA].filter(Boolean).join(' · ') + (esOp(r) ? ' (operación)' : ''); }
export function textoPlazo(x) {
    return x.p.descuento ? x.p.motivo : x.p.resta === 0 ? 'Vence hoy' : 'Vence en ' + x.p.resta + (x.p.resta === 1 ? ' día' : ' días');
}

// Texto para WhatsApp: totales y, por cuadrilla, lo vencido y lo que vence hoy o mañana
export function textoVencimientos(res, hoyTxt) {
    var t = res.total;
    if (!t.total) return '';
    var lineas = ['VENCIMIENTOS DE NOVEDADES PENDIENTES', 'Corte: ' + hoyTxt + ' · ' + t.total + (t.total === 1 ? ' pendiente' : ' pendientes'), '',
        '💸 Para descuento: ' + t.descuento + (t.descuento ? ' (1 día: ' + t.v1 + ' · 2-3 días: ' + t.v2 + ' · 4+ días: ' + t.v4 + ' · no subsanables: ' + t.ns + ')' : ''),
        '⏳ A tiempo: ' + (t.total - t.descuento) + (t.total - t.descuento ? ' (hoy: ' + t.hoy + ' · mañana: ' + t.manana + ' · 2-5 días: ' + t.pronto + ')' : '')];
    res.filas.forEach(function (f) {
        var urgentes = res.detalle.filter(function (x) { return x.cuad === f.cuad && x.tramo !== 'pronto'; });
        if (!urgentes.length) return;
        lineas.push('', (f.cuad ? 'Cuadrilla ' + f.cuad : 'Sin cuadrilla'));
        urgentes.forEach(function (x) { lineas.push('- ' + nombreLote(x.r) + ' · visita ' + (x.r['FECHA DE LA VISITA'] || '—') + ' · ' + textoPlazo(x)); });
    });
    return lineas.join('\n');
}
