// Menú "Más" del encabezado y desplegables de servicio (LV y RyT): se cierran al elegir una opción, al tocar fuera o con Esc.
import './encabezado.css';

// La lista de un desplegable de servicio va en posición fija, debajo de su botón (la fila de pestañas la recortaría)
function ubicar(menu) {
    var b = menu.querySelector('summary').getBoundingClientRect(), lista = menu.querySelector('.nav-menu-lista');
    lista.style.top = b.bottom + 4 + 'px';
    lista.style.left = Math.max(8, Math.min(b.left, window.innerWidth - lista.offsetWidth - 8)) + 'px';
}

export function iniciarEncabezado() {
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
