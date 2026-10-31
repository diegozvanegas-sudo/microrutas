"""Microrrutas de LV o RyT desde los GeoPDF de Emvarias (un .zip con un plano por ruta) a una capa del mapa rápido.

    python tools/rutas_desde_geopdf.py <planos.zip> <capa> [--muestra N]
    p. ej. python tools/rutas_desde_geopdf.py LV.zip rutas_lv

Los planos los exporta ArcMap como GeoPDF: cada marco del mapa (/VP) trae su /Measure con las esquinas en lat/lng, así
que no hay que ubicarlos a ojo como en barrido_desde_pdf.py. La ruta es el trazo rojo continuo (el punteado es el
recorrido improductivo). Inicio y fin son letras rojas de la fuente ESRIDefaultMarker: "!" el círculo y '"' el
cuadrado. Un plano puede traer dos rutas, una por marco (Z3R23MV_Z3R24MV): cada marco toma el código que se lee dentro
de él.
Se dejan por fuera los planos sin georreferencia (los escaneados de 2009-2012) y los generales de toda la zona (redis,
macro, RT_BARRIDO), que pintan muchas rutas de colores sin decir cuál es cuál. Si un código sale en varios planos queda
el más reciente (año y versión del nombre del archivo).
La jornada sale de la carpeta del plano: ZONA 7Am_Semana (Mañana), Z4_BLOQUE_LaS_PM o ZONA 7Pm_Dom_Fes (Tarde),
ZONA 7Noc_Semana o Z4_BLOQUE_LaS_NOC (Noche). Si la carpeta no la dice, la ruta queda sin jornada.
Escribe public/data/rapido/capa_<capa>.js, lo agrega a indice.js y deja <capa>_informe.csv junto al .zip.
Necesita: pip install pymupdf numpy
"""
import csv, json, os, re, sys, zipfile
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import pymupdf

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'public', 'data', 'rapido')
CODIGO = re.compile(r'Z\d+R\d+[A-Z]*(?:_DOM)?', re.I)
# Días de la ruta según el final del código (Z2R91LJ: lunes y jueves)
DIAS = {'LJ': 'Lunes y jueves', 'MV': 'Martes y viernes', 'WS': 'Miércoles y sábado', 'LAS': 'Lunes a sábado',
        'LAD': 'Lunes a domingo', 'D': 'Domingo', 'DOM': 'Domingos y festivos', 'LWV': 'Lunes, miércoles y viernes',
        'MJS': 'Martes, jueves y sábado'}
GENERAL = re.compile(r'redis|macro|RT_BARRIDO|_MC_', re.I)
TOL_M = 2.5  # simplificación (Douglas-Peucker) en metros: a esa escala no se nota y el archivo baja mucho
LAT0 = 6.25
KX, KY = 111320 * np.cos(np.radians(LAT0)), 110574

def rojo(c): return c is not None and len(c) == 3 and c[0] > .9 and c[1] < .15 and c[2] < .15

def marcos(doc, page):
    """[(rect en coordenadas de MuPDF, función pdf->(lat, lng))] de cada marco georreferenciado de la página."""
    obj = doc.xref_object(page.xref, compressed=True)
    out = []
    for vp in re.finditer(r'/BBox\s*\[([^\]]+)\](?:(?!/BBox).)*?/Measure\s*(\d+)\s+0\s+R', obj, re.S):
        bx = [float(v) for v in vp.group(1).split()]
        med = doc.xref_object(int(vp.group(2)), compressed=True)
        g, l = re.search(r'/GPTS\s*\[([^\]]+)\]', med), re.search(r'/LPTS\s*\[([^\]]+)\]', med)
        if not g or not l: continue
        g = np.array([float(v) for v in g.group(1).split()]).reshape(-1, 2)  # (lat, lng)
        l = np.array([float(v) for v in l.group(1).split()]).reshape(-1, 2)  # (u, v) dentro del BBox
        # Punto del PDF (y hacia arriba) de cada esquina, y ajuste afín pdf -> (lat, lng)
        src = np.column_stack([bx[0] + l[:, 0] * (bx[2] - bx[0]), bx[1] + l[:, 1] * (bx[3] - bx[1]), np.ones(len(l))])
        M = np.linalg.lstsq(src, g, rcond=None)[0]
        # Rectángulo del marco en coordenadas de MuPDF (y hacia abajo), para saber qué trazos caen dentro
        tm = page.transformation_matrix
        r = pymupdf.Rect(pymupdf.Point(bx[0], bx[1]) * tm, pymupdf.Point(bx[2], bx[3]) * tm); r.normalize()
        inv = ~tm
        def a_ll(pts, M=M, inv=inv):
            p = [pymupdf.Point(x, y) * inv for x, y in pts]
            return np.column_stack([[q.x for q in p], [q.y for q in p], np.ones(len(p))]) @ M
        out.append((r, a_ll))
    return out

