// Respaldo en IndexedDB para lo que no se debe perder: en algunos celulares localStorage falla (lleno o bloqueado) y sin esto
// se olvida la sesión y lo que se está registrando.

var BASE = 'microrutas_respaldo', TABLA = 'kv', abierta = null;

function abrir() {
    if (abierta) return abierta;
    abierta = new Promise(function (ok, mal) {
        var pide = indexedDB.open(BASE, 1);
        pide.onupgradeneeded = function () { pide.result.createObjectStore(TABLA); };
        pide.onsuccess = function () { ok(pide.result); };
        pide.onerror = function () { mal(pide.error); };
        pide.onblocked = function () { mal(new Error('IndexedDB bloqueado')); };
    });
    abierta.catch(function () { abierta = null; });
    return abierta;
}
function operar(modo, fn) {
    return abrir().then(function (db) {
        return new Promise(function (ok, mal) {
            var tx = db.transaction(TABLA, modo), pide = fn(tx.objectStore(TABLA));
            tx.oncomplete = function () { ok(pide.result); };
            tx.onerror = tx.onabort = function () { mal(tx.error); };
        });
    });
}
export function respaldoLeer(clave) { return operar('readonly', function (t) { return t.get(clave); }); }
export function respaldoGuardar(clave, valor) { return operar('readwrite', function (t) { return t.put(valor, clave); }); }
export function respaldoBorrar(clave) { return operar('readwrite', function (t) { return t.delete(clave); }); }
// Todo lo guardado cuya clave empieza por prefijo -> { clave: valor }
export function respaldoTodo(prefijo) {
    return abrir().then(function (db) {
        return new Promise(function (ok, mal) {
            var out = {}, pide = db.transaction(TABLA, 'readonly').objectStore(TABLA).openCursor();
            pide.onsuccess = function () {
                var c = pide.result;
                if (!c) return ok(out);
                if (String(c.key).indexOf(prefijo) === 0) out[String(c.key).slice(prefijo.length)] = c.value;
                c.continue();
            };
            pide.onerror = function () { mal(pide.error); };
        });
    });
}

// Por qué falla localStorage, en palabras, para poder revisarlo: null si funciona
export function fallaLocalStorage() {
    try {
        localStorage.setItem('__prueba', '1');
        localStorage.removeItem('__prueba');
        return null;
    } catch (e) {
        var usado = 0;
        try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); usado += k.length + (localStorage.getItem(k) || '').length; } } catch (e2) {}
        return (e && e.name || 'Error') + ', ' + (usado / 524288).toFixed(1).replace('.', ',') + ' MB usados';
    }
}

// Si localStorage está lleno, se liberan las copias que se vuelven a bajar de la base: sin espacio no se guarda nada más
var COPIAS = ['subsanaciones_cache', 'pqr_cache', 'revisiones_cache'];
export function liberarEspacio() {
    try {
        localStorage.setItem('__prueba', '1');
        localStorage.removeItem('__prueba');
    } catch (e) {
        if (!/quota/i.test(String(e && e.name))) return;
        COPIAS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e2) {} });
    }
}

// Tercer sitio para la sesión: cookies, solo de esta aplicación, en trozos (cada cookie admite unos 4 KB).
// Es el último recurso de los celulares donde localStorage e IndexedDB no conservan nada entre recargas.
var TROZO = 3000, MAX_TROZOS = 8, DIAS = 30;
function nombreCookie(clave, i) { return 'mr_' + clave.replace(/[^a-z0-9]/gi, '_') + '_' + i; }
function ponerCookie(nombre, valor, segundos) {
    document.cookie = nombre + '=' + valor + '; path=' + location.pathname.replace(/[^/]*$/, '') + '; max-age=' + segundos + '; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
}
function borrarCookies(clave) { for (var i = 0; i < MAX_TROZOS; i++) ponerCookie(nombreCookie(clave, i), '', 0); }
function guardarCookies(clave, valor) {
    var texto = encodeURIComponent(valor), trozos = Math.ceil(texto.length / TROZO);
    borrarCookies(clave);
    if (trozos > MAX_TROZOS) return;
    for (var i = 0; i < trozos; i++) ponerCookie(nombreCookie(clave, i), texto.slice(i * TROZO, (i + 1) * TROZO), DIAS * 86400);
}
function leerCookies(clave) {
    var todas = {}, texto = '';
    document.cookie.split('; ').forEach(function (c) { var p = c.indexOf('='); todas[c.slice(0, p)] = c.slice(p + 1); });
    for (var i = 0; i < MAX_TROZOS && todas[nombreCookie(clave, i)]; i++) texto += todas[nombreCookie(clave, i)];
    try { return texto ? decodeURIComponent(texto) : null; } catch (e) { return null; }
}

// De varias copias de la sesión, la que vence más tarde. Cada renovación invalida el token anterior, y usar uno viejo
// hace que el servidor cierre la sesión: por eso no sirve la primera copia que aparezca
export function sesionMasReciente(copias) {
    var mejor = null, tope = -1;
    copias.forEach(function (v) {
        if (v == null) return;
        var vence = 0;
        try { vence = (JSON.parse(v) || {}).expires_at || 0; } catch (e) {}
        if (vence > tope) { tope = vence; mejor = v; }
    });
    return mejor;
}

// Por qué terminó la última sesión en este equipo, para la página de diagnóstico
var FIN = 'sesion_fin', motivoCierre = 'El servidor ya no aceptó la sesión';
export function cierrePedido() { motivoCierre = 'Se pulsó Salir'; }
function anotarFin() {
    var fin = { cuando: new Date().toISOString(), motivo: motivoCierre };
    try { localStorage.setItem(FIN, JSON.stringify(fin)); } catch (e) {}
    respaldoGuardar(FIN, fin).catch(function () {});
}
export async function leerFinSesion() {
    try { var v = await respaldoLeer(FIN); if (v) return v; } catch (e) {}
    try { return JSON.parse(localStorage.getItem(FIN)); } catch (e) { return null; }
}

// Almacén de la sesión de Supabase: se guarda en los tres sitios y se lee la copia más reciente de todas.
// La de memoria entra como una más: otra pestaña pudo renovar la sesión mientras esta estaba dormida
var enMemoria = {};
export var almacenSesion = {
    getItem: async function (clave) {
        var copias = [enMemoria[clave]];
        try { copias.push(await respaldoLeer('sesion:' + clave)); } catch (e) {}
        try { copias.push(localStorage.getItem(clave)); } catch (e) {}
        try { copias.push(leerCookies(clave)); } catch (e) {}
        return sesionMasReciente(copias);
    },
    setItem: async function (clave, valor) {
        enMemoria[clave] = valor;
        try { guardarCookies(clave, valor); } catch (e) {}
        try { localStorage.setItem(clave, valor); } catch (e) {}
        try { await respaldoGuardar('sesion:' + clave, valor); } catch (e) {}
    },
    removeItem: async function (clave) {
        if (/-auth-token$/.test(clave) && await almacenSesion.getItem(clave)) anotarFin();
        delete enMemoria[clave];
        try { borrarCookies(clave); } catch (e) {}
        try { localStorage.removeItem(clave); } catch (e) {}
        try { await respaldoBorrar('sesion:' + clave); } catch (e) {}
    }
};
