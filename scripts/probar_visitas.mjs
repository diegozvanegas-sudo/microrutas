// Prueba las reglas de las visitas y las pre-rutas dentro de una transacción que se deshace al final:
// no deja nada guardado.  npm run probar:visitas
import assert from 'node:assert/strict';
import { conectar } from './db.mjs';

const db = await conectar();
const uno = async (sql, params) => (await db.query(sql, params)).rows[0];
let ok = 0;
const caso = async (nombre, fn) => {
  await db.query('savepoint caso');
  try {
    await fn();
    await db.query('release savepoint caso');
    console.log(`  ✓ ${nombre}`);
    ok++;
  } catch (e) {
    await db.query('rollback to savepoint caso');
    console.log(`  ✗ ${nombre}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

try {
  await db.query('begin');
  console.log('Visitas');

  await caso('nueva visita con un NO queda PENDIENTE con ID SUB-#####', async () => {
    const v = await uno(`insert into visitas (tipo, microrruta, lote, fecha_visita, respuestas, observaciones)
      values ('EJECUCION', 'Z5CC0026', '841', current_date - 5, '{"PLATEO": "no", "BORDEO": "SI"}', 'Falta plateo')
      returning *`);
    assert.match(v.id, /^SUB-\d{5}$/);
    assert.equal(v.estado, 'PENDIENTE');
    assert.equal(v.respuestas.PLATEO, 'NO');
    assert.equal(v.cantidad_novedades, 1);
    const d = await uno('select observacion_excel, dias_pendiente from visitas_detalle where id = $1', [v.id]);
    assert.equal(d.observacion_excel, 'PENDIENTE POR SUBSANAR - Falta plateo');
    assert.equal(d.dias_pendiente, 5);
  });

  await caso('pasar el NO a SI la deja SUBSANADO, con fecha e ítem subsanado', async () => {
    const { id } = await uno(`insert into visitas (tipo, lote, respuestas)
      values ('EJECUCION', '841', '{"PLATEO": "NO", "BORDEO": "NO"}') returning id`);
    let v = await uno(`update visitas set respuestas = '{"PLATEO": "SI", "BORDEO": "NO"}' where id = $1 returning *`, [id]);
    assert.equal(v.estado, 'PENDIENTE');
    assert.deepEqual(v.items_subsanados, ['PLATEO']);
    assert.equal(v.cantidad_novedades, 2);
    v = await uno(`update visitas set respuestas = '{"PLATEO": "SI", "BORDEO": "SI"}' where id = $1 returning *`, [id]);
    assert.equal(v.estado, 'SUBSANADO');
    assert.deepEqual(v.items_subsanados, ['BORDEO', 'PLATEO']);
    assert.equal(v.cantidad_novedades, 2);
    assert.ok(v.fecha_subsanacion);
    assert.equal(v.id, id);
  });

  await caso('un ítem subsanado que vuelve a NO deja de contar como subsanado', async () => {
    const { id } = await uno(`insert into visitas (tipo, lote, respuestas) values ('EJECUCION', '1', '{"PLATEO": "NO"}') returning id`);
    await db.query(`update visitas set respuestas = '{"PLATEO": "SI"}' where id = $1`, [id]);
    const v = await uno(`update visitas set respuestas = '{"PLATEO": "NO"}' where id = $1 returning *`, [id]);
    assert.equal(v.estado, 'PENDIENTE');
    assert.deepEqual(v.items_subsanados, []);
  });

  await caso('todo en SI desde la primera visita = SIN NOVEDAD', async () => {
    const v = await uno(`insert into visitas (tipo, lote, respuestas) values ('EJECUCION', '2', '{"PLATEO": "SI", "BORDEO": "N/A"}') returning *`);
    assert.equal(v.estado, 'SIN NOVEDAD');
    const d = await uno('select observacion_excel from visitas_detalle where id = $1', [v.id]);
    assert.equal(d.observacion_excel, 'SIN NOVEDAD');
  });

  await caso('LOTE CERRADO con ítems en N/A = CERRADO', async () => {
    const v = await uno(`insert into visitas (tipo, lote, respuestas, observaciones)
      values ('EJECUCION', '3', '{"PLATEO": "NA"}', 'LOTE CERRADO - portería no dejó entrar') returning *`);
    assert.equal(v.estado, 'CERRADO');
    assert.equal(v.respuestas.PLATEO, 'N/A');
  });

  await caso('registro pasado del Excel ya subsanado (con items_subsanados) entra como SUBSANADO', async () => {
    const v = await uno(`insert into visitas (tipo, lote, respuestas, items_subsanados, fecha_subsanacion)
      values ('EJECUCION', '4', '{"PLATEO": "SI"}', '{PLATEO}', '2026-10-17') returning *`);
    assert.equal(v.estado, 'SUBSANADO');
    assert.equal(v.cantidad_novedades, 1);
    const d = await uno('select observacion_excel from visitas_detalle where id = $1', [v.id]);
    assert.equal(d.observacion_excel, 'NOVEDAD SUBSANADA EL 17/10/2026');
  });

  await caso('visita de operación recibe ID OPE-#####', async () => {
    const v = await uno(`insert into visitas (tipo, lote, respuestas) values ('OPERACION', '5', '{"EPP": "NO"}') returning *`);
    assert.match(v.id, /^OPE-\d{5}$/);
    assert.equal(v.estado, 'PENDIENTE');
  });

  await caso('rechaza ítems que no existen y valores raros', async () => {
    await db.query('savepoint x');
    await assert.rejects(db.query(`insert into visitas (tipo, respuestas) values ('EJECUCION', '{"PLATO": "SI"}')`), /Ítem desconocido/);
    await db.query('rollback to savepoint x');
    await assert.rejects(db.query(`insert into visitas (tipo, respuestas) values ('EJECUCION', '{"PLATEO": "TAL VEZ"}')`), /Valor no válido/);
    await db.query('rollback to savepoint x');
    await assert.rejects(db.query(`insert into visitas (tipo, respuestas) values ('OPERACION', '{"PLATEO": "SI"}')`), /Ítem desconocido/);
    await db.query('rollback to savepoint x');
  });

  await caso('no se puede cambiar el ID ni el estado a mano', async () => {
    const { id } = await uno(`insert into visitas (tipo, lote, respuestas) values ('EJECUCION', '6', '{"PLATEO": "NO"}') returning id`);
    const v = await uno(`update visitas set id = 'SUB-99999', estado = 'SIN NOVEDAD' where id = $1 returning *`, [id]);
    assert.equal(v.id, id);
    assert.equal(v.estado, 'PENDIENTE');
  });

  console.log('Pre-rutas');

  await caso('guardar_ruta reemplaza los lotes de la cuadrilla y los numera', async () => {
    await db.query(`select guardar_ruta('C4', '[{"lote": "z2cc0339"}, {"lote": "532", "fecha": "2026-10-21"}]')`);
    const filas = (await db.query(`select * from guardar_ruta('4', '[{"lote": "371"}, {"lote": ""}, {"lote": "532"}]')`)).rows;
    assert.deepEqual(filas.map((f) => [f.cuadrilla, f.lote, f.orden]), [['4', '371', 1], ['4', '532', 3]]);
    const vacia = (await db.query(`select * from guardar_ruta('4', '[]')`)).rows;
    assert.equal(vacia.length, 0);
  });

  console.log('Ítems y recordatorios');

  await caso('vienen los 9 ítems de ejecución, los 10 de operación y 4 recordatorios', async () => {
    const r = await uno(`select
      (select count(*)::int from items where tipo = 'EJECUCION') as ej,
      (select count(*)::int from items where tipo = 'OPERACION') as op,
      (select count(*)::int from recordatorios) as rec`);
    assert.deepEqual(r, { ej: 9, op: 10, rec: 4 });
  });
} finally {
  await db.query('rollback');
  await db.end();
}
console.log(`\n${ok} casos correctos${process.exitCode ? ', hay fallas' : ''}. (Nada quedó guardado.)`);
