// requerimiento.html: requerimientos de interventoría al contratista cuando no se cumple la labor del corte de césped.
// Plantillas por tipo de falencia (REQ-PLANTILLAS, privadas: solo con sesión y permiso de contrato), formulario editable,
// PDF con el formato GD-FR-016 (pdf.js) y envío por correo. Los requerimientos se guardan en este equipo (sin las fotos).
// El membrete lo pone cada usuario (⚙️ Configuración) y las firmas van en blanco: nada de eso está en el repositorio.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { leerPlantillas, firma, rellenar, pendientes, fechaEvento } from './plantillas.js';
import { armarPdf } from './pdf.js';

var CACHE = 'req_plantillas_cache', BORRADOR = 'req_borrador', HISTORIAL = 'req_historial', CONFIG = 'req_config', MEMBRETE = 'req_membrete';
var ZONAS = ['1', '2', '3', '4', '5', '6', '7'];
var P = { config: {}, ans: {}, plantillas: [], catalogo: [] }, fotos = [], editandoId = null, cambios = false;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hoy() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function aTexto(f) { var m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : f || ''; }
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function cfg(k) { return (P.config[k] || [])[0] || ''; }

// ---------- Configuración del usuario (sobre los valores de las plantillas) ----------
function configUsuario() {
    var c = leer(CONFIG, {});
    return {
        firmas: c.firmas || (P.config.firma || []).map(firma),
        copias: c.copias || (P.config.copia || []).slice(),
        para: c.para || '', cc: c.cc || ''
    };
}
function membrete() {
    var m = leer(MEMBRETE, null);
    if (!m || !m.datos) return null;
    var b = atob(m.datos.split(',')[1] || ''), bytes = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return { bytes: bytes, tipo: m.tipo };
}

