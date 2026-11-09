// buscar.html: una sola búsqueda por ruta, lote, radicado o texto en visitas, revisiones, PQR y pendientes.
// Cada quien encuentra lo que puede ver (las reglas de la base), y cada resultado lleva a su sección.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, nombreDia } from '../diario/comun.js';
import { filtroContiene, esNumeroLote, sinCeros } from './buscar.js';
import { TIPOS, nombreRevision, tieneNovedad } from '../revision/comun.js';
import { buscarEnDocumentos, documentoCitas } from '../contrato/busqueda.js';

var $ = function (id) { return document.getElementById(id); };
var TOPE = 50, pedido = 0, conContrato = false, docsContrato = null;
// Contrato, guía de campo, citas y ANS (solo para quien tiene el permiso): se traen una vez y se busca aquí mismo
var NOMBRES = { CESPED: '🌿 Corte de césped', 'GUIA-CAMPO': '🧭 Guía de campo', CITAS: '📨 Citas y ANS', PPSA: '📘 PPSA', 'RYT-FUDEA': '🚛 RyT FUDEA', 'LV-FUDEA': '🧹 LV FUDEA', 'RYT-FUNTRAEV': '🚛 RyT FUNTRAEV', 'LV-FUNTRAEV': '🧹 LV FUNTRAEV' };
async function documentosContrato() {
    if (docsContrato) return docsContrato;
    var r = await Promise.all([supabase.from('contrato_secciones').select('id, orden, icono, titulo, tipo, items'), supabase.from('convenio_secciones').select('documento, id, orden, icono, titulo, tipo, items')]);
    if (r[0].error && r[1].error) return null;
    var d = {};
    if (r[0].data) d.CESPED = r[0].data;
    (r[1].data || []).forEach(function (f) { (d[f.documento] = d[f.documento] || []).push(f); });
    if (d['REQ-PLANTILLAS']) { d.CITAS = documentoCitas(d['REQ-PLANTILLAS']); delete d['REQ-PLANTILLAS']; }
    Object.keys(d).forEach(function (c) { if (c.indexOf('MAPA-') === 0) delete d[c]; });
    docsContrato = d;
    return d;
}
async function grupoContrato(q) {
    var d = await documentosContrato();
    if (!d) return '';
    var r = buscarEnDocumentos(d, q, NOMBRES, Object.keys(NOMBRES)), n = 0;
    var filas = [];
    r.grupos.forEach(function (g) { g.secciones.forEach(function (s) { s.items.forEach(function (it) { if (n++ < 12) filas.push({ g: g, s: s, it: it }); }); }); });
    return '<section class="tarjeta"><h2>📜 Contrato y guía <span class="sub">' + r.total + '</span></h2>' +
        (filas.length ? filas.map(function (x) {
            return renglon('contrato.html?q=' + encodeURIComponent(q), (x.it.clave ? x.it.clave + ': ' : '') + String(x.it.t).slice(0, 160) + (String(x.it.t).length > 160 ? '…' : ''),
                [x.g.nombre, x.s.titulo, x.it.ref].filter(Boolean).join(' · '), '');
        }).join('') + (r.total > 12 ? '<a class="res" href="contrato.html?q=' + encodeURIComponent(q) + '"><span class="res-tit">Ver los ' + r.total + ' resultados en Contrato ›</span></a>' : '')
            : '<div class="sub">Sin resultados.</div>') + '</section>';
}

