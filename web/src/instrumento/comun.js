// 🧾 Instrumento plan de choque: el formulario de Google «V3 INSTRUMENTO PLAN DE CHOQUE» abierto ya lleno (enlace
// prellenado, como AbrirFormularioZ*.ps1). La app no lo envía: el formulario pide la sesión de Google de quien lo llena y
// se revisa antes de pulsar «Enviar». Aquí solo la lógica (para probarla con npm test).

export var FORMULARIO = 'https://docs.google.com/forms/d/e/1FAIpQLSdKyRoRuy-9H5XH3TfrYQOyflEyE9lZmPPYEh2S7W4tfd9yQA/viewform';
var SI = 'Sí';

// Las opciones deben quedar escritas igual que en el formulario (si no, Google deja la pregunta vacía)
export var OPCIONES = {
    zona: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5', 'Zona 6', 'Zona 7'],
    aliado: ['FUDEA', 'FUNTRAEV', 'EMVARIAS'],
    siNo: [SI, 'No'],
    tipo: ['EVENTOS PLAN CHOQUE', 'VOLQUETAS Y MOTOCARROS'],
    eventos: ['0.33', '0.66', '1', '1.33', '1.66', '2', '3', '4', '5'],
    operarios: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10.', '11', '12.'],
    novedades: ['Personal incompleto', 'Bajo rendimiento', 'Salen antes', 'Llegada con retraso']
};
// Comuna que se sugiere al elegir la zona (la de los scripts del PC); se puede cambiar y queda la última usada por zona
export var COMUNA_ZONA = { 'Zona 3': 'COMUNA 9 BUENOS AIRES', 'Zona 5': 'COMUNA 14 POBLADO', 'Zona 7': 'COMUNA 10 LA CANDELARIA' };

// [campo, entry del formulario, página]. novedades es de casillas: va una vez por cada una marcada
export var CAMPOS = [
    ['inspector', 'entry.366340186', 1], ['fecha', 'entry.519235454', 1], ['zona', 'entry.328781857', 1],
    ['comuna', 'entry.1589851578', 1], ['aliado', 'entry.372534412', 1], ['herramientas', 'entry.178678118', 1],
    ['portaEpp', 'entry.1341285358', 1], ['usaEpp', 'entry.165230961', 1], ['tipo', 'entry.1874071219', 1],
    ['evento', 'entry.2051657917', 2], ['eventos', 'entry.935404353', 2], ['bolsas', 'entry.1865590264', 2],
    ['operarios', 'entry.1122998110', 2], ['novedades', 'entry.23146003', 2], ['otra', 'entry.1024721267', 2],
    ['fotos', 'entry.1405074621', 2]
];

export function vacio(hoy, pref) {
    pref = pref || {};
    var zona = pref.zona || '';
    return { inspector: pref.inspector || '', fecha: hoy, zona: zona, comuna: comunaDe(zona, pref), aliado: aliadoDe(zona, pref),
        herramientas: SI, portaEpp: SI, usaEpp: SI, tipo: OPCIONES.tipo[0], evento: '', eventos: '1', bolsas: '', operarios: '',
        novedades: [], otra: '', fotos: '' };
}
export function comunaDe(zona, pref) { return ((pref || {}).comunas || {})[zona] || COMUNA_ZONA[zona] || ''; }
export function aliadoDe(zona, pref) { return ((pref || {}).aliados || {})[zona] || ''; }

// Enlace prellenado. Los campos de la página 2 solo van si el tipo es EVENTOS PLAN CHOQUE (los de volquetas son otra página)
export function enlace(d) {
    var partes = [];
    CAMPOS.forEach(function (c) {
        if (c[2] === 2 && d.tipo !== OPCIONES.tipo[0]) return;
        var v = d[c[0]];
        (Array.isArray(v) ? v : [v]).forEach(function (x) {
            x = String(x == null ? '' : x).trim();
            if (x) partes.push(c[1] + '=' + encodeURIComponent(x));
        });
    });
    return FORMULARIO + '?usp=pp_url' + (partes.length ? '&' + partes.join('&') : '');
}

// Lo que falta antes de abrir (el formulario no deja enviar sin esto)
export function faltantes(d) {
    var f = [];
    [['inspector', 'el inspector'], ['fecha', 'la fecha'], ['zona', 'la zona'], ['comuna', 'la comuna'], ['aliado', 'el aliado']].forEach(function (x) { if (!String(d[x[0]] || '').trim()) f.push(x[1]); });
    if (d.tipo === OPCIONES.tipo[0]) {
        [['evento', 'el nombre del evento'], ['bolsas', 'las bolsas'], ['operarios', 'la cantidad de operarios']].forEach(function (x) { if (!String(d[x[0]] || '').trim()) f.push(x[1]); });
        if (d.fotos && !/^https?:\/\/\S+$/i.test(String(d.fotos).trim())) f.push('un enlace de fotos válido (https://…)');
    }
    return f;
}

