// contrato.html: resumen de las especificaciones técnicas. El contenido está en Supabase (public.contrato_secciones),
// solo para usuarios con sesión; la última copia queda en el celular para consultarla sin señal.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';

var CACHE = 'contrato_cache';
var $ = function (id) { return document.getElementById(id); };
var secciones = [];

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
// Sin tildes ni mayúsculas, para que "camion" encuentre "camión"
function plano(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// Resalta lo buscado sin romper el escape del texto
function resaltar(texto, q) {
    if (!q) return esc(texto);
    var t = String(texto), p = plano(t), out = '', i = 0, k;
    while ((k = p.indexOf(q, i)) >= 0) { out += esc(t.slice(i, k)) + '<mark>' + esc(t.slice(k, k + q.length)) + '</mark>'; i = k + q.length; }
    return out + esc(t.slice(i));
}

function item(it, tipo, q) {
    var ref = it.ref ? '<span class="ref">' + esc(it.ref) + '</span>' : '';
    if (tipo === 'cifras') return '<div class="cifra"><b>' + resaltar(it.clave, q) + '</b><p>' + resaltar(it.t, q) + '</p>' + ref + '</div>';
    if (tipo === 'tabla') return '<tr><th>' + resaltar(it.clave, q) + '</th><td>' + resaltar(it.t, q) + ref + '</td></tr>';
    return '<li>' + (it.clave ? '<b>' + resaltar(it.clave, q) + ':</b> ' : '') + resaltar(it.t, q) + ref + '</li>';
}

function pintar() {
    var q = plano($('buscar').value.trim()), total = 0;
    var visibles = secciones.filter(function (s) { return s.tipo !== 'meta'; }).map(function (s) {
        var items = q ? s.items.filter(function (it) { return plano([it.clave, it.t, it.ref, s.titulo].join(' ')).indexOf(q) >= 0; }) : s.items;
        total += items.length;
        return { s: s, items: items };
    }).filter(function (x) { return x.items.length; });

    $('indice').innerHTML = visibles.map(function (x) {
        return '<a href="#' + esc(x.s.id) + '">' + esc(x.s.icono) + ' ' + esc(x.s.titulo) + (q ? ' <small>' + x.items.length + '</small>' : '') + '</a>';
    }).join('');
    $('secciones').innerHTML = visibles.map(function (x) {
        var s = x.s, cuerpo = s.tipo === 'cifras' ? '<div class="cifras">' + x.items.map(function (it) { return item(it, 'cifras', q); }).join('') + '</div>'
            : s.tipo === 'tabla' ? '<table class="plazos"><tbody>' + x.items.map(function (it) { return item(it, 'tabla', q); }).join('') + '</tbody></table>'
            : '<ul>' + x.items.map(function (it) { return item(it, s.tipo, q); }).join('') + '</ul>';
        return '<section class="seccion t-' + esc(s.tipo) + '" id="' + esc(s.id) + '"><h2>' + esc(s.icono) + ' ' + esc(s.titulo) + '</h2>' + cuerpo + '</section>';
    }).join('');
    $('estado').hidden = !!visibles.length;
    if (!visibles.length) $('estado').textContent = q ? 'No hay nada con «' + $('buscar').value.trim() + '» en el resumen.' : 'El resumen está vacío.';
}

function mostrar(filas, deCopia) {
    secciones = filas.slice().sort(function (a, b) { return a.orden - b.orden; });
    var meta = secciones.find(function (s) { return s.tipo === 'meta'; });
    $('doc').innerHTML = meta ? esc(meta.titulo) + (meta.items[0] ? ' · ' + esc(meta.items[0].t) : '') + (deCopia ? ' · <b>copia guardada en este equipo (sin conexión)</b>' : '') : '';
    pintar();
}

async function cargar() {
    $('estado').hidden = false;
    $('estado').textContent = 'Cargando…';
    var res = await supabase.from('contrato_secciones').select('id, orden, icono, titulo, tipo, items').order('orden');
    if (res.error) {
        var copia = null;
        try { copia = JSON.parse(localStorage.getItem(CACHE)); } catch (e) {}
        if (copia && copia.length) return mostrar(copia, true);
        $('estado').textContent = 'No se pudo cargar el contrato: ' + res.error.message;
        return;
    }
    try { localStorage.setItem(CACHE, JSON.stringify(res.data)); } catch (e) {}
    mostrar(res.data, false);
}

async function arrancar() {
    iniciarEncabezado();
    $('btn-imprimir').onclick = function () { window.print(); };
    $('btn-recargar').onclick = cargar;
    $('buscar').addEventListener('input', pintar);
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    // Al salir se borra la copia del equipo: el contrato es solo para usuarios con sesión
    salir.onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    // Solo administradores y usuarios con el permiso (usuarios.html); la base también lo exige
    var permisos = await aplicarPermisos(supabase, usuario);
    if (!permisos.contrato) {
        try { localStorage.removeItem(CACHE); } catch (e) {}
        $('buscar').hidden = true;
        $('estado').textContent = '🔒 Su usuario no tiene permiso para ver el contrato. Pídaselo al administrador.';
        return;
    }
    cargar();
}

arrancar();
