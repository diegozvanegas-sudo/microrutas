// horas.html: valida las horas extras con la HORA REAL del reporte de cumplimiento por turno (cruce por cédula y fecha)
// y devuelve el mismo Excel de horas extras con la columna H. REAL llena. Con los horarios de rutas de la base de datos
// (horarios.html) marca además la H.I y la H.F que no son las del horario, y reparte el extra en OD, ON, FD y FN (distribucion.js). Los dos reportes se leen en el navegador: no se suben.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { leerExtras, leerCumplimiento, cruzar, resumen, hhmm, minutos, duracion, diferencia, extra, completarTripulantes, esConductor, fechasSinCumplimiento } from './cruce.js';
import { conHorario, horarioTripulacion } from './horario.js';
import { distribuir, enHoras, MINIMO } from './distribucion.js';
import { hojaVista, COLOR_REAL, COLOR_REPORTADA, COLOR_COINCIDE, COLOR_DISTINTO } from './vista.js';
import { textoDias, NOMBRES_DIAS, TURNO } from '../horarios/horarios.js';
import { horariosGuardados, textoGuardados } from '../horarios/guardado.js';
import { htmlHoja } from '../subsanaciones/excel.js';

var $ = function (id) { return document.getElementById(id); };
var archivos = { extras: null, cumplimiento: null };   // extras: { nombre, buffer }; cumplimiento: [{ nombre, buffer }] (uno o varios)
var extras = null, filas = [], filtro = '', cargo = '', sinDia = null;   // cargo: '' (todos), 'conductor' o 'tripulante'
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

