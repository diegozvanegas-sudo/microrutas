// horas.html: valida las horas extras con la HORA REAL del reporte de cumplimiento por turno (cruce por cédula y fecha)
// y devuelve el mismo Excel de horas extras con la columna H. REAL llena. Todo pasa en el navegador: los archivos no se suben.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { leerExtras, leerCumplimiento, cruzar, resumen, hhmm, minutos, duracion, diferencia, extra } from './cruce.js';
import { hojaVista, COLOR_REAL, COLOR_DISTINTO } from './vista.js';
import { htmlHoja } from '../subsanaciones/excel.js';

var $ = function (id) { return document.getElementById(id); };
var archivos = { extras: null, cumplimiento: null };   // { nombre, buffer }
var extras = null, filas = [], filtro = '';

function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

// ExcelJS (~940 kB) solo se descarga al cargar el primer archivo
var excel = null;
function cargarExcel() { return excel || (excel = import('exceljs').then(function (m) { return m.default; })); }
async function hoja(buffer) {
    var ExcelJS = await cargarExcel(), wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    // La primera hoja con datos (los reportes traen una sola, pero a veces hay hojas vacías antes)
    var ws = wb.worksheets.find(function (w) { return w.rowCount > 1; }) || wb.worksheets[0];
    return { wb: wb, ws: ws, valores: ws.getSheetValues().map(function (r) { return r || []; }) };
}

async function elegir(tipo, archivo) {
    if (!archivo) return;
    if (!/\.xlsx$/i.test(archivo.name)) return toast('Use el archivo en formato .xlsx (en Excel: Guardar como → Libro de Excel).');
    archivos[tipo] = { nombre: archivo.name, buffer: await archivo.arrayBuffer() };
    $('nombre-' + tipo).textContent = archivo.name;
    $('caja-' + tipo).classList.add('listo');
    if (archivos.extras && archivos.cumplimiento) procesar();
}

async function procesar() {
    $('estado').hidden = false; $('estado').textContent = 'Cruzando…';
    $('resultado').hidden = true;
    try {
        var a = await hoja(archivos.extras.buffer), b = await hoja(archivos.cumplimiento.buffer);
        extras = leerExtras(a.valores);
        var cumplimiento = leerCumplimiento(b.valores);
        // Si los cargaron al revés, se intercambian solos
        if (!extras && !cumplimiento) { extras = leerExtras(b.valores); cumplimiento = leerCumplimiento(a.valores); if (extras) archivos = { extras: archivos.cumplimiento, cumplimiento: archivos.extras }; }
        if (!extras) throw new Error('No encontré en el reporte de horas extras las columnas FECHA, CEDULA y H. EXTRA.');
        if (!cumplimiento) throw new Error('No encontré en el reporte de cumplimiento las columnas Fecha, HORA REAL y Dotación.');
        filas = cruzar(extras.filas, cumplimiento, +$('tolerancia').value || 0).map(function (f) {
            // Se escribe por defecto lo encontrado por cédula; lo encontrado por ruta queda para revisar
            return Object.assign(f, { usar: f.real != null && f.como === 'cedula' });
        });
        $('estado').hidden = true;
        $('resultado').hidden = false;
        pintar();
    } catch (e) {
        $('estado').textContent = '⚠ ' + e.message;
    }
}

