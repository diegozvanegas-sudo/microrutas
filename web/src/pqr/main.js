// pqr.html: la queja (foto leída con OCR o texto pegado), lo que se encontró en la visita y la respuesta de cierre.
// Se guarda en Supabase (public.pqrs, 0009_pqr.sql), cada quien los suyos; la última lista queda en el equipo.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { leerPqr, hablaDeCobro, hablaDeBarrido, armarRespuestas, RESULTADOS, temasDeQueja } from './plantillas.js';

var CACHE = 'pqr_cache';
var $ = function (id) { return document.getElementById(id); };
var pqrs = [], actual = null, filtro = '';
// Cláusulas del contrato (contrato_secciones, mismo permiso y copia que contrato.html) y las elegidas para citar: { k: { k, t, ref } }
var CACHE_CONTRATO = 'contrato_cache', contrato = null, elegidas = {};

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function plano(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('ver'); }, Math.max(3000, msg.length * 60));
}
function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto).then(function () { toast('Copiado'); });
    var a = document.createElement('textarea');
    a.value = texto; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); toast('Copiado'); } catch (e) { toast('No se pudo copiar: selecciónelo a mano.'); }
    a.remove();
    return Promise.resolve();
}

// ---------- Lista ----------
function pintarLista() {
    var q = plano($('buscar').value.trim());
    var vis = pqrs.filter(function (p) {
        return (!filtro || p.estado === filtro) && (!q || plano([p.radicado, p.direccion, p.barrio, p.nombre, p.queja].join(' ')).indexOf(q) >= 0);
    });
    $('estado').hidden = !!vis.length;
    if (!vis.length) $('estado').textContent = pqrs.length ? 'No hay PQR con ese filtro.' : 'Aún no hay PQR. Toque «+ Nuevo PQR» y tome la foto de la queja.';
    $('lista').innerHTML = vis.map(function (p) {
        var res = p.visita && RESULTADOS[p.visita.resultado];
        return '<button type="button" class="item-pqr" data-id="' + esc(p.id) + '">' +
            '<span class="cab"><b>' + esc(p.radicado ? 'ID ' + p.radicado : 'Sin ID') + '</b>' +
            '<span class="badge ' + esc(p.estado) + '">' + (p.estado === 'respondido' ? '✓ Respondido' : 'Abierto') + '</span>' +
            (p.fecha_pqr ? '<span class="sub">' + esc(p.fecha_pqr) + '</span>' : '') + '</span>' +
            '<span class="dir">' + esc([p.direccion, p.barrio].filter(Boolean).join(' · ') || 'Sin dirección') + '</span>' +
            '<span class="sub">' + esc((p.queja || '').slice(0, 140)) + (p.queja && p.queja.length > 140 ? '…' : '') + '</span>' +
            (res ? '<span class="sub">Visita: ' + esc(res) + '</span>' : '') + '</button>';
    }).join('');
}

async function cargar() {
    $('estado').hidden = false;
    $('estado').textContent = 'Cargando…';
    var res = await supabase.from('pqrs').select('*').order('creado', { ascending: false });
    if (res.error) {
        try { pqrs = JSON.parse(localStorage.getItem(CACHE)) || []; } catch (e) { pqrs = []; }
        pintarLista();
        if (/pqrs/.test(res.error.message) && /exist|schema/i.test(res.error.message)) toast('Falta crear la tabla de PQR en Supabase (migración 0009_pqr.sql).');
        else toast('Sin conexión: se muestra la última copia. ' + res.error.message);
        return;
    }
    pqrs = res.data;
    try { localStorage.setItem(CACHE, JSON.stringify(pqrs)); } catch (e) {}
    pintarLista();
}

// ---------- Un PQR ----------
var CAMPOS = { 'f-id': 'radicado', 'f-fecha': 'fecha_pqr', 'f-nombre': 'nombre', 'f-telefono': 'telefono', 'f-direccion': 'direccion', 'f-barrio': 'barrio' };

