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
import { leerPlantillas, firma, rellenar, pendientes, fechaEvento, TIPOS_NOVEDAD, leerFilasNovedades, gruposEvidencia } from './plantillas.js';
import { armarPdf } from './pdf.js';
import { armarDocx, prepararFormato } from './word.js';

var CACHE = 'req_plantillas_cache', BORRADOR = 'req_borrador', HISTORIAL = 'req_historial', CONFIG = 'req_config', MEMBRETE = 'req_membrete', FIRMAS_IMG = 'req_firmas_img', FORMATO = 'req_formato';
var ZONAS = ['1', '2', '3', '4', '5', '6', '7'];
var DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// fotosGrupo[i]: fotos (en memoria) de la evidencia i, en el mismo orden de las tarjetas
var P = { config: {}, ans: {}, plantillas: [], catalogo: [] }, fotosGrupo = [], grupoFotos = -1, editandoId = null, cambios = false;
function todasLasFotos() { return fotosGrupo.reduce(function (a, g) { return a.concat(g || []); }, []); }

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
        para: c.para || '', cc: c.cc || '', revision: c.revision || ''
    };
}
// data:image/…;base64,… → { bytes, tipo }
function deDataUrl(datos) {
    if (!datos || datos.indexOf('data:image/') !== 0) return null;
    var b = atob(datos.split(',')[1] || ''), bytes = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return { bytes: bytes, tipo: /^data:image\/png/.test(datos) ? 'png' : 'jpg' };
}
// El membrete propio del equipo (⚙️ Configuración) o, si no hay, el de las plantillas (privado, en la base)
function membrete() {
    var m = leer(MEMBRETE, null);
    return deDataUrl(m && m.datos) || deDataUrl(cfg('membrete'));
}
// Formato del Word: el elegido en este equipo o, si no hay, el predeterminado de las plantillas (privado, en la base).
// → { bytes, nombre, origen: 'equipo'|'plantillas' } o null (sin formato: el Word sale con el diseño propio y el membrete)
function bytesDe64(datos) {
    var b = atob(String(datos || '').split(',')[1] || ''), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
}
function formatoWord() {
    var f = leer(FORMATO, null);
    if (f && f.datos) return { bytes: bytesDe64(f.datos), nombre: f.nombre || 'formato.docx', origen: 'equipo', info: f.info || null };
    if (cfg('formato_docx')) return { bytes: bytesDe64(cfg('formato_docx')), nombre: cfg('formato_nombre') || 'Formato predeterminado', origen: 'plantillas', info: null };
    return null;
}
function opcionesWord() { var f = formatoWord(); return { membrete: membrete(), formato: f ? f.bytes : null }; }
function aBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
// «Arial 11 · márgenes: arriba 2,7 cm, abajo 3,9 cm, lados 1,3 cm»
function textoFormato(d) {
    if (!d) return '';
    var cm = function (tw) { return (tw / 567).toFixed(1).replace('.', ',') + ' cm'; }, m = d.margenes || {};
    return [d.fuente && d.fuente + (d.tam ? ' ' + String(d.tam).replace('.', ',') : ''), 'ancho útil ' + cm(d.ancho),
        'márgenes: arriba ' + cm(m.arriba || 0) + ', abajo ' + cm(m.abajo || 0) + ', izquierda ' + cm(m.izq || 0) + ', derecha ' + cm(m.der || 0)].filter(Boolean).join(' · ');
}
var pintandoFormato = 0;
async function pintarFormatoConfig() {
    var f = formatoWord(), yo = ++pintandoFormato;
    $('c-formato-quitar').hidden = !f || f.origen !== 'equipo';
    $('c-formato-quitar').textContent = cfg('formato_docx') ? 'Volver al predeterminado' : 'Quitar el formato';
    $('c-formato-ver').hidden = !f;
    if (!f) { $('c-formato-estado').innerHTML = '<b>Sin formato:</b> el Word sale con el diseño de la aplicación y el membrete. Suba el .docx de la institución para usarlo.'; return; }
    $('c-formato-estado').innerHTML = '<b>' + esc(f.nombre) + '</b> · ' + (f.origen === 'equipo' ? 'elegido en este equipo' : 'predeterminado (el mismo para todos)') + '<br><span class="sub">Leyendo…</span>';
    var info = f.info;
    if (!info) { try { info = (await prepararFormato(f.bytes)).datos; } catch (e) { info = null; } }
    if (yo !== pintandoFormato) return;
    $('c-formato-estado').innerHTML = '<b>' + esc(f.nombre) + '</b> · ' + (f.origen === 'equipo' ? 'elegido en este equipo' : 'predeterminado (el mismo para todos)') +
        '<br><span class="sub">' + (info ? esc(textoFormato(info)) : '⚠ No se pudo leer: vuelva al predeterminado o suba otro .docx.') + '</span>';
}
// Imagen de la firma de cada firmante, por nombre: solo en este equipo (cada quien pone la suya)
function firmasImagen() { return leer(FIRMAS_IMG, {}); }
function claveFirma(nombre) { return String(nombre || '').trim().toUpperCase(); }

