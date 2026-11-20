// espartillos.html: 🌾 Espartillos (menú Zonas verdes). La lista se arma en el momento (espartillos.js) con la capa del mapa
// rápido (data/rapido/capa_espartillos.js, capa_zonas.js, capa_comunas.js) y la programación del mes guardada en este equipo
// (clave «programacion_cache», la misma de 📅 Programación del día, 📊 Cruce y 🛣️ Programación por cercanía). No guarda
// nada propio salvo los filtros (preferencia, «es_pref»).
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { esc, hoy, aTexto } from '../subsanaciones/util.js';
import { filasHoja, leerProgramacion } from '../subsanaciones/programacion.js';
import { leerDatos } from '../subsanaciones/lotegps.js';
import { armarLista, filtrar, resumenPorZona, enlaces, SIN_ZONA } from './espartillos.js';

var PROG_CACHE = 'programacion_cache', PREF = 'es_pref', MAX = 150;
var datos = null, progDatos = null, cargadas = null, mostrar = MAX, ocupado = false;
var pref = leer(PREF, {}) || {};
pref = { zona: String(pref.zona || ''), comuna: String(pref.comuna || ''), estado: String(pref.estado || '') };

function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardarPref() { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { /* solo es la preferencia */ } }
function m2(n) { return Math.round(n).toLocaleString('es-CO') + ' m²'; }
function plural(n, uno, varios) { return n.toLocaleString('es-CO') + ' ' + (n === 1 ? uno : varios); }
function fechaCorta(f) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ''); return m ? m[3] + '/' + m[2] : (f || ''); }

// ---------- Datos ----------
// La capa se pide sin la copia del navegador: así trae la publicada en este momento (con la del equipo si no hay señal)
async function traer(url) {
    var r;
    try { r = await fetch(url, { cache: 'no-cache' }); } catch (e) { r = null; }
    if (!r || !r.ok) r = await fetch(url);
    if (!r.ok) throw new Error('no se pudo descargar ' + url + ' (' + r.status + ')');
    return r.text();
}
async function cargarCapas() {
    var nombres = ['espartillos', 'zonas', 'comunas'], capas = {}, hechas = 0;
    await Promise.all(nombres.map(async function (n) {
        capas[n] = leerDatos(await traer('data/rapido/capa_' + n + '.js'));
        hechas++;
        $('estado').textContent = 'Cargando las capas del mapa… ' + hechas + ' de ' + nombres.length;
    }));
    return capas;
}
function sifDe(p) { return p && p.prog && p.prog.sif ? p.prog.sif.esp : null; }
async function armar(recargar) {
    if (ocupado) return;
    ocupado = true;
    $('es-actualizar').disabled = true; $('es-excel').disabled = true;
    try {
        if (recargar || !cargadas) {
            $('estado').hidden = false; $('estado').textContent = 'Cargando las capas del mapa…';
            cargadas = await cargarCapas();
            cargadas.hora = new Date();
        }
        progDatos = leer(PROG_CACHE, null);
        datos = armarLista(cargadas, sifDe(progDatos));
        if (pref.zona && datos.zonas.indexOf(pref.zona) === -1) pref.zona = '';
        if (pref.comuna && datos.comunas.indexOf(pref.comuna) === -1) pref.comuna = '';
        $('estado').hidden = true; $('es-datos').hidden = false; $('es-lista-panel').hidden = false;
        pintarTodo();
        if (recargar) toast('Lista actualizada: ' + plural(datos.filas.length, 'espartillo', 'espartillos') + '.');
    } catch (e) {
        $('estado').hidden = false;
        $('estado').innerHTML = '<span class="es-falta">No se pudo armar la lista: ' + esc(e.message) + '.</span> Revise la conexión y toque ↻ Actualizar.';
    } finally {
        ocupado = false;
        $('es-actualizar').disabled = false; $('es-excel').disabled = !datos;
    }
}
async function cargarProg(file) {
    if (!file) return;
    var b = $('es-elegir');
    if (b) b.disabled = true;
    $('es-prog-msg').textContent = 'Leyendo ' + file.name + '… (un libro grande tarda unos segundos)';
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
        var nuevo = { archivo: file.name, cargado: aTexto(hoy()), prog: prog };
        try { localStorage.setItem(PROG_CACHE, JSON.stringify(nuevo)); } catch (e) { toast('No se pudo guardar en este equipo: habrá que subirlo otra vez.'); }
        toast('Programación de ' + prog.mes + ' cargada: ' + plural((prog.sif.esp || { total: 0 }).total, 'espartillo programado', 'espartillos programados') + '.');
        await armar(false);
    } catch (e) {
        $('es-prog-msg').innerHTML = '<span class="es-falta">No se pudo leer el Excel: ' + esc(e.message) + '. Revise que sea el de programación del mes.</span>';
    } finally {
        if ($('es-elegir')) $('es-elegir').disabled = false;
        $('es-archivo').value = '';
    }
}

