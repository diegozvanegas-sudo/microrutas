// 🧾 Instrumentos · 📋 Varias de una vez (formulario de domingos): pegar el reporte del día → una fila por ruta o vehículo;
// elegir todas las fotos del día (sueltas o .zip) → cada una a la ruta que pasa más cerca (GPS del archivo o, si llegó
// por WhatsApp, el de la marca de agua) → un PDF por fila; enlace de Drive (una carpeta para todas o uno por fila);
// y «Abrir» en cada fila: el formulario sale lleno y se envía allá. Las filas quedan en el equipo; las fotos no (son pesadas).
import { $, toast } from '../subsanaciones/ui.js';
import { examinar, fotosAPdf } from '../subsanaciones/fotospdf.js';
import { recorteMarca, coordenadasMarca, fechaMarca } from '../subsanaciones/marcaagua.js';
import { leerImagenes } from '../subsanaciones/ocr.js';
import { imagenesDeZips, descargar } from '../subsanaciones/zippdf.js';
import { enlaceDom, faltantesDom, conCuenta, desdeRevisionDom, PERSONAL, SERVICIO, OPC_DOM } from './comun.js';
import { leerReporte, datosDeFila, tramosDe, filaDeFoto, nombrePdf, repartirEnlaces } from './lote.js';

