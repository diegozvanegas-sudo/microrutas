// Excel de seguimiento de PQR con el formato de la interventoría (una hoja, encabezado verde, letra 11):
// INSPECTOR · ID PQRS · FECHA PQRS · ZONA · CUADRILLA · FECHA RECEPCIÓN · FECHA ATENCIÓN · TIPO DE PQRS · DESCRIPCIÓN PQRS ·
// ¿PROCEDE? SI - NO - DETALLE · RESUELTA SI - NO - PARCIAL.
// Todo sale de lo que ya tiene el PQR: el inspector es quien lo registró; la zona, la de la dirección; el tipo, la descripción
// y el "procede" se arman con lo que se marcó en la visita. La hoja se ve y se descarga con lo mismo de Subsanaciones
// (src/subsanaciones/excel.js), así queda igual en la vista previa y en el archivo.
import { descargarHojas } from '../subsanaciones/excel.js';

var VERDE = 'FF00B050';

// aaaa-mm-dd -> dd/mm/aaaa (como se lleva el Excel); otra cosa, tal cual
function fecha(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s || ''); }
// Fecha local (aaaa-mm-dd) de una marca de tiempo de la base ('' si no hay)
function fechaLocal(t) {
    if (!t) return '';
    var d = new Date(t);
    return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// Resultados de la visita que son una novedad del servicio (queja) y no una solicitud de corte
var NOVEDAD = { residuos: 1, sinresiduos: 1, incompleto: 1, calidad: 1, metodo: 1, subsanado: 1, parcial: 1, danos: 1, terceros: 1, seguimientopqr: 1, escombros: 1, residuospoda: 1 };
// La queja misma dice que es una queja (y no una solicitud de corte)
var DICE_QUEJA = /\bqueja\b|inconform|reclam|mal (hecho|cortad|realizad)|a medias|dejaron|no (lo |la |los |las )?(cortaron|hicieron|recogieron|terminaron|han (cortado|podado|recogido|venido|vuelto))|hace (meses|mucho|rato|tiempo)|residuo|basura|da[ñn]o|golpe|rompi/i;

// Mercurio es el otro sistema de radicación: sus IDs son largos (20260520003826)
function esMercurio(p) { return /^\d{12,}$/.test(String(p.radicado || '').replace(/\D/g, '')); }
function esQueja(p) { var r = (p.visita || {}).resultado; return !!NOVEDAD[r] || DICE_QUEJA.test(String(p.queja || '')); }

export function tipoPqr(p) {
    if (esMercurio(p)) return 'Mercurio';
    if ((p.visita || {}).resultado === 'danos' || p.estado === 'trasladado') return 'Daño';
    return esQueja(p) ? 'Queja' : 'Solicitud';
}

// Descripción corta, como se escribe en el seguimiento
var DESCRIPCION = {
    danos: 'Daño generado por la prestación del servicio',
    residuos: 'Novedad por recolección y disposición de residuos del corte de césped',
    sinresiduos: 'Novedad por recolección y disposición de residuos del corte de césped',
    escombros: 'Novedad por escombros o residuos no vegetales en el área',
    incompleto: 'Novedad por falencias en el servicio de corte de césped',
    calidad: 'Novedad por falencias en el servicio de corte de césped',
    metodo: 'Novedad por falencias en el servicio de corte de césped',
    subsanado: 'Novedad por falencias en el servicio de corte de césped',
    parcial: 'Novedad por falencias en el servicio de corte de césped',
    terceros: 'Novedad por cerramiento o intervención de terceros en el área',
    arbol: 'Solicitud de poda de árboles',
    residuospoda: 'Novedad por residuos de poda de árboles',
    jardin: 'Solicitud de jardinería u ornato',
    zonadura: 'Solicitud de retiro de maleza en zona dura',
};
export function descripcionPqr(p) {
    var r = (p.visita || {}).resultado;
    if (p.estado === 'trasladado') return DESCRIPCION.danos;
    if (DESCRIPCION[r]) return DESCRIPCION[r];
    return esQueja(p) ? 'Queja de corte de césped' : 'Solicitud de corte de césped';
}

// ¿Procede? Sí o no, y por qué, según lo que se encontró en la visita
var CONTRATISTA = 'Si, se remite la novedad al contratista el cual ';
var NO_BASE = 'No, el sector no hace parte de la base de datos de corte de césped';
var NO_SE_EVIDENCIA = 'No, se realiza verificación en campo, no se evidencia la novedad reportada';
var NO_ALCANCE = 'No, las actividades solicitadas no se encuentran dentro del alcance del contrato de corte de césped';
var SI_BASE = 'Si, el área hace parte de la base de datos de corte de césped';
var PROCEDE = {
    ejecutado: NO_SE_EVIDENCIA + ': el corte ya se había ejecutado',
    sinresiduos: NO_SE_EVIDENCIA + ': no había residuos del corte',
    bajo: NO_SE_EVIDENCIA + ': el césped tiene menos de 10 cm',
    terceros: NO_SE_EVIDENCIA + ': el área presenta cerramiento o intervención de terceros',
    noubicada: 'No, no fue posible ubicar el sitio indicado en la solicitud',
    privado: NO_BASE + ' (área privada)',
    obraprivada: NO_BASE + ' (obra privada o predio cerrado)',
    catastro: NO_BASE + ' (área pública fuera del catastro)',
    ambiental: NO_BASE + ' (retiro de quebrada o zona de preservación ambiental)',
    sincesped: NO_BASE + ' (sin cobertura vegetal)',
    jardin: NO_ALCANCE + ' (jardinería u ornato)',
    zonadura: NO_ALCANCE + ' (maleza en zona dura)',
    arbol: 'No, la poda de árboles no hace parte del contrato de corte de césped; se traslada al contratista de poda',
    escombros: 'No, son residuos no vegetales; se traslada la novedad al componente de recolección',
    residuospoda: 'No, los residuos son de la poda de árboles y no del corte de césped; se remite al contratista de poda para su recolección',
    pendiente: SI_BASE + ' y se interviene según la programación',
    lluvia: SI_BASE + '; la programación se retrasó por las lluvias',
    restriccion: SI_BASE + '; la intervención queda sujeta a que se levante la restricción de acceso',
    ordenpublico: SI_BASE + '; la intervención queda sujeta a las condiciones de orden público',
    fauna: SI_BASE + '; la intervención se suspendió por fauna (abejas, avispas u otra) hasta su manejo',
    caracol: SI_BASE + '; la intervención se suspendió por caracol africano y se reporta a la autoridad ambiental',
    talud: SI_BASE + '; la intervención queda sujeta a la estabilidad del talud',
    desmonte: SI_BASE + ' y se programó el desmonte del área',
    canabrava: SI_BASE + '; la caña brava requiere permiso de la autoridad ambiental',
    subsanado: CONTRATISTA + 'realiza la subsanación',
    parcial: CONTRATISTA + 'debe realizar la subsanación',
    residuos: CONTRATISTA + 'realiza la recolección de los residuos',
    incompleto: CONTRATISTA + 'completa la labor',
    calidad: CONTRATISTA + 'corrige las deficiencias del corte',
    metodo: CONTRATISTA + 'debe corregir la forma de ejecutar el corte',
    danos: CONTRATISTA + 'realiza la gestión con el usuario',
    seguimientopqr: 'Si, se remite la novedad al contratista; en seguimiento',
};
// Con "Se corrigió / se pagó el": ya se hizo (y la fecha); sin corregir y sin responder aún: queda por hacer
var CORRIGE = /^(subsanado|residuos|incompleto|calidad|danos)$/;
export function procedePqr(p) {
    var v = p.visita || {}, r = v.resultado, t = PROCEDE[r] || '';
    if (p.estado === 'trasladado' && r !== 'danos') { r = 'danos'; t = PROCEDE.danos; }
    if (CORRIGE.test(r)) {
        if (v.fechaCorregido) t += ' el ' + fecha(v.fechaCorregido);
        else if (p.estado !== 'respondido') t = t.replace(' realiza ', ' debe realizar ').replace(' completa ', ' debe completar ').replace(' corrige ', ' debe corregir ');
    }
    if (r === 'seguimientopqr' && v.observacion) t += ': ' + v.observacion;
    return t;
}

// SI cuando ya se respondió; PARCIAL cuando se cerró parcialmente, está en seguimiento o lo tiene Precoodes; vacío si está abierto
export function resueltaPqr(p) {
    var r = (p.visita || {}).resultado;
    if (p.estado === 'trasladado') return 'PARCIAL';
    if (p.estado !== 'respondido') return '';
    return r === 'parcial' || r === 'seguimientopqr' ? 'PARCIAL' : 'SI';
}

// Cuándo se recibió (el día que se registró en la aplicación) y cuándo se atendió (el día que se respondió o se trasladó;
// los guardados antes de llevar esa fecha usan la última modificación)
export function fechaRecepcion(p) { return fechaLocal(p.creado) || p.fecha_pqr || ''; }
export function fechaAtencion(p) {
    var v = p.visita || {};
    if (v.fechaCierre) return v.fechaCierre;
    return p.estado === 'respondido' || p.estado === 'trasladado' ? fechaLocal(p.actualizado) : '';
}

var CAB = ['INSPECTOR', 'ID PQRS', 'FECHA PQRS', 'ZONA', 'CUADRILLA', 'FECHA RECEPCIÓN', 'FECHA ATENCIÓN', 'TIPO DE PQRS', 'DESCRIPCIÓN PQRS', '¿PROCEDE? SI - NO - DETALLE', 'RESUELTA SI - NO - PARCIAL'];
var ANCHOS = [26, 16, 12, 7, 10, 13, 13, 12, 48, 58, 12];

// La hoja con la lista recibida: { nombre, cab, anchos, fondoCab, filas: [{ v, fondo, ajustar }] } (lo que leen htmlHoja y
// descargarHojas). nombres: { usuario: nombre } de perfiles; zonas: { id del PQR: zona } para los que no la tienen guardada.
// Del más antiguo al más reciente por fecha de recepción, como se lleva el Excel. Sin colores ni ajuste de texto en las
// filas: así se pegan tal cual en el Excel que ya se lleva
export function hojaPqr(lista, nombres, zonas) {
    nombres = nombres || {}; zonas = zonas || {};
    var filas = lista.slice().sort(function (a, b) {
        return (fechaRecepcion(a) + (a.fecha_pqr || '')).localeCompare(fechaRecepcion(b) + (b.fecha_pqr || ''));
    }).map(function (p) {
        var v = p.visita || {};
        var zona = String(v.zona || zonas[p.id] || '').replace(/^zona\s*/i, '');
        var valores = [nombres[p.usuario] || '', p.radicado || '', fecha(p.fecha_pqr), zona, String(v.cuadrilla || ''), fecha(fechaRecepcion(p)),
            fecha(fechaAtencion(p)), tipoPqr(p), descripcionPqr(p), procedePqr(p), resueltaPqr(p)];
        return { v: valores, fondo: valores.map(function () { return null; }), ajustar: valores.map(function () { return false; }) };
    });
    return { nombre: 'PQR', cab: CAB, anchos: ANCHOS, fondoCab: CAB.map(function () { return VERDE; }), filas: filas };
}

// Descarga pqr_aaaa-mm-dd.xlsx con la hoja recibida
export function descargarPqr(hoja, dia) { return descargarHojas([hoja], 'pqr_' + dia + '.xlsx'); }
