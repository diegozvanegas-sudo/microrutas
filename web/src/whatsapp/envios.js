// programados.html: los envíos de WhatsApp programados (los de Informe, Despacho, Subsanaciones y los que se hacen aquí),
// con su estado, y «+ Programar mensaje» para cualquier texto o archivo. Lo envía la función «whatsapp» (migración 0020).
import '../subsanaciones/estilos.css';
import './envios.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { abrirProgramar, listarProgramados, cancelarProgramado } from './programar.js';
import { estadoWhatsapp } from './cliente.js';
import { ESTADO_NUMERO, ESTADOS, cuandoTexto } from './programados.js';

var filas = [], filtro = 'pendiente';
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function pintar() {
    var cuenta = {};
    filas.forEach(function (f) { cuenta[f.estado] = (cuenta[f.estado] || 0) + 1; });
    $('filtros').innerHTML = [['pendiente', 'Pendientes'], ['enviado', 'Enviados'], ['error', 'Con error'], ['cancelado', 'Cancelados'], ['', 'Todos']].map(function (x) {
        var n = x[0] ? cuenta[x[0]] || 0 : filas.length;
        return '<button type="button" class="envios-filtro" data-filtro="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' <span>' + n + '</span></button>';
    }).join('');
    var lista = filas.filter(function (f) { return !filtro || f.estado === filtro || (filtro === 'pendiente' && f.estado === 'enviando'); });
    if (filtro === 'pendiente') lista.sort(function (a, b) { return new Date(a.enviar_en) - new Date(b.enviar_en); });
    $('lista').innerHTML = lista.length ? lista.map(function (f) {
        return '<li class="envio ' + f.estado + '"><div class="envio-cab"><b>' + esc(cuandoTexto(new Date(f.enviar_en))) + '</b><span class="envio-est">' + (ESTADOS[f.estado] || f.estado) + '</span>' +
            (f.origen ? '<span class="sub">· ' + esc(f.origen) + '</span>' : '') + '</div>' +
            '<div class="envio-para">→ ' + esc(f.para_nombre || f.para) + (f.para_nombre ? ' <span class="sub">(' + esc(f.para) + ')</span>' : '') + '</div>' +
            '<pre class="envio-texto">' + esc(f.texto || '') + '</pre>' +
            (f.archivo_nombre ? '<div class="sub">📎 ' + esc(f.archivo_nombre) + '</div>' : '') +
            (f.error ? '<div class="envio-error">⚠ ' + esc(f.error) + '</div>' : '') +
            (f.enviado_en ? '<div class="sub">Enviado ' + esc(cuandoTexto(new Date(f.enviado_en))) + '</div>' : '') +
            (f.estado === 'pendiente' ? '<div class="envio-acc"><button type="button" class="secundario pequeno" data-cancelar="' + esc(f.id) + '">✕ Cancelar</button></div>' : '') + '</li>';
    }).join('') : '<li class="sub">' + (filtro === 'pendiente' ? 'No hay envíos pendientes. Use «+ Programar mensaje».' : 'No hay envíos en este grupo.') + '</li>';
}
async function cargar() {
    try {
        filas = await listarProgramados(200);
        $('estado').hidden = true; $('envios').hidden = false;
        pintar();
    } catch (e) {
        $('estado').hidden = false; $('estado').textContent = e.message;
        $('envios').hidden = false; filas = []; pintar();
    }
}
async function revisarServidor() {
    var c = $('servidor');
    c.className = 'envios-servidor'; c.textContent = 'Revisando el número de envío…';
    try {
        var e = await estadoWhatsapp();
        c.className = 'envios-servidor ' + (e.estado === 'open' ? 'ok' : 'aviso');
        c.textContent = e.estado === 'open' ? '✓ El número de envío está conectado.' : '⚠ El número de envío no está conectado (' + (ESTADO_NUMERO[e.estado] || e.estado) + '): los programados no salen hasta que se conecte (⋯ Más → 💬 WhatsApp).';
    } catch (x) {
        c.className = 'envios-servidor aviso';
        c.textContent = '⚠ El servidor de envío no responde: los programados quedan guardados y salen cuando funcione. (' + ((x && x.message) || '').slice(0, 140) + ')';
    }
}

async function arrancar() {
    iniciarEncabezado();
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    $('btn-salir').onclick = function () { cerrarSesion(supabase); };
    await aplicarPermisos(supabase, usuario);
    $('envios-nuevo').onclick = function () { abrirProgramar({ origen: 'Envíos programados', avisar: toast, alCambiar: cargar }); };
    $('btn-recargar').onclick = function () { cargar(); revisarServidor(); };
    $('filtros').onclick = function (ev) { var b = ev.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintar(); } };
    $('lista').onclick = async function (ev) {
        var b = ev.target.closest('[data-cancelar]');
        if (!b) return;
        b.disabled = true; b.textContent = 'Cancelando…';
        try { await cancelarProgramado(b.dataset.cancelar); toast('Envío cancelado.'); await cargar(); }
        catch (e) { toast(e.message); b.disabled = false; b.textContent = '✕ Cancelar'; }
    };
    await cargar();
    revisarServidor();
}
arrancar();