// ---------- Formulario ----------
function vacio() {
    return { id: null, plantilla: '', radicado: '', tipo: 'Hallazgo', fecha: hoy(), eventoDesde: '', eventoHasta: '', zonas: [], ruta: '', asunto: '',
        descripcion: '', evidenciasTexto: 'Fotografías / Correos / Despacho\nEvidencia inspección', obligaciones: [], ans: [], solicitudes: [], plazo: Number(cfg('plazo')) || 5 };
}
function datosForm() {
    return {
        id: editandoId, plantilla: $('f-plantilla').value, radicado: $('f-radicado').value.trim(), tipo: $('f-tipo').value, fecha: $('f-fecha').value,
        eventoDesde: $('f-evento-desde').value, eventoHasta: $('f-evento-hasta').value,
        zonas: Array.prototype.map.call(document.querySelectorAll('#f-zonas input:checked'), function (i) { return i.value; }),
        ruta: $('f-ruta').value.trim(), asunto: $('f-asunto').value.trim(), descripcion: $('f-descripcion').value,
        evidenciasTexto: $('f-evid-texto').value,
        obligaciones: Array.prototype.map.call(document.querySelectorAll('#f-obligaciones .req-obl'), function (d) {
            return { ref: d.querySelector('[data-o="ref"]').value.trim(), t: d.querySelector('[data-o="t"]').value.trim() };
        }).filter(function (o) { return o.ref || o.t; }),
        ans: Array.prototype.map.call(document.querySelectorAll('#f-ans input:checked'), function (i) { return i.value; }),
        solicitudes: Array.prototype.map.call(document.querySelectorAll('#f-solicitudes .req-sol'), function (d) {
            return { t: d.querySelector('[data-s="t"]').value.trim(), ej: d.querySelector('[data-s="ej"]').value.trim() };
        }).filter(function (s) { return s.t || s.ej; }),
        plazo: Number($('f-plazo').value) || 5
    };
}
function filaObligacion(o) {
    return '<div class="req-obl"><input type="text" data-o="ref" value="' + esc(o.ref) + '" placeholder="Numeral (p. ej. 7.7. Actividades complementarias)" aria-label="Numeral">' +
        '<textarea data-o="t" rows="4" aria-label="Texto citado">' + esc(o.t) + '</textarea>' +
        '<button type="button" class="secundario pequeno" data-quitar title="Quitar esta obligación">🗑 Quitar</button></div>';
}
function filaSolicitud(s) {
    return '<div class="req-sol"><textarea data-s="t" rows="2" placeholder="Información solicitada" aria-label="Información solicitada">' + esc(s.t) + '</textarea>' +
        '<input type="text" data-s="ej" value="' + esc(s.ej) + '" placeholder="Soporte sugerido" aria-label="Soporte sugerido">' +
        '<button type="button" class="secundario pequeno" data-quitar title="Quitar esta fila">🗑</button></div>';
}
function ponerForm(d) {
    editandoId = d.id || null;
    $('f-titulo').textContent = editandoId ? 'Requerimiento ' + (d.radicado || 'sin radicado') : 'Nuevo requerimiento';
    $('f-plantilla').value = d.plantilla || '';
    $('f-radicado').value = d.radicado || ''; $('f-tipo').value = d.tipo || 'Hallazgo'; $('f-fecha').value = d.fecha || hoy();
    $('f-evento-desde').value = d.eventoDesde || ''; $('f-evento-hasta').value = d.eventoHasta || '';
    document.querySelectorAll('#f-zonas input').forEach(function (i) { i.checked = (d.zonas || []).indexOf(i.value) !== -1; });
    $('f-ruta').value = d.ruta || ''; $('f-asunto').value = d.asunto || ''; $('f-descripcion').value = d.descripcion || '';
    $('f-evid-texto').value = d.evidenciasTexto || '';
    $('f-obligaciones').innerHTML = (d.obligaciones || []).map(filaObligacion).join('');
    document.querySelectorAll('#f-ans input').forEach(function (i) { i.checked = (d.ans || []).indexOf(i.value) !== -1; });
    $('f-solicitudes').innerHTML = (d.solicitudes || []).map(filaSolicitud).join('');
    $('f-plazo').value = d.plazo || 5;
    avisos();
}
function aplicarPlantilla(id) {
    var p = P.plantillas.find(function (x) { return x.id === id; });
    if (!p) return;
    var d = datosForm();
    d.plantilla = id; d.tipo = p.tipo || d.tipo; d.asunto = p.asunto; d.descripcion = p.descripcion;
    d.obligaciones = p.obligaciones.map(function (o) { return { ref: o.ref, t: o.t }; });
    d.ans = p.ans.slice(); d.solicitudes = p.solicitudes.map(function (s) { return { t: s.t, ej: s.ej }; });
    d.plazo = p.plazo || d.plazo;
    ponerForm(d);
    marcarCambio();
}
// Avisos antes de generar: corchetes sin llenar, campos clave vacíos
function avisos() {
    var d = datosForm(), faltan = [];
    if (!d.radicado) faltan.push('radicado');
    if (!d.asunto) faltan.push('asunto');
    if (!d.eventoDesde) faltan.push('fecha del evento');
    var corchetes = pendientes([d.asunto, d.descripcion, d.ruta]);
    $('f-ans-cuenta').textContent = d.ans.length ? '· ' + d.ans.length + (d.ans.length === 1 ? ' marcado' : ' marcados') + ': ANS ' + d.ans.join(', ') : '· ninguno marcado';
    $('f-avisos').innerHTML = (faltan.length ? '⚠ Falta: ' + esc(faltan.join(', ')) + '. ' : '') +
        (corchetes.length ? '⚠ Sin llenar: ' + esc(corchetes.slice(0, 3).join(' ')) + (corchetes.length > 3 ? '…' : '') : '') ||
        (fotos.length ? fotos.length + (fotos.length === 1 ? ' foto' : ' fotos') + ' de evidencia' : '');
    return { faltan: faltan, corchetes: corchetes };
}
var tBorrador = null;
function marcarCambio() {
    cambios = true;
    avisos();
    clearTimeout(tBorrador);
    tBorrador = setTimeout(function () { guardar(BORRADOR, datosForm()); $('f-guardado').textContent = 'Borrador guardado ' + new Date().toTimeString().slice(0, 5); }, 600);
}

