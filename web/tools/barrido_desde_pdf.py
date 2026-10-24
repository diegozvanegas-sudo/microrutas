"""Microrrutas de barrido desde el plano PDF de Emvarias (vectorial, exportado de CAD) a una capa del mapa rápido.

    python tools/barrido_desde_pdf.py <plano.pdf> <capa> "<descripción>"
    p. ej. python tools/barrido_desde_pdf.py Z7am_bloque_dom_fes_redis_V4_2022.pdf barrido_dom "Zona 7Am · Domingos y festivos · V4 mayo 2022"

El PDF no trae coordenadas: se ubica con los nombres de calles del plano (Cl. 52, Cr. 46...). Cada pareja Calle/Carrera
cercana se asocia al cruce real de esas calles en OpenStreetMap (RANSAC) y luego cada nombre se acerca a su calle
(ICP por nombre). En el plano de la Zona 7Am el error mediano queda en ~4 m.
Las rutas son los trazos gruesos (1,92) de color; cada una toma el nombre Z7R..._DOM más cercano. Si una ruta viene en
varios pedazos, los pedazos sin nombre cerca se unen a la ruta de su mismo color más próxima.
Escribe public/data/rapido/capa_<capa>.js y lo agrega a indice.js. Necesita: pip install pymupdf numpy
"""
import json, os, random, re, sys, urllib.parse, urllib.request
import numpy as np
import pymupdf

PDF, CAPA, DESC = sys.argv[1], sys.argv[2], sys.argv[3]
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'public', 'data', 'rapido')
LAT0, LNG0 = 6.25, -75.57
KX, KY = 111320 * np.cos(np.radians(LAT0)), 110574
def a_m(lat, lng): return np.array([(lng - LNG0) * KX, (lat - LAT0) * KY])

page = pymupdf.open(PDF)[0]
lineas_txt = []
for b in page.get_text('dict')['blocks']:
    for l in b.get('lines', []):
        x0, y0, x1, y1 = l['bbox']
        lineas_txt.append((''.join(s['text'] for s in l['spans']).strip(), np.array([(x0 + x1) / 2, (y0 + y1) / 2])))
calles = []
for t, p in lineas_txt:
    m = re.match(r'^(Cl|Cll|Cr)\.?\s*(\d+[A-Z]?)$', t)
    if m: calles.append((('Calle ' if m.group(1).startswith('Cl') else 'Carrera ') + m.group(2), p))
rutas_txt = [(t, p) for t, p in lineas_txt if re.match(r'^Z\d+R\d+[A-Z]?_[A-Z]+$', t)]
print(len(calles), 'nombres de calle,', len(rutas_txt), 'nombres de ruta')

