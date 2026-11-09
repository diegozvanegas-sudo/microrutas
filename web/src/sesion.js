// Inicio de sesión con correo y contraseña (usuarios creados por el administrador en Supabase).
// Componente propio: arma su ventana, no necesita nada en el HTML.
import { almacenSesion, cierrePedido } from './almacen.js';

var ventana = null;

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

// Permisos de la sesión ({ admin, contrato }, 0007_contrato_permiso.sql). Muestra "Contrato" en las secciones y
// "Usuarios" y "WhatsApp" en el menú Más solo a quien puede. Sin conexión usa los últimos que recibió este usuario en el equipo.
export async function aplicarPermisos(supabase, usuario) {
    var clave = 'permisos_' + usuario.id, p = { admin: false, contrato: false };
    var res = await supabase.rpc('mis_permisos');
    if (!res.error && res.data) {
        p = res.data;
        try { localStorage.setItem(clave, JSON.stringify(p)); } catch (e) {}
    } else {
        try { p = JSON.parse(localStorage.getItem(clave)) || p; } catch (e) {}
    }
    var nav = document.getElementById('nav-contrato'), menu = document.getElementById('menu-usuarios'), wa = document.getElementById('menu-whatsapp');
    if (nav) nav.hidden = !p.contrato;
    var guia = document.getElementById('nav-guia');
    if (guia) guia.hidden = !p.contrato;
    if (menu) menu.hidden = !p.admin;
    if (wa) wa.hidden = !p.admin;
    return p;
}

export async function cerrarSesion(supabase) {
    cierrePedido();
    // Solo en este equipo: si no, Salir en el computador también cierra la sesión del celular
    await supabase.auth.signOut({ scope: 'local' });
    location.reload();
}
