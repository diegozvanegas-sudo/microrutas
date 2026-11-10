// 🔍 Auditar ZIP: la auditoría de zonas verdes del ZIP de fotos de una cuadrilla, desde Subsanaciones.
// El trabajo lo hace el motor del PC (portal de Aplicaciones, http://127.0.0.1:8770, API /api/zonas-verdes) con el plan
// de Claude Code: no se paga la API. Las reglas de la interventoría siguen en el motor; aquí solo se le pide y se muestra.
// Pasos y barra de avance: 1) subir el ZIP (o elegir uno que ya esté en el PC), 2) leer las fotos con Claude,
// 3) armar el reporte por microrruta. Los resultados se copian a Supabase (public.auditorias_zv, 0018) para verlos en el
// celular, donde no hay motor: allí la ventana muestra lo guardado.
import { esc } from './util.js';
import { $, toast } from './ui.js';

var API = '/api/zonas-verdes';
// En el portal (127.0.0.1:8770/microrutas/) el motor está en la misma dirección; publicada, se le habla al PC.
// localStorage 'auditoria_motor' cambia la dirección (pruebas en otro puerto)
function baseMotor() {
    try { var o = localStorage.getItem('auditoria_motor'); if (o) return o.replace(/\/$/, ''); } catch (e) {}
    return location.port === '8770' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? '' : 'http://127.0.0.1:8770';
}

var sb = null, usuario = null, base = '', conectado = false;
var quincenas = [], archivos = { zips: [], informes: [] }, estados = {}, novedades = [], sondeo = null, subida = null;
// motor: opciones por defecto y arranque (GET /motor; null si el motor abierto es de antes). reintento: buscar el motor cada 5 s
var motor = null, reintento = null, consolaAbierta = {}, consolaAbajo = {};

// ---------- Llamadas al motor ----------
async function pedir(ruta, opciones, espera) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, espera || 120000);
    try {
        var res = await fetch(base + API + ruta, Object.assign({ signal: ctl.signal }, opciones || {}));
        var datos = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(datos.detail || ('El motor respondió ' + res.status));
        return datos;
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('El motor no respondió a tiempo.');
        throw e;
    } finally { clearTimeout(t); }
}
function json(metodo, datos) { return { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos || {}) }; }

