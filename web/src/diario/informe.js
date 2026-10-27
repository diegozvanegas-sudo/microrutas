// informe.html: "Reporte diario de actividades" de cada día, listo para copiar al grupo de WhatsApp.
// Se guarda solo al escribir en Supabase (public.informes, 0010_informe_pendientes.sql), una fila por usuario y fecha.
// Sugiere lo que ya quedó registrado ese día: visitas de subsanaciones, PQR visitados y pendientes marcados hechos.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, sumarDias, nombreDia, textoInforme, frasesVisitas, FRASES } from './comun.js';

var CACHE = 'informes_cache', PREF_FECHA = 'informe_con_fecha';
var $ = function (id) { return document.getElementById(id); };
var usuario = null, fecha = hoy(), actividades = [], sugerencias = [], historial = [], descartadas = {};
var copia = {};   // { 'aaaa-mm-dd': [actividades] } la última copia en el equipo, para abrir sin señal

function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto).then(function () { toast('Copiado: péguelo en el grupo.'); });
    var a = document.createElement('textarea');
    a.value = texto; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); toast('Copiado: péguelo en el grupo.'); } catch (e) { toast('No se pudo copiar: selecciónelo a mano.'); }
    a.remove();
    return Promise.resolve();
}
function guardarCopia() { try { localStorage.setItem(CACHE, JSON.stringify(copia)); } catch (e) {} }
function alto(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

// ---------- Actividades ----------
function pintarActividades() {
    $('estado').hidden = true;
    $('actividades').innerHTML = actividades.length ? actividades.map(function (a, i) {
        return '<div class="actividad" data-i="' + i + '"><span class="check" aria-hidden="true">✅</span>' +
            '<textarea rows="1" aria-label="Actividad ' + (i + 1) + '">' + esc(a) + '</textarea>' +
            '<span class="mover">' +
            (i > 0 ? '<button type="button" class="icono" data-subir title="Subir" aria-label="Subir">↑</button>' : '') +
            '<button type="button" class="icono quitar" data-quitar title="Quitar" aria-label="Quitar">×</button></span></div>';
    }).join('') : '<div class="vacio">Aún no hay actividades para este día. Agréguelas abajo o tome las sugeridas.</div>';
    $('actividades').querySelectorAll('textarea').forEach(alto);
    pintarSugerencias();
    pintarVista();
}
function pintarVista() {
    var texto = textoInforme(actividades, { fecha: $('con-fecha').checked ? fecha : '' });
    $('vista-previa').textContent = actividades.some(function (a) { return a.trim(); }) ? texto : 'Agregue actividades y aquí queda el mensaje para el grupo.';
    $('btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
}

function pintarSugerencias() {
    var ya = actividades.map(function (a) { return a.trim(); });
    var vis = sugerencias.filter(function (s) { return ya.indexOf(s.texto) < 0 && !descartadas[fecha + '|' + s.texto]; });
    $('sugerencias').innerHTML = vis.length ? '<p class="sub titulo-sugeridas">Sugeridas con lo que quedó registrado este día:</p>' + vis.map(function (s, i) {
        return '<div class="sugerencia"><span>' + esc(s.texto) + '<span class="origen">' + esc(s.origen) + '</span></span>' +
            '<button type="button" class="secundario pequeno" data-tomar="' + i + '">＋ Agregar</button>' +
            '<button type="button" class="icono quitar" data-descartar="' + i + '" title="No sugerir" aria-label="No sugerir">×</button></div>';
    }).join('') : '';
    pintarSugerencias.vis = vis;
}

// Guardado solo, un momento después de dejar de escribir
var espera = null;
function programarGuardado() {
    $('guardado').textContent = 'Sin guardar…';
    clearTimeout(espera);
    espera = setTimeout(guardar, 900);
}
async function guardar() {
    clearTimeout(espera); espera = null;
    var f = fecha, lista = actividades.map(function (a) { return a.trim(); }).filter(Boolean);
    copia[f] = lista;
    guardarCopia();
    if (!usuario) return;
    var res = await supabase.from('informes').upsert({ usuario: usuario.id, fecha: f, actividades: lista, actualizado: new Date().toISOString() }, { onConflict: 'usuario,fecha' });
    if (res.error) { $('guardado').textContent = '⚠ Sin guardar'; return toast('No se guardó el informe: ' + res.error.message); }
    if (f === fecha) $('guardado').textContent = '✓ Guardado';
    var h = historial.find(function (x) { return x.fecha === f; });
    if (h) h.n = lista.length; else historial.push({ fecha: f, n: lista.length });
    pintarHistorial();
}
function agregar(texto) {
    texto = String(texto || '').trim();
    if (!texto) return false;
    actividades.push(texto);
    pintarActividades();
    programarGuardado();
    return true;
}

// ---------- Día ----------
async function abrirDia(f) {
    if (espera) await guardar();
    fecha = f;
    $('dia-fecha').value = f;
    $('dia-nombre').textContent = nombreDia(f);
    $('dia-despues').disabled = f >= sumarDias(hoy(), 1);
    $('guardado').textContent = '';
    actividades = (copia[f] || []).slice();
    sugerencias = [];
    pintarActividades();
    pintarHistorial();
    if (!usuario) return;
    var res = await supabase.from('informes').select('actividades').eq('usuario', usuario.id).eq('fecha', f).maybeSingle();
    if (f !== fecha) return;
    if (res.error) {
        if (/informes/.test(res.error.message) && /exist|schema/i.test(res.error.message)) toast('Falta crear la tabla del informe en Supabase (migración 0010_informe_pendientes.sql).');
        else toast('Sin conexión: se muestra la última copia. ' + res.error.message);
    } else if (!espera) {
        actividades = (res.data && res.data.actividades) || [];
        copia[f] = actividades.slice();
        guardarCopia();
        pintarActividades();
    }
    cargarSugerencias(f);
}

// Lo que ya está registrado ese día en la app: cada fuente por aparte, si una falla las otras igual salen
async function cargarSugerencias(f) {
    var [vis, pqr, pend] = await Promise.all([
        supabase.from('visitas').select('tipo, cuadrilla, estado').eq('creado_por', usuario.id).eq('fecha_visita', f),
        supabase.from('pqrs').select('radicado, barrio, direccion').eq('usuario', usuario.id).eq('visita->>fechaVisita', f),
        supabase.from('pendientes').select('texto').eq('usuario', usuario.id).eq('hecho_en', f),
    ]);
    if (f !== fecha) return;
    var lista = [];
    if (!vis.error) frasesVisitas(vis.data).forEach(function (t) { lista.push({ texto: t, origen: '📋 ' + vis.data.length + ' visita(s) en Subsanaciones' }); });
    if (!pqr.error) pqr.data.forEach(function (p) {
        lista.push({ texto: 'Se realizó visita de inspección para verificar la PQRS' + (p.radicado ? ' ' + p.radicado : '') +
            (p.barrio ? ' en el barrio ' + p.barrio : p.direccion ? ' en ' + p.direccion : '') + '.', origen: '📝 PQR' });
    });
    if (!pend.error) pend.data.forEach(function (p) {
        var t = p.texto.trim();
        lista.push({ texto: t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.'), origen: '📌 Pendiente hecho' });
    });
    sugerencias = lista;
    pintarSugerencias();
}

function pintarHistorial() {
    var dias = historial.filter(function (x) { return x.n; }).sort(function (a, b) { return b.fecha.localeCompare(a.fecha); }).slice(0, 21);
    $('historial').innerHTML = dias.length ? dias.map(function (x) {
        return '<button type="button" data-fecha="' + esc(x.fecha) + '"' + (x.fecha === fecha ? ' aria-current="true"' : '') + '>' +
            esc(nombreDia(x.fecha)) + ' <small>' + x.n + '</small></button>';
    }).join('') : '<span class="sub">Aún no hay informes guardados.</span>';
}
async function cargarHistorial() {
    var res = await supabase.from('informes').select('fecha, actividades').eq('usuario', usuario.id).order('fecha', { ascending: false }).limit(60);
    historial = res.error
        ? Object.keys(copia).map(function (f) { return { fecha: f, n: copia[f].length }; })
        : res.data.map(function (x) { return { fecha: x.fecha, n: (x.actividades || []).length }; });
    pintarHistorial();
}

// ---------- Inicio ----------
async function arrancar() {
    iniciarEncabezado();
    try { copia = JSON.parse(localStorage.getItem(CACHE)) || {}; } catch (e) { copia = {}; }
    try { $('con-fecha').checked = localStorage.getItem(PREF_FECHA) === '1'; } catch (e) {}

    $('frases').innerHTML = FRASES.map(function (f, i) { return '<button type="button" class="chip" data-frase="' + i + '">' + esc(f.t) + '</button>'; }).join('');
    $('frases').onclick = function (ev) {
        var b = ev.target.closest('[data-frase]');
        if (!b) return;
        var t = FRASES[+b.dataset.frase].texto, k = t.indexOf('…'), caja = $('nueva');
        caja.value = t;
        caja.focus();
        // Queda seleccionado el "…" para escribir encima lo que falta (cuadrillas, zona)
        if (k >= 0) caja.setSelectionRange(k, k + 1);
    };
    $('btn-agregar').onclick = function () {
        if (agregar($('nueva').value)) $('nueva').value = '';
        else { $('nueva').focus(); toast('Escriba la actividad.'); }
    };
    $('nueva').addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) $('btn-agregar').click(); });

    $('actividades').addEventListener('input', function (ev) {
        var fila = ev.target.closest('[data-i]');
        if (!fila || ev.target.tagName !== 'TEXTAREA') return;
        actividades[+fila.dataset.i] = ev.target.value;
        alto(ev.target);
        pintarVista();
        programarGuardado();
    });
    $('actividades').addEventListener('click', function (ev) {
        var fila = ev.target.closest('[data-i]'), i = fila ? +fila.dataset.i : -1;
        if (i < 0) return;
        if (ev.target.closest('[data-quitar]')) { actividades.splice(i, 1); pintarActividades(); programarGuardado(); }
        if (ev.target.closest('[data-subir]')) { actividades.splice(i - 1, 0, actividades.splice(i, 1)[0]); pintarActividades(); programarGuardado(); }
    });
    $('sugerencias').addEventListener('click', function (ev) {
        var vis = pintarSugerencias.vis || [], t = ev.target.closest('[data-tomar]'), d = ev.target.closest('[data-descartar]');
        if (t) agregar(vis[+t.dataset.tomar].texto);
        if (d) { descartadas[fecha + '|' + vis[+d.dataset.descartar].texto] = 1; pintarSugerencias(); }
    });

    $('dia-antes').onclick = function () { abrirDia(sumarDias(fecha, -1)); };
    $('dia-despues').onclick = function () { abrirDia(sumarDias(fecha, 1)); };
    $('dia-fecha').onchange = function () { if (this.value) abrirDia(this.value); };
    $('historial').onclick = function (ev) { var b = ev.target.closest('[data-fecha]'); if (b) { abrirDia(b.dataset.fecha); window.scrollTo(0, 0); } };
    $('con-fecha').onchange = function () { try { localStorage.setItem(PREF_FECHA, this.checked ? '1' : ''); } catch (e) {} pintarVista(); };
    $('btn-copiar').onclick = function () {
        if (!actividades.some(function (a) { return a.trim(); })) return toast('El informe está vacío.');
        copiar(textoInforme(actividades, { fecha: $('con-fecha').checked ? fecha : '' }));
    };
    $('btn-whatsapp').onclick = function (ev) { if (!actividades.some(function (a) { return a.trim(); })) { ev.preventDefault(); toast('El informe está vacío.'); } };
    // Si se cierra la página con algo sin guardar, al menos queda la copia en el equipo
    window.addEventListener('pagehide', function () { if (espera) { copia[fecha] = actividades.filter(function (a) { return a.trim(); }); guardarCopia(); } });

    $('btn-recargar').onclick = function () { abrirDia(fecha); if (usuario) cargarHistorial(); };
    abrirDia(fecha);
    if (!configurado) { $('estado').hidden = false; $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
    abrirDia(fecha);
    cargarHistorial();
}

arrancar();
