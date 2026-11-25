// optimizar.html: 🛣️ Programación por cercanía (menú Zonas verdes). La lógica está en optimizar.js, los mapas en mapa.js y
// el Excel en excel.js. La programación es la misma de 📅 Programación del día y de 📊 Cruce (queda en este equipo, clave
// «programacion_cache»). Los centros y polígonos de los lotes salen del mapa rápido (data/rapido/lotes_N.js). El resultado
// no se guarda; solo las preferencias (cuadrilla, quincena, lista, filtro y opciones de los mapas) en «oz_pref».
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { crearProgBase, guardarLocal as guardarProgLocal } from '../programacion_base.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { esc, hoy, aTexto } from '../subsanaciones/util.js';
import { filasHoja, leerProgramacion } from '../subsanaciones/programacion.js';
import { leerDatos, decodificar } from '../subsanaciones/lotegps.js';
import { analizar, centrosDeLotes, textoResumen, kmTexto, pct, nombreDia, rotuloLote, paradas, fechasDe, metros, LARGO, resumenPropuesta } from './optimizar.js';
import { crearMapas, hayLeaflet, COLORES } from './mapa.js';

var PROG_CACHE = 'programacion_cache', PREF = 'oz_pref';
var progBase = null, progDatos = null, centros = null, geometrias = {}, anillos = {}, res = null, mapas = null, selFecha = '';
var pref = leer(PREF, {}) || {};
pref = {
    cuad: pref.cuad || '', q: pref.q === 2 ? 2 : 1, lista: pref.lista === 'hoy' ? 'hoy' : 'prop', solo: !!pref.solo,
    fondo: ['calles', 'satelite', 'orto'].indexOf(pref.fondo) !== -1 ? pref.fondo : 'calles', numeros: pref.numeros === 'quincena' ? 'quincena' : 'dia',
    flechas: pref.flechas !== false, poligonos: pref.poligonos !== false, juntos: pref.juntos !== false, grande: !!pref.grande
};
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
    // Polígonos de cada lote (para dibujarlos en los mapas); se decodifican solo los que se muestran
    geometrias = {}; anillos = {};
    var porMr = {};
    listas.forEach(function (d) {
        (d.lotes || []).forEach(function (p) {
            var mr = String(p.m || '').toUpperCase(), k = mr + '|' + (p.l != null ? String(p.l) : '');
            (geometrias[k] = geometrias[k] || []).push(p.g || []);
            (porMr[mr] = porMr[mr] || {})[k] = true;
        });
    });
    Object.keys(porMr).forEach(function (mr) { var ks = Object.keys(porMr[mr]); if (ks.length === 1) geometrias[mr] = geometrias[ks[0]]; });
    return centros;
}
function poligonos(x) {
    var k = x.mr + '|' + (/^N\/?A$/i.test(x.lote || '') ? 'NA' : x.lote);
    if (!geometrias[k]) k = x.mr;
    if (anillos[k]) return anillos[k];
    var out = [];
    (geometrias[k] || []).forEach(function (g) { g.forEach(function (pol) { out.push(pol.map(decodificar)); }); });
    return (anillos[k] = out);
}
async function calcular() {
    res = null; selFecha = '';
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
        // El día propuesto de cada lote queda en el equipo para la ficha del mapa rápido
        try { localStorage.setItem('oz_propuesta_lotes', JSON.stringify(resumenPropuesta(res, prog.mes))); } catch (e) { /* sin espacio: solo no sale en el mapa */ }
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
        if (!guardarProgLocal(progDatos)) toast('No se pudo guardar en este equipo: habrá que subirlo otra vez.');
        // A la base para todos los equipos (programaciones, 0030): un Excel nuevo reemplaza el mes
        if (progBase) progBase.guardar(progDatos, { forzar: true }).then(function (r) { if (r.aviso) toast(r.aviso); });
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
    if (t.sinDia) avisos.push(plural(t.sinDia, 'lote no tiene', 'lotes no tienen') + ' semana o día en el Excel: no cuentan en los km de hoy (en el mapa de hoy salen en gris con «?»), pero la propuesta sí les da día.');
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
    pintarDetalle(true);
}