// ---------- Pantalla ----------
function pintarTodo() { pintarFuentes(); pintarCuenta(); pintarResumen(); pintarFiltros(); pintarLista(true); }
function pintarFuentes() {
    var p = progDatos && progDatos.prog, sif = sifDe(progDatos), hora = cargadas.hora;
    var capa = '✓ Capa Espartillos del mapa: <b>' + plural(datos.filas.filter(function (f) { return f.dibujo; }).length, 'código', 'códigos') + '</b>' +
        ' <span class="sub">(traída a las ' + String(hora.getHours()).padStart(2, '0') + ':' + String(hora.getMinutes()).padStart(2, '0') + ')</span>';
    var prog;
    if (!p) prog = '<span class="es-falta">No hay programación del mes en este equipo:</span> sin ella no se ve qué está programado ni ejecutado.';
    else if (!sif || !sif.rutas) prog = '<span class="es-falta">La programación de ' + esc(p.mes) + ' se guardó antes de esta sección:</span> vuelva a elegir el Excel para ver los espartillos programados y su ejecución.';
    else prog = '✓ Programación de <b>' + esc(p.mes) + '</b>: ' + plural(sif.total, 'espartillo programado', 'espartillos programados') +
        ', ' + (sif.q1 || 0) + ' con ejecución en Q1 y ' + (sif.q2 || 0) + ' en Q2' +
        (progDatos.archivo ? ' <span class="sub">(' + esc(progDatos.archivo) + (progDatos.cargado ? ', cargada el ' + esc(progDatos.cargado) : '') + ')</span>' : '');
    $('es-fuentes').innerHTML = '<div>' + capa + '</div><div>' + prog + '</div><div id="es-prog-msg" role="status"></div>' +
        '<button type="button" class="secundario es-elegir" id="es-elegir">📁 ' + (p ? 'Cambiar el Excel de programación' : 'Elegir el Excel de programación del mes') + '</button>';
}
function dato(clase, valor, texto, extra) {
    return '<div class="es-dato ' + clase + '"><b>' + valor + '</b><span>' + texto + '</span>' + (extra ? '<small>' + extra + '</small>' : '') + '</div>';
}
function pintarCuenta() {
    var f = datos.filas, area = f.reduce(function (s, x) { return s + x.area; }, 0);
    var prog = f.filter(function (x) { return x.prog; }), ej = prog.filter(function (x) { return x.prog.q1 || x.prog.q2; });
    var sin = f.filter(function (x) { return x.zona === SIN_ZONA; }).length, rev = filtrar(f, { estado: 'revisar' }).length;
    $('es-cuenta').innerHTML = [
        dato('', f.length.toLocaleString('es-CO'), 'espartillos (códigos)', m2(area)),
        dato('', datos.zonas.filter(function (z) { return /^Zona \d+$/.test(z); }).length, 'zonas con espartillos',
            datos.zonas.filter(function (z) { return z !== SIN_ZONA && !/^Zona \d+$/.test(z); }).length + ' corregimientos · ' + datos.comunas.length + ' comunas'),
        datos.conProgramacion ? dato(ej.length === prog.length && prog.length ? 'bien' : 'ojo', ej.length + ' de ' + prog.length, 'programados con ejecución', 'este mes') : '',
        dato(rev ? 'ojo' : 'bien', rev, 'por revisar', sin ? sin + ' sin zona EMV' : 'zona o dirección')
    ].join('');
}
function pintarResumen() {
    var r = resumenPorZona(datos.filas), conP = datos.conProgramacion;
    var tot = r.reduce(function (a, x) { a.codigos += x.codigos; a.area += x.area; a.programados += x.programados; a.q1 += x.q1; a.q2 += x.q2; return a; }, { codigos: 0, area: 0, programados: 0, q1: 0, q2: 0 });
    var fila = function (x, total) {
        var activa = !total && pref.zona === x.zona;
        return '<tr' + (activa ? ' class="activa"' : '') + '>' + (total ? '<th scope="row">Total</th>' :
            '<th scope="row"><button type="button" class="es-zona-btn" data-zona="' + esc(x.zona) + '" aria-pressed="' + activa + '">' + esc(x.zona) + '</button></th>') +
            '<td>' + x.codigos + '</td><td>' + m2(x.area) + '</td>' + (conP ? '<td>' + x.programados + '</td><td>' + x.q1 + '</td><td>' + x.q2 + '</td>' : '') + '</tr>';
    };
    // En el celular van los rótulos cortos (es-corto) para que quepan las seis columnas
    var col = function (largo, corto) { return '<th scope="col"><span class="es-largo">' + largo + '</span><span class="es-corto" aria-hidden="true">' + corto + '</span></th>'; };
    $('es-resumen').innerHTML = '<thead><tr><th scope="col">Zona</th>' + col('Espartillos', 'Cant.') + col('Área', 'Área') +
        (conP ? col('Programados', 'Prog.') + col('Ejecutados Q1', 'Q1 ✓') + col('Ejecutados Q2', 'Q2 ✓') : '') + '</tr></thead><tbody>' +
        r.map(function (x) { return fila(x, false); }).join('') + fila(tot, true) + '</tbody>';
}
function opciones(lista, elegido, todos) {
    return '<option value="">' + todos + '</option>' + lista.map(function (v) { return '<option' + (v === elegido ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}
function pintarFiltros() {
    $('es-zona').innerHTML = opciones(datos.zonas, pref.zona, 'Todas');
    $('es-comuna').innerHTML = opciones(datos.comunas, pref.comuna, 'Todas');
    $('es-estado-f').value = pref.estado;
    ['programados', 'ejecutados', 'pendientes'].forEach(function (v) { $('es-estado-f').querySelector('[value="' + v + '"]').disabled = !datos.conProgramacion; });
    if (!datos.conProgramacion && pref.estado && pref.estado !== 'revisar') { pref.estado = ''; $('es-estado-f').value = ''; }
}
function estadoProg(x) {
    if (!x.prog) return datos.conProgramacion ? '<span class="es-chip">No programado este mes</span>' : '';
    var q = function (n, ok, f) { return '<span class="es-chip ' + (ok ? 'ok' : 'falta') + '">Q' + n + ': ' + (ok ? '✓ ejecutado' + (f ? ' ' + esc(fechaCorta(f)) : '') : 'sin ejecución') + '</span>'; };
    return '<span class="es-chip prog">📅 Programado</span>' + q(1, x.prog.q1, x.prog.fecha1) + q(2, x.prog.q2, x.prog.fecha2);
}
function tarjeta(x) {
    var e = enlaces(x), zona = esc(x.zona) + (x.zonaDe === 'programación' ? ' <span class="sub">(programación)</span>' : '');
    var otras = x.tambien.length ? ' · también en ' + esc(x.tambien.join(', ')) : '';
    var cerca = x.cerca ? ' · más cerca: ' + esc(x.cerca.zona) + ' (≈' + x.cerca.m.toLocaleString('es-CO') + ' m)' : '';
    return '<article class="es-item' + (x.obs.length || x.zona === SIN_ZONA ? ' revisar' : '') + '">' +
        '<div class="es-item-cab"><b class="es-codigo">' + esc(x.codigo) + '</b><span class="es-area">' + (x.area ? m2(x.area) : '') + '</span></div>' +
        '<div class="es-meta">' + zona + otras + cerca + (x.comuna ? ' · ' + esc(x.comuna) : '') + (x.piezas > 1 ? ' · ' + x.piezas + ' piezas' : '') + '</div>' +
        (x.dir ? '<div class="es-dir">' + esc(x.dir) + '</div>' : '') +
        (x.desc && x.desc !== x.dir ? '<details class="es-desc"><summary>Descripción</summary><p>' + esc(x.desc) + '</p></details>' : '') +
        '<div class="es-chips">' + estadoProg(x) + '</div>' +
        (x.prog && x.prog.obs ? '<div class="sub">Programación: ' + esc(x.prog.obs) + '</div>' : '') +
        x.obs.map(function (o) { return '<div class="es-obs">⚠ ' + esc(o) + '</div>'; }).join('') +
        (e.mapa ? '<div class="es-botones"><a class="boton secundario pequeno" href="' + esc(e.mapa) + '">🗺️ Ver en el mapa</a>' +
            '<a class="boton secundario pequeno" href="' + esc(e.google) + '" target="_blank" rel="noopener">📍 Google Maps</a>' +
            '<button type="button" class="secundario pequeno" data-copiar="' + esc(x.codigo) + '">📋 Copiar código</button></div>' : '') +
        '</article>';
}
function actuales() { return filtrar(datos.filas, { zona: pref.zona, comuna: pref.comuna, estado: pref.estado, texto: $('es-texto').value }); }
function pintarLista(deNuevo) {
    if (deNuevo) mostrar = MAX;
    var l = actuales(), area = l.reduce(function (s, x) { return s + x.area; }, 0);
    var hay = pref.zona || pref.comuna || pref.estado || $('es-texto').value.trim();
    $('es-titulo-lista').textContent = pref.zona ? 'Espartillos de ' + pref.zona : 'Espartillos de todas las zonas';
    $('es-cuantos').innerHTML = '<b>' + plural(l.length, 'espartillo', 'espartillos') + '</b> · ' + m2(area) + (hay ? ' <span class="sub">(con los filtros elegidos)</span>' : '');
    $('es-limpiar').hidden = !hay;
    $('es-lista').innerHTML = l.length ? l.slice(0, mostrar).map(tarjeta).join('') +
        (l.length > mostrar ? '<button type="button" class="secundario es-mas" id="es-mas">Ver ' + Math.min(MAX, l.length - mostrar) + ' más (de ' + (l.length - mostrar) + ' que faltan)</button>' : '')
        : '<p class="es-vacio">Ningún espartillo con esos filtros.</p>';
    pintarResumenActivo();
}
function pintarResumenActivo() {
    $('es-resumen').querySelectorAll('[data-zona]').forEach(function (b) {
        var on = b.dataset.zona === pref.zona;
        b.setAttribute('aria-pressed', on); b.closest('tr').classList.toggle('activa', on);
    });
}

// ---------- Excel ----------
async function descargar() {
    if (!datos) return;
    var b = $('es-excel');
    b.disabled = true; b.textContent = 'Armando el Excel…';
    try {
        var { excelEspartillos } = await import('./excel.js');
        var l = actuales(), mes = progDatos && progDatos.prog ? progDatos.prog.mes : '';
        var filtros = [];
        if (pref.zona) filtros.push(pref.zona);
        if (pref.comuna) filtros.push('comuna ' + pref.comuna);
        if (pref.estado) filtros.push($('es-estado-f').selectedOptions[0].textContent.toLowerCase());
        if ($('es-texto').value.trim()) filtros.push('«' + $('es-texto').value.trim() + '»');
        var blob = await excelEspartillos(l, resumenPorZona(l), { mes: mes, conProgramacion: datos.conProgramacion, filtros: filtros });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Espartillos_' + (pref.zona ? pref.zona.replace(/\s+/g, '_') + '_' : '') + hoy() + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        toast('Excel descargado: ' + plural(l.length, 'espartillo', 'espartillos') + '.');
    } catch (e) {
        toast('No se pudo armar el Excel: ' + e.message);
    } finally { b.disabled = false; b.textContent = '⬇️ Descargar Excel'; }
}

// ---------- Inicio ----------
async function arrancar() {
    iniciarEncabezado();
    if (configurado) {
        var usuario = await asegurarSesion(supabase);
        $('btn-salir').hidden = false;
        $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
        $('btn-salir').onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    }
    var archivo = document.createElement('input');
    archivo.type = 'file'; archivo.id = 'es-archivo'; archivo.hidden = true;
    archivo.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    archivo.onchange = function () { cargarProg(this.files && this.files[0]); };
    document.body.appendChild(archivo);
    $('es-fuentes').addEventListener('click', function (ev) { if (ev.target.id === 'es-elegir') archivo.click(); });
    $('es-actualizar').onclick = function () { armar(true); };
    $('btn-recargar').onclick = function () { armar(true); };
    $('es-excel').onclick = descargar;
    $('es-resumen').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-zona]');
        if (!b) return;
        pref.zona = pref.zona === b.dataset.zona ? '' : b.dataset.zona; guardarPref();
        $('es-zona').value = pref.zona; pintarLista(true);
        $('es-lista-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('es-zona').onchange = function () { pref.zona = this.value; guardarPref(); pintarLista(true); };
    $('es-comuna').onchange = function () { pref.comuna = this.value; guardarPref(); pintarLista(true); };
    $('es-estado-f').onchange = function () { pref.estado = this.value; guardarPref(); pintarLista(true); };
    var espera;
    $('es-texto').oninput = function () { clearTimeout(espera); espera = setTimeout(function () { pintarLista(true); }, 150); };
    $('es-limpiar').onclick = function () {
        pref = { zona: '', comuna: '', estado: '' }; guardarPref();
        $('es-texto').value = ''; pintarFiltros(); pintarLista(true);
    };
    $('es-lista').addEventListener('click', function (ev) {
        if (ev.target.id === 'es-mas') { mostrar += MAX; pintarLista(false); return; }
        var c = ev.target.closest('[data-copiar]');
        if (!c) return;
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(c.dataset.copiar).then(function () { toast('Código copiado: ' + c.dataset.copiar); }, function () { toast('No se pudo copiar.'); });
        else toast('Este navegador no deja copiar: use el computador o Chrome.');
    });
    // Si otra pestaña cambia la programación (📅 Programación del día, 📊 Cruce…), la lista se arma otra vez
    window.addEventListener('storage', function (ev) { if (ev.key === PROG_CACHE && cargadas) armar(false); });
    // Al volver a la página (otra pestaña, el celular en segundo plano) se revisa si cambió la programación guardada
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible' || !cargadas) return;
        var p = leer(PROG_CACHE, null);
        if (JSON.stringify(p && p.prog && p.prog.sif) !== JSON.stringify(progDatos && progDatos.prog && progDatos.prog.sif)) armar(false);
    });
    await armar(false);
}
arrancar();
