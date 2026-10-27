// Reglas de la visita: tipo, ítems en NO, ítems subsanados y estado.
// La base de datos recalcula el estado al guardar; aquí se usa para mostrarlo mientras se llena el formulario.
import { esc, norm, valorItem, dias } from './util.js';

// Dos tipos de visita: al lote ya ejecutado (SUB-) y durante la operación (OPE-)
export var EJ = 'EJECUCIÓN', OP = 'OPERACIÓN';
export var NO_REALIZADO = 'LOTE NO REALIZADO', CERRADO = 'LOTE CERRADO';

// Ítems activos de cada tipo; los fija la página al leer la base
var catalogo = { ej: [], op: [] };
export function fijarItems(items, itemsOp) { catalogo.ej = items; catalogo.op = itemsOp; }

export function esOp(r) { return !!r && (r.TIPO === OP || /^OPE-/.test(r.ID || '')); }
export function itemsDe(r) { return esOp(r) ? catalogo.op : catalogo.ej; }

// La base guarda solo la nota; registros viejos pueden traer "PENDIENTE POR SUBSANAR - nota" / "NOVEDAD SUBSANADA EL fecha - nota"
export function limpiarObs(s) {
    var re = /^(PENDIENTE POR SUBSANAR|NOVEDAD SUBSANADA(\s+EL\s+\d{1,2}\/\d{1,2}\/\d{4})?|SIN NOVEDAD)\s*(-\s*)?/i, antes;
    s = String(s == null ? '' : s).trim();
    do { antes = s; s = s.replace(re, '').trim(); } while (s !== antes);
    return s;
}
export function loteNoRevisable(r) { var n = norm(r['OBSERVACIONES NOVEDADES']); return n.indexOf(CERRADO) !== -1 || n.indexOf(NO_REALIZADO) !== -1; }
// Plazo de corrección que va en el mensaje de cada novedad (lo fija la interventoría):
// posoperación: recolección y barrido el mismo día, heridas a árboles no son subsanables, lo demás 5 días;
// operación: mallas, demarcación del área de trabajo y PMT de inmediato, lo demás 5 días.
// Días calendario desde la visita; -1 = no subsanable, null = sin plazo (lote cerrado o no realizado)
export var PLAZO_D = 5;
export function diasPlazo(texto, op) {
    var n = norm(texto);
    if (n.indexOf(NO_REALIZADO) !== -1 || n.indexOf(CERRADO) !== -1) return null;
    if (op) return /PMT|MALLA|DEMARCACION/.test(n) ? 0 : PLAZO_D;
    if (/ARBOL/.test(n) && /AFECTACION|HERIDA/.test(n)) return -1;
    return /RECOLECCION|BARRIDO/.test(n) ? 0 : PLAZO_D;
}
export function plazoNovedad(texto, op) {
    var p = diasPlazo(texto, op);
    return p == null ? '' : p < 0 ? 'No subsanable' : p === 0 ? (op ? 'Plazo: inmediato' : 'Plazo: el mismo día') : 'Plazo: ' + p + ' días';
}
export function itemsEnNo(r) { return itemsDe(r).filter(function (i) { return valorItem(r[i]) === 'NO'; }); }
// Pendiente con alguna novedad que ya pasó su plazo (o no es subsanable): va para descuento en la factura.
// { descuento: true, motivo } o, si aún está a tiempo, { descuento: false, resta: días que le quedan }; null si no aplica
export function plazoVisita(r) {
    var d = r.ESTADO === 'PENDIENTE' ? dias(r['FECHA DE LA VISITA']) : null;
    if (d == null) return null;
    var op = esOp(r), obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    // Igual que el mensaje de WhatsApp: en un lote no realizado no se miran los ítems
    var textos = norm(obs).indexOf(NO_REALIZADO) !== -1 ? [] : itemsEnNo(r);
    if (obs && norm(obs) !== 'SIN NOVEDAD') textos = textos.concat(obs);
    var plazos = textos.map(function (t) { return diasPlazo(t, op); }).filter(function (p) { return p != null; });
    if (!plazos.length) return null;
    if (plazos.indexOf(-1) !== -1) return { descuento: true, motivo: 'No subsanable' };
    var resta = Math.min.apply(null, plazos) - d;
    return resta < 0 ? { descuento: true, motivo: 'Plazo vencido hace ' + (-resta === 1 ? '1 día' : -resta + ' días') } : { descuento: false, resta: resta };
}
export function paraDescuento(r) { var p = plazoVisita(r); return !!(p && p.descuento); }
// Ítems que estuvieron en NO y ya se corrigieron (los anota la base al subsanar)
export function itemsSubsanados(r) {
    var lista = String(r['ÍTEMS SUBSANADOS'] || '').split('|').map(norm);
    return itemsDe(r).filter(function (i) { return lista.indexOf(norm(i)) !== -1 && valorItem(r[i]) !== 'NO'; });
}
// Visita al lote ejecutado: es la que cuenta para la pre-ruta, la frecuencia y el estado del lote en el mapa
export function deLote(r) { return !esOp(r); }
export function esCerrado(r) { return norm(r['OBSERVACIONES NOVEDADES']).indexOf(CERRADO) !== -1; }
// Lote cerrado: no se pudo entrar a revisarlo (ítems en N/A); no cuenta como sin novedad
export function calcularEstado(r, anterior) {
    if (itemsEnNo(r).length) return 'PENDIENTE';
    if (esCerrado(r)) return 'CERRADO';
    return (anterior === 'PENDIENTE' || anterior === 'SUBSANADO') ? 'SUBSANADO' : 'SIN NOVEDAD';
}
export function badge(estado) { return estado ? '<span class="estado e-' + estado.replace(/ /g, '-') + '">' + esc(estado) + '</span>' : ''; }

// Observación como en el Excel de interventoría: lote cerrado / no realizado tal cual,
// si no el estado con la fecha de subsanación al lado
export function textoObservacion(r) {
    var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim();
    if (loteNoRevisable(r)) return obs;
    var nota = limpiarObs(obs), mas = nota ? ' - ' + nota : '';
    if (r.ESTADO === 'SUBSANADO') return 'NOVEDAD SUBSANADA' + (r['FECHA SUBSANACIÓN'] ? ' EL ' + r['FECHA SUBSANACIÓN'] : '') + mas;
    if (r.ESTADO === 'PENDIENTE') return 'PENDIENTE POR SUBSANAR' + mas;
    return nota || 'SIN NOVEDAD';
}