// Cantidad de operarios como la escribe el formulario (10 y 12 llevan punto)
export function textoOperarios(n) {
    n = Math.round(Number(n) || 0);
    if (n < 1) return '';
    n = Math.min(n, 12);  // el formulario llega hasta 12
    return n === 10 ? '10.' : n === 12 ? '12.' : String(n);
}

// Abrir con la cuenta institucional aunque Chrome tenga otra por defecto («Necesitas acceso»): con el correo, Google usa
// authuser=correo; con un número (forma vieja), /u/N/ elige la N-ésima cuenta del navegador
export function esCorreo(t) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t || '').trim()); }
export function conCuenta(url, cuenta) {
    var n = String(cuenta == null ? '' : cuenta).trim();
    if (esCorreo(n)) return url + (url.indexOf('?') === -1 ? '?' : '&') + 'authuser=' + encodeURIComponent(n);
    return /^\d$/.test(n) ? url.replace('/forms/d/', '/forms/u/' + n + '/d/') : url;
}
// Pantalla de Google para entrar o elegir la cuenta, y de ahí al formulario
export function enlaceLogin(cuenta, destino) {
    var n = String(cuenta || '').trim();
    return 'https://accounts.google.com/AccountChooser?' + (esCorreo(n) ? 'Email=' + encodeURIComponent(n) + '&' : '') + 'continue=' + encodeURIComponent(destino);
}

// ---------- 📅 2026 Instrumento Domingos (LV y RyT de domingos y festivos) ----------
export var DOMINGOS = 'https://docs.google.com/forms/d/e/1FAIpQLSdqU5CDynt8LejwK-n8XpoD3dZhpLJnNteLskMQs857G9cGjQ/viewform';
// El nombre del inspector es una lista del formulario con los nombres del equipo: no se guarda aquí (repositorio público);
// cada quien lo escribe una vez tal como sale allá y queda en su equipo
export var OPC_DOM = {
    contratista: ['FUDEA', 'FUNTRAEV'],
    instrumento: ['Recolección y Transporte', 'Recolección y Transporte Adicional', 'Recolección Y Transporte Queja', 'Limpieza vial',
        'Limpieza Vial_Queja', 'Limpieza Vial_Adicional', 'Carrotanque', 'Volqueta', 'Barredora', 'Motocarro'],
    zona: ['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5', 'Zona 6', 'Zona 7 AM', 'Zona 7 PM', 'Zona 7 Noche', 'Zona 9'],
    verificacion: ['Operacion', 'Posoperacion', 'Despacho'],
    siNo: ['Si', 'No']  // así, sin tilde, en este formulario
};
// [campo, entry, pregunta]. Las de Si/No van en dos bloques, como en el formulario
export var PERSONAL = [['lugar', 'entry.859948771', '¿El personal se encontró realizando labores en su lugar de trabajo?'],
    ['uniforme', 'entry.48740217', '¿Porta el uniforme en buen estado y conforme a las especificaciones?'],
    ['herramientas', 'entry.275838990', '¿Herramientas en buen estado?'],
    ['eppEstado', 'entry.1195679026', '¿EPP en buen estado?'],
    ['eppUso', 'entry.1474379978', '¿Hace uso de los EPP en el momento de la inspección?']];
export var SERVICIO = [['frecuencia', 'entry.694383648', '¿Se cumplió la frecuencia establecida?'],
    ['recorrido', 'entry.2003586958', '¿Se cumplió con el recorrido y la ruta establecida?'],
    ['calidad', 'entry.301097107', '¿Se observó prestación del servicio con calidad?']];
var CAMPOS_DOM = [['inspector', 'entry.250822297'], ['contratista', 'entry.2054609230'], ['instrumento', 'entry.1204252918'],
    ['zona', 'entry.492247973'], ['fecha', 'entry.380610594'], ['ruta', 'entry.1527971'], ['verificacion', 'entry.1551873407']]
    .concat(PERSONAL, SERVICIO, [['fotos', 'entry.1418248002']]);

