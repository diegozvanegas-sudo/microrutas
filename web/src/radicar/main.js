// radicar.html: dejar lista una PQR para radicarla en el formulario de EMVARIAS (Lappiz) lo más rápido posible.
// El formulario de EMVARIAS tiene reCAPTCHA: la app no lo llena ni lo envía. Aquí se escriben los datos una vez, en el mismo
// orden y con las mismas opciones; cada campo tiene «Copiar» y un botón abre el formulario. Al radicar, se anota el número
// que entrega EMVARIAS y queda en el listado. Todo queda en este equipo (son datos personales del ciudadano).
import '../subsanaciones/estilos.css';
import '../requerimiento/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { URL_RADICAR, URL_CONSULTAR, OPCIONES, LETRAS, armarDireccion, leerDireccion, CONTENIDOS, faltantes } from './datos.js';
import { datosMarcador, enlaceMarcador } from './marcador.js';

var BORRADOR = 'radicar_borrador', HISTORIAL = 'radicar_historial', PERFILES = 'radicar_perfiles';
var editandoId = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function aTexto(f) { var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : f || ''; }
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

// Campos en el orden del formulario de EMVARIAS. tipo: texto | lista | si-no | area
var SECCIONES = [
    { titulo: '1. Tipo de solicitud', campos: [{ id: 'tipoSolicitud', et: 'Tipo de solicitud', tipo: 'lista', ops: OPCIONES.tipoSolicitud, ob: true }] },
    { titulo: '2. Datos del solicitante', campos: [
        { id: 'tipoSolicitante', et: 'Tipo de solicitante', tipo: 'lista', ops: OPCIONES.tipoSolicitante, ob: true },
        { id: 'multiusuario', et: 'Multiusuario', tipo: 'lista', ops: ['No', 'Sí'] },
        { id: 'tipoIdentificacion', et: 'Tipo de identificación', tipo: 'lista', ops: OPCIONES.tipoIdentificacion, ob: true },
        { id: 'numeroIdentificacion', et: 'Número de identificación', ob: true, modo: 'numeric' },
        { id: 'primerNombre', et: 'Primer nombre o razón social', ob: true },
        { id: 'segundoNombre', et: 'Segundo nombre' },
        { id: 'primerApellido', et: 'Primer apellido', ob: true },
        { id: 'segundoApellido', et: 'Segundo apellido' }] },
    { titulo: '3. Dirección de prestación del servicio', campos: [
        { id: 'pais', et: 'País', ob: true, def: 'COLOMBIA' }, { id: 'departamento', et: 'Departamento', ob: true, def: 'Antioquia' },
        { id: 'municipio', et: 'Municipio', ob: true, def: 'MEDELLÍN' }, { id: 'barrio', et: 'Barrio', mayus: true },
        { id: 'numeroContrato', et: 'Número de contrato', modo: 'numeric' }, { id: 'prestacion', et: 'Dirección de prestación del servicio', tipo: 'direccion' },
        { id: 'complementoPrestacion', et: 'Complemento de dirección de prestación' }] },
    { titulo: '4. Dirección de notificación', campos: [
        { id: 'mismaNotificacion', et: 'Usar la misma dirección de prestación del servicio para notificación', tipo: 'casilla', def: true },
        { id: 'notificacion', et: 'Dirección de notificación', tipo: 'direccion', ob: true, siNo: 'mismaNotificacion' },
        { id: 'complementoNotificacion', et: 'Complemento de dirección de notificación', siNo: 'mismaNotificacion' }] },
    { titulo: '5. Datos de contacto', campos: [
        { id: 'telefonoMovil', et: 'Teléfono móvil', ob: true, modo: 'tel' }, { id: 'telefonoFijo', et: 'Teléfono fijo', ob: true, modo: 'tel' },
        { id: 'correo', et: 'Correo electrónico', ob: true, modo: 'email' }, { id: 'medioRespuesta', et: 'Medio de respuesta', tipo: 'lista', ops: OPCIONES.medioRespuesta, ob: true },
        { id: 'nombreContacto', et: 'Nombre de contacto' }] },
    { titulo: '6. Contenido de la solicitud', campos: [{ id: 'contenido', et: 'Contenido de la solicitud', tipo: 'area', ob: true }] },
];
var TODOS = [].concat.apply([], SECCIONES.map(function (s) { return s.campos; }));
var PARTES = [['via', 'Tipo de vía', OPCIONES.tipoVia], ['num1', 'Número'], ['letra1', 'Letra', LETRAS], ['orient1', 'Orientación', OPCIONES.orientacion],
    ['num2', 'Número generador'], ['letra2', 'Letra generador', LETRAS], ['orient2', 'Orientación generador', OPCIONES.orientacion], ['placa', 'Placa / interior']];