var LOTE = 'instrumento_lote';
var ctx = null, estado = { filas: [], modo: 'carpeta', carpeta: '' }, fotos = [], geo = null, ocupado = false, abiertasFotos = {};
var CAMBIABLES = ['zona', 'contratista', 'instrumento', 'verificacion', 'ruta'].concat(PERSONAL.concat(SERVICIO).map(function (c) { return c[0]; }));
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function guardar() { try { localStorage.setItem(LOTE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ } }
function datos(f) {
    var base = ctx.base(), d = datosDeFila(Object.assign({}, f, { enlace: estado.modo === 'fila' ? f.enlace || '' : '' }), Object.assign({}, base, { fotos: estado.modo === 'carpeta' ? estado.carpeta : '' }), ctx.pref());
    return d;
}

// Trazos de las rutas de domingo (capa del mapa rápido), una vez
function cargarGeo() {
    if (geo) return Promise.resolve(geo);
    return new Promise(function (ok) {
        var antes = window.cargarCapa;
        window.cargarCapa = function (k, d) {
            if (k === 'barrido_dom') { geo = {}; d.items.forEach(function (it) { geo[it.n.toUpperCase()] = tramosDe(it); }); }
            else if (antes) antes(k, d);
        };
        var s = document.createElement('script');
        s.src = 'data/rapido/capa_barrido_dom.js';
        s.onload = function () { ok(geo || {}); };
        s.onerror = function () { geo = {}; toast('No se pudo leer el mapa de rutas de domingo: las fotos se asignan a mano.'); ok(geo); };
        document.head.appendChild(s);
    });
}

function asignar() {
    fotos.forEach(function (p) {
        if (p.mano) return;  // la movió la persona: no se toca
        var r = filaDeFoto(p.gps, estado.filas, geo || {});
        p.fila = r.fila; p.motivo = r.motivo || ''; p.dist = r.dist;
    });
}
function fotosDe(id) {
    return fotos.filter(function (p) { return p.fila === id; }).sort(function (a, b) { return String(a.fecha || a.nombre).localeCompare(String(b.fecha || b.nombre)); });
}

function pintar() {
    var c = $('lote'), filas = estado.filas;
    c.hidden = ctx.tipo() !== 'dom';
    if (c.hidden) return;
    var sinFila = fotos.filter(function (p) { return !p.fila && !p.fuera; }), sinGps = fotos.filter(function (p) { return !p.gps; });
    var abiertas = filas.filter(function (f) { return f.abierto; }).length, conFotos = filas.filter(function (f) { return fotosDe(f.id).length; }).length;
    $('lote-cuenta').textContent = filas.length ? filas.length + ' filas · ' + conFotos + ' con fotos · ' + abiertas + ' abiertas' : '';
    $('lote-pasos').hidden = !filas.length;
    $('lote-fotos-estado').innerHTML = !fotos.length ? 'Elija todas las fotos del día juntas (o los .zip). Cada una va sola a su ruta.' :
        '<b>' + fotos.length + ' fotos</b> · ' + (fotos.length - sinFila.length) + ' ubicadas en su ruta' + (sinFila.length ? ' · <b class="lote-mal">' + sinFila.length + ' sin ruta</b> (asígnelas abajo)' : '') +
        (sinGps.length ? ' · ' + sinGps.length + ' sin GPS' : '');
    $('lote-marca').hidden = !sinGps.filter(function (p) { return !p.marcaLeida; }).length;
    $('lote-marca').textContent = '🔤 Leer la marca de agua de las ' + sinGps.filter(function (p) { return !p.marcaLeida; }).length + ' sin GPS';
    $('lote-pdfs').disabled = !conFotos || ocupado;
    $('lote-modo').querySelectorAll('[data-modo]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.modo === estado.modo); });
    $('lote-carpeta-caja').hidden = estado.modo !== 'carpeta';
    $('lote-enlaces-caja').hidden = estado.modo !== 'fila';
    $('lote-carpeta').value = estado.carpeta || '';
    // Contratista por zona: una vez por cada zona que salga en la lista (los vehículos, cuando ya tengan zona)
    var zonas = Array.from(new Set(filas.map(function (f) { return datos(f).zona; }).filter(Boolean)));
    $('lote-contratistas-caja').hidden = !zonas.length;
    $('lote-contratistas').innerHTML = zonas.map(function (z) {
        var actual = ((ctx.pref().contratistasDom) || {})[z] || '';
        return '<div class="ins-sn"><span>' + esc(z) + '</span><div class="ins-chips">' + OPC_DOM.contratista.map(function (c) {
            return '<button type="button" class="ins-chip" data-contratista-zona="' + esc(z) + '" data-valor="' + c + '" aria-pressed="' + (actual === c) + '">' + c + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    var opcFila = '<option value="">Mover a…</option>' + filas.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.ruta + (f.nota ? ' (' + f.nota + ')' : '')) + '</option>'; }).join('');
    $('lote-filas').innerHTML = filas.map(function (f) {
        var d = datos(f), falta = faltantesDom(d), fs = fotosDe(f.id), cambios = Object.keys(f.cambios || {}).filter(function (k) { return f.cambios[k] === 'No'; });
        return '<li class="lote-fila' + (f.abierto ? ' abierta' : '') + (ctx.editando() === f.id ? ' editando' : '') + '">' +
            '<div class="lote-cab"><b>' + (f.abierto ? '✓ ' : '') + esc(f.ruta) + '</b>' + (f.nota ? ' <span class="sub">(' + esc(f.nota) + ')</span>' : '') +
                ' <span class="lote-tag">' + esc(d.zona || 'sin zona') + '</span><span class="lote-tag">' + esc(d.instrumento) + '</span>' +
                (cambios.length ? '<span class="lote-tag no">' + cambios.length + ' en «No»</span>' : '') +
                '<span class="lote-tag' + (fs.length ? '' : ' no') + '">📷 ' + fs.length + '</span></div>' +
            (!f.zona ? '<label class="lote-zona">Zona ' + '<select data-zona="' + esc(f.id) + '"><option value="">Elija…</option>' + OPC_DOM.zona.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('') + '</select></label>' : '') +
            (estado.modo === 'fila' ? '<input class="lote-enlace" data-enlace="' + esc(f.id) + '" type="url" inputmode="url" value="' + esc(f.enlace || '') + '" placeholder="Enlace de Drive del PDF de esta ruta">' : '') +
            (falta.length ? '<div class="lote-falta">Falta: ' + esc(falta.join(', ')) + '</div>' : '') +
            '<div class="lote-acc">' +
                (fs.length ? '<button type="button" class="secundario pequeno" data-ver-fotos="' + esc(f.id) + '">' + (abiertasFotos[f.id] ? '▴ Fotos' : '▾ Fotos') + '</button><button type="button" class="secundario pequeno" data-pdf="' + esc(f.id) + '">⬇️ PDF</button>' : '') +
                '<button type="button" class="secundario pequeno" data-ajustar="' + esc(f.id) + '">✏️ Ajustar</button>' +
                '<button type="button" class="secundario pequeno lote-quitar" data-quitar-fila="' + esc(f.id) + '" aria-label="Quitar fila">✕</button>' +
                '<button type="button" class="primario pequeno" data-abrir="' + esc(f.id) + '"' + (falta.length ? ' disabled' : '') + '>📝 Abrir</button>' +
            '</div>' +
            (abiertasFotos[f.id] ? '<ul class="lote-fotos">' + fs.map(function (p) { return filaFoto(p, opcFila); }).join('') + '</ul>' : '') +
        '</li>';
    }).join('');
    $('lote-sin').hidden = !sinFila.length;
    $('lote-sin-lista').innerHTML = sinFila.map(function (p) { return filaFoto(p, opcFila); }).join('');
}
function filaFoto(p, opcFila) {
    var i = fotos.indexOf(p);
    return '<li><span class="lote-foto-nom">' + esc(p.nombre) + '</span><span class="sub">' + esc(p.fecha ? p.fecha.slice(11, 16) : 'sin hora') +
        (p.gps ? ' · ' + (p.fuente === 'marca' ? 'GPS de la marca' : 'GPS') + (p.dist != null ? ' a ' + p.dist + ' m' : '') : ' · sin GPS') + (p.motivo && !p.fila ? ' · ' + esc(p.motivo) : '') + '</span>' +
        '<select data-mover="' + i + '" aria-label="Mover a otra fila">' + opcFila + '<option value="__fuera">No va en ningún PDF</option></select></li>';
}

async function elegirFotos(lista) {
    if (!lista.length) return;
    ocupado = true; $('lote-fotos-estado').textContent = 'Leyendo ' + lista.length + ' archivos…';
    try {
        var sueltas = lista.filter(function (f) { return !/\.zip$/i.test(f.name); }), zips = lista.filter(function (f) { return /\.zip$/i.test(f.name); });
        if (zips.length) sueltas = sueltas.concat(await imagenesDeZips(zips));
        sueltas = sueltas.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name); });
        // Volver a elegir reemplaza lo anterior (no se suma a escondidas)
        fotos = (await examinar(sueltas)).map(function (x) { return Object.assign(x, { fuente: x.gps ? 'exif' : '' }); });
        await cargarGeo();
        asignar();
        var sinGps = fotos.filter(function (p) { return !p.gps; }).length;
        toast(fotos.length + ' fotos leídas' + (sinGps ? '; ' + sinGps + ' sin GPS (llegaron por WhatsApp): toque «Leer la marca de agua».' : '.'));
    } catch (e) { toast('No se pudieron leer las fotos: ' + (e.message || e)); }
    ocupado = false; pintar();
}
async function leerMarcas() {
    var pend = fotos.filter(function (p) { return !p.gps && !p.marcaLeida; });
    if (!pend.length || ocupado) return;
    ocupado = true; $('lote-marca').disabled = true;
    try {
        var recortes = [];
        for (var i = 0; i < pend.length; i++) { $('lote-fotos-estado').textContent = 'Preparando la marca de agua ' + (i + 1) + ' de ' + pend.length + '…'; recortes.push(await recorteMarca(pend[i].archivo)); }
        var textos = await leerImagenes(recortes, function (h, t) { $('lote-fotos-estado').textContent = 'Leyendo la marca de agua ' + (h + 1) + ' de ' + t + '…'; });
        var bien = 0;
        textos.forEach(function (t, k) {
            var p = pend[k], g = coordenadasMarca(t.texto);
            p.marcaLeida = true;
            if (g) { p.gps = g; p.fuente = 'marca'; bien++; }
            if (!p.fecha) p.fecha = fechaMarca(t.texto);
        });
        asignar();
        toast('Marca de agua: ' + bien + ' de ' + pend.length + ' con coordenadas.' + (bien < pend.length ? ' Las demás, asígnelas a mano.' : ''));
    } catch (e) { toast('No se pudo leer la marca de agua: ' + (e.message || e) + '. Revise la conexión (el lector se descarga la primera vez).'); }
    ocupado = false; $('lote-marca').disabled = false; pintar();
}
async function pdfDe(f) {
    return fotosAPdf(fotosDe(f.id), { diseno: 'carta4', reducir: true, nombre: nombrePdf(f, ctx.base().fecha), devolver: true }, function () {});
}
async function descargarPdfs() {
    if (ocupado) return;
    ocupado = true; pintar();
    try {
        var { default: JSZip } = await import('jszip'), zip = new JSZip(), con = estado.filas.filter(function (f) { return fotosDe(f.id).length; }), omit = 0;
        for (var i = 0; i < con.length; i++) {
            $('lote-fotos-estado').textContent = 'Armando PDF ' + (i + 1) + ' de ' + con.length + ' (' + con[i].ruta + ')…';
            var r = await pdfDe(con[i]);
            omit += r.omitidas.length;
            if (r.bytes) zip.file(r.nombre, r.bytes);
        }
        var p = String(ctx.base().fecha || '').split('-');
        descargar(await zip.generateAsync({ type: 'uint8array' }), 'Instrumentos_' + (p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : 'dia') + '.zip', 'application/zip');
        toast(con.length + ' PDF en el .zip.' + (omit ? ' ' + omit + ' fotos no se pudieron poner (formato raro).' : '') + ' Súbalos a Drive y pegue el enlace.');
    } catch (e) { toast('No se pudieron armar los PDF: ' + (e.message || e)); }
    ocupado = false; pintar();
}

