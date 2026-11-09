# Microrrutas · reglas de trabajo

Responder siempre en español. La app la usa la interventoría del corte de césped en el computador y en el celular.

## Solo se toca la sección que se pidió (regla del usuario, siempre)

- Si el pedido es de una sección (p. ej. «LV y RyT · Horas extras», «Fotos con su lote», «Requerimientos»), se cambian **solo los archivos de esa sección**. Nada de otras páginas, otros menús, estilos compartidos ni archivos generales «de paso».
- Si el arreglo de verdad necesita tocar algo compartido (un estilo general, `sesion.js`, el menú de todas las páginas), **primero se pregunta** y se explica qué más se afectaría.
- Mejoras que se noten en otras secciones se proponen al final, no se hacen sin permiso.

## Interfaz: lo básico que siempre se hace (sin que lo pidan)

Toda pantalla, ventana (`<dialog>`) o herramienta nueva o cambiada cumple esto antes de darla por terminada:

### Abrir y cerrar
- **Las herramientas abren vacías.** Al cerrarlas (botón Cerrar, Esc o tocando afuera: escuchar el evento `close` del `<dialog>`) se borra lo que se cargó: archivos elegidos, listas, textos pegados, resultados, mensajes de estado. Se conservan solo las **preferencias** (diseño, orden, casillas de opciones) y lo que por diseño se guarda en el equipo (p. ej. la programación del mes, un borrador de texto): eso se dice en la ventana.
- Si se cierra mientras procesa, no se rompe: o se espera a que termine o se cancela, pero al volver a abrir no aparece mezclado lo viejo con lo nuevo.
- Volver a elegir archivos reemplaza lo anterior (no lo suma a escondidas).

### Espacio y márgenes
- Nada pegado al borde: todo `<dialog>` lleva su contenido en `<div class="cuerpo">`, que tiene margen interno general (`dialog > .cuerpo { padding: 18px }`, 14 px en celular) en `src/subsanaciones/estilos.css`, `src/diario/estilos.css` y `src/pqr/estilos.css`. No quitarlo ni dejar contenido fuera de `.cuerpo`.
- Botones con separación entre ellos (`gap`), alto mínimo cómodo para el dedo (~36-44 px) y que en celular se acomoden en varias filas sin salirse.
- Listas largas con su propio desplazamiento y el pie (Cerrar / acción principal) siempre visible.

### Mismo comportamiento en todos los menús
- Las ventanas nuevas copian el patrón de las que ya existen: título `<h2>` con ícono, texto de ayuda corto (`.sub`), contenido, y `.pie` abajo con «Cerrar» a la izquierda de la acción principal (`.primario` o `.wa`).
- Las herramientas del menú «Más» se pueden abrir con `?herramienta=<nombre>` (lista en `app.js`).
- Estados de carga visibles («Leyendo…»), botones deshabilitados mientras se procesa, y errores explicados en palabras (qué pasó y qué hacer), nunca en silencio.

### Ayudar al usuario a terminar
- Si a muchas filas les falta lo mismo, ofrecer arreglarlo de una vez (p. ej. «poner este lote a todas las que no tienen», «leer la marca de agua de las fotos sin GPS»), en vez de obligar a hacerlo una por una.
- Ofrecer la opción que falta en el momento en que se nota (p. ej. si las fotos llegaron sin GPS, el botón para leer la marca de agua aparece ahí mismo, sin volver a elegirlas).
- Contadores claros arriba (cuántas, cuántas bien, cuántas por revisar) y un filtro «ver solo las que hay que revisar» cuando la lista es larga.
- No reutilizar nombres de clases genéricos que ya existen con otro estilo (p. ej. `.aviso` es una caja naranja grande): usar prefijos propios de la herramienta.

### Computador y celular
- Todo lo que se ve se revisa en ancho de computador y de celular (≈ 360-400 px): sin desplazamiento horizontal, textos que no se corten feo, campos que no se monten.

## Otras reglas
- No mover ni reubicar lo que ya existe; analizar todos los usos antes de tocar algo que se reutiliza.
- El repositorio es público: nada del contrato, convenios ni datos privados en el código (van en `datos/contrato/`, fuera de git, y se cargan a Supabase).
- Migraciones de Supabase una por una y con confirmación (`db:esquema` falla en producción).
- Cambios del mapa solo en `web/mapa_rapido.html`; `index.html` solo si lo piden.
- Probar con `npm test` y `npx eslint src` en `web/`, y compilar con `vite build` antes de subir.
