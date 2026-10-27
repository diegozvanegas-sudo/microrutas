// Cruces de calles y carreras para buscar direcciones en el mapa rápido sin preguntarle a Overpass (js/direcciones.js).
// Correr desde web/ con el extracto de OpenStreetMap de Colombia (https://download.geofabrik.de/south-america/colombia-latest.osm.pbf):
//   node tools/generar_cruces.mjs ruta/colombia-latest.osm.pbf
// Escribe public/data/rapido/cruces.js: solo las vías con nombre tipo "Calle 91A", "Carrera 38 Sur"… y los puntos donde se
// cruzan, dentro de la zona de los lotes (cajas de las cuadrillas en indice.js, con un margen). Correrlo de nuevo cuando
// cambien las calles en OpenStreetMap (rara vez).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { leerData } from './lotes.mjs';

const require = createRequire(import.meta.url);
const parser = require('osm-pbf-parser');

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error('Uso: node tools/generar_cruces.mjs ruta/colombia-latest.osm.pbf');
  process.exit(1);
}

// Zona: las cajas de todas las cuadrillas con ~2 km de margen
const MARGEN = 0.02;
const cajas = Object.values(leerData('rapido/indice.js', 'indiceRapido').cuadrillas).map((c) => c.b);
const S = Math.min(...cajas.map((b) => b[0][0])) - MARGEN, O = Math.min(...cajas.map((b) => b[0][1])) - MARGEN;
const N = Math.max(...cajas.map((b) => b[1][0])) + MARGEN, E = Math.max(...cajas.map((b) => b[1][1])) + MARGEN;
const dentro = (lat, lon) => lat >= S && lat <= N && lon >= O && lon <= E;

// "Calle 91 A Bis" -> "calle 91A"; "Carrera 10 Sur" -> "carrera 10 SUR". La misma clave arma js/direcciones.js.
const RE = /^(calle|carrera|diagonal|transversal|circular)\s+(\d{1,3})\s*([a-h]{0,2})\b(?:\s+bis\b)?(?:\s+(sur|este)\b)?/i;
function clave(nombre) {
  const m = RE.exec(String(nombre || '').trim());
  return m ? m[1].toLowerCase() + ' ' + +m[2] + m[3].toUpperCase() + (m[4] ? ' ' + m[4].toUpperCase() : '') : null;
}

const coords = new Map();      // nodo -> [lat, lon], solo los de la zona
const nombresDe = new Map();   // nodo -> Set de índices de vía
const vias = [], indiceVia = new Map();
let nodos = 0, caminos = 0;

await new Promise((listo, mal) => {
  fs.createReadStream(origen).pipe(parser())
    .on('data', (items) => {
      for (const it of items) {
        if (it.type === 'node') {
          nodos++;
          if (dentro(it.lat, it.lon)) coords.set(it.id, [Math.round(it.lat * 1e5) / 1e5, Math.round(it.lon * 1e5) / 1e5]);
        } else if (it.type === 'way' && it.tags && it.tags.highway) {
          const claves = [...new Set([it.tags.name, it.tags.alt_name, it.tags.official_name].flatMap((n) => String(n || '').split(';')).map(clave).filter(Boolean))];
          if (!claves.length || !it.refs.some((r) => coords.has(r))) continue;
          caminos++;
          const ids = claves.map((k) => {
            if (!indiceVia.has(k)) { indiceVia.set(k, vias.length); vias.push(k); }
            return indiceVia.get(k);
          });
          for (const r of it.refs) {
            if (!coords.has(r)) continue;
            let s = nombresDe.get(r);
            if (!s) nombresDe.set(r, (s = new Set()));
            ids.forEach((i) => s.add(i));
          }
        }
      }
    })
    .on('end', listo)
    .on('error', mal);
});

// Un punto por cada nodo donde se tocan dos vías de nombre distinto; "i,j" con i < j
const cruces = {};
let puntos = 0;
for (const [nodo, set] of nombresDe) {
  if (set.size < 2) continue;
  const ids = [...set].sort((a, b) => a - b), p = coords.get(nodo);
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const k = ids[a] + ',' + ids[b];
    (cruces[k] = cruces[k] || []).push(p);
    puntos++;
  }
}

const salida = path.join(import.meta.dirname, '..', 'public', 'data', 'rapido', 'cruces.js');
const fecha = fs.statSync(origen).mtime.toISOString().slice(0, 10);
fs.writeFileSync(salida, '// Cruces de calles para buscar direcciones. Generado con tools/generar_cruces.mjs (OpenStreetMap, ' + fecha + '), no editar a mano.\n' +
  'var crucesCalles = ' + JSON.stringify({ v: vias, c: cruces }) + ';\n');
console.log(`${nodos.toLocaleString('es-CO')} nodos leídos · ${caminos} vías con nombre en la zona · ${vias.length} nombres · ` +
  `${Object.keys(cruces).length} cruces (${puntos} puntos) · ${Math.round(fs.statSync(salida).size / 1024)} kB en ${path.relative(process.cwd(), salida)}`);