// Nombre del archivo de una ruta de Windows
function nombre(ruta) { return String(ruta || '').split(/[\\/]/).pop(); }
function tamano(b) { return b >= 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB'; }
function miles(n) { return Number(n || 0).toLocaleString('es-CO'); }

// ---------- Barra de avance ----------
// pct: 0 a 100, o null cuando aún no se sabe cuánto falta (barra en movimiento)
function barra(paso, texto, pct, tipo) {
    $('aud-avance').hidden = false;
    $('aud-paso').textContent = paso ? 'Paso ' + paso + ' de 3' : '';
    $('aud-avance-texto').textContent = texto;
    var b = $('aud-barra');
    b.classList.toggle('indefinida', pct == null);
    b.classList.toggle('error', tipo === 'error');
    b.classList.toggle('listo', tipo === 'listo');
    b.querySelector('span').style.width = (pct == null ? 35 : Math.max(0, Math.min(100, pct))) + '%';
    b.setAttribute('aria-valuenow', pct == null ? '' : Math.round(pct));
    $('aud-pct').textContent = pct == null || tipo === 'error' ? '' : Math.floor(pct) + ' %';
}

// ---------- Conexión ----------
async function conectar() {
    base = baseMotor();
    $('aud-motor').className = 'aud-motor';
    $('aud-motor').textContent = 'Buscando el motor de auditoría en este PC…';
    clearTimeout(reintento);
    try {
        archivos = await pedir('/archivos', null, 4000);
        conectado = true;
        motor = await pedir('/motor', null, 4000).catch(function () { return null; });
        $('aud-motor').classList.add('ok');
        pintarMotor();
    } catch (e) {
        conectado = false; motor = null;
        $('aud-motor').classList.add('sin');
        $('aud-motor').innerHTML = '<b>No se encontró el motor de auditoría en este PC.</b>' +
            '<ol class="aud-pasos"><li>Haga doble clic en <b>«Motor de auditoría»</b> en el escritorio (es <b>Motor_auditoria.bat</b>, en la carpeta ' +
            '<b>Documents del PC</b>, no la de OneDrive › Envarias › Revisar IA reporte › Aplicaciones). Se abre una ventana negra: <b>déjela abierta</b> mientras audita; al cerrarla, el motor se apaga.</li>' +
            '<li>Si Chrome pregunta si la página puede acceder a la red local o a este equipo, toque <b>Permitir</b>.</li>' +
            '<li>Si prefiere que arranque solo al prender el PC (sin ventana), ya conectado marque <b>«Arrancar solo al prender el PC»</b>.</li></ol>' +
            '<span class="aud-buscando">Se vuelve a buscar cada 5 segundos…</span> <button type="button" class="secundario pequeno" id="aud-reintentar">↻ Reintentar ya</button>' +
            '<div class="sub">Desde el celular no hay motor: allí se ven los resultados ya guardados.</div>';
        $('aud-reintentar').onclick = abrir;
        // Mientras la ventana siga abierta, se busca solo: apenas se abra el .bat, se conecta
        reintento = setTimeout(function () { if ($('dlg-auditoria').open && !conectado) abrir(); }, 5000);
    }
    $('aud-trabajo').hidden = !conectado;
    pintarOpciones();
}
// Franja verde del motor conectado: arranque con Windows y apagar
function pintarMotor() {
    var a = motor && motor.arranque;
    $('aud-motor').innerHTML = '<div>✓ <b>Motor de auditoría conectado.</b> Lee las fotos con el plan de Claude Code: no se paga la API.' +
        ' <a href="' + esc((base || '') + '/zonas-verdes') + '" target="_blank" rel="noopener">Revisar a fondo en el portal ↗</a></div>' +
        (!motor ? '<div class="sub">⚠ Este motor es de antes: ciérrelo y vuelva a abrir <b>«Motor de auditoría»</b> del escritorio para tener el arranque automático, la consola y todas las opciones.</div>'
            : '<div class="aud-motor-fila">' +
            (a && a.disponible ? '<label class="aud-check aud-arranque"><input type="checkbox" id="aud-arranque"' + (a.activo ? ' checked' : '') + '> Arrancar solo al prender el PC <span class="sub">(' + (a.activo ? 'queda encendido sin ventana: se apaga con «⏻ Apagar el motor»' : 'si no, se prende con «Motor de auditoría» del escritorio y se apaga al cerrar su ventana') + ')</span></label>' : '') +
            '<button type="button" class="secundario pequeno" id="aud-apagar" title="Apagar el motor en este PC (no se pierde nada; se vuelve a abrir con el .bat o al prender el PC)">⏻ Apagar el motor</button></div>');
}
async function cambiarArranque(activo) {
    var c = $('aud-arranque'); c.disabled = true;
    try {
        motor.arranque = await pedir('/motor/arranque', json('PUT', { activo: activo }), 10000);
        toast(activo ? '✓ Listo: el motor arranca solo cada vez que prenda el PC (sin ventana).' : 'Ya no arranca solo: ábralo con «Motor de auditoría» del escritorio cuando lo necesite.');
    } catch (e) { toast('No se cambió el arranque: ' + e.message); }
    pintarMotor();
}
async function apagarMotor() {
    if (!confirm('¿Apagar el motor de auditoría en este PC?\nNo se pierde nada. Para volver a usarlo, abra «Motor de auditoría» del escritorio' + (motor && motor.arranque && motor.arranque.activo ? ' o reinicie el PC.' : '.'))) return;
    try {
        await pedir('/motor/apagar', json('POST', { confirmar: true }), 10000);
        toast('Motor apagado.');
        setTimeout(abrir, 1500);
    } catch (e) { toast(e.message); }
}

// ---------- Opciones del motor (se recuerdan en el equipo; la cuadrilla no, es de cada ZIP) ----------
var OPCIONES = 'auditoria_opciones';
function opcionesGuardadas() { try { return JSON.parse(localStorage.getItem(OPCIONES)) || {}; } catch (e) { return {}; } }
function pintarOpciones() {
    var m = motor || { modelos: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], modelo_lectura: 'claude-haiku-5-5', modelo_metro: 'claude-sonnet-5-5', paralelo: 6, lote: 8 };
    var g = opcionesGuardadas();
    var lista = function (actual, defecto) {
        var ms = m.modelos.indexOf(actual) === -1 && actual ? m.modelos.concat([actual]) : m.modelos;
        return ms.map(function (x) { return '<option value="' + esc(x) + '"' + (x === (actual || defecto) ? ' selected' : '') + '>' + esc(x.replace(/^claude-/, '')) + (x === defecto ? ' ★' : '') + '</option>'; }).join('');
    };
    $('aud-op-modelo').innerHTML = lista(g.modelo, m.modelo_lectura);
    $('aud-op-metro').innerHTML = lista(g.modelo_metro, m.modelo_metro);
    $('aud-op-prueba').value = g.prueba || 20;
    $('aud-op-paralelo').value = g.paralelo || m.paralelo;
    $('aud-op-lote').value = g.lote || m.lote;
    $('aud-op-maximo').value = g.maximo || '';
    $('aud-op-enderezar').checked = !!g.sin_enderezar;
    $('aud-op-viejo').hidden = !conectado || !!motor;
    resumenOpciones();
}
function leerOpciones() {
    var n = function (id) { var v = parseInt($(id).value, 10); return isNaN(v) ? null : v; };
    return { prueba: n('aud-op-prueba') || 20, modelo: $('aud-op-modelo').value, paralelo: n('aud-op-paralelo'), lote: n('aud-op-lote'),
        cuadrilla: n('aud-op-cuadrilla'), sin_enderezar: $('aud-op-enderezar').checked, modelo_metro: $('aud-op-metro').value, maximo: n('aud-op-maximo') };
}
function guardarOpciones() {
    var o = leerOpciones(), m = motor || {};
    var g = { prueba: o.prueba !== 20 ? o.prueba : null, modelo: o.modelo !== m.modelo_lectura ? o.modelo : null, paralelo: o.paralelo !== m.paralelo ? o.paralelo : null,
        lote: o.lote !== m.lote ? o.lote : null, sin_enderezar: o.sin_enderezar || null, modelo_metro: o.modelo_metro !== m.modelo_metro ? o.modelo_metro : null, maximo: o.maximo };
    Object.keys(g).forEach(function (k) { if (g[k] == null) delete g[k]; });
    try { localStorage.setItem(OPCIONES, JSON.stringify(g)); } catch (e) {}
    resumenOpciones();
    pintarQuincena();
}
// Lo que está distinto de lo de siempre, al lado del título (para no olvidarlo)
function resumenOpciones() {
    var o = leerOpciones(), m = motor || {}, d = [];
    if (o.modelo && m.modelo_lectura && o.modelo !== m.modelo_lectura) d.push(o.modelo.replace(/^claude-/, ''));
    if (o.paralelo && m.paralelo && o.paralelo !== m.paralelo) d.push(o.paralelo + ' al tiempo');
    if (o.lote && m.lote && o.lote !== m.lote) d.push(o.lote + ' por lote');
    if (o.cuadrilla) d.push('cuadrilla ' + o.cuadrilla);
    if (o.sin_enderezar) d.push('sin enderezar');
    $('aud-op-resumen').textContent = d.length ? '· ' + d.join(' · ') : '· las de siempre';
}
// Lo que se le manda al motor según el botón
function opcionesPara(tipo, prueba) {
    var o = leerOpciones(), r = { tipo: tipo, modelo: o.modelo, paralelo: o.paralelo, lote: o.lote, cuadrilla: o.cuadrilla, sin_enderezar: o.sin_enderezar };
    if (tipo === 'lectura' && prueba) r.prueba = o.prueba;
    if (tipo === 'metro') { r.modelo_metro = o.modelo_metro; r.maximo = o.maximo; }
    return r;
}

