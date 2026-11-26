/* global L -- Leaflet: lo carga descuentos.html con <script src="js/leaflet.js"> antes de este módulo */
// descuentos.html: 💸 Descuentos (menú Zonas verdes). El documento de descuento de área de uno o varios lotes, con el área
// dibujada sobre la foto satelital, sus imágenes, el texto del tipo y el registro fotográfico, en PDF (formato GD-FR-016).
// Lógica en descuentos.js y tipos.js, imágenes en imagen.js, PDF en pdf.js y guardado (base 0027 o este equipo) en guardado.js.
// En el equipo quedan: el borrador (sin fotos) «desc_borrador», el membrete «desc_membrete» (o el de Requerimientos,
// «req_membrete») y la copia del historial.
import '../subsanaciones/estilos.css';
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { esc, hoy, aTexto } from '../subsanaciones/util.js';
import { leerDatos, decodificar } from '../subsanaciones/lotegps.js';
import { TIPOS, tipo } from './tipos.js';
import { areaM2, areaFila, areaActualizada, m2, buscarLote, textoSector, comunaDe, centroAnillos, textosDeTipo, revisar, totales,
    nombreArchivo, pieFotos, textoLotes, nuevoId, filasHistorial } from './descuentos.js';
import { crearGuardado } from './guardado.js';
import { prepararFormatoDescuento, membreteDeFormato, guardarArchivo, leerArchivo } from './formato.js';
import { crearFotosDescuento, carpetaFila, nombreNuevo, metaDeMedios, rutasDe, sobrantes, contarFotos } from './fotosguardadas.js';

// fotosBase: fotos en el almacenamiento de Supabase (0032); sin base de datos, null (las fotos quedan solo en pantalla)
var fotosBase = configurado ? crearFotosDescuento(supabase) : null;
var BORRADOR = 'desc_borrador', MEMBRETE = 'desc_membrete', MEMBRETE_REQ = 'req_membrete';
var LOTES = window.direccionesLotes || {};
// d: el descuento abierto. medios[i]: { actual, descontar (imágenes armadas o elegidas), fotos: [], clave (del dibujo con que se armaron) }
var d = null, medios = [], activa = -1, historial = [], guardado = null, comunas = null, geometrias = {};
var mapa = null, capaLote = null, capaDibujo = null, calles = null;

