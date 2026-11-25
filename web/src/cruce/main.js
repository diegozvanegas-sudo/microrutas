// cruce.html: 📊 Cruce programado / realizado (menú Zonas verdes). La lógica está en cruce.js y el guardado en guardado.js.
// La programación es la misma de 📅 Programación del día (en la base, tabla programaciones, con copia en el equipo: «programacion_cache»).
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { crearProgBase, guardarLocal as guardarProgLocal } from '../programacion_base.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { esc, hoy, aTexto } from '../subsanaciones/util.js';
import { filasHoja, leerProgramacion } from '../subsanaciones/programacion.js';
import { leerReportes, cruzar, sumarDias, diaCorto, textoDif, textoSituacion, textoCruce, rotulo, esHecho, ESTADOS, claveReporte, cierres, tituloCierre, textoCierre } from './cruce.js';
import { crearGuardado } from './guardado.js';

var PROG_CACHE = 'programacion_cache';
var LOTES = window.direccionesLotes || {};
var progBase = null, progDatos = null, reportes = [], guardado = null, vista = 'dia', filtroEstado = 'revisar', filtroCuad = '', res = null;
try { progDatos = JSON.parse(localStorage.getItem(PROG_CACHE)) || null; } catch (e) { progDatos = null; }

function chip(f, extra) {
    var id = rotulo(f), url = 'mapa_rapido.html?' + (id === f.mr ? 'mr=' : 'lote=') + encodeURIComponent(id);
    return '<a class="cz-chip ' + f.estado + '" href="' + esc(url) + '" title="' + esc(f.mr + (f.x && f.x.dir ? ' · ' + f.x.dir : '')) + '">' + esc(id) + (extra ? ' <small>' + esc(extra) + '</small>' : '') + '</a>';
}
function urlMapa(filas) { return 'mapa_rapido.html?lote=' + filas.map(function (f) { return encodeURIComponent(rotulo(f)); }).join(','); }

