// Menú "Más" del encabezado: se cierra al elegir una opción, al tocar fuera o con Esc.
import './encabezado.css';

export function iniciarEncabezado() {
    var menu = document.querySelector('.menu-mas');
    if (!menu) return;
    menu.querySelector('.menu-lista').addEventListener('click', function (ev) {
        if (ev.target.closest('.item-menu')) menu.open = false;
    });
    document.addEventListener('click', function (ev) {
        if (menu.open && !menu.contains(ev.target)) menu.open = false;
    });
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
    });
}
