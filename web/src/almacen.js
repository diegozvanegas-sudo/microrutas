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

// Almacén de la sesión de Supabase: en los dos sitios, y se lee de donde esté. Si ninguno sirve, queda solo en memoria
var enMemoria = {};
export var almacenSesion = {
    getItem: async function (clave) {
        if (clave in enMemoria) return enMemoria[clave];
        try { var v = await respaldoLeer('sesion:' + clave); if (v != null) return v; } catch (e) {}
        try { return localStorage.getItem(clave); } catch (e) { return null; }
    },
    setItem: async function (clave, valor) {
        enMemoria[clave] = valor;
        try { localStorage.setItem(clave, valor); } catch (e) {}
        try { await respaldoGuardar('sesion:' + clave, valor); } catch (e) {}
    },
    removeItem: async function (clave) {
        delete enMemoria[clave];
        try { localStorage.removeItem(clave); } catch (e) {}
        try { await respaldoBorrar('sesion:' + clave); } catch (e) {}
    }
};
