// 📷 Fotos de campo en la Guía de campo: la tira de miniaturas debajo de cada punto y la ventana #dlg-fotos para verlas y
// subir más (✅ bien / ❌ mal). El almacenamiento está en fotosguia.js. La ventana abre vacía; al cerrarla se suelta lo
// elegido y, si estaba subiendo, se cancela lo que faltaba (lo ya subido queda).
import { crearFotosGuia, reducir, contar, SIN_ACTIVAR } from './fotosguia.js';

var MAX_TIRA = 6;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fecha(d) { return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; }

// toast(mensaje): aviso corto de la página
export function iniciarFotos(supabase, toast) {
    var $ = function (id) { return document.getElementById(id); };
    var api = crearFotosGuia(supabase);
    var porCarpeta = null, urlsMin = {}, error = '';
    var dlg = $('dlg-fotos'), actual = null, filtro = 'todas', urlsGrandes = {}, elegidas = [], subiendo = false, vuelta = 0, porBorrar = '';

    // ---------- Tira debajo de cada punto ----------
    function tira(carpeta) {
        var fotos = porCarpeta ? (porCarpeta[carpeta] || []) : null, c = contar(fotos);
        var boton = '<button type="button" class="gv-boton" data-gv-abrir>' + (c.total ? '📷 Ver y agregar fotos (' + c.total + ')' : '📷 Agregar fotos de campo') + '</button>';
        if (error) return boton + '<span class="gv-nota">' + esc(error) + '</span>';
        if (!fotos) return boton + '<span class="gv-nota">Cargando fotos…</span>';
        if (!c.total) return boton + '<span class="gv-nota">Todavía no hay fotos reales de este punto.</span>';
        return boton + '<span class="gv-cuenta">✅ ' + c.bien + ' · ❌ ' + c.mal + '</span><div class="gv-miniaturas">' + fotos.slice(0, MAX_TIRA).map(function (f) {
            var u = urlsMin[f.min] || urlsMin[f.ruta] || '';
            return '<button type="button" class="gv-mini gv-' + f.tipo + '" data-gv-abrir title="' + esc((f.tipo === 'bien' ? 'Bien' : 'Mal') + (f.nota ? ': ' + f.nota : '')) + '">' +
                (u ? '<img src="' + esc(u) + '" alt="' + esc(f.nota || 'Foto de campo') + '" loading="lazy">' : '<span>📷</span>') + '<i>' + (f.tipo === 'bien' ? '✅' : '❌') + '</i></button>';
        }).join('') + (c.total > MAX_TIRA ? '<button type="button" class="gv-mini gv-mas" data-gv-abrir>+' + (c.total - MAX_TIRA) + '</button>' : '') + '</div>';
    }
    function repintarTiras() {
        document.querySelectorAll('[data-gv-carpeta]').forEach(function (el) { el.innerHTML = tira(el.dataset.gvCarpeta); });
    }
    // Miniaturas que se muestran en la tira (si falta la miniatura, la grande)
    async function firmarMinis(carpetas) {
        var rutas = [];
        carpetas.forEach(function (c) { (porCarpeta[c] || []).slice(0, MAX_TIRA).forEach(function (f) { if (!urlsMin[f.min]) rutas.push(f.min); }); });
        var u = await api.urls(rutas).catch(function () { return {}; });
        Object.assign(urlsMin, u);
        var faltan = [];
        carpetas.forEach(function (c) { (porCarpeta[c] || []).slice(0, MAX_TIRA).forEach(function (f) { if (!urlsMin[f.min] && !urlsMin[f.ruta]) faltan.push(f.ruta); }); });
        if (faltan.length) Object.assign(urlsMin, await api.urls(faltan).catch(function () { return {}; }));
    }
    async function cargar(carpetas) {
        error = '';
        try {
            var r = await api.listar(carpetas);
            porCarpeta = Object.assign(porCarpeta || {}, r);
            repintarTiras();
            await firmarMinis(carpetas);
        } catch (e) {
            error = e.message === SIN_ACTIVAR ? '📷 Las fotos de campo todavía no están activadas.' : '📷 No se pudieron cargar las fotos: ' + e.message;
        }
        repintarTiras();
    }

    // ---------- Ventana ----------
    function fotosActual() { return (porCarpeta && actual && porCarpeta[actual.carpeta]) || []; }
    function pintarGaleria() {
        var fotos = fotosActual(), c = contar(fotos);
        $('gf-cuenta').textContent = c.total ? c.total + (c.total === 1 ? ' foto' : ' fotos') + ' · ✅ ' + c.bien + ' bien · ❌ ' + c.mal + ' mal' : 'Todavía no hay fotos de este punto: suba la primera abajo.';
        $('gf-filtros').hidden = !c.total;
        $('gf-filtros').innerHTML = [['todas', 'Todas (' + c.total + ')'], ['bien', '✅ Bien (' + c.bien + ')'], ['mal', '❌ Mal (' + c.mal + ')']].map(function (f) {
            return '<button type="button" data-gf-filtro="' + f[0] + '" aria-pressed="' + (filtro === f[0]) + '">' + f[1] + '</button>';
        }).join('');
        var ver = fotos.filter(function (f) { return filtro === 'todas' || f.tipo === filtro; });
        $('gf-galeria').innerHTML = ver.length ? ver.map(function (f) {
            var u = urlsGrandes[f.ruta] || urlsMin[f.min] || '';
            return '<figure class="gf-foto gv-' + f.tipo + '">' +
                (u ? '<a href="' + esc(urlsGrandes[f.ruta] || u) + '" target="_blank" rel="noopener" title="Ver en grande"><img src="' + esc(urlsMin[f.min] || u) + '" alt="' + esc(f.nota || 'Foto de campo') + '" loading="lazy"></a>' : '<div class="gf-sin">📷</div>') +
                '<figcaption><b>' + (f.tipo === 'bien' ? '✅ Bien' : '❌ Mal') + '</b>' + (f.nota ? '<span>' + esc(f.nota) + '</span>' : '') + '<small>' + esc(fecha(f.fecha)) + '</small>' +
                '<button type="button" class="gf-borrar" data-gf-borrar="' + esc(f.ruta) + '">' + (porBorrar === f.ruta ? '¿Borrar? Toque otra vez' : '🗑️ Borrar') + '</button></figcaption></figure>';
        }).join('') : (c.total ? '<p class="gf-vacio">No hay fotos con ese filtro.</p>' : '');
    }
    function pintarElegidas() {
        $('gf-previas').innerHTML = elegidas.map(function (x, i) {
            return '<div class="gf-previa"><img src="' + x.url + '" alt="Foto elegida ' + (i + 1) + '"><button type="button" data-gf-quitar="' + i + '" aria-label="Quitar la foto ' + (i + 1) + '">✕</button></div>';
        }).join('');
        var tipo = (document.querySelector('input[name="gf-tipo"]:checked') || {}).value, n = elegidas.length;
        $('gf-subir').disabled = subiendo || !n || !tipo;
        $('gf-subir').textContent = subiendo ? 'Subiendo…' : '⬆️ Subir' + (n ? ' ' + n + (n === 1 ? ' foto' : ' fotos') : '');
        if (!subiendo) $('gf-estado').textContent = n && !tipo ? 'Elija si la foto muestra cómo está bien o cómo está mal.' : n ? 'Listas para subir.' : '';
    }
    function soltarElegidas() { elegidas.forEach(function (x) { URL.revokeObjectURL(x.url); }); elegidas = []; }
    function agregar(lista, reemplazar) {
        var imgs = Array.prototype.slice.call(lista || []).filter(function (f) { return /^image\//.test(f.type); });
        if (!imgs.length) { $('gf-estado').textContent = 'Eso no es una foto: elija imágenes (JPG o PNG).'; return; }
        if (reemplazar) soltarElegidas();   // volver a elegir reemplaza; pegar y arrastrar suman
        imgs.forEach(function (f) { elegidas.push({ file: f, url: URL.createObjectURL(f) }); });
        pintarElegidas();
    }
    function limpiar() {
        vuelta++;   // si estaba subiendo, lo que falte ya no se sube ni se pinta aquí
        soltarElegidas();
        actual = null; filtro = 'todas'; urlsGrandes = {}; porBorrar = ''; subiendo = false;
        document.querySelectorAll('input[name="gf-tipo"]').forEach(function (r) { r.checked = false; });
        $('gf-nota').value = ''; $('gf-estado').textContent = ''; $('gf-galeria').innerHTML = ''; $('gf-previas').innerHTML = '';
    }
    async function abrir(carpeta, clave) {
        limpiar();
        actual = { carpeta: carpeta, clave: clave };
        $('gf-titulo').textContent = '📷 Fotos de campo · ' + clave;
        pintarGaleria(); pintarElegidas();
        dlg.showModal();
        if (error && error.indexOf('activadas') >= 0) { $('gf-estado').textContent = SIN_ACTIVAR; $('gf-subir').disabled = true; return; }
        var v = vuelta;
        try {
            if (!porCarpeta || !porCarpeta[carpeta]) porCarpeta = Object.assign(porCarpeta || {}, await api.listar([carpeta]));
            var fotos = porCarpeta[carpeta] || [];
            var u = await api.urls(fotos.map(function (f) { return f.ruta; }).concat(fotos.map(function (f) { return f.min; })));
            if (v !== vuelta) return;
            fotos.forEach(function (f) { if (u[f.ruta]) urlsGrandes[f.ruta] = u[f.ruta]; if (u[f.min]) urlsMin[f.min] = u[f.min]; });
            pintarGaleria();
        } catch (e) { if (v === vuelta) $('gf-estado').textContent = e.message; }
    }
    async function subir() {
        var tipo = (document.querySelector('input[name="gf-tipo"]:checked') || {}).value;
        if (!actual || !elegidas.length || !tipo || subiendo) return;
        var v = vuelta, carpeta = actual.carpeta, nota = $('gf-nota').value.trim(), lista = elegidas.slice(), bien = 0, fallo = '';
        subiendo = true; pintarElegidas();
        for (var i = 0; i < lista.length; i++) {
            if (v !== vuelta) break;
            $('gf-estado').textContent = 'Subiendo ' + (i + 1) + ' de ' + lista.length + '…';
            try {
                var grande = await reducir(lista[i].file, 1600, 0.85), mini = await reducir(lista[i].file, 360, 0.8);
                var f = await api.subir(carpeta, grande, mini, nota, tipo);
                porCarpeta = porCarpeta || {};
                porCarpeta[carpeta] = [f].concat(porCarpeta[carpeta] || []);
                bien++;
            } catch (e) { fallo = e.message; break; }
        }
        if (v !== vuelta) {   // se cerró la ventana mientras subía
            toast('📷 Se subieron ' + bien + ' de ' + lista.length + ' fotos; el resto se canceló al cerrar.');
            await firmarMinis([carpeta]); repintarTiras();
            return;
        }
        subiendo = false;
        if (bien) { soltarElegidas(); $('gf-nota').value = ''; document.querySelectorAll('input[name="gf-tipo"]').forEach(function (r) { r.checked = false; }); }
        await firmarMinis([carpeta]);
        var u = await api.urls((porCarpeta[carpeta] || []).map(function (f) { return f.ruta; })).catch(function () { return {}; });
        if (v !== vuelta) { repintarTiras(); return; }
        Object.assign(urlsGrandes, u);
        pintarGaleria(); pintarElegidas(); repintarTiras();
        $('gf-estado').textContent = fallo ? (bien ? 'Se subieron ' + bien + ' de ' + lista.length + '. ' : '') + 'No se pudo subir: ' + fallo : '✅ ' + (bien === 1 ? 'Foto subida.' : bien + ' fotos subidas.');
    }
    async function borrar(ruta) {
        if (porBorrar !== ruta) { porBorrar = ruta; pintarGaleria(); return; }
        porBorrar = '';
        var f = fotosActual().find(function (x) { return x.ruta === ruta; });
        if (!f) return;
        var v = vuelta;
        $('gf-estado').textContent = 'Borrando…';
        try {
            await api.borrar(f);
            porCarpeta[actual.carpeta] = fotosActual().filter(function (x) { return x.ruta !== ruta; });
            if (v !== vuelta) return;
            $('gf-estado').textContent = '🗑️ Foto borrada.';
        } catch (e) { if (v === vuelta) $('gf-estado').textContent = e.message; }
        pintarGaleria(); repintarTiras();
    }

    // ---------- Eventos ----------
    $('secciones').addEventListener('click', function (e) {
        var b = e.target.closest('[data-gv-abrir]');
        if (!b) return;
        var cont = b.closest('[data-gv-carpeta]');
        if (cont) abrir(cont.dataset.gvCarpeta, cont.dataset.gvClave);
    });
    dlg.addEventListener('close', limpiar);
    dlg.addEventListener('click', function (e) {
        if (e.target === dlg) return dlg.close();   // tocar afuera cierra
        var f = e.target.closest('[data-gf-filtro]');
        if (f) { filtro = f.dataset.gfFiltro; porBorrar = ''; return pintarGaleria(); }
        var q = e.target.closest('[data-gf-quitar]');
        if (q) { var x = elegidas.splice(+q.dataset.gfQuitar, 1)[0]; if (x) URL.revokeObjectURL(x.url); return pintarElegidas(); }
        var d = e.target.closest('[data-gf-borrar]');
        if (d) borrar(d.dataset.gfBorrar);
    });
    dlg.addEventListener('change', function (e) { if (e.target.name === 'gf-tipo') pintarElegidas(); });
    dlg.addEventListener('paste', function (e) {
        if (e.target === $('gf-nota')) return;
        var files = Array.prototype.slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); });
        if (files.length) { e.preventDefault(); agregar(files, false); }
    });
    var zona = $('gf-zona');
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('encima'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('encima'); });
    zona.addEventListener('drop', function (e) { e.preventDefault(); zona.classList.remove('encima'); agregar(e.dataTransfer.files, false); });
    $('gf-elegir').onclick = function () { $('gf-archivo').value = ''; $('gf-archivo').click(); };
    $('gf-camara').onclick = function () { $('gf-camara-archivo').value = ''; $('gf-camara-archivo').click(); };
    $('gf-archivo').onchange = function () { if (this.files.length) agregar(this.files, true); };
    $('gf-camara-archivo').onchange = function () { if (this.files.length) agregar(this.files, false); };
    $('gf-cerrar').onclick = function () { dlg.close(); };
    $('gf-subir').onclick = subir;

    return { tira: tira, cargar: cargar, cargado: function () { return !!porCarpeta || !!error; } };
}
