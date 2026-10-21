# Microrrutas de zonas verdes

Nueva versión de la app de microrrutas e interventoría, con base de datos **PostgreSQL + PostGIS en Supabase**
en lugar de la Hoja de Google. El proyecto anterior (mapa qgis2web + Apps Script) queda intacto.

## Estado

- [x] **Paso 1 — Lotes en PostGIS**: tablas `lotes` (8.060 polígonos) y `microrrutas` (1.147), consultas por punto.
- [x] **Paso 2 — Visitas**: `visitas` (Subsanaciones + Operación), `items`, `recordatorios`, `rutas`, con las reglas del Apps Script.
- [x] **Paso 3 — Página conectada a Supabase** (`web/src/api.js`), con inicio de sesión.
- [x] **Paso 4 — PWA con Vite**: subsanaciones separada en módulos, instalable, abre sin conexión.
- [ ] Pasar los registros que ya están en la Hoja de Google
- [ ] Seguir separando `web/src/subsanaciones/app.js` (listado, formulario, pre-rutas)
- [ ] Guardar visitas sin conexión y subirlas al volver la señal; fotos de evidencia en Supabase Storage

## Estructura

```
microrutas/
├── supabase/            config.toml (Supabase local) y migrations/ (tablas, reglas, permisos)
├── scripts/             importar lotes, crear usuarios, pruebas de la base
├── datos/origen/        capas del mapa anterior (para importar lotes)
└── web/                 la aplicación (Vite + PWA)
    ├── index.html, mapa_rapido.html    mapas, igual que antes
    ├── subsanaciones.html              solo el HTML
    ├── public/                         css, js, data, íconos (se copian tal cual)
    └── src/
        ├── api.js        Supabase con la misma forma de datos que el Apps Script
        ├── sesion.js     ventana de ingreso
        ├── supabase.js   cliente (lee web/.env)
        └── subsanaciones/
            ├── main.js       arranque: estilos, sesión, página
            ├── app.js        listado, formulario, buscador y pre-rutas
            ├── estado.js     reglas de la visita (ítems en NO, subsanados, estado)
            ├── util.js       textos, fechas y distancias
            ├── ui.js         toast, avisos, confirmación
            ├── mensaje.js    lee los mensajes de WhatsApp de las cuadrillas
            ├── recorrido.js  recorrido corto de la pre-ruta
            ├── whatsapp.js   textos para WhatsApp
            ├── excel.js      Excel con el formato de interventoría
            └── estilos.css
```

## La aplicación web

```bash
cd web
npm install
copy .env.example .env     # URL y llave anon de Supabase
npm run dev                # http://localhost:5173/subsanaciones.html
npm run build              # deja todo en web/dist/ para publicar
```

- **Usuarios**: cada interventor entra con correo y contraseña. Se crean con
  `npm run usuario -- correo@ejemplo.com "contraseña"` (en la carpeta de arriba; necesita `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` en `.env`) o en Supabase → Authentication → Add user.
- **Sin conexión**: instalada (o abierta una vez), la página abre sin señal y muestra la última copia de las
  visitas y pre-rutas. Las capas del mapa y los fondos ya vistos también quedan guardados. Guardar una visita
  sí necesita conexión por ahora.
- **Instalar en el celular**: abrir la página publicada en Chrome → menú ⋮ → *Agregar a la pantalla principal*.
- **Publicar**: `web/dist/` es una carpeta estática. Sirve en Netlify, Vercel, Cloudflare Pages o GitHub Pages
  (debe ser https para que funcione como app). En Supabase → Authentication → URL Configuration ponga la
  dirección publicada como *Site URL*.
- **Íconos**: `npm run iconos` genera unos provisionales en `public/icons/`; reemplácelos por el logo.

## Supabase local (para desarrollar sin tocar el real)

```bash
npx supabase start     # aplica supabase/migrations; Studio en http://127.0.0.1:56323
npx supabase status    # muestra la URL, la llave anon y la service_role
```