function leer(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function quitar(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
function vacio() { return { id: nuevoId(), tipo: 'cerramiento', fecha: hoy(), sector: '', campos: {}, textos: textosDeTipo('cerramiento', { filas: [], campos: {} }), filas: [], estado: 'borrador' }; }

// ---------- Datos de los lotes (polígonos del mapa rápido) y de las comunas ----------
async function traer(url) { var r = await fetch(url); if (!r.ok) throw new Error('no se pudo descargar ' + url); return r.text(); }
var cuadrillasCargadas = {};
async function geometria(f) {
    var k = f.mr + '|' + (f.lote || '');
    if (geometrias[k]) return geometrias[k];
    var archivos = [f.cuad ? 'data/rapido/lotes_' + f.cuad + '.js' : null, 'data/rapido/lotes_sin.js'].filter(Boolean);
    for (var i = 0; i < archivos.length; i++) {
        var a = archivos[i];
        if (!cuadrillasCargadas[a]) {
            try { cuadrillasCargadas[a] = leerDatos(await traer(a)); } catch (e) { cuadrillasCargadas[a] = { lotes: [] }; }
        }
        var partes = (cuadrillasCargadas[a].lotes || []).filter(function (p) { return String(p.m || '').toUpperCase() === f.mr && (!f.lote || String(p.l) === String(f.lote)); });
        if (partes.length) {
            var anillos = [];
            partes.forEach(function (p) { (p.g || []).forEach(function (pol) { pol.forEach(function (r) { anillos.push(decodificar(r)); }); }); });
            return (geometrias[k] = anillos);
        }
    }
    return (geometrias[k] = []);
}
async function cargarComunas() {
    if (comunas) return comunas;
    try {
        var t = await traer('data/rapido/capa_comunas.js'), datos = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
        comunas = (datos.items || []).map(function (c) { return { n: c.n, anillos: (c.g || []).reduce(function (a, pol) { return a.concat(pol.map(decodificar)); }, []) }; });
    } catch (e) { comunas = []; }
    return comunas;
}

// ---------- Mapa para dibujar ----------
function crearMapa() {
    if (mapa || typeof L === 'undefined') return;
    mapa = L.map('dz-mapa', { maxZoom: 21, zoomControl: true }).setView([6.25, -75.58], 14);
    L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains: '0123', maxZoom: 21, maxNativeZoom: 20, attribution: 'Imágenes © Google' }).addTo(mapa);
    calles = L.tileLayer('https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}', { subdomains: '0123', maxZoom: 21, maxNativeZoom: 20 });
    if ($('dz-calles').checked) calles.addTo(mapa);
    capaLote = L.layerGroup().addTo(mapa);
    capaDibujo = L.layerGroup().addTo(mapa);
    mapa.on('click', function (ev) {
        var f = d.filas[activa];
        if (!f) return;
        f.dibujo = (f.dibujo || []).concat([[+ev.latlng.lat.toFixed(7), +ev.latlng.lng.toFixed(7)]]);
        f.manual = false; f.todo = false;   // empezar a dibujar deja de descontar todo el lote
        cambio(); pintarDibujo(); pintarFilas();
    });
}
async function abrirDibujo(i) {
    activa = i;
    var f = d.filas[i];
    $('dz-dibujo').hidden = !f;
    pintarFilas();
    if (!f) return;
    $('dz-dibujo-tit').textContent = '✏️ Área a descontar de ' + f.mr + (f.lote ? ' - ' + f.lote : '');
    if (typeof L === 'undefined') { $('dz-dibujo-ayuda').textContent = '⚠ No cargó el mapa (¿sin señal?). Escriba el área a mano en el lote.'; return; }
    crearMapa();
    mapa.invalidateSize();
    var g = await geometria(f);
    capaLote.clearLayers();
    // Los otros lotes del documento, tenues; el de ahora, resaltado
    d.filas.forEach(function (o, j) {
        var go = geometrias[o.mr + '|' + (o.lote || '')] || [];
        if (j !== i && go.length) L.polygon(go, { color: '#67e8f9', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(capaLote);
    });
    if (g.length) L.polygon(g, { color: '#06b6d4', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.3, interactive: false }).addTo(capaLote);
    pintarDibujo();
    centrar();
}
function centrar() {
    var f = d.filas[activa];
    if (!f || !mapa) return;
    var g = geometrias[f.mr + '|' + (f.lote || '')] || [], puntos = [].concat.apply([], g).concat(f.dibujo || []);
    if (puntos.length) mapa.fitBounds(L.latLngBounds(puntos), { padding: [20, 20], maxZoom: 20 });
    else toast('Este lote no tiene polígono en el mapa: búsquelo por su dirección y dibuje el área.');
}
function pintarDibujo() {
    var f = d.filas[activa];
    if (!f || !capaDibujo) return;
    capaDibujo.clearLayers();
    $('dz-todo').textContent = f.todo ? '✏️ Dibujar solo una parte' : '▣ Todo el lote (cerrado)';
    $('dz-todo').classList.toggle('primario', !f.todo);
    $('dz-todo').classList.toggle('secundario', !!f.todo);
    var gTodo = f.todo ? geometrias[f.mr + '|' + (f.lote || '')] || [] : [];
    if (gTodo.length) L.polygon(gTodo, { color: '#1d4ed8', weight: 2.5, fillColor: '#2563eb', fillOpacity: 0.4, interactive: false }).addTo(capaDibujo);
    var p = f.dibujo || [];
    if (p.length >= 3) L.polygon(p, { color: '#1d4ed8', weight: 2.5, fillColor: '#2563eb', fillOpacity: 0.4, interactive: false }).addTo(capaDibujo);
    else if (p.length === 2) L.polyline(p, { color: '#1d4ed8', weight: 2.5, interactive: false }).addTo(capaDibujo);
    p.forEach(function (q, k) {
        var m = L.marker(q, { draggable: true, icon: L.divIcon({ className: 'dz-vertice', iconSize: [18, 18], iconAnchor: [9, 9], html: '<span>' + (k + 1) + '</span>' }) }).addTo(capaDibujo);
        m.on('drag', function (ev) { f.dibujo[k] = [+ev.latlng.lat.toFixed(7), +ev.latlng.lng.toFixed(7)]; mostrarArea(); });
        m.on('dragend', function () { cambio(); pintarDibujo(); pintarFilas(); });
    });
    mostrarArea();
}
function mostrarArea() {
    var f = d.filas[activa];
    if (!f) return;
    var a = f.todo && !f.manual ? areaFila(f) : Math.round(areaM2(f.dibujo));
    $('dz-dibujo-area').textContent = f.todo && !f.manual ? 'Todo el lote: ' + m2(a) + ' m² a descontar · quedan 0 m²' : (f.dibujo || []).length < 3 ? plural((f.dibujo || []).length, 'punto', 'puntos') + ' · faltan ' + (3 - (f.dibujo || []).length) + ' para el área'
        : m2(a) + ' m² a descontar' + (f.areaBase ? ' · quedan ' + m2(Math.max(0, f.areaBase - a)) + ' m²' : '');
    $('dz-dibujo-area').classList.toggle('mal', !!(f.areaBase && a > f.areaBase));
}

// ---------- Formulario ----------
function pintarTipos() {
    $('dz-tipos').innerHTML = TIPOS.map(function (t) {
        return '<button type="button" role="radio" class="dz-tipo" data-tipo="' + t.clave + '" aria-checked="' + (d.tipo === t.clave) + '"><span aria-hidden="true">' + t.icono + '</span>' + esc(t.nombre) + '</button>';
    }).join('');
}
function pintarCampos() {
    var t = tipo(d.tipo);
    $('dz-campos').innerHTML = t.campos.map(function (c) {
        return '<label>' + esc(c.etiqueta.toUpperCase()) + ' <input data-campo="' + c.clave + '" value="' + esc((d.campos || {})[c.clave] || '') + '" placeholder="' + esc(c.ejemplo) + '"></label>';
    }).join('');
}
function pintarTextos() {
    ['titulo', 'intro', 'conclusion', 'localizacion', 'sitio'].forEach(function (k) { $('dz-t-' + k).value = d.textos[k] || ''; });
}
function pintarFilas() {
    $('dz-filas').innerHTML = d.filas.length ? d.filas.map(function (f, i) {
        var a = areaFila(f), malo = f.areaBase && a > f.areaBase;
        return '<article class="dz-lote' + (i === activa ? ' activo' : '') + '" data-fila="' + i + '">' +
            '<div class="dz-lote-cab"><b>' + esc(f.mr) + (f.lote ? ' · Lote ' + esc(f.lote) : '') + '</b><span class="sub">' + (f.cuad ? 'cuadrilla ' + esc(f.cuad) : '') + (f.dir ? ' · ' + esc(f.dir) : '') + '</span>' +
                '<button type="button" class="secundario pequeno" data-quitar="' + i + '" aria-label="Quitar ' + esc(f.mr) + '">✕ Quitar</button></div>' +
            '<div class="dz-areas">' +
                '<label>ÁREA BASE (m²) <input type="number" min="0" step="1" inputmode="numeric" data-base="' + i + '" value="' + (f.areaBase || '') + '"></label>' +
                '<label>A DESCONTAR (m²) <input type="number" min="0" step="1" inputmode="numeric" data-desc="' + i + '" value="' + (a || '') + '"' + (f.manual ? '' : ' readonly') + '>' +
                    '<span class="sub">' + (f.manual ? 'escrita a mano' : f.todo ? 'todo el lote' : (f.dibujo || []).length >= 3 ? 'del dibujo' : 'dibújela en el mapa') + '</span></label>' +
                '<div class="dz-actual"><span>QUEDAN</span><b class="' + (malo ? 'mal' : '') + '">' + m2(areaActualizada(f)) + ' m²</b></div>' +
            '</div>' +
            (malo ? '<p class="dz-aviso-lote">⚠ El área a descontar es mayor que el área base: revise el dibujo.</p>' : '') +
            '<div class="dz-fila">' +
                '<button type="button" class="' + (i === activa ? 'primario' : 'secundario') + ' pequeno" data-dibujar="' + i + '">✏️ ' + (i === activa ? 'Dibujando este' : 'Dibujar en el mapa') + '</button>' +
                '<label class="dz-check"><input type="checkbox" data-manual="' + i + '"' + (f.manual ? ' checked' : '') + '> Escribir el área a mano</label>' +
            '</div></article>';
    }).join('') : '<p class="sub">Aún no hay lotes. Escriba la microrruta o el lote y toque «Agregar lote».</p>';
    pintarMedios();
    avisos();
}
// Imágenes y fotos de cada lote
function pintarMedios() {
    $('dz-medios').innerHTML = d.filas.map(function (f, i) {
        var md = medios[i] || {}, vista = function (im, que, titulo) {
            return '<figure class="dz-img"><figcaption>' + titulo + (im && im.propia ? ' <span class="sub">(elegida)</span>' : '') + '</figcaption>' +
                (im ? '<img src="' + esc(im.url) + '" alt="' + esc(titulo + ' ' + f.mr) + '">' : '<div class="dz-img-vacia">Se arma al tocar «Armar imágenes» o al generar el PDF</div>') +
                '<div class="dz-fila"><label class="boton secundario pequeno">Usar otra<input type="file" accept="image/*" data-img="' + i + '|' + que + '" hidden></label>' +
                (im && im.propia ? '<button type="button" class="secundario pequeno" data-img-auto="' + i + '|' + que + '">Volver a la del mapa</button>' : '') + '</div></figure>';
        };
        return '<div class="dz-medio"><h4>' + esc(f.mr + (f.lote ? ' - ' + f.lote : '')) + '</h4>' +
            '<div class="dz-imgs">' + vista(md.actual, 'actual', 'Área actual') + vista(md.descontar, 'descontar', 'Área para descontar') + '</div>' +
            '<div class="dz-fila"><button type="button" class="secundario pequeno" data-armar="' + i + '">🖼 Armar imágenes</button>' +
                '<label class="boton secundario pequeno">📷 Agregar fotos<input type="file" accept="image/*" multiple data-fotos="' + i + '" hidden></label>' +
                '<span class="sub">' + esc(pieFotos(f)) + ' · ' + plural((md.fotos || []).length, 'foto', 'fotos') + '</span></div>' +
            '<div class="dz-soltar" data-soltar="' + i + '">' + ((md.fotos || []).length ? '<div class="dz-fotos">' + md.fotos.map(function (x, k) {
                return '<figure class="dz-foto"><span class="dz-foto-n">' + (k + 1) + '</span>' + (x.url ? '<img src="' + esc(x.url) + '" alt="Foto ' + (k + 1) + '">'
                    : '<div class="dz-foto-espera">' + (x.cargando ? 'Trayendo…' : '⚠ No se pudo traer (sigue guardada)') + '</div>') +
                    '<input data-pie="' + i + '|' + k + '" value="' + esc(x.pie || '') + '" placeholder="Pie de foto (opcional)" aria-label="Pie de la foto ' + (k + 1) + '">' +
                    '<div class="dz-fila"><button type="button" class="secundario pequeno" data-mover="' + i + '|' + k + '|-1"' + (k ? '' : ' disabled') + ' aria-label="Subir la foto ' + (k + 1) + '">↑</button>' +
                    '<button type="button" class="secundario pequeno" data-mover="' + i + '|' + k + '|1"' + (k < md.fotos.length - 1 ? '' : ' disabled') + ' aria-label="Bajar la foto ' + (k + 1) + '">↓</button>' +
                    '<button type="button" class="secundario pequeno" data-quitar-foto="' + i + '|' + k + '">✕ Quitar</button></div></figure>';
            }).join('') + '</div>' : '') +
            '<div class="dz-soltar-txt">📷 Arrastre aquí las fotos de ' + esc(f.mr + (f.lote ? ' - ' + f.lote : '')) + ', elíjalas con «Agregar fotos» o péguelas con Ctrl+V</div></div>' +
            (md.error ? '<p class="dz-aviso-lote">' + esc(md.error) + '</p>' : '') + '</div>';
    }).join('') || '<p class="sub">Agregue un lote para ver sus imágenes y agregarle fotos.</p>';
}
function avisos() {
    var falta = revisar(leerForm());
    $('dz-faltan').innerHTML = falta.length ? '⚠ Falta: ' + falta.map(esc).join(' · ') : '✓ Listo para generar el PDF.';
    $('dz-faltan').classList.toggle('ok', !falta.length);
}
function leerForm() {
    d.fecha = $('dz-fecha').value; d.sector = $('dz-sector').value.trim();
    d.campos = {};
    document.querySelectorAll('#dz-campos [data-campo]').forEach(function (i) { d.campos[i.dataset.campo] = i.value.trim(); });
    ['titulo', 'intro', 'conclusion', 'localizacion', 'sitio'].forEach(function (k) { d.textos[k] = $('dz-t-' + k).value; });
    d.estado = $('dz-emitido').checked ? 'emitido' : 'borrador';
    return d;
}
var tBorrador = null;
function cambio() {
    clearTimeout(tBorrador);
    tBorrador = setTimeout(function () {
        leerForm();
        guardar(BORRADOR, d);
        $('dz-guardado').textContent = 'Borrador guardado en este equipo ' + new Date().toTimeString().slice(0, 5);
    }, 500);
    avisos();
}
function pintarTodo() {
    $('dz-titulo-form').textContent = d.creado ? '💸 Descuento guardado · ' + tipo(d.tipo).nombre : '💸 Nuevo descuento';
    pintarTipos(); pintarCampos();
    $('dz-fecha').value = d.fecha || ''; $('dz-sector').value = d.sector || '';
    $('dz-emitido').checked = d.estado === 'emitido';
    pintarTextos(); pintarFilas();
}
function rearmar() { leerForm(); d.textos = textosDeTipo(d.tipo, d); pintarTextos(); cambio(); }

async function agregar() {
    var t = $('dz-buscar').value.trim();
    if (!t) { $('dz-buscar').focus(); return; }
    var x = buscarLote(t, LOTES);
    if (!x) { $('dz-buscar-estado').innerHTML = '<span class="dz-mal">No se encontró «' + esc(t) + '» en los lotes. Escriba la microrruta (Z6CC0153) o el número del lote (1027).</span>'; return; }
    if (d.filas.some(function (f) { return f.mr === x.mr && f.lote === x.lote; })) { $('dz-buscar-estado').textContent = 'Ese lote ya está en el documento.'; return; }
    leerForm();
    d.filas.push({ mr: x.mr, lote: x.lote, cuad: x.cuad, dir: x.dir, areaBase: Math.round(x.areaBase), areaDescontar: 0, manual: false, dibujo: [] });
    medios.push({ fotos: [] });
    $('dz-buscar').value = '';
    $('dz-buscar-estado').textContent = '✓ ' + x.mr + ' · Lote ' + x.lote + ' · ' + m2(x.areaBase) + ' m² en la base de datos.';
    var i = d.filas.length - 1;
    await abrirDibujo(i);
    // Sector: del primer lote, según la comuna o el corregimiento donde cae
    if (!$('dz-sector').value.trim()) {
        var c = centroAnillos(geometrias[x.mr + '|' + x.lote]), cs = await cargarComunas(), n = c ? comunaDe(c[0], c[1], cs) : '';
        if (n) { $('dz-sector').value = textoSector(n); }
    }
    rearmar();
    pintarFilas();
}

// ---------- Imágenes del documento ----------
function claveDibujo(f) { return JSON.stringify([f.dibujo || [], f.mr, f.lote, !!f.todo, f.todo ? f.areaBase : 0]); }
async function armarImagenes(i, forzar) {
    var f = d.filas[i], md = medios[i] = medios[i] || { fotos: [] };
    if (!forzar && md.clave === claveDibujo(f) && md.actual && md.descontar) return;
    var { armarImagen } = await import('./imagen.js');
    // Todo el lote: el área a descontar es el polígono entero del lote
    var g = await geometria(f), dib = f.todo && !f.manual ? g : (f.dibujo || []).length >= 3 ? [f.dibujo] : [];
    if (!g.length && !dib.length) throw new Error(f.mr + ' no tiene polígono ni dibujo para armar las imágenes (use «Usar otra»)');
    if (!(md.actual && md.actual.propia)) {
        md.actual = await armarImagen({ encuadrar: g.length ? g : dib, capas: [{ anillos: g, relleno: 'rgba(34,211,238,.42)', borde: '#06b6d4', grosor: 2.5 }] });
    }
    if (!(md.descontar && md.descontar.propia)) {
        if (!dib.length) md.descontar = null;
        else {
            var c = centroAnillos(dib);
            md.descontar = await armarImagen({ encuadrar: dib, zMax: 20, capas: [{ anillos: g, borde: '#22d3ee', grosor: 2, punteado: true }, { anillos: dib, relleno: 'rgba(37,99,235,.42)', borde: '#1d4ed8', grosor: 3 }],
                etiqueta: { texto: m2(areaFila(f)) + ' m²', en: c, sobre: dib === g ? [].concat.apply([], g) : f.dibujo } });
        }
    }
    md.clave = claveDibujo(f);
}
// Imagen o foto elegida por el usuario → { bytes, tipo, url } (reducida a 1600 px, en JPEG)
async function prepararFoto(file) {
    var bmp = await createImageBitmap(file), e = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: 'jpg', url: URL.createObjectURL(blob), nombre: file.name, pie: '' };
}
// Agrega fotos a un lote, todas las que vengan; las que no se pueden leer se dicen con su nombre (p. ej. HEIC del iPhone)
async function agregarFotos(i, archivos) {
    var md = medios[i] = medios[i] || { fotos: [] }, malas = [], buenas = 0;
    archivos = Array.prototype.slice.call(archivos || []);
    for (var k = 0; k < archivos.length; k++) {
        var f = archivos[k];
        if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name)) { malas.push(f.name + ' (no es una imagen)'); continue; }
        try { md.fotos.push(await prepararFoto(f)); buenas++; } catch (e) {
            malas.push(f.name + (/\.(heic|heif)$/i.test(f.name) ? ' (formato HEIC del iPhone: el navegador no lo abre; pásela a JPG o mándela por WhatsApp y guárdela de nuevo)' : ' (no se pudo leer)'));
        }
    }
    md.error = malas.length ? 'No se agregaron: ' + malas.join(' · ') : '';
    pintarMedios();
    if (buenas) toast(plural(buenas, 'foto agregada', 'fotos agregadas') + ' a ' + d.filas[i].mr + ' · ' + plural(md.fotos.length, 'foto', 'fotos') + ' en total.');
}
// Pegar con Ctrl+V: va a la imagen que se esté cambiando («Usar otra» recién tocado) o, si no, a las fotos del lote activo.
// Funciona aunque el cursor esté en un campo de texto, si lo pegado es una imagen
var destinoPegar = null;
async function pegar(ev) {
    var archivos = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!archivos.length) return;
    ev.preventDefault();
    if (!d.filas.length) return toast('Primero agregue el lote; después pegue las fotos.');
    if (destinoPegar) { await ponerImagen(destinoPegar[0], destinoPegar[1], archivos[0]); destinoPegar = null; toast('Imagen cambiada.'); return; }
    await agregarFotos(activa >= 0 ? activa : 0, archivos);
}
async function ponerImagen(i, que, file) {
    var im = await prepararFoto(file);
    im.propia = true;
    (medios[i] = medios[i] || { fotos: [] })[que] = im;
    pintarMedios();
}

