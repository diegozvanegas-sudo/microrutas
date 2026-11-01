// revision.html: lista de revisiones de LV, RyT y plan de choque (como Subsanaciones) con su checklist por ruta y por
// operario en una ventana, y el reporte para el grupo.
// Se guarda en Supabase (public.revisiones, 0016_revisiones.sql). Sin señal queda en el celular y se envía al volver.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, nombreDia } from '../diario/comun.js';
import { esFestivo } from '../horas/distribucion.js';
import { TIPOS, TURNOS, CHECKLIST, zonaDeCodigo, enlaceSeguro, operarioVacio, turnoPorHora, novedadesDe, sinMarcar, nombreRevision, textoReporte, textoActividades, textoDomingo, textoRevision, tieneNovedad, filtrarRevisiones, ordenarRevisiones, detalleOperario, detalleRuta } from './comun.js';

var COLA = 'revisiones_cola', CACHE = 'revisiones_cache', BORRADOR = 'revision_borrador';
var $ = function (id) { return document.getElementById(id); };
var revisiones = [], cola = {}, fecha = hoy(), form = null, reporteFinal = false, turnoReporte = '';
var CAPAS_NOMBRES = { lv: ['rutas_lv', 'barrido_dom', 'barrido_manana', 'barrido_tarde', 'barrido_noche'], ryt: ['rutas_ryt'], plan: [] };
var nombres = {}, pedidas = {}, usuarios = {}, abiertos = {}, filtroEstado = '';
var TAMANOS = [5, 10, 15, 20, 25, 30], porPagina = 10, pagina = 1, firmaFiltros = '';
var FILTROS = ['f-texto', 'f-tipo', 'f-zona', 'f-turno', 'f-dia', 'f-usuario'];

function leer(clave, porDefecto) { try { return JSON.parse(localStorage.getItem(clave)) || porDefecto; } catch (e) { return porDefecto; } }
function escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; } }
function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function idNuevo() { return crypto.randomUUID(); }
function formVacio(tipo, ruta, zona) {
    return { id: idNuevo(), fecha: fecha, turno: leer('revision_turno_' + hoy(), '') || turnoPorHora(new Date().getHours()), tipo: tipo || 'lv', ruta: ruta || '', zona: zona || zonaDeCodigo(ruta), control: '',
             items: {}, operarios: [operarioVacio()], novedad: '', enlace: '' };
}

// ---------- Códigos de ruta para autocompletar: de las capas del mapa, solo los nombres ----------
window.cargarCapa = function (k, datos) {
    nombres[k] = datos.items.map(function (i) { return i.n; });
    pintarSugerencias();
};
function pedirNombres(tipo) {
    CAPAS_NOMBRES[tipo].forEach(function (k) {
        if (pedidas[k]) return;
        pedidas[k] = true;
        var s = document.createElement('script');
        s.src = 'data/rapido/capa_' + k + '.js';
        s.onerror = function () { pedidas[k] = false; };
        document.head.appendChild(s);
    });
}
function pintarSugerencias() {
    if (!form) return;
    var todos = {};
    CAPAS_NOMBRES[form.tipo].forEach(function (k) { (nombres[k] || []).forEach(function (n) { todos[n] = 1; }); });
    $('rutas-lista').innerHTML = Object.keys(todos).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
}

