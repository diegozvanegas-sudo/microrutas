// Pruebas de 🧾 Instrumento plan de choque: enlace prellenado y datos traídos de una revisión. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMULARIO, vacio, enlace, faltantes, textoOperarios, desdeRevision, comunaDe } from '../src/instrumento/comun.js';

const listo = () => Object.assign(vacio('2026-11-22', {}), { inspector: 'Ana Pérez', zona: 'Zona 5', comuna: 'COMUNA 14 POBLADO', aliado: 'FUNTRAEV',
    evento: '4 sur - aguacatala', bolsas: '37', operarios: '3', fotos: 'https://drive.google.com/file/d/x/view' });

test('enlace: como el del script del PC, con tildes y espacios codificados', () => {
    const u = enlace(listo());
    assert.ok(u.startsWith(FORMULARIO + '?usp=pp_url&entry.366340186=Ana%20P%C3%A9rez&entry.519235454=2026-11-22&entry.328781857=Zona%205'));
    assert.ok(u.includes('&entry.178678118=S%C3%AD&entry.1341285358=S%C3%AD&entry.165230961=S%C3%AD&entry.1874071219=EVENTOS%20PLAN%20CHOQUE'));
    assert.ok(u.includes('&entry.2051657917=4%20sur%20-%20aguacatala&entry.935404353=1&entry.1865590264=37&entry.1122998110=3'));
    assert.ok(u.endsWith('&entry.1405074621=' + encodeURIComponent('https://drive.google.com/file/d/x/view')));
    assert.ok(!u.includes('entry.23146003') && !u.includes('entry.1024721267'), 'lo vacío no va');
});
test('enlace: cada novedad marcada va aparte; volquetas no lleva la página 2', () => {
    const u = enlace(Object.assign(listo(), { novedades: ['Salen antes', 'Bajo rendimiento'] }));
    assert.ok(u.includes('entry.23146003=Salen%20antes&entry.23146003=Bajo%20rendimiento'));
    const v = enlace(Object.assign(listo(), { tipo: 'VOLQUETAS Y MOTOCARROS' }));
    assert.ok(v.includes('entry.1874071219=VOLQUETAS%20Y%20MOTOCARROS') && !v.includes('entry.2051657917') && !v.includes('entry.1865590264'));
});
test('faltantes: lo que el formulario exige', () => {
    assert.deepEqual(faltantes(listo()), []);
    assert.deepEqual(faltantes(vacio('2026-11-22', {})), ['el inspector', 'la zona', 'la comuna', 'el aliado', 'el nombre del evento', 'las bolsas', 'la cantidad de operarios']);
    assert.deepEqual(faltantes(Object.assign(listo(), { fotos: 'drive' })), ['un enlace de fotos válido (https://…)']);
    assert.deepEqual(faltantes(Object.assign(listo(), { tipo: 'VOLQUETAS Y MOTOCARROS', evento: '', bolsas: '' })), []);
});
test('zona: sugiere la comuna, y la guardada gana', () => {
    assert.equal(comunaDe('Zona 7', {}), 'COMUNA 10 LA CANDELARIA');
    assert.equal(comunaDe('Zona 7', { comunas: { 'Zona 7': 'COMUNA 11 LAURELES' } }), 'COMUNA 11 LAURELES');
    assert.equal(vacio('2026-11-22', { zona: 'Zona 5', inspector: 'Ana', aliados: { 'Zona 5': 'FUNTRAEV' } }).aliado, 'FUNTRAEV');
});
test('operarios: 10 y 12 se escriben con punto, como en el formulario', () => {
    assert.deepEqual([0, 3, 10, 11, 12, 15].map(textoOperarios), ['', '3', '10.', '11', '12.', '12.']);
});
test('desde una revisión de plan de choque', () => {
    const r = { fecha: '2026-11-22', zona: '5', ruta: '4 sur - Aguacatala', novedad: 'Se retiró un operario', items: { r_personal: 'no', r_avance: 'si' },
        operarios: [{ nombre: 'A', items: { epp_botas: 'si', h_escoba: 'si' } }, { nombre: 'B', items: { epp_guantes: 'no' } }, { nombre: '', items: {} }] };
    assert.deepEqual(desdeRevision(r), { fecha: '2026-11-22', zona: 'Zona 5', evento: '4 sur - Aguacatala', operarios: '2', herramientas: 'Sí',
        portaEpp: 'No', usaEpp: 'No', novedades: ['Personal incompleto'], otra: 'Se retiró un operario' });
});

