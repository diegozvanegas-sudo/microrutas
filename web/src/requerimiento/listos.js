// ⏰ Listos para requerimiento: las visitas de posoperación que se mandaron a corregir y, pasados 8 días hábiles
// (lunes a sábado, sin contar festivos) desde la visita, siguen sin subsanar; y los lotes que se encontraron sin realizar y nadie volvió a
// revisar. Aquí va solo la lógica (sin pantalla): qué visitas ya cumplieron el plazo, cómo se agrupan por cuadrilla y
// cómo queda el requerimiento ya lleno.
//
//   candidatas(registros, hoy, itemsNo)  -> [{ id, tipo, mr, lote, cuad, zona, fecha, dias, listo, faltan, novedades }]
//   porCuadrilla(lista)                  -> [{ cuad, visitas, listas }]
//   yaRequeridas(historial)              -> { idVisita: { id, radicado, estado } }
//   armar(visitas, base, hoy)            -> el requerimiento (mismo objeto del formulario) con sus microrrutas y evidencias
//   textoPreaviso(cuad, visitas)         -> el mensaje del pre aviso al contratista (a los 5 días hábiles)

// Días hábiles desde la visita para que el requerimiento quede listo (lo fijó la interventoría); AVISO: a los 5 días
// hábiles sin corregir se le manda al contratista el pre aviso (lo fijó la interventoría el 17/11/2026)
import { esFestivo } from '../horas/distribucion.js';

export var PLAZO_REQ = 8, AVISO = 5;
var NO_REALIZADO = 'LOTE NO REALIZADO';

