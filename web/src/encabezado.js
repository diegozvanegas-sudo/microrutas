// Menú "Más" del encabezado y desplegables de servicio (LV y RyT): se cierran al elegir una opción, al tocar fuera o con Esc.
import './encabezado.css';

// La lista de un desplegable de servicio va en posición fija, debajo de su botón (la fila de pestañas la recortaría)
function ubicar(menu) {
    var b = menu.querySelector('summary').getBoundingClientRect(), lista = menu.querySelector('.nav-menu-lista');
    lista.style.top = b.bottom + 4 + 'px';
    lista.style.left = Math.max(8, Math.min(b.left, window.innerWidth - lista.offsetWidth - 8)) + 'px';
}

// Herramientas de Subsanaciones en el menú Más de las demás secciones (mismo orden que en subsanaciones.html):
// abren Subsanaciones con la herramienta lista
var HERRAMIENTAS = [
    ['hallazgos', '📋 Posibles hallazgos', 'Mensajes de interventoría listos para el grupo: escriba qué vio y aparecen'],
    ['buenas', '✅ Buena operación', 'Mensajes de lo que se ve bien en campo (correcta operación), listos para el grupo'],
    ['prog', '📅 Programación del día', 'Subir el Excel de programación del mes y ver qué lote le toca hoy a cada cuadrilla y dónde va'],
    ['ubicar', '📍 Ubicar direcciones', 'Pegar un mensaje con direcciones y ver qué lotes quedan cerca y si ya les tocaba'],
    ['tabla', '📥 Informes desde una tabla', 'Pegar las filas copiadas del Excel (o leer un pantallazo) y sacar los informes'],
    ['fotolote', '📍 Fotos con su lote', 'Fotos, carpeta o .zip a PDF con la microrruta y el lote de cada foto según su GPS']
];
// Pestaña 🧰 Crear archivos, igual en todas las secciones. Las de Subsanaciones se abren allá (?herramienta=…);
// estando en Subsanaciones, con su botón escondido del menú Más, sin recargar la página
var CREAR = [
    ['subsanaciones.html?herramienta=fotos', '🖼️ Fotos a PDF', 'Una o muchas fotos en un solo PDF', 'fotos'],
    ['subsanaciones.html?herramienta=zip', '🗜️ ZIP a PDF', 'Pasar uno o varios .zip de fotos a PDF (una foto por página)', 'zip'],
    ['subsanaciones.html?herramienta=nota', '🖊️ Texto a imagen', 'Escribir un texto y guardarlo como imagen en el celular', 'nota'],
    ['subsanaciones.html?herramienta=ocr', '🔤 Imágenes a texto', 'Sacar el texto de una o muchas imágenes o pantallazos', 'ocr'],
    ['pdf.html', '📎 Unir y comprimir PDF', 'Unir, ordenar y comprimir PDF en el equipo', '']
];
// Páginas propias: van al principio del menú Más de todas las secciones
var PAGINAS = [
    ['buscar.html', '🔎 Buscar en todo', 'Una sola búsqueda en visitas, revisiones, PQR y pendientes']
];
function enlace(h) { return '<a class="item-menu" href="' + h[0] + '" title="' + h[2] + '">' + h[1] + '</a>'; }
function agregarPaginas() {
    var lista = document.querySelector('.menu-mas .menu-lista');
    if (!lista) return;
    lista.insertAdjacentHTML('afterbegin', PAGINAS.map(enlace).join('') + '<hr>');
}
function agregarHerramientas() {
    var lista = document.querySelector('.menu-mas .menu-lista');
    if (!lista || document.getElementById('btn-fotolote')) return; // en Subsanaciones ya están
    lista.insertAdjacentHTML('afterbegin', '<div class="titulo-menu">Subsanaciones</div>' + HERRAMIENTAS.map(function (h) {
        return enlace(['subsanaciones.html?herramienta=' + h[0], h[1], h[2]]);
    }).join('') + '<span data-fin-subs hidden></span><hr>');
    // 🗺️ Mapa completo también es de Subsanaciones: va al final de su grupo
    var fin = lista.querySelector('[data-fin-subs]'), mapa = lista.querySelector('a.item-menu[href="index.html"]');
    if (mapa) fin.before(mapa);
    fin.remove();
}
// ⎋ Salir siempre al final y aparte, con su raya
function salirAparte() {
    var salir = document.getElementById('btn-salir'), lista = salir && salir.closest('.menu-lista');
    if (!lista) return;
    lista.appendChild(salir);
    // ↻ Actualizar va en el mismo grupo que Usuarios y WhatsApp (como en Subsanaciones): sin raya entre ellos
    var recargar = lista.querySelector('#btn-recargar'), raya = recargar && recargar.nextElementSibling;
    if (raya && raya.tagName === 'HR' && raya.nextElementSibling && raya.nextElementSibling.id === 'menu-usuarios') raya.remove();
    var antes = salir.previousElementSibling;
    if (antes && antes.tagName !== 'HR') salir.insertAdjacentHTML('beforebegin', '<hr>');
}
function agregarCrear() {
    var nav = document.querySelector('.nav-app');
    if (!nav || document.getElementById('nav-crear')) return;
    var aqui = (location.pathname.split('/').pop() || '').toLowerCase();
    nav.insertAdjacentHTML('beforeend', '<details class="nav-menu" id="nav-crear"><summary>🧰 <span>Crear archivos</span></summary><div class="nav-menu-lista">' +
        CREAR.map(function (h) {
            return '<a href="' + h[0] + '" title="' + h[2] + '"' + (h[3] ? ' data-herramienta="' + h[3] + '"' : '') + (h[0] === aqui ? ' aria-current="page"' : '') + '>' + h[1] + '</a>';
        }).join('') + '</div></details>');
    // En Subsanaciones: abre la herramienta ahí mismo con su botón (si el administrador no se la apagó, sesion.js)
    nav.querySelector('#nav-crear').addEventListener('click', function (ev) {
        var a = ev.target.closest('a[data-herramienta]'), btn = a && document.getElementById('btn-' + a.dataset.herramienta);
        if (!btn || typeof btn.onclick !== 'function') return;
        ev.preventDefault();
        if (!btn.hidden) btn.onclick();
    });
}