def recuadros(page, spans):
    """Recuadros blancos de convenciones e identificación que van encima del mapa: lo rojo ahí dentro es leyenda."""
    claves = [s for s in spans if re.search(r'CONVENCIONES|IDENTIFICACI|Convenciones|Normas', s[0])]
    out = []
    for d in page.get_drawings():
        f = d.get('fill')
        if not f or min(f) < .95: continue
        r = d['rect']
        if r.width > 20 and r.height > 15 and any(r.contains(p) for _, p in claves): out.append(r)
    for _, p in claves:
        if not any(r.contains(p) for r in out): out.append(pymupdf.Rect(p.x - 8, p.y - 8, p.x + 220, p.y + 120))
    return out

def centro(bbox):
    r = pymupdf.Rect(bbox)
    return pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)

def lineas_de(d):
    lineas, act = [], None
    for it in d['items']:
        if it[0] == 'l': a, b = it[1], it[2]
        elif it[0] == 'c': a, b = it[1], it[4]
        else: act = None; continue
        if act is not None and abs(act[-1][0] - a.x) < .01 and abs(act[-1][1] - a.y) < .01: act.append((b.x, b.y))
        else: act = [(a.x, a.y), (b.x, b.y)]; lineas.append(act)
    return lineas

def valor(spans, etiqueta):
    """Texto a la derecha de una etiqueta del cuadro (en la misma línea), o lo que sigue a los dos puntos."""
    for t, p in spans:
        m = re.match(etiqueta + r'\s*:?\s*(.*)$', t, re.I)
        if not m: continue
        if m.group(1).strip(): return m.group(1).strip()
        der = [(q.x - p.x, u) for u, q in spans if abs(q.y - p.y) < 3 and q.x > p.x + 5 and u.strip()]
        if der: return min(der)[1].strip()
    return ''

