// Secciones y herramientas que el administrador enciende o apaga por usuario (👥 Usuarios → Editar → Secciones).
// En la base se guarda solo lo apagado (perfiles.ocultas, 0024_secciones_por_usuario.sql) con estas claves: no cambiarlas,
// porque lo ya guardado dejaría de coincidir. Una sección nueva se agrega aquí y queda encendida para todos.
// Aquí va solo la lógica (sin pantalla); sesion.js la aplica al menú y a la página.
//
//   puede(permisos, clave)     -> true si ese usuario la ve ({ admin, contrato, ocultas } de mis_permisos)
//   claveDeEnlace(href)        -> la clave de un enlace del menú ('pqr.html' → 'pqr', '…?herramienta=fotos' → 'fotos')
//   clavePagina(href)          -> la clave de la página abierta (sin contar #auditar ni ?herramienta)
//   primeraPermitida(permisos) -> la primera página que sí puede abrir (para mandarlo allá)

// contrato: además pide «Puede ver el contrato». dentro: se abre dentro de otra sección y sin ella no se ve.
// enPagina: vive en esa página pero es de todos (🧰 Crear archivos): se abre aunque esa sección esté apagada
export var SECCIONES = [
    { clave: 'subsanaciones', nombre: '📋 Subsanaciones', grupo: 'Zonas verdes', pagina: 'subsanaciones.html' },
    { clave: 'mapa', nombre: '🗺️ Mapa', grupo: 'Zonas verdes', pagina: 'mapa_rapido.html', otras: ['index.html'] },
    { clave: 'pqr', nombre: '📝 PQR', grupo: 'Zonas verdes', pagina: 'pqr.html' },
    { clave: 'radicar', nombre: '🏛️ Radicar PQR', grupo: 'Zonas verdes', pagina: 'radicar.html' },
    { clave: 'auditar', nombre: '🔍 Auditar ZIP', grupo: 'Zonas verdes', pagina: 'subsanaciones.html', hash: '#auditar', dentro: 'subsanaciones' },
    { clave: 'cruce', nombre: '📊 Cruce programado / realizado', grupo: 'Zonas verdes', pagina: 'cruce.html' },
    { clave: 'optimizar', nombre: '🛣️ Programación por cercanía', grupo: 'Zonas verdes', pagina: 'optimizar.html' },
    { clave: 'guia', nombre: '🧭 Guía de campo', grupo: 'Zonas verdes', pagina: 'contrato.html', doc: 'GUIA-CAMPO', contrato: true },
    { clave: 'requerimientos', nombre: '📨 Requerimientos', grupo: 'Zonas verdes', pagina: 'requerimiento.html', contrato: true },
    { clave: 'pendientes', nombre: '📌 Pendientes', grupo: 'General', pagina: 'pendientes.html' },
    { clave: 'informe', nombre: '🗒️ Informe', grupo: 'General', pagina: 'informe.html' },
    { clave: 'contrato', nombre: '📜 Contrato', grupo: 'General', pagina: 'contrato.html', contrato: true },
    { clave: 'cronogramas', nombre: '🗓️ Cronogramas', grupo: 'General', pagina: 'cronogramas.html' },
    { clave: 'programados', nombre: '⏰ Envíos programados', grupo: 'General', pagina: 'programados.html' },
    { clave: 'horas', nombre: '⏱️ Horas extras', grupo: 'LV y RyT', pagina: 'horas.html' },
    { clave: 'horarios', nombre: '🕒 Horarios de rutas', grupo: 'LV y RyT', pagina: 'horarios.html' },
    { clave: 'revision', nombre: '✅ Revisión', grupo: 'LV y RyT', pagina: 'revision.html' },
    { clave: 'despacho', nombre: '🚦 Despacho', grupo: 'LV y RyT', pagina: 'despacho.html' },
    { clave: 'buscar', nombre: '🔎 Buscar en todo', grupo: 'Menú Más', pagina: 'buscar.html' },
    { clave: 'pdf', nombre: '📎 Unir y comprimir PDF', grupo: 'Crear archivos', pagina: 'pdf.html' },
    { clave: 'hallazgos', nombre: '📋 Posibles hallazgos', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'buenas', nombre: '✅ Buena operación', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'prog', nombre: '📅 Programación del día', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'ubicar', nombre: '📍 Ubicar direcciones', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'tabla', nombre: '📥 Informes desde una tabla', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'fotos', nombre: '🖼️ Fotos a PDF', grupo: 'Crear archivos', herramienta: true, enPagina: 'subsanaciones' },
    { clave: 'zip', nombre: '🗜️ ZIP a PDF', grupo: 'Crear archivos', herramienta: true, enPagina: 'subsanaciones' },
    { clave: 'fotolote', nombre: '📍 Fotos con su lote', grupo: 'Menú Más', herramienta: true, dentro: 'subsanaciones' },
    { clave: 'nota', nombre: '🖊️ Texto a imagen', grupo: 'Crear archivos', herramienta: true, enPagina: 'subsanaciones' },
    { clave: 'ocr', nombre: '🔤 Imágenes a texto', grupo: 'Crear archivos', herramienta: true, enPagina: 'subsanaciones' }
];
export var GRUPOS = ['Zonas verdes', 'General', 'LV y RyT', 'Crear archivos', 'Menú Más'];