// Respaldo sin Leaflet (sin señal la primera vez): dibujo simple de puntos y recorridos
function dibujo(dias, caja, titulo, kmTotal, colorDe) {
    var W = 360, H = 260, m = 10;
    var cx = function (lon) { return m + (lon - caja.lon0) / (caja.lon1 - caja.lon0 || 1) * (W - 2 * m); };
    var cy = function (lat) { return H - m - (lat - caja.lat0) / (caja.lat1 - caja.lat0 || 1) * (H - 2 * m); };
    var trazos = dias.map(function (d) {
        var c = colorDe(d.fecha), f = !selFecha || selFecha === d.fecha ? '' : ' class="apagado"';
        var pts = d.lotes.map(function (x) { return cx(x.lon).toFixed(1) + ',' + cy(x.lat).toFixed(1); });
        return '<g' + f + '><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" />' +
            d.lotes.map(function (x) { return '<circle cx="' + cx(x.lon).toFixed(1) + '" cy="' + cy(x.lat).toFixed(1) + '" r="3.6" fill="' + c + '"><title>' + esc(nombreDia(d) + ' · ' + x.mr + ' lote ' + x.lote) + '</title></circle>'; }).join('') + '</g>';
    }).join('');
    return '<figure class="oz-mapa"><figcaption><b>' + titulo + '</b><span>' + kmTexto(kmTotal) + ' km</span></figcaption>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titulo + ': ' + plural(dias.length, 'día', 'días') + ', ' + kmTexto(kmTotal) + ' km entre lotes') + '">' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f8fafc" />' + trazos + '</svg></figure>';
}
function rotuloFecha(f) { return 'S' + f.semana + ' ' + nombreDia(f); }
// Texto de arriba de cada mapa: el total de la quincena o el del día elegido
function leyenda(nombre, dias, q, kmQ) {
    var d = selFecha ? dias.filter(function (x) { return x.fecha === selFecha; })[0] : null;
    if (selFecha) return '<b>' + nombre + ' · ' + esc(rotuloFecha(d || { semana: '', dia: 0 })) + '</b><span>' + (d ? plural(d.lotes.length, 'lote', 'lotes') + ' · ' + metros(d.km) + ' · ' + m2(d.area) : 'ese día no tiene lotes') + '</span>';
    var n = dias.reduce(function (s, x) { return s + x.lotes.length; }, 0);
    return '<b>' + nombre + ' · Q' + q + '</b><span>' + plural(dias.length, 'día', 'días') + ' · ' + plural(n, 'lote', 'lotes') + ' · ' + kmTexto(kmQ) + ' km</span>';
}
// ajustar: volver a encuadrar los mapas (al cambiar de cuadrilla, quincena o día)
function pintarDetalle(ajustar) {
    var c = res.cuadrillas.filter(function (x) { return x.cuad === pref.cuad; })[0] || res.cuadrillas[0], q = pref.q;
    document.querySelectorAll('#oz-detalle [data-q]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.q) === q)); });
    document.querySelectorAll('#oz-pestanas [data-lista]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.lista === pref.lista)); });
    $('oz-solo').checked = pref.solo;
    $('oz-fondo').value = pref.fondo; $('oz-numeros').value = pref.numeros;
    $('oz-flechas').checked = pref.flechas; $('oz-poligonos').checked = pref.poligonos; $('oz-juntos').checked = pref.juntos;
    $('oz-mapas').classList.toggle('grande', pref.grande);
    $('oz-grande').textContent = pref.grande ? '⤡ Mapas normales' : '⤢ Mapas más grandes';
    $('oz-tabla').querySelectorAll('tbody tr').forEach(function (tr, i) { tr.classList.toggle('activa', res.cuadrillas[i] === c); });
    var hoyD = c.hoy[q], prop = c.propuesta[q], fechas = fechasDe(hoyD, prop);
    if (selFecha && !fechas.some(function (f) { return f.fecha === selFecha; })) selFecha = '';
    var colores = {};
    fechas.forEach(function (f, i) { colores[f.fecha] = COLORES[i % COLORES.length]; });
    var colorDe = function (f) { return colores[f] || '#64748b'; };
    // Día que se ve en los dos mapas
    $('oz-diasel').innerHTML = '<button type="button" class="oz-fecha" data-fecha="" aria-pressed="' + !selFecha + '">Todos los días</button>' +
        fechas.map(function (f) {
            return '<button type="button" class="oz-fecha" data-fecha="' + f.fecha + '" aria-pressed="' + (selFecha === f.fecha) + '" style="--color:' + colorDe(f.fecha) + '"><span class="oz-punto" aria-hidden="true"></span>' + esc(rotuloFecha(f)) + '</button>';
        }).join('');
    var kmHoy = q === 1 ? c.km.hoy1 : c.km.hoy2, kmProp = q === 1 ? c.km.prop1 : c.km.prop2;
    var hay = hoyD.length || prop.length;
    $('oz-sin-mapa').hidden = true;
    if (!hay) {
        $('oz-mapas').hidden = true;
        $('oz-sin-mapa').hidden = false;
        $('oz-sin-mapa').innerHTML = '<p class="sub">La cuadrilla ' + esc(c.cuad) + ' no tiene lotes ubicados en la Q' + q + '.</p>';
    } else if (hayLeaflet()) {
        $('oz-mapas').hidden = false;
        $('oz-cap-hoy').innerHTML = leyenda('Hoy', hoyD, q, kmHoy);
        $('oz-cap-prop').innerHTML = leyenda('Propuesta', prop, q, kmProp);
        var nuevo = !mapas;
        if (nuevo) mapas = crearMapas('oz-map-hoy', 'oz-map-prop');
        mapas.pintar({ hoy: hoyD, prop: prop, sinDia: c.sinDiaLotes ? c.sinDiaLotes[q] : [], colorDe: colorDe, fecha: selFecha, poligonos: poligonos },
            { numeros: pref.numeros, flechas: pref.flechas, poligonos: pref.poligonos, fondo: pref.fondo, juntos: pref.juntos });
        if (ajustar || nuevo) setTimeout(function () { mapas.ajustar(); }, 0);
    } else {
        // Sin Leaflet: el dibujo simple
        $('oz-mapas').hidden = true;
        $('oz-sin-mapa').hidden = false;
        var todos = [].concat.apply([], hoyD.concat(prop).map(function (d) { return d.lotes; }));
        var caja = { lat0: Infinity, lat1: -Infinity, lon0: Infinity, lon1: -Infinity };
        todos.forEach(function (x) { caja.lat0 = Math.min(caja.lat0, x.lat); caja.lat1 = Math.max(caja.lat1, x.lat); caja.lon0 = Math.min(caja.lon0, x.lon); caja.lon1 = Math.max(caja.lon1, x.lon); });
        $('oz-sin-mapa').innerHTML = '<p class="sub">⚠ No cargó el mapa (¿sin señal?): se muestra un dibujo simple. Toque ↻ Actualizar cuando vuelva la conexión.</p><div class="oz-dibujos">' +
            dibujo(hoyD, caja, 'Hoy · Q' + q, kmHoy, colorDe) + dibujo(prop, caja, 'Propuesta · Q' + q, kmProp, colorDe) + '</div>';
    }
    pintarDias(pref.lista === 'hoy' ? hoyD : prop, colorDe, c, q);
}
// Fichas de los días de la lista elegida, con su paso a paso
function pintarDias(lista, colorDe, c, q) {
    var porLote = {};
    paradas(lista).forEach(function (p) { porLote[p.x.k] = p; });
    var ver = lista.filter(function (d) { return !pref.solo || d.km > LARGO; });
    var sinDia = pref.lista === 'hoy' && c.sinDiaLotes ? c.sinDiaLotes[q] : [];
    $('oz-dias').innerHTML = (ver.length ? ver.map(function (d) {
        var marcado = selFecha === d.fecha;
        return '<article class="oz-dia' + (marcado ? ' marcado' : '') + '" style="--color:' + colorDe(d.fecha) + '">' +
            '<div class="oz-dia-cab"><span class="oz-punto" aria-hidden="true"></span><b>Semana ' + d.semana + ' · ' + esc(nombreDia(d)) + '</b>' +
            '<span class="sub">' + plural(d.lotes.length, 'lote', 'lotes') + ' · ' + kmTexto(d.km) + ' km · ' + m2(d.area) + '</span>' + (d.km > LARGO ? '<span class="oz-largo">disperso</span>' : '') + '</div>' +
            '<div class="oz-chips">' + d.lotes.map(function (x) {
                var p = porLote[x.k], antes = pref.lista === 'prop' && x.cambia ? (x.antes.dia ? 'hoy ' + nombreDia({ dia: x.antes.dia }) + ' S' + x.antes.semana : 'hoy sin día') : '';
                return '<a class="oz-chip' + (x.frec === 2 ? ' quin' : '') + '" href="mapa_rapido.html?lote=' + encodeURIComponent(rotuloLote(x)) + '" title="' + esc(x.mr + (x.dir ? ' · ' + x.dir : '') + (x.frec === 2 ? ' · quincenal' : ' · mensual')) + '">' +
                    '<small>' + (pref.numeros === 'quincena' ? p.g : p.n) + '.</small> ' + esc(rotuloLote(x)) + (antes ? ' <small>' + esc(antes) + '</small>' : '') + '</a>';
            }).join('') + '</div>' +
            '<details class="oz-paso"><summary>Paso a paso (' + plural(d.lotes.length, 'parada', 'paradas') + ')</summary><ol>' + d.lotes.map(function (x) {
                var p = porLote[x.k];
                return '<li value="' + (pref.numeros === 'quincena' ? p.g : p.n) + '"><b>' + esc(x.lote && !/^N\/?A$/i.test(x.lote) ? 'Lote ' + x.lote : x.mr) + '</b> · ' + esc(x.mr) +
                    (x.dir ? ' · ' + esc(x.dir) : '') + ' · ' + m2(x.area || 0) + ' · ' + (x.frec === 2 ? 'quincenal' : 'mensual') +
                    '<span class="oz-sig">' + (p.sig != null ? '↓ ' + metros(p.sig) + ' al siguiente' : 'Último del día') + '</span></li>';
            }).join('') + '</ol></details>' +
            '<div class="oz-acc"><button type="button" class="secundario pequeno" data-fecha="' + d.fecha + '">' + (marcado ? 'Ver todos los días' : '🗺️ Ver este día en los mapas') + '</button>' +
            '<a class="boton secundario pequeno" href="mapa_rapido.html?lote=' + d.lotes.map(function (x) { return encodeURIComponent(rotuloLote(x)); }).join(',') + '">Abrir en el mapa rápido</a></div></article>';
    }).join('') : '<p class="sub oz-vacio">' + (pref.solo ? 'Ningún día pasa de ' + LARGO + ' km entre lotes.' : 'No hay días con lotes ubicados.') + '</p>') +
        (sinDia.length && !pref.solo ? '<article class="oz-dia" style="--color:#64748b"><div class="oz-dia-cab"><span class="oz-punto" aria-hidden="true"></span><b>Sin semana ni día en el Excel</b><span class="sub">' + plural(sinDia.length, 'lote', 'lotes') + '</span></div>' +
            '<div class="oz-chips">' + sinDia.map(function (x) { return '<a class="oz-chip" href="mapa_rapido.html?lote=' + encodeURIComponent(rotuloLote(x)) + '">' + esc(rotuloLote(x)) + '</a>'; }).join('') + '</div></article>' : '');
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

function verFecha(f) {
    selFecha = f || '';
    pintarDetalle(true);
    if (selFecha && !$('oz-mapas').hidden) $('oz-diasel').scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    // La programación del mes sale de la base (la que subió cualquiera); si llega una más nueva, se calcula otra vez
    progBase = crearProgBase(configurado ? supabase : null);
    var sinc = progBase.sincronizar().then(function (r) { if (r.aviso) toast(r.aviso); return r; });
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
        pref.cuad = b.dataset.cuad; selFecha = ''; guardarPref();
        $('oz-cuad').value = pref.cuad; pintarDetalle(true);
        $('oz-detalle').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('oz-cuad').onchange = function () { pref.cuad = this.value; selFecha = ''; guardarPref(); pintarDetalle(true); };
    $('oz-detalle').addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-q]'), l = ev.target.closest('[data-lista]'), f = ev.target.closest('[data-fecha]');
        if (q) { pref.q = Number(q.dataset.q); selFecha = ''; guardarPref(); pintarDetalle(true); }
        if (l) { pref.lista = l.dataset.lista; guardarPref(); pintarDetalle(false); }
        if (f) verFecha(f.closest('.oz-dia') && selFecha === f.dataset.fecha ? '' : f.dataset.fecha);
        if (ev.target.id === 'oz-grande') {
            pref.grande = !pref.grande; guardarPref(); pintarDetalle(false);
            if (mapas) setTimeout(function () { mapas.ajustar(); }, 50);
        }
    });
    $('oz-solo').onchange = function () { pref.solo = this.checked; guardarPref(); pintarDetalle(false); };
    // Opciones de los mapas (se recuerdan en el equipo)
    ['oz-fondo', 'oz-numeros', 'oz-flechas', 'oz-poligonos', 'oz-juntos'].forEach(function (id) {
        $(id).onchange = function () {
            pref.fondo = $('oz-fondo').value; pref.numeros = $('oz-numeros').value;
            pref.flechas = $('oz-flechas').checked; pref.poligonos = $('oz-poligonos').checked; pref.juntos = $('oz-juntos').checked;
            guardarPref(); pintarDetalle(false);
        };
    });
    window.addEventListener('resize', function () { if (mapas) mapas.tamano(); });
    $('btn-recargar').onclick = function () { centros = null; calcular(); };
    $('estado').hidden = true; $('oz-datos').hidden = false;
    await calcular();
    sinc.then(function (r) { if (r.cambio) { progDatos = r.datos; pintarProg(); calcular(); } });
}
arrancar();