def leer(args):
    nombre, datos = args
    if isinstance(datos, str):  # cada proceso lee su plano del .zip: no se pasan cientos de MB entre procesos
        with zipfile.ZipFile(datos) as z: datos = z.read(nombre)
    base = os.path.basename(nombre)
    res = {'archivo': nombre, 'rutas': [], 'motivo': ''}
    if GENERAL.search(base): res['motivo'] = 'plano general de la zona'; return res
    try: doc = pymupdf.open(stream=datos, filetype='pdf')
    except Exception as e: res['motivo'] = 'no abre: %s' % e; return res
    codigos_arch = [c.upper() for c in CODIGO.findall(base)]
    for page in doc:
        mk = marcos(doc, page)
        if not mk: continue
        spans, puntas = [], []
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t: spans.append((t, centro(l['bbox'])))
                for s in l['spans']:
                    if 'ESRI' in s['font'] and s['color'] == 0xff0000 and s['text'].strip() in ('!', '"'):
                        puntas.append(('i' if s['text'].strip() == '!' else 'f', centro(s['bbox'])))
        tapas = recuadros(page, spans)
        dibujos = page.get_drawings()
        for i, (r, a_ll) in enumerate(mk):
            dentro = [s for s in spans if r.contains(s[1])]
            # Código del marco: el rótulo "Código Microruta" / "Denominación" o una etiqueta suelta con forma de código
            cod = ''
            for etq in (r'C.digo Microruta', r'Denominaci.n'):
                v = CODIGO.search(valor(dentro, etq) or '')
                if v: cod = v.group(0).upper(); break
            if not cod and len(mk) > 1:
                sueltos = [t.upper() for t, _ in dentro if CODIGO.fullmatch(t.strip())]
                cod = next((c for c in sueltos if c in codigos_arch), sueltos[0] if sueltos else '')
            if not cod and len(mk) == 1:
                for etq in (r'C.digo Microruta', r'Denominaci.n'):
                    v = CODIGO.search(valor(spans, etq) or '')
                    if v: cod = v.group(0).upper(); break
            if not cod: cod = codigos_arch[i] if i < len(codigos_arch) else (codigos_arch[0] if codigos_arch and len(mk) == 1 else '')
            fuente = dentro if len(mk) > 1 else spans
            ruta = {'codigo': cod or os.path.splitext(base)[0], 'lineas': [], 'i': [], 'f': [],
                    'frec': valor(fuente, r'Frec(?:uencia)?'), 'km': valor(fuente, r'(?:Km Total|Kil.metros/Cuneta|Kil.metros)'),
                    'tipo': valor(fuente, r'Tipo de Barrido')}
            for d in dibujos:
                rr = d['rect']
                if not r.intersects(rr) or any(t.contains(rr) for t in tapas): continue
                if d['type'] == 's' and rojo(d.get('color')) and (d.get('width') or 0) >= .9 and d.get('dashes') in (None, '[] 0'):
                    ruta['lineas'] += [l for l in lineas_de(d) if len(l) > 1]
            for k, p in puntas:
                if r.contains(p) and not any(t.contains(p) for t in tapas): ruta[k].append((p.x, p.y))
            if not ruta['lineas']: continue
            ruta['lineas'] = [a_ll(l).round(7).tolist() for l in ruta['lineas']]
            for k in ('i', 'f'): ruta[k] = a_ll(ruta[k]).round(6).tolist() if ruta[k] else []
            # Dos marcos con el mismo código (el mapa y un recuadro ampliado): una sola ruta
            igual = next((x for x in res['rutas'] if x['codigo'] == ruta['codigo']), None)
            if igual:
                for k in ('lineas', 'i', 'f'): igual[k] += ruta[k]
            else: res['rutas'].append(ruta)
    if not res['rutas']: res['motivo'] = 'sin georreferencia o sin trazo rojo'
    return res

def unir(lineas):
    """Junta los tramos que siguen uno del otro (ArcMap parte la ruta en muchos pedazos)."""
    lineas = [list(map(tuple, l)) for l in lineas]
    out = []
    while lineas:
        act = lineas.pop()
        cambio = True
        while cambio:
            cambio = False
            for j, l in enumerate(lineas):
                if np.allclose(act[-1], l[0], atol=2e-6): act += l[1:]
                elif np.allclose(act[-1], l[-1], atol=2e-6): act += l[::-1][1:]
                elif np.allclose(act[0], l[-1], atol=2e-6): act = l[:-1] + act
                elif np.allclose(act[0], l[0], atol=2e-6): act = l[::-1][:-1] + act
                else: continue
                lineas.pop(j); cambio = True; break
        out.append(act)
    return out

