// contrato.html: el contrato de corte de césped (public.contrato_secciones) y los convenios de LV y RyT con sus mapas
// mentales (public.convenio_secciones). Solo para usuarios con sesión y permiso; la última copia queda en el celular
// para consultarla sin señal. Cada documento se ve como resumen o como mapa mental.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';

var CACHE = 'contrato_cache';            // también la usa pqr.html: solo el contrato de corte de césped
var CACHE_CONVENIOS = 'convenios_cache';
var CESPED = 'CESPED';
// Orden y nombre corto de los documentos; los mapas (MAPA-…) van al final con su propio título
var GRUPOS = [
    { titulo: 'Zonas verdes', docs: [[CESPED, '🌿 Corte de césped']] },
    { titulo: 'Convenios LV y RyT', docs: [['PPSA', '📘 PPSA'], ['RYT-FUDEA', '🚛 RyT FUDEA'], ['LV-FUDEA', '🧹 LV FUDEA'], ['RYT-FUNTRAEV', '🚛 RyT FUNTRAEV'], ['LV-FUNTRAEV', '🧹 LV FUNTRAEV']] },
];
var $ = function (id) { return document.getElementById(id); };
var docs = {};                           // código → secciones ordenadas
var actual = CESPED, vista = 'lista', deCopia = false;

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

function metaDe(codigo) {
    return (docs[codigo] || []).find(function (s) { return s.tipo === 'meta'; });
}
function codigos() {
    var mapas = Object.keys(docs).filter(function (c) { return c.indexOf('MAPA-') === 0; }).sort();
    return GRUPOS.map(function (g) { return { titulo: g.titulo, docs: g.docs.filter(function (d) { return docs[d[0]]; }) }; })
        .concat([{ titulo: 'Mapas mentales', docs: mapas.map(function (c) { return [c, '🧠 ' + (metaDe(c) ? metaDe(c).titulo : c)]; }) }])
        .filter(function (g) { return g.docs.length; });
}

function pintarDocs() {
    $('docs').innerHTML = codigos().map(function (g) {
        return '<div class="grupo-docs"><span>' + esc(g.titulo) + '</span>' + g.docs.map(function (d) {
            return '<button type="button" data-doc="' + esc(d[0]) + '" aria-pressed="' + (d[0] === actual) + '">' + esc(d[1]) + '</button>';
        }).join('') + '</div>';
    }).join('');
}

function elegir(codigo) {
    actual = docs[codigo] ? codigo : CESPED;
    vista = actual.indexOf('MAPA-') === 0 ? 'mapa' : 'lista';
    $('buscar').value = '';
    var url = new URL(location.href);
    if (actual === CESPED) url.searchParams.delete('doc'); else url.searchParams.set('doc', actual);
    history.replaceState(null, '', url);
    pintarDocs();
    pintar();
    window.scrollTo(0, 0);
}

function pintar() {
    var secciones = docs[actual] || [], q = plano($('buscar').value.trim());
    var meta = metaDe(actual);
    $('doc').innerHTML = meta ? esc(meta.titulo) + (meta.items[0] ? ' · ' + esc(meta.items[0].t) : '') + (deCopia ? ' · <b>copia guardada en este equipo (sin conexión)</b>' : '') : '';
    $('v-lista').setAttribute('aria-pressed', vista === 'lista');
    $('v-mapa').setAttribute('aria-pressed', vista === 'mapa');

    var visibles = secciones.filter(function (s) { return s.tipo !== 'meta'; }).map(function (s) {
        var items = q ? s.items.filter(function (it) { return plano([it.clave, it.t, it.ref, s.titulo].join(' ')).indexOf(q) >= 0; }) : s.items;
        return { s: s, items: items };
    }).filter(function (x) { return x.items.length; });

    $('indice').hidden = vista === 'mapa';
    $('indice').innerHTML = visibles.map(function (x) {
        return '<a href="#' + esc(x.s.id) + '">' + esc(x.s.icono) + ' ' + esc(x.s.titulo) + (q ? ' <small>' + x.items.length + '</small>' : '') + '</a>';
    }).join('');
    $('secciones').innerHTML = vista === 'mapa' ? mapa(meta, visibles, q) : visibles.map(function (x) {
        var s = x.s, cuerpo = s.tipo === 'cifras' ? '<div class="cifras">' + x.items.map(function (it) { return item(it, 'cifras', q); }).join('') + '</div>'
            : s.tipo === 'tabla' ? '<table class="plazos"><tbody>' + x.items.map(function (it) { return item(it, 'tabla', q); }).join('') + '</tbody></table>'
            : '<ul>' + x.items.map(function (it) { return item(it, s.tipo, q); }).join('') + '</ul>';
        return '<section class="seccion t-' + esc(s.tipo) + '" id="' + esc(s.id) + '"><h2>' + esc(s.icono) + ' ' + esc(s.titulo) + '</h2>' + cuerpo + '</section>';
    }).join('');
    $('estado').hidden = !!visibles.length;
    if (!visibles.length) $('estado').textContent = q ? 'No hay nada con «' + $('buscar').value.trim() + '» en este documento.' : 'Este documento está vacío.';
}

