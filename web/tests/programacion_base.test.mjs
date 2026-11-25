// Programación en la base (0030) con copia en el equipo: se prueba con una base de mentira en memoria. Uso: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearProgBase, leerLocal, guardarLocal, elegirActiva, bajarAntes, hechosCompactos } from '../src/programacion_base.js';

// localStorage de un equipo (se cambia de equipo cambiando el objeto)
var equipos = {}, actual = 'pc';
globalThis.localStorage = {
    getItem: (k) => ((equipos[actual] || {})[k] ?? null),
    setItem: (k, v) => { (equipos[actual] = equipos[actual] || {})[k] = String(v); },
    removeItem: (k) => { delete (equipos[actual] || {})[k]; }
};

// Base de mentira: tabla programaciones con lo que usa programacion_base.js
function crearBase(opc) {
    var filas = {}, sinTabla = opc && opc.sinTabla, caida = false;
    function consulta(tabla) {
        var filtros = [], accion = 'select', valor = null, cols = '*';
        var err = () => (caida ? { message: 'Failed to fetch' } : sinTabla ? { code: 'PGRST205', message: 'Could not find the table' } : null);
        var pasa = (f) => filtros.every(([c, v]) => f[c] === v);
        function correr() {
            var e = err();
            if (e) return { data: null, error: e };
            if (accion === 'select') return { data: Object.values(filas).filter(pasa).map((f) => JSON.parse(JSON.stringify(f))), error: null };
            if (accion === 'upsert') { filas[valor.mes] = Object.assign({}, valor); return { data: [Object.assign({}, valor)], error: null }; }
            if (accion === 'insert') { if (filas[valor.mes]) return { data: null, error: { code: '23505' } }; filas[valor.mes] = Object.assign({ version: 1, actualizado: new Date().toISOString() }, valor); return { data: null, error: null }; }
            if (accion === 'update') { var hits = Object.values(filas).filter(pasa); hits.forEach((f) => Object.assign(f, valor)); return { data: hits.map((f) => Object.assign({}, f)), error: null }; }
        }
        var q = {
            select(c) { if (accion === 'select') cols = c; return q; },
            eq(c, v) { filtros.push([c, v]); return q; },
            upsert(f) { accion = 'upsert'; valor = f; return q; },
            insert(f) { accion = 'insert'; valor = f; return q; },
            update(f) { accion = 'update'; valor = f; return q; },
            single() { var r = correr(); return Promise.resolve(r.error ? r : r.data.length ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116' } }); },
            maybeSingle() { var r = correr(); return Promise.resolve(r.error ? r : { data: r.data[0] || null, error: null }); },
            then(ok, mal) { return Promise.resolve(correr()).then(ok, mal); }
        };
        void cols; void tabla;
        return q;
    }
    return {
        filas, caer(si) { caida = si; },
        cliente: { from: consulta, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } }
    };
}
function prog(mes, hechos) {
    var q1 = [1, 2, 3].map((n) => ({ cuad: '1', mr: 'Z1CC000' + n, lote: String(n), semana: 1, dia: n, hecho: n <= (hechos || 0), fecha: n <= (hechos || 0) ? mes + '-0' + (n + 1) : '' }));
    return { mes, q1, q2: [], especiales: [], sif: {} };
}
beforeEach(() => { equipos = {}; actual = 'pc'; });

test('qué mes mostrar y cuándo bajar', () => {
    const f = [{ mes: '2026-10' }, { mes: '2026-11' }, { mes: '2026-12' }];
    assert.equal(elegirActiva(f, '', '2026-11'), '2026-11');
    assert.equal(elegirActiva(f, '2026-10', '2026-11'), '2026-11');      // llegó el mes en curso
    assert.equal(elegirActiva([{ mes: '2026-10' }], '', '2026-11'), '2026-10');
    assert.equal(elegirActiva([{ mes: '2026-12' }], '', '2026-11'), '2026-12');
    assert.equal(elegirActiva(f, '2026-12', '2026-11'), '2026-12');      // eligió el que viene: se respeta
    assert.equal(elegirActiva([], '', '2026-11'), '');
    assert.equal(bajarAntes(null, { mes: '2026-11', version: 1 }), true);
    assert.equal(bajarAntes({ prog: { mes: '2026-11' }, version: 2 }, { mes: '2026-11', version: 2 }), false);
    assert.equal(bajarAntes({ prog: { mes: '2026-11' }, version: 2 }, { mes: '2026-11', version: 3 }), true);
    assert.equal(bajarAntes({ prog: { mes: '2026-11' }, version: 2, pendiente: true }, { mes: '2026-11', version: 3 }), false);
    assert.deepEqual(hechosCompactos(prog('2026-11', 2)), [['Z1CC0001', '1', 1, '2026-11-02'], ['Z1CC0002', '2', 1, '2026-11-03']]);
});

test('se sube en un equipo y aparece en el otro', async () => {
    const db = crearBase();
    const pc = crearProgBase(db.cliente);
    const r = await pc.guardar({ archivo: 'nov.xlsx', cargado: '25/11/2026', prog: prog('2026-11', 1) }, { forzar: true });
    assert.deepEqual([r.ok, r.datos.version, r.datos.pendiente], [true, 1, false]);
    assert.equal(db.filas['2026-11'].hechos.length, 1);
    actual = 'cel';
    const s = await crearProgBase(db.cliente).sincronizar();
    assert.equal(s.cambio, true);
    assert.equal(leerLocal().prog.mes, '2026-11');
    assert.equal(leerLocal().version, 1);
    // Ya está al día: no vuelve a bajar
    assert.equal((await crearProgBase(db.cliente).sincronizar()).cambio, false);
});

test('dos equipos editan el mismo mes: el segundo no pisa al primero', async () => {
    const db = crearBase();
    await crearProgBase(db.cliente).guardar({ archivo: 'nov.xlsx', prog: prog('2026-11') }, { forzar: true });
    actual = 'cel'; await crearProgBase(db.cliente).sincronizar();
    actual = 'pc'; await crearProgBase(db.cliente).sincronizar();
    // El PC marca el lote 1
    const pc = leerLocal(); pc.prog.q1[0].hecho = true; pc.prog.q1[0].fecha = '2026-11-02';
    assert.equal((await crearProgBase(db.cliente).guardar(pc)).ok, true);
    // El celular (con la versión vieja) marca el lote 2: conflicto, no se pierde lo del PC
    actual = 'cel';
    const cel = leerLocal(); cel.prog.q1[1].hecho = true;
    const r = await crearProgBase(db.cliente).guardar(cel);
    assert.equal(r.conflicto, true);
    assert.match(r.aviso, /no se guardó/);
    assert.equal(db.filas['2026-11'].datos.q1[0].hecho, true);
    assert.equal(db.filas['2026-11'].datos.q1[1].hecho, false);
    assert.equal(leerLocal().prog.q1[0].hecho, true);   // el celular quedó con la de la base
});

test('sin señal queda en el equipo y se sube al volver', async () => {
    const db = crearBase();
    db.caer(true);
    const r = await crearProgBase(db.cliente).guardar({ archivo: 'nov.xlsx', prog: prog('2026-11') }, { forzar: true });
    assert.equal(r.ok, false);
    assert.match(r.aviso, /Sin conexión/);
    assert.equal(leerLocal().pendiente, true);
    db.caer(false);
    await crearProgBase(db.cliente).sincronizar();
    assert.equal(db.filas['2026-11'].version, 1);
    assert.equal(leerLocal().pendiente, false);
});

test('sin la migración: sirve con la copia y lo dice', async () => {
    const db = crearBase({ sinTabla: true });
    const r = await crearProgBase(db.cliente).guardar({ archivo: 'nov.xlsx', prog: prog('2026-11') }, { forzar: true });
    assert.match(r.aviso, /0030_programaciones/);
    assert.equal(leerLocal().prog.mes, '2026-11');
});

test('la copia vieja de un equipo sube si el mes no está en la base; si está, gana la base', async () => {
    const db = crearBase();
    guardarLocal({ archivo: 'oct.xlsx', prog: prog('2026-10') });          // copia de antes de la migración
    await crearProgBase(db.cliente).sincronizar();
    assert.equal(db.filas['2026-10'].archivo, 'oct.xlsx');
    actual = 'cel';
    guardarLocal({ archivo: 'oct viejo.xlsx', prog: prog('2026-10') });
    await crearProgBase(db.cliente).sincronizar();
    assert.equal(db.filas['2026-10'].archivo, 'oct.xlsx');
    assert.equal(leerLocal().archivo, 'oct.xlsx');
});

test('meses anteriores: entra el que falta; uno que ya está solo suma lo hecho si trae más', async () => {
    const db = crearBase();
    const b = crearProgBase(db.cliente);
    assert.equal((await b.agregarMes(prog('2026-08', 3), 'ago.xlsx')).estado, 'nuevo');
    assert.equal((await b.agregarMes(prog('2026-08', 1), 'ago (1).xlsx')).estado, 'ya');
    await b.guardar({ archivo: 'nov.xlsx', prog: prog('2026-11', 1) }, { forzar: true });
    assert.equal((await b.agregarMes(prog('2026-11', 3), 'nov viejo.xlsx')).estado, 'actualizado');
    assert.equal(db.filas['2026-11'].archivo, 'nov.xlsx');               // la programación del mes no se reemplazó
    assert.equal(db.filas['2026-11'].hechos.length, 3);
    assert.deepEqual((await b.historial()).map((f) => f.mes).sort(), ['2026-08', '2026-11']);
});
