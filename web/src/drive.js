// Subir PDF a Google Drive de quien usa la app (✅ Revisión y 🧾 Instrumentos): inicio de sesión de Google en el navegador
// (Google Identity Services) con el permiso drive.file, que solo deja ver y crear los archivos que hace la app (no el
// resto del Drive). Cada PDF va a la carpeta «Instrumentos dd-mm-aaaa» y se comparte «cualquiera con el enlace» para
// pegarlo en el formulario. No hay servidor en medio: el archivo va del equipo a Drive.
//
// Necesita un ID de cliente OAuth de Google Cloud (tipo «Aplicación web», con los orígenes de la app). No es secreto
// (Google lo muestra en cada página que lo usa): va aquí o, mientras tanto, en el equipo (⚙ de la sección).
export var ID_CLIENTE = '931360801241-87o75er1am6v3n4obgvav7te5cp56mla.apps.googleusercontent.com';
var ALCANCE = 'https://www.googleapis.com/auth/drive.file';
var GIS = 'https://accounts.google.com/gsi/client';
var CLAVE_ID = 'drive_id_cliente', CLAVE_CORREO = 'drive_correo', CLAVE_PRINCIPAL = 'drive_carpeta', CLAVE_ULTIMA = 'drive_ultima_carpeta';
export var PRINCIPAL = 'Instrumentos interventoría';
var token = null, vence = 0, cliente = null, carpetas = {};

function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
export function idCliente() { return ID_CLIENTE || leer(CLAVE_ID); }
export function fijarIdCliente(v) { guardar(CLAVE_ID, String(v || '').trim()); cliente = null; }
export function correoDrive() { return leer(CLAVE_CORREO); }
export function fijarCorreoDrive(v) { guardar(CLAVE_CORREO, String(v || '').trim()); cliente = null; }
// Carpeta principal en «Mi unidad» (se cambia en ⚙ Drive); adentro, una por día
export function carpetaPrincipal() { return leer(CLAVE_PRINCIPAL) || PRINCIPAL; }
export function fijarCarpetaPrincipal(v) { guardar(CLAVE_PRINCIPAL, String(v || '').trim()); carpetas = {}; }
// Enlace de la última carpeta del día a la que se subió algo (para «Abrir la carpeta en Drive»)
export function ultimaCarpeta() { return leer(CLAVE_ULTIMA); }
// El permiso dura ~1 hora: se guarda en el equipo para que siga sirviendo al recargar o al cambiar de sección
// (solo deja tocar los archivos que creó la app). Desconectar lo borra
var CLAVE_TOKEN = 'drive_token';
try { var t0 = JSON.parse(localStorage.getItem(CLAVE_TOKEN) || 'null'); if (t0 && t0.v > Date.now()) { token = t0.t; vence = t0.v; } } catch (e) { /* sin almacenamiento */ }
export function conectado() { return !!token && Date.now() < vence; }

