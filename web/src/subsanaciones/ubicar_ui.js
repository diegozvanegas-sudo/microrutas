// Ventana 📍 Ubicar direcciones (menú Más): se pega un mensaje, salen las direcciones con los lotes que quedan cerca,
// si a cada lote ya le tocaba (con la programación del mes cargada en este equipo) y el enlace al mapa con todo marcado.
// La lógica está en ubicardir.js y la libreta en lugares.js; aquí solo la pantalla.
//
// iniciarUbicar({ libreta, infoLote(l) → { dir, frec } | null, existeLote(texto) → { lote, mr } | null,
//                 hayProgramacion(), veredicto(l) → { estado, html } | null (sin programación cargada), copiar(texto, listo) })
import { $, toast, confirmar } from './ui.js';
import { esc } from './util.js';
import { partirMensaje, ubicarItems, crearCargadorLotes, zonaDeIndice, urlMapa, textoResumen, titulo, rotulo, idLote, nombreSugerido, RADIO } from './ubicardir.js';

function cargarScript(src) {
    return new Promise(function (listo, mal) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = listo;
        s.onerror = function () { s.remove(); mal(new Error('No se pudo descargar ' + src + '. Revise la conexión.')); };
        document.head.appendChild(s);
    });
}
// El mismo motor del mapa rápido (script clásico): se descarga la primera vez que se usa la herramienta
async function cargarMotor() {
    if (!window.leerDireccion) await cargarScript('js/direcciones.js');
    if (!window.crucesCalles) await cargarScript('data/rapido/cruces.js').catch(function () {});
}