export function iniciarEncabezado() {
    agregarCrear();
    agregarHerramientas();
    agregarPaginas();
    salirAparte();
    var menus = Array.prototype.slice.call(document.querySelectorAll('.menu-mas, .nav-menu'));
    menus.forEach(function (menu) {
        menu.addEventListener('click', function (ev) {
            if (ev.target.closest('.item-menu, .nav-menu-lista a')) menu.open = false;
        });
        if (menu.classList.contains('nav-menu')) {
            menu.addEventListener('toggle', function () {
                if (!menu.open) return;
                menus.forEach(function (m) { if (m !== menu) m.open = false; });
                ubicar(menu);
            });
        }
    });
    document.addEventListener('click', function (ev) {
        menus.forEach(function (m) { if (m.open && !m.contains(ev.target)) m.open = false; });
    });
    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        menus.forEach(function (m) { if (m.open) { m.open = false; m.querySelector('summary').focus(); } });
    });
    // Al desplazar la fila de pestañas o la página, o al cambiar el tamaño, la lista se cierra (quedaría fuera de lugar)
    function cerrarServicios() { menus.forEach(function (m) { if (m.open && m.classList.contains('nav-menu')) m.open = false; }); }
    window.addEventListener('resize', cerrarServicios);
    window.addEventListener('scroll', cerrarServicios, { passive: true });
    var nav = document.querySelector('.nav-app');
    if (nav) nav.addEventListener('scroll', cerrarServicios, { passive: true });
}
