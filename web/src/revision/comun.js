// Revisión de LV, RyT y plan de choque, y reporte de Despacho: checklists y textos para WhatsApp.
// Sin nada de la página, para probarlo con npm test.

export var TIPOS = { lv: 'Limpieza vial', ryt: 'Recolección y transporte', plan: 'Plan de choque' };
export var TURNOS = ['Mañana', 'Diurno', 'Intermedio', 'Tarde', 'Noche'];

// [id, lo que se revisa, cómo se dice en la novedad si no cumple]
var EPP = [
    ['epp_uniforme', 'Uniforme completo', 'Uniforme incompleto'],
    ['epp_botas', 'Botas', 'Sin botas'],
    ['epp_guantes', 'Guantes', 'Sin guantes'],
    ['epp_reflectivo', 'Prendas reflectivas', 'Sin prendas reflectivas']
];
var HERRAMIENTAS_BARRIDO = [
    ['h_escoba', 'Escoba', 'Sin escoba'],
    ['h_recogedor', 'Recogedor', 'Sin recogedor'],
    ['h_carro', 'Carro de trabajo', 'Sin carro de trabajo'],
    ['h_bolsas', 'Bolsas', 'Sin bolsas'],
    ['h_rastrillo', 'Rastrillo sin bolsa', 'Rastrillo con bolsa'],
    ['h_estado', 'Herramientas en buen estado', 'Herramientas en mal estado']
];
var HERRAMIENTA_ESTADO = [['h_estado', 'Herramientas en buen estado', 'Herramientas en mal estado']];

export var CHECKLIST = {
    lv: {
        ruta: [
            ['r_ruta', 'Va por la ruta asignada', 'Fuera de la ruta asignada'],
            ['r_mapa', 'Tiene el mapa de la ruta', 'Sin mapa de la ruta'],
            ['r_sentido', 'Barre en sentido contrario al flujo vehicular', 'No barre en sentido contrario al flujo vehicular'],
            ['r_papeleo', 'Sin papeleo', 'Con papeleo'],
            ['r_cordoneo', 'Cordoneo al día', 'Falta cordoneo']
        ],
        operario: [['EPP', EPP], ['Herramientas', HERRAMIENTAS_BARRIDO]]
    },
    ryt: {
        ruta: [
            ['r_ruta', 'Va por la ruta asignada', 'Fuera de la ruta asignada'],
            ['r_vehiculo', 'Vehículo en buen estado', 'Vehículo con novedad'],
            ['r_completa', 'Recolección completa, sin residuos en la vía', 'Quedan residuos en la vía'],
            ['r_derrames', 'Sin derrames', 'Con derrames']
        ],
        operario: [['EPP', EPP], ['Herramientas', HERRAMIENTA_ESTADO]]
    },
    plan: {
        ruta: [
            ['r_personal', 'Personal programado presente', 'Falta personal programado'],
            ['r_vehiculo', 'Vehículo o apoyo disponible', 'Sin vehículo o apoyo'],
            ['r_avance', 'Avance según lo planeado', 'Avance atrasado'],
            ['r_recuperado', 'Sector recuperado', 'Sector sin recuperar']
        ],
        operario: [['EPP', EPP], ['Herramientas', HERRAMIENTAS_BARRIDO]]
    }
};

function itemsOperario(tipo) { return CHECKLIST[tipo].operario.reduce(function (t, g) { return t.concat(g[1]); }, []); }

export function zonaDeCodigo(codigo) { var m = /^Z(\d+)/i.exec(String(codigo || '').trim()); return m ? m[1] : ''; }
// Solo enlaces web: lo demás (javascript:, etc.) no se abre
export function enlaceSeguro(u) { u = String(u || '').trim(); return /^https?:\/\/\S+$/i.test(u) ? u : ''; }
export function operarioVacio() { return { nombre: '', items: {}, novedad: '', enlace: '' }; }
// Los turnos se cruzan (Mañana 5-14, Diurno 7-17, Intermedio 10-17): sugiere el último que empezó. Quien está en otro lo
// elige una vez y queda ese durante el día (main.js). Tarde se elige a mano
export function turnoPorHora(hora) { return hora < 5 || hora >= 17 ? 'Noche' : hora < 7 ? 'Mañana' : hora < 10 ? 'Diurno' : 'Intermedio'; }