export function vacioDom(hoy, pref) {
    pref = pref || {};
    var d = { inspector: pref.inspectorDom || '', contratista: '', instrumento: pref.instrumentoDom || 'Limpieza vial', zona: '', fecha: hoy,
        ruta: '', verificacion: 'Operacion', fotos: '' };
    PERSONAL.concat(SERVICIO).forEach(function (c) { d[c[0]] = 'Si'; });
    return d;
}
export function contratistaDe(zona, pref) { return ((pref || {}).contratistasDom || {})[zona] || ''; }
export function enlaceDom(d) {
    var partes = CAMPOS_DOM.map(function (c) { var v = String(d[c[0]] == null ? '' : d[c[0]]).trim(); return v ? c[1] + '=' + encodeURIComponent(v) : ''; }).filter(Boolean);
    return DOMINGOS + '?usp=pp_url&' + partes.join('&');
}
// En este formulario todo es obligatorio
export function faltantesDom(d) {
    var f = [];
    [['inspector', 'el inspector'], ['contratista', 'el contratista'], ['instrumento', 'el instrumento'], ['zona', 'la zona'], ['fecha', 'la fecha'],
        ['ruta', 'el código de ruta'], ['verificacion', 'el tipo de verificación'], ['fotos', 'el enlace del registro fotográfico']].forEach(function (x) {
        if (!String(d[x[0]] || '').trim()) f.push(x[1]);
    });
    if (d.fotos && !/^https?:\/\/\S+$/i.test(String(d.fotos).trim())) f.push('un enlace de fotos válido (https://…)');
    return f;
}
// Zona del formulario: la 7 va por jornada (AM, PM o Noche, según el turno de la revisión)
export function zonaDom(zona, turno) {
    var z = String(zona || '').replace(/^zona\s*/i, '').trim();
    if (!z) return '';
    if (z !== '7') return 'Zona ' + z;
    return 'Zona 7 ' + (turno === 'Noche' ? 'Noche' : turno === 'Tarde' || turno === 'Intermedio' ? 'PM' : 'AM');
}
// De una revisión de LV o RyT (✅ Revisión) a las preguntas del instrumento: «No» si algo de ese grupo no cumplió
// Revisión con las preguntas del instrumento (✅ Revisión desde el 23/11/2026): pasa tal cual
var DE_REVISION = { p_lugar: 'lugar', p_uniforme: 'uniforme', p_herramientas: 'herramientas', p_epp_estado: 'eppEstado', p_epp_uso: 'eppUso',
    s_frecuencia: 'frecuencia', s_recorrido: 'recorrido', s_calidad: 'calidad' };
export function desdeRevisionDom(r) {
    var ops = r.operarios || [], items = r.items || {};
    if (items.formato === 'instrumento') {
        var d = { fecha: r.fecha || '', ruta: String(r.ruta || '').trim(), zona: zonaDom(r.zona, r.turno),
            instrumento: r.tipo === 'ryt' ? 'Recolección y Transporte' : 'Limpieza vial', verificacion: items.verificacion || 'Operacion',
            contratista: items.contratista || '', fotos: /^https?:\/\//i.test(r.enlace || '') ? r.enlace : '' };
        Object.keys(DE_REVISION).forEach(function (k) { d[DE_REVISION[k]] = items[k] === 'no' ? 'No' : 'Si'; });
        return d;
    }
    var falla = function (pruebas) { return ops.some(function (o) { return Object.keys(o.items || {}).some(function (k) { return o.items[k] === 'no' && pruebas(k); }); }); };
    var sn = function (malo) { return malo ? 'No' : 'Si'; };
    var rutaMal = items.r_ruta === 'no';
    var calidadMal = ['r_papeleo', 'r_cordoneo', 'r_completa', 'r_derrames', 'r_sentido', 'r_bolsas'].some(function (k) { return items[k] === 'no'; });
    return {
        fecha: r.fecha || '', ruta: String(r.ruta || '').trim(), zona: zonaDom(r.zona, r.turno),
        instrumento: r.tipo === 'ryt' ? 'Recolección y Transporte' : 'Limpieza vial',
        verificacion: r.tipo === 'ryt' && items.en_despacho === 'si' ? 'Despacho' : 'Operacion',
        lugar: sn(rutaMal), uniforme: sn(falla(function (k) { return k === 'epp_uniforme'; })),
        herramientas: sn(falla(function (k) { return k.indexOf('h_') === 0; })),
        eppEstado: sn(falla(function (k) { return k.indexOf('epp_') === 0 && k !== 'epp_uniforme'; })),
        eppUso: sn(falla(function (k) { return k.indexOf('epp_') === 0 && k !== 'epp_uniforme'; })),
        frecuencia: 'Si', recorrido: sn(rutaMal), calidad: sn(calidadMal),
        fotos: /^https?:\/\//i.test(r.enlace || '') ? r.enlace : (ops.map(function (o) { return o.enlace; }).filter(function (u) { return /^https?:\/\//i.test(u || ''); })[0] || '')
    };
}

// De una revisión de plan de choque (✅ Revisión, tipo «plan») a los campos del instrumento
export function desdeRevision(r) {
    var ops = (r.operarios || []).filter(function (o) { return String(o.nombre || '').trim() || Object.keys(o.items || {}).length; });
    var alguno = function (pref, valor) { return ops.some(function (o) { return Object.keys(o.items || {}).some(function (k) { return k.indexOf(pref) === 0 && o.items[k] === valor; }); }); };
    var epp = alguno('epp_', 'no') ? 'No' : SI, nov = [], items = r.items || {};
    if (items.r_personal === 'no') nov.push('Personal incompleto');
    if (items.r_avance === 'no') nov.push('Bajo rendimiento');
    return {
        fecha: r.fecha || '', zona: r.zona ? 'Zona ' + String(r.zona).replace(/^zona\s*/i, '') : '', evento: String(r.ruta || '').trim(),
        operarios: textoOperarios(ops.length), herramientas: alguno('h_', 'no') ? 'No' : SI, portaEpp: epp, usaEpp: epp,
        novedades: nov, otra: String(r.novedad || '').trim()
    };
}
