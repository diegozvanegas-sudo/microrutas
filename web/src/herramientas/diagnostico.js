// diagnostico.html: qué deja guardar este equipo. No necesita sesión ni muestra claves ni datos: solo si funciona, y cuánto ocupa.
import { respaldoGuardar, respaldoLeer } from '../almacen.js';

var MARCA = 'diagnostico_marca';
var filas = [];
function fila(nombre, ok, detalle) {
    filas.push('<tr><td>' + (ok === true ? '✅' : ok === false ? '❌' : 'ℹ') + '</td><td><b>' + nombre + '</b><div>' + String(detalle == null ? '' : detalle).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</div></td></tr>');
    document.getElementById('resultado').innerHTML = filas.join('');
    document.getElementById('texto').value = filas.map(function (f) { return f.replace(/<\/td><td>/, ' ').replace(/<\/b><div>/, ': ').replace(/<[^>]+>/g, ''); }).join('\n');
}
function mb(n) { return (n / 1048576).toFixed(2).replace('.', ',') + ' MB'; }
function probarWeb(nombre, s) {
    try {
        if (!s) return fila(nombre, false, 'No existe en este navegador');
        var antes = s.getItem(MARCA);
        s.setItem(MARCA, String(Date.now()));
        var usado = 0;
        for (var i = 0; i < s.length; i++) { var k = s.key(i); usado += (k.length + (s.getItem(k) || '').length) * 2; }
        fila(nombre, true, 'Guarda bien · ' + s.length + ' datos · ' + mb(usado) + (antes ? ' · lo guardado antes de recargar SIGUE' : ' · primera vez o se perdió: recargue y vuelva a mirar'));
    } catch (e) {
        var total = 0;
        try { for (var j = 0; j < s.length; j++) { var c = s.key(j); total += (c.length + (s.getItem(c) || '').length) * 2; } } catch (e2) {}
        fila(nombre, false, (e && e.name) + ': ' + (e && e.message) + ' · ' + mb(total) + ' usados');
    }
}
async function arrancar() {
    var mm = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
    fila('Navegador', null, navigator.userAgent);
    fila('Modo', null, (mm ? 'App instalada' : 'Pestaña del navegador') + ' · ' + location.origin);
    var ls = null, ss = null;
    try { ls = window.localStorage; } catch (e) { fila('localStorage', false, (e && e.name) + ': acceso bloqueado'); }
    try { ss = window.sessionStorage; } catch (e) { fila('sessionStorage', false, (e && e.name) + ': acceso bloqueado'); }
    if (ls !== null) probarWeb('localStorage', ls);
    if (ss !== null) probarWeb('sessionStorage', ss);
    try {
        var antes = await respaldoLeer(MARCA);
        await respaldoGuardar(MARCA, Date.now());
        var leido = await respaldoLeer(MARCA);
        var dbs = indexedDB.databases ? await indexedDB.databases() : [];
        fila('IndexedDB (respaldo)', !!leido, (leido ? 'Guarda bien' : 'Guarda, pero no lee') + (antes ? ' · lo guardado antes de recargar SIGUE' : ' · primera vez o se perdió: recargue y vuelva a mirar') + ' · ' + dbs.length + ' bases');
    } catch (e) {
        fila('IndexedDB (respaldo)', false, (e && e.name) + ': ' + (e && e.message));
    }
    try {
        var hay = false, vistas = 0;
        await respaldoLeer('x').catch(function () {});
        var pide = await new Promise(function (ok, mal) {
            var r = indexedDB.open('microrutas_respaldo', 1);
            r.onsuccess = function () { ok(r.result); }; r.onerror = function () { mal(r.error); };
        });
        await new Promise(function (ok, mal) {
            var c = pide.transaction('kv').objectStore('kv').openKeyCursor();
            c.onsuccess = function () { if (!c.result) return ok(); vistas++; if (String(c.result.key).indexOf('sesion:') === 0) hay = true; c.result.continue(); };
            c.onerror = function () { mal(c.error); };
        });
        fila('Sesión en el respaldo', hay, hay ? 'Hay una sesión guardada' : 'No hay sesión guardada · ' + vistas + ' datos en el respaldo');
    } catch (e) { fila('Sesión en el respaldo', false, (e && e.name) + ': ' + (e && e.message)); }
    try {
        document.cookie = MARCA + '=1; path=/; max-age=60; SameSite=Lax';
        fila('Cookies', document.cookie.indexOf(MARCA) !== -1, navigator.cookieEnabled ? 'Habilitadas' : 'Deshabilitadas');
    } catch (e) { fila('Cookies', false, e && e.name); }
    fila('Sesión en cookies', document.cookie.indexOf('mr_') !== -1, document.cookie.indexOf('mr_') !== -1 ? 'Hay una sesión guardada' : 'No hay');
    try {
        if (navigator.storage && navigator.storage.estimate) {
            var est = await navigator.storage.estimate();
            var pers = navigator.storage.persisted ? await navigator.storage.persisted() : '¿?';
            fila('Espacio', null, mb(est.usage || 0) + ' usados de ' + mb(est.quota || 0) + ' · persistente: ' + (pers === true ? 'sí' : 'no'));
        } else fila('Espacio', null, 'El navegador no lo informa');
    } catch (e) { fila('Espacio', null, e && e.name); }
    try {
        var regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
        fila('App sin conexión', null, regs.length + ' registrada · controla esta página: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'sí' : 'no'));
    } catch (e) { fila('App sin conexión', null, e && e.name); }
    fila('Versión de la página', null, document.querySelector('script[type=module]') ? document.querySelector('script[type=module]').src.split('/').pop() : '');
}
document.getElementById('copiar').onclick = function () {
    var t = document.getElementById('texto');
    t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(function () { document.execCommand('copy'); });
    this.textContent = '✓ Copiado';
};
document.getElementById('recargar').onclick = function () { location.reload(); };
window.addEventListener('error', function (e) { fila('Error', false, e.message); });
arrancar();
