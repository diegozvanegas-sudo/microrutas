// Inicio de sesión con correo y contraseña (usuarios creados por el administrador en Supabase).
// Componente propio: arma su ventana, no necesita nada en el HTML.
import { almacenSesion, cierrePedido } from './almacen.js';
import { puede, entra, seccion, claveDeEnlace, clavePagina, primeraPermitida } from './secciones.js';

var ventana = null, cliente = null;

function crearVentana() {
    var d = document.createElement('dialog');
    d.id = 'dlg-ingreso';
    d.innerHTML =
        '<form class="cuerpo" method="dialog" autocomplete="on">' +
            '<h2>🌿 Ingresar</h2>' +
            '<p class="sub" style="margin:0 0 12px">Use el correo y la contraseña que le dio el administrador.</p>' +
            '<label>CORREO <input type="email" name="correo" autocomplete="username" required inputmode="email"></label>' +
            '<label style="margin-top:10px">CONTRASEÑA <input type="password" name="clave" autocomplete="current-password" required></label>' +
            '<div class="aviso error" data-error hidden style="margin:12px 0 0"></div>' +
            '<div class="pie"><button type="submit" class="primario">Ingresar</button></div>' +
            '<p class="sub" style="margin:12px 0 0;text-align:center"><a href="diagnostico.html">¿Le pide ingresar cada vez? Revisar este equipo</a></p>' +
        '</form>';
    // Sin sesión no hay nada que hacer en la página: no se puede cerrar con Esc
    d.addEventListener('cancel', function (ev) { ev.preventDefault(); });
    document.body.appendChild(d);
    return d;
}

function pedirIngreso(supabase) {
    ventana = ventana || crearVentana();
    var form = ventana.querySelector('form'), err = ventana.querySelector('[data-error]'), boton = form.querySelector('button');
    return new Promise(function (listo) {
        form.onsubmit = async function (ev) {
            ev.preventDefault();
            boton.disabled = true;
            boton.textContent = 'Ingresando…';
            err.hidden = true;
            var res = await supabase.auth.signInWithPassword({ email: form.correo.value.trim(), password: form.clave.value });
            boton.disabled = false;
            boton.textContent = 'Ingresar';
            if (res.error) {
                err.textContent = /invalid/i.test(res.error.message) ? 'Correo o contraseña incorrectos.'
                    : /fetch|network/i.test(res.error.message) ? 'Sin conexión. Para ingresar la primera vez necesita internet.'
                    : res.error.message;
                err.hidden = false;
                return;
            }
            ventana.close();
            listo(res.data.user);
        };
        ventana.showModal();
        form.correo.focus();
    });
}

// Devuelve el usuario con sesión; si no hay, muestra la ventana de ingreso y espera.
export async function asegurarSesion(supabase) {
    var res = await supabase.auth.getSession(), s = res.data.session;
    if (s) return s.user;
    // Sin señal no se puede renovar una sesión vencida, pero sigue guardada (si el servidor la rechaza, ya la borró):
    // se sigue trabajando con ella, y se renueva sola al volver la señal
    if (res.error) {
        try {
            var guardada = JSON.parse(await almacenSesion.getItem(supabase.auth.storageKey));
            if (guardada && guardada.user && guardada.user.id) return guardada.user;
        } catch (e) {}
    }
    return pedirIngreso(supabase);
}

// Rol del usuario de la sesión (public.perfiles). Sin conexión o sin la tabla todavía: interventor.
export async function esAdmin(supabase) {
    var res = await supabase.rpc('es_admin');
    return !res.error && res.data === true;
}

// Permisos de la sesión ({ microrutas, admin, contrato, horarios, ocultas }: 0007, 0012, 0024 y 0025). Deja en los menús
// solo las secciones y herramientas que el administrador le dejó encendidas (secciones.js), "Usuarios" y "WhatsApp" solo
// al administrador, y si la página abierta está apagada para este usuario la tapa con el aviso «No tiene acceso».
// Una cuenta que no entra a Microrrutas (por ejemplo, solo de Rutina) ve toda la página tapada y el botón Salir.
// Se aplica al instante con los últimos permisos que recibió este usuario en el equipo y otra vez cuando responde la base;
// sin conexión se queda con esos últimos.
export async function aplicarPermisos(supabase, usuario) {
    cliente = supabase;
    var clave = 'permisos_' + usuario.id, p = { admin: false, contrato: false }, guardados = null;
    try { guardados = JSON.parse(localStorage.getItem(clave)); } catch (e) { guardados = null; }
    if (guardados) mostrarPermisos(guardados);
    var res = await supabase.rpc('mis_permisos');
    if (!res.error && res.data) {
        p = res.data;
        try { localStorage.setItem(clave, JSON.stringify(p)); } catch (e) {}
    } else if (guardados) p = guardados;
    mostrarPermisos(p);
    return p;
}

