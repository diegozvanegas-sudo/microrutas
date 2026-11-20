// Ficha del lote en el mapa rápido (mapa_rapido.html): lo que las demás secciones saben de un lote, junto y en pocas
// líneas. Solo lógica y HTML (sin pedir nada): los datos los junta src/mapa/main.js de la copia de cada sección en el
// equipo y, con sesión, de la base.
//
// fuentes: {
//   visitas: registros de Subsanaciones (copia «subsanaciones_cache»), items, itemsOp: ítems de cada tipo de visita
//   reportes: [{ fecha, cuad, items: [{ mr, lote }] }]           (📊 Cruce: reportes de WhatsApp de las cuadrillas)
//   descuentos: [{ id, tipo, fecha, estado, filas: [{ mr, lote, areaBase, areaDescontar }] }]   (💸 Descuentos)
//   auditorias: [{ quincena, microrruta, lote, novedad, ac, decision, novedad_final, actualizado }]  (🔍 Auditar ZIP)
//   requerimientos: [{ radicado, fecha, estado, asunto, novedades: [{ micro, lote, fecha, tipos }] }]  (📨 Requerimientos)
//   pqrs: [{ radicado, fecha_pqr, estado, queja, direccion, respuesta, visita }]                     (📝 PQR)
//   propuesta: { mes, lotes: { 'MR|lote': [{ q, fecha, n, total, km, vecinos: [] }] } }   (🛣️ Programación por cercanía)
// }
import { fijarItems, itemsEnNo, plazoVisita, plazoNovedad, esOp } from '../subsanaciones/estado.js';
import { frase } from '../subsanaciones/util.js';

export var TIPOS_DESCUENTO = { cerramiento: 'Cerramiento', predio_privado: 'Predio privado', obra: 'Construcción u obra', zona_dura: 'Zona dura', inaccesible: 'Inaccesible o riesgo' };

