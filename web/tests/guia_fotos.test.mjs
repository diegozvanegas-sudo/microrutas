// Guía de campo: dibujos ✅ bien / ❌ mal y nombres y carpetas de las fotos de campo (src/contrato/dibujos.js y fotosguia.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dibujoDe, clavesConDibujo, slug } from '../src/contrato/dibujos.js';
import { carpetaPunto, nombreFoto, leerNombre, contar, crearFotosGuia, SIN_ACTIVAR } from '../src/contrato/fotosguia.js';

// Las claves de las dos secciones de la guía (datos/contrato/guia_campo.json, privado): cada una debe tener su dibujo
var CLAVES = ['Limpieza previa', 'Afectación a árboles', 'Limpieza manual de árboles', 'Plateo', 'Corte de césped: disparejo / altura', 'Bordeo',
    'Recolección y disposición de residuos', 'Barrido de lote y zonas duras', 'Sectores sin intervenir', 'Implementación y estado del PMT', 'Valla informativa',
    'Malla(s) de protección', 'Demarcación del área de trabajo', 'Carnet', 'Estado de dotación', 'EPP', 'Herramientas', 'Rotulación de recipientes', 'Manejo de combustible'];

test('slug: sin tildes, minúsculas y guiones', () => {
    assert.equal(slug('Malla(s) de protección'), 'malla-s-de-proteccion');
    assert.equal(slug('Corte de césped: disparejo / altura'), 'corte-de-cesped-disparejo-altura');
    assert.equal(slug(''), '');
});

test('dibujos: los 19 puntos tienen bien y mal, con texto y SVG que abre y cierra', () => {
    assert.equal(clavesConDibujo().length, CLAVES.length);
    CLAVES.forEach(function (c) {
        var d = dibujoDe(c);
        assert.ok(d, 'falta el dibujo de ' + c);
        ['bien', 'mal'].forEach(function (lado) {
            assert.ok(d[lado].txt.length > 10, c + ' ' + lado + ': texto corto');
            assert.match(d[lado].svg, /^<svg viewBox="0 0 200 120" role="img" aria-label="(Bien|Mal): /);
            assert.ok(d[lado].svg.endsWith('</svg>'));
            assert.doesNotMatch(d[lado].svg, /undefined|NaN/, c + ' ' + lado + ': valor sin definir en el dibujo');
            assert.equal((d[lado].svg.match(/<svg/g) || []).length, 1);
        });
    });
    assert.equal(dibujoDe('No existe'), null);
});

test('fotos: carpeta por punto y nombre con bien / mal y lo que se ve', () => {
    assert.equal(carpetaPunto('items-ejecutado', 'Plateo'), 'items-ejecutado/plateo');
    var n = nombreFoto('Plateo pequeño junto al andén, lote 532', 'mal', 1763500000000);
    assert.match(n, /^[a-z0-9]+-mal_n[A-Za-z0-9_-]+\.jpg$/);   // solo letras sin tilde en el nombre del archivo
    var x = leerNombre(n);
    assert.equal(x.tipo, 'mal');
    assert.equal(x.nota, 'Plateo pequeño junto al andén, lote 532');
    assert.equal(leerNombre('abc-bien_plateo-completo.jpg').nota, 'plateo completo');   // nombre a mano, sin codificar
    assert.equal(x.fecha.getTime(), 1763500000000);
    assert.equal(leerNombre(nombreFoto('', 'bien', 5)).nota, '');
    assert.equal(leerNombre(nombreFoto('', 'otro', 5)).tipo, 'mal');   // cualquier otro tipo cuenta como mal
    assert.ok(nombreFoto('ñ'.repeat(200), 'bien').length < 255);   // hasta 70 letras: el nombre cabe en el almacenamiento
    assert.equal(leerNombre('min'), null);
    assert.equal(leerNombre('.emptyFolderPlaceholder'), null);
});

test('fotos: contar bien y mal', () => {
    assert.deepEqual(contar([{ tipo: 'bien' }, { tipo: 'mal' }, { tipo: 'mal' }]), { total: 3, bien: 1, mal: 2 });
    assert.deepEqual(contar(null), { total: 0, bien: 0, mal: 0 });
});

// Almacenamiento simulado con la misma forma que supabase.storage
function falso(archivos, error) {
    var subidos = [], borrados = [];
    return {
        subidos: subidos, borrados: borrados,
        storage: { from: function () { return {
            list: async function (c) { return error ? { error: { message: error } } : { data: archivos[c] || [] }; },
            createSignedUrls: async function (rutas) { return { data: rutas.map(function (r) { return { path: r, signedUrl: 'https://x/' + r }; }) }; },
            upload: async function (ruta) { subidos.push(ruta); return { data: {} }; },
            remove: async function (rutas) { borrados.push.apply(borrados, rutas); return { data: rutas.map(function (r) { return { name: r }; }) }; },
        }; } },
    };
}

test('fotos: listar deja fuera la carpeta min/ y lo que no es foto; subir y borrar van con su miniatura', async () => {
    var a = nombreFoto('bien hecho', 'bien', 10), b = nombreFoto('', 'mal', 20);
    var sb = falso({ 'items-ejecutado/plateo': [{ id: null, name: 'min' }, { id: '1', name: a }, { id: '2', name: b }, { id: '3', name: '.emptyFolderPlaceholder' }] });
    var api = crearFotosGuia(sb);
    var r = await api.listar(['items-ejecutado/plateo', 'items-ejecutado/bordeo']);
    assert.equal(r['items-ejecutado/plateo'].length, 2);
    assert.deepEqual(r['items-ejecutado/bordeo'], []);
    assert.equal(r['items-ejecutado/plateo'][0].min, 'items-ejecutado/plateo/min/' + a);
    var u = await api.urls([r['items-ejecutado/plateo'][0].ruta]);
    assert.equal(u['items-ejecutado/plateo/' + a], 'https://x/items-ejecutado/plateo/' + a);
    var f = await api.subir('items-operacion/epp', 'G', 'm', 'sin careta', 'mal');
    assert.equal(sb.subidos.length, 2);
    assert.equal(sb.subidos[1], 'items-operacion/epp/min/' + f.nombre);
    assert.equal(f.tipo, 'mal');
    await api.borrar(f);
    assert.deepEqual(sb.borrados, [f.ruta, f.min]);
});

test('fotos: sin la migración avisa que falta activar el almacenamiento', async () => {
    var api = crearFotosGuia(falso({}, 'Bucket not found'));
    await assert.rejects(api.listar(['a/b']), { message: SIN_ACTIVAR });
});