function plano(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function utc(s) { return new Date(s + 'T00:00:00Z'); }
function mas(f, n) { var d = utc(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// «03/11/2026» o «2026-11-03» → 2026-11-03
export function aIso(s) {
    var m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = String(s || '').match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : '';
}
export function aTexto(f) { var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
// Día hábil: de lunes a sábado y que no sea festivo de Colombia (la misma lista de Horas extras: Emiliani y Pascua)
export function esHabil(f) { return !esFestivo(f); }
// Días hábiles transcurridos después de `desde` y hasta `hasta`
export function habiles(desde, hasta) {
    var n = 0;
    for (var f = mas(desde, 1); f <= hasta; f = mas(f, 1)) if (esHabil(f)) n++;
    return n;
}
// El día en que se cumplen los `n` días hábiles
export function fechaListo(desde, n) {
    var f = desde, van = 0;
    while (van < (n == null ? PLAZO_REQ : n)) { f = mas(f, 1); if (esHabil(f)) van++; }
    return f;
}
function esOp(r) { return r.TIPO === 'OPERACIÓN' || /^OPE-/.test(r.ID || ''); }
function cuadDe(r) { return String(r.CUADRILLA || '').trim().replace(/^C\s*/i, ''); }
function loteDe(r) { var l = String(r.LOTE || '').trim(); return /^N\/?A$/i.test(l) ? '' : l; }
function claveLote(r) { return String(r.MICRORRUTA || '').trim().toUpperCase() || 'L' + loteDe(r); }
function quitarEstado(s) {
    return String(s || '').replace(/^(PENDIENTE POR SUBSANAR|SIN NOVEDAD)\s*(-\s*)?/i, '').trim();
}

// registros: las visitas como las entrega la app (columnas en español). itemsNo(r) → los ítems que quedaron en NO.
// Entran solo las visitas al lote ejecutado (posoperación):
//   'novedad'      sigue PENDIENTE (tiene ítems en NO sin subsanar)
//   'norealizado'  se anotó «LOTE NO REALIZADO» y no hay una visita posterior de ese lote
export function candidatas(registros, hoy, itemsNo) {
    var ultima = {};
    (registros || []).forEach(function (r) {
        if (esOp(r)) return;
        var f = aIso(r['FECHA DE LA VISITA']), k = claveLote(r);
        if (f && (!ultima[k] || f > ultima[k])) ultima[k] = f;
    });
    var out = [];
    (registros || []).forEach(function (r) {
        if (esOp(r)) return;
        var fecha = aIso(r['FECHA DE LA VISITA']);
        if (!fecha || fecha > hoy) return;
        var obs = String(r['OBSERVACIONES NOVEDADES'] || '').trim(), noReal = plano(obs).indexOf(NO_REALIZADO) !== -1;
        var tipo = r.ESTADO === 'PENDIENTE' && !noReal ? 'novedad' : noReal && r.ESTADO !== 'SUBSANADO' && ultima[claveLote(r)] === fecha ? 'norealizado' : '';
        if (!tipo) return;
        var nota = quitarEstado(obs), novedades = tipo === 'norealizado' ? ['Lote no realizado'] : (itemsNo ? itemsNo(r) : []).concat(nota && plano(nota) !== 'SIN NOVEDAD' ? [nota] : []);
        var dias = habiles(fecha, hoy), mr = String(r.MICRORRUTA || '').trim().toUpperCase(), z = mr.match(/^Z(\d+)/);
        out.push({ id: String(r.ID || ''), tipo: tipo, mr: mr, lote: loteDe(r), cuad: cuadDe(r), zona: z ? z[1] : String(r.ZONA || '').replace(/\D/g, ''),
            fecha: fecha, dias: dias, listo: dias >= PLAZO_REQ, preaviso: dias >= AVISO && dias < PLAZO_REQ, faltan: Math.max(0, PLAZO_REQ - dias), cumple: fechaListo(fecha), novedades: novedades });
    });
    // Las que más días llevan, primero
    return out.sort(function (a, b) { return b.dias - a.dias || a.fecha.localeCompare(b.fecha) || a.mr.localeCompare(b.mr); });
}
function ordenCuad(a, b) { var x = Number(a), y = Number(b); return (isFinite(x) ? x : 999) - (isFinite(y) ? y : 999) || String(a).localeCompare(String(b)); }
export function porCuadrilla(lista) {
    var por = {};
    lista.forEach(function (v) { (por[v.cuad || '?'] = por[v.cuad || '?'] || []).push(v); });
    return Object.keys(por).sort(ordenCuad).map(function (c) { return { cuad: c, visitas: por[c], listas: por[c].filter(function (v) { return v.listo; }).length }; });
}
// Visitas que ya están en un requerimiento guardado (para no hacerlo dos veces)
export function yaRequeridas(historial) {
    var out = {};
    (historial || []).forEach(function (h) {
        (h.visitas || []).forEach(function (id) { if (!out[id]) out[id] = { id: h.id, radicado: h.radicado || '', estado: h.estado || 'Borrador' }; });
    });
    return out;
}

function lista(v) { return v.length < 2 ? v.join('') : v.slice(0, -1).join(', ') + ' y ' + v[v.length - 1]; }
export function rotuloVisita(v) { return v.mr + (v.lote ? ' (' + v.lote + ')' : ''); }
// Títulos de las evidencias del requerimiento automático. En la de ENVIO van los pantallazos guardados de cada visita
export var EVID_REPORTE = 'Reportes de ejecución de las microrrutas', EVID_ENVIO = 'Envío de las novedades al contratista para su corrección', EVID_INSPECCION = 'Evidencia de la inspección';
// base: el requerimiento vacío del formulario (vacio() en main.js)
export function armar(visitas, base, hoy) {
    var cuads = [], zonas = [], fechas = [];
    visitas.forEach(function (v) {
        if (v.cuad && cuads.indexOf(v.cuad) === -1) cuads.push(v.cuad);
        if (v.zona && zonas.indexOf(v.zona) === -1) zonas.push(v.zona);
        fechas.push(v.fecha);
    });
    cuads.sort(ordenCuad); zonas.sort(); fechas.sort();
    var soloNoReal = visitas.every(function (v) { return v.tipo === 'norealizado'; }), hayNoReal = visitas.some(function (v) { return v.tipo === 'norealizado'; });
    var que = soloNoReal ? 'Microrrutas no ejecutadas' : 'Novedades en posoperación sin corrección' + (hayNoReal ? ' y microrrutas no ejecutadas' : '');
    var d = Object.assign({}, base, {
        id: null, fecha: hoy, zonas: zonas, eventoDesde: fechas[0] || '', eventoHasta: fechas[fechas.length - 1] || '',
        ruta: visitas.map(rotuloVisita).join(', '),
        asunto: que + (cuads.length ? (cuads.length === 1 ? ' · cuadrilla ' : ' · cuadrillas ') + lista(cuads) : ''),
        novedades: visitas.map(function (v) { return { micro: v.mr || v.lote, fecha: v.fecha, tipos: v.novedades.slice() }; }),
        evidencias: [
            { titulo: EVID_REPORTE, texto: '' },
            { titulo: EVID_ENVIO, texto: visitas.map(function (v) {
                // Antes del plazo (📨 Crear requerimiento de una visita, p. ej. un daño no subsanable) no se dice «sin corrección»
                return rotuloVisita(v) + ': ' + (v.tipo === 'norealizado' ? 'reportado como no realizado el ' : 'novedades enviadas el ') + aTexto(v.fecha) +
                    (v.listo ? ', ' + v.dias + ' días hábiles sin corrección.' : ' (' + v.dias + (v.dias === 1 ? ' día hábil' : ' días hábiles') + ' desde la visita).');
            }).join('\n') },
            { titulo: EVID_INSPECCION, texto: '' }
        ],
        visitas: visitas.map(function (v) { return v.id; }).filter(Boolean)
    });
    return d;
}
// Pre aviso al contratista (a los AVISO días hábiles): qué sigue sin corregir y el día en que pasa a requerimiento.
// visitas: las de una cuadrilla, con la novedad de cada una para que la puedan ubicar
export function textoPreaviso(cuad, visitas) {
    var lineas = visitas.map(function (v) {
        return '• ' + (v.lote ? 'Lote ' + v.lote + ' (' + v.mr + ')' : v.mr) + ' · visita del ' + aTexto(v.fecha) + ': ' +
            (v.tipo === 'norealizado' ? 'lote no realizado' : v.novedades.length ? v.novedades.join(', ') : 'novedades sin corregir') +
            ' · pasa a requerimiento el ' + aTexto(v.cumple);
    });
    return '⚠️ PRE AVISO · Cuadrilla ' + (cuad || '?') + '\n' +
        'Las siguientes novedades llevan ' + AVISO + ' días hábiles o más sin corregir. Si no se subsanan y se envía el registro fotográfico antes de cumplir ' +
        PLAZO_REQ + ' días hábiles, pasan a requerimiento:\n' + lineas.join('\n');
}
// La plantilla que corresponde, si existe una para esto (por su nombre o su asunto)
export function plantillaPara(visitas, plantillas) {
    var noReal = visitas.every(function (v) { return v.tipo === 'norealizado'; });
    var re = noReal ? /NO (SE )?(EJECUT|REALIZ)|SIN EJECUT/ : /POSOPERACION|SIN CORRECCION|SIN SUBSANA/;
    var p = (plantillas || []).filter(function (x) { return re.test(plano(x.nombre + ' ' + x.asunto)); })[0];
    return p ? p.id : '';
}
