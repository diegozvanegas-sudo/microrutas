// horas.html: valida las horas extras con la HORA REAL del reporte de cumplimiento por turno (cruce por cédula y fecha)
// y devuelve el mismo Excel de horas extras con la columna H. REAL llena. Con los horarios de rutas de la base de datos
// (horarios.html) marca además la H.I y la H.F que no son las del horario, y reparte el extra en OD, ON, FD y FN (distribucion.js). Los dos reportes se leen en el navegador: no se suben.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { leerExtras, leerCumplimiento, cruzar, resumen, hhmm, minutos, duracion, diferencia, extra, plano } from './cruce.js';
import { distribuir, enHoras, MINIMO } from './distribucion.js';
import { hojaVista, COLOR_REAL, COLOR_COINCIDE, COLOR_DISTINTO } from './vista.js';
import { revisarHorario, textoDias, NOMBRES_DIAS, TURNO } from '../horarios/horarios.js';
import { horariosGuardados, textoGuardados } from '../horarios/guardado.js';
import { htmlHoja } from '../subsanaciones/excel.js';

var $ = function (id) { return document.getElementById(id); };
var archivos = { extras: null, cumplimiento: null };   // { nombre, buffer }
var extras = null, filas = [], filtro = '', omitidos = 0;   // omitidos: filas que no son de conductores
var horarios = null;   // de la base de datos, al tener sesión

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

// Horarios de rutas: los de la base de datos (se cargan en horarios.html)
function mostrarHorarios(error) {
    $('nombre-horarios').textContent = error ? '⚠ No se pudieron leer: ' + error : horarios ? textoGuardados(horarios) : 'Todavía no hay horarios cargados: se cargan en Horarios de rutas';
    $('caja-horarios').classList.toggle('listo', !!horarios);
}
function malHorario(f) { return f.difHi || f.difHf; }

// Reparto del extra de la fila: de la H.F a la H. REAL si se va a escribir; si no, a la H. EXTRA reportada.
// -> horas enteras { od, on, fd, fn, total } con los minutos exactos en .min, o null si falta algo
var CLASES = [['od', 'OD'], ['on', 'ON'], ['fd', 'FD'], ['fn', 'FN']];
function reparto(f) {
    var d = distribuir(f.fecha, f.hi, f.hf, f.usar && f.real != null ? f.real : f.extra);
    return d && Object.assign(enHoras(d), { min: d });
}
function celdaReparto(f) {
    var d = reparto(f);
    if (!d) return '<td class="reparto">–</td>';
    if (!d.min.total) return '<td class="reparto sub" title="Con menos de ' + MINIMO + ' minutos no hay extra">sin extra (&lt; ' + MINIMO + ' min)</td>';
    var exacto = CLASES.filter(function (c) { return d.min[c[0]]; }).map(function (c) { return c[1] + ' ' + duracion(d.min[c[0]]); }).join(' · ');
    return '<td class="reparto" title="Minutos exactos: ' + esc(exacto) + '">' + (CLASES.filter(function (c) { return d[c[0]]; }).map(function (c) {
        return '<span class="clase ' + c[0] + '">' + c[1] + ' ' + d[c[0]] + '</span>';
    }).join(' ') || '<span class="sub">0 horas</span>') +
        '<span class="sub">' + d.total + (d.total === 1 ? ' hora' : ' horas') + ' (' + duracion(d.min.total) + ' exactas) con la ' + (f.usar && f.real != null ? 'H. REAL' : 'H. EXTRA') + '</span></td>';
}