function abrir(p) {
    actual = p || null;
    p = p || { visita: {} };
    var v = p.visita || {};
    $('texto').value = p.queja || '';
    Object.keys(CAMPOS).forEach(function (id) { $(id).value = p[CAMPOS[id]] || ''; });
    marcarResultado(v.resultado || 'ejecutado');
    $('v-corte').value = v.fechaCorte || '';
    $('v-visita').value = v.fechaVisita || hoy();
    $('v-proxima').value = v.fechaProxima || '';
    $('v-contacto').value = v.contacto || 'si';
    $('v-area').value = v.area || '';
    $('v-cuadrilla').value = v.cuadrilla || '';
    $('v-corregido').value = v.fechaCorregido || '';
    $('v-barrido').checked = v.barrido != null ? !!v.barrido : hablaDeBarrido(p.queja);
    $('v-mallas').checked = !!v.mallas;
    $('v-cobro').checked = v.cobro != null ? !!v.cobro : hablaDeCobro(p.queja);
    $('v-obs').value = v.observacion || '';
    $('respuesta').value = p.respuesta || '';
    elegidas = {};
    (v.clausulas || []).forEach(function (c) { if (c && c.k) elegidas[c.k] = c; });
    $('contrato-buscar').value = '';
    pintarBusqueda();
    $('btn-eliminar').hidden = !actual;
    $('ocr').hidden = true;
    $('vista-lista').hidden = true;
    $('vista-pqr').hidden = false;
    window.scrollTo(0, 0);
    actualizar();
}
function cerrarPqr() {
    $('vista-pqr').hidden = true;
    $('vista-lista').hidden = false;
    pintarLista();
}

