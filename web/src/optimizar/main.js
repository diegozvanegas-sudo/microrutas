// optimizar.html: 🛣️ Programación por cercanía (menú Zonas verdes). La lógica está en optimizar.js y el Excel en excel.js.
// La programación es la misma de 📅 Programación del día y de 📊 Cruce (queda en este equipo, clave «programacion_cache»).
// Los centros de los lotes salen de los polígonos del mapa rápido (data/rapido/lotes_N.js). El resultado no se guarda;
// solo las preferencias (cuadrilla, quincena, lista y filtro) en «oz_pref».
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { esc, hoy, aTexto } from '../subsanaciones/util.js';
import { filasHoja, leerProgramacion } from '../subsanaciones/programacion.js';
import { leerDatos } from '../subsanaciones/lotegps.js';
import { analizar, centrosDeLotes, textoResumen, kmTexto, pct, nombreDia, rotuloLote, LARGO } from './optimizar.js';

var PROG_CACHE = 'programacion_cache', PREF = 'oz_pref';
var COLORES = ['#e11d48', '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#0d9488', '#b45309'];
var progDatos = null, centros = null, res = null, sel = -1;
var pref = leer(PREF, {}) || {};
pref = { cuad: pref.cuad || '', q: pref.q === 2 ? 2 : 1, lista: pref.lista === 'hoy' ? 'hoy' : 'prop', solo: !!pref.solo };
try { progDatos = JSON.parse(localStorage.getItem(PROG_CACHE)) || null; } catch (e) { progDatos = null; }

function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardarPref() { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* solo es la preferencia */ } }
function m2(n) { return Math.round(n).toLocaleString('es-CO') + ' m²'; }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
function espera() { return new Promise(function (r) { setTimeout(r, 30); }); }

// ---------- Datos ----------
async function traer(url) { var r = await fetch(url); if (!r.ok) throw new Error('no se pudo descargar ' + url + ' (' + r.status + ')'); return r.text(); }
async function cargarCentros() {
    if (centros) return centros;
    $('oz-calc').textContent = 'Cargando los lotes del mapa… (la primera vez son unos 4 MB)';
    var idx = leerDatos(await traer('data/rapido/indice.js'));
    var archivos = Object.keys(idx.cuadrillas || {}).map(function (c) { return 'data/rapido/lotes_' + c + '.js'; }).concat(['data/rapido/lotes_sin.js']);
    var listas = [], hechos = 0;
    await Promise.all(archivos.map(async function (a) {
        try { listas.push(leerDatos(await traer(a))); } catch (e) { if (!/lotes_sin/.test(a)) throw e; }
        hechos++;
        $('oz-calc').textContent = 'Cargando los lotes del mapa… ' + hechos + ' de ' + archivos.length;
    }));
    centros = centrosDeLotes(listas);
    return centros;
}
async function calcular() {
    res = null; sel = -1;
    $('oz-res').hidden = true; $('oz-detalle').hidden = true;
    var prog = progDatos && progDatos.prog;
    pintarProg();
    if (!prog) { $('oz-calc').textContent = ''; return; }
    $('oz-elegir').disabled = true;
    try {
        await cargarCentros();
        $('oz-calc').textContent = 'Calculando la propuesta de ' + prog.mes + '…';
        await espera();
        res = analizar(prog, centros);
        if (!res.cuadrillas.length) throw new Error('la programación no tiene lotes por cuadrilla');
        if (!res.cuadrillas.some(function (c) { return c.cuad === pref.cuad; })) pref.cuad = res.cuadrillas[0].cuad;
        $('oz-calc').textContent = '';
        pintar();
    } catch (e) {
        $('oz-calc').innerHTML = '<span class="oz-falta">No se pudo calcular: ' + esc(e.message) + '. Revise la conexión y toque ↻ Actualizar.</span>';
    } finally { $('oz-elegir').disabled = false; }
}
async function cargarProg(file) {
    if (!file) return;
    $('oz-elegir').disabled = true;
    $('oz-prog-estado').textContent = 'Leyendo ' + file.name + '… (un libro grande tarda unos segundos)';
    try {
        var { default: ExcelJS } = await import('exceljs');
        var wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        var hojas = {};
        wb.worksheets.forEach(function (ws) { hojas[ws.name] = filasHoja(ws); });
        var prog = leerProgramacion(hojas, file.name);
        if (!prog.q1.length && !prog.q2.length) throw new Error('no se encontraron lotes (hojas Q1, Q2 o PROGRAMACION con la columna MICRORRUTA)');
        if (!prog.mes) throw new Error('no se pudo saber de qué mes es (ponga el año y el mes en el nombre: 2026_11_…)');
        [prog.q1, prog.q2].forEach(function (l) { l.forEach(function (x) { x.dir = x.dir.slice(0, 140); }); });
        progDatos = { archivo: file.name, cargado: aTexto(hoy()), prog: prog };
        try { localStorage.setItem(PROG_CACHE, JSON.stringify(progDatos)); } catch (e) { toast('No se pudo guardar en este equipo: habrá que subirlo otra vez.'); }
        toast('Programación de ' + prog.mes + ' cargada: ' + (prog.q1.length + prog.q2.length) + ' lotes.');
        $('oz-elegir').disabled = false;
        await calcular();
    } catch (e) {
        pintarProg();
        $('oz-prog-estado').innerHTML = '<span class="oz-falta">No se pudo leer el Excel: ' + esc(e.message) + '. Revise que sea el de programación del mes.</span>';
    } finally { $('oz-elegir').disabled = false; $('oz-archivo').value = ''; }
}

