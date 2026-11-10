// contrato.html: el contrato de corte de césped (public.contrato_secciones), la guía de revisión en campo y los convenios
// de LV y RyT con sus mapas mentales (public.convenio_secciones). Solo para usuarios con sesión y permiso; la última copia queda en el celular
// para consultarla sin señal. Cada documento se ve como resumen o como mapa mental.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { buscarEnDocumentos, documentoCitas, resaltarPalabras, textoWhatsApp } from './busqueda.js';

var CACHE = 'contrato_cache';            // también la usa pqr.html: solo el contrato de corte de césped
var CACHE_CONVENIOS = 'convenios_cache';
var CESPED = 'CESPED';
// Orden y nombre corto de los documentos; los mapas (MAPA-…) van al final con su propio título
var GRUPOS = [
    { titulo: 'Zonas verdes', docs: [[CESPED, '🌿 Corte de césped'], ['GUIA-CAMPO', '🧭 Guía de campo'], ['CITAS', '📨 Citas y ANS']] },
    { titulo: 'Convenios LV y RyT', docs: [['PPSA', '📘 PPSA'], ['RYT-FUDEA', '🚛 RyT FUDEA'], ['LV-FUDEA', '🧹 LV FUDEA'], ['RYT-FUNTRAEV', '🚛 RyT FUNTRAEV'], ['LV-FUNTRAEV', '🧹 LV FUNTRAEV']] },
];
var $ = function (id) { return document.getElementById(id); };
// Búsquedas frecuentes en campo (atajos debajo del buscador)
var FRECUENTES = ['supervisor', 'mallas', 'EPP', 'residuos', 'barrido', 'plazo', 'fauna', 'alturas', 'PMT', 'valla', 'fotos', 'árboles', 'descuento', 'carné'];
function nombresDocs() {
    var n = {};
    GRUPOS.forEach(function (g) { g.docs.forEach(function (d) { n[d[0]] = d[1]; }); });
    Object.keys(docs).forEach(function (c) { if (!n[c] && c.indexOf('MAPA-') === 0) n[c] = '🧠 ' + ((metaDe(c) || {}).titulo || c); });
    return n;
}
function ordenDocs() { return [].concat.apply([], GRUPOS.map(function (g) { return g.docs.map(function (d) { return d[0]; }); })); }
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

// Listas de chequeo de la guía de campo: lo marcado queda en este equipo (por documento, sección y punto)
var CHEQUEO = 'guia_chequeo';
function marcados() { try { return JSON.parse(localStorage.getItem(CHEQUEO)) || {}; } catch (e) { return {}; } }
function guardarMarcados(m) { try { localStorage.setItem(CHEQUEO, JSON.stringify(m)); } catch (e) {} }
function claveChequeo(seccion, i) { return actual + '|' + seccion + '|' + i; }

// it.ej: ejemplo de campo (cómo se ve, qué escribir en la novedad)
function ejemplo(it, q) { return it.ej ? '<span class="ej"><b>Ejemplo:</b> ' + resaltar(it.ej, q) + '</span>' : ''; }