// Lo que no cumple de una revisión, ya en palabras: ["Juan: Rastrillo con bolsa", "Con papeleo", …]
export function novedadesDe(r) {
    var out = CHECKLIST[r.tipo].ruta.filter(function (i) { return (r.items || {})[i[0]] === 'no'; }).map(function (i) { return i[2]; });
    if (String(r.novedad || '').trim()) out.push(r.novedad.trim());
    if (enlaceSeguro(r.enlace)) out.push('Evidencia: ' + enlaceSeguro(r.enlace));
    (r.operarios || []).forEach(function (o, k) {
        var quien = String(o.nombre || '').trim() || 'Operario ' + (k + 1);
        var mal = itemsOperario(r.tipo).filter(function (i) { return (o.items || {})[i[0]] === 'no'; }).map(function (i) { return i[2]; });
        if (String(o.novedad || '').trim()) mal.push(o.novedad.trim());
        if (mal.length) out.push(quien + ': ' + mal.join(', '));
        if (enlaceSeguro(o.enlace)) out.push(quien + ', evidencia: ' + enlaceSeguro(o.enlace));
    });
    return out;
}
// Cuántos puntos faltan por marcar: la revisión se puede guardar, pero se avisa
export function sinMarcar(r) {
    var n = CHECKLIST[r.tipo].ruta.filter(function (i) { return !(r.items || {})[i[0]]; }).length;
    (r.operarios || []).forEach(function (o) { n += itemsOperario(r.tipo).filter(function (i) { return !(o.items || {})[i[0]]; }).length; });
    return n;
}
// La evidencia sola no es novedad
export function tieneNovedad(r) { return novedadesDe(r).some(function (n) { return !/^evidencia: |, evidencia: /i.test(n); }); }
function sinTildes(t) { return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
// Filtros de la lista. sinEstado: con todos menos el de estado (las tarjetas cuentan así)
export function filtrarRevisiones(lista, f, sinEstado) {
    var q = sinTildes(f.texto).trim();
    return lista.filter(function (r) {
        if (f.tipo && r.tipo !== f.tipo) return false;
        if (f.zona && String(r.zona) !== f.zona) return false;
        if (f.turno && r.turno !== f.turno) return false;
        if (f.dia && r.fecha !== f.dia) return false;
        if (f.usuario && r.usuario !== f.usuario) return false;
        if (!sinEstado && f.estado === 'novedad' && !tieneNovedad(r)) return false;
        if (!sinEstado && f.estado === 'ok' && tieneNovedad(r)) return false;
        if (!q) return true;
        return sinTildes([r.ruta, r.control, r.zona && 'zona ' + r.zona, TIPOS[r.tipo], r.turno, r.novedad, (r.operarios || []).map(function (o) { return o.nombre + ' ' + o.novedad; }).join(' ')].join(' ')).indexOf(q) !== -1;
    });
}
// Más reciente primero
export function ordenarRevisiones(lista) {
    return lista.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado || b.actualizado || '').localeCompare(String(a.creado || a.actualizado || '')); });
}
// Puntos del checklist con su respuesta, para el detalle: [[título, [[punto, si|no|na|''], …]], …]
export function detalleOperario(tipo, o) {
    return CHECKLIST[tipo].operario.map(function (g) { return [g[0], g[1].map(function (i) { return [i[1], (o.items || {})[i[0]] || '']; })]; });
}
export function detalleRuta(r) { return CHECKLIST[r.tipo].ruta.map(function (i) { return [i[1], (r.items || {})[i[0]] || '']; }); }
export function nombreRevision(r) { return r.ruta + (r.control ? ' (Control ' + r.control + ')' : ''); }