function texto(s) { return String(s == null ? '' : s).trim(); }
function mrDe(s) { var m = texto(s).toUpperCase().match(/Z\s*(\d+)\s*CC\s*(\d+)/); return m ? 'Z' + Number(m[1]) + 'CC' + ('000' + Number(m[2])).slice(-4) : ''; }
function sinLote(l) { return !texto(l) || /^N\/?A$/i.test(texto(l)); }
// ¿El dato (mr, lote) es de este lote? Con número de lote manda el número; sin él, la microrruta
function esDe(lote, mr, l) {
    mr = mrDe(mr);
    if (!sinLote(lote.lote) && !sinLote(l)) return String(Number(l) || l) === String(Number(lote.lote) || lote.lote) && (!mr || !lote.mr || mr === lote.mr);
    return !!mr && mr === lote.mr;
}
// dd/mm/aaaa o aaaa-mm-dd → aaaa-mm-dd
export function iso(f) {
    var s = texto(f), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function diasEntre(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
export function corto(f) { f = iso(f); return f ? f.slice(8, 10) + '/' + f.slice(5, 7) : ''; }

// lote: { mr, lote } · hoy: aaaa-mm-dd → todo lo que se sabe del lote
export function infoLote(lote, fuentes, hoy) {
    fuentes = fuentes || {};
    lote = { mr: mrDe(lote.mr), lote: sinLote(lote.lote) ? '' : texto(lote.lote) };
    if (fuentes.items) fijarItems(fuentes.items, fuentes.itemsOp || []);
    // Visitas al lote (las de operación también: pueden quedar pendientes)
    var visitas = (fuentes.visitas || []).filter(function (r) { return esDe(lote, r.MICRORRUTA, r.LOTE); })
        .map(function (r) { return { r: r, f: iso(r['FECHA DE LA VISITA']) }; }).filter(function (x) { return x.f; })
        .sort(function (a, b) { return b.f.localeCompare(a.f); });
    var pendientes = visitas.filter(function (x) { return x.r.ESTADO === 'PENDIENTE'; }).map(function (x) {
        var op = esOp(x.r), items = itemsEnNo(x.r).map(function (i) { return { t: frase(i).replace(/\.$/, ''), plazo: plazoNovedad(i, op) }; });
        var obs = texto(x.r['OBSERVACIONES NOVEDADES']);
        if (obs && !/^SIN NOVEDAD$/i.test(obs)) items.push({ t: frase(obs).replace(/\.$/, ''), plazo: plazoNovedad(obs, op) });
        return { id: x.r.ID, fecha: x.f, op: op, items: items, plazo: plazoVisita(x.r) };
    });
    var ultimas = visitas.slice(0, 4).map(function (x) { return { id: x.r.ID, fecha: x.f, estado: x.r.ESTADO || '', op: esOp(x.r), nNo: itemsEnNo(x.r).length }; });
    // Último reporte de ejecución de las cuadrillas que trae el lote
    var reporte = null;
    (fuentes.reportes || []).forEach(function (r) {
        var f = iso(r.fecha);
        if (!f || !(r.items || []).some(function (it) { return esDe(lote, it.mr, it.lote); })) return;
        if (!reporte || f > reporte.fecha) reporte = { fecha: f, cuad: texto(r.cuad || r.cuadrilla), dias: hoy ? diasEntre(f, hoy) : null };
    });
    // Descuentos de área
    var desc = [];
    (fuentes.descuentos || []).forEach(function (d) {
        (d.filas || []).filter(function (f) { return esDe(lote, f.mr, f.lote); }).forEach(function (f) {
            desc.push({ id: d.id, tipo: TIPOS_DESCUENTO[d.tipo] || d.tipo || 'Descuento', fecha: iso(d.fecha), estado: d.estado || 'borrador', area: Math.round(Number(f.areaDescontar) || 0), base: Number(f.areaBase) || 0 });
        });
    });
    desc.sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
    // Auditoría del ZIP: la más reciente del lote
    var auditoria = null;
    (fuentes.auditorias || []).filter(function (a) { return esDe(lote, a.microrruta, a.lote); }).forEach(function (a) {
        if (!auditoria || texto(a.actualizado) > texto(auditoria.actualizado)) auditoria = a;
    });
    if (auditoria) {
        var nov = auditoria.decision === 'CORREGIDA' ? auditoria.novedad_final : auditoria.decision === 'DESCARTADA' ? 'SN' : auditoria.novedad;
        auditoria = { quincena: texto(auditoria.quincena), novedades: texto(nov).split(';').map(texto).filter(function (t) { return t && !/^SN$/i.test(t); }),
            ac: texto(auditoria.ac), decision: auditoria.decision || '', actualizado: texto(auditoria.actualizado) };
    }
    // Requerimientos que nombran el lote
    var reqs = (fuentes.requerimientos || []).filter(function (q) { return (q.novedades || []).some(function (n) { return esDe(lote, n.micro, n.lote); }); })
        .map(function (q) { return { radicado: texto(q.radicado), fecha: iso(q.fecha), estado: texto(q.estado) || 'Borrador', asunto: texto(q.asunto) }; })
        .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
    // PQR: no guardan el lote; se buscan la microrruta o «lote N» en lo escrito
    var re = lote.lote ? new RegExp('\\blote\\s*(n[°ºo.]*\\s*)?0*' + lote.lote + '\\b', 'i') : null;
    var pqrs = (fuentes.pqrs || []).filter(function (p) {
        var t = [p.queja, p.direccion, p.respuesta, p.visita && p.visita.observacion].map(texto).join(' ');
        return (lote.mr && mrDe(t) && t.toUpperCase().replace(/Z\s*(\d+)\s*CC\s*0*(\d+)/g, function (m, z, n) { return 'Z' + Number(z) + 'CC' + ('000' + Number(n)).slice(-4); }).indexOf(lote.mr) !== -1) || (re && re.test(t));
    }).map(function (p) { return { radicado: texto(p.radicado), fecha: iso(p.fecha_pqr || p.creado), estado: texto(p.estado) || 'abierto' }; })
        .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });
    // Día propuesto por cercanía
    var prop = fuentes.propuesta && fuentes.propuesta.lotes ? (fuentes.propuesta.lotes[lote.mr + '|' + (lote.lote || 'NA')] || fuentes.propuesta.lotes[lote.mr + '|' + lote.lote] || []) : [];
    // areaBase: la del lote completo en el descuento (el polígono tocado en el mapa puede ser solo una parte del lote)
    return { lote: lote, pendientes: pendientes, visitas: ultimas, reporte: reporte, descuentos: desc, areaDescontada: desc.reduce(function (s, x) { return s + x.area; }, 0),
        areaBase: desc.reduce(function (m, x) { return Math.max(m, x.base || 0); }, 0),
        auditoria: auditoria, requerimientos: reqs, pqrs: pqrs, propuesta: prop, mesPropuesta: fuentes.propuesta ? fuentes.propuesta.mes : '' };
}