var CLASE_OCULTO = 'data-sin-permiso';
function mostrarPermisos(p) {
    var menu = document.getElementById('menu-usuarios'), wa = document.getElementById('menu-whatsapp');
    if (menu) menu.hidden = !p.admin;
    if (wa) wa.hidden = !p.admin;
    // Enlaces de los desplegables de secciones y del menú Más, y los botones de herramientas de Subsanaciones (btn-fotos, …)
    document.querySelectorAll('.nav-menu-lista a[href], .menu-mas .menu-lista a[href], .menu-mas .menu-lista button[id^="btn-"], #btn-auditoria').forEach(function (el) {
        var k = el.tagName === 'A' ? claveDeEnlace(el.getAttribute('href')) : el.id === 'btn-auditoria' ? 'auditar' : el.id.slice(4);
        if (!seccion(k)) return;
        el.hidden = !puede(p, k);
    });
    // Un desplegable sin nada que mostrar se quita; en el menú Más, los títulos y rayas que quedan solos
    document.querySelectorAll('.nav-app .nav-menu').forEach(function (d) {
        d.hidden = !Array.prototype.some.call(d.querySelectorAll('.nav-menu-lista a'), function (a) { return !a.hidden; });
    });
    document.querySelectorAll('.menu-mas .menu-lista').forEach(ordenarMenu);
    // Auditar ZIP abierto por el enlace (#auditar) antes de saber que está apagada para este usuario
    var aud = document.getElementById('dlg-auditoria');
    if (aud && aud.open && !puede(p, 'auditar')) aud.close();
    bloquearPagina(p);
}
function ordenarMenu(lista) {
    var hijos = Array.prototype.slice.call(lista.children), visibles = false;
    // Cada grupo va de una raya a la otra: si no le queda nada visible, se esconden su título y su raya
    var grupo = [];
    function cerrar(raya) {
        var alguno = grupo.some(function (el) { return !el.classList.contains('titulo-menu') && !el.hidden; });
        grupo.forEach(function (el) { if (el.classList.contains('titulo-menu')) el.hidden = !alguno; });
        if (raya) raya.hidden = !alguno;
        visibles = visibles || alguno;
        grupo = [];
    }
    hijos.forEach(function (el) { if (el.tagName === 'HR') cerrar(el); else grupo.push(el); });
    cerrar(null);
    return visibles;
}

// Herramienta pedida al abrir la página (subsanaciones.html?herramienta=fotos). Se lee al cargar, porque la página la
// quita de la dirección apenas la abre
var PEDIDA = (function () {
    try { return new URLSearchParams(location.search).get('herramienta') || ''; } catch (e) { return ''; }
})();
// 🧰 Crear archivos vive en Subsanaciones pero es de todos: si a este usuario le apagaron Subsanaciones y llegó a abrir una
// de esas herramientas, se le deja abrir sobre la página tapada y, al cerrarla, vuelve a la página de donde venía
function soloHerramienta(p, k) {
    var h = seccion(PEDIDA);
    return h && h.enPagina === k && puede(p, PEDIDA) ? PEDIDA : '';
}
function volverAlCerrar(herr, p) {
    var dlg = document.getElementById('dlg-' + herr);
    if (!dlg || dlg.dataset.spVolver) return;
    dlg.dataset.spVolver = '1';
    dlg.addEventListener('close', function () {
        var antes = '';
        try { var r = new URL(document.referrer); if (r.origin === location.origin && r.pathname !== location.pathname) antes = document.referrer; } catch (e) { antes = ''; }
        var otra = primeraPermitida(p);
        if (antes) location.href = antes;
        else if (otra) location.href = otra.pagina + (otra.doc ? '?doc=' + otra.doc : '');
    });
}

