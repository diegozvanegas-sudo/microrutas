// Capa "Servicios adicionales" del mapa rápido (public/data/rapido/capa_servicios_adicionales.js) desde
// datos/origen/servicios_adicionales.js. Correr desde web/:  node tools/generar_servicios_adicionales.mjs
// Un punto por sitio: los servicios con la misma ubicación (PROEXCAR: corte, espartillo y cascajo) van juntos en "v".
// Los que no tienen punto no salen en el mapa: se listan al correr para ubicarlos a mano.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, leerVar } from './lotes.mjs';

const ORIGEN = path.join(import.meta.dirname, '..', '..', 'datos', 'origen', 'servicios_adicionales.js');
const SALIDA = path.join(DATA, 'rapido', 'capa_servicios_adicionales.js');
const INDICE = path.join(DATA, 'rapido', 'indice.js');

const lista = leerVar(ORIGEN, 'serviciosAdicionales');
const porPunto = new Map(), sinPunto = [];
for (const s of lista) {
  if (!s.p) { sinPunto.push(s); continue; }
  const k = s.p.join(',');
  if (!porPunto.has(k)) porPunto.set(k, { p: s.p, v: [] });
  const v = { n: s.nombre, f: s.frecuencia, d: s.direccion, a: String(s.area), x: s.proxima, o: s.obs };
  for (const c of Object.keys(v)) if (!v[c]) delete v[c];
  porPunto.get(k).v.push(v);
  porPunto.get(k).u = s.aprox;
}
const items = [...porPunto.values()].map((g) => ({
  n: g.v.map((v) => v.n).join(' · '), u: g.u, v: g.v,
  g: [Math.round(g.p[1] * 1e6), Math.round(g.p[0] * 1e6)],
}));
const txt = 'cargarCapa("servicios_adicionales",' + JSON.stringify({ tipo: 'punto', items }) + ');\n';
fs.writeFileSync(SALIDA, txt);

// El índice conserva lo demás; solo se pone (o actualiza) el tamaño de esta capa
const t = fs.readFileSync(INDICE, 'utf8'), indice = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
indice.capas.servicios_adicionales = { kb: Math.max(1, Math.round(txt.length / 1024)) };
fs.writeFileSync(INDICE, t.slice(0, t.indexOf('{')) + JSON.stringify(indice) + ';\n');

console.log('capa_servicios_adicionales.js:', items.length, 'puntos con', lista.length - sinPunto.length, 'servicios');
if (sinPunto.length) console.log('Sin ubicar (no salen en el mapa):\n' + sinPunto.map((s) => '  - ' + s.nombre + ' · ' + s.direccion).join('\n'));
