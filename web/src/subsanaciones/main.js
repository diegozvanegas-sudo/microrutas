// Entrada de subsanaciones.html: estilos, sesión y arranque de la página.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { crearApi } from '../api.js';
import { asegurarSesion, cerrarSesion, mostrarMenuAdmin } from '../sesion.js';
import { iniciar } from './app.js';

async function arrancar() {
    iniciarEncabezado();
    if (!configurado) return iniciar(null, {});
    var usuario = await asegurarSesion(supabase);
    var salir = document.getElementById('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    mostrarMenuAdmin(supabase);
    // Nombre con el que la base firma las visitas; mientras llega (o sin conexión) se muestra el correo
    var cfg = { url: true, usuario: usuario.email };
    supabase.rpc('nombre_usuario').then(function (res) { if (!res.error && res.data) cfg.usuario = res.data; });
    iniciar(crearApi(supabase), cfg);
}

arrancar();