// ---------- 1. Quincena ----------
async function cargarQuincenas(elegir) {
    quincenas = await pedir('/quincenas');
    var sel = $('aud-quincena'), antes = elegir != null ? String(elegir) : sel.value;
    sel.innerHTML = quincenas.length ? quincenas.map(function (q) {
        return '<option value="' + q.id + '">' + esc(q.nombre) + ' · ' + q.fuentes.length + (q.fuentes.length === 1 ? ' ZIP' : ' ZIP') + '</option>';
    }).join('') : '<option value="">Aún no hay quincenas: cree una</option>';
    if (antes && quincenas.some(function (q) { return String(q.id) === antes; })) sel.value = antes;
    else {
        try { var g = localStorage.getItem('auditoria_quincena'); if (g && quincenas.some(function (q) { return String(q.id) === g; })) sel.value = g; } catch (e) {}
    }
    $('aud-nueva').hidden = !!quincenas.length && $('aud-nueva').hidden;
    pintarQuincena();
}
function quincena() { var id = +$('aud-quincena').value; return quincenas.find(function (q) { return q.id === id; }) || null; }

function pintarInformes() {
    $('aud-informe').innerHTML = archivos.informes.length ? archivos.informes.map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(nombre(r)) + '</option>';
    }).join('') : '<option value="">No hay informes: súbalo</option>';
}
async function crearQuincena() {
    var nom = $('aud-nombre').value.trim(), inf = $('aud-informe').value;
    if (!inf) return toast('Primero suba el informe de lotes ejecutados de la quincena (.xlsx).');
    var b = $('aud-crear'); b.disabled = true;
    try {
        var q = await pedir('/quincenas', json('POST', { nombre: nom, informe: inf }));
        $('aud-nueva').hidden = true; $('aud-nombre').value = '';
        await cargarQuincenas(q.id);
        toast('✓ Quincena creada. Ahora suba o elija el ZIP de fotos.');
    } catch (e) { toast('No se creó la quincena: ' + e.message); }
    b.disabled = false;
}

