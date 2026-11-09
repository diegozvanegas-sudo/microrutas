// PDF del «Requerimiento de interventoría» (formato GD-FR-016 v14): título y radicado, tabla de datos, 1. Descripción,
// 2. Evidencias (fotos con su pie), 3. Consideraciones (obligaciones del contrato y ANS citados), 4. Información solicitada
// (tabla), 5. Soportes y plazo, 6. Consideraciones sobre la respuesta, firmas y copias. Hoja carta.
// El membrete (logos de la institución) lo pone cada usuario desde su equipo: no está en el repositorio.
// Las firmas van en blanco (cada persona firma), salvo que quien firma haya puesto la imagen de su firma en su equipo.
// pdf-lib se carga solo al generar. Funciona igual en el navegador y en Node (pruebas).

var CARTA = [612, 792];
var TEAL = [0.06, 0.45, 0.47], GRIS = [0.55, 0.58, 0.6], TINTA = [0.08, 0.1, 0.12], FONDO = [0.96, 0.97, 0.97];
var NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince'];

// «5» → «Cinco (5)»
export function enLetras(n) {
    n = Number(n);
    var p = NUMEROS[n];
    return p ? p.charAt(0).toUpperCase() + p.slice(1) + ' (' + n + ')' : String(n);
}
// Caracteres que la letra estándar del PDF (WinAnsi) no tiene → equivalentes; los emojis se quitan
export function limpiar(s) {
    return String(s == null ? '' : s)
        .replace(/[\u27A2\u25BA\u25B8\u25AA\u25CF\u25E6]/g, '\u2022').replace(/[\u2010\u2011\u2012]/g, '-')
        .replace(/\u2264/g, '<=').replace(/\u2265/g, '>=')
        .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
        .replace(/[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF]/g, '').replace(/\uFE0F/g, '').replace(/\u200D/g, '').replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[^\n\x20-\x7E\u00A1-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '');
}
// Texto → renglones que caben en el ancho (corta palabras larguísimas). Respeta los saltos de línea
export function partir(texto, letra, tam, ancho) {
    var out = [];
    limpiar(texto).split('\n').forEach(function (parrafo) {
        var palabras = parrafo.split(/ +/).filter(function (p) { return p !== ''; }), linea = '';
        if (!palabras.length) { out.push(''); return; }
        palabras.forEach(function (p) {
            while (letra.widthOfTextAtSize(p, tam) > ancho) {   // palabra que no cabe sola (un enlace largo)
                var k = p.length;
                while (k > 1 && letra.widthOfTextAtSize(p.slice(0, k), tam) > ancho) k--;
                if (linea) { out.push(linea); linea = ''; }
                out.push(p.slice(0, k)); p = p.slice(k);
            }
            var prueba = linea ? linea + ' ' + p : p;
            if (letra.widthOfTextAtSize(prueba, tam) <= ancho) linea = prueba;
            else { if (linea) out.push(linea); linea = p; }
        });
        out.push(linea);
    });
    return out;
}