# ---------- Calles de OpenStreetMap alrededor del plano (se ubica a ojo: el centro de Medellín) ----------
def osm(bbox):
    q = '[out:json][timeout:90];way["highway"]["name"](%s);out body geom;' % bbox
    req = urllib.request.Request('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'microrutas-interventoria'})
    return json.load(urllib.request.urlopen(req, timeout=120))['elements']
por_nombre, nodos_nombre, coord = {}, {}, {}
for e in osm('6.15,-75.70,6.35,-75.48'):
    g = np.array([a_m(p['lat'], p['lon']) for p in e['geometry']])
    for nid, p in zip(e['nodes'], g): coord[nid] = p
    m = re.match(r'^(Calle|Carrera)\s+(\d+[A-Z]?)\b', e['tags'].get('name', ''))
    if m:
        k = m.group(1) + ' ' + m.group(2)
        por_nombre.setdefault(k, []).append(g)
        nodos_nombre.setdefault(k, set()).update(e['nodes'])

def ajustar(src, dst): return np.linalg.lstsq(np.hstack([src, np.ones((len(src), 1))]), dst, rcond=None)[0]
def aplicar(M, p): return np.hstack([p, np.ones((len(p), 1))]) @ M

pares = []
for na, pa in calles:
    for nb, pb in calles:
        if na.startswith('Calle') and nb.startswith('Carrera') and np.linalg.norm(pa - pb) < 45:
            comunes = nodos_nombre.get(na, set()) & nodos_nombre.get(nb, set())
            if comunes: pares.append(((pa + pb) / 2, np.mean([coord[n] for n in comunes], axis=0)))
src, dst = np.array([p[0] for p in pares]), np.array([p[1] for p in pares])
random.seed(1)
dentro = []
for _ in range(5000):
    idx = random.sample(range(len(pares)), 3)
    M = ajustar(src[idx], dst[idx])
    d = np.where(np.linalg.norm(aplicar(M, src) - dst, axis=1) < 60)[0]
    if len(d) > len(dentro): dentro = d
M = ajustar(src[dentro], dst[dentro])
print('cruces que cuadran:', len(dentro), 'de', len(pares))

def mas_cercano(p, lineas):
    mejor, bd = None, 1e18
    for g in lineas:
        a, b = g[:-1], g[1:]; ab = b - a; L = (ab ** 2).sum(1); L[L == 0] = 1e-9
        t = np.clip(((p - a) * ab).sum(1) / L, 0, 1); q = a + ab * t[:, None]; d = ((q - p) ** 2).sum(1); i = d.argmin()
        if d[i] < bd: bd, mejor = d[i], q[i]
    return mejor, np.sqrt(bd)
for _ in range(8):
    S, D, E = [], [], []
    for n, p in calles:
        if n in por_nombre:
            q, d = mas_cercano(aplicar(M, p[None])[0], por_nombre[n])
            if d < 80: S.append(p); D.append(q); E.append(d)
    E = np.array(E); ok = E < max(15, 3 * np.median(E))
    M = ajustar(np.array(S)[ok], np.array(D)[ok])
print('error mediano %.1f m, 90%% bajo %.1f m (%d nombres de calle)' % (np.median(E), np.percentile(E, 90), ok.sum()))
if np.median(E) > 12: sys.exit('El plano no cuadró con las calles: revise el PDF')

# ---------- Rutas ----------
def hexa(c): return '#%02x%02x%02x' % tuple(round(v * 255) for v in c)
# Marcas de la punta de cada ruta: círculo = inicio, cuadrado = fin. Vienen sueltas o dentro del trazo de la ruta, y
# partidas en pedacitos: se juntan los pedazos chicos (< 9 unidades) del mismo color que estén a menos de 6 unidades.
# El círculo está hecho de muchos tramos cortos; el cuadrado de 4 o 5.
trazos, pedazos = [], []
for d in page.get_drawings():
    col = d.get('color')
    if not col or abs((d.get('width') or 0) - 1.92) > 0.05: continue
    lineas, act = [], None
    for it in d['items']:
        if it[0] != 'l': continue
        a, b = np.array([it[1].x, it[1].y]), np.array([it[2].x, it[2].y])
        if act is not None and np.allclose(act[-1], a, atol=0.01): act.append(b)
        else: act = [a, b]; lineas.append(act)
    grandes = []
    for l in lineas:
        l = np.array(l)
        if (l.max(0) - l.min(0)).max() < 9: pedazos.append({'color': hexa(col), 'min': l.min(0), 'max': l.max(0), 'n': len(l) - 1})
        else: grandes.append(l)
    if grandes: trazos.append({'color': hexa(col), 'lineas': grandes})
marcas = []
for pz in pedazos:
    for mk in marcas:
        if mk['color'] == pz['color'] and np.linalg.norm((mk['min'] + mk['max']) / 2 - (pz['min'] + pz['max']) / 2) < 6:
            mk['min'] = np.minimum(mk['min'], pz['min']); mk['max'] = np.maximum(mk['max'], pz['max']); mk['n'] += pz['n']; break
    else: marcas.append(dict(pz))
marcas = [{'color': m['color'], 'p': (m['min'] + m['max']) / 2, 'tipo': 'i' if m['n'] > 8 else 'f'} for m in marcas if (m['max'] - m['min']).max() > 3]
def distancia(p, tr):
    return min(mas_cercano(p, tr['lineas'])[1], 1e9)
# Uno a uno, con la menor distancia total: un trazo no se reparte entre dos nombres. Se arranca con las parejas más
# cercanas y se intercambian trazos mientras baje la suma (el nombre de una ruta puede quedar más cerca del trazo de la
# vecina; p. ej. Z7R205B junto a la cuadrícula de Z7R213)
dist = np.array([[distancia(p, tr) for tr in trazos] for t, p in rutas_txt])
de = [-1] * len(rutas_txt)
usados = set()
for d, a, i in sorted((dist[a][i], a, i) for a in range(len(rutas_txt)) for i in range(len(trazos))):
    if de[a] == -1 and i not in usados: de[a] = i; usados.add(i)
mejora = True
while mejora:
    mejora = False
    for a in range(len(de)):
        for b in range(a + 1, len(de)):
            if dist[a][de[b]] + dist[b][de[a]] < dist[a][de[a]] + dist[b][de[b]] - 1e-6:
                de[a], de[b] = de[b], de[a]; mejora = True
        libres = [i for i in range(len(trazos)) if i not in de]
        i = min(libres, key=lambda i: dist[a][i]) if libres else None
        if i is not None and dist[a][i] < dist[a][de[a]] - 1e-6: de[a] = i; mejora = True
asignado, rutas = {}, {}
for a, i in enumerate(de):
    t, p = rutas_txt[a]
    if dist[a][i] > 40: print('  aviso: %s queda lejos de su trazo (%.0f unidades del plano)' % (t, dist[a][i]))
    asignado[i] = t
    rutas[t] = {'color': trazos[i]['color'], 'trazos': [i], 'p': p}
# Trazos sin nombre: a la ruta del mismo color con el nombre más cercano
for i, tr in enumerate(trazos):
    if i in asignado: continue
    cand = [(distancia(r['p'], tr), t) for t, r in rutas.items() if r['color'] == tr['color']]
    if cand: rutas[min(cand)[1]]['trazos'].append(i)
sin = [t for t, r in rutas.items() if not r['trazos']]
if sin: print('  sin trazo propio:', ', '.join(sin))

# Cada marca va a la ruta de su color con un trazo a menos de 12 unidades (la marca está en la punta del trazo)
for mk in marcas:
    cand = [(min(distancia(mk['p'], trazos[i]) for i in r['trazos']), t) for t, r in rutas.items() if r['color'] == mk['color']]
    if cand and min(cand)[0] < 12: rutas[min(cand)[1]].setdefault(mk['tipo'], []).append(mk['p'])
def a_ll_pdf(p):
    x, y = aplicar(M, np.array([p]))[0]
    return [round(LAT0 + y / KY, 6), round(LNG0 + x / KX, 6)]
def codificar(pts):
    ll = [(round((LNG0 + x / KX) * 1e6), round((LAT0 + y / KY) * 1e6)) for x, y in pts]
    out, px, py = [], 0, 0
    for x, y in ll:
        if (x, y) == (px, py) and out: continue
        out += [x - px, y - py]; px, py = x, y
    return out
items = []
for t in sorted(rutas):
    r = rutas[t]
    if not r['trazos']: continue
    g = [codificar(aplicar(M, l)) for i in r['trazos'] for l in trazos[i]['lineas'] if len(l) > 1]
    it = {'n': t, 'z': DESC, 'c': r['color'], 'g': g}
    for k in ('i', 'f'):
        if r.get(k): it[k] = [a_ll_pdf(p) for p in r[k]]
    items.append(it)
js = 'cargarCapa(%s,%s);\n' % (json.dumps(CAPA), json.dumps({'tipo': 'linea', 'items': items}, ensure_ascii=False, separators=(',', ':')))
ruta_js = os.path.join(SALIDA, 'capa_%s.js' % CAPA)
open(ruta_js, 'w', encoding='utf-8').write(js)
kb = round(len(js.encode()) / 1024)
idx_path = os.path.join(SALIDA, 'indice.js')
idx = open(idx_path, encoding='utf-8').read()
m = re.search(r'("capas":\{)(.*?)(\}\};?\s*$)', idx, re.S)
capas = json.loads('{' + m.group(2) + '}')
capas[CAPA] = {'kb': kb}
idx = idx[:m.start()] + '"capas":' + json.dumps(capas, separators=(',', ':')) + '};\n'
open(idx_path, 'w', encoding='utf-8').write(idx)
print('%d rutas -> %s (%d KB); con inicio %d, con fin %d' % (len(items), ruta_js, kb, sum('i' in x for x in items), sum('f' in x for x in items)))