// Datos del solicitante que se guardan como perfil (para no volver a escribirlos)
var DEL_PERFIL = ['tipoSolicitante', 'multiusuario', 'tipoIdentificacion', 'numeroIdentificacion', 'primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido',
    'telefonoMovil', 'telefonoFijo', 'correo', 'medioRespuesta', 'nombreContacto'];

function botonCopiar(id, et) { return '<button type="button" class="copiar-campo" data-copiar="' + id + '" title="Copiar «' + esc(et) + '»" aria-label="Copiar ' + esc(et) + '">📋</button>'; }
function htmlCampo(c) {
    var ob = c.ob ? ' <span class="ob">*</span>' : '', cab = '<span class="et">' + esc(c.et) + ob + '</span>';
    var envolver = function (control, ancho) { return '<div class="rad-campo' + (ancho ? ' ancho' : '') + '" data-campo="' + c.id + '"' + (c.siNo ? ' data-si-no="' + c.siNo + '"' : '') + '>' + cab + '<div class="rad-control">' + control + botonCopiar(c.id, c.et) + '</div></div>'; };
    if (c.tipo === 'lista') return envolver('<select id="r-' + c.id + '"><option value="">Seleccione…</option>' + c.ops.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>');
    if (c.tipo === 'area') return envolver('<textarea id="r-' + c.id + '" rows="8"></textarea>', true);
    if (c.tipo === 'casilla') return '<label class="rad-casilla ancho"><input type="checkbox" id="r-' + c.id + '"> ' + esc(c.et) + '</label>';
    if (c.tipo === 'direccion') {
        return '<div class="rad-dir ancho" data-campo="' + c.id + '"' + (c.siNo ? ' data-si-no="' + c.siNo + '"' : '') + '>' + cab +
            '<div class="rad-control"><input type="text" id="r-' + c.id + '-corrido" placeholder="Escríbala de corrido: Calle 90 # 48 - 02" aria-label="' + esc(c.et) + ' de corrido"></div>' +
            '<div class="rad-partes">' + PARTES.map(function (p) {
                var id = 'r-' + c.id + '-' + p[0];
                return '<label><span>' + esc(p[1]) + '</span>' + (p[2] ? '<select id="' + id + '"><option value=""></option>' + p[2].map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'
                    : '<input type="text" id="' + id + '" inputmode="numeric">') + '</label>';
            }).join('') + '</div>' +
            '<div class="rad-control rad-vista"><span id="r-' + c.id + '-vista" class="sub">Aún no hay dirección</span>' + botonCopiar(c.id, c.et) + '</div></div>';
    }
    return envolver('<input type="' + (c.modo === 'email' ? 'email' : 'text') + '" id="r-' + c.id + '"' + (c.modo && c.modo !== 'email' ? ' inputmode="' + c.modo + '"' : '') + (c.mayus ? ' autocapitalize="characters"' : '') + ' autocomplete="off">', c.tipo === 'area');
}

function datos() {
    var f = { id: editandoId };
    TODOS.forEach(function (c) {
        if (c.tipo === 'direccion') { var d = {}; PARTES.forEach(function (p) { d[p[0]] = $('r-' + c.id + '-' + p[0]).value.trim(); }); f[c.id] = d; }
        else if (c.tipo === 'casilla') f[c.id] = $('r-' + c.id).checked;
        else f[c.id] = $('r-' + c.id).value.trim();
    });
    f.radicado = $('r-radicado').value.trim();
    return f;
}
function poner(f) {
    f = f || {};
    editandoId = f.id || null;
    TODOS.forEach(function (c) {
        if (c.tipo === 'direccion') PARTES.forEach(function (p) { $('r-' + c.id + '-' + p[0]).value = (f[c.id] || {})[p[0]] || ''; });
        else if (c.tipo === 'casilla') $('r-' + c.id).checked = f[c.id] != null ? !!f[c.id] : !!c.def;
        else $('r-' + c.id).value = f[c.id] != null ? f[c.id] : c.def || '';
    });
    $('r-radicado').value = f.radicado || '';
    ['prestacion', 'notificacion'].forEach(function (k) { $('r-' + k + '-corrido').value = ''; });
    $('f-titulo').textContent = editandoId ? 'PQR ' + (f.radicado || 'sin radicar') : 'Nueva PQR';
    actualizar();
}
// Valor de un campo tal como se pega en el formulario de EMVARIAS
function valorCampo(f, id) {
    if (id === 'prestacion') return armarDireccion(f.prestacion);
    if (id === 'notificacion') return armarDireccion(f.mismaNotificacion ? f.prestacion : f.notificacion);
    if (id === 'complementoNotificacion' && f.mismaNotificacion) return f.complementoPrestacion;
    return f[id] == null ? '' : String(f[id]);
}
function textoTodo(f) {
    return SECCIONES.map(function (s) {
        return s.titulo.toUpperCase() + '\n' + s.campos.filter(function (c) { return c.tipo !== 'casilla'; }).map(function (c) {
            var v = valorCampo(f, c.id);
            return v ? c.et + ': ' + v : '';
        }).filter(Boolean).join('\n');
    }).join('\n\n');
}
function actualizar() {
    var f = datos();
    ['prestacion', 'notificacion'].forEach(function (k) {
        var v = valorCampo(f, k);
        $('r-' + k + '-vista').textContent = v || 'Aún no hay dirección';
        $('r-' + k + '-vista').classList.toggle('sub', !v);
    });
    document.querySelectorAll('[data-si-no]').forEach(function (el) { el.hidden = $('r-' + el.dataset.siNo).checked; });
    // Anónimo: no se piden documento ni nombres
    var anon = f.tipoSolicitante === 'Anónimo';
    ['tipoIdentificacion', 'numeroIdentificacion', 'primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido'].forEach(function (id) {
        document.querySelector('[data-campo="' + id + '"]').classList.toggle('apagado', anon);
    });
    var falta = faltantes(f), corchetes = (String(f.contenido).match(/\[[^\]\n]{3,}\]/g) || []);
    $('f-avisos').textContent = (falta.length ? '⚠ Falta: ' + falta.join(', ') + '. ' : '✓ Datos obligatorios completos. ') + (corchetes.length ? '⚠ Sin llenar en el contenido: ' + corchetes.slice(0, 3).join(' ') : '');
    $('f-avisos').classList.toggle('ok', !falta.length && !corchetes.length);
    var n = String(f.contenido || '').length;
    $('r-contador').textContent = n + (n === 1 ? ' carácter' : ' caracteres');
}
var tBorrador = null;
function cambio() {
    actualizar();
    clearTimeout(tBorrador);
    tBorrador = setTimeout(function () { guardar(BORRADOR, datos()); $('f-guardado').textContent = 'Borrador guardado ' + new Date().toTimeString().slice(0, 5); }, 600);
}
async function copiar(texto, nombre) {
    if (!texto) return toast('«' + nombre + '» está vacío.');
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
        var a = document.createElement('textarea'); a.value = texto; a.style.position = 'fixed'; a.style.opacity = '0';
        document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
    }
    toast('Copiado: ' + nombre + '. Péguelo en el formulario de EMVARIAS.');
}