def simplificar(pts, tol):
    p = np.array(pts)
    if len(p) < 3: return p
    xy = np.column_stack([(p[:, 1]) * KX, p[:, 0] * KY])
    keep = np.zeros(len(p), bool); keep[0] = keep[-1] = True
    pila = [(0, len(p) - 1)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1: continue
        ab = xy[b] - xy[a]; L = np.hypot(*ab)
        seg = xy[a + 1:b] - xy[a]
        d = np.abs(ab[0] * seg[:, 1] - ab[1] * seg[:, 0]) / L if L > 0 else np.hypot(seg[:, 0], seg[:, 1])
        k = int(d.argmax())
        if d[k] > tol: keep[a + 1 + k] = True; pila += [(a, a + 1 + k), (a + 1 + k, b)]
    return p[keep]

def codificar(pts):
    out, px, py = [], 0, 0
    for lat, lng in pts:
        x, y = round(lng * 1e6), round(lat * 1e6)
        if (x, y) == (px, py) and out: continue
        out += [x - px, y - py]; px, py = x, y
    return out

def limpiar(t):
    """Las fuentes del plano dañan las tildes (S\\ufffdbado) y separan letras (Lune s \\ufffd Jue ve s)."""
    for a, b in (('S\ufffdbado', 'Sábado'), ('Mi\ufffdrcoles', 'Miércoles'), ('Mi\ufffd rcoles', 'Miércoles'), ('\ufffd', '–')):
        t = t.replace(a, b)
    return re.sub(r'\s+', ' ', t).strip(' .')

def frecuencia(cod, texto):
    m = re.match(r'Z\d+R\d+([A-Z]*?)(?:_(DOM))?$', cod)
    dias = m and DIAS.get(m.group(2) or m.group(1))
    texto = limpiar(texto)
    if not dias: return texto
    return dias + (' · ' + texto if re.search(r'vez|veces', texto, re.I) else '')

# Un color por ruta: sobre la ortofoto se distinguen bien estos 12 (ninguno oscuro)
PALETA = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#469990',
          '#ff9fbf', '#9a6324']
CELDA_M = 40

