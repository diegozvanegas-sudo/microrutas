// Panel ⏰ «Listos para requerimiento» de requerimiento.html: las visitas que ya cumplieron 8 días hábiles sin corregir,
// por cuadrilla, con sus pantallazos guardados; se marcan y «Crear requerimiento» lo deja lleno y guardado como borrador.
// La lógica está en listos.js y el guardado de los pantallazos en anexos.js.
//
// iniciarListos({ supabase, historial() → requerimientos guardados, plantillas() → plantillas cargadas, vacio() → requerimiento
//                 en blanco, prepararImagen(file) → { blob }, abrir(d, plantillaId, archivos: [{ file, pie }]) })
// Devuelve { cargar(), pintar() }
import { $, toast, confirmar } from '../subsanaciones/ui.js';
import { valorItem, hoy } from '../subsanaciones/util.js';
import { crearApi } from '../api.js';
import { candidatas, porCuadrilla, yaRequeridas, armar, plantillaPara, aTexto, PLAZO_REQ } from './listos.js';
import { crearAnexos } from './anexos.js';

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

export function iniciarListos(dep) {
    var anexos = crearAnexos(dep.supabase), visitas = [], porVisita = {}, sinAnexos = '', marcadas = {}, origen = '', ocupado = false, paraVisita = '';

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
        } catch (e) {
            visitas = [];
            $('rl-estado').textContent = e.message;
        } finally { $('rl-actualizar').disabled = false; }
        pintar();
    }

    function htmlAnexos(v) {
        var lista = porVisita[v.id] || [];
        return '<div class="rl-anexos">' + lista.map(function (a) {
            return '<span class="rl-anexo">🖼️ ' + esc(a.nombre) + '<button type="button" data-rl-quitar="' + esc(a.ruta) + '" data-v="' + esc(v.id) + '" aria-label="Quitar el anexo ' + esc(a.nombre) + '" title="Quitar este anexo">✕</button></span>';
        }).join('') + (sinAnexos ? '' : '<button type="button" class="secundario pequeno" data-rl-adjuntar="' + esc(v.id) + '">📎 ' + (lista.length ? 'Otro pantallazo' : v.tipo === 'norealizado' ? 'Adjuntar la captura del reporte' : 'Adjuntar pantallazo del envío') + '</button>') + '</div>';
    }
    function htmlVisita(v, ya, conCasilla) {
        var r = ya[v.id];
        return '<div class="rl-visita' + (r ? ' ya' : '') + '">' +
            (conCasilla ? '<input type="checkbox" data-rl-v="' + esc(v.id) + '"' + (r ? ' disabled' : marcadas[v.id] ? ' checked' : '') + ' aria-label="Incluir ' + esc(v.mr) + ' en el requerimiento">' : '') +
            '<div class="rl-datos"><div class="rl-tit"><b>' + (v.lote ? 'Lote ' + esc(v.lote) : esc(v.mr)) + '</b>' + (v.lote ? '<span class="sub">' + esc(v.mr) + '</span>' : '') +
                '<span class="rl-dias ' + (v.listo ? 'listo' : v.faltan <= 2 ? 'pronto' : '') + '">' + (v.listo ? plural(v.dias, 'día hábil', 'días hábiles') : 'faltan ' + plural(v.faltan, 'día hábil', 'días hábiles')) + '</span></div>' +
            '<div class="sub">' + (v.tipo === 'norealizado' ? 'Lote no realizado, visto' : 'Novedades enviadas') + ' el ' + esc(aTexto(v.fecha)) + (v.listo ? '' : ' · se cumple el ' + esc(aTexto(v.cumple))) + '</div>' +
            (v.tipo === 'novedad' && v.novedades.length ? '<div class="rl-nov">' + esc(v.novedades.join(' · ')) + '</div>' : '') +
            (r ? '<div class="rl-ya">✓ Ya está en el requerimiento ' + esc(r.radicado || 'sin radicado') + ' (' + esc(r.estado) + ')</div>' : '') +
            htmlAnexos(v) + '</div></div>';
    }
    function pintar() {
        var ya = yaRequeridas(dep.historial()), listas = visitas.filter(function (v) { return v.listo; }), enPlazo = visitas.filter(function (v) { return !v.listo; });
        var nuevas = listas.filter(function (v) { return !ya[v.id]; });
        // Lo marcado que ya no aplica (se subsanó o ya tiene requerimiento) se suelta
        Object.keys(marcadas).forEach(function (id) { if (!nuevas.some(function (v) { return v.id === id; })) delete marcadas[id]; });
        $('rl-cuenta').innerHTML = '<div class="rl-dato' + (nuevas.length ? ' mal' : '') + '"><b>' + nuevas.length + '</b><span>listas para requerimiento</span></div>' +
            '<div class="rl-dato"><b>' + (listas.length - nuevas.length) + '</b><span>ya con requerimiento</span></div>' +
            '<div class="rl-dato"><b>' + enPlazo.length + '</b><span>todavía en plazo</span></div>';
        $('rl-aviso').hidden = !sinAnexos;
        $('rl-aviso').textContent = sinAnexos;
        $('rl-lista').innerHTML = listas.length ? porCuadrilla(listas).map(function (g) {
            var libres = g.visitas.filter(function (v) { return !ya[v.id]; }), todas = libres.length && libres.every(function (v) { return marcadas[v.id]; });
            return '<article class="rl-cuad"><label class="rl-cuad-cab"><input type="checkbox" data-rl-cuad="' + esc(g.cuad) + '"' + (todas ? ' checked' : '') + (libres.length ? '' : ' disabled') + '>' +
                '<b>Cuadrilla ' + esc(g.cuad) + '</b><span class="sub">' + plural(libres.length, 'visita lista', 'visitas listas') + (g.visitas.length > libres.length ? ' · ' + (g.visitas.length - libres.length) + ' ya con requerimiento' : '') + '</span></label>' +
                g.visitas.map(function (v) { return htmlVisita(v, ya, true); }).join('') + '</article>';
        }).join('') : (visitas.length || !$('rl-estado').hidden ? '' : '<p class="sub rl-vacio">No hay visitas con ' + PLAZO_REQ + ' días hábiles sin corregir. 👍</p>');
        $('rl-plazo').hidden = !enPlazo.length;
        $('rl-plazo-tit').textContent = 'Todavía en plazo (' + enPlazo.length + '): adjunte desde ya el pantallazo del envío';
        $('rl-plazo-lista').innerHTML = porCuadrilla(enPlazo).map(function (g) {
            return '<div class="rl-cuad"><div class="rl-cuad-cab"><b>Cuadrilla ' + esc(g.cuad) + '</b></div>' + g.visitas.map(function (v) { return htmlVisita(v, ya, false); }).join('') + '</div>';
        }).join('');
        var sel = nuevas.filter(function (v) { return marcadas[v.id]; }), cuads = [];
        sel.forEach(function (v) { if (cuads.indexOf(v.cuad) === -1) cuads.push(v.cuad); });
        $('rl-pie').hidden = !nuevas.length;
        $('rl-marcadas').textContent = sel.length ? plural(sel.length, 'visita marcada', 'visitas marcadas') + ' · ' + (cuads.length === 1 ? 'cuadrilla ' : 'cuadrillas ') + cuads.sort().join(' y ') : 'Marque las visitas (o toda la cuadrilla) que van en el mismo requerimiento.';
        $('rl-crear').disabled = !sel.length || ocupado;
    }

    async function crear() {
        var ya = yaRequeridas(dep.historial()), sel = visitas.filter(function (v) { return v.listo && marcadas[v.id] && !ya[v.id]; });
        if (!sel.length || ocupado) return;
        ocupado = true;
        $('rl-crear').disabled = true;
        var archivos = [], fallidos = 0;
        try {
            for (var i = 0; i < sel.length; i++) {
                var lista = porVisita[sel[i].id] || [];
                for (var k = 0; k < lista.length; k++) {
                    $('rl-crear').textContent = 'Trayendo los pantallazos… (' + (archivos.length + 1) + ')';
                    try {
                        var blob = await anexos.bajar(lista[k].ruta);
                        archivos.push({ file: new File([blob], lista[k].nombre + '.jpg', { type: 'image/jpeg' }),
                            pie: (sel[i].lote ? 'Lote ' + sel[i].lote + ' · ' : '') + sel[i].mr + ' · ' + aTexto(sel[i].fecha) });
                    } catch (e) { fallidos++; }
                }
            }
            var d = armar(sel, dep.vacio(), hoy());
            marcadas = {};
            await dep.abrir(d, plantillaPara(sel, dep.plantillas()), archivos);
            if (fallidos) toast(plural(fallidos, 'pantallazo no se pudo traer', 'pantallazos no se pudieron traer') + ': agréguelos a mano en la evidencia.');
        } catch (e) {
            toast('No se pudo crear el requerimiento: ' + ((e && e.message) || e));
        } finally {
            ocupado = false;
            $('rl-crear').textContent = '📨 Crear requerimiento';
            pintar();
        }
    }
    async function adjuntar(files) {
        var id = paraVisita, lista = Array.prototype.slice.call(files || []);
        if (!id || !lista.length) return;
        var boton = document.querySelector('[data-rl-adjuntar="' + id + '"]'), mal = 0;
        if (boton) { boton.disabled = true; boton.textContent = 'Subiendo…'; }
        for (var i = 0; i < lista.length; i++) {
            try {
                var img = await dep.prepararImagen(lista[i]);
                (porVisita[id] = porVisita[id] || []).push(await anexos.subir(id, img.blob, lista[i].name));
            } catch (e) { mal++; if (i === lista.length - 1 || mal === 1) toast((e && e.message) || 'No se pudo subir ' + lista[i].name + '.'); }
        }
        if (lista.length > mal) toast(plural(lista.length - mal, 'pantallazo guardado', 'pantallazos guardados') + ': entra solo cuando se arme el requerimiento.');
        pintar();
    }

    $('rl-actualizar').onclick = cargar;
    $('rl-crear').onclick = crear;
    $('rl-archivo').onchange = function () { adjuntar(this.files); this.value = ''; };
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
        var a = ev.target.closest('[data-rl-adjuntar]'), q = ev.target.closest('[data-rl-quitar]');
        if (a) { paraVisita = a.dataset.rlAdjuntar; $('rl-archivo').click(); }
        if (q) {
            if (!(await confirmar('Quitar el anexo', 'El pantallazo se borra del almacenamiento y ya no entra al requerimiento.', 'Quitar'))) return;
            try {
                await anexos.borrar(q.dataset.rlQuitar);
                porVisita[q.dataset.v] = (porVisita[q.dataset.v] || []).filter(function (x) { return x.ruta !== q.dataset.rlQuitar; });
                pintar();
            } catch (e) { toast(e.message); }
        }
    });
    return { cargar: cargar, pintar: pintar };
}