// ---------- Formulario ----------
function vacio() {
    return { id: null, plantilla: '', radicado: '', tipo: 'Hallazgo', fecha: hoy(), eventoDesde: '', eventoHasta: '', zonas: [], ruta: '', asunto: '',
        descripcion: '', novedades: [], constancia: '',
        evidencias: [{ titulo: 'Fotografías / Correos / Despacho', texto: '' }, { titulo: 'Evidencia inspección', texto: '' }],
        obligaciones: [], ans: [], solicitudes: [], plazo: Number(cfg('plazo')) || 5 };
}
// Filas de la tabla de microrrutas del formulario (las novedades marcadas con botón y las escritas en «Otras»)
function novedadesForm() {
    return Array.prototype.map.call(document.querySelectorAll('#f-novedades .req-nov'), function (f) {
        var tipos = Array.prototype.filter.call(f.querySelectorAll('[data-tipo]'), function (b) { return b.getAttribute('aria-pressed') === 'true'; })
            .map(function (b) { return b.dataset.tipo; });
        f.querySelector('[data-n="otras"]').value.split(';').map(function (t) { return t.trim(); }).filter(Boolean)
            .forEach(function (t) { if (tipos.indexOf(t) === -1) tipos.push(t); });
        return { micro: f.querySelector('[data-n="micro"]').value.trim().toUpperCase(), fecha: f.querySelector('[data-n="fecha"]').value, tipos: tipos };
    }).filter(function (n) { return n.micro || n.fecha || n.tipos.length; });
}
// Evidencias del formulario: todas las tarjetas, también las vacías (van alineadas con sus fotos en fotosGrupo)
function evidenciasForm() {
    return Array.prototype.map.call(document.querySelectorAll('#f-evidencias .req-evid'), function (c) {
        return { titulo: c.querySelector('[data-e="titulo"]').value.trim(), texto: c.querySelector('[data-e="texto"]').value.trim() };
    });
}
function datosForm() {
    return {
        id: editandoId, plantilla: $('f-plantilla').value, radicado: $('f-radicado').value.trim(), tipo: $('f-tipo').value, fecha: $('f-fecha').value,
        eventoDesde: $('f-evento-desde').value, eventoHasta: $('f-evento-hasta').value,
        zonas: Array.prototype.map.call(document.querySelectorAll('#f-zonas input:checked'), function (i) { return i.value; }),
        ruta: $('f-ruta').value.trim(), asunto: $('f-asunto').value.trim(), descripcion: $('f-descripcion').value,
        novedades: novedadesForm(), constancia: $('f-constancia').value.trim(), evidencias: evidenciasForm(),
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
// Una fila de la tabla de microrrutas: código, fecha, botones de los tipos más comunes y «Otras» (separadas por «;»)
function filaNovedad(n) {
    var tipos = (n.tipos || []).map(function (t) { return String(t).trim().replace(/\.$/, ''); }), usados = [];
    var botones = TIPOS_NOVEDAD.map(function (t) {
        var si = tipos.some(function (x) { return x.toLowerCase() === t.toLowerCase(); });
        if (si) usados.push(t.toLowerCase());
        return '<button type="button" class="req-chip" data-tipo="' + esc(t) + '" aria-pressed="' + si + '">' + esc(t) + '</button>';
    }).join('');
    var otras = tipos.filter(function (x) { return x && usados.indexOf(x.toLowerCase()) === -1; }).join('; ');
    return '<div class="req-nov"><div class="req-nov-cab">' +
        '<input type="text" data-n="micro" value="' + esc(n.micro) + '" placeholder="Z4CC0159" aria-label="Microrruta">' +
        '<input type="date" data-n="fecha" value="' + esc(n.fecha) + '" aria-label="Fecha de verificación">' +
        '<button type="button" class="secundario pequeno" data-quitar title="Quitar esta microrruta">🗑</button></div>' +
        '<div class="req-chips">' + botones + '</div>' +
        '<input type="text" data-n="otras" value="' + esc(otras) + '" placeholder="Otras novedades (separadas por ;)" aria-label="Otras novedades"></div>';
}
function ponerNovedades(lista) {
    $('f-novedades').innerHTML = (lista || []).map(filaNovedad).join('');
}
// Tarjeta de una evidencia: título, texto y sus fotos
function tarjetaEvidencia(g, i) {
    var fotos = fotosGrupo[i] || [];
    return '<div class="req-evid" data-grupo="' + i + '"><div class="req-evid-cab"><b>Evidencia ' + (i + 1) + '.</b>' +
        '<input type="text" data-e="titulo" value="' + esc(g.titulo) + '" placeholder="Título (p. ej. Reportes de ejecución de las microrrutas)" aria-label="Título de la evidencia ' + (i + 1) + '">' +
        '<button type="button" class="secundario pequeno" data-quitar-evid="' + i + '" title="Quitar esta evidencia y sus fotos">🗑</button></div>' +
        '<textarea data-e="texto" rows="2" placeholder="Texto (opcional; p. ej. «PDFs de los registros fotográficos de las verificaciones…»)" aria-label="Texto de la evidencia ' + (i + 1) + '">' + esc(g.texto) + '</textarea>' +
        '<ol class="req-fotos">' + fotos.map(function (f, k) {
            return '<li><img src="' + f.url + '" alt=""><div class="req-foto-datos"><span class="sub">' + esc(f.nombre) + '</span>' +
                '<input type="text" data-foto="' + i + ':' + k + '" value="' + esc(f.pie) + '" placeholder="Pie de la foto (opcional)" aria-label="Pie de la foto ' + (k + 1) + '"></div>' +
                '<div class="req-foto-acc"><button type="button" class="secundario pequeno" data-subir="' + i + ':' + k + '" title="Subir" ' + (k ? '' : 'disabled') + '>↑</button>' +
                '<button type="button" class="secundario pequeno" data-quitar-foto="' + i + ':' + k + '" title="Quitar">🗑</button></div></li>';
        }).join('') + '</ol>' +
        '<button type="button" class="secundario zip-elegir" data-fotos-grupo="' + i + '">🖼️ Agregar fotos a la evidencia ' + (i + 1) + (fotos.length ? ' · ' + fotos.length + (fotos.length === 1 ? ' foto' : ' fotos') : '') + '</button></div>';
}
function ponerEvidencias(grupos) {
    while (fotosGrupo.length < grupos.length) fotosGrupo.push([]);
    $('f-evidencias').innerHTML = grupos.map(tarjetaEvidencia).join('');
    avisos();
}
function soltarFotos() { todasLasFotos().forEach(function (f) { URL.revokeObjectURL(f.url); }); fotosGrupo = []; }
function ponerForm(d, conservarFotos) {
    editandoId = d.id || null;
    $('f-titulo').textContent = editandoId ? 'Requerimiento ' + (d.radicado || 'sin radicado') : 'Nuevo requerimiento';
    $('f-plantilla').value = d.plantilla || '';
    $('f-radicado').value = d.radicado || ''; $('f-tipo').value = d.tipo || 'Hallazgo'; $('f-fecha').value = d.fecha || hoy();
    $('f-evento-desde').value = d.eventoDesde || ''; $('f-evento-hasta').value = d.eventoHasta || '';
    document.querySelectorAll('#f-zonas input').forEach(function (i) { i.checked = (d.zonas || []).indexOf(i.value) !== -1; });
    $('f-ruta').value = d.ruta || ''; $('f-asunto').value = d.asunto || ''; $('f-descripcion').value = d.descripcion || '';
    ponerNovedades(d.novedades); $('f-constancia').value = d.constancia || '';
    if (!conservarFotos) soltarFotos();
    ponerEvidencias(gruposEvidencia(d));
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
    if (p.constancia) d.constancia = p.constancia;
    // Los títulos de evidencia de la plantilla reemplazan los actuales; las fotos ya cargadas siguen en su posición
    if (p.evidencias) {
        var titulos = p.evidencias.split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
        var antes = d.evidencias;
        d.evidencias = titulos.map(function (t, i) { return { titulo: t, texto: (antes[i] && antes[i].texto) || '' }; });
        for (var i = titulos.length; i < fotosGrupo.length; i++) if ((fotosGrupo[i] || []).length) d.evidencias.push({ titulo: (antes[i] && antes[i].titulo) || '', texto: '' });
    }
    d.obligaciones = p.obligaciones.map(function (o) { return { ref: o.ref, t: o.t }; });
    d.ans = p.ans.slice(); d.solicitudes = p.solicitudes.map(function (s) { return { t: s.t, ej: s.ej }; });
    d.plazo = p.plazo || d.plazo;
    ponerForm(d, true);
    marcarCambio();
}
// Avisos antes de generar: corchetes sin llenar, campos clave vacíos
function avisos() {
    var d = datosForm(), faltan = [], nFotos = todasLasFotos().length;
    if (!d.radicado) faltan.push('radicado');
    if (!d.asunto) faltan.push('asunto');
    if (!d.eventoDesde) faltan.push('fecha del evento');
    if (!membrete()) faltan.push('membrete (⚙️ Configuración)');
    var sinFecha = d.novedades.filter(function (n) { return !n.fecha; }).length, sinCodigo = d.novedades.filter(function (n) { return !n.micro; }).length;
    if (sinCodigo) faltan.push(sinCodigo + (sinCodigo === 1 ? ' fila' : ' filas') + ' de la tabla sin microrruta');
    if (sinFecha) faltan.push(sinFecha + (sinFecha === 1 ? ' microrruta' : ' microrrutas') + ' sin fecha de verificación');
    var corchetes = pendientes([d.asunto, d.descripcion, d.ruta, d.constancia]);
    $('f-ans-cuenta').textContent = d.ans.length ? '· ' + d.ans.length + (d.ans.length === 1 ? ' marcado' : ' marcados') + ': ANS ' + d.ans.join(', ') : '· ninguno marcado';
    $('f-nov-cuenta').textContent = d.novedades.length ? '· ' + d.novedades.length + (d.novedades.length === 1 ? ' microrruta' : ' microrrutas') + (sinFecha ? ', ' + sinFecha + ' sin fecha' : '') : '· sin filas';
    $('f-nov-fechas').hidden = !d.novedades.some(function (n) { return n.fecha; });
    $('f-avisos').innerHTML = (faltan.length ? '⚠ Falta: ' + esc(faltan.join(', ')) + '. ' : '') +
        (corchetes.length ? '⚠ Sin llenar: ' + esc(corchetes.slice(0, 3).join(' ')) + (corchetes.length > 3 ? '…' : '') : '') ||
        (nFotos ? nFotos + (nFotos === 1 ? ' foto' : ' fotos') + ' de evidencia' : '');
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
// Vuelve a pintar las tarjetas de evidencia con lo que está escrito y las fotos de cada una
function pintarFotos() { ponerEvidencias(evidenciasForm()); }

// ---------- PDF y correo ----------
function datosPdf(d) {
    var c = configUsuario();
    return {
        radicado: d.radicado, contratista: cfg('contratista'), contrato: cfg('contrato'), servicio: cfg('servicio'),
        zonas: d.zonas.map(function (z) { return 'Zona ' + z; }), asunto: d.asunto, ruta: d.ruta, fechaEvento: fechaEvento(d.eventoDesde, d.eventoHasta),
        fechaRequerimiento: aTexto(d.fecha), descripcion: d.descripcion, novedades: d.novedades || [], constancia: d.constancia || '',
        // Las fotos están en memoria solo mientras se edita (en el listado salen sin fotos)
        gruposEvidencia: gruposEvidencia(d).map(function (g, i) {
            return { titulo: g.titulo, texto: g.texto, fotos: (fotosGrupo[i] || []).map(function (f) { return { bytes: f.bytes, tipo: f.tipo, pie: f.pie }; }) };
        }),
        consideraciones: cfg('consideraciones'), obligacionesIntro: cfg('obligaciones_intro'), obligaciones: d.obligaciones,
        ansIntro: cfg('ans_intro'), ans: d.ans.map(function (n) { return { clave: 'ANS ' + n, t: P.ans[n] || '' }; }).filter(function (a) { return a.t; }),
        solicitudes: d.solicitudes, soportes: cfg('soportes'), plazo: d.plazo,
        consideracionesRespuesta: cfg('consideraciones_respuesta'), preventivo: cfg('preventivo'),
        firmas: c.firmas.map(function (f) { var im = firmasImagen()[claveFirma(f.nombre)]; return { nombre: f.nombre, cargo: f.cargo, imagen: im ? deDataUrl(im) : null }; }),
        copias: c.copias, codigo: cfg('codigo'), pie: cfg('pie')
    };
}
function nombreArchivo(d, ext) {
    return ('Requerimiento ' + (d.radicado || 'sin radicado') + ' ' + (d.asunto || '').slice(0, 60)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.' + (ext || 'pdf');
}
// formato: 'pdf' (para enviar) o 'docx' (Word, para revisar y corregir)
async function generar(conAvisos, formato) {
    var d = datosForm(), a = avisos(), word = formato === 'docx';
    if (conAvisos && (a.faltan.length || a.corchetes.length)) {
        var seguir = await confirmar(word ? '¿Generar el Word así?' : '¿Generar el PDF así?', (a.faltan.length ? 'Falta: ' + a.faltan.join(', ') + '.\n' : '') +
            (a.corchetes.length ? 'Quedan textos sin llenar: ' + a.corchetes.join(' ') : '') + (word ? '\nEn el Word se puede completar después.' : ''), 'Generar igual', 'Volver a revisar');
        if (!seguir) return null;
    }
    var bytes = word ? await armarDocx(datosPdf(d), opcionesWord()) : await armarPdf(datosPdf(d), { membrete: membrete() });
    return { d: d, bytes: bytes, nombre: nombreArchivo(d, word ? 'docx' : 'pdf'), tipo: word ? DOCX : 'application/pdf' };
}
function descargar(bytes, nombre, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: tipo || 'application/pdf' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
// destino: 'contratista' (textos de las plantillas) o 'revision' (al equipo, para el visto bueno)
function textosCorreo(d, destino, anexos) {
    var datos = { radicado: d.radicado || '', asunto: d.asunto || '', plazo: d.plazo, contrato: cfg('contrato'), ruta: d.ruta || '', saludo: saludo(),
        nota_anexos: anexos ? 'Nota: Tener presente que el requerimiento contiene anexos.\n\n' : '' };
    var limpio = function (t) { return t.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.])/g, '$1'); };
    if (destino === 'revision') {
        return {
            asunto: limpio(rellenar(cfg('correo_revision_asunto') || 'Requerimiento {radicado} · {asunto} · para revisión y visto bueno', datos)),
            cuerpo: limpio(rellenar(cfg('correo_revision_cuerpo') || '{saludo}.\n\nSe adjunta el requerimiento {radicado} frente a: {asunto} ({ruta}), en el marco del contrato {contrato}, para su respectiva revisión y visto bueno.\n\n{nota_anexos}Quedamos atentos a sus comentarios.\n\nCordialmente', datos))
                .replace(/ \(\)/, '')
        };
    }
    var cuerpo = rellenar(cfg('correo_cuerpo') || '', datos);
    if (anexos && cuerpo.indexOf('anexos') === -1) cuerpo += '\n\nNota: El requerimiento contiene anexos.';
    return { asunto: rellenar(cfg('correo_asunto') || 'Requerimiento de interventoría {radicado}', datos), cuerpo: cuerpo };
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
                '<td data-et="Estado"><span class="req-est ' + (x.estado === 'Enviado' ? 'enviado' : x.estado === 'En revisión' ? 'revision' : 'borrador') + '">' + esc(x.estado) + '</span></td>' +
                '<td class="acc"><button type="button" class="secundario pequeno" data-h="abrir" data-id="' + esc(x.id) + '" title="Abrir y editar">✎ Abrir</button>' +
                '<button type="button" class="secundario pequeno" data-h="duplicar" data-id="' + esc(x.id) + '" title="Crear uno nuevo a partir de este">⧉</button>' +
                '<button type="button" class="secundario pequeno" data-h="pdf" data-id="' + esc(x.id) + '" title="Descargar el PDF (sin las fotos)">⬇ PDF</button>' +
                '<button type="button" class="secundario pequeno" data-h="word" data-id="' + esc(x.id) + '" title="Descargar el Word (sin las fotos)">⬇ Word</button>' +
                '<button type="button" class="secundario pequeno" data-h="enviado" data-id="' + esc(x.id) + '" title="' + (x.estado === 'Enviado' ? 'Volver a borrador' : 'Marcar como enviado') + '">' + (x.estado === 'Enviado' ? '↺' : '✉️✓') + '</button>' +
                '<button type="button" class="secundario pequeno" data-h="eliminar" data-id="' + esc(x.id) + '" title="Eliminar">🗑</button></td></tr>';
        }).join('') : '<tr><td colspan="8" class="sub">' + (q ? 'Nada con «' + esc(q) + '».' : 'Todavía no hay requerimientos guardados en este equipo. Use «+ Nuevo requerimiento».') + '</td></tr>') + '</tbody>';
}
function verListado() {
    $('form-req').hidden = true; $('req-historial').hidden = false;
    soltarFotos(); $('f-evidencias').innerHTML = '';
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
    // «2:5» → [grupo 2, foto 5]
    var gk = function (t) { var p = String(t).split(':'); return [+p[0], +p[1]]; };
    $('form-req').addEventListener('input', function (ev) {
        var f = ev.target.closest('[data-foto]');
        if (f) { var x = gk(f.dataset.foto); fotosGrupo[x[0]][x[1]].pie = f.value; return; }
        if (ev.target.id !== 'f-plantilla' && ev.target.id !== 'f-pegar-texto') marcarCambio();
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
        if (q) { q.closest('.req-nov, .req-obl, .req-sol').remove(); marcarCambio(); return; }
        var chip = ev.target.closest('[data-tipo]');
        if (chip) { chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); marcarCambio(); return; }
        var qf = ev.target.closest('[data-quitar-foto]');
        if (qf) { var a = gk(qf.dataset.quitarFoto), g = fotosGrupo[a[0]]; URL.revokeObjectURL(g[a[1]].url); g.splice(a[1], 1); pintarFotos(); return; }
        var s = ev.target.closest('[data-subir]');
        if (s) { var b2 = gk(s.dataset.subir), g2 = fotosGrupo[b2[0]], t = g2[b2[1]]; g2[b2[1]] = g2[b2[1] - 1]; g2[b2[1] - 1] = t; pintarFotos(); return; }
        var fg = ev.target.closest('[data-fotos-grupo]');
        if (fg) { grupoFotos = +fg.dataset.fotosGrupo; $('f-fotos').value = ''; $('f-fotos').click(); return; }
        var qe = ev.target.closest('[data-quitar-evid]');
        if (qe) {
            var n = +qe.dataset.quitarEvid, grupos = evidenciasForm();
            (fotosGrupo[n] || []).forEach(function (f) { URL.revokeObjectURL(f.url); });
            grupos.splice(n, 1); fotosGrupo.splice(n, 1);
            ponerEvidencias(grupos); marcarCambio();
        }
    });
    $('f-evid-agregar').onclick = function () {
        var grupos = evidenciasForm(); grupos.push({ titulo: '', texto: '' });
        ponerEvidencias(grupos); marcarCambio();
        $('f-evidencias').lastElementChild.querySelector('[data-e="titulo"]').focus();
    };
    // Tabla de microrrutas
    $('f-nov-agregar').onclick = function () {
        $('f-novedades').insertAdjacentHTML('beforeend', filaNovedad({ micro: '', fecha: '', tipos: [] }));
        $('f-novedades').lastElementChild.querySelector('[data-n="micro"]').focus();
        marcarCambio();
    };
    var cerrarPegar = function () { $('f-pegar').hidden = true; $('f-pegar-texto').value = ''; $('f-pegar-estado').textContent = ''; };
    $('f-nov-pegar').onclick = function () { $('f-pegar').hidden = false; $('f-pegar-texto').focus(); };
    $('f-pegar-cancelar').onclick = cerrarPegar;
    $('f-pegar-ok').onclick = function () {
        var filas = leerFilasNovedades($('f-pegar-texto').value);
        if (!filas.length) { $('f-pegar-estado').textContent = 'No se encontró ningún código de microrruta (p. ej. Z4CC0159). Revise el texto pegado.'; return; }
        // Las filas vacías que había (sin nada escrito) se reemplazan; las llenas se conservan
        var actuales = novedadesForm();
        ponerNovedades(actuales.concat(filas));
        cerrarPegar(); marcarCambio();
        var sinF = filas.filter(function (f) { return !f.fecha; }).length;
        toast(filas.length + (filas.length === 1 ? ' microrruta agregada' : ' microrrutas agregadas') + (sinF ? '; ' + sinF + ' sin fecha: póngala en la fila.' : '.'));
    };
    $('f-nov-fechas').onclick = function () {
        var f = novedadesForm().map(function (n) { return n.fecha; }).filter(Boolean).sort();
        if (!f.length) return;
        $('f-evento-desde').value = f[0]; $('f-evento-hasta').value = f[f.length - 1] !== f[0] ? f[f.length - 1] : '';
        marcarCambio(); toast('Fecha del evento: ' + fechaEvento(f[0], f[f.length - 1]) + '.');
    };
    $('f-obl-agregar').onclick = function () {
        var o = P.catalogo[+$('f-obl-catalogo').value] || { ref: '', t: '' };
        $('f-obligaciones').insertAdjacentHTML('beforeend', filaObligacion(o));
        marcarCambio();
    };
    $('f-sol-agregar').onclick = function () { $('f-solicitudes').insertAdjacentHTML('beforeend', filaSolicitud({ t: '', ej: '' })); marcarCambio(); $('f-solicitudes').lastElementChild.querySelector('textarea').focus(); };
    $('f-fotos').onchange = async function () {
        var lista = Array.prototype.slice.call(this.files || []), g = grupoFotos;
        if (!lista.length || g < 0) return;
        var destino = fotosGrupo[g] = fotosGrupo[g] || [], boton = document.querySelector('[data-fotos-grupo="' + g + '"]');
        if (boton) { boton.disabled = true; boton.textContent = 'Preparando ' + lista.length + (lista.length === 1 ? ' foto…' : ' fotos…'); }
        for (var i = 0; i < lista.length; i++) {
            try { destino.push(await prepararFoto(lista[i])); } catch (e) { toast('No se pudo leer ' + lista[i].name + '.'); }
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
    $('btn-word').onclick = async function () {
        var b = this; b.disabled = true;
        try { var r = await generar(true, 'docx'); if (r) { descargar(r.bytes, r.nombre, r.tipo); guardarEnHistorial(r.d); toast('Word descargado y guardado en el listado.'); } }
        catch (e) { toast('No se pudo generar el Word: ' + e.message); }
        finally { b.disabled = false; }
    };
    // Correo: primero se elige a quién (revisión interna con el Word, o el contratista con el PDF)
    $('btn-correo').onclick = function () {
        var d = datosForm();
        $('co-anexos').checked = d.evidencias.some(function (g) { return /anexo/i.test(g.titulo); });
        $('co-estado').textContent = '';
        $('dlg-correo').showModal();
    };
    $('co-cerrar').onclick = function () { $('dlg-correo').close(); };
    var enviando = false;
    $('dlg-correo').addEventListener('cancel', function (ev) { if (enviando) ev.preventDefault(); });
    $('dlg-correo').addEventListener('close', function () { $('co-estado').textContent = ''; });
    // En el celular se comparte el archivo directo (Gmail, Outlook…) si el teléfono lo permite; si no (o en el computador),
    // se descarga y se abre el correo con el texto listo para adjuntarlo
    $('co-enviar').onclick = async function () {
        var b = this, destino = document.querySelector('input[name="co-destino"]:checked').value, revision = destino === 'revision';
        b.disabled = true; enviando = true; $('co-estado').textContent = revision ? 'Preparando el Word…' : 'Preparando el PDF…';
        try {
            $('dlg-correo').close();
            var r = await generar(true, revision ? 'docx' : 'pdf');
            if (!r) return;
            var t = textosCorreo(r.d, destino, $('co-anexos').checked), c = configUsuario(), para = revision ? c.revision : c.para;
            var estado = revision ? 'En revisión' : 'Enviado', antes = (historial().find(function (x) { return x.id === r.d.id; }) || {}).estado || 'Borrador';
            var archivo = new File([r.bytes], r.nombre, { type: r.tipo });
            guardarEnHistorial(r.d, estado);
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                try { await navigator.share({ files: [archivo], title: t.asunto, text: t.cuerpo }); toast('Listo: marcado como «' + estado + '».'); return; }
                catch (e) { if (e && e.name === 'AbortError') { guardarEnHistorial(r.d, antes); return; } }
            }
            descargar(r.bytes, r.nombre, r.tipo);
            location.href = 'mailto:' + encodeURIComponent(para) + '?subject=' + encodeURIComponent(t.asunto) + (!revision && c.cc ? '&cc=' + encodeURIComponent(c.cc) : '') + '&body=' + encodeURIComponent(t.cuerpo);
            toast('Se descargó el ' + (revision ? 'Word' : 'PDF') + ': adjúntelo en el correo que se abrió' + ($('co-anexos').checked ? ', con los anexos.' : '.'));
        } catch (e) { toast('No se pudo preparar el correo: ' + e.message); }
        finally { b.disabled = false; enviando = false; }
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
        } else if (b.dataset.h === 'word') {
            try { descargar(await armarDocx(datosPdf(x), opcionesWord()), nombreArchivo(x, 'docx'), DOCX); } catch (e) { toast('No se pudo generar: ' + e.message); }
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
        $('c-copias').value = c.copias.join('\n'); $('c-para').value = c.para; $('c-cc').value = c.cc; $('c-revision').value = c.revision;
        var deBase = cfg('membrete');
        $('c-membrete-ver').hidden = !(m || deBase); $('c-membrete-ver').src = m ? m.datos : deBase || '';
        $('c-membrete-quitar').hidden = !m;
        $('c-membrete-estado').textContent = m ? 'Se usa el membrete elegido en este equipo.' : deBase ? 'Se usa el membrete de las plantillas (el mismo para todos). Puede elegir otro solo para este equipo.' : 'Sin membrete: el PDF sale con margen normal y sin logos.';
        pintarFirmasConfig();
        pintarFormatoConfig();
        $('dlg-config').showModal();
    };
    // Formato del Word: elegir otro .docx (se limpia y queda en este equipo), descargarlo o volver al predeterminado
    $('c-formato-elegir').onclick = function () { $('c-formato').value = ''; $('c-formato').click(); };
    $('c-formato').onchange = async function () {
        var f = this.files && this.files[0];
        if (!f) return;
        var b = $('c-formato-elegir');
        b.disabled = true; $('c-formato-estado').textContent = 'Leyendo ' + f.name + '…';
        try {
            if (!/\.docx$/i.test(f.name)) throw new Error('debe ser un archivo de Word .docx (los .doc antiguos no sirven: ábralo en Word y guárdelo como .docx)');
            var r = await prepararFormato(new Uint8Array(await f.arrayBuffer()));
            if (!guardar(FORMATO, { datos: 'data:' + DOCX + ';base64,' + aBase64(r.bytes), nombre: f.name, info: r.datos, fecha: new Date().toISOString() }))
                throw new Error('no hay espacio en este equipo para guardarlo (' + Math.round(r.bytes.length / 1024) + ' KB)');
            toast('Formato guardado en este equipo: ' + f.name + '.');
        } catch (e) { toast('No se pudo usar ese formato: ' + e.message); }
        finally { b.disabled = false; pintarFormatoConfig(); }
    };
    $('c-formato-quitar').onclick = function () { localStorage.removeItem(FORMATO); pintarFormatoConfig(); toast('Se volvió al formato predeterminado.'); };
    $('c-formato-ver').onclick = function () {
        var f = formatoWord();
        if (f) descargar(f.bytes, f.nombre.replace(/\.docx$/i, '') + ' (formato).docx', DOCX);
    };
    $('c-cerrar').onclick = function () { $('dlg-config').close(); };
    $('c-firmas').addEventListener('input', pintarFirmasConfig);
    $('c-firmas-img').addEventListener('click', function (ev) {
        var s = ev.target.closest('[data-subir-firma]'), q = ev.target.closest('[data-quitar-firma]');
        if (s) { firmaPendiente = s.dataset.subirFirma; $('c-firma-archivo').value = ''; $('c-firma-archivo').click(); }
        if (q) { var m = firmasImagen(); delete m[q.dataset.quitarFirma]; guardar(FIRMAS_IMG, m); pintarFirmasConfig(); }
    });
    $('c-firma-archivo').onchange = async function () {
        var f = this.files && this.files[0];
        if (!f || !firmaPendiente) return;
        try {
            // Se guarda como PNG de hasta 600 px de ancho (conserva el fondo transparente si lo tiene)
            var bmp = await createImageBitmap(f), e = Math.min(1, 600 / bmp.width), c = document.createElement('canvas');
            c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
            var m = firmasImagen(); m[firmaPendiente] = c.toDataURL('image/png');
            if (!guardar(FIRMAS_IMG, m)) throw new Error('no hay espacio en el equipo');
            pintarFirmasConfig();
        } catch (er) { toast('No se pudo usar la imagen: ' + er.message); }
    };
    $('c-guardar').onclick = function () {
        guardar(CONFIG, {
            firmas: $('c-firmas').value.split('\n').map(function (l) { return firma(l); }).filter(function (f) { return f.nombre; }),
            copias: $('c-copias').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean),
            para: $('c-para').value.trim(), cc: $('c-cc').value.trim(), revision: $('c-revision').value.trim()
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

// Firmantes del cuadro de texto, cada uno con su imagen de firma (o el botón para ponerla)
var firmaPendiente = '';
function pintarFirmasConfig() {
    var imgs = firmasImagen(), nombres = $('c-firmas').value.split('\n').map(function (l) { return firma(l).nombre; }).filter(Boolean);
    $('c-firmas-img').innerHTML = nombres.length ? nombres.map(function (n) {
        var k = claveFirma(n), im = imgs[k];
        return '<div class="req-firma"><span class="req-firma-nombre">' + esc(n) + '</span>' +
            (im ? '<img src="' + im + '" alt="Firma de ' + esc(n) + '"><button type="button" class="secundario pequeno" data-quitar-firma="' + esc(k) + '">Quitar</button>'
                : '<span class="sub">Sin firma: sale la línea en blanco</span><button type="button" class="secundario pequeno" data-subir-firma="' + esc(k) + '">Subir firma</button>') + '</div>';
    }).join('') : '<span class="sub">Escriba arriba quién firma.</span>';
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
