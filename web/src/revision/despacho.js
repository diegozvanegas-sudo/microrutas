// despacho.html: reporte de Despacho por sección y turno. Se guarda solo, en Supabase (public.reportes_despacho,
// 0016_revisiones.sql) y en este equipo por si no hay señal.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, nombreDia, sumarDias, deIso } from '../diario/comun.js';
import { SECCIONES_DESPACHO, textoDespacho } from './comun.js';

var $ = function (id) { return document.getElementById(id); };
var fecha = hoy(), datos = {}, tGuardar = null, listo = false;

function clave() { return 'despacho_' + fecha; }
function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function fechaLarga() { return deIso(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); }
function pintarSecciones() {
    $('secciones').innerHTML = SECCIONES_DESPACHO.map(function (s) {
        var d = datos[s[0]] || {};
        return '<section class="tarjeta"><h2>' + esc(s[1]) + '</h2><div class="turnos">' + ['t1', 't2'].map(function (t, i) {
            return '<label class="bloque">Turno ' + (i + 1) +
                '<textarea rows="3" data-sec="' + s[0] + '" data-turno="' + t + '">' + esc(d[t] || '') + '</textarea>' +
                '<button type="button" class="chip" data-frase="' + s[0] + '" data-t="' + t + '">Sin novedad</button></label>';
        }).join('') + '</div></section>';
    }).join('');
}
function pintarReporte() {
    var texto = textoDespacho(datos, fechaLarga());
    $('vista-previa').textContent = texto || 'Escriba en una sección y aquí queda el reporte.';
    $('btn-copiar').disabled = !texto;
    $('btn-whatsapp').hidden = !texto;
    $('btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
}
function aviso(t) { $('guardado').textContent = t; }
async function enviar() {
    if (!configurado || !listo || !navigator.onLine) return aviso('📴 Guardado en este equipo');
    var res = await supabase.from('reportes_despacho').upsert({ fecha: fecha, datos: datos, actualizado: new Date().toISOString() }, { onConflict: 'usuario,fecha' });
    if (res.error) { console.error(res.error); return aviso('📴 Guardado en este equipo'); }
    try { localStorage.removeItem(clave() + '_sin_enviar'); } catch (e) {}
    aviso('✓ Guardado');
}
function cambio() {
    try { localStorage.setItem(clave(), JSON.stringify(datos)); localStorage.setItem(clave() + '_sin_enviar', '1'); } catch (e) {}
    pintarReporte();
    aviso('Guardando…');
    clearTimeout(tGuardar); tGuardar = setTimeout(enviar, 700);
}
async function cargarDia() {
    clearTimeout(tGuardar);
    $('dia-nombre').textContent = nombreDia(fecha);
    $('dia-fecha').value = fecha;
    var local = null, sinEnviar = false;
    try { local = JSON.parse(localStorage.getItem(clave())); sinEnviar = !!localStorage.getItem(clave() + '_sin_enviar'); } catch (e) {}
    datos = local || {};
    aviso(sinEnviar ? '📴 Guardado en este equipo' : '');
    pintarSecciones(); pintarReporte();
    if (!configurado || !listo) return;
    var pedido = fecha;
    var res = await supabase.from('reportes_despacho').select('datos').eq('fecha', fecha).eq('usuario', listo.id).maybeSingle();
    if (pedido !== fecha || res.error) return;
    // Lo escrito sin señal en este equipo manda sobre lo de la base, y se envía
    if (sinEnviar) return enviar();
    if (res.data) { datos = res.data.datos || {}; pintarSecciones(); pintarReporte(); }
}

async function arrancar() {
    iniciarEncabezado();
    $('secciones').addEventListener('input', function (ev) {
        var t = ev.target;
        if (!t.dataset.sec) return;
        (datos[t.dataset.sec] = datos[t.dataset.sec] || {})[t.dataset.turno] = t.value;
        cambio();
    });
    $('secciones').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-frase]');
        if (!b) return;
        ev.preventDefault();
        var s = SECCIONES_DESPACHO.find(function (x) { return x[0] === b.dataset.frase; });
        var area = b.parentNode.querySelector('textarea');
        area.value = s[2];
        (datos[s[0]] = datos[s[0]] || {})[b.dataset.t] = s[2];
        cambio();
    });
    var irA = function (f) { fecha = f; cargarDia(); };
    $('dia-antes').onclick = function () { irA(sumarDias(fecha, -1)); };
    $('dia-despues').onclick = function () { irA(sumarDias(fecha, 1)); };
    $('dia-fecha').onchange = function () { if (this.value) irA(this.value); };
    $('btn-copiar').onclick = function () {
        navigator.clipboard.writeText($('vista-previa').textContent).then(function () { toast('Reporte copiado.'); }, function () { toast('No se pudo copiar: seleccione el texto y cópielo.'); });
    };
    $('btn-recargar').onclick = cargarDia;
    window.addEventListener('online', function () { if (localStorage.getItem(clave() + '_sin_enviar')) enviar(); });
    cargarDia();
    if (!configurado) return aviso('Falta la conexión con Supabase (.env).');
    var usuario = await asegurarSesion(supabase);
    listo = usuario;
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
    cargarDia();
}

arrancar();