// ---------- Membrete ----------
function deDataUrl(datos) {
    if (!datos || datos.indexOf('data:image/') !== 0) return null;
    var b = atob(datos.split(',')[1] || ''), bytes = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return { bytes: bytes, tipo: /^data:image\/png/.test(datos) ? 'png' : 'jpg' };
}
function membrete() { var m = leer(MEMBRETE, null), r = leer(MEMBRETE_REQ, null); return deDataUrl(m && m.datos) || deDataUrl(r && r.datos); }
// Formato Word: el elegido en este equipo (IndexedDB «formato») o, si no hay, el predeterminado del Colegio Mayor, que está en
// la base como documento privado (DESC-FORMATO de convenio_secciones, lo carga npm run guia; solo con sesión y permiso de
// contrato). → { bytes, nombre, origen: 'equipo' | 'base' }; membreteF: lo que sale de él para el PDF
var formato = null, membreteF = null, formatoBase;
async function formatoDeLaBase() {
    if (formatoBase !== undefined) return formatoBase;
    formatoBase = null;
    if (!configurado) return null;
    try {
        var r = await supabase.from('convenio_secciones').select('items').eq('documento', 'DESC-FORMATO').eq('id', 'formato').maybeSingle();
        var items = (r.data && r.data.items) || [], dato = function (k) { return ((items.filter(function (i) { return i.clave === k; })[0]) || {}).t || ''; };
        var b64 = dato('formato_docx');
        if (b64) {
            var bin = atob(b64.split(',')[1] || ''), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            formatoBase = { bytes: bytes, nombre: dato('formato_nombre') || 'Formato GD-FR-016', origen: 'base' };
        }
    } catch (e) { formatoBase = null; }
    return formatoBase;
}
async function cargarFormato() {
    var propio = await leerArchivo('formato');
    formato = propio ? Object.assign({ origen: 'equipo' }, propio) : await formatoDeLaBase();
    membreteF = null;
    if (formato && formato.bytes) {
        try { membreteF = await membreteDeFormato(formato.bytes); } catch (e) { membreteF = null; }
    }
    pintarMembrete();
}
function pintarMembrete() {
    var m = leer(MEMBRETE, null), r = leer(MEMBRETE_REQ, null);
    $('dz-formato-estado').innerHTML = formato ? '✓ Formato: <b>' + esc(formato.nombre) + '</b>' + (formato.origen === 'base' ? ' (el predeterminado, el mismo para todo el equipo)' : ' (elegido en este equipo)') +
        (membreteF && membreteF.fondo ? ' · con membrete' : ' · ⚠ no se encontró el membrete de página completa en su encabezado') +
        (membreteF && membreteF.textos.length ? ' y ' + plural(membreteF.textos.length, 'cuadro', 'cuadros') + ' de texto del pie (' + esc(membreteF.textos[0].lineas[0]) + '…)' : '') +
        ' · letra ' + esc(membreteF ? membreteF.fuente + ' ' + membreteF.tam : '') + ' · el Word y el PDF salen con este formato.'
        : '<b>Sin formato.</b> El Word y el PDF salen con el diseño de la aplicación' + (m || r ? ' y la imagen de membrete' : ' y sin logos') + '. Suba el Word para que queden iguales al documento de la institución.';
    $('dz-formato-quitar').hidden = !formato || formato.origen !== 'equipo';
    $('dz-formato-quitar').textContent = formatoBase ? 'Volver al predeterminado' : 'Quitar el formato';
    $('dz-formato-resumen').textContent = formato ? '· ' + formato.nombre : (m || r) ? '· imagen de membrete' : '· sin membrete';
    $('dz-membrete-estado').textContent = formato ? 'Con el formato Word no hace falta la imagen.' : m ? 'Imagen de membrete elegida aquí (' + (m.nombre || 'imagen') + ').' : r ? 'Se usa la imagen de membrete de 📨 Requerimientos de este equipo.' : '';
    $('dz-membrete-ver').hidden = !!formato || !(m || r);
    if (!formato && (m || r)) $('dz-membrete-ver').src = (m || r).datos;
    $('dz-membrete-quitar').hidden = !m;
}
async function subirFormato(file) {
    if (!/\.docx$/i.test(file.name)) return toast('Elija un Word .docx (si lo tiene en .doc, ábralo en Word y guárdelo como .docx).');
    $('dz-formato-estado').textContent = 'Leyendo ' + file.name + '…';
    try {
        var f = await prepararFormatoDescuento(new Uint8Array(await file.arrayBuffer()));
        await guardarArchivo('formato', { bytes: f.bytes, nombre: file.name, fecha: new Date().toISOString() });
        await cargarFormato();
        toast('✓ Formato guardado en este equipo: el Word y el PDF salen con su membrete.');
    } catch (e) {
        $('dz-formato-estado').innerHTML = '<span class="dz-mal">No se pudo usar ese Word: ' + esc(e.message) + '. Pruebe con otro .docx que tenga el membrete.</span>';
    }
}

