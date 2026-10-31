# Microservicio de WhatsApp (Evolution API)

Permite que la aplicación envíe mensajes y archivos (PDF, fotos) **a los grupos y números de WhatsApp** sin tocar el
celular: el llamado de atención a la cuadrilla, el traslado a Precoodes, avisos diarios, etc.

```
Página (GitHub Pages / Netlify)
   │  supabase.functions.invoke('whatsapp', …)       web/src/whatsapp/cliente.js
   ▼
Supabase · función «whatsapp»                         supabase/functions/whatsapp/index.ts
   │  guarda la clave de Evolution; revisa la sesión (y que sea admin para conectar)
   ▼
Servidor (VPS) · Evolution API + Postgres + Redis + Caddy (HTTPS)     esta carpeta
   │  número de envío vinculado con QR (como WhatsApp Web)
   ▼
WhatsApp → grupos / celulares
```

La página **💬 WhatsApp** (`web/whatsapp.html`, menú **Más**, solo administradores) muestra si el número está
conectado, saca el QR para vincularlo, lista los grupos con su ID y permite probar un envío.

> ⚠️ Evolution API se conecta como WhatsApp Web, **no es la API oficial de Meta** y va contra las condiciones de
> WhatsApp: el número puede ser bloqueado. Use un **número aparte** (no el personal ni el de la entidad), envíe solo a
> grupos donde lo conocen y pocos mensajes. Los PQR traen datos personales: el área debe estar de acuerdo.

## 1. Servidor

- Un VPS con Linux (Ubuntu 22.04 o 24.04), 1 vCPU y 2 GB de RAM alcanza (≈ USD 5–10 al mes).
- Un dominio o subdominio apuntando a la IP del VPS (registro **A**), ej. `whatsapp.midominio.com`.
- Puertos 80 y 443 abiertos (Caddy saca el certificado HTTPS solo).
- Docker y Docker Compose:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Instalar

Copie esta carpeta al servidor (o clone el repositorio) y:

```bash
cd evolution-api
cp .env.example .env
nano .env          # DOMINIO, AUTHENTICATION_API_KEY (openssl rand -hex 32) y CLAVE_POSTGRES
docker compose up -d
docker compose logs -f evolution      # Ctrl+C para salir
```

Pruebe que responde (debe salir un JSON con la versión):

```bash
curl https://whatsapp.midominio.com
```

> La imagen está fijada en `evoapicloud/evolution-api:v2.3.7`. Antes de actualizarla revise en Docker Hub y en
> <https://doc.evolution-api.com> si cambió algo; luego `docker compose pull && docker compose up -d`.

## 3. Conectar Supabase

En el computador, en la carpeta del proyecto (con la CLI de Supabase y el proyecto ya enlazado):

```bash
supabase secrets set EVOLUTION_URL=https://whatsapp.midominio.com EVOLUTION_API_KEY=la-misma-clave-del-env EVOLUTION_INSTANCIA=microrutas
supabase functions deploy whatsapp
```

## 4. Vincular el número

1. Ingrese a la aplicación como administrador → **Más → 💬 WhatsApp**.
2. **🔗 Conectar (QR)** y, en el celular del número de envío: WhatsApp → ⋮ → **Dispositivos vinculados** →
   **Vincular un dispositivo** → escanee. (Si escribe el número antes, también sale un código para vincular sin QR.)
3. Cuando diga **✓ Conectado**, toque **↻ Cargar grupos**: el ID de cada grupo (`…@g.us`) es el que se usa para enviar.
4. Pruebe con **✉️ Probar** en un grupo.

## Usarlo desde otras páginas

```js
import { enviarTexto, enviarArchivo } from '../whatsapp/cliente.js';

await enviarTexto('120363000000000000@g.us', 'Hola grupo');          // grupo
await enviarTexto('3001234567', 'Hola');                             // celular (10 dígitos = Colombia)
await enviarArchivo('120363…@g.us', archivoPdf, 'Informe.pdf', 'Informe del día');
```

Acciones del puente (`body.accion`): `estado`, `conectar` (admin), `desconectar` (admin), `grupos`,
`enviarTexto { para, texto }`, `enviarArchivo { para, base64, nombre, mime, texto }`.
Para conectar otro servicio, se agrega otra acción en `supabase/functions/whatsapp/index.ts`.

## Mantenimiento

| Qué | Cómo |
|---|---|
| Ver si está corriendo | `docker compose ps` |
| Ver errores | `docker compose logs --tail 100 evolution` |
| Reiniciar | `docker compose restart evolution` |
| El número se desvinculó | Volver a **Conectar (QR)** en la página |
| Copia de la sesión | Volúmenes `evolution-instancias` y `evolution-postgres` |

El `.env` con las claves **no se sube a GitHub** (el repositorio es público).
