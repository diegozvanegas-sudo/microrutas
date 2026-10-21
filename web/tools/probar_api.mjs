// Prueba src/api.js contra Supabase (local o el real) con un usuario de prueba.
// Uso: PRUEBA_CORREO=... PRUEBA_CLAVE=... npm run probar:api
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env.local o .env. Borra lo que crea.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { crearApi } from '../src/api.js';

const env = {};
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(new URL(`../${f}`, import.meta.url))) continue;
  for (const l of fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2];
  }
}
const cliente = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let ok = 0;
const caso = async (nombre, fn) => {
  try { await fn(); console.log(`  ✓ ${nombre}`); ok++; }
  catch (e) { console.log(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

console.log(`Supabase: ${env.VITE_SUPABASE_URL}`);

console.log('Sin sesión');
const anonima = crearApi(cliente());
await caso('lee ítems y recordatorios, pero no ve visitas', async () => {
  const d = await anonima.leer();
  assert.equal(d.items.length, 9);
  assert.equal(d.itemsOperacion.length, 10);
  assert.equal(d.recordatorios.length, 4);
  assert.deepEqual(d.registros, []);
});
await caso('no puede guardar', async () => {
  await assert.rejects(anonima.enviar('crear', { tipo: 'EJECUCIÓN', registro: { LOTE: '1', PLATEO: 'SI' } }), /permiso|row-level/i);
});

console.log('Con sesión');
const sb = cliente();
const ingreso = await sb.auth.signInWithPassword({ email: process.env.PRUEBA_CORREO, password: process.env.PRUEBA_CLAVE });
if (ingreso.error) throw new Error('No se pudo ingresar con PRUEBA_CORREO / PRUEBA_CLAVE: ' + ingreso.error.message);
const api = crearApi(sb);
let id;

await caso('crear: visita con un NO queda PENDIENTE, con los datos como los muestra la página', async () => {
  const { registro: r } = await api.enviar('crear', {
    tipo: 'EJECUCIÓN',
    registro: {
      MICRORRUTA: 'z5cc0026', LOTE: '841', 'ÁREA M2': '1.234,5', ZONA: '5', CUADRILLA: 'C8', 'FECHA DE EJECUCIÓN': '18/10/2026',
      'FECHA DE LA VISITA': '20/10/2026', INTERVENTOR: 'JP', PLATEO: 'NO', BORDEO: 'SI', 'OBSERVACIONES NOVEDADES': 'Falta plateo',
      'FECHA SUBSANACIÓN': '', 'REGISTRADO POR': '', EVIDENCIA: '', TIPO: 'EJECUCIÓN',
    },
  });
  id = r.ID;
  assert.match(r.ID, /^SUB-\d{5}$/);
  assert.equal(r.TIPO, 'EJECUCIÓN');
  assert.equal(r.ESTADO, 'PENDIENTE');
  assert.equal(r.MICRORRUTA, 'Z5CC0026');
  assert.equal(r.CUADRILLA, '8');
  assert.equal(r['ÁREA M2'], '1.234,5');
  assert.equal(r['FECHA DE LA VISITA'], '20/10/2026');
  assert.equal(r['FECHA DE EJECUCIÓN'], '18/10/2026');
  assert.equal(r.PLATEO, 'NO');
  assert.equal(r['CANTIDAD DE NOVEDADES'], '1');
  assert.equal(r['REGISTRADO POR'], process.env.PRUEBA_CORREO);
  assert.match(r['FECHA DE REGISTRO'], /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});

await caso('actualizar: pasar el NO a SI la deja SUBSANADO con fecha e ítem subsanado', async () => {
  const { registro: r } = await api.enviar('actualizar', { id, registro: { PLATEO: 'SI', BORDEO: 'SI', 'OBSERVACIÓN SUBSANACIÓN': 'Ya platearon', EVIDENCIA: 'https://ejemplo.com/foto' } });
  assert.equal(r.ESTADO, 'SUBSANADO');
  assert.equal(r['ÍTEMS SUBSANADOS'], 'PLATEO');
  assert.match(r['FECHA SUBSANACIÓN'], /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(r.EVIDENCIA, 'https://ejemplo.com/foto');
  assert.equal(r.INTERVENTOR, 'JP'); // lo que no se mandó no se borra
});

await caso('leer: la visita aparece con las demás', async () => {
  const d = await api.leer();
  const r = d.registros.find((x) => x.ID === id);
  assert.ok(r);
  assert.equal(r.ESTADO, 'SUBSANADO');
});

await caso('pre-ruta: se guarda y vuelve con las mismas horas (hora de Colombia)', async () => {
  await api.enviar('guardar_ruta', {
    cuadrilla: 'C99',
    paradas: [
      { lote: '532', fecha: '14/10/2026', cargada: '14/10/2026 07:48:05', encurso: '' },
      { lote: 'z2cc0339', fecha: '', cargada: '15/10/2026', encurso: '15/10/2026 06:30:00' },
    ],
  });
  const rutas = (await api.leer()).rutas.filter((r) => r.cuadrilla === '99');
  assert.deepEqual(rutas, [
    { cuadrilla: '99', lote: '532', fecha: '14/10/2026', orden: '1', cargada: '14/10/2026 07:48:05', encurso: '' },
    { cuadrilla: '99', lote: 'Z2CC0339', fecha: '', orden: '2', cargada: '15/10/2026 00:00:00', encurso: '15/10/2026 06:30:00' },
  ]);
  await api.enviar('guardar_ruta', { cuadrilla: '99', paradas: [] });
  assert.equal((await api.leer()).rutas.filter((r) => r.cuadrilla === '99').length, 0);
});

await caso('eliminar: la borra y luego ya no existe', async () => {
  assert.deepEqual(await api.enviar('eliminar', { id }), { eliminado: id });
  await assert.rejects(api.enviar('actualizar', { id, registro: { PLATEO: 'SI' } }), /No existe/);
});

await caso('ítem mal escrito: la base lo rechaza con un mensaje claro', async () => {
  // La página solo manda ítems que existen; aquí se fuerza uno que no
  await assert.rejects(sb.from('visitas').insert({ tipo: 'EJECUCION', respuestas: { PLATO: 'SI' } }).then((r) => { if (r.error) throw new Error(r.error.message); }), /Ítem desconocido/);
});

await sb.auth.signOut();
console.log(`\n${ok} casos correctos${process.exitCode ? ', hay fallas' : ''}.`);
