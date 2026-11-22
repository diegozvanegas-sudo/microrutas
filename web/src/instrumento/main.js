// instrumento.html: 🧾 Instrumentos. Dos formularios de Google de la interventoría, abiertos ya llenos (enlace prellenado):
// ⚡ «V3 Instrumento plan de choque» y 📅 «2026 Instrumento Domingos». Se revisan y se pulsa «Enviar» allá (piden la sesión
// de Google; la app no envía nada). Lo fijo (inspector, comuna, aliado o contratista de cada zona) queda en este equipo;
// lo del día se escribe o se trae de una revisión de ✅ Revisión.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast } from '../subsanaciones/ui.js';
import { hoy } from '../diario/comun.js';
import { OPCIONES, vacio, comunaDe, aliadoDe, enlace, faltantes, desdeRevision, conCuenta,
    OPC_DOM, PERSONAL, SERVICIO, vacioDom, contratistaDe, enlaceDom, faltantesDom, desdeRevisionDom } from './comun.js';

var PREF = 'instrumento_pref', BORRADOR = 'instrumento_borrador', BORRADOR_DOM = 'instrumento_borrador_dom', HISTORIAL = 'instrumento_historial', TIPO = 'instrumento_tipo';
var pref = {}, datos = null, datosDom = null, tipo = 'choque', revisiones = [];
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: sigue funcionando */ } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function d() { return tipo === 'dom' ? datosDom : datos; }