// ---------- Listado de PQR (en este equipo) ----------
function historial() { return leer(HISTORIAL, []); }
function guardarEnHistorial(f) {
    var h = historial(), ahora = new Date().toISOString();
    if (!f.id) f.id = 'P' + Date.now().toString(36);
    var i = h.findIndex(function (x) { return x.id === f.id; }), fila = Object.assign({}, f, { modificado: ahora, estado: f.radicado ? 'Radicada' : 'Sin radicar' });
    if (i === -1) { fila.creado = ahora; h.unshift(fila); } else { fila.creado = h[i].creado; h[i] = fila; }
    if (!guardar(HISTORIAL, h.slice(0, 300))) toast('No se pudo guardar en este equipo (sin espacio).');
    editandoId = f.id;
    return fila;
}
function nombreSolicitante(x) { return x.tipoSolicitante === 'Anónimo' ? 'Anónimo' : [x.primerNombre, x.primerApellido].filter(Boolean).join(' '); }
function pintarHistorial() {
    var q = $('h-buscar').value.trim().toLowerCase(), h = historial().filter(function (x) {
        return !q || [x.radicado, x.tipoSolicitud, nombreSolicitante(x), armarDireccion(x.prestacion), x.barrio, x.contenido].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    $('h-tabla').innerHTML = '<thead><tr><th>Fecha</th><th>Radicado</th><th>Tipo</th><th>Solicitante</th><th>Dirección</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
        (h.length ? h.map(function (x) {
            return '<tr><td data-et="Fecha">' + esc(aTexto((x.creado || '').slice(0, 10))) + '</td><td data-et="Radicado"><b>' + esc(x.radicado || '—') + '</b></td>' +
                '<td data-et="Tipo">' + esc(x.tipoSolicitud) + '</td><td data-et="Solicitante">' + esc(nombreSolicitante(x)) + '</td>' +
                '<td data-et="Dirección">' + esc(armarDireccion(x.prestacion)) + (x.barrio ? ' · ' + esc(x.barrio) : '') + '</td>' +
                '<td data-et="Estado"><span class="rad-est ' + (x.radicado ? 'ok' : 'pend') + '">' + esc(x.estado) + '</span></td>' +
                '<td class="acc"><button type="button" class="secundario pequeno" data-h="abrir" data-id="' + esc(x.id) + '">✎ Abrir</button>' +
                '<button type="button" class="secundario pequeno" data-h="duplicar" data-id="' + esc(x.id) + '" title="Nueva PQR con los mismos datos del solicitante">⧉</button>' +
                '<button type="button" class="secundario pequeno" data-h="copiar" data-id="' + esc(x.id) + '" title="Copiar todos los datos">📋</button>' +
                (x.radicado ? '<a class="boton secundario pequeno" href="' + URL_CONSULTAR + '" target="_blank" rel="noopener" title="Consultar en EMVARIAS">🔎</a>' : '') +
                '<button type="button" class="secundario pequeno" data-h="eliminar" data-id="' + esc(x.id) + '" title="Eliminar">🗑</button></td></tr>';
        }).join('') : '<tr><td colspan="7" class="sub">' + (q ? 'Nada con «' + esc(q) + '».' : 'Todavía no hay PQR en este equipo. Use «+ Nueva PQR».') + '</td></tr>') + '</tbody>';
}
function verListado() { $('form-rad').hidden = true; $('rad-historial').hidden = false; pintarHistorial(); window.scrollTo(0, 0); }
function verForm(f) { $('rad-historial').hidden = true; $('form-rad').hidden = false; poner(f); window.scrollTo(0, 0); }
function pintarPerfiles() {
    var p = leer(PERFILES, []);
    $('r-perfil').innerHTML = '<option value="">Datos del solicitante guardados…</option>' + p.map(function (x, i) { return '<option value="' + i + '">' + esc(x.nombre) + '</option>'; }).join('');
    $('r-perfil-quitar').hidden = !p.length;
}

function eventos() {
    $('r-secciones').innerHTML = SECCIONES.map(function (s) {
        return '<section class="panel rad-panel"><h2>' + esc(s.titulo) + '</h2>' + (s.titulo.indexOf('6.') === 0
            ? '<div class="rad-plantillas"><span class="sub">Texto sugerido:</span>' + CONTENIDOS.map(function (c) { return '<button type="button" class="chip-rad" data-contenido="' + c.id + '">' + esc(c.titulo) + '</button>'; }).join('') + '</div>' : '') +
            '<div class="rad-campos">' + s.campos.map(htmlCampo).join('') + '</div>' +
            (s.titulo.indexOf('6.') === 0 ? '<div class="sub rad-pie-contenido"><span id="r-contador"></span> · Los archivos (fotos, PDF, máximo 10 MB cada uno) se adjuntan directo en el formulario de EMVARIAS.</div>' : '') + '</section>';
    }).join('');
    $('form-rad').addEventListener('input', function (ev) {
        var corrido = ev.target.id && ev.target.id.match(/^r-(prestacion|notificacion)-corrido$/);
        if (corrido) {
            var d = leerDireccion(ev.target.value);
            if (d) PARTES.forEach(function (p) { $('r-' + corrido[1] + '-' + p[0]).value = d[p[0]] || ''; });
        }
        cambio();
    });
    $('form-rad').addEventListener('change', cambio);
    $('form-rad').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-copiar]');
        if (b) { var c = TODOS.filter(function (x) { return x.id === b.dataset.copiar; })[0]; copiar(valorCampo(datos(), b.dataset.copiar), c ? c.et : ''); return; }
        var p = ev.target.closest('[data-contenido]');
        if (p) {
            var t = CONTENIDOS.filter(function (x) { return x.id === p.dataset.contenido; })[0];
            if (!t) return;
            var area = $('r-contenido');
            area.value = area.value.trim() ? area.value.trim() + '\n\n' + t.t : t.t;
            if (!$('r-tipoSolicitud').value) $('r-tipoSolicitud').value = t.tipo;
            var f = datos(), dir = armarDireccion(f.prestacion);
            if (dir) area.value = area.value.replace('[dirección]', dir);
            if (f.barrio) area.value = area.value.replace('[barrio]', f.barrio);
            cambio(); area.focus();
        }
    });
    $('btn-copiar-todo').onclick = function () { copiar(textoTodo(datos()), 'todos los datos'); };
    $('btn-copiar-marcador').onclick = function () { copiar(datosMarcador(datos()), 'los datos para el marcador 🪄'); };
    $('lnk-marcador').href = enlaceMarcador();
    $('lnk-marcador').onclick = function (ev) { ev.preventDefault(); toast('Arrástrelo a la barra de favoritos. Se usa estando en la página de EMVARIAS.'); };
    $('btn-copiar-marcador-codigo').onclick = function () { copiar(enlaceMarcador(), 'el código del marcador'); };
    $('btn-copiar-contenido').onclick = function () { copiar(datos().contenido, 'contenido de la solicitud'); };
    // Copia los datos para el marcador 🪄 (en el mismo toque, así el navegador lo permite) y abre el formulario
    $('btn-abrir').onclick = function () {
        var f = datos(), falta = faltantes(f);
        try { navigator.clipboard.writeText(datosMarcador(f)); } catch (e) { /* si no deja, el marcador pide pegarlos */ }
        guardarEnHistorial(f);
        if (falta.length) toast('Ojo, falta: ' + falta.join(', ') + '. EMVARIAS lo va a pedir.');
    };
    $('btn-guardar').onclick = function () { var f = guardarEnHistorial(datos()); localStorage.removeItem(BORRADOR); $('f-titulo').textContent = 'PQR ' + (f.radicado || 'sin radicar'); toast(f.radicado ? 'Guardada como radicada: ' + f.radicado + '.' : 'Guardada. Cuando EMVARIAS le dé el número, escríbalo en «Número de radicado».'); };
    $('btn-nueva').onclick = function () { localStorage.removeItem(BORRADOR); verForm({}); };
    $('btn-volver').onclick = function () { verListado(); };
    $('h-buscar').oninput = pintarHistorial;
    $('h-tabla').onclick = async function (ev) {
        var b = ev.target.closest('[data-h]');
        if (!b) return;
        var h = historial(), i = h.findIndex(function (x) { return x.id === b.dataset.id; }), x = h[i];
        if (!x) return;
        if (b.dataset.h === 'abrir') verForm(x);
        else if (b.dataset.h === 'duplicar') { var n = {}; DEL_PERFIL.concat(['pais', 'departamento', 'municipio']).forEach(function (k) { n[k] = x[k]; }); verForm(n); }
        else if (b.dataset.h === 'copiar') copiar(textoTodo(x), 'todos los datos');
        else if (b.dataset.h === 'eliminar') {
            if (!(await confirmar('¿Eliminar la PQR ' + (x.radicado || 'sin radicar') + '?', 'Se borra de este equipo. En EMVARIAS no cambia nada.', '🗑 Eliminar'))) return;
            h.splice(i, 1); guardar(HISTORIAL, h); pintarHistorial();
        }
    };
    // Perfiles: datos del solicitante que se repiten (p. ej. los de la interventoría)
    $('r-perfil').onchange = function () {
        var p = leer(PERFILES, [])[+this.value];
        if (!p) return;
        DEL_PERFIL.forEach(function (k) { if (p.datos[k] != null) $('r-' + k).value = p.datos[k]; });
        this.value = ''; cambio(); toast('Datos de «' + p.nombre + '» puestos.');
    };
    $('r-perfil-guardar').onclick = function () {
        var f = datos(), nombre = nombreSolicitante(f) || f.correo;
        if (!nombre) return toast('Escriba primero los datos del solicitante.');
        var p = leer(PERFILES, []), d = {};
        DEL_PERFIL.forEach(function (k) { d[k] = f[k]; });
        var i = p.findIndex(function (x) { return x.nombre === nombre; });
        if (i === -1) p.push({ nombre: nombre, datos: d }); else p[i].datos = d;
        guardar(PERFILES, p); pintarPerfiles(); toast('Guardado «' + nombre + '» para la próxima PQR.');
    };
    $('r-perfil-quitar').onclick = async function () {
        var p = leer(PERFILES, []);
        if (!p.length || !(await confirmar('¿Borrar los ' + p.length + ' datos de solicitante guardados?', 'Se borran de este equipo.', '🗑 Borrar'))) return;
        guardar(PERFILES, []); pintarPerfiles();
    };
    window.addEventListener('beforeunload', function () { if (!$('form-rad').hidden) guardar(BORRADOR, datos()); });
}

async function arrancar() {
    iniciarEncabezado();
    eventos();
    $('btn-abrir').href = URL_RADICAR;
    $('lnk-consultar').href = URL_CONSULTAR;
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    // Al salir se borran los datos personales guardados en este equipo
    $('btn-salir').onclick = function () { try { [BORRADOR, PERFILES].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario);
    $('estado').hidden = true;
    pintarPerfiles();
    var b = leer(BORRADOR, null);
    if (b && (b.contenido || b.primerNombre) && await confirmar('¿Seguir con la PQR sin terminar?', 'Hay una PQR a medio llenar en este equipo.', 'Seguir', 'Ver el listado')) verForm(b);
    else verListado();
}

arrancar();
