// Texto propio de cada polígono ("Este sector") en los mapas. Correr desde web/: node tools/detalle_sector.mjs
// - public/data/rapido/lotes_*.js: llena el campo x de cada lote (antes faltaba cuando el texto venía con tildes dañadas "ï¿½")
// - public/data/detalle_sector.js: los textos que venían dañados, ya reparados, por fid, para el mapa completo (index.html)
// Las tildes dañadas se recuperan con las palabras de los textos sanos; lo que no se reconoce queda con "?".
// No toca datos/origen ni Supabase: el Excel de operación sigue igual.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(import.meta.dirname, '..', 'public', 'data');
const MAL = /ï¿½|�/;

function leerVar(archivo, nombre) {
  const ctx = {};
  new Function('ctx', fs.readFileSync(path.join(DATA, archivo), 'utf8').replace('var ' + nombre, 'ctx.' + nombre))(ctx);
  return ctx[nombre];
}
const limpio = (v) => (v == null ? '' : String(v).trim()) || undefined;
const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const prog = leerVar('direcciones_lotes.js', 'direccionesLotes');
const zonas = leerVar('zonasverdes__areas_zonas_verdes_2.js', 'json_zonasverdes__areas_zonas_verdes_2').features;

// Palabras con tilde o ñ que aparecen en los textos sanos, con cuántas veces salen (gana la más usada)
const veces = {};
const sanos = Object.values(prog).flatMap((p) => [p.desc, p.d]).concat(zonas.map((f) => f.properties.Descripcio))
  .map(arreglarTildes).filter((t) => t && !MAL.test(t));
// Las que más salen dañadas y no están escritas bien en ningún texto
sanos.push('ciclovía señal construcción después pública vial vehicular vehículos también edificación bahía bahías notaría ' +
  'cinturón parcelación aquí numeración antigua triangular José último Belén Avendaño niños actúa añade pasará');
for (const w of sanos.join(' ').split(/[^A-Za-zÀ-ÿ]+/)) {
  if (/[À-ÿ]/.test(w)) veces[w.toLowerCase()] = (veces[w.toLowerCase()] || 0) + 1;
}
const conocidas = Object.keys(veces).sort((a, b) => veces[b] - veces[a]);

function repararPalabra(w) {
  const partes = w.split(/ï¿½|�/);
  const re = new RegExp('^' + partes.map((s) => s.toLowerCase()).join('[À-ÿ]') + '$');
  const hallada = conocidas.find((p) => re.test(p));
  if (hallada) return /^[A-ZÀ-Þ]/.test(w) ? hallada[0].toUpperCase() + hallada.slice(1) : hallada;
  // Letras de más que quedaron dañadas en vez de una tilde ("desp?es", "tamb?en", "Tal?d")
  const sobra = { despes: 'después', tamben: 'también', tald: 'talud', publica: 'pública' }[partes.join('').toLowerCase()];
  if (sobra) return /^[A-Z]/.test(w) ? sobra[0].toUpperCase() + sobra.slice(1) : sobra;
  return partes.join('?').replace(/ci\?n$/i, 'ción').replace(/si\?n$/i, 'sión');
}
// "UrbanizaciÃ³n": UTF-8 leído como Latin-1 (lo mismo que arreglarTildes en index.html)
function arreglarTildes(s) {
  s = String(s || '');
  if (!/Ã|Â/.test(s)) return s;
  const r = Buffer.from(s, 'latin1').toString('utf8');
  return /�/.test(r) && !MAL.test(s) ? s : r;
}
function reparar(texto) {
  return arreglarTildes(texto).replace(/[A-Za-zÀ-ÿ]*(?:(?:ï¿½|�)[A-Za-zÀ-ÿ]*)+/g, repararPalabra).replace(/\s+/g, ' ').trim();
}

// Texto del polígono, salvo cuando es igual a la descripción de la microrruta (sería repetirla)
function detalle(p) {
  const propio = reparar(p.Descripcio), pr = prog[limpio(p.Microruta)];
  return propio && !(pr && plano(pr.desc) === plano(propio)) ? propio : undefined;
}

const porFid = {};
for (const f of zonas) {
  const x = detalle(f.properties);
  if (x && MAL.test(f.properties.Descripcio)) porFid[f.properties.fid] = x;
}
fs.writeFileSync(path.join(DATA, 'detalle_sector.js'),
  '// Texto propio de los polígonos que venían con tildes dañadas, ya reparado, por fid. Generado con tools/detalle_sector.mjs, no editar a mano.\n' +
  'window.detalleSector = ' + JSON.stringify(porFid) + ';\n');

// Mapa rápido: los lotes de cada cuadrilla están en el mismo orden que en zonas (se saltan los que no tienen geometría)
const porCuadrilla = {};
for (const f of zonas) (porCuadrilla[limpio(f.properties.CUADRILLA) || 'sin'] ??= []).push(f.properties);
let llenos = 0, total = 0;
for (const archivo of fs.readdirSync(path.join(DATA, 'rapido')).filter((a) => /^lotes_.+\.js$/.test(a))) {
  const ruta = path.join(DATA, 'rapido', archivo), cuad = archivo.slice(6, -3);
  let datos;
  const texto = fs.readFileSync(ruta, 'utf8');
  new Function('cargarLotes', texto)((c, d) => { datos = d; });
  const t = datos.t, indiceT = new Map(t.map((s, i) => [s, i]));
  const candidatos = porCuadrilla[cuad] || [];
  let j = 0;
  for (const lote of datos.lotes) {
    while (j < candidatos.length && (limpio(candidatos[j].Microruta) !== lote.m || limpio(candidatos[j].No_Lote) !== lote.l)) j++;
    if (j === candidatos.length) throw new Error(archivo + ': no se encontró el polígono de ' + lote.m + ' / ' + lote.l);
    const x = detalle(candidatos[j++]);
    total++;
    delete lote.x;
    if (!x) continue;
    if (!indiceT.has(x)) { indiceT.set(x, t.length); t.push(x); }
    // Mismo orden de campos que antes: x va antes de la geometría
    const { g, ...resto } = lote;
    Object.keys(lote).forEach((k) => delete lote[k]);
    Object.assign(lote, resto, { x: indiceT.get(x), g });
    llenos++;
  }
  fs.writeFileSync(ruta, 'cargarLotes(' + JSON.stringify(cuad) + ',' + JSON.stringify(datos) + ');\n');
}
console.log('Polígonos con texto propio: ' + llenos + ' de ' + total + ' en el mapa rápido; ' + Object.keys(porFid).length + ' en detalle_sector.js');