function armar() {
    var nuevas = leerReporte($('lote-texto').value);
    if (!nuevas.length) return toast('No encontré rutas (Z1R19DOM…) ni placas en el texto. Pegue el reporte tal cual.');
    // Lo que ya tenía (abierto, enlace, cambios) se conserva si la fila sigue en el reporte
    var antes = {}; estado.filas.forEach(function (f) { antes[f.id] = f; });
    var hoy = ctx.base().fecha, revs = ctx.revisiones();
    estado.filas = nuevas.map(function (f) {
        if (antes[f.id]) return antes[f.id];
        // Si hay una revisión de esa ruta ese día, sus novedades pasan como «No»
        var r = revs.filter(function (x) { return x.fecha === hoy && String(x.ruta || '').toUpperCase() === f.ruta; })[0];
        if (r) {
            var v = desdeRevisionDom(r), c = {};
            PERSONAL.concat(SERVICIO).forEach(function (q) { if (v[q[0]] === 'No') c[q[0]] = 'No'; });
            if (v.verificacion !== 'Operacion') c.verificacion = v.verificacion;
            f.cambios = c; f.turno = r.turno;
        }
        return f;
    });
    guardar(); asignar(); pintar();
    toast(estado.filas.length + ' filas listas.' + (estado.filas.some(function (f) { return !f.zona; }) ? ' A los vehículos elíjales la zona.' : ''));
}

