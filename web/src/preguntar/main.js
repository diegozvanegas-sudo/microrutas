// preguntar.html: 🤖 Pregúntale a Claude. La pregunta se guarda en public.preguntas (0028) y la responde el trabajador del
// PC (scripts/asistente/trabajador.mjs) con Claude Code del plan, leyendo solo los datos que esta cuenta puede ver.
// Desde el celular queda en cola hasta que el PC esté prendido. Aquí: escribir, ver el estado y las respuestas, copiarlas,
// mandarlas por WhatsApp, seguir la conversación y borrarla.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { MODELOS, EJEMPLOS, motorPrendido, hayEnCurso, esc, textoWhatsapp, textoCuenta, htmlLista, textoMotor } from './comun.js';

var BORRADOR = 'preguntar_borrador', PREF = 'preguntar_modelo';
var preguntas = [], latido = null, hiloActual = null, modelo = 'rapido', sondeo = null, enviando = false, abiertas = {};
function leer(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: no pasa nada */ } }

function pintarMotor() {
    var on = motorPrendido(latido), c = $('preg-motor');
    c.className = 'preg-motor ' + (on ? 'on' : 'off');
    c.textContent = textoMotor(on);
}
function pintarModelos() {
    $('preg-modelos').innerHTML = MODELOS.map(function (m) {
        return '<button type="button" class="preg-chip" data-modelo="' + m[0] + '" aria-pressed="' + (modelo === m[0]) + '">' + m[1] + '</button>';
    }).join('');
}
function pintarHilo() {
    var h = hiloActual && preguntas.filter(function (p) { return p.hilo === hiloActual; })[0];
    $('preg-sigue').hidden = !h;
    if (h) $('preg-sigue-txt').textContent = 'Sigue la conversación: «' + h.texto.slice(0, 70) + (h.texto.length > 70 ? '…' : '') + '»';
}
function pintarLista() {
    $('preg-cuenta').textContent = textoCuenta(preguntas);
    $('preg-lista').innerHTML = htmlLista(preguntas, abiertas);
    pintarHilo();
}

async function cargar() {
    var r = await supabase.from('preguntas').select('*').order('creado', { ascending: false }).limit(150);
    if (r.error) {
        $('preg-aviso').hidden = false;
        $('preg-aviso').textContent = /preguntas/.test(r.error.message) && /exist|schema cache/i.test(r.error.message)
            ? 'Esta sección todavía no está activada en la base (falta la migración 0028). Avísele al administrador.'
            : 'No se pudieron leer sus preguntas: ' + r.error.message + '. Revise la conexión y toque ↻ Actualizar.';
        return;
    }
    $('preg-aviso').hidden = true;
    preguntas = r.data || [];
    var l = await supabase.from('asistente_latido').select('visto, info').eq('id', 'pc').maybeSingle();
    latido = l.data || null;
    pintarMotor(); pintarLista();
    programarSondeo();
}
// Con algo en curso se mira cada 5 s; si no, cada minuto (para el estado del PC)
function programarSondeo() {
    clearTimeout(sondeo);
    sondeo = setTimeout(function () { if (!document.hidden) cargar(); else programarSondeo(); }, hayEnCurso(preguntas) ? 5000 : 60000);
}

async function preguntar(texto, hilo, mod) {
    texto = String(texto || '').trim();
    if (!texto) { toast('Escriba la pregunta.'); return $('preg-texto').focus(); }
    if (texto.length > 4000) return toast('La pregunta es muy larga (máximo 4.000 letras). Resúmala o divídala.');
    if (enviando) return;
    enviando = true; $('preg-enviar').disabled = true; $('preg-enviar').textContent = 'Enviando…';
    var fila = { texto: texto, modelo: mod || modelo };
    if (hilo) fila.hilo = hilo;
    var r = await supabase.from('preguntas').insert(fila).select().single();
    enviando = false; $('preg-enviar').disabled = false; $('preg-enviar').textContent = 'Preguntar';
    if (r.error) return toast('No se pudo enviar la pregunta: ' + r.error.message + '. Su texto sigue ahí; intente de nuevo.');
    $('preg-texto').value = ''; guardar(BORRADOR, '');
    hiloActual = null;
    preguntas.unshift(r.data);
    pintarLista();
    toast(motorPrendido(latido) ? 'Pregunta enviada. El PC la está respondiendo.' : 'Pregunta en cola: se responde cuando el PC esté prendido.');
    programarSondeo();
}