function esConductor(f) { return plano(f.cargo).indexOf('conductor') >= 0; }

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
        // Todo (H. REAL, ruta, control, horario, colores y distribución) solo para los conductores: los tripulantes
        // no se revisan ni se tocan en el Excel
        var conductores = extras.filas.filter(esConductor);
        omitidos = extras.filas.length - conductores.length;
        filas = cruzar(conductores, cumplimiento, +$('tolerancia').value || 0).map(function (f) {
            // Se escribe por defecto lo encontrado por cédula; lo encontrado por ruta queda para revisar
            return Object.assign(f, { usar: f.real != null && f.como === 'cedula' }, revisarHorario(f, horarios));
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
        ['horario', '🕒 Horario incorrecto', filas.filter(malHorario).length],
        ['distinto', 'Ruta o control distinto', filas.filter(function (f) { return f.difRuta || f.difControl; }).length],
    ].filter(function (x) { return x[0] !== 'horario' || horarios; }).map(function (x) {
        return '<button type="button" class="chip ' + x[0] + '" data-filtro="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' <b>' + x[2] + '</b></button>';
    }).join('');
    $('totales').innerHTML = 'Solo conductores' + (omitidos ? ' (' + omitidos + (omitidos === 1 ? ' fila de tripulante u otro cargo no se revisa' : ' filas de tripulantes u otros cargos no se revisan') + ')' : '') + '.<br>' +
        'Horas extras reportadas <b>' + duracion(r.minReportados) + '</b> · según la hora real <b>' + duracion(r.minReales) + '</b>' +
        ' · diferencia <b class="' + (r.minReales < r.minReportados ? 'rojo' : '') + '">' + duracion(r.minReales - r.minReportados, true) + '</b>' +
        '<span class="sub"> (solo las filas marcadas para escribir' + (r.porRuta ? '; ' + r.porRuta + ' encontrada(s) por ruta, revíselas' : '') + ')</span>';
    var suma = { od: 0, on: 0, fd: 0, fn: 0, total: 0 };
    filas.forEach(function (f) { var d = reparto(f); if (d) Object.keys(suma).forEach(function (k) { suma[k] += d[k]; }); });
    $('totales').innerHTML += '<br>Distribución: ' + CLASES.map(function (c) { return '<span class="clase ' + c[0] + '">' + c[1] + ' <b>' + suma[c[0]] + '</b></span>'; }).join(' ') +
        ' · total <b>' + suma.total + (suma.total === 1 ? ' hora' : ' horas') + '</b>';

    var vis = filas.filter(function (f) {
        return !filtro || f.estado === filtro || filtro === 'horario' && malHorario(f) || filtro === 'distinto' && (f.difRuta || f.difControl);
    });
    $('tabla').innerHTML = '<thead><tr><th>Fila</th><th>Nombre</th><th>Ruta</th><th>Control</th><th>H.I</th><th>H.F</th><th>Reportada</th><th>Real</th><th>Dif.</th><th>Extra rep. → real</th><th>OD · ON · FD · FN</th><th>Escribir</th></tr></thead><tbody>' +
        vis.map(function (f) {
            var i = filas.indexOf(f), est = ESTADOS[f.estado];
            var notas = [f.como === 'ruta' ? 'por ruta, sin cédula en la dotación' : '', f.varias ? 'varias ese día: se tomó la más tarde' : '',
                f.fueraDeDia ? 'la ruta no sale los ' + NOMBRES_DIAS[f.dia] + ' (sale ' + textoDias(f.horario.dias) + ')' : '',
                horarios && !f.horario && /^\d+$/.test(f.ruta) ? 'la ruta no está en los horarios' : '']
                .filter(Boolean);
            var e = estadoFila(f);
            return '<tr class="' + est[1] + (e ? ' fila-' + e : '') + '" data-i="' + i + '">' +
                '<td class="num">' + f.fila + '</td>' +
                '<td class="persona"><b>' + esc(f.nombre) + '</b><span class="sub">' + esc(f.cargo) + ' · ' + esc(f.cedula) + '</span>' +
                (notas.length ? '<span class="nota">⚠ ' + esc(notas.join(' · ')) + '</span>' : '') + '</td>' +
                comparada(f.rutaVer || f.ruta, f.difRuta, f.rutaReal, revisada(f).ruta) + comparada(f.control, f.difControl, f.controlReal, revisada(f).control) +
                horaRevisada(f.hi, f.difHi, f.esperadas, revisada(f).hi) +
                horaRevisada(f.hf, f.difHf, (f.esperadas || []).map(function (x) { return (x + TURNO) % 1440; }), revisada(f).hf) + '<td class="num">' + hhmm(f.extra) + '</td>' +
                '<td><input type="time" value="' + hhmm(f.real) + '" aria-label="Hora real de ' + esc(f.nombre) + '"></td>' +
                '<td class="num dif' + (f.estado === 'ok' ? ' coincide' : f.estado === 'mas' || f.estado === 'menos' ? ' inconsistente' : '') + '">' + duracion(f.diferencia, true) + '<span class="sub">' + est[0] + '</span></td>' +
                '<td class="num">' + duracion(f.extraReportada) + ' → ' + (f.extraReal == null ? '–' : duracion(f.extraReal)) + '</td>' + celdaReparto(f) +
                '<td class="centro"><input type="checkbox"' + (f.usar ? ' checked' : '') + (f.real == null ? ' disabled' : '') + ' aria-label="Escribir en H. REAL"></td></tr>';
        }).join('') + '</tbody>';
    var n = filas.filter(function (f) { return f.usar && f.real != null; }).length;
    $('btn-descargar').textContent = '⬇ Descargar Excel con H. REAL (' + n + ')';
    $('btn-descargar').disabled = !n;
}

// La fila completa: 'mal' si algo no coincide (ruta, control, H.I, H.F o la hora extra frente a la real), 'bien' si la hora
// extra coincide con la real y lo demás también; '' sin hora real para comparar (sin color)
function estadoFila(f) {
    if (f.difRuta || f.difControl || f.difHi || f.difHf || f.estado === 'mas' || f.estado === 'menos') return 'mal';
    return f.estado === 'ok' ? 'bien' : '';
}

