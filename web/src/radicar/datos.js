// Radicar PQR en EMVARIAS (formulario externo de Lappiz: runtime.lappiz.io). El formulario tiene reCAPTCHA, así que la app
// no lo llena ni lo envía: deja los datos listos, en el mismo orden y con las mismas opciones, para copiarlos y pegarlos.
// Opciones tomadas del formulario de EMVARIAS (10/11/2026).

export var URL_RADICAR = 'https://runtime.lappiz.io/#/page/Radicacion/Pqr_Lappiz';
export var URL_CONSULTAR = 'https://runtime.lappiz.io/#/forms?viewName=Pqr_Lappiz_PQR&entityId=c9270111-316a-4184-a389-c6efd3e561f2&viewMenu=true&appViewId=b8a1258a-7e3f-499f-a0ac-780f9992f7be';

export var OPCIONES = {
    tipoSolicitud: ['Queja', 'Reclamo por facturación', 'Reclamo por prestación del servicio', 'Felicitaciones y sugerencias', 'Solicitud de información pública',
        'Solicitud de servicios', 'Recurso de reposición', 'Recurso de reposición y Subsidiario de Apelación', 'Petición',
        'Quejas por derechos humanos de proveedores y contratistas', 'Quejas por derechos humanos gente Emvarias'],
    tipoSolicitante: ['Natural', 'Jurídica', 'Anónimo'],
    tipoIdentificacion: ['Cédula de ciudadanía', 'Cédula de extranjería', 'NIT', 'Tarjeta de identidad', 'Pasaporte', 'Registro civil', 'Otro'],
    tipoVia: ['Autopista', 'Avenida', 'Calle', 'Carrera', 'Diagonal', 'Transversal', 'Circular'],
    orientacion: ['Norte', 'Sur', 'Oriente', 'Oeste'],
    medioRespuesta: ['Correo electrónico', 'Dirección de notificación', 'Presencial', 'No tiene'],
};
// Letras del formulario: A … G y las dobles AA … CE
export var LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].concat(['A', 'B', 'C'].reduce(function (a, x) {
    return a.concat(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(function (y) { return x + y; }));
}, [])).filter(function (l) { return ['CF', 'CG'].indexOf(l) === -1; });

// Partes de la dirección → «Calle 90 # 48 - 02» (con letra y orientación si las hay)
// d: { via, num1, letra1, orient1, num2, letra2, orient2, placa }
export function armarDireccion(d) {
    d = d || {};
    var via = String(d.via || '').trim(), n1 = String(d.num1 || '').trim(), n2 = String(d.num2 || '').trim(), placa = String(d.placa || '').trim();
    if (!via || !n1) return '';
    var parte = function (n, l, o) { return [n, String(l || '').trim(), String(o || '').trim()].filter(Boolean).join(' '); };
    var t = via + ' ' + parte(n1, d.letra1, d.orient1);
    if (n2) t += ' # ' + parte(n2, d.letra2, d.orient2) + (placa ? ' - ' + placa : '');
    else if (placa) t += ' - ' + placa;
    return t;
}
// «Cl 90 # 48-02», «CR 48 N° 90 - 2» → partes (para llenar desde una dirección escrita de corrido)
var VIAS = { CL: 'Calle', CLL: 'Calle', CALLE: 'Calle', CR: 'Carrera', CRA: 'Carrera', KR: 'Carrera', CARRERA: 'Carrera', AV: 'Avenida', AVENIDA: 'Avenida',
    DG: 'Diagonal', DIAGONAL: 'Diagonal', TV: 'Transversal', TR: 'Transversal', TRANSVERSAL: 'Transversal', CIR: 'Circular', CIRCULAR: 'Circular', AUT: 'Autopista', AUTOPISTA: 'Autopista' };