// ---------- Fotos de evidencia (en memoria; se reducen a 1600 px) ----------
async function prepararFoto(file) {
    var bmp = await createImageBitmap(file), e = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: 'jpg', url: URL.createObjectURL(blob), nombre: file.name, pie: '' };
}
function pintarFotos() {
    $('f-fotos-lista').innerHTML = fotos.map(function (f, i) {
        return '<li><img src="' + f.url + '" alt=""><div class="req-foto-datos"><span class="sub">' + esc(f.nombre) + '</span>' +
            '<input type="text" data-foto="' + i + '" value="' + esc(f.pie) + '" placeholder="Pie de la foto (lote, fecha, qué se ve)" aria-label="Pie de la foto ' + (i + 1) + '"></div>' +
            '<div class="req-foto-acc"><button type="button" class="secundario pequeno" data-subir="' + i + '" title="Subir" ' + (i ? '' : 'disabled') + '>↑</button>' +
            '<button type="button" class="secundario pequeno" data-quitar-foto="' + i + '" title="Quitar">🗑</button></div></li>';
    }).join('');
    avisos();
}

// ---------- PDF y correo ----------
function datosPdf(d) {
    var c = configUsuario();
    return {
        radicado: d.radicado, contratista: cfg('contratista'), contrato: cfg('contrato'), servicio: cfg('servicio'),
        zonas: d.zonas.map(function (z) { return 'Zona ' + z; }), asunto: d.asunto, ruta: d.ruta, fechaEvento: fechaEvento(d.eventoDesde, d.eventoHasta),
        fechaRequerimiento: aTexto(d.fecha), descripcion: d.descripcion,
        evidenciasTexto: d.evidenciasTexto.split('\n').map(function (t) { return t.trim(); }).filter(Boolean),
        evidencias: fotos.map(function (f) { return { bytes: f.bytes, tipo: f.tipo, pie: f.pie }; }),
        consideraciones: cfg('consideraciones'), obligacionesIntro: cfg('obligaciones_intro'), obligaciones: d.obligaciones,
        ansIntro: cfg('ans_intro'), ans: d.ans.map(function (n) { return { clave: 'ANS ' + n, t: P.ans[n] || '' }; }).filter(function (a) { return a.t; }),
        solicitudes: d.solicitudes, soportes: cfg('soportes'), plazo: d.plazo,
        consideracionesRespuesta: cfg('consideraciones_respuesta'), preventivo: cfg('preventivo'),
        firmas: c.firmas, copias: c.copias, codigo: cfg('codigo'), pie: cfg('pie')
    };
}
function nombreArchivo(d) {
    return ('Requerimiento ' + (d.radicado || 'sin radicado') + ' ' + (d.asunto || '').slice(0, 60)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
}
async function generar(conAvisos) {
    var d = datosForm(), a = avisos();
    if (conAvisos && (a.faltan.length || a.corchetes.length)) {
        var seguir = await confirmar('¿Generar el PDF así?', (a.faltan.length ? 'Falta: ' + a.faltan.join(', ') + '.\n' : '') +
            (a.corchetes.length ? 'Quedan textos sin llenar: ' + a.corchetes.join(' ') : ''), 'Generar igual', 'Volver a revisar');
        if (!seguir) return null;
    }
    var bytes = await armarPdf(datosPdf(d), { membrete: membrete() });
    return { d: d, bytes: bytes, nombre: nombreArchivo(d) };
}
function descargar(bytes, nombre) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function textosCorreo(d) {
    var datos = { radicado: d.radicado || '', asunto: d.asunto || '', plazo: d.plazo };
    return { asunto: rellenar(cfg('correo_asunto') || 'Requerimiento de interventoría {radicado}', datos), cuerpo: rellenar(cfg('correo_cuerpo') || '', datos) };
}

// ---------- Historial en este equipo (sin fotos) ----------
function historial() { return leer(HISTORIAL, []); }
function guardarEnHistorial(d, estado) {
    var h = historial(), ahora = new Date().toISOString();
    if (!d.id) d.id = 'R' + Date.now().toString(36);
    var i = h.findIndex(function (x) { return x.id === d.id; }), fila = Object.assign({}, d, { estado: estado || (i !== -1 ? h[i].estado : 'Borrador'), modificado: ahora });
    if (i === -1) { fila.creado = ahora; h.unshift(fila); } else { fila.creado = h[i].creado; h[i] = fila; }
    if (!guardar(HISTORIAL, h.slice(0, 200))) toast('No se pudo guardar en este equipo (sin espacio).');
    editandoId = d.id; cambios = false;
    return fila;
}
function pintarHistorial() {
    var q = $('h-buscar').value.trim().toLowerCase(), h = historial().filter(function (x) {
        return !q || [x.radicado, x.asunto, x.ruta, x.tipo].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    $('h-tabla').innerHTML = '<thead><tr><th>Radicado</th><th>Fecha</th><th>Tipo</th><th>Asunto</th><th>Ruta</th><th>Plazo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>' +
        (h.length ? h.map(function (x) {
            return '<tr><td data-et="Radicado"><b>' + esc(x.radicado || '—') + '</b></td><td data-et="Fecha">' + esc(aTexto(x.fecha)) + '</td><td data-et="Tipo">' + esc(x.tipo) + '</td>' +
                '<td data-et="Asunto">' + esc((x.asunto || '').slice(0, 140)) + '</td><td data-et="Ruta">' + esc(x.ruta) + '</td><td data-et="Plazo">' + esc(x.plazo) + ' días háb.</td>' +
                '<td data-et="Estado"><span class="req-est ' + (x.estado === 'Enviado' ? 'enviado' : 'borrador') + '">' + esc(x.estado) + '</span></td>' +
                '<td class="acc"><button type="button" class="secundario pequeno" data-h="abrir" data-id="' + esc(x.id) + '" title="Abrir y editar">✎ Abrir</button>' +
                '<button type="button" class="secundario pequeno" data-h="duplicar" data-id="' + esc(x.id) + '" title="Crear uno nuevo a partir de este">⧉</button>' +
                '<button type="button" class="secundario pequeno" data-h="pdf" data-id="' + esc(x.id) + '" title="Descargar el PDF (sin las fotos)">⬇</button>' +
                '<button type="button" class="secundario pequeno" data-h="enviado" data-id="' + esc(x.id) + '" title="' + (x.estado === 'Enviado' ? 'Volver a borrador' : 'Marcar como enviado') + '">' + (x.estado === 'Enviado' ? '↺' : '✉️✓') + '</button>' +
                '<button type="button" class="secundario pequeno" data-h="eliminar" data-id="' + esc(x.id) + '" title="Eliminar">🗑</button></td></tr>';
        }).join('') : '<tr><td colspan="8" class="sub">' + (q ? 'Nada con «' + esc(q) + '».' : 'Todavía no hay requerimientos guardados en este equipo. Use «+ Nuevo requerimiento».') + '</td></tr>') + '</tbody>';
}
function verListado() {
    $('form-req').hidden = true; $('req-historial').hidden = false;
    fotos.forEach(function (f) { URL.revokeObjectURL(f.url); }); fotos = []; pintarFotos();
    pintarHistorial();
    window.scrollTo(0, 0);
}
function verForm(d) {
    $('req-historial').hidden = true; $('form-req').hidden = false;
    ponerForm(d || vacio());
    cambios = false;
    window.scrollTo(0, 0);
}

// ---------- Plantillas desde la base ----------
async function cargarPlantillas() {
    var r = await supabase.from('convenio_secciones').select('id, orden, icono, titulo, tipo, items').eq('documento', 'REQ-PLANTILLAS').order('orden');
    var filas = r.error ? leer(CACHE, null) : r.data;
    if (!r.error) guardar(CACHE, r.data);
    if (!filas || !filas.length) {
        $('estado').innerHTML = r.error ? 'No se pudieron cargar las plantillas: ' + esc(r.error.message) :
            'Todavía no están cargadas las plantillas de requerimiento. En el computador del proyecto corra <code>npm run guia</code> (sube <code>datos/contrato/requerimientos.json</code>).';
        return false;
    }
    P = leerPlantillas(filas);
    $('f-plantilla').innerHTML = '<option value="">Elegir el tipo de falencia…</option>' + P.plantillas.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc((p.icono ? p.icono + ' ' : '') + p.nombre) + '</option>';
    }).join('');
    $('f-obl-catalogo').innerHTML = '<option value="">Obligación en blanco</option>' + P.catalogo.map(function (o, i) {
        return '<option value="' + i + '">' + esc(o.ref + ' — ' + o.t.slice(0, 70)) + '…</option>';
    }).join('');
    $('f-ans').innerHTML = Object.keys(P.ans).sort(function (a, b) { return a - b; }).map(function (n) {
        return '<label title="' + esc(P.ans[n]) + '"><input type="checkbox" value="' + n + '"><span class="ans-txt"><b>ANS ' + n + '</b><span>' + esc(P.ans[n]) + '</span></span></label>';
    }).join('');
    $('estado').hidden = !r.error;
    if (r.error) $('estado').textContent = 'Sin conexión: se usan las plantillas guardadas en este equipo.';
    return true;
}

// ---------- Eventos ----------
function eventos() {
    $('f-zonas').innerHTML = ZONAS.map(function (z) { return '<label><input type="checkbox" value="' + z + '"> Zona ' + z + '</label>'; }).join('');
    $('form-req').addEventListener('input', function (ev) {
        var f = ev.target.closest('[data-foto]');
        if (f) { fotos[+f.dataset.foto].pie = f.value; return; }
        if (ev.target.id !== 'f-plantilla') marcarCambio();
    });
    $('form-req').addEventListener('change', function (ev) { if (ev.target.type === 'checkbox' || ev.target.type === 'date') marcarCambio(); });
    $('f-plantilla').onchange = async function () {
        var id = this.value;
        if (!id) return;
        var d = datosForm();
        if ((d.descripcion.trim() && cambios) && !(await confirmar('¿Cambiar el tipo de falencia?', 'Se reemplazan el asunto, la descripción, las obligaciones, los ANS y lo solicitado. Los datos del caso (radicado, fechas, zonas, ruta) se conservan.', 'Cambiar'))) {
            this.value = d.plantilla; return;
        }
        aplicarPlantilla(id);
    };
    $('form-req').addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-quitar]');
        if (q) { q.parentNode.remove(); marcarCambio(); return; }
        var qf = ev.target.closest('[data-quitar-foto]');
        if (qf) { var k = +qf.dataset.quitarFoto; URL.revokeObjectURL(fotos[k].url); fotos.splice(k, 1); pintarFotos(); return; }
        var s = ev.target.closest('[data-subir]');
        if (s) { var j = +s.dataset.subir, t = fotos[j]; fotos[j] = fotos[j - 1]; fotos[j - 1] = t; pintarFotos(); }
    });
    $('f-obl-agregar').onclick = function () {
        var o = P.catalogo[+$('f-obl-catalogo').value] || { ref: '', t: '' };
        $('f-obligaciones').insertAdjacentHTML('beforeend', filaObligacion(o));
        marcarCambio();
    };
    $('f-sol-agregar').onclick = function () { $('f-solicitudes').insertAdjacentHTML('beforeend', filaSolicitud({ t: '', ej: '' })); marcarCambio(); $('f-solicitudes').lastElementChild.querySelector('textarea').focus(); };
    $('f-fotos-elegir').onclick = function () { $('f-fotos').value = ''; $('f-fotos').click(); };
    $('f-fotos').onchange = async function () {
        var lista = Array.prototype.slice.call(this.files || []);
        $('f-avisos').textContent = 'Preparando ' + lista.length + ' fotos…';
        for (var i = 0; i < lista.length; i++) {
            try { fotos.push(await prepararFoto(lista[i])); } catch (e) { toast('No se pudo leer ' + lista[i].name + '.'); }
        }
        pintarFotos();
    };
    $('btn-nuevo').onclick = function () { localStorage.removeItem(BORRADOR); verForm(vacio()); };
    $('btn-cancelar').onclick = async function () {
        if (cambios && !(await confirmar('¿Volver sin guardar?', 'Los cambios quedan como borrador en este equipo, pero no se agregan al listado.', 'Volver', 'Seguir editando'))) return;
        verListado();
    };
    $('btn-guardar').onclick = function () { var f = guardarEnHistorial(datosForm()); localStorage.removeItem(BORRADOR); $('f-titulo').textContent = 'Requerimiento ' + (f.radicado || 'sin radicado'); toast('Guardado en este equipo.'); };
    $('btn-vista').onclick = async function () {
        var b = this; b.disabled = true;
        try {
            var r = await generar(false), url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
            $('vista-pdf').src = url; $('vista-abrir').href = url;
            $('dlg-vista').showModal();
        } catch (e) { toast('No se pudo generar el PDF: ' + e.message); }
        finally { b.disabled = false; }
    };
    $('vista-cerrar').onclick = function () { $('dlg-vista').close(); };
    $('dlg-vista').addEventListener('close', function () { var u = $('vista-pdf').src; $('vista-pdf').removeAttribute('src'); if (u && u.indexOf('blob:') === 0) setTimeout(function () { URL.revokeObjectURL(u); }, 1000); });
    $('btn-pdf').onclick = async function () {
        var b = this; b.disabled = true;
        try { var r = await generar(true); if (r) { descargar(r.bytes, r.nombre); guardarEnHistorial(r.d); toast('PDF descargado y guardado en el listado.'); } }
        catch (e) { toast('No se pudo generar el PDF: ' + e.message); }
        finally { b.disabled = false; }
    };
    // Correo: en el celular se comparte el PDF directo (Gmail, Outlook…); en el computador se descarga y se abre el correo con el texto listo
    $('btn-correo').onclick = async function () {
        var b = this; b.disabled = true;
        try {
            var r = await generar(true);
            if (!r) return;
            var t = textosCorreo(r.d), c = configUsuario(), archivo = new File([r.bytes], r.nombre, { type: 'application/pdf' });
            guardarEnHistorial(r.d, 'Enviado');
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                try { await navigator.share({ files: [archivo], title: t.asunto, text: t.cuerpo }); toast('Listo: marcado como enviado.'); return; }
                catch (e) { if (e && e.name === 'AbortError') { guardarEnHistorial(r.d, 'Borrador'); return; } }
            }
            descargar(r.bytes, r.nombre);
            location.href = 'mailto:' + encodeURIComponent(c.para) + '?subject=' + encodeURIComponent(t.asunto) + (c.cc ? '&cc=' + encodeURIComponent(c.cc) : '') + '&body=' + encodeURIComponent(t.cuerpo);
            toast('Se descargó el PDF: adjúntelo en el correo que se abrió.');
        } catch (e) { toast('No se pudo preparar el correo: ' + e.message); }
        finally { b.disabled = false; }
    };
    $('h-buscar').oninput = pintarHistorial;
    $('h-tabla').onclick = async function (ev) {
        var b = ev.target.closest('[data-h]');
        if (!b) return;
        var h = historial(), i = h.findIndex(function (x) { return x.id === b.dataset.id; }), x = h[i];
        if (!x) return;
        if (b.dataset.h === 'abrir') verForm(x);
        else if (b.dataset.h === 'duplicar') verForm(Object.assign({}, x, { id: null, radicado: '', fecha: hoy() }));
        else if (b.dataset.h === 'pdf') {
            try { descargar(await armarPdf(datosPdf(x), { membrete: membrete() }), nombreArchivo(x)); } catch (e) { toast('No se pudo generar: ' + e.message); }
        } else if (b.dataset.h === 'enviado') { x.estado = x.estado === 'Enviado' ? 'Borrador' : 'Enviado'; h[i] = x; guardar(HISTORIAL, h); pintarHistorial(); }
        else if (b.dataset.h === 'eliminar') {
            if (!(await confirmar('¿Eliminar el requerimiento ' + (x.radicado || 'sin radicado') + '?', 'Se borra de este equipo. No se puede deshacer.', '🗑 Eliminar'))) return;
            h.splice(i, 1); guardar(HISTORIAL, h); pintarHistorial();
        }
    };
    // Configuración: membrete, firmantes, copias y correos
    $('btn-config').onclick = function () {
        var c = configUsuario(), m = leer(MEMBRETE, null);
        $('c-firmas').value = c.firmas.map(function (f) { return f.nombre + (f.cargo ? ' | ' + f.cargo : ''); }).join('\n');
        $('c-copias').value = c.copias.join('\n'); $('c-para').value = c.para; $('c-cc').value = c.cc;
        $('c-membrete-ver').hidden = !m; if (m) $('c-membrete-ver').src = m.datos;
        $('c-membrete-quitar').hidden = !m;
        $('c-membrete-estado').textContent = m ? 'Membrete guardado en este equipo.' : 'Sin membrete: el PDF sale con margen normal y sin logos.';
        $('dlg-config').showModal();
    };
    $('c-cerrar').onclick = function () { $('dlg-config').close(); };
    $('c-guardar').onclick = function () {
        guardar(CONFIG, {
            firmas: $('c-firmas').value.split('\n').map(function (l) { return firma(l); }).filter(function (f) { return f.nombre; }),
            copias: $('c-copias').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean),
            para: $('c-para').value.trim(), cc: $('c-cc').value.trim()
        });
        $('dlg-config').close(); toast('Configuración guardada en este equipo.');
    };
    $('c-restablecer').onclick = function () { localStorage.removeItem(CONFIG); $('btn-config').onclick(); toast('Se volvió a los valores de las plantillas.'); };
    $('c-membrete-elegir').onclick = function () { $('c-membrete').value = ''; $('c-membrete').click(); };
    $('c-membrete').onchange = async function () {
        var f = this.files && this.files[0];
        if (!f) return;
        try {
            // Se guarda como JPG de 1275 px de ancho (hoja carta a 150 ppp) para que quepa en el equipo
            var bmp = await createImageBitmap(f), c = document.createElement('canvas'), w = 1275, h = Math.round(1275 * 792 / 612);
            c.width = w; c.height = h;
            var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h); bmp.close();
            var datos = c.toDataURL('image/jpeg', 0.88);
            if (!guardar(MEMBRETE, { datos: datos, tipo: 'jpg', nombre: f.name })) throw new Error('no hay espacio en el equipo');
            $('c-membrete-ver').src = datos; $('c-membrete-ver').hidden = false; $('c-membrete-quitar').hidden = false;
            $('c-membrete-estado').textContent = 'Membrete guardado: ' + f.name + '.';
        } catch (e) { $('c-membrete-estado').textContent = 'No se pudo usar la imagen: ' + e.message; }
    };
    $('c-membrete-quitar').onclick = function () { localStorage.removeItem(MEMBRETE); $('c-membrete-ver').hidden = true; this.hidden = true; $('c-membrete-estado').textContent = 'Sin membrete.'; };
    $('btn-recargar').onclick = async function () { if (await cargarPlantillas()) toast('Plantillas actualizadas.'); };
    window.addEventListener('beforeunload', function () { if (!$('form-req').hidden) guardar(BORRADOR, datosForm()); });
}