// ---------- 📅 2026 Instrumento Domingos ----------
import { DOMINGOS, vacioDom, enlaceDom, faltantesDom, zonaDom, desdeRevisionDom, conCuenta, contratistaDe } from '../src/instrumento/comun.js';
const dom = () => Object.assign(vacioDom('2026-11-22', {}), { inspector: 'Ana Pérez', contratista: 'FUNTRAEV', zona: 'Zona 5', ruta: 'Z5R14DOM', fotos: 'https://drive.google.com/x' });
test('domingos: enlace con todas las preguntas, Si sin tilde', () => {
    const u = enlaceDom(dom());
    assert.ok(u.startsWith(DOMINGOS + '?usp=pp_url&entry.250822297=Ana%20P%C3%A9rez&entry.2054609230=FUNTRAEV&entry.1204252918=Limpieza%20vial&entry.492247973=Zona%205&entry.380610594=2026-11-22&entry.1527971=Z5R14DOM&entry.1551873407=Operacion'));
    for (const e of ['859948771', '48740217', '275838990', '1195679026', '1474379978', '694383648', '2003586958', '301097107']) assert.ok(u.includes('entry.' + e + '=Si&') || u.includes('entry.' + e + '=Si'), e);
    assert.ok(u.endsWith('&entry.1418248002=' + encodeURIComponent('https://drive.google.com/x')));
});
test('domingos: todo es obligatorio', () => {
    assert.deepEqual(faltantesDom(dom()), []);
    assert.deepEqual(faltantesDom(vacioDom('2026-11-22', {})), ['el inspector', 'el contratista', 'la zona', 'el código de ruta', 'el enlace del registro fotográfico']);
});
test('domingos: la zona 7 va por jornada', () => {
    assert.deepEqual([['5', 'Mañana'], ['7', 'Mañana'], ['7', 'Diurno'], ['7', 'Tarde'], ['7', 'Intermedio'], ['7', 'Noche'], ['', 'Noche']].map((x) => zonaDom(x[0], x[1])),
        ['Zona 5', 'Zona 7 AM', 'Zona 7 AM', 'Zona 7 PM', 'Zona 7 PM', 'Zona 7 Noche', '']);
    assert.equal(contratistaDe('Zona 5', { contratistasDom: { 'Zona 5': 'FUNTRAEV' } }), 'FUNTRAEV');
});
test('domingos: desde una revisión de LV con novedades', () => {
    const r = { tipo: 'lv', fecha: '2026-11-22', turno: 'Mañana', zona: '1', ruta: 'Z1R22DOM', enlace: '', items: { r_ruta: 'si', r_papeleo: 'no' },
        operarios: [{ items: { epp_botas: 'no', epp_uniforme: 'si', h_rastrillo: 'si' }, enlace: 'https://x.co/f' }] };
    assert.deepEqual(desdeRevisionDom(r), { fecha: '2026-11-22', ruta: 'Z1R22DOM', zona: 'Zona 1', instrumento: 'Limpieza vial', verificacion: 'Operacion',
        lugar: 'Si', uniforme: 'Si', herramientas: 'Si', eppEstado: 'No', eppUso: 'No', frecuencia: 'Si', recorrido: 'Si', calidad: 'No', fotos: 'https://x.co/f' });
    const ryt = desdeRevisionDom({ tipo: 'ryt', zona: '7', turno: 'Noche', ruta: '0718620', items: { en_despacho: 'si' }, operarios: [] });
    assert.equal(ryt.instrumento, 'Recolección y Transporte'); assert.equal(ryt.verificacion, 'Despacho'); assert.equal(ryt.zona, 'Zona 7 Noche');
});
test('cuenta de Google: /u/N/ solo con un número', () => {
    assert.equal(conCuenta(DOMINGOS + '?a=1', '1'), DOMINGOS.replace('/forms/d/', '/forms/u/1/d/') + '?a=1');
    assert.equal(conCuenta(DOMINGOS, ''), DOMINGOS);
    assert.equal(conCuenta(DOMINGOS, 'x'), DOMINGOS);
});
test('sección: Instrumentos está en el menú General', async () => {
    const { SECCIONES } = await import('../src/secciones.js');
    const s = SECCIONES.find((x) => x.clave === 'instrumento');
    assert.equal(s.grupo, 'General');
    assert.equal(s.pagina, 'instrumento.html');
});
