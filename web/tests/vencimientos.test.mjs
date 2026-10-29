// Vencimientos de las pendientes por cuadrilla (src/subsanaciones/vencimientos.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fijarItems } from '../src/subsanaciones/estado.js';
import { vencimientos, textoVencimientos, tramo } from '../src/subsanaciones/vencimientos.js';
import { hoy } from '../src/subsanaciones/util.js';

// Fecha de visita hace n días, como la entrega la base (dd/mm/aaaa)
function hace(n) {
    var d = new Date(hoy() + 'T12:00:00');
    d.setDate(d.getDate() - n);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
}
function visita(id, cuad, n, item, extra) {
    return Object.assign({ ID: 'SUB-' + id, LOTE: id, MICRORRUTA: 'Z1CC00' + id, CUADRILLA: cuad, ESTADO: 'PENDIENTE', 'FECHA DE LA VISITA': hace(n), [item]: 'NO' }, extra || {});
}

test('vencimientos: tramos por días que quedan o de atraso', () => {
    assert.equal(tramo({ descuento: false, resta: 0 }), 'hoy');
    assert.equal(tramo({ descuento: false, resta: 1 }), 'manana');
    assert.equal(tramo({ descuento: false, resta: 4 }), 'pronto');
    assert.equal(tramo({ descuento: true, vencido: 1 }), 'v1');
    assert.equal(tramo({ descuento: true, vencido: 3 }), 'v2');
    assert.equal(tramo({ descuento: true, vencido: 9 }), 'v4');
    assert.equal(tramo({ descuento: true, vencido: 0 }), 'ns');
    assert.equal(tramo(null), null);
});

test('vencimientos: resumen por cuadrilla y texto para WhatsApp', () => {
    fijarItems(['BARRIDO DEL LOTE', 'ALTURA DEL CORTE', 'AFECTACION A ARBOLES'], []);
    var lista = [
        visita(1, '2', 1, 'BARRIDO DEL LOTE'),            // mismo día → vencida hace 1 día
        visita(2, '2', 0, 'ALTURA DEL CORTE'),            // 5 días → le quedan 5
        visita(3, 'C3', 5, 'ALTURA DEL CORTE'),           // vence hoy
        visita(4, '3', 10, 'ALTURA DEL CORTE'),           // vencida hace 5 días
        visita(5, '3', 0, 'AFECTACION A ARBOLES'),        // no subsanable
        visita(6, '2', 9, 'ALTURA DEL CORTE', { ESTADO: 'SUBSANADO' }), // no cuenta
    ];
    var r = vencimientos(lista);
    assert.deepEqual(r.filas.map((f) => f.cuad), ['2', '3']);
    assert.equal(r.total.total, 5);
    assert.equal(r.total.descuento, 3);
    var c2 = r.filas[0], c3 = r.filas[1];
    assert.deepEqual([c2.v1, c2.pronto, c2.descuento], [1, 1, 1]);
    assert.deepEqual([c3.hoy, c3.v4, c3.ns, c3.descuento], [1, 1, 1, 2]);
    // Lo más atrasado primero; la que vence en 5 días al final
    assert.equal(r.detalle[0].r.LOTE, 4);
    assert.equal(r.detalle[r.detalle.length - 1].r.LOTE, 2);

    var txt = textoVencimientos(r, '29/10/2026');
    assert.match(txt, /Corte: 29\/10\/2026 · 5 pendientes/);
    assert.match(txt, /Para descuento: 3 \(1 día: 1 · 2-3 días: 0 · 4\+ días: 1 · no subsanables: 1\)/);
    assert.match(txt, /Cuadrilla 3\n- Lote 4 · Z1CC004 · visita .* · Plazo vencido hace 5 días/);
    assert.doesNotMatch(txt, /Lote 2 /);  // vence en 5 días: no es urgente
    assert.equal(textoVencimientos(vencimientos([]), '29/10/2026'), '');
});