// ok si lo marcado cumple; "no" si algo no cumple; vacío si no se marcó nada
function resumenGrupo(valores) {
    if (valores.indexOf('no') !== -1) return 'no';
    return valores.indexOf('si') !== -1 ? 'ok' : '';
}
function saludo(hora) { return hora < 12 ? 'Buen día' : hora < 18 ? 'Buena tarde' : 'Buena noche'; }
var SERVICIO = { lv: 'ruta de Limpieza Vial', ryt: 'ruta de Recolección y Transporte', plan: 'Plan de choque' };
// El mensaje de una sola revisión, como se manda al grupo al terminar de verificar
export function textoRevision(r, hora) {
    var lineas = [];
    CHECKLIST[r.tipo].operario.forEach(function (g) {
        var v = [];
        (r.operarios || []).forEach(function (o) { g[1].forEach(function (i) { var x = (o.items || {})[i[0]]; if (x) v.push(x); }); });
        var res = resumenGrupo(v);
        if (res) lineas.push(g[0] + ': ' + res);
    });
    if (r.tipo === 'lv' && (r.items || {}).r_mapa && r.items.r_mapa !== 'na') lineas.push('Mapa: ' + (r.items.r_mapa === 'si' ? 'ok' : 'no'));
    var nov = novedadesDe(r).filter(function (n) { return n !== 'Sin mapa de la ruta'; });
    return saludo(hora) + '\n\nSe realiza verificación de ' + SERVICIO[r.tipo] + (r.zona ? ' Zona ' + r.zona : '') + '\n\n' +
        (r.tipo === 'plan' ? 'Sector: ' : 'Ruta: ') + nombreRevision(r) + '\n\n' +
        (lineas.length ? lineas.join('\n') + '\n\n' : '') +
        (nov.length ? nov.join('\n') : 'Se observa buena prestación del servicio, sector controlado');
}

var ENCABEZADOS = {
    lv: '✅ Se realiza verificación de las siguientes rutas de limpieza vial en operación:',
    ryt: '✅ Se realiza verificación de las siguientes rutas de recolección y transporte en operación:',
    plan: '✅ Se realiza verificación de los siguientes planes de choque:'
};
// Mismo formato de los reportes del grupo: por zona y, dentro de cada una, por servicio; al final las novedades
export function textoReporte(revisiones, op) {
    op = op || {};
    if (!revisiones.length) return '';
    var titulo = '*REPORTE ' + (op.final ? 'FINAL' : 'PARCIAL') + ' DE ACTIVIDADES' + (op.turno ? ' - TURNO ' + op.turno.toUpperCase() : '') + '*';
    var zonas = {};
    revisiones.forEach(function (r) { var z = String(r.zona || '').trim(); (zonas[z] = zonas[z] || []).push(r); });
    var orden = Object.keys(zonas).sort(function (a, b) { return (a === '') - (b === '') || Number(a) - Number(b) || a.localeCompare(b); });
    var partes = [titulo];
    orden.forEach(function (z) {
        var sec = [z ? '*ZONA ' + z + '*' : '*SIN ZONA*'];
        Object.keys(ENCABEZADOS).forEach(function (t) {
            var nombres = zonas[z].filter(function (r) { return r.tipo === t; }).map(nombreRevision).filter(function (n, i, a) { return a.indexOf(n) === i; });
            if (nombres.length) sec.push(ENCABEZADOS[t] + '\n' + nombres.map(function (n) { return '• ' + n; }).join('\n'));
        });
        partes.push(sec.join('\n\n'));
    });
    var lineas = [];
    revisiones.forEach(function (r) { novedadesDe(r).forEach(function (n) { lineas.push('• ' + r.ruta + ' - ' + n); }); });
    partes.push(lineas.length ? '*NOVEDADES* 🚨\n' + lineas.join('\n') + '\n\nLas novedades encontradas se reportan en los grupos correspondientes.'
        : 'Sin novedades al momento del recorrido.');
    return partes.join('\n\n');
}

