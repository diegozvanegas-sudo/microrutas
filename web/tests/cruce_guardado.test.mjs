import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearGuardado, SIN_TABLA, SIN_BASE } from '../src/cruce/guardado.js';
import { prepararLugar, faltaTabla } from '../src/subsanaciones/lugares.js';

const almacen = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };
const rep = (fecha, cuad, n) => ({ fecha, cuad, items: Array.from({ length: n }, (_, i) => ({ mr: 'Z1CC000' + i, lote: String(i) })), texto: '' });
// Base de mentira: una tabla en memoria con lo que usa guardado.js (select/order, upsert, delete/eq/eq/select)
function base(opciones) {
    const o = Object.assign({ filas: [], error: null, cae: false }, opciones);
    return {
        o,
        from() {
            if (o.cae) throw new Error('Failed to fetch');
            return {
                select: () => ({ order: async () => (o.error ? { error: o.error } : { data: o.filas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)) }) }),
                upsert: async (nuevas) => {
                    if (o.error) return { error: o.error };
                    nuevas.forEach((n) => { o.filas = o.filas.filter((f) => !(f.fecha === n.fecha && f.cuadrilla === n.cuadrilla)).concat([n]); });
                    return { error: null };
                },
                delete: () => ({ eq: (c1, v1) => ({ eq: (c2, v2) => ({ select: async () => {
                    if (o.error) return { error: o.error };
                    const quita = o.filas.filter((f) => f[c1] === v1 && f[c2] === v2 && !f.ajeno);
                    o.filas = o.filas.filter((f) => quita.indexOf(f) === -1);
                    return { data: quita };
                } }) }) })
            };
        }
    };
}

test('guardado: con la base, queda en la base y en el equipo', async () => {
    const b = base(), a = almacen(), g = crearGuardado(b, a);
    const r = await g.guardar([rep('2026-11-03', '4', 3)]);
    assert.equal(r.donde, 'base');
    assert.equal(r.aviso, '');
    assert.equal(b.o.filas.length, 1);
    assert.deepEqual(b.o.filas[0].cuadrilla, '4');
    assert.equal((await crearGuardado(b, almacen()).leer()).reportes[0].items.length, 3);   // otro equipo lo ve
});

test('guardado: sin la tabla (falta la migración) sirve en el equipo y lo dice; al aplicarla, se sube solo', async () => {
    const b = base({ error: { code: 'PGRST205', message: "Could not find the table 'public.reportes_ejecucion'" } }), a = almacen(), g = crearGuardado(b, a);
    const r = await g.guardar([rep('2026-11-03', '4', 2)]);
    assert.equal(r.donde, 'equipo');
    assert.equal(r.aviso, SIN_TABLA);
    assert.equal(r.reportes.length, 1);
    assert.equal((await g.leer()).reportes.length, 1);
    b.o.error = null;                                   // se aplicó la migración
    const luego = await g.leer();
    assert.equal(luego.donde, 'base');
    assert.equal(b.o.filas.length, 1);
    assert.ok(!luego.reportes[0].pendiente);
});

test('guardado: sin señal queda en el equipo; lo que otro borró en la base desaparece al leer', async () => {
    const b = base({ cae: true }), a = almacen(), g = crearGuardado(b, a);
    assert.equal((await g.guardar([rep('2026-11-03', '4', 2)])).aviso, SIN_BASE);
    b.o.cae = false;
    await g.leer();
    assert.equal(b.o.filas.length, 1);
    b.o.filas = [];                                     // lo borraron desde otro equipo
    assert.equal((await g.leer()).reportes.length, 0);
});

test('guardado: el del mismo día y cuadrilla reemplaza; borrar lo quita de los dos lados', async () => {
    const b = base(), g = crearGuardado(b, almacen());
    await g.guardar([rep('2026-11-03', '4', 2), rep('2026-11-03', '5', 1)]);
    const r = await g.guardar([rep('2026-11-03', '4', 6)]);
    assert.equal(r.reportes.length, 2);
    assert.equal(r.reportes.find((x) => x.cuad === '4').items.length, 6);
    const tras = await g.borrar(r.reportes.find((x) => x.cuad === '5'));
    assert.deepEqual(tras.reportes.map((x) => x.cuad), ['4']);
    assert.equal(b.o.filas.length, 1);
    b.o.filas[0].ajeno = true;                          // lo cargó otra persona: la base no deja borrarlo
    await assert.rejects(g.borrar(tras.reportes[0]), /otra persona/);
});

test('guardado: sin base de datos, todo en el equipo', async () => {
    const g = crearGuardado(null, almacen());
    assert.equal((await g.guardar([rep('2026-11-03', '4', 2)])).donde, 'equipo');
    assert.equal((await g.leer()).reportes.length, 1);
    assert.equal((await g.borrar(rep('2026-11-03', '4', 0))).reportes.length, 0);
});

test('libreta: lo que se guarda se revisa antes', () => {
    assert.deepEqual(prepararLugar({ nombre: '  La   Cañada ', lote: '391' }).fila, { nombre: 'La Cañada', clave: 'canada', lote: '391', microrruta: null, lat: null, lon: null });
    assert.deepEqual(prepararLugar({ nombre: 'Sector Convento', microrruta: 'z2cc0211', lat: '6.28592', lon: -75.59467 }).fila,
        { nombre: 'Sector Convento', clave: 'sector convento', lote: null, microrruta: 'Z2CC0211', lat: 6.28592, lon: -75.59467 });
    assert.match(prepararLugar({ nombre: 'la', lote: '1' }).error, /nombre/);
    assert.match(prepararLugar({ nombre: 'La Cañada' }).error, /lote/);
    assert.match(prepararLugar({ nombre: 'x'.repeat(90), lote: '1' }).error, /largo/);
    assert.equal(prepararLugar({ nombre: 'La Cañada', lote: '391', lat: 6.2 }).fila.lat, null);   // punto a medias: no se guarda
    assert.ok(faltaTabla({ code: '42P01' }) && faltaTabla({ message: 'relation "public.lugares" does not exist' }) && !faltaTabla({ code: '42501' }));
});