// ---------- 2. ZIP de fotos ----------
var ESTADO = { SIN_INICIAR: 'Sin leer', CORRIENDO: 'Leyendo…', TERMINADA: '✓ Leído', DETENIDA: '⏸ Detenido', LIMITE: '⏳ Límite del plan', ERROR: '⚠ Error' };
function pintarQuincena() {
    var q = quincena();
    try { if (q) localStorage.setItem('auditoria_quincena', q.id); } catch (e) {}
    $('aud-paso-zip').hidden = !q;
    $('aud-paso-res').hidden = !q;
    if (!q) return;
    var usados = q.fuentes.map(function (f) { return f.ruta.toLowerCase(); });
    var libres = archivos.zips.filter(function (z) { return usados.indexOf(z.toLowerCase()) === -1; });
    $('aud-zip-lista').innerHTML = libres.length ? libres.map(function (z) { return '<option value="' + esc(z) + '">' + esc(nombre(z)) + '</option>'; }).join('')
        : '<option value="">Ningún otro ZIP en la carpeta de fotos</option>';
    $('aud-agregar').disabled = !libres.length;
    $('aud-fuentes').innerHTML = q.fuentes.length ? q.fuentes.map(function (f) {
        var e = estados[f.id] || {}, corriendo = e.estado === 'CORRIENDO';
        // «Ver avance» solo cuenta (no lee): no se muestra como leído ni con su barra
        var cuenta = e.tipo === 'avance' && !corriendo;
        var etiqueta = cuenta && e.estado === 'TERMINADA' ? '📊 Avance listo' : e.tipo === 'metro' && e.estado === 'TERMINADA' ? '✓ Metro leído' : (ESTADO[e.estado] || 'Sin leer');
        var pct = e.total ? e.actual / e.total * 100 : null;
        return '<div class="aud-fuente" data-fuente="' + f.id + '">' +
            '<div class="cab"><b>📦 ' + esc(f.nombre) + '</b><span class="aud-estado ' + esc((e.estado || 'SIN_INICIAR').toLowerCase()) + '">' + etiqueta + '</span></div>' +
            (!cuenta && (corriendo || e.total) ? '<div class="aud-mini" role="progressbar" aria-valuemin="0" aria-valuemax="100"' + (pct == null ? '' : ' aria-valuenow="' + Math.round(pct) + '"') + '>' +
                '<span style="width:' + (pct == null ? 35 : pct) + '%" class="' + (pct == null ? 'mueve' : '') + '"></span></div>' : '') +
            '<div class="sub">' + esc(cuenta ? 'Se contó lo que va sin llamar a Claude: el resumen está en la consola.' : e.total ? miles(e.actual) + ' de ' + miles(e.total) + ' fotos' + (e.mensaje && !/fotos$/.test(e.mensaje) ? ' · ' + e.mensaje : '') : (e.mensaje || 'Toque «Probar con ' + leerOpciones().prueba + ' fotos» antes de leerlo completo.')) + '</div>' +
            (e.estado === 'LIMITE' ? '<div class="sub aviso-limite">Se acabó el límite del plan de Claude. Vuelva a tocar «Leer todas» más tarde: sigue donde iba sin volver a pagar las fotos hechas.</div>' : '') +
            (!cuenta && e.total && (corriendo || e.fin) ? '<div class="sub aud-tiempos">' + esc(tiempos(e)) + '</div>' : '') +
            '<div class="acciones">' + (corriendo
                ? '<button type="button" class="peligro-suave pequeno" data-detener>⏸ Detener</button>'
                : '<button type="button" class="secundario pequeno" data-correr="prueba">🧪 Probar con ' + miles(leerOpciones().prueba) + ' fotos</button>' +
                  '<button type="button" class="primario pequeno" data-correr="lectura">▶ ' + (e.estado === 'DETENIDA' || e.estado === 'LIMITE' ? 'Seguir leyendo' : 'Leer todas') + '</button>' +
                  '<button type="button" class="secundario pequeno" data-correr="metro" title="Volver a leer solo las fotos del metro con el modelo de «Opciones del motor»">📏 Segunda pasada del metro</button>' +
                  '<button type="button" class="secundario pequeno" data-correr="avance" title="Cuántas fotos van y un Excel parcial con las carpetas completas, sin llamar a Claude">📊 Ver avance (sin leer)</button>') +
            '</div>' + consola(f.id, e) + '</div>';
    }).join('') : '<p class="sub">Esta quincena aún no tiene ZIP. Súbalo o elíjalo arriba.</p>';
    // La consola sigue abajo (lo último) salvo que se haya subido a leer algo
    $('aud-fuentes').querySelectorAll('[data-consola] pre').forEach(function (pre) {
        var fid = pre.closest('[data-consola]').dataset.consola;
        if (consolaAbajo[fid] !== false) pre.scrollTop = pre.scrollHeight; else if (consolaAbajo['y' + fid] != null) pre.scrollTop = consolaAbajo['y' + fid];
    });
}
// Tiempo que lleva, fotos por minuto y cuánto falta (aproximado: las fotos de la caché pasan rápido)
export function tiempos(e, ahora) {
    var ini = Date.parse(e.inicio), fin = e.fin ? Date.parse(e.fin) : (ahora || Date.now());
    if (isNaN(ini)) return '';
    var seg = Math.max(0, (fin - ini) / 1000), t = [];
    var dur = function (s) { s = Math.round(s); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + Math.round(s % 3600 / 60) + ' min'; };
    t.push((e.fin ? 'Duró ' : 'Lleva ') + dur(seg));
    if (e.actual > 0 && seg >= 20) {
        var porMin = e.actual / seg * 60;
        t.push(porMin >= 10 ? Math.round(porMin) + ' fotos/min' : porMin.toFixed(1).replace('.', ',') + ' fotos/min');
        if (!e.fin && e.total > e.actual) t.push('faltan ~' + dur((e.total - e.actual) / porMin * 60));
    }
    return '⏱ ' + t.join(' · ');
}
// Consola del motor: lo mismo que se ve en la ventana negra (las últimas 300 líneas), con el comando que se corrió
function consola(fid, e) {
    var l = e.lineas || [];
    if (!l.length && !e.comando) return '';
    // Abierta mientras corre, si falló y al terminar el avance o el metro (su resumen es lo que importa)
    var abierta = consolaAbierta[fid] != null ? consolaAbierta[fid] : e.estado === 'CORRIENDO' || e.estado === 'ERROR' || (e.tipo !== 'lectura' && !!e.fin);
    var parcial = l.map(function (x) { var m = /Excel parcial:\s+(.+\.xlsx)\s*$/i.exec(x); return m && m[1]; }).filter(Boolean).pop();
    return '<details class="aud-consola" data-consola="' + fid + '"' + (abierta ? ' open' : '') + '><summary>🖥️ Consola del motor <span class="sub">· ' +
        (e.tipo === 'metro' ? 'segunda pasada del metro' : e.tipo === 'avance' ? 'avance sin leer' : e.opciones && e.opciones.prueba ? 'prueba de ' + e.opciones.prueba + ' fotos' : 'lectura') +
        (e.inicio ? ' · ' + esc(e.inicio.slice(11, 16)) : '') + '</span></summary>' +
        (e.comando ? '<div class="aud-cmd">&gt; ' + esc(e.comando) + '</div>' : '') +
        '<pre>' + esc(l.join('\n') || 'Esperando lo primero que diga el motor…') + '</pre>' +
        '<div class="acciones"><button type="button" class="secundario pequeno" data-copiar-consola>📋 Copiar la consola</button>' +
        (parcial ? '<a class="boton secundario pequeno" href="' + esc(base + API + '/descargar?ruta=' + encodeURIComponent(parcial)) + '" download>⬇ Excel parcial</a>' : '') +
        '</div></details>';
}
async function agregarFuente(ruta) {
    var q = quincena();
    if (!q || !ruta) return;
    var f = await pedir('/quincenas/' + q.id + '/fuentes', json('POST', { ruta: ruta }));
    await cargarQuincenas(q.id);
    return f;
}
// Sube un archivo al PC por partes con su barra. tipo: 'zip' o 'informe'. -> { ruta, nombre, ya_estaba }
function subir(tipo, archivo) {
    return new Promise(function (listo, falla) {
        var x = new XMLHttpRequest();
        subida = x;
        x.open('PUT', base + API + '/subir/' + tipo + '?nombre=' + encodeURIComponent(archivo.name));
        x.setRequestHeader('Content-Type', 'application/octet-stream');
        x.setRequestHeader('x-tamano', String(archivo.size));
        var inicio = Date.now();
        x.upload.onprogress = function (ev) {
            if (!ev.lengthComputable) return;
            var seg = (Date.now() - inicio) / 1000, vel = ev.loaded / Math.max(seg, 0.5), falta = (ev.total - ev.loaded) / Math.max(vel, 1);
            barra(1, 'Subiendo ' + archivo.name + ' · ' + tamano(ev.loaded) + ' de ' + tamano(ev.total) +
                (seg > 3 && falta > 5 ? ' · faltan ' + (falta > 90 ? Math.round(falta / 60) + ' min' : Math.round(falta) + ' s') : ''), ev.loaded / ev.total * 100);
        };
        x.upload.onload = function () { barra(1, 'Guardando ' + archivo.name + ' en el PC…', null); };
        x.onload = function () {
            subida = null;
            var d = {}; try { d = JSON.parse(x.responseText); } catch (e) {}
            if (x.status >= 200 && x.status < 300) listo(d); else falla(new Error(d.detail || 'El motor respondió ' + x.status));
        };
        x.onerror = function () { subida = null; falla(new Error('Se perdió la conexión con el motor.')); };
        x.onabort = function () { subida = null; falla(new Error('Subida cancelada.')); };
        x.send(archivo);
    });
}
async function subirZip(archivo) {
    if (!/\.zip$/i.test(archivo.name)) return toast('Elija el archivo .zip de las fotos.');
    $('aud-cancelar').hidden = false;
    try {
        var r = await subir('zip', archivo);
        barra(1, r.ya_estaba ? archivo.name + ' ya estaba en el PC: se usa ese.' : '✓ ' + archivo.name + ' quedó en el PC.', 100, 'listo');
        if (!quincena().fuentes.some(function (f) { return f.ruta.toLowerCase() === r.ruta.toLowerCase(); })) await agregarFuente(r.ruta);
        archivos = await pedir('/archivos');
        pintarQuincena();
        toast('✓ ZIP listo. Toque «Probar con 20 fotos» para revisar que todo va bien.');
    } catch (e) {
        barra(1, 'No se subió: ' + e.message, 0, 'error');
    } finally { $('aud-cancelar').hidden = true; }
}
async function subirInforme(archivo) {
    if (!/\.xlsx$/i.test(archivo.name)) return toast('El informe debe ser .xlsx.');
    try {
        var r = await subir('informe', archivo);
        barra(0, '✓ Informe ' + archivo.name + ' en el PC.', 100, 'listo');
        archivos = await pedir('/archivos');
        pintarInformes();
        $('aud-informe').value = r.ruta;
    } catch (e) { barra(0, 'No se subió el informe: ' + e.message, 0, 'error'); }
}