// req: { radicado, contratista, contrato, servicio, zonas: [], asunto, ruta, fechaEvento, fechaRequerimiento, descripcion,
//        evidencias: [{ bytes, tipo: 'jpg'|'png', pie }], evidenciasTexto: [], consideraciones, obligacionesIntro,
//        obligaciones: [{ ref, t }], ansIntro, ans: [{ clave, t }], solicitudes: [{ t, ej }], soportes, plazo,
//        consideracionesRespuesta, preventivo, firmas: [{ nombre, cargo }], copias: [], codigo, pie }
// opciones: { membrete: { bytes, tipo } }. Devuelve Uint8Array
export async function armarPdf(req, opciones) {
    opciones = opciones || {};
    var { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    var pdf = await PDFDocument.create();
    pdf.setTitle(limpiar('Requerimiento de interventoría ' + (req.radicado || '')));
    pdf.setAuthor(limpiar(req.pie || 'Interventoría'));
    var normal = await pdf.embedFont(StandardFonts.Helvetica), negrita = await pdf.embedFont(StandardFonts.HelveticaBold),
        cursiva = await pdf.embedFont(StandardFonts.HelveticaOblique);
    var col = function (c) { return rgb(c[0], c[1], c[2]); };
    var membrete = null;
    if (opciones.membrete && opciones.membrete.bytes) {
        try { membrete = opciones.membrete.tipo === 'png' ? await pdf.embedPng(opciones.membrete.bytes) : await pdf.embedJpg(opciones.membrete.bytes); } catch (e) { membrete = null; }
    }
    // Con membrete se deja libre la franja de los logos (arriba) y la del pie del membrete (abajo)
    var M = { izq: 62, der: 62, arriba: membrete ? 112 : 58, abajo: membrete ? 148 : 56 };
    var ANCHO = CARTA[0] - M.izq - M.der, paginas = [], pag = null, y = 0;

    function nueva() {
        pag = pdf.addPage(CARTA);
        if (membrete) pag.drawImage(membrete, { x: 0, y: 0, width: CARTA[0], height: CARTA[1] });
        paginas.push(pag);
        y = CARTA[1] - M.arriba;
    }
    function espacio(h) { if (y - h < M.abajo) nueva(); }
    function texto(t, x, yy, o) {
        o = o || {};
        pag.drawText(limpiar(t), { x: x, y: yy, size: o.tam || 10, font: o.letra || normal, color: col(o.color || TINTA) });
    }
    // Párrafo justificado (la última línea de cada párrafo a la izquierda)
    function parrafo(t, o) {
        o = o || {};
        var tam = o.tam || 10, letra = o.letra || normal, x0 = M.izq + (o.sangria || 0), ancho = ANCHO - (o.sangria || 0), alto = tam * 1.38;
        var parrafos = limpiar(t).split(/\n/);
        parrafos.forEach(function (p, ip) {
            var lin = partir(p, letra, tam, ancho);
            lin.forEach(function (l, i) {
                espacio(alto);
                var ultima = i === lin.length - 1, palabras = l.split(' ');
                if (o.justificar !== false && !ultima && palabras.length > 1) {
                    var libre = ancho - palabras.reduce(function (s, w) { return s + letra.widthOfTextAtSize(w, tam); }, 0), hueco = libre / (palabras.length - 1), x = x0;
                    palabras.forEach(function (w) { texto(w, x, y - tam, { tam: tam, letra: letra, color: o.color }); x += letra.widthOfTextAtSize(w, tam) + hueco; });
                } else texto(l, x0, y - tam, { tam: tam, letra: letra, color: o.color });
                y -= alto;
            });
            if (ip < parrafos.length - 1 && p.trim() === '') y -= 0;
        });
        y -= o.despues != null ? o.despues : 6;
    }
    function titulo(t) { espacio(34); y -= 8; texto(t, M.izq, y - 11, { tam: 11, letra: negrita }); y -= 22; }
    function subtitulo(t) { espacio(26); texto(t, M.izq, y - 10, { tam: 10, letra: negrita }); y -= 18; }

    // Tabla de dos columnas (etiqueta | valor) con bordes
    function tablaDatos(filas) {
        var c1 = 150, c2 = ANCHO - c1, tam = 10, alto = tam * 1.35, pad = 7;
        filas.forEach(function (f) {
            var lv = [].concat(f[1]).reduce(function (a, v) { return a.concat(partir(v || ' ', normal, tam, c2 - pad * 2)); }, []), le = partir(f[0], normal, tam, c1 - pad * 2);
            var h = Math.max(lv.length, le.length) * alto + pad * 2;
            espacio(h);
            [[M.izq, c1], [M.izq + c1, c2]].forEach(function (c) {
                pag.drawRectangle({ x: c[0], y: y - h, width: c[1], height: h, borderColor: col([0.82, 0.84, 0.85]), borderWidth: 0.7 });
            });
            le.forEach(function (l, i) { texto(l, M.izq + pad, y - pad - tam - i * alto, { tam: tam }); });
            lv.forEach(function (l, i) { texto(l, M.izq + c1 + pad, y - pad - tam - i * alto, { tam: tam }); });
            y -= h;
        });
        y -= 12;
    }
    // Tabla con encabezado de color: columnas [{ titulo, ancho, campo }]
    function tablaColor(columnas, filas) {
        var tam = 9.5, alto = tam * 1.35, pad = 6;
        function fila(valores, cab) {
            var lineas = columnas.map(function (c, i) { return partir(valores[i], cab ? negrita : normal, tam, c.ancho - pad * 2); });
            var h = Math.max.apply(null, lineas.map(function (l) { return l.length; })) * alto + pad * 2, x = M.izq;
            espacio(h);
            columnas.forEach(function (c, i) {
                pag.drawRectangle({ x: x, y: y - h, width: c.ancho, height: h, color: cab ? col(TEAL) : undefined, borderColor: col([0.78, 0.82, 0.83]), borderWidth: 0.7 });
                lineas[i].forEach(function (l, k) {
                    var w = (cab ? negrita : normal).widthOfTextAtSize(limpiar(l), tam), xx = c.centrar ? x + (c.ancho - w) / 2 : x + pad;
                    texto(l, xx, y - pad - tam - k * alto, { tam: tam, letra: cab ? negrita : normal, color: cab ? [1, 1, 1] : TINTA });
                });
                x += c.ancho;
            });
            y -= h;
        }
        fila(columnas.map(function (c) { return c.titulo; }), true);
        filas.forEach(function (f) { fila(f, false); });
        y -= 12;
    }

    nueva();
    // Título y radicado
    var tt = 'REQUERIMIENTO DE INTERVENTORÍA', wt = negrita.widthOfTextAtSize(limpiar(tt), 15);
    texto(tt, (CARTA[0] - wt) / 2, y - 15, { tam: 15, letra: negrita });
    y -= 24;
    var rad = req.radicado || 'EVM-____', wr = negrita.widthOfTextAtSize(limpiar(rad), 11);
    texto(rad, (CARTA[0] - wr) / 2, y - 11, { tam: 11, letra: negrita, color: TEAL });
    y -= 26;

    tablaDatos([
        ['Contratista', req.contratista], ['Contrato', req.contrato], ['Servicio', req.servicio],
        ['Zona', (req.zonas && req.zonas.length ? req.zonas : ['NA'])], ['Asunto', req.asunto], ['Ruta', req.ruta || 'NA'],
        ['Fecha del evento', req.fechaEvento || ''], ['Fecha del requerimiento', req.fechaRequerimiento || '']
    ]);

    titulo('1.   DESCRIPCIÓN:');
    parrafo(req.descripcion || '');

    titulo('2.   EVIDENCIAS DEL SEGUIMIENTO');
    (req.evidenciasTexto || []).filter(Boolean).forEach(function (t, i) { parrafo('Evidencia ' + (i + 1) + '. ' + t, { despues: 2, justificar: false }); });
    var fotos = req.evidencias || [];
    if (fotos.length) {
        // Dos fotos por fila con su pie debajo
        var gap = 14, wf = (ANCHO - gap) / 2, hf = wf * 0.75;
        for (var i = 0; i < fotos.length; i += 2) {
            var par = fotos.slice(i, i + 2), imgs = [];
            for (var k = 0; k < par.length; k++) {
                try { imgs.push(par[k].tipo === 'png' ? await pdf.embedPng(par[k].bytes) : await pdf.embedJpg(par[k].bytes)); } catch (e) { imgs.push(null); }
            }
            var pies = par.map(function (f, k) { return partir('Foto ' + (i + k + 1) + (f.pie ? '. ' + f.pie : ''), cursiva, 8.5, wf); });
            var hp = Math.max.apply(null, pies.map(function (p) { return p.length; })) * 11;
            espacio(hf + hp + 14);
            par.forEach(function (f, k) {
                var x = M.izq + k * (wf + gap), img = imgs[k];
                pag.drawRectangle({ x: x, y: y - hf, width: wf, height: hf, color: col(FONDO) });
                if (img) {
                    var e = Math.min(wf / img.width, hf / img.height), w = img.width * e, h = img.height * e;
                    pag.drawImage(img, { x: x + (wf - w) / 2, y: y - hf + (hf - h) / 2, width: w, height: h });
                }
                pies[k].forEach(function (l, n) { texto(l, x, y - hf - 11 - n * 11, { tam: 8.5, letra: cursiva, color: [0.3, 0.33, 0.36] }); });
            });
            y -= hf + hp + 14;
        }
    }
    if (!fotos.length && !(req.evidenciasTexto || []).filter(Boolean).length) parrafo('Sin evidencias adjuntas.', { letra: cursiva, color: GRIS });

    titulo('3.   CONSIDERACIONES');
    if (req.consideraciones) parrafo(req.consideraciones);
    if ((req.obligaciones || []).length) {
        subtitulo('1. Obligaciones establecidas en el contrato.');
        var numerales = req.obligaciones.map(function (o) { return (o.ref || '').split(/\s+/)[0].replace(/\.$/, ''); }).filter(Boolean)
            .filter(function (n, i, a) { return a.indexOf(n) === i; });
        var intro = (req.obligacionesIntro || 'Se le recuerda al contratista el cumplimiento de lo estipulado en los numerales {numerales} del contrato:')
            .replace('{numerales}', numerales.length > 1 ? numerales.slice(0, -1).join(', ') + ' y ' + numerales[numerales.length - 1] : numerales[0] || '');
        parrafo(intro);
        req.obligaciones.forEach(function (o) {
            parrafo('Lo dispuesto en el numeral ' + (o.ref || '') + '.', { letra: negrita, despues: 2, justificar: false });
            parrafo('“' + o.t + '”', { sangria: 14, letra: cursiva, tam: 9.5 });
        });
    }
    if ((req.ans || []).length) {
        subtitulo('2. Acuerdos de Nivel de Servicio - ANS.');
        parrafo(req.ansIntro || 'Las Especificaciones Técnicas establecen, entre otros, los siguientes ANS:');
        req.ans.forEach(function (a) {
            parrafo(a.clave + '.', { letra: negrita, despues: 2, justificar: false });
            parrafo('“' + a.t + '”', { sangria: 14, letra: cursiva, tam: 9.5 });
        });
    }

    titulo('4.   INFORMACIÓN SOLICITADA');
    parrafo('Para el esclarecimiento de la novedad, se solicita remitir la siguiente información y/o soportes:');
    var sol = (req.solicitudes || []).filter(function (s) { return s.t; });
    tablaColor([{ titulo: 'N°', ancho: 36, centrar: true }, { titulo: 'Información solicitada', ancho: ANCHO - 36 - 160 }, { titulo: 'Soporte sugerido', ancho: 160 }],
        sol.length ? sol.map(function (s, i) { return [String(i + 1), s.t, s.ej || '']; }) : [['1', 'Dar respuesta a lo descrito en el presente requerimiento.', '']]);

    titulo('5.   SOPORTES OPERATIVOS');
    if (req.soportes) parrafo(req.soportes);
    // Recuadro del plazo
    var plazoTxt = enLetras(req.plazo || 5) + ' días hábiles contados a partir de la recepción del presente requerimiento.';
    var lp = partir(plazoTxt, normal, 10, ANCHO - 190 - 20), hb = Math.max(lp.length * 13.5 + 16, 34);
    espacio(hb + 10);
    pag.drawRectangle({ x: M.izq, y: y - hb, width: ANCHO, height: hb, color: col(FONDO), borderColor: col(TEAL), borderWidth: 1 });
    texto('PLAZO PARA RESPONDER', M.izq + 12, y - hb / 2 - 4, { tam: 10.5, letra: negrita });
    lp.forEach(function (l, i) { texto(l, M.izq + 190, y - 8 - 10 - i * 13.5, { tam: 10 }); });
    y -= hb + 14;

    titulo('6.   CONSIDERACIONES SOBRE LA RESPUESTA');
    if (req.consideracionesRespuesta) parrafo(req.consideracionesRespuesta);
    if (req.preventivo) parrafo(req.preventivo);

    // Firmas en dos columnas, con espacio para firmar
    var firmas = (req.firmas || []).filter(function (f) { return f.nombre; });
    espacio(40); y -= 8; texto('Cordialmente,', M.izq, y - 10); y -= 22;
    var wcol = ANCHO / 2, imagenesFirma = [];
    for (var q = 0; q < firmas.length; q++) {
        var im = null, f0 = firmas[q].imagen;
        if (f0 && f0.bytes) { try { im = f0.tipo === 'png' ? await pdf.embedPng(f0.bytes) : await pdf.embedJpg(f0.bytes); } catch (e) { im = null; } }
        imagenesFirma.push(im);
    }
    for (var j = 0; j < firmas.length; j += 2) {
        var par2 = firmas.slice(j, j + 2), filasN = par2.map(function (f) { return partir(f.nombre, negrita, 10, wcol - 20).concat(partir(f.cargo || '', normal, 9.5, wcol - 20)); });
        var hfirma = 44 + Math.max.apply(null, filasN.map(function (l) { return l.length; })) * 12.5;
        espacio(hfirma);
        par2.forEach(function (f, k) {
            var cx = M.izq + k * wcol + wcol / 2, yy = y - 40, imf = imagenesFirma[j + k];
            if (imf) {
                var ef = Math.min(150 / imf.width, 36 / imf.height), wfi = imf.width * ef, hfi = imf.height * ef;
                pag.drawImage(imf, { x: cx - wfi / 2, y: yy + 1, width: wfi, height: hfi });
            }
            pag.drawLine({ start: { x: cx - 85, y: yy }, end: { x: cx + 85, y: yy }, thickness: 0.6, color: col(GRIS) });
            filasN[k].forEach(function (l, n) {
                var le = n < partir(f.nombre, negrita, 10, wcol - 20).length ? negrita : normal, tam = le === negrita ? 10 : 9.5;
                var w = le.widthOfTextAtSize(limpiar(l), tam);
                texto(l, cx - w / 2, yy - 13 - n * 12.5, { tam: tam, letra: le });
            });
        });
        y -= hfirma + 6;
    }
    var copias = (req.copias || []).filter(Boolean);
    if (copias.length) {
        espacio(20 + copias.length * 11); y -= 6;
        var wc = negrita.widthOfTextAtSize('Con copia a:', 8);
        texto('Con copia a:', M.izq + ANCHO - wc, y - 8, { tam: 8, letra: negrita }); y -= 13;
        copias.forEach(function (c) {
            partir(c, normal, 7.5, ANCHO).forEach(function (l) { var w = normal.widthOfTextAtSize(limpiar(l), 7.5); texto(l, M.izq + ANCHO - w, y - 8, { tam: 7.5 }); y -= 10.5; });
        });
    }

    // Pie de cada página: dependencia · código · página N de M
    paginas.forEach(function (p, i) {
        var yy = M.abajo - 24, total = paginas.length;   // con membrete queda por encima del escudo y la dirección del pie
        p.drawLine({ start: { x: M.izq, y: yy + 12 }, end: { x: M.izq + ANCHO, y: yy + 12 }, thickness: 0.5, color: col([0.8, 0.82, 0.83]) });
        p.drawText(limpiar(req.pie || 'Interventoría del Servicio de Aseo'), { x: M.izq, y: yy, size: 8, font: normal, color: col(GRIS) });
        var cod = limpiar(req.codigo || ''), wc2 = normal.widthOfTextAtSize(cod, 8);
        if (cod) p.drawText(cod, { x: M.izq + (ANCHO - wc2) / 2, y: yy, size: 8, font: normal, color: col(GRIS) });
        var pg = 'Página ' + (i + 1) + ' de ' + total, wp = normal.widthOfTextAtSize(pg, 8);
        p.drawText(pg, { x: M.izq + ANCHO - wp, y: yy, size: 8, font: normal, color: col(GRIS) });
    });
    return pdf.save();
}