var ESTADOS = {
    ok: ['✓ Coincide', 'ok'], mas: ['Reportó más tarde', 'mas'], menos: ['Reportó más temprano', 'menos'],
    sinhora: ['Sin hora real', 'sinhora'], nada: ['No aparece', 'nada'],
};
function pintar() {
    var r = resumen(filas);
    $('resumen').innerHTML = [
        ['', 'Todas', r.total], ['ok', '✓ Coinciden', r.ok], ['mas', '⬆ Reportaron más tarde', r.mas], ['menos', '⬇ Reportaron más temprano', r.menos],
        ['sinhora', 'Sin hora real', r.sinhora], ['nada', 'No aparecen', r.nada],
    ].map(function (x) {
        return '<button type="button" class="chip ' + x[0] + '" data-filtro="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' <b>' + x[2] + '</b></button>';
    }).join('');
    $('totales').innerHTML = 'Horas extras reportadas <b>' + duracion(r.minReportados) + '</b> · según la hora real <b>' + duracion(r.minReales) + '</b>' +
        ' · diferencia <b class="' + (r.minReales < r.minReportados ? 'rojo' : '') + '">' + duracion(r.minReales - r.minReportados, true) + '</b>' +
        '<span class="sub"> (solo las filas marcadas para escribir' + (r.porRuta ? '; ' + r.porRuta + ' encontrada(s) por ruta, revíselas' : '') + ')</span>';

    var vis = filas.filter(function (f) { return !filtro || f.estado === filtro; });
    $('tabla').innerHTML = '<thead><tr><th>Fila</th><th>Nombre</th><th>Ruta</th><th>Control</th><th>H.F</th><th>Reportada</th><th>Real</th><th>Dif.</th><th>Extra rep. → real</th><th>Escribir</th></tr></thead><tbody>' +
        vis.map(function (f) {
            var i = filas.indexOf(f), est = ESTADOS[f.estado];
            var notas = [f.como === 'ruta' ? 'por ruta, sin cédula en la dotación' : '', f.varias ? 'varias ese día: se tomó la más tarde' : '']
                .filter(Boolean);
            return '<tr class="' + est[1] + '" data-i="' + i + '">' +
                '<td class="num">' + f.fila + '</td>' +
                '<td class="persona"><b>' + esc(f.nombre) + '</b><span class="sub">' + esc(f.cargo) + ' · ' + esc(f.cedula) + '</span>' +
                (notas.length ? '<span class="nota">⚠ ' + esc(notas.join(' · ')) + '</span>' : '') + '</td>' +
                comparada(f.rutaVer || f.ruta, f.difRuta, f.rutaReal) + comparada(f.control, f.difControl, f.controlReal) +
                '<td class="num">' + hhmm(f.hf) + '</td><td class="num">' + hhmm(f.extra) + '</td>' +
                '<td><input type="time" value="' + hhmm(f.real) + '" aria-label="Hora real de ' + esc(f.nombre) + '"></td>' +
                '<td class="num dif">' + duracion(f.diferencia, true) + '<span class="sub">' + est[0] + '</span></td>' +
                '<td class="num">' + duracion(f.extraReportada) + ' → ' + (f.extraReal == null ? '–' : duracion(f.extraReal)) + '</td>' +
                '<td class="centro"><input type="checkbox"' + (f.usar ? ' checked' : '') + (f.real == null ? ' disabled' : '') + ' aria-label="Escribir en H. REAL"></td></tr>';
        }).join('') + '</tbody>';
    var n = filas.filter(function (f) { return f.usar && f.real != null; }).length;
    $('btn-descargar').textContent = '⬇ Descargar Excel con H. REAL (' + n + ')';
    $('btn-descargar').disabled = !n;
}

// Celda de ruta o control: en rojo si no coincide con el cumplimiento, con lo que dice el cumplimiento debajo
function comparada(valor, distinto, real) {
    if (!distinto) return '<td>' + esc(valor) + '</td>';
    return '<td class="distinto" title="No coincide con el reporte de cumplimiento">' + esc(valor) + '<span class="sub">cumpl.: ' + esc(real) + '</span></td>';
}

// Corregir a mano la hora real de una fila: se recalcula su diferencia y estado
function cambiarHora(f, valor) {
    var tol = +$('tolerancia').value || 0;
    f.real = minutos(valor);
    f.diferencia = diferencia(f.hi, f.extra, f.real);
    f.extraReal = extra(f.hi, f.hf, f.real);
    f.estado = f.real == null ? (f.candidatos.length ? 'sinhora' : 'nada') : Math.abs(f.diferencia) <= tol ? 'ok' : f.diferencia < 0 ? 'mas' : 'menos';
    f.usar = f.real != null;
}

// El consolidado: el mismo libro de horas extras con la H. REAL escrita y coloreada (lo usan la vista previa y la descarga)
async function armarLibro() {
    var b = await hoja(archivos.extras.buffer), col = extras.cols.real;
    if (col == null) {
        // Sin columna H. REAL: se agrega al final
        col = b.ws.columnCount + 1;
        b.ws.getRow(extras.encabezado).getCell(col).value = 'H. REAL';
    }
    // Formato propio de la celda: las celdas del archivo comparten el objeto de estilo y cambiarlo en una
    // sombreaba toda la columna. Copia del estilo, con el sombreado (y lo demás que se pida)
    function sombrear(celda, color, mas) {
        celda.style = Object.assign(JSON.parse(JSON.stringify(celda.style || {})), mas, {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
        });
    }
    var formato = null;
    filas.forEach(function (f) {
        // RUTA y CONTROL que no coinciden con el cumplimiento, en rojo claro
        if (f.difRuta) sombrear(b.ws.getRow(f.fila).getCell(extras.cols.ruta), COLOR_DISTINTO);
        if (f.difControl) sombrear(b.ws.getRow(f.fila).getCell(extras.cols.control), COLOR_DISTINTO);
        if (!f.usar || f.real == null) return;
        var celda = b.ws.getRow(f.fila).getCell(col);
        formato = formato || b.ws.getRow(f.fila).getCell(extras.cols.extra).numFmt || 'h:mm';
        // Las horas en Excel son fracciones de día: se escriben como hora de 1899, igual que H.I, H.F y H. EXTRA
        celda.value = new Date(Date.UTC(1899, 11, 30, Math.floor(f.real / 60), f.real % 60));
        sombrear(celda, COLOR_REAL, { numFmt: formato });
    });
    // Que Excel recalcule el TOTAL (H. REAL − H.F) al abrir
    b.wb.calcProperties = Object.assign({}, b.wb.calcProperties, { fullCalcOnLoad: true });
    return b;
}