// Del cumplimiento se pueden cargar varios a la vez (p. ej. el de ayer y uno bajado más tarde, cuando la plataforma
// ya llenó más HORAS REALES): se cruzan todos juntos
async function elegir(tipo, lista) {
    lista = Array.prototype.slice.call(lista || []);
    if (!lista.length) return;
    if (lista.some(function (a) { return !/\.xlsx$/i.test(a.name); })) return toast('Use el archivo en formato .xlsx (en Excel: Guardar como → Libro de Excel).');
    if (tipo === 'extras') lista = lista.slice(0, 1);
    var leidos = await Promise.all(lista.map(async function (a) { return { nombre: a.name, buffer: await a.arrayBuffer() }; }));
    archivos[tipo] = tipo === 'extras' ? leidos[0] : leidos;
    $('nombre-' + tipo).textContent = leidos.map(function (a) { return a.nombre; }).join(' · ');
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

// Hora que se escribe en H. REAL: la real; sin ella (no vino en el cumplimiento) y marcada, la H. EXTRA reportada
function horaEscrita(f) { return !f.usar ? null : f.real != null ? f.real : f.extra; }
function sePuedeEscribir(f) { return f.real != null || f.extra != null; }

async function procesar() {
    $('estado').hidden = false; $('estado').textContent = 'Cruzando…';
    $('resultado').hidden = true;
    try {
        var a = await hoja(archivos.extras.buffer), bs = await Promise.all(archivos.cumplimiento.map(function (x) { return hoja(x.buffer); }));
        extras = leerExtras(a.valores);
        var leidos = bs.map(function (b) { return leerCumplimiento(b.valores); });
        // Si los cargaron al revés (uno y uno), se intercambian solos
        if (!extras && bs.length === 1 && !leidos[0]) {
            extras = leerExtras(bs[0].valores); leidos = [leerCumplimiento(a.valores)];
            if (extras) archivos = { extras: archivos.cumplimiento[0], cumplimiento: [archivos.extras] };
        }
        if (!extras) throw new Error('No encontré en el reporte de horas extras las columnas FECHA, CEDULA y H. EXTRA.');
        var malo = leidos.indexOf(null);
        if (malo !== -1) throw new Error('No encontré en ' + archivos.cumplimiento[malo].nombre + ' las columnas Fecha, HORA REAL y Dotación.');
        var cumplimiento = [].concat.apply([], leidos);
        sinDia = fechasSinCumplimiento(extras.filas, cumplimiento);
        // Conductores y tripulantes, cada uno por su cédula. El tripulante sin hora propia toma la del conductor de su
        // ruta y control (queda para revisar)
        var tol = +$('tolerancia').value || 0;
        filas = horarioTripulacion(completarTripulantes(cruzar(extras.filas, cumplimiento, tol), tol).map(function (f) {
            // Se escribe por defecto lo encontrado por cédula; lo encontrado por ruta o por el conductor queda para revisar
            return Object.assign(f, { usar: f.real != null && f.como === 'cedula' }, conHorario(f, horarios));
        }), horarios);
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
// '2026-10-27' -> '27/10/2026'
function fechaVer(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : iso; }
var SIN_CEDULA = { ruta: 'por la ruta: su cédula ni su nombre están en la dotación', control: 'por el control (camión), que llegó cerca de su H.F: su cédula, nombre y ruta no están ese día',
    nombre: 'por el nombre: su cédula no está en la dotación (revise la cédula)' };
function delCargo(f) { return !cargo || (cargo === 'conductor') === esConductor(f); }
function visible(f) {
    if (!delCargo(f)) return false;
    return !filtro || f.estado === filtro || filtro === 'horario' && malHorario(f) || filtro === 'distinto' && (f.difRuta || f.difControl);
}
function pintar() {
    var r = resumen(filas.filter(delCargo)), nCond = filas.filter(esConductor).length, nTrip = filas.length - nCond;
    document.querySelectorAll('[data-cargo]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.cargo === cargo); });
    // Sin hora real: casi siempre es que el cumplimiento se bajó antes de que la plataforma la llenara
    var sinHora = filas.filter(function (f) { return delCargo(f) && f.estado === 'sinhora'; }).length, noEstan = filas.filter(function (f) { return delCargo(f) && f.estado === 'nada' && !(sinDia && sinDia.faltan.indexOf(f.fecha) >= 0); }).length;
    // Si el cumplimiento no trae el día, eso se dice primero (y esas personas no se cuentan otra vez como «no aparecen»)
    var otroDia = sinDia && sinDia.faltan.length;
    $('aviso-horas').hidden = !(sinHora || noEstan || otroDia);
    $('aviso-horas').innerHTML = (otroDia ? '⚠ <b>El cumplimiento cargado no trae el ' + sinDia.faltan.map(fechaVer).join(', ') + '</b>' +
        (sinDia.trae.length ? ' (trae ' + sinDia.trae.map(fechaVer).join(', ') + ')' : '') + ': por eso esas personas salen «No aparece». Descargue el reporte de cumplimiento de ese día y súbalo en «2».<br>' : '') +
        (sinHora ? '⚠ <b>' + sinHora + '</b> ' + (sinHora === 1 ? 'está' : 'están') + ' en el cumplimiento pero esa fila <b>no trae HORA REAL</b> (la plataforma aún no la había llenado). ' +
        'Descargue el reporte de cumplimiento más tarde y súbalo también en «2»: se cruzan juntos. ' : '') +
        (noEstan ? (sinHora ? '<br>' : '⚠ ') + '<b>' + noEstan + '</b> no ' + (noEstan === 1 ? 'aparece' : 'aparecen') + ' ese día: ni su cédula, ni su nombre, ni su ruta, ni su control están en el cumplimiento. Escriba la hora a mano si la tiene.' : '');
    $('resumen').innerHTML = [
        ['', 'Todas', r.total], ['ok', '✓ Coinciden', r.ok], ['mas', '⬆ Reportaron más tarde', r.mas], ['menos', '⬇ Reportaron más temprano', r.menos],
        ['sinhora', 'Sin hora real', r.sinhora], ['nada', 'No aparecen', r.nada],
        ['horario', '🕒 Horario incorrecto', filas.filter(malHorario).length],
        ['distinto', 'Ruta o control distinto', filas.filter(function (f) { return f.difRuta || f.difControl; }).length],
    ].filter(function (x) { return x[0] !== 'horario' || horarios; }).map(function (x) {
        return '<button type="button" class="chip ' + x[0] + '" data-filtro="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' <b>' + x[2] + '</b></button>';
    }).join('');
    $('totales').innerHTML = nCond + (nCond === 1 ? ' conductor' : ' conductores') + ' · ' + nTrip + (nTrip === 1 ? ' tripulante' : ' tripulantes') + (cargo ? ' (se ven solo los ' + (cargo === 'conductor' ? 'conductores' : 'tripulantes') + ')' : '') + '.<br>' +
        'Horas extras reportadas <b>' + duracion(r.minReportados) + '</b> · según la hora real <b>' + duracion(r.minReales) + '</b>' +
        ' · diferencia <b class="' + (r.minReales < r.minReportados ? 'rojo' : '') + '">' + duracion(r.minReales - r.minReportados, true) + '</b>' +
        '<span class="sub"> (solo las filas marcadas para escribir' + (r.porRuta ? '; ' + r.porRuta + ' encontrada(s) sin la cédula (por nombre, ruta o control), revíselas' : '') + ')</span>';
    var suma = { od: 0, on: 0, fd: 0, fn: 0, total: 0 };
    filas.filter(delCargo).forEach(function (f) { var d = reparto(f); if (d) Object.keys(suma).forEach(function (k) { suma[k] += d[k]; }); });
    $('totales').innerHTML += '<br>Distribución: ' + CLASES.map(function (c) { return '<span class="clase ' + c[0] + '">' + c[1] + ' <b>' + suma[c[0]] + '</b></span>'; }).join(' ') +
        ' · total <b>' + suma.total + (suma.total === 1 ? ' hora' : ' horas') + '</b>';

    var vis = filas.filter(visible);
    // ☑ en el encabezado: marca o desmarca todas las filas que se ven (con el filtro puesto, solo esas)
    var marcables = vis.filter(sePuedeEscribir), todas = marcables.length && marcables.every(function (f) { return f.usar; });
    $('tabla').innerHTML = '<thead><tr><th>Fila</th><th>Nombre</th><th>Ruta</th><th>Control</th><th>H.I</th><th>H.F</th><th>Reportada</th><th>Real</th><th>Dif.</th><th>Extra rep. → real</th><th>OD · ON · FD · FN</th>' +
        '<th class="centro"><label class="todas" title="Marcar o desmarcar todas las filas que se ven">Escribir<input type="checkbox" data-todas' + (todas ? ' checked' : '') + (marcables.length ? '' : ' disabled') + ' aria-label="Seleccionar todas"></label></th></tr></thead><tbody>' +
        vis.map(function (f) {
            var i = filas.indexOf(f), est = ESTADOS[f.estado];
            var notas = [SIN_CEDULA[f.como] || '', f.como === 'conductor' ? 'hora del conductor de la ruta (' + f.conductor + '): revísela' : '',
                f.como === 'companero' ? 'hora del compañero de la ruta (' + f.conductor + '): revísela' : '',
                f.otrosDias && f.otrosDias.length ? 'aparece el ' + f.otrosDias.map(fechaVer).join(', ') + ', no el ' + fechaVer(f.fecha) : '', f.varias ? 'varias ese día: se tomó la más tarde' : '',
                f.fueraDeDia ? 'la ruta no sale los ' + NOMBRES_DIAS[f.dia] + ' (sale ' + textoDias(f.horario.dias) + ')' : '',
                f.rutaHorario ? 'H.I y H.F revisadas con el horario de la ruta ' + f.rutaHorario + (f.horarioDe ? ', la de su compañero ' + f.horarioDe : ' del cumplimiento') : '',
                horarios && !f.horario && /^\d+$/.test(f.ruta) ? 'la ruta no está en los horarios' : '']
                .filter(Boolean);
            return '<tr class="' + est[1] + '" data-i="' + i + '">' +
                '<td class="num">' + f.fila + '</td>' +
                '<td class="persona"><b>' + esc(f.nombre) + '</b><span class="sub">' + esc(f.cargo) + ' · ' + esc(f.cedula) + '</span>' +
                (notas.length ? '<span class="nota">⚠ ' + esc(notas.join(' · ')) + '</span>' : '') + '</td>' +
                comparada(f.rutaVer || f.ruta, f.difRuta, f.rutaReal, revisada(f).ruta) + comparada(f.control, f.difControl, f.controlReal, revisada(f).control) +
                horaRevisada(f.hi, f.difHi, f.esperadas, revisada(f).hi) +
                horaRevisada(f.hf, f.difHf, (f.esperadas || []).map(function (x) { return (x + TURNO) % 1440; }), revisada(f).hf) + '<td class="num">' + hhmm(f.extra) + '</td>' +
                '<td><input type="time" value="' + hhmm(f.real) + '" aria-label="Hora real de ' + esc(f.nombre) + '">' +
                    (f.real == null ? '<span class="por-que">' + (f.estado === 'nada' ? 'no aparece ese día' : 'sin HORA REAL en el cumplimiento') + '</span>' : f.como === 'conductor' ? '<span class="por-que">del conductor</span>' : f.como === 'companero' ? '<span class="por-que">del compañero</span>' : '') + '</td>' +
                '<td class="num dif">' + duracion(f.diferencia, true) + '<span class="sub">' + est[0] + '</span></td>' +
                '<td class="num">' + duracion(f.extraReportada) + ' → ' + (f.extraReal == null ? '–' : duracion(f.extraReal)) + '</td>' + celdaReparto(f) +
                '<td class="centro"><input type="checkbox"' + (f.usar ? ' checked' : '') + (sePuedeEscribir(f) ? '' : ' disabled') +
                    (f.real == null ? ' title="Sin hora real: se escribe la H. EXTRA reportada (en naranja)"' : '') + ' aria-label="Escribir en H. REAL">' +
                    (f.real == null && f.usar ? '<span class="sub">la reportada</span>' : '') + '</td></tr>';
        }).join('') + '</tbody>';
    var n = filas.filter(function (f) { return horaEscrita(f) != null; }).length;
    $('btn-descargar').textContent = '⬇ Descargar Excel con H. REAL (' + n + ')';
    $('btn-descargar').disabled = !n;
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
        // MOD(K-I+0,5;1)-0,5 da la diferencia más cercana (±12 h): 23:00 → 0:01 = 1:01; si llegó antes de la H.F
        // (13:00 → 11:31) da negativa y MAX la deja en 0:00. Sin H. REAL queda vacío
        var tot = extras.cols.total != null && fila.getCell(extras.cols.total), fm = tot && tot.value && tot.value.formula;
        var resta = fm && /^\s*([A-Z]+\d+)\s*-\s*([A-Z]+\d+)\s*$/.exec(fm);
        if (resta) tot.value = { formula: 'IF(' + resta[1] + '="","",MAX(0,MOD(' + resta[1] + '-' + resta[2] + '+0.5,1)-0.5))' };
        var h = horaEscrita(f);
        if (h != null) {
            var celda = fila.getCell(col);
            // Las horas en Excel son fracciones de día: se escriben como hora de 1899, igual que H.I, H.F y H. EXTRA
            celda.value = new Date(Date.UTC(1899, 11, 30, Math.floor(h / 60), h % 60));
            sombrear(celda, f.real != null ? COLOR_REAL : COLOR_REPORTADA, { numFmt: formato });
        }
        // Solo las casillas revisadas: RUTA y CONTROL frente al cumplimiento, H.I y H.F frente al horario de la ruta.
        // Amarilla si coincide; roja solo la que tiene el error
        var rev = revisada(f);
        [['ruta', f.difRuta], ['control', f.difControl], ['hi', f.difHi], ['hf', f.difHf]].forEach(function (x) {
            if (extras.cols[x[0]] != null && (x[1] || rev[x[0]])) sombrear(fila.getCell(extras.cols[x[0]]), x[1] ? COLOR_DISTINTO : COLOR_COINCIDE);
        });
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
    var n = filas.filter(function (f) { return horaEscrita(f) != null; }).length;
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
        input.onchange = function () { elegir(tipo, input.files); };
        // También se pueden arrastrar los archivos encima
        caja.addEventListener('dragover', function (ev) { ev.preventDefault(); caja.classList.add('encima'); });
        caja.addEventListener('dragleave', function () { caja.classList.remove('encima'); });
        caja.addEventListener('drop', function (ev) { ev.preventDefault(); caja.classList.remove('encima'); elegir(tipo, ev.dataTransfer.files); });
    });
    $('tolerancia').onchange = function () { if (archivos.extras && archivos.cumplimiento) procesar(); };
    $('resumen').onclick = function (ev) { var b = ev.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintar(); } };
    document.querySelector('.filtro-cargo').onclick = function (ev) { var b = ev.target.closest('[data-cargo]'); if (b) { cargo = b.dataset.cargo; pintar(); } };
    $('tabla').addEventListener('change', function (ev) {
        if (ev.target.matches('[data-todas]')) {
            var si = ev.target.checked;
            filas.forEach(function (f) { if (visible(f) && sePuedeEscribir(f)) f.usar = si; });
            return pintar();
        }
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