export function iniciarUbicar(dep) {
    var dlg = $('dlg-ubicar'), lotesEn = crearCargadorLotes();
    var items = [], lugares = [], libretaError = '', turno = 0, ocupado = false, formAbierto = -1;

    function hayQueRevisar(it) {
        return !!it.error || !it.lotes.length || /^cercana/.test(it.aprox) || it.sinAncla || (it.tipo === 'via' && it.otrosTramos > 0 && !it.lotes.length);
    }
    function distTxt(l) { return l.libreta ? 'libreta: «' + esc(l.libreta) + '»' : l.dist === 0 ? 'la dirección cae dentro' : 'a ' + l.dist + ' m'; }
    function urlLote(l) { return 'mapa_rapido.html?' + (l.lote ? 'lote=' + encodeURIComponent(l.lote) : 'mr=' + encodeURIComponent(l.mr)); }

    function htmlLote(l) {
        var info = dep.infoLote(l) || {}, v = dep.veredicto(l);
        return '<div class="ud-lote">' +
            '<div class="ud-lote-tit"><a href="' + esc(urlLote(l)) + '" target="_blank" rel="noopener"><b>' + esc(rotulo(l)) + '</b></a>' +
                '<span class="sub">' + [l.lote && l.mr ? esc(l.mr) : '', (l.cuad || info.cuad) ? 'cuadrilla ' + esc(l.cuad || info.cuad) : '', info.frec ? esc(info.frec.toLowerCase()) : '', distTxt(l)].filter(Boolean).join(' · ') + '</span></div>' +
            (info.dir ? '<div class="sub ud-dir">' + esc(info.dir) + '</div>' : '') +
            (v ? '<div class="ud-ver ' + esc(v.estado) + '">' + v.html + '</div>' : '') +
            '</div>';
    }
    function htmlForm(it, i) {
        var l = it.lotes[0];
        return '<form class="ud-form" data-i="' + i + '">' +
            '<label>Nombre como lo dice la gente<input type="text" name="nombre" maxlength="80" required value="' + esc(nombreSugerido(it)) + '"></label>' +
            '<label>Lote o microrruta<input type="text" name="lote" required inputmode="text" placeholder="386 o Z2CC0188" value="' + esc(l ? idLote(l) : '') + '"></label>' +
            (it.punto && it.tipo !== 'via' ? '<label class="fotos-check"><input type="checkbox" name="punto" checked> Guardar también el punto del mapa</label>' : '') +
            '<div class="ud-form-acc"><button type="button" class="secundario pequeno" data-ud="cancelar">Cancelar</button>' +
            '<button type="submit" class="primario pequeno">📒 Guardar en la libreta</button></div></form>';
    }
    function htmlItem(it, i) {
        var revisar = hayQueRevisar(it), uno = urlMapa([it]);
        var nota = it.error ? it.error : !it.lotes.length ? 'No hay lotes a menos de ' + RADIO + ' m de este punto.' :
            it.sinAncla ? 'Esta vía está en ' + (it.otrosTramos + 1) + ' sectores distintos y el mensaje no trae otra dirección para saber cuál: se muestra el tramo más largo.' :
            it.tipo === 'via' && it.otrosTramos ? 'Esta vía también existe en ' + it.otrosTramos + (it.otrosTramos === 1 ? ' sector más' : ' sectores más') + ': se tomó el más cercano a las otras direcciones.' : '';
        return '<article class="ud-item' + (revisar ? ' revisar' : '') + '">' +
            '<div class="ud-tit"><span class="ud-num">' + it.n + '</span><b>' + esc(titulo(it)) + '</b>' +
                (it.aprox ? '<span class="ud-prec' + (/^cercana/.test(it.aprox) ? ' ojo' : '') + '">' + esc(it.aprox.replace(/, confírmela en el mapa$/, '')) + '</span>' : '') + '</div>' +
            (it.texto !== titulo(it) ? '<div class="sub ud-orig">«' + esc(it.texto) + '»</div>' : '') +
            it.lotes.slice(0, 3).map(htmlLote).join('') +
            (it.lotes.length > 3 ? '<details class="ud-mas"><summary>Ver ' + (it.lotes.length - 3) + (it.lotes.length === 4 ? ' lote más lejano' : ' lotes más lejanos') + '</summary>' + it.lotes.slice(3).map(htmlLote).join('') + '</details>' : '') +
            (nota ? '<div class="ud-nota' + (it.error || !it.lotes.length ? ' mal' : '') + '">' + esc(nota) + '</div>' : '') +
            (formAbierto === i ? htmlForm(it, i) :
                '<div class="ud-acc">' + (uno ? '<a class="boton secundario pequeno" href="' + esc(uno) + '" target="_blank" rel="noopener">🗺️ Ver en el mapa</a>' : '') +
                '<button type="button" class="secundario pequeno" data-ud="guardar" data-i="' + i + '">📒 Guardar nombre</button></div>') +
            '</article>';
    }
    function pintar() {
        var con = items.filter(function (x) { return x.n != null; }), sin = items.filter(function (x) { return x.n == null; });
        var revisar = con.filter(hayQueRevisar).length, solo = $('ud-solo').checked && revisar > 0;
        $('ud-contadores').hidden = !items.length;
        $('ud-cuenta').innerHTML = !con.length ? (items.length ? 'No se encontró ninguna dirección en lo pegado.' : '') :
            '<b>' + con.length + '</b> ' + (con.length === 1 ? 'dirección' : 'direcciones') + ' · <span class="ud-bien"><b>' + (con.length - revisar) + '</b> con lote</span>' +
            (revisar ? ' · <span class="ud-mal"><b>' + revisar + '</b> por revisar</span>' : '');
        $('ud-solo-caja').hidden = !revisar || con.length < 4;
        $('ud-sin-prog').hidden = !con.length || dep.hayProgramacion();
        $('ud-lista').innerHTML = items.map(function (it, i) { return it.n == null || (solo && !hayQueRevisar(it)) ? '' : htmlItem(it, i); }).join('') +
            (sin.length ? '<details class="ud-sin"' + (formAbierto >= 0 && items[formAbierto].n == null ? ' open' : '') + '><summary>' + sin.length +
                (sin.length === 1 ? ' renglón sin dirección' : ' renglones sin dirección') + '</summary>' +
                items.map(function (it, i) {
                    if (it.n != null) return '';
                    return '<div class="ud-sin-fila"><span>' + esc(it.texto) + '</span>' + (formAbierto === i ? htmlForm(it, i) :
                        '<button type="button" class="secundario pequeno" data-ud="guardar" data-i="' + i + '">📒 Es un lugar</button>') + '</div>';
                }).join('') + '</details>' : '');
        var url = urlMapa(con);
        $('ud-mapa').hidden = !url;
        if (url) $('ud-mapa').href = url;
        $('ud-copiar').disabled = !con.length;
        $('ud-limpiar').hidden = !items.length && !$('ud-texto').value;
    }
    function pintarLibreta() {
        $('ud-libreta-n').textContent = libretaError ? '' : '(' + lugares.length + ')';
        $('ud-libreta-lista').innerHTML = libretaError ? '<div class="ud-nota mal">' + esc(libretaError) + '</div>' :
            !lugares.length ? '<div class="sub">Todavía no hay nombres guardados. Cuando sepa a qué lote corresponde un sitio («La Cañada», «el segundo parqueadero»), guárdelo con 📒 y la próxima vez se reconoce solo.</div>' :
            lugares.map(function (l) {
                return '<div class="ud-lugar"><span><b>' + esc(l.nombre) + '</b> → ' + esc(l.lote ? 'Lote ' + l.lote : l.microrruta || 'punto en el mapa') + (l.lat != null ? ' 📍' : '') + '</span>' +
                    (l.mio !== false ? '<button type="button" class="secundario pequeno" data-ud="borrar" data-id="' + esc(l.id) + '" title="Quitar de la libreta">✕</button>' : '') + '</div>';
            }).join('');
    }
    async function cargarLibreta() {
        if (!dep.libreta) { libretaError = 'La libreta necesita la base de datos.'; lugares = []; return pintarLibreta(); }
        try { lugares = await dep.libreta.leer(); libretaError = ''; } catch (e) { lugares = []; libretaError = e.message; }
        pintarLibreta();
    }

    async function ubicar() {
        var texto = $('ud-texto').value.trim();
        if (!texto) { $('ud-estado').textContent = 'Pegue primero el mensaje con las direcciones.'; $('ud-texto').focus(); return; }
        if (ocupado) return;
        var mio = ++turno;
        ocupado = true; formAbierto = -1;
        $('ud-ubicar').disabled = true;
        $('ud-estado').textContent = 'Preparando el buscador de direcciones…';
        try {
            await cargarMotor();
            var zona = zonaDeIndice(await lotesEn.indice());
            var nuevos = partirMensaje(texto, window.leerDireccion);
            var total = nuevos.filter(function (x) { return x.tipo !== 'texto'; }).length;
            await ubicarItems(nuevos, {
                ubicarDireccion: window.ubicarDireccion, cruces: window.crucesCalles || null, lotesEn: lotesEn, zona: zona, libreta: lugares,
                avance: function (i, n) { if (mio === turno && i < n) $('ud-estado').textContent = 'Ubicando ' + (i + 1) + ' de ' + n + ' renglones…'; }
            });
            if (mio !== turno) return; // se cerró o se limpió mientras buscaba
            items = nuevos;
            $('ud-estado').textContent = total ? '' : 'No se encontró ninguna dirección. Deben venir como «Cra 85 # 76C-18», «Cl 76AD 85C 11» o «calle 76CC».';
            pintar();
        } catch (e) {
            if (mio === turno) $('ud-estado').textContent = 'No se pudo ubicar: ' + ((e && e.message) || e);
        } finally {
            if (mio === turno) { ocupado = false; $('ud-ubicar').disabled = false; }
        }
    }
    function limpiar() {
        turno++; ocupado = false; items = []; formAbierto = -1;
        $('ud-texto').value = ''; $('ud-estado').textContent = ''; $('ud-ubicar').disabled = false; $('ud-solo').checked = false;
        pintar();
    }

    $('btn-ubicar').onclick = function () { limpiar(); dlg.showModal(); cargarLibreta(); $('ud-texto').focus(); };
    dlg.addEventListener('close', limpiar);
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); }); // tocar afuera
    $('ud-x').onclick = $('ud-cerrar').onclick = function () { dlg.close(); };
    $('ud-ubicar').onclick = ubicar;
    $('ud-limpiar').onclick = function () { limpiar(); $('ud-texto').focus(); };
    $('ud-texto').addEventListener('input', function () { $('ud-limpiar').hidden = !items.length && !this.value; });
    $('ud-solo').onchange = pintar;
    $('ud-copiar').onclick = function () {
        dep.copiar(textoResumen(items, function (l) { var v = dep.veredicto(l); return v ? v.html.replace(/&amp;/g, '&') : ''; }), 'Resumen copiado');
    };
    $('ud-lista').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-ud]');
        if (!b) return;
        if (b.dataset.ud === 'guardar') { formAbierto = +b.dataset.i; pintar(); var f = $('ud-lista').querySelector('.ud-form input'); if (f) f.focus(); }
        if (b.dataset.ud === 'cancelar') { formAbierto = -1; pintar(); }
    });
    $('ud-lista').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var f = ev.target, it = items[+f.dataset.i], boton = f.querySelector('[type="submit"]');
        if (!dep.libreta) return toast('La libreta necesita la base de datos.');
        var lote = dep.existeLote(f.elements.lote.value);
        if (!lote) { toast('«' + f.elements.lote.value.trim() + '» no es un lote ni una microrruta de la programación. Revise el número.'); f.elements.lote.focus(); return; }
        var conPunto = f.elements.punto && f.elements.punto.checked && it.punto;
        boton.disabled = true; boton.textContent = 'Guardando…';
        try {
            await dep.libreta.guardar({ nombre: f.elements.nombre.value, lote: lote.lote, microrruta: lote.lote ? '' : lote.mr, lat: conPunto ? it.punto.lat : null, lon: conPunto ? it.punto.lng : null });
            toast('Guardado en la libreta: la próxima vez se reconoce solo.');
            formAbierto = -1;
            await cargarLibreta();
            if (dlg.open && $('ud-texto').value.trim()) ubicar(); else pintar();
        } catch (e) {
            toast(e.message);
            boton.disabled = false; boton.textContent = '📒 Guardar en la libreta';
        }
    });
    $('ud-libreta-lista').addEventListener('click', async function (ev) {
        var b = ev.target.closest('[data-ud="borrar"]');
        if (!b) return;
        var l = lugares.filter(function (x) { return x.id === b.dataset.id; })[0];
        if (!l || !(await confirmar('Quitar de la libreta', '«' + l.nombre + '» dejará de reconocerse en los mensajes, para todo el equipo.', 'Quitar'))) return;
        try { await dep.libreta.borrar(l.id); toast('Se quitó «' + l.nombre + '».'); await cargarLibreta(); } catch (e) { toast(e.message); }
    });
    pintar();
}
