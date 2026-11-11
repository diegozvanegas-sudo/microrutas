// cronogramas.html: recorridos y frecuencias por zona (p. ej. la recolección de llantas), qué toca cada día y la guía en el
// mapa. Los datos son privados (documento CRONOGRAMAS, solo con sesión y permiso de contrato). Al abrir la página, los
// corredores con trazo quedan guardados en este equipo (localStorage 'crono_guia') para que mapa_rapido.html los muestre.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { DIAS, COLORES_ZONA, leerCronogramas, delDia, cuentas, guiaParaMapa, textoDia } from './datos.js';

var CACHE = 'crono_cache', GUIA = 'crono_guia', PREF = 'crono_pref';
var crons = [], cual = 0, dia = new Date().getDay();

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function quitar(k) { try { localStorage.removeItem(k); } catch (e) {} }

// Insignia de cada sector según cómo quedó su trazo en el mapa
function insignia(s) {
    var t = s.trazo;
    if (!t || !t.g || !t.g.length) return '<span class="crono-ins sin" title="' + esc(s.pendiente || 'Es un sector o un sitio, no una vía: no tiene línea en el mapa') + '">' + (s.pendiente ? '⚠ por ubicar' : 'sin línea') + '</span>';
    if (t.estado === 'calles') return '<span class="crono-ins ok" title="Dibujado sobre las calles' + (t.nota ? ': ' + esc(t.nota) : '') + '">✓ en el mapa</span>';
    return '<span class="crono-ins aprox" title="' + esc(t.nota) + '">≈ aproximado</span>';
}

function pintar() {
    var c = crons[cual];
    if (!c) return;
    var q = $('c-buscar').value.trim().toLowerCase();
    $('c-dias').innerHTML = '<button type="button" class="crono-dia" data-dia="" aria-pressed="' + (dia == null) + '">Todos</button>' +
        [1, 2, 3, 4, 5, 6, 0].map(function (d) {
            var n = delDia(c, d).length;
            return '<button type="button" class="crono-dia" data-dia="' + d + '" aria-pressed="' + (dia === d) + '">' + DIAS[d].slice(0, 3) + (d === new Date().getDay() ? ' · hoy' : '') +
                ' <span class="crono-n">' + n + '</span></button>';
        }).join('');
    var zonas = delDia(c, dia).map(function (z) {
        var sec = z.sectores.filter(function (s) { return !q || (s.t + ' zona ' + z.zona + ' ' + z.frecuencia).toLowerCase().indexOf(q) !== -1; });
        return { z: z, sec: sec };
    }).filter(function (x) { return x.sec.length; });
    var k = cuentas(c);
    $('c-resumen').innerHTML = '<b>' + (dia == null ? 'Todas las zonas' : DIAS[dia]) + ':</b> ' + zonas.length + (zonas.length === 1 ? ' zona' : ' zonas') + ' con recorrido. ' +
        '<span class="sub">En el mapa: ' + k.calles + ' sobre las calles, ' + k.aprox + ' aproximados y ' + k.sin + ' sin línea (sectores o por ubicar), de ' + k.total + '.</span>';
    $('c-titulo').textContent = (c.icono ? c.icono + ' ' : '') + c.titulo;
    $('c-zonas').innerHTML = zonas.length ? zonas.map(function (x) {
        return '<article class="crono-zona" style="--zona:' + (COLORES_ZONA[x.z.zona] || '#64748b') + '"><div class="crono-zona-cab"><b>Zona ' + esc(x.z.zona) + '</b><span>' + esc(x.z.frecuencia) + '</span></div>' +
            '<ul>' + x.sec.map(function (s) { return '<li><span>' + esc(s.t) + '</span>' + insignia(s) + '</li>'; }).join('') + '</ul></article>';
    }).join('') : '<p class="sub">' + (q ? 'Nada con «' + esc(q) + '» ' + (dia == null ? '' : 'el ' + DIAS[dia].toLowerCase()) + '.' : 'No hay recorridos programados el ' + DIAS[dia].toLowerCase() + '.') + '</p>';
    $('crono-directrices').hidden = !c.directrices.length;
    $('c-directrices').innerHTML = c.directrices.map(function (d) { return '<li>' + (d.clave ? '<b>' + esc(d.clave) + ':</b> ' : '') + esc(d.t) + '</li>'; }).join('');
    $('c-mapa').href = 'mapa_rapido.html?guia=' + encodeURIComponent(c.id) + (dia == null ? '' : '&dia=' + dia);
}

async function cargar() {
    var r = await supabase.from('convenio_secciones').select('id, orden, icono, titulo, tipo, items').eq('documento', 'CRONOGRAMAS').order('orden');
    var filas = r.error ? leer(CACHE, null) : r.data;
    if (!r.error) guardar(CACHE, r.data);
    if (!filas || !filas.length) {
        $('estado').hidden = false;
        $('estado').innerHTML = r.error ? 'No se pudieron cargar los cronogramas: ' + esc(r.error.message) + '. Revise la conexión y use ↻ Actualizar cronogramas.' :
            'Todavía no hay cronogramas cargados. En el computador del proyecto corra <code>npm run guia -- --doc CRONOGRAMAS</code> (sube <code>datos/contrato/cronogramas.json</code>).';
        return false;
    }
    crons = leerCronogramas(filas);
    if (!guardar(GUIA, guiaParaMapa(crons))) toast('No se pudo guardar la guía del mapa en este equipo (sin espacio).');
    var p = leer(PREF, {});
    cual = Math.max(0, crons.findIndex(function (c) { return c.id === p.cual; }));
    $('c-cual').innerHTML = crons.map(function (c, i) { return '<option value="' + i + '">' + esc((c.icono ? c.icono + ' ' : '') + c.titulo) + '</option>'; }).join('');
    $('c-cual').value = cual;
    $('c-cual').closest('label').hidden = crons.length < 2;
    $('estado').hidden = !r.error;
    if (r.error) $('estado').textContent = 'Sin conexión: se muestra la última copia guardada en este equipo.';
    ['crono-filtros', 'crono-tabla'].forEach(function (id) { $(id).hidden = false; });
    pintar();
    return true;
}

function eventos() {
    $('c-dias').addEventListener('click', function (e) {
        var b = e.target.closest('[data-dia]');
        if (!b) return;
        dia = b.dataset.dia === '' ? null : +b.dataset.dia;
        pintar();
    });
    $('c-buscar').addEventListener('input', pintar);
    $('c-cual').onchange = function () { cual = +this.value; guardar(PREF, { cual: crons[cual].id }); pintar(); };
    $('c-copiar').onclick = async function () {
        var t = textoDia(crons[cual], dia);
        try { await navigator.clipboard.writeText(t); toast('Copiado: péguelo en WhatsApp.'); }
        catch (e) { toast('No se pudo copiar en este navegador.'); }
    };
    $('btn-recargar').onclick = async function () { $('estado').hidden = false; $('estado').textContent = 'Actualizando…'; if (await cargar()) toast('Cronogramas actualizados.'); };
}

async function arrancar() {
    iniciarEncabezado();
    eventos();
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    // Al salir se borran la copia y la guía del mapa (son datos del contrato)
    $('btn-salir').onclick = function () { quitar(CACHE); quitar(GUIA); cerrarSesion(supabase); };
    var permisos = await aplicarPermisos(supabase, usuario);
    if (!permisos.contrato) {
        quitar(CACHE); quitar(GUIA);
        $('estado').textContent = '🔒 Su usuario no tiene permiso para ver el contrato (los cronogramas salen de él). Pídaselo al administrador.';
        return;
    }
    await cargar();
}
arrancar();