// Reporte por actividades, numerado, como el del turno: cada zona con sus rutas de barrido, las recolectoras, y lo que
// no sale del checklist (vías principales, RCD y voluminosos, otras) escrito a mano
var NUMEROS = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];
function cantidad(n) { return NUMEROS[n] ? NUMEROS[n] + ' (' + n + ')' : String(n); }
function unicos(lista) { return lista.filter(function (x, i, a) { return a.indexOf(x) === i; }); }
function ordenZonas(a, b) { return (a === '') - (b === '') || Number(a) - Number(b) || a.localeCompare(b); }
export function textoActividades(revisiones, op) {
    op = op || {};
    var limpio = function (t) { return String(t || '').trim(); };
    var items = [], de = function (tipo) { return revisiones.filter(function (r) { return r.tipo === tipo; }); };
    var zonasDe = function (lista) { return unicos(lista.map(function (r) { return limpio(r.zona); })).sort(ordenZonas); };
    var lv = de('lv'), ryt = de('ryt'), plan = de('plan');
    zonasDe(lv).forEach(function (z) {
        var rutas = unicos(lv.filter(function (r) { return limpio(r.zona) === z; }).map(function (r) { return r.ruta; }));
        items.push('Verificación de rutas de barrido' + (z ? ' – Zona ' + z : '') + ': Se realizó la inspección de ' + cantidad(rutas.length) + (rutas.length === 1 ? ' ruta' : ' rutas') + ' de barrido: ' + rutas.join(', ') + '.');
    });
    if (limpio(op.vias)) items.push('Verificación de vías principales: ' + limpio(op.vias));
    if (limpio(op.rcd)) items.push('Reporte de novedades RCD y voluminosos: ' + limpio(op.rcd));
    if (plan.length) {
        var sectores = unicos(plan.map(function (r) { return r.ruta; }));
        items.push('Verificación de planes de choque: Se realizó la verificación de ' + cantidad(sectores.length).replace(/^una /, 'un ') + (sectores.length === 1 ? ' plan' : ' planes') + ' de choque: ' + sectores.join(', ') + '.');
    }
    if (ryt.length) {
        var porZona = zonasDe(ryt).map(function (z) {
            var rutas = unicos(ryt.filter(function (r) { return limpio(r.zona) === z; }).map(nombreRevision));
            return (z ? 'Zona ' + z + ': ' : '') + rutas.join(', ');
        });
        var n = unicos(ryt.map(nombreRevision)).length;
        items.push('Verificación de vehículos y rutas recolectoras: Se ' + (n === 1 ? 'verificó ' : 'verificaron ') + cantidad(n) + (n === 1 ? ' ruta recolectora' : ' rutas recolectoras') + '. ' + porZona.join('. ') + '.');
    }
    if (limpio(op.otras)) items.push('Otras actividades: ' + limpio(op.otras));
    var nov = [];
    revisiones.forEach(function (r) { novedadesDe(r).forEach(function (x) { nov.push(r.ruta + ' - ' + x); }); });
    if (nov.length) items.push('Novedades encontradas: ' + nov.join('; ') + '. Se reportan en los grupos correspondientes.');
    if (!items.length) return '';
    var turno = limpio(op.turno);
    return 'REPORTE ' + (op.final ? 'FINAL' : 'PARCIAL') + ' DE ACTIVIDADES' + (turno ? ' – TURNO ' + turno.toUpperCase() : '') + '\n\n' +
        (op.final ? 'Durante ' : 'Durante lo que va d') + (op.final ? (turno ? 'el turno ' + turno.toLowerCase() : 'la jornada') : (turno ? 'el turno ' + turno.toLowerCase() : 'e la jornada')) +
        ' se desarrollaron las siguientes actividades de inspección y verificación:\n\n' +
        items.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
}