function consultas(q) {
    var num = esNumeroLote(q);
    var visitas = supabase.from('visitas').select('id, lote, microrruta, zona, cuadrilla, fecha_visita, estado, observaciones').order('fecha_visita', { ascending: false }).limit(TOPE + 1);
    // Lote exacto por número (también como código de microrruta o ID); si no, por texto
    visitas = num ? visitas.or('lote.eq.' + sinCeros(q) + ',lote.eq.' + q + ',' + filtroContiene(['id'], q)) : visitas.or(filtroContiene(['lote', 'microrruta', 'id', 'observaciones', 'interventor'], q));
    return [
        visitas,
        supabase.from('revisiones').select('*').or(filtroContiene(['ruta', 'control', 'novedad'], q)).order('fecha', { ascending: false }).limit(TOPE + 1),
        supabase.from('pqrs').select('id, radicado, fecha_pqr, nombre, direccion, barrio, estado').or(filtroContiene(['radicado', 'nombre', 'direccion', 'barrio', 'queja'], q)).order('creado', { ascending: false }).limit(TOPE + 1),
        supabase.from('pendientes').select('id, texto, fecha, hecho').ilike('texto', '%' + String(q).replace(/[\\%_]/g, '\\$&') + '%').order('creado', { ascending: false }).limit(TOPE + 1)
    ];
}
function grupo(titulo, res, fila) {
    if (res.error) return '<section class="tarjeta"><h2>' + titulo + '</h2><div class="aviso-error">No se pudo buscar aquí: ' + esc(res.error.message) + '</div></section>';
    var d = res.data || [];
    return '<section class="tarjeta"><h2>' + titulo + ' <span class="sub">' + (d.length > TOPE ? 'Más de ' + TOPE : d.length) + '</span></h2>' +
        (d.length ? d.slice(0, TOPE).map(fila).join('') : '<div class="sub">Sin resultados.</div>') +
        (d.length > TOPE ? '<div class="sub">Se ven los primeros ' + TOPE + '. Escriba algo más exacto.</div>' : '') + '</section>';
}
function renglon(href, titulo, detalle, marca) {
    return '<a class="res" href="' + esc(href) + '"><span class="res-tit">' + esc(titulo) + '</span>' + (marca ? ' <span class="res-marca">' + esc(marca) + '</span>' : '') +
        (detalle ? '<span class="sub res-det">' + esc(detalle) + '</span>' : '') + '</a>';
}
async function buscar() {
    var q = $('q').value.trim(), este = ++pedido;
    history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname);
    if (q.length < 2 && !esNumeroLote(q)) { $('resultados').innerHTML = ''; $('estado').textContent = 'Escriba al menos 2 letras, o un número de lote.'; return; }
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    $('estado').textContent = 'Buscando…';
    var r = await Promise.all(consultas(q)), contrato = conContrato ? await grupoContrato(q).catch(function () { return ''; }) : '';
    if (este !== pedido) return;
    var total = r.reduce(function (s, x) { return s + (x.data ? Math.min(x.data.length, TOPE) : 0); }, 0);
    var fallos = r.filter(function (x) { return x.error; }).length;
    $('estado').textContent = fallos === r.length ? 'No se pudo buscar. Revise la conexión.' : total + (total === 1 ? ' resultado' : ' resultados') + ' para «' + q + '»';
    $('resultados').innerHTML = contrato +
        grupo('📋 Visitas', r[0], function (v) {
            return renglon('subsanaciones.html?ver=' + encodeURIComponent(v.id), v.lote ? 'Lote ' + v.lote : v.microrruta || v.id,
                [v.lote ? v.microrruta : '', v.zona ? 'Zona ' + v.zona : '', v.cuadrilla ? 'Cuadrilla ' + v.cuadrilla : '', v.fecha_visita && nombreDia(v.fecha_visita), v.observaciones].filter(Boolean).join(' · '), v.estado);
        }) +
        grupo('✅ Revisiones', r[1], function (x) {
            return renglon('revision.html?buscar=' + encodeURIComponent(x.ruta), nombreRevision(x), [TIPOS[x.tipo], x.zona ? 'Zona ' + x.zona : '', nombreDia(x.fecha), x.turno, x.novedad].filter(Boolean).join(' · '), tieneNovedad(x) ? 'CON NOVEDAD' : 'SIN NOVEDAD');
        }) +
        grupo('📝 PQR', r[2], function (p) {
            return renglon('pqr.html?buscar=' + encodeURIComponent(p.radicado || p.direccion || p.nombre), p.radicado ? 'PQR ' + p.radicado : p.nombre || 'PQR', [p.nombre, p.direccion, p.barrio, p.fecha_pqr && nombreDia(p.fecha_pqr)].filter(Boolean).join(' · '), p.estado);
        }) +
        grupo('📌 Pendientes', r[3], function (x) {
            return renglon('pendientes.html', x.texto, x.fecha ? nombreDia(x.fecha) : '', x.hecho ? 'Hecho' : 'Pendiente');
        });
}

async function arrancar() {
    iniciarEncabezado();
    $('form').onsubmit = function (ev) { ev.preventDefault(); $('q').blur(); buscar(); };
    $('btn-recargar').onclick = buscar;
    var inicial = new URLSearchParams(location.search).get('q') || '';
    $('q').value = inicial;
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    var permisos = await aplicarPermisos(supabase, usuario);
    conContrato = !!(permisos && permisos.contrato);
    if (inicial) buscar(); else $('q').focus();
}

arrancar();