function marcarResultado(r) {
    $('resultados').querySelectorAll('[data-r]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.r === r); });
    document.querySelectorAll('[data-si]').forEach(function (el) { el.hidden = el.dataset.si.split(' ').indexOf(r) === -1; });
}
function resultado() { var b = $('resultados').querySelector('[aria-checked="true"]'); return b ? b.dataset.r : 'ejecutado'; }

function datos() {
    return {
        id: $('f-id').value.trim(), direccion: $('f-direccion').value.trim(), barrio: $('f-barrio').value.trim(),
        resultado: resultado(), fechaCorte: $('v-corte').value, fechaVisita: $('v-visita').value, fechaProxima: $('v-proxima').value,
        cuadrilla: $('v-cuadrilla').value.trim(), fechaCorregido: $('v-corregido').value, barrido: $('v-barrido').checked, mallas: $('v-mallas').checked,
        telefono: $('f-telefono').value.trim(),
        contacto: $('v-contacto').value, cobro: $('v-cobro').checked, area: $('v-area').value.trim(), observacion: $('v-obs').value.trim(),
        clausulas: Object.keys(elegidas).map(function (k) { return elegidas[k]; }),
    };
}
var propuestas = [];
function actualizar() {
    var dir = $('f-direccion').value.trim(), tel = $('f-telefono').value.replace(/\D/g, '');
    $('btn-mapa').hidden = !dir;
    $('btn-mapa').href = 'mapa_rapido.html?q=' + encodeURIComponent(dir);
    $('btn-llamar').hidden = !tel;
    $('btn-llamar').href = 'tel:' + tel;
    $('cobro-auto').textContent = hablaDeCobro($('texto').value) ? '(la queja habla de cobro o factura)' : '';
    pintarTemas();
    propuestas = armarRespuestas(datos());
    $('propuestas').innerHTML = propuestas.map(function (r, i) {
        return '<div class="propuesta"><div class="cab"><b>' + esc(r.titulo) + '</b>' +
            '<button type="button" class="secundario pequeno" data-copiar="' + i + '">📋 Copiar</button>' +
            '<button type="button" class="primario pequeno" data-usar="' + i + '">Usar esta</button></div>' +
            '<p>' + esc(r.texto).replace(/\n/g, '<br>') + '</p></div>';
    }).join('');
}

// ---------- Contrato: cláusulas según los temas de la queja ----------
function aplanar(secciones) {
    var out = [];
    secciones.filter(function (s) { return s.tipo !== 'meta' && s.id !== 'app'; }).forEach(function (s) {
        (s.items || []).forEach(function (it, i) { out.push({ k: s.id + ':' + i, sec: s.titulo, clave: it.clave || '', t: it.t || '', ref: it.ref || '' }); });
    });
    return out;
}
async function cargarContrato(permisos) {
    if (!permisos || !permisos.contrato) { contrato = null; return pintarTemas(); }
    var res = await supabase.from('contrato_secciones').select('id, orden, icono, titulo, tipo, items').order('orden');
    var secciones = res.error ? null : res.data;
    if (secciones) try { localStorage.setItem(CACHE_CONTRATO, JSON.stringify(secciones)); } catch (e) {}
    else try { secciones = JSON.parse(localStorage.getItem(CACHE_CONTRATO)); } catch (e) {}
    contrato = secciones && secciones.length ? aplanar(secciones) : null;
    pintarTemas();
}
function clausula(c) {
    return '<label class="clausula"><input type="checkbox" data-clausula="' + esc(c.k) + '"' + (elegidas[c.k] ? ' checked' : '') + '>' +
        '<span>' + (c.clave ? '<b>' + esc(c.clave) + ':</b> ' : '') + esc(c.t) + '<span class="ref">' + esc(c.sec) + (c.ref ? ' · ' + esc(c.ref) : '') + '</span></span></label>';
}
function pintarTemas() {
    var caja = $('contrato-temas');
    $('contrato-buscar').hidden = !contrato;
    if (!contrato) {
        caja.innerHTML = '<p class="sub">🔒 Para ver las cláusulas necesita el permiso del contrato (pídaselo al administrador).</p>';
        return;
    }
    var temas = temasDeQueja($('texto').value), vistas = {}, res = resultado();
    var html = temas.map(function (t) {
        var items = contrato.filter(function (c) { return t.clausula.test(c.clave + ' ' + c.t); });
        if (!items.length) return '';
        items.forEach(function (c) { vistas[c.k] = 1; });
        return '<div class="tema"><h3>' + esc(t.titulo) +
            (t.sugerencia && res !== t.sugerencia ? '<button type="button" class="secundario sugerir" data-sugerir="' + t.sugerencia + '">Marcar «' + esc(RESULTADOS[t.sugerencia]) + '»</button>' : '') +
            '</h3>' + items.map(clausula).join('') + '</div>';
    }).join('');
    // Elegidas en la búsqueda (o en un tema que ya no aparece): siguen a la vista para poder quitarlas
    var otras = Object.keys(elegidas).filter(function (k) { return !vistas[k]; }).map(function (k) {
        return contrato.find(function (c) { return c.k === k; }) || { k: k, sec: 'Contrato', clave: '', t: elegidas[k].t, ref: elegidas[k].ref };
    });
    if (otras.length) html += '<div class="tema"><h3>Elegidas</h3>' + otras.map(clausula).join('') + '</div>';
    caja.innerHTML = html || '<p class="sub">La queja no menciona un tema que el contrato trate de forma directa. Busque abajo la cláusula que necesite.</p>';
}
function pintarBusqueda() {
    var q = plano($('contrato-buscar').value.trim());
    if (!contrato || q.length < 3) { $('contrato-busqueda').innerHTML = ''; return; }
    var hallados = contrato.filter(function (c) { return plano(c.sec + ' ' + c.clave + ' ' + c.t + ' ' + c.ref).indexOf(q) >= 0; });
    $('contrato-busqueda').innerHTML = hallados.length
        ? hallados.slice(0, 10).map(clausula).join('') + (hallados.length > 10 ? '<p class="sub">… y ' + (hallados.length - 10) + ' más: escriba algo más preciso.</p>' : '')
        : '<p class="sub">Nada con «' + esc($('contrato-buscar').value.trim()) + '» en el contrato.</p>';
}
function elegirClausula(k, si) {
    var c = contrato && contrato.find(function (x) { return x.k === k; });
    if (si && c) elegidas[k] = { k: k, t: c.t, ref: c.ref };
    else delete elegidas[k];
    // La misma cláusula puede estar en un tema y en la búsqueda: las dos casillas iguales
    document.querySelectorAll('[data-clausula="' + k + '"]').forEach(function (x) { x.checked = !!elegidas[k]; });
}

// Texto de la queja -> campos (cada vez que cambia el texto; después se pueden corregir a mano)
function leerTexto() {
    var r = leerPqr($('texto').value);
    $('f-id').value = r.id; $('f-fecha').value = r.fecha; $('f-nombre').value = r.nombre;
    $('f-telefono').value = r.telefono; $('f-direccion').value = r.direccion; $('f-barrio').value = r.barrio;
    $('v-cobro').checked = hablaDeCobro(r.queja);
    $('v-barrido').checked = hablaDeBarrido(r.queja);
    actualizar();
}

// ---------- Foto: OCR en español (Tesseract, se descarga la primera vez) ----------
function cargarScript(src) {
    return new Promise(function (ok, mal) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
}
async function leerFoto(file) {
    var aviso = $('ocr');
    aviso.hidden = false;
    aviso.textContent = 'Leyendo la foto… (la primera vez descarga el lector, puede tardar)';
    $('btn-foto').disabled = true;
    var worker = null;
    try {
        if (!window.Tesseract) await cargarScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
        worker = await window.Tesseract.createWorker('spa');
        var r = await worker.recognize(file);
        var texto = r.data.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
        if (!texto) throw new Error('No se encontró texto en la foto.');
        $('texto').value = texto;
        leerTexto();
        aviso.textContent = '✓ Foto leída. Revise los datos: el lector a veces cambia letras o números.';
    } catch (e) {
        aviso.textContent = 'No se pudo leer la foto (' + (e && e.message || e) + '). Copie el texto y péguelo.';
    } finally {
        if (worker) worker.terminate();
        $('btn-foto').disabled = false;
        $('foto').value = '';
    }
}

// ---------- Guardar ----------
function fila(estado) {
    return {
        radicado: $('f-id').value.trim(), fecha_pqr: $('f-fecha').value || null, nombre: $('f-nombre').value.trim(),
        telefono: $('f-telefono').value.trim(), direccion: $('f-direccion').value.trim(), barrio: $('f-barrio').value.trim(),
        queja: $('texto').value.trim(), visita: datos(), respuesta: $('respuesta').value.trim(),
        estado: estado || (actual && actual.estado) || 'abierto', actualizado: new Date().toISOString(),
    };
}
async function guardar(estado) {
    var f = fila(estado);
    if (!f.radicado && !f.direccion && !f.queja) return toast('Escriba o lea la queja antes de guardar.');
    if (estado === 'respondido' && !f.respuesta) return toast('Falta la respuesta final: toque «Usar esta» en una propuesta.');
    ['btn-guardar', 'btn-respondido'].forEach(function (id) { $(id).disabled = true; });
    var res = actual ? await supabase.from('pqrs').update(f).eq('id', actual.id).select().single()
                     : await supabase.from('pqrs').insert(f).select().single();
    ['btn-guardar', 'btn-respondido'].forEach(function (id) { $(id).disabled = false; });
    if (res.error) return toast('No se guardó: ' + res.error.message);
    actual = res.data;
    pqrs = [actual].concat(pqrs.filter(function (p) { return p.id !== actual.id; }));
    try { localStorage.setItem(CACHE, JSON.stringify(pqrs)); } catch (e) {}
    $('btn-eliminar').hidden = false;
    toast(estado === 'respondido' ? '✓ PQR respondido y guardado.' : 'PQR guardado.');
    if (estado === 'respondido') cerrarPqr();
}
async function eliminar() {
    if (!actual || !confirm('¿Eliminar el PQR ' + (actual.radicado || '') + '? No se puede deshacer.')) return;
    var res = await supabase.from('pqrs').delete().eq('id', actual.id);
    if (res.error) return toast('No se eliminó: ' + res.error.message);
    var id = actual.id;
    pqrs = pqrs.filter(function (p) { return p.id !== id; });
    try { localStorage.setItem(CACHE, JSON.stringify(pqrs)); } catch (e) {}
    toast('PQR eliminado.');
    cerrarPqr();
}

// ---------- Inicio ----------
async function arrancar() {
    iniciarEncabezado();
    $('resultados').innerHTML = Object.keys(RESULTADOS).map(function (k) {
        return '<button type="button" role="radio" class="resultado" data-r="' + k + '" aria-checked="false">' + esc(RESULTADOS[k]) + '</button>';
    }).join('');
    $('resultados').onclick = function (ev) { var b = ev.target.closest('[data-r]'); if (b) { marcarResultado(b.dataset.r); actualizar(); } };
    var SIN_ACTUALIZAR = { respuesta: 1, foto: 1, 'contrato-buscar': 1 };
    $('vista-pqr').addEventListener('input', function (ev) { if (ev.target.id === 'texto') leerTexto(); else if (!SIN_ACTUALIZAR[ev.target.id]) actualizar(); });
    $('vista-pqr').addEventListener('change', function (ev) { if (!SIN_ACTUALIZAR[ev.target.id]) actualizar(); });
    // Va antes que el de vista-pqr (está más adentro): la cláusula queda elegida antes de rehacer las respuestas
    $('tarjeta-contrato').addEventListener('change', function (ev) {
        var c = ev.target.closest('[data-clausula]');
        if (c) elegirClausula(c.dataset.clausula, c.checked);
    });
    $('tarjeta-contrato').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-sugerir]');
        if (b) { marcarResultado(b.dataset.sugerir); actualizar(); toast('Marcado: ' + RESULTADOS[b.dataset.sugerir] + '. Revise el texto del área.'); }
    });
    $('contrato-buscar').addEventListener('input', pintarBusqueda);
    $('propuestas').onclick = function (ev) {
        var c = ev.target.closest('[data-copiar]'), u = ev.target.closest('[data-usar]');
        if (c) copiar(propuestas[+c.dataset.copiar].texto);
        if (u) { $('respuesta').value = propuestas[+u.dataset.usar].texto; $('respuesta').focus(); }
    };
    $('btn-copiar').onclick = function () { if ($('respuesta').value.trim()) copiar($('respuesta').value); else toast('La respuesta está vacía.'); };
    $('btn-foto').onclick = function () { $('foto').click(); };
    $('foto').onchange = function () { if (this.files[0]) leerFoto(this.files[0]); };
    $('btn-pegar').onclick = function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) { $('texto').focus(); return toast('Mantenga presionado el cuadro y elija Pegar.'); }
        navigator.clipboard.readText().then(function (t) { $('texto').value = t; leerTexto(); },
            function () { $('texto').focus(); toast('Mantenga presionado el cuadro y elija Pegar.'); });
    };
    $('btn-nuevo').onclick = function () { abrir(null); };
    $('btn-volver').onclick = cerrarPqr;
    $('btn-guardar').onclick = function () { guardar(); };
    $('btn-respondido').onclick = function () { guardar('respondido'); };
    $('btn-eliminar').onclick = eliminar;
    $('buscar').addEventListener('input', pintarLista);
    document.querySelector('.filtros').onclick = function (ev) {
        var b = ev.target.closest('[data-estado]');
        if (!b) return;
        filtro = b.dataset.estado;
        document.querySelectorAll('.filtro').forEach(function (x) { x.classList.toggle('activo', x === b); });
        pintarLista();
    };
    $('lista').onclick = function (ev) {
        var b = ev.target.closest('[data-id]');
        if (b) abrir(pqrs.find(function (p) { return p.id === b.dataset.id; }));
    };
    $('btn-recargar').onclick = cargar;
    if (!configurado) { $('estado').textContent = 'Falta la conexión con Supabase (.env).'; return; }
    var usuario = await asegurarSesion(supabase);
    var salir = $('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    // Al salir se borra la copia del equipo: trae datos personales
    salir.onclick = function () { try { localStorage.removeItem(CACHE); localStorage.removeItem(CACHE_CONTRATO); } catch (e) {} cerrarSesion(supabase); };
    aplicarPermisos(supabase, usuario).then(cargarContrato);
    cargar();
}

arrancar();