// ---------- PDF, Word y guardado ----------
// Arma el documento (que: 'pdf' | 'word') con las imágenes al día → { bytes, tipo, nombre, nFotos }. aviso(texto): el paso que va
async function armarDoc(que, aviso) {
    leerForm();
    aviso('Armando las imágenes…');
    for (var i = 0; i < d.filas.length; i++) {
        try { await armarImagenes(i); } catch (e) { toast('⚠ ' + e.message); }
    }
    pintarMedios();
    aviso(que === 'word' ? 'Generando el Word…' : 'Generando el PDF…');
    var imagenes = {}, fotos = {};
    medios.forEach(function (md, k) { imagenes[k] = { actual: md.actual, descontar: md.descontar }; fotos[k] = (md.fotos || []).filter(function (x) { return x.bytes; }); });
    var nFotos = Object.keys(fotos).reduce(function (s, k) { return s + fotos[k].length; }, 0), nombre = nombreArchivo(d);
    if (que === 'word') {
        var { armarDocxDescuento } = await import('./word.js');
        return { bytes: await armarDocxDescuento(d, { formato: formato && formato.bytes, membrete: membrete(), imagenes: imagenes, fotos: fotos }),
            tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nombre: nombre.replace(/\.pdf$/, '.docx'), nFotos: nFotos };
    }
    var { armarPdfDescuento } = await import('./pdf.js');
    return { bytes: await armarPdfDescuento(d, { formato: membreteF, membrete: membrete(), imagenes: imagenes, fotos: fotos }), tipo: 'application/pdf', nombre: nombre, nFotos: nFotos };
}
function bajar(doc) {
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([doc.bytes], { type: doc.tipo }));
    a.href = url; a.download = doc.nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast((/pdf/.test(doc.tipo) ? 'PDF' : 'Word') + ' descargado: ' + doc.nombre + ' · ' + plural(doc.nFotos, 'foto', 'fotos') + (formato ? ' · con el formato ' + formato.nombre : '') + '. Guárdelo en el historial para que cuente en los totales.');
}
// que: 'pdf' | 'word'
async function generar(que) {
    leerForm();
    var falta = revisar(d), nombreDoc = que === 'word' ? 'el Word' : 'el PDF';
    if (falta.length && !(await confirmar('Falta algo', 'Falta: ' + falta.join(' · ') + '. ¿Generar ' + nombreDoc + ' así?', 'Generar igual'))) return;
    var b = $(que === 'word' ? 'dz-word' : 'dz-pdf'), texto0 = b.textContent;
    ['dz-pdf', 'dz-word', 'dz-previa'].forEach(function (id) { $(id).disabled = true; });
    try { bajar(await armarDoc(que, function (t) { b.textContent = t; })); } catch (e) { toast('No se pudo generar ' + nombreDoc + ': ' + e.message); }
    finally { ['dz-pdf', 'dz-word', 'dz-previa'].forEach(function (id) { $(id).disabled = false; }); b.textContent = texto0; }
}