var porClave = {};
SECCIONES.forEach(function (s) { porClave[s.clave] = s; });
export function seccion(clave) { return porClave[clave] || null; }

// ¿La cuenta entra a Microrrutas? (0025: Microrrutas y Rutina comparten las cuentas). Sin el dato (permisos de antes de
// 0025, o sin conexión la primera vez) se toma que sí: la base igual no le entrega nada a quien no tiene acceso
export function entra(permisos) { return !permisos || permisos.microrutas !== false; }

export function puede(permisos, clave) {
    var s = porClave[clave], p = permisos || {};
    if (!entra(p)) return false;
    if (!s) return true;                      // lo que no está en la lista no se controla aquí
    if (p.admin) return true;
    if (s.contrato && !p.contrato) return false;
    if ((p.ocultas || []).indexOf(clave) !== -1) return false;
    return s.dentro ? puede(p, s.dentro) : true;
}

function partes(href) {
    var u;
    try { u = new URL(href, 'https://x/'); } catch (e) { return null; }
    var archivo = decodeURIComponent(u.pathname.split('/').pop() || '') || 'index.html';
    return { archivo: archivo.toLowerCase(), doc: u.searchParams.get('doc') || '', herramienta: u.searchParams.get('herramienta') || '', hash: u.hash };
}
function buscar(x, conHash) {
    if (!x) return '';
    for (var i = 0; i < SECCIONES.length; i++) {
        var s = SECCIONES[i];
        if (s.herramienta || s.pagina !== x.archivo && (s.otras || []).indexOf(x.archivo) === -1) continue;
        if (s.doc && s.doc !== x.doc) continue;   // la Guía va antes que el Contrato: contrato.html?doc=otro es Contrato
        // Primero se buscan las de #algo (Auditar ZIP), después la página sola
        if (conHash ? s.hash !== x.hash || !s.hash : !!s.hash) continue;
        return s.clave;
    }
    return '';
}
export function claveDeEnlace(href) {
    var x = partes(href);
    if (!x) return '';
    if (x.herramienta && porClave[x.herramienta] && porClave[x.herramienta].herramienta) return x.herramienta;
    return buscar(x, true) || buscar(x, false);
}
export function clavePagina(href) { return buscar(partes(href), false); }

export function primeraPermitida(permisos) {
    for (var i = 0; i < SECCIONES.length; i++) {
        var s = SECCIONES[i];
        if (s.pagina && !s.hash && !s.otras && puede(permisos, s.clave)) return s;
    }
    return null;
}