async function arrancar() {
    iniciarEncabezado();
    $('preg-ejemplos').innerHTML = EJEMPLOS.map(function (e, i) { return '<button type="button" class="preg-chip ej" data-ejemplo="' + i + '">' + esc(e) + '</button>'; }).join('');
    modelo = leer(PREF, 'rapido') === 'fondo' ? 'fondo' : 'rapido';
    pintarModelos();
    $('preg-texto').value = leer(BORRADOR, '');
    if (!configurado) { $('preg-aviso').hidden = false; $('preg-aviso').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    $('btn-salir').onclick = function () { cerrarSesion(supabase); };
    await aplicarPermisos(supabase, usuario);

    $('preg-texto').oninput = function () { guardar(BORRADOR, $('preg-texto').value); };
    $('preg-texto').onkeydown = function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) preguntar($('preg-texto').value, hiloActual); };
    $('preg-enviar').onclick = function () { preguntar($('preg-texto').value, hiloActual); };
    $('preg-modelos').onclick = function (ev) { var b = ev.target.closest('[data-modelo]'); if (b) { modelo = b.dataset.modelo; guardar(PREF, modelo); pintarModelos(); } };
    $('preg-ejemplos').onclick = function (ev) { var b = ev.target.closest('[data-ejemplo]'); if (b) { $('preg-texto').value = EJEMPLOS[+b.dataset.ejemplo]; guardar(BORRADOR, $('preg-texto').value); $('preg-texto').focus(); } };
    $('preg-sigue-quitar').onclick = function () { hiloActual = null; pintarHilo(); };
    $('btn-recargar').onclick = cargar;
    $('preg-lista').onclick = async function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        var p = function (id) { return preguntas.filter(function (x) { return x.id === id; })[0]; };
        if (b.dataset.seguir) { hiloActual = b.dataset.seguir; pintarHilo(); $('preg-texto').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (b.dataset.plegar) { abiertas[b.dataset.plegar] = abiertas[b.dataset.plegar] === false; return pintarLista(); }
        if (b.dataset.copiar) {
            try { await navigator.clipboard.writeText(textoWhatsapp(p(b.dataset.copiar).respuesta)); toast('Respuesta copiada.'); }
            catch (e) { toast('No se pudo copiar: seleccione el texto y cópielo a mano.'); }
            return;
        }
        if (b.dataset.repetir) { var q = p(b.dataset.repetir); return preguntar(q.texto, q.hilo, q.modelo); }
        if (b.dataset.borrar) {
            // Dos toques: el primero pregunta, el segundo (en 4 s) borra
            if (!b.classList.contains('confirmar')) { b.classList.add('confirmar'); b.textContent = '¿Borrar? Toque otra vez'; setTimeout(function () { if (b.isConnected) { b.classList.remove('confirmar'); b.textContent = '🗑 Borrar'; } }, 4000); return; }
            b.disabled = true;
            var r = await supabase.from('preguntas').delete().eq('hilo', b.dataset.borrar);
            if (r.error) { b.disabled = false; return toast('No se pudo borrar: ' + r.error.message); }
            preguntas = preguntas.filter(function (x) { return x.hilo !== b.dataset.borrar; });
            if (hiloActual === b.dataset.borrar) hiloActual = null;
            pintarLista(); toast('Conversación borrada.');
        }
    };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cargar(); });
    await cargar();
}
arrancar();