// ---------- HTML de cada bloque ----------
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function chip(clase, t, titulo) { return '<span class="ruta-estado ' + clase + '"' + (titulo ? ' title="' + esc(titulo) + '"' : '') + '>' + t + '</span>'; }
function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

// Reporte de WhatsApp: va en el renglón «Contratista», junto a la programación
export function chipReporte(info) {
    var r = info.reporte;
    if (!r) return chip('prog-no', '💬 Sin reporte de ejecución', 'Ningún «REPORTE MICRORRUTAS EJECUTADAS» cargado en 📊 Cruce trae este lote');
    return chip('aldia', '💬 Reportado ' + esc(corto(r.fecha)) + (r.cuad ? ' · C' + esc(r.cuad) : '') + (r.dias != null && r.dias > 0 ? ' · hace ' + plural(r.dias, 'día', 'días') : r.dias === 0 ? ' · hoy' : ''),
        'Último reporte de ejecución de las cuadrillas (📊 Cruce) que trae este lote');
}
// Avisos: lo que hay que atender (pendientes con su plazo, descuentos, requerimientos y PQR)
export function htmlAvisos(info) {
    var b = [];
    info.pendientes.forEach(function (p) {
        var pl = p.plazo, cl = pl && pl.descuento ? 'mal' : pl && pl.resta === 0 ? 'ojo' : 'bien';
        var estado = !pl ? '' : pl.descuento ? (pl.motivo === 'No subsanable' ? 'No subsanable → descuento' : pl.motivo + ' → descuento') : pl.resta === 0 ? 'Vence hoy' : 'Quedan ' + plural(pl.resta, 'día', 'días');
        b.push('<div class="aviso-f ' + cl + '"><div class="aviso-cab"><b>⚠ Pendiente' + (p.op ? ' (en operación)' : '') + ' · visita ' + esc(corto(p.fecha)) + '</b>' + (estado ? '<span class="plazo-f">' + esc(estado) + '</span>' : '') + '</div>' +
            '<ul>' + p.items.map(function (i) { return '<li>' + esc(i.t) + (i.plazo ? ' <span class="sub-f">(' + esc(i.plazo.replace(/^Plazo: /, '')) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
            (p.id ? '<a class="ver-visita" data-visita="' + esc(p.id) + '" href="subsanaciones.html?ver=' + encodeURIComponent(p.id) + '">📄 Ver la visita ›</a>' : '') + '</div>');
    });
    if (info.descuentos.length) {
        b.push('<div class="aviso-f info"><div class="aviso-cab"><b>💸 Área descontada: ' + esc(info.areaDescontada.toLocaleString('es-CO')) + ' m²</b></div><ul>' +
            info.descuentos.map(function (d) { return '<li>' + esc(d.tipo) + ' · ' + esc(d.area.toLocaleString('es-CO')) + ' m² · ' + esc(corto(d.fecha)) + ' <span class="sub-f">(' + (d.estado === 'emitido' ? 'emitido' : 'borrador') + ')</span></li>'; }).join('') +
            '</ul><a class="ver-visita" href="descuentos.html">Ver en Descuentos ›</a></div>');
    }
    if (info.requerimientos.length) {
        b.push('<div class="aviso-f info"><div class="aviso-cab"><b>📨 ' + plural(info.requerimientos.length, 'requerimiento', 'requerimientos') + '</b></div><ul>' +
            info.requerimientos.slice(0, 3).map(function (q) { return '<li>' + esc(q.radicado || 'Sin radicado') + ' · ' + esc(corto(q.fecha)) + ' <span class="sub-f">(' + esc(q.estado.toLowerCase()) + ')</span>' + (q.asunto ? ' · ' + esc(q.asunto) : '') + '</li>'; }).join('') + '</ul></div>');
    }
    var abiertas = info.pqrs.filter(function (p) { return p.estado !== 'respondido'; });
    if (info.pqrs.length) {
        b.push('<div class="aviso-f ' + (abiertas.length ? 'ojo' : 'info') + '"><div class="aviso-cab"><b>📝 ' + plural(info.pqrs.length, 'PQR', 'PQR') + ' que nombran el lote' + (abiertas.length ? ' · ' + abiertas.length + ' abierta' + (abiertas.length === 1 ? '' : 's') : '') + '</b></div><ul>' +
            info.pqrs.slice(0, 3).map(function (p) { return '<li>ID ' + esc(p.radicado || '—') + ' · ' + esc(corto(p.fecha)) + ' <span class="sub-f">(' + esc(p.estado) + ')</span></li>'; }).join('') + '</ul><a class="ver-visita" href="pqr.html">Ver en PQR ›</a></div>');
    }
    return b.length ? '<div class="avisos-f">' + b.join('') + '</div>' : '';
}
// Más información (plegada): últimas visitas, lo que vio la auditoría del ZIP y el día propuesto por cercanía
export function htmlMas(info) {
    var b = [];
    if (info.visitas.length) {
        b.push('<div class="mas-bloque"><span class="et">Últimas visitas</span><ul class="lista-f">' + info.visitas.map(function (v) {
            var cl = v.estado === 'PENDIENTE' ? 'mal' : v.estado === 'CERRADO' ? 'gris' : 'bien';
            return '<li><span class="punto-f ' + cl + '"></span>' + esc(corto(v.fecha)) + ' · ' + esc(v.estado ? v.estado.charAt(0) + v.estado.slice(1).toLowerCase() : '—') + (v.op ? ' · en operación' : '') +
                (v.nNo ? ' · ' + plural(v.nNo, 'ítem', 'ítems') + ' en NO' : '') + (v.id ? ' <a class="enlace-f" data-visita="' + esc(v.id) + '" href="subsanaciones.html?ver=' + encodeURIComponent(v.id) + '">ver</a>' : '') + '</li>';
        }).join('') + '</ul></div>');
    }
    var a = info.auditoria;
    if (a) {
        b.push('<div class="mas-bloque"><span class="et">Auditoría de fotos (ZIP)' + (a.quincena ? ' · ' + esc(a.quincena) : '') + '</span>' +
            (a.novedades.length ? '<ul class="lista-f">' + a.novedades.map(function (n) { return '<li><span class="punto-f mal"></span>' + esc(frase(n).replace(/\.$/, '')) + '</li>'; }).join('') + '</ul>'
                : '<div>✓ Sin novedad en las fotos</div>') +
            '<div class="sub-f">' + [a.ac ? 'AC: ' + esc(a.ac) : '', a.decision ? 'Revisor: ' + esc(a.decision.toLowerCase()) : 'Sin revisar'].filter(Boolean).join(' · ') + '</div></div>');
    }
    if (info.propuesta.length) {
        b.push('<div class="mas-bloque"><span class="et">Propuesta por cercanía' + (info.mesPropuesta ? ' · ' + esc(info.mesPropuesta) : '') + '</span><ul class="lista-f">' + info.propuesta.map(function (p) {
            return '<li><span class="punto-f prop"></span>Q' + p.q + ' · ' + esc(corto(p.fecha)) + (p.total > 1 ? ' · parada ' + p.n + ' de ' + p.total + (p.km != null ? ' · ' + String(Math.round(p.km * 10) / 10).replace('.', ',') + ' km el día' : '') : ' · único lote de ese día') +
                (p.vecinos && p.vecinos.length ? '<div class="sub-f">Con ' + esc(p.vecinos.slice(0, 6).join(', ')) + (p.vecinos.length > 6 ? '…' : '') + '</div>' : '') + '</li>';
        }).join('') + '</ul><a class="enlace-f" href="optimizar.html">Ver en Programación por cercanía ›</a></div>');
    }
    if (!b.length) return '';
    var resumen = [info.visitas.length ? plural(info.visitas.length, 'visita', 'visitas') : '', a ? 'auditoría ZIP' : '', info.propuesta.length ? 'propuesta' : ''].filter(Boolean).join(' · ');
    return '<details class="mas-f"><summary>📚 Historial y análisis <span class="sub-f">· ' + esc(resumen) + '</span></summary>' + b.join('') + '</details>';
}
