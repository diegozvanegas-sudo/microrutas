// Tabla de visitas copiada del Excel de interventoría (o leída de un pantallazo) → visitas con la misma forma que
// las de la base, para sacar con ellas los informes de siempre (resumen, novedades del día, descuento, vencimientos, Excel).
// No guarda nada: solo lee.
//
// Dos entradas:
// - Copiado de Excel: columnas separadas por tabulación. Con el encabezado se ubica cada columna por su nombre;
//   sin él se usa el orden del formato de interventoría (lote ejecutado u operación).
// - Texto de una imagen (lector de imágenes): sin tabulaciones; cada renglón se lee por partes desde la microrruta.
import { norm, valorItem, aTexto } from './util.js';
import { EJ, OP, limpiarObs, NO_REALIZADO, CERRADO } from './estado.js';
import { fechaISO } from './fechas.js';

var MR = /^Z\d+CC\d+$/i;
// Encabezado → campo de la visita (comparado sin tildes ni mayúsculas)
var CAMPOS = {
    'MICRORRUTA': 'MICRORRUTA', 'MICRORUTA': 'MICRORRUTA', 'LOTE': 'LOTE', 'AREA M2': 'ÁREA M2', 'AREA': 'ÁREA M2',
    'CLASIFICACION': 'CLASIFICACION', 'ZONA': 'ZONA', 'CUADRILLA': 'CUADRILLA',
    'FECHA DE EJECUCION': 'FECHA DE EJECUCIÓN', 'FECHA DE LA VISITA': 'FECHA DE LA VISITA', 'FECHA VISITA': 'FECHA DE LA VISITA',
    'INTERVENTOR': 'INTERVENTOR', 'OBSERVACIONES NOVEDADES': 'OBS', 'OBSERVACIONES': 'OBS', 'OBSERVACION': 'OBS',
    'FECHA DE CORRECCION': 'F_CORR', 'FECHA SUBSANACION': 'F_CORR'
};
var IGNORAR = /^(CANTIDAD DE NOVEDADES|DIAS TRANSCURRIDOS)/;

