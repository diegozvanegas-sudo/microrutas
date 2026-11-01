// Menú "Más" del encabezado y desplegables de servicio (LV y RyT): se cierran al elegir una opción, al tocar fuera o con Esc.
import './encabezado.css';

// La lista de un desplegable de servicio va en posición fija, debajo de su botón (la fila de pestañas la recortaría)
function ubicar(menu) {
    var b = menu.querySelector('summary').getBoundingClientRect(), lista = menu.querySelector('.nav-menu-lista');
    lista.style.top = b.bottom + 4 + 'px';
    lista.style.left = Math.max(8, Math.min(b.left, window.innerWidth - lista.offsetWidth - 8)) + 'px';
}

// Herramientas del menú Más de Subsanaciones, también en las demás secciones: abren Subsanaciones con la herramienta lista
var HERRAMIENTAS = [
    ['hallazgos', '📋 Posibles hallazgos', 'Mensajes de interventoría listos para el grupo: escriba qué vio y aparecen'],
    ['fotos', '🖼️ Fotos a PDF', 'Una o muchas fotos en un solo PDF'],
    ['zip', '🗜️ ZIP a PDF', 'Pasar uno o varios .zip de fotos a PDF (una foto por página)'],
    ['nota', '🖊️ Texto a imagen', 'Escribir un texto y guardarlo como imagen en el celular'],
    ['ocr', '🔤 Imágenes a texto', 'Sacar el texto de una o muchas imágenes o pantallazos']
];
// Páginas propias: van en el menú Más de todas las secciones
var PAGINAS = [
    ['buscar.html', '🔎 Buscar en todo', 'Una sola búsqueda en visitas, revisiones, PQR y pendientes'],
    ['pdf.html', '📎 Unir y comprimir PDF', 'Unir, ordenar y comprimir PDF en el equipo']
];
function agregarPaginas() {
    var lista = document.querySelector('.menu-mas .menu-lista');
    if (!lista) return;
    lista.insertAdjacentHTML('afterbegin', PAGINAS.map(function (h) {
        return '<a class="item-menu" href="' + h[0] + '" title="' + h[2] + '">' + h[1] + '</a>';
    }).join('') + '<hr>');
}
function agregarHerramientas() {
    var lista = document.querySelector('.menu-mas .menu-lista');
    if (!lista || document.getElementById('btn-fotos')) return; // en Subsanaciones ya están
    var html = '<div class="titulo-menu">Herramientas</div>' + HERRAMIENTAS.map(function (h) {
        return '<a class="item-menu" href="subsanaciones.html?herramienta=' + h[0] + '" title="' + h[2] + '">' + h[1] + '</a>';
    }).join('') + '<hr>';
    lista.insertAdjacentHTML('afterbegin', html);
}

export function iniciarEncabezado() {
    agregarHerramientas();
    agregarPaginas();
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
