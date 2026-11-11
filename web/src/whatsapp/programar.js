// Ventana «⏰ Programar envío» (la usan Informe, Despacho, Subsanaciones y 🗓️ Envíos programados): a quién, cuándo,
// el texto y un archivo opcional. Se guarda en whatsapp_programados (y el archivo en el almacenamiento privado); a la
// hora elegida lo manda el servidor aunque el celular y el computador estén apagados (función «whatsapp», migración 0020).
// abrirProgramar({ texto, origen, archivo }) → se abre vacía de lo anterior; lo que se recuerda es el último destino.
import './programar.css';
import { supabase } from '../supabase.js';
import { gruposWhatsapp, estadoWhatsapp } from './cliente.js';
import { ESTADO_NUMERO, ESTADOS, horaPorDefecto, aInputLocal, deInputLocal, destinoValido, validar, cuandoTexto, recordarDestino, nombreSeguro } from './programados.js';

var DESTINOS = 'wap_destinos', TABLA = 'whatsapp_programados', BUCKET = 'whatsapp-programados';
var dlg = null, archivo = null, origen = '', grupos = null, ocupado = false, alCambiar = null, avisoPagina = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no se recuerda */ } }
function q(sel) { return dlg.querySelector(sel); }
// Error de la base explicado en palabras
function motivo(e) {
    var m = (e && e.message) || String(e);
    if (/relation .*whatsapp_programados|does not exist|schema cache/i.test(m)) return 'Los envíos programados todavía no están activados en la base (falta la migración 0020). Pídaselo al administrador.';
    if (/bucket not found/i.test(m)) return 'Falta el almacenamiento de archivos de los envíos (migración 0020).';
    if (/row-level security|permission/i.test(m)) return 'Su usuario no tiene permiso para programar envíos. Revise que la sesión siga abierta.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión: no se pudo guardar. Intente de nuevo cuando tenga señal.';
    return m;
}

// ---------- Datos ----------
export async function programarEnvio(envio) {
    var yo = (await supabase.auth.getUser()).data.user;
    if (!yo) throw new Error('Inicie sesión para programar envíos.');
    var id = crypto.randomUUID(), ruta = null;
    if (envio.archivo) {
        ruta = yo.id + '/' + id + '/' + nombreSeguro(envio.nombreArchivo || envio.archivo.name);
        var sub = await supabase.storage.from(BUCKET).upload(ruta, envio.archivo, { contentType: envio.archivo.type || 'application/octet-stream', upsert: false });
        if (sub.error) throw new Error(motivo(sub.error));
    }
    var r = await supabase.from(TABLA).insert({
        id: id, para: destinoValido(envio.para), para_nombre: envio.paraNombre || '', texto: String(envio.texto || '').trim(),
        archivo_ruta: ruta, archivo_nombre: envio.archivo ? (envio.nombreArchivo || envio.archivo.name) : null,
        archivo_mime: envio.archivo ? (envio.archivo.type || 'application/octet-stream') : null,
        enviar_en: envio.enviarEn.toISOString(), origen: envio.origen || ''
    });
    if (r.error) {
        if (ruta) await supabase.storage.from(BUCKET).remove([ruta]);
        throw new Error(motivo(r.error));
    }
    return id;
}
export async function listarProgramados(limite) {
    var r = await supabase.from(TABLA).select('id, para, para_nombre, texto, archivo_nombre, enviar_en, origen, estado, intentos, error, enviado_en')
        .order('enviar_en', { ascending: false }).limit(limite || 30);
    if (r.error) throw new Error(motivo(r.error));
    return r.data || [];
}
export async function cancelarProgramado(id) {
    var r = await supabase.from(TABLA).update({ estado: 'cancelado' }).eq('id', id).eq('estado', 'pendiente').select('archivo_nombre');
    if (r.error) throw new Error(motivo(r.error));
    if (!r.data || !r.data.length) throw new Error('Ya no se puede cancelar: se está enviando o ya se envió.');
    // El archivo ya no se va a usar
    var yo = (await supabase.auth.getUser()).data.user, lista = await supabase.storage.from(BUCKET).list(yo.id + '/' + id);
    if (!lista.error && lista.data && lista.data.length) await supabase.storage.from(BUCKET).remove(lista.data.map(function (f) { return yo.id + '/' + id + '/' + f.name; }));
}

