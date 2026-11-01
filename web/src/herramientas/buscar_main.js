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

var $ = function (id) { return document.getElementById(id); };
var TOPE = 50, pedido = 0;

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
    var r = await Promise.all(consultas(q));
    if (este !== pedido) return;
    var total = r.reduce(function (s, x) { return s + (x.data ? Math.min(x.data.length, TOPE) : 0); }, 0);
    var fallos = r.filter(function (x) { return x.error; }).length;
    $('estado').textContent = fallos === r.length ? 'No se pudo buscar. Revise la conexión.' : total + (total === 1 ? ' resultado' : ' resultados') + ' para «' + q + '»';
    $('resultados').innerHTML =
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
    aplicarPermisos(supabase, usuario);
    if (inicial) buscar(); else $('q').focus();
}

arrancar();