// Excel copia con tabulaciones; una celda con salto de línea va entre comillas ("...""...")
export function partirTsv(texto) {
    var filas = [], fila = [], celda = '', i = 0, s = String(texto || '').replace(/\r\n?/g, '\n'), comillas = false;
    for (; i < s.length; i++) {
        var c = s[i];
        if (comillas) {
            if (c === '"' && s[i + 1] === '"') { celda += '"'; i++; }
            else if (c === '"') comillas = false;
            else celda += c;
        } else if (c === '"' && celda === '') comillas = true;
        else if (c === '\t') { fila.push(celda); celda = ''; }
        else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
        else celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas.map(function (f) { return f.map(function (x) { return x.replace(/\s+/g, ' ').trim(); }); })
        .filter(function (f) { return f.some(Boolean); });
}

// Nombre de columna del encabezado → campo; los ítems se reconocen por su nombre en el catálogo (o por el comienzo,
// por si el encabezado quedó cortado)
function campoDe(cab, items, itemsOp) {
    var n = norm(cab).replace(/\s*\(.*$/, '').replace(/[:.]+$/, '').trim();
    if (CAMPOS[n]) return { campo: CAMPOS[n] };
    if (IGNORAR.test(n)) return { campo: '' };
    var buscar = function (lista, tipo) {
        var it = lista.filter(function (i) { return norm(i) === norm(cab); })[0] ||
            lista.filter(function (i) { var a = norm(i), b = norm(cab); return b.length >= 6 && (a.indexOf(b) === 0 || b.indexOf(a) === 0); })[0];
        return it ? { campo: it, item: tipo } : null;
    };
    return buscar(items, 'ej') || buscar(itemsOp, 'op') || { campo: '' };
}

// Orden de columnas del formato de interventoría (el mismo de excel.js)
export function columnasFormato(op, its) {
    return ['MICRORRUTA', 'LOTE', 'ÁREA M2', 'CLASIFICACION', 'ZONA', 'CUADRILLA'].concat(op ? [] : ['FECHA DE EJECUCIÓN'],
        ['FECHA DE LA VISITA', 'INTERVENTOR'], its, ['OBS', 'F_CORR', '', '']);
}
function esFecha(s) { return !!fechaISO(s); }
function fechaTexto(s) { var f = fechaISO(s); return f ? aTexto(f) : String(s || '').trim(); }

// Celdas de un renglón (ya repartidas por columna) → visita
function aVisita(valores, op, its, n) {
    var r = { ID: 'TABLA-' + n, TIPO: op ? OP : EJ };
    Object.keys(valores).forEach(function (k) { r[k] = valores[k]; });
    var avisos = [];
    ['FECHA DE EJECUCIÓN', 'FECHA DE LA VISITA'].forEach(function (c) {
        if (r[c] == null || r[c] === '') return;
        if (!esFecha(r[c])) avisos.push(c.toLowerCase() + ' «' + r[c] + '» no es una fecha');
        r[c] = fechaTexto(r[c]);
    });
    r.MICRORRUTA = String(r.MICRORRUTA || '').toUpperCase();
    its.forEach(function (i) {
        var v = valorItem(r[i]);
        if (r[i] != null && r[i] !== '' && !v) avisos.push(i.toLowerCase() + ': «' + r[i] + '» no es SI / NO / NA');
        r[i] = v;
    });
    if (!its.some(function (i) { return r[i]; })) avisos.push('no se leyó ningún ítem');
    // Estado a partir de la observación, como la escribe el formato
    var obs = String(r.OBS || '').trim(), n0 = norm(obs), fCorr = String(r.F_CORR || '').trim();
    delete r.OBS; delete r.F_CORR;
    var enNo = its.filter(function (i) { return r[i] === 'NO'; });
    if (n0.indexOf(CERRADO) !== -1) { r.ESTADO = 'CERRADO'; r['OBSERVACIONES NOVEDADES'] = obs; }
    else if (n0.indexOf('NOVEDAD SUBSANADA') === 0) {
        // Lo que estuvo en NO ya se corrigió: queda en ÍTEMS SUBSANADOS (en verde en el Excel)
        var m = obs.match(/\bEL\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        var f = m ? m[1] : /INMEDIATAMENTE/i.test(obs) ? r['FECHA DE LA VISITA'] : esFecha(fCorr) ? fCorr : '';
        r.ESTADO = 'SUBSANADO';
        r['FECHA SUBSANACIÓN'] = f ? fechaTexto(f) : '';
        r['ÍTEMS SUBSANADOS'] = enNo.join('|');
        enNo.forEach(function (i) { r[i] = 'SI'; });
        r['OBSERVACIONES NOVEDADES'] = limpiarObs(obs.replace(/^NOVEDAD SUBSANADA\s+INMEDIATAMENTE\s*(-\s*)?/i, ''));
    } else {
        r['OBSERVACIONES NOVEDADES'] = n0.indexOf(NO_REALIZADO) !== -1 ? obs : limpiarObs(obs);
        var pendiente = enNo.length || n0.indexOf('PENDIENTE') !== -1 || n0.indexOf(NO_REALIZADO) !== -1;
        r.ESTADO = pendiente ? 'PENDIENTE' : 'SIN NOVEDAD';
    }
    return { r: r, avisos: avisos };
}

// Modo Excel: con encabezado (si hay) o con el orden del formato
function leerTsv(filas, items, itemsOp) {
    var res = { visitas: [], avisos: [], encabezado: false };
    var iCab = filas.findIndex(function (f) { return f.some(function (c) { return norm(c) === 'MICRORRUTA' || norm(c) === 'MICRORUTA'; }); });
    var mapa = null, op = null;
    if (iCab !== -1) {
        res.encabezado = true;
        mapa = filas[iCab].map(function (c) { return campoDe(c, items, itemsOp); });
        var nOp = mapa.filter(function (m) { return m.item === 'op'; }).length, nEj = mapa.filter(function (m) { return m.item === 'ej'; }).length;
        op = nOp > nEj;
        // Un ítem con el mismo nombre en los dos catálogos se toma del tipo de la hoja
        if (!nOp && !nEj) res.avisos.push('El encabezado no tiene ningún ítem conocido: revise que copió la tabla completa.');
    }
    filas.forEach(function (f, i) {
        if (i <= iCab) return;
        var mr = f.findIndex(function (c) { return MR.test(c); });
        if (mr === -1) return; // renglones vacíos o de totales
        var valores = {}, opFila = op, its;
        if (mapa) {
            its = opFila ? itemsOp : items;
            mapa.forEach(function (m, j) { if (m.campo && (!m.item || (m.item === 'op') === opFila)) valores[m.campo] = f[j] == null ? '' : f[j]; });
        } else {
            // Sin encabezado: desde la microrruta, con el orden del formato. Lote ejecutado lleva dos fechas seguidas
            // (ejecución y visita); operación, una
            var c = f.slice(mr);
            // (aunque una esté mal escrita: en operación la columna 9 ya es un ítem y en lote ejecutado es el interventor)
            opFila = !(esFecha(c[6]) && esFecha(c[7])) && !!valorItem(c[8]);
            its = opFila ? itemsOp : items;
            var cols = columnasFormato(opFila, its);
            if (c.length < cols.length - 3 || c.length > cols.length) res.avisos.push('Renglón ' + (i + 1) + ' (' + c[0] + '): tiene ' + c.length + ' columnas y el formato de ' + (opFila ? 'operación' : 'lote ejecutado') + ' lleva ' + cols.length + '.');
            cols.forEach(function (k, j) { if (k) valores[k] = c[j] == null ? '' : c[j]; });
        }
        var v = aVisita(valores, opFila, its, res.visitas.length + 1);
        v.avisos.forEach(function (a) { res.avisos.push((v.r.MICRORRUTA || 'Renglón ' + (i + 1)) + ': ' + a + '.'); });
        res.visitas.push(v.r);
    });
    return res;
}

// El lector de imágenes confunde letras: "Sl", "S1", "N0" → SI / NO
function itemOcr(t) {
    var u = String(t).toUpperCase().replace(/[|!]/g, 'I');
    if (/^S[I1L]$/.test(u)) return 'SI';
    if (/^N[O0Q]$/.test(u)) return 'NO';
    if (/^N\/?A$/.test(u)) return 'NA';
    return '';
}
// Modo imagen: "Z1CC0051 53 3.500 CLUS 1 4 28/10/2026 31/10/2026 DZ SI SI NO SI ... PENDIENTE POR SUBSANAR"
function leerRenglonOcr(linea, items, itemsOp) {
    var t = linea.replace(/[«»"“”]/g, ' ').split(/\s+/).filter(Boolean), i = t.findIndex(function (x) { return MR.test(x.replace(/[^A-Z0-9]/gi, '')); });
    if (i === -1) return null;
    var p = { MICRORRUTA: t[i].replace(/[^A-Z0-9]/gi, '') }, k = i + 1;
    // Hasta la primera fecha: lote, área, clasificación, zona y cuadrilla (el área puede faltar)
    var nums = [];
    while (k < t.length && !esFecha(t[k]) && !itemOcr(t[k])) {
        if (/^(\d[\d.,]*|NA)$/i.test(t[k])) nums.push(t[k]);
        else if (/^[A-Z]{3,5}$/i.test(t[k])) p.CLASIFICACION = t[k].toUpperCase();
        k++;
    }
    if (nums.length >= 4) { p.LOTE = nums[0]; p['ÁREA M2'] = nums[1]; p.ZONA = nums[2]; p.CUADRILLA = nums[3]; }
    else if (nums.length === 3) { p.LOTE = nums[0]; p.ZONA = nums[1]; p.CUADRILLA = nums[2]; }
    else if (nums.length) p.LOTE = nums[0];
    var fechas = [];
    while (k < t.length && esFecha(t[k])) fechas.push(t[k++]);
    if (/^[A-Z]{2,5}$/i.test(t[k] || '') && !itemOcr(t[k])) p.INTERVENTOR = t[k++];
    var vals = [];
    while (k < t.length && itemOcr(t[k])) vals.push(itemOcr(t[k++]));
    var op = fechas.length < 2 && vals.length === itemsOp.length ? true : fechas.length >= 2 ? false : vals.length !== items.length;
    var its = op ? itemsOp : items;
    if (op) p['FECHA DE LA VISITA'] = fechas[0] || '';
    else { p['FECHA DE EJECUCIÓN'] = fechas[0] || ''; p['FECHA DE LA VISITA'] = fechas[1] || fechas[0] || ''; }
    its.forEach(function (it, j) { p[it] = vals[j] || ''; });
    // Al final pueden venir la fecha de corrección, la cantidad y los días: se quitan de la observación
    // (salvo la fecha de "SUBSANADA EL dd/mm/aaaa", que es parte del texto)
    var obs = t.slice(k);
    while (obs.length && (esFecha(obs[obs.length - 1]) || /^(\d+|NA)$/i.test(obs[obs.length - 1])) && !/^EL$/i.test(obs[obs.length - 2] || '')) {
        var x = obs.pop();
        if (esFecha(x)) p.F_CORR = x;
    }
    p.OBS = obs.join(' ');
    var aviso = vals.length !== its.length ? 'se leyeron ' + vals.length + ' ítems y el formato de ' + (op ? 'operación' : 'lote ejecutado') + ' lleva ' + its.length : '';
    return { valores: p, op: op, its: its, aviso: aviso };
}
function leerOcr(texto, items, itemsOp) {
    var res = { visitas: [], avisos: [], encabezado: false, imagen: true };
    String(texto || '').split(/\r?\n/).forEach(function (l) {
        var x = leerRenglonOcr(l, items, itemsOp);
        if (!x) return;
        var v = aVisita(x.valores, x.op, x.its, res.visitas.length + 1);
        if (x.aviso) v.avisos.unshift(x.aviso);
        v.avisos.forEach(function (a) { res.avisos.push(v.r.MICRORRUTA + ': ' + a + '.'); });
        res.visitas.push(v.r);
    });
    return res;
}

// texto → { visitas, avisos: [texto], encabezado, imagen }. items / itemsOp: catálogos de lote ejecutado y operación
export function leerTabla(texto, items, itemsOp) {
    texto = String(texto || '');
    if (texto.indexOf('\t') !== -1) return leerTsv(partirTsv(texto), items || [], itemsOp || []);
    return leerOcr(texto, items || [], itemsOp || []);
}

// Días de visita de lo leído, del más reciente al más viejo (aaaa-mm-dd)
export function diasDe(visitas) {
    return visitas.map(function (r) { return fechaISO(r['FECHA DE LA VISITA']); }).filter(Boolean)
        .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort().reverse();
}