// La página abierta está apagada para este usuario: se tapa el contenido (no el encabezado) y se le ofrece otra.
// Si la cuenta no entra a Microrrutas se tapa todo, encabezado incluido, y solo queda Salir
function destapar(aviso) {
    aviso.remove();
    document.querySelectorAll('[' + CLASE_OCULTO + ']').forEach(function (el) { el.hidden = false; el.removeAttribute(CLASE_OCULTO); });
}
function bloquearPagina(p) {
    var fuera = !entra(p), k = clavePagina(location.href), aviso = document.getElementById('sp-bloqueo');
    var herr = !fuera && k && !puede(p, k) ? soloHerramienta(p, k) : '';
    if (herr) volverAlCerrar(herr, p);
    if (!fuera && (!k || puede(p, k))) {
        if (aviso) destapar(aviso);
        return;
    }
    // Cambió el motivo (p. ej. los permisos guardados decían una cosa y la base otra): se arma de nuevo
    var motivo = fuera ? 'app' : herr ? 'herr:' + herr : 'sec:' + k;
    if (aviso && aviso.dataset.motivo !== motivo) { destapar(aviso); aviso = null; }
    document.querySelectorAll('dialog[open]').forEach(function (d) { if (d.id !== 'dlg-ingreso' && d.id !== 'dlg-' + herr) d.close(); });
    if (aviso) return;
    Array.prototype.forEach.call(document.body.children, function (el) {
        if ((el.tagName === 'HEADER' && !fuera) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'DIALOG' || el.hidden) return;
        el.hidden = true;
        el.setAttribute(CLASE_OCULTO, '');
    });
    if (!document.getElementById('sp-bloqueo-estilo')) {
        var st = document.createElement('style');
        st.id = 'sp-bloqueo-estilo';
        st.textContent = '#sp-bloqueo{max-width:560px;margin:40px auto;padding:24px 20px;background:var(--surface,#fff);border:1px solid var(--line,#dfe7e3);border-radius:14px;text-align:center}' +
            '#sp-bloqueo h2{margin:0 0 8px;font-size:19px}#sp-bloqueo p{margin:0 0 16px;color:var(--muted,#5b6b64);line-height:1.5}' +
            '#sp-bloqueo a,#sp-bloqueo button{display:inline-flex;align-items:center;min-height:42px;padding:0 18px;border:0;border-radius:10px;background:var(--brand,#1a7f5a);color:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}' +
            '#sp-bloqueo .sp-cuenta{font-size:13px;margin:-8px 0 16px}' +
            '@media (max-width:560px){#sp-bloqueo{margin:20px 16px;padding:20px 14px}}';
        document.head.appendChild(st);
    }
    var s = seccion(k), otra = primeraPermitida(p);
    aviso = document.createElement('div');
    aviso.id = 'sp-bloqueo';
    aviso.dataset.motivo = motivo;
    aviso.setAttribute('role', 'alert');
    aviso.innerHTML = fuera
        ? '<h2>🔒 Esta cuenta no tiene acceso a Microrrutas</h2>' +
          '<p>La cuenta existe, pero el administrador no le dio acceso a esta aplicación (puede ser una cuenta de otra app, como Rutina). ' +
          'Si la necesita, pídale que se la active en 👥 Usuarios.</p><p class="sp-cuenta" data-cuenta></p>' +
          '<button type="button" data-salir>⎋ Salir y entrar con otra cuenta</button>'
        : herr
        ? '<h2>🧰 ' + seccion(herr).nombre.replace(/^\S+\s/, '') + '</h2><p>Al cerrar la herramienta vuelve a la página donde estaba.</p>'
        : '<h2>🔒 No tiene acceso a ' + s.nombre.replace(/^\S+\s/, '') + '</h2>' +
        '<p>El administrador no le activó esta sección. Si la necesita, pídale que se la encienda en 👥 Usuarios.</p>' +
        (otra ? '<a href="' + otra.pagina + (otra.doc ? '?doc=' + otra.doc : '') + '">Ir a ' + otra.nombre + '</a>' : '');
    if (fuera) {
        var boton = aviso.querySelector('[data-salir]');
        boton.onclick = function () { boton.disabled = true; boton.textContent = 'Saliendo…'; if (cliente) cerrarSesion(cliente); else location.reload(); };
        if (cliente) cliente.auth.getSession().then(function (r) {
            var u = r.data.session && r.data.session.user, cuenta = aviso.querySelector('[data-cuenta]');
            if (u && cuenta) cuenta.textContent = 'Cuenta: ' + u.email;
        }).catch(function () {});
    }
    var cabeza = document.querySelector('body > header');
    if (cabeza && !fuera) cabeza.after(aviso); else document.body.prepend(aviso);
}

export async function cerrarSesion(supabase) {
    cierrePedido();
    // Solo en este equipo: si no, Salir en el computador también cierra la sesión del celular
    await supabase.auth.signOut({ scope: 'local' });
    location.reload();
}