function item(it, tipo, q, seccion, i) {
    var ref = it.ref ? '<span class="ref">' + esc(it.ref) + '</span>' : '';
    if (tipo === 'chequeo') {
        var k = claveChequeo(seccion, i), si = !!marcados()[k];
        return '<li class="chequeo' + (si ? ' hecho' : '') + '"><label><input type="checkbox" data-chequeo="' + esc(k) + '"' + (si ? ' checked' : '') + '><span>' +
            (it.clave ? '<b>' + resaltar(it.clave, q) + ':</b> ' : '') + resaltar(it.t, q) + ref + ejemplo(it, q) + '</span></label></li>';
    }
    if (tipo === 'cifras') return '<div class="cifra"><b>' + resaltar(it.clave, q) + '</b><p>' + resaltar(it.t, q) + '</p>' + ref + '</div>';
    if (tipo === 'tabla') return '<tr><th>' + resaltar(it.clave, q) + '</th><td>' + resaltar(it.t, q) + ref + '</td></tr>';
    return '<li>' + (it.clave ? '<b>' + resaltar(it.clave, q) + ':</b> ' : '') + resaltar(it.t, q) + ref + ejemplo(it, q) + '</li>';
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

// Copiar lo que salió en la búsqueda para pegarlo en WhatsApp (sin búsqueda, los botones no se ven)
var textoWa = '';
var LARGO_WA = 6000;   // más que esto, el enlace de WhatsApp puede no abrir: mejor copiar y pegar
function compartirWa(busqueda, grupos) {
    var hay = busqueda && grupos.some(function (g) { return g.secciones.some(function (s) { return s.items.length; }); });
    $('compartir-wa').hidden = !hay;
    textoWa = hay ? textoWhatsApp(busqueda, grupos) : '';
    if (!hay) return;
    var largo = textoWa.length > LARGO_WA;
    $('cw-abrir').href = 'https://wa.me/?text=' + encodeURIComponent(largo ? '' : textoWa);
    $('cw-abrir').hidden = largo;
    $('cw-nota').textContent = largo ? 'Mensaje largo (' + textoWa.length.toLocaleString('es-CO') + ' letras): cópielo y péguelo en el chat, o busque algo más preciso.' : '';
}
function avisoWa(msg) {
    var t = $('cw-toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(avisoWa.t); avisoWa.t = setTimeout(function () { t.classList.remove('ver'); }, 3500);
}
function copiarWa() {
    if (!textoWa) return;
    var listo = function () { avisoWa('Copiado: péguelo en el chat de WhatsApp.'); };
    var aMano = function () {
        var a = document.createElement('textarea');
        a.value = textoWa; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
        document.body.appendChild(a); a.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        a.remove();
        if (ok) listo(); else avisoWa('No se pudo copiar en este navegador: use «Abrir WhatsApp».');
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(textoWa).then(listo, aMano); else aMano();
}

// Resultados de la búsqueda en todos los documentos, agrupados por documento y sección
function pintarGeneral(texto) {
    var r = buscarEnDocumentos(docsBuscables(), texto, nombresDocs(), ordenDocs());
    $('indice').hidden = true;
    $('doc').innerHTML = '🔎 <b>' + r.total + (r.total === 1 ? ' resultado' : ' resultados') + '</b> para «' + esc(texto) + '» en ' +
        r.grupos.length + (r.grupos.length === 1 ? ' documento' : ' documentos') + (r.palabras.length ? ' <span class="sub">(se buscan todas las palabras: ' + esc(r.palabras.join(', ')) + ')</span>' : '');
    $('secciones').innerHTML = r.grupos.map(function (g) {
        return '<section class="res-doc"><h2>' + esc(g.nombre) + ' <span class="res-n">' + g.total + '</span>' +
            '<button type="button" class="secundario pequeno" data-ir="' + esc(g.codigo) + '">Abrir documento</button></h2>' +
            g.secciones.map(function (s) {
                return '<div class="res-sec"><h3>' + esc(s.icono || '') + ' ' + esc(s.titulo) +
                    ' <button type="button" class="enlace" data-ir="' + esc(g.codigo) + '" data-sec="' + esc(s.id) + '">Ver en el documento ›</button></h3><ul>' +
                    s.items.map(function (it) {
                        return '<li>' + (it.clave ? '<b>' + resaltarPalabras(it.clave, r.palabras, esc) + ':</b> ' : '') + resaltarPalabras(it.t, r.palabras, esc) +
                            (it.ref ? '<span class="ref">' + esc(it.ref) + '</span>' : '') +
                            (it.ej ? '<span class="ej"><b>Ejemplo:</b> ' + resaltarPalabras(it.ej, r.palabras, esc) + '</span>' : '') + '</li>';
                    }).join('') + '</ul></div>';
            }).join('') + '</section>';
    }).join('');
    compartirWa(texto, r.grupos);
    $('estado').hidden = !!r.total;
    if (!r.total) $('estado').innerHTML = r.palabras.length ? 'No hay nada con «' + esc(texto) + '» en ningún documento. Pruebe con menos palabras o con otra (p. ej. «malla» en vez de «protección»).' : 'Escriba al menos una palabra de 3 letras.';
}
// Documentos donde se busca: todos menos las plantillas internas de requerimientos (sus citas están en CITAS)
function docsBuscables() { var d = {}; Object.keys(docs).forEach(function (c) { if (c !== 'REQ-PLANTILLAS') d[c] = docs[c]; }); return d; }
function irA(codigo, seccion) {
    $('solo-doc').checked = false;
    elegir(codigo);
    if (!seccion) return;
    var el = document.getElementById(seccion);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('resaltada'); setTimeout(function () { el.classList.remove('resaltada'); }, 2200); }
}

function pintar() {
    var textoBuscado = $('buscar').value.trim();
    $('frecuentes').hidden = !!textoBuscado;
    if (textoBuscado && !$('solo-doc').checked) { $('v-lista').parentNode.hidden = true; pintarGeneral(textoBuscado); return; }
    $('v-lista').parentNode.hidden = false;
    var secciones = docs[actual] || [], q = plano(textoBuscado);
    var meta = metaDe(actual);
    $('doc').innerHTML = meta ? esc(meta.titulo) + (meta.items[0] ? ' · ' + esc(meta.items[0].t) : '') + (deCopia ? ' · <b>copia guardada en este equipo (sin conexión)</b>' : '') : '';
    $('v-lista').setAttribute('aria-pressed', vista === 'lista');
    $('v-mapa').setAttribute('aria-pressed', vista === 'mapa');

    var visibles = secciones.filter(function (s) { return s.tipo !== 'meta'; }).map(function (s) {
        // i: posición del punto en la sección (para que lo marcado no cambie al buscar)
        var items = s.items.map(function (it, i) { return Object.assign({ i: i }, it); });
        if (q) items = items.filter(function (it) { return plano([it.clave, it.t, it.ref, it.ej, s.titulo].join(' ')).indexOf(q) >= 0; });
        return { s: s, items: items };
    }).filter(function (x) { return x.items.length; });

    $('indice').hidden = vista === 'mapa';
    $('indice').innerHTML = visibles.map(function (x) {
        return '<a href="#' + esc(x.s.id) + '">' + esc(x.s.icono) + ' ' + esc(x.s.titulo) + (q ? ' <small>' + x.items.length + '</small>' : '') + '</a>';
    }).join('');
    $('secciones').innerHTML = vista === 'mapa' ? mapa(meta, visibles, q) : visibles.map(function (x) {
        var s = x.s, cuerpo = s.tipo === 'cifras' ? '<div class="cifras">' + x.items.map(function (it) { return item(it, 'cifras', q); }).join('') + '</div>'
            : s.tipo === 'tabla' ? '<table class="plazos"><tbody>' + x.items.map(function (it) { return item(it, 'tabla', q); }).join('') + '</tbody></table>'
            : s.tipo === 'pasos' ? '<ol class="pasos">' + x.items.map(function (it) { return item(it, 'lista', q); }).join('') + '</ol>'
            : '<ul>' + x.items.map(function (it) { return item(it, s.tipo, q, s.id, it.i); }).join('') + '</ul>';
        var m = marcados(), hechos = s.tipo === 'chequeo' ? s.items.filter(function (it, i) { return m[claveChequeo(s.id, i)]; }).length : 0;
        var barra = s.tipo === 'chequeo' ? '<div class="barra-chequeo"><span>' + hechos + ' de ' + s.items.length + ' revisados</span>' +
            (hechos ? '<button type="button" class="reiniciar" data-reiniciar="' + esc(s.id) + '">Empezar de nuevo</button>' : '') + '</div>' : '';
        return '<section class="seccion t-' + esc(s.tipo) + '" id="' + esc(s.id) + '"><h2>' + esc(s.icono) + ' ' + esc(s.titulo) + '</h2>' + barra + cuerpo + '</section>';
    }).join('');
    // «Solo en este documento»: también se puede copiar lo que salió
    compartirWa(q ? textoBuscado : '', q ? [{ nombre: nombresDocs()[actual] || (meta ? meta.titulo : actual), secciones: visibles.map(function (x) { return { icono: x.s.icono, titulo: x.s.titulo, items: x.items }; }) }] : []);
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
    if (docs['REQ-PLANTILLAS']) docs.CITAS = documentoCitas(docs['REQ-PLANTILLAS']);
    var u = new URL(location.href), qUrl = u.searchParams.get('q');
    elegir(u.searchParams.get('doc') || actual);
    if (qUrl) { $('buscar').value = qUrl; pintar(); }
}

async function arrancar() {
    iniciarEncabezado();
    $('btn-imprimir').onclick = function () { window.print(); };
    $('btn-recargar').onclick = cargar;
    $('buscar').addEventListener('input', pintar);
    $('solo-doc').addEventListener('change', pintar);
    $('cw-copiar').addEventListener('click', copiarWa);
    $('frecuentes').innerHTML = '<span class="sub">Búsquedas frecuentes:</span>' + FRECUENTES.map(function (f) { return '<button type="button" class="chip-buscar" data-buscar="' + esc(f) + '">' + esc(f) + '</button>'; }).join('');
    $('frecuentes').addEventListener('click', function (e) { var b = e.target.closest('[data-buscar]'); if (b) { $('buscar').value = b.dataset.buscar; $('solo-doc').checked = false; pintar(); $('buscar').focus(); } });
    $('secciones').addEventListener('click', function (e) { var b = e.target.closest('[data-ir]'); if (b) irA(b.dataset.ir, b.dataset.sec); });
    $('docs').addEventListener('click', function (e) { var b = e.target.closest('button[data-doc]'); if (b) elegir(b.dataset.doc); });
    $('v-lista').onclick = function () { vista = 'lista'; pintar(); };
    $('v-mapa').onclick = function () { vista = 'mapa'; pintar(); };
    // Lista de chequeo: marcar un punto o empezar la sección de nuevo (se guarda en este equipo)
    $('secciones').addEventListener('change', function (e) {
        var c = e.target.closest('[data-chequeo]');
        if (!c) return;
        var m = marcados();
        if (c.checked) m[c.dataset.chequeo] = 1; else delete m[c.dataset.chequeo];
        guardarMarcados(m);
        var y = window.scrollY;
        pintar();
        window.scrollTo(0, y);
    });
    $('secciones').addEventListener('click', function (e) {
        var b = e.target.closest('[data-reiniciar]');
        if (!b) return;
        var m = marcados(), pre = actual + '|' + b.dataset.reiniciar + '|';
        Object.keys(m).forEach(function (k) { if (k.indexOf(pre) === 0) delete m[k]; });
        guardarMarcados(m);
        var y = window.scrollY;
        pintar();
        window.scrollTo(0, y);
    });
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