Puertos 563xx porque Windows reserva el rango 54xxx. Para cargar los lotes ahí:
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres npm run db:importar`.

Pruebas:
- `npm run probar:visitas` — reglas de la base (estado, subsanación, pre-rutas)
- `cd web && PRUEBA_CORREO=... PRUEBA_CLAVE=... npm run probar:api` — la API completa con un usuario de prueba

## Qué hay en la base

| Objeto | Qué es |
|---|---|
| `microrrutas` | Una fila por microrruta: lote, cuadrilla, área, frecuencia, dirección, descripción. `zona` sale sola del código (Z5… = 5). |
| `lotes` | Un polígono por fila (`fid`), con microrruta, comuna, dirección y geometría `MultiPolygon` (WGS84). |
| `lotes_info` | Vista: lote + datos de su microrruta + un punto dentro del lote (`lat`, `lon`). |
| `lote_en_punto(lat, lon)` | En qué lote cae un punto. |
| `lotes_cercanos(lat, lon, limite, max_metros)` | Lotes más cercanos con la distancia en metros. |

### Visitas de interventoría (paso 2)

| Antes (Hoja de Google) | Ahora |
|---|---|
| Hojas *Subsanaciones* y *Operación* | `visitas`, columna `tipo` = `EJECUCION` / `OPERACION` |
| Una columna por ítem (SI / NO / N/A) | `respuestas` (JSON): `{"PLATEO": "NO", "BORDEO": "SI"}` |
| Hojas *Items* e *Items Operación* | `items` (`activo = false` lo oculta sin borrar lo registrado) |
| *Recordatorios Operación* | `recordatorios` |
| *Rutas* | `rutas` + función `guardar_ruta(cuadrilla, paradas)` |

Lo que antes hacía el Apps Script ahora lo hace un trigger al guardar cada visita:

- **ID** `SUB-00001` / `OPE-00001`; no se puede cambiar.
- **Estado**: algún NO → `PENDIENTE`; "LOTE CERRADO" en la observación → `CERRADO`;
  todo en SI después de un NO → `SUBSANADO` (pone la fecha de subsanación); todo en SI desde el inicio → `SIN NOVEDAD`.
- **Ítems subsanados**: los que pasan de NO a SI; si vuelven a NO, salen de la lista.
- **Cantidad de novedades** = ítems en NO + ítems subsanados.
- Rechaza ítems que no existan y valores distintos de SI / NO / N/A (acepta "na", "no aplica").

La vista `visitas_detalle` agrega `observacion_excel` ("PENDIENTE POR SUBSANAR - …", "NOVEDAD SUBSANADA EL dd/mm/aaaa - …")
y `dias_pendiente`. En `observaciones` se guarda solo la nota del interventor.

Pruebas de estas reglas (no dejan nada guardado): `npm run probar:visitas`

### Seguridad (RLS)

- `lotes`, `microrrutas`, `items`, `recordatorios`: cualquiera puede **leer**; se cambian desde el panel o la conexión directa.
- `visitas`, `rutas`: leer y escribir solo con sesión iniciada (el login llega en el paso 3).

## Probar en el computador (Docker)

```bash
npm install
copy .env.example .env          # ya apunta al PostGIS local
npm run db:local                # levanta PostGIS en el puerto 55432
npm run db:esquema              # crea tablas y funciones
npm run db:importar             # carga datos/origen/*.js
npm run probar -- 6.2844 -75.5980
npm run probar:visitas          # reglas de estado, subsanación y pre-rutas
```

## Cargarlo en Supabase

1. Entrar a <https://supabase.com> → **New project**. Región: *East US* (la más cercana con plan gratis).
   Guarde la contraseña de la base de datos.
2. En el proyecto: botón **Connect** → pestaña **Session pooler** → copie la URI.
3. En `.env`, comente la línea local y pegue la URI cambiando `[YOUR-PASSWORD]` por la contraseña.
4. `npm run db:esquema` y luego `npm run db:importar` (tarda 1–2 minutos).
5. Comprobar: `npm run probar -- 6.2844 -75.5980`, o en Supabase → **SQL Editor**:
   ```sql
   select * from lote_en_punto(6.2844, -75.5980);
   ```

Desde la página web se llamará así (paso 3):

```js
const { data } = await supabase.rpc('lote_en_punto', { lat: 6.2844, lon: -75.598 });
```

## Actualizar los datos

Cuando llegue una programación nueva o se exporte de nuevo desde QGIS, reemplace los archivos de
`datos/origen/` y corra `npm run db:importar`. Actualiza por `fid` y por código de microrruta, sin duplicar
y sin borrar lo que dependa de ellas.

Archivos de origen (copiados del mapa anterior):
- `zonasverdes__areas_zonas_verdes_2.js` — polígonos (qgis2web)
- `direcciones_lotes.js` — programación CLUS por microrruta
- `direcciones_fid.js` — comuna y dirección de respaldo por polígono

## Notas de los datos

- 4 polígonos vienen sin geometría en el origen; quedan con `geom` nulo.
- 369 polígonos no tienen microrruta (zona nula); se ubican igual por punto.
- 17 microrrutas de la programación no tienen polígono en el mapa.
- Se quita la coordenada Z y se reparan geometrías inválidas al importar (resultado: 0 inválidas).