// Mapa mental: el documento al centro y cada sección como rama con sus puntos
function mapa(meta, visibles, q) {
    var raiz = meta ? meta.titulo : actual;
    return '<div class="mapa"><div class="raiz">' + esc(raiz) + '</div><div class="ramas">' + visibles.map(function (x, i) {
        var s = x.s, refs = Array.from(new Set(x.items.map(function (it) { return it.ref; }).filter(Boolean)));
        return '<div class="rama r' + (i % 7) + (s.tipo === 'alerta' ? ' alerta' : '') + '"><details open><summary>' + esc(s.icono) + ' ' + resaltar(s.titulo, q) +
            (refs.length === 1 ? '<span class="ref">' + esc(refs[0]) + '</span>' : '') + '</summary><ul>' +
            x.items.map(function (it) { return refs.length === 1 ? item({ clave: it.clave, t: it.t }, 'lista', q) : item(it, 'lista', q); }).join('') +
            '</ul></details></div>';
    }).join('') + '</div></div>';
}

function leerCopia(clave) {
    try { var c = JSON.parse(localStorage.getItem(clave)); return c && c.length ? c : null; } catch (e) { return null; }
}
function guardarCopia(clave, filas) {
    try { localStorage.setItem(clave, JSON.stringify(filas)); } catch (e) {}
}
function ordenar(filas) {
    return filas.slice().sort(function (a, b) { return a.orden - b.orden; });
}

async function cargar() {
    $('estado').hidden = false;
    $('estado').textContent = 'Cargando…';
    var res = await Promise.all([
        supabase.from('contrato_secciones').select('id, orden, icono, titulo, tipo, items').order('orden'),
        supabase.from('convenio_secciones').select('documento, id, orden, icono, titulo, tipo, items').order('orden'),
    ]);
    var cesped = res[0].error ? leerCopia(CACHE) : res[0].data;
    var convenios = res[1].error ? leerCopia(CACHE_CONVENIOS) : res[1].data;
    deCopia = !!(res[0].error || res[1].error) && !!(cesped || convenios);
    if (!res[0].error) guardarCopia(CACHE, res[0].data);
    if (!res[1].error) guardarCopia(CACHE_CONVENIOS, res[1].data);
    if (!cesped && !convenios) {
        $('estado').textContent = 'No se pudo cargar el contrato: ' + (res[0].error || res[1].error).message;
        return;
    }
    docs = {};
    if (cesped) docs[CESPED] = ordenar(cesped);
    (convenios || []).forEach(function (f) { (docs[f.documento] = docs[f.documento] || []).push(f); });
    Object.keys(docs).forEach(function (c) { docs[c] = ordenar(docs[c]); });
    elegir(new URL(location.href).searchParams.get('doc') || actual);
}

async function arrancar() {
    iniciarEncabezado();
    $('btn-imprimir').onclick = function () { window.print(); };
    $('btn-recargar').onclick = cargar;
    $('buscar').addEventListener('input', pintar);
    $('docs').addEventListener('click', function (e) { var b = e.target.closest('button[data-doc]'); if (b) elegir(b.dataset.doc); });
    $('v-lista').onclick = function () { vista = 'lista'; pintar(); };
    $('v-mapa').onclick = function () { vista = 'mapa'; pintar(); };
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    // Al salir se borran las copias del equipo: los documentos son solo para usuarios con sesión
    salir.onclick = function () { try { localStorage.removeItem(CACHE); localStorage.removeItem(CACHE_CONVENIOS); } catch (e) {} cerrarSesion(supabase); };
    // Solo administradores y usuarios con el permiso (usuarios.html); la base también lo exige
    var permisos = await aplicarPermisos(supabase, usuario);
    if (!permisos.contrato) {
        try { localStorage.removeItem(CACHE); localStorage.removeItem(CACHE_CONVENIOS); } catch (e) {}
        $('buscar').hidden = true;
        $('estado').textContent = '🔒 Su usuario no tiene permiso para ver el contrato. Pídaselo al administrador.';
        return;
    }
    cargar();
}

arrancar();
