// Entrada de subsanaciones.html: estilos, sesión y arranque de la página.
import './estilos.css';
import { iniciarEncabezado } from '../encabezado.js';
import { supabase, configurado } from '../supabase.js';
import { crearApi } from '../api.js';
import { asegurarSesion, cerrarSesion, aplicarPermisos } from '../sesion.js';
import { iniciar } from './app.js';

// Copia de las visitas en el equipo (app.js y el mapa rápido): es de un usuario, cada uno ve solo las suyas
var CACHE = 'subsanaciones_cache', DUENO = 'subsanaciones_cache_usuario';
function borrarCopia() { try { localStorage.removeItem(CACHE); localStorage.removeItem(DUENO); } catch (e) {} }

async function arrancar() {
    iniciarEncabezado();
    if (!configurado) return iniciar(null, {});
    var usuario = await asegurarSesion(supabase);
    try {
        if (localStorage.getItem(DUENO) !== usuario.id) { borrarCopia(); localStorage.setItem(DUENO, usuario.id); }
    } catch (e) {}
    var salir = document.getElementById('btn-salir');
    salir.hidden = false;
    salir.title = 'Cerrar sesión de ' + usuario.email;
    salir.onclick = function () { borrarCopia(); cerrarSesion(supabase); };
    // Nombre con el que la base firma las visitas; mientras llega (o sin conexión) se muestra el correo
    var cfg = { url: true, usuario: usuario.email };
    supabase.rpc('nombre_usuario').then(function (res) { if (!res.error && res.data) cfg.usuario = res.data; });
    var pagina = iniciar(crearApi(supabase), cfg);
    // "Contrato" y "Usuarios" según el permiso; el administrador además filtra por usuario (ve las visitas de todos)
    if ((await aplicarPermisos(supabase, usuario)).admin) {
        var res = await supabase.from('perfiles').select('id, nombre').order('nombre');
        if (!res.error) pagina.mostrarUsuarios(res.data.map(function (p) { return { id: p.id, nombre: p.nombre || 'Sin nombre' }; }));
    }
}

arrancar();
