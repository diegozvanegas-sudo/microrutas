// whatsapp.html: conexión del número de envío (Evolution API, carpeta evolution-api/), sus grupos y una prueba de envío.
// Todo pasa por el puente de Supabase (supabase/functions/whatsapp) con web/src/whatsapp/cliente.js.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { estadoWhatsapp, conectarWhatsapp, desconectarWhatsapp, gruposWhatsapp, enviarTexto, enviarArchivo } from './cliente.js';

var $ = function (id) { return document.getElementById(id); };
var grupos = [], admin = false, vigilar = null;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function plano(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(function () { toast('ID copiado'); });
}
// El puente aún no está publicado o no tiene las claves: se explica qué falta
function motivo(e) {
    var m = (e && e.message) || String(e);
    if (/Failed to send a request|Failed to fetch|not found|404/i.test(m)) return 'El puente de Supabase (función «whatsapp») no está publicado todavía. Vea evolution-api/README.md.';
    return m;
}

// ---------- Conexión ----------
var ESTADOS = {
    open: ['✓ Conectado', 'ok', 'El número está vinculado: la aplicación puede enviar mensajes.'],
    connecting: ['Esperando el QR', 'aviso', 'Escanee el código con el celular del número de envío.'],
    close: ['Desconectado', 'pend', 'Toque «Conectar (QR)» y escanee el código con el celular del número de envío.'],
    sin_instancia: ['Sin vincular', 'pend', 'Aún no se ha vinculado ningún número. Toque «Conectar (QR)».'],
};
function pintarEstado(e, error) {
    var d = error ? ['Sin conexión', 'pend', error] : ESTADOS[e] || [e || '…', 'aviso', 'Estado de Evolution: ' + e];
    $('estado-badge').textContent = d[0];
    $('estado-badge').className = 'badge ' + d[1];
    $('estado-ayuda').textContent = d[2];
    $('btn-desconectar').hidden = !admin || e !== 'open';
    $('btn-conectar').hidden = !admin || e === 'open';
    $('numero').hidden = $('btn-conectar').hidden;
    if (e === 'open') { $('qr-caja').hidden = true; parar(); }
}
async function revisar() {
    try { var d = await estadoWhatsapp(); pintarEstado(d.estado); return d.estado; } catch (e) { pintarEstado('', motivo(e)); return ''; }
}
function parar() { clearInterval(vigilar); vigilar = null; }
async function conectar() {
    $('btn-conectar').disabled = true;
    try {
        var d = await conectarWhatsapp($('numero').value);
        if (d.qr) { $('qr').src = d.qr.indexOf('data:') === 0 ? d.qr : 'data:image/png;base64,' + d.qr; }
        $('qr').hidden = !d.qr;
        $('qr-codigo').innerHTML = d.codigo ? '<br>O en «Vincular con el número de teléfono» escriba el código: <b class="codigo">' + esc(d.codigo) + '</b>' : '';
        $('qr-caja').hidden = !d.qr && !d.codigo;
        pintarEstado('connecting');
        // Se revisa cada 3 s hasta que quede vinculado (el QR vence en ~40 s: si vence, toque Conectar otra vez)
        parar();
        var veces = 0;
        vigilar = setInterval(async function () {
            if (++veces > 40) return parar();
            if (await revisar() === 'open') toast('✓ WhatsApp vinculado');
        }, 3000);
    } catch (e) {
        toast('No se pudo conectar: ' + motivo(e));
    } finally {
        $('btn-conectar').disabled = false;
    }
}

// ---------- Grupos ----------
function pintarGrupos() {
    var q = plano($('grupos-buscar').value.trim());
    var vis = grupos.filter(function (g) { return !q || plano(g.nombre).indexOf(q) >= 0; });
    $('grupos-cuenta').textContent = grupos.length ? vis.length + ' de ' + grupos.length : '';
    $('grupos').innerHTML = vis.map(function (g) {
        return '<div class="grupo-wa"><div><b>' + esc(g.nombre) + '</b><span class="sub">' + (g.miembros ? g.miembros + ' miembros · ' : '') + esc(g.id) + '</span></div>' +
            '<button type="button" class="secundario pequeno" data-copiar="' + esc(g.id) + '">📋 ID</button>' +
            '<button type="button" class="secundario pequeno" data-probar="' + esc(g.id) + '">✉️ Probar</button></div>';
    }).join('') || (grupos.length ? '<div class="vacio">Ningún grupo con ese nombre.</div>' : '');
}
async function cargarGrupos() {
    $('btn-grupos').disabled = true;
    $('grupos').innerHTML = '<div class="estado-carga">Cargando grupos…</div>';
    try { grupos = await gruposWhatsapp(); pintarGrupos(); if (!grupos.length) $('grupos').innerHTML = '<div class="vacio">El número no está en ningún grupo.</div>'; }
    catch (e) { $('grupos').innerHTML = '<div class="vacio">' + esc(motivo(e)) + '</div>'; }
    finally { $('btn-grupos').disabled = false; }
}

// ---------- Prueba de envío ----------
async function enviar() {
    var para = $('para').value.trim(), texto = $('mensaje').value.trim(), archivo = $('archivo').files[0];
    if (!para) return toast('Escriba el celular o elija un grupo.');
    if (!texto && !archivo) return toast('Escriba un mensaje o elija un archivo.');
    $('btn-enviar').disabled = true; $('btn-enviar').textContent = 'Enviando…';
    try {
        if (archivo) await enviarArchivo(para, archivo, archivo.name, texto); else await enviarTexto(para, texto);
        toast('✓ Enviado');
        $('archivo').value = '';
    } catch (e) {
        toast('No se envió: ' + motivo(e));
    } finally {
        $('btn-enviar').disabled = false; $('btn-enviar').textContent = 'Enviar';
    }
}

async function arrancar() {
    iniciarEncabezado();
    $('btn-estado').onclick = revisar;
    $('btn-conectar').onclick = conectar;
    $('btn-desconectar').onclick = async function () {
        if (!confirm('¿Desconectar el número? La aplicación no podrá enviar hasta que lo vincule otra vez.')) return;
        try { await desconectarWhatsapp(); toast('Número desconectado'); } catch (e) { toast('No se pudo: ' + motivo(e)); }
        revisar();
    };
    $('btn-grupos').onclick = cargarGrupos;
    $('grupos-buscar').addEventListener('input', pintarGrupos);
    $('grupos').onclick = function (ev) {
        var c = ev.target.closest('[data-copiar]'), p = ev.target.closest('[data-probar]');
        if (c) copiar(c.dataset.copiar);
        if (p) { $('para').value = p.dataset.probar; $('mensaje').focus(); $('mensaje').scrollIntoView({ block: 'center' }); }
    };
    $('btn-enviar').onclick = enviar;
    $('btn-recargar').onclick = revisar;
    if (!configurado) { pintarEstado('', 'Falta la conexión con Supabase (.env).'); return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').onclick = function () { cerrarSesion(supabase); };
    var permisos = await aplicarPermisos(supabase, usuario);
    admin = !!(permisos && permisos.admin);
    if (await revisar() === 'open') cargarGrupos();
}

arrancar();
