// Lotes del mapa rápido (public/data/rapido/lotes_*.js e indice.js). Correr desde web/:
//   node tools/generar_mapa_rapido.mjs && node tools/detalle_sector.mjs
// Viene de microrutas_mapa/tools/generar_mapa_rapido.js, ahora con datos/origen/lotes_correcciones.js (ver tools/lotes.mjs).
// - Un archivo de lotes por cuadrilla, para cargar solo la que se necesita.
// - Coordenadas con 6 decimales (~10 cm), sin altura, y sin vértices que no cambian la forma (Douglas-Peucker ~0,5 m).
// - Cada lote ya trae la dirección, descripción, frecuencia y comuna (no hace falta cargar direcciones_*.js).
// Las capas de apoyo (capa_*.js) no se tocan: indice.js conserva su lista.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, leerData, leerZonas } from './lotes.mjs';

const salida = path.join(DATA, 'rapido');

// ---------- Simplificación ----------
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
function douglas(pts, tol) {
  if (pts.length < 3) return pts;
  const marca = new Array(pts.length), pila = [[0, pts.length - 1]];
  marca[0] = marca[pts.length - 1] = true;
  while (pila.length) {
    const r = pila.pop();
    let max = 0, k = -1;
    for (let i = r[0] + 1; i < r[1]; i++) { const d = distSeg(pts[i], pts[r[0]], pts[r[1]]); if (d > max) { max = d; k = i; } }
    if (max > tol) { marca[k] = true; pila.push([r[0], k], [k, r[1]]); }
  }
  return pts.filter((p, i) => marca[i]);
}
const redondear = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
function anillo(r, tol) {
  const pts = r.map(redondear).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  const s = douglas(pts, tol);
  return s.length >= 4 ? s : pts.length >= 4 ? pts : null; // un anillo cerrado necesita al menos 4 puntos
}
function geometria(g, tol) {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => {
    const ext = anillo(p[0], tol);
    return ext ? [ext].concat(p.slice(1).map((h) => anillo(h, tol)).filter(Boolean)) : null;
  }).filter(Boolean);
  return polys.length ? polys : null;
}

// Geometría compacta: cada anillo es una lista plana de enteros (grados × 1e6), el primer
// punto absoluto y los demás como diferencia con el anterior: [lon0, lat0, dLon1, dLat1, ...].
// El mapa lo convierte de vuelta a [lat, lon] para Leaflet.
function codificar(polys) {
  const plano = (pts) => {
    const out = [];
    let px = 0, py = 0;
    for (const p of pts) { const x = Math.round(p[0] * 1e6), y = Math.round(p[1] * 1e6); out.push(x - px, y - py); px = x; py = y; }
    return out;
  };
  return polys.map((pol) => pol.map(plano));
}

function arreglarTildes(s) {
  s = String(s == null ? '' : s);
  try { return /Ã|Â/.test(s) ? decodeURIComponent(escape(s)) : s; } catch { return s; }
}
function limpio(v) { const s = String(v == null ? '' : v).trim(); return s === '' || s === 'null' ? undefined : s; }

const TOL = 0.000005; // ~0,5 m en Medellín
const prog = leerData('direcciones_lotes.js', 'direccionesLotes');
const extras = leerData('direcciones_fid.js', 'extrasLotes');

const grupos = {}, indice = { cuadrillas: {}, lotes: {}, mrs: {} };
for (const f of leerZonas()) {
  const p = f.properties || {}, g = geometria(f.geometry, TOL);
  if (!g) continue;
  const mr = limpio(p.Microruta), cuad = limpio(p.CUADRILLA) || 'sin', lote = limpio(p.No_Lote);
  const pr = (mr && prog[mr]) || {}, ex = (p.fid != null && extras[p.fid]) || {};
  // La descripción es la de la microrruta en la programación; el texto propio del polígono lo pone detalle_sector.mjs
  const desc = (pr.desc || arreglarTildes(p.Descripcio || '').replace(/ï¿½|�/g, '?')).replace(/\s+/g, ' ');
  const props = {
    l: lote, m: mr, c: cuad === 'sin' ? undefined : cuad,
    a: limpio(p.Area_campo) || (p.Area_m2 ? String(Math.round(p.Area_m2)) : undefined),
    d: limpio(p.DIRECCION) || limpio(pr.d) || limpio(ex.d), s: limpio(desc), f: limpio(pr.frec), k: limpio(ex.c),
  };
  (grupos[cuad] ??= []).push({ properties: props, geometry: g });
  if (lote && lote !== 'NA' && !indice.lotes[lote]) indice.lotes[lote] = cuad;
  if (mr && !indice.mrs[mr.toUpperCase()]) indice.mrs[mr.toUpperCase()] = cuad;
}

function limites(features) {
  const b = [90, 180, -90, -180];
  for (const f of features) for (const pol of f.geometry) for (const r of pol) for (const [x, y] of r) {
    if (y < b[0]) b[0] = y; if (x < b[1]) b[1] = x; if (y > b[2]) b[2] = y; if (x > b[3]) b[3] = x;
  }
  return [[b[0], b[1]], [b[2], b[3]]];
}

// Dirección, descripción, frecuencia y comuna se repiten en todos los polígonos de una microrruta:
// cada texto va una vez en "t" y el lote guarda su posición (el mapa los resuelve al cargar)
function deduplicar(features) {
  const t = [], pos = new Map();
  for (const f of features) {
    for (const k of ['d', 's', 'f', 'k']) {
      const v = f.properties[k];
      if (v === undefined) continue;
      if (!pos.has(v)) { pos.set(v, t.length); t.push(v); }
      f.properties[k] = pos.get(v);
    }
  }
  return { t, lotes: features.map((f) => ({ ...f.properties, g: codificar(f.geometry) })) };
}

for (const c of Object.keys(grupos)) {
  const txt = 'cargarLotes(' + JSON.stringify(c) + ',' + JSON.stringify(deduplicar(grupos[c])) + ');\n';
  fs.writeFileSync(path.join(salida, 'lotes_' + c + '.js'), txt);
  indice.cuadrillas[c] = { n: grupos[c].length, kb: Math.round(txt.length / 1024), b: limites(grupos[c]) };
  console.log('lotes_' + c + '.js', grupos[c].length + ' lotes', Math.round(txt.length / 1024) + ' KB');
}

const rutaIndice = path.join(salida, 'indice.js');
indice.capas = leerVarIndice().capas;
fs.writeFileSync(rutaIndice, '// Índice del mapa rápido. Generado con tools/generar_mapa_rapido.mjs, no editar a mano.\nvar indiceRapido = ' + JSON.stringify(indice) + ';\n');

function leerVarIndice() {
  const t = fs.readFileSync(rutaIndice, 'utf8');
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}