// ---------- Ventana ----------
function crear() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-wap';
    dlg.innerHTML = '<div class="cuerpo">' +
        '<h2>⏰ Programar envío por WhatsApp</h2>' +
        '<div class="sub">A la hora elegida lo envía el servidor, aunque el celular y el computador estén apagados.</div>' +
        '<div class="wap-servidor" id="wap-servidor"></div>' +
        '<div class="wap-campos">' +
        '<label>PARA <select id="wap-para"></select></label>' +
        '<div class="wap-otro" id="wap-otro" hidden><label>CELULAR O ID DEL GRUPO <input type="text" id="wap-para-id" placeholder="3001234567 o 1203630…@g.us" autocomplete="off"></label>' +
        '<label>NOMBRE (para reconocerlo) <input type="text" id="wap-para-nombre" placeholder="Grupo PQR corte césped" autocomplete="off"></label></div>' +
        '<label>DÍA Y HORA <input type="datetime-local" id="wap-cuando"></label>' +
        '<div class="wap-rapidas" id="wap-rapidas"></div>' +
        '<label class="wap-ancho">MENSAJE <textarea id="wap-texto" rows="8"></textarea></label>' +
        '<div class="wap-ancho wap-adjunto"><input type="file" id="wap-archivo" hidden>' +
        '<button type="button" class="secundario" id="wap-adjuntar">📎 Adjuntar archivo (PDF, imagen…)</button><span class="sub" id="wap-archivo-nombre"></span>' +
        '<button type="button" class="secundario" id="wap-quitar" hidden>Quitar</button></div>' +
        '</div>' +
        '<div class="wap-error" id="wap-error" hidden></div>' +
        '<details class="wap-lista" id="wap-lista"><summary>Mis envíos programados <span id="wap-cuenta"></span></summary><ul id="wap-items"></ul></details>' +
        '<div class="pie"><button type="button" class="secundario" id="wap-cerrar">Cerrar</button>' +
        '<button type="button" class="primario" id="wap-programar">⏰ Programar</button></div></div>';
    document.body.appendChild(dlg);
    q('#wap-cerrar').onclick = function () { dlg.close(); };
    dlg.addEventListener('cancel', function (ev) { if (ocupado) ev.preventDefault(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg && !ocupado) dlg.close(); });
    // Al cerrar se borra lo cargado (texto, archivo, mensajes); se recuerda solo el último destino
    dlg.addEventListener('close', function () {
        archivo = null; q('#wap-archivo').value = ''; q('#wap-texto').value = ''; q('#wap-error').hidden = true;
        q('#wap-archivo-nombre').textContent = ''; q('#wap-quitar').hidden = true;
    });
    q('#wap-para').onchange = function () { q('#wap-otro').hidden = this.value !== '__otro'; if (this.value === '__otro') q('#wap-para-id').focus(); };
    q('#wap-adjuntar').onclick = function () { q('#wap-archivo').value = ''; q('#wap-archivo').click(); };
    q('#wap-archivo').onchange = function () {
        archivo = this.files && this.files[0] || null;
        q('#wap-archivo-nombre').textContent = archivo ? archivo.name + ' · ' + Math.max(1, Math.round(archivo.size / 1024)) + ' KB' : '';
        q('#wap-quitar').hidden = !archivo;
    };
    q('#wap-quitar').onclick = function () { archivo = null; q('#wap-archivo').value = ''; q('#wap-archivo-nombre').textContent = ''; this.hidden = true; };
    q('#wap-rapidas').onclick = function (ev) {
        var b = ev.target.closest('[data-h]');
        if (b) q('#wap-cuando').value = aInputLocal(horaPorDefecto(null, +b.dataset.h, +b.dataset.m));
    };
    q('#wap-programar').onclick = programar;
    q('#wap-items').onclick = async function (ev) {
        var b = ev.target.closest('[data-cancelar]');
        if (!b) return;
        b.disabled = true;
        try { await cancelarProgramado(b.dataset.cancelar); await pintarLista(); if (alCambiar) alCambiar(); } catch (e) { mostrarError(e.message); b.disabled = false; }
    };
}
function mostrarError(t) { q('#wap-error').textContent = t; q('#wap-error').hidden = !t; }
function opcionesPara(ultimo) {
    var recientes = leer(DESTINOS, []), html = '';
    if (recientes.length) html += '<optgroup label="Usados hace poco">' + recientes.map(function (d) { return '<option value="' + esc(d.id) + '" data-nombre="' + esc(d.nombre) + '">' + esc(d.nombre) + '</option>'; }).join('') + '</optgroup>';
    var g = (grupos || []).filter(function (x) { return !recientes.some(function (r) { return r.id === x.id; }); });
    if (g.length) html += '<optgroup label="Grupos del número de envío">' + g.map(function (x) { return '<option value="' + esc(x.id) + '" data-nombre="' + esc(x.nombre) + '">' + esc(x.nombre) + '</option>'; }).join('') + '</optgroup>';
    html += '<option value="__otro">Otro: escribir el celular o el ID del grupo…</option>';
    q('#wap-para').innerHTML = (recientes.length || g.length ? '' : '<option value="">Elegir…</option>') + html;
    q('#wap-para').value = ultimo && Array.prototype.some.call(q('#wap-para').options, function (o) { return o.value === ultimo; }) ? ultimo : (recientes.length || g.length ? q('#wap-para').options[0].value : '');
    q('#wap-otro').hidden = q('#wap-para').value !== '__otro';
}
async function revisarServidor() {
    var caja = q('#wap-servidor');
    caja.className = 'wap-servidor'; caja.textContent = 'Revisando el número de envío…';
    try {
        var e = await estadoWhatsapp();
        if (e.estado === 'open') { caja.className = 'wap-servidor ok'; caja.textContent = '✓ El número de envío está conectado.'; }
        else { caja.className = 'wap-servidor aviso'; caja.textContent = '⚠ El número de envío no está conectado (' + (ESTADO_NUMERO[e.estado] || e.estado) + '). El mensaje queda guardado, pero solo sale si se conecta antes de la hora (⋯ Más → 💬 WhatsApp).'; }
        if (grupos === null) { try { grupos = await gruposWhatsapp(); opcionesPara(q('#wap-para').value); } catch (x) { grupos = []; } }
    } catch (x) {
        caja.className = 'wap-servidor aviso';
        caja.textContent = '⚠ El servidor de envío no responde (' + ((x && x.message) || 'sin respuesta').slice(0, 120) + '). Puede dejarlo programado: sale cuando el servidor funcione, si es antes de la hora.';
        grupos = grupos || [];
    }
}
async function pintarLista() {
    var ul = q('#wap-items');
    try {
        var filas = await listarProgramados(15), pend = filas.filter(function (f) { return f.estado === 'pendiente'; }).length;
        q('#wap-cuenta').textContent = filas.length ? '· ' + pend + (pend === 1 ? ' pendiente' : ' pendientes') : '· ninguno';
        ul.innerHTML = filas.length ? filas.map(function (f) {
            return '<li class="wap-item ' + f.estado + '"><div><b>' + esc(cuandoTexto(new Date(f.enviar_en))) + '</b> → ' + esc(f.para_nombre || f.para) +
                ' <span class="wap-est">' + (ESTADOS[f.estado] || f.estado) + '</span><br><span class="sub">' + esc((f.texto || '').slice(0, 90)) + (f.archivo_nombre ? ' 📎 ' + esc(f.archivo_nombre) : '') +
                (f.error ? '<br>⚠ ' + esc(f.error) : '') + '</span></div>' +
                (f.estado === 'pendiente' ? '<button type="button" class="secundario pequeno" data-cancelar="' + esc(f.id) + '">Cancelar</button>' : '') + '</li>';
        }).join('') : '<li class="sub">Todavía no hay envíos programados.</li>';
    } catch (e) { q('#wap-cuenta').textContent = ''; ul.innerHTML = '<li class="sub">' + esc(e.message) + '</li>'; }
}
async function programar() {
    var sel = q('#wap-para'), otro = sel.value === '__otro', opt = sel.options[sel.selectedIndex];
    var envio = {
        para: otro ? q('#wap-para-id').value : sel.value,
        paraNombre: otro ? q('#wap-para-nombre').value.trim() : (opt && opt.dataset.nombre) || '',
        texto: q('#wap-texto').value, archivo: archivo, enviarEn: deInputLocal(q('#wap-cuando').value), origen: origen
    };
    var errores = validar(envio);
    if (errores.length) return mostrarError(errores.join(' '));
    var b = q('#wap-programar');
    ocupado = true; b.disabled = true; b.textContent = envio.archivo ? 'Subiendo el archivo…' : 'Guardando…'; mostrarError('');
    try {
        await programarEnvio(envio);
        guardar(DESTINOS, recordarDestino(leer(DESTINOS, []), { id: envio.para, nombre: envio.paraNombre }));
        var aviso = '⏰ Programado para ' + cuandoTexto(envio.enviarEn) + ' → ' + (envio.paraNombre || envio.para) + '.';
        ocupado = false;
        dlg.close();
        if (alCambiar) alCambiar();
        avisar(aviso);
    } catch (e) { mostrarError(e.message); }
    finally { ocupado = false; b.disabled = false; b.textContent = '⏰ Programar'; }
}
// Aviso corto abajo con el toast de la página (opciones.avisar); si no lo dan, uno propio
function avisar(t) {
    if (avisoPagina) return avisoPagina(t);
    var el = document.getElementById('wap-aviso');
    if (!el) { el = document.createElement('div'); el.id = 'wap-aviso'; document.body.appendChild(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(avisar.t); avisar.t = setTimeout(function () { el.hidden = true; }, 4500);
}

// opciones: { texto, origen, archivo (File), alCambiar (se llama al programar o cancelar), avisar (el toast de la página) }
export function abrirProgramar(opciones) {
    opciones = opciones || {};
    if (!dlg) crear();
    origen = opciones.origen || '';
    alCambiar = opciones.alCambiar || null;
    avisoPagina = opciones.avisar || null;
    var recientes = leer(DESTINOS, []);
    opcionesPara(recientes[0] && recientes[0].id);
    q('#wap-para-id').value = ''; q('#wap-para-nombre').value = '';
    q('#wap-cuando').value = aInputLocal(horaPorDefecto());
    q('#wap-cuando').min = aInputLocal(new Date());
    var manana5 = horaPorDefecto(null, 5, 0);
    q('#wap-rapidas').innerHTML = '<button type="button" class="wap-rapida" data-h="5" data-m="0">' + esc(cuandoTexto(manana5).replace(/^./, function (c) { return c.toUpperCase(); })) + '</button>' +
        '<button type="button" class="wap-rapida" data-h="6" data-m="30">' + esc(cuandoTexto(horaPorDefecto(null, 6, 30)).replace(/^./, function (c) { return c.toUpperCase(); })) + '</button>' +
        '<button type="button" class="wap-rapida" data-h="18" data-m="0">' + esc(cuandoTexto(horaPorDefecto(null, 18, 0)).replace(/^./, function (c) { return c.toUpperCase(); })) + '</button>';
    q('#wap-texto').value = opciones.texto || '';
    archivo = opciones.archivo || null;
    q('#wap-archivo-nombre').textContent = archivo ? archivo.name : '';
    q('#wap-quitar').hidden = !archivo;
    mostrarError('');
    dlg.showModal();
    revisarServidor();
    pintarLista();
}
