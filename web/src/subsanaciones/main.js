// Entrada de subsanaciones.html: estilos, sesión y arranque de la página.
import './estilos.css';
import { supabase, configurado } from '../supabase.js';
import { crearApi } from '../api.js';
import { asegurarSesion, cerrarSesion } from '../sesion.js';
import { iniciar } from './app.js';

async function arrancar() {
    if (!configurado) return iniciar(null, {});
    var usuario = await asegurarSesion(supabase);
    var salir = document.getElementById('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { cerrarSesion(supabase); };
    iniciar(crearApi(supabase), { url: true });
}

arrancar();
