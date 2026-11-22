// Formatos del «📲 Mensaje de la revisión» (✅ Revisión): el corto de siempre y los que la interventoría manda a los grupos.
// Sin nada de la página, para probarlo con npm test.
// extra: lo que la revisión no pregunta pero estos mensajes sí dicen: documentos y extintor ('si' | 'no'), placa y la
// observación del cierre (si va vacía se usa la frase de siempre).
import { textoRevision, novedadesDe, checklistDe, nombreRevision } from './comun.js';

export var FORMATOS = [
    ['corto', '💬 Corto (el de siempre)'],
    ['chulos', '✅ Verificación con chulos'],
    ['inspeccion', '📋 Reporte de inspección (LV)'],
    ['ryt', '🚛 Reporte de inspección RyT'],
    ['novedad', '⚠️ Novedad para el aliado'],
    ['linea', '➖ Una línea para el grupo']
];
export var OBSERVACION = 'Se observa buena prestación del servicio por parte del aliado';
var VERIF = { Operacion: 'operación', Posoperacion: 'posoperación', Despacho: 'despacho' };
var SERVICIO = { lv: 'Limpieza Vial', ryt: 'Recolección y Transporte', plan: 'Plan de choque' };

// ¿Cumple el grupo? 'si', 'no' o '' (sin marcar). Sirve para revisiones nuevas (preguntas del instrumento) y viejas
function estado(r, nuevas, prefijos) {
    var it = r.items || {}, v = [];
    nuevas.forEach(function (k) { if (it[k]) v.push(it[k]); });
    (r.operarios || []).forEach(function (o) {
        Object.keys(o.items || {}).forEach(function (k) { if (prefijos.some(function (p) { return k.indexOf(p) === 0; })) v.push(o.items[k]); });
    });
    if (v.indexOf('no') !== -1) return 'no';
    return v.indexOf('si') !== -1 ? 'si' : '';
}
export function herramientas(r) { return estado(r, ['p_herramientas'], ['h_']); }
export function epp(r) { return estado(r, ['p_uniforme', 'p_epp_estado', 'p_epp_uso'], ['epp_']); }
// Lo que se vio mal, en palabras (sin las líneas de evidencia)
export function novedades(r) { return novedadesDe(r).filter(function (n) { return !/^evidencia: |, evidencia: /i.test(n); }); }
function chulo(v) { return v === 'no' ? '❌' : '✅'; }
function okNo(v, conChulo) { return (v === 'no' ? 'NO' : 'OK') + (conChulo ? ' ' + chulo(v) : ''); }
function quienRuta(r) { return r.tipo === 'plan' ? 'al sector ' + r.ruta : 'a la ruta ' + nombreRevision(r); }

export function mensaje(r, formato, extra, hora) {
    extra = extra || {};
    var it = r.items || {}, verif = VERIF[it.verificacion] || 'operación', nov = novedades(r), obs = String(extra.observacion || '').trim() || OBSERVACION;
    var docs = extra.documentos === 'no' ? 'no' : 'si', ext = extra.extintor === 'no' ? 'no' : 'si';
    var lista = function (pre) { return nov.map(function (n) { return (pre || '- ') + n; }).join('\n'); };
    if (formato === 'chulos') {
        return 'La Interventoría del Área de Servicios de Aseo hace verificación en ' + verif + ' ' + quienRuta(r) + '.\n\n' +
            'Herramientas: ' + chulo(herramientas(r)) + '\nDocumentos: ' + chulo(docs) + '\nEPP: ' + chulo(epp(r)) + '\n\n' +
            (nov.length ? 'Novedades:\n' + lista() + '\n\n' : '') + obs;
    }
    if (formato === 'inspeccion') {
        return 'REPORTE DE INSPECCIÓN\n\nLa interventoría del área de servicio de aseo hace verificación en ' + verif + ' ' + quienRuta(r) + '.\n\n' +
            'Herramientas: ' + okNo(herramientas(r), true) + '\nDocumentos: ' + okNo(docs, true) + '\nEPP: ' + okNo(epp(r), true) + '\n\n' +
            'Novedades de barrido: ' + (nov.length ? 'SÍ ❌\n' + lista() : 'NO ✅') + '\n\n' + obs;
    }
    if (formato === 'ryt') {
        return 'REPORTE DE INSPECCIÓN RyT\n\nLa interventoría del área de servicio de aseo hace verificación de RyT' + (it.verificacion === 'Despacho' ? ' en despacho' : '') + '.\n\n' +
            (r.control ? 'Control: ' + r.control + '\n' : '') + (extra.placa ? 'Placa: ' + String(extra.placa).toUpperCase() + '\n' : '') + (r.ruta && r.tipo === 'ryt' ? 'Ruta: ' + r.ruta + '\n' : '') + '\n' +
            'Herramientas: ' + okNo(herramientas(r)) + '\nDocumentos: ' + okNo(docs) + '\nEPP: ' + okNo(epp(r)) + '\nExtintor: ' + okNo(ext) + '\n\n' +
            'Novedades: ' + (nov.length ? '\n' + lista() : 'N/A') + (extra.observacion ? '\n\n' + obs : '');
    }
    if (formato === 'novedad') {
        var f = String(r.fecha || '').split('-');
        return '⚠️ NOVEDAD · ' + SERVICIO[r.tipo] + ' · ' + nombreRevision(r) + (r.zona ? ' · Zona ' + r.zona : '') + '\n' +
            (f.length === 3 ? f[2] + '/' + f[1] + '/' + f[0] : r.fecha) + (r.turno ? ' · ' + r.turno : '') + (it.contratista ? ' · Aliado: ' + it.contratista : '') + '\n\n' +
            (nov.length ? 'Se evidencia:\n' + lista() + '\n\nSe solicita al aliado la corrección inmediata y el envío de la evidencia.' : 'Sin novedades en la verificación. ' + obs + '.') +
            (r.enlace ? '\n\nRegistro fotográfico: ' + r.enlace : '');
    }
    if (formato === 'linea') {
        return (nov.length ? '⚠️ ' : '✅ ') + nombreRevision(r) + (r.zona ? ' · Z' + r.zona : '') + ' · ' + (r.tipo === 'ryt' ? 'RyT' : r.tipo === 'plan' ? 'Plan de choque' : 'LV') + ' · ' + (nov.length ? nov.join('; ') : 'sin novedad');
    }
    return textoRevision(r, hora);
}
// Qué datos extra pide cada formato (para mostrar solo esos en la ventana)
export function pide(formato, r) {
    return { documentos: ['chulos', 'inspeccion', 'ryt'].indexOf(formato) !== -1, extintor: formato === 'ryt', placa: formato === 'ryt',
        observacion: formato !== 'linea' && formato !== 'corto', instrumento: !!checklistDe(r).grupos };
}
// Formato sugerido según el servicio (la primera vez): RyT → el de RyT; LV → reporte de inspección
export function sugerido(r) { return r.tipo === 'ryt' ? 'ryt' : r.tipo === 'lv' ? 'inspeccion' : 'corto'; }
