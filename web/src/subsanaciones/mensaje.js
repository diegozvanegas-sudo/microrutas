// Lee los mensajes de WhatsApp de las cuadrillas para armar la pre-ruta.
// "Lotes ejecutados el 14-10-2026 por la cuadrilla #2 \n 532 \n 371" -> fecha, cuadrilla y lotes
// "Buenos días Cuadrilla #4 inicia labores Lote de inicio Z2cc0339" -> tipo 'curso': la cuadrilla está trabajando ahí ahora
// "Terminó el lote 532, pasamos al 371": lo de antes de "pasamos" ya se ejecutó, lo de después está en ejecución
// "Z1cc0074 (80) sin fotos por orden público": el lote va en sinFotos con el motivo (no se le pueden tomar fotos)

var RE_HECHO = /ejecutad|terminad|terminamos|termin[oó]|finaliz|culmin|realizad/i;
var RE_SIN_FOTOS = /orden\s+p[uú]blico|sin\s+(registro\s+)?fotogr|sin\s+fotos?\b|no\s+(se\s+)?(pudo|puede|pudieron|permiti\w*)\s+(tomar\s+)?fotos?/i;
var RE_CURSO = /inici|empez|empiez|comenz|comienz|arranc|en ejecuci|ejecutando|trabajando|contin[uú]|seguimos|nos encontramos|pasamos|nos dirigimos|vamos/i;

// LOTES: programación por microrruta (data/direcciones_lotes.js), para pasar códigos Z..CC.... a número de lote
export function parsearMensaje(texto, LOTES) {
    var t = String(texto || ''), fecha = '', cuad = '', m, lotes = [], enCurso = [];
    m = t.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/);
    if (m) { fecha = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); t = t.replace(m[0], ' '); }
    m = t.match(/cuadrilla\s*(?:n[°º.o]*\s*)?#?\s*(\d+)/i);
    if (m) { cuad = m[1]; t = t.replace(m[0], ' '); }
    var pc = t.search(RE_CURSO), ph = t.search(RE_HECHO);
    // ¿El lote que está en la posición i del mensaje está en ejecución?
    var esCurso = function (i) {
        if (pc === -1) return false;
        if (ph === -1) return true;
        return ph < pc ? i > pc : i < ph;
    };
    // Motivo por renglón: la nota va en el mismo renglón del lote
    var sinFotos = {}, motivo = function (i) {
        var fin = t.indexOf('\n', i), linea = t.slice(t.lastIndexOf('\n', i) + 1, fin === -1 ? t.length : fin);
        return !RE_SIN_FOTOS.test(linea) ? '' : /orden\s+p[uú]blico/i.test(linea) ? 'Orden público' : 'Sin fotos';
    };
    var re = /\bZ\d+[A-Z]{2}\d{3,5}\b|\b\d{1,5}\b/gi;
    while ((m = re.exec(t))) {
        var v = m[0].toUpperCase();
        v = /^Z/.test(v) ? (LOTES[v] && LOTES[v].lote && LOTES[v].lote !== 'NA' ? LOTES[v].lote : v) : String(+v);
        if (lotes.indexOf(v) !== -1) continue;
        lotes.push(v);
        if (esCurso(m.index)) enCurso.push(v);
        if (motivo(m.index)) sinFotos[v] = motivo(m.index);
    }
    var tipo = !enCurso.length ? 'hecho' : enCurso.length === lotes.length ? 'curso' : 'mixto';
    return { fecha: fecha, cuad: cuad, lotes: lotes, enCurso: enCurso, tipo: tipo, sinFotos: sinFotos };
}