// ---------- Vista previa: el PDF tal como sale, dentro de la página ----------
var previa = null, urlPrevia = '', vezPrevia = 0;
async function abrirPrevia() {
    var dlg = $('dlg-previa'), vez = ++vezPrevia;
    previa = null;
    $('dz-previa-pdf').disabled = true;
    $('dz-previa-marco').hidden = true; $('dz-previa-sin').hidden = true; $('dz-previa-abrir').hidden = true;
    $('dz-previa-estado').hidden = false; $('dz-previa-estado').textContent = 'Armando el documento…';
    leerForm();
    var falta = revisar(d);
    $('dz-previa-faltan').hidden = !falta.length;
    $('dz-previa-faltan').textContent = falta.length ? '⚠ Todavía falta: ' + falta.join(' · ') : '';
    if (!dlg.open) dlg.showModal();
    try {
        var doc = await armarDoc('pdf', function (t) { $('dz-previa-estado').textContent = t; });
        if (vez !== vezPrevia || !dlg.open) return;   // se cerró mientras se armaba
        previa = doc;
        if (urlPrevia) URL.revokeObjectURL(urlPrevia);
        urlPrevia = URL.createObjectURL(new Blob([doc.bytes], { type: 'application/pdf' }));
        $('dz-previa-abrir').href = urlPrevia; $('dz-previa-abrir').hidden = false;
        // Navegadores sin visor de PDF (Chrome en el celular): se abre en otra pestaña
        if (navigator.pdfViewerEnabled === false) $('dz-previa-sin').hidden = false;
        else { $('dz-previa-marco').src = urlPrevia + '#view=FitH'; $('dz-previa-marco').hidden = false; }
        $('dz-previa-estado').hidden = true;
        $('dz-previa-sub').textContent = 'Así queda el PDF (' + plural(doc.nFotos, 'foto', 'fotos') + (formato ? ', con el formato ' + formato.nombre : membrete() ? ', con la imagen de membrete' : ', sin membrete') + '); el Word lleva lo mismo. Si algo no está bien, cierre, corríjalo y vuelva a abrir la vista previa.';
        $('dz-previa-pdf').disabled = false;
    } catch (e) {
        if (vez === vezPrevia) $('dz-previa-estado').innerHTML = '<span class="dz-mal">No se pudo armar la vista previa: ' + esc(e.message) + '</span>';
    }
}
function cerrarPrevia() {
    vezPrevia++;
    previa = null;
    $('dz-previa-marco').removeAttribute('src');
    if (urlPrevia) { URL.revokeObjectURL(urlPrevia); urlPrevia = ''; }
}
// ---------- Fotos guardadas en la base (fotosguardadas.js, 0032) ----------
// Sube las fotos y las imágenes elegidas que aún no tienen ruta. aviso(texto): el paso que va. Devuelve el error, si hubo
async function subirMedios(aviso) {
    if (!fotosBase) return null;
    var cola = [];
    medios.forEach(function (md, i) {
        if (!md || !d.filas[i]) return;
        (md.fotos || []).forEach(function (x) { if (x.bytes && !x.ruta) cola.push({ x: x, i: i }); });
        ['actual', 'descontar'].forEach(function (k) { var im = md[k]; if (im && im.propia && im.bytes && !im.ruta) cola.push({ x: im, i: i }); });
    });
    for (var n = 0; n < cola.length; n++) {
        aviso('Subiendo fotos ' + (n + 1) + ' de ' + cola.length + '…');
        var c = cola[n], ruta = carpetaFila(d.id, d.filas[c.i]) + '/' + nombreNuevo(Date.now(), n);
        try { c.x.ruta = await fotosBase.subir(ruta, c.x.bytes); } catch (e) { return e; }
    }
    return null;
}
// Trae de la base las fotos del descuento abierto. vez: si mientras tanto se abrió otro, no se mezclan
var vezFotos = 0;
async function cargarFotosGuardadas() {
    var vez = ++vezFotos, total = rutasDe(d.filas).length;
    if (!fotosBase || !total) return;
    // Mientras llegan: el lugar de cada foto (con su pie) para que el orden no cambie
    medios = d.filas.map(function (f, i) {
        var md = medios[i] || { fotos: [] };
        md.fotos = (f.fotos || []).map(function (x) { return { ruta: x.ruta, pie: x.pie || '', cargando: true }; });
        return md;
    });
    pintarMedios();
    $('dz-guardado').textContent = 'Trayendo ' + plural(total, 'foto', 'fotos') + ' de la base…';
    var malas = 0;
    var traer = async function (ruta) {
        var blob = await fotosBase.bajar(ruta);
        if (!blob) { malas++; return null; }
        return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: 'jpg', url: URL.createObjectURL(blob), ruta: ruta };
    };
    for (var i = 0; i < d.filas.length; i++) {
        var f = d.filas[i], md = medios[i];
        for (var k = 0; k < md.fotos.length; k++) {
            var x = md.fotos[k], t = await traer(x.ruta);
            if (vez !== vezFotos) return;
            md.fotos[k] = t ? Object.assign(t, { pie: x.pie, nombre: '' }) : { ruta: x.ruta, pie: x.pie, falta: true };
            pintarMedios();
        }
        for (var q of [['imgActual', 'actual'], ['imgDescontar', 'descontar']]) {
            if (!f[q[0]]) continue;
            var im = await traer(f[q[0]]);
            if (vez !== vezFotos) return;
            // Si no llegó, la ruta se conserva (no se borra al guardar) y la imagen se vuelve a armar con el mapa
            md[q[1]] = im ? Object.assign(im, { propia: true }) : null;
            if (!im) md['falta_' + q[1]] = f[q[0]];
        }
    }
    pintarMedios();
    $('dz-guardado').textContent = malas ? '⚠ ' + plural(malas, 'foto no se pudo traer', 'fotos no se pudieron traer') + ' (¿sin señal?). Siguen guardadas: vuelva a abrir el descuento.' : '✓ Fotos traídas de la base.';
}
async function guardarHistorial() {
    leerForm();
    if (!d.filas.length) return toast('Agregue al menos un lote antes de guardar.');
    var b = $('dz-guardar'), texto0 = b.textContent; b.disabled = true;
    try {
        var errFotos = await subirMedios(function (t) { b.textContent = t; });
        b.textContent = 'Guardando…';
        // En cada fila: las rutas de sus fotos (lo que no se pudo traer se conserva para no borrarlo)
        d.filas.forEach(function (f, i) {
            var md = medios[i] || {}, m = metaDeMedios(md);
            f.fotos = m.fotos;
            f.imgActual = m.imgActual || md.falta_actual || '';
            f.imgDescontar = m.imgDescontar || md.falta_descontar || '';
        });
        var previo = historial.filter(function (h) { return h.id === d.id; })[0];
        var r = await guardado.guardar(d);
        donde(r);
        // Ya guardado en la base: se borran del almacenamiento las fotos que se quitaron
        if (r.donde === 'base' && previo && fotosBase) {
            var sob = sobrantes(rutasDe(previo.filas), rutasDe(d.filas));
            if (sob.length) fotosBase.borrar(sob).catch(function () { /* quedan sueltas; no afecta el descuento */ });
        }
        d.creado = d.creado || new Date().toISOString();
        guardar(BORRADOR, d);
        $('dz-titulo-form').textContent = '💸 Descuento guardado · ' + tipo(d.tipo).nombre;
        var nF = contarFotos(d.filas);
        toast(errFotos ? '⚠ ' + errFotos.message
            : r.donde === 'base' ? '✓ Guardado en el historial con ' + plural(nF, 'foto', 'fotos') + ' (se ve en el celular y en el equipo).' : '✓ Guardado en este equipo (sin las fotos). ' + (r.aviso || ''));
        pintarMedios();
    } catch (e) { toast('No se guardó: ' + e.message); }
    finally { b.disabled = false; b.textContent = texto0; }
}
function donde(r) {
    historial = r.lista;
    $('dz-donde').textContent = r.aviso || (r.donde === 'base' ? 'Guardados en la base: se ven igual en el computador y en el celular.' : '');
    $('dz-donde').classList.toggle('dz-mal', !!r.aviso);
    pintarHistorial();
}
function pasa(x) {
    var t = $('dz-f-tipo').value, mes = $('dz-f-mes').value, est = $('dz-f-estado').value, q = $('dz-f-buscar').value.trim().toUpperCase();
    if (t && x.tipo !== t) return false;
    if (mes && String(x.fecha || '').slice(0, 7) !== mes) return false;
    if (est && x.estado !== est) return false;
    if (q && !x.filas.some(function (f) { return (f.mr + ' ' + f.lote).toUpperCase().indexOf(q) !== -1; })) return false;
    return true;
}
function pintarHistorial() {
    var tSel = $('dz-f-tipo').value, mSel = $('dz-f-mes').value;
    $('dz-f-tipo').innerHTML = '<option value="">Todos</option>' + TIPOS.map(function (t) { return '<option value="' + t.clave + '"' + (t.clave === tSel ? ' selected' : '') + '>' + esc(t.nombre) + '</option>'; }).join('');
    var meses = Array.from(new Set(historial.map(function (x) { return String(x.fecha || '').slice(0, 7); }).filter(Boolean))).sort().reverse();
    $('dz-f-mes').innerHTML = '<option value="">Todos</option>' + meses.map(function (m) { return '<option' + (m === mSel ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var ver = historial.filter(pasa), tot = ver.reduce(function (s, x) { return s + totales(x.filas).descontar; }, 0);
    $('dz-cuenta').innerHTML = [[ver.length, plural(ver.length, 'descuento', 'descuentos').replace(/^\d+ /, '')], [ver.reduce(function (s, x) { return s + x.filas.length; }, 0), 'lotes'],
        [m2(tot) + ' m²', 'descontados'], [ver.filter(function (x) { return x.estado === 'emitido'; }).length, 'emitidos'], [ver.filter(function (x) { return x.estado !== 'emitido'; }).length, 'borradores']]
        .map(function (c) { return '<div class="dz-dato"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>'; }).join('');
    $('dz-ir-n').textContent = historial.length ? '(' + historial.length + ')' : '';
    $('dz-lista').innerHTML = ver.length ? ver.map(function (x) {
        var t = tipo(x.tipo);
        return '<article class="dz-item' + (d && d.id === x.id ? ' abierto' : '') + '"><div class="dz-item-cab"><b>' + t.icono + ' ' + esc(t.nombre) + ' · ' + esc(textoLotes(x.filas) || 'sin lotes') + '</b>' +
            '<span class="dz-estado ' + (x.estado === 'emitido' ? 'ok' : '') + '">' + (x.estado === 'emitido' ? 'Emitido' : 'Borrador') + '</span></div>' +
            '<div class="sub">' + esc(aTexto(x.fecha) || 'sin fecha') + ' · ' + m2(totales(x.filas).descontar) + ' m² a descontar' + (x.sector ? ' · ' + esc(x.sector) : '') + (contarFotos(x.filas) ? ' · 📷 ' + plural(contarFotos(x.filas), 'foto', 'fotos') : '') + (x.pendiente ? ' · solo en este equipo' : '') + '</div>' +
            '<div class="dz-fila"><button type="button" class="secundario pequeno" data-ver="' + esc(x.id) + '">👁 Ver</button>' +
            '<button type="button" class="secundario pequeno" data-abrir="' + esc(x.id) + '">✏️ Abrir y editar</button>' +
            '<button type="button" class="secundario pequeno" data-duplicar="' + esc(x.id) + '">⧉ Duplicar</button>' +
            '<button type="button" class="secundario pequeno" data-borrar="' + esc(x.id) + '">✕ Borrar</button></div></article>';
    }).join('') : '<p class="sub">' + (historial.length ? 'Ningún descuento con esos filtros.' : 'Aún no hay descuentos guardados.') + '</p>';
}
async function abrirHistorial(id) {
    var x = historial.filter(function (h) { return h.id === id; })[0];
    if (!x) return;
    if (d && d.filas.length && !(await confirmar('Abrir el descuento', 'Se cierra el que está en el formulario (su borrador se reemplaza; lo guardado en el historial sigue ahí, con sus fotos).', 'Abrir'))) return;
    d = JSON.parse(JSON.stringify(x));
    delete d.pendiente;
    d.filas.forEach(function (f) { if (!LOTES[f.mr]) return; f.dir = f.dir || LOTES[f.mr].d || ''; });
    medios = d.filas.map(function () { return { fotos: [] }; });
    activa = -1;
    guardar(BORRADOR, d);
    pintarTodo();
    if (d.filas.length) await abrirDibujo(0); else $('dz-dibujo').hidden = true;
    $('dz-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
    var nF = contarFotos(d.filas);
    toast('Descuento abierto' + (nF ? ': trayendo ' + plural(nF, 'foto', 'fotos') + '.' : '. Las imágenes del mapa se vuelven a armar al generar el PDF.'));
    cargarFotosGuardadas();
}
// 👁 Ver un descuento guardado sin tocar el formulario: lotes, áreas, cómo se midió, textos y fotos.
// Al cerrar se borra lo mostrado; si se cierra mientras traía las fotos, no se mezcla con el siguiente
var vezVer = 0, verId = '';
async function verHistorial(id) {
    var x = historial.filter(function (h) { return h.id === id; })[0];
    if (!x) return;
    var vez = ++vezVer, t = tipo(x.tipo), tot = totales(x.filas), nF = contarFotos(x.filas);
    verId = id;
    $('dz-ver-tit').textContent = t.icono + ' ' + t.nombre + ' · ' + (textoLotes(x.filas) || 'sin lotes');
    $('dz-ver-sub').textContent = (aTexto(x.fecha) || 'sin fecha') + ' · ' + (x.estado === 'emitido' ? 'Emitido' : 'Borrador') + (x.sector ? ' · ' + x.sector : '') +
        ' · ' + m2(tot.descontar) + ' m² a descontar' + (x.actualizado ? ' · guardado el ' + new Date(x.actualizado).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '');
    var como = function (f) { return f.manual ? 'escrita a mano' : f.todo ? 'todo el lote' : (f.dibujo || []).length >= 3 ? 'dibujo en el mapa' : 'sin medir'; };
    $('dz-ver-cuerpo').innerHTML = (x.textos && x.textos.titulo ? '<p class="dz-ver-titulo">' + esc(x.textos.titulo) + '</p>' : '') +
        x.filas.map(function (f, i) {
            return '<section class="dz-ver-lote"><h3>' + esc(f.mr + (f.lote ? ' - ' + f.lote : '')) + (f.cuad ? ' <span class="sub">· cuadrilla ' + esc(f.cuad) + '</span>' : '') + '</h3>' +
                '<div class="dz-cuenta">' + [[m2(f.areaBase || 0) + ' m²', 'área base'], [m2(areaFila(f)) + ' m²', 'a descontar'], [m2(areaActualizada(f)) + ' m²', 'quedan'], [como(f), 'cómo se midió']]
                    .map(function (c) { return '<div class="dz-dato"><b>' + esc(c[0]) + '</b><span>' + c[1] + '</span></div>'; }).join('') + '</div>' +
                ((f.fotos || []).length ? '<div class="dz-ver-fotos" data-ver-fila="' + i + '">' + f.fotos.map(function (p, k) {
                    return '<figure><div class="dz-foto-espera" data-ver-ruta="' + esc(p.ruta) + '">Trayendo…</div>' + (p.pie ? '<figcaption>' + esc(p.pie) + '</figcaption>' : '') + '</figure>';
                }).join('') + '</div>' : '<p class="sub">' + (nF ? 'Este lote no tiene fotos.' : 'Sin fotos guardadas.') + '</p>') + '</section>';
        }).join('') +
        (x.textos && x.textos.conclusion ? '<details class="dz-ver-texto"><summary>Conclusión del documento</summary><p>' + esc(x.textos.conclusion) + '</p></details>' : '');
    $('dlg-ver').showModal();
    if (!nF || !fotosBase) {
        if (nF) document.querySelectorAll('#dz-ver-cuerpo [data-ver-ruta]').forEach(function (el) { el.textContent = 'Sin conexión con la base'; });
        return;
    }
    try {
        var urls = await fotosBase.urls(rutasDe(x.filas));
        if (vez !== vezVer || !$('dlg-ver').open) return;
        document.querySelectorAll('#dz-ver-cuerpo [data-ver-ruta]').forEach(function (el) {
            var u = urls[el.dataset.verRuta];
            if (u) { var img = document.createElement('img'); img.src = u; img.alt = 'Foto del lote'; img.loading = 'lazy'; el.replaceWith(img); }
            else el.textContent = '⚠ No se encontró';
        });
    } catch (e) {
        if (vez === vezVer) document.querySelectorAll('#dz-ver-cuerpo [data-ver-ruta]').forEach(function (el) { el.textContent = '⚠ ' + e.message; });
    }
}
// ⧉ Duplicar: el mismo tipo, textos, campos, sector y lotes, como un descuento nuevo (borrador, fecha de hoy) y sin las fotos
// (son de la visita anterior). Se cambia lo que haga falta y se guarda aparte
async function duplicar(id) {
    var x = historial.filter(function (h) { return h.id === id; })[0];
    if (!x) return;
    if (d && d.filas.length && !(await confirmar('Duplicar el descuento', 'Se cierra el que está en el formulario (lo guardado en el historial sigue ahí) y se abre una copia de este, sin las fotos.', 'Duplicar'))) return;
    if ($('dlg-ver').open) $('dlg-ver').close();
    var c = JSON.parse(JSON.stringify(x));
    ['creado', 'actualizado', 'usuario', 'pendiente'].forEach(function (k) { delete c[k]; });
    d = Object.assign(vacio(), c, { id: nuevoId(), estado: 'borrador', fecha: hoy() });
    d.filas.forEach(function (f) { f.fotos = []; f.imgActual = ''; f.imgDescontar = ''; if (LOTES[f.mr]) f.dir = f.dir || LOTES[f.mr].d || ''; });
    medios = d.filas.map(function () { return { fotos: [] }; });
    activa = -1; vezFotos++;
    guardar(BORRADOR, d);
    pintarTodo(); pintarHistorial();
    $('dz-titulo-form').textContent = '💸 Copia de ' + tipo(d.tipo).nombre + ' (sin guardar)';
    if (d.filas.length) await abrirDibujo(0); else $('dz-dibujo').hidden = true;
    $('dz-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
    toast('Copia lista, sin fotos: cambie el lote o lo que haga falta, agregue las fotos y toque «Guardar en el historial».');
}
async function excelHistorial() {
    var ver = historial.filter(pasa);
    if (!ver.length) return toast('No hay descuentos para exportar con esos filtros.');
    var { default: ExcelJS } = await import('exceljs');
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Descuentos');
    var cab = ['FECHA', 'TIPO', 'MICRORRUTA', 'LOTE', 'CUADRILLA', 'ÁREA BASE m²', 'ÁREA A DESCONTAR m²', 'ÁREA ACTUALIZADA m²', 'SECTOR', 'ESTADO', 'CÓMO SE MIDIÓ'];
    ws.addRow(cab);
    filasHistorial(ver).forEach(function (r) { ws.addRow(r); });
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    ws.columns.forEach(function (c, i) { c.width = [12, 18, 13, 8, 10, 13, 15, 15, 36, 10, 14][i]; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    var blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Descuentos_' + hoy() + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Excel descargado: una fila por lote descontado.');
}

async function empezarOtro() {
    if (d.filas.length && !(await confirmar('Empezar otro descuento', 'Se borra el formulario (si no lo guardó en el historial, se pierde) y las fotos.', 'Empezar otro'))) return;
    d = vacio(); medios = []; activa = -1; vezFotos++;
    quitar(BORRADOR);
    $('dz-dibujo').hidden = true; $('dz-buscar-estado').textContent = ''; $('dz-guardado').textContent = '';
    pintarTodo(); pintarHistorial();
}

async function arrancar() {
    iniciarEncabezado();
    if (configurado) {
        var usuario = await asegurarSesion(supabase);
        $('btn-salir').hidden = false;
        $('btn-salir').title = 'Cerrar sesión de ' + usuario.email;
        $('btn-salir').onclick = function () { cerrarSesion(supabase); };
        aplicarPermisos(supabase, usuario);
    }
    guardado = crearGuardado(configurado ? supabase : null);
    var b = leer(BORRADOR, null);
    d = b && b.filas ? Object.assign(vacio(), b) : vacio();
    medios = d.filas.map(function () { return { fotos: [] }; });
    if (b && b.filas && b.filas.length) $('dz-guardado').textContent = 'Se abrió el borrador de este equipo' + (rutasDe(d.filas).length ? '.' : ' (las fotos se guardan al tocar «Guardar en el historial»).');

    $('dz-tipos').onclick = function (ev) {
        var t = ev.target.closest('[data-tipo]');
        if (!t || t.dataset.tipo === d.tipo) return;
        leerForm(); d.tipo = t.dataset.tipo;
        pintarTipos(); pintarCampos(); rearmar();
    };
    $('dz-agregar').onclick = agregar;
    $('dz-buscar').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); agregar(); } });
    $('dz-filas').addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-quitar]'), dib = ev.target.closest('[data-dibujar]');
        if (dib) { abrirDibujo(+dib.dataset.dibujar); $('dz-dibujo').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        if (q) {
            var i = +q.dataset.quitar;
            d.filas.splice(i, 1); medios.splice(i, 1);
            if (activa >= d.filas.length) activa = d.filas.length - 1;
            rearmar();
            if (activa >= 0) abrirDibujo(activa); else { $('dz-dibujo').hidden = true; pintarFilas(); }
        }
    });
    $('dz-filas').addEventListener('change', function (ev) {
        var t = ev.target, f;
        if (t.dataset.base != null) { f = d.filas[+t.dataset.base]; f.areaBase = Math.max(0, Math.round(+t.value || 0)); }
        if (t.dataset.desc != null) { f = d.filas[+t.dataset.desc]; if (f.manual) f.areaDescontar = Math.max(0, Math.round(+t.value || 0)); }
        if (t.dataset.manual != null) { f = d.filas[+t.dataset.manual]; f.manual = t.checked; if (f.manual && !f.areaDescontar) f.areaDescontar = f.todo ? Math.round(Number(f.areaBase) || 0) : Math.round(areaM2(f.dibujo)); }
        cambio(); pintarFilas(); if (activa >= 0) mostrarArea();
    });
    $('dz-deshacer').onclick = function () { var f = d.filas[activa]; if (f && f.dibujo && f.dibujo.length) { f.dibujo.pop(); cambio(); pintarDibujo(); pintarFilas(); } };
    $('dz-borrar-dibujo').onclick = async function () {
        var f = d.filas[activa];
        if (!f || !(f.dibujo || []).length) return;
        if (!(await confirmar('Borrar el dibujo', 'Se quitan los ' + f.dibujo.length + ' puntos del área a descontar de ' + f.mr + '.', 'Borrar'))) return;
        f.dibujo = []; cambio(); pintarDibujo(); pintarFilas();
    };
    // ▣ Todo el lote (p. ej. cerrado): se descuenta el área base completa y la imagen marca el polígono entero; sin dibujar.
    // Tocarlo otra vez (o tocar el mapa) vuelve a dibujar solo una parte
    $('dz-todo').onclick = async function () {
        var f = d.filas[activa];
        if (!f) return;
        if (f.todo) { f.todo = false; cambio(); pintarDibujo(); pintarFilas(); return toast('Dibuje en el mapa la parte a descontar.'); }
        if (!(await geometria(f)).length && !f.areaBase) return toast('Este lote no tiene polígono ni área base: escriba el área base o el área a descontar a mano.');
        if ((f.dibujo || []).length && !(await confirmar('Descontar todo el lote', 'Se quitan los ' + f.dibujo.length + ' puntos dibujados y se descuenta todo ' + f.mr + (f.lote ? ' - ' + f.lote : '') + (f.areaBase ? ' (' + m2(f.areaBase) + ' m²)' : '') + '.', 'Todo el lote'))) return;
        f.todo = true; f.manual = false; f.dibujo = [];
        if (!f.areaBase) toast('Falta el área base del lote: escríbala para que salga el área a descontar.');
        cambio(); pintarDibujo(); pintarFilas();
    };
    $('dz-centrar').onclick = centrar;
    $('dz-calles').onchange = function () { if (!mapa) return; if (this.checked) calles.addTo(mapa); else mapa.removeLayer(calles); };
    ['dz-fecha', 'dz-sector', 'dz-t-titulo', 'dz-t-intro', 'dz-t-conclusion', 'dz-t-localizacion', 'dz-t-sitio', 'dz-emitido'].forEach(function (id) { $(id).addEventListener('input', cambio); $(id).addEventListener('change', cambio); });
    $('dz-campos').addEventListener('input', cambio);
    $('dz-rearmar').onclick = function () { rearmar(); toast('Textos armados otra vez con los datos.'); };
    $('dz-medios').addEventListener('click', async function (ev) {
        var a = ev.target.closest('[data-armar]'), qf = ev.target.closest('[data-quitar-foto]'), au = ev.target.closest('[data-img-auto]'), uo = ev.target.closest('[data-img]');
        if (uo) destinoPegar = uo.dataset.img.split('|').map(function (v, k) { return k ? v : +v; });
        if (a) {
            a.disabled = true; a.textContent = 'Armando…';
            try { await armarImagenes(+a.dataset.armar, true); pintarMedios(); } catch (e) { toast('No se armaron: ' + e.message); a.disabled = false; a.textContent = '🖼 Armar imágenes'; }
        }
        if (qf) { var p = qf.dataset.quitarFoto.split('|'); medios[+p[0]].fotos.splice(+p[1], 1); pintarMedios(); }
        var mv = ev.target.closest('[data-mover]');
        if (mv) {
            var q3 = mv.dataset.mover.split('|').map(Number), lista = medios[q3[0]].fotos, k2 = q3[1] + q3[2];
            if (k2 >= 0 && k2 < lista.length) { var tmp = lista[q3[1]]; lista[q3[1]] = lista[k2]; lista[k2] = tmp; pintarMedios(); }
        }
        if (au) { var r = au.dataset.imgAuto.split('|'); medios[+r[0]][r[1]] = null; medios[+r[0]].clave = ''; pintarMedios(); }
    });
    $('dz-medios').addEventListener('change', async function (ev) {
        var t = ev.target;
        if (t.dataset.fotos != null && t.files.length) {
            var lista = Array.prototype.slice.call(t.files);
            t.value = '';
            await agregarFotos(+t.dataset.fotos, lista);
        }
        if (t.dataset.img != null && t.files[0]) { var p = t.dataset.img.split('|'); await ponerImagen(+p[0], p[1], t.files[0]); destinoPegar = null; }
        if (t.dataset.pie != null) { var q = t.dataset.pie.split('|'); medios[+q[0]].fotos[+q[1]].pie = t.value; }
    });
    // Pegar imágenes en cualquier parte de la página (también con el cursor en un campo: el texto pegado no se toca)
    document.addEventListener('paste', pegar);
    // Arrastrar fotos sobre el recuadro de un lote
    $('dz-medios').addEventListener('dragover', function (ev) { var z = ev.target.closest('[data-soltar]'); if (!z) return; ev.preventDefault(); z.classList.add('encima'); });
    $('dz-medios').addEventListener('dragleave', function (ev) { var z = ev.target.closest('[data-soltar]'); if (z && !z.contains(ev.relatedTarget)) z.classList.remove('encima'); });
    $('dz-medios').addEventListener('drop', function (ev) {
        var z = ev.target.closest('[data-soltar]');
        if (!z) return;
        ev.preventDefault(); z.classList.remove('encima');
        agregarFotos(+z.dataset.soltar, ev.dataTransfer && ev.dataTransfer.files);
    });
    $('dz-pdf').onclick = function () { generar('pdf'); };
    $('dz-previa').onclick = abrirPrevia;
    $('dz-previa-cerrar').onclick = function () { $('dlg-previa').close(); };
    $('dlg-previa').addEventListener('close', cerrarPrevia);
    $('dlg-previa').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
    $('dz-previa-pdf').onclick = function () { if (previa) bajar(previa); };
    $('dz-previa-word').onclick = function () { $('dlg-previa').close(); generar('word'); };
    $('dz-word').onclick = function () { generar('word'); };
    $('dz-formato').onchange = function () { var f = this.files[0]; this.value = ''; if (f) subirFormato(f); };
    $('dz-formato-quitar').onclick = async function () {
        if (!(await confirmar('Quitar el formato de este equipo', formatoBase ? 'El Word y el PDF vuelven a salir con el formato predeterminado del Colegio Mayor.' : 'El Word y el PDF vuelven a salir con el diseño de la aplicación (y la imagen de membrete, si hay).', 'Quitar'))) return;
        await guardarArchivo('formato', null); await cargarFormato(); toast('Formato quitado.');
    };
    $('dz-guardar').onclick = guardarHistorial;
    $('dz-nuevo').onclick = empezarOtro;
    $('dz-membrete').onchange = async function () {
        var f = this.files[0]; this.value = '';
        if (!f) return;
        var bmp = await createImageBitmap(f), c = document.createElement('canvas'), e = Math.min(1, 1700 / bmp.width);
        c.width = Math.round(bmp.width * e); c.height = Math.round(bmp.height * e);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
        if (!guardar(MEMBRETE, { datos: c.toDataURL('image/jpeg', 0.88), nombre: f.name })) return toast('No cupo en este equipo: use una imagen más liviana.');
        pintarMembrete(); toast('Membrete guardado en este equipo.');
    };
    $('dz-membrete-quitar').onclick = function () { quitar(MEMBRETE); pintarMembrete(); };
    $('dz-lista').addEventListener('click', async function (ev) {
        var ab = ev.target.closest('[data-abrir]'), bo = ev.target.closest('[data-borrar]'), vr = ev.target.closest('[data-ver]'), du = ev.target.closest('[data-duplicar]');
        if (ab) abrirHistorial(ab.dataset.abrir);
        if (vr) verHistorial(vr.dataset.ver);
        if (du) duplicar(du.dataset.duplicar);
        if (bo) {
            var x = historial.filter(function (h) { return h.id === bo.dataset.borrar; })[0];
            if (!x || !(await confirmar('Borrar el descuento', tipo(x.tipo).nombre + ' · ' + textoLotes(x.filas) + ' (' + m2(totales(x.filas).descontar) + ' m²). Deja de contar en los totales' + (contarFotos(x.filas) ? ' y se borran sus ' + plural(contarFotos(x.filas), 'foto', 'fotos') : '') + '.', 'Borrar'))) return;
            try {
                donde(await guardado.borrar(x.id));
                var rutas = rutasDe(x.filas);
                if (rutas.length && fotosBase) await fotosBase.borrar(rutas).catch(function () { /* quedan sueltas en el almacenamiento */ });
                toast('Descuento borrado.');
            } catch (e) { toast(e.message); }
        }
    });
    ['dz-f-tipo', 'dz-f-mes', 'dz-f-estado'].forEach(function (id) { $(id).onchange = pintarHistorial; });
    $('dz-f-buscar').oninput = pintarHistorial;
    $('dz-excel').onclick = excelHistorial;
    $('dz-ir-historial').onclick = function () { $('dz-historial').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    $('dz-ver-cerrar').onclick = function () { $('dlg-ver').close(); };
    $('dz-ver-abrir').onclick = function () { var id = verId; $('dlg-ver').close(); abrirHistorial(id); };
    $('dz-ver-duplicar').onclick = function () { var id = verId; $('dlg-ver').close(); duplicar(id); };
    $('dlg-ver').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
    $('dlg-ver').addEventListener('close', function () { vezVer++; verId = ''; $('dz-ver-cuerpo').innerHTML = ''; $('dz-ver-tit').textContent = ''; $('dz-ver-sub').textContent = ''; });
    $('btn-recargar').onclick = async function () { donde(await guardado.leer()); toast('Actualizado.'); };

    $('estado').hidden = true; $('dz-form').hidden = false; $('dz-historial').hidden = false;
    // Un borrador sin textos (de antes, o vacío): se arman con su tipo y sus datos
    if (!String(d.textos && d.textos.titulo || '').trim()) d.textos = textosDeTipo(d.tipo, d);
    pintarTodo(); pintarMembrete();
    cargarFormato();
    if (d.filas.length) abrirDibujo(0);
    cargarFotosGuardadas();
    donde(await guardado.leer());
}
arrancar();
