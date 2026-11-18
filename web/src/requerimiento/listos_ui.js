// Panel ⏰ «Listos para requerimiento» de requerimiento.html: las visitas que ya cumplieron 8 días hábiles sin corregir,
// por cuadrilla, con sus imágenes guardadas; se marcan y «Crear requerimiento» lo deja lleno y guardado como borrador.
// A los 5 días hábiles salen en «⚠️ Para pre aviso» con el mensaje para el contratista. Las imágenes (📋 reporte de
// ejecución, 📤 envío, ⚠️ pre aviso) se agregan en «📎 Agregar imagen» (recorte pegado o archivos) y se borran al mes.
// La lógica está en listos.js y el guardado de las imágenes en anexos.js.
//
// iniciarListos({ supabase, historial() → requerimientos guardados, plantillas() → plantillas cargadas, vacio() → requerimiento
//                 en blanco, prepararImagen(file) → { blob }, abrir(d, plantillaId, archivos: [{ file, pie, grupo }]),
//                 abrirGuardado(idRequerimiento) })
// Devuelve { cargar(), pintar(), crearDe(idVisita) }
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { valorItem, hoy } from '../subsanaciones/util.js';
import { crearApi } from '../api.js';
import { candidatas, porCuadrilla, yaRequeridas, armar, plantillaPara, aTexto, textoPreaviso, PLAZO_REQ, AVISO, EVID_REPORTE, EVID_ENVIO } from './listos.js';
import { crearAnexos, carpeta, seBorra, TIPOS } from './anexos.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
var LIMPIEZA = 'req_anexos_limpieza';   // el día en que este equipo borró por última vez las imágenes de más de un mes

