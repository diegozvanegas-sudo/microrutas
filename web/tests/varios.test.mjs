// ➕ Varios lotes a la vez (src/subsanaciones/varios.js): leer lo escrito, la lista por cuadrilla y la visita de cada lote,
// con la programación real (public/data/direcciones_lotes.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { aMicrorruta, leerLotes, cuadrillas, lotesParaElegir, registroDeLote, nombreLote } from '../src/subsanaciones/varios.js';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/data/direcciones_lotes.js', import.meta.url), 'utf8') + ';this.L = direccionesLotes;', ctx);
const LOTES = ctx.L, mrPorLote = {};
Object.keys(LOTES).forEach((mr) => { if (LOTES[mr].lote && !mrPorLote[LOTES[mr].lote]) mrPorLote[LOTES[mr].lote] = mr; });
const conLote = Object.keys(LOTES).find((mr) => LOTES[mr].lote && LOTES[mr].lote !== 'NA' && LOTES[mr].cuad && LOTES[mr].area);
const suLote = String(LOTES[conLote].lote);

test('microrruta desde lo escrito: exacta, sin ceros, en minúscula o por número de lote', () => {
  assert.equal(aMicrorruta(conLote, LOTES, mrPorLote), conLote);
  assert.equal(aMicrorruta(conLote.toLowerCase(), LOTES, mrPorLote), conLote);
  const m = conLote.match(/^Z(\d+)CC0*(\d+)$/);
  assert.equal(aMicrorruta(m[1] + 'cc' + m[2], LOTES, mrPorLote), conLote);
  assert.equal(aMicrorruta(suLote, LOTES, mrPorLote), mrPorLote[suLote]);
  assert.equal(aMicrorruta('99999', LOTES, mrPorLote), '');
  assert.equal(aMicrorruta('', LOTES, mrPorLote), '');
});

test('leer varios: comas, espacios y renglones; sin repetir; lo que no existe aparte', () => {
  const r = leerLotes(suLote + ', ' + conLote + ' ;99999\n' + suLote + ' abc', LOTES, mrPorLote);
  assert.deepEqual(r.mrs, [mrPorLote[suLote]].concat(mrPorLote[suLote] === conLote ? [] : [conLote]));
  assert.deepEqual(r.malos, ['99999', 'abc']);
});

test('cuadrillas en orden numérico y la lista de una cuadrilla', () => {
  const c = cuadrillas(LOTES);
  assert.ok(c.length >= 5, 'hay varias cuadrillas: ' + c.join(','));
  assert.deepEqual(c.filter((x) => Number(x)), c.filter((x) => Number(x)).slice().sort((a, b) => a - b));
  const cuad = String(LOTES[conLote].cuad), lista = lotesParaElegir(LOTES, cuad, '');
  assert.ok(lista.includes(conLote));
  assert.ok(lista.every((mr) => String(LOTES[mr].cuad).trim() === cuad));
  assert.ok(lotesParaElegir(LOTES, '', suLote).includes(mrPorLote[suLote]));
  assert.equal(lotesParaElegir(LOTES, '', '', 10).length, 10);
});

test('la visita de cada lote: lo común igual y los datos de ese lote', () => {
  const comun = { INTERVENTOR: 'DZ', 'FECHA DE LA VISITA': '23/11/2026', CARNET: 'NO', MICRORRUTA: 'Z9CC9999', LOTE: '1', ZONA: '9', 'OBSERVACIONES NOVEDADES': 'CARNÉ SIN FOTO' };
  const r = registroDeLote(comun, conLote, LOTES);
  assert.equal(r.MICRORRUTA, conLote);
  assert.equal(r.LOTE, suLote);
  assert.equal(r.CUADRILLA, String(LOTES[conLote].cuad));
  assert.equal(r.ZONA, conLote.match(/^Z(\d+)/)[1]);
  assert.equal(r['ÁREA M2'], Number(LOTES[conLote].area).toLocaleString('es-CO'));
  assert.equal(r.CARNET, 'NO');
  assert.equal(r['OBSERVACIONES NOVEDADES'], 'CARNÉ SIN FOTO');
  assert.equal(comun.MICRORRUTA, 'Z9CC9999', 'no cambia lo común');
  assert.equal(nombreLote(conLote, LOTES), conLote + ' · Lote ' + suLote);
});
