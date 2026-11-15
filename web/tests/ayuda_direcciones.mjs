// Para las pruebas: el motor de direcciones del mapa rápido (public/js/direcciones.js, un script clásico que se cuelga de
// window) corriendo en Node con los cruces guardados, sin red (si un cruce no está guardado, la búsqueda en línea falla).
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { leerDatos } from '../src/subsanaciones/lotegps.js';

const PUB = new URL('../public/', import.meta.url);
export const traer = (ruta) => readFile(new URL('data/' + ruta, PUB), 'utf8');

export async function cargarMotor() {
    const ctx = {
        localStorage: { getItem: () => null, setItem: () => {} },
        fetch: () => Promise.reject(new Error('sin red en las pruebas')),
        setTimeout: () => 0, AbortController, Promise, Math, JSON, Object, Error,
        document: { createElement: () => ({}), head: { appendChild: () => {} } }
    };
    ctx.window = ctx;
    ctx.crucesCalles = leerDatos(await traer('rapido/cruces.js'));
    vm.runInNewContext(await readFile(new URL('js/direcciones.js', PUB), 'utf8'), ctx);
    return { leerDireccion: ctx.leerDireccion, ubicarDireccion: ctx.ubicarDireccion, cruces: ctx.crucesCalles };
}