// ---------- Lectura con Claude y su avance ----------
// que: prueba | lectura | metro | avance (botones de cada ZIP), con las opciones del motor
async function correr(fid, que) {
    var o = opcionesPara(que === 'prueba' ? 'lectura' : que, que === 'prueba');
    estados[fid] = await pedir('/fuentes/' + fid + '/revision', json('POST', o));
    consolaAbierta[fid] = true; consolaAbajo[fid] = true;
    toast({ prueba: 'Leyendo ' + o.prueba + ' fotos de prueba…', lectura: 'Leyendo todas las fotos. Puede cerrar esta página: el motor sigue. Si cierra la ventana negra del motor, la lectura se detiene (luego sigue donde iba).',
        metro: 'Segunda pasada del metro con ' + o.modelo_metro + '…', avance: 'Contando lo que va, sin llamar a Claude…' }[que]);
    pintarQuincena();
    seguir();
}
async function detener(fid) {
    estados[fid] = await pedir('/fuentes/' + fid + '/revision', { method: 'DELETE' });
    pintarQuincena();
}
// Estado de cada ZIP de la quincena; mientras alguno lee, se pregunta cada 2 s
async function seguir() {
    clearTimeout(sondeo);
    var q = quincena();
    if (!q || !$('dlg-auditoria').open || !conectado) return;
    var antes = Object.assign({}, estados), corriendo = null;
    try {
        await Promise.all(q.fuentes.map(async function (f) { estados[f.id] = await pedir('/fuentes/' + f.id + '/revision', null, 10000); }));
    } catch (e) { return; }
    q.fuentes.forEach(function (f) { if (estados[f.id].estado === 'CORRIENDO') corriendo = f; });
    pintarQuincena();
    if (corriendo) {
        var e = estados[corriendo.id];
        var t = e.total ? tiempos(e).replace(/^⏱ /, ' · ') : '';
        barra(2, (e.tipo === 'avance' ? 'Contando lo que va de ' : e.tipo === 'metro' ? 'Segunda pasada del metro de ' : 'Leyendo las fotos de ') + corriendo.nombre +
            (e.tipo === 'avance' ? ' (sin Claude) · ' : ' con Claude · ') + (e.total ? miles(e.actual) + ' de ' + miles(e.total) + t : (e.mensaje || 'preparando las fotos…')),
            e.total ? e.actual / e.total * 100 : null);
        sondeo = setTimeout(seguir, 2000);
        return;
    }
    // Uno acaba de terminar: el reporte se arma solo
    var termino = q.fuentes.find(function (f) { return antes[f.id] && antes[f.id].estado === 'CORRIENDO' && estados[f.id].estado === 'TERMINADA' && estados[f.id].tipo !== 'avance'; });
    var conto = q.fuentes.find(function (f) { return antes[f.id] && antes[f.id].estado === 'CORRIENDO' && estados[f.id].estado === 'TERMINADA' && estados[f.id].tipo === 'avance'; });
    if (conto) barra(2, '✓ Avance de ' + conto.nombre + ' listo: mire el resumen en la consola del motor.', 100, 'listo');
    if (termino) cargarNovedades(true);
    var malo = q.fuentes.find(function (f) { return antes[f.id] && antes[f.id].estado === 'CORRIENDO' && /ERROR|LIMITE/.test(estados[f.id].estado); });
    if (malo) barra(2, estados[malo.id].estado === 'LIMITE' ? 'Se acabó el límite del plan de Claude en ' + malo.nombre + '. Siga más tarde: no se vuelven a pagar las fotos hechas.'
        : 'El motor se detuvo con un error en ' + malo.nombre + '. Mire la consola del motor (debajo del ZIP).', 0, 'error');
}