// ---------- Vista previa del Excel consolidado (como la de Subsanaciones) ----------
var hojaActual = null, zoomXl = 1;
try { zoomXl = Math.min(2, Math.max(0.25, +localStorage.getItem('excel_zoom') || 1)); } catch (e) {}
function aplicarZoom(z) {
    if (z) zoomXl = Math.round(Math.min(2, Math.max(0.25, z)) * 100) / 100;
    var t = $('excel-vista').querySelector('.xl');
    if (t) t.style.zoom = zoomXl;
    $('excel-nivel').textContent = Math.round(zoomXl * 100) + ' %';
    try { localStorage.setItem('excel_zoom', zoomXl); } catch (e) {}
}
function ampliarExcel(si) {
    $('dlg-excel').classList.toggle('completo', si);
    $('excel-ampliar').textContent = si ? '⤡' : '⤢';
    $('excel-ampliar').title = $('excel-ampliar').ariaLabel = si ? 'Tamaño normal' : 'Pantalla completa';
    try { localStorage.setItem('excel_completo', si ? '1' : ''); } catch (e) {}
}
async function verExcel() {
    var b = await armarLibro();
    hojaActual = hojaVista(b.ws, extras.encabezado, b.ws.name);
    var n = filas.filter(function (f) { return f.usar && f.real != null; }).length;
    $('excel-info').textContent = '· ' + hojaActual.filas.length + ' personas · ' + n + ' con H. REAL';
    $('excel-hojas').innerHTML = '<button type="button" role="tab" aria-selected="true">' + esc(hojaActual.nombre) + ' <small>' + hojaActual.filas.length + '</small></button>';
    $('excel-vista').innerHTML = htmlHoja(hojaActual);
    $('excel-vista').scrollTo(0, 0);
    aplicarZoom();
    if (!$('dlg-excel').open) $('dlg-excel').showModal();
}

async function descargar() {
    var b = await armarLibro();
    var datos = await b.wb.xlsx.writeBuffer();
    var url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = document.createElement('a');
    a.href = url; a.download = archivos.extras.nombre.replace(/\.xlsx$/i, '') + ' - con hora real.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Listo: se descargó el Excel con la H. REAL.');
}

function arrancar() {
    iniciarEncabezado();
    ['extras', 'cumplimiento'].forEach(function (tipo) {
        var caja = $('caja-' + tipo), input = $('archivo-' + tipo);
        input.onchange = function () { elegir(tipo, input.files[0]); };
        // También se pueden arrastrar los archivos encima
        caja.addEventListener('dragover', function (ev) { ev.preventDefault(); caja.classList.add('encima'); });
        caja.addEventListener('dragleave', function () { caja.classList.remove('encima'); });
        caja.addEventListener('drop', function (ev) { ev.preventDefault(); caja.classList.remove('encima'); elegir(tipo, ev.dataTransfer.files[0]); });
    });
    $('tolerancia').onchange = function () { if (archivos.extras && archivos.cumplimiento) procesar(); };
    $('resumen').onclick = function (ev) { var b = ev.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintar(); } };
    $('tabla').addEventListener('change', function (ev) {
        var tr = ev.target.closest('[data-i]');
        if (!tr) return;
        var f = filas[+tr.dataset.i];
        if (ev.target.type === 'checkbox') f.usar = ev.target.checked;
        if (ev.target.type === 'time') cambiarHora(f, ev.target.value);
        pintar();
    });
    $('btn-descargar').onclick = function () { descargar().catch(function (e) { toast('No se pudo armar el Excel: ' + e.message); }); };
    $('btn-ver-excel').onclick = function () { verExcel().catch(function (e) { toast('No se pudo armar la vista previa: ' + e.message); }); };
    $('excel-descargar').onclick = $('btn-descargar').onclick;
    $('excel-cerrar').onclick = function () { $('dlg-excel').close(); };
    $('excel-menos').onclick = function () { aplicarZoom(zoomXl - (zoomXl > 1 ? 0.25 : 0.1)); };
    $('excel-mas').onclick = function () { aplicarZoom(zoomXl + (zoomXl >= 1 ? 0.25 : 0.1)); };
    $('excel-nivel').onclick = function () { aplicarZoom(1); };
    // Ancho de la hoja al 100 %: columna de números (34 px) + cada columna (ancho × 7 + 5 px, como htmlHoja) + bordes
    $('excel-ajustar').onclick = function () {
        if (!hojaActual) return;
        var ancho = hojaActual.anchos.reduce(function (s, w) { return s + w * 7 + 6; }, 36);
        aplicarZoom(($('excel-vista').clientWidth - 4) / ancho);
    };
    $('excel-vista').addEventListener('wheel', function (ev) {
        if (!ev.ctrlKey) return;
        ev.preventDefault();
        aplicarZoom(zoomXl * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    try { ampliarExcel(localStorage.getItem('excel_completo') === '1'); } catch (e) {}
    $('excel-ampliar').onclick = function () { ampliarExcel(!$('dlg-excel').classList.contains('completo')); };

    // La sesión es la de siempre (para el menú); los archivos nunca se envían a Supabase
    if (!configurado) return;
    asegurarSesion(supabase).then(function (usuario) {
        var salir = $('btn-salir');
        salir.hidden = false;
        salir.title = 'Cerrar sesión de ' + usuario.email;
        salir.onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    });
}

arrancar();