def colorear(rutas):
    """Colores para que dos rutas vecinas (a menos de ~CELDA_M) no queden iguales. Se reparte primero a las que tienen
    más vecinas; si ya no queda un color libre (el centro está lleno de rutas), el que menos comparte con las vecinas."""
    celdas = []
    for lineas in rutas:
        s = set()
        for l in lineas:
            p = np.array(l)
            for lat, lng in p:
                s.add((int(lng * KX // CELDA_M), int(lat * KY // CELDA_M)))
        celdas.append({(x + dx, y + dy) for x, y in s for dx in (-1, 0, 1) for dy in (-1, 0, 1)})
    por_celda = {}
    for i, s in enumerate(celdas):
        for c in s: por_celda.setdefault(c, []).append(i)
    vecinas = [{} for _ in rutas]
    for ids in por_celda.values():
        for a in ids:
            for b in ids:
                if a != b: vecinas[a][b] = vecinas[a].get(b, 0) + 1
    color = [None] * len(rutas)
    for i in sorted(range(len(rutas)), key=lambda i: -len(vecinas[i])):
        costo = [0] * len(PALETA)
        for j, peso in vecinas[i].items():
            if color[j] is not None: costo[color[j]] += peso
        color[i] = min(range(len(PALETA)), key=lambda k: (costo[k], k))
    return [PALETA[k] for k in color]

def orden_version(nombre):
    """(año, versión) del nombre del archivo para quedarse con el plano más reciente de cada código."""
    b = os.path.basename(nombre)
    anios = [int(a) for a in re.findall(r'(?<!\d)(20\d\d)(?!\d)', b)]
    v = [int(x) for x in re.findall(r'_V(\d+)', b, re.I)]
    return (max(anios) if anios else 0, max(v) if v else 0)

def jornada(nombre):
    """Mañana, Tarde o Noche según la carpeta (o el nombre) del plano; '' si no lo dice."""
    if re.search(r'(?<![a-z])noc(?![a-z])', nombre, re.I): return 'Noche'
    if re.search(r'(?<![a-z])pm(?![a-z])', nombre, re.I): return 'Tarde'
    if re.search(r'(?<![a-z])am(?![a-z])', nombre, re.I): return 'Mañana'
    return ''

def zona(cod, nombre):
    m = re.match(r'Z(\d+)', cod) or re.search(r'zona\s*(\d+)', nombre, re.I)
    return int(m.group(1)) if m else 0

if __name__ == '__main__':
    ZIP, CAPA = sys.argv[1], sys.argv[2]
    muestra = int(sys.argv[sys.argv.index('--muestra') + 1]) if '--muestra' in sys.argv else 0
    z = zipfile.ZipFile(ZIP)
    nombres = [n for n in z.namelist() if n.lower().endswith('.pdf')]
    if muestra: nombres = nombres[::max(1, len(nombres) // muestra)][:muestra]
    with ProcessPoolExecutor(max_workers=min(6, os.cpu_count() or 1)) as ex:
        resultados = list(ex.map(leer, ((n, ZIP) for n in nombres), chunksize=4))
    # Un código en varios planos: el más reciente
    mejor = {}
    for r in resultados:
        for ruta in r['rutas']:
            k = ruta['codigo']
            if k not in mejor or orden_version(r['archivo']) > orden_version(mejor[k][0]): mejor[k] = (r['archivo'], ruta)
    informe = []
    for r in resultados:
        if not r['rutas']: informe.append([r['archivo'], '', 'descartado', r['motivo'], '', '', ''])
        for ruta in r['rutas']:
            usado = mejor[ruta['codigo']][0] == r['archivo']
            informe.append([r['archivo'], ruta['codigo'], 'usado' if usado else 'versión anterior', '' if usado else 'se usa ' + mejor[ruta['codigo']][0], ruta['frec'], ruta['km'], len(ruta['lineas'])])
    items, puntos = [], 0
    for cod in sorted(mejor, key=lambda c: (zona(c, mejor[c][0]), c)):
        archivo, ruta = mejor[cod]
        g = []
        for l in unir(ruta['lineas']):
            s = simplificar(l, TOL_M)
            if len(s) > 1: g.append(codificar(s)); puntos += len(s)
        it = {'n': cod, 'z': 'Zona %d' % zona(cod, archivo) if zona(cod, archivo) else '', 'g': g, 'a': os.path.basename(archivo)}
        ruta['frec'] = frecuencia(cod, ruta['frec'])
        for k, etq in (('frec', 'q'), ('km', 'k'), ('tipo', 't')):
            if ruta[k]: it[etq] = limpiar(ruta[k])
        for k in ('i', 'f'):
            if ruta[k]: it[k] = ruta[k]
        if jornada(archivo): it['j'] = jornada(archivo)
        items.append(it)
    for it, c in zip(items, colorear([mejor[it['n']][1]['lineas'] for it in items])): it['c'] = c
    with open(os.path.splitext(ZIP)[0] + '_' + CAPA + '_informe.csv', 'w', newline='', encoding='utf-8-sig') as f:
        csv.writer(f, delimiter=';').writerows([['archivo', 'codigo', 'estado', 'nota', 'frecuencia', 'km', 'tramos']] + informe)
    js = 'cargarCapa(%s,%s);\n' % (json.dumps(CAPA), json.dumps({'tipo': 'linea', 'items': items}, ensure_ascii=False, separators=(',', ':')))
    kb = round(len(js.encode()) / 1024)
    print('%d planos: %d rutas, %d descartados; %d puntos; %d KB' % (len(nombres), len(items), sum(1 for r in resultados if not r['rutas']), puntos, kb))
    if muestra: sys.exit()
    open(os.path.join(SALIDA, 'capa_%s.js' % CAPA), 'w', encoding='utf-8').write(js)
    idx_path = os.path.join(SALIDA, 'indice.js')
    idx = open(idx_path, encoding='utf-8').read()
    m = re.search(r'("capas":\{)(.*?)(\}\};?\s*$)', idx, re.S)
    capas = json.loads('{' + m.group(2) + '}')
    capas[CAPA] = {'kb': kb}
    idx = idx[:m.start()] + '"capas":' + json.dumps(capas, separators=(',', ':')) + '};\n'
    open(idx_path, 'w', encoding='utf-8').write(idx)