// ---------- 3. Resultados por microrruta ----------
async function cargarNovedades(guardar) {
    var q = quincena();
    if (!q) return;
    barra(3, 'Armando el reporte por microrruta con las reglas de la interventoría… (con un ZIP grande tarda un par de minutos)', null);
    $('aud-res-acciones').hidden = true;
    try {
        novedades = await pedir('/quincenas/' + q.id + '/novedades', null, 600000);
    } catch (e) {
        barra(3, 'No se armó el reporte: ' + e.message, 0, 'error');
        return;
    }
    var con = novedades.filter(function (n) { return n.con_novedad; }).length;
    if (!novedades.length) {
        barra(3, q.fuentes.length ? 'El reporte salió vacío: lea las fotos primero o revise que el ZIP siga en la ruta guardada (' + q.fuentes.map(function (f) { return f.ruta; }).join(', ') + ').'
            : 'Agregue un ZIP a la quincena.', 0, 'error');
    } else barra(3, '✓ Reporte listo: ' + miles(novedades.length) + ' microrrutas, ' + miles(con) + ' con novedad.', 100, 'listo');
    $('aud-res-acciones').hidden = !novedades.length;
    pintarResultados(novedades, q.nombre);
    if (guardar && novedades.length) guardarEnLaNube(q.nombre, novedades);
}
// Tabla de microrrutas (las del motor traen microruta; las guardadas en Supabase, microrruta)
function tablaHtml(lista, solo) {
    var vis = lista.filter(function (n) { return !solo || n.con_novedad; });
    var html = !lista.length ? '' : !vis.length ? '<p class="sub">Ninguna microrruta con novedad.</p>' :
        '<table class="aud-tabla"><thead><tr><th>Microrruta</th><th>Lote</th><th>Cuadrilla</th><th>Novedad</th><th>AC</th><th>Revisor</th></tr></thead><tbody>' +
        vis.map(function (n) {
            var nov = n.decision === 'CORREGIDA' ? n.novedad_final : n.decision === 'DESCARTADA' ? 'SN (descartada por el revisor)' : n.novedad;
            return '<tr class="' + (n.con_novedad ? 'con' : '') + (n.ac === 'NO VERIFICABLE' ? ' por-confirmar' : '') + '">' +
                '<td><b>' + esc(n.microruta || n.microrruta) + '</b><div class="sub">' + esc(n.fuente || '') + '</div></td><td>' + esc(n.lote) + '</td><td>' + esc(n.cuadrilla || '') + '</td>' +
                '<td class="nov">' + esc(String(nov || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean).join(' · ')) + '</td>' +
                '<td>' + esc(n.ac) + '</td><td>' + esc(n.decision ? n.decision.toLowerCase() : n.con_novedad ? 'sin revisar' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    return { html: html, cuenta: lista.length ? miles(vis.length) + ' de ' + miles(lista.length) + ' microrrutas' : '' };
}
function pintarResultados(lista, titulo) {
    var t = tablaHtml(lista, $('aud-solo').checked);
    $('aud-res-titulo').textContent = titulo ? '· ' + titulo : '';
    $('aud-tabla').innerHTML = t.html;
    $('aud-res-cuenta').textContent = t.cuenta;
}
async function exportar() {
    var q = quincena(), b = $('aud-exportar');
    if (!q) return;
    b.disabled = true; b.textContent = 'Exportando…';
    try {
        var r = await pedir('/quincenas/' + q.id + '/exportar', { method: 'POST' }, 600000);
        $('aud-archivos').innerHTML = '<b>Excel listos</b> (' + r.novedades + ' novedades' + (r.pendientes ? ', ' + r.pendientes + ' por confirmar en amarillo' : '') + '):' +
            r.archivos.map(function (a) { return '<a class="boton secundario pequeno" href="' + esc(base + API + '/descargar?ruta=' + encodeURIComponent(a)) + '" download>⬇ ' + esc(nombre(a)) + '</a>'; }).join('') +
            '<div class="sub">También quedaron en el PC: ' + esc(r.carpeta) + '</div>';
    } catch (e) { toast('No se exportó: ' + e.message); }
    b.disabled = false; b.textContent = '📗 Exportar Excel';
}

// ---------- Copia en Supabase (para el celular) ----------
async function guardarEnLaNube(nomQuincena, lista) {
    if (!sb || !usuario) return;
    var ahora = new Date().toISOString();
    var filas = lista.map(function (n) {
        return { usuario: usuario.id, quincena: nomQuincena, fuente: n.fuente || '', microrruta: n.microruta || '', lote: String(n.lote == null ? '' : n.lote),
            cuadrilla: String(n.cuadrilla == null ? '' : n.cuadrilla), novedad: n.novedad || '', ac: n.ac || '', observacion: n.observacion || '',
            con_novedad: !!n.con_novedad, decision: n.decision || null, novedad_final: n.novedad_final || '', comentario: n.comentario || '', actualizado: ahora };
    });
    for (var i = 0; i < filas.length; i += 500) {
        var res = await sb.from('auditorias_zv').upsert(filas.slice(i, i + 500), { onConflict: 'usuario,quincena,fuente,microrruta' });
        if (res.error) {
            $('aud-nube').textContent = /auditorias_zv/.test(res.error.message) ? '⚠ Falta crear la tabla en Supabase (migración 0018): los resultados no se ven aún en el celular.'
                : '⚠ No se guardó la copia para el celular: ' + res.error.message;
            return;
        }
    }
    $('aud-nube').textContent = '☁ Copia guardada: se ve también desde el celular.';
}
// Lo guardado (celular o sin motor): una quincena a la vez
var guardadas = [];
async function cargarGuardadas() {
    $('aud-guardadas').hidden = false;
    $('aud-g-tabla').innerHTML = '<p class="sub">Cargando…</p>';
    var res = await sb.from('auditorias_zv').select('*').order('quincena').order('microrruta');
    if (res.error) {
        $('aud-g-tabla').innerHTML = '<p class="sub">' + esc(/auditorias_zv/.test(res.error.message) ? 'Aún no hay resultados guardados (falta la tabla en Supabase, migración 0018).' : 'Sin conexión: ' + res.error.message) + '</p>';
        return;
    }
    guardadas = res.data;
    var nombres = Array.from(new Set(guardadas.map(function (g) { return g.quincena; })));
    $('aud-g-quincena').innerHTML = nombres.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    $('aud-g-quincena').hidden = !nombres.length;
    pintarGuardadas();
}
function pintarGuardadas() {
    if (!guardadas.length) { $('aud-g-tabla').innerHTML = '<p class="sub">Aún no hay auditorías guardadas. Se guardan al terminar una en el PC.</p>'; $('aud-g-cuenta').textContent = ''; return; }
    var q = $('aud-g-quincena').value, lista = guardadas.filter(function (g) { return g.quincena === q; });
    var t = tablaHtml(lista, $('aud-g-solo').checked);
    $('aud-g-tabla').innerHTML = t.html;
    $('aud-g-cuenta').textContent = t.cuenta + (lista[0] ? ' · guardado el ' + new Date(lista[0].actualizado).toLocaleString('es-CO') : '');
}

// ---------- Ventana ----------
async function abrir() {
    if (!$('dlg-auditoria').open) $('dlg-auditoria').showModal();
    $('aud-guardadas').hidden = true;
    await conectar();
    if (!conectado) { if (sb) cargarGuardadas(); return; }
    try {
        pintarInformes();
        await cargarQuincenas();
        await seguir();
    } catch (e) { toast('No se pudo leer el motor: ' + e.message); }
}

export function iniciarAuditoria(cliente, usuarioSesion) {
    sb = cliente; usuario = usuarioSesion;
    // Se abre desde el menú Zonas verdes (#auditar); el botón es opcional
    if ($('btn-auditoria')) $('btn-auditoria').onclick = abrir;
    $('aud-cerrar').onclick = function () { $('dlg-auditoria').close(); };
    // Al cerrar: se para de preguntar y se olvida lo de esta vez (consolas abiertas, cuadrilla); las opciones quedan
    $('dlg-auditoria').addEventListener('close', function () {
        clearTimeout(sondeo); clearTimeout(reintento);
        consolaAbierta = {}; consolaAbajo = {};
        $('aud-op-cuadrilla').value = '';
        $('aud-opciones').open = false;
    });
    $('aud-motor').addEventListener('change', function (ev) { if (ev.target.id === 'aud-arranque') cambiarArranque(ev.target.checked); });
    $('aud-motor').addEventListener('click', function (ev) { if (ev.target.closest('#aud-apagar')) apagarMotor(); });
    $('aud-opciones').addEventListener('change', guardarOpciones);
    $('aud-op-restablecer').onclick = function () {
        try { localStorage.removeItem(OPCIONES); } catch (e) {}
        $('aud-op-cuadrilla').value = '';
        pintarOpciones(); pintarQuincena();
        toast('Opciones como siempre.');
    };
    // Consola: recordar si se abrió o cerró y si se subió a leer (para no bajarla de golpe cada 2 s)
    $('aud-fuentes').addEventListener('toggle', function (ev) {
        var d = ev.target.closest && ev.target.closest('[data-consola]');
        if (d) consolaAbierta[d.dataset.consola] = d.open;
    }, true);
    $('aud-fuentes').addEventListener('scroll', function (ev) {
        var pre = ev.target, d = pre.closest && pre.closest('[data-consola]');
        if (!d || pre.tagName !== 'PRE') return;
        consolaAbajo[d.dataset.consola] = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24;
        consolaAbajo['y' + d.dataset.consola] = pre.scrollTop;
    }, true);
    $('aud-quincena').onchange = function () { novedades = []; pintarResultados([], ''); $('aud-res-acciones').hidden = true; $('aud-avance').hidden = true; pintarQuincena(); seguir(); };
    $('aud-btn-nueva').onclick = function () { $('aud-nueva').hidden = !$('aud-nueva').hidden; pintarInformes(); };
    $('aud-crear').onclick = crearQuincena;
    $('aud-subir-informe').onchange = function () { if (this.files[0]) subirInforme(this.files[0]); this.value = ''; };
    $('aud-subir-zip').onchange = function () { if (this.files[0]) subirZip(this.files[0]); this.value = ''; };
    $('aud-cancelar').onclick = function () { if (subida) subida.abort(); };
    $('aud-agregar').onclick = function () {
        agregarFuente($('aud-zip-lista').value).then(function () { toast('✓ ZIP agregado a la quincena.'); }, function (e) { toast('No se agregó: ' + e.message); });
    };
    $('aud-fuentes').onclick = function (ev) {
        var caja = ev.target.closest('[data-fuente]'), fid = caja && +caja.dataset.fuente;
        if (!fid) return;
        var l = ev.target.closest('[data-correr]');
        if (l) { l.disabled = true; correr(fid, l.dataset.correr).catch(function (e) { toast('No arrancó: ' + e.message); l.disabled = false; }); }
        if (ev.target.closest('[data-copiar-consola]')) {
            var e2 = estados[fid] || {}, texto = (e2.comando ? '> ' + e2.comando + '\n' : '') + (e2.lineas || []).join('\n');
            (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () { toast('Consola copiada.'); },
                function () { toast('No se pudo copiar: seleccione el texto de la consola y cópielo.'); });
        }
        if (ev.target.closest('[data-detener]')) detener(fid).catch(function (e) { toast(e.message); });
    };
    $('aud-ver').onclick = function () { cargarNovedades(true); };
    $('aud-solo').onchange = function () { pintarResultados(novedades, quincena() ? quincena().nombre : ''); };
    $('aud-exportar').onclick = exportar;
    $('aud-nube-btn').onclick = function () { var q = quincena(); if (q && novedades.length) guardarEnLaNube(q.nombre, novedades); };
    $('aud-g-quincena').onchange = pintarGuardadas;
    $('aud-g-solo').onchange = pintarGuardadas;
    $('aud-ver-guardadas').onclick = function () { if (sb) cargarGuardadas(); };
    // Menú Zonas verdes → 🔍 Auditar ZIP (subsanaciones.html#auditar): abre la ventana al llegar o, si ya se está en
    // Subsanaciones, al tocarlo. Al cerrarla se quita el #auditar, para que el menú la vuelva a abrir
    function porEnlace() {
        if (location.hash !== '#auditar') return;
        document.querySelectorAll('details.nav-menu[open]').forEach(function (d) { d.open = false; });
        abrir();
    }
    window.addEventListener('hashchange', porEnlace);
    $('dlg-auditoria').addEventListener('close', function () {
        if (location.hash === '#auditar') history.replaceState(null, '', location.pathname + location.search);
    });
    porEnlace();
}