// ---------- Por cuadrilla: qué le tocaba el día de corte, qué reportó y dónde va ----------
function vistaDia() {
    return '<div class="cz-cuadrillas">' + res.cuadrillas.map(function (c) {
        var bloque = function (titulo, cuerpo) { return '<div class="cz-bloque"><div class="cz-bloque-tit">' + titulo + '</div>' + cuerpo + '</div>'; };
        var nada = function (t) { return '<span class="sub">' + t + '</span>'; };
        return '<article class="cz-cuad ' + c.situacion + '">' +
            '<div class="cz-cuad-cab"><b>Cuadrilla ' + esc(c.cuad) + '</b><span class="sub">' + c.hechos + ' de ' + c.total + ' en la quincena</span>' +
                (c.cumplimiento != null ? '<span class="cz-pct" title="De lo que ya debía ir hasta el día de corte">' + c.cumplimiento + ' %</span>' : '') + '</div>' +
            '<div class="cz-situacion">' + esc(textoSituacion(c, res.fecha)) + '</div>' +
            bloque('Le tocaba el ' + esc(diaCorto(res.fecha)) + ' (' + c.tocaban.length + ')',
                c.tocaban.length ? '<div class="cz-chips">' + c.tocaban.map(function (f) { return chip(f, esHecho(f.estado) ? (f.real === res.fecha ? '✓' : '✓ ' + diaCorto(f.real).slice(4)) : '✗'); }).join('') + '</div>' : nada(res.dia ? 'Nada programado ese día.' : 'Domingo: no se programa.')) +
            bloque('Reportó ese día (' + c.hizo.length + ')',
                c.hizo.length ? '<div class="cz-chips">' + c.hizo.map(function (f) { return chip(f, f.estado === 'atiempo' ? 'a tiempo' : f.estado === 'tarde' ? 'era del ' + diaCorto(f.plan).slice(4) : f.estado === 'antes' ? 'adelantó el ' + diaCorto(f.plan).slice(4) : ''); }).join('') + '</div>' : nada('Sin reporte de ese día.')) +
            (c.atrasados.length ? bloque('Sin hacer y ya le tocaban (' + c.atrasados.length + ')',
                '<div class="cz-chips">' + c.atrasados.map(function (f) { return chip(f, diaCorto(f.plan)); }).join('') + '</div>') : '') +
            (c.ultimo && c.ultimo.fecha !== res.fecha ? '<div class="sub">Último reporte: ' + esc(diaCorto(c.ultimo.fecha)) + ' (' + c.ultimo.filas.length + (c.ultimo.filas.length === 1 ? ' lote' : ' lotes') + ').</div>' : '') +
            '<div class="cz-acc">' +
                (c.atrasados.length ? '<a class="boton secundario pequeno" href="' + esc(urlMapa(c.atrasados)) + '">🗺️ Atrasados en el mapa</a>' : '') +
                (c.tocaban.length ? '<a class="boton secundario pequeno" href="' + esc(urlMapa(c.tocaban)) + '">🗺️ Lo de ese día</a>' : '') +
                '<button type="button" class="secundario pequeno" data-ver-cuad="' + esc(c.cuad) + '">☰ Ver sus lotes</button></div>' +
            '</article>';
    }).join('') + '</div>';
}
// ---------- Calendario de la quincena: programados y hechos por día ----------
function vistaCal() {
    return '<p class="sub">Cada casilla: <b>hechos / programados</b> de ese día (aunque se hayan hecho otro día). Abajo, cuántos <b>reportó</b> ese día. Toque un día para poner ahí el corte.</p>' +
        '<div class="cz-tabla-caja"><table class="cz-cal"><thead><tr><th>Cuadrilla</th>' + res.dias.map(function (d) {
            return '<th' + (d === res.fecha ? ' class="corte"' : '') + '><button type="button" data-dia="' + d + '" title="Poner el corte en este día">' + diaCorto(d).split(' ').map(esc).join('<br>') + '</button></th>';
        }).join('') + '</tr></thead><tbody>' + res.calendario.map(function (c) {
            return '<tr><th>C' + esc(c.cuad) + '</th>' + c.dias.map(function (d) {
                var clase = !d.prog ? 'vacio' : d.hechos === d.prog ? 'bien' : d.fecha < res.fecha ? 'mal' : d.fecha === res.fecha ? 'hoy' : 'falta';
                return '<td class="' + clase + (d.fecha === res.fecha ? ' corte' : '') + '">' + (d.prog ? '<b>' + d.hechos + '/' + d.prog + '</b>' : '<b>·</b>') + (d.reportados ? '<small>reportó ' + d.reportados + '</small>' : '') + '</td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="cz-leyenda"><span class="bien">completo</span><span class="mal">faltan y ya pasó</span><span class="hoy">día de corte</span><span class="falta">por venir</span></div>';
}
// ---------- Listado: todos los lotes de la quincena con lo programado y lo real ----------
var FILTROS = [['revisar', 'Para revisar (atrasados y tarde)'], ['atrasado', 'Atrasados'], ['tarde', 'Hechos tarde'], ['antes', 'Adelantados'], ['atiempo', 'A tiempo'], ['hecho', 'Todos los hechos'], ['falta', 'Todos los que faltan'], ['', 'Todos']];
function pasa(f) {
    if (filtroCuad && f.cuad !== filtroCuad) return false;
    if (!filtroEstado) return true;
    if (filtroEstado === 'revisar') return f.estado === 'atrasado' || f.estado === 'tarde';
    if (filtroEstado === 'hecho') return esHecho(f.estado);
    if (filtroEstado === 'falta') return !esHecho(f.estado);
    return f.estado === filtroEstado;
}
function vistaLista() {
    var filas = res.filas.filter(pasa).sort(function (a, b) { return Number(a.cuad) - Number(b.cuad) || (a.plan === '') - (b.plan === '') || a.plan.localeCompare(b.plan); });
    return '<div class="cz-filtros">' +
        '<label>Ver <select id="cz-f-estado">' + FILTROS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === filtroEstado ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<label>Cuadrilla <select id="cz-f-cuad"><option value="">Todas</option>' + res.cuadrillas.map(function (c) { return '<option' + (c.cuad === filtroCuad ? ' selected' : '') + '>' + esc(c.cuad) + '</option>'; }).join('') + '</select></label>' +
        '<span class="sub">' + filas.length + (filas.length === 1 ? ' lote' : ' lotes') + '</span>' +
        (filas.length ? '<a class="boton secundario pequeno" href="' + esc(urlMapa(filas.slice(0, 60))) + '">🗺️ Verlos en el mapa' + (filas.length > 60 ? ' (60)' : '') + '</a>' : '') + '</div>' +
        (filas.length ? '<ul class="cz-lista">' + filas.map(function (f) {
            return '<li class="' + f.estado + '"><div class="cz-l-lote"><b>' + (f.lote && !/^N\/?A$/i.test(f.lote) ? 'Lote ' + esc(f.lote) : esc(f.mr)) + '</b><span class="sub">' + (f.lote && !/^N\/?A$/i.test(f.lote) ? esc(f.mr) + ' · ' : '') + 'cuadrilla ' + esc(f.cuad) + '</span></div>' +
                '<div class="cz-l-fechas"><span>Tocaba: <b>' + (f.plan ? esc(diaCorto(f.plan)) : 'sin día') + '</b></span><span>Se hizo: <b>' + (f.real ? esc(diaCorto(f.real)) : f.excel ? 'sí (X)' : '—') + '</b></span></div>' +
                '<div class="cz-l-est"><span class="cz-est ' + f.estado + '">' + ESTADOS[f.estado] + '</span>' +
                    '<span class="sub">' + esc([esHecho(f.estado) && f.estado !== 'atiempo' ? textoDif(f) : '', f.fuente === 'reporte' ? 'reporte' : f.fuente === 'excel' ? 'X del Excel' : f.fuente === 'ambos' ? 'reporte y Excel' : '',
                        f.choque ? '⚠ el Excel dice ' + aTexto(f.excel) : '', f.otraCuad ? '⚠ lo reportó la cuadrilla ' + f.cuadReporte : ''].filter(Boolean).join(' · ')) + '</span></div></li>';
        }).join('') + '</ul>' : '<p class="sub cz-vacio">No hay lotes con ese filtro.</p>');
}

function pintarAvisos() {
    var grupos = [];
    if (res.fuera.length) grupos.push('<div><b>Reportados que no están en la programación del mes (' + res.fuera.length + ')</b><div class="cz-chips">' + res.fuera.map(function (f) {
        return '<span class="cz-chip sin">' + esc(f.mr) + ' <small>' + esc(diaCorto(f.fecha)) + ' · C' + esc(f.cuad) + '</small></span>'; }).join('') + '</div></div>');
    if (res.repetidos.length) grupos.push('<div><b>Reportados dos veces en la misma quincena (' + res.repetidos.length + ')</b><div class="cz-chips">' + res.repetidos.map(function (f) {
        return '<span class="cz-chip sin">' + esc(f.lote || f.mr) + ' <small>' + esc(f.fechas.map(diaCorto).join(' y ')) + '</small></span>'; }).join('') + '</div></div>');
    if (res.choques.length) grupos.push('<div><b>El reporte y el Excel tienen fechas distintas (' + res.choques.length + ')</b><div class="cz-chips">' + res.choques.map(function (f) {
        return '<span class="cz-chip sin">' + esc(rotulo(f)) + ' <small>reporte ' + esc(diaCorto(f.reporte)) + ' · Excel ' + esc(diaCorto(f.excel)) + '</small></span>'; }).join('') + '</div></div>');
    if (res.otraCuad.length) grupos.push('<div><b>Reportados por una cuadrilla distinta a la programada (' + res.otraCuad.length + ')</b><div class="cz-chips">' + res.otraCuad.map(function (f) {
        return '<span class="cz-chip sin">' + esc(rotulo(f)) + ' <small>era de C' + esc(f.cuad) + ', lo reportó C' + esc(f.cuadReporte) + '</small></span>'; }).join('') + '</div></div>');
    if (res.otroMes) grupos.push('<div class="sub">' + res.otroMes + (res.otroMes === 1 ? ' reporte guardado es' : ' reportes guardados son') + ' de otro mes y no se cruzan con esta programación.</div>');
    var n = res.fuera.length + res.repetidos.length + res.choques.length + res.otraCuad.length;
    $('cz-avisos').hidden = !grupos.length;
    $('cz-avisos-tit').textContent = n ? '⚠ Para revisar en los reportes (' + n + ')' : 'ℹ Reportes de otro mes';
    $('cz-avisos-lista').innerHTML = grupos.join('');
}
// ---------- Cierre de la quincena: los 2 últimos días hábiles y hasta 7 días después, con la fecha de hoy ----------
var listaCierres = [];
function pintarCierre(prog) {
    listaCierres = prog ? cierres(prog, reportes, hoy()) : [];
    $('cz-cierre').hidden = !listaCierres.length;
    $('cz-cierre').innerHTML = listaCierres.map(function (c, i) {
        return '<article class="cz-cierre-q ' + (c.faltan.length ? c.estado : 'completa') + '">' +
            '<h3>' + esc(tituloCierre(c)) + '</h3>' +
            '<div class="sub">Q' + c.q + ' del ' + esc(diaCorto(c.rango.desde)) + ' al ' + esc(diaCorto(c.rango.hasta)) + ' · ejecutados <b>' + c.hechos + ' de ' + c.total + '</b>' +
                (c.estado === 'porcerrar' ? ' · ' + (c.quedan === 1 ? 'queda 1 día hábil' : 'quedan ' + c.quedan + ' días hábiles') : '') + '</div>' +
            c.cuadrillas.map(function (k) {
                return '<div class="cz-cierre-cuad"><div><b>Cuadrilla ' + esc(k.cuad) + '</b> <span class="sub">· ' + k.faltan.length + ' de ' + k.total + ' sin ejecutar</span>' +
                        (k.sinReportes ? ' <span class="cz-falta">· no hay reportes suyos cargados este mes: pegue sus reportes antes de reclamar</span>' : '') + '</div>' +
                    '<div class="cz-chips">' + k.faltan.map(function (f) { return chip(f, f.plan ? diaCorto(f.plan) : 'sin día'); }).join('') + '</div></div>';
            }).join('') +
            (c.faltan.length ? '<div class="cz-acc"><a class="boton secundario pequeno" href="' + esc(urlMapa(c.faltan.slice(0, 60))) + '">🗺️ Verlos en el mapa' + (c.faltan.length > 60 ? ' (60)' : '') + '</a>' +
                '<button type="button" class="secundario pequeno" data-copiar-cierre="' + i + '">📋 Copiar para WhatsApp</button></div>' : '') +
            '</article>';
    }).join('');
}
function copiar(t, ok) {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(ok); }, function () { toast('No se pudo copiar.'); });
    else toast('Este navegador no deja copiar: use el computador o Chrome.');
}
function pintar() {
    var prog = progDatos && progDatos.prog;
    pintarCierre(prog);
    $('cz-prog-estado').innerHTML = prog ? '✓ Programación de <b>' + esc(prog.mes) + '</b> · ' + (prog.q1.length + prog.q2.length) + ' lotes' + (progDatos.archivo ? ' <span class="sub">(' + esc(progDatos.archivo) + (progDatos.cargado ? ', cargada el ' + esc(progDatos.cargado) : '') + ')</span>' : '')
        : '<span class="cz-falta">Falta el Excel de programación del mes.</span>';
    $('cz-elegir').textContent = prog ? '📁 Cambiar el Excel de programación' : '📁 Elegir el Excel de programación';
    var fechas = reportes.map(function (r) { return r.fecha; }).sort();
    $('cz-rep-resumen').textContent = reportes.length ? reportes.length + (reportes.length === 1 ? ' reporte guardado' : ' reportes guardados') + ' (del ' + diaCorto(fechas[0]) + ' al ' + diaCorto(fechas[fechas.length - 1]) + ')' : 'Todavía no hay reportes guardados';
    $('cz-rep-lista').innerHTML = reportes.slice().reverse().map(function (r) {
        return '<div class="cz-rep"><span><b>' + esc(diaCorto(r.fecha)) + '</b> · cuadrilla ' + esc(r.cuad || '?') + ' · ' + r.items.length + (r.items.length === 1 ? ' microrruta' : ' microrrutas') + (r.pendiente ? ' <span class="sub">(solo en este equipo)</span>' : '') + '</span>' +
            '<button type="button" class="secundario pequeno" data-borrar="' + esc(claveReporte(r)) + '" title="Quitar este reporte" aria-label="Quitar el reporte del ' + esc(diaCorto(r.fecha)) + ', cuadrilla ' + esc(r.cuad) + '">✕</button></div>';
    }).join('');
    $('cz-cruce').hidden = !prog;
    if (!prog) return;
    var fecha = $('cz-fecha').value;
    if (!fecha) {
        var delMes = fechas.filter(function (f) { return f.slice(0, 7) === prog.mes; });
        fecha = hoy().slice(0, 7) === prog.mes ? hoy() : delMes.length ? delMes[delMes.length - 1] : prog.mes + '-01';
        $('cz-fecha').value = fecha;
    }
    res = cruzar(prog, reportes, fecha);
    var c = res.cuenta;
    $('cz-quincena').textContent = 'Quincena ' + res.q + ' · ' + diaCorto(res.rango.desde) + ' al ' + diaCorto(res.rango.hasta) + (fecha.slice(0, 7) !== prog.mes ? ' · ⚠ esa fecha no es del mes de la programación (' + prog.mes + ')' : '');
    $('cz-cuenta').innerHTML = [
        ['', c.debian, 'debían ir al corte'], ['bien', c.hechosDeDebian, 'de esos, hechos' + (c.cumplimiento != null ? ' (' + c.cumplimiento + ' %)' : '')],
        ['mal', c.atrasado, 'atrasados'], ['ojo', c.tarde, 'hechos tarde'], ['', c.antes, 'adelantados'], ['', c.total, 'lotes en la quincena']
    ].map(function (x) { return '<div class="cz-dato ' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></div>'; }).join('');
    pintarAvisos();
    $('cz-pestanas').querySelectorAll('[data-vista]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.vista === vista); });
    $('cz-vista').innerHTML = !res.cuadrillas.length ? '<p class="sub cz-vacio">La programación no tiene lotes en la quincena ' + res.q + '.</p>' : vista === 'cal' ? vistaCal() : vista === 'lista' ? vistaLista() : vistaDia();
}

async function cargarProg(file) {
    if (!file) return;
    $('cz-elegir').disabled = true;
    $('cz-prog-estado').textContent = 'Leyendo ' + file.name + '… (un libro grande tarda unos segundos)';
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
        $('cz-fecha').value = '';
        toast('Programación de ' + prog.mes + ' cargada: ' + (prog.q1.length + prog.q2.length) + ' lotes.');
        pintar();
    } catch (e) {
        pintar();
        $('cz-prog-estado').innerHTML = '<span class="cz-falta">No se pudo leer el Excel: ' + esc(e.message) + '. Revise que sea el de programación del mes.</span>';
    } finally {
        $('cz-elegir').disabled = false; $('cz-archivo').value = '';
    }
}
function donde(r) {
    reportes = r.reportes;
    $('cz-donde').textContent = r.aviso || (r.donde === 'base' ? 'Guardados en la base: se ven igual en el computador y en el celular.' : '');
    $('cz-donde').classList.toggle('cz-falta', !!r.aviso);
}
async function cargarReportes() {
    var texto = $('cz-texto').value.trim();
    if (!texto) { $('cz-rep-estado').textContent = 'Pegue primero los reportes de WhatsApp.'; $('cz-texto').focus(); return; }
    var leido = leerReportes(texto, LOTES);
    if (!leido.reportes.length) { $('cz-rep-estado').innerHTML = '<span class="cz-falta">' + esc(leido.avisos.join(' ')) + '</span>'; return; }
    $('cz-cargar').disabled = true;
    $('cz-rep-estado').textContent = 'Guardando ' + leido.reportes.length + (leido.reportes.length === 1 ? ' reporte…' : ' reportes…');
    try {
        var antes = {};
        reportes.forEach(function (r) { antes[claveReporte(r)] = 1; });
        var reemplazan = leido.reportes.filter(function (r) { return antes[claveReporte(r)]; }).length;
        donde(await guardado.guardar(leido.reportes));
        $('cz-texto').value = ''; $('cz-limpiar').hidden = true;
        var fs = leido.reportes.map(function (r) { return r.fecha; }).sort(), micro = leido.reportes.reduce(function (n, r) { return n + r.items.length; }, 0);
        $('cz-rep-estado').innerHTML = '✓ ' + (leido.reportes.length <= 4
            ? leido.reportes.map(function (r) { return esc(diaCorto(r.fecha)) + ' · cuadrilla ' + esc(r.cuad || '?') + ' (' + r.items.length + ' microrrutas)'; }).join(', ')
            : leido.reportes.length + ' reportes cargados, del ' + esc(diaCorto(fs[0])) + ' al ' + esc(diaCorto(fs[fs.length - 1])) + ' (' + micro + ' microrrutas)') +
            (reemplazan ? ' · ' + reemplazan + (reemplazan === 1 ? ' reemplazó' : ' reemplazaron') + ' al que ya estaba de ese día y cuadrilla' : '') +
            (leido.avisos.length ? '<br><span class="cz-falta">' + esc(leido.avisos.join(' ')) + '</span>' : '');
        // El corte pasa al día del último reporte cargado, para ver de una vez cómo quedó
        var ult = leido.reportes.map(function (r) { return r.fecha; }).sort().pop();
        if (progDatos && ult.slice(0, 7) === progDatos.prog.mes) $('cz-fecha').value = ult;
        pintar();
    } catch (e) {
        $('cz-rep-estado').innerHTML = '<span class="cz-falta">No se pudieron guardar: ' + esc(e.message) + '</span>';
    } finally { $('cz-cargar').disabled = false; }
}
function moverFecha(n) { var f = $('cz-fecha').value || hoy(); $('cz-fecha').value = sumarDias(f, n); pintar(); }

async function arrancar() {
    iniciarEncabezado();
    var usuario = null;
    if (configurado) {
        usuario = await asegurarSesion(supabase);
        $('btn-salir').hidden = false;
        $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
        $('btn-salir').onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    }
    guardado = crearGuardado(configurado ? supabase : null);
    // La programación del mes sale de la base (la que subió cualquiera); si llega una más nueva, se repinta
    progBase = crearProgBase(configurado ? supabase : null);
    progBase.sincronizar().then(function (r) { if (r.cambio) { progDatos = r.datos; pintar(); } if (r.aviso) toast(r.aviso); });
    $('cz-elegir').onclick = function () { $('cz-archivo').click(); };
    $('cz-archivo').onchange = function () { cargarProg(this.files && this.files[0]); };
    $('cz-cargar').onclick = cargarReportes;
    $('cz-texto').addEventListener('input', function () { $('cz-limpiar').hidden = !this.value; });
    $('cz-limpiar').onclick = function () { $('cz-texto').value = ''; $('cz-rep-estado').textContent = ''; this.hidden = true; $('cz-texto').focus(); };
    $('cz-fecha').onchange = pintar;
    $('cz-antes').onclick = function () { moverFecha(-1); };
    $('cz-despues').onclick = function () { moverFecha(1); };
    $('cz-hoy').onclick = function () { $('cz-fecha').value = hoy(); pintar(); };
    $('cz-copiar').onclick = function () { if (res) copiar(textoCruce(res), 'Resumen copiado'); };
    $('cz-cierre').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-copiar-cierre]'), c = b && listaCierres[+b.dataset.copiarCierre];
        if (c) copiar(textoCierre(c), 'Cierre de la Q' + c.q + ' copiado');
    });
    $('cz-pestanas').onclick = function (ev) { var b = ev.target.closest('[data-vista]'); if (b) { vista = b.dataset.vista; pintar(); } };
    $('cz-vista').addEventListener('click', function (ev) {
        var d = ev.target.closest('[data-dia]'), c = ev.target.closest('[data-ver-cuad]');
        if (d) { $('cz-fecha').value = d.dataset.dia; pintar(); }
        if (c) { vista = 'lista'; filtroCuad = c.dataset.verCuad; filtroEstado = ''; pintar(); $('cz-pestanas').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    $('cz-vista').addEventListener('change', function (ev) {
        if (ev.target.id === 'cz-f-estado') { filtroEstado = ev.target.value; pintar(); }
        if (ev.target.id === 'cz-f-cuad') { filtroCuad = ev.target.value; pintar(); }
    });
    $('cz-rep-lista').addEventListener('click', async function (ev) {
        var b = ev.target.closest('[data-borrar]');
        if (!b) return;
        var r = reportes.filter(function (x) { return claveReporte(x) === b.dataset.borrar; })[0];
        if (!r || !(await confirmar('Quitar el reporte', 'Reporte del ' + diaCorto(r.fecha) + ', cuadrilla ' + r.cuad + ' (' + r.items.length + ' microrrutas). Sus lotes dejan de contar como hechos por reporte.', 'Quitar'))) return;
        try { donde(await guardado.borrar(r)); toast('Reporte quitado.'); pintar(); } catch (e) { toast(e.message); }
    });
    $('btn-recargar').onclick = async function () { donde(await guardado.leer()); pintar(); toast('Actualizado.'); };
    donde(await guardado.leer());
    $('estado').hidden = true; $('cz-datos').hidden = false;
    pintar();
}
arrancar();
