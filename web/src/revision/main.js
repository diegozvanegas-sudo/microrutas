// revision.html: checklist de LV, RyT y plan de choque, por ruta y por operario, y el reporte para el grupo.
// Se guarda en Supabase (public.revisiones, 0016_revisiones.sql). Sin señal queda en el celular y se envía al volver.
import '../diario/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { esc, hoy, nombreDia, sumarDias } from '../diario/comun.js';
import { TIPOS, TURNOS, CHECKLIST, zonaDeCodigo, enlaceSeguro, operarioVacio, turnoPorHora, novedadesDe, sinMarcar, nombreRevision, textoReporte, textoRevision } from './comun.js';

var COLA = 'revisiones_cola', CACHE = 'revisiones_cache', BORRADOR = 'revision_borrador';
var $ = function (id) { return document.getElementById(id); };
var revisiones = [], cola = {}, fecha = hoy(), form = null, reporteFinal = false, turnoReporte = '';
var CAPAS_NOMBRES = { lv: ['rutas_lv', 'barrido_dom', 'barrido_manana', 'barrido_tarde', 'barrido_noche'], ryt: ['rutas_ryt'], plan: [] };
var nombres = {}, pedidas = {};

function leer(clave, porDefecto) { try { return JSON.parse(localStorage.getItem(clave)) || porDefecto; } catch (e) { return porDefecto; } }
function escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; } }
function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function idNuevo() { return crypto.randomUUID(); }
function formVacio(tipo, ruta, zona) {
    return { id: idNuevo(), fecha: fecha, turno: turnoPorHora(new Date().getHours()), tipo: tipo || 'lv', ruta: ruta || '', zona: zona || zonaDeCodigo(ruta), control: '',
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
    $('btn-cancelar').hidden = !revisiones.concat(valoresCola()).some(function (r) { return r.id === form.id; });
}
function guardarBorrador() { escribir(BORRADOR, form); }
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
    form.fecha = fecha;
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
    pintarForm(); pintarLista();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (hecho || aLocal) toast((hecho ? 'Revisión guardada.' : '📴 Guardada en este celular; se enviará al volver la señal.') + (faltan ? ' Quedaron ' + faltan + ' puntos sin marcar.' : ''));
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
    // Hasta 60 días atrás: para el reporte del día y consultar lo reciente
    var res = await supabase.from('revisiones').select('*').gte('fecha', sumarDias(hoy(), -60)).order('creado');
    if (res.error) { $('estado').textContent = 'Sin conexión: se muestra lo guardado en este celular.'; return pintarLista(); }
    revisiones = res.data; escribir(CACHE, revisiones);
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
function pintarLista() {
    $('dia-nombre').textContent = nombreDia(fecha);
    $('dia-fecha').value = fecha;
    var lista = delDia();
    $('sin-enviar').hidden = !valoresCola().length;
    $('sin-enviar').textContent = '📴 ' + valoresCola().length + ' sin enviar: se envían solas al volver la señal.';
    $('lista').innerHTML = lista.length ? lista.map(function (r) {
        var nov = novedadesDe(r), falta = sinMarcar(r);
        return '<div class="rev"><div class="rev-tit"><b>' + esc(nombreRevision(r)) + '</b> <span class="sub">' + esc([TIPOS[r.tipo], r.zona ? 'Zona ' + r.zona : '', r.turno].filter(Boolean).join(' · ')) + '</span>' +
                (cola[r.id] ? ' <span class="tag-local">📴 Sin enviar</span>' : '') + '</div>' +
            '<div class="sub">' + (r.operarios || []).length + ((r.operarios || []).length === 1 ? ' persona' : ' personas') + (falta ? ' · ' + falta + ' sin marcar' : '') + '</div>' +
            (nov.length ? '<ul class="novedades">' + nov.map(function (n) { var u = enlaceSeguro(n.replace(/^.*evidencia: /i, '')); return '<li>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">Ver evidencia</a>' : esc(n)) + '</li>'; }).join('') + '</ul>' : '<div class="sin-nov">Sin novedades</div>') +
            '<div class="acciones"><button type="button" class="secundario pequeno" data-mensaje="' + esc(r.id) + '">📋 Copiar mensaje</button>' +
                '<button type="button" class="secundario pequeno" data-editar="' + esc(r.id) + '">Editar</button>' +
                '<button type="button" class="peligro pequeno" data-eliminar="' + esc(r.id) + '">Eliminar</button></div></div>';
    }).join('') : '<div class="sub">Aún no hay revisiones este día.</div>';
    pintarReporte();
}
function pintarReporte() {
    var lista = delDia(), turnos = lista.map(function (r) { return r.turno; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    if (turnoReporte && turnos.indexOf(turnoReporte) === -1) turnoReporte = '';
    $('r-turno').innerHTML = '<option value="">Todos los turnos</option>' + TURNOS.filter(function (t) { return turnos.indexOf(t) !== -1; }).map(function (t) { return '<option' + (t === turnoReporte ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    $('r-final').checked = reporteFinal;
    var elegidas = turnoReporte ? lista.filter(function (r) { return r.turno === turnoReporte; }) : lista;
    var titulo = turnoReporte || (turnos.length === 1 ? turnos[0] : '');
    var texto = textoReporte(elegidas, { turno: titulo, final: reporteFinal });
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
    $('btn-cancelar').onclick = function () { form = formVacio(form.tipo); guardarBorrador(); pintarForm(); };
    $('lista').onclick = function (ev) {
        var me = ev.target.closest('[data-mensaje]');
        if (me) {
            var rm = cola[me.dataset.mensaje] || revisiones.find(function (x) { return x.id === me.dataset.mensaje; });
            return navigator.clipboard.writeText(textoRevision(rm, new Date().getHours())).then(function () { toast('Mensaje copiado.'); }, function () { toast('No se pudo copiar.'); });
        }
        var e = ev.target.closest('[data-editar]');
        if (e) {
            var r = cola[e.dataset.editar] || revisiones.find(function (x) { return x.id === e.dataset.editar; });
            form = JSON.parse(JSON.stringify(r));
            if (!form.operarios.length) form.operarios = [operarioVacio()];
            pintarForm(); guardarBorrador();
            return window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        var d = ev.target.closest('[data-eliminar]');
        if (d) eliminar(d.dataset.eliminar);
    };
    var irA = function (f) { fecha = f; pintarLista(); };
    $('dia-antes').onclick = function () { irA(sumarDias(fecha, -1)); };
    $('dia-despues').onclick = function () { irA(sumarDias(fecha, 1)); };
    $('dia-fecha').onchange = function () { if (this.value) irA(this.value); };
    $('r-turno').onchange = function () { turnoReporte = this.value; pintarReporte(); };
    $('r-final').onchange = function () { reporteFinal = this.checked; pintarReporte(); };
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
    form = ruta ? formVacio(tipo, ruta, q.get('zona') || '') : leer(BORRADOR, null) || formVacio(tipo);
    if (!CHECKLIST[form.tipo]) form = formVacio('lv');
    arrancarEventos();
    pintarForm();
    pintarLista();
    if (!configurado) return cargar();
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
    cargar();
}

arrancar();