export function leerDireccion(texto) {
    var t = String(texto || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    var m = t.match(/^(AUTOPISTA|AUT|AVENIDA|AV|CALLE|CLL|CL|CARRERA|CRA|CR|KR|DIAGONAL|DG|TRANSVERSAL|TV|TR|CIRCULAR|CIR)\s*(\d+)\s*([A-G]{1,2})?\s*(SUR|NORTE|ESTE|OESTE|ORIENTE)?\s*(?:#|NO|N°|Nº|N)?\s*(\d+)\s*([A-G]{1,2})?\s*(SUR|NORTE|ESTE|OESTE|ORIENTE)?\s*(?:-|\s)\s*(\d+)?/);
    if (!m) return null;
    var orient = function (o) { return o === 'SUR' ? 'Sur' : o === 'NORTE' ? 'Norte' : o === 'ESTE' || o === 'ORIENTE' ? 'Oriente' : o === 'OESTE' ? 'Oeste' : ''; };
    return { via: VIAS[m[1]], num1: m[2], letra1: m[3] || '', orient1: orient(m[4]), num2: m[5], letra2: m[6] || '', orient2: orient(m[7]), placa: m[8] || '' };
}

// Contenido sugerido por tipo de caso (corte de césped); [corchetes] para llenar
export var CONTENIDOS = [
    { id: 'sin-corte', titulo: 'Zona verde sin cortar', tipo: 'Reclamo por prestación del servicio',
        t: 'Solicito la intervención del servicio de corte de césped en la zona verde pública ubicada en [dirección], barrio [barrio], microrruta [microrruta], lote [lote]. El césped supera la altura establecida y no ha sido intervenido en la frecuencia programada. [Detalle adicional]' },
    { id: 'residuos', titulo: 'Residuos del corte sin recoger', tipo: 'Reclamo por prestación del servicio',
        t: 'Después del corte de césped realizado el [fecha] en [dirección], barrio [barrio] (microrruta [microrruta], lote [lote]), quedaron residuos vegetales sin recoger en [andén / calzada / zona verde]. Solicito su recolección y la limpieza del sector.' },
    { id: 'dano', titulo: 'Daño durante el corte', tipo: 'Queja',
        t: 'El [fecha], durante la actividad de corte de césped en [dirección], barrio [barrio], se ocasionó un daño a [vehículo / vidrio / bien]. [Describir el daño y si el personal tenía mallas de protección]. Solicito la atención y el resarcimiento correspondiente.' },
    { id: 'comportamiento', titulo: 'Comportamiento del personal', tipo: 'Queja',
        t: 'El [fecha], en [dirección], barrio [barrio], el personal de la cuadrilla de corte de césped [describir la situación]. Solicito que se adopten las medidas correspondientes.' },
    { id: 'arboles', titulo: 'Afectación a árboles', tipo: 'Queja',
        t: 'Durante el corte de césped realizado el [fecha] en [dirección], barrio [barrio] (microrruta [microrruta], lote [lote]), se ocasionaron heridas en la base de [número] árbol(es). Solicito la verificación y las medidas correspondientes.' },
    { id: 'felicitacion', titulo: 'Felicitación', tipo: 'Felicitaciones y sugerencias',
        t: 'Quiero felicitar al personal de corte de césped que intervino el [fecha] la zona verde de [dirección], barrio [barrio], por [motivo].' },
];
// Datos obligatorios del formulario de EMVARIAS que faltan (para avisar antes de abrirlo)
export function faltantes(f) {
    var falta = [], anon = f.tipoSolicitante === 'Anónimo';
    if (!f.tipoSolicitud) falta.push('tipo de solicitud');
    if (!f.tipoSolicitante) falta.push('tipo de solicitante');
    if (!anon) {
        if (!f.tipoIdentificacion) falta.push('tipo de identificación');
        if (!f.numeroIdentificacion) falta.push('número de identificación');
        if (!f.primerNombre) falta.push('primer nombre');
        if (!f.primerApellido && f.tipoSolicitante !== 'Jurídica') falta.push('primer apellido');
    }
    if (!f.municipio) falta.push('municipio');
    if (!(f.mismaNotificacion ? armarDireccion(f.prestacion) : armarDireccion(f.notificacion))) falta.push('dirección de notificación');
    if (!f.telefonoMovil) falta.push('teléfono móvil');
    if (!f.telefonoFijo) falta.push('teléfono fijo');
    if (!f.correo) falta.push('correo electrónico');
    if (!f.medioRespuesta) falta.push('medio de respuesta');
    if (!String(f.contenido || '').trim()) falta.push('contenido de la solicitud');
    return falta;
}