var gisListo = null;
function cargarGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    return gisListo || (gisListo = new Promise(function (ok, mal) {
        var s = document.createElement('script');
        s.src = GIS; s.async = true;
        s.onload = function () { ok(); };
        s.onerror = function () { gisListo = null; mal(new Error('No se pudo cargar el inicio de sesión de Google (revise la conexión).')); };
        document.head.appendChild(s);
    }));
}
// Se carga apenas se abre la página: así, al tocar «Conectar» o «Guardar», la ventana de Google sale en ese mismo toque
// (si sale después de una espera, el navegador la bloquea)
if (typeof document !== 'undefined' && idCliente()) cargarGis().catch(function () { /* se intenta otra vez al conectar */ });
function pedir(id, silencioso, ok, mal) {
    cliente = window.google.accounts.oauth2.initTokenClient({
        client_id: id, scope: ALCANCE, hint: correoDrive() || undefined,
        callback: function (r) {
            if (r.error) return mal(new Error(r.error === 'access_denied' ? 'No se dio permiso a Drive.' : 'Google no dio el permiso (' + r.error + ').'));
            token = r.access_token; vence = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
            try { localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ t: token, v: vence })); } catch (e) { /* sin almacenamiento */ }
            ok(token);
        },
        error_callback: function (e) { mal(new Error(e && e.type === 'popup_closed' ? 'Se cerró la ventana de Google sin dar permiso.' : 'No se abrió la ventana de Google (¿bloqueador de ventanas?). Toque «Conectar Drive» y vuelva a intentar.')); }
    });
    cliente.requestAccessToken({ prompt: silencioso ? '' : (token ? '' : 'consent') });
}
// Pide (o renueva) el permiso. Llamarla dentro del toque de la persona (sin esperas antes) para que la ventana no se bloquee
var pendiente = null;
export function conectar(silencioso) {
    if (conectado()) return Promise.resolve(token);
    if (pendiente) return pendiente;  // ya hay una ventana de Google abierta: se espera esa
    var id = idCliente();
    if (!id) return Promise.reject(new Error('Falta el ID de cliente de Google (⚙ Drive).'));
    pendiente = new Promise(function (ok, mal) {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) return pedir(id, silencioso, ok, mal);
        cargarGis().then(function () { pedir(id, silencioso, ok, mal); }, mal);
    });
    var limpiar = function () { pendiente = null; };
    pendiente.then(limpiar, limpiar);
    return pendiente;
}
// ---------- Leer una carpeta que hizo la persona (para traer el enlace de cada PDF) ----------
// drive.file no deja ver lo que no creó la app: para listar una carpeta hecha a mano se pide aparte el permiso de solo
// ver los nombres (drive.metadata.readonly). No deja abrir, cambiar ni borrar nada. Se pide en el toque del botón
var ALCANCE_LECTURA = 'https://www.googleapis.com/auth/drive.metadata.readonly', CLAVE_LECTURA = 'drive_token_lectura';
var lectura = null, venceLectura = 0, pendienteLectura = null;
try { var l0 = JSON.parse(localStorage.getItem(CLAVE_LECTURA) || 'null'); if (l0 && l0.v > Date.now()) { lectura = l0.t; venceLectura = l0.v; } } catch (e) { /* sin almacenamiento */ }
export function conectarLectura() {
    if (lectura && Date.now() < venceLectura) return Promise.resolve(lectura);
    if (pendienteLectura) return pendienteLectura;
    var id = idCliente();
    if (!id) return Promise.reject(new Error('Falta el ID de cliente de Google (⚙ Drive).'));
    pendienteLectura = new Promise(function (ok, mal) {
        var pedirL = function () {
            window.google.accounts.oauth2.initTokenClient({
                client_id: id, scope: ALCANCE_LECTURA, hint: correoDrive() || undefined,
                callback: function (r) {
                    if (r.error) return mal(new Error(r.error === 'access_denied' ? 'No se dio permiso para ver la carpeta.' : 'Google no dio el permiso (' + r.error + ').'));
                    lectura = r.access_token; venceLectura = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
                    try { localStorage.setItem(CLAVE_LECTURA, JSON.stringify({ t: lectura, v: venceLectura })); } catch (e) { /* sin almacenamiento */ }
                    ok(lectura);
                },
                error_callback: function (e) { mal(new Error(e && e.type === 'popup_closed' ? 'Se cerró la ventana de Google sin dar permiso.' : 'No se abrió la ventana de Google (¿bloqueador de ventanas?). Vuelva a tocar el botón.')); }
            }).requestAccessToken({ prompt: '' });
        };
        if (window.google && window.google.accounts && window.google.accounts.oauth2) pedirL(); else cargarGis().then(pedirL, mal);
    });
    var fin = function () { pendienteLectura = null; };
    pendienteLectura.then(fin, fin);
    return pendienteLectura;
}
// «https://drive.google.com/drive/u/3/folders/1tr…» → «1tr…» (también acepta el id solo o ?id=)
export function idCarpeta(url) {
    var t = String(url || '').trim(), m = /folders\/([\w-]{10,})/.exec(t) || /[?&]id=([\w-]{10,})/.exec(t);
    return m ? m[1] : /^[\w-]{20,}$/.test(t) ? t : '';
}
// Archivos de la carpeta (sin subcarpetas): [{ id, nombre, enlace, tipo }]
export async function archivosDeCarpeta(url) {
    var id = idCarpeta(url);
    if (!id) throw new Error('Ese no parece un enlace de carpeta de Drive (debe tener «/folders/…»).');
    var t = await conectarLectura(), out = [], pagina = '';
    do {
        var q = "'" + id + "' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'";
        var r = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,webViewLink,mimeType)&q=' + encodeURIComponent(q) + (pagina ? '&pageToken=' + pagina : ''),
            { headers: { Authorization: 'Bearer ' + t } });
        if (r.status === 401) { lectura = null; try { localStorage.removeItem(CLAVE_LECTURA); } catch (e) { /* nada */ } throw new Error('El permiso venció: vuelva a tocar el botón.'); }
        if (r.status === 404) throw new Error('No se encontró la carpeta (¿es de otra cuenta? Conecte la cuenta dueña de la carpeta).');
        if (!r.ok) throw new Error('Drive respondió ' + r.status + ': ' + (await r.text()).slice(0, 160));
        var d = await r.json();
        (d.files || []).forEach(function (f) { out.push({ id: f.id, nombre: f.name, enlace: f.webViewLink || 'https://drive.google.com/file/d/' + f.id + '/view', tipo: f.mimeType }); });
        pagina = d.nextPageToken || '';
    } while (pagina);
    return out;
}
// ---------- Emparejar archivos con lo que sea (rutas, lotes, placas…), por el nombre: reutilizable ----------
// Palabras del nombre, sin tildes y en mayúscula: «Z3R17DOM_Parque-Boston_22-11-2026.pdf» → [Z3R17DOM, PARQUE, BOSTON, 22, 11, 2026]
export function palabrasArchivo(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\.(PDF|ZIP|JPE?G|PNG|XLSX?|DOCX?|HEIC)$/, '').split(/[^A-Z0-9]+/).filter(Boolean); }
// archivos: [{ nombre, enlace, tipo }]. elementos: [{ id, claves: [...] (basta una en el nombre), requiere: [...] (todas),
// evita: [[...], …] (no puede tener todas las de ninguno), prioridad (los de mayor van primero) }].
// Cada archivo va a un solo elemento; se prefieren los PDF. Devuelve { enlaces: {id: enlace}, archivos: {id: nombre}, sinArchivo: [id], sobran: [nombre] }
export function emparejarArchivos(archivos, elementos) {
    var lista = (archivos || []).map(function (a) { return Object.assign({ p: palabrasArchivo(a.nombre), pdf: a.tipo === 'application/pdf' || /\.pdf$/i.test(a.nombre || '') }, a); });
    var tiene = function (a, w) { return a.p.indexOf(String(w).toUpperCase()) !== -1; };
    var usados = {}, enlaces = {}, nombres = {};
    (elementos || []).slice().sort(function (x, y) { return (y.prioridad || 0) - (x.prioridad || 0); }).forEach(function (el) {
        var cand = lista.filter(function (a) {
            return !usados[a.enlace] && (el.claves || []).some(function (c) { return tiene(a, c); }) &&
                (el.requiere || []).every(function (w) { return tiene(a, w); }) &&
                !(el.evita || []).some(function (g) { return g.length && g.every(function (w) { return tiene(a, w); }); });
        }).sort(function (a, b) { return (b.pdf ? 1 : 0) - (a.pdf ? 1 : 0); });
        if (cand.length) { enlaces[el.id] = cand[0].enlace; nombres[el.id] = cand[0].nombre; usados[cand[0].enlace] = 1; }
    });
    return { enlaces: enlaces, archivos: nombres, sinArchivo: (elementos || []).filter(function (el) { return !enlaces[el.id]; }).map(function (el) { return el.id; }),
        sobran: lista.filter(function (a) { return !usados[a.enlace]; }).map(function (a) { return a.nombre; }) };
}
// Todo en uno (para cualquier sección): lee la carpeta y le da a cada elemento el enlace de su archivo.
// Llamarla en el toque del botón (puede pedir el permiso de ver la carpeta). Recuerda la carpeta para la próxima
export async function buscarEnlaces(carpetaUrl, elementos) {
    var archivos = await archivosDeCarpeta(carpetaUrl);
    fijarCarpetaBuscada(carpetaUrl);
    return Object.assign({ total: archivos.length }, emparejarArchivos(archivos, elementos));
}
// Última carpeta leída (para no volver a pegarla)
export function carpetaBuscada() { return leer('drive_carpeta_busqueda'); }
export function fijarCarpetaBuscada(v) { guardar('drive_carpeta_busqueda', String(v || '').trim()); }
export function desconectar() {
    if (token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(token, function () {});
    token = null; vence = 0; carpetas = {};
    try { localStorage.removeItem(CLAVE_TOKEN); } catch (e) { /* sin almacenamiento */ }
}

async function api(url, opciones) {
    var r = await fetch(url, Object.assign({}, opciones, { headers: Object.assign({ Authorization: 'Bearer ' + token }, (opciones || {}).headers) }));
    if (r.status === 401) { token = null; vence = 0; try { localStorage.removeItem(CLAVE_TOKEN); } catch (e) { /* nada */ } throw new Error('La sesión de Google venció: vuelva a conectar Drive.'); }
    if (!r.ok) { var t = await r.text(); throw new Error('Drive respondió ' + r.status + ': ' + t.slice(0, 160)); }
    return r.json();
}
// Nombre de la carpeta del día: «23-11-2026»
export function nombreDia(fecha) {
    var p = String(fecha || '').split('-');
    return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : String(fecha || '');
}
// Ruta que se muestra: «Instrumentos interventoría › 23-11-2026»
// principal: otra carpeta principal (p. ej. «Subsanaciones»); sin ella, la de los instrumentos
export function nombreCarpeta(fecha, principal) { return (principal || carpetaPrincipal()) + ' › ' + nombreDia(fecha); }
// Busca (o crea) una carpeta por nombre dentro de otra ('root' = Mi unidad). Con el permiso drive.file solo se ven las
// carpetas que creó la app: si la persona hizo una a mano con el mismo nombre, la app crea la suya al lado
async function carpeta(nombre, padre) {
    var k = padre + '/' + nombre;
    if (carpetas[k]) return carpetas[k];
    var q = "name = '" + nombre.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and '" + padre + "' in parents and trashed = false";
    var hay = await api('https://www.googleapis.com/drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q));
    if (hay.files && hay.files.length) return (carpetas[k] = hay.files[0].id);
    var nueva = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] })
    });
    return (carpetas[k] = nueva.id);
}
// Sube el PDF (bytes) a la carpeta del día y lo comparte con enlace. Devuelve { id, enlace }.
// Si ya hay uno con el mismo nombre en esa carpeta (se volvió a guardar la revisión), lo reemplaza
export async function subirPdf(bytes, nombre, fecha, principal) {
    await conectar(true);
    var dir = await carpeta(nombreDia(fecha), await carpeta(principal || carpetaPrincipal(), 'root'));
    guardar(CLAVE_ULTIMA, 'https://drive.google.com/drive/folders/' + dir);
    var q = "name = '" + nombre.replace(/'/g, "\\'") + "' and '" + dir + "' in parents and trashed = false";
    var previo = (await api('https://www.googleapis.com/drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q))).files || [];
    var meta = previo.length ? {} : { name: nombre, parents: [dir], mimeType: 'application/pdf' };
    var limite = 'microrutas' + Math.random().toString(36).slice(2);
    var cuerpo = new Blob(['--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + limite + '\r\nContent-Type: application/pdf\r\n\r\n', bytes, '\r\n--' + limite + '--'], { type: 'multipart/related; boundary=' + limite });
    var url = previo.length ? 'https://www.googleapis.com/upload/drive/v3/files/' + previo[0].id + '?uploadType=multipart&fields=id,webViewLink'
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
    var f = await api(url, { method: previo.length ? 'PATCH' : 'POST', body: cuerpo });
    var compartido = 'cualquiera con el enlace';
    try {
        await api('https://www.googleapis.com/drive/v3/files/' + f.id + '/permissions?fields=id', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
    } catch (e) {
        // Las cuentas institucionales a veces no dejan compartir fuera de la organización: entonces, con la organización
        var dominio = (correoDrive().split('@')[1] || '').trim();
        compartido = 'sin compartir (la organización no lo permite)';
        if (dominio) {
            try {
                await api('https://www.googleapis.com/drive/v3/files/' + f.id + '/permissions?fields=id', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'domain', domain: dominio })
                });
                compartido = 'solo con ' + dominio;
            } catch (e2) { /* queda privado: el enlace sirve solo a quien tenga acceso */ }
        }
    }
    return { id: f.id, enlace: f.webViewLink || 'https://drive.google.com/file/d/' + f.id + '/view', compartido: compartido };
}