// ---------- Formulario ----------
function botones(ambito, id, valor) {
    return '<div class="marca-item" role="group">' + [['si', 'Cumple'], ['no', 'No cumple'], ['na', 'N/A']].map(function (o) {
        return '<button type="button" class="m-' + o[0] + '" data-ambito="' + ambito + '" data-item="' + id + '" data-valor="' + o[0] + '" aria-pressed="' + (valor === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
}
function filaItem(ambito, item, valores) {
    return '<div class="fila-item"><span>' + esc(item[1]) + '</span>' + botones(ambito, item[0], valores[item[0]]) + '</div>';
}
function pintarForm() {
    var c = CHECKLIST[form.tipo], esPlan = form.tipo === 'plan', quien = form.tipo === 'ryt' ? 'Tripulante' : 'Operario';
    $('tipos').querySelectorAll('[data-tipo]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tipo === form.tipo); });
    $('form').innerHTML =
        '<div class="campos">' +
            '<label class="ancho">' + (esPlan ? 'Sector' : 'Ruta') + '<input data-campo="ruta" list="rutas-lista" autocomplete="off" value="' + esc(form.ruta) + '" placeholder="' + (esPlan ? 'Ej.: CR 45 Palos Verdes' : 'Ej.: Z2R208LAS') + '"></label>' +
            '<label>Zona<input data-campo="zona" inputmode="numeric" value="' + esc(form.zona) + '"></label>' +
            '<label>Fecha<input type="date" data-campo="fecha" value="' + esc(form.fecha) + '"></label>' +
            '<label>Turno<select data-campo="turno">' + TURNOS.map(function (t) { return '<option' + (t === form.turno ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
            (form.tipo === 'ryt' ? '<label>Control o vehículo<input data-campo="control" value="' + esc(form.control) + '" placeholder="Ej.: 595"></label>' : '') +
        '</div>' +
        '<h3>De la ruta <button type="button" class="secundario pequeno" data-todo="ruta">✓ Todo cumple</button></h3>' +
        c.ruta.map(function (i) { return filaItem('ruta', i, form.items); }).join('') +
        '<label class="bloque">Novedad de la ruta<textarea data-campo="novedad" rows="2">' + esc(form.novedad) + '</textarea></label>' +
        '<label class="bloque">Enlace de la evidencia (opcional)<input data-campo="enlace" type="url" inputmode="url" value="' + esc(form.enlace) + '" placeholder="https://…"></label>' +
        form.operarios.map(function (o, k) {
            return '<div class="operario" data-op="' + k + '">' +
                '<div class="op-cab"><label>' + quien + ' ' + (k + 1) + '<input data-op-campo="nombre" value="' + esc(o.nombre) + '" placeholder="Nombre"></label>' +
                    (form.operarios.length > 1 ? '<button type="button" class="quitar" data-quitar-op="' + k + '" aria-label="Quitar">×</button>' : '') + '</div>' +
                '<button type="button" class="secundario pequeno" data-todo="' + k + '">✓ Todo cumple</button>' +
                c.operario.map(function (g) {
                    return '<div class="grupo-item">' + esc(g[0]) + '</div>' + g[1].map(function (i) { return filaItem(k, i, o.items); }).join('');
                }).join('') +
                '<label class="bloque">Novedad<textarea data-op-campo="novedad" rows="2">' + esc(o.novedad) + '</textarea></label>' +
                '<label class="bloque">Enlace de la evidencia (opcional)<input data-op-campo="enlace" type="url" inputmode="url" value="' + esc(o.enlace) + '" placeholder="https://…"></label>' +
            '</div>';
        }).join('') +
        '<button type="button" class="secundario" data-mas-op>+ Otro ' + quien.toLowerCase() + '</button>';
    pintarSugerencias();
    pedirNombres(form.tipo);
    $('dlg-titulo').textContent = esGuardada(form.id) ? 'Editar revisión' : 'Nueva revisión';
}
function esGuardada(id) { return !!cola[id] || revisiones.some(function (r) { return r.id === id; }); }
function guardarBorrador() { escribir(BORRADOR, form); }
function abrirForm(datos) {
    form = datos;
    pintarForm();
    $('dlg').showModal();
    $('dlg').scrollTop = 0;
}
function marcarTodo(ambito) {
    var c = CHECKLIST[form.tipo];
    if (ambito === 'ruta') c.ruta.forEach(function (i) { if (!form.items[i[0]]) form.items[i[0]] = 'si'; });
    else c.operario.forEach(function (g) { g[1].forEach(function (i) { var it = form.operarios[+ambito].items; if (!it[i[0]]) it[i[0]] = 'si'; }); });
}

// ---------- Guardar: primero a la base; sin señal, al celular ----------
function valoresCola() { return Object.keys(cola).map(function (k) { return cola[k]; }); }
function fila(r) {
    return { id: r.id, fecha: r.fecha, turno: r.turno, tipo: r.tipo, ruta: r.ruta.trim(), zona: String(r.zona || '').trim(), control: String(r.control || '').trim(),
             items: r.items, operarios: r.operarios, novedad: r.novedad, enlace: r.enlace, actualizado: new Date().toISOString() };
}
async function enviar(r) {
    if (!configurado || !navigator.onLine) return false;
    var res = await supabase.from('revisiones').upsert(fila(r)).select().single();
    if (res.error) { console.error(res.error); return false; }
    return res.data;
}
async function guardar() {
    form.ruta = form.ruta.trim();
    if (!form.ruta) { toast('Escriba la ' + (form.tipo === 'plan' ? 'zona o el sector.' : 'ruta.')); return $('form').querySelector('[data-campo="ruta"]').focus(); }
    if (!form.fecha) form.fecha = hoy();
    var r = JSON.parse(JSON.stringify(form)), faltan = sinMarcar(r);
    $('btn-guardar').disabled = true;
    // Queda en el celular antes de intentar: si la señal se cae a mitad, no se pierde
    cola[r.id] = r;
    var aLocal = escribir(COLA, cola), hecho = await enviar(r);
    $('btn-guardar').disabled = false;
    if (hecho) { delete cola[r.id]; escribir(COLA, cola); revisiones = revisiones.filter(function (x) { return x.id !== hecho.id; }).concat(hecho); escribir(CACHE, revisiones); }
    else if (!aLocal) toast('⚠ No se pudo guardar ni enviar. Copie el reporte antes de salir.');
    var tipo = form.tipo, turno = form.turno;
    form = formVacio(tipo); form.turno = turno;
    guardarBorrador();
    $('dlg').close();
    fecha = r.fecha;
    pintarLista();
    if (hecho || aLocal) verMensaje(r);
    if (hecho || aLocal) toast((hecho ? 'Revisión guardada.' : '📴 Guardada en este celular; se enviará al volver la señal.') + (faltan ? ' Quedaron ' + faltan + ' puntos sin marcar.' : ''));
}
// El mensaje de una revisión, listo para el grupo: sale al guardar y con el botón Mensaje de la lista
function verMensaje(r) {
    var t = textoRevision(r, new Date().getHours());
    $('msg-texto').textContent = t;
    $('msg-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(t);
    $('dlg-msg').showModal();
}
async function sincronizar() {
    var pendientes = valoresCola();
    if (!pendientes.length) return;
    var enviadas = 0;
    for (var i = 0; i < pendientes.length; i++) {
        var hecho = await enviar(pendientes[i]);
        if (!hecho) continue;
        delete cola[hecho.id]; enviadas++;
        revisiones = revisiones.filter(function (x) { return x.id !== hecho.id; }).concat(hecho);
    }
    escribir(COLA, cola); escribir(CACHE, revisiones);
    if (enviadas) { toast(enviadas === 1 ? 'Se envió 1 revisión guardada en el celular.' : 'Se enviaron ' + enviadas + ' revisiones guardadas en el celular.'); pintarLista(); }
}
async function cargar() {
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env). Lo que guarde queda en este equipo.'; return pintarLista(); }
    $('estado').textContent = 'Cargando…';
    // Supabase entrega hasta 1.000 filas por consulta: se piden todas por partes
    var filas = [];
    for (var desde = 0; ; desde += 1000) {
        var res = await supabase.from('revisiones').select('*').order('creado').range(desde, desde + 999);
        if (res.error) { $('estado').textContent = 'Sin conexión: se muestra lo guardado en este celular.'; return pintarLista(); }
        filas = filas.concat(res.data);
        if (res.data.length < 1000) break;
    }
    revisiones = filas; escribir(CACHE, revisiones);
    $('estado').textContent = '';
    pintarLista();
    sincronizar();
}
async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta revisión? No se puede deshacer.')) return;
    if (cola[id]) { delete cola[id]; escribir(COLA, cola); }
    if (revisiones.some(function (r) { return r.id === id; })) {
        var res = await supabase.from('revisiones').delete().eq('id', id);
        if (res.error) return toast('No se eliminó: ' + res.error.message);
        revisiones = revisiones.filter(function (r) { return r.id !== id; }); escribir(CACHE, revisiones);
    }
    pintarLista();
}

// ---------- Lo revisado en el día y el reporte ----------
function delDia() {
    var ids = {}, out = [];
    valoresCola().concat(revisiones).forEach(function (r) { if (r.fecha === fecha && !ids[r.id]) { ids[r.id] = 1; out.push(r); } });
    return out;
}
function todas() {
    var ids = {}, out = [];
    valoresCola().concat(revisiones).forEach(function (r) { if (!ids[r.id]) { ids[r.id] = 1; out.push(r); } });
    return out;
}
function filtrosPuestos() {
    return { texto: $('f-texto').value, tipo: $('f-tipo').value, zona: $('f-zona').value, turno: $('f-turno').value, dia: $('f-dia').value, usuario: $('f-usuario').value, estado: filtroEstado };
}
function llenarSelect(id, titulo, valores) {
    var el = $(id), actual = el.value;
    el.innerHTML = '<option value="">' + titulo + ': todos</option>' + valores.map(function (v) { return '<option value="' + esc(v[0]) + '">' + esc(v[1]) + '</option>'; }).join('');
    el.value = valores.some(function (v) { return v[0] === actual; }) ? actual : '';
}
function llenarFiltros(lista) {
    var unicos = function (fn) { return lista.map(fn).filter(function (v, i, a) { return v && a.indexOf(v) === i; }); };
    llenarSelect('f-zona', 'Zona', unicos(function (r) { return String(r.zona || ''); }).sort(function (a, b) { return Number(a) - Number(b) || a.localeCompare(b); }).map(function (z) { return [z, 'Zona ' + z]; }));
    llenarSelect('f-turno', 'Turno', TURNOS.filter(function (t) { return lista.some(function (r) { return r.turno === t; }); }).map(function (t) { return [t, t]; }));
    llenarSelect('f-dia', 'Día', unicos(function (r) { return r.fecha; }).sort().reverse().map(function (d) { return [d, nombreDia(d)]; }));
    var ids = Object.keys(usuarios);
    $('f-usuario').hidden = !ids.length;
    if (ids.length) llenarSelect('f-usuario', 'Usuario', ids.map(function (i) { return [i, usuarios[i]]; }));
}
function pintarResumen(base) {
    var con = base.filter(tieneNovedad).length;
    $('resumen').innerHTML = [['', base.length, 'Revisiones'], ['novedad', con, 'Con novedad'], ['ok', base.length - con, 'Sin novedad']].map(function (t) {
        return '<div class="tarjeta' + (filtroEstado === t[0] ? ' activa' : '') + '" data-estado="' + t[0] + '" role="button" tabindex="0"><div class="num">' + t[1] + '</div><div class="tit">' + t[2] + '</div></div>';
    }).join('');
}
function paginador(total) {
    var paginas = Math.ceil(total / porPagina);
    if (paginas < 2) return '';
    return '<div class="paginador"><button type="button" class="secundario pequeno" data-pagina="' + (pagina - 1) + '"' + (pagina === 1 ? ' disabled' : '') + '>‹ Anterior</button>' +
        '<span class="sub">' + ((pagina - 1) * porPagina + 1) + '–' + Math.min(pagina * porPagina, total) + ' de ' + total + ' · Página ' + pagina + ' de ' + paginas + '</span>' +
        '<button type="button" class="secundario pequeno" data-pagina="' + (pagina + 1) + '"' + (pagina === paginas ? ' disabled' : '') + '>Siguiente ›</button></div>';
}
var RESPUESTA = { si: 'Cumple', no: 'No cumple', na: 'N/A', '': 'Sin marcar' };
function puntos(lista) {
    return lista.map(function (p) { return '<div class="punto"><span>' + esc(p[0]) + '</span><span class="' + (p[1] || 'sin-marcar') + '">' + RESPUESTA[p[1]] + '</span></div>'; }).join('');
}
function enlaceHtml(u) { u = enlaceSeguro(u); return u ? '<div class="bloque"><a href="' + esc(u) + '" target="_blank" rel="noopener">🔗 Ver evidencia</a></div>' : ''; }
function detalle(r) {
    return '<div class="detalle-grid"><div class="detalle-bloque"><h4>De la ruta</h4>' + puntos(detalleRuta(r)) +
            (r.novedad ? '<div class="bloque">' + esc(r.novedad) + '</div>' : '') + enlaceHtml(r.enlace) + '</div>' +
        (r.operarios || []).map(function (o, k) {
            return '<div class="detalle-bloque"><h4>' + esc(o.nombre || (r.tipo === 'ryt' ? 'Tripulante ' : 'Operario ') + (k + 1)) + '</h4>' +
                detalleOperario(r.tipo, o).map(function (g) { return '<div class="grupo-item">' + esc(g[0]) + '</div>' + puntos(g[1]); }).join('') +
                (o.novedad ? '<div class="bloque">' + esc(o.novedad) + '</div>' : '') + enlaceHtml(o.enlace) + '</div>';
        }).join('') + '</div>';
}
function pintarLista() {
    var total = todas();
    llenarFiltros(total);
    $('dia-nombre').textContent = nombreDia(fecha);
    $('dia-fecha').value = fecha;
    $('sin-enviar').hidden = !valoresCola().length;
    $('sin-enviar').textContent = '📴 ' + valoresCola().length + ' sin enviar: se envían solas al volver la señal.';
    var f = filtrosPuestos();
    pintarResumen(filtrarRevisiones(total, f, true));
    $('btn-limpiar').hidden = !FILTROS.some(function (id) { return $(id).value; }) && !filtroEstado;
    var lista = ordenarRevisiones(filtrarRevisiones(total, f));
    pintarReporte();
    if (!lista.length) {
        $('tabla').innerHTML = '<div class="vacio-lista">' + (total.length ? 'Ninguna revisión coincide con los filtros.' : 'Aún no hay revisiones. Use "+ Nueva revisión".') + '</div>';
        return;
    }
    var firma = FILTROS.map(function (id) { return $(id).value; }).join('|') + filtroEstado;
    if (firma !== firmaFiltros) { firmaFiltros = firma; pagina = 1; }
    pagina = Math.min(pagina, Math.ceil(lista.length / porPagina));
    var trozo = lista.slice((pagina - 1) * porPagina, pagina * porPagina), con = lista.filter(tieneNovedad).length;
    $('tabla').innerHTML =
        '<div class="conteo-lista"><span><b>' + lista.length + (lista.length === 1 ? ' revisión' : ' revisiones') + '</b>' + (lista.length !== total.length ? ' de ' + total.length : '') +
            ' · ' + con + ' con novedad · ' + (lista.length - con) + ' sin novedad</span>' +
            '<label class="por-pagina">Mostrar <select data-por-pagina aria-label="Revisiones por página">' + TAMANOS.map(function (n) { return '<option' + (n === porPagina ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
        paginador(lista.length) +
        '<table><thead><tr><th>Ruta</th><th>Servicio</th><th>Fecha y turno</th><th>Personas</th><th>Estado</th><th>Novedades</th><th></th></tr></thead><tbody>' +
        trozo.map(function (r) {
            var nov = novedadesDe(r).filter(function (n) { return !/^evidencia: |, evidencia: /i.test(n); }), falta = sinMarcar(r), n = (r.operarios || []).length;
            return '<tr class="fila-rev" data-fila="' + esc(r.id) + '">' +
                '<td><span class="tit-ruta">' + esc(nombreRevision(r)) + '</span><div class="sub">' + (r.zona ? 'Zona ' + esc(r.zona) : 'Sin zona') + '</div></td>' +
                '<td>' + esc(TIPOS[r.tipo]) + '</td>' +
                '<td>' + esc(nombreDia(r.fecha)) + '<div class="sub">' + esc(r.turno) + (usuarios[r.usuario] ? ' · 👤 ' + esc(usuarios[r.usuario]) : '') + '</div></td>' +
                '<td>' + n + (n === 1 ? ' persona' : ' personas') + (falta ? '<div class="sub">' + falta + ' sin marcar</div>' : '') + '</td>' +
                '<td><span class="badge ' + (nov.length ? 'novedad">CON NOVEDAD' : 'ok">SIN NOVEDAD') + '</span>' + (cola[r.id] ? '<div><span class="badge local">📴 Sin enviar</span></div>' : '') + '</td>' +
                '<td>' + (nov.length ? nov.map(function (x) { return '<span class="chip-no">' + esc(x) + '</span>'; }).join('') : '<span class="sub">Ninguna</span>') + '</td>' +
                '<td class="acciones"><button type="button" class="secundario pequeno" data-ver="' + esc(r.id) + '" aria-expanded="' + !!abiertos[r.id] + '">' + (abiertos[r.id] ? 'Ocultar ▴' : 'Ver detalles ▾') + '</button>' +
                    '<button type="button" class="secundario pequeno" data-mensaje="' + esc(r.id) + '">📋 Mensaje</button>' +
                    '<button type="button" class="secundario pequeno" data-editar="' + esc(r.id) + '">Editar</button>' +
                    '<button type="button" class="peligro pequeno" data-eliminar="' + esc(r.id) + '">Eliminar</button></td></tr>' +
                '<tr class="fila-detalle"' + (abiertos[r.id] ? '' : ' hidden') + '><td colspan="7">' + detalle(r) + '</td></tr>';
        }).join('') + '</tbody></table>' + paginador(lista.length);
}
function pintarReporte() {
    var lista = delDia(), turnos = lista.map(function (r) { return r.turno; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    if (turnoReporte && turnos.indexOf(turnoReporte) === -1) turnoReporte = '';
    $('r-turno').innerHTML = '<option value="">Todos los turnos</option>' + TURNOS.filter(function (t) { return turnos.indexOf(t) !== -1; }).map(function (t) { return '<option' + (t === turnoReporte ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    $('r-final').checked = reporteFinal;
    var elegidas = turnoReporte ? lista.filter(function (r) { return r.turno === turnoReporte; }) : lista;
    var titulo = turnoReporte || (turnos.length === 1 ? turnos[0] : '');
    // Lo escrito a mano queda en este equipo, por día y turno
    // Domingos y festivos salen con su formato, salvo que ese día se haya elegido otro
    $('r-formato').value = leer('revision_formato_' + fecha, '') || (esFestivo(fecha) ? 'domingo' : leer('revision_formato', '') || 'actividades');
    var formato = $('r-formato').value, porZona = formato === 'zona', extra = leer('revision_extra_' + fecha + '_' + titulo, {});
    $('r-extras').hidden = porZona;
    ['vias', 'rcd', 'otras'].forEach(function (k) { if (document.activeElement !== $('r-' + k)) $('r-' + k).value = extra[k] || ''; });
    var op = { turno: titulo, final: reporteFinal, vias: extra.vias, rcd: extra.rcd, otras: extra.otras };
    op.fecha = fecha;
    var texto = porZona ? textoReporte(elegidas, op) : formato === 'domingo' ? textoDomingo(elegidas, op) : textoActividades(elegidas, op);
    $('vista-previa').textContent = texto || 'Guarde una revisión y aquí queda el reporte para el grupo.';
    $('btn-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
    $('btn-copiar').disabled = !texto;
    $('btn-whatsapp').hidden = !texto;
}
function copiar() {
    var t = $('vista-previa').textContent;
    navigator.clipboard.writeText(t).then(function () { toast('Reporte copiado.'); }, function () { toast('No se pudo copiar: seleccione el texto y cópielo.'); });
}

function arrancarEventos() {
    $('tipos').onclick = function (ev) {
        var b = ev.target.closest('[data-tipo]');
        if (!b || b.dataset.tipo === form.tipo) return;
        form.tipo = b.dataset.tipo;
        // Cada tipo tiene su lista de puntos; la marca de uno no cuenta en otro
        form.items = {}; form.operarios.forEach(function (o) { o.items = {}; });
        pintarForm(); guardarBorrador();
    };
    $('form').addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.dataset.campo) {
            form[t.dataset.campo] = t.value;
            if (t.dataset.campo === 'turno') escribir('revision_turno_' + hoy(), t.value);
            if (t.dataset.campo === 'ruta' && zonaDeCodigo(t.value)) { form.zona = zonaDeCodigo(t.value); $('form').querySelector('[data-campo="zona"]').value = form.zona; }
        } else if (t.dataset.opCampo) form.operarios[+t.closest('[data-op]').dataset.op][t.dataset.opCampo] = t.value;
        guardarBorrador();
    });
    $('form').addEventListener('click', function (ev) {
        var m = ev.target.closest('[data-item]');
        if (m) {
            var donde = m.dataset.ambito === 'ruta' ? form.items : form.operarios[+m.dataset.ambito].items;
            // Tocar otra vez la misma opción la desmarca
            if (donde[m.dataset.item] === m.dataset.valor) delete donde[m.dataset.item]; else donde[m.dataset.item] = m.dataset.valor;
            m.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', donde[m.dataset.item] === b.dataset.valor); });
            return guardarBorrador();
        }
        var y = window.scrollY;
        var t = ev.target.closest('[data-todo]');
        if (t) marcarTodo(t.dataset.todo);
        else if (ev.target.closest('[data-mas-op]')) form.operarios.push(operarioVacio());
        else if (ev.target.closest('[data-quitar-op]')) form.operarios.splice(+ev.target.closest('[data-quitar-op]').dataset.quitarOp, 1);
        else return;
        pintarForm(); guardarBorrador();
        window.scrollTo(0, y);
    });
    $('btn-guardar').onclick = guardar;
    $('msg-cerrar').onclick = function () { $('dlg-msg').close(); };
    $('msg-copiar').onclick = function () {
        navigator.clipboard.writeText($('msg-texto').textContent).then(function () { toast('Mensaje copiado.'); }, function () { toast('No se pudo copiar: seleccione el texto y cópielo.'); });
    };
    // Cancelar descarta lo escrito; cerrar con la × lo deja para seguir después
    $('btn-cancelar').onclick = function () { form = formVacio(form.tipo); guardarBorrador(); $('dlg').close(); };
    $('dlg-cerrar').onclick = function () { $('dlg').close(); };
    $('btn-nueva').onclick = function () {
        var b = leer(BORRADOR, null);
        abrirForm(b && CHECKLIST[b.tipo] && !esGuardada(b.id) ? b : formVacio(form.tipo));
    };
    FILTROS.forEach(function (id) { $(id).addEventListener(id === 'f-texto' ? 'input' : 'change', pintarLista); });
    $('btn-limpiar').onclick = function () { FILTROS.forEach(function (id) { $(id).value = ''; }); filtroEstado = ''; pintarLista(); };
    $('resumen').onclick = function (ev) {
        var t = ev.target.closest('[data-estado]');
        if (t) { filtroEstado = t.dataset.estado; pintarLista(); }
    };
    $('tabla').addEventListener('change', function (ev) {
        if (!ev.target.matches('[data-por-pagina]')) return;
        var primera = (pagina - 1) * porPagina;
        porPagina = +ev.target.value;
        pagina = Math.floor(primera / porPagina) + 1;
        escribir('revisiones_por_pagina', porPagina);
        pintarLista();
    });
    $('tabla').onclick = function (ev) {
        var pg = ev.target.closest('[data-pagina]');
        if (pg) { pagina = +pg.dataset.pagina; pintarLista(); return $('tabla').scrollIntoView({ block: 'start' }); }
        var buscar = function (id) { return cola[id] || revisiones.find(function (x) { return x.id === id; }); };
        var me = ev.target.closest('[data-mensaje]');
        if (me) return verMensaje(buscar(me.dataset.mensaje));
        var e = ev.target.closest('[data-editar]');
        if (e) {
            var copia = JSON.parse(JSON.stringify(buscar(e.dataset.editar)));
            if (!copia.operarios.length) copia.operarios = [operarioVacio()];
            return abrirForm(copia);
        }
        var d = ev.target.closest('[data-eliminar]');
        if (d) return eliminar(d.dataset.eliminar);
        // Tocar la fila abre o cierra el detalle (salvo enlaces y controles)
        var fila = ev.target.closest('tr.fila-rev');
        if (!fila || ev.target.closest('a, input, select') || String(window.getSelection()).trim()) return;
        var id = fila.dataset.fila, abierto = abiertos[id] = !abiertos[id], ver = fila.querySelector('[data-ver]');
        fila.nextElementSibling.hidden = !abierto;
        ver.textContent = abierto ? 'Ocultar ▴' : 'Ver detalles ▾';
        ver.setAttribute('aria-expanded', abierto);
    };
    $('dia-fecha').onchange = function () { if (this.value) { fecha = this.value; pintarLista(); } };
    $('r-turno').onchange = function () { turnoReporte = this.value; pintarReporte(); };
    $('r-final').onchange = function () { reporteFinal = this.checked; pintarReporte(); };
    $('r-formato').onchange = function () {
        escribir('revision_formato_' + fecha, this.value);
        if (this.value !== 'domingo') escribir('revision_formato', this.value);
        pintarReporte();
    };
    $('r-extras').addEventListener('input', function (ev) {
        var clave = 'revision_extra_' + fecha + '_' + (turnoReporte || delDia().map(function (r) { return r.turno; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; }).reduce(function (u, t, i) { return i ? '' : t; }, ''));
        var extra = leer(clave, {});
        extra[ev.target.id.slice(2)] = ev.target.value;
        escribir(clave, extra);
        pintarReporte();
    });
    $('btn-copiar').onclick = copiar;
    $('btn-recargar').onclick = cargar;
    window.addEventListener('online', sincronizar);
}

async function arrancar() {
    iniciarEncabezado();
    cola = leer(COLA, {});
    revisiones = leer(CACHE, []);
    // Desde la ficha de la ruta en el mapa: revision.html?tipo=lv&ruta=Z2R208LAS. Si no, sigue lo que se estaba escribiendo
    var q = new URLSearchParams(location.search), ruta = q.get('ruta'), tipo = CHECKLIST[q.get('tipo')] ? q.get('tipo') : 'lv';
    form = formVacio(tipo, ruta || '', q.get('zona') || '');
    var tam = leer('revisiones_por_pagina', 0);
    if (TAMANOS.indexOf(tam) !== -1) porPagina = tam;
    arrancarEventos();
    pintarForm();
    pintarLista();
    if (ruta) $('dlg').showModal();
    if (!configurado) return cargar();
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    // El administrador ve las de todos: quién registró cada una, y puede filtrar por usuario
    aplicarPermisos(supabase, usuario).then(async function (p) {
        if (!p.admin) return;
        var res = await supabase.from('perfiles').select('id, nombre').order('nombre');
        if (res.error) return;
        res.data.forEach(function (u) { usuarios[u.id] = u.nombre || u.id; });
        pintarLista();
    });
    cargar();
}

arrancar();