// ---------- Pantalla ----------
function pintarProg() {
    var prog = progDatos && progDatos.prog;
    $('oz-prog-estado').innerHTML = prog ? '✓ Programación de <b>' + esc(prog.mes) + '</b> · ' + prog.q1.length + ' lotes en Q1 y ' + prog.q2.length + ' en Q2' +
        (progDatos.archivo ? ' <span class="sub">(' + esc(progDatos.archivo) + (progDatos.cargado ? ', cargada el ' + esc(progDatos.cargado) : '') + ')</span>' : '')
        : '<span class="oz-falta">Falta el Excel de programación del mes (el del contratista, con las hojas Q1 y Q2).</span>';
    $('oz-elegir').textContent = prog ? '📁 Cambiar el Excel de programación' : '📁 Elegir el Excel de programación';
}
function dato(clase, valor, texto, extra) {
    return '<div class="oz-dato ' + clase + '"><b>' + valor + '</b><span>' + texto + '</span>' + (extra ? '<small>' + extra + '</small>' : '') + '</div>';
}
function pintar() {
    var t = res.total, mes = progDatos.prog.mes;
    $('oz-titulo').textContent = 'Resultado de ' + mes;
    $('oz-cuenta').innerHTML = [
        dato('', kmTexto(t.hoy) + ' km', 'entre lotes en el mes, hoy', 'línea recta'),
        dato('bien', kmTexto(t.prop) + ' km', 'con la propuesta', t.ahorro + ' % menos'),
        dato(t.largosHoy > t.largosProp ? 'ojo' : '', t.largosHoy + ' → ' + t.largosProp, 'días de más de ' + LARGO + ' km entre lotes'),
        dato(t.malEspaciados ? 'mal' : 'bien', t.malEspaciados + ' de ' + t.quincenales, 'quincenales mal espaciados hoy',
            t.sepMin != null ? 'hoy de ' + t.sepMin + ' a ' + t.sepMax + ' días · propuesta: 14' : ''),
        dato('', t.cambian + ' de ' + t.lotes, 'lotes que cambian de día')
    ].join('');
    var avisos = [];
    if (res.sinUbicar.length) avisos.push(plural(res.sinUbicar.length, 'lote no está', 'lotes no están') + ' en el mapa y no entran en el cálculo (quedan en la hoja «Sin ubicar» del Excel): ' +
        res.sinUbicar.slice(0, 12).map(function (x) { return esc(x.mr + (x.lote ? ' lote ' + x.lote : '')); }).join(', ') + (res.sinUbicar.length > 12 ? '…' : '') + '.');
    if (t.sinDia) avisos.push(plural(t.sinDia, 'lote no tiene', 'lotes no tienen') + ' semana o día en el Excel: no cuentan en los km de hoy, pero la propuesta sí les da día.');
    $('oz-avisos').hidden = !avisos.length;
    $('oz-avisos').innerHTML = avisos.map(function (a) { return '<p>⚠ ' + a + '</p>'; }).join('');
    $('oz-tabla').innerHTML = '<thead><tr><th>Cuadrilla</th><th>Días</th><th>Km hoy</th><th>Km propuesta</th><th>Menos</th><th>Días &gt; ' + LARGO + ' km</th><th>Quincenales hoy</th><th>Día más cargado</th><th></th></tr></thead><tbody>' +
        res.cuadrillas.map(function (c) {
            var h = c.km.hoy1 + c.km.hoy2, p = c.km.prop1 + c.km.prop2, a = pct(h, p);
            return '<tr' + (c.cuad === pref.cuad ? ' class="activa"' : '') + '><th>C' + esc(c.cuad) + '</th><td>' + c.nd + '</td><td>' + kmTexto(h) + '</td><td>' + kmTexto(p) + '</td>' +
                '<td class="' + (a >= 20 ? 'bien' : a < 0 ? 'mal' : '') + '">' + a + ' %</td><td>' + c.largos.hoy + ' → ' + c.largos.prop + '</td>' +
                '<td>' + (c.separacion.length ? Math.min.apply(null, c.separacion) + ' a ' + Math.max.apply(null, c.separacion) + ' días' : '—') + '</td>' +
                '<td>' + m2(c.cargaMax.hoy) + ' → ' + m2(c.cargaMax.prop) + '</td>' +
                '<td><button type="button" class="secundario pequeno" data-cuad="' + esc(c.cuad) + '">Ver días</button></td></tr>';
        }).join('') + '</tbody>';
    $('oz-cuad').innerHTML = res.cuadrillas.map(function (c) { return '<option value="' + esc(c.cuad) + '"' + (c.cuad === pref.cuad ? ' selected' : '') + '>Cuadrilla ' + esc(c.cuad) + '</option>'; }).join('');
    $('oz-res').hidden = false; $('oz-detalle').hidden = false;
    pintarDetalle();
}

