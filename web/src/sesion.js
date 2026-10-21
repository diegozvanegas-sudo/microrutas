// Inicio de sesión con correo y contraseña (usuarios creados por el administrador en Supabase).
// Componente propio: arma su ventana, no necesita nada en el HTML.

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
    var s = (await supabase.auth.getSession()).data.session;
    return s ? s.user : pedirIngreso(supabase);
}

export async function cerrarSesion(supabase) {
    await supabase.auth.signOut();
    location.reload();
}