function lista(id, ops, valor, vacioTxt) {
    return '<select data-campo="' + id + '">' + (vacioTxt ? '<option value="">' + esc(vacioTxt) + '</option>' : '') +
        ops.map(function (o) { return '<option' + (o === valor ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
}
function siNo(id, et, ops) {
    return '<div class="ins-sn"><span>' + esc(et) + '</span><div class="ins-chips" role="group">' + ops.map(function (o) {
        return '<button type="button" class="ins-chip" data-sn="' + id + '" data-valor="' + o + '" aria-pressed="' + (d()[id] === o) + '">' + o + '</button>';
    }).join('') + '</div></div>';
}
function pintarChoque() {
    var ev = datos.tipo === OPCIONES.tipo[0];
    return '<fieldset><legend>1. Datos generales</legend><div class="ins-grid">' +
            '<label>Inspector<input data-campo="inspector" value="' + esc(datos.inspector) + '" autocomplete="name"></label>' +
            '<label>Fecha<input type="date" data-campo="fecha" value="' + esc(datos.fecha) + '"></label>' +
            '<label>Zona' + lista('zona', OPCIONES.zona, datos.zona, 'Elija…') + '</label>' +
            '<label>Comuna<input data-campo="comuna" list="ins-comunas" value="' + esc(datos.comuna) + '" placeholder="Ej.: COMUNA 14 POBLADO"></label>' +
            '<label>Aliado' + lista('aliado', OPCIONES.aliado, datos.aliado, 'Elija…') + '</label>' +
            '<label>Tipo de verificación' + lista('tipo', OPCIONES.tipo, datos.tipo) + '</label>' +
        '</div></fieldset>' +
        '<fieldset><legend>2. Personal</legend>' + siNo('herramientas', '¿Herramientas completas?', OPCIONES.siNo) + siNo('portaEpp', '¿Porta todos los EPP?', OPCIONES.siNo) + siNo('usaEpp', '¿Hace uso de los EPP?', OPCIONES.siNo) + '</fieldset>' +
        (ev ? '<fieldset><legend>3. Evento plan de choque</legend><div class="ins-grid">' +
            '<label class="ancho">Nombre del evento<input data-campo="evento" value="' + esc(datos.evento) + '" placeholder="Ej.: 4 sur - Aguacatala"></label>' +
            '<label>Número de eventos' + lista('eventos', OPCIONES.eventos, datos.eventos) + '</label>' +
            '<label>Bolsas<input data-campo="bolsas" inputmode="numeric" value="' + esc(datos.bolsas) + '" placeholder="Ej.: 37"></label>' +
            '<label>Cantidad de operarios' + lista('operarios', OPCIONES.operarios, datos.operarios, 'Elija…') + '</label>' +
            '<div class="ancho"><span class="ins-et">Novedades (si hubo)</span><div class="ins-chips">' + OPCIONES.novedades.map(function (n) {
                return '<button type="button" class="ins-chip" data-nov="' + esc(n) + '" aria-pressed="' + (datos.novedades.indexOf(n) !== -1) + '">' + esc(n) + '</button>';
            }).join('') + '</div></div>' +
            '<label class="ancho">Otra novedad<input data-campo="otra" value="' + esc(datos.otra) + '"></label>' +
            '<label class="ancho">Enlace del registro fotográfico<input data-campo="fotos" type="url" inputmode="url" value="' + esc(datos.fotos) + '" placeholder="https://drive.google.com/…"></label>' +
        '</div></fieldset>' : '<p class="ins-nota">Las preguntas de volquetas y motocarros se llenan en el formulario: aquí se deja lista la primera página.</p>');
}
function pintarDom() {
    var x = datosDom;
    return '<fieldset><legend>1. Datos de la inspección</legend><div class="ins-grid">' +
            '<label class="ancho">Inspector <span class="ins-ayuda">(como aparece en la lista del formulario)</span><input data-campo="inspector" value="' + esc(x.inspector) + '" placeholder="Su nombre tal cual sale en «Nombre de Inspector»"></label>' +
            '<label>Contratista' + lista('contratista', OPC_DOM.contratista, x.contratista, 'Elija…') + '</label>' +
            '<label>Instrumento' + lista('instrumento', OPC_DOM.instrumento, x.instrumento) + '</label>' +
            '<label>Zona' + lista('zona', OPC_DOM.zona, x.zona, 'Elija…') + '</label>' +
            '<label>Fecha de verificación<input type="date" data-campo="fecha" value="' + esc(x.fecha) + '"></label>' +
            '<label>Código de ruta<input data-campo="ruta" list="ins-rutas" value="' + esc(x.ruta) + '" placeholder="Ej.: Z5R14DOM" autocapitalize="characters"></label>' +
            '<label>Tipo de verificación' + lista('verificacion', OPC_DOM.verificacion, x.verificacion) + '</label>' +
        '</div></fieldset>' +
        '<fieldset><legend>2. Personal <button type="button" class="secundario pequeno" data-todo-si="personal">✓ Todo Sí</button></legend>' + PERSONAL.map(function (c) { return siNo(c[0], c[2], OPC_DOM.siNo); }).join('') + '</fieldset>' +
        '<fieldset><legend>3. Servicio <button type="button" class="secundario pequeno" data-todo-si="servicio">✓ Todo Sí</button></legend>' + SERVICIO.map(function (c) { return siNo(c[0], c[2], OPC_DOM.siNo); }).join('') + '</fieldset>' +
        '<fieldset><legend>4. Registro fotográfico</legend><div class="ins-grid"><label class="ancho">Enlace del registro fotográfico<input data-campo="fotos" type="url" inputmode="url" value="' + esc(x.fotos) + '" placeholder="https://drive.google.com/…"></label></div></fieldset>';
}
function pintar() {
    $('ins-tipos').querySelectorAll('[data-tipo]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tipo === tipo); });
    $('ins-titulo-traer').textContent = tipo === 'dom' ? '⚡ Traer de mi revisión de LV o RyT' : '⚡ Traer de mi revisión de plan de choque';
    $('ins-form').innerHTML = tipo === 'dom' ? pintarDom() : pintarChoque();
    pintarRevisiones();
    pintarEstado();
}
function pintarEstado() {
    var f = tipo === 'dom' ? faltantesDom(datosDom) : faltantes(datos);
    $('ins-falta').textContent = f.length ? 'Falta: ' + f.join(', ') + '.' : '✓ Todo listo: ábralo, revise y pulse «Enviar».';
    $('ins-falta').className = 'ins-falta' + (f.length ? '' : ' ok');
    $('ins-abrir').disabled = !!f.length;
}
function guardarTodo() { guardar(BORRADOR, datos); guardar(BORRADOR_DOM, datosDom); }

// Revisiones de los últimos 7 días: plan de choque para el primero, LV y RyT para el de domingos
function deTipo() { return revisiones.filter(function (r) { return tipo === 'dom' ? r.tipo === 'lv' || r.tipo === 'ryt' : r.tipo === 'plan'; }); }
function yaAbierta(r) { return leer(HISTORIAL, []).some(function (h) { return h.form === tipo && h.fecha === r.fecha && String(h.ruta || h.evento || '').toUpperCase() === String(r.ruta || '').toUpperCase(); }); }
function pintarRevisiones() {
    var c = $('ins-revisiones'), ls = deTipo();
    if (!ls.length) { c.innerHTML = '<span class="sub">No hay revisiones ' + (tipo === 'dom' ? 'de LV o RyT' : 'de plan de choque') + ' en los últimos 7 días (✅ Revisión).</span>'; return; }
    c.innerHTML = ls.slice(0, 14).map(function (r) {
        var i = revisiones.indexOf(r), hecha = yaAbierta(r);
        return '<button type="button" class="ins-chip ins-rev' + (hecha ? ' hecha' : '') + '" data-rev="' + i + '" title="' + (hecha ? 'Ya abrió el formulario de esta revisión' : '') + '">' + (hecha ? '✓ ' : (r.tipo === 'ryt' ? '🚛 ' : r.tipo === 'plan' ? '⚡ ' : '🧹 ')) + esc(r.ruta) +
            ' <span class="sub">· ' + esc(String(r.fecha).slice(5).split('-').reverse().join('/')) + (r.zona ? ' · Z' + esc(r.zona) : '') + '</span></button>';
    }).join('');
}
async function cargarRevisiones() {
    var desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    try {
        var r = await supabase.from('revisiones').select('fecha, turno, tipo, zona, ruta, items, operarios, novedad, enlace, creado').gte('fecha', desde).order('fecha', { ascending: false }).order('creado', { ascending: false });
        if (r.error) throw r.error;
        revisiones = r.data || [];
    } catch (e) {
        // Sin señal: las que la página de Revisión dejó guardadas en este equipo
        revisiones = (leer('revisiones_cache', []) || []).filter(function (x) { return x.fecha >= desde; }).sort(function (a, b) { return String(b.fecha).localeCompare(a.fecha); });
    }
    $('ins-rutas').innerHTML = Array.from(new Set(revisiones.filter(function (x) { return x.tipo !== 'plan'; }).map(function (x) { return x.ruta; }))).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    pintarRevisiones();
}

function pintarHistorial() {
    var h = leer(HISTORIAL, []);
    $('ins-hist').innerHTML = h.length ? h.map(function (x, i) {
        return '<li><span>' + (x.form === 'dom' ? '📅 ' : '⚡ ') + '<b>' + esc(String(x.fecha).split('-').reverse().join('/')) + '</b> · ' + esc(x.zona) + ' · ' + esc(x.ruta || x.evento || x.tipo) + '</span>' +
            '<span class="ins-acc"><a class="boton secundario pequeno" target="_blank" rel="noopener" href="' + esc(x.url) + '">Abrir de nuevo</a>' +
            '<button type="button" class="secundario pequeno" data-quitar="' + i + '" aria-label="Quitar">✕</button></span></li>';
    }).join('') : '<li class="sub">Aún no ha abierto ninguno desde este equipo.</li>';
}
function urlActual() { return conCuenta(tipo === 'dom' ? enlaceDom(datosDom) : enlace(datos), pref.cuenta); }
function abrir() {
    if ((tipo === 'dom' ? faltantesDom(datosDom) : faltantes(datos)).length) return;
    var url = urlActual(), x = d();
    window.open(url, '_blank', 'noopener');
    // Lo fijo queda para la próxima
    if (tipo === 'dom') {
        pref.inspectorDom = x.inspector; pref.instrumentoDom = x.instrumento;
        if (x.zona) pref.contratistasDom = Object.assign({}, pref.contratistasDom, { [x.zona]: x.contratista });
    } else {
        pref.inspector = x.inspector; pref.zona = x.zona;
        if (x.zona) { pref.comunas = Object.assign({}, pref.comunas, { [x.zona]: x.comuna }); pref.aliados = Object.assign({}, pref.aliados, { [x.zona]: x.aliado }); }
    }
    guardar(PREF, pref);
    var h = leer(HISTORIAL, []);
    h.unshift({ form: tipo, fecha: x.fecha, zona: x.zona, ruta: x.ruta || '', evento: x.evento || '', tipo: x.tipo || x.instrumento, url: url, abierto: new Date().toISOString() });
    guardar(HISTORIAL, h.slice(0, 40));
    pintarHistorial(); pintarRevisiones();
    toast('Formulario abierto en otra pestaña: revise y pulse «Enviar» allá.');
}
function nuevo() {
    if (tipo === 'dom') datosDom = vacioDom(hoy(), pref); else datos = vacio(hoy(), pref);
    guardarTodo(); pintar();
}
function COMUNAS_SUGERIDAS() {
    var c = {};
    Object.values(pref.comunas || {}).concat(['COMUNA 9 BUENOS AIRES', 'COMUNA 10 LA CANDELARIA', 'COMUNA 14 POBLADO']).forEach(function (x) { if (x) c[x] = 1; });
    return Object.keys(c);
}

async function arrancar() {
    iniciarEncabezado();
    pref = leer(PREF, {}) || {};
    tipo = leer(TIPO, 'choque') === 'dom' ? 'dom' : 'choque';
    datos = Object.assign(vacio(hoy(), pref), leer(BORRADOR, {}) || {});
    if (!Array.isArray(datos.novedades)) datos.novedades = [];
    datosDom = Object.assign(vacioDom(hoy(), pref), leer(BORRADOR_DOM, {}) || {});
    $('ins-comunas').innerHTML = COMUNAS_SUGERIDAS().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    $('ins-cuenta').value = pref.cuenta || '';
    pintar(); pintarHistorial();

    $('ins-tipos').onclick = function (ev) { var b = ev.target.closest('[data-tipo]'); if (b) { tipo = b.dataset.tipo; guardar(TIPO, tipo); pintar(); } };
    $('ins-cuenta').oninput = function () { pref.cuenta = $('ins-cuenta').value.trim(); guardar(PREF, pref); };
    $('ins-form').addEventListener('input', function (ev) {
        var el = ev.target.closest('[data-campo]');
        if (!el) return;
        var k = el.dataset.campo, x = d();
        x[k] = k === 'ruta' ? el.value.toUpperCase() : el.value;
        if (k === 'zona') {
            if (tipo === 'dom') x.contratista = contratistaDe(x.zona, pref) || x.contratista;
            else { x.comuna = comunaDe(x.zona, pref) || x.comuna; x.aliado = aliadoDe(x.zona, pref) || x.aliado; }
            guardarTodo(); return pintar();
        }
        if (k === 'tipo') { guardarTodo(); return pintar(); }
        guardarTodo(); pintarEstado();
    });
    $('ins-form').addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        var x = d();
        if (b.dataset.sn) x[b.dataset.sn] = b.dataset.valor;
        if (b.dataset.nov) { var i = x.novedades.indexOf(b.dataset.nov); if (i === -1) x.novedades.push(b.dataset.nov); else x.novedades.splice(i, 1); }
        if (b.dataset.todoSi) (b.dataset.todoSi === 'personal' ? PERSONAL : SERVICIO).forEach(function (c) { x[c[0]] = 'Si'; });
        guardarTodo(); pintar();
    });
    $('ins-revisiones').onclick = function (ev) {
        var b = ev.target.closest('[data-rev]');
        if (!b) return;
        var r = revisiones[+b.dataset.rev], x = d(), v = tipo === 'dom' ? desdeRevisionDom(r) : desdeRevision(r);
        Object.keys(v).forEach(function (k) { if (v[k] && (!Array.isArray(v[k]) || v[k].length)) x[k] = v[k]; });
        if (tipo === 'dom') { if (v.zona) x.contratista = contratistaDe(v.zona, pref) || x.contratista; }
        else { if (v.zona) { x.comuna = comunaDe(v.zona, pref) || x.comuna; x.aliado = aliadoDe(v.zona, pref) || x.aliado; } x.tipo = OPCIONES.tipo[0]; }
        guardarTodo(); pintar();
        var falta = (tipo === 'dom' ? faltantesDom(x) : faltantes(x));
        toast('Datos traídos de la revisión de ' + r.ruta + '.' + (falta.length ? ' Falta: ' + falta.join(', ') + '.' : ' Ya puede abrirlo.'));
    };
    $('ins-abrir').onclick = abrir;
    $('ins-copiar').onclick = async function () {
        try { await navigator.clipboard.writeText(urlActual()); toast('Enlace copiado.'); } catch (e) { toast('No se pudo copiar el enlace.'); }
    };
    $('ins-nuevo').onclick = nuevo;
    $('ins-hist').onclick = function (ev) {
        var b = ev.target.closest('[data-quitar]');
        if (!b) return;
        var h = leer(HISTORIAL, []); h.splice(+b.dataset.quitar, 1); guardar(HISTORIAL, h); pintarHistorial(); pintarRevisiones();
    };
    if (!configurado) { pintarRevisiones(); return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    $('btn-salir').onclick = function () { cerrarSesion(supabase); };
    $('btn-recargar').onclick = cargarRevisiones;
    await aplicarPermisos(supabase, usuario);
    // Inspector del plan de choque: la primera vez, el nombre de la cuenta
    if (!datos.inspector) {
        var n = await supabase.rpc('nombre_usuario');
        if (!n.error && n.data && !/@/.test(n.data)) { datos.inspector = n.data; guardarTodo(); pintar(); }
    }
    await cargarRevisiones();
}
arrancar();