// Dibujo de los días de una cuadrilla (puntos y recorridos), con el mismo recuadro para hoy y para la propuesta
function dibujo(dias, caja, titulo, kmTotal, activo) {
    var W = 360, H = 260, m = 10;
    var cx = function (lon) { return m + (lon - caja.lon0) / (caja.lon1 - caja.lon0 || 1) * (W - 2 * m); };
    var cy = function (lat) { return H - m - (lat - caja.lat0) / (caja.lat1 - caja.lat0 || 1) * (H - 2 * m); };
    var trazos = dias.map(function (d, i) {
        var c = COLORES[i % COLORES.length], f = !activo || sel === -1 || sel === i ? '' : ' class="apagado"';
        var pts = d.lotes.map(function (x) { return cx(x.lon).toFixed(1) + ',' + cy(x.lat).toFixed(1); });
        return '<g' + f + '><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" />' +
            d.lotes.map(function (x) { return '<circle cx="' + cx(x.lon).toFixed(1) + '" cy="' + cy(x.lat).toFixed(1) + '" r="3.6" fill="' + c + '"><title>' + esc(nombreDia(d) + ' · ' + x.mr + ' lote ' + x.lote) + '</title></circle>'; }).join('') + '</g>';
    }).join('');
    return '<figure class="oz-mapa"><figcaption><b>' + titulo + '</b><span>' + kmTexto(kmTotal) + ' km</span></figcaption>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titulo + ': ' + plural(dias.length, 'día', 'días') + ', ' + kmTexto(kmTotal) + ' km entre lotes') + '">' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f8fafc" />' + trazos + '</svg></figure>';
}
function pintarDetalle() {
    var c = res.cuadrillas.filter(function (x) { return x.cuad === pref.cuad; })[0] || res.cuadrillas[0], q = pref.q;
    document.querySelectorAll('#oz-detalle [data-q]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.q) === q)); });
    document.querySelectorAll('#oz-pestanas [data-lista]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.lista === pref.lista)); });
    $('oz-solo').checked = pref.solo;
    $('oz-tabla').querySelectorAll('tbody tr').forEach(function (tr, i) { tr.classList.toggle('activa', res.cuadrillas[i] === c); });
    var hoyD = c.hoy[q], prop = c.propuesta[q], todos = [].concat.apply([], hoyD.concat(prop).map(function (d) { return d.lotes; }));
    var caja = { lat0: Infinity, lat1: -Infinity, lon0: Infinity, lon1: -Infinity };
    todos.forEach(function (x) { caja.lat0 = Math.min(caja.lat0, x.lat); caja.lat1 = Math.max(caja.lat1, x.lat); caja.lon0 = Math.min(caja.lon0, x.lon); caja.lon1 = Math.max(caja.lon1, x.lon); });
    var lista = pref.lista === 'hoy' ? hoyD : prop;
    $('oz-mapas').innerHTML = todos.length ? dibujo(hoyD, caja, 'Hoy · Q' + q, q === 1 ? c.km.hoy1 : c.km.hoy2, pref.lista === 'hoy') + dibujo(prop, caja, 'Propuesta · Q' + q, q === 1 ? c.km.prop1 : c.km.prop2, pref.lista === 'prop')
        : '<p class="sub">La cuadrilla ' + esc(c.cuad) + ' no tiene lotes en la Q' + q + '.</p>';
    var colorDe = function (d) { return COLORES[(pref.lista === 'hoy' ? hoyD : prop).indexOf(d) % COLORES.length]; };
    var ver = lista.filter(function (d) { return !pref.solo || d.km > LARGO; });
    $('oz-dias').innerHTML = (sel !== -1 ? '<button type="button" class="secundario pequeno" id="oz-todos">Ver todos los días en el dibujo</button>' : '') +
        (ver.length ? ver.map(function (d) {
            var i = lista.indexOf(d);
            return '<article class="oz-dia' + (sel === i ? ' marcado' : '') + '" style="--color:' + colorDe(d) + '">' +
                '<div class="oz-dia-cab"><span class="oz-punto" aria-hidden="true"></span><b>Semana ' + d.semana + ' · ' + esc(nombreDia(d)) + '</b>' +
                '<span class="sub">' + plural(d.lotes.length, 'lote', 'lotes') + ' · ' + kmTexto(d.km) + ' km · ' + m2(d.area) + '</span>' + (d.km > LARGO ? '<span class="oz-largo">disperso</span>' : '') + '</div>' +
                '<div class="oz-chips">' + d.lotes.map(function (x, n) {
                    var antes = pref.lista === 'prop' && x.cambia ? (x.antes.dia ? 'hoy ' + nombreDia({ dia: x.antes.dia }) + ' S' + x.antes.semana : 'hoy sin día') : '';
                    return '<a class="oz-chip' + (x.frec === 2 ? ' quin' : '') + '" href="mapa_rapido.html?lote=' + encodeURIComponent(rotuloLote(x)) + '" title="' + esc(x.mr + (x.dir ? ' · ' + x.dir : '') + (x.frec === 2 ? ' · quincenal' : ' · mensual')) + '">' +
                        '<small>' + (n + 1) + '.</small> ' + esc(rotuloLote(x)) + (antes ? ' <small>' + esc(antes) + '</small>' : '') + '</a>';
                }).join('') + '</div>' +
                '<div class="oz-acc"><button type="button" class="secundario pequeno" data-sel="' + i + '">' + (sel === i ? 'Quitar resaltado' : '✏️ Resaltar en el dibujo') + '</button>' +
                '<a class="boton secundario pequeno" href="mapa_rapido.html?lote=' + d.lotes.map(function (x) { return encodeURIComponent(rotuloLote(x)); }).join(',') + '">🗺️ Ver en el mapa</a></div></article>';
        }).join('') : '<p class="sub oz-vacio">' + (pref.solo ? 'Ningún día pasa de ' + LARGO + ' km entre lotes.' : 'No hay días con lotes ubicados.') + '</p>');
}

async function descargar() {
    if (!res) return;
    var b = $('oz-excel');
    b.disabled = true; b.textContent = 'Armando el Excel…';
    try {
        var [{ default: ExcelJS }, { libroPropuesta }] = await Promise.all([import('exceljs'), import('./excel.js')]);
        var wb = libroPropuesta(ExcelJS, res, { mes: progDatos.prog.mes, archivo: progDatos.archivo });
        var blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'Programacion_por_cercania_' + progDatos.prog.mes + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('Excel descargado.');
    } catch (e) { toast('No se pudo armar el Excel: ' + e.message); }
    finally { b.disabled = false; b.textContent = '⬇️ Descargar Excel de la propuesta'; }
}

async function arrancar() {
    iniciarEncabezado();
    if (configurado) {
        var usuario = await asegurarSesion(supabase);
        $('btn-salir').hidden = false;
        $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
        $('btn-salir').onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    }
    $('oz-elegir').onclick = function () { $('oz-archivo').click(); };
    $('oz-archivo').onchange = function () { cargarProg(this.files && this.files[0]); };
    $('oz-excel').onclick = descargar;
    $('oz-copiar').onclick = function () {
        if (!res) return;
        var t = textoResumen(res, progDatos.prog.mes);
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Resumen copiado'); }, function () { toast('No se pudo copiar.'); });
        else toast('Este navegador no deja copiar: use el computador o Chrome.');
    };
    $('oz-tabla').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-cuad]');
        if (!b) return;
        pref.cuad = b.dataset.cuad; sel = -1; guardarPref();
        $('oz-cuad').value = pref.cuad; pintarDetalle();
        $('oz-detalle').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('oz-cuad').onchange = function () { pref.cuad = this.value; sel = -1; guardarPref(); pintarDetalle(); };
    $('oz-detalle').addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-q]'), l = ev.target.closest('[data-lista]'), s = ev.target.closest('[data-sel]');
        if (q) { pref.q = Number(q.dataset.q); sel = -1; guardarPref(); pintarDetalle(); }
        if (l) { pref.lista = l.dataset.lista; sel = -1; guardarPref(); pintarDetalle(); }
        if (s) { var i = Number(s.dataset.sel); sel = sel === i ? -1 : i; pintarDetalle(); if (sel !== -1) $('oz-mapas').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        if (ev.target.id === 'oz-todos') { sel = -1; pintarDetalle(); }
    });
    $('oz-solo').onchange = function () { pref.solo = this.checked; guardarPref(); pintarDetalle(); };
    $('btn-recargar').onclick = function () { centros = null; calcular(); };
    $('estado').hidden = true; $('oz-datos').hidden = false;
    await calcular();
}
arrancar();
