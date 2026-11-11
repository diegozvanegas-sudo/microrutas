// despacho.html: reporte de Despacho por sección y turno. Se guarda solo, en Supabase (public.reportes_despacho,
// 0016_revisiones.sql) y en este equipo por si no hay señal.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, nombreDia, sumarDias, deIso } from '../diario/comun.js';
import { SECCIONES_DESPACHO, ALIADOS, filaVolqueta, resumenVolquetas, textoDespacho } from './comun.js';
import { abrirProgramar } from '../whatsapp/programar.js';

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
// ---------- Tabla de volquetas por turno ----------
function tablaTurno(t) {
    var tablas = datos.tabla_volquetas = datos.tabla_volquetas || {};
    return tablas[t] = tablas[t] || { programadas: '', filas: [] };
}
function celda(campo, valor, tipo, ancho) {
    return '<td><input data-v="' + campo + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '" aria-label="' + campo + '"' + (ancho ? ' style="min-width:' + ancho + 'px"' : '') + '></td>';
}
function textoResumen(t) {
    var r = resumenVolquetas(tablaTurno(t));
    return { desp: r.despachadas, cumpl: r.cumplimiento === null ? '—' : String(r.cumplimiento).replace('.', ',') + ' %', ok: r.cumplimiento === null ? '' : r.cumplimiento >= 100 ? 'ok' : 'falta', auto: r.programadas };
}
function pintarVolquetas() {
    $('volquetas').innerHTML = '<h2>🚛 Despacho de volquetas</h2>' + [['t1', 'Turno 1'], ['t2', 'Turno 2']].map(function (x) {
        var t = tablaTurno(x[0]), r = textoResumen(x[0]);
        return '<div class="tabla-volq" data-t="' + x[0] + '"><div class="volq-cab"><b>' + x[1] + '</b><button type="button" class="secundario pequeno" data-mas-fila>+ Fila</button></div>' +
            (t.filas.length ? '<div class="volq-scroll"><table><thead><tr><th>Zona</th><th>Servicio</th><th>Control</th><th>Hora inicio</th><th>Hora fin</th><th>Conductor</th><th>Supervisor</th><th>Aliado</th><th>Novedad</th><th></th></tr></thead><tbody>' +
                t.filas.map(function (f, i) {
                    return '<tr data-i="' + i + '">' + celda('zona', f.zona, 'text', 56) + celda('servicio', f.servicio, 'text', 170) + celda('control', f.control, 'text', 70) +
                        celda('inicio', f.inicio, 'time', 96) + celda('fin', f.fin, 'time', 96) + celda('conductor', f.conductor, 'text', 150) + celda('supervisor', f.supervisor, 'text', 150) +
                        '<td><input data-v="aliado" list="aliados" value="' + esc(f.aliado) + '" aria-label="aliado" style="min-width:100px"></td>' + celda('novedad', f.novedad, 'text', 170) +
                        '<td><button type="button" class="quitar" data-quitar-fila aria-label="Quitar fila">×</button></td></tr>';
                }).join('') + '</tbody></table></div>' +
                '<div class="volq-totales"><label>Rutas programadas <input data-prog inputmode="numeric" value="' + esc(t.programadas) + '" placeholder="' + r.auto + '"></label>' +
                    '<span>Rutas despachadas <b data-desp>' + r.desp + '</b></span>' +
                    '<span>Cumplimiento <b class="cumpl ' + r.ok + '" data-cumpl>' + r.cumpl + '</b></span></div>'
                : '<div class="sub">Sin filas.</div>') + '</div>';
    }).join('') + '<datalist id="aliados">' + ALIADOS.map(function (a) { return '<option value="' + a + '">'; }).join('') + '</datalist>';
}
function iniciarVolquetas() {
    $('volquetas').addEventListener('input', function (ev) {
        var el = ev.target, caja = el.closest('[data-t]');
        if (!caja) return;
        var t = tablaTurno(caja.dataset.t);
        if (el.dataset.v) t.filas[+el.closest('tr').dataset.i][el.dataset.v] = el.value;
        else if (el.hasAttribute('data-prog')) t.programadas = el.value;
        else return;
        var r = textoResumen(caja.dataset.t), cumpl = caja.querySelector('[data-cumpl]');
        caja.querySelector('[data-desp]').textContent = r.desp;
        cumpl.textContent = r.cumpl; cumpl.className = 'cumpl ' + r.ok;
        caja.querySelector('[data-prog]').placeholder = r.auto;
        cambio();
    });
    $('volquetas').addEventListener('click', function (ev) {
        var caja = ev.target.closest('[data-t]');
        if (!caja) return;
        var t = tablaTurno(caja.dataset.t);
        if (ev.target.closest('[data-mas-fila]')) t.filas.push(filaVolqueta());
        else if (ev.target.closest('[data-quitar-fila]')) t.filas.splice(+ev.target.closest('tr').dataset.i, 1);
        else return;
        pintarVolquetas();
        cambio();
    });
}
function pintarReporte() {
    var texto = textoDespacho(datos, fechaLarga());
    $('vista-previa').textContent = texto || 'Escriba en una sección y aquí queda el reporte.';
    $('btn-copiar').disabled = !texto;
    $('btn-programar').disabled = !texto;
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
    pintarSecciones(); pintarVolquetas(); pintarReporte();
    if (!configurado || !listo) return;
    var pedido = fecha;
    var res = await supabase.from('reportes_despacho').select('datos').eq('fecha', fecha).eq('usuario', listo.id).maybeSingle();
    if (pedido !== fecha || res.error) return;
    // Lo escrito sin señal en este equipo manda sobre lo de la base, y se envía
    if (sinEnviar) return enviar();
    if (res.data) { datos = res.data.datos || {}; pintarSecciones(); pintarVolquetas(); pintarReporte(); }
}

async function arrancar() {
    iniciarEncabezado();
    iniciarVolquetas();
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
    // Programarlo: lo envía el servidor a la hora elegida (web/src/whatsapp/programar.js)
    $('btn-programar').onclick = function () {
        var texto = textoDespacho(datos, fechaLarga());
        if (!texto) return toast('El reporte está vacío.');
        abrirProgramar({ texto: texto, origen: 'Despacho', avisar: toast });
    };
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