export function iniciarListos(dep) {
    var anexos = crearAnexos(dep.supabase), visitas = [], porVisita = {}, sinAnexos = '', marcadas = {}, origen = '', ocupado = false;

    function itemsNoDe(items) { return function (r) { return (items || []).filter(function (i) { return valorItem(r[i]) === 'NO'; }); }; }
    async function leerVisitas() {
        try {
            var d = await crearApi(dep.supabase).leer();
            origen = '';
            return { registros: d.registros || [], items: d.items || [] };
        } catch (e) {
            // Sin señal: la copia que Subsanaciones deja en este equipo
            var c = null;
            try { c = JSON.parse(localStorage.getItem('subsanaciones_cache')); } catch (x) { c = null; }
            if (!c || !c.registros) throw new Error('No se pudieron leer las visitas: ' + ((e && e.message) || 'revise la conexión') + '.');
            origen = 'Sin conexión: se usan las visitas guardadas en este equipo (pueden estar desactualizadas).';
            return { registros: c.registros, items: c.items || [] };
        }
    }
    async function cargar() {
        $('rl-estado').hidden = false;
        $('rl-estado').textContent = 'Buscando las visitas sin corregir…';
        $('rl-actualizar').disabled = true;
        try {
            var d = await leerVisitas();
            visitas = candidatas(d.registros, hoy(), itemsNoDe(d.items));
            try { porVisita = await anexos.listar(visitas.map(function (v) { return v.id; })); sinAnexos = ''; }
            catch (e) { porVisita = {}; sinAnexos = e.message; }
            $('rl-estado').hidden = !origen;
            $('rl-estado').textContent = origen;
            if (!sinAnexos && !origen) limpiarViejas();
        } catch (e) {
            visitas = [];
            $('rl-estado').textContent = e.message;
        } finally { $('rl-actualizar').disabled = false; }
        pintar();
    }
    // Una vez al día por equipo: borra las imágenes de más de un mes, menos las de visitas que siguen esperando requerimiento
    // (en plazo, en pre aviso o listas sin requerimiento todavía)
    async function limpiarViejas() {
        var dia = hoy();
        try { if (localStorage.getItem(LIMPIEZA) === dia) return; localStorage.setItem(LIMPIEZA, dia); } catch (e) { return; }
        var ya = yaRequeridas(dep.historial()), protegidas = {};
        visitas.forEach(function (v) { if (!ya[v.id]) protegidas[carpeta(v.id)] = true; });
        try {
            var r = await anexos.limpiar(protegidas);
            if (r.borrados) toast(plural(r.borrados, 'imagen de hace más de un mes se borró', 'imágenes de hace más de un mes se borraron') + ' del almacenamiento.');
        } catch (e) { /* si falla, se intenta otro día; no estorba el trabajo */ }
    }

    function deTipo(v, tipo) { return (porVisita[v.id] || []).filter(function (a) { return a.tipo === tipo; }); }
    function htmlAnexos(v, tipoInicial) {
        var lista = porVisita[v.id] || [];
        return '<div class="rl-anexos">' + lista.map(function (a) {
            var borra = seBorra(a.fecha);
            return '<span class="rl-anexo" title="' + esc(TIPOS[a.tipo] || '') + '">' + esc((TIPOS[a.tipo] || '🖼️').split(' ')[0]) + ' ' + esc(a.nombre) +
                (borra ? ' <span class="rl-borra">· se borra el ' + esc(aTexto(borra)) + '</span>' : '') +
                '<button type="button" data-rl-quitar="' + esc(a.ruta) + '" data-v="' + esc(v.id) + '" aria-label="Quitar el anexo ' + esc(a.nombre) + '" title="Quitar este anexo">✕</button></span>';
        }).join('') + (sinAnexos ? '' : '<button type="button" class="secundario pequeno" data-rl-agregar="' + esc(v.id) + '" data-tipo="' + esc(tipoInicial) + '">📎 Agregar imagen</button>') + '</div>';
    }
    function tipoInicial(v) { return v.preaviso && !deTipo(v, 'preaviso').length ? 'preaviso' : v.tipo === 'norealizado' || !deTipo(v, 'reporte').length && v.listo ? 'reporte' : 'envio'; }
    function htmlVisita(v, ya, conCasilla) {
        var r = ya[v.id], pre = v.preaviso && deTipo(v, 'preaviso')[0];
        return '<div class="rl-visita' + (r ? ' ya' : '') + '">' +
            (conCasilla ? '<input type="checkbox" data-rl-v="' + esc(v.id) + '"' + (r ? ' disabled' : marcadas[v.id] ? ' checked' : '') + ' aria-label="Incluir ' + esc(v.mr) + ' en el requerimiento">' : '') +
            '<div class="rl-datos"><div class="rl-tit"><b>' + (v.lote ? 'Lote ' + esc(v.lote) : esc(v.mr)) + '</b>' + (v.lote ? '<span class="sub">' + esc(v.mr) + '</span>' : '') +
                '<span class="rl-dias ' + (v.listo ? 'listo' : v.preaviso ? 'pronto' : '') + '">' + (v.noSubsanable ? '🌳 No subsanable' : v.listo ? plural(v.dias, 'día hábil', 'días hábiles') : 'faltan ' + plural(v.faltan, 'día hábil', 'días hábiles')) + '</span></div>' +
            '<div class="sub">' + (v.tipo === 'norealizado' ? 'Lote no realizado, visto' : 'Novedades enviadas') + ' el ' + esc(aTexto(v.fecha)) +
                (v.noSubsanable ? ' · afectación a árboles: va de una a requerimiento (no se espera el plazo ni el pre aviso)' : v.listo ? '' : ' · se cumple el ' + esc(aTexto(v.cumple))) + '</div>' +
            (v.tipo === 'novedad' && v.novedades.length ? '<div class="rl-nov">' + esc(v.novedades.join(' · ')) + '</div>' : '') +
            (v.preaviso ? '<div class="rl-pre-estado ' + (pre ? 'ok">✓ Pre aviso enviado el ' + esc(aTexto(String(pre.fecha).slice(0, 10))) : 'falta">⚠️ Falta el pantallazo del pre aviso') + '</div>' : '') +
            (r ? '<div class="rl-ya">✓ Ya está en el requerimiento ' + esc(r.radicado || 'sin radicado') + ' (' + esc(r.estado) + ')</div>' : '') +
            htmlAnexos(v, tipoInicial(v)) + '</div></div>';
    }
    function pintar() {
        var ya = yaRequeridas(dep.historial()), listas = visitas.filter(function (v) { return v.listo; });
        var preaviso = visitas.filter(function (v) { return v.preaviso; }), enPlazo = visitas.filter(function (v) { return !v.listo && !v.preaviso; });
        var nuevas = listas.filter(function (v) { return !ya[v.id]; }), avisadas = preaviso.filter(function (v) { return deTipo(v, 'preaviso').length; }).length;
        // Lo marcado que ya no aplica (se subsanó o ya tiene requerimiento) se suelta
        Object.keys(marcadas).forEach(function (id) { if (!nuevas.some(function (v) { return v.id === id; })) delete marcadas[id]; });
        $('rl-cuenta').innerHTML = '<div class="rl-dato' + (nuevas.length ? ' mal' : '') + '"><b>' + nuevas.length + '</b><span>listas para requerimiento</span></div>' +
            '<div class="rl-dato"><b>' + (listas.length - nuevas.length) + '</b><span>ya con requerimiento</span></div>' +
            '<div class="rl-dato' + (preaviso.length > avisadas ? ' aviso' : '') + '"><b>' + preaviso.length + '</b><span>para pre aviso' + (preaviso.length ? ' (' + avisadas + ' avisadas)' : '') + '</span></div>' +
            '<div class="rl-dato"><b>' + enPlazo.length + '</b><span>todavía en plazo</span></div>';
        $('rl-aviso').hidden = !sinAnexos;
        $('rl-aviso').textContent = sinAnexos;
        $('rl-lista').innerHTML = listas.length ? porCuadrilla(listas).map(function (g) {
            var libres = g.visitas.filter(function (v) { return !ya[v.id]; }), todas = libres.length && libres.every(function (v) { return marcadas[v.id]; });
            return '<article class="rl-cuad"><label class="rl-cuad-cab"><input type="checkbox" data-rl-cuad="' + esc(g.cuad) + '"' + (todas ? ' checked' : '') + (libres.length ? '' : ' disabled') + '>' +
                '<b>Cuadrilla ' + esc(g.cuad) + '</b><span class="sub">' + plural(libres.length, 'visita lista', 'visitas listas') + (g.visitas.length > libres.length ? ' · ' + (g.visitas.length - libres.length) + ' ya con requerimiento' : '') + '</span></label>' +
                g.visitas.map(function (v) { return htmlVisita(v, ya, true); }).join('') + '</article>';
        }).join('') : (visitas.length || !$('rl-estado').hidden ? '' : '<p class="sub rl-vacio">No hay visitas con ' + PLAZO_REQ + ' días hábiles sin corregir. 👍</p>');
        // ⚠️ Pre aviso: por cuadrilla, con su mensaje para copiar o mandar por WhatsApp
        $('rl-preaviso').hidden = !preaviso.length;
        $('rl-preaviso-tit').textContent = '⚠️ Para pre aviso (' + preaviso.length + '): ' + AVISO + ' días hábiles o más sin corregir' + (preaviso.length ? ' · ' + avisadas + ' con el pre aviso enviado' : '');
        $('rl-preaviso-lista').innerHTML = porCuadrilla(preaviso).map(function (g) {
            return '<div class="rl-cuad"><div class="rl-cuad-cab"><b>Cuadrilla ' + esc(g.cuad) + '</b><span class="sub">' + plural(g.visitas.length, 'visita', 'visitas') + '</span></div>' +
                g.visitas.map(function (v) { return htmlVisita(v, ya, false); }).join('') +
                '<div class="rl-pre-acc"><button type="button" class="secundario" data-rl-pre-copiar="' + esc(g.cuad) + '">📋 Copiar pre aviso</button>' +
                '<button type="button" class="wa" data-rl-pre-wa="' + esc(g.cuad) + '">WhatsApp</button></div></div>';
        }).join('');
        $('rl-plazo').hidden = !enPlazo.length;
        $('rl-plazo-tit').textContent = 'Todavía en plazo (' + enPlazo.length + '): agregue desde ya el pantallazo del envío';
        $('rl-plazo-lista').innerHTML = porCuadrilla(enPlazo).map(function (g) {
            return '<div class="rl-cuad"><div class="rl-cuad-cab"><b>Cuadrilla ' + esc(g.cuad) + '</b></div>' + g.visitas.map(function (v) { return htmlVisita(v, ya, false); }).join('') + '</div>';
        }).join('');
        var sel = nuevas.filter(function (v) { return marcadas[v.id]; }), cuads = [];
        sel.forEach(function (v) { if (cuads.indexOf(v.cuad) === -1) cuads.push(v.cuad); });
        $('rl-pie').hidden = !nuevas.length;
        $('rl-marcadas').textContent = sel.length ? plural(sel.length, 'visita marcada', 'visitas marcadas') + ' · ' + (cuads.length === 1 ? 'cuadrilla ' : 'cuadrillas ') + cuads.sort().join(' y ') : 'Marque las visitas (o toda la cuadrilla) que van en el mismo requerimiento.';
        $('rl-crear').disabled = !sel.length || ocupado;
    }
    function textoDeCuadrilla(cuad) { return textoPreaviso(cuad, visitas.filter(function (v) { return v.preaviso && (v.cuad || '?') === cuad; })); }

    async function crear() {
        var ya = yaRequeridas(dep.historial());
        return armarCon(visitas.filter(function (v) { return v.listo && marcadas[v.id] && !ya[v.id]; }));
    }
    // 📨 Crear requerimiento desde una visita de Subsanaciones (?visita=): de una, aunque no hayan pasado los 8 días hábiles
    async function crearDe(id) {
        var v = visitas.filter(function (x) { return x.id === id; })[0];
        if (!v) {
            if ($('rl-estado').textContent && !visitas.length) return toast($('rl-estado').textContent);
            return toast('La visita ' + id + ' ya no está pendiente ni como lote no realizado (puede que se haya subsanado): no hay qué requerir.');
        }
        var r = yaRequeridas(dep.historial())[id];
        if (r) {
            if (await confirmar('Esta visita ya tiene requerimiento', 'Está en el requerimiento ' + (r.radicado || 'sin radicado') + ' (' + r.estado + '). ¿Abrir ese o crear otro?', 'Abrir ese', 'Crear otro')) return dep.abrirGuardado(r.id);
        }
        return armarCon([v]);
    }
    async function armarCon(sel) {
        if (!sel.length || ocupado) return;
        ocupado = true;
        $('rl-crear').disabled = true;
        var archivos = [], fallidos = 0;
        try {
            for (var i = 0; i < sel.length; i++) {
                var lista = porVisita[sel[i].id] || [];
                for (var k = 0; k < lista.length; k++) {
                    $('rl-crear').textContent = 'Trayendo las imágenes… (' + (archivos.length + 1) + ')';
                    try {
                        var blob = await anexos.bajar(lista[k].ruta);
                        // El reporte de la cuadrilla va a «Reportes de ejecución»; el envío y el pre aviso, a «Envío de las novedades…»
                        archivos.push({ file: new File([blob], lista[k].nombre + '.jpg', { type: 'image/jpeg' }), grupo: lista[k].tipo === 'reporte' ? EVID_REPORTE : EVID_ENVIO,
                            pie: (sel[i].lote ? 'Lote ' + sel[i].lote + ' · ' : '') + sel[i].mr + ' · ' + (lista[k].tipo === 'preaviso' ? 'pre aviso · ' : '') + aTexto(sel[i].fecha) });
                    } catch (e) { fallidos++; }
                }
            }
            var d = armar(sel, dep.vacio(), hoy());
            marcadas = {};
            await dep.abrir(d, plantillaPara(sel, dep.plantillas()), archivos);
            if (fallidos) toast(plural(fallidos, 'imagen no se pudo traer', 'imágenes no se pudieron traer') + ': agréguelas a mano en la evidencia.');
        } catch (e) {
            toast('No se pudo crear el requerimiento: ' + ((e && e.message) || e));
        } finally {
            ocupado = false;
            $('rl-crear').textContent = '📨 Crear requerimiento';
            pintar();
        }
    }

    // ---------- 📎 Agregar imagen (ventana): recorte pegado, «Pegar recorte» o imágenes elegidas ----------
    // Abre vacía; al cerrarla (Cerrar, Esc o afuera) se sueltan las imágenes que no se guardaron
    var dlg = $('dlg-anexo'), paraVisita = '', elegidas = [], guardando = false;
    function abrirAgregar(id, tipo) {
        var v = visitas.filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        paraVisita = id; limpiarVentana();
        $('an-para').textContent = (v.lote ? 'Lote ' + v.lote + ' · ' : '') + v.mr + ' · visita del ' + aTexto(v.fecha);
        var radio = dlg.querySelector('input[name="an-tipo"][value="' + (TIPOS[tipo] ? tipo : 'envio') + '"]');
        if (radio) radio.checked = true;
        dlg.showModal();
        $('an-zona').focus();
    }
    function limpiarVentana() {
        elegidas.forEach(function (x) { URL.revokeObjectURL(x.url); });
        elegidas = [];
        $('an-estado').textContent = '';
        pintarElegidas();
    }
    function pintarElegidas() {
        $('an-lista').innerHTML = elegidas.map(function (x, i) {
            return '<div class="an-img"><img src="' + x.url + '" alt="' + esc(x.file.name) + '"><button type="button" data-an-quitar="' + i + '" aria-label="Quitar ' + esc(x.file.name) + '">✕</button></div>';
        }).join('');
        $('an-guardar').disabled = !elegidas.length || guardando;
        $('an-guardar').textContent = guardando ? 'Guardando…' : elegidas.length ? 'Guardar ' + plural(elegidas.length, 'imagen', 'imágenes') : 'Guardar';
    }
    function agregarArchivos(lista, reemplazar) {
        var imgs = Array.prototype.slice.call(lista || []).filter(function (f) { return /^image\//.test(f.type); });
        if (!imgs.length) { $('an-estado').textContent = 'Eso no es una imagen. Pegue el recorte (Ctrl+V) o elija archivos de imagen.'; return; }
        // Volver a elegir archivos reemplaza lo anterior; pegar recortes los va sumando
        if (reemplazar) limpiarVentana();
        $('an-estado').textContent = '';
        imgs.forEach(function (f, i) {
            var nombre = f.name && !/^image\.\w+$/i.test(f.name) ? f.name : 'recorte-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + (i ? '-' + i : '') + '.png';
            var file = f.name === nombre ? f : new File([f], nombre, { type: f.type });
            elegidas.push({ file: file, url: URL.createObjectURL(file) });
        });
        pintarElegidas();
    }
    async function pegarDelPortapapeles() {
        if (!navigator.clipboard || !navigator.clipboard.read) { $('an-estado').textContent = 'Este navegador no deja leer el portapapeles con el botón: haga clic en el cuadro y pulse Ctrl+V, o use «Elegir imágenes».'; return; }
        try {
            var items = await navigator.clipboard.read(), files = [];
            for (var i = 0; i < items.length; i++) {
                var t = items[i].types.filter(function (x) { return /^image\//.test(x); })[0];
                if (t) files.push(new File([await items[i].getType(t)], 'recorte.png', { type: t }));
            }
            if (!files.length) { $('an-estado').textContent = 'El portapapeles no tiene una imagen. Haga el recorte (Windows: Win + Shift + S) y vuelva a pegar.'; return; }
            agregarArchivos(files, false);
        } catch (e) { $('an-estado').textContent = 'No se pudo leer el portapapeles (el navegador pidió permiso y no se dio). Haga clic en el cuadro y pulse Ctrl+V.'; }
    }
    async function guardarElegidas() {
        var id = paraVisita, tipo = (dlg.querySelector('input[name="an-tipo"]:checked') || {}).value || 'envio';
        if (!id || !elegidas.length || guardando) return;
        guardando = true; pintarElegidas();
        var mal = 0, bien = 0, ultimoError = '';
        for (var i = 0; i < elegidas.length; i++) {
            $('an-estado').textContent = 'Guardando ' + (i + 1) + ' de ' + elegidas.length + '…';
            try {
                var img = await dep.prepararImagen(elegidas[i].file);
                (porVisita[id] = porVisita[id] || []).push(await anexos.subir(id, img.blob, elegidas[i].file.name, tipo));
                bien++;
            } catch (e) { mal++; ultimoError = (e && e.message) || 'revise la conexión'; }
        }
        guardando = false;
        pintar();
        if (mal) {
            // Se quedan en la ventana las que no se guardaron, para volver a intentar
            $('an-estado').textContent = plural(mal, 'imagen no se guardó', 'imágenes no se guardaron') + ': ' + ultimoError + (bien ? ' (' + plural(bien, 'sí se guardó', 'sí se guardaron') + ')' : '');
            elegidas = elegidas.slice(bien);
            pintarElegidas();
            return;
        }
        dlg.close();
        toast(plural(bien, 'imagen guardada', 'imágenes guardadas') + ' como ' + TIPOS[tipo] + ': entra sola cuando se arme el requerimiento.');
    }
    dlg.addEventListener('close', function () { if (!guardando) { limpiarVentana(); paraVisita = ''; } });
    dlg.addEventListener('cancel', function (ev) { if (guardando) ev.preventDefault(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg && !guardando) dlg.close(); });
    dlg.addEventListener('paste', function (ev) {
        var files = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []);
        if (files.length) { ev.preventDefault(); agregarArchivos(files, false); }
    });
    var zona = $('an-zona');
    zona.addEventListener('dragover', function (ev) { ev.preventDefault(); zona.classList.add('encima'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('encima'); });
    zona.addEventListener('drop', function (ev) { ev.preventDefault(); zona.classList.remove('encima'); agregarArchivos(ev.dataTransfer.files, false); });
    $('an-pegar').onclick = pegarDelPortapapeles;
    $('an-elegir').onclick = function () { $('rl-archivo').value = ''; $('rl-archivo').click(); };
    $('rl-archivo').onchange = function () { agregarArchivos(this.files, true); this.value = ''; };
    $('an-lista').addEventListener('click', function (ev) {
        var q = ev.target.closest('[data-an-quitar]');
        if (!q || guardando) return;
        var x = elegidas.splice(+q.dataset.anQuitar, 1)[0];
        if (x) URL.revokeObjectURL(x.url);
        pintarElegidas();
    });
    $('an-guardar').onclick = guardarElegidas;
    $('an-cerrar').onclick = function () { dlg.close(); };

    function copiar(texto) {
        var listo = function () { toast('Pre aviso copiado: péguelo en el chat del contratista.'); };
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto).then(listo, function () { toast('No se pudo copiar: selecciónelo a mano.'); });
        toast('No se pudo copiar: este navegador no lo permite.');
    }

    $('rl-actualizar').onclick = cargar;
    $('rl-crear').onclick = crear;
    $('req-listos').addEventListener('change', function (ev) {
        var t = ev.target;
        if (t.dataset.rlV) { if (t.checked) marcadas[t.dataset.rlV] = 1; else delete marcadas[t.dataset.rlV]; pintar(); }
        if (t.dataset.rlCuad != null) {
            var ya = yaRequeridas(dep.historial());
            visitas.filter(function (v) { return v.listo && (v.cuad || '?') === t.dataset.rlCuad && !ya[v.id]; }).forEach(function (v) { if (t.checked) marcadas[v.id] = 1; else delete marcadas[v.id]; });
            pintar();
        }
    });
    $('req-listos').addEventListener('click', async function (ev) {
        var a = ev.target.closest('[data-rl-agregar]'), q = ev.target.closest('[data-rl-quitar]');
        var pc = ev.target.closest('[data-rl-pre-copiar]'), pw = ev.target.closest('[data-rl-pre-wa]');
        if (a) abrirAgregar(a.dataset.rlAgregar, a.dataset.tipo);
        if (pc) copiar(textoDeCuadrilla(pc.dataset.rlPreCopiar));
        if (pw) window.open('https://wa.me/?text=' + encodeURIComponent(textoDeCuadrilla(pw.dataset.rlPreWa)), '_blank', 'noopener');
        if (q) {
            if (!(await confirmar('Quitar el anexo', 'La imagen se borra del almacenamiento y ya no entra al requerimiento.', 'Quitar'))) return;
            try {
                await anexos.borrar(q.dataset.rlQuitar);
                porVisita[q.dataset.v] = (porVisita[q.dataset.v] || []).filter(function (x) { return x.ruta !== q.dataset.rlQuitar; });
                pintar();
            } catch (e) { toast(e.message); }
        }
    });
    return { cargar: cargar, pintar: pintar, crearDe: crearDe };
}
