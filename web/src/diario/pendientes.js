// pendientes.html: lo que queda por hacer, por día y momento (mañana / tarde). Se anota como se escribe en el grupo,
// un pendiente por renglón. Se guarda en Supabase (public.pendientes, 0010_informe_pendientes.sql), cada quien los suyos.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, sumarDias, nombreDia, diaPorDefecto, leerPendientes, MOMENTOS } from './comun.js';

var CACHE = 'pendientes_cache';
var $ = function (id) { return document.getElementById(id); };
var pendientes = [], usuario = null, dia = 'hoy', momento = '', editando = null;
var ORDEN_MOMENTO = { manana: 0, tarde: 1, '': 2 };

function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function guardarCopia() { try { localStorage.setItem(CACHE, JSON.stringify(pendientes)); } catch (e) {} }

// ---------- Anotar ----------
function diaElegido() { return dia === 'hoy' ? hoy() : dia === 'manana' ? sumarDias(hoy(), 1) : dia; }
function marcarOpciones() {
    $('g-dia').querySelectorAll('[data-dia]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.dia === dia); });
    $('g-momento').querySelectorAll('[data-momento]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.momento === momento); });
    $('otro-dia').value = dia === 'hoy' || dia === 'manana' ? '' : dia;
}
function leidos() {
    return leerPendientes($('nuevo').value, diaElegido()).map(function (p) { if (!p.momento) p.momento = momento; return p; });
}
function pintarPrevia() {
    var lista = leidos();
    $('previa').innerHTML = lista.length > 1 || (lista[0] && (lista[0].momento || lista[0].fecha !== diaElegido()))
        ? lista.map(function (p) { return '<div>' + esc(nombreDia(p.fecha)) + (p.momento ? ' · ' + MOMENTOS[p.momento] : '') + ' — <b>' + esc(p.texto) + '</b></div>'; }).join('')
        : '';
}
async function agregar() {
    var lista = leidos();
    if (!lista.length) { $('nuevo').focus(); return toast('Escriba el pendiente.'); }
    $('btn-agregar').disabled = true;
    var res = await supabase.from('pendientes').insert(lista).select();
    $('btn-agregar').disabled = false;
    if (res.error) return toast('No se guardó: ' + res.error.message);
    pendientes = pendientes.concat(res.data);
    guardarCopia();
    $('nuevo').value = '';
    pintarPrevia();
    pintar();
    toast(lista.length === 1 ? 'Pendiente anotado para ' + nombreDia(lista[0].fecha).toLowerCase() + '.' : lista.length + ' pendientes anotados.');
}

// ---------- Lista ----------
function ordenar(a, b) {
    return (a.fecha || '9999').localeCompare(b.fecha || '9999') || ORDEN_MOMENTO[a.momento] - ORDEN_MOMENTO[b.momento] || String(a.creado).localeCompare(String(b.creado));
}
function item(p, conDia) {
    var h = hoy(), tardeYa = !p.hecho && p.fecha === h && p.momento === 'manana' && new Date().getHours() >= 12;
    var etiquetas = (conDia && p.fecha ? '<span class="etiqueta">' + esc(nombreDia(p.fecha)) + '</span>' : '') +
        (p.momento ? '<span class="etiqueta ' + (tardeYa ? 'tarde-ya' : p.momento) + '">' + MOMENTOS[p.momento] + '</span>' : '');
    var texto = editando === p.id
        ? '<input class="editar" value="' + esc(p.texto) + '" aria-label="Cambiar el pendiente" enterkeyhint="done">'
        : esc(p.texto) + etiquetas;
    return '<div class="pend' + (p.hecho ? ' hecho' : '') + '" data-id="' + esc(p.id) + '">' +
        '<input type="checkbox" data-hecho' + (p.hecho ? ' checked' : '') + ' aria-label="Hecho">' +
        '<span class="texto" data-editar title="Tocar para cambiar el texto">' + texto + '</span>' +
        '<span class="botones">' +
        (p.hecho ? '' : '<button type="button" class="icono" data-posponer title="Pasar al día siguiente" aria-label="Pasar al día siguiente">↷</button>') +
        '<button type="button" class="icono quitar" data-eliminar title="Eliminar" aria-label="Eliminar">×</button></span></div>';
}
function grupo(clase, titulo, lista, conDia) {
    if (!lista.length) return '';
    return '<section class="grupo-pend ' + clase + '"><h3>' + titulo + ' <span class="sub">' + lista.length + '</span></h3>' +
        lista.map(function (p) { return item(p, conDia); }).join('') + '</section>';
}
function pintar() {
    var h = hoy(), m = sumarDias(h, 1), abiertos = pendientes.filter(function (p) { return !p.hecho; }).sort(ordenar);
    var hechos = pendientes.filter(function (p) { return p.hecho && p.hecho_en >= sumarDias(h, -14); })
        .sort(function (a, b) { return String(b.hecho_en).localeCompare(String(a.hecho_en)); });
    var en = function (f) { return abiertos.filter(f); };
    var html =
        grupo('atrasado', '⚠️ Atrasados', en(function (p) { return p.fecha && p.fecha < h; }), true) +
        grupo('hoy', '📍 Hoy', en(function (p) { return p.fecha === h; })) +
        grupo('', 'Mañana', en(function (p) { return p.fecha === m; })) +
        grupo('', 'Más adelante', en(function (p) { return p.fecha > m; }), true) +
        grupo('', 'Sin día', en(function (p) { return !p.fecha; }));
    if (hechos.length) {
        html += '<details class="hechos"><summary>✓ Hechos en las últimas dos semanas (' + hechos.length + ')</summary>' +
            hechos.map(function (p) { return item(p, true); }).join('') + '</details>';
    }
    $('estado').hidden = !!abiertos.length;
    if (!abiertos.length) $('estado').textContent = pendientes.length ? '🎉 Nada pendiente.' : 'Aún no hay pendientes. Anote arriba lo que queda por hacer.';
    var abierto = document.querySelector('details.hechos');
    $('lista').innerHTML = html;
    if (abierto && abierto.open && document.querySelector('details.hechos')) document.querySelector('details.hechos').open = true;
    var ed = $('lista').querySelector('.editar');
    if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
}

async function cambiar(p, cambios, aviso) {
    var antes = Object.assign({}, p);
    Object.assign(p, cambios);
    pintar();
    var res = await supabase.from('pendientes').update(cambios).eq('id', p.id);
    if (res.error) { Object.assign(p, antes); pintar(); return toast('No se guardó: ' + res.error.message); }
    guardarCopia();
    if (aviso) toast(aviso);
}
async function eliminar(p) {
    if (!confirm('¿Eliminar «' + p.texto + '»?')) return;
    var res = await supabase.from('pendientes').delete().eq('id', p.id);
    if (res.error) return toast('No se eliminó: ' + res.error.message);
    pendientes = pendientes.filter(function (x) { return x.id !== p.id; });
    guardarCopia();
    pintar();
}
function terminarEdicion(guardar) {
    var input = $('lista').querySelector('.editar'), p = pendientes.find(function (x) { return x.id === editando; });
    editando = null;
    if (guardar && p && input && input.value.trim() && input.value.trim() !== p.texto) cambiar(p, { texto: input.value.trim() });
    else pintar();
}

async function cargar() {
    $('estado').hidden = false;
    $('estado').textContent = 'Cargando…';
    var res = await supabase.from('pendientes').select('*').eq('usuario', usuario.id);
    if (res.error) {
        try { pendientes = JSON.parse(localStorage.getItem(CACHE)) || []; } catch (e) { pendientes = []; }
        pintar();
        if (/pendientes/.test(res.error.message) && /exist|schema/i.test(res.error.message)) toast('Falta crear la tabla de pendientes en Supabase (migración 0010_informe_pendientes.sql).');
        else toast('Sin conexión: se muestra la última copia. ' + res.error.message);
        return;
    }
    pendientes = res.data;
    guardarCopia();
    pintar();
}

// ---------- Inicio ----------
async function arrancar() {
    iniciarEncabezado();
    dia = diaPorDefecto() === hoy() ? 'hoy' : 'manana';
    marcarOpciones();
    $('g-dia').onclick = function (ev) { var b = ev.target.closest('[data-dia]'); if (b) { dia = b.dataset.dia; marcarOpciones(); pintarPrevia(); } };
    $('otro-dia').onchange = function () { dia = this.value || 'hoy'; marcarOpciones(); pintarPrevia(); };
    $('g-momento').onclick = function (ev) { var b = ev.target.closest('[data-momento]'); if (b) { momento = b.dataset.momento; marcarOpciones(); pintarPrevia(); } };
    $('nuevo').addEventListener('input', pintarPrevia);
    // Ctrl+Enter agrega; Enter solo hace otro renglón (otro pendiente)
    $('nuevo').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) agregar(); });
    $('btn-agregar').onclick = agregar;

    var de = function (ev) { var f = ev.target.closest('[data-id]'); return f && pendientes.find(function (p) { return p.id === f.dataset.id; }); };
    $('lista').addEventListener('change', function (ev) {
        var p = de(ev);
        if (!p || !ev.target.matches('[data-hecho]')) return;
        var hecho = ev.target.checked;
        cambiar(p, { hecho: hecho, hecho_en: hecho ? hoy() : null }, hecho ? '✓ Hecho. Aparece en el informe de hoy.' : '');
    });
    $('lista').addEventListener('click', function (ev) {
        var p = de(ev);
        if (!p) return;
        if (ev.target.closest('[data-eliminar]')) return eliminar(p);
        if (ev.target.closest('[data-posponer]')) {
            var nueva = !p.fecha || p.fecha < hoy() ? hoy() : sumarDias(p.fecha, 1);
            return cambiar(p, { fecha: nueva }, 'Pasado a ' + nombreDia(nueva).toLowerCase() + '.');
        }
        if (ev.target.closest('[data-editar]') && !p.hecho && editando !== p.id) { editando = p.id; pintar(); }
    });
    $('lista').addEventListener('keydown', function (ev) {
        if (!ev.target.matches('.editar')) return;
        if (ev.key === 'Enter') { ev.preventDefault(); terminarEdicion(true); }
        if (ev.key === 'Escape') terminarEdicion(false);
    });
    $('lista').addEventListener('focusout', function (ev) { if (ev.target.matches('.editar') && editando) terminarEdicion(true); });

    $('btn-recargar').onclick = cargar;
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
    cargar();
}

arrancar();
