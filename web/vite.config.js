import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raíz con la letra de la unidad en mayúscula: en Windows, si la consola entra a la carpeta como «c:\…» (VS Code, Git Bash),
// vite guarda el <style> de index.html con una ruta y lo busca con otra («C:\…») y la compilación falla con
// «No matching HTML proxy module found». Con la raíz fija sale igual desde cualquier consola.
const raiz = dirname(fileURLToPath(import.meta.url)).replace(/^[a-z]:/, (u) => u.toUpperCase());

export default defineConfig({
  // Rutas relativas: funciona igual en la raíz de un dominio o en una subcarpeta (GitHub Pages)
  base: './',
  root: raiz,
  build: {
    // ExcelJS (~940 kB) solo se descarga al pulsar "Descargar Excel"
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Con ruta completa desde la raíz (ver «raiz» arriba)
      input: Object.fromEntries(Object.entries({ index: 'index.html', mapa_rapido: 'mapa_rapido.html', subsanaciones: 'subsanaciones.html', contrato: 'contrato.html', usuarios: 'usuarios.html', pqr: 'pqr.html', pendientes: 'pendientes.html', informe: 'informe.html', horas: 'horas.html', horarios: 'horarios.html', whatsapp: 'whatsapp.html', revision: 'revision.html', despacho: 'despacho.html', pdf: 'pdf.html', buscar: 'buscar.html', diagnostico: 'diagnostico.html', requerimiento: 'requerimiento.html', radicar: 'radicar.html', cronogramas: 'cronogramas.html', programados: 'programados.html' }).map(([k, f]) => [k, resolve(raiz, f)])),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Microrrutas · Subsanaciones',
        short_name: 'Microrrutas',
        description: 'Revisión de lotes de zonas verdes: pre-rutas, visitas y subsanaciones.',
        lang: 'es',
        start_url: './subsanaciones.html',
        scope: './',
        display: 'standalone',
        theme_color: '#167a55',
        background_color: '#f3f6f5',
        icons: [
          { src: 'icons/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Mapa', url: './mapa_rapido.html' },
          { name: 'Pendientes', url: './pendientes.html' },
          { name: 'Informe diario', url: './informe.html' },
        ],
      },
      workbox: {
        // Código, estilos e íconos quedan guardados al instalar (funcionan sin conexión).
        // Las capas de data/ (hasta 16 MB) se guardan la primera vez que se abren.
        globPatterns: ['**/*.{js,css,png,svg,gif,woff,woff2}'],
        globIgnores: ['data/**', '**/*.map'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: null,
        runtimeCaching: [
          {
            // Las páginas: con señal siempre la versión publicada (guardadas, el celular mostraba la vieja hasta
            // abrirla dos veces); sin señal, la última que se abrió. ?lote=... no cuenta para encontrarla guardada
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'paginas', networkTimeoutSeconds: 6, matchOptions: { ignoreSearch: true } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'capas', expiration: { maxEntries: 80 } },
          },
          {
            // Fondos del mapa: lo ya visto queda disponible sin señal en campo
            urlPattern: /^https:\/\/(mt1\.google\.com|[abc]\.tile\.openstreetmap\.org)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'teselas',
              expiration: { maxEntries: 4000, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