// Desde otra página: requerimiento.html?plantilla=residuos-8h&ruta=Z1CC0100 (110)&fecha=2026-11-09&zona=1
function desdeUrl() {
    var q = new URLSearchParams(location.search);
    if (!q.toString()) return null;
    var d = vacio();
    if (q.get('ruta')) d.ruta = q.get('ruta');
    if (q.get('fecha')) d.eventoDesde = q.get('fecha');
    if (q.get('zona')) d.zonas = q.get('zona').split(',');
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    return { d: d, plantilla: q.get('plantilla') };
}

async function arrancar() {
    iniciarEncabezado();
    eventos();
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    $('btn-salir').hidden = false;
    $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
    $('btn-salir').onclick = function () { try { localStorage.removeItem(CACHE); } catch (e) {} cerrarSesion(supabase); };
    var permisos = await aplicarPermisos(supabase, usuario);
    if (!permisos.contrato) {
        try { localStorage.removeItem(CACHE); } catch (e) {}
        $('estado').textContent = '🔒 Su usuario no tiene permiso para ver el contrato (las plantillas salen de él). Pídaselo al administrador.';
        return;
    }
    if (!(await cargarPlantillas())) return;
    var url = desdeUrl(), borrador = leer(BORRADOR, null);
    if (url) { verForm(url.d); if (url.plantilla) aplicarPlantilla(url.plantilla); }
    else if (borrador && (borrador.descripcion || borrador.asunto) && await confirmar('¿Seguir con el borrador?', 'Hay un requerimiento sin terminar en este equipo' + (borrador.radicado ? ' (' + borrador.radicado + ')' : '') + '.', 'Seguir', 'Ver el listado')) verForm(borrador);
    else verListado();
}

arrancar();
