// Foto con marca de agua: se toma con la cámara del celular y se le escribe encima la fecha y hora, las coordenadas del GPS,
// la dirección, un texto propio (#Interventoria #Nombre), un mapa pequeño con el punto y el logo. Todo se configura y se
// guarda en este celular. Las coordenadas salen en un formato que el mapa rápido sabe leer después (📷 Ubicar con foto).
// Solo cámara, no galería: la fecha y el GPS son los del momento de la foto, no se pueden poner a mano.
(function () {
    var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var dos = function (n) { return (n < 10 ? '0' : '') + n; };

    // ---------- Formatos (también los usan las pruebas) ----------
    var FECHAS = {
        corta: { nombre: '24 oct 2026 14:29:35', f: function (d) { return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()); } },
        numeros: { nombre: '24/10/2026 14:29:35', f: function (d) { return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()); } },
        ampm: { nombre: '24/10/2026 2:29:35 p. m.', f: function (d) { var h = d.getHours() % 12 || 12; return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + h + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()) + (d.getHours() < 12 ? ' a. m.' : ' p. m.'); } },
        iso: { nombre: '2026-10-24 14:29:35', f: function (d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()); } }
    };
    function gms(v, pos, neg) {
        var a = Math.abs(v), g = Math.floor(a), m = Math.floor((a - g) * 60), s = ((a - g) * 60 - m) * 60;
        if (s >= 59.95) { s = 0; m++; } if (m === 60) { m = 0; g++; }
        return g + '°' + m + "'" + s.toFixed(1) + '"' + (v < 0 ? neg : pos);
    }
    var COORDS = {
        hemisferio: { nombre: '6.28068N 75.54657W', f: function (la, lo) { return Math.abs(la).toFixed(5) + (la < 0 ? 'S' : 'N') + ' ' + Math.abs(lo).toFixed(5) + (lo < 0 ? 'W' : 'E'); } },
        decimal: { nombre: '6.280680, -75.546570', f: function (la, lo) { return la.toFixed(6) + ', ' + lo.toFixed(6); } },
        gms: { nombre: '6°16\'50.4"N 75°32\'47.7"W', f: function (la, lo) { return gms(la, 'N', 'S') + ' ' + gms(lo, 'E', 'W'); } }
    };
    window.marcaFormatos = {
        fecha: function (d, k) { return (FECHAS[k] || FECHAS.corta).f(d); },
        coords: function (la, lo, k) { return (COORDS[k] || COORDS.hemisferio).f(la, lo); }
    };
    if (typeof document === 'undefined') return;

    // ---------- Configuración (en este celular) ----------
    var CLAVE = 'camara_marca';
    var BASE = { fecha: true, formatoFecha: 'corta', coords: true, formatoCoords: 'hemisferio', direccion: false, texto: '',
        mapa: true, tipoMapa: 'calles', logo: null, logoEsquina: 'ar-der', logoTam: 30, logoOpac: 80,
        tamTexto: 'm', color: '#ffffff', esquinaTexto: 'ab-der' };
    function leerConf() { try { return Object.assign({}, BASE, JSON.parse(localStorage.getItem(CLAVE)) || {}); } catch (e) { return Object.assign({}, BASE); } }
    function guardarConf() { try { localStorage.setItem(CLAVE, JSON.stringify(conf)); } catch (e) { aviso('No se pudo guardar la configuración (¿logo muy pesado?).'); } }
    var conf = leerConf();

    var css = '' +
        '#cam-dlg { border: 0; padding: 0; width: min(760px, 100%); max-width: 100%; max-height: 100%; border-radius: 14px; color: #1f2937; }' +
        '#cam-dlg::backdrop { background: rgba(0,0,0,.6); }' +
        '#cam-dlg .cab { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #dce4e8; position: sticky; top: 0; background: #fff; z-index: 1; }' +
        '#cam-dlg .cab b { flex: 1; font-size: 17px; }' +
        '#cam-dlg .cuerpo { padding: 10px 12px 14px; display: grid; gap: 10px; }' +
        '#cam-vista { display: block; max-width: 100%; max-height: 52vh; margin: 0 auto; border-radius: 8px; background: #e5e7eb; }' +
        '#cam-estado { font-size: 13px; color: #64748b; text-align: center; min-height: 18px; }' +
        '#cam-dlg .botones { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }' +
        '#cam-dlg .botones button { padding: 12px; font-size: 15px; }' +
        '#cam-dlg button:disabled { opacity: .5; cursor: default; }' +
        '#cam-ajustes { display: grid; gap: 10px; border-top: 1px solid #dce4e8; padding-top: 10px; }' +
        '#cam-ajustes fieldset { border: 1px solid #dce4e8; border-radius: 10px; padding: 8px 10px 10px; margin: 0; display: grid; gap: 8px; }' +
        '#cam-ajustes legend { font-weight: 700; padding: 0 4px; }' +
        '#cam-ajustes label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }' +
        '#cam-ajustes select, #cam-ajustes textarea { font: inherit; font-size: 16px; border: 1px solid #b8c6cd; border-radius: 8px; padding: 6px 8px; background: #fff; color: inherit; }' +
        '#cam-ajustes select { flex: 1; min-width: 0; }' +
        '#cam-ajustes textarea { width: 100%; resize: vertical; }' +
        '#cam-ajustes input[type=range] { flex: 1; min-width: 120px; }' +
        '#cam-ajustes input[type=checkbox] { width: 20px; height: 20px; }' +
        '#cam-logo-vista { max-height: 48px; max-width: 160px; background: #f3f6f5; border-radius: 6px; }' +
        '.cam-fab { position: fixed; right: 14px; bottom: calc(88px + env(safe-area-inset-bottom)); z-index: 1001; width: 56px; height: 56px; padding: 0; border-radius: 50%; font-size: 26px; box-shadow: 0 4px 14px rgba(0,0,0,.3); }' +
        'body.con-ficha .cam-fab, body.con-sel .cam-fab { display: none; }' +
        '@media (max-width: 760px) { #cam-dlg { border-radius: 0; height: 100%; } }';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    function opciones(obj, sel) {
        return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + obj[k].nombre.replace(/"/g, '&quot;') + '</option>'; }).join('');
    }
    var ESQUINAS = { 'ar-der': { nombre: 'Arriba a la derecha' }, 'ar-izq': { nombre: 'Arriba a la izquierda' }, 'ab-der': { nombre: 'Abajo a la derecha' }, 'ab-izq': { nombre: 'Abajo a la izquierda' } };
    var ABAJO = { 'ab-der': { nombre: 'Abajo a la derecha' }, 'ab-izq': { nombre: 'Abajo a la izquierda' } };
    var TAMANOS = { s: { nombre: 'Pequeña' }, m: { nombre: 'Mediana' }, l: { nombre: 'Grande' } };
    var COLORES = { '#ffffff': { nombre: 'Blanco' }, '#ffd400': { nombre: 'Amarillo' }, '#000000': { nombre: 'Negro' } };
    var MAPAS = { calles: { nombre: 'Calles' }, satelite: { nombre: 'Satélite' } };

    var dlg = document.createElement('dialog');
    dlg.id = 'cam-dlg';
    dlg.innerHTML =
        '<div class="cab"><b>📸 Foto con marca de agua</b><button type="button" class="secundario" id="cam-cerrar" aria-label="Cerrar">✕</button></div>' +
        '<div class="cuerpo">' +
            '<canvas id="cam-vista" width="800" height="600"></canvas>' +
            '<div id="cam-estado"></div>' +
            '<div class="botones">' +
                '<button type="button" class="primario" id="cam-compartir" disabled>📤 Compartir</button>' +
                '<button type="button" class="secundario" id="cam-guardar" disabled>💾 Guardar</button>' +
                '<button type="button" class="secundario" id="cam-otra">📸 Tomar foto</button>' +
                '<button type="button" class="secundario" id="cam-ver-ajustes" aria-expanded="false">⚙️ Ajustes</button>' +
            '</div>' +
            '<div id="cam-ajustes" hidden>' +
                '<fieldset><legend>Fecha y hora</legend>' +
                    '<label><input type="checkbox" data-c="fecha"> Mostrar</label>' +
                    '<label>Formato <select data-c="formatoFecha">' + opciones(FECHAS, conf.formatoFecha) + '</select></label></fieldset>' +
                '<fieldset><legend>Coordenadas GPS</legend>' +
                    '<label><input type="checkbox" data-c="coords"> Mostrar</label>' +
                    '<label>Formato <select data-c="formatoCoords">' + opciones(COORDS, conf.formatoCoords) + '</select></label>' +
                    '<label><input type="checkbox" data-c="direccion"> Dirección aproximada (necesita internet)</label></fieldset>' +
                '<fieldset><legend>Información adicional</legend>' +
                    '<textarea data-c="texto" rows="2" placeholder="#Interventoria #Nombre Apellido"></textarea></fieldset>' +
                '<fieldset><legend>Texto</legend>' +
                    '<label>Tamaño <select data-c="tamTexto">' + opciones(TAMANOS, conf.tamTexto) + '</select></label>' +
                    '<label>Color <select data-c="color">' + opciones(COLORES, conf.color) + '</select></label>' +
                    '<label>Lugar <select data-c="esquinaTexto">' + opciones(ABAJO, conf.esquinaTexto) + '</select></label></fieldset>' +
                '<fieldset><legend>Mapa pequeño</legend>' +
                    '<label><input type="checkbox" data-c="mapa"> Mostrar (en la otra esquina de abajo; necesita internet)</label>' +
                    '<label>Tipo <select data-c="tipoMapa">' + opciones(MAPAS, conf.tipoMapa) + '</select></label></fieldset>' +
                '<fieldset><legend>Logo (marca de agua)</legend>' +
                    '<label><img id="cam-logo-vista" alt="" hidden><button type="button" class="secundario" id="cam-logo-elegir">Elegir imagen</button>' +
                        '<button type="button" class="secundario" id="cam-logo-quitar">Quitar</button></label>' +
                    '<input type="file" id="cam-logo-archivo" accept="image/*" hidden>' +
                    '<label>Lugar <select data-c="logoEsquina">' + opciones(ESQUINAS, conf.logoEsquina) + '</select></label>' +
                    '<label>Tamaño <input type="range" min="10" max="60" step="1" data-c="logoTam"></label>' +
                    '<label>Opacidad <input type="range" min="20" max="100" step="5" data-c="logoOpac"></label></fieldset>' +
            '</div>' +
        '</div>';
    document.body.appendChild(dlg);
    var entrada = document.createElement('input');
    entrada.type = 'file'; entrada.accept = 'image/*'; entrada.setAttribute('capture', 'environment'); entrada.hidden = true;
    document.body.appendChild(entrada);
    var $ = function (id) { return document.getElementById(id); };
    var vista = $('cam-vista');

    var ops = {}, foto = null, datos = null, resultado = null, gpsPedido = null, turno = 0;
    function aviso(t) { if (ops.toast) ops.toast(t); }
    function estado(t) { $('cam-estado').textContent = t || ''; }

    // ---------- Ajustes ----------
    function pintarAjustes() {
        dlg.querySelectorAll('[data-c]').forEach(function (el) {
            var v = conf[el.dataset.c];
            if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
        });
        $('cam-logo-vista').hidden = !conf.logo;
        if (conf.logo) $('cam-logo-vista').src = conf.logo;
        $('cam-logo-quitar').hidden = !conf.logo;
    }
    dlg.addEventListener('input', function (ev) {
        var el = ev.target, k = el.dataset && el.dataset.c;
        if (!k) return;
        conf[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
        guardarConf();
        if (k === 'direccion' && conf.direccion && datos && datos.pos && datos.dir == null) buscarDireccion(datos);
        // Al escribir el texto se espera a que pare: redibujar una foto de 12 MP por letra se siente lento
        clearTimeout(dibujar.t);
        if (k === 'texto') dibujar.t = setTimeout(dibujar, 400); else dibujar();
    });
    $('cam-ver-ajustes').onclick = function () {
        var abrir = $('cam-ajustes').hidden;
        $('cam-ajustes').hidden = !abrir;
        this.setAttribute('aria-expanded', abrir);
        if (abrir) $('cam-ajustes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('cam-logo-elegir').onclick = function () { $('cam-logo-archivo').click(); };
    $('cam-logo-quitar').onclick = function () { conf.logo = null; guardarConf(); pintarAjustes(); dibujar(); };
    // El logo se guarda reducido (máx. 600 px, PNG para conservar la transparencia) para que quepa en el celular
    $('cam-logo-archivo').onchange = function () {
        var f = this.files[0]; this.value = '';
        if (!f) return;
        cargarImagen(URL.createObjectURL(f), true).then(function (img) {
            var e = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
            var cv = document.createElement('canvas');
            cv.width = Math.round(img.naturalWidth * e); cv.height = Math.round(img.naturalHeight * e);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            conf.logo = cv.toDataURL('image/png');
            logoImg = null;
            guardarConf(); pintarAjustes(); dibujar();
        }).catch(function () { aviso('No se pudo abrir esa imagen.'); });
    };

    // ---------- Foto ----------
    function cargarImagen(src, revocar) {
        return new Promise(function (ok, mal) {
            var img = new Image();
            if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
            img.onload = function () { if (revocar) URL.revokeObjectURL(src); ok(img); };
            img.onerror = function () { if (revocar) URL.revokeObjectURL(src); mal(new Error('imagen')); };
            img.src = src;
        });
    }
    // GPS: la lectura del mapa si es reciente y buena; si no, se pide una al tomar la foto (hasta 15 s)
    function pedirGps() {
        gpsPedido = new Promise(function (ok) {
            if (!navigator.geolocation) return ok(null);
            navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lng: p.coords.longitude, prec: p.coords.accuracy, hora: Date.now() }); },
                function () { ok(null); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 });
        });
    }
    function posicion() {
        var delMapa = ops.posicion && ops.posicion();
        var buena = delMapa && Date.now() - delMapa.hora < 60000 && delMapa.prec <= 50 ? delMapa : null;
        if (buena) return Promise.resolve(buena);
        return (gpsPedido || Promise.resolve(null)).then(function (p) {
            if (!p) return delMapa && Date.now() - delMapa.hora < 5 * 60000 ? delMapa : null;
            return delMapa && Date.now() - delMapa.hora < 60000 && delMapa.prec < p.prec ? delMapa : p;
        });
    }
    function buscarDireccion(d) {
        if (!ops.direccion || !d.pos) return;
        d.dir = '';
        ops.direccion(d.pos).then(function (t) { if (datos === d) { d.dir = t || ''; dibujar(); } });
    }
    entrada.onchange = function () {
        var f = this.files[0]; this.value = '';
        if (!f) return;
        // La hora de la foto: la del archivo si es de hace unos minutos (la cámara la acaba de guardar), si no la de ahora
        var hora = f.lastModified && Math.abs(Date.now() - f.lastModified) < 5 * 60000 ? new Date(f.lastModified) : new Date();
        var d = { fecha: hora, pos: null, dir: null };
        datos = d; resultado = null; botones(false);
        if (!dlg.open) dlg.showModal();
        estado('Abriendo la foto y leyendo el GPS…');
        Promise.all([cargarImagen(URL.createObjectURL(f), true), posicion()]).then(function (r) {
            if (datos !== d) return;
            foto = r[0]; d.pos = r[1];
            if (d.pos && conf.direccion) buscarDireccion(d);
            dibujar();
        }).catch(function () { estado('No se pudo abrir la foto.'); });
    };
    function tomar() { pedirGps(); entrada.click(); }
    $('cam-otra').onclick = tomar;
    $('cam-cerrar').onclick = function () { dlg.close(); };

    // ---------- Dibujo ----------
    var logoImg = null, tiles = {};
    function logo() {
        if (!conf.logo) return Promise.resolve(null);
        if (logoImg && logoImg.src === conf.logo) return Promise.resolve(logoImg);
        return cargarImagen(conf.logo).then(function (i) { return (logoImg = i); }, function () { return null; });
    }
    var TILES = { calles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' };
    var ATRIB = { calles: '© OpenStreetMap', satelite: '© Esri' };
    function tile(tipo, z, x, y) {
        var url = TILES[tipo].replace('{z}', z).replace('{x}', x).replace('{y}', y);
        if (!tiles[url]) tiles[url] = Promise.race([cargarImagen(url), new Promise(function (_, mal) { setTimeout(mal, 8000); })]).catch(function () { delete tiles[url]; return null; });
        return tiles[url];
    }
    // Mapa de ~600 m alrededor del punto (zoom 16) con el pin rojo en el centro; sin internet devuelve null
    function miniMapa(pos, tipo) {
        var z = 16, n = 256 * Math.pow(2, z), lado = 300;
        var cx = (pos.lng + 180) / 360 * n, s = Math.sin(pos.lat * Math.PI / 180);
        var cy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
        var x0 = cx - lado / 2, y0 = cy - lado / 2, pedidos = [];
        for (var tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + lado) / 256); tx++)
            for (var ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + lado) / 256); ty++)
                pedidos.push({ x: tx, y: ty, img: tile(tipo, z, tx, ty) });
        return Promise.all(pedidos.map(function (p) { return p.img; })).then(function (imgs) {
            if (imgs.some(function (i) { return !i; })) return null;
            var cv = document.createElement('canvas'); cv.width = cv.height = lado;
            var c = cv.getContext('2d');
            pedidos.forEach(function (p, i) { c.drawImage(imgs[i], p.x * 256 - x0, p.y * 256 - y0); });
            return cv;
        });
    }
    function pin(c, x, y, r) {
        c.save();
        c.beginPath();
        c.moveTo(x, y);
        c.bezierCurveTo(x - r * 0.3, y - r * 0.9, x - r, y - r * 1.4, x - r, y - r * 2);
        c.arc(x, y - r * 2, r, Math.PI, 0);
        c.bezierCurveTo(x + r, y - r * 1.4, x + r * 0.3, y - r * 0.9, x, y);
        c.fillStyle = '#e53935'; c.strokeStyle = '#fff'; c.lineWidth = r * 0.25;
        c.fill(); c.stroke();
        c.beginPath(); c.arc(x, y - r * 2, r * 0.38, 0, 2 * Math.PI); c.fillStyle = '#7f1d1d'; c.fill();
        c.restore();
    }
    function lineas() {
        var d = datos, l = [];
        if (conf.fecha) l.push(window.marcaFormatos.fecha(d.fecha, conf.formatoFecha));
        if (conf.coords && d.pos) l.push(window.marcaFormatos.coords(d.pos.lat, d.pos.lng, conf.formatoCoords));
        if (conf.coords && conf.direccion && d.pos && d.dir) l.push(d.dir);
        String(conf.texto || '').split('\n').forEach(function (t) { if (t.trim()) l.push(t.trim()); });
        return l;
    }
    // Se dibuja la foto entera (sin pasar de ~16 MP, el máximo de algunos celulares) y encima la marca
    function dibujar() {
        if (!foto || !datos) return;
        var mio = ++turno, d = datos;
        botones(false);
        estado(d.pos ? 'GPS ±' + Math.round(d.pos.prec) + ' m' : '⚠️ Sin GPS: la foto sale sin coordenadas. Active la ubicación precisa.');
        var esc = Math.min(1, Math.sqrt(16e6 / (foto.naturalWidth * foto.naturalHeight)));
        var W = Math.round(foto.naturalWidth * esc), H = Math.round(foto.naturalHeight * esc);
        var mapa = conf.mapa && d.pos ? miniMapa(d.pos, conf.tipoMapa) : Promise.resolve(null);
        Promise.all([logo(), mapa]).then(function (r) {
            if (mio !== turno) return;
            var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            var c = cv.getContext('2d');
            c.drawImage(foto, 0, 0, W, H);
            var corto = Math.min(W, H), m = Math.round(corto * 0.025);
            var der = conf.esquinaTexto !== 'ab-izq';
            // Mapa pequeño: en la esquina de abajo contraria al texto
            if (r[1]) {
                var lado = Math.round(corto * 0.3), mx = der ? 0 : W - lado, my = H - lado;
                c.drawImage(r[1], mx, my, lado, lado);
                c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = Math.max(2, corto * 0.004); c.strokeRect(mx, my, lado, lado);
                pin(c, mx + lado / 2, my + lado / 2, lado * 0.045);
                c.font = Math.round(lado * 0.045) + 'px Arial, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'bottom';
                c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(mx, my + lado - lado * 0.065, c.measureText(ATRIB[conf.tipoMapa]).width + lado * 0.04, lado * 0.065);
                c.fillStyle = '#333'; c.fillText(ATRIB[conf.tipoMapa], mx + lado * 0.02, my + lado - lado * 0.01);
            }
            // Logo
            if (r[0]) {
                var lw = Math.round(W * conf.logoTam / 100), lh = Math.round(lw * r[0].naturalHeight / r[0].naturalWidth);
                var lx = /der/.test(conf.logoEsquina) ? W - lw - m : m, ly = /^ar/.test(conf.logoEsquina) ? m : H - lh - m;
                c.globalAlpha = conf.logoOpac / 100; c.drawImage(r[0], lx, ly, lw, lh); c.globalAlpha = 1;
            }
            // Texto: abajo, alineado a su esquina, con borde oscuro para que se lea sobre cualquier fondo
            var tam = Math.round(corto * { s: 0.03, m: 0.038, l: 0.048 }[conf.tamTexto]), ls = lineas();
            c.font = '600 ' + tam + 'px Arial, Helvetica, sans-serif';
            c.textAlign = der ? 'right' : 'left'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
            var oscuro = conf.color === '#000000';
            for (var i = ls.length - 1, y = H - m; i >= 0; i--, y -= Math.round(tam * 1.22)) {
                var x = der ? W - m : m;
                c.lineWidth = tam * 0.16; c.strokeStyle = oscuro ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.75)';
                c.strokeText(ls[i], x, y);
                c.fillStyle = conf.color; c.fillText(ls[i], x, y);
            }
            vista.width = W; vista.height = H;
            vista.getContext('2d').drawImage(cv, 0, 0);
            return new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', 0.92); });
        }).then(function (blob) {
            if (mio !== turno || !blob) return;
            var f = d.fecha;
            resultado = new File([blob], 'foto_' + f.getFullYear() + '-' + dos(f.getMonth() + 1) + '-' + dos(f.getDate()) + '_' + dos(f.getHours()) + '-' + dos(f.getMinutes()) + '-' + dos(f.getSeconds()) + '.jpg', { type: 'image/jpeg' });
            botones(true);
        });
    }
    function botones(si) { $('cam-compartir').disabled = $('cam-guardar').disabled = !si; }
    function descargar() {
        var a = document.createElement('a'), url = URL.createObjectURL(resultado);
        a.href = url; a.download = resultado.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        aviso('Foto guardada en Descargas.');
    }
    $('cam-guardar').onclick = function () { if (resultado) descargar(); };
    $('cam-compartir').onclick = function () {
        if (!resultado) return;
        if (navigator.canShare && navigator.canShare({ files: [resultado] })) navigator.share({ files: [resultado] }).catch(function () {});
        else descargar();
    };

    // ops: { posicion(): {lat,lng,prec,hora}|null, direccion(ll): Promise<texto|null>, toast(texto) }
    window.camaraMarca = function (o) {
        ops = o || {};
        pintarAjustes();
        var fab = document.createElement('button');
        fab.type = 'button'; fab.className = 'primario cam-fab'; fab.textContent = '📸';
        fab.title = 'Tomar foto con fecha, GPS y marca de agua'; fab.setAttribute('aria-label', 'Tomar foto con marca de agua');
        fab.onclick = tomar;
        document.body.appendChild(fab);
        return { tomar: tomar };
    };
})();