export function marcarAbierta(id) { var f = estado.filas.filter(function (x) { return x.id === id; })[0]; if (f) { f.abierto = true; guardar(); pintar(); } }
// Lo cambiado en el formulario de arriba al ajustar una fila queda en esa fila
export function guardarAjuste(id, d) {
    var f = estado.filas.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var sin = datosDeFila(Object.assign({}, f, { cambios: {} }), ctx.base(), ctx.pref()), c = {};
    CAMBIABLES.forEach(function (k) { if (d[k] !== sin[k]) c[k] = d[k]; });
    f.cambios = c; guardar(); pintar();
}
export function datosFila(id) { var f = estado.filas.filter(function (x) { return x.id === id; })[0]; return f ? datos(f) : null; }
export function repintarLote() { if (ctx) pintar(); }

export function iniciarLote(c) {
    ctx = c;
    var g = leer(LOTE, null);
    if (g && Array.isArray(g.filas)) estado = Object.assign(estado, g);
    $('lote-armar').onclick = armar;
    $('lote-vaciar').onclick = function () { estado = { filas: [], modo: estado.modo, carpeta: '' }; fotos = []; $('lote-texto').value = ''; guardar(); pintar(); };
    $('lote-archivos').onchange = function () { var l = Array.from(this.files || []); this.value = ''; elegirFotos(l); };
    $('lote-marca').onclick = leerMarcas;
    $('lote-contratistas').onclick = function (ev) {
        var b = ev.target.closest('[data-contratista-zona]');
        if (!b) return;
        ctx.contratista(b.dataset.contratistaZona, b.dataset.valor);
        pintar();
    };
    $('lote-pdfs').onclick = descargarPdfs;
    $('lote-modo').onclick = function (ev) { var b = ev.target.closest('[data-modo]'); if (b) { estado.modo = b.dataset.modo; guardar(); pintar(); } };
    $('lote-carpeta').oninput = function () { estado.carpeta = this.value.trim(); guardar(); pintarSinFoco(); };
    $('lote-repartir').onclick = function () {
        var r = repartirEnlaces($('lote-enlaces').value, estado.filas);
        estado.filas.forEach(function (f) { if (r.enlaces[f.id]) f.enlace = r.enlaces[f.id]; });
        guardar(); pintar();
        toast(Object.keys(r.enlaces).length + ' enlaces puestos en orden.' + (r.faltan ? ' Faltan ' + r.faltan + '.' : '') + (r.sobran ? ' Sobran ' + r.sobran + ': revise el orden.' : ''));
    };
    $('lote').addEventListener('change', function (ev) {
        var t = ev.target;
        if (t.dataset.mover != null && t.value) {
            var p = fotos[+t.dataset.mover];
            p.fila = t.value === '__fuera' ? null : t.value; p.mano = true; p.motivo = t.value === '__fuera' ? 'quitada' : '';
            if (t.value === '__fuera') p.fuera = true;
            pintar();
        }
        if (t.dataset.zona != null) { var f = estado.filas.filter(function (x) { return x.id === t.dataset.zona; })[0]; f.cambios = Object.assign({}, f.cambios, { zona: t.value }); f.zona = t.value.replace(/^Zona\s*/, '').replace(/\s.*$/, ''); guardar(); pintar(); }
    });
    $('lote').addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.dataset.enlace != null) { var f = estado.filas.filter(function (x) { return x.id === t.dataset.enlace; })[0]; f.enlace = t.value.trim(); guardar(); }
    });
    $('lote').addEventListener('focusout', function (ev) { if (ev.target.dataset && ev.target.dataset.enlace != null) pintar(); });
    $('lote-filas').addEventListener('click', async function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        var id = b.dataset.abrir || b.dataset.pdf || b.dataset.ajustar || b.dataset.verFotos || b.dataset.quitarFila, f = estado.filas.filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        if (b.dataset.verFotos) { abiertasFotos[id] = !abiertasFotos[id]; return pintar(); }
        if (b.dataset.quitarFila) { estado.filas = estado.filas.filter(function (x) { return x !== f; }); fotos.forEach(function (p) { if (p.fila === id) p.fila = null; }); guardar(); return pintar(); }
        if (b.dataset.ajustar) return ctx.ajustar(id, datos(f));
        if (b.dataset.pdf) {
            b.disabled = true; b.textContent = 'Armando…';
            try { var r = await pdfDe(f); descargar(r.bytes, r.nombre, 'application/pdf'); } catch (e) { toast('No se pudo armar el PDF: ' + (e.message || e)); }
            return pintar();
        }
        if (b.dataset.abrir) {
            var d = datos(f);
            if (faltantesDom(d).length) return;
            ctx.abrir(conCuenta(enlaceDom(d), ctx.pref().cuenta), d, id);
        }
    });
    pintar();
}
// Pintar sin perder el cursor del campo de la carpeta (solo cambia lo que depende del enlace)
function pintarSinFoco() {
    var a = document.activeElement && document.activeElement.id;
    pintar();
    if (a) { var el = $(a); if (el) { el.focus(); var n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* tipo url */ } } }
}