// Qué celdas de la fila se pudieron revisar: la ruta y el control si el cumplimiento los trae, y la H.I y la H.F
// si la ruta está en los horarios con hora de salida. Solo esas se pintan: amarillo si coinciden, rojo si no
function revisada(f) {
    var conHorario = !!f.horario && !!(f.esperadas && f.esperadas.length);
    return { ruta: !!f.ruta && !!f.rutaReal, control: !!f.control && !!f.controlReal, hi: conHorario && f.hi != null, hf: conHorario && f.hf != null };
}

// Celda de ruta o control: amarilla si coincide con el cumplimiento; roja si no, con lo que dice el cumplimiento debajo
function comparada(valor, distinto, real, revisar) {
    if (!distinto) return '<td' + (revisar ? ' class="coincide" title="Coincide con el reporte de cumplimiento"' : '') + '>' + esc(valor) + '</td>';
    return '<td class="inconsistente" title="No coincide con el reporte de cumplimiento">' + esc(valor) + '<span class="sub">cumpl.: ' + esc(real) + '</span></td>';
}

// Celda de H.I o H.F: amarilla si es la del horario de la ruta ese día; roja si no, con la del horario debajo
function horaRevisada(valor, mal, esperadas, revisar) {
    if (!mal) return '<td class="num' + (revisar ? ' coincide" title="Es la del horario de la ruta' : '') + '">' + hhmm(valor) + '</td>';
    return '<td class="num inconsistente" title="No es la del horario de la ruta">' + hhmm(valor) + '<span class="sub">horario: ' + esc(esperadas.map(hhmm).join(' o ')) + '</span></td>';
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
    // Hasta qué columna va la fila: la última con título
    var ultima = col;
    b.ws.getRow(extras.encabezado).eachCell(function (c, i) { if (String(c.value == null ? '' : c.value).trim()) ultima = Math.max(ultima, i); });
    var formato = null;
    filas.forEach(function (f) {
        var fila = b.ws.getRow(f.fila);
        formato = formato || b.ws.getRow(f.fila).getCell(extras.cols.extra).numFmt || 'h:mm';
        // OD, ON, FD, FN y su TOTAL, en horas enteras (si el archivo trae esas columnas)
        var d = reparto(f);
        if (d) CLASES.concat([['total']]).forEach(function (c) {
            var k = c[0] === 'total' ? 'totalDist' : c[0];
            if (extras.cols[k] == null) return;
            var celda = fila.getCell(extras.cols[k]);
            celda.value = d[c[0]];
            celda.style = Object.assign(JSON.parse(JSON.stringify(celda.style || {})), { numFmt: '0' });
        });
        // TOTAL (H. REAL − H.F): si la llegada pasa la medianoche la resta da negativa y Excel muestra ######.
        // Con MOD(…;1) da la hora de más (23:00 → 0:01 = 1:01) y sin H. REAL queda vacío
        var tot = extras.cols.total != null && fila.getCell(extras.cols.total), fm = tot && tot.value && tot.value.formula;
        var resta = fm && /^\s*([A-Z]+\d+)\s*-\s*([A-Z]+\d+)\s*$/.exec(fm);
        if (resta) tot.value = { formula: 'IF(' + resta[1] + '="","",MOD(' + resta[1] + '-' + resta[2] + ',1))' };
        if (f.usar && f.real != null) {
            var celda = fila.getCell(col);
            // Las horas en Excel son fracciones de día: se escriben como hora de 1899, igual que H.I, H.F y H. EXTRA
            celda.value = new Date(Date.UTC(1899, 11, 30, Math.floor(f.real / 60), f.real % 60));
            sombrear(celda, COLOR_REAL, { numFmt: formato });
        }
        // Toda la fila: amarilla si está bien y roja si tiene alguna inconsistencia (las celdas que fallan, además, en negrilla)
        var e = estadoFila(f);
        if (!e) return;
        var malas = [f.difRuta && extras.cols.ruta, f.difControl && extras.cols.control, f.difHi && extras.cols.hi, f.difHf && extras.cols.hf,
            (f.estado === 'mas' || f.estado === 'menos') && extras.cols.extra];
        for (var i = 1; i <= ultima; i++) {
            var c = fila.getCell(i);
            sombrear(c, e === 'mal' ? COLOR_DISTINTO : COLOR_COINCIDE, malas.indexOf(i) >= 0 ? { font: Object.assign({}, c.font, { bold: true, color: { argb: 'FF7F0000' } }) } : null);
        }
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
        horariosGuardados(supabase).then(function (h) {
            horarios = h;
            mostrarHorarios();
            if (archivos.extras && archivos.cumplimiento) procesar();
        }, function (e) { mostrarHorarios(e.message); });
    });
}

arrancar();