// ---------- Despacho ----------
// [id, título, frase para cuando todo salió bien]
export var SECCIONES_DESPACHO = [
    ['asignacion', 'Seguimiento a la asignación vehicular', 'El proceso de asignación vehicular se desarrolló con normalidad.'],
    ['retrasos', 'Seguimiento a retrasos de ruta', 'No se registraron retrasos en la salida de las rutas.'],
    ['volquetas', 'Despacho de volquetas', 'El despacho de volquetas se realizó sin novedades.'],
    ['motocarros', 'Despacho de motocarros', 'El despacho de motocarros se realizó sin novedades.'],
    ['standby', 'Verificación del personal Stand By', 'Se verificó la presentación oportuna del personal Stand By programado.']
];
// Tabla de volquetas de un turno: {programadas, filas: [{zona, servicio, control, inicio, fin, conductor, supervisor, aliado, novedad}]}
export var SERVICIO_VOLQUETA = 'Voluminosos clandestinos';
export var ALIADOS = ['FUDEA', 'FUNTRAEV', 'UdeA'];
export function filaVolqueta() { return { zona: '', servicio: SERVICIO_VOLQUETA, control: '', inicio: '', fin: '', conductor: '', supervisor: '', aliado: '', novedad: '' }; }
function filasConDatos(t) {
    return ((t || {}).filas || []).filter(function (f) { return [f.zona, f.control, f.inicio, f.fin, f.conductor, f.supervisor, f.novedad].some(function (v) { return String(v || '').trim(); }); });
}
// Despachada: la que salió (tiene hora de inicio). Programadas: lo escrito o, si no, cuántas filas hay
export function resumenVolquetas(t) {
    var filas = filasConDatos(t), escritas = parseInt((t || {}).programadas, 10);
    var programadas = escritas >= 0 ? escritas : filas.length;
    var despachadas = filas.filter(function (f) { return String(f.inicio || '').trim(); }).length;
    return { programadas: programadas, despachadas: despachadas, cumplimiento: programadas ? Math.round(1000 * despachadas / programadas) / 10 : null };
}
export function textoVolquetas(t) {
    var filas = filasConDatos(t);
    if (!filas.length) return '';
    var r = resumenVolquetas(t);
    return 'Rutas programadas: ' + r.programadas + '\nRutas despachadas: ' + r.despachadas + (r.cumplimiento === null ? '' : '\nCumplimiento: ' + String(r.cumplimiento).replace('.', ',') + ' %') + '\n\n' +
        filas.map(function (f) {
            var zona = String(f.zona || '').trim();
            return '- ' + [zona ? 'Zona ' + zona : '', f.servicio, f.control && 'Control ' + f.control, f.inicio && (f.inicio + (f.fin ? ' a ' + f.fin : '')), f.conductor, f.supervisor && 'Supervisor ' + f.supervisor, f.aliado, f.novedad && 'Novedad: ' + f.novedad]
                .map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' · ');
        }).join('\n');
}
// Las secciones y turnos sin escribir no salen en el reporte
export function textoDespacho(datos, fechaTexto) {
    var n = 0, secciones = [];
    SECCIONES_DESPACHO.forEach(function (s) {
        var d = (datos || {})[s[0]] || {};
        var tabla = s[0] === 'volquetas' ? (datos || {}).tabla_volquetas || {} : {};
        var turnos = [['Turno 1', 't1'], ['Turno 2', 't2']].map(function (t) {
            return [t[0], [String(d[t[1]] || '').trim(), textoVolquetas(tabla[t[1]])].filter(Boolean).join('\n\n')];
        }).filter(function (t) { return t[1]; });
        if (!turnos.length) return;
        secciones.push(++n + '. ' + s[1] + '\n\n' + turnos.map(function (t) { return t[0] + ':\n\n' + t[1].trim(); }).join('\n\n'));
    });
    if (!secciones.length) return '';
    return '*REPORTE DE ACTIVIDADES DE DESPACHO*\n\n' + (fechaTexto ? 'Fecha: ' + fechaTexto + '\n\n' : '') +
        'A continuación, se presenta el consolidado de las novedades y actividades operativas desarrolladas durante la jornada.\n\n' + secciones.join('\n\n');
}
